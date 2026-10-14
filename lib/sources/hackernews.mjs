// Hacker News via the Algolia search API: stories whose title mentions the
// topic, counted per UTC day. Global only. Free, no key.
import { SOURCES } from '../config.mjs';
import { fetchJson, SourceError } from '../http.mjs';
import { dayRange, fillSeries, isoDay, DAY_MS } from '../dates.mjs';

const SOURCE = 'Hacker News';
// Algolia returns at most 1000 hits per request.
const MAX_HITS = 1000;

export function searchUrl(text, fromSec, toSec) {
  const params = new URLSearchParams({
    query: text,
    tags: 'story',
    numericFilters: 'created_at_i>=' + fromSec + ',created_at_i<' + toSec,
    hitsPerPage: String(MAX_HITS),
    attributesToRetrieve: 'created_at_i',
    // Titles only, exact words: fewer accidental matches.
    restrictSearchableAttributes: 'title',
    typoTolerance: 'false',
  });
  return 'https://hn.algolia.com/api/v1/search_by_date?' + params;
}

// topic = { searchText } → { source, unit, series, fetchedAt, note? }
// When more than 1000 stories match, only the newest 1000 are returned; days
// older than the oldest returned story are then unknown and set to null.
export async function getDailySeries(topic, market, days, { fetcher = fetch, now = Date.now() } = {}) {
  if (!topic.searchText) throw new SourceError(SOURCE, 'NO_MATCH', 'No search text for this topic.');
  const dates = dayRange(days, now);
  const from = Date.parse(dates[0] + 'T00:00:00Z') / 1000;
  const to = Date.parse(dates.at(-1) + 'T00:00:00Z') / 1000 + DAY_MS / 1000;
  const body = await fetchJson(searchUrl(topic.searchText, from, to), { source: SOURCE, fetcher });
  if (!body || !Array.isArray(body.hits))
    throw new SourceError(SOURCE, 'BAD_RESPONSE', 'Unexpected Hacker News response');

  const counts = {};
  let oldest = null;
  for (const hit of body.hits) {
    if (!Number.isFinite(hit.created_at_i)) continue;
    const day = isoDay(hit.created_at_i * 1000);
    counts[day] = (counts[day] ?? 0) + 1;
    if (oldest === null || day < oldest) oldest = day;
  }
  const truncated = Number(body.nbHits) > body.hits.length;
  let series = fillSeries(dates, counts);
  if (truncated && oldest) {
    // The oldest returned day may itself be partial, so it is unknown too.
    series = series.map(p => (p.date <= oldest ? { ...p, value: null } : p));
  }
  return {
    source: 'hackernews',
    unit: SOURCES.hackernews.unit,
    series,
    fetchedAt: new Date(now).toISOString(),
    ...(truncated ? { note: 'More than 1,000 matching stories: older days are not counted.' } : {}),
  };
}
