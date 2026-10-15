// "Sources & help" (#sources): what every source counts, its current status,
// and the exact thresholds from lib/config.mjs (served by GET /api/config).
import { SOURCE_ORDER, SOURCE_INFO } from '../data/sources-info.js';
import { $, $$, esc } from '../ui/dom.js';

let selected = 'wikipedia';
let config = null; // /api/config
let status = null; // sources block of the newest Worldwide snapshot
let loaded = false;

const STATUS = {
  ok: ['ok', 'Responding'],
  partial: ['partial', 'Partly responding'],
  unavailable: ['unavailable', 'Not responding'],
  'no-data': ['', 'No data yet'],
};

const METHODS = [
  [
    'Rising',
    'The last 7 complete days against the 7 days before, on one source, using the thresholds above. Today is never counted because it is not over yet.',
  ],
  ['Agreement', 'How many sources a topic is rising on. A count of sources, not a score.'],
  [
    'Change',
    'Last 7 days against the 7 before, on the source the topic moved first on. Never averaged across sources.',
  ],
  [
    'Moved first on',
    'The source whose 3-day average first crossed its own threshold in the last 7 days. When two sources crossed on the same day, the strongest one is shown instead, and it is labelled “strongest”, not “first”.',
  ],
  [
    'Indexed lines',
    'On topic pages each source is scaled so its busiest day in the window is 100. Shapes compare; units do not.',
  ],
  [
    'Missing data',
    'When a source does not answer, it is shown as unavailable. Missing days are left empty — never filled in.',
  ],
  [
    'Seasonality index',
    'Each month against its own year’s average, 100 = an ordinary month. Needs two complete calendar years.',
  ],
];

async function load() {
  loaded = true;
  const [configResult, discoverResult] = await Promise.allSettled([
    fetch('/api/config').then(r => (r.ok ? r.json() : null)),
    fetch('/api/discover?market=WW').then(r => (r.ok ? r.json() : null)),
  ]);
  config = configResult.status === 'fulfilled' ? configResult.value : null;
  const snapshot = discoverResult.status === 'fulfilled' ? discoverResult.value?.snapshot : null;
  status = snapshot?.sources ?? null;
  $('#sources-checked').textContent = snapshot
    ? 'Status from the last Worldwide update, ' +
      new Date(snapshot.builtAt).toLocaleString('en') +
      '.'
    : 'Source status appears after the first Discover update.';
  render();
}

function render() {
  $('#sources-table').innerHTML =
    '<div class="head"><span class="c-name">Source</span><span class="c-status">Status</span><span class="c-unit">Counts</span><span class="c-history">History</span><span class="c-refresh">Refreshed</span></div>' +
    SOURCE_ORDER.map(key => {
      const info = SOURCE_INFO[key];
      const [cls, label] = STATUS[status?.[key]?.status] || ['', 'Not checked yet'];
      return (
        '<button type="button" role="listitem" data-source="' +
        key +
        '" aria-pressed="' +
        (key === selected) +
        '"><span class="c-name"><span class="dot dot-' +
        key +
        '" aria-hidden="true"></span>' +
        esc(info.name) +
        '</span><span class="c-status"><span class="status-dot ' +
        cls +
        '" aria-hidden="true"></span>' +
        esc(label) +
        '</span><span class="c-unit">' +
        esc(info.unit) +
        '</span><span class="c-history">' +
        esc(info.history) +
        '</span><span class="c-refresh">' +
        esc(info.refresh) +
        '</span></button>'
      );
    }).join('');
  $$('#sources-table [data-source]').forEach(b =>
    b.addEventListener('click', () => {
      selected = b.dataset.source;
      render();
    }),
  );
  renderDetail();
  renderThresholds();
  $('#method-list').innerHTML = METHODS.map(
    ([term, text]) => '<div><dt>' + esc(term) + '</dt><dd>' + esc(text) + '</dd></div>',
  ).join('');
}

function renderDetail() {
  const info = SOURCE_INFO[selected];
  const facts = [
    ['Counts', info.unit],
    ['History', info.history],
    ['Regions', info.regions],
    ['Read from', info.docs],
  ];
  const down = status?.[selected]?.status === 'unavailable';
  $('#source-detail').innerHTML =
    '<div class="main"><div class="title"><span class="dot dot-' +
    selected +
    '" aria-hidden="true"></span><h2>' +
    esc(info.name) +
    '</h2><span>' +
    esc(info.role) +
    '</span></div><p class="what">' +
    esc(info.what) +
    '</p><div class="limit"><small>Where it falls short</small><p>' +
    esc(info.limit) +
    '</p></div></div><div class="facts">' +
    facts
      .map(
        ([label, value]) => '<div><small>' + esc(label) + '</small><p>' + esc(value) + '</p></div>',
      )
      .join('') +
    (down
      ? '<div class="warn-strip"><div>Did not respond during the last update. It counts as not rising until it answers again.</div></div>'
      : '') +
    '</div>';
}

function renderThresholds() {
  const body = $('#threshold-table tbody');
  if (!config) {
    body.innerHTML = '<tr><td colspan="3">The thresholds could not be loaded right now.</td></tr>';
    return;
  }
  const s = config.sources,
    w = config.windowDays;
  const times = r => '×' + r.toLocaleString('en');
  const rows = [
    [
      'wikipedia',
      'Average daily views over the last ' +
        w +
        ' days ≥ ' +
        times(s.wikipedia.ratio) +
        ' the ' +
        w +
        ' days before',
      '≥ ' +
        s.wikipedia.minPerDayEnglish +
        ' views/day on English Wikipedia, ≥ ' +
        s.wikipedia.minPerDayOther +
        ' on smaller editions',
    ],
    [
      'hackernews',
      'Stories in the last ' +
        w +
        ' days ≥ ' +
        times(s.hackernews.ratio) +
        ' the ' +
        w +
        ' days before',
      '≥ ' + s.hackernews.minLast7 + ' stories in the last ' + w + ' days',
    ],
    [
      'news',
      'Articles in the last ' + w + ' days ≥ ' + times(s.news.ratio) + ' the ' + w + ' days before',
      '≥ ' + s.news.minLast7 + ' articles in the last ' + w + ' days',
    ],
    [
      'rss',
      'Listed in the market’s daily feed on at least 1 of the last ' +
        s.rss.listedWithinDays +
        ' days',
      '—',
    ],
  ];
  body.innerHTML = rows
    .map(
      ([key, rule, minimum]) =>
        '<tr><td><span class="dot dot-' +
        key +
        '"></span> ' +
        esc(SOURCE_INFO[key].name) +
        '</td><td>' +
        esc(rule) +
        '</td><td>' +
        esc(minimum) +
        '</td></tr>',
    )
    .join('');
}

export function showSources() {
  if (!loaded) load();
  else render();
}
