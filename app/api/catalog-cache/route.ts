import {isRefreshAuthorized} from '../../../lib/access';
import {env} from 'cloudflare:workers';
import {saveCatalogFeed} from '../../../lib/catalog-history';
import type {DomainRecord} from '../../../lib/domains';
import {releaseTimestamp, isRecentDate} from '../../../lib/release-time';
import {PUBLIC_HISTORY_TLDS, publicHistoryUrl, sourceDropTime} from '../../../lib/public-history';

type SavedFeed = {tld: string; records: DomainRecord[]; checkedAt: string};
// worker.ts requires the independent CATALOG_REFRESH_TOKEN for both methods.
export async function GET(req: Request) {
  if (!await isRefreshAuthorized(req, env.CATALOG_REFRESH_TOKEN)) return Response.json({error: 'A valid catalogue refresh token is required.'}, {status: 401});
  if (!env.DB) return Response.json({error: 'Database unavailable.'}, {status: 503});
  const result = await env.DB.prepare("SELECT tld,checked_at,records FROM catalog_feeds WHERE tld IN ('ai','eu') OR tld LIKE 'history:%'").all<{tld: string; checked_at: string; records: string}>();
  const summary = (r: typeof result.results[number]) => ({tld: r.tld.replace('history:', ''), checkedAt: r.checked_at, count: JSON.parse(r.records).length});
  return Response.json({feeds: result.results.filter(r => !r.tld.startsWith('history:')).map(summary), historyFeeds: result.results.filter(r => r.tld.startsWith('history:')).map(summary), refreshInstructions: 'Follow CATALOG_UPDATES.md. Fetch only public source previews, preserve original dates and retrieval timestamps, and verify readback. Never access member-only lists.'});
}
function validateRetrieval(checkedAt: string) {
  const stamp = Date.parse(checkedAt);
  if (!Number.isFinite(stamp) || Math.abs(Date.now() - stamp) > 3600000) throw new Error('The retrieval timestamp must be within the last hour.');
}
function validDomain(record: DomainRecord, tld: string) {
  return record.tld === tld && new RegExp('^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.' + tld + '$').test(record.domain);
}
export async function POST(req: Request) {
  if (!await isRefreshAuthorized(req, env.CATALOG_REFRESH_TOKEN)) return Response.json({error: 'A valid catalogue refresh token is required.'}, {status: 401});
  if (!env.DB) return Response.json({error: 'Database unavailable.'}, {status: 503});
  try {
    const payload = await req.json() as {feeds?: SavedFeed[]; historyFeeds?: SavedFeed[]};
    const feeds = payload.feeds ?? [], historyFeeds = payload.historyFeeds ?? [];
    if (!Array.isArray(feeds) || !Array.isArray(historyFeeds) || feeds.length > 2 || historyFeeds.length > 7 || !feeds.length && !historyFeeds.length) throw new Error('Supply public preview feeds.');
    if (new Set(feeds.map(f => f.tld)).size !== feeds.length || new Set(historyFeeds.map(f => f.tld)).size !== historyFeeds.length) throw new Error('Duplicate source feed.');
    // Validate the whole request before modifying any saved source.
    for (const f of feeds) {
      if (!['ai', 'eu'].includes(f.tld) || !Array.isArray(f.records) || f.records.length < 1 || f.records.length > 100) throw new Error('Invalid public preview feed.');
      validateRetrieval(f.checkedAt);
      for (const r of f.records) {
        if (!validDomain(r, f.tld) || r.reportedDrop || !r.drop || !/^\d{4}-\d{2}-\d{2}$/.test(r.drop) || !Number.isFinite(releaseTimestamp(r.drop)) || r.checkedAt !== f.checkedAt || r.source !== 'Backorder.com' || r.sourceUrl !== 'https://backorder.com/en/pending-delete/' + f.tld) throw new Error('Invalid source listing.');
      }
    }
    for (const f of historyFeeds) {
      if (!PUBLIC_HISTORY_TLDS.includes(f.tld) || !Array.isArray(f.records) || f.records.length < 1 || f.records.length > 10) throw new Error('Invalid public history preview.');
      validateRetrieval(f.checkedAt);
      for (const r of f.records) {
        const report = r.reportedDrop;
        if (!validDomain(r, f.tld) || r.drop !== null || r.expiration !== null || r.status !== 'Source-reported deletion' || r.source !== 'ExpiredDomains.net' || r.sourceUrl !== publicHistoryUrl(f.tld) || r.checkedAt !== f.checkedAt || !report || report.source !== r.source || report.url !== r.sourceUrl || report.checkedAt !== f.checkedAt || Math.abs(Date.parse(report.sourceDate) - Date.parse(f.checkedAt)) > 3600000 || report.at !== sourceDropTime(report.label, report.sourceDate) || !isRecentDate(report.at) || Date.parse(report.at) > Date.parse(report.sourceDate)) throw new Error('Invalid historical source listing.');
      }
    }
    for (const f of feeds) await saveCatalogFeed(env.DB, f.tld, f.records, f.checkedAt);
    for (const f of historyFeeds) await saveCatalogFeed(env.DB, 'history:' + f.tld, f.records, f.checkedAt);
    const summary = (f: SavedFeed) => ({tld: f.tld, count: f.records.length, checkedAt: f.checkedAt});
    return Response.json({ok: true, feeds: feeds.map(summary), historyFeeds: historyFeeds.map(summary)});
  } catch (e) {return Response.json({error: (e as Error).message}, {status: 400});}
}
