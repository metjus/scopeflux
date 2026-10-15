import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {parseBackorderDetail} from '../lib/backorder-detail.ts';
import {lookup} from '../lib/domains.ts';
import {orderListings} from '../lib/list-order.ts';

const checkedAt = '2026-10-15T10:10:00.000Z';
const registered = readFileSync(new URL('./fixtures/backorder-registered.html', import.meta.url), 'utf8');
const held = readFileSync(new URL('./fixtures/backorder-held.html', import.meta.url), 'utf8');

test('reads bazaro.sk current status and Unicode-hyphen expiration without confusing history with current data', () => {
  const record = parseBackorderDetail(registered, 'bazaro.sk', checkedAt);
  assert.equal(record.status, 'Registered');
  assert.equal(record.expiration, '2026-11-23');
  assert.equal(record.drop, null);
  assert.equal(record.conditionalRelease, '2027-01-03');
  assert.equal(record.checkedAt, checkedAt);
  assert.equal(record.sourceCheckedDate, '2026-10-15');
});

test('preserves a published held-domain release date and does not use historical expiration', () => {
  const record = parseBackorderDetail(held, 'cogoumelecka.sk', checkedAt);
  assert.equal(record.status, 'Recovery period');
  assert.equal(record.drop, '2026-10-15');
  assert.equal(record.expiration, null);
  assert.equal(record.conditionalRelease, null);
});

test('has no future-date cutoff and recalculates a conditional estimate after renewal', () => {
  const renewed = registered.replace('2026‑11‑23', '2030&#8209;11&#8209;23');
  const record = parseBackorderDetail(renewed, 'bazaro.sk', checkedAt);
  assert.equal(record.expiration, '2030-11-23');
  assert.equal(record.conditionalRelease, '2031-01-03');
  assert.equal(record.drop, null);
});

test('orders conditional watchlist estimates by release, with published dates taking precedence', () => {
  const conditional = parseBackorderDetail(registered, 'bazaro.sk', checkedAt);
  const earlier = {...conditional, domain: 'other.sk', drop: '2026-12-01'};
  assert.deepEqual(orderListings([conditional, earlier], 'date').map(record => record.domain), ['other.sk', 'bazaro.sk']);
});

test('does not fabricate an estimate from an invalid expiration or an unknown state', () => {
  const invalid = parseBackorderDetail(registered.replace('2026‑11‑23', '2026‑02‑30'), 'bazaro.sk', checkedAt);
  assert.equal(invalid.expiration, null);
  assert.equal(invalid.conditionalRelease, null);
  const unknown = parseBackorderDetail(registered.replace('<span class="rec-val">OK</span>', '<span class="rec-val">UNKNOWN</span>'), 'bazaro.sk', checkedAt);
  assert.equal(unknown.status, 'Unverified');
  assert.equal(unknown.conditionalRelease, null);
});

test('rejects missing or mismatched current records rather than reading history as current data', () => {
  assert.throws(() => parseBackorderDetail(registered, 'different.sk', checkedAt), /matching domain page/);
  assert.throws(() => parseBackorderDetail('<h1>bazaro.sk</h1><p>Stav OK Platná do 2020-01-01</p>', 'bazaro.sk', checkedAt), /readable current record/);
});

test('RDAP lookup accepts expiration years away for an extension outside the catalogue', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (url === 'https://data.iana.org/rdap/dns.json') return Response.json({services: [[['photography'], ['https://rdap.example/']]]});
    assert.equal(url, 'https://rdap.example/domain/example.photography');
    return Response.json({objectClassName: 'domain', ldhName: 'example.photography', status: ['active'], events: [{eventAction: 'expiration', eventDate: '2034-11-23T12:00:00Z'}]});
  };
  try {
    const record = await lookup('example.photography');
    assert.equal(record.status, 'Registered');
    assert.equal(record.expiration, '2034-11-23T12:00:00Z');
    assert.equal(record.drop, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
