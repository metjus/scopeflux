// Wikipedia history: Worker side (lib/wikipedia.mjs) and browser side
// (public/js/data/wikipedia-client.js). No live network: fetch is replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { historyResponse } from '../lib/sources/wikipedia.mjs';
import { validateHistory, fetchWikipediaSeries } from '../public/js/data/wikipedia-client.js';

const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

// A fake Wikimedia: one search hit, then `days` daily view counts.
function fakeWikimedia(calls) {
  return async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/search/page')) return json({ pages: [{ key: 'Matcha', title: 'Matcha' }] });
    const items = Array.from({ length: 10 }, (_, i) => ({
      timestamp: '202610' + String(i + 1).padStart(2, '0') + '00',
      views: 100 + i,
    }));
    return json({ items });
  };
}

test('Worldwide history uses the English edition', async () => {
  const calls = [];
  const response = await historyResponse(
    new Request('https://scopeflux.io/api/history?query=matcha&days=30'),
    fakeWikimedia(calls),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.lang, 'en');
  assert.equal(body.country, '');
  assert.ok(calls[0].url.startsWith('https://en.wikipedia.org/'));
});

test('Wikipedia requests use redirect "manual" (Workers reject "error")', async () => {
  const calls = [];
  await historyResponse(
    new Request('https://scopeflux.io/api/history?query=matcha&country=SK&days=30'),
    fakeWikimedia(calls),
  );
  assert.ok(calls.length > 0);
  for (const call of calls) assert.equal(call.init.redirect, 'manual');
  assert.ok(calls[0].url.startsWith('https://sk.wikipedia.org/'));
});

test('a Wikipedia redirect is reported as unavailable, not followed', async () => {
  const response = await historyResponse(
    new Request('https://scopeflux.io/api/history?query=matcha&country=US&days=30'),
    async () => new Response(null, { status: 302, headers: { Location: 'https://example.com' } }),
  );
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, 'WIKI_UNAVAILABLE');
});

const goodBody = {
  provider: 'wikipedia-pageviews',
  country: 'DE',
  lang: 'de',
  article: 'Matcha',
  unit: 'Wikipedia article views per day',
  fetchedAt: '2026-10-14T10:00:00.000Z',
  records: Array.from({ length: 6 }, (_, i) => ({ date: '2026-10-0' + (i + 1), value: i })),
};

test('validateHistory accepts a well-formed answer', () => {
  assert.equal(validateHistory(goodBody, { country: 'DE' }), goodBody);
});

test('validateHistory rejects a different market, bad dates or negative values', () => {
  assert.throws(() => validateHistory(goodBody, { country: 'FR' }));
  const badDate = { ...goodBody, records: [...goodBody.records, { date: '2026-13-01', value: 1 }] };
  assert.throws(() => validateHistory(badDate, { country: 'DE' }));
  const negative = { ...goodBody, records: goodBody.records.map(r => ({ ...r, value: -1 })) };
  assert.throws(() => validateHistory(negative, { country: 'DE' }));
});

test('fetchWikipediaSeries passes on the Worker error message', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'No matching Wikipedia article found.', code: 'NO_MATCH' }), {
      status: 404,
    });
  try {
    await assert.rejects(
      fetchWikipediaSeries({ query: 'zzz', country: 'DE', period: '90' }),
      /No matching Wikipedia article found/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('fetchWikipediaSeries returns a labelled series', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => json(goodBody);
  try {
    const d = await fetchWikipediaSeries({ query: 'matcha', country: 'DE', period: '90' });
    assert.equal(d.kind, 'history');
    assert.equal(d.source, 'wikipedia');
    assert.equal(d.query, 'Matcha');
    assert.equal(d.searchedFor, 'matcha');
    assert.equal(d.unit, 'Wikipedia article views per day');
    assert.equal(d.records.length, 6);
  } finally {
    globalThis.fetch = original;
  }
});
