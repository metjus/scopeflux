// Google Trends daily trending RSS: which topics a country's feed lists right now.
// A list, not a measurement — never drawn as a line.
import { COUNTRIES } from '../../public/js/data/countries.js';
import { USER_AGENT } from '../config.mjs';

const allowedCountries = new Set(COUNTRIES);
const MAX_BYTES = 1_000_000;
const inFlight = new Map();
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function decodeText(value) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] ?? match;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : '\uFFFD';
  });
}

// Bounded reader for Google's fixed RSS fields, never user-provided XML.
function field(xml, name) {
  const value = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>').exec(xml)?.[1] ?? '';
  return value
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map(part => (part.startsWith('<![CDATA[') ? part.slice(9, -3) : decodeText(part)))
    .join('')
    .trim()
    .slice(0, 1000);
}

export function parseGoogleRss(xml, country, fetchedAt = new Date().toISOString()) {
  if (
    typeof xml !== 'string' ||
    xml.length > MAX_BYTES ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    !/<rss\b/.test(xml) ||
    !/<channel\b/.test(xml) ||
    !/<\/channel>\s*<\/rss>\s*$/.test(xml)
  ) {
    throw new Error('Invalid Google RSS response');
  }
  const blocks = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)];
  if (blocks.length !== (xml.match(/<item(?:\s[^>]*)?>/g) ?? []).length)
    throw new Error('Incomplete Google RSS response');
  const seen = new Set();
  const items = blocks
    .flatMap(([_, block]) => {
      const title = field(block, 'title');
      if (!title || seen.has(title.toLowerCase())) return [];
      seen.add(title.toLowerCase());
      const date = new Date(field(block, 'pubDate'));
      const traffic = field(block, 'ht:approx_traffic');
      const news = [...block.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)]
        .flatMap(([_, article]) => {
          const url = safeHttps(field(article, 'ht:news_item_url'));
          const title = field(article, 'ht:news_item_title');
          return url && title ? [{ title, url, publisher: field(article, 'ht:news_item_source') }] : [];
        })
        .slice(0, 3);
      return [
        {
          title,
          publishedAt: Number.isNaN(date.getTime()) ? null : date.toISOString(),
          trafficBucket: /^[\d,.]+\s*[KMB]?\+?$/i.test(traffic) ? traffic : null,
          news,
          exploreUrl:
            'https://trends.google.com/trends/explore?geo=' + country + '&q=' + encodeURIComponent(title),
        },
      ];
    })
    .slice(0, 30);
  return {
    provider: 'google-trending-rss',
    country,
    fetchedAt,
    sourceUrl: 'https://trends.google.com/trending/rss?geo=' + country,
    items,
  };
}

async function readBounded(response) {
  if (!response.body) throw new Error('Empty RSS response');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0,
    result = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) throw new Error('RSS response is too large');
      result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

// One country's feed: { provider, country, fetchedAt, sourceUrl, items }.
export async function fetchFeed(country, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetcher('https://trends.google.com/trending/rss?geo=' + country, {
      headers: { Accept: 'application/rss+xml, text/xml', 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) {
      throw Object.assign(new Error('Google RSS redirected: HTTP ' + response.status), {
        code: 'RSS_REDIRECTED',
      });
    }
    if (response.status === 429) {
      throw Object.assign(new Error('Google RSS rate limited: HTTP 429'), { code: 'RSS_RATE_LIMITED' });
    }
    if (!response.ok || !/\b(?:xml|rss\+xml)\b/i.test(response.headers.get('Content-Type') ?? '')) {
      throw new Error(
        'Google RSS response: HTTP ' +
          response.status +
          ', type ' +
          (response.headers.get('Content-Type') ?? 'missing'),
      );
    }
    return parseGoogleRss(await readBounded(response), country);
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw Object.assign(new Error('Google RSS request timed out'), { code: 'RSS_TIMEOUT' });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function trendingResponse(request, fetcher = fetch) {
  const country = new URL(request.url).searchParams.get('country') ?? 'US';
  if (!allowedCountries.has(country))
    return Response.json({ error: 'Choose a valid country code.' }, { status: 400, headers });
  try {
    // Share concurrent requests only; retain no feed after completion.
    if (!inFlight.has(country)) {
      const pending = fetchFeed(country, fetcher).finally(() => inFlight.delete(country));
      inFlight.set(country, pending);
    }
    return Response.json(await inFlight.get(country), { headers });
  } catch (error) {
    console.error('Google RSS request failed', { country, name: error?.name, message: error?.message });
    const messages = {
      RSS_REDIRECTED:
        'Google redirected this feed request instead of returning RSS. Try again later or open the source directly.',
      RSS_RATE_LIMITED: 'Google is temporarily limiting feed requests. Wait a little before trying again.',
      RSS_TIMEOUT: 'Google’s feed did not respond in time. Try again later or open the source directly.',
    };
    const code = Object.hasOwn(messages, error?.code) ? error.code : 'RSS_UNAVAILABLE';
    return Response.json(
      {
        code,
        error:
          messages[code] ||
          'Google’s feed could not be loaded for this market. Try again later or open the source.',
      },
      { status: 502, headers },
    );
  }
}

// Lower-case, single-spaced title, used to match the same topic across days.
export const normalizeTitle = title => title.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
