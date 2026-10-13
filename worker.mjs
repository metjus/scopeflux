import { trendingResponse } from './lib/trending.mjs';
import { createKeywordApi } from './lib/keyword-api.mjs';
const keywordApi = createKeywordApi();
const json = (body,status=404,headers={}) => Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
export default {
 async fetch(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/api/trending') {
   if (request.method !== 'GET') return json({error:'Use GET.',code:'METHOD_NOT_ALLOWED'},405,{Allow:'GET'});
   return trendingResponse(request);
  }
  if (path === '/api/keyword') return keywordApi.handle(request, env);
  if (path === '/api' || path.startsWith('/api/')) return json({error:'API route not found.',code:'NOT_FOUND'});
  return env.ASSETS.fetch(request);
 }
};
