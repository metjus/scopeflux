// The Discover pipeline end to end: fake services + an in-memory D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipelineStep } from '../lib/pipeline.mjs';
import { discoverResponse, topicResponse } from '../lib/api.mjs';
import { evaluateCounts, summarizeTopic } from '../lib/rising.mjs';
import { createFakeD1 } from './helpers/fake-d1.mjs';
import { fakeFetcher, NOW } from './helpers/fake-sources.mjs';

const noSleep = async () => {};
const series = values =>
  values.map((value, i) => ({ date: '2026-10-' + String(i + 1).padStart(2, '0'), value }));

// Run steps until the first snapshot exists (collect, evaluate…, finish).
async function buildFirstSnapshot(env, fetcher) {
  const steps = [];
  for (let i = 0; i < 20; i++) {
    const step = await runPipelineStep(env, { now: NOW, fetcher, sleep: noSleep });
    steps.push(step);
    if (step.action === 'finished') break;
  }
  return steps;
}

test('rising needs both the ratio and the minimum volume', () => {
  const flatLow = evaluateCounts('hackernews', series([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1]));
  assert.equal(flatLow.rising, false); // 2 stories < minimum of 3
  const up = evaluateCounts('hackernews', series([1, 0, 0, 1, 0, 0, 0, 1, 1, 2, 1, 0, 1, 2]));
  assert.equal(up.rising, true);
  assert.equal(up.last7, 8);
  const wikiSmall = evaluateCounts('wikipedia', series(Array(7).fill(10).concat(Array(7).fill(40))), {
    lang: 'sk',
  });
  assert.equal(wikiSmall.rising, true); // 40/day ≥ 30 on smaller editions
  const wikiEnglish = evaluateCounts('wikipedia', series(Array(7).fill(10).concat(Array(7).fill(40))), {
    lang: 'en',
  });
  assert.equal(wikiEnglish.rising, false); // English needs 200/day
});

test('missing days are reported as missing, never guessed', () => {
  const values = Array(14).fill(5);
  values[3] = null;
  assert.deepEqual(evaluateCounts('gdelt', series(values)), { missing: true });
});

test('"moved first on" only names a source that clearly moved first', () => {
  const a = { rising: true, changePct: 50, firstCrossDate: '2026-10-09', spark: [1] };
  const b = { rising: true, changePct: 90, firstCrossDate: '2026-10-11', spark: [2] };
  const tie = { ...b, firstCrossDate: '2026-10-09' };
  assert.deepEqual(
    [
      summarizeTopic({ wikipedia: a, gdelt: b }).leader,
      summarizeTopic({ wikipedia: a, gdelt: b }).leaderIsFirst,
    ],
    ['wikipedia', true],
  );
  const unclear = summarizeTopic({ wikipedia: a, gdelt: tie });
  assert.equal(unclear.leaderIsFirst, false);
  assert.equal(unclear.leader, 'gdelt'); // strongest, without claiming it moved first
});

test('the pipeline builds a snapshot in small steps', async () => {
  const env = { DB: createFakeD1() };
  const { fetcher, calls } = fakeFetcher();
  const steps = await buildFirstSnapshot(env, fetcher);
  assert.equal(steps[0].action, 'collected');
  assert.equal(steps.at(-1).action, 'finished');
  // The first market without a snapshot is Worldwide: 7 RSS feeds + 2 top lists.
  assert.equal(steps[0].market, 'WW');

  const response = await discoverResponse(new Request('https://x/api/discover?market=WW'), env);
  const { snapshot } = await response.json();
  assert.equal(snapshot.market, 'WW');
  assert.equal(snapshot.windowEnd, '2026-10-13');
  const godot = snapshot.rising.find(t => t.key === 'en:Godot_(game_engine)');
  assert.ok(godot, 'the Wikipedia climber is rising');
  assert.ok(godot.sourcesRising >= 2);
  assert.ok(godot.risingOn.includes('wikipedia'));
  // The RSS topic was matched to its article and listed today.
  const matcha = [...snapshot.rising, ...snapshot.early].find(t => t.key === 'en:Matcha');
  assert.ok(matcha);
  assert.equal(matcha.perSource.rss.rising, true);
  assert.equal(snapshot.sources.gdelt.status, 'ok');
  // Never more than 50 outgoing requests in one step: check the biggest step.
  assert.ok(calls.length / steps.length < 50);
});

test('a source that is down is shown as unavailable; the rest still work', async () => {
  const env = { DB: createFakeD1() };
  const { fetcher } = fakeFetcher({ fail: ['gdelt'] });
  await buildFirstSnapshot(env, fetcher);
  const { snapshot } = await (
    await discoverResponse(new Request('https://x/api/discover?market=WW'), env)
  ).json();
  assert.equal(snapshot.sources.gdelt.status, 'unavailable');
  assert.equal(snapshot.sources.wikipedia.status, 'ok');
  const godot = [...snapshot.rising, ...snapshot.early].find(t => t.key === 'en:Godot_(game_engine)');
  assert.equal(godot.perSource.gdelt.status, 'unavailable');
});

test('discover without a database says so instead of inventing data', async () => {
  const response = await discoverResponse(new Request('https://x/api/discover?market=SK'), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'NOT_CONFIGURED');
});

test('topic page: series per source with units, cached, RSS from own records', async () => {
  const env = { DB: createFakeD1() };
  const { fetcher, calls } = fakeFetcher();
  await buildFirstSnapshot(env, fetcher);
  const url =
    'https://x/api/topic?key=' + encodeURIComponent('en:Godot_(game_engine)') + '&market=US&days=30';
  const before = calls.length;
  const body = await (await topicResponse(new Request(url), env, { fetcher, now: NOW })).json();
  assert.equal(body.title, 'Godot (game engine)');
  assert.equal(body.searchText, 'Godot');
  for (const key of ['wikipedia', 'hackernews', 'gdelt']) {
    assert.equal(body.sources[key].status, 'ok');
    assert.equal(body.sources[key].series.length, 30);
    assert.ok(body.sources[key].unit);
  }
  assert.equal(calls.length - before, 3);
  // Second request comes from the cache: no new outgoing requests.
  await topicResponse(new Request(url), env, { fetcher, now: NOW });
  assert.equal(calls.length - before, 3);
  assert.equal(body.rss.status, 'ok');
});

test('topic page: a failing source is reported, not filled in', async () => {
  const { fetcher } = fakeFetcher({ fail: ['hackernews'] });
  const url = 'https://x/api/topic?key=en:Matcha&market=WW&days=90';
  const body = await (await topicResponse(new Request(url), {}, { fetcher, now: NOW })).json();
  assert.equal(body.sources.hackernews.status, 'unavailable');
  assert.match(body.sources.hackernews.message, /Hacker News/);
  assert.equal(body.sources.wikipedia.status, 'ok');
});

test('topic page rejects bad input', async () => {
  for (const query of ['key=nope', 'key=en:X&market=ZZ', 'key=en:X&days=7']) {
    const response = await topicResponse(new Request('https://x/api/topic?' + query), {});
    assert.equal(response.status, 400);
  }
});
