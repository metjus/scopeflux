import type {DomainRecord} from './domains';
import {isRecentDate} from './release-time.ts';

export const PUBLIC_HISTORY_TLDS = ['com', 'net', 'org', 'ai', 'eu', 'io', 'app'];
export const publicHistoryUrl = (tld: string) => `https://www.expireddomains.net/tld/${tld}/`;
export const historicalDate = (record: DomainRecord) => record.reportedDrop?.at || record.drop;

export function sourceDropTime(label: string, sourceDate: string): string | null {
  const relative = label.match(/^(Today|Yesterday) ([01]\d|2[0-3]):([0-5]\d)$/i);
  const reference = Date.parse(sourceDate);
  if (!relative || !Number.isFinite(reference)) return null;
  const midnight = Date.parse(new Date(reference).toISOString().slice(0, 10) + 'T00:00:00.000Z');
  return new Date(midnight - (/yesterday/i.test(relative[1]) ? 86400000 : 0) + Number(relative[2]) * 3600000 + Number(relative[3]) * 60000).toISOString();
}

// These public example tables publish UTC times relative to the page's HTTP Date.
// Do not derive a release date from retrieval time or from an undated domain list.
export function parsePublicHistory(html: string, tld: string, sourceDate: string | null, checkedAt: string): DomainRecord[] {
  if (!PUBLIC_HISTORY_TLDS.includes(tld) || !sourceDate || !/All times are\s*(?:<strong>)?UTC/i.test(html)) return [];
  const reference = Date.parse(sourceDate);
  if (!Number.isFinite(reference) || Math.abs(Date.parse(checkedAt) - reference) > 3600000) return [];
  const records = new Map<string, DomainRecord>();
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const domainCell = row[1].match(/<td\b[^>]*class="field_domain"[^>]*>([\s\S]*?)<\/td>/i)?.[1];
    const domain = domainCell?.match(/<a\b[^>]*title="([a-z0-9.-]+)"/i)?.[1]?.toLowerCase();
    const label = row[1].match(/<td\b[^>]*class="field_changes"[^>]*>\s*([^<]+)\s*<\/td>/i)?.[1]?.trim();
    const at = label ? sourceDropTime(label, sourceDate) : null;
    if (!domain || !new RegExp('^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.' + tld + '$').test(domain) || !at) continue;
    if (Date.parse(at) > reference || !isRecentDate(at, Date.parse(checkedAt))) continue;
    records.set(domain, {domain, tld, status: 'Source-reported deletion', expiration: null, drop: null,
      source: 'ExpiredDomains.net', sourceUrl: publicHistoryUrl(tld), checkedAt,
      reportedDrop: {at, label: label!, sourceDate, source: 'ExpiredDomains.net', url: publicHistoryUrl(tld), checkedAt},
      note: 'The public source reports this domain as dropped at the historical time shown. This does not confirm its current registration status or availability. The public preview is a small sample, not a complete deletion list.'});
    if (records.size === 10) break;
  }
  return [...records.values()];
}
