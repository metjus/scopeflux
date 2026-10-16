export const PAGES = [
  { id: 'discover', label: 'Expiring soon', description: 'Discover upcoming releases' },
  { id: 'recent', label: 'Recently expired', description: 'Revisit past release estimates' },
  { id: 'watch', label: 'Watchlist', description: 'Follow your saved domain names' },
  { id: 'lookup', label: 'Check domain', description: 'Look up a specific domain name' },
  { id: 'sources', label: 'Sources', description: 'Providers, updates and coverage' },
  { id: 'about', label: 'About', description: 'Get to know ScopeFlux' },
] as const;

// Shown as small links under the main navigation and in the footer.
export const LEGAL_PAGES = [
  { id: 'privacy', label: 'Privacy', description: 'What ScopeFlux stores and why' },
  { id: 'contact', label: 'Contact', description: 'Get in touch' },
] as const;

const ALL_PAGES = [...PAGES, ...LEGAL_PAGES];

export type PageId = (typeof ALL_PAGES)[number]['id'];

export function pageFromHash(hash: string): PageId {
  return ALL_PAGES.find(page => `#${page.id}` === hash)?.id ?? 'discover';
}

export function pageLabel(id: PageId): string {
  return ALL_PAGES.find(page => page.id === id)!.label;
}
