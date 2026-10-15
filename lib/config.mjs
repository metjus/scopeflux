// Every tunable number of the Discover pipeline lives here, so it can be read,
// changed and shown on the Sources & help page (GET /api/config).
// These are starting guesses (docs/data-sources.md). Tune them with real data.

// Markets offered on Discover. `rss` = Google Trends RSS geo codes that count for
// the market; `news` = the Google News edition searched (Worldwide uses US English).
const edition = (hl, gl, lang) => ({ hl, gl, ceid: gl + ':' + lang });
export const MARKETS = {
  WW: {
    name: 'Worldwide',
    lang: 'en',
    rss: ['US', 'GB', 'DE', 'SK', 'CZ', 'FR', 'JP'],
    news: edition('en-US', 'US', 'en'),
  },
  US: { name: 'United States', lang: 'en', rss: ['US'], news: edition('en-US', 'US', 'en') },
  GB: { name: 'United Kingdom', lang: 'en', rss: ['GB'], news: edition('en-GB', 'GB', 'en') },
  DE: { name: 'Germany', lang: 'de', rss: ['DE'], news: edition('de', 'DE', 'de') },
  SK: { name: 'Slovakia', lang: 'sk', rss: ['SK'], news: edition('sk', 'SK', 'sk') },
  CZ: { name: 'Czechia', lang: 'cs', rss: ['CZ'], news: edition('cs', 'CZ', 'cs') },
  FR: { name: 'France', lang: 'fr', rss: ['FR'], news: edition('fr', 'FR', 'fr') },
  JP: { name: 'Japan', lang: 'ja', rss: ['JP'], news: edition('ja', 'JP', 'ja') },
};

// The four v1 sources, in display order. `unit` is shown next to every number.
export const SOURCES = {
  wikipedia: {
    name: 'Wikipedia',
    unit: 'Wikipedia article views per day',
    // Rising when avg(last 7 days) >= ratio × avg(previous 7 days) ...
    ratio: 1.25,
    // ... and avg(last 7 days) is at least this many views per day.
    minPerDayEnglish: 200,
    minPerDayOther: 30,
  },
  hackernews: {
    name: 'Hacker News',
    unit: 'Hacker News stories per day',
    ratio: 1.5,
    minLast7: 3, // stories in the last 7 days
  },
  news: {
    name: 'Google News',
    unit: 'News articles per day (Google News, max 100 per search)',
    ratio: 1.25,
    minLast7: 10, // articles in the last 7 days
  },
  rss: {
    name: 'Trends RSS',
    unit: 'Listed in Google’s daily trending feed',
    listedWithinDays: 7, // rising when listed on at least 1 of the last 7 days
  },
};
export const SOURCE_KEYS = Object.keys(SOURCES);

// Rising compares the last WINDOW days with the WINDOW days before them.
export const WINDOW_DAYS = 7;
// "Moved first on" uses a 3-day average crossing baseline × ratio.
export const FIRST_MOVE_AVERAGE_DAYS = 3;

export const PIPELINE = {
  // Free plan: 50 outgoing requests per run. One candidate costs up to 4
  // (find article, Wikipedia views, Hacker News, Google News). 10 × 4 = 40, leaving room.
  candidatesPerRun: 10,
  // Candidates per market and day.
  maxWikipediaClimbers: 25,
  maxRssCandidates: 30,
  // Wikipedia "top viewed" climbers: yesterday ≥ ratio × the same day a week earlier.
  climberRatio: 1.5,
  // A new snapshot is built when the newest one is older than this.
  rebuildAfterHours: 20,
  // A build still unfinished after this many hours is closed with what it has.
  maxBuildHours: 6,
  // Short pause between news searches, to stay polite with Google News.
  newsDelayMs: 1000,
};

// Topic page: how long on-demand series stay cached in D1.
export const TOPIC_CACHE_HOURS = 6;
export const TOPIC_DAYS = [30, 90];

// Every external request.
export const USER_AGENT = 'ScopeFlux/1.0 (https://scopeflux.io; matus.sturdik1@gmail.com)';
export const REQUEST_TIMEOUT_MS = 12_000;
