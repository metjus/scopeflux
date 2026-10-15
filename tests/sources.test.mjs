// Source adapters against saved sample responses. No live network.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as wikipedia from '../lib/sources/wikipedia.mjs';
import * as hackernews from '../lib/sources/hackernews.mjs';
import * as gdelt from '../lib/sources/gdelt.mjs';
import { fakeFetcher, NOW } from './helpers/fake-sources.mjs';

const topic = { article: 'Godot_(game_engine)', lang: 'en', searchText: 'Godot' };

test('every adapter returns the same shape: source, unit, 14 dated points, fetchedAt', async () => {
  const { fetcher } = fakeFetcher();
  for (const adapter of [wikipedia, hackernews, gdelt]) {
    const result = await adapter.getDailySeries(topic, 'US', 14, { fetcher, now: NOW });
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

test('GDELT 15-minute steps are added up per day and the market filter is applied', async () => {
  const { fetcher, calls } = fakeFetcher();
  const { series } = await gdelt.getDailySeries(topic, 'DE', 14, { fetcher, now: NOW });
  assert.equal(series.find(p => p.date === '2026-10-10').value, 12);
  assert.match(decodeURIComponent(calls[0]), /sourcecountry:germany/);
});

test('GDELT query: operators removed, phrases quoted, too-short names refused', () => {
  assert.equal(gdelt.gdeltQuery('Pokémon Legends: Z-A', 'WW'), '"Pokémon Legends Z-A"');
  assert.equal(gdelt.gdeltQuery('Godot', 'SK'), 'Godot sourcecountry:slovakia');
  assert.equal(gdelt.gdeltQuery('AI', 'US'), null);
});

test('GDELT plain-text answers become "no data", not a crash', async () => {
  const fetcher = async () => new Response('The specified phrase is too short.', { status: 200 });
  await assert.rejects(gdelt.getDailySeries(topic, 'US', 14, { fetcher, now: NOW }), { code: 'NO_MATCH' });
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
