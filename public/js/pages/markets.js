// "Compare markets" page (#markets): one topic in several Wikipedia language
// editions. Each edition is its own series; only the recent change is compared.
import { summarize } from '../data/statistics.js';
import { fetchWikipediaSeries } from '../data/wikipedia-client.js';
import { WIKI_LANGUAGES, editionName } from '../data/wiki-languages.js';
import { $, $$, esc, pct, toast, countryName, periodName } from '../ui/dom.js';
import { sparkline } from '../ui/chart.js';
import { currentSeries } from './explorer.js';

// One market per language edition, so no two rows show the same numbers.
const MARKET_CHOICES = ['US', 'DE', 'FR', 'JP', 'SK', 'CZ', 'ES', 'IT', 'PL', 'BR'];
const MAX_MARKETS = 5;
let results = []; // [{ country, dataset } | { country, error }]
let resultsRequest = null;
let emptyMessage = 'Select at least two markets above to compare their recent change.';
let busy = false;

function formKey() {
  return JSON.stringify([
    $('#market-topic').value.trim(),
    $$('#market-options input:checked')
      .map(x => x.value)
      .sort(),
    $('#market-period').value,
  ]);
}

function invalidate(render = true) {
  if (resultsRequest !== null && resultsRequest !== formKey()) {
    results = [];
    resultsRequest = null;
    emptyMessage = 'Selection changed. Run Analyze markets to update the results.';
    if (render) renderMarkets();
  }
}

async function runMarkets() {
  const query = $('#market-topic').value.trim();
  if (!query || query.length > 100) throw new Error('Enter a topic between 1 and 100 characters.');
  const codes = $$('#market-options input:checked').map(x => x.value);
  if (codes.length < 2 || codes.length > MAX_MARKETS)
    throw new Error('Choose between two and ' + MAX_MARKETS + ' markets.');
  const request = formKey(),
    next = [];
  // One edition at a time. A failure in one edition does not hide the others.
  for (const [i, country] of codes.entries()) {
    $('#market-caption').textContent =
      'Loading ' +
      editionName(WIKI_LANGUAGES[country]) +
      ' · ' +
      (i + 1) +
      ' of ' +
      codes.length +
      '…';
    try {
      next.push({
        country,
        dataset: await fetchWikipediaSeries({ query, country, period: $('#market-period').value }),
      });
    } catch (error) {
      next.push({ country, error: error.message });
    }
  }
  results = next;
  resultsRequest = request;
  renderMarkets();
  toast('Market comparison ready · Wikipedia article views per edition.');
}

function marketLabel(country) {
  return editionName(WIKI_LANGUAGES[country]) + ' (' + countryName(country) + ')';
}

export function renderMarkets() {
  invalidate(false);
  if (!results.length) {
    $('#market-caption').textContent = emptyMessage;
    $('#market-results').innerHTML = '<p class="market-detail">' + esc(emptyMessage) + '</p>';
    return;
  }
  const rows = results
    .map(r => ({ ...r, stats: r.dataset ? summarize(r.dataset.records) : null }))
    .sort((a, b) => (b.stats?.change ?? -Infinity) - (a.stats?.change ?? -Infinity));
  const max = Math.max(1, ...rows.map(r => Math.abs(r.stats?.change ?? 0)));
  $('#market-caption').textContent =
    $('#market-topic').value.trim() +
    ' · ' +
    periodName($('#market-period').value) +
    ' · Wikipedia article views per day, each edition on its own scale';
  $('#market-results').innerHTML =
    rows
      .map(r =>
        r.error
          ? '<div class="market-row"><span>' +
            esc(marketLabel(r.country)) +
            '</span><p class="market-detail">Not available: ' +
            esc(r.error) +
            '</p></div>'
          : '<div class="market-row"><span>' +
            esc(marketLabel(r.country)) +
            ' · ' +
            esc(r.dataset.query) +
            '</span><div class="market-track"><span class="' +
            (r.stats.change < 0 ? 'negative' : '') +
            '" style="width:' +
            (Math.abs(r.stats.change ?? 0) / max) * 100 +
            '%"></span></div><strong class="' +
            (r.stats.change < 0 ? 'negative' : 'positive') +
            '">' +
            pct(r.stats.change) +
            '</strong>' +
            sparkline(r.dataset.records) +
            '</div>',
      )
      .join('') +
    '<p class="market-detail">Bar length shows the size of the recent change (latest observations vs. the ones before). A language edition is only a rough stand-in for a country, and the matching article can differ between languages. This does not measure search volume, demand or market size.</p>';
}

export function initMarkets() {
  $('#market-options').innerHTML = MARKET_CHOICES.map(
    (code, i) =>
      '<label><input type="checkbox" value="' +
      code +
      '" ' +
      (i < 2 ? 'checked' : '') +
      '>' +
      esc(marketLabel(code)) +
      '</label>',
  ).join('');
  $('#markets-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    $('#market-error').hidden = true;
    busy = true;
    $('#market-submit').disabled = true;
    try {
      await runMarkets();
    } catch (error) {
      $('#market-error').textContent = error.message;
      $('#market-error').hidden = false;
      renderMarkets();
    } finally {
      busy = false;
      $('#market-submit').disabled = false;
    }
  });
  for (const type of ['input', 'change'])
    $('#markets-form').addEventListener(type, () => {
      $('#market-error').hidden = true;
      invalidate();
    });
  // "Compare across languages" link on the Explorer page pre-fills the topic.
  $('#explorer-market-link').addEventListener('click', () => {
    const d = currentSeries();
    if (d) $('#market-topic').value = d.searchedFor || d.query;
    invalidate();
  });
}
