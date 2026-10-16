import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parseCzAuctions, CATALOG_TLDS} from '../lib/catalog.ts';
import {statusInfo} from '../lib/status.ts';

// Real entries from CZ.NIC's public new_auctions.json, plus three broken ones.
const sample = readFileSync(new URL('./fixtures/cz-auctions.json', import.meta.url), 'utf8');

test('.cz is in the catalogue and is read from the CZ.NIC auction list', () => {
  assert.ok(CATALOG_TLDS.includes('cz'));
  const records = parseCzAuctions(sample, '2026-10-16T10:00:00.000Z');
  assert.deepEqual(records.map(r => r.domain), ['snkmukarov.cz', 'drevnicek.cz', 'dumpotreb.cz']);
  const first = records[0];
  assert.equal(first.drop, '2026-10-31T11:00:00.000Z'); // bidding opens, exact UTC time kept
  assert.equal(first.status, 'Registry auction');
  assert.equal(first.source, 'CZ.NIC');
  assert.equal(first.checkedAt, '2026-10-16T10:00:00.000Z');
  assert.match(first.note, /Bidding ends 2026-10-31 20:00 UTC/);
  assert.match(first.note, /released the day after/);
  assert.notEqual(statusInfo('Registry auction').label, 'Unverified');
});

test('an unreadable CZ.NIC answer is an error, not an empty list', () => {
  assert.throws(() => parseCzAuctions('<html>maintenance</html>'), /unreadable/);
  assert.throws(() => parseCzAuctions('{"items":[]}'), /unexpected/);
});

test('the .cz list is fetched as JSON from CZ.NIC and its page is the one shown to visitors', async () => {
  const {upcomingCatalog} = await import('../lib/catalog.ts');
  const original = globalThis.fetch;
  const asked = [];
  const future = new Date(Date.now() + 3 * 86400000).toISOString();
  globalThis.fetch = async (url, init) => {
    asked.push({url: String(url), accept: init.headers.Accept, agent: init.headers['User-Agent']});
    return Response.json([{item_title: 'example-auction.cz', auction_from: future, auction_to: future}]);
  };
  try {
    const result = await upcomingCatalog(['cz']);
    assert.equal(asked[0].url, 'https://auctions-master.nic.cz/share/new_auctions.json');
    assert.equal(asked[0].accept, 'application/json');
    assert.match(asked[0].agent, /scopeflux\.io/);
    assert.deepEqual(result.records.map(r => r.domain), ['example-auction.cz']);
    assert.equal(result.feeds[0].source, 'CZ.NIC');
    assert.equal(result.feeds[0].url, 'https://www.domenovyprohlizec.cz/cs/aukce-domen/');
    assert.equal(result.feeds[0].limited, false);
  } finally {
    globalThis.fetch = original;
  }
});

test('when the database refuses writes (e.g. the D1 daily limit), freshly fetched listings are still shown', async () => {
  const {upcomingCatalog} = await import('../lib/catalog.ts');
  const original = globalThis.fetch, quiet = console.error;
  const future = new Date(Date.now() + 3 * 86400000).toISOString();
  globalThis.fetch = async () => Response.json([{item_title: 'still-shown.cz', auction_from: future, auction_to: future}]);
  console.error = () => {};
  const limited = {
    prepare: () => ({bind() {return this;}, first: async () => null, all: async () => ({results: []}), run: async () => ({})}),
    batch: async () => {throw new Error('D1_ERROR: daily write limit exceeded');},
  };
  try {
    const result = await upcomingCatalog(['cz'], 1, limited);
    // (The fetch may be served from the 15-minute in-memory cache of the previous test.)
    assert.equal(result.records.length, 1);
    assert.match(result.records[0].domain, /\.cz$/);
    assert.equal(result.feeds[0].error, undefined);
  } finally {
    globalThis.fetch = original;
    console.error = quiet;
  }
});
