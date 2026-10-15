/** Cloudflare Access is the sole identity authority for the standalone export. */
export type AccessConfig = {ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string};
type JwtPayload = {iss?: string; aud?: string | string[]; exp?: number; nbf?: number; sub?: string};
const keys = new Map<string, {until: number; jwks: JsonWebKey[]}>();
export function teamOrigin(config: AccessConfig): string | null {
  const value = config.ACCESS_TEAM_DOMAIN?.replace(/\/$/, '');
  return value && /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(value) ? value : null;
}
function decode(value: string): Uint8Array {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
export async function verifyAccessToken(token: string, config: AccessConfig, fetcher: typeof fetch = fetch): Promise<string | null> {
  const issuer = teamOrigin(config);
  if (!issuer || !config.ACCESS_AUD || token.length > 16000) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0]))) as {alg?: string; kid?: string};
    const payload = JSON.parse(new TextDecoder().decode(decode(parts[1]))) as JwtPayload;
    const now = Date.now() / 1000;
    if (header.alg !== 'RS256' || !header.kid || payload.iss !== issuer || !payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 256 || typeof payload.exp !== 'number' || payload.exp <= now || payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf > now)) return null;
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(config.ACCESS_AUD)) return null;
    let cached = keys.get(issuer);
    if (!cached || cached.until < Date.now()) {
      const response = await fetcher(issuer + '/cdn-cgi/access/certs', {signal: AbortSignal.timeout(5000), redirect: 'error'});
      if (!response.ok) return null;
      const json = await response.json() as {keys?: JsonWebKey[]};
      if (!Array.isArray(json.keys)) return null;
      cached = {until: Date.now() + 900000, jwks: json.keys.slice(0, 20)};
      if (keys.size > 8) keys.clear();
      keys.set(issuer, cached);
    }
    const jwk = cached.jwks.find(key => (key as JsonWebKey & {kid?: string}).kid === header.kid && key.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]) as Uint8Array<ArrayBuffer>, new TextEncoder().encode(parts[0] + '.' + parts[1]));
    return valid ? 'access:' + payload.sub : null;
  } catch {return null;}
}
export async function identify(request: Request, config: AccessConfig, fetcher: typeof fetch = fetch) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || request.headers.get('Cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  return token ? verifyAccessToken(token, config, fetcher) : null;
}
export function identityRequest(request: Request, user: string | null): Request {
  const headers = new Headers(request.headers);
  for (const key of [...headers.keys()]) if (key === 'x-domainradar-user' || key.startsWith('oai-authenticated-user-')) headers.delete(key);
  if (user) headers.set('x-domainradar-user', user);
  return new Request(request, {headers});
}
export async function isRefreshAuthorized(request: Request, secret?: string) {
  const supplied = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!secret || secret.length < 32 || !supplied || supplied.length > 1024) return false;
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([hash(secret), hash(supplied)]);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}
