// What each Discover source is, in plain words. Used by Discover, the topic
// page and Sources & help. Thresholds come live from /api/config instead.
export const SOURCE_ORDER = ['wikipedia', 'hackernews', 'news', 'rss'];

export const SOURCE_INFO = {
  wikipedia: {
    name: 'Wikipedia',
    color: '#FF9A4D',
    role: 'Interest over time',
    unit: 'Article views per day',
    history: 'Since Jul 2015',
    refresh: 'Daily',
    regions: 'By language edition',
    docs: 'Wikimedia Pageviews API',
    what: 'Daily view counts for the article that matches the topic. The closest thing to a public interest curve, and the only source here that reaches back years — which is what makes Seasonality possible.',
    limit:
      'Measures readers of an encyclopedia article, not searchers. Topics without their own article return nothing, and a language edition is only a rough stand-in for a country.',
  },
  hackernews: {
    name: 'Hacker News',
    color: '#FFD166',
    role: 'Developer signal',
    unit: 'Stories per day whose title mentions the topic',
    history: 'Since 2007',
    refresh: 'Daily',
    regions: 'Global only',
    docs: 'HN Algolia Search API',
    what: 'New story submissions whose title mentions the topic. Narrow but very clean for software, startups and hardware.',
    limit:
      'A small, tech-leaning audience. Silence here says nothing about topics outside software, and one front-page post moves the line sharply. The same in every market.',
  },
  news: {
    name: 'The Guardian',
    color: '#A78BFA',
    role: 'News coverage',
    unit: 'Guardian articles per day that mention the topic',
    history: 'Since 1999',
    refresh: 'Daily',
    regions: 'Global only',
    docs: 'The Guardian Open Platform',
    what: 'How many articles in The Guardian mention the topic, by day of publication. A stand-in for news coverage, from one large newspaper with a full public archive.',
    limit:
      'One newspaper, based in the UK — not all news media. It counts published articles, not readers, and is the same in every market. At most 200 articles are read per request; for very busy topics the older days are shown as unknown.',
  },
  rss: {
    name: 'Trends RSS',
    color: '#7E7691',
    role: 'Daily discovery',
    unit: 'Listed in Google’s daily trending feed',
    history: 'Since ScopeFlux started recording it',
    refresh: 'Daily',
    regions: '7 countries',
    docs: 'Google Trends public RSS',
    what: 'Google’s public daily trending list, per country. Good for spotting what surfaced today; it carries no history of its own.',
    limit:
      'A list, not a measurement — never drawn as a line. Labels like “200+” are buckets, not counts, and a topic missing from the feed has not necessarily gone quiet.',
  },
};

export const sourceName = key => SOURCE_INFO[key]?.name ?? key;

// The markets offered on Discover (keys of MARKETS in lib/config.mjs).
export const DISCOVER_MARKETS = [
  ['WW', 'Worldwide'],
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['DE', 'Germany'],
  ['SK', 'Slovakia'],
  ['CZ', 'Czechia'],
  ['FR', 'France'],
  ['JP', 'Japan'],
];
export const marketName = code => DISCOVER_MARKETS.find(m => m[0] === code)?.[1] ?? code;
