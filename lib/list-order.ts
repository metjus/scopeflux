import type {DomainRecord} from './domains';
export function orderListings(records:DomainRecord[],mode:string):DomainRecord[]{
 const sorted=[...records].sort((a,b)=>mode==='name'?a.domain.localeCompare(b.domain):(a.reportedDrop?.at||a.drop||a.conditionalRelease||a.listedDate||a.expiration||'9999').localeCompare(b.reportedDrop?.at||b.drop||b.conditionalRelease||b.listedDate||b.expiration||'9999'));
 if(mode==='recent')return sorted.reverse();
 if(mode!=='mixed')return sorted;
 const buckets=new Map<string,DomainRecord[]>();for(const record of sorted){const bucket=buckets.get(record.tld)||[];bucket.push(record);buckets.set(record.tld,bucket);}
 const groups=[...buckets.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,rows])=>rows);
 const result:DomainRecord[]=[];
 for(let i=0;result.length<sorted.length;i++){for(const group of groups){if(i<group.length)result.push(group[i]);}}
 return result;
}
