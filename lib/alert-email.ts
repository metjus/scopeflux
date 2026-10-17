// The "release soon" email for watchlist alerts. Email clients ignore most CSS,
// so the layout uses tables and inline styles only, and every email also has a
// plain-text version. Times are shown in UTC (readers are in any time zone).
// Sending: lib/alerts.ts.
import {SITE_URL} from './seo.ts';

export type AlertDomain = {domain: string; drop: string; source?: string};
export type AlertEmail = {subject: string; html: string; text: string};

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));

function when(drop: string, now: number) {
  const dateOnly = drop.length === 10;
  const at = new Date(dateOnly ? drop + 'T12:00:00Z' : drop);
  const date = at.toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'});
  const time = dateOnly ? '' : at.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'});
  const days = Math.round((Date.parse(dateOnly ? drop + 'T00:00:00Z' : drop) - now) / 86400000);
  const label = days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
  return {label, date: time ? `${date}, ${time} UTC` : date};
}

export function releaseAlertEmail({name, domains, settingsUrl = SITE_URL + '/#watch', now = Date.now()}: {name?: string; domains: AlertDomain[]; settingsUrl?: string; now?: number}): AlertEmail {
  const first = domains[0]?.domain ?? 'A domain';
  const subject = domains.length === 1 ? `${first} may be released soon` : `${domains.length} domains on your watchlist may be released soon`;
  const greeting = name ? `Hi ${escape(name.split(' ')[0])},` : 'Hi,';
  const rows = domains.map(item => {
    const {label, date} = when(item.drop, now);
    const [label1, ...rest] = item.domain.split('.');
    const link = `${SITE_URL}/#watch`;
    return `<tr><td style="padding:16px 20px;border-top:1px solid #e6e3f2">
      <a href="${link}" style="font:600 18px/1.3 Arial,Helvetica,sans-serif;color:#1d1b33;text-decoration:none">${escape(label1)}<span style="color:#0f8f7e">.${escape(rest.join('.'))}</span></a>
      <div style="font:13px/1.5 Arial,Helvetica,sans-serif;color:#6b6889;margin-top:4px">Expected ${escape(date)}${item.source ? ' · ' + escape(item.source) : ''}</div>
    </td><td align="right" style="padding:16px 20px;border-top:1px solid #e6e3f2;white-space:nowrap">
      <span style="display:inline-block;padding:5px 11px;border-radius:20px;background:#e9f8f5;color:#0b6f62;font:700 12px Arial,Helvetica,sans-serif">${label}</span>
    </td></tr>`;
  }).join('');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f1fa">
<div style="display:none;max-height:0;overflow:hidden">${escape(domains.map(d => d.domain).join(', '))} on your ScopeFlux watchlist.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1fa"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="background:#0d1019;border-radius:14px 14px 0 0;padding:22px 28px">
    <span style="font:800 20px Arial,Helvetica,sans-serif;color:#f0f2fa">Scope</span><span style="font:800 20px Arial,Helvetica,sans-serif;color:#b09aff">Flux</span>
    <div style="font:600 10px Arial,Helvetica,sans-serif;letter-spacing:1.6px;color:#7ee1ce;margin-top:6px">WATCHLIST ALERT</div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:28px 28px 8px">
    <h1 style="margin:0 0 12px;font:700 24px/1.3 Arial,Helvetica,sans-serif;color:#1d1b33">${domains.length === 1 ? 'A name you follow may soon be free.' : 'Names you follow may soon be free.'}</h1>
    <p style="margin:0 0 6px;font:15px/1.6 Arial,Helvetica,sans-serif;color:#45425f">${greeting}</p>
    <p style="margin:0 0 20px;font:15px/1.6 Arial,Helvetica,sans-serif;color:#45425f">${domains.length === 1 ? 'This domain on your watchlist is' : 'These domains on your watchlist are'} expected to be released soon. Dates are estimates from public sources, and the owner can still renew.</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:0 8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6e3f2;border-top:0;border-radius:10px;border-collapse:separate">${rows}</table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:24px 28px 28px;border-radius:0 0 14px 14px">
    <a href="${SITE_URL}/#watch" style="display:inline-block;padding:13px 22px;border-radius:9px;background:#7ee1ce;color:#0d1019;font:700 15px Arial,Helvetica,sans-serif;text-decoration:none">Open my watchlist</a>
    <p style="margin:20px 0 0;font:13px/1.6 Arial,Helvetica,sans-serif;color:#6b6889">Tip: popular names are often taken within minutes of release. Have your registrar account ready, or use a backorder.</p>
  </td></tr>
  <tr><td style="padding:20px 28px;font:12px/1.6 Arial,Helvetica,sans-serif;color:#8a87a6;text-align:center">
    You get this email because you turned on alerts for your ScopeFlux watchlist.<br>
    <a href="${settingsUrl}" style="color:#6b5bd6">Turn off alerts</a> · <a href="${SITE_URL}/privacy" style="color:#6b5bd6">Privacy</a><br>
    ScopeFlux · Matúš Šturdík · Nová 407, Veľká Mača, Slovakia
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    domains.length === 1 ? 'A name you follow may soon be free.' : 'Names you follow may soon be free.', '',
    name ? `Hi ${name.split(' ')[0]},` : 'Hi,', '',
    ...domains.map(item => {const {label, date} = when(item.drop, now); return `- ${item.domain}: ${label} (${date})`;}), '',
    'Dates are estimates from public sources, and the owner can still renew.',
    `Open your watchlist: ${SITE_URL}/#watch`, '',
    `Turn off alerts: ${settingsUrl}`,
    'ScopeFlux · Matúš Šturdík · Nová 407, Veľká Mača, Slovakia',
  ].join('\n');
  return {subject, html, text};
}
