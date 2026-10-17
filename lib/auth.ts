// Sign-in with Google (OpenID Connect, authorization code flow) and a signed
// session cookie. No passwords are stored. The account only exists to keep the
// watchlist (and, later, optional email alerts) across devices.
//
// Settings (Cloudflare → Workers → scopeflux → Settings → Variables and Secrets):
//   GOOGLE_CLIENT_ID      plain text, from Google Cloud Console
//   GOOGLE_CLIENT_SECRET  secret,     from Google Cloud Console
// The session signing key is derived from the client secret, so there is no
// third value to manage. Rotating the secret signs everyone out.

export type AuthConfig = {GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string};
export type Account = {id: string; email: string; name: string};

export const SESSION_COOKIE = 'sf_session';
const STATE_COOKIE = 'sf_oauth';
const SESSION_DAYS = 30;
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

export function authConfigured(config: AuthConfig) {
  return !!config.GOOGLE_CLIENT_ID && !!config.GOOGLE_CLIENT_SECRET && config.GOOGLE_CLIENT_SECRET.length >= 16;
}

const encoder = new TextEncoder();
function base64url(bytes: Uint8Array) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64url(value: string) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function randomToken(bytes = 24) {return base64url(crypto.getRandomValues(new Uint8Array(bytes)));}

const keys = new Map<string, CryptoKey>();
async function signingKey(secret: string) {
  let key = keys.get(secret);
  if (!key) {
    const base = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
    key = await crypto.subtle.deriveKey(
      {name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('scopeflux'), info: encoder.encode('session-cookie-v1')},
      base, {name: 'HMAC', hash: 'SHA-256', length: 256}, false, ['sign', 'verify']);
    keys.clear();
    keys.set(secret, key);
  }
  return key;
}

// value = base64url(JSON payload) + '.' + base64url(HMAC)
export async function sign(payload: object, secret: string) {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(body)));
  return body + '.' + base64url(mac);
}
export async function unsign<T>(value: string | undefined, secret: string): Promise<T | null> {
  if (!value || value.length > 4096) return null;
  const [body, mac, extra] = value.split('.');
  if (!body || !mac || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify('HMAC', await signingKey(secret), fromBase64url(mac) as Uint8Array<ArrayBuffer>, encoder.encode(body));
    return valid ? JSON.parse(new TextDecoder().decode(fromBase64url(body))) as T : null;
  } catch {return null;}
}

function cookie(request: Request, name: string) {
  return request.headers.get('Cookie')?.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'))?.[1];
}
function setCookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

type Session = Account & {exp: number};

/** The signed-in account for this request, or null. Costs no database query. */
export async function currentAccount(request: Request, config: AuthConfig): Promise<Account | null> {
  if (!authConfigured(config)) return null;
  const session = await unsign<Session>(cookie(request, SESSION_COOKIE), config.GOOGLE_CLIENT_SECRET!);
  if (!session || typeof session.id !== 'string' || typeof session.exp !== 'number' || session.exp < Date.now()) return null;
  return {id: session.id, email: String(session.email || ''), name: String(session.name || '')};
}

// Only same-site paths are allowed as the place to return to after sign-in.
export function safeNext(value: string | null) {
  return value && /^\/(?!\/)[\w\-/#?=&.]*$/.test(value) && value.length < 200 ? value : '/#watch';
}

export async function startLogin(request: Request, config: AuthConfig) {
  const url = new URL(request.url);
  const state = randomToken(), nonce = randomToken();
  const next = safeNext(url.searchParams.get('next'));
  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID!, redirect_uri: url.origin + '/account/callback', response_type: 'code',
    scope: 'openid email profile', state, nonce, prompt: 'select_account',
  });
  const stored = await sign({state, nonce, next, exp: Date.now() + 600000}, config.GOOGLE_CLIENT_SECRET!);
  return new Response(null, {status: 302, headers: {Location: GOOGLE_AUTH + '?' + params, 'Set-Cookie': setCookie(STATE_COOKIE, stored, 600), 'Cache-Control': 'no-store'}});
}

type IdToken = {iss?: string; aud?: string; sub?: string; email?: string; email_verified?: boolean; name?: string; nonce?: string; exp?: number};

/** Checks the claims of an ID token that came straight from Google's token endpoint over TLS. */
export function readIdToken(token: string, clientId: string, nonce: string, now = Date.now()): Account | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(parts[1]))) as IdToken;
    if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') return null;
    if (claims.aud !== clientId || claims.nonce !== nonce || !claims.sub || typeof claims.exp !== 'number' || claims.exp * 1000 < now) return null;
    if (!claims.email || claims.email_verified !== true) return null;
    return {id: 'google:' + claims.sub, email: claims.email.slice(0, 254), name: (claims.name || '').slice(0, 100)};
  } catch {return null;}
}

export async function finishLogin(request: Request, config: AuthConfig, db: D1Database | undefined, fetcher: typeof fetch = fetch) {
  const url = new URL(request.url);
  const fail = (reason: string) => {
    console.warn('sign-in failed', {reason});
    return new Response(null, {status: 302, headers: {Location: '/?signin=failed#watch', 'Set-Cookie': setCookie(STATE_COOKIE, '', 0)}});
  };
  const stored = await unsign<{state: string; nonce: string; next: string; exp: number}>(cookie(request, STATE_COOKIE), config.GOOGLE_CLIENT_SECRET!);
  const code = url.searchParams.get('code');
  if (!stored || stored.exp < Date.now() || stored.state !== url.searchParams.get('state')) return fail('state');
  if (!code) return fail(url.searchParams.get('error') || 'code');
  const response = await fetcher(GOOGLE_TOKEN, {
    method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({code, client_id: config.GOOGLE_CLIENT_ID!, client_secret: config.GOOGLE_CLIENT_SECRET!, redirect_uri: url.origin + '/account/callback', grant_type: 'authorization_code'}),
  });
  if (!response.ok) return fail('token ' + response.status);
  const {id_token} = await response.json() as {id_token?: string};
  const account = id_token ? readIdToken(id_token, config.GOOGLE_CLIENT_ID!, stored.nonce) : null;
  if (!account) return fail('id_token');
  // The session works without this row; a database hiccup must not block sign-in.
  if (db) try {
    const now = new Date().toISOString();
    await db.prepare('INSERT INTO users(id,email,name,created_at,last_login_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,last_login_at=excluded.last_login_at')
      .bind(account.id, account.email, account.name, now, now).run();
  } catch (error) {console.error('saving the account failed', {message: (error as Error)?.message});}
  const session = await sign({...account, exp: Date.now() + SESSION_DAYS * 86400000}, config.GOOGLE_CLIENT_SECRET!);
  const headers = new Headers({Location: stored.next, 'Cache-Control': 'no-store'});
  headers.append('Set-Cookie', setCookie(SESSION_COOKIE, session, SESSION_DAYS * 86400));
  headers.append('Set-Cookie', setCookie(STATE_COOKIE, '', 0));
  return new Response(null, {status: 302, headers});
}

export function logout() {
  return new Response(null, {status: 303, headers: {Location: '/', 'Set-Cookie': setCookie(SESSION_COOKIE, '', 0), 'Cache-Control': 'no-store'}});
}

/** Removes the account and everything stored for it (GDPR erasure). */
export async function deleteAccount(db: D1Database, id: string) {
  await db.batch([
    db.prepare('DELETE FROM watchlist WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM alert_settings WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM alert_sent WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM users WHERE id=?').bind(id),
  ]);
}
