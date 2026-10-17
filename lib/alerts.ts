// Watchlist email alerts: an opt-in email shortly before a saved domain is
// expected to be released. Off by default; turned on in the account menu and
// off again there or with the link in every email (no sign-in needed).
//
// Settings (Cloudflare → Workers → scopeflux → Settings → Variables and Secrets):
//   RESEND_API_KEY  secret, from resend.com (sending domain scopeflux.io verified)
//   ALERT_FROM      optional, defaults to "ScopeFlux <alerts@scopeflux.io>"
// Unsubscribe links are signed with GOOGLE_CLIENT_SECRET, like sessions.
import {releaseAlertEmail, type AlertDomain} from './alert-email.ts';
import {sign, unsign} from './auth.ts';
import {SITE_URL} from './seo.ts';
import {releaseTimestamp} from './release-time.ts';
import type {DomainRecord} from './domains';

export type AlertConfig = {GOOGLE_CLIENT_SECRET?: string; RESEND_API_KEY?: string; ALERT_FROM?: string};

export const ALERT_TABLES_SQL = [
  'CREATE TABLE IF NOT EXISTS alert_settings (user_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, updated_at TEXT NOT NULL, checked_at TEXT)',
  'CREATE TABLE IF NOT EXISTS alert_sent (user_id TEXT NOT NULL, domain TEXT NOT NULL, release_at TEXT NOT NULL, sent_at TEXT NOT NULL, PRIMARY KEY (user_id, domain, release_at))',
];
// Own cron schedule (wrangler.json), so alerts never share the D1 query budget
// of a catalogue refresh. Each run handles the users checked longest ago.
export const ALERT_CRON = '7 * * * *';
export const ALERT_WINDOW_MS = 24 * 3600000;
export const ALERT_USERS_PER_RUN = 50;
const DEFAULT_FROM = 'ScopeFlux <alerts@scopeflux.io>';

export const alertsAvailable = (config: AlertConfig) => !!config.RESEND_API_KEY && !!config.GOOGLE_CLIENT_SECRET;

export async function alertsEnabled(db: D1Database, userId: string): Promise<boolean> {
  const row = await db.prepare('SELECT enabled FROM alert_settings WHERE user_id=?').bind(userId).first<{enabled: number}>();
  return row?.enabled === 1;
}

export async function setAlerts(db: D1Database, userId: string, enabled: boolean, now = new Date().toISOString()) {
  await db.prepare('INSERT INTO alert_settings(user_id,enabled,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at')
    .bind(userId, enabled ? 1 : 0, now).run();
}

// Unsubscribe links do not expire: an old email must still be able to stop alerts.
export async function unsubscribeUrl(userId: string, secret: string) {
  return SITE_URL + '/account/alerts/off?t=' + encodeURIComponent(await sign({uid: userId, purpose: 'alerts-off'}, secret));
}
export async function readUnsubscribe(token: string | null, secret: string): Promise<string | null> {
  const value = await unsign<{uid?: string; purpose?: string}>(token || undefined, secret);
  return value?.purpose === 'alerts-off' && typeof value.uid === 'string' ? value.uid : null;
}

/** Saved domains expected within the alert window that were not emailed for that date yet. */
export function dueDomains(records: DomainRecord[], sent: Set<string>, now = Date.now()): AlertDomain[] {
  return records
    .filter(record => {
      if (!record.drop) return false;
      const at = releaseTimestamp(record.drop);
      return at > now && at <= now + ALERT_WINDOW_MS && !sent.has(record.domain + '|' + record.drop);
    })
    .sort((a, b) => releaseTimestamp(a.drop!) - releaseTimestamp(b.drop!))
    .map(record => ({domain: record.domain, drop: record.drop!, source: record.source}));
}

type Run = {checked: number; emails: number; error?: string};

/** One alert run: a fixed handful of queries and one Resend batch request, whatever the user count. */
export async function sendAlerts(db: D1Database, config: AlertConfig, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Run> {
  if (!alertsAvailable(config)) return {checked: 0, emails: 0, error: 'not configured'};
  const users = (await db.prepare('SELECT u.id,u.email,u.name FROM alert_settings a JOIN users u ON u.id=a.user_id WHERE a.enabled=1 ORDER BY a.checked_at IS NOT NULL, a.checked_at LIMIT ?')
    .bind(ALERT_USERS_PER_RUN).all<{id: string; email: string; name: string}>()).results;
  if (!users.length) return {checked: 0, emails: 0};
  const ids = users.map(user => user.id), marks = ids.map(() => '?').join(',');
  const saved = (await db.prepare(`SELECT user_id,snapshot FROM watchlist WHERE user_id IN (${marks})`).bind(...ids).all<{user_id: string; snapshot: string}>()).results;
  const sentRows = (await db.prepare(`SELECT user_id,domain,release_at FROM alert_sent WHERE user_id IN (${marks})`).bind(...ids).all<{user_id: string; domain: string; release_at: string}>()).results;

  const messages: {user: typeof users[number]; domains: AlertDomain[]; body: object}[] = [];
  for (const user of users) {
    const records = saved.filter(row => row.user_id === user.id).map(row => {try {return JSON.parse(row.snapshot) as DomainRecord;} catch {return null;}}).filter((r): r is DomainRecord => !!r);
    const sent = new Set(sentRows.filter(row => row.user_id === user.id).map(row => row.domain + '|' + row.release_at));
    const domains = dueDomains(records, sent, now);
    if (!domains.length || !user.email) continue;
    const off = await unsubscribeUrl(user.id, config.GOOGLE_CLIENT_SECRET!);
    const mail = releaseAlertEmail({name: user.name, domains, settingsUrl: off, now});
    messages.push({user, domains, body: {
      from: config.ALERT_FROM || DEFAULT_FROM, to: [user.email], subject: mail.subject, html: mail.html, text: mail.text,
      headers: {'List-Unsubscribe': `<${off}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'},
    }});
  }

  const stamp = new Date(now).toISOString();
  let error: string | undefined;
  if (messages.length) {
    const response = await fetcher('https://api.resend.com/emails/batch', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: {'Authorization': 'Bearer ' + config.RESEND_API_KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify(messages.map(message => message.body)),
    });
    if (!response.ok) error = 'Resend ' + response.status;
  }
  // Mark users as checked even without email, so the next run moves on to others.
  // Sent domains are recorded only after Resend accepted the batch.
  const writes = [
    ...ids.map(id => db.prepare('UPDATE alert_settings SET checked_at=? WHERE user_id=?').bind(stamp, id)),
    ...(error ? [] : messages.flatMap(message => message.domains.map(domain =>
      db.prepare('INSERT OR IGNORE INTO alert_sent(user_id,domain,release_at,sent_at) VALUES(?,?,?,?)').bind(message.user.id, domain.domain, domain.drop, stamp)))),
    db.prepare('DELETE FROM alert_sent WHERE sent_at<?').bind(new Date(now - 40 * 86400000).toISOString()),
  ];
  await db.batch(writes);
  return {checked: users.length, emails: error ? 0 : messages.length, error};
}

export function unsubscribedPage() {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Alerts turned off · ScopeFlux</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d1019;color:#f0f2fa;font:16px/1.6 system-ui,sans-serif}main{max-width:420px;padding:32px;text-align:center}a{color:#7ee1ce}</style></head>
<body><main><h1 style="font-size:24px">Email alerts are off.</h1><p>You will not get any more watchlist emails from ScopeFlux. You can turn them back on in your account menu at any time.</p><p><a href="/">Back to ScopeFlux</a></p></main></body></html>`,
  {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}});
}
