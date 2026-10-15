// "Seasonality" page (#seasonality): which months are above average, per year
// and on average. Needs two complete calendar years of data.
import { seasonality, mean } from '../data/statistics.js';
import { exportSeasonality } from '../data/exports.js';
import { historyDescription, WIKIPEDIA_PROVIDER } from '../data/wikipedia-client.js';
import { $, esc, fmt, toast, download, countryName, datesText } from '../ui/dom.js';
import { seriesLabel, storedSeries, onSeriesChange } from '../state.js';
import { analyzeTopic, currentSeries, marketOptionsHtml } from './explorer.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let topicSeries = null; // the Wikipedia series shown in "topic" mode
let report = null; // series behind the current results, for the CSV export
let draft = null; // what the visitor typed in the topic form, kept across re-renders

const topicMode = () => $('#season-source').value === 'topic';
const storedChoices = () => storedSeries(currentSeries());

function rememberDraft() {
  if (!$('#season-topic-form').hidden)
    draft = {
      query: $('#season-topic').value,
      country: $('#season-country').value,
      period: $('#season-period').value,
    };
}

function showFormError(message) {
  $('#season-form-error').textContent = message;
  $('#season-form-error').hidden = false;
  $('#season-topic').setAttribute('aria-invalid', 'true');
  $('#season-topic').focus();
}

// Keep the dataset picker in sync; follow whatever the Explorer just opened.
function refreshPicker({ opened } = {}) {
  const list = storedChoices(),
    previous = $('#season-dataset').value;
  $('#season-dataset').innerHTML = list
    .map(d => '<option value="' + esc(d.id) + '">' + esc(d.query) + '</option>')
    .join('');
  $('#season-dataset').value = list.some(d => d.id === previous) ? previous : list[0]?.id || '';
  if (opened) {
    if (opened.provider === WIKIPEDIA_PROVIDER) {
      topicSeries = opened;
      draft = null;
      $('#season-source').value = 'topic';
    } else {
      $('#season-source').value = 'imported';
      $('#season-dataset').value = opened.id;
    }
  }
}

function contextHtml(d) {
  const wiki = d.provider === WIKIPEDIA_PROVIDER;
  return (
    '<div class="season-context-top"><div><span class="season-context-label">Analyzing topic</span><h2>' +
    esc(d.query) +
    '</h2></div><span class="season-data-tag">' +
    esc(d.kind === 'history' ? seriesLabel(d).toUpperCase() : 'YOUR CSV VALUES') +
    '</span></div><div class="season-context-meta"><span><strong>History:</strong> ' +
    esc(datesText(d)) +
    '</span><span><strong>' +
    (wiki ? 'Market:' : 'Value unit:') +
    '</strong> ' +
    esc(wiki ? countryName(d.country) : d.unit) +
    '</span></div><p>' +
    esc(
      d.kind === 'history'
        ? historyDescription(d)
        : 'Calculated from the values in your CSV. ScopeFlux has not verified their source.',
    ) +
    '</p>'
  );
}

// Year × month table; each year's average month is 100.
function yearGridHtml(d, data) {
  let html =
    '<div class="year-grid"><span>Year</span>' + MONTHS.map(m => '<span>' + m + '</span>').join('');
  for (const year of data.yearLabels) {
    const monthly = MONTHS.map((_, m) =>
      mean(
        d.records
          .filter(r => r.date.startsWith(year + '-' + String(m + 1).padStart(2, '0')))
          .map(r => r.value),
      ),
    );
    const avg = mean(monthly);
    html +=
      '<span>' +
      year +
      '</span>' +
      monthly
        .map(
          v =>
            '<div class="month-cell" style="background:rgba(255,46,99,' +
            Math.max(0.08, Math.min(0.9, (v / avg) * 0.5)) +
            ')" title="Monthly index ' +
            fmt((v / avg) * 100) +
            '; 100 is this year’s average month">' +
            fmt((v / avg) * 100, 0) +
            '</div>',
        )
        .join('');
  }
  return html + '</div>';
}

function resultsHtml(d, data) {
  const profileMax = Math.max(...data.months.map(m => m.index));
  const repeatability =
    data.strength === 0
      ? 'No clear pattern'
      : data.strength >= 80
        ? 'Very similar'
        : data.strength >= 50
          ? 'Some variation'
          : 'Weak pattern';
  const hasPeak =
    Math.max(...data.months.map(m => m.index)) - Math.min(...data.months.map(m => m.index)) > 1e-8;
  return (
    '<div class="metrics season-metrics"><article class="metric"><div class="metric-label">Strongest month</div><div class="metric-value"><strong>' +
    (hasPeak ? MONTHS[data.peak.month] : 'No peak') +
    '</strong></div><small>Highest monthly average in the years analyzed</small></article><article class="metric"><div class="metric-label">Peak vs. yearly average</div><div class="metric-value"><strong>+' +
    fmt(data.peak.index - 100, 0) +
    '%</strong></div><small>Index ' +
    fmt(data.peak.index, 0) +
    ' · 100 means an average month</small></article><article class="metric season-pattern"><div class="metric-label">Year-to-year pattern</div><div class="metric-value"><strong>' +
    repeatability +
    '</strong></div><small>' +
    fmt(data.strength, 0) +
    '% consistency score · not prediction accuracy</small></article><article class="metric"><div class="metric-label">Years analyzed</div><div class="metric-value"><strong>' +
    data.years +
    '</strong></div><small>' +
    data.yearLabels.join(', ') +
    ' · all 12 months represented</small></article></div>' +
    '<article class="panel"><div class="panel-heading"><div><h3>Which months are above average?</h3><p>100 is an average month. Taller bars show months with stronger values in this history.</p></div></div><div class="season-bars" role="img" aria-label="Monthly seasonal profile; 100 is an average month: ' +
    esc(data.months.map(m => MONTHS[m.month] + ' ' + fmt(m.index, 0)).join(', ')) +
    '">' +
    data.months
      .map(
        m =>
          '<div class="season-month"><div class="season-bar ' +
          (m.month === data.peak.month ? 'peak' : '') +
          '" style="height:' +
          (m.index / profileMax) * 160 +
          'px"><span>' +
          fmt(m.index, 0) +
          '</span></div><small>' +
          MONTHS[m.month] +
          '</small></div>',
      )
      .join('') +
    '</div><p class="season-method">For example, 148 means 48% above that year’s average month. This describes the supplied history; it does not predict next year’s demand.</p></article>' +
    '<article class="panel season-year-panel"><div class="panel-heading"><div><h3>Compare the pattern across years</h3><p>Each row uses its own yearly average of 100. Darker cells mean stronger months.</p></div></div><div class="heatmap-scroll">' +
    yearGridHtml(d, data) +
    '</div></article><details class="season-explanation"><summary>How are these results calculated?</summary><div><p>We average the observations in each month, then set each year’s average month to 100. The monthly chart averages those indices across the ' +
    data.years +
    ' years shown above.</p><p>The consistency score compares the shared monthly pattern with variation between years. It measures similarity in this history, not the chance that a future prediction will be correct. A flat series scores 0 because there is no seasonal pattern to compare.</p><p>Only calendar years with at least one observation in every month and a positive yearly average are used. Partial years are excluded, so the number of years analyzed can be smaller than the selected date range.</p></div></details>'
  );
}

export function renderSeasonality() {
  report = null;
  $('#export-seasonality').disabled = true;
  const topic = topicMode(),
    list = storedChoices();
  const d = topic ? topicSeries : list.find(x => x.id === $('#season-dataset').value);
  $('#season-topic-form').hidden = !topic;
  $('#season-topic').required = topic;
  $('#season-import-controls').hidden = topic || !list.length;
  $('#season-form-error').hidden = true;
  $('#season-topic').removeAttribute('aria-invalid');
  $('#season-data-help').textContent = topic
    ? 'Daily Wikipedia article views for any topic. To analyze your own CSV, choose Loaded series & CSV data.'
    : list.length
      ? 'Choose a loaded series below. Calculations preserve its values.'
      : 'Import a CSV with dates and values. Your file stays in this browser.';
  if (topic) {
    const values = draft || {
      query: topicSeries?.searchedFor || topicSeries?.query || '',
      country: topicSeries?.country ?? '',
      period: topicSeries?.period === '1825' ? '1825' : '1095',
    };
    $('#season-topic').value = values.query;
    $('#season-country').value = values.country;
    $('#season-period').value = values.period;
  }
  $('#season-context').hidden = !d;
  if (!d) {
    $('#season-content').innerHTML = topic
      ? '<div class="empty-state"><h3>Look up a topic.</h3><p>Enter a topic above to see in which months its Wikipedia article is read most.</p></div>'
      : '<div class="empty-state"><h3>Import your first CSV.</h3><p>Add historical data with dates and values to calculate its seasonal pattern.</p><a href="#imports" class="search-button">Import CSV ↗</a></div>';
    return;
  }
  const data = seasonality(d.records);
  $('#season-context').innerHTML = contextHtml(d);
  if (!data.available) {
    $('#season-content').innerHTML =
      '<div class="empty-state"><h3>More history is needed.</h3><p>' +
      esc(data.reason) +
      '</p><p>' +
      (d.provider === WIKIPEDIA_PROVIDER
        ? 'Choose 3 or 5 years above, then select Analyze.'
        : 'Import a longer CSV with data in every month of at least two calendar years.') +
      '</p>' +
      (d.provider === WIKIPEDIA_PROVIDER
        ? ''
        : '<a href="#imports" class="outline-btn">Import a longer CSV ↗</a>') +
      '</div>';
    return;
  }
  report = d;
  $('#export-seasonality').disabled = false;
  $('#season-content').innerHTML = resultsHtml(d, data);
}

export function initSeasonality() {
  $('#season-country').innerHTML = marketOptionsHtml();
  onSeriesChange(refreshPicker);
  $('#season-source').addEventListener('change', renderSeasonality);
  $('#season-dataset').addEventListener('change', renderSeasonality);
  $('#season-topic-form').addEventListener('submit', async event => {
    event.preventDefault();
    if ($('#season-topic-form').hidden) return;
    const query = $('#season-topic').value.trim().replace(/\s+/g, ' ');
    if (!query || query.length > 100) {
      showFormError('Enter a topic between 1 and 100 characters.');
      return;
    }
    $('#season-submit').disabled = true;
    $('#season-submit').textContent = 'Loading…';
    const ok = await analyzeTopic(
      query,
      {
        country: $('#season-country').value,
        period: $('#season-period').value,
        onError: showFormError,
      },
      'seasonality',
    );
    $('#season-submit').disabled = false;
    $('#season-submit').textContent = 'Analyze ↗';
    if (ok) {
      renderSeasonality();
      $('#season-update-message').textContent =
        'Seasonality updated for ' + topicSeries.query + '.';
    }
  });
  $('#season-topic').addEventListener('input', () => {
    $('#season-form-error').hidden = true;
    $('#season-topic').removeAttribute('aria-invalid');
    rememberDraft();
  });
  $('#season-country').addEventListener('change', rememberDraft);
  $('#season-period').addEventListener('change', rememberDraft);
  $('#export-seasonality').addEventListener('click', () => {
    if (!report) {
      toast('Choose a series with at least two complete calendar years.');
      return;
    }
    download(exportSeasonality(report), 'scopeflux-seasonality-report.csv');
    toast('Seasonality exported: monthly profile and year-by-year averages.');
  });
  // Start from the series the Explorer has open, like the original page did.
  refreshPicker({ opened: currentSeries() });
}
