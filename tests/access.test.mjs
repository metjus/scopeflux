import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyAccessToken, identify, identityRequest, isRefreshAuthorized} from '../lib/access.ts';
import {validAdUnit, adsConfig} from '../lib/ads-config.ts';
const config = {ACCESS_TEAM_DOMAIN: 'https://test-team.cloudflareaccess.com', ACCESS_AUD: 'test-audience'};
const pair = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
const jwk = {...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key'};
const fetcher = async url => {assert.equal(url, config.ACCESS_TEAM_DOMAIN + '/cdn-cgi/access/certs');return Response.json({keys: [jwk]});};
const b64 = value => Buffer.from(value).toString('base64url');
async function token(extra = {}) {
  const payload = {iss: config.ACCESS_TEAM_DOMAIN, aud: [config.ACCESS_AUD], sub: 'person-one', exp: Date.now() / 1000 + 60, ...extra};
  const body = b64(JSON.stringify({alg: 'RS256', kid: 'test-key'})) + '.' + b64(JSON.stringify(payload));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(body));
  return body + '.' + b64(signature);
}
test('Access verifies signature and supports header or post-login cookie', async () => {
  const jwt = await token();
  assert.equal(await verifyAccessToken(jwt, config, fetcher), 'access:person-one');
  assert.equal(await identify(new Request('https://example.test', {headers: {'Cf-Access-Jwt-Assertion': jwt}}), config, fetcher), 'access:person-one');
  assert.equal(await identify(new Request('https://example.test', {headers: {Cookie: 'CF_Authorization=' + jwt}}), config, fetcher), 'access:person-one');
});
test('Access rejects expiry, audience, issuer, unsigned and modified tokens', async () => {
  for (const extra of [{exp: 1}, {aud: 'wrong'}, {iss: 'https://evil.test'}, {nbf: Date.now() / 1000 + 100}]) assert.equal(await verifyAccessToken(await token(extra), config, fetcher), null);
  const jwt = await token();
  assert.equal(await verifyAccessToken(jwt.slice(0, -10) + 'aaaaaaaaaa', config, fetcher), null);
  assert.equal(await verifyAccessToken('eyJhbGciOiJub25lIn0.e30.', config, fetcher), null);
  assert.equal(await verifyAccessToken(jwt, {...config, ACCESS_TEAM_DOMAIN: 'https://attacker.test'}, fetcher), null);
});
test('untrusted identity headers are removed before routing', async () => {
  const request = new Request('https://example.test', {headers: {'x-domainradar-user': 'admin', 'oai-authenticated-user-id': 'owner'}});
  assert.equal(identityRequest(request, null).headers.get('x-domainradar-user'), null);
  assert.equal(identityRequest(request, 'access:verified').headers.get('x-domainradar-user'), 'access:verified');
  assert.equal(identityRequest(request, null).headers.get('oai-authenticated-user-id'), null);
});
test('catalogue writer requires a long independent bearer token', async () => {
  const secret = 'a'.repeat(48);
  assert.equal(await isRefreshAuthorized(new Request('https://example.test'), secret), false);
  assert.equal(await isRefreshAuthorized(new Request('https://example.test', {headers: {Authorization: 'Bearer ' + secret}}), secret), true);
  assert.equal(await isRefreshAuthorized(new Request('https://example.test', {headers: {Authorization: 'Bearer ' + secret}}), 'b'.repeat(48)), false);
});
test('AdSense is opt-in and validates real-format publisher and slot IDs', () => {
  assert.equal(adsConfig.enabled, false);
  assert.equal(adsConfig.preview, false);
  assert.equal(validAdUnit('', ''), false);
  assert.equal(validAdUnit('ca-pub-1234567890123456', '1234567890'), true);
  assert.equal(validAdUnit('pub-invalid', '123'), false);
});
