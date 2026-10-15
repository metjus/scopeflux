// Child-process fixture: every request is intercepted. No live network or ad requests.
import assert from 'node:assert/strict';
let saved = {feeds: [], historyFeeds: []};
const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (url.hostname === 'backorder.com') {
    assert.match(url.pathname, /^\/en\/pending-delete\/(ai|eu)$/);
    const tld = url.pathname.split('/').at(-1);
    if (process.env.UPDATER_FIXTURE_FAILURE === '1' && tld === 'ai') return new Response('Temporarily unavailable', {status: 503});
    return new Response(`<tbody><tr><td>upcoming.${tld}</td><td>public</td><td>${date}</td></tr></tbody>`);
  }
  if (url.hostname === 'www.expireddomains.net') {
    assert.match(url.pathname, /^\/tld\/(com|net|org|ai|eu|io|app)\/$/);
    const tld = url.pathname.split('/')[2];
    return new Response(`<table><tr><td class="field_domain"><a title="previous.${tld}">previous.${tld}</a></td><td class="field_changes">Yesterday 12:00</td></tr></table>All times are <strong>UTC</strong>.`, {headers: {Date: new Date().toUTCString()}});
  }
  assert.equal(url.origin, 'https://catalogue.test');
  assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer ' + process.env.DOMAINRADAR_REFRESH_TOKEN);
  if (url.pathname === '/api/catalog-cache' && init.method === 'POST') {
    saved = JSON.parse(init.body);
    for (const feed of [...saved.feeds, ...saved.historyFeeds]) assert.ok(feed.records.length > 0);
    if (process.env.UPDATER_FIXTURE_FAILURE === '1') assert.deepEqual(saved.feeds.map(row => row.tld), ['eu']);
    return Response.json({ok: true});
  }
  if (url.pathname === '/api/catalog-cache') {
    const summary = list => list.map(feed => ({tld: feed.tld, checkedAt: feed.checkedAt, count: feed.records.length}));
    return Response.json({feeds: summary(saved.feeds), historyFeeds: summary(saved.historyFeeds)});
  }
  assert.equal(url.pathname, '/api/domains');
  const feeds = (url.searchParams.has('view') ? saved.historyFeeds : saved.feeds).filter(feed => feed.tld === url.searchParams.get('tlds'));
  assert.equal(feeds.length, 1);
  return Response.json({records: feeds[0].records, feeds: [{tld: feeds[0].tld, checkedAt: feeds[0].checkedAt}]});
};
