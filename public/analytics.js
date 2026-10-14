import { hash, csvCell } from './model.js';
const DAY = 86400000;
export const mean = a => (a.length ? a.reduce((sum, v) => sum + v, 0) / a.length : null);
export function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}
export function percent(current, previous) {
  const value = previous > 0 ? (current / previous - 1) * 100 : null;
  return value !== null && Number.isFinite(value) ? value : null;
}
export function sampleDataset(
  query,
  { country = '', source = 'google', period = '1095', now = new Date() } = {},
) {
  const seed = hash(query.toLowerCase() + '|' + country + '|' + source);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY;
  const days = Math.min(1825, Math.max(30, Number(period) || 1095));
  const records = Array.from({ length: days }, (_, i) => {
    const time = end - (days - 1 - i) * DAY,
      date = new Date(time);
    const month = date.getUTCMonth(),
      phase = (month + (date.getUTCDate() - 1) / 30.5) / 12;
    const years = (time - Date.UTC(2020, 0, 1)) / (365.25 * DAY);
    const direction = seed % 4 === 0 ? -1 : 1,
      drift = direction * (1.1 + (seed % 5) / 3) * years;
    const cycle =
      (6 + (seed % 11)) * Math.sin(phase * Math.PI * 2 + ((seed % 12) / 12) * Math.PI * 2);
    const noise = ((hash(seed + ':' + date.toISOString().slice(0, 10)) % 100) / 100 - 0.5) * 6;
    return {
      date: date.toISOString().slice(0, 10),
      value:
        Math.round(Math.max(1, Math.min(100, 30 + (seed % 20) + drift + cycle + noise)) * 10) / 10,
    };
  });
  return {
    id: 'sample-' + seed + '-' + days,
    query,
    country,
    source,
    period: String(days),
    kind: 'sample',
    unit: 'Interest index',
    records,
  };
}
export function movingAverage(records, window = 7) {
  return records.map((r, i) => ({
    ...r,
    value: i + 1 < window ? null : mean(records.slice(i + 1 - window, i + 1).map(x => x.value)),
  }));
}
function slope(records) {
  if (records.length < 2) return null;
  const start = Date.parse(records[0].date),
    xs = records.map(r => (Date.parse(r.date) - start) / DAY);
  const ys = records.map(r => r.value),
    xm = mean(xs),
    ym = mean(ys);
  const den = xs.reduce((s, x) => s + (x - xm) ** 2, 0);
  return den > 0 ? xs.reduce((s, x, i) => s + (x - xm) * (ys[i] - ym), 0) / den : null;
}
export function summarize(records) {
  const values = records.map(r => r.value),
    n = values.length,
    average = mean(values);
  const window = Math.min(30, Math.floor(n / 3));
  const recent = values.slice(-window),
    prior = values.slice(-2 * window, -window),
    earlier = values.slice(-3 * window, -2 * window);
  const change = percent(mean(recent), mean(prior)),
    priorChange = percent(mean(prior), mean(earlier));
  const std = Math.sqrt(mean(values.map(v => (v - average) ** 2)) ?? 0);
  const baseline = mean(values.slice(0, Math.min(7, n)));
  const tail = records.slice(-window),
    before = records.slice(-2 * window, -window);
  const latestSlope = slope(tail),
    previousSlope = slope(before);
  return {
    latest: values.at(-1) ?? null,
    average,
    peak: values.length ? Math.max(...values) : null,
    peakDate: values.length ? records[values.indexOf(Math.max(...values))].date : null,
    change,
    acceleration: change !== null && priorChange !== null ? change - priorChange : null,
    volatility: average > 0 ? (std / average) * 100 : null,
    baselineChange: percent(mean(values.slice(-Math.min(7, n))), baseline),
    window,
    count: n,
    cadenceDays:
      n > 1
        ? median(
            records
              .slice(1)
              .map((r, i) => (Date.parse(r.date) - Date.parse(records[i].date)) / DAY),
          )
        : null,
    latestSlope,
    previousSlope,
  };
}
export function anomalies(records) {
  const out = [];
  for (let i = 14; i < records.length; i++) {
    const baseline = records.slice(Math.max(0, i - 30), i).map(r => r.value),
      center = median(baseline);
    const mad = median(baseline.map(v => Math.abs(v - center)));
    const threshold = Math.max(mad * 1.4826 * 4, center * 0.25, 1);
    if (Math.abs(records[i].value - center) > threshold)
      out.push({
        ...records[i],
        baseline: center,
        deviation: percent(records[i].value, center),
        direction: records[i].value > center ? 'Spike' : 'Dip',
      });
  }
  return out;
}
export function seasonality(records) {
  const byMonth = new Map();
  for (const r of records) {
    const key = r.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(r.value);
  }
  const years = new Map();
  for (const [key, vals] of byMonth) {
    const year = key.slice(0, 4),
      month = Number(key.slice(5)) - 1;
    if (!years.has(year)) years.set(year, []);
    years.get(year).push({ month, value: mean(vals) });
  }
  const complete = [...years].filter(
    ([, months]) => months.length === 12 && mean(months.map(x => x.value)) > 0,
  );
  if (complete.length < 2)
    return {
      available: false,
      reason:
        'Seasonality needs at least two calendar years with observations in all 12 months. Increase the range or import a longer series.',
      months: [],
      years: complete.length,
    };
  const bins = Array.from({ length: 12 }, () => []);
  for (const [, months] of complete) {
    const avg = mean(months.map(x => x.value));
    months.forEach(m => bins[m.month].push((m.value / avg) * 100));
  }
  const months = bins.map((values, month) => ({
    month,
    index: mean(values),
    observations: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  }));
  const all = bins.flat(),
    totalVariance = mean(all.map(v => (v - 100) ** 2));
  const seasonalVariance = mean(months.map(m => (m.index - 100) ** 2));
  const strength =
    totalVariance > 0 ? Math.max(0, Math.min(100, (seasonalVariance / totalVariance) * 100)) : 0;
  const peak = [...months].sort((a, b) => b.index - a.index)[0];
  return {
    available: true,
    months,
    years: complete.length,
    yearLabels: complete.map(([y]) => y),
    strength,
    peak,
  };
}
function splitCsv(text) {
  if (text.length > 2_000_000) throw new Error('CSV exceeds the 2 MB limit.');
  const clean = text
    .replace(/^\ufeff/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const first =
    clean.split('\n').find(line => /date|month|week|day|time/i.test(line)) || clean.split('\n')[0];
  let commas = 0,
    semicolons = 0,
    headerQuoted = false;
  for (let i = 0; i < first.length; i++) {
    if (first[i] === '"') {
      if (headerQuoted && first[i + 1] === '"') i++;
      else headerQuoted = !headerQuoted;
    } else if (!headerQuoted) {
      if (first[i] === ',') commas++;
      if (first[i] === ';') semicolons++;
    }
  }
  const delimiter = semicolons > commas ? ';' : ',';
  const rows = [],
    row = [];
  let cell = '',
    quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === '"') {
      if (quoted && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if (c === '\n' && !quoted) {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push([...row]);
      row.length = 0;
      cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV contains an unfinished quoted field.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push([...row]);
  return { rows, delimiter };
}
function validDate(text) {
  const token = text.trim().split(' ')[0];
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(token)) return null;
  const date = token.length === 7 ? token + '-01' : token;
  const parsed = new Date(date + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}
function csvTable(text) {
  const { rows, delimiter } = splitCsv(text);
  const headerIndex = rows.findIndex(row =>
    row.some(cell => /^(date|month|week|day|time)$/i.test(cell)),
  );
  if (headerIndex < 0)
    throw new Error(
      'Add a date, month, week, day or time header and at least one numeric value column.',
    );
  const headers = rows[headerIndex],
    dateIndex = headers.findIndex(cell => /^(date|month|week|day|time)$/i.test(cell));
  const columns = headers
    .map((name, index) => ({ name: name || 'Column ' + (index + 1), index }))
    .filter(x => x.index !== dateIndex);
  if (!columns.length) throw new Error('No value column was found.');
  if (columns.length > 100) throw new Error('Use a CSV with up to 100 value columns.');
  return { rows, delimiter, headerIndex, dateIndex, columns };
}
function csvColumn(table, column) {
  const { rows, delimiter, headerIndex, dateIndex, columns } = table;
  const chosen = columns.find(x => x.index === Number(column));
  if (!chosen) throw new Error('Select a valid value column.');
  const records = [],
    seen = new Set();
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some(Boolean)) continue;
    const date = validDate(row[dateIndex] || '');
    if (!date)
      throw new Error('Invalid date on CSV row ' + (i + 1) + '. Use YYYY-MM-DD or YYYY-MM.');
    const raw = row[chosen.index] ?? '';
    if (!raw || raw === '<1')
      throw new Error(
        'Missing or censored value on CSV row ' +
          (i + 1) +
          '. Values such as <1 need an explicit numeric choice before importing.',
      );
    const value = Number(delimiter === ';' ? raw.replace(',', '.') : raw);
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)
      throw new Error(
        'Invalid value on CSV row ' +
          (i + 1) +
          '. Use finite, non-negative values within JavaScript’s safe numeric range.',
      );
    if (seen.has(date))
      throw new Error('Duplicate date ' + date + '. Use one observation per date.');
    seen.add(date);
    records.push({ date, value });
  }
  if (records.length < 6) throw new Error('Import at least six dated observations.');
  if (records.length > 10000) throw new Error('Import up to 10,000 observations per series.');
  records.sort((a, b) => a.date.localeCompare(b.date));
  return { records, columns, selectedColumn: chosen.index, name: chosen.name };
}
export function parseCsv(text, valueColumn) {
  const table = csvTable(text);
  return csvColumn(table, valueColumn === undefined ? table.columns[0].index : valueColumn);
}
export function inspectCsv(text) {
  const table = csvTable(text);
  return {
    columns: table.columns.map(column => {
      try {
        const parsed = csvColumn(table, column.index);
        return {
          ...column,
          valid: true,
          count: parsed.records.length,
          from: parsed.records[0].date,
          to: parsed.records.at(-1).date,
        };
      } catch (error) {
        return { ...column, valid: false, error: error.message };
      }
    }),
  };
}
export function parseCsvColumns(text, valueColumns) {
  if (!Array.isArray(valueColumns) || valueColumns.length < 1 || valueColumns.length > 5)
    throw new Error('Select between one and five value columns.');
  const indices = valueColumns.map(Number);
  if (new Set(indices).size !== indices.length)
    throw new Error('Select each value column only once.');
  const table = csvTable(text);
  return indices.map(index => {
    const name = table.columns.find(c => c.index === index)?.name || 'Unknown column';
    try {
      return csvColumn(table, index);
    } catch (error) {
      throw new Error(name + ': ' + error.message);
    }
  });
}

export function compareSeries(datasets) {
  if (datasets.length < 2) throw new Error('Choose at least two series.');
  const maps = datasets.map(d => new Map(d.records.map(r => [r.date, r.value])));
  const dates = datasets[0].records
    .map(r => r.date)
    .filter(date => maps.every(map => map.has(date)));
  if (dates.length < 6)
    throw new Error(
      'These series need at least six dates in common. Missing dates are not interpolated.',
    );
  return datasets.map((d, index) => {
    const values = dates.map(date => maps[index].get(date)),
      base = mean(values.slice(0, Math.min(7, values.length)));
    if (base <= 0) throw new Error('Cannot rebase a series with a zero starting average.');
    return {
      ...d,
      records: dates.map((date, i) => ({ date, value: (values[i] / base) * 100 })),
      sourceRecords: dates.map((date, i) => ({ date, value: values[i] })),
      baseline: base,
    };
  });
}
export function dataStatus(dataset) {
  if (dataset.kind === 'sample') return 'SYNTHETIC_DEMO_NOT_LIVE';
  if (dataset.kind !== 'history') return 'USER_IMPORTED_UNVERIFIED';
  return (
    {
      'bing-webmaster-keyword-stats': 'BING_WEBMASTER_KEYWORD_HISTORY',
      'serpapi-google-trends': 'GOOGLE_TRENDS_VIA_SERPAPI',
      'dataforseo-google-trends': 'GOOGLE_TRENDS_VIA_DATAFORSEO',
      'dataforseo-bing-search-volume': 'BING_SEARCH_VOLUME_VIA_DATAFORSEO',
    }[dataset.provider] || 'RETRIEVED_HISTORY_UNKNOWN_PROVIDER'
  );
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
export function evaluateRule(dataset, rule) {
  const stats = summarize(dataset.records);
  const value =
    rule.metric === 'level'
      ? stats.latest
      : rule.metric === 'acceleration'
        ? stats.acceleration
        : stats.change;
  if (value === null || !Number.isFinite(value)) return { triggered: false, value: null };
  return {
    triggered:
      rule.direction === 'below' ? value < Number(rule.threshold) : value > Number(rule.threshold),
    value,
  };
}
