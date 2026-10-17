import assert from 'node:assert/strict';
import test from 'node:test';
import {filterListings, paginateListings, defaultPeriod, nextSourcePage} from '../lib/catalog-view.ts';
import {isUpcomingDate, isRecentDate, calendarDaysFromToday} from '../lib/release-time.ts';
import {orderListings} from '../lib/list-order.ts';
import {catalogueCsv} from '../lib/catalog-export.ts';

const now = Date.parse('2026-10-15T10:00:00Z');
const base = {expiration: null, status: 'Expected release', source: 'Fixture', sourceUrl: 'https://example.test', checkedAt: '2026-10-15T09:00:00Z'};
const record = (domain, drop) => ({...base, domain, tld: domain.split('.').at(-1), drop});
const filters = {tlds: [], query: '', period: 'all', status: 'all', premium: 'all', maxLength: 63, noHyphen: false, noNumber: false};
const extensions = ['sk', 'ai', 'eu', 'com', 'net', 'org', 'io', 'app'];

test('every TLD can be selected alone and in combinations', () => {
  const rows = extensions.map(tld => record('cloud.' + tld, '2026-10-20'));
  for (const tld of extensions) assert.deepEqual(filterListings(rows, {...filters, tlds: [tld]}, 'discover', now).map(r => r.tld), [tld]);
  assert.equal(filterListings(rows, {...filters, tlds: ['ai', 'eu']}, 'discover', now).length, 2);
  assert.equal(filterListings(rows, filters, 'discover', now).length, 8);
});

test('30 days adds days 8–30, includes its boundary, excludes 31 and works across DST', () => {
  const rows = ['2026-10-15', '2026-10-22', '2026-10-23', '2026-11-14', '2026-11-15'].map((date, i) => record('name' + i + '.sk', date));
  assert.equal(filterListings(rows, {...filters, period: '0'}, 'discover', now).length, 1);
  assert.equal(filterListings(rows, {...filters, period: '7'}, 'discover', now).length, 2);
  assert.equal(filterListings(rows, {...filters, period: '30'}, 'discover', now).length, 4);
  assert.equal(filterListings(rows, filters, 'discover', now).length, 5);
  assert.equal(calendarDaysFromToday('2026-11-14', now), 30);
});

test('past timestamp releases move out of upcoming, but date-only estimates stay for the full day', () => {
  const past = record('past.com', '2026-10-15T09:59:59Z');
  const future = record('future.com', '2026-10-15T10:00:01Z');
  const day = record('day.ai', '2026-10-15');
  assert.deepEqual(filterListings([past, future, day], filters, 'discover', now).map(r => r.domain), ['future.com', 'day.ai']);
  assert.deepEqual(filterListings([past, future, day], filters, 'recent', now).map(r => r.domain), ['past.com']);
  assert.equal(isUpcomingDate(day.drop, Date.parse('2026-10-15T23:59:59Z')), true);
  assert.equal(isRecentDate(day.drop, Date.parse('2026-10-16T00:00:00Z')), true);
  assert.equal(isUpcomingDate('2026-02-30', now), false);
});

test('past 7/30 days use historical dates and retain only actual past observations', () => {
  const rows = ['2026-10-14', '2026-10-08', '2026-10-07', '2026-09-16', '2026-09-14', '2026-10-16'].map((date, i) => record('old' + i + '.sk', date));
  assert.equal(filterListings(rows, {...filters, period: '7'}, 'recent', now).length, 2);
  assert.equal(filterListings(rows, {...filters, period: '30'}, 'recent', now).length, 4);
  assert.equal(defaultPeriod('recent'), '30');
  assert.equal(defaultPeriod('watch'), 'all');
});

test('search, name quality, length, digits, hyphens and statuses combine without hiding other extensions', () => {
  const rows = [record('cloud.ai', '2026-10-20'), record('cloud-shop.com', '2026-10-20'), record('cloud123.sk', '2026-10-20'), record('unlistedword.eu', '2026-10-20')];
  assert.equal(filterListings(rows, {...filters, query: ' CLOUD '}, 'discover', now).length, 3);
  assert.deepEqual(filterListings(rows, {...filters, query: 'cloud', noHyphen: true, noNumber: true, premium: 'premium', maxLength: 5}, 'discover', now).map(r => r.domain), ['cloud.ai']);
  assert.equal(filterListings(rows, {...filters, premium: 'other'}, 'discover', now).length, 3);
  const saved = {...rows[0], drop: null, expiration: '2034-10-20', status: 'Registered'};
  assert.equal(filterListings([saved], filters, 'watch', now).length, 1);
  assert.equal(filterListings([saved], {...filters, status: 'Expired'}, 'watch', now).length, 0);
});

test('every result beyond 150 is reachable; filtered page boundaries clamp safely', () => {
  const rows = Array.from({length: 267}, (_, i) => record('name' + i + '.sk', '2026-10-20'));
  const pages = [1, 2, 3].flatMap(page => paginateListings(rows, page).records);
  assert.deepEqual(pages, rows);
  assert.equal(new Set(pages.map(r => r.domain)).size, 267);
  assert.equal(paginateListings(rows, 99).page, 3);
  assert.equal(paginateListings([], 3).start, 0);
  assert.equal(paginateListings(rows.slice(0, 5), 3).page, 1);
  assert.equal(catalogueCsv(rows).split('\r\n').length, 268);
});

test('sort modes order all rows and mixed mode retains every extension', () => {
  const rows = [record('beta.sk', '2026-10-21'), record('alpha.ai', '2026-10-20'), record('early.sk', '2026-10-19')];
  assert.equal(orderListings(rows, 'date')[0].domain, 'early.sk');
  assert.equal(orderListings(rows, 'recent')[0].domain, 'beta.sk');
  assert.equal(orderListings(rows, 'name')[0].domain, 'alpha.ai');
  assert.equal(orderListings(rows, 'mixed').length, 3);
  assert.equal(rows[0].domain, 'beta.sk');
});

test('source pagination chooses one fair next page and respects TLD selection and backoff', () => {
  const feeds = ['com', 'net', 'org'].map(tld => ({tld, more: true}));
  assert.equal(nextSourcePage(feeds, [], {com: 2, net: 1, org: 1}, {}, now).tld, 'net');
  assert.equal(nextSourcePage(feeds, ['org'], {}, {}, now).tld, 'org');
  assert.equal(nextSourcePage(feeds, ['org'], {}, {org: now + 60000}, now), undefined);
  assert.equal(nextSourcePage(feeds, ['org'], {}, {org: now - 1}, now).tld, 'org');
});

test('.sk deletion days become an estimated release time: 02:00 Slovak time the next day', async () => {
  const {skReleaseTime} = await import('../lib/release-time.ts');
  assert.equal(skReleaseTime('2026-10-20'), '2026-10-21T00:00:00.000Z'); // summer time (UTC+2)
  assert.equal(skReleaseTime('2026-12-20'), '2026-12-21T01:00:00.000Z'); // winter time (UTC+1)
  const local = new Date(skReleaseTime('2026-10-24')).toLocaleTimeString('en-GB', {timeZone: 'Europe/Bratislava', hour: '2-digit', minute: '2-digit'});
  assert.equal(local, '02:00'); // night of the clock change
});
