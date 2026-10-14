// Descriptive statistics for one dated series: change, volatility, anomalies,
// seasonality, comparison. Pure functions, no DOM; tested in tests/.
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
