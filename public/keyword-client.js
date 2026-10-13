const providers={google:'dataforseo-google-trends',bing:'dataforseo-bing-search-volume'};
export function validateApiSeries(value,selection){
 const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!value || value.kind!=='history' || value.provider!==providers[selection.source] || value.source!==selection.source || value.country!==selection.country || value.period!==selection.period || value.query!==selection.query || typeof value.id!=='string' || !Number.isFinite(Date.parse(value.fetchedAt)) || typeof value.unit!=='string' || !Array.isArray(value.records) || value.records.length<6 || value.records.length>10000 || value.records.some((r,i)=>!r||!validDate(r.date)||typeof r.value!=='number'||!Number.isFinite(r.value)||r.value<0||selection.source==='google'&&r.value>100||i>0&&r.date<=value.records[i-1].date))throw new Error('The API returned invalid data or a different selection. No result was saved.');
 return value;
}
export function historyDescription(d){return 'Previously retrieved series · Original stored values and units. External trend connections have been removed. Retrieved '+new Date(d.fetchedAt).toLocaleString('en')+'.';}
