// GDELT DOC 2.0: how many news articles mention the topic, per UTC day,
// worldwide or from one source country. Free, no key. GDELT asks for at most
// one request every 5 seconds; the pipeline waits between calls (config.mjs).
import { SOURCES, MARKETS } from '../config.mjs';
import { fetchText, SourceError } from '../http.mjs';
import { dayRange, fillSeries, compactDay } from '../dates.mjs';

const SOURCE = 'GDELT';

// GDELT's query language treats ":" "(" etc. as operators and needs quotes
// around phrases. Keep letters, digits, spaces, apostrophes and hyphens.
export function gdeltQuery(text, market) {
  const clean = text
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 3) return null; // GDELT rejects very short terms
  const phrase = clean.includes(' ') ? '"' + clean + '"' : clean;
  const country = MARKETS[market]?.gdelt;
  return country ? phrase + ' sourcecountry:' + country : phrase;
}

export function timelineUrl(query, startDate, endDate) {
  const params = new URLSearchParams({
    query,
    mode: 'timelinevolraw',
    format: 'json',
    startdatetime: compactDay(startDate) + '000000',
    enddatetime: compactDay(endDate) + '235959',
  });
  return 'https://api.gdeltproject.org/api/v2/doc/doc?' + params;
}

// topic = { searchText }, market = key of MARKETS → { source, unit, series, fetchedAt }
export async function getDailySeries(topic, market, days, { fetcher = fetch, now = Date.now() } = {}) {
  const query = topic.searchText ? gdeltQuery(topic.searchText, market) : null;
  if (!query) throw new SourceError(SOURCE, 'NO_MATCH', 'This topic name is too short for a news search.');
  const dates = dayRange(days, now);
  const { text } = await fetchText(timelineUrl(query, dates[0], dates.at(-1)), {
    source: SOURCE,
    fetcher,
    maxBytes: 2_000_000,
  });
  // GDELT answers query problems with a plain-text sentence instead of JSON.
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new SourceError(SOURCE, 'NO_MATCH', 'GDELT could not search for this topic name.');
  }
  const points = body?.timeline?.[0]?.data;
  // An empty timeline means no articles matched.
  const counts = {};
  for (const point of Array.isArray(points) ? points : []) {
    const stamp = String(point?.date ?? '');
    if (!/^\d{8}T/.test(stamp) || !Number.isFinite(point.value)) continue;
    // Short ranges come in 15-minute steps: add them up per day.
    const day = stamp.slice(0, 4) + '-' + stamp.slice(4, 6) + '-' + stamp.slice(6, 8);
    counts[day] = (counts[day] ?? 0) + point.value;
  }
  return {
    source: 'gdelt',
    unit: SOURCES.gdelt.unit,
    series: fillSeries(dates, counts),
    fetchedAt: new Date(now).toISOString(),
  };
}
