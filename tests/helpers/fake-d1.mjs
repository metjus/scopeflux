// A tiny stand-in for Cloudflare D1, backed by Node's built-in SQLite, so the
// pipeline can be tested with the real migration and real SQL.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// empty: true starts without any tables (as if nobody ran the migration).
export function createFakeD1({ empty = false } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  if (!empty) sqlite.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => sqlite.prepare(sql).run(...params),
    _run: () => sqlite.prepare(sql).run(...params),
  });
  return {
    prepare: sql => statement(sql),
    batch: async statements => statements.map(s => s._run()),
    sqlite,
  };
}
