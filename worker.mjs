import { trendingResponse } from './lib/trending.mjs';
import { historyResponse } from './lib/wikipedia.mjs';
export default { async fetch(request,env) {
 const path=new URL(request.url).pathname;
 if(path==='/api/trending'&&request.method==='GET')return trendingResponse(request);
 if(path==='/api/history'&&request.method==='GET')return historyResponse(request);
 if(path==='/api/keyword')return Response.json({error:'Replaced by the free /api/history endpoint (Wikipedia pageviews).',code:'SOURCE_REPLACED'},{status:410});
 if(path==='/api/trending'||path==='/api/history')return Response.json({error:'Method not allowed.',code:'METHOD_NOT_ALLOWED'},{status:405});
 if(path==='/api'||path.startsWith('/api/'))return Response.json({error:'API route not found.',code:'NOT_FOUND'},{status:404});
 return env.ASSETS.fetch(request);
}};
