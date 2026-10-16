import Radar from '../radar';
import { headers } from 'next/headers';
import { pageMetadata } from '../../lib/seo';

// Own address for search engines; the page itself is the same app.
export const dynamic = 'force-dynamic';
export const metadata = pageMetadata('sources');

export default async function Page() {
  const h = await headers();
  return <Radar signedIn={!!h.get('x-domainradar-user')} initialPage="sources" />;
}
