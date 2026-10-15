// CSV exports. Every row carries where the numbers came from (data_status).
import { csvCell } from './countries.js';
import { mean, seasonality } from './statistics.js';

// Machine-readable label for where a series came from. Older provider names are
// kept so series retrieved by earlier versions of ScopeFlux still export correctly.
const PROVIDER_STATUS = {
  'wikipedia-pageviews': 'WIKIPEDIA_PAGEVIEWS',
  'bing-webmaster-keyword-stats': 'BING_WEBMASTER_KEYWORD_HISTORY',
  'serpapi-google-trends': 'GOOGLE_TRENDS_VIA_SERPAPI',
  'dataforseo-google-trends': 'GOOGLE_TRENDS_VIA_DATAFORSEO',
  'dataforseo-bing-search-volume': 'BING_SEARCH_VOLUME_VIA_DATAFORSEO',
};
export function dataStatus(dataset) {
  if (dataset.kind !== 'history') return 'USER_IMPORTED_UNVERIFIED';
  return PROVIDER_STATUS[dataset.provider] || 'RETRIEVED_HISTORY_UNKNOWN_PROVIDER';
}
export function exportSeries(dataset) {
  return (
    '\ufeff' +
    [
      [
        'date',
        'value',
        'topic',
        'market',
        'source',
        'data_status',
        'unit',
        'provider',
        'retrieved_at',
        'omitted_below_1',
        'omitted_incomplete',
        'keyword_language',
        'provider_metric',
      ],
      ...dataset.records.map(r => [
        r.date,
        r.value,
        dataset.query,
        dataset.country || 'Worldwide',
        dataset.source,
        dataStatus(dataset),
        dataset.unit,
        dataset.provider || '',
        dataset.fetchedAt || '',
        dataset.omittedCensored ?? '',
        dataset.omittedPartial ?? '',
        dataset.language || '',
        dataset.metric || '',
      ]),
    ]
      .map(row => row.map(csvCell).join(','))
      .join('\r\n')
  );
}
const reportCsv = rows => '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
const provenance = d => [
  d.query,
  d.country || 'Worldwide',
  d.source,
  dataStatus(d),
  d.provider || '',
  d.fetchedAt || '',
];
export function exportComparison(datasets) {
  if (datasets.length < 2) throw new Error('Run a comparison before exporting.');
  const rows = [
    [
      'date',
      'original_value',
      'original_unit',
      'rebased_index',
      'starting_average',
      'baseline_observations',
      'topic',
      'market',
      'source',
      'data_status',
      'provider',
      'retrieved_at',
      'record_type',
    ],
  ];
  for (const d of datasets) {
    if (!d.sourceRecords || d.sourceRecords.length !== d.records.length || !(d.baseline > 0))
      throw new Error('Run the comparison again before exporting.');
    d.records.forEach((r, i) => {
      const original = d.sourceRecords[i];
      if (original.date !== r.date) throw new Error('Comparison dates do not match. Run it again.');
      rows.push([
        r.date,
        original.value,
        d.unit,
        r.value,
        d.baseline,
        Math.min(7, d.records.length),
        ...provenance(d),
        'ALIGNED_COMPARISON',
      ]);
    });
  }
  return reportCsv(rows);
}
export function exportSeasonality(dataset) {
  const profile = seasonality(dataset.records);
  if (!profile.available) throw new Error(profile.reason);
  const header = [
    'record_type',
    'year',
    'month',
    'seasonal_index',
    'original_monthly_average',
    'year_average_month',
    'original_unit',
    'contributing_years',
    'min_year_index',
    'max_year_index',
    'pattern_consistency_percent',
    'years_used',
    'topic',
    'market',
    'source',
    'data_status',
    'provider',
    'retrieved_at',
  ];
  const context = [profile.strength, profile.yearLabels.join(';'), ...provenance(dataset)];
  const rows = [
    header,
    ...profile.months.map(m => [
      'MONTHLY_PROFILE',
      '',
      m.month + 1,
      m.index,
      '',
      '',
      dataset.unit,
      m.observations,
      m.min,
      m.max,
      ...context,
    ]),
  ];
  for (const year of profile.yearLabels) {
    const monthly = Array.from({ length: 12 }, (_, month) =>
      mean(
        dataset.records
          .filter(r => r.date.startsWith(year + '-' + String(month + 1).padStart(2, '0')))
          .map(r => r.value),
      ),
    );
    const annual = mean(monthly);
    monthly.forEach((value, month) =>
      rows.push([
        'YEAR_MONTH',
        year,
        month + 1,
        (value / annual) * 100,
        value,
        annual,
        dataset.unit,
        1,
        '',
        '',
        ...context,
      ]),
    );
  }
  return reportCsv(rows);
}
