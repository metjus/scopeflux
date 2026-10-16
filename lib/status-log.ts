// A tiny owner-only health log: one row per part of the site (each source feed,
// the cron job, the API) with the last success, the last error and an error
// count. One row is updated per event, so it costs only a few D1 writes an hour.
// Recording never throws: a broken log must not break the site.

export const STATUS_TABLE_SQL =
  'CREATE TABLE IF NOT EXISTS status_log (key TEXT PRIMARY KEY, ok_at TEXT, error_at TEXT, error TEXT, errors INTEGER NOT NULL DEFAULT 0)';

export type StatusRow = {key: string; ok_at: string | null; error_at: string | null; error: string | null; errors: number};

export async function recordOk(db: D1Database | undefined, key: string, at = new Date().toISOString()) {
  if (!db) return;
  try {
    await db.prepare('INSERT INTO status_log (key, ok_at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET ok_at = excluded.ok_at')
      .bind(key, at).run();
  } catch { /* the log is best effort */ }
}

export async function recordError(db: D1Database | undefined, key: string, error: unknown, at = new Date().toISOString()) {
  if (!db) return;
  const message = String((error as Error)?.message ?? error).slice(0, 500);
  try {
    await db.prepare('INSERT INTO status_log (key, error_at, error, errors) VALUES (?, ?, ?, 1) ON CONFLICT(key) DO UPDATE SET error_at = excluded.error_at, error = excluded.error, errors = status_log.errors + 1')
      .bind(key, at, message).run();
  } catch { /* the log is best effort */ }
}

export async function readStatus(db: D1Database): Promise<StatusRow[]> {
  const result = await db.prepare('SELECT key, ok_at, error_at, error, errors FROM status_log ORDER BY key').all<StatusRow>();
  return result.results;
}
