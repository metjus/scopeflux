import Radar from './radar';
import { headers } from 'next/headers';
export const dynamic='force-dynamic';
export default async function Page(){const h=await headers();return <Radar signedIn={!!h.get('x-domainradar-user')}/>;}
