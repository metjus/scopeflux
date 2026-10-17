import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {STATUS_TABLE_SQL, recordOk, recordError, readStatus} from '../lib/status-log.ts';
import {isStatusRequest, statusResponse, renderStatus} from '../lib/status-page.ts';

function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(STATUS_TABLE_SQL);
  const prepare = sql => {
    let values = [];
    return {
      bind(...args) {values = args; return this;},
      async run() {sqlite.prepare(sql).run(...values); return {};},
      async all() {return {results: sqlite.prepare(sql).all(...values)};},
    };
  };
  return {prepare};
}
const basic = password => ({Authorization: 'Basic ' + btoa('owner:' + password)});

test('the status page exists only on the workers.dev address', () => {
  assert.equal(isStatusRequest(new URL('https://scopeflux.example.workers.dev/status')), true);
  assert.equal(isStatusRequest(new URL('https://scopeflux.io/status')), false);
  assert.equal(isStatusRequest(new URL('https://scopeflux.example.workers.dev/')), false);
});

test('without the STATUS_PASSWORD secret the page does not exist; a wrong password is refused', async () => {
  const request = new Request('https://x.workers.dev/status', {headers: basic('secret')});
  assert.equal((await statusResponse(request, {})).status, 404);
  const wrong = await statusResponse(new Request('https://x.workers.dev/status', {headers: basic('nope')}), {STATUS_PASSWORD: 'secret'});
  assert.equal(wrong.status, 401);
  assert.match(wrong.headers.get('WWW-Authenticate'), /Basic/);
  assert.equal((await statusResponse(new Request('https://x.workers.dev/status'), {STATUS_PASSWORD: 'secret'})).status, 401);
});

test('successes and errors are recorded per part and shown, escaped, to the owner', async () => {
  const db = sqliteD1();
  await recordOk(db, 'feed:cz', '2026-10-16T10:00:00.000Z');
  await recordError(db, 'feed:cz', new Error('HTTP 403 <blocked>'), '2026-10-16T11:00:00.000Z');
  await recordError(db, 'feed:cz', new Error('HTTP 403 <blocked>'), '2026-10-16T11:30:00.000Z');
  await recordOk(db, 'cron', '2026-10-16T11:10:00.000Z');
  const rows = await readStatus(db);
  assert.deepEqual(rows.map(r => [r.key, r.errors]), [['cron', 0], ['feed:cz', 2]]);
  const response = await statusResponse(new Request('https://x.workers.dev/status', {headers: basic('secret')}), {DB: db, STATUS_PASSWORD: 'secret'}, Date.parse('2026-10-16T12:00:00Z'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const html = await response.text();
  assert.match(html, /List \.cz/);
  assert.match(html, /Failing/);
  assert.match(html, /HTTP 403 &lt;blocked&gt;/);
  assert.doesNotMatch(html, /<blocked>/);
  assert.match(html, /Hourly cron job/);
});

test('a broken database never breaks recording, and an empty log says so', async () => {
  const broken = {prepare() {throw new Error('D1 limit');}};
  await recordOk(broken, 'cron');
  await recordError(broken, 'cron', new Error('x'));
  assert.match(renderStatus([], ''), /Nothing recorded yet/);
});

test('passwords with diacritics and copy-paste spaces are accepted', async () => {
  const utf8 = text => 'Basic ' + Buffer.from(text, 'utf8').toString('base64');
  const ok = async (header, secret) => (await statusResponse(new Request('https://x.workers.dev/status', {headers: {Authorization: header}}), {STATUS_PASSWORD: secret})).status;
  assert.equal(await ok(utf8('owner:Žltý kôň 2026'), 'Žltý kôň 2026'), 200);
  assert.equal(await ok(utf8('anything:secret'), ' secret \n'), 200);
  assert.equal(await ok(utf8('owner:Zlty kon 2026'), 'Žltý kôň 2026'), 401);
});
