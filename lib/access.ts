import type {Account} from './auth.ts';
// Passes the verified account to the app as headers. Headers of the same name
// sent by the visitor are always removed first, so they cannot be forged.
export function identityRequest(request: Request, account: Account | null): Request {
  const headers = new Headers(request.headers);
  for (const key of [...headers.keys()]) if (key.startsWith('x-domainradar-') || key.startsWith('oai-authenticated-user-')) headers.delete(key);
  if (account) {
    headers.set('x-domainradar-user', account.id);
    headers.set('x-domainradar-email', encodeURIComponent(account.email));
    headers.set('x-domainradar-name', encodeURIComponent(account.name));
  }
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
