import handler from 'vinext/server/fetch-handler';
import {identityRequest} from './lib/access';
import {authConfigured, currentAccount, deleteAccount, finishLogin, logout, startLogin} from './lib/auth';
import {upcomingCatalog, CATALOG_TLDS} from './lib/catalog';
import {recentCatalog} from './lib/catalog-history';
import {ensureSchema} from './lib/schema';
import {recordOk, recordError} from './lib/status-log';
import {isStatusRequest, statusResponse} from './lib/status-page';

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return Response.json({error: 'Cross-origin changes are not allowed.'}, {status: 403});
    }
    await ensureSchema(env.DB);
    // Owner-only health page, reachable only on the *.workers.dev address.
    if (isStatusRequest(url)) return statusResponse(request, env);
    const account = await currentAccount(request, env);
    if (url.pathname === '/account/login') {
      if (!authConfigured(env)) return new Response('Sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README.md).', {status: 503});
      return startLogin(request, env);
    }
    if (url.pathname === '/account/callback' && authConfigured(env)) return finishLogin(request, env, env.DB);
    if (url.pathname === '/account/logout') return logout();
    if (url.pathname === '/api/account' && request.method === 'DELETE') {
      if (!account) return Response.json({error: 'Sign in first.'}, {status: 401});
      await deleteAccount(env.DB, account.id);
      const done = logout();
      return new Response(JSON.stringify({ok: true}), {headers: {'Content-Type': 'application/json', 'Set-Cookie': done.headers.get('Set-Cookie')!}});
    }
    const response = await handler.fetch(identityRequest(request, account), env, ctx);
    // Account cookies must never cause a private watchlist to enter a shared cache.
    if (request.method === 'GET' && !url.pathname.startsWith('/assets/')) {
      const secured = new Response(response.body, response);
      secured.headers.set('Cache-Control', 'private, no-store');
      return secured;
    }
    return response;
  },
  async scheduled(_event: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      try {
        await ensureSchema(env.DB);
        await upcomingCatalog(CATALOG_TLDS, 1, env.DB, env.UNSTOPPABLE_API_KEY);
        await recentCatalog(env.DB, CATALOG_TLDS);
        await recordOk(env.DB, 'cron');
      } catch (error) {
        console.error('cron failed', {message: (error as Error)?.message});
        await recordError(env.DB, 'cron', error);
      }
    })());
  }
};
