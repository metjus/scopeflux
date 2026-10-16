import Radar from './radar';
import { headers } from 'next/headers';
import { pageMetadata } from '../lib/seo';
export const dynamic = 'force-dynamic';
export const metadata = pageMetadata('discover');
export default async function Page() { const h = await headers(); return <Radar signedIn={!!h.get('x-domainradar-user')} />; }
