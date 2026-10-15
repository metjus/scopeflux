// Source adapters against saved sample responses. No live network.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as wikipedia from '../lib/sources/wikipedia.mjs';
import * as hackernews from '../lib/sources/hackernews.mjs';
import * as guardian from '../lib/sources/guardian.mjs';
import { fakeFetcher, NOW } from './helpers/fake-sources.mjs';

const topic = { article: 'Godot_(game_engine)', lang: 'en', searchText: 'Godot' };

test('every adapter returns the same shape: source, unit, 14 dated points, fetchedAt', async () => {
  const { fetcher } = fakeFetcher();
  for (const adapter of [wikipedia, hackernews, guardian]) {
    const result = await adapter.getDailySeries(topic, 'US', 14, { fetcher, now: NOW, apiKey: 'k' });
    assert.ok(result.source);
    assert.ok(result.unit.length > 5);
    assert.equal(result.series.length, 14);
    assert.equal(result.series[0].date, '2026-09-30');
    assert.equal(result.series.at(-1).date, '2026-10-13');
    assert.equal(result.fetchedAt, new Date(NOW).toISOString());
  }
});

test('Hacker News stories are counted per UTC day', async () => {
  const { fetcher, calls } = fakeFetcher();
  const { series } = await hackernews.getDailySeries(topic, 'US', 14, { fetcher, now: NOW });
  assert.equal(series.find(p => p.date === '2026-10-12').value, 4);
  assert.equal(series.find(p => p.date === '2026-10-02').value, 0);
  assert.match(calls[0], /restrictSearchableAttributes=title/);
});

test('Guardian articles are counted per UTC day; the key and dates go in the request', async () => {
  const { fetcher, calls } = fakeFetcher();
  const { series, note } = await guardian.getDailySeries(topic, 'DE', 14, { fetcher, now: NOW, apiKey: 'k' });
  assert.equal(series.find(p => p.date === '2026-10-10').value, 6);
  assert.equal(series.find(p => p.date === '2026-10-01').value, 2);
  assert.equal(note, undefined);
  const url = new URL(calls[0]);
  assert.equal(url.searchParams.get('q'), '"Godot"');
  assert.equal(url.searchParams.get('from-date'), '2026-09-30');
  assert.equal(url.searchParams.get('to-date'), '2026-10-13');
  assert.equal(url.searchParams.get('api-key'), 'k');
});

test('The Guardian without an API key says so, and makes no request', async () => {
  const { fetcher, calls } = fakeFetcher();
  await assert.rejects(guardian.getDailySeries(topic, 'US', 14, { fetcher, now: NOW }), {
    code: 'NOT_CONFIGURED',
  });
  assert.equal(calls.length, 0);
});

test('The Guardian: an unexpected answer is an error, not data', async () => {
  const fetcher = async () => Response.json({ response: { status: 'error', message: 'Invalid key' } });
  await assert.rejects(guardian.getDailySeries(topic, 'US', 14, { fetcher, now: NOW, apiKey: 'k' }), {
    code: 'BAD_RESPONSE',
  });
});

test('The Guardian with more articles than one page: older days become unknown (null), not zero', async () => {
  const results = Array.from({ length: 200 }, (_, i) => ({
    webPublicationDate: new Date(Date.parse('2026-10-13T20:00:00Z') - i * 3_600_000).toISOString(),
  }));
  const fetcher = async () => Response.json({ response: { status: 'ok', total: 450, results } });
  const result = await guardian.getDailySeries(topic, 'US', 14, { fetcher, now: NOW, apiKey: 'k' });
  assert.equal(result.series.find(p => p.date === '2026-10-01').value, null);
  assert.ok(result.series.at(-1).value > 0);
  assert.ok(result.note);
});

test('a failing service gives a typed error', async () => {
  const { fetcher } = fakeFetcher({ fail: ['hackernews'] });
  await assert.rejects(hackernews.getDailySeries(topic, 'US', 14, { fetcher, now: NOW }), {
    name: 'SourceError',
    code: 'HTTP_ERROR',
  });
});

test('more than 1000 Hacker News hits: older days become unknown (null), not zero', async () => {
  const day = Date.parse('2026-10-12T12:00:00Z') / 1000;
  const fetcher = async () =>
    new Response(
      JSON.stringify({ hits: [{ created_at_i: day }, { created_at_i: day + 60 }], nbHits: 5000 }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  const result = await hackernews.getDailySeries(topic, 'US', 14, { fetcher, now: NOW });
  assert.equal(result.series.find(p => p.date === '2026-10-01').value, null);
  assert.equal(result.series.find(p => p.date === '2026-10-13').value, 0);
  assert.ok(result.note);
});

test('Wikipedia top lists skip non-articles; climbers need a real jump', async () => {
  const { fetcher } = fakeFetcher();
  const latest = await wikipedia.topArticles('en', '2026-10-13', fetcher);
  assert.deepEqual(
    latest.map(a => a.key),
    ['Godot_(game_engine)', 'Steady_topic'],
  );
  const before = await wikipedia.topArticles('en', '2026-10-06', fetcher);
  const found = wikipedia.climbers(latest, before, { ratio: 1.5, minViews: 200, limit: 10 });
  assert.deepEqual(
    found.map(a => a.key),
    ['Godot_(game_engine)'],
  );
});
