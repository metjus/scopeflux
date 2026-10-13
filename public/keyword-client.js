const providers={google:'dataforseo-google-trends',bing:'dataforseo-bing-search-volume'};
export function validateApiSeries(value,selection){
 const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!value || value.kind!=='history' || value.provider!==providers[selection.source] || value.source!==selection.source || value.country!==selection.country || value.period!==selection.period || value.query!==selection.query || typeof value.id!=='string' || !Number.isFinite(Date.parse(value.fetchedAt)) || typeof value.unit!=='string' || !Array.isArray(value.records) || value.records.length<6 || value.records.length>10000 || value.records.some((r,i)=>!r||!validDate(r.date)||typeof r.value!=='number'||!Number.isFinite(r.value)||r.value<0||selection.source==='google'&&r.value>100||i>0&&r.date<=value.records[i-1].date))throw new Error('The API returned invalid data or a different selection. No result was saved.');
 return value;
}
export function historyDescription(d){
 const retrieved=' Retrieved '+new Date(d.fetchedAt).toLocaleString('en')+'.';
 if(d.provider==='dataforseo-bing-search-volume')return 'Bing search data via DataForSEO · Monthly search counts summed across desktop, mobile, tablet and non-smartphone groups. Keyword language: '+d.language+'. These are counts, not a 0–100 index.'+retrieved+(d.omittedMissing?' Omitted '+d.omittedMissing+' months without complete device coverage.':'');
 if(d.provider==='bing-webmaster-keyword-stats')return 'Bing Webmaster keyword data · '+d.unit+' for this country and keyword language ('+d.language+'). These are provider impressions, not a 0–100 index.'+retrieved;
 const omitted=(d.omittedCensored||0)+(d.omittedPartial||0)+(d.omittedMissing||0);
 return 'Google Trends via '+(d.provider==='dataforseo-google-trends'?'DataForSEO':'SerpApi')+' · Relative interest from 0 to 100 within this topic, market and date range; not search counts.'+retrieved+(omitted?' Omitted '+(d.omittedCensored||0)+' below-1, '+(d.omittedPartial||0)+' incomplete and '+(d.omittedMissing||0)+' missing observations. Gaps are not filled.':'');
}
