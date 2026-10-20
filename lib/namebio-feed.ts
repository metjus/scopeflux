import type {DomainRecord} from './domains.ts';
import {isUpcomingDate} from './release-time.ts';

export const NAMEBIO_URL='https://api.namebio.com/verisign-download';
const MAX_BYTES=2_000_000;
const MAX_ITEMS=350;
type Entry={domain:string;drop:string};
let cached:{at:number;items:Entry[]}|undefined;
let retryAfter=0;
let inflight:Promise<Entry[]>|undefined;

// The full Verisign report can be large. Read at most 2 MB per refresh so the
// Cloudflare free Worker does not buffer the entire download into memory.
export function parseNameBio(text:string):Entry[] {
 const entries:Entry[]=[];
 for(const raw of text.split(/\r?\n/)){
   const index=raw.indexOf(':');if(index<0)continue;
   const domain=raw.slice(0,index).trim().toLowerCase();
   if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|net)$/.test(domain))continue;
   const input=raw.slice(index+1).trim();
   const date=/^\d{4}-\d{2}-\d{2}$/.test(input)?input:
     /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(input)?input.replace(' ','T')+'Z':input;
   if(!isUpcomingDate(date))continue;
   entries.push({domain,drop:date});
 }
 return entries;
}
async function load():Promise<Entry[]>{
 if(cached&&Date.now()-cached.at<86400000)return cached.items;
 if(Date.now()<retryAfter)throw new Error('NameBio temporarily unavailable; retry later.');
 const response=await fetch(NAMEBIO_URL,{headers:{Accept:'text/plain'},signal:AbortSignal.timeout(18000)}).catch(error=>{retryAfter=Date.now()+3600000;throw error;});
 if(!response.ok||!response.body){retryAfter=Date.now()+3600000;throw new Error('NameBio download unavailable ('+response.status+').');}
 const reader=response.body.getReader();
 const decoder=new TextDecoder();
 let body='',size=0;
 try {
  while(size<MAX_BYTES){
   const next=await reader.read();if(next.done)break;
   const remaining=MAX_BYTES-size;
   body+=decoder.decode(next.value.subarray(0,remaining),{stream:true});
   size+=Math.min(next.value.byteLength,remaining);
  }
 }finally{await reader.cancel().catch(()=>{});}
 // Ignore the final potentially truncated row.
 const last=body.lastIndexOf('\n');if(last>0)body=body.slice(0,last+1);
 const items=parseNameBio(body);
 if(!items.length){retryAfter=Date.now()+3600000;throw new Error('NameBio returned no readable future drops in the sampled text.');}
 cached={at:Date.now(),items};
 return items;
}
export async function nameBioFeed(tld:'com'|'net',checkedAt=new Date().toISOString()):Promise<{records:DomainRecord[];more:boolean}> {
 if(!inflight)inflight=load().finally(()=>{inflight=undefined;});
 const entries=await inflight;
 const matching=entries.filter(entry=>entry.domain.endsWith('.'+tld))
   .sort((a,b)=>a.drop.localeCompare(b.drop)).slice(0,MAX_ITEMS);
 const records=matching.map(({domain,drop}):DomainRecord=>({
   domain,tld,status:'Expected release',expiration:null,drop,
   source:'NameBio',sourceUrl:'https://api.namebio.com/docs/',
   checkedAt,availabilitySource:'NameBio',availabilityUrl:'https://api.namebio.com/docs/',
   note:'Verisign pending-delete drop order via NameBio. The release time is an estimate; availability is not guaranteed.'
 }));
 return {records,more:false};
}
