# ScopeFlux

Free trend discovery at https://scopeflux.io: which topics are rising across several free
public sources at once, and how each source is moving. A Cloudflare Worker serves a small API
and a static site. Plain JavaScript modules, no framework, no build step.

Rules for working on the code: `CLAUDE.md`. What to build next: `docs/v1-spec.md`.
Before and after going live: `docs/launch-checklist.md`.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs Wrangler (Cloudflare's tool). Needed once. |
| `npm test` | Runs all tests in `tests/`. No internet needed. |
| `npm run dev` | Runs the site locally at http://localhost:8787 |
| `npm run deploy` | Publishes to Cloudflare (normally done by Cloudflare from GitHub). |

`npm run dev` passes an older compatibility date because the pinned Wrangler version cannot run
the date in `wrangler.json` locally. Deploys are not affected.

## Switching on Discover (one-time setup)

Discover reads results that a scheduled job (every 5 minutes, one small step at a time) stores
in a Cloudflare D1 database. Until the database exists, Discover says "not switched on yet" and
everything else on the site works.

1. Create the database: `npx wrangler d1 create scopeflux`
2. Copy the `database_id` it prints and add this block to `wrangler.json`:
   ```json
   "d1_databases": [
     { "binding": "DB", "database_name": "scopeflux", "database_id": "PASTE-ID-HERE", "migrations_dir": "migrations" }
   ]
   ```
3. Create the tables: `npx wrangler d1 migrations apply scopeflux --remote`
   (or paste the SQL into the D1 **Console** in the Cloudflare dashboard — remove the `--`
   comments first, because the console joins everything into one line).
4. Commit and push. After the deploy, the first market fills in within an hour or two; all eight
   markets within about half a day. Logs: Cloudflare dashboard → Workers → scopeflux → Logs.

Testing the pipeline locally: put `ALLOW_MANUAL_PIPELINE=true` in a `.dev.vars` file (never in
production), run `npx wrangler d1 migrations apply scopeflux --local`, start `npm run dev` and
open http://localhost:8787/api/dev/pipeline-step repeatedly; each call runs one step.

## Where things are

```
worker.mjs                  Router for /api/*; scheduled() runs one pipeline step per cron
wrangler.json               Cloudflare settings (cron every 5 minutes)
migrations/0001_init.sql    D1 tables: builds, candidates, rss_listings, snapshots, topic_cache
lib/
  config.mjs                EVERY threshold, market and limit (shown on Sources & help)
  api.mjs                   GET /api/discover, /api/topic, /api/config
  pipeline.mjs              Scheduled job: collect candidates → evaluate → store snapshot
  rising.mjs                "Rising", "moved first on", agreement count (pure functions)
  topics.mjs                Topic identity: 'en:Godot_(game_engine)' or 'rss:<title>'
  http.mjs                  One safe way to call a service: timeout, size limit, User-Agent, typed errors
  dates.mjs                 UTC days; every series ends at the last complete day
  sources/                  One adapter per source, same output shape
    wikipedia.mjs           Article lookup, daily views, top-viewed lists; also /api/history
    hackernews.mjs          Stories per day (Algolia)
    gdelt.mjs               News articles per day (GDELT DOC 2.0)
    trends-rss.mjs          Google Trends daily RSS; also /api/trending
public/                     The website (served as-is)
  index.html                All pages; each <section class="page"> is one page
  styles/
    tokens.css              All colours, fonts, radii (docs/design.md)
    base.css, layout.css, components.css   Reset and controls; sidebar/topbar/drawer; shared pieces
    discover.css, topic.css, sources.css, pages.css   Per page
  js/
    main.js                 Start-up and page switching (#discover, #topic?key=…, #sources, …)
    state.js                Everything stored in this browser (localStorage) + helpers
    ui/                     dom.js (helpers), chart.js (SVG charts), navigation.js (drawer)
    pages/
      discover.js           Discover trends (GET /api/discover)
      topic.js              Topic page: one chart, one line per source (GET /api/topic)
      sources.js            Sources & help with live thresholds (GET /api/config)
      explorer.js           CSV analytics: one series (Wikipedia topic or imported CSV)
      compare.js, markets.js, seasonality.js, saved.js, history.js, imports.js
      radar.js              Google Trends RSS list (the old Discover page) + saved RSS topics
    data/                   Pure logic used by pages and tests (statistics, CSV, exports, …)
tests/                      node:test; samples/ = saved API answers; helpers/ = fake D1 and fetch
docs/                       Spec, data sources, design, mockups
```

## Where the numbers come from

- **Discover and topic pages:** Wikipedia article views, Hacker News stories, GDELT news articles
  and Google Trends RSS listings. Each source is evaluated on its own; nothing is averaged.
- **CSV analytics, Compare, Markets, Seasonality:** Wikipedia article views, or your CSV.
- **Your CSV** (Import data): values you supply; never uploaded.

Nothing on the site is generated, sampled or estimated. When a source does not answer, the
page says so and leaves the gap empty.
