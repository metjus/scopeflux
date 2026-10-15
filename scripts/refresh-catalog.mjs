import {parseCountryDrops} from '../lib/catalog.ts';
import {parsePublicHistory, PUBLIC_HISTORY_TLDS, publicHistoryUrl} from '../lib/public-history.ts';

async function refresh({origin, token}) {
  if (!origin?.startsWith('https://') || !token) throw new Error('Origin and catalogue refresh token are required.');
  const endpoint = new URL(origin);
  if (endpoint.origin !== origin || endpoint.username || endpoint.password) throw new Error('Use a plain HTTPS origin without a path or credentials.');
  const feeds = [], historyFeeds = [];
  async function preview(tld, url, history = false) {
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(20000)});
      if (!response.ok || response.url.includes('/login')) throw new Error('Public preview unavailable (' + response.status + ').');
      const html = await response.text(), checkedAt = new Date().toISOString();
      const records = history ? parsePublicHistory(html, tld, response.headers.get('Date'), checkedAt) : parseCountryDrops(html, tld, checkedAt);
      if (!records.length) throw new Error('No readable public records with reliable source dates.');
      (history ? historyFeeds : feeds).push({tld, records, checkedAt});
      console.log(`${history ? 'History' : 'Upcoming'} .${tld}: ${records.length} public listings retrieved.`);
    } catch (error) {
      console.log(`${history ? 'History' : 'Upcoming'} .${tld}: ${error.message} Previous snapshot preserved.`);
    }
  }
  for (const tld of ['ai', 'eu']) await preview(tld, 'https://backorder.com/en/pending-delete/' + tld);
  // Public ten-row example tables only. Never follow member-list, registrar or /goto links.
  for (const tld of PUBLIC_HISTORY_TLDS) await preview(tld, publicHistoryUrl(tld), true);
  if (!feeds.length && !historyFeeds.length) throw new Error('No public source returned a usable preview. Previous snapshots were preserved.');
  const headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'};
  const clientId = process.env.CF_ACCESS_CLIENT_ID, clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (!!clientId !== !!clientSecret) throw new Error('Both Cloudflare Access service-token secrets are required.');
  if (clientId && clientSecret) {
    headers['CF-Access-Client-Id'] = clientId;
    headers['CF-Access-Client-Secret'] = clientSecret;
  }
  const response = await fetch(origin + '/api/catalog-cache', {method: 'POST', headers, body: JSON.stringify({feeds, historyFeeds}), signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error('Snapshot writer failed (' + response.status + ').');
  const read = await fetch(origin + '/api/catalog-cache', {headers, signal: AbortSignal.timeout(30000)});
  if (!read.ok) throw new Error('Snapshot readback failed.');
  const state = await read.json();
  for (const [submitted, saved] of [[feeds, state.feeds], [historyFeeds, state.historyFeeds]]) {
    for (const feed of submitted) {
      if (!saved?.some(row => row.tld === feed.tld && row.checkedAt === feed.checkedAt && row.count === feed.records.length)) throw new Error('Snapshot readback did not match .' + feed.tld);
    }
  }
  console.log(JSON.stringify({feeds: state.feeds, historyFeeds: state.historyFeeds}));
  for (const [submitted, query] of [[feeds, 'cached=1'], [historyFeeds, 'view=recent']]) {
    for (const feed of submitted) {
      const response = await fetch(origin + '/api/domains?' + query + '&tlds=' + feed.tld, {headers, signal: AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error('Catalogue API verification failed (' + response.status + ').');
      const data = await response.json();
      if (!data.feeds?.some(row => row.tld === feed.tld && row.checkedAt === feed.checkedAt)) throw new Error('Catalogue API source timestamp mismatch for .' + feed.tld);
      if (!data.records?.some(record => record.tld === feed.tld && record.checkedAt === feed.checkedAt)) throw new Error('Catalogue API did not return the imported observations for .' + feed.tld);
    }
  }
  console.log('Persisted public previews, history and catalogue APIs verified.');
}

if (process.env.DOMAINRADAR_URL || process.env.DOMAINRADAR_REFRESH_TOKEN) {
  try {await refresh({origin: process.env.DOMAINRADAR_URL?.replace(/\/$/, ''), token: process.env.DOMAINRADAR_REFRESH_TOKEN});}
  catch (error) {console.error('Refresh failed: ' + error.message); process.exitCode = 1;}
} else {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdout.write('Ready for catalogue refresh JSON on stdin (input is hidden).\n');
  let input = '', started = false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async chunk => {
    input += chunk;
    if (started || !input.includes('\n')) return;
    started = true;
    process.stdin.pause();
    try {await refresh(JSON.parse(input.trim())); process.exit(0);}
    catch (error) {console.log('Refresh failed: ' + error.message); process.exit(1);}
  });
}
