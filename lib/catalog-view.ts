import type {DomainRecord} from './domains';
import {historicalDate} from './public-history.ts';
import {assessPremium, matchesPremium} from './premium.ts';
import type {PremiumAssessment} from './premium';
import type {FeedInfo} from './catalog';
import {calendarDaysFromToday, isRecentDate, isUpcomingDate} from './release-time.ts';

export type CatalogView = 'discover' | 'recent' | 'watch';
export type CatalogFilters = {
  tlds: string[]; query: string; period: string; status: string; premium: string;
  maxLength: number; noHyphen: boolean; noNumber: boolean;
};
export const RESULTS_PER_PAGE = 100;
export function defaultPeriod(view: string): string {
  return view === 'recent' ? '7' : view === 'watch' ? 'all' : '7';
}
export function expectedRelease(record: DomainRecord): string | null {
  return record.drop || record.conditionalRelease || null;
}
export function matchesDateRange(record: DomainRecord, view: CatalogView, period: string, now = Date.now()): boolean {
  if (view === 'discover' && !isUpcomingDate(record.drop, now)) return false;
  if (view === 'recent' && !isRecentDate(historicalDate(record), now, 7)) return false;
  if (period === 'all') return true;
  const days = Number(period);
  const offset = calendarDaysFromToday((view === 'recent' ? historicalDate(record) : expectedRelease(record)) || record.listedDate || record.expiration, now);
  if (!Number.isFinite(days) || days < 0 || offset === null) return false;
  return view === 'recent' ? offset <= 0 && offset >= -days : offset >= 0 && offset <= days;
}
export function filterListings(records: DomainRecord[], filters: CatalogFilters, view: CatalogView, now = Date.now(), assessments?: ReadonlyMap<string, PremiumAssessment>): DomainRecord[] {
  const query = filters.query.trim().toLowerCase();
  const tlds = new Set(filters.tlds);
  return records.filter(record => {
    const name = record.domain.split('.')[0];
    return (!tlds.size || tlds.has(record.tld))
      && (!query || record.domain.toLowerCase().includes(query))
      && name.length <= filters.maxLength
      && (!filters.noHyphen || !name.includes('-'))
      && (!filters.noNumber || !/\d/.test(name))
      && (filters.status === 'all' || record.status === filters.status)
      && matchesDateRange(record, view, filters.period, now)
      && matchesPremium(assessments?.get(record.domain) ?? assessPremium(record.domain), filters.premium);
  });
}
export function paginateListings<T>(records: T[], requestedPage: number, pageSize = RESULTS_PER_PAGE) {
  const size = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(records.length / size));
  const page = Math.max(1, Math.min(totalPages, Math.floor(requestedPage) || 1));
  const offset = (page - 1) * size;
  return {records: records.slice(offset, offset + size), page, totalPages, total: records.length,
    start: records.length ? offset + 1 : 0, end: Math.min(offset + size, records.length)};
}

export function nextSourcePage(feeds: FeedInfo[], tlds: string[], pages: Record<string, number>, retryAt: Record<string, number>, now = Date.now()): FeedInfo | undefined {
  return feeds.filter(feed => feed.more && (!tlds.length || tlds.includes(feed.tld)) && (retryAt[feed.tld] || 0) <= now)
    .sort((a, b) => (pages[a.tld] || 1) - (pages[b.tld] || 1))[0];
}
