const {test} = require('node:test');
const assert = require('node:assert/strict');
const {env, createDatabase} = require('./helpers/runtime.cjs');
const catalog = require('../lib/catalog.ts');
const history = require('../lib/catalog-history.ts');
const domains = require('../lib/domains.ts');
const routes = require('../app/api/domains/route.ts');
const cacheRoute = require('../app/api/catalog-cache/route.ts');
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
    assert.equal(recent.records.length, 8);
    assert.ok(recent.records.every(row => row.status === 'Release estimate passed'));
    const selected = await (await routes.GET(new Request('https://site.test/api/domains?view=recent&tlds=.AI,eu'))).json();
    assert.deepEqual(new Set(selected.records.map(row => row.tld)), new Set(['ai', 'eu']));
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

test('public preview writer validates real calendar dates and retrieval timestamps before modifying any snapshot', async () => {
  env.DB = createDatabase();
  const checkedAt = stamp();
  const row = record('preview.ai', new Date(Date.now() + day).toISOString().slice(0, 10), checkedAt);
  const payload = {feeds: [{tld: 'ai', records: [row], checkedAt}]};
  assert.equal((await cacheRoute.POST(request('/api/catalog-cache', null, payload))).status, 200);
  const readback = await (await cacheRoute.GET(request('/api/catalog-cache', null, null, 'GET'))).json();
  assert.deepEqual(readback.feeds, [{tld: 'ai', checkedAt, count: 1}]);
  for (const changed of [{drop: '2026-02-30'}, {sourceUrl: 'https://wrong.test'}, {checkedAt: '2000-01-01T00:00:00Z'}, {domain: 'invalid-.ai'}]) {
    const bad = {feeds: [{tld: 'ai', records: [{...row, ...changed}], checkedAt}]};
    assert.equal((await cacheRoute.POST(request('/api/catalog-cache', null, bad))).status, 400);
  }
  assert.equal((await (await cacheRoute.GET(request('/api/catalog-cache', null, null, 'GET'))).json()).feeds[0].checkedAt, checkedAt);
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

test('externally refreshed .ai/.eu snapshots avoid blocked Worker requests and retain timestamps; overdue refresh is visible', async () => {
  env.DB = createDatabase();
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {calls++; return new Response('Blocked', {status: 403});};
  try {
    for (const [tld, hours] of [['ai', 1], ['eu', 3]]) {
      const checkedAt = new Date(Date.now() - hours * 3600000).toISOString();
      const value = record('saved.' + tld, new Date(Date.now() + day).toISOString(), checkedAt);
      await history.saveCatalogFeed(env.DB, tld, [value], checkedAt);
      const result = await catalog.upcomingCatalog([tld], 1, env.DB);
      assert.equal(result.records.length, 1);
      assert.equal(result.feeds[0].checkedAt, checkedAt);
      if (hours === 1) assert.equal(result.feeds[0].refreshError, undefined);
      else assert.match(result.feeds[0].refreshError, /overdue/);
    }
    assert.equal(calls, 0);
  } finally {global.fetch = originalFetch; env.DB.close();}
});

test('public deletion previews persist into recent API with TLD filtering, original dates and stronger provenance than estimates', async () => {
  env.DB = createDatabase();
  const {parsePublicHistory} = require('../lib/public-history.ts');
  const checkedAt = stamp(), sourceDate = new Date().toUTCString();
  const html = name => `<table><tr><td class="field_domain"><a title="${name}">${name}</a></td><td class="field_changes">Yesterday 12:05</td></tr></table>All times are <strong>UTC</strong>.`;
  const historyFeeds = ['com', 'org'].map(tld => ({tld, checkedAt, records: parsePublicHistory(html('dropped.' + tld), tld, sourceDate, checkedAt)}));
  try {
    assert.equal((await cacheRoute.POST(request('/api/catalog-cache', null, {historyFeeds}))).status, 200);
    const readback = await (await cacheRoute.GET(request('/api/catalog-cache', null, null, 'GET'))).json();
    assert.equal(readback.historyFeeds.length, 2);
    for (const tld of ['com', 'org']) {
      const result = await (await routes.GET(new Request('https://site.test/api/domains?view=recent&tlds=' + tld))).json();
      assert.equal(result.records.length, 1);
      assert.equal(result.records[0].status, 'Source-reported deletion');
      assert.equal(result.records[0].reportedDrop.label, 'Yesterday 12:05');
      assert.equal(result.records[0].reportedDrop.checkedAt, checkedAt);
      assert.equal(result.records[0].drop, null);
    }
    // A later forecast must not replace a reported historical deletion.
    await env.DB.batch([history.archiveStatement(env.DB, [record('dropped.com', new Date(Date.now() - day).toISOString(), new Date(Date.now() + 1000).toISOString())])]);
    assert.ok((await history.recentCatalog(env.DB, ['com'])).records[0].reportedDrop);
    for (const change of [{reportedDrop: {...historyFeeds[0].records[0].reportedDrop, at: '2026-02-30T12:05:00Z'}}, {sourceUrl: 'https://wrong.test/'}, {drop: checkedAt}]) {
      const bad = {historyFeeds: [{...historyFeeds[0], records: [{...historyFeeds[0].records[0], ...change}]}]};
      assert.equal((await cacheRoute.POST(request('/api/catalog-cache', null, bad))).status, 400);
    }
    assert.equal((await history.recentCatalog(env.DB, ['com'])).records[0].reportedDrop.checkedAt, checkedAt);
    // One bad feed must reject the entire batch before it can replace a valid snapshot.
    const invalid = {historyFeeds: [historyFeeds[0], {...historyFeeds[1], records: []}]};
    assert.equal((await cacheRoute.POST(request('/api/catalog-cache', null, invalid))).status, 400);
  } finally {env.DB.close();}
});

test('saved catalogue opens all eight extensions without external requests; individual checks reuse the original release observation', async () => {
  env.DB = createDatabase();
  const originalFetch = global.fetch, originalLookup = domains.lookup;
  let calls = 0;
  global.fetch = async () => {calls++; throw new Error('Offline');};
  try {
    const checkedAt = new Date(Date.now() - 3600000).toISOString();
    for (const tld of catalog.CATALOG_TLDS) await history.saveCatalogFeed(env.DB, tld, [record('saved.' + tld, new Date(Date.now() + day).toISOString(), checkedAt)], checkedAt);
    const cached = await (await routes.GET(new Request('https://site.test/api/domains?cached=1'))).json();
    assert.equal(cached.records.length, 8);
    assert.equal(calls, 0);
    assert.ok(cached.records.every(row => row.checkedAt === checkedAt));
    const selected = await (await routes.GET(new Request('https://site.test/api/domains?cached=1&tlds=org'))).json();
    assert.deepEqual(selected.records.map(row => row.tld), ['org']);
    domains.lookup = async name => ({...record(name, null), status: 'Registered', expiration: '2034-11-23'});
    const checked = await (await routes.GET(new Request('https://site.test/api/domains?domain=saved.ai'))).json();
    assert.equal(checked.record.expiration, '2034-11-23');
    assert.ok(checked.record.drop);
    assert.equal(checked.record.availabilityCheckedAt, checkedAt);
    domains.lookup = async () => {throw new Error('Registry unavailable (503).');};
    const fallbackResponse = await routes.GET(new Request('https://site.test/api/domains?domain=saved.ai'));
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

test('catalogue API enforces writer authentication even when invoked directly', async () => {
 const req = new Request('https://site.test/api/catalog-cache');
 assert.equal((await cacheRoute.GET(req)).status, 401);
 assert.equal((await cacheRoute.POST(new Request(req, {method: 'POST', body: '{}'}))).status, 401);
});
