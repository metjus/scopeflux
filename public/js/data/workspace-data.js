// Checks data read back from browser storage before the app uses it.
// Anything invalid is kept aside (never deleted, never "repaired" with guesses).

// Provider -> source name for retrieved series. Older providers stay listed so
// real series saved by earlier versions of ScopeFlux can still be reopened.
const providers = {
  'wikipedia-pageviews': 'wikipedia',
  'serpapi-google-trends': 'google',
  'dataforseo-google-trends': 'google',
  'bing-webmaster-keyword-stats': 'bing',
  'dataforseo-bing-search-volume': 'bing',
};
const text = (value, max) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const market = value => typeof value === 'string' && (value === '' || /^[A-Z]{2}$/.test(value));
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function validDataset(d) {
  if (!d || !text(d.id, 200) || !text(d.query, 120) || !text(d.unit, 120) || !market(d.country))
    return false;
  if (!['imported', 'history'].includes(d.kind)) return false;
  if (
    (d.kind === 'imported' && d.source !== 'csv') ||
    (d.kind === 'history' &&
      (!Object.hasOwn(providers, d.provider) || providers[d.provider] !== d.source))
  )
    return false;
  if (
    d.fetchedAt !== undefined &&
    (typeof d.fetchedAt !== 'string' || !Number.isFinite(Date.parse(d.fetchedAt)))
  )
    return false;
  if (!Array.isArray(d.records) || d.records.length < 6 || d.records.length > 10000) return false;
  // Google Trends values are an index from 0 to 100.
  const index = d.kind === 'history' && d.source === 'google';
  return d.records.every(
    (r, i) =>
      r &&
      date(r.date) &&
      typeof r.value === 'number' &&
      Number.isFinite(r.value) &&
      r.value >= 0 &&
      (!index || r.value <= 100) &&
      (i === 0 || r.date > d.records[i - 1].date),
  );
}

// Earlier versions of ScopeFlux stored generated demo series. They are not real
// data, so they are dropped quietly instead of being reported as damaged.
function isGeneratedDemo(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.dataset) return item.dataset.kind === 'sample';
  return item.kind === 'sample' || (item.kind === undefined && typeof item.query === 'string');
}

// Invalid data is retained separately so the next normal save cannot destroy it.
export function restoreDatasetCollections(raw = {}) {
  const unrestoredSeries = Array.isArray(raw.unrestoredSeries) ? [...raw.unrestoredSeries] : [];
  let rejectedCount = 0;
  const reject = (collection, value) => {
    unrestoredSeries.push({ collection, value });
    rejectedCount++;
  };
  function rows(key) {
    if (raw[key] === undefined) return [];
    if (Array.isArray(raw[key])) return raw[key];
    reject(key, raw[key]);
    return [];
  }
  function datasets(key, kind, limit) {
    const accepted = [];
    for (const d of rows(key)) {
      if (validDataset(d) && d.kind === kind && accepted.length < limit) accepted.push(d);
      else reject(key, d);
    }
    return accepted;
  }
  const imports = datasets('imports', 'imported', 5),
    fetchedSeries = datasets('fetchedSeries', 'history', 10);
  const saved = [];
  for (const item of rows('saved')) {
    if (isGeneratedDemo(item)) continue;
    if (saved.length === 50 || !item?.dataset || !validDataset(item.dataset)) {
      reject('saved', item);
      continue;
    }
    const d = item.dataset;
    saved.push({
      ...item,
      query: d.query,
      country: d.country,
      source: d.source,
      period: d.period,
      kind: d.kind,
    });
  }
  return { imports, fetchedSeries, saved, unrestoredSeries, rejectedCount };
}

// The "Recent analyses" list. Entries for generated demos are dropped.
export function restoreHistory(raw) {
  return Array.isArray(raw)
    ? raw
        .filter(
          x =>
            x &&
            typeof x.query === 'string' &&
            x.query.length <= 120 &&
            ['imported', 'history'].includes(x.kind),
        )
        .slice(0, 50)
    : [];
}
