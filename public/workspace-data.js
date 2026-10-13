import { sampleDataset } from './analytics.js';

const providers={
 'serpapi-google-trends':'google','dataforseo-google-trends':'google',
 'bing-webmaster-keyword-stats':'bing','dataforseo-bing-search-volume':'bing'
};
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const market=value=>typeof value==='string'&&(value===''||/^[A-Z]{2}$/.test(value));
function date(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const time=Date.parse(value);return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}
export function validDataset(d){
 if(!d||!text(d.id,200)||!text(d.query,120)||!text(d.unit,120)||!market(d.country))return false;
 if(!['sample','imported','history'].includes(d.kind))return false;
 if(d.kind==='imported'&&d.source!=='csv'||d.kind==='sample'&&!['google','bing'].includes(d.source)||d.kind==='history'&&(!Object.hasOwn(providers,d.provider)||providers[d.provider]!==d.source))return false;
 if(d.fetchedAt!==undefined&&(typeof d.fetchedAt!=='string'||!Number.isFinite(Date.parse(d.fetchedAt))))return false;
 if(!Array.isArray(d.records)||d.records.length<6||d.records.length>10000)return false;
 const index=d.kind==='sample'||d.kind==='history'&&d.source==='google';
 return d.records.every((r,i)=>r&&date(r.date)&&typeof r.value==='number'&&Number.isFinite(r.value)&&r.value>=0&&(!index||r.value<=100)&&(i===0||r.date>d.records[i-1].date));
}

// Invalid data is retained separately so the next normal save cannot destroy it.
// It is never used in analytics or converted into generated demo observations.
export function restoreDatasetCollections(raw={}){
 const unrestoredSeries=Array.isArray(raw.unrestoredSeries)?[...raw.unrestoredSeries]:[];let rejectedCount=0;
 const reject=(collection,value)=>{unrestoredSeries.push({collection,value});rejectedCount++;};
 function rows(key){if(raw[key]===undefined)return [];if(Array.isArray(raw[key]))return raw[key];reject(key,raw[key]);return [];}
 function datasets(key,kind,limit){const accepted=[];for(const d of rows(key)){if(validDataset(d)&&d.kind===kind&&accepted.length<limit)accepted.push(d);else reject(key,d);}return accepted;}
 const imports=datasets('imports','imported',5),fetchedSeries=datasets('fetchedSeries','history',10);
 const saved=[];
 for(const item of rows('saved')){
  if(saved.length===50){reject('saved',item);continue;}
  if(item&&Object.hasOwn(item,'dataset')){
   if(!validDataset(item.dataset)){reject('saved',item);continue;}
   const d=item.dataset;
   saved.push({...item,query:d.query,country:d.country,source:d.source,period:d.period,kind:d.kind});
  }else if(item&&text(item.query,120)&&market(item.country)&&(item.kind===undefined||item.kind==='sample')&&(item.source===undefined||['google','bing'].includes(item.source))){
   const d=sampleDataset(item.query,{country:item.country,source:item.source==='bing'?'bing':'google',period:['30','90','365','1095','1825'].includes(String(item.period))?String(item.period):'1095'});
   saved.push({...item,kind:'sample',dataset:d,rule:{metric:'change',direction:'above',threshold:20,enabled:false}});
  }else reject('saved',item);
 }
 return {imports,fetchedSeries,saved,unrestoredSeries,rejectedCount};
}
