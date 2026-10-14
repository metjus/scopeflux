# ScopeFlux

Free trend discovery at https://scopeflux.io. A Cloudflare Worker serves a small
API and a static site. Plain JavaScript modules, no framework, no build step.

Rules for working on the code: see `CLAUDE.md`. What to build next: `docs/v1-spec.md`.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs Wrangler (Cloudflare's tool). Needed once. |
| `npm test` | Runs all tests in `tests/`. No internet needed. |
| `npm run dev` | Runs the site locally at http://localhost:8787 |
| `npm run deploy` | Publishes to Cloudflare (normally done by Cloudflare from GitHub). |

`npm run dev` passes an older compatibility date because the pinned Wrangler
version cannot run the date in `wrangler.json` locally. Deploys are not affected.

## Where things are

```
worker.mjs                  API router: /api/trending, /api/history; everything else = static files
wrangler.json               Cloudflare settings
lib/
  trending.mjs              Google Trends RSS feed for one market  -> /api/trending
  wikipedia.mjs             Wikipedia article views for one topic  -> /api/history
public/                     The website (served as-is)
  index.html                All pages; each <section class="page"> is one page
  style.css, analytics.css, imports.css, readability.css, launch.css
                            Styles (to be replaced by the new design in phase 2)
  js/
    main.js                 Start-up and page switching (#radar, #explorer, ...)
    state.js                Everything stored in the browser (localStorage) + helpers
    ui/
      dom.js                Shared helpers: $, escaping, number formats, icons, toast, download
      chart.js              SVG line charts and sparklines
      navigation.js         Sidebar and mobile drawer, Ctrl/⌘+K shortcut
    pages/                  One file per page
      radar.js              Discover trends (RSS feed, refresh comparisons) + saved RSS topics
      explorer.js           CSV analytics: one series (Wikipedia topic or imported CSV)
      compare.js            Compare topics: 2–5 series rebased to 100
      markets.js            Compare markets: one topic in several Wikipedia languages
      seasonality.js        Seasonality: strongest months over complete years
      saved.js              Saved topics: watchlist snapshots and rules
      history.js            Recent analyses
      imports.js            Import data: CSV upload in the browser
    data/                   Pure logic, no page elements; used by pages and tests
      countries.js          Country codes accepted by Google RSS; csvCell()
      wiki-languages.js     Market -> Wikipedia language (also used by lib/wikipedia.mjs)
      wikipedia-client.js   Calls /api/history and checks the answer
      radar.js              RSS checks: record, compare, filter, export
      statistics.js         Change, volatility, anomalies, seasonality, comparison
      csv-import.js         Reads CSV text into dated series (strict)
      exports.js            CSV exports with source labels
      summaries.js          Plain-English sentences and the RSS text brief
      workspace-data.js     Checks data read back from browser storage
tests/                      node:test files; external services are always faked
docs/                       Spec, data sources, design, mockups (read before changing things)
```

## Where the numbers come from

- **Google Trends RSS** (Discover trends): topics listed in a country's daily feed.
  Traffic labels like "200+" are buckets, not counts.
- **Wikipedia pageviews** (CSV analytics, Compare, Markets, Seasonality): daily
  views of the best-matching article in one language edition.
- **Your CSV** (Import data): values you supply; never uploaded.

Nothing on the site is generated, sampled or estimated.
