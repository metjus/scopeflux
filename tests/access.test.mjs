import {test} from 'node:test';
import assert from 'node:assert/strict';
import {identityRequest, isRefreshAuthorized} from '../lib/access.ts';
import {currentAccount, finishLogin, readIdToken, safeNext, sign, startLogin, SESSION_COOKIE} from '../lib/auth.ts';
import {validAdUnit, adsConfig} from '../lib/ads-config.ts';
const config = {GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-client-secret-value'};
const b64 = value => Buffer.from(value).toString('base64url');
const idToken = claims => b64('{"alg":"RS256"}') + '.' + b64(JSON.stringify({iss: 'https://accounts.google.com', aud: config.GOOGLE_CLIENT_ID, sub: '42', email: 'person@example.com', email_verified: true, name: 'Person', nonce: 'n1', exp: Date.now() / 1000 + 300, ...claims})) + '.sig';
test('Google sign-in: login redirects to Google with state, callback creates a signed session', async () => {
  const start = await startLogin(new Request('https://scopeflux.test/account/login?next=/how-it-works'), config);
  assert.equal(start.status, 302);
  const location = new URL(start.headers.get('Location'));
  assert.equal(location.origin + location.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(location.searchParams.get('redirect_uri'), 'https://scopeflux.test/account/callback');
  const stateCookie = start.headers.get('Set-Cookie').split(';')[0];
  assert.match(start.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  const state = location.searchParams.get('state'), nonce = location.searchParams.get('nonce');
  const fetcher = async (url, init) => {assert.equal(url, 'https://oauth2.googleapis.com/token'); assert.match(String(init.body), /client_secret=test-client-secret-value/); return Response.json({id_token: idToken({nonce})});};
  const done = await finishLogin(new Request('https://scopeflux.test/account/callback?code=abc&state=' + state, {headers: {Cookie: stateCookie}}), config, undefined, fetcher);
  assert.equal(done.headers.get('Location'), '/how-it-works');
  const session = done.headers.getSetCookie().find(value => value.startsWith(SESSION_COOKIE + '='));
  assert.ok(session);
  const account = await currentAccount(new Request('https://scopeflux.test/', {headers: {Cookie: session.split(';')[0]}}), config);
  assert.deepEqual(account, {id: 'google:42', email: 'person@example.com', name: 'Person'});
  // A wrong state never reaches Google's token endpoint.
  const forged = await finishLogin(new Request('https://scopeflux.test/account/callback?code=abc&state=other', {headers: {Cookie: stateCookie}}), config, undefined, async () => {throw new Error('must not be called');});
  assert.match(forged.headers.get('Location'), /signin=failed/);
});
test('Google sign-in rejects tampered sessions and invalid ID tokens', async () => {
  const good = await sign({id: 'google:1', email: 'a@b.c', name: 'A', exp: Date.now() + 60000}, config.GOOGLE_CLIENT_SECRET);
  const ok = cookie => currentAccount(new Request('https://x.test/', {headers: {Cookie: SESSION_COOKIE + '=' + cookie}}), config);
  assert.ok(await ok(good));
  assert.equal(await ok(good.slice(0, -2) + 'AA'), null);
  assert.equal(await ok(b64(JSON.stringify({id: 'google:1', exp: Date.now() + 60000})) + '.' + good.split('.')[1]), null);
  assert.equal(await ok(await sign({id: 'google:1', exp: Date.now() - 1}, config.GOOGLE_CLIENT_SECRET)), null);
  assert.equal(await ok(await sign({id: 'google:1', exp: Date.now() + 60000}, 'another-secret-value-xx')), null);
  assert.equal(await currentAccount(new Request('https://x.test/', {headers: {Cookie: SESSION_COOKIE + '=' + good}}), {}), null);
  for (const claims of [{aud: 'other'}, {iss: 'https://evil.test'}, {nonce: 'n2'}, {email_verified: false}, {exp: 1}]) assert.equal(readIdToken(idToken(claims), config.GOOGLE_CLIENT_ID, 'n1'), null);
  assert.equal(readIdToken(idToken({}), config.GOOGLE_CLIENT_ID, 'n1').id, 'google:42');
  assert.equal(safeNext('https://evil.test'), '/#watch');
  assert.equal(safeNext('//evil.test'), '/#watch');
  assert.equal(safeNext('/sources'), '/sources');
});
test('untrusted identity headers are removed before routing', async () => {
  const request = new Request('https://example.test', {headers: {'x-domainradar-user': 'admin', 'oai-authenticated-user-id': 'owner'}});
  assert.equal(identityRequest(request, null).headers.get('x-domainradar-user'), null);
  assert.equal(identityRequest(request, {id: 'google:1', email: 'a@b.c', name: 'Ann'}).headers.get('x-domainradar-user'), 'google:1');
  assert.equal(identityRequest(new Request('https://example.test', {headers: {'x-domainradar-email': 'forged'}}), null).headers.get('x-domainradar-email'), null);
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
