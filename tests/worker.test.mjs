import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';
const request = path => new Request('https://scopeflux.io' + path);
test('RSS validates market', async () =>
  assert.equal((await worker.fetch(request('/api/trending?country=INVALID'), {})).status, 400));
test('old keyword integration points to its replacement', async () =>
  assert.equal((await worker.fetch(request('/api/keyword'), {})).status, 410));
test('Wikipedia history rejects empty query', async () =>
  assert.equal((await worker.fetch(request('/api/history?country=SK'), {})).status, 400));
test('Wikipedia history rejects unsupported market', async () =>
  assert.equal(
    (await (await worker.fetch(request('/api/history?query=mačka&country=ZZ'), {})).json()).code,
    'UNSUPPORTED_MARKET',
  ));
test('unknown API is JSON 404', async () =>
  assert.equal((await worker.fetch(request('/api/missing'), {})).status, 404));
test('static assets still work', async () =>
  assert.equal(
    await (
      await worker.fetch(request('/style.css'), { ASSETS: { fetch: async () => new Response('css') } })
    ).text(),
    'css',
  ));
