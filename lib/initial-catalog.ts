// Listings rendered into the home page HTML, so visitors without JavaScript and
// search engines see real names. Only the default view (next 7 days), capped,
// keeps the page small; the browser then loads the full list as before.
import {savedCatalog} from './catalog.ts';
import type {Catalogue} from './catalog-loader';
import {releaseTimestamp} from './release-time.ts';

export const INITIAL_LIMIT = 300;

export async function initialCatalogue(db: D1Database | undefined, now = Date.now()): Promise<Catalogue | undefined> {
  if (!db) return undefined;
  try {
    const {records, feeds} = await savedCatalog(db);
    if (!records.length) return undefined;
    const week = now + 7 * 86400000;
    const soon = records
      .filter(record => {const at = releaseTimestamp(record.drop); return at >= now && at <= week;})
      .sort((a, b) => releaseTimestamp(a.drop) - releaseTimestamp(b.drop))
      .slice(0, INITIAL_LIMIT);
    return {records: soon, feeds};
  } catch {
    return undefined;
  }
}
