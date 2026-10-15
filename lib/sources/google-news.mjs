// Google News RSS search: news articles that mention the topic, counted per
// UTC day of publication, in one country edition. Free, no key.
// Google returns at most ~100 articles per search. When that cap is hit, the
// older days are unknown (null), never zero.
import { SOURCES, MARKETS, FEED_USER_AGENT } from '../config.mjs';
import { fetchText, SourceError } from '../http.mjs';
import { dayRange, fillSeries, isoDay } from '../dates.mjs';

const SOURCE = 'Google News';
export const MAX_ITEMS = 100;

export function searchUrl(text, market, days) {
  const edition = MARKETS[market].news; // { hl, gl, ceid }
  const params = new URLSearchParams({
    // Quotes keep multi-word names together; when:Nd limits to the last N days.
    q: (text.includes(' ') ? '"' + text + '"' : text) + ' when:' + days + 'd',
    hl: edition.hl,
    gl: edition.gl,
    ceid: edition.ceid,
  });
  return 'https://news.google.com/rss/search?' + params;
}

// Publication times of the items in an RSS answer (invalid dates skipped).
export function itemDates(xml) {
  if (typeof xml !== 'string' || !/<rss\b/.test(xml))
    throw new SourceError(SOURCE, 'BAD_RESPONSE', 'Google News did not return RSS');
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/g) ?? [];
  const times = items
    .map(item => Date.parse(/<pubDate>([^<]*)<\/pubDate>/.exec(item)?.[1] ?? ''))
    .filter(Number.isFinite);
  return { count: items.length, times };
}

// topic = { searchText } → { source, unit, series, fetchedAt, note? }
export async function getDailySeries(topic, market, days, { fetcher = fetch, now = Date.now() } = {}) {
  if (!topic.searchText || topic.searchText.length < 2)
    throw new SourceError(SOURCE, 'NO_MATCH', 'This topic name is too short for a news search.');
  const dates = dayRange(days, now);
  // One extra day so the last complete day is fully covered.
  const { text } = await fetchText(searchUrl(topic.searchText, market, days + 1), {
    source: SOURCE,
    fetcher,
    accept: 'application/rss+xml, text/xml',
    maxBytes: 2_000_000,
    userAgent: FEED_USER_AGENT,
  });
  const { count, times } = itemDates(text);
  const counts = {};
  let oldest = null;
  for (const time of times) {
    const day = isoDay(time);
    counts[day] = (counts[day] ?? 0) + 1;
    if (oldest === null || day < oldest) oldest = day;
  }
  const capped = count >= MAX_ITEMS;
  let series = fillSeries(dates, counts);
  // Capped: days up to the oldest returned article may be missing articles.
  if (capped && oldest) series = series.map(p => (p.date <= oldest ? { ...p, value: null } : p));
  return {
    source: 'news',
    unit: SOURCES.news.unit,
    series,
    fetchedAt: new Date(now).toISOString(),
    ...(capped
      ? { note: 'Google News returned its maximum of 100 articles: older days are not counted.' }
      : {}),
  };
}
