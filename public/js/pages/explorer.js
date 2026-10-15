// "CSV analytics" page (#explorer): analyze one series — a Wikipedia topic or
// a series the visitor imported — with metrics, a chart and anomaly flags.
import { summarize, movingAverage, anomalies } from '../data/statistics.js';
import { exportSeries } from '../data/exports.js';
import { describeSeries } from '../data/summaries.js';
import { WIKI_LANGUAGES, editionName } from '../data/wiki-languages.js';
import {
  fetchWikipediaSeries,
  historyDescription,
  WIKIPEDIA_PROVIDER,
} from '../data/wikipedia-client.js';
import {
  $,
  $$,
  esc,
  fmt,
  pct,
  icon,
  toast,
  download,
  countryName,
  periodName,
  datesText,
} from '../ui/dom.js';
import { chartSvg, chartInteractions } from '../ui/chart.js';
import {
  workspace,
  persist,
  seriesLabel,
  meta,
  keyOf,
  storeFetched,
  storedSeries,
  updateSavedCount,
  seriesChanged,
  onSeriesChange,
  MAX_SAVED,
} from '../state.js';

let current = workspace.fetchedSeries[0] || null; // series shown on the page
let lastTopic = current; // last Wikipedia series, shown again in "topic" mode
let requestVersion = 0, // ignore answers to requests that were replaced
  controller = null;

const isWikipedia = d => d?.provider === WIKIPEDIA_PROVIDER;

export const currentSeries = () => current;

// Market picker: Worldwide first, then every country with a supported edition.
export function marketOptionsHtml() {
  return Object.entries(WIKI_LANGUAGES)
    .map(([code, lang]) => [
      code,
      (code ? countryName(code) : 'Worldwide') + ' · ' + editionName(lang),
    ])
    .sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : a[1].localeCompare(b[1])))
    .map(([code, label]) => '<option value="' + code + '">' + esc(label) + '</option>')
    .join('');
}

function showSearchError(message) {
  $('#search-form-error').textContent = message;
  $('#search-form-error').hidden = false;
  $('#keyword').setAttribute('aria-invalid', 'true');
}
function clearSearchError() {
  $('#search-form-error').hidden = true;
  $('#keyword').removeAttribute('aria-invalid');
}
function setLoading(loading) {
  $('#search-submit').disabled = loading;
  $('#search-submit').textContent = loading ? 'Loading…' : 'Analyze ↗';
  $('#search-cost').textContent = loading
    ? 'Asking Wikipedia…'
    : 'Wikipedia article views per day · free';
}

// Look up a topic on Wikipedia and open it. destination: page to show afterwards.
// options.country / options.period default to the Explorer's pickers.
// options.onError(message) lets another page show the error in its own form.
export async function analyzeTopic(query, options = {}, destination = 'explorer') {
  clearSearchError();
  const fail = options.onError || showSearchError;
  query = query.trim().replace(/\s+/g, ' ');
  if (!query || query.length > 100) {
    fail('Enter a topic between 1 and 100 characters.');
    return false;
  }
  const country = options.country ?? $('#country').value,
    period = options.period ?? $('#period').value;
  const version = ++requestVersion;
  controller?.abort();
  controller = new AbortController();
  setLoading(true);
  try {
    const d = await fetchWikipediaSeries({ query, country, period }, { signal: controller.signal });
    if (version !== requestVersion) return false;
    storeFetched(d);
    $('#explorer-mode').value = 'topic';
    showSeries(d);
    location.hash = destination;
    toast('Wikipedia article views loaded for “' + d.query + '”.');
    return true;
  } catch (error) {
    if (version !== requestVersion || error.name === 'AbortError') return false;
    fail(error.message);
    return false;
  } finally {
    if (version === requestVersion) setLoading(false);
  }
}

// Open a stored series (from Saved topics, Recent analyses, Import data, ...).
export function openDataset(d) {
  $('#explorer-mode').value = isWikipedia(d) ? 'topic' : 'loaded';
  $('#smoothing').value = '1';
  showSeries(d);
  location.hash = 'explorer';
}

function showSeries(d) {
  current = d;
  if (isWikipedia(d)) lastTopic = d;
  renderResult();
  seriesChanged({ opened: d });
}

function isSaved(d) {
  return workspace.saved.some(x => keyOf(x.dataset) === keyOf(d));
}

export function toggleSave(d = current) {
  const key = keyOf(d),
    index = workspace.saved.findIndex(x => keyOf(x.dataset) === key);
  if (index >= 0) {
    workspace.saved.splice(index, 1);
    const stored = persist();
    renderResult();
    if (stored) toast('Topic removed from your watchlist.');
    return;
  }
  if (workspace.saved.length >= MAX_SAVED) {
    toast('This browser workspace supports ' + MAX_SAVED + ' watchlist topics.');
    return;
  }
  workspace.saved.unshift({
    ...meta(d),
    dataset: structuredClone(d),
    rule: { metric: 'change', direction: 'above', threshold: 20, enabled: false },
  });
  const stored = persist();
  renderResult();
  if (stored) toast('Snapshot saved to your local watchlist.');
}

// Wording that depends on where the series came from.
function describeOrigin(d) {
  const wiki = isWikipedia(d),
    retrieved = d.kind === 'history';
  return {
    context: wiki
      ? countryName(d.country) + ' · ' + periodName(d.period) + ' · ' + editionName(d.language)
      : retrieved
        ? countryName(d.country) +
          ' · ' +
          periodName(d.period) +
          (d.language ? ' · Keyword language: ' + d.language : '')
        : 'Imported series · ' + d.unit,
    badge: retrieved ? seriesLabel(d).toUpperCase() : 'YOUR IMPORTED DATA',
    notice: retrieved
      ? historyDescription(d)
      : 'Your CSV values · No upload or provider verification. Calculations preserve your original units.',
    unit: d.source === 'google' ? '/ 100' : wiki ? 'views / day' : d.unit,
    chartTitle:
      d.source === 'google'
        ? 'Interest over time'
        : wiki
          ? 'Article views over time'
          : 'Values over time',
    signalSource: wiki
      ? 'Calculated from Wikipedia article views'
      : retrieved
        ? 'Calculated from stored observations'
        : 'Calculated from your imported values',
    coverage: wiki
      ? [
          ['Data origin', 'Wikipedia pageviews API'],
          ['Article', d.article || d.query],
          ['Edition', editionName(d.language)],
          ['Retrieved at', new Date(d.fetchedAt).toLocaleString('en')],
        ]
      : retrieved
        ? [
            ['Data origin', 'Retrieved history'],
            ['Source', seriesLabel(d)],
            ['Retrieved at', new Date(d.fetchedAt).toLocaleString('en')],
          ]
        : [
            ['Data origin', 'CSV import'],
            ['Source', 'User-supplied'],
          ],
  };
}

function signalHeadline(stats) {
  if (stats.change === null) return 'A baseline to build.';
  if (stats.acceleration > 2) return 'Momentum is picking up.';
  if (stats.acceleration < -2) return 'Growth is losing pace.';
  return 'A steadier signal.';
}

function signalText(stats) {
  if (stats.change === null)
    return 'The preceding window has a zero average. A percentage change is undefined.';
  return (
    pct(stats.change) +
    ' average change across adjacent ' +
    stats.window +
    '-observation windows. ' +
    (stats.acceleration !== null
      ? 'The growth rate shifted ' +
        fmt(stats.acceleration) +
        ' percentage points from the earlier comparison.'
      : '') +
    ' This is descriptive analysis, not a forecast.'
  );
}

function renderAnomalies(records) {
  const flags = anomalies(records);
  $('#anomaly-count').textContent = flags.length;
  $('#anomaly-list').innerHTML = flags.length
    ? flags
        .slice(-4)
        .reverse()
        .map(
          f =>
            '<div class="anomaly-item"><div><strong>' +
            f.direction +
            ' · ' +
            f.date +
            '</strong><small>' +
            fmt(f.value) +
            ' vs. rolling median ' +
            fmt(f.baseline) +
            '</small></div><span class="status-pill">' +
            pct(f.deviation) +
            '</span></div>',
        )
        .join('')
    : '<p class="anomaly-empty">No observations exceeded the rolling anomaly threshold. This does not rule out meaningful changes.</p>';
}

export function renderResult() {
  syncControls();
  if (!current) {
    $('#analysis-result').hidden = true;
    return;
  }
  const d = current,
    stats = summarize(d.records),
    origin = describeOrigin(d);
  $('#analysis-result').hidden = false;
  if (isWikipedia(d) && $('#explorer-mode').value === 'topic') {
    $('#keyword').value = d.searchedFor || d.query;
    $('#country').value = d.country;
    $('#period').value = d.period;
  }
  $('#result-title').textContent = d.query;
  $('#result-context').textContent = origin.context;
  $('#data-badge').textContent = origin.badge;
  $('#data-badge').classList.toggle('history-badge', d.kind === 'history');
  $('#analysis-summary').textContent = describeSeries(d);
  $('#data-notice').classList.add('imported');
  $('#data-notice').textContent = origin.notice;

  $('#interest').textContent = fmt(stats.latest);
  $('#value-unit').textContent = origin.unit;
  $('#latest-date').textContent = 'Last observation · ' + d.records.at(-1).date;
  $('#growth').textContent = pct(stats.change);
  $('#growth-label').textContent =
    stats.change === null
      ? 'No baseline'
      : stats.change > 0
        ? 'Growing'
        : stats.change < 0
          ? 'Declining'
          : 'Steady';
  $('#growth-method').textContent =
    'Last ' + stats.window + ' observations vs. preceding ' + stats.window;
  $('#acceleration').textContent =
    stats.acceleration === null
      ? 'N/A'
      : (stats.acceleration > 0 ? '+' : '') + fmt(stats.acceleration);
  $('#volatility').textContent = fmt(stats.volatility);
  $('#signal-title').textContent = signalHeadline(stats);
  $('#signal-text').textContent = signalText(stats);
  $('#signal-source').textContent = origin.signalSource;
  $('#save-topic').innerHTML = icon('bookmark') + (isSaved(d) ? 'Tracked topic' : 'Track topic');
  updateSavedCount();

  $('#series-chart-title').textContent = origin.chartTitle;
  $('#chart-subtitle').textContent = d.records.length + ' observations · ' + d.unit;
  renderChart();
  renderAnomalies(d.records);

  const coverage = [
    ...origin.coverage,
    ['Observations', fmt(stats.count, 0)],
    ['Typical interval', stats.cadenceDays === null ? 'N/A' : fmt(stats.cadenceDays) + ' days'],
    ['Average value', fmt(stats.average)],
    ['Highest value', fmt(stats.peak)],
    ['Peak date', stats.peakDate],
  ];
  $('#coverage').innerHTML = coverage
    .map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>')
    .join('');
}

function renderChart() {
  if (!current) return;
  let window = Number($('#smoothing').value);
  if (window > current.records.length) {
    window = 1;
    $('#smoothing').value = '1';
    toast('This series needs more observations for that smoothing window.');
  }
  const data = {
    ...current,
    records: window === 1 ? current.records : movingAverage(current.records, window),
  };
  $('#chart').innerHTML = chartSvg([data]);
  $('#chart').setAttribute(
    'aria-label',
    current.query + ' ' + seriesLabel(current) + ' time series',
  );
  $('#chart-detail').textContent =
    (window === 1 ? 'Raw observations' : window + '-observation trailing average') +
    ' · ' +
    current.unit;
  $('#chart-range').textContent = datesText(current);
  chartInteractions('#chart', '#chart-detail');
}

// Show the topic search or the stored-series picker, depending on the mode.
function syncControls() {
  const loaded = $('#explorer-mode').value === 'loaded',
    datasets = storedSeries();
  $('#explorer-topic-controls').hidden = loaded;
  $('#topic-suggestions').hidden = loaded;
  $('#explorer-loaded-controls').hidden = !loaded;
  for (const id of ['keyword', 'country', 'period']) $('#' + id).disabled = loaded;
  $('#keyword').required = !loaded;
  $('#explorer-dataset').disabled = !datasets.length;
  $('#explorer-loaded-open').disabled = !datasets.length;
  $('#explorer-loaded-help').textContent = datasets.length
    ? 'Open a series stored in this browser. Original values and units are used.'
    : 'No loaded series yet. Import a CSV with dates and values to analyze your own data.';
}

function chooseMode() {
  clearSearchError();
  if ($('#explorer-mode').value === 'topic') {
    current = lastTopic;
    renderResult();
    return;
  }
  const datasets = storedSeries(),
    selected = datasets.find(d => d.id === $('#explorer-dataset').value) || datasets[0];
  if (selected) showSeries(selected);
  else {
    current = null;
    renderResult();
  }
}

function refreshPicker() {
  const list = storedSeries(current),
    previous = $('#explorer-dataset').value;
  $('#explorer-dataset').innerHTML = list.length
    ? list
        .map(
          d =>
            '<option value="' +
            esc(d.id) +
            '">' +
            esc(d.query) +
            ' · ' +
            esc(seriesLabel(d)) +
            ' · ' +
            esc(d.unit) +
            '</option>',
        )
        .join('')
    : '<option value="">Import a CSV to get started</option>';
  $('#explorer-dataset').value = list.some(d => d.id === current?.id)
    ? current.id
    : list.some(d => d.id === previous)
      ? previous
      : list[0]?.id || '';
  syncControls();
}

export function initExplorer() {
  $('#country').innerHTML = marketOptionsHtml();
  onSeriesChange(refreshPicker);
  $('#search-form').addEventListener('submit', event => {
    event.preventDefault();
    if ($('#explorer-mode').value === 'loaded') chooseMode();
    else analyzeTopic($('#keyword').value);
  });
  $('#explorer-mode').addEventListener('change', chooseMode);
  $('#explorer-dataset').addEventListener('change', chooseMode);
  $('#keyword').addEventListener('input', clearSearchError);
  $$('[data-query]').forEach(b => b.addEventListener('click', () => analyzeTopic(b.dataset.query)));
  $('#save-topic').addEventListener('click', () => toggleSave());
  $('#smoothing').addEventListener('change', renderChart);
  $('#export').addEventListener('click', () => {
    if (!current) return;
    download(
      exportSeries(current),
      'scopeflux-' +
        (current.kind === 'history' ? current.source + '-history' : 'imported') +
        '-series.csv',
    );
    toast('Time series exported with source and data-status labels.');
  });
  refreshPicker();
  renderResult();
}
