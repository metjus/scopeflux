// Watchlist for visitors who are not signed in: kept only in this browser.
// After sign-in the names are moved to the account and this copy is cleared.
import type {DomainRecord} from './domains';

const KEY = 'scopeflux-watchlist';
export const WATCHLIST_LIMIT = 100;

export function readLocalWatchlist(): DomainRecord[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value.filter(item => item && typeof item.domain === 'string').slice(0, WATCHLIST_LIMIT) : [];
  } catch {return [];}
}

export function writeLocalWatchlist(records: DomainRecord[]) {
  try {
    if (records.length) localStorage.setItem(KEY, JSON.stringify(records.slice(0, WATCHLIST_LIMIT)));
    else localStorage.removeItem(KEY);
  } catch {/* Private mode or blocked storage: the list lasts for this visit only. */}
}
