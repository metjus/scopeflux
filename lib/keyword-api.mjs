import { COUNTRIES } from '../public/model.js';
import { Buffer } from 'node:buffer';

const BASE = 'https://api.dataforseo.com/v3/keywords_data/';
const DEVICE_TYPES = ['desktop', 'mobile', 'tablet', 'non_smartphones'];
const BING_LANGUAGES = { US:'en', GB:'en', AU:'en', CA:'en', DE:'de', FR:'fr', JP:'ja', IN:'en', BR:'pt', SK:'sk', CZ:'cs' };
const DAY = 86400000, TTL = 3600000;
export class KeywordError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
const fail = (status, code, message) => { throw new KeywordError(status, code, message); };
const normalize = value => typeof value==='string' ? value.trim().replace(/\s+/g,' ') : '';
const iso = date => /^\d{4}-\d{2}-\d{2}$/.test(date||'') && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date;
const json = (body, status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

export function connectionStatus(env={}) {
  const configured=Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD),enabled=env.TREND_API_ENABLED==='true';
  return {provider:'DataForSEO',configured,enabled,ready:configured&&enabled,
    message:!configured?'Optional DataForSEO API is not configured. This is a third-party connection, not the official Google Trends alpha API. See Sources for direct Google access; RSS and CSV remain available.':!enabled?'DataForSEO is configured, but its live requests are disabled by the site owner. This does not connect the official Google Trends alpha API.':'DataForSEO is configured to request third-party provider data. Availability is checked when you analyze a topic; this does not verify official Google Trends alpha access.',
    googleCountries:COUNTRIES.filter(c=>!['RU','BY'].includes(c)),bingCountries:[],bingLanguages:{}};
}
export function validateQuery(input) {
  if(!input || Array.isArray(input) || typeof input!=='object' || Object.keys(input).some(k=>!['query','source','country','period'].includes(k)))fail(400,'INVALID_QUERY','Use a topic, source, country and time range.');
  const query=normalize(input.query),source=input.source,country=input.country??'',period=String(input.period??'');
  if(query.length<2 || query.length>100 || /[,\u0000-\u001f\u007f]/.test(query) || /^[<>|"\-+=~!:*()\[\]{}\s]+$/.test(query))fail(400,'INVALID_TOPIC','Enter a topic between 2 and 100 characters, without commas or control characters.');
  if(!['google','bing'].includes(source))fail(400,'INVALID_SOURCE','Choose Google Trends or Bing search data.');
  if(typeof country!=='string' || country && (!COUNTRIES.includes(country) || ['RU','BY'].includes(country)))fail(400,'INVALID_COUNTRY','Choose a supported country.');
  if(source==='google' && !['30','90','365','1095','1825'].includes(period))fail(400,'INVALID_PERIOD','Choose a supported Google Trends time range.');
  if(source==='bing' && (!Object.hasOwn(BING_LANGUAGES,country) || period!=='available'))fail(400,'INVALID_BING_SELECTION','Bing needs a supported country and its available monthly history.');
  return {query,source,country,period};
}
async function readBounded(response, maximum, input=false) {
  const oversized=()=>fail(input?413:502,input?'PAYLOAD_TOO_LARGE':'RESPONSE_TOO_LARGE',input?'The analysis parameters exceeded the data limit.':'The provider response exceeded the data limit.');
  if(Number(response.headers.get('Content-Length'))>maximum)oversized();
  const reader=response.body?.getReader(); if(!reader)fail(502,'EMPTY_RESPONSE','The provider returned no response.');
  const chunks=[];let length=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>maximum){await reader.cancel();oversized();}chunks.push(value);}}
  finally {reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(bytes);
}
function resultOf(body) {
  const task=body?.tasks?.[0];
  if(body?.status_code!==20000 || task?.status_code!==20000)fail(502,'PROVIDER_REJECTED','The provider could not complete this request. Check account access, balance and data availability.');
  if(!Array.isArray(task.result))fail(422,'NO_DATA','The provider has no usable data for this selection. Try another topic or country.');
  return task.result;
}
function checkedRecords(records) {
  records.sort((a,b)=>a.date.localeCompare(b.date));
  if(records.length<6)fail(422,'NOT_ENOUGH_DATA','The provider returned fewer than six complete numeric observations. Try a longer range or another topic.');
  if(records.length>10000 || records.some((r,i)=>!iso(r.date)||!Number.isFinite(r.value)||r.value<0||i>0&&r.date===records[i-1].date))fail(502,'INVALID_SERIES','The provider returned invalid or duplicate observations.');
  return records;
}
export function parseGoogle(results, selection, rangeEnd, rangeStart='0000-01-01') {
  const item=results.find(r=>Array.isArray(r.items)&&r.items.some(i=>i.type==='google_trends_graph'));
  const graph=item?.items.find(i=>i.type==='google_trends_graph');
  const keywords=graph?.keywords??item?.keywords;
  const index=keywords?.findIndex(q=>normalize(q).toLowerCase()===selection.query.toLowerCase());
  if(index===undefined || index<0 || !Array.isArray(graph.data))fail(422,'NO_DATA','Google Trends returned no matching numeric series.');
  const records=[];let omittedCensored=0,omittedPartial=0,omittedMissing=0;
  for(const row of graph.data){
    if(!iso(row.date_from)||!iso(row.date_to)||row.date_to<row.date_from)fail(502,'INVALID_SERIES','Google Trends returned invalid observation dates.');
    if(row.date_to>rangeEnd||row.date_from<rangeStart){omittedPartial++;continue;}
    if(row.missing_data===true){omittedMissing++;continue;}
    const value=row.values?.[index];
    if(value==='<1'){omittedCensored++;continue;}
    if(value===null || value===undefined){omittedMissing++;continue;}
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)fail(502,'INVALID_SERIES','Google Trends returned an invalid interest index.');
    records.push({date:row.date_from,value});
  }
  return {records:checkedRecords(records),unit:'Interest index (0–100)',metric:'relative_search_interest',provider:'dataforseo-google-trends',omittedCensored,omittedPartial,omittedMissing};
}
export function parseBing(results, selection, rangeEnd, language, rangeStart='0000-01-01') {
  const item=results.find(r=>normalize(r.keyword).toLowerCase()===selection.query.toLowerCase());
  if(!item || item.period!=='monthly' || item.language_code!==language || !item.searches)fail(422,'NO_DATA','Bing returned no matching monthly search series.');
  const devices=DEVICE_TYPES.map(device=>item.searches[device]);
  if(devices.some(rows=>!Array.isArray(rows)))fail(422,'INCOMPLETE_DEVICES','Bing did not return all requested device groups. No partial totals are calculated.');
  const dates=new Map();let omittedMissing=0;
  devices.forEach((rows,device)=>{const seen=new Set();for(const row of rows){
    const date=String(row.year).padStart(4,'0')+'-'+String(row.month).padStart(2,'0')+'-01';
    if(!iso(date)||row.day!==1||seen.has(date))fail(502,'INVALID_SERIES','Bing returned invalid or duplicate monthly observations.');seen.add(date);
    if(date>rangeEnd||date<rangeStart)continue;
    if(row.search_volume===null||row.search_volume===undefined)continue;
    if(typeof row.search_volume!=='number'||!Number.isFinite(row.search_volume)||row.search_volume<0)fail(502,'INVALID_SERIES','Bing returned invalid monthly search values.');
    if(!dates.has(date))dates.set(date,new Map());dates.get(date).set(device,row.search_volume);
  }});
  const records=[];for(const [date,values] of dates){if(values.size!==DEVICE_TYPES.length){omittedMissing++;continue;}records.push({date,value:[...values.values()].reduce((a,b)=>a+b,0)});}
  return {records:checkedRecords(records),unit:'Monthly searches (all devices)',metric:'monthly_search_volume_all_devices',provider:'dataforseo-bing-search-volume',language,omittedMissing};
}

// Bounds and cache are per Worker isolate; they are not a global billing quota.
// The hosted Site stays private. Do not expose paid requests publicly without
// durable per-user quotas and authorization appropriate to that audience.
export function createKeywordApi({fetchImpl=globalThis.fetch,now=()=>Date.now(),timeoutMs=55000}={}) {
  let signature='',generation=0;const cache=new Map(),pending=new Map(),catalogs=new Map();let calls=[];
  function resetFor(env){const next=env.DATAFORSEO_LOGIN+'\0'+env.DATAFORSEO_PASSWORD+'\0'+env.TREND_API_ENABLED;if(next!==signature){signature=next;generation++;cache.clear();pending.clear();catalogs.clear();calls=[];}}
  async function provider(path,env,payload) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const auth=Buffer.from(env.DATAFORSEO_LOGIN+':'+env.DATAFORSEO_PASSWORD,'utf8').toString('base64');
      const response=await fetchImpl(BASE+path,{method:payload?'POST':'GET',redirect:'error',signal:controller.signal,headers:{'Authorization':'Basic '+auth,'Content-Type':'application/json'},...(payload?{body:JSON.stringify([payload])}:{})});
      if(!response.ok)fail(response.status===429?429:502,'PROVIDER_HTTP_ERROR',response.status===429?'The provider is busy. Wait before retrying.':'The provider request failed. Check the account credentials, balance and availability.');
      if(!response.headers.get('Content-Type')?.includes('application/json'))fail(502,'INVALID_RESPONSE','The provider returned an unexpected response.');
      let body;try{body=JSON.parse(await readBounded(response,2000000));}catch(e){if(e instanceof KeywordError)throw e;fail(502,'INVALID_RESPONSE','The provider returned invalid JSON.');}
      return resultOf(body);
    }catch(e){if(e instanceof KeywordError)throw e;fail(502,controller.signal.aborted?'PROVIDER_TIMEOUT':'PROVIDER_UNAVAILABLE',controller.signal.aborted?'The provider took too long. Wait before retrying; the previous request may still have been charged.':'The provider could not be reached. No demo data was substituted.');}
    finally{clearTimeout(timer);}
  }
  async function catalog(key,env,path){
    const current=catalogs.get(key);if(current && current.until>now())return current.promise;
    const stamp=generation,promise=provider(path,env);const entry={until:now()+TTL,promise};catalogs.set(key,entry);
    try{return await promise;}catch(e){if(stamp===generation&&catalogs.get(key)===entry)catalogs.delete(key);throw e;}
  }
  async function bingMarkets(env){
    const data=await catalog('bing',env,'bing/search_volume_history/locations_and_languages'),markets={};
    for(const row of data){for(const location of row.available_locations??[]){const c=location.country_iso_code;if(location.location_type==='Country'&&row.language_code===BING_LANGUAGES[c]&&Number.isInteger(location.location_code))markets[c]={code:location.location_code,language:row.language_code};}}
    return markets;
  }
  async function requestSeries(q,env){
    const time=now(),stamp=generation,end=new Date(time-DAY).toISOString().slice(0,10);let location,language,rangeEnd=end,payload;
    if(q.source==='bing'){
      const markets=await bingMarkets(env);location=markets[q.country];if(!location)fail(400,'UNSUPPORTED_MARKET','Bing has no supported country/language combination for this market. Choose another country or use Google Trends.');language=location.language;
      const start=new Date(time);start.setUTCDate(1);start.setUTCMonth(start.getUTCMonth()-24);
      const last=new Date(time);last.setUTCDate(1);last.setUTCHours(0,0,0,0);rangeEnd=new Date(last.getTime()-DAY).toISOString().slice(0,10);
      payload={keywords:[q.query],location_code:location.code,language_code:language,period:'monthly',device:DEVICE_TYPES,date_from:start.toISOString().slice(0,10),date_to:rangeEnd};
    }else{
      if(q.country){const locations=await catalog('google-'+q.country,env,'google_trends/locations/'+q.country.toLowerCase());location=locations.find(l=>l.country_iso_code===q.country&&l.location_type==='Country'&&Number.isInteger(l.location_code));if(!location)fail(400,'UNSUPPORTED_MARKET','Google Trends has no supported country data for this market. Choose another country.');}
      payload={keywords:[q.query],type:'web',item_types:['google_trends_graph'],date_from:new Date(time-Number(q.period)*DAY).toISOString().slice(0,10),date_to:rangeEnd,...(location?{location_code:location.location_code}:{})};
    }
    if(stamp!==generation)fail(503,'CONFIGURATION_CHANGED','API configuration changed. Start a new analysis.');
    const limit=Number(env.TREND_API_MAX_REQUESTS_PER_HOUR??20);if(!Number.isInteger(limit)||limit<1||limit>200)fail(503,'INVALID_CONFIGURATION','The owner must set a valid API request limit.');
    calls=calls.filter(t=>t>now()-TTL);if(calls.length>=limit)fail(429,'REQUEST_LIMIT','The server request limit has been reached. Reopen a stored series or try later.');calls.push(now());
    const results=await provider(q.source==='google'?'google_trends/explore/live':'bing/search_volume_history/live',env,payload);
    const parsed=q.source==='google'?parseGoogle(results,q,rangeEnd,payload.date_from):parseBing(results,q,rangeEnd,language,payload.date_from);
    // Providers must echo the selected location. A different market is never relabeled.
    const returned=results.find(r=>q.source==='google'?Array.isArray(r.items):normalize(r.keyword).toLowerCase()===q.query.toLowerCase());
    if(location&&returned?.location_code!==(location.location_code??location.code))fail(502,'MARKET_MISMATCH','The provider returned data for a different market.');
    const fetchedAt=new Date(now()).toISOString();
    return {...q,...parsed,kind:'history',id:'api-'+crypto.randomUUID(),fetchedAt,createdAt:Date.parse(fetchedAt),cached:false};
  }
  return {
    async handle(request,env={}){
      resetFor(env);const status=connectionStatus(env);
      try{
        if(request.method==='GET'){
          if(status.ready&&new URL(request.url).searchParams.get('source')==='bing'){const markets=await bingMarkets(env);status.bingCountries=Object.keys(markets);status.bingLanguages=Object.fromEntries(Object.entries(markets).map(([c,m])=>[c,m.language]));}
          return json(status);
        }
        if(request.method!=='POST')return json({error:'Use GET or POST.',code:'METHOD_NOT_ALLOWED'},405);
        const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)fail(403,'INVALID_ORIGIN','Use the analysis form on this site.');
        if(!request.headers.get('Content-Type')?.includes('application/json'))fail(415,'INVALID_CONTENT_TYPE','Send JSON analysis parameters.');
        let input;try{input=JSON.parse(await readBounded(request,4096,true));}catch(e){if(e instanceof KeywordError)throw e;fail(400,'INVALID_JSON','Send valid analysis parameters.');}
        const q=validateQuery(input);
        if(!status.ready)fail(503,'API_NOT_READY',status.message);
        const key=JSON.stringify(q),existing=cache.get(key);if(existing&&existing.until>now())return json({...existing.data,cached:true});
        if(pending.has(key))return json(await pending.get(key));
        if(pending.size>=3)fail(429,'SERVER_BUSY','Three analyses are already running. Wait before starting another.');
        const stamp=generation,promise=requestSeries(q,env);pending.set(key,promise);
        try{const data=await promise;if(stamp!==generation)fail(503,'CONFIGURATION_CHANGED','API configuration changed. Start a new analysis.');cache.set(key,{data,until:now()+TTL});if(cache.size>40)cache.delete(cache.keys().next().value);return json(data);}
        finally{if(pending.get(key)===promise)pending.delete(key);}
      }catch(e){return json({error:e instanceof KeywordError?e.message:'The analysis request could not be completed.',code:e instanceof KeywordError?e.code:'INTERNAL_ERROR'},e instanceof KeywordError?e.status:500);}
    }
  };
}
