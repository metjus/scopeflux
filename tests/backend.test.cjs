const {test} = require('node:test');
const assert = require('node:assert/strict');
const {env, createDatabase} = require('./helpers/runtime.cjs');
const catalog = require('../lib/catalog.ts');
const history = require('../lib/catalog-history.ts');
const domains = require('../lib/domains.ts');
const routes = require('../app/api/domains/route.ts');
const watchlist = require('../app/api/watchlist/route.ts');

env.CATALOG_REFRESH_TOKEN = 'test-refresh-secret-'.repeat(3);
const day = 86400000;
const stamp = () => new Date().toISOString();
function record(domain, drop, checkedAt = stamp()) {
  const tld = domain.split('.').at(-1);
  return {domain, tld, drop, checkedAt, expiration: null, status: 'Expected release', source: 'Backorder.com', sourceUrl: 'https://backorder.com/en/pending-delete/' + tld};
}
const request = (url, user, body, method = 'POST') => new Request('https://site.test' + url, {
  method, headers: {Authorization: 'Bearer ' + env.CATALOG_REFRESH_TOKEN, ...(user ? {'x-domainradar-user': user} : {}), 'Content-Type': 'application/json'},
  ...(body ? {body: JSON.stringify(body)} : {}),
});

test('all catalogue TLD routes, history and filters work with real SQLite storage, without querying external sources for history', async () => {
  env.DB = createDatabase();
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {calls++; throw new Error('Source unavailable');};
  try {
    for (const tld of catalog.CATALOG_TLDS) {
      const upcoming = record('upcoming.' + tld, new Date(Date.now() + day).toISOString());
      const old = record('previous.' + tld, new Date(Date.now() - 10 * day).toISOString());
      await history.saveCatalogFeed(env.DB, tld, [upcoming], upcoming.checkedAt, [old, upcoming]);
    }
    for (const tld of catalog.CATALOG_TLDS) {
      const response = await routes.GET(new Request('https://site.test/api/domains?tlds=' + tld));
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual(data.records.map(row => row.tld), [tld]);
    }
    const recentResponse = await routes.GET(new Request('https://site.test/api/domains?view=recent'));
    const recent = await recentResponse.json();
    assert.equal(recentResponse.status, 200);
    assert.equal(recent.records.length, catalog.CATALOG_TLDS.length);
    assert.ok(recent.records.every(row => row.status === 'Release estimate passed'));
    const selected = await (await routes.GET(new Request('https://site.test/api/domains?view=recent&tlds=.SK,com'))).json();
    assert.deepEqual(new Set(selected.records.map(row => row.tld)), new Set(['sk', 'com']));
    assert.equal(calls, 0);
    assert.equal((await routes.GET(new Request('https://site.test/api/domains?tlds=unknown'))).status, 400);
    assert.equal((await routes.GET(new Request('https://site.test/api/domains?domain=bad.com/path'))).status, 400);
  } finally {global.fetch = originalFetch; env.DB.close();}
});

test('a failed source retains its saved snapshot and original retrieval timestamp', async () => {
  env.DB = createDatabase();
  const oldStamp = new Date(Date.now() - 2 * 3600000).toISOString();
  const row = record('retained.com', new Date(Date.now() + day).toISOString(), oldStamp);
  await history.saveCatalogFeed(env.DB, 'com', [row], oldStamp);
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('Blocked', {status: 403});
  try {
    const result = await catalog.upcomingCatalog(['com'], 1, env.DB);
    assert.equal(result.records[0].domain, 'retained.com');
    assert.equal(result.feeds[0].checkedAt, oldStamp);
    assert.equal(result.feeds[0].stored, true);
    assert.match(result.feeds[0].refreshError, /403/);
    const stored = await env.DB.prepare('SELECT checked_at FROM catalog_feeds WHERE tld=?').bind('com').first();
    assert.equal(stored.checked_at, oldStamp);
    const recent = await catalog.recentReleaseCatalog(env.DB, ['com']);
    assert.equal(recent.records.length, 0);
  } finally {global.fetch = originalFetch; env.DB.close();}
});

test('timestamp release moves to history while a source snapshot is still fresh', async () => {
  env.DB = createDatabase();
  const originalNow = Date.now;
  const now = originalNow();
  const row = record('transition.com', new Date(now + 60000).toISOString());
  await history.saveCatalogFeed(env.DB, 'com', [row], row.checkedAt);
  try {
    assert.equal((await catalog.upcomingCatalog(['com'], 1, env.DB)).records.length, 1);
    Date.now = () => now + 120000;
    assert.equal((await catalog.upcomingCatalog(['com'], 1, env.DB)).records.length, 0);
    assert.equal((await catalog.recentReleaseCatalog(env.DB, ['com'])).records[0].domain, 'transition.com');
  } finally {Date.now = originalNow; env.DB.close();}
});

test('history retains latest observations, excludes future and older-than-30-day dates, and keeps original attribution', async () => {
  env.DB = createDatabase();
  const now = Date.now();
  const rows = [-35, -29, -8, -1, 1].map((offset, i) => record('history' + i + '.eu', new Date(now + offset * day).toISOString()));
  await env.DB.batch([history.archiveStatement(env.DB, rows)]);
  const result = await history.recentCatalog(env.DB, ['eu'], now);
  assert.equal(result.records.length, 3);
  assert.deepEqual(result.records.map(row => row.domain), ['history3.eu', 'history2.eu', 'history1.eu']);
  assert.equal(result.records[0].sourceUrl, rows[3].sourceUrl);
  assert.equal(result.records[0].checkedAt, rows[3].checkedAt);
  assert.equal((await history.recentCatalog(env.DB, ['ai'], now)).records.length, 0);
  env.DB.close();
});

test('watchlist authentication, user isolation, save, changed refresh, failed updates and delete', async () => {
  env.DB = createDatabase();
  const originalLookup = domains.lookup, originalSchedule = catalog.scheduledRelease;
  let expiry = '2030-11-23', fail = false;
  domains.lookup = async name => {
    if (fail) throw new Error('Source unavailable');
    return {...record(name, null), status: 'Registered', expiration: expiry};
  };
  catalog.scheduledRelease = async () => null;
  try {
    assert.equal((await watchlist.GET(request('/api/watchlist', null, null, 'GET'))).status, 401);
    assert.equal((await watchlist.POST(request('/api/watchlist', null, {domain: 'example.photography'}))).status, 401);
    assert.equal((await watchlist.DELETE(request('/api/watchlist', null, {domain: 'example.photography'}, 'DELETE'))).status, 401);
    assert.equal((await watchlist.POST(request('/api/watchlist', 'alice', {domain: 'example.photography'}))).status, 200);
    assert.equal((await (await watchlist.GET(request('/api/watchlist', 'bob', null, 'GET'))).json()).records.length, 0);
    await watchlist.DELETE(request('/api/watchlist', 'bob', {domain: 'example.photography'}, 'DELETE'));
    expiry = '2031-11-23';
    const updated = await (await watchlist.POST(request('/api/watchlist', 'alice', {domain: 'example.photography', refresh: true}))).json();
    assert.equal(updated.record.changed, true);
    fail = true;
    assert.equal((await watchlist.POST(request('/api/watchlist', 'alice', {domain: 'example.photography', refresh: true}))).status, 400);
    assert.equal((await watchlist.POST(request('/api/watchlist', 'alice', {domain: 'example.photography'}))).status, 400);
    const saved = await (await watchlist.GET(request('/api/watchlist', 'alice', null, 'GET'))).json();
    assert.equal(saved.records.length, 1);
    assert.equal(saved.records[0].expiration, '2031-11-23');
    await watchlist.DELETE(request('/api/watchlist', 'alice', {domain: 'example.photography'}, 'DELETE'));
    assert.equal((await (await watchlist.GET(request('/api/watchlist', 'alice', null, 'GET'))).json()).records.length, 0);
  } finally {domains.lookup = originalLookup; catalog.scheduledRelease = originalSchedule; env.DB.close();}
});

test('parsers preserve public source dates, suffixes and timestamps and skip malformed dates', () => {
  const checkedAt = stamp();
  const country = '<table><tbody><tr><td>cloud.ai</td><td>info</td><td>2026-11-10</td></tr><tr><td>wrong.eu</td><td>info</td><td>2026-11-10</td></tr><tr><td>bad.ai</td><td>info</td><td>2026-02-30</td></tr></tbody></table>';
  const parsed = catalog.parseCountryDrops(country, 'ai', checkedAt);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].drop, '2026-11-10');
  assert.equal(parsed[0].checkedAt, checkedAt);
  const sk = catalog.parseSkDrops('<li><a href="/domena/cloud.sk">cloud.sk</a><span>15.11.2026</span></li>', checkedAt);
  assert.equal(sk[0].drop, '2026-11-15');
  const timestamp = Date.parse('2026-11-15T11:45:00Z');
  const nuxt = '<script id="__NUXT_DATA__">' + JSON.stringify(['cloud.com', timestamp, {backorder_id: 4, name: 0, end_time_stamp: 1}]) + '</script>';
  assert.equal(catalog.parseDynadot(nuxt, 'com', checkedAt)[0].drop, '2026-11-15T11:45:00.000Z');
  assert.equal(catalog.parseDynadot(nuxt, 'net', checkedAt).length, 0);
});

test('saved catalogue opens every extension without external requests; individual checks reuse the original release observation', async () => {
  env.DB = createDatabase();
  const originalFetch = global.fetch, originalLookup = domains.lookup;
  let calls = 0;
  global.fetch = async () => {calls++; throw new Error('Offline');};
  try {
    const checkedAt = new Date(Date.now() - 3600000).toISOString();
    for (const tld of catalog.CATALOG_TLDS) await history.saveCatalogFeed(env.DB, tld, [record('saved.' + tld, new Date(Date.now() + day).toISOString(), checkedAt)], checkedAt);
    const cached = await (await routes.GET(new Request('https://site.test/api/domains?cached=1'))).json();
    assert.equal(cached.records.length, catalog.CATALOG_TLDS.length);
    assert.equal(calls, 0);
    assert.ok(cached.records.every(row => row.checkedAt === checkedAt));
    const selected = await (await routes.GET(new Request('https://site.test/api/domains?cached=1&tlds=org'))).json();
    assert.deepEqual(selected.records.map(row => row.tld), ['org']);
    domains.lookup = async name => ({...record(name, null), status: 'Registered', expiration: '2034-11-23'});
    const checked = await (await routes.GET(new Request('https://site.test/api/domains?domain=saved.sk'))).json();
    assert.equal(checked.record.expiration, '2034-11-23');
    assert.ok(checked.record.drop);
    assert.equal(checked.record.availabilityCheckedAt, checkedAt);
    domains.lookup = async () => {throw new Error('Registry unavailable (503).');};
    const fallbackResponse = await routes.GET(new Request('https://site.test/api/domains?domain=saved.sk'));
    const fallback = await fallbackResponse.json();
    assert.equal(fallbackResponse.status, 200);
    assert.equal(fallback.record.status, 'Unverified');
    assert.equal(fallback.record.checkedAt, checkedAt);
    assert.match(fallback.record.checkError, /503/);
    assert.ok(fallback.record.drop);
    const unknown = await (await routes.GET(new Request('https://site.test/api/domains?domain=example.photography'))).json();
    assert.equal(unknown.record.drop, null);
    assert.equal(unknown.record.expiration, null);
    assert.equal(unknown.record.status, 'Unverified');
    assert.match(unknown.record.sourceUrl, /\/photography.html$/);
    assert.equal(calls, 0);
  } finally {global.fetch = originalFetch; domains.lookup = originalLookup; env.DB.close();}
});

test('a background watchlist refresh cannot resurrect a domain deleted while the registry request is pending', async () => {
  env.DB = createDatabase();
  const originalLookup = domains.lookup;
  let finishCheck;
  let signalStarted;
  const started = new Promise(resolve => {signalStarted = resolve;});
  domains.lookup = async name => ({...record(name, null), status: 'Registered', expiration: '2031-10-15'});
  try {
    assert.equal((await watchlist.POST(request('/api/watchlist', 'alice', {domain: 'remove.com'}))).status, 200);
    domains.lookup = async name => {signalStarted(); return new Promise(resolve => {finishCheck = () => resolve({...record(name, null), status: 'Registered', expiration: '2032-10-15'});});};
    const refresh = watchlist.POST(request('/api/watchlist', 'alice', {domain: 'remove.com', refresh: true}));
    await started;
    assert.equal((await watchlist.DELETE(request('/api/watchlist', 'alice', {domain: 'remove.com'}, 'DELETE'))).status, 200);
    finishCheck();
    assert.equal((await refresh).status, 404);
    assert.equal((await (await watchlist.GET(request('/api/watchlist', 'alice', null, 'GET'))).json()).records.length, 0);
  } finally {domains.lookup = originalLookup; env.DB.close();}
});


test('one request refreshes at most MAX_REFRESH feeds, oldest first, and shows saved data for the rest', async () => {
  env.DB = createDatabase();
  const originalFetch = global.fetch;
  const fetched = [];
  global.fetch = async url => {fetched.push(String(url)); throw new Error('Source unavailable');};
  try {
    const old = new Date(Date.now() - 2 * 3600000).toISOString();
    const older = new Date(Date.now() - 5 * 3600000).toISOString();
    for (const tld of catalog.CATALOG_TLDS) {
      const checkedAt = tld === 'xyz' || tld === 'tv' ? older : old;
      await history.saveCatalogFeed(env.DB, tld, [record('saved.' + tld, new Date(Date.now() + day).toISOString(), checkedAt)], checkedAt);
    }
    const result = await catalog.upcomingCatalog(catalog.CATALOG_TLDS, 1, env.DB);
    assert.ok(fetched.length <= catalog.MAX_REFRESH, 'fetched ' + fetched.length);
    assert.ok(fetched.some(url => url.includes('=xyz')) && fetched.some(url => url.includes('=tv')));
    assert.equal(result.feeds.length, catalog.CATALOG_TLDS.length);
    assert.deepEqual(new Set(result.records.map(row => row.tld)), new Set(catalog.CATALOG_TLDS));
  } finally {
    global.fetch = originalFetch;
  }
});

test('the home page HTML reads only the small preview rows, not whole feeds', async () => {
  env.DB = createDatabase();
  const {initialCatalogue} = require('../lib/initial-catalog.ts');
  const many = Array.from({length: 80}, (_, i) => record('name' + i + '.sk', new Date(Date.now() + (i % 10 + 1) * 3600000).toISOString()));
  await history.saveCatalogFeed(env.DB, 'sk', many, stamp());
  const preview = await env.DB.prepare('SELECT records,total FROM catalog_preview WHERE tld=?').bind('sk').first();
  assert.equal(JSON.parse(preview.records).length, history.PREVIEW_SIZE);
  assert.equal(preview.total, 80);
  const reads = [];
  const spy = {prepare(sql) {reads.push(sql); return env.DB.prepare(sql);}};
  const initial = await initialCatalogue(spy);
  assert.equal(initial.records.length, history.PREVIEW_SIZE);
  assert.equal(initial.feeds[0].loaded, 80);
  assert.ok(reads.every(sql => !/catalog_feeds|catalog_feed_parts/.test(sql)), reads.join('; '));
});

test('without a chosen extension the API returns the cheap preview, and at most two extensions load at once', async () => {
  env.DB = createDatabase();
  for (const tld of ['sk', 'com', 'io']) await history.saveCatalogFeed(env.DB, tld, [record('soon.' + tld, new Date(Date.now() + day).toISOString())], stamp());
  const preview = await (await routes.GET(new Request('https://site.test/api/domains'))).json();
  assert.deepEqual(new Set(preview.records.map(row => row.tld)), new Set(['sk', 'com', 'io']));
  const tooMany = await routes.GET(new Request('https://site.test/api/domains?cached=1&tlds=sk,com,io'));
  assert.equal(tooMany.status, 400);
  assert.match((await tooMany.json()).error, /up to 2 extensions/);
  const two = await (await routes.GET(new Request('https://site.test/api/domains?cached=1&tlds=sk,com'))).json();
  assert.deepEqual(new Set(two.records.map(row => row.tld)), new Set(['sk', 'com']));
});
