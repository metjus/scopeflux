// Inline SVG line charts and sparklines. The chart area is 760×245 (viewBox).
import { $$, esc, fmt } from './dom.js';

// One colour per series, in order.
export const SERIES_COLORS = ['#FF2E63', '#FFD166', '#A78BFA', '#6FD39A', '#FF9A4D'];

export function emptyChart(label) {
  return '<text x="380" y="118" text-anchor="middle" class="chart-empty">' + esc(label) + '</text>';
}

// datasets: [{ query, unit, records: [{date, value}] }]. Null values break the line.
// points: add invisible hover/focus targets that show the raw value.
export function chartSvg(datasets, { id = 'main', points = true } = {}) {
  const valid = datasets.flatMap(d =>
    d.records.filter(r => r.value !== null && Number.isFinite(r.value)),
  );
  if (!valid.length) return emptyChart('Select your data to see the signal.');
  const start = Math.min(...valid.map(r => Date.parse(r.date))),
    end = Math.max(...valid.map(r => Date.parse(r.date)));
  // Round the top of the y-axis up to a "nice" number.
  const maximum = Math.max(...valid.map(r => r.value)),
    step = Math.pow(10, Math.floor(Math.log10(maximum || 1))),
    yMax = Math.ceil((maximum || 1) / step) * step;
  const x = t => 36 + ((t - start) / (end - start || 1)) * 710,
    y = v => 202 - (v / yMax) * 184;

  let svg =
    '<defs><linearGradient id="fill-' +
    id +
    '" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FF2E63" stop-opacity=".28"/><stop offset="1" stop-color="#FF2E63" stop-opacity="0"/></linearGradient></defs>';

  // Horizontal gridlines with value labels.
  for (let i = 0; i < 5; i++) {
    const v = (yMax * i) / 4,
      py = y(v);
    svg +=
      '<path d="M36 ' +
      py +
      'H746" stroke="#231E2C" stroke-dasharray="3 4"/><text x="27" y="' +
      (py + 3) +
      '" text-anchor="end" fill="#6F6880" font-size="9">' +
      fmt(v, maximum < 1 ? 3 : 1) +
      '</text>';
  }
  // Date labels along the bottom.
  for (let i = 0; i < 5; i++) {
    const t = start + ((end - start) * i) / 4;
    svg +=
      '<text x="' +
      x(t) +
      '" y="230" fill="#6F6880" font-size="9" text-anchor="' +
      (i === 0 ? 'start' : i === 4 ? 'end' : 'middle') +
      '">' +
      new Date(t).toLocaleDateString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' }) +
      '</text>';
  }

  datasets.forEach((d, index) => {
    let path = '',
      first = null,
      last = null,
      pen = false;
    for (const r of d.records) {
      if (r.value === null || !Number.isFinite(r.value)) {
        pen = false;
        continue;
      }
      const px = x(Date.parse(r.date)),
        py = y(r.value);
      path += (pen ? ' L' : ' M') + px.toFixed(1) + ' ' + py.toFixed(1);
      if (first === null) first = px;
      last = px;
      pen = true;
    }
    // A single series gets a soft fill under its line.
    if (datasets.length === 1 && first !== null)
      svg +=
        '<path d="' +
        path +
        ' L' +
        last +
        ' 202 L' +
        first +
        ' 202Z" fill="url(#fill-' +
        id +
        ')"/>';
    svg +=
      '<path d="' +
      path +
      '" fill="none" stroke="' +
      SERIES_COLORS[index % SERIES_COLORS.length] +
      '" stroke-width="2.4" stroke-linejoin="round"/>';
    if (points) {
      // At most ~60 hover targets per series, plus the last point.
      const stride = Math.max(1, Math.floor(d.records.length / 60));
      d.records.forEach((r, i) => {
        if (
          r.value === null ||
          !Number.isFinite(r.value) ||
          (i % stride !== 0 && i !== d.records.length - 1)
        )
          return;
        svg +=
          '<circle class="chart-point" tabindex="0" cx="' +
          x(Date.parse(r.date)) +
          '" cy="' +
          y(r.value) +
          '" r="6" fill="transparent" data-detail="' +
          esc(d.query + ' · ' + r.date + ' · ' + fmt(r.value) + ' ' + d.unit) +
          '" aria-label="' +
          esc(r.date + ': ' + fmt(r.value)) +
          '"><title>' +
          esc(d.query + ' · ' + r.date + ' · ' + fmt(r.value)) +
          '</title></circle>';
      });
    }
  });
  return svg;
}

// Show a point's raw value in the `detail` element on hover or keyboard focus.
export function chartInteractions(target, detail) {
  $$(target + ' .chart-point').forEach(p => {
    const show = () => (document.querySelector(detail).textContent = p.dataset.detail);
    p.addEventListener('mouseenter', show);
    p.addEventListener('focus', show);
  });
}

// Tiny 90×28 line without axes, sampled to at most 60 points.
export function sparkline(records) {
  const n = Math.min(60, records.length),
    step = records.length / n,
    vals = Array.from(
      { length: n },
      (_, i) => records[Math.min(records.length - 1, Math.floor(i * step))].value,
    ),
    max = Math.max(...vals),
    min = Math.min(...vals);
  const path = vals
    .map(
      (v, i) =>
        (i ? 'L' : 'M') +
        (1 + (i / (n - 1)) * 88).toFixed(1) +
        ' ' +
        (25 - ((v - min) / (max - min || 1)) * 22).toFixed(1),
    )
    .join(' ');
  return (
    '<svg class="sparkline" viewBox="0 0 90 28" aria-hidden="true"><path d="' + path + '"/></svg>'
  );
}
