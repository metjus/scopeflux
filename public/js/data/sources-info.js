// What each Discover source is, in plain words. Used by Discover, the topic
// page and Sources & help. Thresholds come live from /api/config instead.
export const SOURCE_ORDER = ['wikipedia', 'hackernews', 'gdelt', 'rss'];

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
  gdelt: {
    name: 'GDELT',
    color: '#A78BFA',
    role: 'News coverage',
    unit: 'Matching news articles per day',
    history: 'About 3 months',
    refresh: 'Daily',
    regions: 'By source country',
    docs: 'GDELT DOC 2.0 API',
    what: 'How many news articles mention the topic, worldwide or from outlets in one country.',
    limit:
      'Counts published articles, not readers. Heavy coverage is not the same as public interest, and syndicated copies inflate the count. Very short names cannot be searched.',
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
