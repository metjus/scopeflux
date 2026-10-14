// "Compare topics" page (#compare): 2–5 series rebased to 100 on shared dates.
// Series come from Wikipedia (typed topics) or from series stored in this browser.
import { summarize, compareSeries } from '../data/statistics.js';
import { exportComparison } from '../data/exports.js';
import { fetchWikipediaSeries } from '../data/wikipedia-client.js';
import { editionName, WIKI_LANGUAGES } from '../data/wiki-languages.js';
import { $, $$, esc, pct, toast, download, countryName, periodName, datesText } from '../ui/dom.js';
import { chartSvg, emptyChart, SERIES_COLORS } from '../ui/chart.js';
import { seriesLabel, storedSeries, onSeriesChange } from '../state.js';
import { currentSeries } from './explorer.js';

const MAX_SERIES = 5;
let comparison = []; // rebased series currently on the chart
let comparisonRequest = null; // the form state that produced `comparison`
let emptyMessage = 'Choose two topics and select Compare.';
let busy = false;

const importedMode = () => $('#compare-mode').value === 'imported';
const typedTopics = () => [
  ...new Set(
    $('#compare-input')
      .value.split(',')
      .map(x => x.trim())
      .filter(Boolean),
  ),
];
const storedChoices = () => storedSeries(currentSeries());

// Fingerprint of the form, so a stale chart is cleared when the form changes.
function formKey() {
  return importedMode()
    ? JSON.stringify([
        'imported',
        $$('#compare-import-options input:checked')
          .map(x => x.value)
          .sort(),
      ])
    : JSON.stringify(['topics', typedTopics(), $('#country').value, $('#period').value]);
}

function invalidate(render = true) {
  if (comparisonRequest !== null && comparisonRequest !== formKey()) {
    comparison = [];
    comparisonRequest = null;
    emptyMessage = 'Selection changed. Run Compare to update the chart.';
    if (render) renderComparison();
  }
}

export function syncForm(focus = false) {
  const imported = importedMode();
  $('#compare-topic-entry').hidden = imported;
  $('#compare-input').disabled = imported;
  $('#compare-input').required = !imported;
  $('#compare-import-options').hidden = !imported;
  $('#compare-input-grid').classList.toggle('import-mode', imported);
  const count = $$('#compare-import-options input:checked').length;
  $('#compare-form-help').textContent = imported
    ? 'Select 2–' +
      MAX_SERIES +
      ' loaded topics · ' +
      count +
      ' selected. This compares relative growth on shared dates, not absolute popularity.'
    : 'Enter 2–' +
      MAX_SERIES +
      ' topics. Each is looked up on Wikipedia with the market and period chosen in CSV analytics.';
  $('#compare-submit').textContent = imported ? 'Compare selected series ↗' : 'Compare topics ↗';
  $('#compare-submit').disabled = busy || (imported && (count < 2 || count > MAX_SERIES));
  $('#compare-topic-context').hidden = imported;
  const country = $('#country').value;
  $('#compare-topic-settings').textContent =
    countryName(country) +
    ' · ' +
    periodName($('#period').value) +
    ' · ' +
    editionName(WIKI_LANGUAGES[country]);
  invalidate();
  if (focus && !imported) {
    $('#compare-input').focus();
    $('#compare-input').select();
  }
}

// Checkbox list of stored series (for "Loaded series & CSV data").
export function refreshPicker() {
  const list = storedChoices();
  const selected = new Set($$('#compare-import-options input:checked').map(x => x.value));
  $('#compare-import-options').innerHTML = list.length
    ? list
        .map(
          d =>
            '<label><input type="checkbox" value="' +
            esc(d.id) +
            '" ' +
            (selected.has(d.id) ? 'checked' : '') +
            '>' +
            esc(d.query) +
            ' · ' +
            esc(seriesLabel(d)) +
            ' · ' +
            esc(countryName(d.country)) +
            (d.language ? ' · ' + esc(d.language) : '') +
            ' · ' +
            d.records.length +
            ' observations</label>',
        )
        .join('')
    : '<div class="comparison-import-empty"><strong>Bring your own trend history</strong><p>Import at least two CSV series, then select them here. To type topic names, choose Wikipedia topics above.</p><a href="#imports" class="outline-btn">Import CSV data ↗</a></div>';
  $$('#compare-import-options input').forEach(input =>
    input.addEventListener('change', () => syncForm()),
  );
  syncForm();
}

async function loadTypedTopics() {
  const terms = typedTopics();
  if (terms.some(x => x.length > 100))
    throw new Error('Each topic can contain up to 100 characters.');
  if (terms.length < 2 || terms.length > MAX_SERIES)
    throw new Error('Enter between two and ' + MAX_SERIES + ' topics, separated by commas.');
  const datasets = [];
  // One topic at a time, to stay gentle with Wikipedia's servers.
  for (const [i, query] of terms.entries()) {
    $('#compare-caption').textContent =
      'Loading Wikipedia views · ' + (i + 1) + ' of ' + terms.length + ' (' + query + ')…';
    try {
      datasets.push(
        await fetchWikipediaSeries({
          query,
          country: $('#country').value,
          period: $('#period').value,
        }),
      );
    } catch (error) {
      throw new Error(query + ': ' + error.message);
    }
  }
  return datasets;
}

async function buildComparison() {
  const request = formKey();
  const datasets = importedMode()
    ? storedChoices().filter(d =>
        $$('#compare-import-options input:checked')
          .map(x => x.value)
          .includes(d.id),
      )
    : await loadTypedTopics();
  if (datasets.length < 2 || datasets.length > MAX_SERIES)
    throw new Error('Select between two and ' + MAX_SERIES + ' series.');
  comparison = compareSeries(datasets);
  comparisonRequest = request;
  renderComparison();
  toast('Comparison ready · relative growth, not absolute popularity.');
}

export function renderComparison() {
  invalidate(false);
  $('#export-comparison').disabled = !comparison.length;
  if (!comparison.length) {
    $('#compare-chart').innerHTML = emptyChart(emptyMessage);
    $('#compare-legend').innerHTML = '';
    $('#compare-results').innerHTML = '';
    $('#compare-caption').textContent = emptyMessage;
    return;
  }
  $('#compare-chart').innerHTML = chartSvg(comparison, { id: 'compare', points: false });
  $('#compare-legend').innerHTML = comparison
    .map(
      (d, i) =>
        '<span><i style="background:' +
        SERIES_COLORS[i] +
        '"></i>' +
        esc(d.query) +
        ' · ' +
        esc(seriesLabel(d)) +
        '</span>',
    )
    .join('');
  const kinds = new Set(comparison.map(d => seriesLabel(d)));
  $('#compare-caption').textContent =
    comparison[0].records.length +
    ' common dates · ' +
    datesText(comparison[0]) +
    ' · ' +
    (kinds.size === 1 ? [...kinds][0] : 'Mixed sources: ' + [...kinds].join(' & '));
  $('#compare-results').innerHTML = comparison
    .map(d => {
      const stats = summarize(d.records);
      return (
        '<article><h4>' +
        esc(d.query) +
        '</h4><strong>' +
        pct(stats.baselineChange) +
        '</strong><small>Last 7-point average vs. starting average</small></article>'
      );
    })
    .join('');
}

// Used after an import: switch to stored series and pre-select the given ids.
export function compareStored(ids) {
  $('#compare-mode').value = 'imported';
  comparison = [];
  comparisonRequest = null;
  emptyMessage = 'Choose two topics and select Compare.';
  refreshPicker();
  $$('#compare-import-options input').forEach(input => {
    input.checked = ids.length <= MAX_SERIES && ids.includes(input.value);
  });
  syncForm();
  renderComparison();
  location.hash = 'compare';
  if (ids.length > MAX_SERIES)
    toast('Choose ' + MAX_SERIES + ' of the imported topics to compare.');
}

export function initCompare() {
  onSeriesChange(refreshPicker);
  $('#compare-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    $('#compare-error').hidden = true;
    busy = true;
    syncForm();
    try {
      await buildComparison();
    } catch (error) {
      emptyMessage = 'Choose two topics and select Compare.';
      renderComparison();
      $('#compare-error').textContent = error.message;
      $('#compare-error').hidden = false;
    } finally {
      busy = false;
      syncForm();
    }
  });
  for (const type of ['input', 'change'])
    $('#compare-form').addEventListener(type, () => {
      $('#compare-error').hidden = true;
      invalidate();
    });
  // The Explorer's market and period also apply to typed topics here.
  for (const id of ['country', 'period'])
    $('#' + id).addEventListener('change', () => invalidate());
  $('#compare-mode').addEventListener('change', () => {
    refreshPicker();
    syncForm(true);
  });
  $('#export-comparison').addEventListener('click', () => {
    invalidate();
    if (!comparison.length) {
      toast('Run a comparison before exporting.');
      return;
    }
    download(exportComparison(comparison), 'scopeflux-comparison-report.csv');
    toast('Comparison exported: original values and rebased indices on shared dates.');
  });
  refreshPicker();
}
