import { viewer } from '../../lib/viewer';
import Radar from '../radar';
import { pageMetadata } from '../../lib/seo';

// Own address for search engines; the page itself is the same app.
export const dynamic = 'force-dynamic';
export const metadata = pageMetadata('privacy');

export default async function Page() {
  return <Radar {...await viewer()} initialPage="privacy" />;
}
