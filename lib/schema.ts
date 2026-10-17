import {STATUS_TABLE_SQL} from './status-log.ts';
// Accounts signed in with Google. Email is kept for optional alerts later.
export const USERS_TABLE_SQL = 'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, last_login_at TEXT NOT NULL)';
// Creates the D1 tables on first use, so a fresh database works without running
// `wrangler d1 migrations apply` by hand. Same tables as migrations/0000–0006.
const STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS `watchlist` (`user_id` text NOT NULL, `domain` text NOT NULL, `snapshot` text NOT NULL, `checked_at` text NOT NULL, PRIMARY KEY(`user_id`, `domain`))',
  'CREATE TABLE IF NOT EXISTS `catalog_feeds` (`tld` text PRIMARY KEY NOT NULL, `records` text NOT NULL, `checked_at` text NOT NULL)',
  'CREATE TABLE IF NOT EXISTS `catalog_history` (`domain` text PRIMARY KEY NOT NULL, `tld` text NOT NULL, `release_at` text NOT NULL, `snapshot` text NOT NULL, `checked_at` text NOT NULL)',
  'CREATE INDEX IF NOT EXISTS `catalog_history_release_idx` ON `catalog_history` (`release_at`, `tld`)',
  'CREATE TABLE IF NOT EXISTS catalog_feed_parts (tld TEXT NOT NULL, part INTEGER NOT NULL, records TEXT NOT NULL, PRIMARY KEY (tld, part))',
  STATUS_TABLE_SQL,
  USERS_TABLE_SQL,
  'CREATE TABLE IF NOT EXISTS catalog_preview (tld TEXT PRIMARY KEY, records TEXT NOT NULL, total INTEGER NOT NULL, checked_at TEXT NOT NULL)',
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
