// "Saved topics" page (#saved), series part: watchlist snapshots with optional
// threshold rules. (Saved RSS topics are rendered by pages/radar.js.)
import { summarize, evaluateRule } from '../data/statistics.js';
import { dataStatus } from '../data/exports.js';
import { csvCell } from '../data/countries.js';
import { $, $$, esc, fmt, pct, icon, toast, download, countryName } from '../ui/dom.js';
import { sparkline } from '../ui/chart.js';
import { workspace, persist, seriesLabel, updateSavedCount } from '../state.js';
import { openDataset } from './explorer.js';

const DEFAULT_RULE = { metric: 'change', direction: 'above', threshold: 20, enabled: false };

const option = (value, label, selected) =>
  '<option value="' + value + '" ' + (selected ? 'selected' : '') + '>' + label + '</option>';

function ruleFormHtml(index, rule) {
  return (
    '<form class="rule-form" data-rule="' +
    index +
    '"><label><input type="checkbox" name="enabled" ' +
    (rule.enabled ? 'checked' : '') +
    '>Enable rule</label><label>When <select name="metric">' +
    option('change', 'Recent change (%)', rule.metric === 'change') +
    option('acceleration', 'Acceleration (pp)', rule.metric === 'acceleration') +
    option('level', 'Latest value', rule.metric === 'level') +
    '</select></label><select name="direction" aria-label="Threshold direction">' +
    option('above', 'is above', rule.direction === 'above') +
    option('below', 'is below', rule.direction === 'below') +
    '</select><label class="sr-only" for="threshold-' +
    index +
    '">Threshold</label><input type="number" name="threshold" id="threshold-' +
    index +
    '" value="' +
    Number(rule.threshold) +
    '" step="any" required><button class="outline-btn" type="submit">Save rule </button></form>'
  );
}

function cardHtml(item, index) {
  const d = item.dataset,
    stats = summarize(d.records),
    rule = item.rule || DEFAULT_RULE,
    checked = item.evaluation;
  return (
    '<article class="watch-card"><div class="watch-card-top"><div><h3>' +
    esc(d.query) +
    '</h3><p>' +
    esc(
      d.kind === 'history'
        ? countryName(d.country) + ' · ' + seriesLabel(d) + ' snapshot'
        : 'Imported CSV snapshot',
    ) +
    ' · Last observation ' +
    d.records.at(-1).date +
    ' · Recent change ' +
    pct(stats.change) +
    '</p></div>' +
    sparkline(d.records) +
    '<div class="watch-actions"><button class="outline-btn" data-watch-open="' +
    index +
    '">Open snapshot ↗</button><button class="icon-btn" data-watch-remove="' +
    index +
    '" aria-label="Remove ' +
    esc(d.query) +
    '">×</button></div></div><details class="watch-rule-details"><summary>Advanced: evaluate a rule on this snapshot</summary>' +
    ruleFormHtml(index, rule) +
    '<p class="rule-status ' +
    (checked?.triggered ? 'triggered' : '') +
    '">' +
    (checked
      ? (checked.triggered ? 'Threshold met' : 'Threshold not met') +
        ' · Value ' +
        fmt(checked.value) +
        ' · Checked ' +
        new Date(checked.time).toLocaleString('en') +
        ' against stored data.'
      : 'Not evaluated · Rule checks this stored snapshot only.') +
    '</p></details></article>'
  );
}

export function renderWatchlist() {
  const { saved, liveTopics } = workspace;
  const enabled = saved.filter(x => x.rule?.enabled),
    triggered = enabled.filter(x => x.evaluation?.triggered);
  $('#watch-summary').innerHTML = [
    ['Tracked topics', saved.length + liveTopics.length],
    ['Enabled rules', enabled.length],
    ['Triggered on last check', triggered.length],
  ]
    .map(
      ([label, n]) => '<article><strong>' + n + '</strong><small>' + label + '</small></article>',
    )
    .join('');
  if (!saved.length) {
    $('#saved-list').innerHTML =
      '<div class="empty-state">' +
      icon('bookmark') +
      '<h3>A dashboard for your interests.</h3><p>Track a topic from CSV analytics to keep its snapshot and configure a rule.</p><a href="#explorer" class="search-button">Explore a topic ↗</a></div>';
    return;
  }
  $('#saved-list').innerHTML = saved.map(cardHtml).join('');
  $$('[data-watch-open]').forEach(b =>
    b.addEventListener('click', () => openDataset(saved[Number(b.dataset.watchOpen)].dataset)),
  );
  $$('[data-watch-remove]').forEach(b =>
    b.addEventListener('click', () => {
      saved.splice(Number(b.dataset.watchRemove), 1);
      persist();
      updateSavedCount();
      renderWatchlist();
    }),
  );
  $$('[data-rule]').forEach(form =>
    form.addEventListener('submit', event => {
      event.preventDefault();
      const fields = new FormData(form),
        threshold = Number(fields.get('threshold'));
      if (!Number.isFinite(threshold)) {
        toast('Use a finite numeric threshold.');
        return;
      }
      const item = saved[Number(form.dataset.rule)];
      item.rule = {
        enabled: fields.has('enabled'),
        metric: fields.get('metric'),
        direction: fields.get('direction'),
        threshold,
      };
      delete item.evaluation;
      persist();
      renderWatchlist();
      toast('Rule saved. Use Evaluate rules now to check it.');
    }),
  );
}

function evaluateWatchlist() {
  let count = 0;
  const time = Date.now();
  workspace.saved.forEach(item => {
    if (item.rule?.enabled) {
      item.evaluation = { ...evaluateRule(item.dataset, item.rule), time };
      count++;
    }
  });
  persist();
  renderWatchlist();
  toast(
    count
      ? 'Evaluated ' + count + ' rules against stored snapshots. No live refresh was performed.'
      : 'Enable and save a rule before evaluating.',
  );
}

function watchReport() {
  if (!workspace.saved.length) {
    toast('Add a series snapshot first. Radar observations export from the feed journal.');
    return;
  }
  const header = [
    'topic',
    'market',
    'data_status',
    'last_date',
    'latest_value',
    'recent_change_percent',
    'acceleration_pp',
    'volatility_percent',
    'rule_enabled',
    'rule_triggered',
    'last_evaluated',
    'source',
    'provider',
    'retrieved_at',
    'unit',
    'keyword_language',
    'provider_metric',
  ];
  const rows = workspace.saved.map(x => {
    const d = x.dataset,
      s = summarize(d.records);
    return [
      d.query,
      d.country || 'Worldwide',
      dataStatus(d),
      d.records.at(-1).date,
      s.latest,
      s.change ?? '',
      s.acceleration ?? '',
      s.volatility ?? '',
      Boolean(x.rule?.enabled),
      x.evaluation?.triggered ?? '',
      x.evaluation ? new Date(x.evaluation.time).toISOString() : '',
      d.source,
      d.provider || '',
      d.fetchedAt || '',
      d.unit || '',
      d.language || '',
      d.metric || '',
    ];
  });
  download(
    '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n'),
    'scopeflux-watchlist-report.csv',
  );
  toast('Watchlist report exported with data provenance.');
}

export function initSaved() {
  $('#evaluate-watchlist').addEventListener('click', evaluateWatchlist);
  $('#watch-report').addEventListener('click', watchReport);
}
