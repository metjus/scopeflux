// Topic page (#topic?key=en:Godot&market=US): one chart with each source as its
// own line, indexed to that source's own peak (100 = its busiest day in the
// window). Hover shows the raw value and unit per source. Data: GET /api/topic.
import { SOURCE_INFO, sourceName, marketName } from '../data/sources-info.js';
import { csvCell } from '../data/countries.js';
import { $, $$, esc, toast, download } from '../ui/dom.js';
import { isTrendSaved, toggleTrendTopic } from '../state.js';

const LINES = ['wikipedia', 'hackernews', 'gdelt']; // RSS is a list, never a line
const W = 1000,
  H = 320,
  TOP = 12,
  BOTTOM = 300;

let params = null; // { key?, q?, market, title? }
let days = 90;
let data = null;
let hidden = new Set(); // sources switched off in the legend
let hoverIndex = null;
let loadVersion = 0;

const fmtNumber = v => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('en'));
const dayLabel = date =>
  new Date(date + 'T00:00:00Z').toLocaleDateString('en', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
const sum = values => values.reduce((t, v) => t + v, 0);

// ---- loading ---------------------------------------------------------------

export function openTopic(hashQuery) {
  const query = new URLSearchParams(hashQuery);
  const next = {
    key: query.get('key') || '',
    q: query.get('q') || '',
    title: query.get('title') || '',
    market: query.get('market') || 'WW',
  };
  if (JSON.stringify(next) === JSON.stringify(params) && data) return render();
  params = next;
  hidden = new Set();
  load();
}

async function load() {
  const version = ++loadVersion;
  data = null;
  hoverIndex = null;
  $('#topic-title').textContent = params.title || params.q || titleFromKey(params.key) || 'Topic';
  $('#topic-summary').textContent = 'Asking each source…';
  $('#topic-notices').innerHTML = '';
  $('#topic-chart').innerHTML = '<div class="loading-rows">' + '<span></span>'.repeat(8) + '</div>';
  $('#topic-legend').innerHTML = '';
  $('#topic-axis').innerHTML = '';
  $('#topic-rss-note').textContent = '';
  $('#topic-table tbody').innerHTML = '';
  $('#topic-save').disabled = true;
  $('#topic-export').disabled = true;
  const query = new URLSearchParams({ market: params.market, days: String(days) });
  if (params.key) query.set('key', params.key);
  else query.set('q', params.q);
  if (params.title) query.set('title', params.title);
  try {
    const response = await fetch('/api/topic?' + query);
    const body = await response.json().catch(() => ({}));
    if (version !== loadVersion) return;
    if (!response.ok) throw new Error(body.error || 'This topic could not be loaded.');
    data = body;
    // A search (?q=) becomes a stable link to the matched topic.
    if (!params.key && body.key) {
      params.key = body.key;
      history.replaceState(null, '', topicLink(body.key, params.market, body.title));
    }
    render();
  } catch (error) {
    if (version !== loadVersion) return;
    $('#topic-summary').textContent = '';
    $('#topic-chart').innerHTML =
      '<div class="state-card"><h3>Could not load this topic</h3><p>' +
      esc(error.message) +
      '</p><button type="button" class="btn" id="topic-retry">Try again</button></div>';
    $('#topic-retry').addEventListener('click', load);
  }
}

const titleFromKey = key =>
  key.includes(':')
    ? decodeURIComponent(key.split(':').slice(1).join(':')).replaceAll('_', ' ')
    : '';

export function topicLink(key, market, title) {
  return (
    '#topic?key=' +
    encodeURIComponent(key) +
    '&market=' +
    market +
    (key.startsWith('rss:') && title ? '&title=' + encodeURIComponent(title) : '')
  );
}

// ---- rendering ---------------------------------------------------------------

function available() {
  return LINES.filter(key => data.sources[key]?.status === 'ok');
}

function render() {
  if (!data) return;
  document.title = data.title + ' — ScopeFlux';
  $('#topic-title').textContent = data.title;
  $('#topic-summary').textContent = summaryText();
  $$('.segmented [data-days]').forEach(b =>
    b.setAttribute('aria-pressed', String(Number(b.dataset.days) === days)),
  );
  renderSave();
  renderNotices();
  renderLegend();
  renderChart();
  renderRssNote();
  renderTable();
  $('#topic-footnote').innerHTML = footnote();
  $('#topic-export').disabled = !available().length;
}

function summaryText() {
  const parts = [];
  if (data.article)
    parts.push(
      'Wikipedia article “' + data.article.replaceAll('_', ' ') + '” (' + data.lang + ' edition)',
    );
  parts.push('Hacker News stories and news articles that mention “' + data.searchText + '”');
  return (
    parts.join(', ') +
    '. Market: ' +
    marketName(data.market) +
    '. Last ' +
    data.days +
    ' complete days, fetched ' +
    new Date(data.fetchedAt).toLocaleString('en', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }) +
    '.'
  );
}

function renderSave() {
  const on = isTrendSaved(data.key);
  $('#topic-save').disabled = false;
  $('#topic-save').textContent = on ? 'Saved' : 'Save topic';
  $('#topic-save').classList.toggle('btn-primary', on);
  $('#topic-save').setAttribute('aria-pressed', String(on));
}

function renderNotices() {
  const notes = [];
  if (data.sources.wikipedia?.status === 'no-article')
    notes.push(
      '<div class="state-card"><h3>No Wikipedia article matches “' +
        esc(data.title) +
        '”</h3><p>There is no view history to draw for it. Hacker News and the news were still searched below.</p></div>',
    );
  for (const key of LINES) {
    const source = data.sources[key];
    if (source?.status === 'unavailable')
      notes.push(
        '<div class="warn-strip" role="status"><div><strong>' +
          esc(sourceName(key)) +
          ' is not responding</strong>' +
          esc(source.message || '') +
          ' Its line is left out; nothing is filled in.</div></div>',
      );
  }
  $('#topic-notices').innerHTML = notes.join('');
}

function renderLegend() {
  $('#topic-legend').innerHTML = LINES.map(key => {
    const status = data.sources[key]?.status;
    const ok = status === 'ok';
    const label = ok ? '' : status === 'unavailable' ? ' · not responding' : ' · no data';
    return (
      '<button type="button" data-source="' +
      key +
      '" aria-pressed="' +
      (ok && !hidden.has(key)) +
      '"' +
      (ok ? '' : ' disabled') +
      '><span class="dot dot-' +
      key +
      '" aria-hidden="true"></span>' +
      esc(sourceName(key) + label) +
      '</button>'
    );
  }).join('');
  $$('#topic-legend [data-source]').forEach(button =>
    button.addEventListener('click', () => {
      const key = button.dataset.source;
      const visible = available().filter(k => !hidden.has(k));
      if (!hidden.has(key) && visible.length === 1) return; // keep at least one line
      hidden.has(key) ? hidden.delete(key) : hidden.add(key);
      renderLegend();
      renderChart();
    }),
  );
}

// Dates of the window (taken from the first available source).
const windowDates = () => data.sources[available()[0]]?.series.map(p => p.date) ?? [];

function indexed(series) {
  const peak = Math.max(0, ...series.map(p => p.value ?? 0));
  return series.map(p => (p.value === null ? null : peak > 0 ? (p.value / peak) * 100 : 0));
}

const x = (i, n) => (n <= 1 ? 0 : (i / (n - 1)) * W);
const y = v => BOTTOM - (v / 100) * (BOTTOM - TOP);

function renderChart() {
  const lines = available().filter(k => !hidden.has(k));
  const dates = windowDates();
  if (!lines.length || !dates.length) {
    $('#topic-chart').innerHTML =
      '<div class="state-card"><h3>No source returned a series for this topic</h3><p>See the notes above. Nothing is drawn rather than guessed.</p></div>';
    $('#topic-axis').innerHTML = '';
    return;
  }
  let svg =
    '<svg viewBox="0 0 ' +
    W +
    ' ' +
    H +
    '" preserveAspectRatio="none" role="img" aria-label="' +
    esc(chartLabel(lines)) +
    '">';
  for (const v of [100, 75, 50, 25, 0])
    svg +=
      '<line x1="0" x2="' +
      W +
      '" y1="' +
      y(v) +
      '" y2="' +
      y(v) +
      '" stroke="' +
      (v === 0 ? '#2E2838' : '#231E2C') +
      '" stroke-width="1" vector-effect="non-scaling-stroke"/>';
  for (const key of lines) {
    const values = indexed(data.sources[key].series);
    let path = '',
      pen = false;
    values.forEach((v, i) => {
      if (v === null) return (pen = false);
      path += (pen ? 'L' : 'M') + x(i, values.length).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
      pen = true;
    });
    svg +=
      '<path d="' +
      path +
      '" fill="none" stroke="' +
      SOURCE_INFO[key].color +
      '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
  }
  svg += '</svg>';
  $('#topic-chart').innerHTML =
    svg +
    '<div class="hover-layer" tabindex="0" aria-label="Chart values. Use the left and right arrow keys to move between days."></div><div id="topic-hover"></div>';
  const layer = $('#topic-chart .hover-layer');
  const pick = clientX => {
    const rect = layer.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (dates.length - 1)));
  };
  layer.addEventListener('pointermove', e => pick(e.clientX));
  layer.addEventListener('pointerdown', e => pick(e.clientX));
  layer.addEventListener('pointerleave', e => {
    if (e.pointerType === 'mouse') setHover(null);
  });
  layer.addEventListener('blur', () => setHover(null));
  layer.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const last = dates.length - 1;
    const current = hoverIndex ?? last;
    setHover(
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? last
          : Math.min(last, Math.max(0, current + (e.key === 'ArrowLeft' ? -1 : 1))),
    );
  });
  const mid = Math.round((dates.length - 1) / 2);
  $('#topic-axis').innerHTML =
    '<span>' +
    dayLabel(dates[0]) +
    '</span><span>' +
    dayLabel(dates[mid]) +
    '</span><span>' +
    dayLabel(dates.at(-1)) +
    '</span>';
  if (hoverIndex !== null) setHover(hoverIndex);
}

function chartLabel(lines) {
  return (
    data.title +
    ' over the last ' +
    data.days +
    ' days on ' +
    lines.map(sourceName).join(', ') +
    ', each indexed to its own peak. Exact values are in the table below.'
  );
}

// Crosshair, a dot per line and a readout with raw values and units.
function setHover(index) {
  hoverIndex = index;
  const box = $('#topic-hover');
  if (!box) return;
  if (index === null) return (box.innerHTML = '');
  const lines = available().filter(k => !hidden.has(k));
  const dates = windowDates();
  const left = (index / Math.max(dates.length - 1, 1)) * 100;
  let html = '<div class="crosshair" style="left:' + left.toFixed(2) + '%"></div>';
  const rows = [];
  for (const key of lines) {
    const point = data.sources[key].series[index];
    const value = indexed(data.sources[key].series)[index];
    if (value !== null)
      html +=
        '<div class="hover-dot" style="left:' +
        left.toFixed(2) +
        '%;top:' +
        ((y(value) / H) * 100).toFixed(2) +
        '%;background:' +
        SOURCE_INFO[key].color +
        '"></div>';
    rows.push(
      '<div class="tip-row"><span class="dot dot-' +
        key +
        '"></span><span>' +
        sourceName(key) +
        '</span><strong>' +
        (point?.value === null || point === undefined ? 'unknown' : fmtNumber(point.value)) +
        '</strong></div><p class="tip-unit">' +
        esc(data.sources[key].unit) +
        '</p>',
    );
  }
  const flip = left > 58;
  html +=
    '<div class="chart-tooltip" style="left:' +
    left.toFixed(2) +
    '%;transform:translateX(' +
    (flip ? 'calc(-100% - 14px)' : '14px') +
    ')"><h3>' +
    dayLabel(dates[index]) +
    '</h3>' +
    rows.join('') +
    '<p class="tip-foot">Raw daily values · fetched ' +
    new Date(data.fetchedAt).toLocaleString('en', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }) +
    '</p></div>';
  box.innerHTML = html;
}

function renderRssNote() {
  const rss = data.rss;
  let text;
  if (rss.status !== 'ok')
    text = 'Google Trends RSS: ScopeFlux’s own records could not be read right now.';
  else if (!rss.recordedSince)
    text = 'Google Trends RSS: ScopeFlux has not recorded the daily list yet.';
  else if (rss.listedDates.length)
    text =
      'Google Trends RSS listed this topic in ' +
      marketName(data.market) +
      ' on ' +
      rss.listedDates.length +
      ' of the recorded days (' +
      rss.listedDates.slice(-5).map(dayLabel).join(', ') +
      '). It is a daily list, not a curve, so it is not drawn.';
  else
    text =
      'Google Trends RSS has not listed this topic in ' +
      marketName(data.market) +
      ' since ScopeFlux started recording it on ' +
      dayLabel(rss.recordedSince) +
      '.';
  $('#topic-rss-note').textContent = text;
}

function renderTable() {
  const statusCell = source =>
    source.status === 'ok'
      ? '<span class="status-ok">Responding</span>'
      : source.status === 'unavailable'
        ? '<span class="status-down">Not responding</span>'
        : '<span class="status-missing">' +
          (source.status === 'no-article' ? 'No article' : 'No data') +
          '</span>';
  $('#topic-table tbody').innerHTML = LINES.map(key => {
    const source = data.sources[key];
    const unit = source.unit || SOURCE_INFO[key].unit;
    if (source.status !== 'ok')
      return (
        '<tr><td><span class="dot dot-' +
        key +
        '"></span> ' +
        sourceName(key) +
        '</td><td>' +
        esc(unit) +
        '</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td>' +
        statusCell(source) +
        '</td></tr>'
      );
    const values = source.series.map(p => p.value);
    const last = values.slice(-7),
      prev = values.slice(-14, -7);
    const complete = !last.concat(prev).some(v => v === null);
    const lastSum = complete ? sum(last) : null,
      prevSum = complete ? sum(prev) : null;
    const change = complete && prevSum > 0 ? ((lastSum / prevSum - 1) * 100).toFixed(0) : null;
    const known = source.series.filter(p => p.value !== null);
    const busiest = known.reduce((best, p) => (best && best.value >= p.value ? best : p), null);
    return (
      '<tr><td><span class="dot dot-' +
      key +
      '"></span> ' +
      sourceName(key) +
      '</td><td>' +
      esc(unit) +
      (source.note ? '<br><small>' + esc(source.note) + '</small>' : '') +
      '</td><td class="num">' +
      fmtNumber(lastSum) +
      '</td><td class="num">' +
      fmtNumber(prevSum) +
      '</td><td class="num ' +
      (change > 0 ? 'change-up' : 'change-down') +
      '">' +
      (change === null ? '—' : (change > 0 ? '+' : '') + change + '%') +
      '</td><td class="num">' +
      (busiest ? fmtNumber(busiest.value) + ' · ' + dayLabel(busiest.date) : '—') +
      '</td><td>' +
      statusCell(source) +
      '</td></tr>'
    );
  }).join('');
}

function footnote() {
  const wiki = data.article
    ? 'the <a href="https://' +
      esc(data.lang) +
      '.wikipedia.org/wiki/' +
      esc(encodeURIComponent(data.article)) +
      '" target="_blank" rel="noopener noreferrer">' +
      esc(data.article.replaceAll('_', ' ')) +
      '</a> article on Wikipedia, '
    : '';
  return (
    'Tracking ' +
    wiki +
    'Hacker News stories and GDELT news coverage that mention “' +
    esc(data.searchText) +
    '”. Name matching is imperfect. None of this is Google search volume. <a href="#sources">How each source is counted</a>'
  );
}

// ---- actions -------------------------------------------------------------------

function exportCsv() {
  const rows = [['date', 'source', 'value', 'unit', 'topic', 'market', 'fetched_at']];
  for (const key of available())
    for (const p of data.sources[key].series)
      rows.push([
        p.date,
        sourceName(key),
        p.value ?? '',
        data.sources[key].unit,
        data.title,
        marketName(data.market),
        data.fetchedAt,
      ]);
  download(
    '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'),
    'scopeflux-' +
      data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 40) +
      '-' +
      data.days +
      'd.csv',
  );
  toast('Exported raw daily values with their units.');
}

export function initTopic() {
  $$('.segmented [data-days]').forEach(button =>
    button.addEventListener('click', () => {
      const next = Number(button.dataset.days);
      if (next === days) return;
      days = next;
      load();
    }),
  );
  $('#topic-save').addEventListener('click', () => {
    if (!data) return;
    const result = toggleTrendTopic({ key: data.key, title: data.title, market: data.market });
    if (result === null) return toast('You can save up to 50 topics in this browser.');
    toast(result ? data.title + ' saved' : data.title + ' removed from saved topics');
    renderSave();
  });
  $('#topic-export').addEventListener('click', exportCsv);
}
