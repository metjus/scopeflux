import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePublicHistory, sourceDropTime} from '../lib/public-history.ts';
import {filterListings} from '../lib/catalog-view.ts';
import {orderListings} from '../lib/list-order.ts';
import {catalogueCsv} from '../lib/catalog-export.ts';

const checkedAt = '2026-10-15T12:00:05.000Z', sourceDate = 'Thu, 15 Oct 2026 12:00:00 GMT';
const row = (domain, label) => `<tr><td class="field_domain"><a href="/goto/ignored" title="${domain}">${domain}</a></td><td class="field_changes">${label}</td></tr>`;
const page = rows => `<table>${rows.join('')}</table>All times are <strong>UTC</strong>.`;

test('public deletion parser preserves the source minute, original label, HTTP date and retrieval provenance', () => {
  const records = parsePublicHistory(page([row('Sample.COM', 'Yesterday 17:24')]), 'com', sourceDate, checkedAt);
  assert.equal(records.length, 1);
  const report = records[0];
  assert.equal(report.domain, 'sample.com');
  assert.equal(report.drop, null);
  assert.equal(report.expiration, null);
  assert.equal(report.reportedDrop.at, '2026-10-14T17:24:00.000Z');
  assert.equal(report.reportedDrop.label, 'Yesterday 17:24');
  assert.equal(report.reportedDrop.sourceDate, sourceDate);
  assert.equal(report.reportedDrop.checkedAt, checkedAt);
  assert.equal(report.sourceUrl, 'https://www.expireddomains.net/tld/com/');
});

test('relative dates cross UTC month and year boundaries, without using the local timezone', () => {
  assert.equal(sourceDropTime('Yesterday 23:59', 'Fri, 01 Jan 2027 00:05:00 GMT'), '2026-12-31T23:59:00.000Z');
  assert.equal(sourceDropTime('Today 00:01', 'Fri, 01 Jan 2027 00:05:00 GMT'), '2027-01-01T00:01:00.000Z');
  assert.equal(sourceDropTime('Yesterday 24:01', sourceDate), null);
  assert.equal(sourceDropTime('Just dropped', sourceDate), null);
});

test('parser refuses undated, stale, ambiguous and future reports, wrong suffixes and invalid domains', () => {
  const html = page([row('valid.org', 'Today 11:00')]);
  assert.equal(parsePublicHistory(html, 'org', null, checkedAt).length, 0);
  assert.equal(parsePublicHistory(html, 'org', 'Wed, 14 Oct 2026 12:00:00 GMT', checkedAt).length, 0);
  assert.equal(parsePublicHistory(html.replace('<strong>UTC</strong>', 'local'), 'org', sourceDate, checkedAt).length, 0);
  for (const [domain, label] of [['wrong.com', 'Today 11:00'], ['invalid-.org', 'Today 11:00'], ['future.org', 'Today 23:59'], ['unknown.org', 'Recently']]) {
    assert.equal(parsePublicHistory(page([row(domain, label)]), 'org', sourceDate, checkedAt).length, 0);
  }
});

test('only ten unique public examples are imported, and all seven supported historical TLDs survive filters and export', () => {
  const filters = {tlds: [], query: '', period: '30', status: 'all', premium: 'all', maxLength: 63, noHyphen: false, noNumber: false};
  const records = ['com', 'net', 'org', 'ai', 'eu', 'io', 'app'].flatMap(tld => parsePublicHistory(page(Array.from({length: 12}, (_, i) => row('sample' + i + '.' + tld, 'Yesterday 17:24'))), tld, sourceDate, checkedAt));
  assert.equal(records.length, 70);
  const now = Date.parse(checkedAt);
  for (const tld of ['com', 'net', 'org', 'ai', 'eu', 'io', 'app']) {
    assert.equal(filterListings(records, {...filters, tlds: [tld]}, 'recent', now).length, 10);
    assert.equal(filterListings(records, {...filters, tlds: [tld], period: '0'}, 'recent', now).length, 0);
  }
  assert.equal(filterListings(records, filters, 'discover', now).length, 0);
  const earlier = {...records[0], domain: 'earlier.com', reportedDrop: {...records[0].reportedDrop, at: '2026-10-13T11:00:00.000Z'}};
  assert.equal(orderListings([earlier, records[1]], 'recent')[0].domain, records[1].domain);
  assert.match(catalogueCsv([earlier]), /2026-10-13T11:00:00.000Z/);
});
