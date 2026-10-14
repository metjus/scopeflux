// The scheduled job that builds Discover. Pages never call external sources for
// Discover; they read the newest finished snapshot from D1.
//
// Each cron run does ONE small step, to stay inside the free plan (50 outgoing
// requests and little CPU per run):
//   1. no build running  -> start one for the market whose snapshot is oldest:
//                           read its RSS feeds and Wikipedia top lists (≤ 9 requests)
//   2. build running     -> evaluate the next few candidates on every source
//   3. nothing left      -> combine the results into a snapshot and store it
import { MARKETS, SOURCES, PIPELINE, WINDOW_DAYS } from './config.mjs';
import { lastCompleteDay, dayRange, isoDay, DAY_MS } from './dates.mjs';
import { fetchFeed, normalizeTitle } from './sources/trends-rss.mjs';
import * as wikipedia from './sources/wikipedia.mjs';
import * as hackernews from './sources/hackernews.mjs';
import * as gdelt from './sources/gdelt.mjs';
import { evaluateCounts, evaluateRss, summarizeTopic } from './rising.mjs';
import { articleKey, rssKey, articleTitle, searchTextFor, parseTopicKey } from './topics.mjs';

const realSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runPipelineStep(env, { now = Date.now(), fetcher = fetch, sleep = realSleep } = {}) {
  const db = env.DB;
  const build = await db
    .prepare("SELECT * FROM builds WHERE status = 'evaluating' ORDER BY started_at LIMIT 1")
    .first();
  if (!build) {
    const market = await marketToRebuild(db, now);
    if (!market) return { action: 'idle' };
    return collect(db, market, { now, fetcher });
  }
  const pending = await db
    .prepare("SELECT * FROM candidates WHERE build_id = ? AND status = 'pending' LIMIT ?")
    .bind(build.build_id, PIPELINE.candidatesPerRun)
    .all();
  if (pending.results.length) return evaluate(db, build, pending.results, { now, fetcher, sleep });
  return finish(db, build, { now });
}

// The market with no snapshot, or the oldest one past PIPELINE.rebuildAfterHours.
async function marketToRebuild(db, now) {
  const rows = await db.prepare('SELECT market, MAX(started_at) AS last FROM builds GROUP BY market').all();
  const last = Object.fromEntries(rows.results.map(r => [r.market, r.last]));
  const due = Object.keys(MARKETS)
    .map(market => ({ market, last: last[market] ? Date.parse(last[market]) : 0 }))
    .filter(m => now - m.last >= PIPELINE.rebuildAfterHours * 3_600_000)
    .sort((a, b) => a.last - b.last);
  return due[0]?.market ?? null;
}

// --- step 1: collect candidates ----------------------------------------------

async function collect(db, market, { now, fetcher }) {
  const config = MARKETS[market];
  const startedAt = new Date(now).toISOString();
  const buildId = market + '|' + startedAt;
  const today = isoDay(now);
  const candidates = new Map(); // topic_key -> { label, foundVia }
  const status = { rss: { ok: 0, failed: 0 }, wikipedia: { ok: 0, failed: 0 } };
  const statements = [];

  // Google Trends RSS: store today's listings, and every item is a candidate.
  for (const geo of config.rss) {
    try {
      const feed = await fetchFeed(geo, fetcher);
      status.rss.ok++;
      for (const item of feed.items) {
        statements.push(
          db
            .prepare('INSERT OR IGNORE INTO rss_listings (geo, title_norm, title, day) VALUES (?, ?, ?, ?)')
            .bind(geo, normalizeTitle(item.title), item.title, today),
        );
        if (candidates.size < PIPELINE.maxRssCandidates)
          candidates.set(rssKey(item.title), { label: item.title, foundVia: 'rss' });
      }
    } catch (error) {
      status.rss.failed++;
      console.error('RSS collection failed', { geo, message: error?.message });
    }
  }

  // Wikipedia: articles that climbed between the same weekday a week apart.
  try {
    const rules = SOURCES.wikipedia;
    let day = lastCompleteDay(now);
    let latest = await wikipedia.topArticles(config.lang, day, fetcher);
    if (!latest.length) {
      // Early in the UTC day yesterday's list may not exist yet.
      day = isoDay(Date.parse(day) - DAY_MS);
      latest = await wikipedia.topArticles(config.lang, day, fetcher);
    }
    const weekEarlier = await wikipedia.topArticles(
      config.lang,
      isoDay(Date.parse(day) - WINDOW_DAYS * DAY_MS),
      fetcher,
    );
    const found = wikipedia.climbers(latest, weekEarlier, {
      ratio: PIPELINE.climberRatio,
      minViews: config.lang === 'en' ? rules.minPerDayEnglish : rules.minPerDayOther,
      limit: PIPELINE.maxWikipediaClimbers,
    });
    for (const a of found)
      candidates.set(articleKey(config.lang, a.key), { label: articleTitle(a.key), foundVia: 'wikipedia' });
    status.wikipedia.ok++;
  } catch (error) {
    status.wikipedia.failed++;
    console.error('Wikipedia top list failed', { market, message: error?.message });
  }

  statements.push(
    db
      .prepare(
        "INSERT INTO builds (build_id, market, started_at, status, collect_json) VALUES (?, ?, ?, 'evaluating', ?)",
      )
      .bind(buildId, market, startedAt, JSON.stringify(status)),
  );
  for (const [key, c] of candidates)
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO candidates (build_id, topic_key, market, label, found_via, found_at, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
        )
        .bind(buildId, key, market, c.label.slice(0, 300), c.foundVia, startedAt),
    );
  await db.batch(statements);
  return { action: 'collected', market, candidates: candidates.size };
}

// --- step 2: evaluate a few candidates ---------------------------------------

async function evaluate(db, build, rows, { now, fetcher, sleep }) {
  const market = build.market;
  const lang = MARKETS[market].lang;
  // RSS is a live list, so its window includes today.
  const rssWindow = dayRange(SOURCES.rss.listedWithinDays, now + DAY_MS);
  let gdeltCalls = 0;
  const statements = [];

  for (const row of rows) {
    const topic = { title: row.label, lang, article: null, foundVia: row.found_via };
    const perSource = {};
    const parsed = parseTopicKey(row.topic_key);
    if (parsed?.article) topic.article = parsed.article;
    else {
      // RSS titles are free text: look for the matching article first.
      try {
        const found = await wikipedia.resolveArticle(row.label, lang, fetcher);
        if (found) {
          topic.article = found.key;
          topic.title = found.title;
        }
      } catch (error) {
        perSource.wikipedia = { error: error.code || 'HTTP_ERROR' };
      }
    }
    topic.key = topic.article ? articleKey(lang, topic.article) : row.topic_key;
    topic.searchText = topic.article ? searchTextFor(articleTitle(topic.article)) : row.label;

    if (!perSource.wikipedia)
      perSource.wikipedia = topic.article
        ? await measure(
            'wikipedia',
            () => wikipedia.getDailySeries(topic, market, 2 * WINDOW_DAYS, { fetcher, now }),
            lang,
          )
        : { noArticle: true };
    perSource.hackernews = await measure('hackernews', () =>
      hackernews.getDailySeries(topic, market, 2 * WINDOW_DAYS, { fetcher, now }),
    );
    if (gdeltCalls++ > 0) await sleep(PIPELINE.gdeltDelayMs);
    perSource.gdelt = await measure('gdelt', () =>
      gdelt.getDailySeries(topic, market, 2 * WINDOW_DAYS, { fetcher, now }),
    );
    perSource.rss = evaluateRss(
      await rssDates(db, market, [row.label, topic.title, topic.searchText]),
      rssWindow,
    );

    statements.push(
      db
        .prepare("UPDATE candidates SET status = 'done', result = ? WHERE build_id = ? AND topic_key = ?")
        .bind(JSON.stringify({ ...topic, perSource }), build.build_id, row.topic_key),
    );
  }
  await db.batch(statements);
  return { action: 'evaluated', market, count: rows.length };
}

// Run one source; a failure becomes { error } so the other sources still count.
async function measure(sourceKey, load, lang) {
  try {
    const data = await load();
    return { ...evaluateCounts(sourceKey, data.series, { lang }), values: data.series.map(p => p.value) };
  } catch (error) {
    // "Nothing to search for" is not an outage.
    if (error.code === 'NO_MATCH') return { noData: true };
    console.error(sourceKey + ' failed', { message: error?.message });
    return { error: error.code || 'HTTP_ERROR' };
  }
}

// Days in the last window when any of the names was listed in the market's feeds.
async function rssDates(db, market, names) {
  const geos = MARKETS[market].rss;
  const norms = [...new Set(names.filter(Boolean).map(normalizeTitle))];
  const sql =
    'SELECT DISTINCT day FROM rss_listings WHERE geo IN (' +
    geos.map(() => '?').join(',') +
    ') AND title_norm IN (' +
    norms.map(() => '?').join(',') +
    ')';
  const rows = await db
    .prepare(sql)
    .bind(...geos, ...norms)
    .all();
  return rows.results.map(r => r.day);
}

// --- step 3: build the snapshot ----------------------------------------------

async function finish(db, build, { now }) {
  const rows = await db
    .prepare("SELECT result FROM candidates WHERE build_id = ? AND status = 'done'")
    .bind(build.build_id)
    .all();
  const snapshot = buildSnapshot(
    build.market,
    rows.results.map(r => JSON.parse(r.result)),
    JSON.parse(build.collect_json || '{}'),
    new Date(now).toISOString(),
    lastCompleteDay(now),
  );
  await db.batch([
    db
      .prepare('INSERT INTO snapshots (market, built_at, json) VALUES (?, ?, ?)')
      .bind(build.market, snapshot.builtAt, JSON.stringify(snapshot)),
    db
      .prepare("UPDATE builds SET status = 'done', finished_at = ? WHERE build_id = ?")
      .bind(snapshot.builtAt, build.build_id),
  ]);
  return { action: 'finished', market: build.market, topics: snapshot.rising.length + snapshot.early.length };
}

// Pure: evaluated candidates -> the Discover payload for one market.
export function buildSnapshot(market, results, collectStatus, builtAt, windowEnd) {
  // An RSS title and a Wikipedia climber can be the same article: keep one.
  const byKey = new Map();
  for (const r of results) {
    const known = byKey.get(r.key);
    if (!known) byKey.set(r.key, r);
    else if (r.perSource.rss?.rising) known.perSource.rss = r.perSource.rss;
  }

  const topics = [...byKey.values()].map(r => ({
    key: r.key,
    title: r.title,
    article: r.article,
    lang: r.lang,
    ...summarizeTopic(r.perSource),
    perSource: Object.fromEntries(
      Object.entries(r.perSource).map(([source, v]) => [source, publicResult(v)]),
    ),
  }));
  const byStrength = (a, b) => b.sourcesRising - a.sourcesRising || (b.changePct ?? -1) - (a.changePct ?? -1);

  return {
    market,
    marketName: MARKETS[market].name,
    builtAt,
    windowDays: WINDOW_DAYS,
    windowEnd,
    candidates: results.length,
    sources: sourceStatus(results, collectStatus),
    rising: topics.filter(t => t.sourcesRising >= 2).sort(byStrength),
    early: topics.filter(t => t.sourcesRising === 1).sort(byStrength),
  };
}

// What the browser needs per source and topic (no raw error internals).
function publicResult(v) {
  if (!v) return { status: 'missing' };
  if (v.error) return { status: 'unavailable' };
  if (v.noArticle) return { status: 'no-article' };
  if (v.noData || v.missing) return { status: 'no-data' };
  if ('listedDays' in v) return { status: 'ok', rising: v.rising, listedDays: v.listedDays };
  return { status: 'ok', rising: v.rising, changePct: v.changePct, last7: v.last7, prev7: v.prev7 };
}

// Per source: answered / failed during this build, and an overall status.
function sourceStatus(results, collectStatus) {
  const out = {};
  for (const key of ['wikipedia', 'hackernews', 'gdelt']) {
    const failed = results.filter(r => r.perSource[key]?.error).length;
    const answered = results.filter(
      r => r.perSource[key] && !r.perSource[key].error && !r.perSource[key].noArticle,
    ).length;
    out[key] = { answered, failed, status: statusOf(answered, failed) };
  }
  const rss = collectStatus.rss || { ok: 0, failed: 0 };
  out.rss = { answered: rss.ok, failed: rss.failed, status: statusOf(rss.ok, rss.failed) };
  if (collectStatus.wikipedia?.failed) out.wikipedia.topListFailed = true;
  return out;
}

const statusOf = (answered, failed) =>
  answered === 0 && failed > 0
    ? 'unavailable'
    : failed > answered
      ? 'partial'
      : answered === 0
        ? 'no-data'
        : 'ok';
