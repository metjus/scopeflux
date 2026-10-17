// Titles, descriptions and addresses for search engines and link previews.
// One entry per page that has its own URL (see PAGE_PATHS in navigation.ts).
import type {Metadata} from 'next';

export const SITE_URL = 'https://scopeflux.io';
export const SITE_NAME = 'ScopeFlux';
export const SITE_DESCRIPTION =
  'Find expiring and dropping domains before they are released. Upcoming .sk, .cz, .com, .net, .org, .io and .app releases with dates and sources.';

// ?v= makes Facebook, X and LinkedIn fetch a changed image instead of a cached one.
const OG_IMAGE = {url: '/og-image.png?v=2', width: 1200, height: 630, alt: 'ScopeFlux — expiring and dropping domains'};

// description: search results (Google shows ~155 characters).
// social: link previews on Facebook, X, LinkedIn (~125 characters before they cut it).
type PageSeo = {path: string; title: string; description: string; social: string};

export const PAGE_SEO = {
  discover: {path: '/', title: 'ScopeFlux — Expiring & dropping domains', description: SITE_DESCRIPTION, social: 'Upcoming domain releases for .sk, .cz, .com, .net, .org, .io and .app, with dates, sources and a free watchlist.'},
  lookup: {path: '/check-domain', title: 'Check a domain’s expiration date — ScopeFlux', description: 'Check any domain’s registration status and expiration date, plus its expected release date when a source lists it. Uses public RDAP data.', social: 'Look up any domain: registration status, expiration date and expected release date.'},
  how: {path: '/how-it-works', title: 'How domain expiry works: stages & fees — ScopeFlux', description: 'What happens when a domain owner forgets to renew: grace period, redemption, deletion and release, with typical fees for .com, .sk and .cz.', social: 'Expired is not free yet. The stages and fees between expiry and release, explained simply.'},
  sources: {path: '/sources', title: 'Data sources & coverage — ScopeFlux', description: 'Where ScopeFlux gets its release dates: CZ.NIC auctions for .cz, Backorder.sk for .sk, Dynadot for .com, .net, .org, .io and .app, and RDAP.', social: 'Every release date has a source: CZ.NIC, Backorder.sk, Dynadot and RDAP. What each covers and its limits.'},
  about: {path: '/about', title: 'About ScopeFlux — find your next domain name', description: 'ScopeFlux brings upcoming domain releases into one place, so you can discover names, compare extensions and see when a domain may become available.', social: 'Upcoming domain releases in one place: discover names, compare extensions and see when a domain may free up.'},
  privacy: {path: '/privacy', title: 'Privacy — ScopeFlux', description: 'What ScopeFlux stores and why: no analytics or tracking cookies, optional sign-in for the watchlist, and how to ask for your data to be deleted.', social: 'No analytics or tracking cookies. What ScopeFlux stores, and how to have it deleted.'},
  contact: {path: '/contact', title: 'Contact — ScopeFlux', description: 'Questions, corrections to a listing, ideas or data requests for ScopeFlux, the expiring-domains catalogue: write to hello@scopeflux.io.', social: 'Questions, corrections or data requests: hello@scopeflux.io.'},
} satisfies Record<string, PageSeo>;

export function pageMetadata(page: keyof typeof PAGE_SEO): Metadata {
  const {path, title, description, social} = PAGE_SEO[page];
  return {
    title: {absolute: title},
    description,
    alternates: {canonical: path},
    // Next.js replaces (not merges) these objects per page, so each page carries them in full.
    openGraph: {title, description: social, url: path, type: 'website', siteName: SITE_NAME, locale: 'en_GB', images: [OG_IMAGE]},
    twitter: {card: 'summary_large_image', title, description: social, images: [{url: OG_IMAGE.url, alt: OG_IMAGE.alt}]},
  };
}
