import test from 'node:test';
import assert from 'node:assert/strict';
import {apiRequest} from '../lib/api-client.ts';

test('API requests send a bounded signal and preserve structured server errors', async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => {assert.ok(options.signal instanceof AbortSignal); return Response.json({records: []});};
    assert.deepEqual(await apiRequest('/api/domains'), {records: []});
    global.fetch = async () => Response.json({error: 'Sign in to save domains.'}, {status: 401});
    await assert.rejects(apiRequest('/api/watchlist'), /Sign in to save/);
    global.fetch = async () => new Response('<html>Gateway error</html>', {status: 502});
    await assert.rejects(apiRequest('/api/domains'), /failed \(502\)/);
    global.fetch = async () => {throw new DOMException('Too slow', 'TimeoutError');};
    await assert.rejects(apiRequest('/api/domains'), /Previous data was preserved/);
  } finally {global.fetch = original;}
});
