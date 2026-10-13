import { trendingResponse } from './lib/trending.mjs';
export default { async fetch(request,env) {
 const path=new URL(request.url).pathname;
 if(path==='/api/keyword'&&request.method==='GET')return Response.json({ready:false,enabled:false,message:'External trend integrations have been removed.'},{headers:{'Cache-Control':'no-store'}});
 if(path==='/api/trending'&&request.method==='GET')return trendingResponse(request);
 if(path==='/api/keyword'||path==='/api/trending')return Response.json({error:'External trend integrations have been removed.',code:'SOURCE_REMOVED'},{status:410});
 if(path==='/api'||path.startsWith('/api/'))return Response.json({error:'API route not found.',code:'NOT_FOUND'},{status:404});
 return env.ASSETS.fetch(request);
}};
