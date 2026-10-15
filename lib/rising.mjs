// "Is this topic rising on this source?" — the rules from docs/data-sources.md,
// with every threshold taken from config.mjs. Pure functions, no network.
import { SOURCES, WINDOW_DAYS, FIRST_MOVE_AVERAGE_DAYS } from './config.mjs';

const sum = values => values.reduce((total, v) => total + v, 0);
const average = values => (values.length ? sum(values) / values.length : null);

// series: the last 2 × WINDOW_DAYS daily points, oldest first.
// Returns { rising, last7, prev7, changePct, firstCrossDate } or { missing: true }.
export function evaluateCounts(sourceKey, series, { lang = 'en' } = {}) {
  const rules = SOURCES[sourceKey];
  const points = series.slice(-2 * WINDOW_DAYS);
  // Missing days (null) make the comparison unreliable: report as missing.
  if (points.length < 2 * WINDOW_DAYS || points.some(p => p.value === null)) return { missing: true };
  const values = points.map(p => p.value);
  const prev = values.slice(0, WINDOW_DAYS),
    last = values.slice(WINDOW_DAYS);
  const prevAvg = average(prev),
    lastAvg = average(last);
  const changePct = prevAvg > 0 ? (lastAvg / prevAvg - 1) * 100 : null;

  const meetsMinimum =
    sourceKey === 'wikipedia'
      ? lastAvg >= (lang === 'en' ? rules.minPerDayEnglish : rules.minPerDayOther)
      : sum(last) >= rules.minLast7;
  // From zero to above the minimum counts as rising too.
  const rising = meetsMinimum && (prevAvg === 0 ? lastAvg > 0 : lastAvg >= rules.ratio * prevAvg);

  return {
    rising,
    last7: sum(last),
    prev7: sum(prev),
    changePct,
    firstCrossDate: rising ? firstCrossing(points, prevAvg * rules.ratio) : null,
    spark: last,
  };
}

// First day in the last window whose trailing 3-day average exceeds the line.
function firstCrossing(points, line) {
  for (let i = WINDOW_DAYS; i < points.length; i++) {
    const window = points.slice(Math.max(0, i - FIRST_MOVE_AVERAGE_DAYS + 1), i + 1).map(p => p.value);
    if (average(window) > line) return points[i].date;
  }
  return null;
}

// listedDates: days the topic appeared in the market's RSS feed.
// recentDates: the last `listedWithinDays` days, including today (the feed is live).
export function evaluateRss(listedDates, recentDates) {
  const listed = recentDates.filter(date => listedDates.includes(date));
  return { rising: listed.length > 0, listedDays: listed.length, firstCrossDate: listed[0] ?? null };
}

// Combine per-source results into what Discover shows.
// perSource: { wikipedia: result|{missing}|{error}, hackernews: …, news: …, rss: … }
export function summarizeTopic(perSource) {
  const rising = Object.entries(perSource).filter(([, r]) => r?.rising);
  const measured = rising.filter(([key]) => key !== 'rss');
  // "Moved first on": the measured source whose rise started earliest.
  const dated = measured
    .filter(([, r]) => r.firstCrossDate)
    .sort((a, b) => a[1].firstCrossDate.localeCompare(b[1].firstCrossDate));
  const clearlyFirst =
    dated.length > 0 && (dated.length === 1 || dated[0][1].firstCrossDate < dated[1][1].firstCrossDate);
  // Otherwise show the strongest rising source, without claiming it moved first.
  const strongest = [...measured].sort((a, b) => (b[1].changePct ?? 0) - (a[1].changePct ?? 0))[0];
  const leader = clearlyFirst ? dated[0] : strongest;
  return {
    sourcesRising: rising.length,
    risingOn: rising.map(([key]) => key),
    leader: leader ? leader[0] : (rising[0]?.[0] ?? null),
    leaderIsFirst: Boolean(clearlyFirst),
    changePct: leader ? leader[1].changePct : null,
    spark: leader ? leader[1].spark : null,
  };
}
