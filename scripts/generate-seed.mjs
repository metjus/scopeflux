// Rebuild the initial SQL seed from the included public snapshots. Never reads account data.
import {readFile, writeFile} from 'node:fs/promises';
import {feedParts} from '../lib/catalog-store.ts';
const root = new URL('../data/', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const [catalogue, history, state] = await Promise.all(['catalogue.json', 'history.json', 'preview-state.json'].map(read));
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const compact = value => JSON.stringify(value);
const lines = ['-- Public initial snapshots only. Import after migrations; never includes personal watchlists.',
  'DROP TABLE IF EXISTS domainradar_seed_stage;',
  'CREATE TABLE domainradar_seed_stage(tld TEXT NOT NULL,part INTEGER NOT NULL,records TEXT NOT NULL,checked_at TEXT NOT NULL,PRIMARY KEY(tld,part));'];
const feeds = catalogue.feeds.map(feed => ({tld: feed.tld, checkedAt: feed.checkedAt, records: catalogue.records.filter(record => record.tld === feed.tld)}));
for (const feed of state.historyFeeds) {
  const records = history.records.filter(record => record.tld === feed.tld && record.reportedDrop?.checkedAt === feed.checkedAt);
  if (records.length !== feed.count) throw new Error('Cannot reproduce latest public history snapshot: ' + feed.tld);
  feeds.push({tld: 'history:' + feed.tld, checkedAt: feed.checkedAt, records});
}
for (const feed of feeds) {
  for (const [part, records] of feedParts(feed.records).entries()) {
    lines.push(`INSERT INTO domainradar_seed_stage VALUES(${q(feed.tld)},${part},'',${q(feed.checkedAt)});`);
    const json = compact(records);
    for (let offset = 0; offset < json.length; offset += 20000) lines.push(`UPDATE domainradar_seed_stage SET records=records||${q(json.slice(offset, offset + 20000))} WHERE tld=${q(feed.tld)} AND part=${part};`);
  }
}
lines.push(`DELETE FROM catalog_feed_parts WHERE tld IN (SELECT s.tld FROM domainradar_seed_stage s LEFT JOIN catalog_feeds c ON c.tld=s.tld WHERE c.checked_at IS NULL OR s.checked_at>=c.checked_at);`);
lines.push(`INSERT INTO catalog_feed_parts(tld,part,records) SELECT s.tld,s.part,s.records FROM domainradar_seed_stage s LEFT JOIN catalog_feeds c ON c.tld=s.tld WHERE s.part>0 AND (c.checked_at IS NULL OR s.checked_at>=c.checked_at) ON CONFLICT(tld,part) DO UPDATE SET records=excluded.records;`);
lines.push(`INSERT INTO catalog_feeds(tld,records,checked_at) SELECT tld,records,checked_at FROM domainradar_seed_stage WHERE part=0 ON CONFLICT(tld) DO UPDATE SET records=excluded.records,checked_at=excluded.checked_at WHERE excluded.checked_at>=catalog_feeds.checked_at;`);
const all = new Map();
for (const record of [...catalogue.records, ...history.records]) {
  const release = record.reportedDrop?.at || record.drop;
  if (!release) continue;
  const prior = all.get(record.domain);
  if (!prior || (!prior.reportedDrop || record.reportedDrop) && record.checkedAt > prior.checkedAt) all.set(record.domain, record);
}
const rows = [...all.values()].map(record => `(${[record.domain, record.tld, record.reportedDrop?.at || record.drop, compact(record), record.checkedAt].map(q).join(',')})`);
for (let index = 0; index < rows.length; index += 40) lines.push('INSERT INTO catalog_history(domain,tld,release_at,snapshot,checked_at) VALUES' + rows.slice(index, index + 40).join(',') + ' ON CONFLICT(domain) DO UPDATE SET tld=excluded.tld,release_at=excluded.release_at,snapshot=excluded.snapshot,checked_at=excluded.checked_at WHERE excluded.checked_at>catalog_history.checked_at AND (json_extract(catalog_history.snapshot,\'$.reportedDrop\') IS NULL OR json_extract(excluded.snapshot,\'$.reportedDrop\') IS NOT NULL);');
lines.push('DROP TABLE domainradar_seed_stage;');
for (const line of lines) if (Buffer.byteLength(line) >= 100000) throw new Error('Seed statement exceeds the D1 SQL size limit.');
await writeFile(new URL('catalog-seed.sql', root), lines.join('\n') + '\n');
const manifest = {exportedAt: new Date().toISOString(), upcomingRecords: catalogue.records.length, historicalRecords: history.records.length, tlds: catalogue.feeds.map(feed => feed.tld), sources: feeds.map(({tld,checkedAt,records}) => ({tld,checkedAt,count:records.length})), personalWatchlistsIncluded: false};
await writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({upcoming: catalogue.records.length, history: history.records.length, sqlStatements: lines.length, largestStatementBytes: Math.max(...lines.map(line => Buffer.byteLength(line)))}));
