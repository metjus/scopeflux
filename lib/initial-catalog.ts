// Listings rendered into the home page HTML, so visitors without JavaScript and
// search engines see real names. Reads only the small per-extension previews
// (catalog_preview), never whole feeds: parsing every feed on each page view
// exceeded the free plan's CPU limit (error 1102). The browser then loads the
// full list as before.
import {CATALOG_TLDS, previewFeedInfo} from './catalog.ts';
import type {Catalogue} from './catalog-loader';
import type {DomainRecord} from './domains';
import {releaseTimestamp} from './release-time.ts';

export const INITIAL_LIMIT = 100;

export async function initialCatalogue(db: D1Database | undefined, now = Date.now()): Promise<Catalogue | undefined> {
  if (!db) return undefined;
  try {
    const rows = (await db.prepare('SELECT tld,records,total,checked_at FROM catalog_preview').all<{tld: string; records: string; total: number; checked_at: string}>()).results
      .filter(row => CATALOG_TLDS.includes(row.tld));
    if (!rows.length) return undefined;
    const week = now + 7 * 86400000;
    const records = rows.flatMap(row => JSON.parse(row.records) as DomainRecord[])
      .filter(record => {const at = releaseTimestamp(record.drop); return at >= now && at <= week;})
      .sort((a, b) => releaseTimestamp(a.drop) - releaseTimestamp(b.drop))
      .slice(0, INITIAL_LIMIT);
    if (!records.length) return undefined;
    return {records, feeds: rows.map(row => previewFeedInfo(row.tld, row.total, row.checked_at))};
  } catch {
    return undefined;
  }
}
