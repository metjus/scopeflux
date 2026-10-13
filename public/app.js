import { PLANS, COUNTRIES, keywords, analysis as legacyAnalysis, creditState, consumeCredit, csvCell } from './model.js';
import { sampleDataset, summarize, movingAverage, anomalies, seasonality, inspectCsv, parseCsvColumns, compareSeries, exportSeries, exportComparison, exportSeasonality, dataStatus, evaluateRule, mean } from './analytics.js';
import { restoreChecks, restoreTopics } from './radar.js';
import { initRadar } from './radar-ui.js';
import { validateApiSeries, historyDescription } from './keyword-client.js';
import { initNavigation } from './navigation.js';
import { describeSeries } from './launch-summary.js';
import { restoreDatasetCollections } from './workspace-data.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const paths = {
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 6-7"/>',
 bookmark:'<path d="M6 4h12v17l-6-4-6 4z"/>', history:'<path d="M3 11a9 9 0 1 1 2.5 7M3 5v6h6M12 7v5l3 2"/>',
 layers:'<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
 database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
 calendar:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
 bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>', download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',
 upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
 sparkles:'<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7zM20 2v4m-2-2h4"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>', compare:'<path d="M8 3v18M16 3v18M3 8h10M11 16h10M5 6 3 8l2 2M19 14l2 2-2 2"/>',
 pulse:'<path d="M2 12h5l3-8 4 16 3-8h5"/>'
};
const icon = name => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+paths[name]+'</svg>';
$$('[data-icon]').forEach(el => el.outerHTML = icon(el.dataset.icon));
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (v,d=1) => v === null || !Number.isFinite(v) ? 'N/A' : new Intl.NumberFormat('en',{maximumFractionDigits:d}).format(v);
const pct = v => v === null || !Number.isFinite(v) ? 'N/A' : (v>0?'+':'')+fmt(v)+'%';
const colors=['#779e4c','#6a98ad','#b49563','#9379a9','#ba7474'];
const regionNames=new Intl.DisplayNames(['en'],{type:'region'});
const countryName=code=>{try{return code?regionNames.of(code):'Worldwide';}catch{return 'Worldwide';}};
const periodName=days=>({'30':'Past 30 days','90':'Past 90 days','365':'Past 12 months','1095':'Past 3 years','1825':'Past 5 years','available':'Available provider history'}[days] || 'Imported history');
let workspaceReadProblem='';
function readState(){let serialized;try{serialized=localStorage.getItem('trendscope-v1');if(serialized===null)return {};const s=JSON.parse(serialized);if(!s||typeof s!=='object'||Array.isArray(s))throw new Error('Invalid workspace');return s;}catch{workspaceReadProblem=serialized===undefined?'unavailable':'invalid';return serialized===undefined?{}:{unrestoredWorkspace:serialized};}}
const raw=readState();
let plan='pro',ledgers=raw.ledgers&&typeof raw.ledgers==='object'?raw.ledgers:{};
const restored=restoreDatasetCollections(raw);
let fetchedSeries=restored.fetchedSeries,imports=restored.imports,saved=restored.saved;
let history=Array.isArray(raw.history)?raw.history.filter(x=>x&&typeof x.query==='string'&&x.query.length<=120).slice(0,50):[];
if(restored.rejectedCount||workspaceReadProblem){$('#workspace-restore-status').hidden=false;$('#workspace-restore-status').textContent=workspaceReadProblem==='unavailable'?'Saved workspace data could not be read from this browser. New changes may be available for this session only.':'Some stored workspace data could not be reopened. Usable series remain available, and the original entries are kept separately in this browser. Reimport any missing CSV series from the original file.';}
let radarChecks=restoreChecks(raw.radarChecks),liveTopics=restoreTopics(raw.liveTopics).slice(0,Math.max(0,50-saved.length));
let result=fetchedSeries[0]||sampleDataset('3d printing'),filterType='all',descending=true,toastTimer,comparison=[],markets=[],fileReadVersion=0;
let rows=[];
let explorerDemo=result.kind==='sample'?result:sampleDataset('3d printing');
let comparisonRequest=null,marketRequest=null,seasonReport=null;
let comparisonEmpty='Choose two topics and select Compare.',marketEmpty='Select at least two markets above to compare their relative growth.';
let importPreview=null,namedImportColumn=null,lastImportIds=[];
let seasonDemo=result.kind==='sample'?result:sampleDataset(result.query),seasonExplorerDataset=null,seasonDemoDraft=null;
let liveStatus=null,liveBusy=false,liveVersion=0,liveController=null,liveConfigVersion=0;
let livePeriod='1095',liveCountry='';
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
function persist(){try{localStorage.setItem('trendscope-v1',JSON.stringify({plan,ledgers,saved,history,imports,fetchedSeries,radarChecks,liveTopics,unrestoredSeries:restored.unrestoredSeries,unrestoredWorkspace:raw.unrestoredWorkspace}));$('#workspace-storage-status').hidden=true;return true;}catch{const message='Browser storage is full or unavailable. Changes are available for this session only and may be lost when you close or reload this page.';$('#workspace-storage-status').textContent=message;$('#workspace-storage-status').hidden=false;toast(message);return false;}}
function updateBalance(){$('#saved-count').textContent=saved.length+liveTopics.length;$('#unlock-link').hidden=true;}
function spend(){return true;}
function pro(){return true;}
const countries=COUNTRIES.map(code=>[code,countryName(code)]).sort((a,b)=>a[1].localeCompare(b[1]));
$('#country').innerHTML='<option value="">Worldwide</option>'+countries.map(([code,name])=>'<option value="'+code+'">'+esc(name)+'</option>').join('');
$('#season-country').innerHTML=$('#country').innerHTML;
const sharedParams=new URLSearchParams(typeof location.search==='string'?location.search:'');
const sharedMarket=sharedParams.get('market');if(['US','SK','CZ','GB','DE','FR','JP','IN','BR','CA','AU'].includes(sharedMarket))$('#radar-region').value=sharedMarket;
$('#radar-filter').value=(sharedParams.get('q')||'').slice(0,120);
const demoMarkets=['US','GB','DE','JP','IN','BR','FR','CA','AU','SK'];
$('#market-options').innerHTML=demoMarkets.map((code,i)=>'<label><input type="checkbox" value="'+code+'" '+(i<2?'checked':'')+'>'+esc(countryName(code))+'</label>').join('');
const sampleOptions=()=>({country:$('#country').value,period:$('#period').value,source:$('#source').value.startsWith('bing')?'bing':'google'});
function meta(d){return {id:d.id,query:d.query,country:d.country,source:d.source,period:d.period,kind:d.kind,language:d.language,time:d.createdAt||Date.now()};}
function remember(d){history.unshift(meta(d));history=history.slice(0,50);persist();}
function clearSearchError(){$('#search-form-error').hidden=true;$('#keyword').removeAttribute('aria-invalid');}
function runSearch(query,options={},destination='explorer'){clearSearchError();query=query.trim().replace(/\s+/g,' ');if(!query||query.length>120){$('#search-form-error').textContent='Enter a topic between 1 and 120 characters.';$('#search-form-error').hidden=false;$('#keyword').setAttribute('aria-invalid','true');$('#keyword').focus();return false;}const opts={...sampleOptions(),...options};const dataset=sampleDataset(query,opts);if(!spend())return;dataset.createdAt=Date.now();result=dataset;remember(result);renderResult();if(destination==='seasonality'){$('#season-source').value='demo';renderSeasonality();$('#season-update-message').textContent='Demo seasonality updated for '+result.query+'.';}location.hash=destination;toast('Sample trend analysis ready · free.');return true;}
function openDataset(d){cancelLiveAnalysis();result=d;$('#explorer-mode').value=d.kind==='sample'?'demo':'loaded';$('#smoothing').value='1';renderResult();location.hash='explorer';}
function keyOf(d){return d.kind==='imported'?d.id:d.kind+'|'+d.query.toLowerCase()+'|'+d.country+'|'+d.source+'|'+d.period+'|'+(d.language||'');}
function toggleSave(d=result){const key=keyOf(d),index=saved.findIndex(x=>keyOf(x.dataset)===key);if(index>=0){saved.splice(index,1);const stored=persist();renderResult();if(stored)toast('Topic removed from your watchlist.');return;}const limit=50;if(saved.length>=limit){toast('This browser workspace supports '+limit+' watchlist topics.');if(plan==='free')location.hash='plans';return;}saved.unshift({...meta(d),dataset:structuredClone(d),rule:{metric:'change',direction:'above',threshold:20,enabled:false}});const stored=persist();renderResult();if(stored)toast('Snapshot saved to your local watchlist.');}
function isSaved(d=result){return saved.some(x=>keyOf(x.dataset)===keyOf(d));}
function datesText(d){return d.records[0].date+' — '+d.records.at(-1).date;}
function emptyChart(label){return '<text x="380" y="118" text-anchor="middle" class="chart-empty">'+esc(label)+'</text>';}
function chartSvg(datasets,{id='main',points=true}={}){
 const valid=datasets.flatMap(d=>d.records.filter(r=>r.value!==null&&Number.isFinite(r.value)));
 if(!valid.length)return emptyChart('Select your data to see the signal.');
 const start=Math.min(...valid.map(r=>Date.parse(r.date))),end=Math.max(...valid.map(r=>Date.parse(r.date)));
 const maximum=Math.max(...valid.map(r=>r.value)),step=Math.pow(10,Math.floor(Math.log10(maximum||1))),yMax=Math.ceil((maximum||1)/step)*step;
 const x=t=>36+(t-start)/(end-start||1)*710,y=v=>202-v/yMax*184;
 let svg='<defs><linearGradient id="fill-'+id+'" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b8d499" stop-opacity=".32"/><stop offset="1" stop-color="#eaf3dc" stop-opacity=".02"/></linearGradient></defs>';
 for(let i=0;i<5;i++){const v=yMax*i/4,py=y(v);svg+='<path d="M36 '+py+'H746" stroke="#e9efe1" stroke-dasharray="3 4"/><text x="27" y="'+(py+3)+'" text-anchor="end" fill="#8ca27b" font-size="9">'+fmt(v,maximum<1?3:1)+'</text>';}
 for(let i=0;i<5;i++){const t=start+(end-start)*i/4;svg+='<text x="'+x(t)+'" y="230" fill="#829970" font-size="9" text-anchor="'+(i===0?'start':i===4?'end':'middle')+'">'+new Date(t).toLocaleDateString('en',{month:'short',year:'2-digit',timeZone:'UTC'})+'</text>';}
 datasets.forEach((d,index)=>{
 let path='',first=null,last=null,pen=false;
 for(const r of d.records){if(r.value===null||!Number.isFinite(r.value)){pen=false;continue;}const px=x(Date.parse(r.date)),py=y(r.value);path+=(pen?' L':' M')+px.toFixed(1)+' '+py.toFixed(1);if(first===null)first=px;last=px;pen=true;}
 if(datasets.length===1&&first!==null)svg+='<path d="'+path+' L'+last+' 202 L'+first+' 202Z" fill="url(#fill-'+id+')"/>';
 svg+='<path d="'+path+'" fill="none" stroke="'+colors[index%colors.length]+'" stroke-width="2.4" stroke-linejoin="round"/>';
 if(points){const stride=Math.max(1,Math.floor(d.records.length/60));d.records.forEach((r,i)=>{if(r.value===null||!Number.isFinite(r.value)||i%stride!==0&&i!==d.records.length-1)return;svg+='<circle class="chart-point" tabindex="0" cx="'+x(Date.parse(r.date))+'" cy="'+y(r.value)+'" r="6" fill="transparent" data-detail="'+esc(d.query+' · '+r.date+' · '+fmt(r.value)+' '+d.unit)+'" aria-label="'+esc(r.date+': '+fmt(r.value))+'"><title>'+esc(d.query+' · '+r.date+' · '+fmt(r.value))+'</title></circle>';});}
 });
 return svg;
}
function sparkline(records){const n=Math.min(60,records.length),step=records.length/n,vals=Array.from({length:n},(_,i)=>records[Math.min(records.length-1,Math.floor(i*step))].value),max=Math.max(...vals),min=Math.min(...vals);const path=vals.map((v,i)=>(i?'L':'M')+(1+i/(n-1)*88).toFixed(1)+' '+(25-(v-min)/(max-min||1)*22).toFixed(1)).join(' ');return '<svg class="sparkline" viewBox="0 0 90 28" aria-hidden="true"><path d="'+path+'"/></svg>';}
function chartInteractions(target,detail){$$(target+' .chart-point').forEach(p=>{const show=()=>$(detail).textContent=p.dataset.detail;p.addEventListener('mouseenter',show);p.addEventListener('focus',show);});}
function renderResult(){
 const stats=summarize(result.records),sample=result.kind==='sample',real=result.kind==='history';
 if(sample)explorerDemo=result;
 $('#explorer-mode').value=real&&$('#explorer-mode').value==='live'?'live':sample?'demo':'loaded';syncExplorerControls();
 $('#result-title').textContent=result.query;$('#result-context').textContent=(sample||real?countryName(result.country)+' · '+periodName(result.period)+(result.language?' · Keyword language: '+result.language:''):'Imported series · '+result.unit);
 $('#analysis-result').hidden=false;$('#keyword').value=result.query;if(sample||real){$('#country').value=result.country;if(result.period!=='available')$('#period').value=result.period;$('#source').value='synthetic';}
 $('#data-badge').textContent=sample?'SYNTHETIC DEMO':real?seriesLabel(result).toUpperCase():'YOUR IMPORTED DATA';
 $('#data-badge').classList.toggle('history-badge',real);
 $('#analysis-summary').textContent=describeSeries(result);
 $('#data-notice').classList.toggle('imported',!sample);$('#data-notice').textContent=sample?'Generated demo · These values do not measure real search interest. Import a CSV to analyze real observations, or explore the generated examples.':real?historyDescription(result):'Your CSV values · No upload or provider verification. Calculations preserve your original units.';
 $('#interest').textContent=fmt(stats.latest);$('#value-unit').textContent=sample||(real&&result.source==='google')?'/ 100':result.unit;$('#latest-date').textContent='Last observation · '+result.records.at(-1).date;
 $('#growth').textContent=pct(stats.change);$('#growth-label').textContent=stats.change===null?'No baseline':stats.change>0?'Growing':stats.change<0?'Declining':'Steady';
 $('#growth-method').textContent='Last '+stats.window+' observations vs. preceding '+stats.window;
 $('#acceleration').textContent=stats.acceleration===null?'N/A':(stats.acceleration>0?'+':'')+fmt(stats.acceleration);$('#volatility').textContent=fmt(stats.volatility);
 $('#signal-title').textContent=stats.change===null?'A baseline to build.':stats.acceleration>2?'Momentum is picking up.':stats.acceleration< -2?'Growth is losing pace.':'A steadier signal.';
 $('#signal-text').textContent=stats.change===null?'The preceding window has a zero average. A percentage change is undefined.':pct(stats.change)+' average change across adjacent '+stats.window+'-observation windows. '+(stats.acceleration!==null?'The growth rate shifted '+fmt(stats.acceleration)+' percentage points from the earlier comparison.':'')+' This is descriptive analysis, not a forecast.';
 $('#signal-source').textContent=sample?'Calculated from synthetic observations':real?'Calculated from stored observations':'Calculated from your imported values';
 $('#save-topic').innerHTML=icon('bookmark')+(isSaved()?'Tracked topic':'Track topic');$('#saved-count').textContent=saved.length+liveTopics.length;
 $('#series-chart-title').textContent=sample||(real&&result.source==='google')?'Interest over time':'Values over time';
 $('#chart-subtitle').textContent=result.records.length+' observations · '+result.unit;
 renderChart();
 const flags=anomalies(result.records);$('#anomaly-count').textContent=flags.length;
 $('#anomaly-list').innerHTML=flags.length?flags.slice(-4).reverse().map(f=>'<div class="anomaly-item"><div><strong>'+f.direction+' · '+f.date+'</strong><small>'+fmt(f.value)+' vs. rolling median '+fmt(f.baseline)+'</small></div><span class="status-pill">'+pct(f.deviation)+'</span></div>').join(''):'<p class="anomaly-empty">No observations exceeded the rolling anomaly threshold. This does not rule out meaningful changes.</p>';
 const coverage=[['Data origin',sample?'Synthetic demo':real?'Retrieved history':'CSV import'],['Source',sample?'Generated example':real?seriesLabel(result):'User-supplied'],...(real?[['Retrieved at',new Date(result.fetchedAt).toLocaleString('en')]]:[]),['Observations',fmt(stats.count,0)],['Typical interval',stats.cadenceDays===null?'N/A':fmt(stats.cadenceDays)+' days'],['Average value',fmt(stats.average)],['Highest value',fmt(stats.peak)],['Peak date',stats.peakDate]];
 $('#coverage').innerHTML=coverage.map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('');
 $('.keyword-panel').hidden=!sample;
 if(sample){rows=keywords(legacyAnalysis(result.query,result.country,result.period,result.source)).map(r=>{const d=sampleDataset(r.keyword,{country:result.country,source:result.source,period:result.period});const stats=summarize(d.records);return {...r,interest:stats.latest,growth:stats.change,records:d.records};});renderTable();}
 updateBalance();updateDatasetSelectors();
}
function renderChart(){let window=Number($('#smoothing').value);if(window>result.records.length){window=1;$('#smoothing').value='1';toast('This series needs more observations for that smoothing window.');}const data={...result,records:window===1?result.records:movingAverage(result.records,window)};$('#chart').innerHTML=chartSvg([data]);$('#chart').setAttribute('aria-label',result.query+' '+(result.kind==='sample'?'synthetic':result.kind==='history'?seriesLabel(result):'imported')+' time series');$('#chart-detail').textContent=(window===1?'Raw observations':window+'-observation trailing average')+' · '+result.unit;$('#chart-range').textContent=datesText(result);chartInteractions('#chart','#chart-detail');}
function renderTable(){const term=$('#table-filter').value.trim().toLowerCase();const accessible=rows.slice(0,PLANS[plan].visible).sort((a,b)=>descending?b.growth-a.growth:a.growth-b.growth);const visible=accessible.filter(r=>(filterType==='all'||r.intent===filterType)&&r.keyword.toLowerCase().includes(term));$('#keyword-rows').innerHTML=visible.length?visible.map(r=>'<tr><td><button data-related="'+esc(r.keyword)+'">'+esc(r.keyword)+'</button></td><td><span class="intent '+r.intent+'">'+(r.intent==='question'?'Question':r.intent==='commercial'?'Commercial':'Informational')+'</span></td><td>'+r.interest+'</td><td class="'+(r.growth>=0?'positive':'negative')+'">'+pct(r.growth)+'</td><td>'+sparkline(r.records)+'</td><td><button class="save-row" data-related-save="'+esc(r.keyword)+'" aria-label="Track '+esc(r.keyword)+'">'+icon('bookmark')+'</button></td></tr>').join(''):'<tr><td colspan="6" style="text-align:center;padding:24px">No matching phrases.</td></tr>';$('#table-count').textContent=rows.length;$('#table-footer').textContent='Showing '+visible.length+' of '+rows.length+' synthetic related phrases';$$('[data-related]').forEach(b=>b.addEventListener('click',()=>runSearch(b.dataset.related)));$$('[data-related-save]').forEach(b=>b.addEventListener('click',()=>toggleSave(sampleDataset(b.dataset.relatedSave,sampleOptions()))));}
const radarUi=initRadar({$, $$, esc, countryName, toast, pro, download,
 getChecks:()=>radarChecks,setChecks:value=>{radarChecks=value;return persist();},
 getTopics:()=>liveTopics,setTopics:value=>{liveTopics=value;return persist();},
 getPlan:()=>plan,getSeriesCount:()=>saved.length,updateBalance,
 refreshWatchlist:()=>{if(location.hash==='#saved')renderWatchlist();}});
function renderRadar(){radarUi.render();}
function loadRadar(){radarUi.load();}
function searchTopic(query){return runSearch(query);}
const periodOptions='<option value="30">Past 30 days</option><option value="90">Past 90 days</option><option value="365">Past 12 months</option><option value="1095">Past 3 years</option><option value="1825">Past 5 years</option>';
function cancelLiveAnalysis(){liveVersion++;liveController?.abort();liveController=null;liveBusy=false;}
function clearLiveResult(){if($('#explorer-mode').value==='live'){$('#analysis-result').hidden=true;$('#live-api-error').hidden=true;cancelLiveAnalysis();syncExplorerControls();}}
function syncExplorerControls(){
 const loaded=$('#explorer-mode').value==='loaded',datasets=seasonCsvSeries();
 $('#explorer-demo-controls').hidden=loaded;$('#demo-suggestions').hidden=loaded;
 $('#explorer-loaded-controls').hidden=!loaded;$('#live-api-info').hidden=true;
 for(const id of ['keyword','country','period','source'])$('#'+id).disabled=loaded;
 $('#keyword').required=!loaded;$('#keyword').maxLength=120;
 $('#source').innerHTML='<option value="synthetic">Generated demo</option>';
 $('#search-submit').textContent='Analyze demo ↗';$('#search-submit').disabled=false;
 $('#search-cost').textContent='Generated example · free';
 $('#explorer-dataset').disabled=!datasets.length;$('#explorer-loaded-open').disabled=!datasets.length;
 $('#explorer-loaded-help').textContent=datasets.length?'Open a series stored in this browser. Original values and units are used without charges.':'No loaded series yet. Import a CSV with dates and values to analyze your own data.';
}
function chooseExplorerMode(){
 clearSearchError();cancelLiveAnalysis();liveConfigVersion++;$('#live-api-error').hidden=true;
 if($('#explorer-mode').value==='demo'){openDataset(explorerDemo);return;}
 const datasets=seasonCsvSeries(),selected=datasets.find(d=>d.id===$('#explorer-dataset').value)||datasets[0];
 if(selected)openDataset(selected);
 else{syncExplorerControls();$('#analysis-result').hidden=true;}
}
function comparisonKey(){return $('#compare-mode').value==='imported'?JSON.stringify(['imported',$$('#compare-import-options input:checked').map(x=>x.value).sort()]):JSON.stringify(['sample',[...new Set($('#compare-input').value.split(',').map(x=>x.trim()).filter(Boolean))],sampleOptions()]);}
function marketKey(){return JSON.stringify([$('#market-topic').value.trim(),$$('#market-options input:checked').map(x=>x.value).sort(),$('#market-period').value,$('#source').value]);}
function invalidateComparison(render=true){const overLimit=comparison.length>(5);if(overLimit||comparisonRequest!==null&&comparisonRequest!==comparisonKey()){comparison=[];comparisonRequest=null;comparisonEmpty=overLimit?'Free supports two topics. Select two and run Compare again, or switch to the Pro demo.':'Selection changed. Run Compare to update the chart.';if(render)renderComparison();}}
function invalidateMarkets(render=true){const overLimit=markets.length>(5);if(overLimit||marketRequest!==null&&marketRequest!==marketKey()){markets=[];marketRequest=null;marketEmpty=overLimit?'Free supports two markets. Select two and run Analyze markets again, or switch to the Pro demo.':'Selection changed. Run Analyze markets to update these demo results.';if(render)renderMarkets();}}
function syncComparisonForm(focus=false){
 const imported=$('#compare-mode').value==='imported';
 $('#compare-topic-entry').hidden=imported;
 $('#compare-input').disabled=imported;
 $('#compare-input').required=!imported;
 $('#compare-import-options').hidden=!imported;
 $('#compare-input-grid').classList.toggle('import-mode',imported);
 const count=$$('#compare-import-options input:checked').length,cap=5;
 $('#compare-form-help').textContent=imported?'Select 2'+(cap>2?'–'+cap:'')+' loaded topics · '+count+' selected. This free calculation compares relative growth on shared dates, not absolute popularity.':'Enter your own topics. Demo comparisons use synthetic data and the explorer’s country, period and source settings.';
 $('#compare-submit').textContent=imported?'Compare selected series · free ↗':'Compare topics · free ↗';
 $('#compare-submit').disabled=imported&&(count<2||count>cap);
 $('#compare-demo-context').hidden=imported;
 $('#compare-demo-settings').textContent=countryName($('#country').value)+' · '+periodName($('#period').value)+' · '+$('#source').value+' generated demo';
 invalidateComparison();
 if(focus&&!imported){$('#compare-input').focus();$('#compare-input').select();}
}
function seasonCsvSeries(){const all=[...(result.kind!=='sample'?[result]:[]),...fetchedSeries,...imports,...saved.map(x=>x.dataset).filter(d=>d.kind!=='sample')];return all.filter((d,i)=>all.findIndex(x=>x.id===d.id)===i);}
function seriesLabel(d){return d.kind==='sample'?'Synthetic demo':d.kind==='history'?'Previously retrieved series':'Imported CSV';}
function updateDatasetSelectors(){
 const csv=seasonCsvSeries(),explorerChanged=result!==seasonExplorerDataset;
 const explorerSelected=$('#explorer-dataset').value;
 $('#explorer-dataset').innerHTML=csv.length?csv.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.query)+' · '+esc(seriesLabel(d))+' · '+esc(d.unit)+'</option>').join(''):'<option value="">Import a CSV to get started</option>';
 $('#explorer-dataset').value=csv.some(d=>d.id===result.id)?result.id:csv.some(d=>d.id===explorerSelected)?explorerSelected:csv[0]?.id||'';
 syncExplorerControls();
 const previous=$('#season-dataset').value;
 $('#season-dataset').innerHTML=csv.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.query)+'</option>').join('');
 $('#season-dataset').value=csv.some(d=>d.id===previous)?previous:csv[0]?.id||'';
 if(explorerChanged){
  seasonExplorerDataset=result;
  if(result.kind==='sample'){seasonDemo=result;seasonDemoDraft=null;$('#season-source').value='demo';}
  else{$('#season-source').value='imported';$('#season-dataset').value=result.id;}
 }
 const selected=new Set($$('#compare-import-options input:checked').map(x=>x.value));$('#compare-import-options').innerHTML=csv.length?csv.map(d=>'<label><input type="checkbox" value="'+esc(d.id)+'" '+(selected.has(d.id)?'checked':'')+'>'+esc(d.query)+' · '+esc(seriesLabel(d))+' · '+esc(countryName(d.country))+(d.language?' · '+esc(d.language):'')+' · '+d.records.length+' observations</label>').join(''):'<div class="comparison-import-empty"><strong>Bring your own trend history</strong><p>Import at least two CSV series, then select them here. To type topic names, choose Demo topics above.</p><a href="#imports" class="outline-btn">Import CSV data ↗</a></div>';$$('#compare-import-options input').forEach(input=>input.addEventListener('change',()=>syncComparisonForm()));syncComparisonForm();}
function buildComparison(){let datasets;if($('#compare-mode').value==='imported'){const ids=$$('#compare-import-options input:checked').map(x=>x.value);datasets=seasonCsvSeries().filter(d=>ids.includes(d.id));}else{const terms=[...new Set($('#compare-input').value.split(',').map(x=>x.trim()).filter(Boolean))];if(terms.some(x=>x.length>120))throw new Error('Each topic can contain up to 120 characters.');datasets=terms.map(q=>sampleDataset(q,sampleOptions()));}const cap=5;if(datasets.length<2||datasets.length>cap)throw new Error('Select between two and '+cap+' series on this tier.');const aligned=compareSeries(datasets);if($('#compare-mode').value!=='imported'&&!spend())return;comparison=aligned;comparisonRequest=comparisonKey();renderComparison();toast('Comparison ready · relative growth, not absolute popularity.');}
function renderComparison(){invalidateComparison(false);$('#export-comparison').disabled=!comparison.length;if(!comparison.length){$('#compare-chart').innerHTML=emptyChart(comparisonEmpty);$('#compare-legend').innerHTML='';$('#compare-results').innerHTML='';$('#compare-caption').textContent=comparisonEmpty;return;}$('#compare-chart').innerHTML=chartSvg(comparison,{id:'compare',points:false});$('#compare-legend').innerHTML=comparison.map((d,i)=>'<span><i style="background:'+colors[i]+'"></i>'+esc(d.query)+' · '+esc(seriesLabel(d))+'</span>').join('');$('#compare-caption').textContent=comparison[0].records.length+' common dates · '+datesText(comparison[0])+' · '+(comparison.every(d=>d.kind==='sample')?'Synthetic demo':comparison.some(d=>d.kind==='history')?'Loaded history & supplied CSV values':'Your imported values');$('#compare-results').innerHTML=comparison.map(d=>{const stats=summarize(d.records);return '<article><h4>'+esc(d.query)+'</h4><strong>'+pct(stats.baselineChange)+'</strong><small>Last 7-point average vs. starting average</small></article>';}).join('');}
function runMarkets(){const query=$('#market-topic').value.trim();if(!query||query.length>120)throw new Error('Enter a topic between 1 and 120 characters.');const codes=$$('#market-options input:checked').map(x=>x.value),cap=5;if(codes.length<2||codes.length>cap)throw new Error('Choose between two and '+cap+' markets on this tier.');const data=codes.map(country=>sampleDataset(query,{country,period:$('#market-period').value,source:$('#source').value}));if(!spend())return;markets=data;marketRequest=marketKey();renderMarkets();toast('Synthetic market analysis ready · free.');}
function renderMarkets(){invalidateMarkets(false);if(!markets.length){$('#market-caption').textContent=marketEmpty;$('#market-results').innerHTML='<p class="market-detail">'+esc(marketEmpty)+'</p>';return;}const data=markets.map(d=>({d,stats:summarize(d.records)})).sort((a,b)=>(b.stats.change??0)-(a.stats.change??0));const max=Math.max(1,...data.map(x=>Math.abs(x.stats.change??0)));$('#market-caption').textContent=markets[0].query+' · '+periodName(markets[0].period)+' · '+markets[0].source+' synthetic examples';$('#market-results').innerHTML=data.map(({d,stats})=>'<div class="market-row"><span>'+esc(countryName(d.country))+'</span><div class="market-track"><span class="'+(stats.change<0?'negative':'')+'" style="width:'+Math.abs(stats.change??0)/max*100+'%"></span></div><strong class="'+(stats.change<0?'negative':'positive')+'">'+pct(stats.change)+'</strong>'+sparkline(d.records)+'</div>').join('')+'<p class="market-detail">Bar length represents magnitude of recent change. Each market uses its own series; these results do not establish absolute search volume, demand, or market size.</p>';}
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function rememberSeasonDraft(){if(!$('#season-demo-form').hidden)seasonDemoDraft={query:$('#season-topic').value,country:$('#season-country').value,period:$('#season-period').value};}
function renderSeasonality(){
 seasonReport=null;$('#export-seasonality').disabled=true;
 const sample=$('#season-source').value==='demo',csv=seasonCsvSeries();
 const d=sample?seasonDemo:csv.find(x=>x.id===$('#season-dataset').value);
 $('#season-demo-form').hidden=!sample;
 $('#season-topic').required=sample;
 $('#season-import-controls').hidden=sample||!csv.length;
 $('#season-form-error').hidden=true;
 $('#season-topic').removeAttribute('aria-invalid');
 $('#season-data-help').textContent=sample?'Generated example values. To analyze retrieved history or your own CSV, choose Loaded series & CSV data.':csv.length?'Choose a loaded series below. Calculations preserve its values and use no demo credits.':'Import a CSV with dates and values. Your file stays in this browser.';
 if(sample){const draft=seasonDemoDraft||{query:d.query,country:d.country||'',period:d.period==='1825'?'1825':'1095'};$('#season-topic').value=draft.query;$('#season-country').value=draft.country;$('#season-period').value=draft.period;}
 $('#season-context').hidden=!d;
 if(!d){$('#season-content').innerHTML='<div class="empty-state"><h3>Import your first CSV.</h3><p>Add historical data with dates and values to calculate its seasonal pattern.</p><a href="#imports" class="search-button">Import CSV ↗</a></div>';return;}
 const data=seasonality(d.records);
 $('#season-context').classList.toggle('is-demo',sample);
 $('#season-context').innerHTML='<div class="season-context-top"><div><span class="season-context-label">Analyzing topic</span><h2>'+esc(d.query)+'</h2></div><span class="season-data-tag">'+esc(sample?'DEMO · GENERATED DATA':d.kind==='history'?seriesLabel(d).toUpperCase():'YOUR CSV VALUES')+'</span></div><div class="season-context-meta"><span><strong>History:</strong> '+esc(datesText(d))+'</span><span><strong>'+(sample?'Demo market:':'Value unit:')+'</strong> '+esc(sample?countryName(d.country):d.unit)+'</span></div><p>'+esc(sample?'These values are generated examples. The results below do not describe real search interest in this topic.':d.kind==='history'?historyDescription(d):'Calculated from the values in your CSV. ScopeFlux has not verified their source.')+'</p>';
 if(!data.available){$('#season-content').innerHTML='<div class="empty-state"><h3>More history is needed.</h3><p>'+esc(data.reason)+'</p><p>'+(sample?'Choose 3 or 5 years above, then select Analyze demo.':d.kind==='history'?d.source==='bing'?'The available range may not contain two complete calendar years. Import a longer CSV with data in all 12 months of at least two calendar years.':'Import a longer CSV with data in every month of at least two calendar years.':'Import a longer CSV with data in every month of at least two calendar years.')+'</p><a href="#imports" class="outline-btn">Import a longer CSV ↗</a></div>';return;}
 seasonReport=d;$('#export-seasonality').disabled=false;
 const profileMax=Math.max(...data.months.map(m=>m.index));
 let heat='<div class="year-grid"><span>Year</span>'+months.map(m=>'<span>'+m+'</span>').join('');
 for(const year of data.yearLabels){const monthly=months.map((_,m)=>{const vals=d.records.filter(r=>r.date.startsWith(year+'-'+String(m+1).padStart(2,'0'))).map(r=>r.value);return mean(vals);});const avg=mean(monthly);heat+='<span>'+year+'</span>'+monthly.map(v=>'<div class="month-cell" style="background:rgba(149,186,103,'+Math.max(.08,Math.min(.9,v/avg*.5))+')" title="Monthly index '+fmt(v/avg*100)+'; 100 is this year’s average month">'+fmt(v/avg*100,0)+'</div>').join('');}
 heat+='</div>';
 const repeatability=data.strength===0?'No clear pattern':data.strength>=80?'Very similar':data.strength>=50?'Some variation':'Weak pattern';
 const hasPeak=Math.max(...data.months.map(m=>m.index))-Math.min(...data.months.map(m=>m.index))>1e-8;
 const peakDifference=fmt(data.peak.index-100,0);
 $('#season-content').innerHTML='<div class="metrics season-metrics"><article class="metric"><div class="metric-label">Strongest month</div><div class="metric-value"><strong>'+(hasPeak?months[data.peak.month]:'No peak')+'</strong></div><small>Highest monthly average in the years analyzed</small></article><article class="metric"><div class="metric-label">Peak vs. yearly average</div><div class="metric-value"><strong>+'+peakDifference+'%</strong></div><small>Index '+fmt(data.peak.index,0)+' · 100 means an average month</small></article><article class="metric season-pattern"><div class="metric-label">Year-to-year pattern</div><div class="metric-value"><strong>'+repeatability+'</strong></div><small>'+fmt(data.strength,0)+'% consistency score · not prediction accuracy</small></article><article class="metric"><div class="metric-label">Years analyzed</div><div class="metric-value"><strong>'+data.years+'</strong></div><small>'+data.yearLabels.join(', ')+' · all 12 months represented</small></article></div><article class="panel"><div class="panel-heading"><div><h3>Which months are above average?</h3><p>100 is an average month. Taller bars show months with stronger values in this history.</p></div></div><div class="season-bars" role="img" aria-label="Monthly seasonal profile; 100 is an average month: '+esc(data.months.map(m=>months[m.month]+' '+fmt(m.index,0)).join(', '))+'">'+data.months.map(m=>'<div class="season-month"><div class="season-bar '+(m.month===data.peak.month?'peak':'')+'" style="height:'+m.index/profileMax*160+'px"><span>'+fmt(m.index,0)+'</span></div><small>'+months[m.month]+'</small></div>').join('')+'</div><p class="season-method">For example, 148 means 48% above that year’s average month. This describes the supplied history; it does not predict next year’s demand.</p></article><article class="panel season-year-panel"><div class="panel-heading"><div><h3>Compare the pattern across years</h3><p>Each row uses its own yearly average of 100. Darker cells mean stronger months.</p></div></div><div class="heatmap-scroll">'+heat+'</div></article><details class="season-explanation"><summary>How are these results calculated?</summary><div><p>We average the observations in each month, then set each year’s average month to 100. The monthly chart averages those indices across the '+data.years+' years shown above.</p><p>The consistency score compares the shared monthly pattern with variation between years. It measures similarity in this history, not the chance that a future prediction will be correct. A flat series scores 0 because there is no seasonal pattern to compare.</p><p>Only calendar years with at least one observation in every month and a positive yearly average are used. Partial years are excluded, so the number of years analyzed can be smaller than the selected date range.</p></div></details>';
}

function watchLimit(){return 50;}
function renderWatchlist(){radarUi.renderSaved();const enabled=saved.filter(x=>x.rule?.enabled),triggered=enabled.filter(x=>x.evaluation?.triggered);$('#watch-summary').innerHTML=[['Tracked topics',saved.length+liveTopics.length],['Enabled rules',enabled.length],['Triggered on last check',triggered.length]].map(([label,n])=>'<article><strong>'+n+'</strong><small>'+label+'</small></article>').join('');if(!saved.length){$('#saved-list').innerHTML='<div class="empty-state">'+icon('bookmark')+'<h3>A dashboard for your interests.</h3><p>Track a topic from the explorer to keep its snapshot and configure a rule.</p><a href="#explorer" class="search-button">Explore a topic ↗</a></div>';return;}$('#saved-list').innerHTML=saved.map((item,index)=>{const d=item.dataset,stats=summarize(d.records),rule=item.rule||{metric:'change',direction:'above',threshold:20,enabled:false};const checked=item.evaluation;return '<article class="watch-card"><div class="watch-card-top"><div><h3>'+esc(d.query)+'</h3><p>'+esc(d.kind==='sample'?countryName(d.country)+' · Synthetic snapshot':d.kind==='history'?countryName(d.country)+' · '+seriesLabel(d)+' snapshot':'Imported CSV snapshot')+' · Last observation '+d.records.at(-1).date+' · Recent change '+pct(stats.change)+'</p></div>'+sparkline(d.records)+'<div class="watch-actions"><button class="outline-btn" data-watch-open="'+index+'">Open snapshot ↗</button><button class="icon-btn" data-watch-remove="'+index+'" aria-label="Remove '+esc(d.query)+'">×</button></div></div><details class="watch-rule-details"><summary>Advanced: evaluate a rule on this snapshot</summary><form class="rule-form" data-rule="'+index+'"><label><input type="checkbox" name="enabled" '+(rule.enabled?'checked':'')+'>Enable rule</label><label>When <select name="metric"><option value="change" '+(rule.metric==='change'?'selected':'')+'>Recent change (%)</option><option value="acceleration" '+(rule.metric==='acceleration'?'selected':'')+'>Acceleration (pp)</option><option value="level" '+(rule.metric==='level'?'selected':'')+'>Latest value</option></select></label><select name="direction" aria-label="Threshold direction"><option value="above" '+(rule.direction==='above'?'selected':'')+'>is above</option><option value="below" '+(rule.direction==='below'?'selected':'')+'>is below</option></select><label class="sr-only" for="threshold-'+index+'">Threshold</label><input type="number" name="threshold" id="threshold-'+index+'" value="'+Number(rule.threshold)+'" step="any" required><button class="outline-btn" type="submit">Save rule </button></form><p class="rule-status '+(checked?.triggered?'triggered':'')+'">'+(checked?(checked.triggered?'Threshold met':'Threshold not met')+' · Value '+fmt(checked.value)+' · Checked '+new Date(checked.time).toLocaleString('en')+' against stored data.':'Not evaluated · Rule checks this stored snapshot only.')+'</p></details></article>';}).join('');$$('[data-watch-open]').forEach(b=>b.addEventListener('click',()=>openDataset(saved[Number(b.dataset.watchOpen)].dataset)));$$('[data-watch-remove]').forEach(b=>b.addEventListener('click',()=>{saved.splice(Number(b.dataset.watchRemove),1);persist();$('#saved-count').textContent=saved.length+liveTopics.length;renderWatchlist();}));$$('[data-rule]').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();if(!pro('Custom rules'))return;const fields=new FormData(form),threshold=Number(fields.get('threshold'));if(!Number.isFinite(threshold)){toast('Use a finite numeric threshold.');return;}const item=saved[Number(form.dataset.rule)];item.rule={enabled:fields.has('enabled'),metric:fields.get('metric'),direction:fields.get('direction'),threshold};delete item.evaluation;persist();renderWatchlist();toast('Rule saved. Use Evaluate rules now to check it.');}));}
function evaluateWatchlist(){if(!pro('Rule evaluation'))return;let count=0;const time=Date.now();saved.forEach(item=>{if(item.rule?.enabled){item.evaluation={...evaluateRule(item.dataset,item.rule),time};count++;}});persist();renderWatchlist();toast(count?'Evaluated '+count+' rules against stored snapshots. No live refresh was performed.':'Enable and save a rule before evaluating.');}
function download(text,name,type='text/csv;charset=utf-8'){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function watchReport(){if(!pro('Watchlist exports'))return;if(!saved.length){toast('Add a series snapshot first. Radar observations export from the feed journal.');return;}const data=[['topic','market','data_status','last_date','latest_value','recent_change_percent','acceleration_pp','volatility_percent','rule_enabled','rule_triggered','last_evaluated','source','provider','retrieved_at','unit','keyword_language','provider_metric'],...saved.map(x=>{const d=x.dataset,s=summarize(d.records);return[d.query,d.country||'Worldwide',dataStatus(d),d.records.at(-1).date,s.latest,s.change??'',s.acceleration??'',s.volatility??'',Boolean(x.rule?.enabled),x.evaluation?.triggered??'',x.evaluation?new Date(x.evaluation.time).toISOString():'',d.source,d.provider||'',d.fetchedAt||'',d.unit||'',d.language||'',d.metric||''];})];download('\ufeff'+data.map(r=>r.map(csvCell).join(',')).join('\r\n'),'scopeflux-watchlist-report.csv');toast('Watchlist report exported with data provenance.');}
function renderHistory(){if(!history.length){$('#history-list').innerHTML='<div class="empty-state"><h3>Your analysis trail starts here.</h3><p>New topic analyses and imports appear in this local history.</p><a href="#explorer" class="search-button">Analyze a trend ↗</a></div>';return;}$('#history-list').innerHTML=history.map((item,index)=>'<article class="saved-item">'+icon('history')+'<div><h3>'+esc(item.query)+'</h3><p>'+esc(item.kind==='imported'?'CSV import':item.kind==='history'?countryName(item.country)+' · '+'Previously retrieved series':countryName(item.country)+' · Synthetic demo')+' · '+periodName(item.period)+'</p></div><button class="outline-btn" data-history="'+index+'">Reopen ↗</button></article>').join('');$$('[data-history]').forEach(b=>b.addEventListener('click',()=>{const item=history[Number(b.dataset.history)];if(item.kind==='imported'||item.kind==='history'){const d=[...imports,...fetchedSeries,...saved.map(x=>x.dataset)].find(d=>d.id===item.id);if(!d){toast('This stored series is no longer available. Import the CSV again.');return;}openDataset(d);}else{openDataset(sampleDataset(item.query,{country:item.country||'',source:item.source==='bing'?'bing':'google',period:item.period||'1095',now:new Date(item.time||Date.now())}));}}));}
function showImportError(message){$('#import-error').textContent=message;$('#import-error').hidden=false;}
function resetImportPreview(){
 importPreview=null;namedImportColumn=null;
 $('#import-column-preview').hidden=true;$('#import-column-options').innerHTML='';
 $('#import-name-entry').hidden=true;$('#import-name').required=false;
 $('#import-submit').disabled=true;$('#import-submit').textContent='Review your CSV first ↗';
 $('#import-error').hidden=true;$('#import-success').hidden=true;
}
function selectedImportColumns(){return $$('#import-column-options input:checked').map(input=>Number(input.value));}
function syncImportSelection(){
 if(!importPreview)return;
 const selected=selectedImportColumns(),available=Math.max(0,5-imports.length);
 const count=selected.length;
 $('#import-name-entry').hidden=count!==1;$('#import-name').required=count===1;
 if(count===1&&namedImportColumn!==selected[0]){namedImportColumn=selected[0];const column=importPreview.columns.find(c=>c.index===selected[0]);const file=$('#import-file').files[0];$('#import-name').value=(/^(value|values)$/i.test(column?.name||'')&&file?file.name.replace(/\.csv$/i,''):column?.name||'Imported topic').slice(0,120);}
 $('#import-selection-help').textContent=available===0?'Your workspace is full (5 topics). Remove an imported topic below before adding another.':count+' of '+importPreview.columns.filter(c=>c.valid).length+' valid topics selected · '+available+' workspace slots available. '+(count>1?'Topic names will come from their column headers.':'');
 $('#import-submit').disabled=count<1||count>available;
 $('#import-submit').textContent=count?'Import '+count+' selected topic'+(count===1?'':'s')+' ↗':'Choose a topic to import ↗';
}
function detectColumns(){
 resetImportPreview();
 try{
  importPreview=inspectCsv($('#import-text').value);
  const available=Math.max(0,5-imports.length);let chosen=0;
  $('#import-column-options').innerHTML=importPreview.columns.map(c=>{const checked=c.valid&&chosen++<available;return '<label class="import-column-row '+(c.valid?'':'has-error')+'"><input type="checkbox" value="'+c.index+'" '+(checked?'checked ':'')+(!c.valid?'disabled ':'')+'><span><strong>'+esc(c.name)+'</strong><small>'+(c.valid?c.count+' observations · '+c.from+' — '+c.to:esc(c.error))+'</small></span><span class="import-column-status">'+(c.valid?'Ready':'Needs correction')+'</span></label>';}).join('');
  $('#import-column-preview').hidden=false;
  $$('#import-column-options input').forEach(input=>input.addEventListener('change',syncImportSelection));
  syncImportSelection();
  if(!importPreview.columns.some(c=>c.valid))showImportError('No topics are ready to import. Correct the values shown above, then review the CSV again.');
  return importPreview;
 }catch(error){showImportError(error.message);return null;}
}
function importData(){
 try{
  if(!importPreview)throw new Error('Review your CSV first, then choose the topics to import.');
  const selected=selectedImportColumns();
  if(selected.length+imports.length>5)throw new Error('This workspace supports five imported topics. Select fewer columns or remove a topic below.');
  const parsed=parseCsvColumns($('#import-text').value,selected),single=parsed.length===1;
  const name=$('#import-name').value.trim();
  if(single&&(!name||name.length>120))throw new Error('Name your topic using 1–120 characters.');
  const createdAt=Date.now(),datasets=parsed.map(series=>({id:crypto.randomUUID(),query:single?name:series.name.slice(0,120),country:'',source:'csv',kind:'imported',period:'imported',unit:$('#import-unit').value,records:series.records,createdAt}));
  imports=[...datasets,...imports];history=[...datasets.map(meta),...history].slice(0,50);
  const stored=persist();lastImportIds=datasets.map(d=>d.id);
  fileReadVersion++;$('#import-text').value='';$('#import-file').value='';resetImportPreview();renderImports();
  $('#import-success-title').textContent=datasets.length+' topic'+(single?'':'s')+' imported';
  $('#import-success-detail').textContent=(stored?'Saved in this browser. ':'Available for this session only: browser storage is full or unavailable. ')+(single?'Open the analysis for '+datasets[0].query+'.':'Each selected column is now a separate topic. Open '+datasets[0].query+' or compare the topics below.');
  $('#import-open-analysis').textContent='Analyze '+datasets[0].query+' ↗';
  $('#import-open-comparison').hidden=single;
  $('#import-success').hidden=false;$('#import-success-title').focus();
  toast(stored?'Your selected topics were imported. No file upload or demo credits.':'Imported for this session only. Browser storage is full or unavailable.');
 }catch(error){showImportError(error.message);}
}
function compareLastImport(){
 const ids=lastImportIds.filter(id=>imports.some(d=>d.id===id));
 $('#compare-mode').value='imported';comparison=[];comparisonRequest=null;comparisonEmpty='Choose two topics and select Compare.';updateDatasetSelectors();
 const cap=5;
 $$('#compare-import-options input').forEach(input=>{input.checked=ids.length<=cap&&ids.includes(input.value);});
 syncComparisonForm();renderComparison();location.hash='compare';
 if(ids.length>cap)toast('Choose '+cap+' of the imported topics to compare on this tier.');
}
function renderImports(){updateDatasetSelectors();syncImportSelection();$('#import-count').textContent=imports.length+' / 5 local topics';$('#import-list').innerHTML=imports.length?imports.map((d,index)=>'<article class="import-item">'+icon('database')+'<div><h3>'+esc(d.query)+'</h3><p>'+d.records.length+' observations · '+esc(d.unit)+' · '+datesText(d)+'</p></div><button class="outline-btn" data-import-open="'+index+'">Analyze ↗</button><button class="icon-btn" data-import-remove="'+index+'" aria-label="Remove '+esc(d.query)+'">×</button></article>').join(''):'<div class="empty-state"><h3>Add one file, explore several topics.</h3><p>Each numeric column becomes a topic. Your values can be used for analytics, seasonality, comparison and watchlists.</p></div>';$$('[data-import-open]').forEach(b=>b.addEventListener('click',()=>openDataset(imports[Number(b.dataset.importOpen)])));$$('[data-import-remove]').forEach(b=>b.addEventListener('click',()=>{imports.splice(Number(b.dataset.importRemove),1);persist();$('#import-success').hidden=true;renderImports();toast('Imported topic removed. Existing watchlist snapshots remain.');}));}

const pages={explorer:'CSV analytics',radar:'Discover trends',compare:'Compare topics',markets:'Market demo',seasonality:'Seasonality',saved:'Saved topics',imports:'Import data',history:'Recent analyses',plans:'About ScopeFlux',sources:'Sources & help'};
let routedPage=null;
function focusPageHeading(){const heading=$('#page-'+routedPage+' h1');if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}}
const navigation=initNavigation({onSearchShortcut(){location.hash='explorer';route();if($('#explorer-mode').value==='loaded')$('#explorer-dataset').focus();else{$('#keyword').focus();$('#keyword').select();}},onNavigate(href){if(href===location.hash)focusPageHeading();}});
function route(){const page=Object.hasOwn(pages,location.hash.slice(1))?location.hash.slice(1):'radar';$$('.page').forEach(el=>el.hidden=el.id!=='page-'+page);$$('[data-page]').forEach(a=>{const active=a.dataset.page===page;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});$('#breadcrumb').textContent=pages[page];document.title=pages[page]+' — ScopeFlux';navigation.close();const changed=routedPage!==null&&routedPage!==page;routedPage=page;updateBalance();if(page==='radar')renderRadar();if(page==='saved')renderWatchlist();if(page==='history')renderHistory();if(page==='compare'){updateDatasetSelectors();renderComparison();}if(page==='markets')renderMarkets();if(page==='seasonality'){updateDatasetSelectors();renderSeasonality();}if(page==='imports')renderImports();window.scrollTo(0,0);if(changed)focusPageHeading();}
$('#search-form').addEventListener('submit',async e=>{e.preventDefault();if($('#explorer-mode').value==='loaded')chooseExplorerMode();else await searchTopic($('#keyword').value);});
$('#explorer-mode').addEventListener('change',chooseExplorerMode);
$('#explorer-dataset').addEventListener('change',chooseExplorerMode);
$('#explorer-market-link').addEventListener('click',()=>{$('#market-topic').value=result.query;invalidateMarkets();});
for(const id of ['country','period'])$('#'+id).addEventListener('change',()=>{if($('#explorer-mode').value==='live'){if($('#source').value==='google'){liveCountry=$('#country').value;livePeriod=$('#period').value;}clearLiveResult();}invalidateComparison();});
$('#keyword').addEventListener('input',()=>{clearSearchError();clearLiveResult();});
$$('[data-query]').forEach(b=>b.addEventListener('click',()=>searchTopic(b.dataset.query)));
$('#save-topic').addEventListener('click',()=>toggleSave());$('#smoothing').addEventListener('change',renderChart);
$('#table-filter').addEventListener('input',renderTable);$$('.table-tab').forEach(b=>b.addEventListener('click',()=>{filterType=b.dataset.type;$$('.table-tab').forEach(t=>t.classList.toggle('active',t===b));renderTable();}));
$('#sort').addEventListener('click',()=>{descending=!descending;$('#sort').textContent='Change: '+(descending?'high to low ↓':'low to high ↑');renderTable();});
$('#export').addEventListener('click',()=>{if(!pro('Series exports'))return;download(exportSeries(result),'scopeflux-'+(result.kind==='sample'?'sample':result.kind==='history'?result.source+'-history':'imported')+'-series.csv');toast('Time series exported with source and data-status labels.');});
$('#compare-form').addEventListener('submit',e=>{e.preventDefault();$('#compare-error').hidden=true;try{buildComparison();}catch(error){$('#compare-error').textContent=error.message;$('#compare-error').hidden=false;}});
for(const type of ['input','change'])$('#compare-form').addEventListener(type,()=>{$('#compare-error').hidden=true;invalidateComparison();});
$('#export-comparison').addEventListener('click',()=>{invalidateComparison();if(!comparison.length){toast('Run a comparison before exporting.');return;}if(!pro('Comparison exports'))return;download(exportComparison(comparison),'scopeflux-comparison-report.csv');toast('Comparison exported: original values and rebased indices on shared dates.');});
$('#export-seasonality').addEventListener('click',()=>{if(!seasonReport){toast('Choose a series with at least two complete calendar years.');return;}if(!pro('Seasonality exports'))return;download(exportSeasonality(seasonReport),'scopeflux-seasonality-report.csv');toast('Seasonality exported: monthly profile and year-by-year averages.');});
$('#compare-mode').addEventListener('change',()=>{updateDatasetSelectors();syncComparisonForm(true);});
$('#markets-form').addEventListener('submit',e=>{e.preventDefault();$('#market-error').hidden=true;try{runMarkets();}catch(error){$('#market-error').textContent=error.message;$('#market-error').hidden=false;}});
for(const type of ['input','change'])$('#markets-form').addEventListener(type,()=>{$('#market-error').hidden=true;invalidateMarkets();});
$('#season-source').addEventListener('change',renderSeasonality);
$('#season-dataset').addEventListener('change',renderSeasonality);
$('#season-demo-form').addEventListener('submit',e=>{e.preventDefault();if($('#season-demo-form').hidden)return;const query=$('#season-topic').value.trim().replace(/\s+/g,' ');if(!query||query.length>120){$('#season-form-error').textContent='Enter a demo topic between 1 and 120 characters.';$('#season-form-error').hidden=false;$('#season-topic').setAttribute('aria-invalid','true');$('#season-topic').focus();return;}runSearch(query,{country:$('#season-country').value,period:$('#season-period').value,source:seasonDemo.source==='bing'?'bing':'google'},'seasonality');});
$('#season-topic').addEventListener('input',()=>{$('#season-form-error').hidden=true;$('#season-topic').removeAttribute('aria-invalid');rememberSeasonDraft();});
$('#season-country').addEventListener('change',rememberSeasonDraft);$('#season-period').addEventListener('change',rememberSeasonDraft);
$('#evaluate-watchlist').addEventListener('click',evaluateWatchlist);$('#watch-report').addEventListener('click',watchReport);
$('#radar-region').addEventListener('change',loadRadar);$('#radar-refresh').addEventListener('click',loadRadar);$('#radar-filter').addEventListener('input',()=>{if(radarUi.hasData())renderRadar();});$('#radar-sort').addEventListener('change',()=>{if(radarUi.hasData())renderRadar();});
$('#clear-history').addEventListener('click',()=>{history=[];persist();renderHistory();toast('Local analysis history cleared.');});
$('#inspect-columns').addEventListener('click',detectColumns);
$('#import-text').addEventListener('input',()=>{fileReadVersion++;resetImportPreview();});
$('#import-file').addEventListener('change',async()=>{const file=$('#import-file').files[0],version=++fileReadVersion;resetImportPreview();$('#import-text').value='';if(!file)return;if(file.size>2_000_000){showImportError('Choose a CSV file up to 2 MB.');return;}try{const text=await file.text();if(version!==fileReadVersion)return;$('#import-text').value=text;detectColumns();}catch{if(version===fileReadVersion)showImportError('The file could not be read. Try pasting its contents.');}});
$('#import-form').addEventListener('submit',e=>{e.preventDefault();importData();});
$('#import-open-analysis').addEventListener('click',()=>{const d=imports.find(d=>d.id===lastImportIds[0]);if(d)openDataset(d);});
$('#import-open-comparison').addEventListener('click',compareLastImport);
$('#download-template').addEventListener('click',()=>{const firstYear=new Date().getUTCFullYear()-2;const rows=Array.from({length:24},(_,i)=>{const month=i%12,date=(firstYear+Math.floor(i/12))+'-'+String(month+1).padStart(2,'0')+'-01';return [date,Math.round(40+18*Math.sin(month/12*Math.PI*2)),Math.round(35+15*Math.cos(month/12*Math.PI*2))];});download('date,Example coffee (synthetic),Example matcha (synthetic)\r\n'+rows.map(r=>r.join(',')).join('\r\n'),'scopeflux-synthetic-comparison.csv');toast('Downloaded a generated example with two topics and two calendar years.');});
window.addEventListener('hashchange',route);renderResult();route();
