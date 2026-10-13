import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';
const req = (path,options) => new Request('https://scopeflux.io'+path,options);
test('unknown API returns JSON 404',async()=>{const r=await worker.fetch(req('/api/missing'),{});assert.equal(r.status,404);assert.equal((await r.json()).code,'NOT_FOUND');});
test('RSS refuses writes',async()=>{const r=await worker.fetch(req('/api/trending',{method:'POST'}),{});assert.equal(r.status,405);});
test('RSS validates markets',async()=>{const r=await worker.fetch(req('/api/trending?country=INVALID'),{});assert.equal(r.status,400);});
test('optional API stays disabled',async()=>{const r=await worker.fetch(req('/api/keyword'),{TREND_API_ENABLED:'false'});const s=await r.json();assert.equal(s.ready,false);assert.equal(s.enabled,false);});
test('assets binding handles files',async()=>{const r=await worker.fetch(req('/style.css'),{ASSETS:{fetch:async r=>new Response(new URL(r.url).pathname)}});assert.equal(await r.text(),'/style.css');});
