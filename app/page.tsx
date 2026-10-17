import Radar from './radar';
import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { pageMetadata } from '../lib/seo';
import { initialCatalogue } from '../lib/initial-catalog';
export const dynamic = 'force-dynamic';
export const metadata = pageMetadata('discover');
export default async function Page() {
  const h = await headers();
  return <Radar signedIn={!!h.get('x-domainradar-user')} initialCatalogue={await initialCatalogue(env.DB)} />;
}
