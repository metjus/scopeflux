// UTC calendar days as 'YYYY-MM-DD' strings. Every series ends at the last
// complete day (yesterday), because today's numbers are always partial.
export const DAY_MS = 86_400_000;

export const isoDay = time => new Date(time).toISOString().slice(0, 10);

export function lastCompleteDay(now = Date.now()) {
  return isoDay(Date.UTC(...utcParts(now)) - DAY_MS);
}

function utcParts(time) {
  const d = new Date(time);
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
}

// The `days` dates ending at the last complete day, oldest first.
export function dayRange(days, now = Date.now()) {
  const end = Date.parse(lastCompleteDay(now) + 'T00:00:00Z');
  return Array.from({ length: days }, (_, i) => isoDay(end - (days - 1 - i) * DAY_MS));
}

// Turn { 'YYYY-MM-DD': value } into a full series over `dates`.
// Days with no entry are 0: for counts (stories, articles, views) no entry means none.
export function fillSeries(dates, counts) {
  return dates.map(date => ({ date, value: counts[date] ?? 0 }));
}

export const compactDay = date => date.replaceAll('-', '');
