// A fake `fetch` that answers like the real services, from tests/samples/.
// `fail` lists service names that should answer HTTP 503 instead.
import { readFileSync } from 'node:fs';

const sample = name => readFileSync(new URL('../samples/' + name, import.meta.url), 'utf8');
export const NOW = Date.parse('2026-10-14T10:00:00Z'); // last complete day: 2026-10-13

const jsonResponse = text => new Response(text, { headers: { 'Content-Type': 'application/json' } });

export function fakeFetcher({ fail = [] } = {}) {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    const service = url.includes('trends.google.com')
      ? 'rss'
      : url.includes('/pageviews/top/')
        ? 'wikipedia-top'
        : url.includes('/pageviews/per-article/')
          ? 'wikipedia'
          : url.includes('/search/page')
            ? 'wikipedia-search'
            : url.includes('hn.algolia.com')
              ? 'hackernews'
              : url.includes('api.gdeltproject.org')
                ? 'gdelt'
                : 'unknown';
    if (fail.includes(service) || service === 'unknown') return new Response('down', { status: 503 });
    switch (service) {
      case 'rss':
        return new Response(sample('trends-rss.xml'), { headers: { 'Content-Type': 'application/rss+xml' } });
      case 'wikipedia-top':
        // The week-earlier list does not contain the climber.
        return url.endsWith('/2026/10/13') || url.endsWith('/2026/10/12')
          ? jsonResponse(sample('wiki-top.json'))
          : jsonResponse('{"items":[{"articles":[{"article":"Steady_topic","views":2900}]}]}');
      case 'wikipedia':
        return jsonResponse(sample('wiki-pageviews.json'));
      case 'wikipedia-search':
        return jsonResponse('{"pages":[{"key":"Matcha","title":"Matcha"}]}');
      case 'hackernews':
        return jsonResponse(sample('hn-search.json'));
      case 'gdelt':
        return jsonResponse(sample('gdelt-timeline.json'));
    }
  };
  return { fetcher, calls };
}
