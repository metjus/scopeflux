export const DAY_MS = 86400000;

// A date-only source never promises a release hour. Keep it upcoming for its full UTC day.
export function releaseTimestamp(value?: string | null): number {
  if (!value) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = Date.parse(value + 'T23:59:59.999Z');
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : NaN;
  }
  return Date.parse(value);
}

export function isUpcomingDate(value: string | null | undefined, now = Date.now()): boolean {
  const at = releaseTimestamp(value);
  return Number.isFinite(at) && at >= now;
}

export function isRecentDate(value: string | null | undefined, now = Date.now(), days = 30): boolean {
  const at = releaseTimestamp(value);
  return Number.isFinite(at) && at < now && at >= now - days * DAY_MS;
}

// Compare calendar dates rather than 24-hour intervals, so DST cannot shift the date filter.
export function calendarDaysFromToday(value: string | null | undefined, now = Date.now()): number | null {
  if (!value || !Number.isFinite(releaseTimestamp(value))) return null;
  const target = new Date(value.length === 10 ? value + 'T12:00:00' : value);
  const today = new Date(now);
  const day = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const current = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((day - current) / DAY_MS);
}

// Some sources publish only a day, without an hour. Every listing is shown the
// same way (date, time and countdown), so for these the release time is
// estimated from how the registry releases names in practice:
// .sk (Backorder.sk deletion day): free from about 02:00 Slovak time the next day.
const ZONE = 'Europe/Bratislava';
function zonedTime(year: number, month: number, day: number, hour: number, zone: string): number {
  const guess = Date.UTC(year, month - 1, day, hour);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric'})
    .formatToParts(new Date(guess)).map(part => [part.type, Number(part.value)]));
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour);
  return guess - (shown - guess);
}
/** Deletion day (YYYY-MM-DD) of a .sk domain -> estimated release time (ISO). */
export function skReleaseTime(deletionDay: string): string {
  const [year, month, day] = deletionDay.split('-').map(Number);
  return new Date(zonedTime(year, month, day + 1, 2, ZONE)).toISOString();
}

