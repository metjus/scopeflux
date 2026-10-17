require('./helpers/runtime.cjs');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const Pagination = require('../app/result-pagination.tsx').default;
const Coverage = require('../app/catalogue-coverage.tsx').default;
const Navigation = require('../app/site-navigation.tsx').default;
const DomainLookup = require('../app/domain-lookup.tsx').default;
const {PAGES, pagePath} = require('../lib/navigation.ts');

test('pagination renders all pages, correct range and available next/previous actions', () => {
  const props = {page: 2, totalPages: 3, start: 101, end: 200, total: 219, onPage() {}};
  const html = renderToStaticMarkup(React.createElement(Pagination, props));
  assert.match(html, /Showing 101–200 of 219/);
  assert.match(html, /value="3"/);
  assert.match(html, /aria-label="Result page"/);
  assert.ok(!html.includes('disabled'));
  const last = renderToStaticMarkup(React.createElement(Pagination, {...props, page: 3, start: 201, end: 219}));
  assert.match(last, /disabled=""[^>]*>Next/);
});

test('history coverage explains missing TLD observations rather than implying availability', () => {
  const html = renderToStaticMarkup(React.createElement(Coverage, {records: [], feeds: [], tlds: ['ai', 'eu'], recent: true, period: '30'}));
  assert.match(html, /No saved past release observations/);
  assert.match(html, /\.ai, .eu/);
  assert.match(html, /does not mean those domains are available/);
});

test('saved preview source failures and the 30-day filter coverage are visible', () => {
  const row = {domain: 'cloud.ai', tld: 'ai', drop: '2026-10-15'};
  const feed = {tld: 'ai', refreshError: 'Source unavailable (403).', checkedAt: '2026-10-15T10:00:00Z'};
  const html = renderToStaticMarkup(React.createElement(Coverage, {records: [row], feeds: [feed], tlds: ['ai'], recent: false, period: '30'}));
  assert.match(html, /following 30 calendar days/);
  assert.match(html, /last successful snapshot/);
  assert.match(html, /403/);
});

test('timestamp coverage dates follow local time, including releases after midnight', () => {
  const value = '2026-10-15T23:45:00Z';
  const date = new Date(value).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
  const html = renderToStaticMarkup(React.createElement(Coverage, {records: [{domain: 'cloud.app', tld: 'app', drop: value}], feeds: [], tlds: ['app'], recent: false, period: '30'}));
  assert.ok(html.includes(date));
});

test('every menu destination has an accessible active link and the mobile disclosure has controls', () => {
  for (const page of PAGES) {
    const html = renderToStaticMarkup(React.createElement(Navigation, {currentPage: page.id, watchCount: 2, onNavigate() {}}));
    for (const destination of PAGES) assert.ok(html.includes('href="' + pagePath(destination.id) + '"'));
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
    assert.match(html, /aria-controls="site-navigation-panel"/);
    assert.match(html, /aria-expanded="false"/);
  }
  const lookup = renderToStaticMarkup(React.createElement(DomainLookup, {onCheck: async () => {}}));
  assert.match(lookup, /no expiration-date limit/);
  assert.match(lookup, /for="any-domain"/);
  assert.match(lookup, /type="submit"/);
});

test('historical deletion detail is separate from a future release estimate and preserves the public source link', () => {
  const Details = require('../app/domain-details.tsx').default;
  const record = {domain: 'sample.com', tld: 'com', status: 'Source-reported deletion', expiration: null, drop: null, source: 'ExpiredDomains.net', sourceUrl: 'https://www.expireddomains.net/tld/com/', checkedAt: '2026-10-15T12:00:05.000Z', reportedDrop: {at: '2026-10-14T17:24:00.000Z', label: 'Yesterday 17:24', sourceDate: 'Thu, 15 Oct 2026 12:00:00 GMT', source: 'ExpiredDomains.net', url: 'https://www.expireddomains.net/tld/com/', checkedAt: '2026-10-15T12:00:05.000Z'}};
  const html = renderToStaticMarkup(React.createElement(Details, {record, premium: {candidate: false, reason: 'Fixture'}, saved: false, busy: false, checking: false, archived: true, releaseCountdown: '', onClose() {}, onSave() {}}));
  assert.match(html, /Historical deletion report/);
  assert.match(html, /Source-reported deletion:/);
  assert.match(html, /Yesterday 17:24 \(UTC\)/);
  assert.match(html, /Expected availability<\/span><strong>Not confirmed/);
  assert.ok(!html.includes('Release estimate:'));
  assert.ok(html.includes('https://www.expireddomains.net/tld/com/'));
});

test('failed registration details show a known release with original retrieval and a separate failed attempt', () => {
  const Details = require('../app/domain-details.tsx').default;
  const record = {domain:'sample.ai',tld:'ai',status:'Unverified',expiration:null,drop:'2026-11-15',source:'Backorder.com',sourceUrl:'https://backorder.com/en/pending-delete/ai',checkedAt:'2026-10-15T12:00:00Z',availabilityCheckedAt:'2026-10-15T12:00:00Z',checkError:'Registry unavailable (503).',checkAttemptedAt:'2026-10-15T15:00:00Z'};
  const html = renderToStaticMarkup(React.createElement(Details, {record,premium:{candidate:false,reason:'Fixture'},saved:false,busy:false,checking:false,archived:false,releaseCountdown:'~31 days',onClose(){},onSave(){}}));
  assert.match(html,/Current registration check unavailable/);
  assert.match(html,/Registry unavailable \(503\)/);
  assert.match(html,/Last registration attempt/);
  assert.match(html,/Release estimate retrieved/);
  assert.match(html,/15 Nov 2026/);
});

test('privacy and contact pages name the contact address and are linked from the navigation', () => {
  const {PrivacyPage, ContactPage, CONTACT_EMAIL} = require('../app/info-pages.tsx');
  const {LEGAL_PAGES, pageFromHash} = require('../lib/navigation.ts');
  assert.equal(CONTACT_EMAIL, 'hello@scopeflux.io');
  const privacy = renderToStaticMarkup(React.createElement(PrivacyPage));
  assert.match(privacy, /mailto:hello@scopeflux\.io/);
  assert.match(privacy, /no analytics, advertising or tracking cookies/);
  assert.match(privacy, /Cloudflare Web Analytics/);
  assert.match(renderToStaticMarkup(React.createElement(ContactPage)), /mailto:hello@scopeflux\.io/);
  const nav = renderToStaticMarkup(React.createElement(Navigation, {currentPage: 'privacy', watchCount: 0, onNavigate() {}}));
  for (const page of LEGAL_PAGES) assert.ok(nav.includes('href="/' + page.id + '"'));
  assert.equal((nav.match(/aria-current="page"/g) || []).length, 1);
  assert.equal(pageFromHash('#contact'), 'contact');
});

test('every page has its own address, and old #links still open the right page', () => {
  const {pageFromLocation} = require('../lib/navigation.ts');
  assert.equal(pageFromLocation('/privacy', ''), 'privacy');
  assert.equal(pageFromLocation('/check-domain/', ''), 'lookup');
  assert.equal(pageFromLocation('/', '#about'), 'about');
  assert.equal(pageFromLocation('/', '#recent'), 'recent');
  assert.equal(pageFromLocation('/nonsense', ''), 'discover');
  const {PAGE_SEO, SITE_DESCRIPTION} = require('../lib/seo.ts');
  for (const [id, seo] of Object.entries(PAGE_SEO)) {
    assert.equal(seo.path, pagePath(id));
    assert.ok(seo.description.length >= 70 && seo.description.length <= 155, id + ' description length ' + seo.description.length);
    assert.ok(seo.social.length >= 40 && seo.social.length <= 125, id + ' social length ' + seo.social.length);
    assert.ok(seo.title.length <= 60, id + ' title length');
  }
  assert.ok(SITE_DESCRIPTION.length <= 155);
});

test('every share image has alt text', () => {
  const {pageMetadata, PAGE_SEO} = require('../lib/seo.ts');
  for (const id of Object.keys(PAGE_SEO)) {
    const meta = pageMetadata(id);
    for (const image of [...meta.openGraph.images, ...meta.twitter.images]) assert.ok(image.alt && image.alt.length > 10, id);
  }
});

test('how it works explains every stage per extension with its cost, without emoji', () => {
  const {HowItWorksPage, TRACKS} = require('../app/how-it-works.tsx');
  const {pageFromLocation} = require('../lib/navigation.ts');
  assert.equal(pageFromLocation('/how-it-works', ''), 'how');
  assert.deepEqual(TRACKS.map(t => t.id), ['global', 'sk', 'cz']);
  for (const track of TRACKS) for (const stage of track.stages) assert.ok(stage.caption && stage.when && stage.owner && stage.cost, track.id + ' ' + stage.name);
  const html = renderToStaticMarkup(React.createElement(HowItWorksPage, {navigate() {}}));
  assert.match(html, /role="tablist"/);
  assert.match(html, /Redemption/);
  assert.match(html, /Restore fee/);
  assert.doesNotMatch(html, /\p{Extended_Pictographic}/u);
});
