import {USER_AGENT,limitedText} from './http.ts';
import {readSavedFeed,readSavedFeeds,feedParts} from './catalog-store.ts';
import type {DomainRecord} from './domains';
import {saveCatalogFeed,archiveStatement,recentCatalog} from './catalog-history.ts';
import {isUpcomingDate,releaseTimestamp} from './release-time.ts';
// .ai and .eu were dropped: their only source (Backorder.com) blocks Worker
// requests and needed an external scraper. They can still be checked one by one.
export const CATALOG_TLDS=['sk','com','net','org','io','app'];
const DYNA:Record<string,string>={com:'tld_0',net:'tld_10',org:'tld_3',io:'tld_8',app:'tld_11'};
export type FeedInfo={tld:string;source:string;url:string;loaded:number;more:boolean;limited:boolean;checkedAt:string;error?:string;stored?:boolean;refreshError?:string;retryAfter?:number};
export type CatalogResult={records:DomainRecord[];feeds:FeedInfo[]};
const cache=new Map<string,{at:number;data:{records:DomainRecord[];feed:FeedInfo;observed?:DomainRecord[]}}>();
class FeedSourceError extends Error {
 readonly retryAfter?:number;
 constructor(message:string,retryAfter?:number){super(message);this.retryAfter=retryAfter;}
}
// Visitors see a plain sentence. Technical details (e.g. "internal error;
// reference = …" from a failed fetch) only go to the Worker log.
export function publicFeedError(error:unknown):string{
 if(error instanceof FeedSourceError)return error.message;
 console.error('catalogue source failed',{message:(error as Error)?.message});
 return (error as Error)?.name==='TimeoutError'?'The source did not answer in time.':'The source could not be reached right now.';
}
function valid(name:string,tld:string){return new RegExp('^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.'+tld+'$','i').test(name);}
function record(domain:string,drop:string,source:string,sourceUrl:string,checkedAt:string):DomainRecord{return {domain,tld:domain.split('.').pop()!,status:'Expected release',expiration:null,drop,source,sourceUrl,checkedAt,availabilitySource:source,availabilityUrl:sourceUrl,note:'This is the release estimate published by the source, not a guarantee of availability. The holder may restore the domain or a drop-catching service may register it immediately. Date-only estimates do not specify a release hour.'};}
export function parseSkDrops(html:string,checkedAt=new Date().toISOString()):DomainRecord[]{
 const out:DomainRecord[]=[];
 for(const m of html.matchAll(/<li[^>]*>\s*<a[^>]*href="\/domena\/([a-z0-9-]+\.sk)"[^>]*>[\s\S]*?<\/a>\s*<span[^>]*>\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*<\/span>\s*<\/li>/gi)){
 const date=`${m[4]}-${m[3].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
 if(valid(m[1],'sk')&&Number.isFinite(releaseTimestamp(date)))out.push(record(m[1].toLowerCase(),date,'Backorder.sk','https://www.backorder.sk/domena/'+m[1].toLowerCase(),checkedAt));
 }return out;
}
export function parseCountryDrops(html:string,tld:string,checkedAt=new Date().toISOString()):DomainRecord[]{
 const out:DomainRecord[]=[];const body=html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1]??'';
 for(const row of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){
 const cells=Array.from(row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(m=>m[1].replace(/<[^>]*>/g,'').trim());
 if(cells.length>=3&&valid(cells[0],tld)&&/^\d{4}-\d{2}-\d{2}$/.test(cells[2])&&Number.isFinite(releaseTimestamp(cells[2])))out.push(record(cells[0].toLowerCase(),cells[2],'Backorder.com','https://backorder.com/en/pending-delete/'+tld,checkedAt));
 }return out;
}
export function parseDynadot(html:string,tld:string,checkedAt=new Date().toISOString()):DomainRecord[]{
 const raw=html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)?.[1];if(!raw)return [];
 const values=JSON.parse(raw) as unknown[];if(!Array.isArray(values))return [];const out:DomainRecord[]=[];
 for(const obj of values){
 if(!obj||Array.isArray(obj)||typeof obj!=='object'||!('backorder_id' in obj)||!('name' in obj)||!('end_time_stamp' in obj))continue;
 if(typeof obj.name!=='number'||typeof obj.end_time_stamp!=='number')continue;
 const domain=values[obj.name],stamp=values[obj.end_time_stamp];
 if(typeof domain==='string'&&valid(domain,tld)&&typeof stamp==='number'&&stamp>1e12&&stamp<4e12)out.push(record(domain,new Date(stamp).toISOString(),'Dynadot','https://www.dynadot.com/market/backorder?keyword='+encodeURIComponent(domain),checkedAt));
 }return out;
}
async function feed(tld:string,page=1){
 const key=tld+':'+page,old=cache.get(key);if(old&&Date.now()-old.at<900000){const records=old.data.records.filter(r=>isUpcomingDate(r.drop));return {...old.data,records,feed:{...old.data.feed,loaded:records.length}};}
 const source=tld==='sk'?'Backorder.sk':DYNA[tld]?'Dynadot':'Backorder.com';
 const url=tld==='sk'?'https://www.backorder.sk/zadrzane':DYNA[tld]?`https://www.dynadot.com/market/backorder?${DYNA[tld]}=${tld}&page_size=100&order_by=3&page_index=${page}`:`https://backorder.com/en/pending-delete/${tld}`;
 const checkedAt=new Date().toISOString();
 if(page>1&&!DYNA[tld])return {records:[],feed:{tld,source,url,loaded:0,more:false,limited:tld!=='sk',checkedAt}};
 const response=await fetch(url,{headers:{Accept:'text/html','User-Agent':USER_AGENT},signal:AbortSignal.timeout(16000)});
 if(!response.ok){const delay=Number(response.headers.get('Retry-After'))||60;throw new FeedSourceError(response.status===429?'The source is rate-limiting requests. Please wait before loading another page.':'Source unavailable ('+response.status+').',response.status===429?Math.max(1,Math.min(3600,delay)):undefined);}
 if(response.url.includes('/login'))throw new FeedSourceError('The source requires an account for this page.');
 const html=await limitedText(response,10_000_000);
 const all=tld==='sk'?parseSkDrops(html,checkedAt):DYNA[tld]?parseDynadot(html,tld,checkedAt):parseCountryDrops(html,tld,checkedAt);
 if(!all.length)throw new FeedSourceError('The source returned no readable listings.');
 const records=all.filter(r=>isUpcomingDate(r.drop));
 const data={records,observed:all,feed:{tld,source,url,loaded:records.length,more:page<20&&!!DYNA[tld]&&all.length>=100,limited:!DYNA[tld]&&tld!=='sk',checkedAt}};
 cache.set(key,{at:Date.now(),data});if(cache.size>40)cache.delete(cache.keys().next().value!);return data;
}
export async function upcomingCatalog(tlds=CATALOG_TLDS,page=1,db?:D1Database):Promise<CatalogResult>{
 const results=await Promise.all(tlds.filter(t=>CATALOG_TLDS.includes(t)).map(async tld=>{try{
 if(db&&page===1){const saved=await readSavedFeed(db,tld);if(saved){
   const age=Date.now()-new Date(saved.checked_at).getTime();
   if(age<900000)return storedFeed(tld,saved);
  }}
 const result=await feed(tld,page);
 if(db&&page===1)await saveCatalogFeed(db,tld,result.records,result.feed.checkedAt,result.observed||result.records);
 else if(db&&result.records.length)await db.batch(feedParts(result.observed||result.records).map(part=>archiveStatement(db,part)));
 return result;
 }catch(e){
 if(db&&page===1){try{const saved=await readSavedFeed(db,tld);if(saved)return storedFeed(tld,saved,publicFeedError(e));}catch{}}
 return {records:[],feed:{tld,source:tld==='sk'?'Backorder.sk':DYNA[tld]?'Dynadot':'Backorder.com',url:tld==='sk'?'https://www.backorder.sk/zadrzane':DYNA[tld]?'https://www.dynadot.com/market/backorder':'https://backorder.com/en/pending-delete/'+tld,loaded:0,more:false,limited:tld==='ai'||tld==='eu',checkedAt:new Date().toISOString(),error:publicFeedError(e),retryAfter:e instanceof FeedSourceError?e.retryAfter:undefined}}}}));
 return {records:results.flatMap(r=>r.records),feeds:results.map(r=>r.feed)};
}

export async function scheduledRelease(domain:string,db?:D1Database){
 const tld=domain.split('.').pop()!;
 if(!CATALOG_TLDS.includes(tld))return null;
 // Domain checks and watchlist writes use existing catalogue observations. They
 // must not wait for another full external catalogue fetch when a name is absent.
 if(db){
   const saved=await readSavedFeed(db,tld);
   const records=saved?JSON.parse(saved.records) as DomainRecord[]:[];
   return records.find(record=>record.domain===domain&&isUpcomingDate(record.drop))??null;
 }
 for(const entry of cache.values()){
   const found=entry.data.records.find(record=>record.domain===domain&&isUpcomingDate(record.drop));
   if(found)return found;
 }
 return null;
}

export async function savedCatalog(db:D1Database,tlds=CATALOG_TLDS):Promise<CatalogResult>{
 const selected=tlds.filter(tld=>CATALOG_TLDS.includes(tld));
 if(!selected.length)return {records:[],feeds:[]};
 const saved={results:await readSavedFeeds(db,selected)};
 const results=saved.results.map(row=>storedFeed(row.tld,row,Date.now()-Date.parse(row.checked_at)>86400000?'This saved source preview is more than 24 hours old. A live refresh will try to update it.':undefined));
 return {records:results.flatMap(result=>result.records),feeds:results.map(result=>result.feed)};
}

function storedFeed(tld:string,saved:{records:string;checked_at:string},refreshError?:string){
 const observed=JSON.parse(saved.records) as DomainRecord[];
 const records=observed.filter(r=>isUpcomingDate(r.drop));
 return {records,feed:{tld,source:tld==='sk'?'Backorder.sk':DYNA[tld]?'Dynadot':'Backorder.com',url:tld==='sk'?'https://www.backorder.sk/zadrzane':DYNA[tld]?'https://www.dynadot.com/market/backorder':'https://backorder.com/en/pending-delete/'+tld,loaded:records.length,more:!!DYNA[tld]&&observed.length>=100,limited:!DYNA[tld]&&tld!=='sk',checkedAt:saved.checked_at,stored:true,refreshError}};
}

export async function recentReleaseCatalog(db:D1Database,tlds=CATALOG_TLDS){
 // History is a saved observation, not another live-feed request. Source outages must not block it.
 const result=await recentCatalog(db,tlds);
 const saved=await db.prepare("SELECT tld,checked_at,records FROM catalog_feeds WHERE tld LIKE 'history:%'").all<{tld:string;checked_at:string;records:string}>();
 const feeds:FeedInfo[]=saved.results.filter(row=>tlds.includes(row.tld.replace('history:',''))).map(row=>{
   const tld=row.tld.replace('history:','');
   return {tld,source:'ExpiredDomains.net',url:'https://www.expireddomains.net/tld/'+tld+'/',loaded:JSON.parse(row.records).length,more:false,limited:true,stored:true,checkedAt:row.checked_at,
     refreshError:Date.now()-Date.parse(row.checked_at)>2*3600000?'The hourly public history preview refresh is overdue. Previous observations are preserved.':undefined};
 });
 return {...result,feeds};
}
