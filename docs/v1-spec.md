# ScopeFlux v1 — build spec

The goal of v1 is a **small version that is live and honest**, not the full design.
The full design (in `docs/mockups/`) is the direction, not the checklist.

## What v1 does

A visitor opens scopeflux.io and immediately sees topics that are rising right now
across several free sources, grouped by how many sources agree. They can pick a
market, open a topic to see how each source moved over time, and save topics in
their browser.

## In v1

- **Discover trends** page (replaces the current Radar page)
  - Tab **Rising now**: topics rising on 2 or more sources, grouped
    "On 4 of 4 sources" → "On 3 of 4" → "On 2 of 4", strongest first
  - Tab **Early signals**: topics rising on exactly 1 source
  - **Market** dropdown (see markets below). No other filters.
  - First 20 rows, then a "Show more" button
  - Save button per row (browser storage, reuse the existing watchlist)
- **Topic** page: one chart with each source as its own line, indexed to its own
  peak (100 = that source's busiest day in the window); 30 / 90 days; hover shows
  the raw value + unit per source; a per-source table with units
- **Sources & help** page: what every source counts, limits, the thresholds used
- New visual design (see `docs/design.md`) applied to the whole site, including
  the pages that already exist (CSV analytics, Compare, Seasonality, Import)
- Empty, loading and error states for the above (see `docs/mockups/States.dc.html`)

## Not in v1 (do not build yet)

Reddit · Bluesky · YouTube · emails / paid tracking · "Why it spiked" · lead/lag ·
regions panel · co-mentions · topic history from the archive · "since your last
visit" · ⌘K palette · time-window dropdown · redesign of Compare / Seasonality
logic (restyle only).

## Sources in v1 (4)

| Source | Role | "Rising" means |
|---|---|---|
| Wikipedia pageviews | interest over time | last-7-day avg views > previous 7 × threshold |
| Hacker News (Algolia) | developer / tech signal | stories last 7 days > previous 7 × threshold |
| Google News RSS (replaced GDELT DOC 2.0, Oct 2026) | news coverage | articles last 7 days > previous 7 × threshold |
| Google Trends RSS | today's search trends | listed in the market's daily feed within 7 days |

Exact endpoints, limits and thresholds: `docs/data-sources.md`.
All thresholds live in **one config file** (`lib/config.mjs`) and are shown on the
Sources page, so they are visible and tunable.

## Markets in v1

Worldwide, United States (US), United Kingdom (GB), Germany (DE), Slovakia (SK),
Czechia (CZ), France (FR), Japan (JP).

- Wikipedia: language edition from `WIKI_LANGUAGES` in `lib/wikipedia.mjs`;
  Worldwide = English edition
- Google News: country edition per market; Worldwide = US English edition (was GDELT)
- Hacker News: global everywhere (say so in the UI)
- Trends RSS: the market's `geo`; Worldwide = listed in any of the 7 national feeds

## How a topic is identified

The Wikipedia article is the topic's identity (e.g. `en:Godot_(game_engine)`).
- Candidates from Trends RSS (free text) are resolved to an article with
  `resolveArticle()` in `lib/wikipedia.mjs`. No match → keep the topic with
  Wikipedia marked "no article" (it can still rise on other sources).
- The article title is the search query for Hacker News and Google News.
- Known limit, shown on the Sources page: name matching is imperfect
  ("Apple" the company vs the fruit).

## Pipeline (scheduled, not on page load)

Page views must never trigger dozens of external requests. A Cron Trigger builds
the data; the pages only read stored results.

1. **Collect candidates** per market
   - Trends RSS items for the market
   - Wikipedia "top viewed" articles for the language edition: yesterday vs the same
     day a week earlier → articles that climbed (skip Main_Page, Special:, etc.)
2. **Evaluate** each candidate on every source → daily series for the last 14 days
   (90 for the topic page, fetched on demand and cached) → rising yes/no per source,
   change %, and "moved first on" = the source whose rise started earliest
3. **Store** a snapshot per market in D1; Discover reads the latest complete one
4. **Archive**: keep every daily snapshot (it becomes the topic-history feature later)

**Cloudflare limits:** check the current Workers limits for your plan (subrequests
per invocation, CPU time, cron frequency) in the Cloudflare docs before choosing a
batch size. Design for the free plan: a queue table in D1, each cron run processes
the next N candidates, Discover shows the last finished snapshot plus when it was
built. Tell Matúš if the paid plan ($5/month) would make it materially simpler.

## Suggested D1 tables (adjust if you have a better reason)

- `candidates(market, topic_key, label, found_via, found_at, status)`
- `evaluations(market, topic_key, source, day, value, rising, change_pct)`
- `snapshots(market, built_at, json)` — the ready-made Discover payload

## API

- `GET /api/discover?market=US` → latest snapshot for the market
- `GET /api/topic?key=en:Godot_(game_engine)&market=US&days=90` → series per source
  with units and fetch time
- Keep `GET /api/trending` and `GET /api/history` working (already exist)

## Phases — one at a time, `npm test` green after each

0. **Look around.** Read the repo and these docs. In plan mode, list what exists,
   what is minified, risks you see. No edits.
1. **Make the code readable.** Unminify and split `public/` into clear modules.
   Zero behaviour change; existing tests pass; add a short `README.md` map of files.
2. **New look.** Apply `docs/design.md` to the existing pages. Behaviour unchanged.
3. **Source adapters.** `lib/sources/wikipedia.mjs` (move the existing file),
   `hackernews.mjs`, `google-news.mjs` (was `gdelt.mjs`), `trends-rss.mjs` (wrap existing `lib/trending.mjs`).
   Same shape for each: `getDailySeries(query, market, days)` →
   `{ source, unit, series: [{date, value}], fetchedAt }` or a typed error.
   Unit tests with saved sample responses, no live network in tests.
4. **Pipeline + D1 + cron** as above. A manual trigger route for testing that is
   disabled in production.
5. **Discover page** on `/api/discover`, matching `docs/mockups/Main.dc.html`
   (4 sources instead of 5, no time-window dropdown).
6. **Topic page** on `/api/topic`, matching the chart part of
   `docs/mockups/Result.dc.html` only.
7. **Sources & help + states** from `Sources.dc.html` and `States.dc.html`,
   with the real thresholds from `lib/config.mjs`.
8. **Deploy** and check every page on a phone.

## Done means

- Every number on screen has a named source and unit
- Turning off any one source (e.g. Google News down) leaves the site working, with that
  source shown as unavailable
- No sample or synthetic data anywhere in production code
- `npm test` passes; code is readable without the docs
