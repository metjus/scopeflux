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

## 3. GDELT DOC 2.0

- **Counts:** matching news articles per day (raw volume), worldwide or per source
  country.
- **History:** the DOC API covers roughly the last 3 months — enough for 90-day
  charts; check the current limit.
- **Endpoint:**
  `https://api.gdeltproject.org/api/v2/doc/doc?query={query}&mode=timelinevolraw&timespan=14d&format=json`
  For a market add `sourcecountry:{code}` inside the query (check GDELT's country
  code list — it is not always ISO).
- **As built (Oct 2026):** `startdatetime`/`enddatetime` instead of `timespan`, so days line up
  with the other sources. Short ranges come back in 15-minute steps; they are added up per day.
  The market filter uses country *names* (`sourcecountry:slovakia`), because GDELT's two-letter
  codes are FIPS, not ISO (Slovakia is `LO`, Germany `GM`). Names live in `lib/config.mjs`.
  Characters GDELT treats as operators (`:` `(` …) are removed; multi-word names are quoted;
  names under 3 characters are not searched. Plain-text answers mean "no data". The pipeline
  waits 5.5 s between GDELT calls (third-party docs say 1 request per 5 s).
- **Notes:** GDELT asks clients to keep request rates low — find the current
  guidance and throttle to it. Multi-word topics need quotes. Very short or very
  common words may be rejected; treat that as "no data", not a crash.
- **Limit to state in the UI:** counts published articles, not readers; syndicated
  copies inflate counts.

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
| GDELT | articles last 7 days ≥ 1.25 × previous 7 | ≥ 10 articles in last 7 days |
| Trends RSS | listed on at least 1 day of the last 7 | — |

- **Agreement** = number of sources where the topic is rising. A count, not a score.
- **Change %** = last 7 days vs previous 7, on the "moved first on" source only.
- **Moved first on** = the source whose 3-day average first crossed its own
  baseline × threshold inside the window. If unclear, show the strongest rising
  source and do not claim it moved first.

These numbers are guesses to start from. After a week of real data, look at what
lands in each group and tune them with Matúš.
