// Owner-only status page. It is served only on the Worker's *.workers.dev
// address (never on scopeflux.io) and only with the password stored in the
// Worker secret STATUS_PASSWORD. Without that secret the page does not exist.
import {readStatus, type StatusRow} from './status-log.ts';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!);

export function isStatusRequest(url: URL) {
  return url.pathname === '/status' && url.hostname.endsWith('.workers.dev');
}

// Compares hashes so the check takes the same time whatever the guess.
async function samePassword(given: string, expected: string) {
  const hash = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [a, b] = await Promise.all([hash(given), hash(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Browsers send the name and password as UTF-8 (the realm asks for it), so a
// password with diacritics (š, č, ž…) must be decoded as UTF-8, not Latin-1.
// Spaces around a copy-pasted password or secret are ignored.
async function authorized(request: Request, password: string) {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.startsWith('Basic ')) return false;
  let decoded = '';
  try { decoded = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6).trim()), c => c.charCodeAt(0))); } catch { return false; }
  return samePassword(decoded.slice(decoded.indexOf(':') + 1).trim(), password.trim());
}

const headers = {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY'};

export async function statusResponse(request: Request, env: {DB?: D1Database; STATUS_PASSWORD?: string}, now = Date.now()) {
  if (!env.STATUS_PASSWORD) return new Response('Not found', {status: 404});
  if (!await authorized(request, env.STATUS_PASSWORD)) {
    return new Response('Password required', {status: 401, headers: {'WWW-Authenticate': 'Basic realm="ScopeFlux status", charset="UTF-8"', 'Cache-Control': 'no-store'}});
  }
  let rows: StatusRow[] = [], problem = '';
  try { if (env.DB) rows = await readStatus(env.DB); } catch (error) { problem = String((error as Error)?.message ?? error); }
  return new Response(renderStatus(rows, problem, now), {headers});
}

function ago(value: string | null, now: number) {
  if (!value) return '—';
  const minutes = Math.round((now - Date.parse(value)) / 60000);
  const text = minutes < 1 ? 'just now' : minutes < 90 ? minutes + ' min ago' : minutes < 2880 ? Math.round(minutes / 60) + ' h ago' : Math.round(minutes / 1440) + ' days ago';
  return `<span title="${esc(value)}">${esc(text)}</span>`;
}

const LABELS: Record<string, string> = {cron: 'Hourly cron job', api: 'Domains API', storage: 'Database (D1) writes'};
const label = (key: string) => key.startsWith('feed:') ? 'List .' + key.slice(5) : LABELS[key] ?? key;

export function renderStatus(rows: StatusRow[], problem: string, now = Date.now()) {
  const state = (row: StatusRow) => row.error_at && (!row.ok_at || row.error_at > row.ok_at) ? '<b class="bad">Failing</b>' : row.ok_at ? '<b class="ok">OK</b>' : '—';
  const body = rows.map(row => `<tr><td>${esc(label(row.key))}</td><td>${state(row)}</td><td>${ago(row.ok_at, now)}</td><td>${ago(row.error_at, now)}</td><td>${esc(row.errors)}</td><td class="msg">${esc(row.error ?? '')}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>ScopeFlux status</title>
<style>body{font:14px system-ui,sans-serif;background:#0d1019;color:#e8e9f2;margin:0;padding:24px}h1{font-size:20px}table{border-collapse:collapse;width:100%;max-width:1100px}td,th{border-bottom:1px solid #2a3046;padding:8px;text-align:left;vertical-align:top}th{color:#9aa0b8;font-weight:500}.ok{color:#7ee1ce}.bad{color:#ff8f8f}.msg{font-family:ui-monospace,monospace;font-size:12px;color:#c9cbe0;word-break:break-word}p{color:#9aa0b8}</style></head>
<body><h1>ScopeFlux status</h1><p>Generated ${esc(new Date(now).toISOString())}. Times are relative; hover for the exact UTC time. Error counts are totals since the log started.</p>
${problem ? `<p class="bad">The status log could not be read: ${esc(problem)}</p>` : ''}
${rows.length ? `<table><thead><tr><th>Part</th><th>State</th><th>Last success</th><th>Last error</th><th>Errors</th><th>Last error message</th></tr></thead><tbody>${body}</tbody></table>` : '<p>Nothing recorded yet. Entries appear after the next visit or the next hourly cron run.</p>'}
<p>More detail: Cloudflare dashboard → Workers &amp; Pages → scopeflux → Logs.</p></body></html>`;
}
