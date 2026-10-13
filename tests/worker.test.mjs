import test from 'node:test';import assert from 'node:assert/strict';import worker from '../worker.mjs';
const request=path=>new Request('https://scopeflux.io'+path);
test('RSS validates market',async()=>assert.equal((await worker.fetch(request('/api/trending?country=INVALID'),{})).status,400));
test('removed keyword integration is disabled',async()=>assert.equal((await(await worker.fetch(request('/api/keyword'),{})).json()).ready,false));
test('unknown API is JSON 404',async()=>assert.equal((await worker.fetch(request('/api/missing'),{})).status,404));
test('static assets still work',async()=>assert.equal(await(await worker.fetch(request('/style.css'),{ASSETS:{fetch:async()=>new Response('css')}})).text(),'css'));
