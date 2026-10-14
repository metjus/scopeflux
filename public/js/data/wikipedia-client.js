// Browser side of /api/history: daily Wikipedia article views for one topic.
// The Worker (lib/wikipedia.mjs) finds the article and fetches the numbers;
// this file checks the answer and turns it into a series the pages can use.
import { WIKI_LANGUAGES, editionName } from './wiki-languages.js';

export const WIKIPEDIA_PROVIDER = 'wikipedia-pageviews';
export const WIKIPEDIA_PERIODS = ['30', '90', '365', '1095', '1825'];

const validDate = s =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

// Throws a readable Error when the response is not what we asked for.
export function validateHistory(body, { country }) {
  const ok =
    body &&
    body.provider === WIKIPEDIA_PROVIDER &&
    body.country === country &&
    body.lang === WIKI_LANGUAGES[country] &&
    typeof body.article === 'string' &&
    body.article.length > 0 &&
    body.article.length <= 300 &&
    typeof body.unit === 'string' &&
    Number.isFinite(Date.parse(body.fetchedAt)) &&
    Array.isArray(body.records) &&
    body.records.length >= 6 &&
    body.records.length <= 10000 &&
    body.records.every(
      (r, i) =>
        r &&
        validDate(r.date) &&
        typeof r.value === 'number' &&
        Number.isFinite(r.value) &&
        r.value >= 0 &&
        (i === 0 || r.date > body.records[i - 1].date),
    );
  if (!ok) throw new Error('Wikipedia returned data in an unexpected format. Nothing was saved.');
  return body;
}

// Fetch and validate one series. Returns a dataset in the shape every page uses.
export async function fetchWikipediaSeries({ query, country, period }, { signal } = {}) {
  if (!Object.hasOwn(WIKI_LANGUAGES, country))
    throw new Error('Wikipedia has no supported language edition for this market yet.');
  const days = WIKIPEDIA_PERIODS.includes(String(period)) ? String(period) : '90';
  const url =
    '/api/history?query=' +
    encodeURIComponent(query) +
    '&country=' +
    encodeURIComponent(country) +
    '&days=' +
    days;
  let response, body;
  try {
    response = await fetch(url, { signal, cache: 'no-store' });
    body = await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Wikipedia data could not be loaded. Check your connection and try again.');
  }
  // The Worker sends a friendly message with every error.
  if (!response.ok || body.error)
    throw new Error(body?.error || 'Wikipedia data could not be loaded for this topic.');
  const data = validateHistory(body, { country });
  return {
    id: crypto.randomUUID(),
    kind: 'history',
    source: 'wikipedia',
    provider: WIKIPEDIA_PROVIDER,
    query: data.article.slice(0, 120),
    searchedFor: query,
    article: data.article,
    country,
    language: data.lang,
    period: days,
    unit: data.unit,
    metric: data.metric,
    fetchedAt: data.fetchedAt,
    records: data.records,
    createdAt: Date.now(),
  };
}

// One sentence saying exactly what the numbers are.
export function historyDescription(d) {
  const retrieved = 'Retrieved ' + new Date(d.fetchedAt).toLocaleString('en') + '.';
  if (d.provider === WIKIPEDIA_PROVIDER)
    return (
      'Wikipedia article views per day for “' +
      d.query +
      '” in the ' +
      editionName(d.language) +
      '. A language edition is only a rough stand-in for a country, and views are not searches. ' +
      retrieved
    );
  return 'Previously retrieved series · Original stored values and units. ' + retrieved;
}
