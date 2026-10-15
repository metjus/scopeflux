import assert from 'node:assert/strict';
import test from 'node:test';
import {lookup, normalizeDomain, rdapServiceBase} from '../lib/domains.ts';

test('domain validation supports arbitrary extensions and IDNs and rejects non-domain inputs', () => {
  assert.equal(normalizeDomain('HTTPS://EXAMPLE.PHOTOGRAPHY/'), 'example.photography');
  assert.equal(normalizeDomain('bbc.co.uk.'), 'bbc.co.uk');
  assert.equal(normalizeDomain('bücher.de'), 'xn--bcher-kva.de');
  for (const invalid of ['127.0.0.1', 'localhost', 'example.com/path', 'user@example.com', 'example.com:443', '-bad.sk', 'bad-.sk', 'a'.repeat(64) + '.sk']) assert.throws(() => normalizeDomain(invalid));
  assert.equal(rdapServiceBase([[['uk'], ['https://uk.test/']], [['co.uk'], ['https://co.test/']]], 'bbc.co.uk'), 'https://co.test/');
});

test('registry missing records, absent services, wrong-domain responses and throttling never report availability', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    if (url === 'https://data.iana.org/rdap/dns.json') return Response.json({services: [[['xyz'], ['https://registry.example/']]]});
    if (url.endsWith('/missing.xyz')) return new Response('', {status: 404});
    if (url.endsWith('/limited.xyz')) return new Response('', {status: 429});
    return Response.json({objectClassName: 'domain', ldhName: 'different.xyz', events: []});
  };
  try {
    assert.equal((await lookup('missing.xyz')).status, 'Unverified');
    assert.equal((await lookup('missing.invalid')).status, 'Unverified');
    await assert.rejects(lookup('limited.xyz'), /limited requests/);
    await assert.rejects(lookup('wrong.xyz'), /matching domain record/);
  } finally {globalThis.fetch = original;}
});

test('.ai uses its known registry directly even when the bootstrap directory is unavailable', async () => {
 const original=global.fetch;const urls=[];
 global.fetch=async url=>{
  urls.push(url);
  if(url.includes('iana.org'))return new Response('',{status:429});
  return Response.json({objectClassName:'domain',ldhName:'direct.ai',events:[{eventAction:'expiration',eventDate:'2035-10-15T00:00:00Z'}]});
 };
 try{
  const result=await lookup('direct.ai');
  assert.equal(result.expiration,'2035-10-15T00:00:00Z');
  assert.equal(result.status,'Registered');
  assert.deepEqual(urls,['https://rdap.identitydigital.services/rdap/domain/direct.ai']);
 }finally{global.fetch=original;}
});
