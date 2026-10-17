import { env } from 'cloudflare:workers';
import { normalizeDomain } from '../../../lib/domains';
import {checkDomain} from '../../../lib/domain-check';
import { savedCatalog, upcomingCatalog, recentReleaseCatalog, previewCatalog, CATALOG_TLDS, MAX_EXTENSIONS, RECENT_PREVIEW_LIMIT } from '../../../lib/catalog';
import { recordError } from '../../../lib/status-log';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;

    if (params.has('domain')) {
      let domain: string;
      try {
        domain = normalizeDomain(params.get('domain') ?? '');
      } catch (error) {
        return Response.json({ error: (error as Error).message }, { status: 400 });
      }
      return Response.json({ record: await checkDomain(domain, env.DB) });
    }

    const requested = params.get('tlds');
    const tlds = requested
      ? [...new Set(requested.split(',').map(tld => tld.trim().toLowerCase().replace(/^\./, '')))]
      : CATALOG_TLDS;
    if (tlds.some(tld => !CATALOG_TLDS.includes(tld))) {
      return Response.json({error: 'Unsupported catalogue extension. Use the individual domain checker for other endings.'}, {status: 400});
    }
    // Whole lists are read for a few extensions at a time (Workers free plan CPU limit).
    if (requested && tlds.length > MAX_EXTENSIONS) {
      return Response.json({error: `Choose up to ${MAX_EXTENSIONS} extensions at a time.`}, {status: 400});
    }

    if (params.get('view') === 'recent') {
      if (!env.DB) return Response.json({ error: 'History is unavailable.' }, { status: 503 });
      return Response.json(await recentReleaseCatalog(env.DB, tlds, requested ? undefined : RECENT_PREVIEW_LIMIT));
    }

    // No extension chosen: the soonest releases of every extension, from small preview rows.
    if (!requested) {
      if (!env.DB) return Response.json({error: 'Saved catalogue unavailable.'}, {status: 503});
      return Response.json(await previewCatalog(env.DB));
    }

    if (params.get('cached') === '1') {
      if (!env.DB) return Response.json({error: 'Saved catalogue unavailable.'}, {status: 503});
      return Response.json(await savedCatalog(env.DB, tlds));
    }

    const page = Math.max(1, Math.min(20, Math.floor(Number(params.get('page'))) || 1));
    return Response.json(await upcomingCatalog(tlds, page, env.DB));
  } catch (error) {
    // Details go to the Worker log; visitors get a plain sentence.
    console.error('domains API failed', { message: (error as Error)?.message });
    await recordError(env.DB, 'api', error);
    return Response.json({ error: 'The domain list is temporarily unavailable. Please try again in a few minutes.' }, { status: 502 });
  }
}
