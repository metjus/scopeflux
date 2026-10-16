import {USER_AGENT,limitedText} from './http.ts';
import {parseBackorderDetail} from './backorder-detail.ts';
export const TLDS=['sk','cz','com','net','org','eu','ai','io','dev','app'];
export type ReportedDrop={at:string;label:string;sourceDate:string;source:string;url:string;checkedAt:string};
export type DomainRecord={checkError?:string;checkAttemptedAt?:string;availabilityCheckedAt?:string;reportedDrop?:ReportedDrop;domain:string;tld:string;status:string;expiration:string|null;drop:string|null;listedDate?:string|null;registered?:string|null;source:string;sourceUrl:string;checkedAt:string;sourceCheckedDate?:string|null;conditionalRelease?:string|null;lifecycleUrl?:string;note?:string;changed?:boolean;availabilitySource?:string;availabilityUrl?:string};
export function normalizeDomain(input:string){
 if(typeof input!=='string')throw new Error('Enter a domain name, for example example.com.');
 const value=input.trim().replace(/^https?:\/\//i,'').replace(/\/$/,'').replace(/\.$/,'');
 if(!value||/[\s\u0000-\u001f\u007f\/:?#@%\\]/.test(value))throw new Error('Enter the domain itself without a path, port or login details.');
 let name:string;
 try{name=new URL('https://'+value).hostname.toLowerCase();}
 catch{throw new Error('Enter a valid domain name, for example example.com or example.co.uk.');}
 const parts=name.split('.'),tld=parts.at(-1)!;
 if(parts.length<2||name.length>253||parts.some(label=>!label||label.length>63||!(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)))||!(/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld)))throw new Error('Enter a valid domain name, for example example.com or example.co.uk.');
 return name;
}
class RegistrySourceError extends Error {
 readonly status:number;
 constructor(status:number,message:string){super(message);this.status=status;}
}
async function get(url:string,accept='application/json'){
 const res=await fetch(url,{headers:{Accept:accept,'User-Agent':USER_AGENT},signal:AbortSignal.timeout(14000)});
 if(!res.ok)throw new RegistrySourceError(res.status,res.status===404?'The registry did not find a record. Confirm availability with a registrar.':res.status===429?'The registry has limited requests. Please try again later.':'The source is currently unavailable ('+res.status+').');
 return res;
}
type BootstrapService=[string[],string[]];
type RdapDomain={objectClassName?:string;ldhName?:string;unicodeName?:string;events?:Array<{eventAction:string;eventDate:string}>;status?:string[]};
let bootstrap:{at:number;services:BootstrapService[]}|null=null;
export function rdapServiceBase(services:BootstrapService[],domain:string){
 const matches=services.flatMap(([suffixes,urls])=>suffixes.filter(suffix=>domain===suffix||domain.endsWith('.'+suffix)).map(suffix=>({suffix,urls})));
 matches.sort((a,b)=>b.suffix.split('.').length-a.suffix.split('.').length);
 return matches[0]?.urls.find(url=>url.startsWith('https://'))??matches[0]?.urls[0];
}
export async function lookup(input:string):Promise<DomainRecord>{
 const domain=normalizeDomain(input),tld=domain.split('.').pop()!,checkedAt=new Date().toISOString();
 if(tld==='sk'){
 const sourceUrl='https://www.backorder.sk/domena/'+domain;
 const html=await limitedText(await get(sourceUrl,'text/html'),5_000_000);
 return parseBackorderDetail(html,domain,checkedAt);
 }
 let base:string|undefined;
 if(tld==='ai')base='https://rdap.identitydigital.services/rdap/';
 else{
  if(!bootstrap||Date.now()-bootstrap.at>86400000){const data=JSON.parse(await limitedText(await get('https://data.iana.org/rdap/dns.json'),2_000_000)) as {services:BootstrapService[]};bootstrap={at:Date.now(),services:data.services};}
  base=rdapServiceBase(bootstrap.services,domain);
 }
 if(!base)return {domain,tld,status:'Unverified',expiration:null,drop:null,source:'IANA · Registry directory',sourceUrl:'https://www.iana.org/domains/root/db/'+tld+'.html',checkedAt,note:'No public RDAP service is listed for this ending. Use the registry reference to find its lookup service. This does not confirm whether the domain is registered or available.'};
 const sourceUrl=base.replace(/\/?$/,'/')+'domain/'+encodeURIComponent(domain);
 let data:RdapDomain;
 try{data=JSON.parse(await limitedText(await get(sourceUrl),2_000_000)) as RdapDomain;}
 catch(error){if(error instanceof RegistrySourceError&&error.status===404)return {domain,tld,status:'Unverified',expiration:null,drop:null,source:'Registry · RDAP',sourceUrl,checkedAt,note:'The registry returned no record for this name. It may be unavailable, reserved, a subdomain, or not registered. A missing record does not confirm availability; check with a registrar.'};throw error;}
 const returnedName=data.ldhName||data.unicodeName;
 if(data.objectClassName!=='domain'||!returnedName||normalizeDomain(returnedName)!==domain)throw new Error('The registry did not return a matching domain record. Please confirm with its lookup service.');
 const events=data.events??[],statuses=(data.status??[]).map(s=>s.toLowerCase());
 const expiration=events.find(e=>e.eventAction==='expiration')?.eventDate??null;
 const registered=events.find(e=>e.eventAction==='registration')?.eventDate??null;
 const status=statuses.includes('redemption period')?'Recovery period':statuses.includes('pending delete')?'Pending deletion':expiration&&new Date(expiration).getTime()<Date.now()?'Expired':'Registered';
 return {domain,tld,status,expiration,drop:null,registered,source:'Registry · RDAP',sourceUrl,checkedAt,note:'Expiration is not a release date. This record does not confirm the exact deletion date.'};
}
