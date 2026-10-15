import type {DomainRecord} from './domains';
export const MAX_FEED_PART_BYTES = 500_000;
/** D1 has a 2 MB row limit. Keep every JSON binding comfortably below it. */
export function feedParts(records: DomainRecord[]): DomainRecord[][] {
  const parts: DomainRecord[][] = [];
  let current: DomainRecord[] = [], bytes = 2;
  for (const record of records) {
    const size = new TextEncoder().encode(JSON.stringify(record)).length + 1;
    if (size > MAX_FEED_PART_BYTES) throw new Error('Source record exceeds the safe storage limit.');
    if (current.length && bytes + size > MAX_FEED_PART_BYTES) {parts.push(current); current = []; bytes = 2;}
    current.push(record); bytes += size;
  }
  parts.push(current);
  return parts;
}
export async function readSavedFeed(db: D1Database, tld: string) {
  const row = await db.prepare('SELECT tld,records,checked_at FROM catalog_feeds WHERE tld=?').bind(tld).first<{tld: string; records: string; checked_at: string}>();
  if (!row) return null;
  const extra = await db.prepare('SELECT records FROM catalog_feed_parts WHERE tld=? ORDER BY part').bind(tld).all<{records: string}>();
  if (extra.results.length) row.records = JSON.stringify([...(JSON.parse(row.records) as DomainRecord[]), ...extra.results.flatMap(part => JSON.parse(part.records) as DomainRecord[])]);
  return row;
}
export async function readSavedFeeds(db: D1Database, tlds: string[]) {
  if (!tlds.length) return [];
  const placeholders = tlds.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT tld,records,checked_at FROM catalog_feeds WHERE tld IN (${placeholders})`).bind(...tlds).all<{tld: string; records: string; checked_at: string}>();
  const extra = await db.prepare(`SELECT tld,records FROM catalog_feed_parts WHERE tld IN (${placeholders}) ORDER BY part`).bind(...tlds).all<{tld: string; records: string}>();
  return rows.results.map(row => {
    const parts = extra.results.filter(part => part.tld === row.tld);
    return parts.length ? {...row, records: JSON.stringify([...(JSON.parse(row.records) as DomainRecord[]), ...parts.flatMap(part => JSON.parse(part.records) as DomainRecord[])])} : row;
  });
}
