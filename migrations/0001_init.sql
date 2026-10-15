-- ScopeFlux v1 tables (Cloudflare D1 / SQLite).
-- Apply with: npx wrangler d1 migrations apply scopeflux --remote

-- One build = collecting and evaluating the candidates of one market, once a day.
CREATE TABLE IF NOT EXISTS builds (
  build_id    TEXT PRIMARY KEY,          -- market + '|' + started_at
  market      TEXT NOT NULL,             -- key of MARKETS in lib/config.mjs
  started_at  TEXT NOT NULL,             -- ISO time
  finished_at TEXT,
  status      TEXT NOT NULL,             -- 'evaluating' | 'done'
  collect_json TEXT                      -- JSON: which candidate sources answered
);
CREATE INDEX IF NOT EXISTS builds_by_market ON builds (market, started_at);

-- Topics to check in one build. `result` holds the per-source evaluation
-- (including the 14 daily values), so every day's work stays in the archive.
CREATE TABLE IF NOT EXISTS candidates (
  build_id   TEXT NOT NULL,
  topic_key  TEXT NOT NULL,              -- 'en:Godot_(game_engine)' or 'rss:<title>' before lookup
  market     TEXT NOT NULL,
  label      TEXT NOT NULL,
  found_via  TEXT NOT NULL,              -- 'wikipedia' | 'rss'
  found_at   TEXT NOT NULL,
  status     TEXT NOT NULL,              -- 'pending' | 'done'
  result     TEXT,                       -- JSON
  PRIMARY KEY (build_id, topic_key)
);
CREATE INDEX IF NOT EXISTS candidates_pending ON candidates (build_id, status);

-- Every day a topic was listed in a Google Trends RSS feed. RSS has no history
-- of its own, so this table is the only way to know "listed in the last 7 days".
CREATE TABLE IF NOT EXISTS rss_listings (
  geo        TEXT NOT NULL,              -- RSS country code, e.g. 'SK'
  title_norm TEXT NOT NULL,              -- lower-case, single-spaced
  title      TEXT NOT NULL,
  day        TEXT NOT NULL,              -- 'YYYY-MM-DD' (UTC)
  PRIMARY KEY (geo, title_norm, day)
);

-- The ready-made Discover payload per market. Every snapshot is kept (archive).
CREATE TABLE IF NOT EXISTS snapshots (
  market   TEXT NOT NULL,
  built_at TEXT NOT NULL,
  json     TEXT NOT NULL,
  PRIMARY KEY (market, built_at)
);

-- Topic page series fetched on demand, reused for a few hours.
CREATE TABLE IF NOT EXISTS topic_cache (
  cache_key  TEXT PRIMARY KEY,           -- topic_key + '|' + market + '|' + days
  fetched_at TEXT NOT NULL,
  json       TEXT NOT NULL
);
