// Listings rendered into the home page HTML, so visitors without JavaScript and
// search engines see real names. Reads only the small per-extension previews
// (catalog_preview), never whole feeds: parsing every feed on each page view
// exceeded the free plan's CPU limit (error 1102).
import {previewCatalog} from './catalog.ts';
import type {Catalogue} from './catalog-loader';
import {releaseTimestamp} from './release-time.ts';

export const INITIAL_LIMIT = 100;

export async function initialCatalogue(db: D1Database | undefined, now = Date.now()): Promise<Catalogue | undefined> {
  if (!db) return undefined;
  try {
    const {records, feeds} = await previewCatalog(db, now);
    const week = now + 7 * 86400000;
    const soon = records
      .filter(record => releaseTimestamp(record.drop) <= week)
      .sort((a, b) => releaseTimestamp(a.drop) - releaseTimestamp(b.drop))
      .slice(0, INITIAL_LIMIT);
    return soon.length ? {records: soon, feeds} : undefined;
  } catch {
    return undefined;
  }
}
