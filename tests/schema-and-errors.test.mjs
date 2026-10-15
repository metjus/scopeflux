import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {ensureSchema} from '../lib/schema.ts';
import {publicFeedError} from '../lib/catalog.ts';

// Minimal D1 stand-in over node:sqlite: enough for prepare() + batch().
function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  return {
    sqlite,
    prepare: sql => ({sql}),
    batch: async statements => statements.map(s => sqlite.exec(s.sql)),
  };
}

test('a fresh database gets every table the migrations create, and a second call is harmless', async () => {
  const db = sqliteD1();
  await ensureSchema(db);
  await ensureSchema(db);
  const tables = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  assert.deepEqual(tables, ['catalog_feed_parts', 'catalog_feeds', 'catalog_history', 'catalog_history_release_idx', 'watchlist']);
});

test('visitors see a plain sentence, not a raw fetch error', () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(publicFeedError(new TypeError('internal error; reference = 9mhj8lq9m4vcdhh5f604djv1')), 'The source could not be reached right now.');
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    assert.equal(publicFeedError(timeout), 'The source did not answer in time.');
  } finally {
    console.error = quiet;
  }
});
