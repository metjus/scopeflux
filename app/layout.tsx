import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, pageMetadata } from '../lib/seo';

const home = pageMetadata('discover');

// Shared tags for every page; each page adds its own title, description and canonical URL.
export const metadata: Metadata = {
  ...home,
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  category: 'technology',
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/site.webmanifest',
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0d1019',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

// Structured data so search engines know the site's name, purpose and contact.
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': SITE_URL + '/#website', url: SITE_URL + '/', name: SITE_NAME, description: SITE_DESCRIPTION, inLanguage: 'en', publisher: { '@id': SITE_URL + '/#organization' } },
    { '@type': 'Organization', '@id': SITE_URL + '/#organization', name: SITE_NAME, url: SITE_URL + '/', logo: SITE_URL + '/icon-512.png', email: 'hello@scopeflux.io' },
    { '@type': 'WebApplication', name: SITE_NAME, url: SITE_URL + '/', applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, description: SITE_DESCRIPTION },
  ],
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
        {children}
      </body>
    </html>
  );
}
