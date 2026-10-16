// Titles, descriptions and addresses for search engines and link previews.
// One entry per page that has its own URL (see PAGE_PATHS in navigation.ts).
import type {Metadata} from 'next';

export const SITE_URL = 'https://scopeflux.io';
export const SITE_NAME = 'ScopeFlux';
export const SITE_DESCRIPTION =
  'Find expiring and dropping domain names before they are released. Browse upcoming .sk, .cz, .com, .net, .org, .io and .app releases with dates and sources, check any domain’s expiration date, and keep a watchlist.';

const OG_IMAGE = {url: '/og-image.png', width: 1200, height: 630, alt: 'ScopeFlux — expiring and dropping domains'};

type PageSeo = {path: string; title: string; description: string};

export const PAGE_SEO = {
  discover: {path: '/', title: 'ScopeFlux — Expiring & dropping domains', description: SITE_DESCRIPTION},
  lookup: {path: '/check-domain', title: 'Check a domain’s expiration date — ScopeFlux', description: 'Look up any domain name: registration status, expiration date and, where a source lists it, the expected release date. Uses public registry data (RDAP).'},
  sources: {path: '/sources', title: 'Data sources & coverage — ScopeFlux', description: 'Where ScopeFlux gets its release dates: the CZ.NIC auction list for .cz, Backorder.sk for .sk, Dynadot for .com, .net, .org, .io and .app, and RDAP for domain checks. What each source covers and its limits.'},
  about: {path: '/about', title: 'About ScopeFlux — find your next domain name', description: 'ScopeFlux brings upcoming domain releases into one place, so you can discover names, compare extensions and see when a domain may become available.'},
  privacy: {path: '/privacy', title: 'Privacy — ScopeFlux', description: 'What ScopeFlux stores and why: no analytics or tracking cookies, optional sign-in for the watchlist, and how to ask for your data to be deleted.'},
  contact: {path: '/contact', title: 'Contact — ScopeFlux', description: 'Questions, corrections to a listing or data requests: write to hello@scopeflux.io.'},
} satisfies Record<string, PageSeo>;

export function pageMetadata(page: keyof typeof PAGE_SEO): Metadata {
  const {path, title, description} = PAGE_SEO[page];
  return {
    title: {absolute: title},
    description,
    alternates: {canonical: path},
    // Next.js replaces (not merges) these objects per page, so each page carries them in full.
    openGraph: {title, description, url: path, type: 'website', siteName: SITE_NAME, locale: 'en_GB', images: [OG_IMAGE]},
    twitter: {card: 'summary_large_image', title, description, images: [OG_IMAGE.url]},
  };
}
