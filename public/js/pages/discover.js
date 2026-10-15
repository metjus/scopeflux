// "Discover trends" (#discover): topics rising on several sources at once,
// read from the newest stored snapshot (GET /api/discover). No numbers are made
// here: every figure comes from one named source in the snapshot.
import {
  SOURCE_ORDER,
  SOURCE_INFO,
  sourceName,
  DISCOVER_MARKETS,
  marketName,
} from '../data/sources-info.js';
import { csvCell } from '../data/countries.js';
import { $, $$, esc, toast, download } from '../ui/dom.js';
import { isTrendSaved, toggleTrendTopic } from '../state.js';

const PAGE_SIZE = 20;
const MARKET_KEY = 'scopeflux-discover-market'; // remembered per browser
const GROUP_TEXT = {
  4: 'moving almost everywhere',
  3: 'spreading across the web',
  2: 'starting to spread',
};

let tab = 'rising';
let market = rememberedMarket();
let limit = PAGE_SIZE;
let data = null; // { snapshot, updating } for `market`
let loadVersion = 0;

function rememberedMarket() {
  try {
    const saved = localStorage.getItem(MARKET_KEY);
    return DISCOVER_MARKETS.some(m => m[0] === saved) ? saved : 'WW';
  } catch {
    return 'WW';
  }
}

export function topicHref(topic, marketCode = market) {
  return (
    '#topic?key=' +
    encodeURIComponent(topic.key) +
    '&market=' +
    marketCode +
    (topic.key.startsWith('rss:') ? '&title=' + encodeURIComponent(topic.title) : '')
  );
}

const formatChange = pct =>
  pct === null || pct === undefined || !Number.isFinite(pct)
    ? null
    : (pct > 0 ? '+' : '') + Math.round(pct).toLocaleString('en') + '%';

const timeLabel = iso =>
  new Date(iso).toLocaleString('en', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

// ---- loading -------------------------------------------------------------

export async function loadDiscover({ force = false } = {}) {
  const version = ++loadVersion;
  $('#discover-results').setAttribute('aria-busy', 'true');
  $('#discover-results').innerHTML =
    '<div class="loading-rows" aria-label="Loading">' + '<span></span>'.repeat(6) + '</div>';
  $('#discover-more').hidden = true;
  try {
    const response = await fetch(
      '/api/discover?market=' + market,
      force ? { cache: 'reload' } : {},
    );
    const body = await response.json().catch(() => ({}));
    if (version !== loadVersion) return;
    if (!response.ok)
      throw Object.assign(new Error(body.error || 'Stored results could not be loaded.'), body);
    data = body;
  } catch (error) {
    if (version !== loadVersion) return;
    data = { error };
  }
  $('#discover-results').setAttribute('aria-busy', 'false');
  render();
}

// ---- rendering -----------------------------------------------------------

function render() {
  const snapshot = data?.snapshot;
  const rising = snapshot?.rising ?? [],
    early = snapshot?.early ?? [];
  $('#count-rising').textContent = snapshot ? rising.length : '';
  $('#count-early').textContent = snapshot ? early.length : '';
  $$('.tabs [data-tab]').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.tab === tab)),
  );
  $('#discover-intro').textContent =
    tab === 'early'
      ? 'Topics that have just started moving on a single source. Worth watching, not yet a trend.'
      : 'Topics rising on at least two sources at once, strongest agreement first. One source moving alone is usually noise — those live under Early signals.';
  $('#discover-export').disabled = !snapshot || !(tab === 'early' ? early : rising).length;
  $('#topbar-status').textContent = snapshot ? 'Updated ' + timeLabel(snapshot.builtAt) : '';
  renderSourceStatus(snapshot);
  renderNotices(snapshot);

  if (data?.error) return renderError(data.error);
  if (!snapshot) return renderWaiting();
  const list = tab === 'early' ? early : rising;
  $('#discover-match').textContent =
    list.length +
    (tab === 'early' ? ' early signals in ' : ' topics rising in ') +
    marketName(market);
  if (!list.length) return renderQuiet();
  $('#discover-results').innerHTML = tab === 'early' ? earlyTable(list) : risingTable(list);
  bindSaveButtons(list);
  const remaining = list.length - Math.min(limit, list.length);
  $('#discover-more').hidden = remaining <= 0;
  $('#discover-show-more').textContent = 'Show ' + Math.min(PAGE_SIZE, remaining) + ' more';
  $('#discover-shown').textContent =
    'Showing ' + Math.min(limit, list.length) + ' of ' + list.length;
}

function renderSourceStatus(snapshot) {
  const labels = {
    ok: 'responding',
    partial: 'partly responding',
    unavailable: 'not responding',
    'no-data': 'no data yet',
  };
  $('#discover-sources').innerHTML = SOURCE_ORDER.map(key => {
    const status = snapshot?.sources?.[key]?.status;
    const state = !snapshot
      ? 'waiting'
      : key === 'rss' && status === 'ok'
        ? 'today’s list'
        : labels[status] || 'unknown';
    const down = !snapshot || status === 'unavailable' || status === 'no-data';
    return (
      '<span><span class="dot ' +
      (down ? 'dot-down' : 'dot-' + key) +
      '" aria-hidden="true"></span><b>' +
      SOURCE_INFO[key].name +
      '</b><i>' +
      esc(state) +
      '</i></span>'
    );
  }).join('');
}

function renderNotices(snapshot) {
  const notes = [];
  if (snapshot) {
    for (const key of SOURCE_ORDER) {
      const status = snapshot.sources?.[key]?.status;
      if (status === 'unavailable')
        notes.push(
          warn(
            sourceName(key) + ' did not respond during the last update',
            'Agreement is counted out of the sources that answered. ' +
              sourceName(key) +
              ' is shown as not rising for every topic until the next update.',
          ),
        );
      else if (status === 'partial')
        notes.push(
          warn(
            sourceName(key) + ' answered only part of the time',
            'Some topics could not be checked on ' + sourceName(key) + ' in the last update.',
          ),
        );
    }
    const ageHours = (Date.now() - Date.parse(snapshot.builtAt)) / 3_600_000;
    if (ageHours > 36)
      notes.push(
        warn(
          'These results are ' + Math.round(ageHours / 24) + ' days old',
          'The daily update has not finished since ' +
            timeLabel(snapshot.builtAt) +
            '. Showing the last complete results.',
        ),
      );
  }
  if (data?.updating && snapshot)
    notes.push(
      '<p class="info-strip">A fresh update for this market is being built. These are the last complete results.</p>',
    );
  $('#discover-notice').innerHTML = notes.join('');
}

const warn = (title, text) =>
  '<div class="warn-strip" role="status"><div><strong>' +
  esc(title) +
  '</strong>' +
  esc(text) +
  '</div></div>';

function renderError(error) {
  const notConfigured = error.code === 'NOT_CONFIGURED';
  $('#discover-match').textContent = '';
  $('#discover-results').innerHTML =
    '<div class="state-card"><h3>' +
    (notConfigured ? 'Discover is not switched on yet' : 'Discover could not load') +
    '</h3><p>' +
    esc(
      notConfigured
        ? 'The database that stores daily results is not connected, so there is nothing to show. Nothing is filled in with guesses.'
        : (error.message || 'Something went wrong.') +
            ' Your saved topics and imported files still work.',
    ) +
    '</p>' +
    (notConfigured
      ? ''
      : '<button type="button" class="btn" id="discover-retry">Try again</button>') +
    '<a href="#explorer" class="text-btn">Look up one topic on Wikipedia instead</a></div>';
  $('#discover-retry')?.addEventListener('click', () => loadDiscover({ force: true }));
}

function renderWaiting() {
  $('#discover-match').textContent = '';
  $('#discover-results').innerHTML =
    '<div class="state-card"><h3>The first results for ' +
    esc(marketName(market)) +
    ' are still being collected</h3><p>Discover checks every candidate topic on four sources in small steps, so the first update of a market can take a few hours. Nothing is shown until real results exist.</p>' +
    '<a href="#radar" class="btn">See today’s Google RSS list meanwhile</a></div>';
}

function renderQuiet() {
  $('#discover-results').innerHTML =
    '<div class="state-card"><h3>' +
    (tab === 'early'
      ? 'No early signals in ' + esc(marketName(market)) + ' right now'
      : 'Nothing in ' + esc(marketName(market)) + ' is rising on two sources this week') +
    '</h3><p>' +
    (tab === 'early'
      ? 'No topic is moving on exactly one source in the last update.'
      : 'Small markets are often quiet. Check Early signals for what is starting to move, or choose Worldwide.') +
    '</p>' +
    (tab === 'early'
      ? ''
      : '<button type="button" class="btn" data-tab-link="early">Show early signals</button>') +
    '</div>';
  $('[data-tab-link]')?.addEventListener('click', () => switchTab('early'));
}

function sourceDots(topic) {
  return SOURCE_ORDER.map(
    key =>
      '<span class="dot ' +
      (topic.risingOn.includes(key) ? 'dot-' + key : 'dot-off') +
      '" title="' +
      SOURCE_INFO[key].name +
      (topic.risingOn.includes(key) ? ': rising' : ': not rising') +
      '"></span>',
  ).join('');
}

function sparkPath(values) {
  if (!values?.length) return '';
  const max = Math.max(...values),
    min = Math.min(...values);
  return values
    .map(
      (v, i) =>
        (i ? 'L' : 'M') +
        ((i / Math.max(values.length - 1, 1)) * 120).toFixed(1) +
        ' ' +
        (24 - ((v - min) / (max - min || 1)) * 21).toFixed(1),
    )
    .join(' ');
}

function saveButton(topic) {
  const on = isTrendSaved(topic.key);
  return (
    '<button type="button" class="save-toggle" data-save="' +
    esc(topic.key) +
    '" aria-pressed="' +
    on +
    '" aria-label="' +
    esc((on ? 'Remove ' : 'Save ') + topic.title) +
    '"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="' +
    (on ? 'M3 8.4l3.2 3.2L13 4.8' : 'M8 2.6v10.8M2.6 8h10.8') +
    '"/></svg></button>'
  );
}

// "Moved first on" only when the snapshot says it clearly moved first.
function leaderCell(topic) {
  if (!topic.leader) return '<span class="col-leader">—</span>';
  const label = topic.leaderIsFirst
    ? sourceName(topic.leader)
    : 'strongest: ' + sourceName(topic.leader);
  return (
    '<span class="col-leader"><span class="dot dot-' +
    topic.leader +
    '" aria-hidden="true"></span>' +
    esc(label) +
    '</span>'
  );
}

function changeCell(topic) {
  const change = formatChange(topic.changePct);
  return change
    ? '<span class="col-change" title="Last 7 days vs. the 7 before, on ' +
        esc(sourceName(topic.leader)) +
        ' (' +
        esc(SOURCE_INFO[topic.leader]?.unit ?? '') +
        ')">' +
        change +
        '</span>'
    : '<span class="col-change quiet">' + (topic.leader === 'rss' ? 'listed' : 'new') + '</span>';
}

function topicCell(topic) {
  return (
    '<span class="col-topic"><a href="' +
    esc(topicHref(topic)) +
    '">' +
    esc(topic.title) +
    '</a>' +
    (topic.article ? '' : '<small>No Wikipedia article matched</small>') +
    '</span>'
  );
}

function risingTable(list) {
  const shown = list.slice(0, limit);
  let html =
    '<div class="table-scroll"><div class="trend-table" role="table" aria-label="Rising topics"><div class="trend-head" role="row">' +
    '<span class="col-rank" role="columnheader">#</span><span class="col-topic" role="columnheader">Topic</span><span class="col-sources" role="columnheader">Sources</span><span class="col-leader" role="columnheader">Moved first on</span><span class="col-spark" role="columnheader">Last 7 days</span><span class="col-change" role="columnheader">7d change</span><span class="col-save" role="columnheader">Save</span></div>';
  let group = null;
  shown.forEach((topic, i) => {
    if (topic.sourcesRising !== group) {
      group = topic.sourcesRising;
      const total = list.filter(t => t.sourcesRising === group).length;
      html +=
        '<div class="group-head" role="row"><span class="agree-badge agree-' +
        Math.min(group, 4) +
        '">On ' +
        group +
        ' of 4 sources</span><span class="hint">' +
        (GROUP_TEXT[group] || '') +
        '</span><span class="count">' +
        total +
        (total === 1 ? ' topic' : ' topics') +
        '</span></div>';
    }
    html +=
      '<div class="trend-row" role="row"><span class="col-rank">' +
      String(i + 1).padStart(2, '0') +
      '</span>' +
      topicCell(topic) +
      '<span class="col-sources" aria-label="Rising on: ' +
      esc(topic.risingOn.map(sourceName).join(', ')) +
      '">' +
      sourceDots(topic) +
      '</span>' +
      leaderCell(topic) +
      '<span class="col-spark">' +
      (topic.spark
        ? '<svg viewBox="0 0 120 26" preserveAspectRatio="none" role="img" aria-label="Last 7 days on ' +
          esc(sourceName(topic.leader)) +
          '"><path d="' +
          sparkPath(topic.spark) +
          '"/></svg>'
        : '') +
      '</span>' +
      changeCell(topic) +
      '<span class="col-save">' +
      saveButton(topic) +
      '</span></div>';
  });
  return html + '</div></div>';
}

function earlyTable(list) {
  const shown = list.slice(0, limit);
  return (
    '<p class="early-intro">Moving on one source only. Most of these fade; the ones that do not usually reach Rising now within one or two weeks.</p>' +
    '<div class="table-scroll"><div class="trend-table" role="table" aria-label="Early signals"><div class="trend-head" role="row">' +
    '<span class="col-topic" role="columnheader">Topic</span><span class="col-leader" role="columnheader">Moving on</span><span class="col-spark" role="columnheader">Last 7 days</span><span class="col-change" role="columnheader">7d change</span><span class="col-save" role="columnheader">Save</span></div>' +
    shown
      .map(
        topic =>
          '<div class="trend-row" role="row">' +
          topicCell(topic) +
          '<span class="col-leader"><span class="dot dot-' +
          topic.leader +
          '" aria-hidden="true"></span>' +
          esc(sourceName(topic.leader)) +
          '</span><span class="col-spark">' +
          (topic.spark
            ? '<svg viewBox="0 0 120 26" preserveAspectRatio="none" aria-hidden="true"><path d="' +
              sparkPath(topic.spark) +
              '"/></svg>'
            : '') +
          '</span>' +
          changeCell(topic) +
          '<span class="col-save">' +
          saveButton(topic) +
          '</span></div>',
      )
      .join('') +
    '</div></div>'
  );
}

function bindSaveButtons(list) {
  $$('#discover-results [data-save]').forEach(button =>
    button.addEventListener('click', () => {
      const topic = list.find(t => t.key === button.dataset.save);
      const result = toggleTrendTopic({ key: topic.key, title: topic.title, market });
      if (result === null) return toast('You can save up to 50 topics in this browser.');
      toast(result ? topic.title + ' saved' : topic.title + ' removed from saved topics');
      render();
    }),
  );
}

// ---- export ----------------------------------------------------------------

function exportView() {
  const snapshot = data?.snapshot;
  if (!snapshot) return;
  const list = tab === 'early' ? snapshot.early : snapshot.rising;
  const header = [
    'topic',
    'wikipedia_article',
    'market',
    'sources_rising',
    'rising_on',
    'change_source',
    'moved_first',
    'change_percent',
    'change_unit',
    'window_end',
    'built_at',
  ];
  const rows = list.map(t => [
    t.title,
    t.article ? t.lang + '.wikipedia.org/wiki/' + t.article : '',
    snapshot.marketName,
    t.sourcesRising,
    t.risingOn.map(sourceName).join('; '),
    sourceName(t.leader),
    t.leaderIsFirst ? 'yes' : 'no',
    t.changePct === null ? '' : Math.round(t.changePct * 10) / 10,
    SOURCE_INFO[t.leader]?.unit ?? '',
    snapshot.windowEnd,
    snapshot.builtAt,
  ]);
  download(
    '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n'),
    'scopeflux-discover-' + market.toLowerCase() + '-' + tab + '-' + snapshot.windowEnd + '.csv',
  );
  toast('Exported ' + rows.length + ' rows with their sources.');
}

// ---- wiring ----------------------------------------------------------------

function switchTab(next) {
  tab = next;
  limit = PAGE_SIZE;
  render();
}

export function initDiscover() {
  $('#discover-market').innerHTML = DISCOVER_MARKETS.map(
    ([code, name]) => '<option value="' + code + '">' + esc(name) + '</option>',
  ).join('');
  $('#discover-market').value = market;
  $('#discover-market').addEventListener('change', () => {
    market = $('#discover-market').value;
    limit = PAGE_SIZE;
    try {
      localStorage.setItem(MARKET_KEY, market);
    } catch {
      /* remembering the market is only a convenience */
    }
    loadDiscover();
  });
  $$('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#discover-show-more').addEventListener('click', () => {
    limit += PAGE_SIZE;
    render();
  });
  $('#discover-refresh').addEventListener('click', () => loadDiscover({ force: true }));
  $('#discover-export').addEventListener('click', exportView);
}

export const discoverMarket = () => market;

// Re-render (e.g. after saving on another page) without fetching again.
export function showDiscover() {
  if (!data) loadDiscover();
  else render();
}
