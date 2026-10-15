// JSON endpoints for the v1 pages:
//   GET /api/discover?market=US                     newest snapshot for a market
//   GET /api/topic?key=en:Godot&market=US&days=90   series per source, fetched on demand
//   GET /api/config                                 thresholds, for Sources & help
import {
  MARKETS,
  SOURCES,
  SOURCE_KEYS,
  WINDOW_DAYS,
  PIPELINE,
  TOPIC_CACHE_HOURS,
  TOPIC_DAYS,
} from './config.mjs';
import { dayRange } from './dates.mjs';
import { friendlyMessage } from './http.mjs';
import { ensureSchema } from './schema.mjs';
import { parseTopicKey, articleTitle, searchTextFor, rssKey } from './topics.mjs';
import { normalizeTitle } from './sources/trends-rss.mjs';
import * as wikipedia from './sources/wikipedia.mjs';
import * as hackernews from './sources/hackernews.mjs';
import * as gdelt from './sources/gdelt.mjs';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200, extra = {}) =>
  Response.json(body, { status, headers: { ...headers, ...extra } });

const notConfigured = () =>
  json(
    {
      code: 'NOT_CONFIGURED',
      error: 'The ScopeFlux database is not connected yet, so there is nothing to show.',
    },
    503,
  );

export async function discoverResponse(request, env) {
  const market = new URL(request.url).searchParams.get('market') || 'WW';
  if (!Object.hasOwn(MARKETS, market))
    return json({ code: 'INVALID_MARKET', error: 'Choose a listed market.' }, 400);
  if (!env?.DB) return notConfigured();
  try {
    await ensureSchema(env.DB);
    const row = await env.DB.prepare(
      'SELECT json FROM snapshots WHERE market = ? ORDER BY built_at DESC LIMIT 1',
    )
      .bind(market)
      .first();
    const running = await env.DB.prepare(
      "SELECT started_at FROM builds WHERE market = ? AND status = 'evaluating' LIMIT 1",
    )
      .bind(market)
      .first();
    return json(
      { market, snapshot: row ? JSON.parse(row.json) : null, updating: Boolean(running) },
      200,
      // Snapshots change at most a few times a day.
      { 'Cache-Control': 'public, max-age=300' },
    );
  } catch (error) {
    console.error('discover failed', { message: error?.message });
    return json(
      { code: 'DATABASE_ERROR', error: 'Stored results could not be read. Try again in a minute.' },
      502,
    );
  }
}

export function configResponse() {
  return json(
    {
      markets: MARKETS,
      sources: SOURCES,
      windowDays: WINDOW_DAYS,
      pipeline: PIPELINE,
      topicDays: TOPIC_DAYS,
    },
    200,
    { 'Cache-Control': 'public, max-age=3600' },
  );
}

// --- topic page ----------------------------------------------------------------

export async function topicResponse(request, env, { fetcher = fetch, now = Date.now() } = {}) {
  const params = new URL(request.url).searchParams;
  const market = params.get('market') || 'WW';
  const days = Number(params.get('days') || 90);
  if (!Object.hasOwn(MARKETS, market))
    return json({ code: 'INVALID_MARKET', error: 'Choose a listed market.' }, 400);
  if (!TOPIC_DAYS.includes(days)) return json({ code: 'INVALID_DAYS', error: 'Choose 30 or 90 days.' }, 400);

  // Free text from the search box (?q=) is first matched to a Wikipedia article.
  let key = params.get('key') || '';
  const query = (params.get('q') || '').trim().replace(/\s+/g, ' ');
  if (!key && query) {
    if (query.length > 100) return json({ code: 'INVALID_QUERY', error: 'Use up to 100 characters.' }, 400);
    key = await findTopicKey(query, MARKETS[market].lang, fetcher);
  }
  const parsed = parseTopicKey(key);
  if (!parsed) return json({ code: 'INVALID_TOPIC', error: 'This topic link is not valid.' }, 400);

  const cacheKey = key + '|' + market + '|' + days;
  if (env?.DB) {
    const cached = await env.DB.prepare('SELECT json, fetched_at FROM topic_cache WHERE cache_key = ?')
      .bind(cacheKey)
      .first()
      .catch(() => null);
    if (cached && now - Date.parse(cached.fetched_at) < TOPIC_CACHE_HOURS * 3_600_000)
      return json(JSON.parse(cached.json));
  }

  const title = parsed.article
    ? articleTitle(parsed.article)
    : query || params.get('title') || parsed.rssTitle;
  const topic = {
    key,
    lang: parsed.lang,
    article: parsed.article,
    title,
    searchText: searchTextFor(title),
  };
  // The three measured sources in parallel; each may fail on its own.
  const [wiki, hn, news] = await Promise.all([
    topic.article
      ? load('wikipedia', () => wikipedia.getDailySeries(topic, market, days, { fetcher, now }))
      : { status: 'no-article', message: 'No Wikipedia article is linked to this topic.' },
    load('hackernews', () => hackernews.getDailySeries(topic, market, days, { fetcher, now })),
    load('gdelt', () => gdelt.getDailySeries(topic, market, days, { fetcher, now })),
  ]);
  const body = {
    ...topic,
    market,
    marketName: MARKETS[market].name,
    days,
    fetchedAt: new Date(now).toISOString(),
    sources: { wikipedia: wiki, hackernews: hn, gdelt: news },
    rss: await rssListing(env, market, [title, topic.searchText], days, now),
  };
  // Only cache complete answers, so a temporary outage is retried next time.
  const allAnswered = Object.values(body.sources).every(s => s.status !== 'unavailable');
  if (env?.DB && allAnswered)
    await env.DB.prepare('INSERT OR REPLACE INTO topic_cache (cache_key, fetched_at, json) VALUES (?, ?, ?)')
      .bind(cacheKey, body.fetchedAt, JSON.stringify(body))
      .run()
      .catch(error => console.error('topic cache write failed', { message: error?.message }));
  return json(body);
}

// Search text -> 'lang:Article', or 'rss:<text>' when no article matches (or
// Wikipedia cannot be reached): the other sources can still be searched.
async function findTopicKey(query, lang, fetcher) {
  try {
    const found = await wikipedia.resolveArticle(query, lang, fetcher);
    if (found) return lang + ':' + found.key;
  } catch (error) {
    console.error('topic search failed', { message: error?.message });
  }
  return rssKey(query);
}

async function load(sourceKey, fetchSeries) {
  try {
    return { status: 'ok', ...(await fetchSeries()) };
  } catch (error) {
    if (error.code === 'NO_MATCH') return { status: 'no-data', message: error.message };
    console.error(sourceKey + ' topic series failed', { message: error?.message });
    return { status: 'unavailable', message: friendlyMessage(error, SOURCES[sourceKey].name) };
  }
}

// Days the topic was listed in the market's RSS feeds, from our own records.
async function rssListing(env, market, names, days, now) {
  if (!env?.DB) return { status: 'unavailable', listedDates: [], recordedSince: null };
  const geos = MARKETS[market].rss;
  const norms = [...new Set(names.filter(Boolean).map(normalizeTitle))];
  const from = dayRange(days, now)[0];
  try {
    const listed = await env.DB.prepare(
      'SELECT DISTINCT day FROM rss_listings WHERE day >= ? AND geo IN (' +
        geos.map(() => '?').join(',') +
        ') AND title_norm IN (' +
        norms.map(() => '?').join(',') +
        ') ORDER BY day',
    )
      .bind(from, ...geos, ...norms)
      .all();
    const first = await env.DB.prepare('SELECT MIN(day) AS day FROM rss_listings').first();
    return { status: 'ok', listedDates: listed.results.map(r => r.day), recordedSince: first?.day ?? null };
  } catch {
    return { status: 'unavailable', listedDates: [], recordedSince: null };
  }
}

export { SOURCE_KEYS };
