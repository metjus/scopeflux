import {withReleaseEstimate} from '../../../lib/domain-details';
import {scheduledRelease} from '../../../lib/catalog';
import {englishRecord} from '../../../lib/legacy';
import {env} from 'cloudflare:workers';
import {lookup,normalizeDomain,DomainRecord} from '../../../lib/domains';
function database(){if(!env.DB)throw new Error('The database is currently unavailable.');return env.DB;}
function user(req:Request){return req.headers.get('x-domainradar-user');}
export async function GET(req:Request){const uid=user(req);if(!uid)return Response.json({error:'Sign in to save domains.'},{status:401});try{const r=await database().prepare('SELECT snapshot,checked_at FROM watchlist WHERE user_id=? ORDER BY domain').bind(uid).all<{snapshot:string;checked_at:string}>();return Response.json({records:r.results.map(x=>({...englishRecord(JSON.parse(x.snapshot)),checkedAt:x.checked_at}))});}catch{return Response.json({error:'Your saved watchlist is currently unavailable.'},{status:503});}}
export async function POST(req:Request){const uid=user(req);if(!uid)return Response.json({error:'Sign in to save domains.'},{status:401});try{
const {domain,refresh}=await req.json() as {domain:string;refresh?:boolean};const name=normalizeDomain(domain);
const prev=await database().prepare('SELECT snapshot FROM watchlist WHERE user_id=? AND domain=?').bind(uid,name).first<{snapshot:string}>();
const count=await database().prepare('SELECT COUNT(*) AS n FROM watchlist WHERE user_id=?').bind(uid).first<{n:number}>();
if(!prev&&(count?.n??0)>=100)return Response.json({error:'Your watchlist can contain up to 100 domains.'},{status:400});
if(refresh&&!prev)return Response.json({error:'This domain is not in your watchlist.'},{status:404});
let record:DomainRecord;
try{record=await lookup(name);}catch(e){if(refresh||prev)throw e;record={domain:name,tld:name.split('.').pop()!,status:'Unverified',expiration:null,drop:null,source:'Awaiting a check',sourceUrl:name.endsWith('.sk')?'https://whois.sk-nic.sk/':'https://lookup.icann.org/',checkedAt:new Date().toISOString(),note:(e as Error).message};}
try{record=withReleaseEstimate(record,await scheduledRelease(name,env.DB));}catch{/* An optional catalogue read must not discard a successful registration check. */}
const old=prev?englishRecord(JSON.parse(prev.snapshot)):null;
const changed=!!old&&(['status','expiration','drop','conditionalRelease'] as const).some(k=>old[k]!==record[k]);
if(refresh){
 const updated=await database().prepare('UPDATE watchlist SET snapshot=?,checked_at=? WHERE user_id=? AND domain=?').bind(JSON.stringify(record),record.checkedAt,uid,name).run();
 if(updated.meta.changes===0)return Response.json({error:'This domain was removed while the check was running.'},{status:404});
}else{
 await database().prepare('INSERT INTO watchlist(user_id,domain,snapshot,checked_at) VALUES(?,?,?,?) ON CONFLICT(user_id,domain) DO UPDATE SET snapshot=excluded.snapshot,checked_at=excluded.checked_at').bind(uid,name,JSON.stringify(record),record.checkedAt).run();
}
return Response.json({record:{...record,changed}});
}catch(e){return Response.json({error:(e as Error).message},{status:400});}}
export async function DELETE(req:Request){const uid=user(req);if(!uid)return Response.json({error:'Sign-in is required.'},{status:401});try{const {domain}=await req.json() as {domain:string};await database().prepare('DELETE FROM watchlist WHERE user_id=? AND domain=?').bind(uid,normalizeDomain(domain)).run();return Response.json({ok:true});}catch(e){return Response.json({error:(e as Error).message},{status:400});}}
