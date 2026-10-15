// Cloudflare Worker: the JSON API under /api/*, everything else is a static
// file from public/. The scheduled() handler builds Discover snapshots (cron).
import { trendingResponse } from './lib/sources/trends-rss.mjs';
import { historyResponse } from './lib/sources/wikipedia.mjs';
import { discoverResponse, topicResponse, configResponse } from './lib/api.mjs';
import { runPipelineStep } from './lib/pipeline.mjs';

const ROUTES = {
  '/api/trending': (request, env) => trendingResponse(request),
  '/api/history': (request, env) => historyResponse(request),
  '/api/discover': discoverResponse,
  '/api/topic': (request, env) => topicResponse(request, env),
  '/api/config': () => configResponse(),
};

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (Object.hasOwn(ROUTES, path)) {
      if (request.method !== 'GET')
        return Response.json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
      return ROUTES[path](request, env);
    }
    if (path === '/api/keyword')
      return Response.json(
        {
          error: 'Replaced by the free /api/history endpoint (Wikipedia pageviews).',
          code: 'SOURCE_REPLACED',
        },
        { status: 410 },
      );
    // Runs one pipeline step on demand. Only for local testing: enable it with
    // ALLOW_MANUAL_PIPELINE=true in .dev.vars. Never set it in production.
    if (path === '/api/dev/pipeline-step') {
      if (env?.ALLOW_MANUAL_PIPELINE !== 'true' || !env.DB)
        return Response.json({ error: 'API route not found.', code: 'NOT_FOUND' }, { status: 404 });
      return Response.json(await runPipelineStep(env));
    }
    if (path === '/api' || path.startsWith('/api/'))
      return Response.json({ error: 'API route not found.', code: 'NOT_FOUND' }, { status: 404 });
    return env.ASSETS.fetch(request);
  },

  // Cron Trigger (see wrangler.json). One small step per run.
  async scheduled(controller, env, ctx) {
    if (!env.DB) return console.error('Pipeline skipped: no D1 database bound as DB.');
    const result = await runPipelineStep(env);
    console.log('pipeline step', result);
  },
};
