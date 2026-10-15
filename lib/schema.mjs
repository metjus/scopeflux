// The D1 tables, created automatically if they are missing. Same tables as
// migrations/0001_init.sql (a test checks that the two stay identical), so the
// database works even when nobody ran the migration by hand.
// Every statement is safe to repeat ("IF NOT EXISTS").
export const SCHEMA_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS builds (build_id TEXT PRIMARY KEY, market TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, collect_json TEXT)',
  'CREATE INDEX IF NOT EXISTS builds_by_market ON builds (market, started_at)',
  'CREATE TABLE IF NOT EXISTS candidates (build_id TEXT NOT NULL, topic_key TEXT NOT NULL, market TEXT NOT NULL, label TEXT NOT NULL, found_via TEXT NOT NULL, found_at TEXT NOT NULL, status TEXT NOT NULL, result TEXT, PRIMARY KEY (build_id, topic_key))',
  'CREATE INDEX IF NOT EXISTS candidates_pending ON candidates (build_id, status)',
  'CREATE TABLE IF NOT EXISTS rss_listings (geo TEXT NOT NULL, title_norm TEXT NOT NULL, title TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (geo, title_norm, day))',
  'CREATE TABLE IF NOT EXISTS snapshots (market TEXT NOT NULL, built_at TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (market, built_at))',
  'CREATE TABLE IF NOT EXISTS topic_cache (cache_key TEXT PRIMARY KEY, fetched_at TEXT NOT NULL, json TEXT NOT NULL)',
];

// Run once per database binding and Worker instance; later calls return at once.
const ready = new WeakMap();
export function ensureSchema(db) {
  if (!ready.has(db))
    ready.set(
      db,
      db.batch(SCHEMA_STATEMENTS.map(sql => db.prepare(sql))).catch(error => {
        ready.delete(db); // try again next time
        throw error;
      }),
    );
  return ready.get(db);
}
