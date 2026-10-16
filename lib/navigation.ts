export const PAGES = [
  { id: 'discover', label: 'Expiring soon', description: 'Discover upcoming releases' },
  { id: 'recent', label: 'Recently expired', description: 'Revisit past release estimates' },
  { id: 'watch', label: 'Watchlist', description: 'Follow your saved domain names' },
  { id: 'lookup', label: 'Check domain', description: 'Look up a specific domain name' },
  { id: 'sources', label: 'Sources', description: 'Providers, updates and coverage' },
  { id: 'about', label: 'About', description: 'Get to know ScopeFlux' },
] as const;

export type PageId = (typeof PAGES)[number]['id'];

export function pageFromHash(hash: string): PageId {
  return PAGES.find(page => `#${page.id}` === hash)?.id ?? 'discover';
}

export function pageLabel(id: PageId): string {
  return PAGES.find(page => page.id === id)!.label;
}
