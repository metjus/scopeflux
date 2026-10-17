import { viewer } from '../lib/viewer';
import Radar from './radar';
import { env } from 'cloudflare:workers';
import { pageMetadata } from '../lib/seo';
import { initialCatalogue } from '../lib/initial-catalog';
export const dynamic = 'force-dynamic';
export const metadata = pageMetadata('discover');
export default async function Page() {
  return <Radar {...await viewer()} initialCatalogue={await initialCatalogue(env.DB)} />;
}
