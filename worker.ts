import handler from 'vinext/server/fetch-handler';
import {identify, identityRequest, isRefreshAuthorized, teamOrigin} from './lib/access';
import {upcomingCatalog, CATALOG_TLDS} from './lib/catalog';
import {recentCatalog} from './lib/catalog-history';
import {ensureSchema} from './lib/schema';

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === '/api/catalog-cache' && !await isRefreshAuthorized(request, env.CATALOG_REFRESH_TOKEN)) {
      return Response.json({error: 'A valid catalogue refresh token is required.'}, {status: 401, headers: {'Cache-Control': 'no-store'}});
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return Response.json({error: 'Cross-origin changes are not allowed.'}, {status: 403});
    }
    await ensureSchema(env.DB);
    const user = await identify(request, env);
    if (url.pathname === '/account/login') {
      if (!teamOrigin(env) || !env.ACCESS_AUD) return new Response('Account sign-in is not configured. Follow the Cloudflare Access section in README.md.', {status: 503});
      if (!user) return new Response('Protect /account/* with Cloudflare Access before signing in.', {status: 401});
      return Response.redirect(url.origin + '/', 303);
    }
    if (url.pathname === '/account/logout') return Response.redirect(url.origin + '/cdn-cgi/access/logout', 303);
    const response = await handler.fetch(identityRequest(request, user), env, ctx);
    // Account cookies must never cause a private watchlist to enter a shared cache.
    if (url.pathname === '/' || url.pathname.startsWith('/api/')) {
      const secured = new Response(response.body, response);
      secured.headers.set('Cache-Control', 'private, no-store');
      return secured;
    }
    return response;
  },
  async scheduled(_event: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      await ensureSchema(env.DB);
      await upcomingCatalog(CATALOG_TLDS, 1, env.DB);
      await recentCatalog(env.DB, CATALOG_TLDS);
    })());
  }
};
