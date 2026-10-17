import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshCatalogue} from '../lib/catalog-loader.ts';

const saved={records:[{domain:'saved.ai'}],feeds:[]};
const fresh={records:[{domain:'fresh.ai'}],feeds:[]};

test('saved listings become usable while a live refresh is still pending', async () => {
 const original=global.fetch;let releaseLive,signalSaved;
 const visible=new Promise(resolve=>{signalSaved=resolve;});
 const calls=[];
 global.fetch=async url=>{calls.push(url);if(url.includes('cached'))return Response.json(saved);return new Promise(resolve=>{releaseLive=()=>resolve(Response.json(fresh));});};
 try{
  const loading=refreshCatalogue(['com'],data=>{assert.deepEqual(data,saved);signalSaved();});
  await visible;
  assert.deepEqual(calls,['/api/domains?tlds=com','/api/domains?cached=1&tlds=com']);
  releaseLive();assert.deepEqual(await loading,fresh);
 }finally{global.fetch=original;}
});

test('a failed live refresh preserves the already displayed snapshot; unavailable saved data does not block live data', async () => {
 const original=global.fetch;let displayed;
 try{
  global.fetch=async url=>url.includes('cached')?Response.json(saved):Response.json({error:'Source offline'},{status:502});
  await assert.rejects(refreshCatalogue(['com'],data=>{displayed=data;}),/Source offline/);
  assert.deepEqual(displayed,saved);
  global.fetch=async url=>url.includes('cached')?new Response('Unavailable',{status:503}):Response.json(fresh);
  assert.deepEqual(await refreshCatalogue(['com'],()=>assert.fail('No saved snapshot should be displayed')),fresh);
 }finally{global.fetch=original;}
});

test('a fast live response does not wait for a slow saved response or get replaced by it later', async () => {
 const original=global.fetch;let finishSaved;let displayed=0;
 global.fetch=async url=>url.includes('cached')?new Promise(resolve=>{finishSaved=()=>resolve(Response.json(saved));}):Response.json(fresh);
 try{
  assert.deepEqual(await refreshCatalogue(['com'],()=>{displayed++;}),fresh);
  finishSaved();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(displayed,0);
 }finally{global.fetch=original;}
});
