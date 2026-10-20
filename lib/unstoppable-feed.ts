import type {DomainRecord} from './domains.ts';
import {isUpcomingDate} from './release-time.ts';

export const UD_SOURCE_URL = 'https://api.unstoppabledomains.com/mcp/v1/actions/ud_expireds_list';
type UnknownRecord = Record<string, unknown>;
function object(value:unknown):UnknownRecord|null {return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;}
function timestamp(value:unknown):string|null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms=value < 100000000000 ? value*1000 : value;
    return ms > 946684800000 && ms < 4102444800000 ? new Date(ms).toISOString() : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const at=Date.parse(value);
    return Number.isFinite(at) && at > 946684800000 && at < 4102444800000 ? new Date(at).toISOString() : null;
  }
  return null;
}
export function parseUnstoppableListings(payload:unknown,tld:string,checkedAt:string):DomainRecord[] {
  const root=object(payload);
  // Some API gateways wrap the action response in data/result.
  const data=object(root?.data) ?? object(root?.result) ?? root;
  if (!data || !Array.isArray(data.domains)) throw new Error('Unstoppable Domains returned an unexpected domain list.');
  const records:DomainRecord[]=[];
  for(const item of data.domains){
    const row=object(item); if(!row)continue;
    const domain=(typeof row.name==='string'?row.name:typeof row.domain==='string'?row.domain:'').toLowerCase();
    if (!domain.endsWith('.'+tld) || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z]{2,63}$/.test(domain))continue;
    const drop=timestamp(row.deletionAt ?? row.availableAfterTimestamp ?? row.dropAt ?? row.dropDate);
    if(!drop || !isUpcomingDate(drop))continue;
    records.push({domain,tld,status:'Expected release',expiration:null,drop,source:'Unstoppable Domains',sourceUrl:'https://unstoppabledomains.com/',checkedAt,
      availabilitySource:'Unstoppable Domains',availabilityUrl:'https://unstoppabledomains.com/',
      note:'Projected deletion date from Unstoppable Domains. Availability is not guaranteed; verify with a registrar.'});
  }
  return records;
}
export async function fetchUnstoppableListings(tld:string,key:string,page:number,checkedAt:string):Promise<{records:DomainRecord[];more:boolean}> {
  const response=await fetch(UD_SOURCE_URL,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({status:'COMING_SOON',tlds:[tld],sortBy:'deletionAt',sortDirection:'ASC',offset:(page-1)*100,limit:100}),
    signal:AbortSignal.timeout(14000)});
  if(!response.ok)throw new Error('Unstoppable Domains API error ('+response.status+').');
  const payload:unknown=await response.json();
  const root=object(payload);
  const data=object(root?.data) ?? object(root?.result) ?? root;
  const records=parseUnstoppableListings(payload,tld,checkedAt);
  const pagination=object(data?.pagination);
  return {records,more:pagination?.hasMore===true};
}
