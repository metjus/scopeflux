// The Guardian Open Platform: Guardian articles that mention the topic, counted
// per UTC day of publication. Free developer key (secret GUARDIAN_API_KEY).
// One newspaper, the same in every market. One request returns at most 200
// articles; when there are more, the older days are unknown (null), never zero.
import { SOURCES } from '../config.mjs';
import { fetchJson, SourceError } from '../http.mjs';
import { dayRange, fillSeries, isoDay } from '../dates.mjs';

const SOURCE = 'The Guardian';
export const PAGE_SIZE = 200; // the API maximum

export function searchUrl(text, fromDay, toDay, apiKey) {
  const params = new URLSearchParams({
    q: '"' + text.replace(/"/g, '') + '"', // quotes: the exact name, not any of its words
    'from-date': fromDay,
    'to-date': toDay,
    'use-date': 'published',
    'order-by': 'newest',
    'page-size': String(PAGE_SIZE),
    'api-key': apiKey,
  });
  return 'https://content.guardianapis.com/search?' + params;
}

// topic = { searchText } → { source, unit, series, fetchedAt, note? }
export async function getDailySeries(topic, market, days, { fetcher = fetch, now = Date.now(), apiKey } = {}) {
  if (!apiKey)
    throw new SourceError(SOURCE, 'NOT_CONFIGURED', 'The Guardian is not connected yet (no API key).');
  if (!topic.searchText || topic.searchText.length < 2)
    throw new SourceError(SOURCE, 'NO_MATCH', 'This topic name is too short for a news search.');
  const dates = dayRange(days, now);
  const data = await fetchJson(searchUrl(topic.searchText, dates[0], dates.at(-1), apiKey), {
    source: SOURCE,
    fetcher,
    maxBytes: 2_000_000,
  });
  const answer = data?.response;
  if (answer?.status !== 'ok' || !Array.isArray(answer.results))
    throw new SourceError(SOURCE, 'BAD_RESPONSE', 'The Guardian returned an unexpected answer');

  const counts = {};
  let oldest = null;
  for (const article of answer.results) {
    const time = Date.parse(article.webPublicationDate);
    if (!Number.isFinite(time)) continue;
    const day = isoDay(time);
    counts[day] = (counts[day] ?? 0) + 1;
    if (oldest === null || day < oldest) oldest = day;
  }
  const capped = answer.total > answer.results.length;
  let series = fillSeries(dates, counts);
  // More articles than one page: days up to the oldest returned one are incomplete.
  if (capped && oldest) series = series.map(p => (p.date <= oldest ? { ...p, value: null } : p));
  return {
    source: 'news',
    unit: SOURCES.news.unit,
    series,
    fetchedAt: new Date(now).toISOString(),
    ...(capped ? { note: 'More than 200 Guardian articles: older days are not counted.' } : {}),
  };
}
