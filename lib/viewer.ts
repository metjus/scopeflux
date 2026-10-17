// Who is looking at the page, from the headers set by worker.ts after the
// session cookie was verified. Used by every page to render the account menu.
import {headers} from 'next/headers';

export type Viewer = {signedIn: boolean; account?: {email: string; name: string}};

export async function viewer(): Promise<Viewer> {
  const h = await headers();
  if (!h.get('x-domainradar-user')) return {signedIn: false};
  const read = (name: string) => {try {return decodeURIComponent(h.get(name) || '');} catch {return '';}};
  return {signedIn: true, account: {email: read('x-domainradar-email'), name: read('x-domainradar-name')}};
}
