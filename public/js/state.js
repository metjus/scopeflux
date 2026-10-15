// Everything the visitor keeps in this browser (localStorage), in one object.
// Pages read and change `workspace`, then call persist() to save it.
import { restoreDatasetCollections, restoreHistory } from './data/workspace-data.js';
import { restoreChecks, restoreTopics } from './data/radar.js';
import { WIKIPEDIA_PROVIDER } from './data/wikipedia-client.js';
import { $, toast } from './ui/dom.js';

// The key predates the ScopeFlux name; changing it would lose visitors' data.
const STORAGE_KEY = 'trendscope-v1';
export const MAX_SAVED = 50;
export const MAX_IMPORTS = 5;
export const MAX_FETCHED = 10;

// '' = fine, 'unavailable' = storage blocked, 'invalid' = stored JSON was damaged.
let readProblem = '';
function readStorage() {
  let serialized;
  try {
    serialized = localStorage.getItem(STORAGE_KEY);
    if (serialized === null) return {};
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Invalid workspace');
    return parsed;
  } catch {
    readProblem = serialized === undefined ? 'unavailable' : 'invalid';
    // Keep damaged text so a later save does not overwrite it.
    return serialized === undefined ? {} : { unrestoredWorkspace: serialized };
  }
}

const raw = readStorage();
const restored = restoreDatasetCollections(raw);

export const workspace = {
  imports: restored.imports, // CSV series, newest first (max 5)
  fetchedSeries: restored.fetchedSeries, // Wikipedia series, newest first (max 10)
  saved: restored.saved, // watchlist snapshots: { ...meta, dataset, rule, evaluation }
  history: restoreHistory(raw.history), // "Recent analyses" entries
  radarChecks: restoreChecks(raw.radarChecks), // recorded RSS feed checks
  liveTopics: restoreTopics(raw.liveTopics).slice(
    0,
    Math.max(0, MAX_SAVED - restored.saved.length),
  ),
  trendTopics: restoreTrendTopics(raw.trendTopics), // topics saved from Discover
};

// Saved Discover topics: { key: 'en:Godot', title, market, savedAt }.
function restoreTrendTopics(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      t =>
        t &&
        typeof t.key === 'string' &&
        /^([a-z]{2,3}|rss):.{1,300}$/.test(t.key) &&
        typeof t.title === 'string' &&
        t.title.length <= 300 &&
        typeof t.market === 'string' &&
        /^[A-Z]{2}$/.test(t.market),
    )
    .slice(0, MAX_SAVED);
}

export const isTrendSaved = key => workspace.trendTopics.some(t => t.key === key);

// Save or unsave a Discover topic. Returns the new saved state, or null when full.
export function toggleTrendTopic({ key, title, market }) {
  if (isTrendSaved(key)) {
    workspace.trendTopics = workspace.trendTopics.filter(t => t.key !== key);
    persist();
    updateSavedCount();
    return false;
  }
  if (workspace.trendTopics.length >= MAX_SAVED) return null;
  workspace.trendTopics = [
    { key, title, market, savedAt: new Date().toISOString() },
    ...workspace.trendTopics,
  ];
  persist();
  updateSavedCount();
  return true;
}

// Message for the banner at the top of the page, or '' when everything loaded.
export function restoreProblem() {
  if (readProblem === 'unavailable')
    return 'Saved workspace data could not be read from this browser. New changes may be available for this session only.';
  if (readProblem || restored.rejectedCount)
    return 'Some stored workspace data could not be reopened. Usable series remain available, and the original entries are kept separately in this browser. Reimport any missing CSV series from the original file.';
  return '';
}

// Returns false (and tells the visitor) when the browser refuses to store data.
export function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...workspace,
        unrestoredSeries: restored.unrestoredSeries,
        unrestoredWorkspace: raw.unrestoredWorkspace,
      }),
    );
    $('#workspace-storage-status').hidden = true;
    return true;
  } catch {
    const message =
      'Browser storage is full or unavailable. Changes are available for this session only and may be lost when you close or reload this page.';
    $('#workspace-storage-status').textContent = message;
    $('#workspace-storage-status').hidden = false;
    toast(message);
    return false;
  }
}

// --- helpers about series ("datasets") -----------------------------------

export function seriesLabel(d) {
  if (d.kind === 'imported') return 'Imported CSV';
  return d.provider === WIKIPEDIA_PROVIDER ? 'Wikipedia pageviews' : 'Previously retrieved series';
}

// Short summary stored in "Recent analyses".
export function meta(d) {
  return {
    id: d.id,
    query: d.query,
    country: d.country,
    source: d.source,
    provider: d.provider,
    period: d.period,
    kind: d.kind,
    language: d.language,
    time: d.createdAt || Date.now(),
  };
}

export function remember(d) {
  workspace.history = [meta(d), ...workspace.history].slice(0, 50);
  persist();
}

// Keep a newly fetched Wikipedia series so it can be reopened later.
export function storeFetched(d) {
  workspace.fetchedSeries = [d, ...workspace.fetchedSeries.filter(x => x.id !== d.id)].slice(
    0,
    MAX_FETCHED,
  );
  remember(d);
}

// Identity used to decide whether a series is already on the watchlist.
export function keyOf(d) {
  return d.kind === 'imported'
    ? d.id
    : [d.kind, d.query.toLowerCase(), d.country, d.source, d.period, d.language || ''].join('|');
}

// Every series stored in this browser, without duplicates.
export function storedSeries(current = null) {
  const all = [
    ...(current ? [current] : []),
    ...workspace.fetchedSeries,
    ...workspace.imports,
    ...workspace.saved.map(x => x.dataset),
  ];
  return all.filter((d, i) => all.findIndex(x => x.id === d.id) === i);
}

export function updateSavedCount() {
  $('#saved-count').textContent =
    workspace.saved.length + workspace.liveTopics.length + workspace.trendTopics.length;
}

// Pages that list stored series (Explorer, Compare, Seasonality) register here
// and refresh their pickers when a series is added, removed or opened.
const seriesListeners = [];
export function onSeriesChange(listener) {
  seriesListeners.push(listener);
}
// detail.opened: the series the visitor just opened in Explorer, if any.
export function seriesChanged(detail = {}) {
  seriesListeners.forEach(listener => listener(detail));
}
