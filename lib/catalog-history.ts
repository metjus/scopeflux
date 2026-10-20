import {readSavedFeed,feedParts} from './catalog-store.ts';
import type {DomainRecord} from './domains';
import {isRecentDate,releaseTimestamp} from './release-time.ts';
import {historicalDate} from './public-history.ts';

// Keep estimates after they leave live feeds. A reported deletion has stronger historical provenance.
const ARCHIVE_SQL=`INSERT INTO catalog_history(domain,tld,release_at,snapshot,checked_at)
 SELECT json_extract(value,'$.domain'),json_extract(value,'$.tld'),COALESCE(json_extract(value,'$.reportedDrop.at'),json_extract(value,'$.drop')),value,json_extract(value,'$.checkedAt') FROM json_each(?)
 WHERE COALESCE(json_extract(value,'$.reportedDrop.at'),json_extract(value,'$.drop')) IS NOT NULL
 ON CONFLICT(domain) DO UPDATE SET tld=excluded.tld,release_at=excluded.release_at,snapshot=excluded.snapshot,checked_at=excluded.checked_at
 WHERE excluded.checked_at>catalog_history.checked_at
 AND (json_extract(catalog_history.snapshot,'$.reportedDrop') IS NULL OR json_extract(excluded.snapshot,'$.reportedDrop') IS NOT NULL)
 AND (excluded.release_at<>catalog_history.release_at OR (json_extract(catalog_history.snapshot,'$.reportedDrop') IS NULL)<>(json_extract(excluded.snapshot,'$.reportedDrop') IS NULL))`;
// D1's free plan allows 100,000 written rows a day, and a refresh sees ~15,000
// listings. Only listings whose release is in the last 31 days or the next few
// hours go to the archive, and an archived row is only rewritten when its date
// changes, so each domain is written about once instead of on every refresh.
const ARCHIVE_AHEAD_MS=3*3600000,ARCHIVE_BEHIND_MS=31*86400000;
export function dueForArchive(records:DomainRecord[],now=Date.now()){
 return records.filter(r=>{const at=releaseTimestamp(r.reportedDrop?.at??r.drop);return Number.isFinite(at)&&at<=now+ARCHIVE_AHEAD_MS&&at>=now-ARCHIVE_BEHIND_MS;});
}
// Archive statements for the due listings (none when nothing is due).
export function archiveDue(db:D1Database,records:DomainRecord[],now=Date.now()){
 const due=dueForArchive(records,now);
 return due.length?feedParts(due).map(part=>archiveStatement(db,part)):[];
}
export function archiveStatement(db:D1Database,records:DomainRecord[]){return db.prepare(ARCHIVE_SQL).bind(JSON.stringify(records));}
export function snapshotStatement(db:D1Database,tld:string,records:DomainRecord[],checkedAt:string){return db.prepare('INSERT INTO catalog_feeds(tld,records,checked_at) VALUES(?,?,?) ON CONFLICT(tld) DO UPDATE SET records=excluded.records,checked_at=excluded.checked_at').bind(tld,JSON.stringify(records),checkedAt);}
// A small copy of the soonest releases per extension. The home page renders it
// into the HTML without parsing whole feeds (the free plan allows ~10 ms CPU).
export const PREVIEW_SIZE=30;
export function previewStatement(db:D1Database,tld:string,records:DomainRecord[],checkedAt:string){
 const soon=records.filter(r=>Number.isFinite(releaseTimestamp(r.drop))).sort((a,b)=>releaseTimestamp(a.drop)-releaseTimestamp(b.drop)).slice(0,PREVIEW_SIZE);
 return db.prepare('INSERT INTO catalog_preview(tld,records,total,checked_at) VALUES(?,?,?,?) ON CONFLICT(tld) DO UPDATE SET records=excluded.records,total=excluded.total,checked_at=excluded.checked_at').bind(tld,JSON.stringify(soon),records.length,checkedAt);
}
export async function saveCatalogFeed(db:D1Database,tld:string,records:DomainRecord[],checkedAt:string,observed=records){
 const previous=await readSavedFeed(db,tld);
 // An overlapping older refresh must never replace a newer saved snapshot.
 if(previous && previous.checked_at>checkedAt)return;
 const statements=[];
 if(previous)statements.push(...archiveDue(db,JSON.parse(previous.records)));
 statements.push(...archiveDue(db,observed));
 const parts=feedParts(records);
 statements.push(snapshotStatement(db,tld,parts[0],checkedAt));
 statements.push(previewStatement(db,tld,records,checkedAt));
 statements.push(db.prepare('DELETE FROM catalog_feed_parts WHERE tld=?').bind(tld));
 parts.slice(1).forEach((part,index)=>statements.push(db.prepare('INSERT INTO catalog_feed_parts(tld,part,records) VALUES(?,?,?)').bind(tld,index+1,JSON.stringify(part))));
 await db.batch(statements);
}
export function isRecentRelease(record:DomainRecord,now=Date.now(),days=7){
 return isRecentDate(historicalDate(record),now,days);
}
export async function recentCatalog(db:D1Database,tlds:string[],now=Date.now(),limit?:number){
 await db.prepare('DELETE FROM catalog_history WHERE release_at<?').bind(new Date(now-31*86400000).toISOString().slice(0,10)).run();
 if(!tlds.length)return {records:[],historyDays:7,historyTotal:0};
 const from=new Date(now-7*86400000).toISOString().slice(0,10),until=new Date(now).toISOString();
 const result=await db.prepare(`SELECT snapshot FROM catalog_history WHERE tld IN (${tlds.map(()=>'?').join(',')}) AND release_at>=? AND release_at<? ORDER BY release_at DESC${limit?' LIMIT '+Math.floor(limit):''}`).bind(...tlds,from,until).all<{snapshot:string}>();
 const records=result.results.map(row=>JSON.parse(row.snapshot) as DomainRecord).filter(r=>isRecentRelease(r,now)).map(r=>r.reportedDrop?r:({...r,status:'Release estimate passed',note:'This source-listed release date has passed. This historical observation does not confirm current registration status or availability. Open the domain details for a fresh check.'}));
 return {records,historyDays:30,historyTotal:records.length};
}
