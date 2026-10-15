// Start-up: wire every page, then show the page named in the URL hash.
// Each page lives in js/pages/; shared browser data lives in js/state.js.
// Pages: #discover (start), #topic?key=…&market=…, #explorer, #compare,
// #seasonality, #markets, #saved, #imports, #history, #sources, #plans, #radar.
import { $, $$, replaceIconPlaceholders } from './ui/dom.js';
import { initNavigation } from './ui/navigation.js';
import { restoreProblem, updateSavedCount } from './state.js';
import { initDiscover, showDiscover, discoverMarket } from './pages/discover.js';
import { initTopic, openTopic } from './pages/topic.js';
import { showSources } from './pages/sources.js';
import { initExplorer, renderResult } from './pages/explorer.js';
import {
  initCompare,
  refreshPicker as refreshComparePicker,
  renderComparison,
} from './pages/compare.js';
import { initMarkets, renderMarkets } from './pages/markets.js';
import { initSeasonality, renderSeasonality } from './pages/seasonality.js';
import { initSaved, renderWatchlist, renderTrendTopics } from './pages/saved.js';
import { initHistory, renderHistory } from './pages/history.js';
import { initImports, renderImports } from './pages/imports.js';
import { initRadar } from './pages/radar.js';

// Hash -> title shown in the browser tab. The sidebar link for #topic is Discover.
const PAGES = {
  discover: 'Discover trends',
  topic: 'Topic',
  explorer: 'CSV analytics',
  radar: 'Google Trends RSS list',
  compare: 'Compare topics',
  markets: 'Compare markets',
  seasonality: 'Seasonality',
  saved: 'Saved topics',
  imports: 'Import data',
  history: 'Recent analyses',
  plans: 'About ScopeFlux',
  sources: 'Sources & help',
};
const NAV_PARENT = { topic: 'discover', markets: 'explorer', history: 'explorer' };
const DEFAULT_PAGE = 'discover';
// Markets of the RSS list page; also accepted from its shared links.
const SHARED_MARKETS = ['US', 'SK', 'CZ', 'GB', 'DE', 'FR', 'JP', 'IN', 'BR', 'CA', 'AU'];

replaceIconPlaceholders();

const problem = restoreProblem();
if (problem) {
  $('#workspace-restore-status').hidden = false;
  $('#workspace-restore-status').textContent = problem;
}

// A shared RSS list link looks like /?market=SK&q=filter#radar
const sharedParams = new URLSearchParams(location.search);
if (SHARED_MARKETS.includes(sharedParams.get('market')))
  $('#radar-region').value = sharedParams.get('market');
$('#radar-filter').value = (sharedParams.get('q') || '').slice(0, 120);

initDiscover();
initTopic();
initExplorer();
initCompare();
initMarkets();
initSeasonality();
initSaved();
initHistory();
initImports();
const radar = initRadar({
  refreshWatchlist: () => {
    if (location.hash === '#saved') renderWatchlist();
  },
});

// Search box in the top bar: any text opens its topic page.
$('#topic-search').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('#q').value.trim().replace(/\s+/g, ' ');
  if (!text) return $('#q').focus();
  location.hash =
    'topic?q=' + encodeURIComponent(text.slice(0, 100)) + '&market=' + discoverMarket();
});

let routedPage = null;
function focusPageHeading() {
  const heading = $('#page-' + routedPage + ' h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

const navigation = initNavigation({
  // Ctrl/⌘+K jumps to the topic search.
  onSearchShortcut() {
    $('#q').focus();
    $('#q').select();
  },
  onNavigate(href) {
    if (href === location.hash) focusPageHeading();
  },
});

function route() {
  const [name, query = ''] = location.hash.slice(1).split('?');
  const page = Object.hasOwn(PAGES, name) ? name : DEFAULT_PAGE;
  $$('.page').forEach(el => (el.hidden = el.id !== 'page-' + page));
  const navPage = NAV_PARENT[page] || page;
  $$('[data-page]').forEach(a => {
    const active = a.dataset.page === navPage;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#breadcrumb').textContent = PAGES[page];
  document.title = PAGES[page] + ' — ScopeFlux';
  if (page !== 'discover') $('#topbar-status').textContent = '';
  navigation.close();
  const changed = routedPage !== null && routedPage !== page;
  routedPage = page;
  updateSavedCount();
  if (page === 'discover') showDiscover();
  if (page === 'topic') openTopic(query);
  if (page === 'sources') showSources();
  if (page === 'radar') radar.render();
  if (page === 'saved') {
    renderTrendTopics();
    radar.renderSaved();
    renderWatchlist();
  }
  if (page === 'history') renderHistory();
  if (page === 'compare') {
    refreshComparePicker();
    renderComparison();
  }
  if (page === 'markets') renderMarkets();
  if (page === 'seasonality') renderSeasonality();
  if (page === 'imports') renderImports();
  window.scrollTo(0, 0);
  if (changed) focusPageHeading();
}

$('#radar-region').addEventListener('change', () => radar.load());
$('#radar-refresh').addEventListener('click', () => radar.load());
$('#radar-filter').addEventListener('input', () => {
  if (radar.hasData()) radar.render();
});
$('#radar-sort').addEventListener('change', () => {
  if (radar.hasData()) radar.render();
});
window.addEventListener('hashchange', route);
renderResult();
route();
