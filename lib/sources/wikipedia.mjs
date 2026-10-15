// Wikipedia: free, no API key, no account. Three public Wikimedia endpoints:
//   1. REST search      -> resolves free text to an actual Wikipedia article.
//   2. Pageviews API    -> daily view counts for one article.
//   3. Top articles API -> the most-viewed articles of one day (Discover candidates).
// A language edition is a rough stand-in for a market, not a country breakdown.
import { WIKI_LANGUAGES } from '../../public/js/data/wiki-languages.js';
import { SOURCES } from '../config.mjs';
import { fetchJson, SourceError } from '../http.mjs';
import { dayRange, fillSeries, compactDay, DAY_MS } from '../dates.mjs';

export { WIKI_LANGUAGES };
const SOURCE = 'Wikipedia';
const MAX_BYTES = 500_000;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

// Pages in the top lists that are not real topics.
const NON_ARTICLE =
  /^(Main_Page|Hauptseite|Accueil|Hlavná_stránka|Hlavní_strana|メインページ|Special:|Spezial:|Spécial:|Špeciálne:|Speciální:|特別:|Wikipedia:|File:|Datei:|Fichier:|Súbor:|Soubor:|Help:|Portal:|Category:|Template:|User:|Talk:|-$)/;
export const isRealArticle = key => typeof key === 'string' && !NON_ARTICLE.test(key);

// Search keys are URL-safe titles (spaces -> underscores); still bound them.
function safeArticleKey(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 300 &&
    !/[\u0000-\u001f]/.test(value)
    ? value
    : null;
}

// Free text -> { key, title } in one language edition, or null.
export async function resolveArticle(query, lang, fetcher = fetch) {
  const url =
    'https://' +
    lang +
    '.wikipedia.org/w/rest.php/v1/search/page?q=' +
    encodeURIComponent(query) +
    '&limit=1';
  const body = await fetchJson(url, { source: SOURCE, fetcher, maxBytes: MAX_BYTES });
  const page = body?.pages?.[0];
  const key = safeArticleKey(page?.key);
  if (!key) return null;
  return { key, title: page.title ?? key.replaceAll('_', ' ') };
}

// Raw daily views between two dates ('YYYY-MM-DD'), as { date: views }.
async function viewsBetween(lang, articleKey, start, end, fetcher) {
  const url =
    'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/' +
    lang +
    '.wikipedia/all-access/user/' +
    encodeURIComponent(articleKey) +
    '/daily/' +
    compactDay(start) +
    '/' +
    compactDay(end);
  const body = await fetchJson(url, { source: SOURCE, fetcher, maxBytes: MAX_BYTES });
  const counts = {};
  for (const item of Array.isArray(body?.items) ? body.items : []) {
    const ts = String(item.timestamp ?? '');
    if (!/^\d{10}$/.test(ts) || !Number.isFinite(item.views) || item.views < 0) continue;
    counts[ts.slice(0, 4) + '-' + ts.slice(4, 6) + '-' + ts.slice(6, 8)] = item.views;
  }
  return { counts, found: body !== null };
}

// Adapter shape shared by every source (see lib/sources/README in docs):
// topic = { article, lang } → { source, unit, series: [{date, value}], fetchedAt }
export async function getDailySeries(topic, market, days, { fetcher = fetch, now = Date.now() } = {}) {
  if (!topic.article) throw new SourceError(SOURCE, 'NO_MATCH', 'This topic has no Wikipedia article.');
  const dates = dayRange(days, now);
  const { counts, found } = await viewsBetween(topic.lang, topic.article, dates[0], dates.at(-1), fetcher);
  if (!found) throw new SourceError(SOURCE, 'NO_MATCH', 'Wikipedia has no view data for this article.');
  return {
    source: 'wikipedia',
    unit: SOURCES.wikipedia.unit + ' (' + topic.lang + ' edition)',
    series: fillSeries(dates, counts),
    fetchedAt: new Date(now).toISOString(),
  };
}

// Most-viewed real articles of one day: [{ key, views }] (up to 1000).
export async function topArticles(lang, date, fetcher = fetch) {
  const [y, m, d] = date.split('-');
  const url =
    'https://wikimedia.org/api/rest_v1/metrics/pageviews/top/' +
    lang +
    '.wikipedia/all-access/' +
    y +
    '/' +
    m +
    '/' +
    d;
  const body = await fetchJson(url, { source: SOURCE, fetcher, maxBytes: 1_000_000 });
  const articles = body?.items?.[0]?.articles;
  if (!Array.isArray(articles)) return [];
  return articles
    .filter(a => isRealArticle(a?.article) && Number.isFinite(a.views))
    .map(a => ({ key: a.article, views: a.views }));
}

// Articles that climbed: yesterday's views ≥ ratio × the same day a week earlier
// (or absent from that day's list). Strongest climbers first.
export function climbers(yesterday, weekEarlier, { ratio, minViews, limit }) {
  const before = new Map(weekEarlier.map(a => [a.key, a.views]));
  return yesterday
    .filter(a => a.views >= minViews)
    .map(a => ({ ...a, before: before.get(a.key) ?? 0 }))
    .filter(a => a.views >= ratio * a.before)
    .sort((a, b) => b.views / Math.max(b.before, 1) - a.views / Math.max(a.before, 1))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// GET /api/history?query=&country=&days= — one topic's views, used by the
// CSV analytics, Compare, Markets and Seasonality pages.

export async function pageviews(lang, articleKey, days, fetcher = fetch) {
  const end = Date.now() - DAY_MS;
  const start = end - (days - 1) * DAY_MS;
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const { counts } = await viewsBetween(lang, articleKey, iso(start), iso(end), fetcher);
  const records = Object.entries(counts)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    records,
    unit: SOURCES.wikipedia.unit,
    metric: 'wikipedia_pageviews',
    provider: 'wikipedia-pageviews',
    project: lang + '.wikipedia',
  };
}

const inFlight = new Map();

export async function historyResponse(request, fetcher = fetch) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('query') ?? '').trim();
  const country = url.searchParams.get('country') ?? '';
  const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 90), 7), 1825);
  if (!query || query.length > 100)
    return Response.json(
      { error: 'Enter a topic between 1 and 100 characters.', code: 'INVALID_QUERY' },
      { status: 400, headers },
    );
  // Worldwide ('') uses the English edition.
  const lang = Object.hasOwn(WIKI_LANGUAGES, country) ? WIKI_LANGUAGES[country] : null;
  if (!lang)
    return Response.json(
      {
        error: 'Wikipedia has no supported language edition for this market yet.',
        code: 'UNSUPPORTED_MARKET',
      },
      { status: 400, headers },
    );

  // Share identical requests that arrive at the same time.
  const cacheKey = lang + '|' + query.toLowerCase() + '|' + days;
  try {
    if (!inFlight.has(cacheKey)) {
      const pending = (async () => {
        const article = await resolveArticle(query, lang, fetcher);
        if (!article)
          return {
            error: 'No matching Wikipedia article found for this topic in this language edition.',
            code: 'NO_MATCH',
          };
        const data = await pageviews(lang, article.key, days, fetcher);
        if (data.records.length < 6)
          return {
            error: 'Wikipedia returned too little data for this topic to show a trend.',
            code: 'NOT_ENOUGH_DATA',
          };
        return {
          query,
          country,
          lang,
          days,
          article: article.title,
          fetchedAt: new Date().toISOString(),
          ...data,
          note:
            'Wikipedia article views in the ' +
            lang +
            ' edition — a language-based proxy for regional interest, not an official per-country search metric.',
        };
      })().finally(() => inFlight.delete(cacheKey));
      inFlight.set(cacheKey, pending);
    }
    const result = await inFlight.get(cacheKey);
    return Response.json(result, { headers, status: result.error ? 404 : 200 });
  } catch (error) {
    console.error('Wikipedia history request failed', {
      query,
      country,
      code: error?.code,
      message: error?.message,
    });
    const messages = {
      RATE_LIMITED: [
        'WIKI_RATE_LIMITED',
        'Wikipedia is temporarily limiting requests. Wait a little before trying again.',
      ],
      TIMEOUT: ['WIKI_TIMEOUT', 'Wikipedia did not respond in time. Try again later.'],
    };
    const [code, message] = messages[error?.code] || [
      'WIKI_UNAVAILABLE',
      'Wikipedia data could not be loaded for this topic.',
    ];
    return Response.json({ code, error: message }, { status: 502, headers });
  }
}
