// Browser data rules: what is restored from storage and how exports are labelled.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  restoreDatasetCollections,
  restoreHistory,
  validDataset,
} from '../public/js/data/workspace-data.js';
import { dataStatus } from '../public/js/data/exports.js';

const records = Array.from({ length: 6 }, (_, i) => ({ date: '2026-01-0' + (i + 1), value: i }));
const wikiSeries = {
  id: 'w1',
  kind: 'history',
  source: 'wikipedia',
  provider: 'wikipedia-pageviews',
  query: 'Matcha',
  country: 'DE',
  unit: 'Wikipedia article views per day',
  fetchedAt: '2026-10-14T10:00:00.000Z',
  records,
};
const csvSeries = { id: 'c1', kind: 'imported', source: 'csv', query: 'Sales', country: '', unit: 'Sales', records };

test('Wikipedia and CSV series are valid; generated demo series are not', () => {
  assert.ok(validDataset(wikiSeries));
  assert.ok(validDataset(csvSeries));
  assert.equal(validDataset({ ...csvSeries, kind: 'sample', source: 'google' }), false);
});

test('old generated demo items are dropped quietly, real ones are kept', () => {
  const result = restoreDatasetCollections({
    fetchedSeries: [wikiSeries],
    saved: [
      { query: 'old demo', country: '' }, // legacy demo entry without a dataset
      { kind: 'sample', query: 'demo', country: 'US' },
      { dataset: { ...csvSeries, id: 's', kind: 'sample', source: 'google' } },
      { dataset: csvSeries },
    ],
  });
  assert.equal(result.saved.length, 1);
  assert.equal(result.saved[0].dataset.id, 'c1');
  assert.equal(result.fetchedSeries.length, 1);
  assert.equal(result.rejectedCount, 0);
});

test('damaged real entries are kept aside and reported', () => {
  const result = restoreDatasetCollections({ saved: [{ dataset: { ...csvSeries, records: [] } }] });
  assert.equal(result.saved.length, 0);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.unrestoredSeries.length, 1);
});

test('history keeps only real entries', () => {
  const history = restoreHistory([
    { query: 'demo', kind: 'sample' },
    { query: 'Matcha', kind: 'history' },
    { query: 'Sales', kind: 'imported' },
  ]);
  assert.deepEqual(
    history.map(x => x.query),
    ['Matcha', 'Sales'],
  );
});

test('exports label where numbers came from', () => {
  assert.equal(dataStatus(wikiSeries), 'WIKIPEDIA_PAGEVIEWS');
  assert.equal(dataStatus(csvSeries), 'USER_IMPORTED_UNVERIFIED');
});
