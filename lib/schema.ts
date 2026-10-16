import {STATUS_TABLE_SQL} from './status-log.ts';
// Creates the D1 tables on first use, so a fresh database works without running
// `wrangler d1 migrations apply` by hand. Same tables as migrations/0000–0004.
const STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS `watchlist` (`user_id` text NOT NULL, `domain` text NOT NULL, `snapshot` text NOT NULL, `checked_at` text NOT NULL, PRIMARY KEY(`user_id`, `domain`))',
  'CREATE TABLE IF NOT EXISTS `catalog_feeds` (`tld` text PRIMARY KEY NOT NULL, `records` text NOT NULL, `checked_at` text NOT NULL)',
  'CREATE TABLE IF NOT EXISTS `catalog_history` (`domain` text PRIMARY KEY NOT NULL, `tld` text NOT NULL, `release_at` text NOT NULL, `snapshot` text NOT NULL, `checked_at` text NOT NULL)',
  'CREATE INDEX IF NOT EXISTS `catalog_history_release_idx` ON `catalog_history` (`release_at`, `tld`)',
  'CREATE TABLE IF NOT EXISTS catalog_feed_parts (tld TEXT NOT NULL, part INTEGER NOT NULL, records TEXT NOT NULL, PRIMARY KEY (tld, part))',
  STATUS_TABLE_SQL,
];

// Once per Worker instance; a failure is retried on the next request.
let ready: Promise<void> | null = null;

export function ensureSchema(db: D1Database | undefined): Promise<void> {
  if (!db) return Promise.resolve();
  ready ??= db.batch(STATEMENTS.map(sql => db.prepare(sql))).then(
    () => undefined,
    error => {
      ready = null;
      throw error;
    },
  );
  return ready;
}
