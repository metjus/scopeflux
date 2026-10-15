# Data sources (v1)

Four free sources, no accounts or approvals needed. Endpoints below are a starting
point — **check each provider's current docs before coding against them**, and
record anything that differs in this file.

Every request: timeout, response size limit, `User-Agent: ScopeFlux/1.0
(https://scopeflux.io; matus.sturdik1@gmail.com)`, and a typed error the UI can show.

---

## 1. Wikipedia pageviews

- **Counts:** article views per day, one language edition. Not searches.
- **History:** back to July 2015.
- **Per-article series:**
  `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{lang}.wikipedia/all-access/user/{article}/daily/{YYYYMMDD}/{YYYYMMDD}`
- **Top articles of a day (candidates):**
  `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/{lang}.wikipedia/all-access/{YYYY}/{MM}/{DD}`
- **Resolve free text → article:**
  `https://{lang}.wikipedia.org/w/rest.php/v1/search/page?q={text}&limit=1`
- **Already implemented:** `lib/wikipedia.mjs` (`resolveArticle`, `pageviews`,
  `historyResponse`, `WIKI_LANGUAGES`) with tests. Reuse it.
- **As built (Oct 2026):** if yesterday's top list is not published yet, the day before is used.
  Days with no entry in the per-article answer count as 0 views.
- **Notes:** Wikimedia requires a descriptive User-Agent. Yesterday's data may not be
  complete early in the UTC day — always end the window at the last complete day.
  Filter non-articles from top lists (Main_Page, Special:, Wikipedia:, File:, etc.).
- **Limit to state in the UI:** a language edition is only a rough stand-in for a
  country; topics without an article return nothing.

## 2. Hacker News (Algolia search API)

- **Counts:** stories submitted that mention the topic, per day. Optional: points.
- **History:** since 2007.
- **Endpoint:**
  `https://hn.algolia.com/api/v1/search_by_date?query={text}&tags=story&numericFilters=created_at_i>{from},created_at_i<{to}&hitsPerPage={n}`
  Bucket the returned `created_at_i` by UTC day to build the series.
- **As built (Oct 2026):** `hitsPerPage=1000` (Algolia's maximum), `restrictSearchableAttributes=title`,
  `typoTolerance=false`, `attributesToRetrieve=created_at_i`. If more than 1,000 stories match,
  the older days are marked unknown (null), never zero. Rate limit: 10,000 requests/hour per IP.
- **Notes:** check the documented rate limit and the max `hitsPerPage`.
  Global only — no per-country data. Very few stories for non-tech topics is normal,
  not an error.
- **Limit to state in the UI:** small, tech-leaning audience; one front-page post
  moves the line a lot.

## 3. Google News RSS search (replaced GDELT in Oct 2026)

- **Counts:** news articles that mention the topic, per UTC day of publication, in one
  Google News country edition. Free, no key.
- **Endpoint:**
  `https://news.google.com/rss/search?q={query} when:{N}d&hl={hl}&gl={gl}&ceid={gl}:{lang}`
  Editions per market live in `lib/config.mjs` (`MARKETS[...].news`). Worldwide uses the
  US English edition. Multi-word names are quoted; names under 2 characters are not searched.
- **Limit:** Google returns at most **100 articles per search**. When an answer has 100 items,
  the days up to the oldest returned article are set to unknown (`null`), never 0, and the
  topic page says so. Recent days of a very busy topic can still be undercounted.
- **Why it replaced GDELT:** GDELT DOC 2.0 answered "Please limit requests to one every
  5 seconds" for Cloudflare's shared IPs, and often took 10–20 s. Google News answers fast.
- **Licence note:** the feed is public, but Google's terms do not clearly allow commercial
  reuse. Only counts are shown (no headlines or text). Review this before relying on ads income.
- **Limit to state in the UI:** counts published articles, not readers; syndicated copies
  inflate counts; at most 100 articles per search.

## 4. Google Trends RSS (daily trending searches)

- **Counts:** whether a topic is listed in today's trending list for a country.
  A list, not a measurement — it is never drawn as a line.
- **Endpoint:** `https://trends.google.com/trending/rss?geo={COUNTRY}` — already
  implemented in `lib/trending.mjs` (`/api/trending`). Wrap it, do not rewrite it.
- **As built (Oct 2026):** each pipeline run stores the day's listings in D1 (`rss_listings`);
  "listed within 7 days" counts today, because the feed is live.
- **Notes:** traffic labels like "200+" are buckets, not counts. Missing from the
  feed does not mean the topic went quiet. History only exists from the day
  ScopeFlux starts storing snapshots.

---

## Not used in v1

- **Google Trends API** — closed alpha, no access. Do not scrape Google Trends pages.
- **Reddit** — free API is non-commercial only and needs manual approval. Not used.
- Bluesky, YouTube — possible later sources; not in v1.

---

## Rising rules (starting values — put them in `lib/config.mjs`)

| Source | Rising when | Minimum volume |
|---|---|---|
| Wikipedia | avg last 7 days ≥ 1.25 × avg previous 7 | ≥ 200 views/day (English), ≥ 30 on smaller editions |
| Hacker News | stories last 7 days ≥ 1.5 × previous 7 | ≥ 3 stories in last 7 days |
| Google News | articles last 7 days ≥ 1.25 × previous 7 | ≥ 10 articles in last 7 days |
| Trends RSS | listed on at least 1 day of the last 7 | — |

- **Agreement** = number of sources where the topic is rising. A count, not a score.
- **Change %** = last 7 days vs previous 7, on the "moved first on" source only.
- **Moved first on** = the source whose 3-day average first crossed its own
  baseline × threshold inside the window. If unclear, show the strongest rising
  source and do not claim it moved first.

These numbers are guesses to start from. After a week of real data, look at what
lands in each group and tune them with Matúš.
