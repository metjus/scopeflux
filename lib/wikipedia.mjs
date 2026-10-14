// Real historical interest data from Wikipedia: free, no API key, no account.
// Two public Wikimedia endpoints, both documented and stable:
//   1. REST search  -> resolves a free-text topic to an actual Wikipedia article.
//   2. Pageviews API -> daily view counts for that article over a date range.
// Wikipedia editions are a language proxy for a market, not a real country
// breakdown. That limit is returned in every response so the UI can say so.

const MAX_BYTES = 500_000;
const DAY = 86_400_000;
const inFlight = new Map();
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

// Wikimedia requires a descriptive User-Agent identifying the application.
// Replace the contact URL with your own before deploying.
const USER_AGENT = 'ScopeFlux/1.0 (https://scopeflux.io; contact: matus.sturdik1@gmail.com)';

// Country -> Wikipedia language edition. Deliberately small and explicit:
// better to say "unsupported market" than to silently guess a wrong language.
export const WIKI_LANGUAGES = {
  US: 'en', GB: 'en', AU: 'en', CA: 'en', IE: 'en', NZ: 'en', IN: 'en', ZA: 'en',
  SK: 'sk', CZ: 'cs', DE: 'de', AT: 'de', CH: 'de',
  FR: 'fr', BE: 'fr',
  ES: 'es', MX: 'es', AR: 'es',
  PT: 'pt', BR: 'pt',
  IT: 'it', NL: 'nl', PL: 'pl', JP: 'ja', KR: 'ko', CN: 'zh', TW: 'zh',
  RU: 'ru', UA: 'uk', TR: 'tr', SE: 'sv', NO: 'no', DK: 'da', FI: 'fi',
  GR: 'el', RO: 'ro', HU: 'hu', BG: 'bg', HR: 'hr', RS: 'sr',
};

function safeArticleKey(value) {
  // Wikipedia "key" values from the search API are already URL-safe titles
  // (spaces become underscores); still bound length and reject control chars.
  return typeof value === 'string' && value.length > 0 && value.length <= 300 && !/[\u0000-\u001f]/.test(value)
    ? value : null;
}

async function readBounded(response) {
  if (!response.body) throw new Error('Empty response');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, result = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) throw new Error('Response too large');
      result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}

async function getJson(url, fetcher, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal, redirect: 'error',
    });
    if (response.status === 404) return null;
    if (response.status === 429) throw Object.assign(new Error('Wikipedia rate limited: HTTP 429'), { code: 'WIKI_RATE_LIMITED' });
    if (!response.ok) throw new Error('Wikipedia HTTP ' + response.status);
    if (!/application\/json/i.test(response.headers.get('Content-Type') ?? '')) throw new Error('Wikipedia returned a non-JSON response');
    return JSON.parse(await readBounded(response));
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw Object.assign(new Error('Wikipedia request timed out'), { code: 'WIKI_TIMEOUT' });
    }
    throw error;
  } finally { clearTimeout(timer); }
}

// Resolve a free-text topic to a real Wikipedia article in one language edition.
export async function resolveArticle(query, lang, fetcher = fetch) {
  const url = 'https://' + lang + '.wikipedia.org/w/rest.php/v1/search/page?q=' +
    encodeURIComponent(query) + '&limit=1';
  const body = await getJson(url, fetcher);
  const page = body?.pages?.[0];
  const key = safeArticleKey(page?.key);
  if (!key) return null;
  return { key, title: page.title ?? key.replaceAll('_', ' ') };
}

// Daily view counts for one article, for the given number of past days.
export async function pageviews(lang, articleKey, days, fetcher = fetch) {
  const end = new Date(Date.now() - DAY); // yesterday: today is always partial
  const start = new Date(end.getTime() - (days - 1) * DAY);
  const fmt = d => d.toISOString().slice(0, 10).replaceAll('-', '');
  const project = lang + '.wikipedia';
  const url = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/' +
    project + '/all-access/user/' + encodeURIComponent(articleKey) + '/daily/' +
    fmt(start) + '/' + fmt(end);
  const body = await getJson(url, fetcher);
  const items = Array.isArray(body?.items) ? body.items : [];
  const records = items.map(item => {
    const ts = String(item.timestamp ?? '');
    if (!/^\d{10}$/.test(ts) || typeof item.views !== 'number' || !Number.isFinite(item.views) || item.views < 0) return null;
    return { date: ts.slice(0, 4) + '-' + ts.slice(4, 6) + '-' + ts.slice(6, 8), value: item.views };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  return { records, unit: 'Wikipedia article views per day', metric: 'wikipedia_pageviews', provider: 'wikipedia-pageviews', project };
}

export async function historyResponse(request, fetcher = fetch) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('query') ?? '').trim();
  const country = url.searchParams.get('country') ?? '';
  const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 90), 7), 1825);
  if (!query || query.length > 100) return Response.json({ error: 'Enter a topic between 1 and 100 characters.', code: 'INVALID_QUERY' }, { status: 400, headers });
  const lang = WIKI_LANGUAGES[country];
  if (!lang) return Response.json({ error: 'Wikipedia has no supported language edition for this market yet.', code: 'UNSUPPORTED_MARKET' }, { status: 400, headers });

  const cacheKey = lang + '|' + query.toLowerCase() + '|' + days;
  try {
    if (!inFlight.has(cacheKey)) {
      const pending = (async () => {
        const article = await resolveArticle(query, lang, fetcher);
        if (!article) {
          return { error: 'No matching Wikipedia article found for this topic in this language edition.', code: 'NO_MATCH' };
        }
        const data = await pageviews(lang, article.key, days, fetcher);
        if (data.records.length < 6) {
          return { error: 'Wikipedia returned too little data for this topic to show a trend.', code: 'NOT_ENOUGH_DATA' };
        }
        return {
          query, country, lang, days, article: article.title,
          fetchedAt: new Date().toISOString(),
          ...data,
          note: 'Wikipedia article views in the ' + lang + ' edition — a language-based proxy for regional interest, not an official per-country search metric.',
        };
      })().finally(() => inFlight.delete(cacheKey));
      inFlight.set(cacheKey, pending);
    }
    const result = await inFlight.get(cacheKey);
    return Response.json(result, { headers, status: result.error ? 404 : 200 });
  } catch (error) {
    console.error('Wikipedia history request failed', { query, country, name: error?.name, message: error?.message });
    const messages = {
      WIKI_RATE_LIMITED: 'Wikipedia is temporarily limiting requests. Wait a little before trying again.',
      WIKI_TIMEOUT: 'Wikipedia did not respond in time. Try again later.',
    };
    const code = Object.hasOwn(messages, error?.code) ? error.code : 'WIKI_UNAVAILABLE';
    return Response.json({ code, error: messages[code] || 'Wikipedia data could not be loaded for this topic.' }, { status: 502, headers });
  }
}
