import { observation, recordCheck, feedChanges, topicKey, exploreTopicUrl, topicObservations, exportChecks, filterRadar, exportRadarView } from './radar.js';

const statusLabels = { baseline: 'First recorded check', new: 'New since comparison check', returning: 'Returned since comparison check', continuing: 'Present in both checks', 'not-listed': 'No longer listed' };
const timeText = value => value ? new Date(value).toLocaleString('en') : 'Not recorded';
function safeUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; } }

export function initRadar({ $, $$, esc, countryName, toast, pro, download, getChecks, setChecks, getTopics, setTopics, getPlan, getSeriesCount, updateBalance, refreshWatchlist }) {
  let data = null, version = 0, controller = null, loadingCountry = null, storageAvailable = true, clearPending = false, comparisonCountry = null, archived = false, visibleState = null;
  const tracked = (country, title) => getTopics().some(topic => topicKey(topic.country, topic.title) === topicKey(country, title));

  function toggleTopic(country, title) {
    const topics = getTopics(), key = topicKey(country, title), index = topics.findIndex(topic => topicKey(topic.country, topic.title) === key);
    let next;
    if (index >= 0) next = topics.filter((_, i) => i !== index);
    else {
      const limit = getPlan() === 'pro' ? 50 : 5;
      if (topics.length + getSeriesCount() >= limit) { toast('This tier supports ' + limit + ' saved topics and series. View plans to try more.'); location.hash = 'plans'; return; }
      next = [{ country, title, savedAt: new Date().toISOString() }, ...topics];
    }
    const persisted = setTopics(next);
    updateBalance();
    renderSaved();
    refreshWatchlist();
    if (data) render();
    if (persisted) toast(index >= 0 ? 'Radar topic removed.' : 'Radar topic saved in this browser. Checks update when you load its market.');
  }

  function bindTopicButtons() {
    $$('[data-live-save]').forEach(button => button.addEventListener('click', () => toggleTopic(button.dataset.market, button.dataset.liveSave)));
    $$('[data-live-import]').forEach(button => button.addEventListener('click', () => {
      $('#import-name').value = button.dataset.liveImport.slice(0, 120);
      $('#import-unit').value = 'Interest index'; location.hash = 'imports';
      toast('Export Interest over time as CSV from Google Trends, then import it here. RSS has no historical series.');
    }));
  }

  function renderJournal() {
    const countries = [...new Set(getChecks().map(check => check.country))].sort();
    const selected = $('#journal-market').value;
    $('#journal-market').innerHTML = '<option value="all">All recorded markets</option>' + countries.map(country => '<option value="' + country + '">' + esc(countryName(country)) + '</option>').join('');
    $('#journal-market').value = countries.includes(selected) ? selected : 'all';
    const visible = getChecks().filter(check => $('#journal-market').value === 'all' || check.country === $('#journal-market').value).toReversed();
    $('#radar-journal-list').innerHTML = visible.length ? visible.map(check => '<div class="journal-row"><strong>' + esc(countryName(check.country)) + '</strong><time datetime="' + check.fetchedAt + '">' + esc(timeText(check.fetchedAt)) + '</time><span>' + check.items.length + ' topics listed</span><button type="button" class="outline-btn" data-open-check="' + esc(check.country + '|' + check.fetchedAt) + '">Open snapshot ↗</button></div>').join('') : '<div class="journal-empty">No checks recorded. Open Radar to request your first feed.</div>';
    $$('[data-open-check]').forEach(button => button.addEventListener('click', () => openCheck(button.dataset.openCheck)));
    $('#export-radar-journal').disabled = !visible.length;
    $('#clear-radar-journal').disabled = !getChecks().length;
    $('#export-radar-journal .pro-label').hidden = getPlan() === 'pro';
  }

  function openCheck(key) {
    const check = getChecks().find(value => value.country + '|' + value.fetchedAt === key);
    if (!check) { toast('This check is no longer retained. Choose another snapshot.'); return; }
    controller?.abort(); version++; loadingCountry = null;
    data = observation(check); archived = true; comparisonCountry = null;
    const market = $('#radar-region'); market.value = check.country;
    if (market.value !== check.country) { market.innerHTML += '<option value="' + check.country + '">' + esc(countryName(check.country)) + '</option>'; market.value = check.country; }
    $('#radar-filter').value = ''; $('#radar-view').value = 'all'; $('#radar-compare').value = 'latest';
    $('#radar-refresh').disabled = false; $('#radar-grid').setAttribute('aria-busy','false');
    $('#radar-source').href = 'https://trends.google.com/trending/rss?geo=' + check.country;
    location.hash = 'radar'; render();
  }
  function resetView() {
    $('#radar-filter').value = ''; $('#radar-view').value = 'all'; $('#radar-sort').value = 'feed'; $('#radar-compare').value = 'latest';
    if (data) render();
  }

  function render() {
    renderJournal();
    if (!data || data.country !== $('#radar-region').value) { if (loadingCountry !== $('#radar-region').value) load(); return; }
    const earlier = getChecks().filter(check => check.country === data.country && Date.parse(check.fetchedAt) < Date.parse(data.fetchedAt));
    const requested = comparisonCountry === data.country ? $('#radar-compare').value : 'latest';
    const compareAt = earlier.some(check => check.fetchedAt === requested) ? requested : 'latest';
    comparisonCountry = data.country;
    $('#radar-compare').innerHTML = '<option value="latest">' + (earlier.length ? 'Previous check · ' + esc(timeText(earlier.at(-1).fetchedAt)) : 'Record another check to compare') + '</option>' + earlier.toReversed().map(check => '<option value="' + esc(check.fetchedAt) + '">' + esc(timeText(check.fetchedAt)) + ' · ' + check.items.length + ' topics</option>').join('');
    $('#radar-compare').value = compareAt; $('#radar-compare').disabled = !earlier.length;
    const changes = feedChanges(getChecks(), data, compareAt === 'latest' ? null : compareAt), selected = $('#radar-view').value;
    $('#radar-view-help').textContent = changes.previous ? 'Comparing recorded feeds for ' + countryName(data.country) + '. New topics were not seen in retained checks up to the selected check; returned topics were seen before it. Missing topics are absent from this feed, not necessarily no longer trending.' : 'This is your first recorded check for this market. Refresh later to compare changes. Saved topics can be filtered immediately; no historical search curve is created.';
    const settings = { view: selected, query: $('#radar-filter').value.trim(), sort: $('#radar-sort').value, archived };
    const items = filterRadar(changes, { ...settings, saved: getTopics() });
    visibleState = { changes, items, settings };
    $('#export-radar-view').disabled = !items.length; $('#export-radar-view .pro-label').hidden = getPlan() === 'pro';
    $('#radar-archive-note').hidden = !archived; $('#radar-archive-context').textContent = archived ? 'Saved snapshot · ' + countryName(data.country) + ' · Recorded ' + timeText(data.fetchedAt) + '. News links were not stored. Refresh live to retrieve a new feed.' : '';
    $('#radar-refresh').textContent = archived ? 'Refresh live ↻' : 'Refresh ↻';
    $('#radar-view-all').textContent = archived ? 'Selected snapshot' : 'Current feed';
    $('#radar-summary').innerHTML = [[archived ? 'Snapshot topics' : 'Current feed', changes.items.length, 'all'], ['New since comparison', changes.previous ? changes.counts.new : '—', 'new'], ['Returned since comparison', changes.previous ? changes.counts.returning : '—', 'returning'], ['No longer listed', changes.previous ? changes.counts.missing : '—', 'not-listed']].map(([label, value, view]) => '<button type="button" class="radar-summary-filter" data-radar-view="' + view + '" aria-pressed="' + (selected === view) + '" aria-controls="radar-grid" ' + (!changes.previous && view !== 'all' ? 'disabled' : '') + '><strong>' + value + '</strong><span>' + label + '</span></button>').join('');
    $$('[data-radar-view]').forEach(button => button.addEventListener('click', () => { $('#radar-view').value = button.dataset.radarView; render(); }));
    $('#radar-status').textContent = items.length + (archived ? ' matching topics · Saved snapshot · ' : ' matching topics · ') + countryName(data.country) + ' · Retrieved ' + timeText(data.fetchedAt) + (changes.previous ? ' · Compared with ' + timeText(changes.previous.fetchedAt) : '') + (storageAvailable ? '' : ' · Journal changes are session-only.');
    $('#radar-grid').innerHTML = items.length ? items.map(item => {
      const sourceItem = data.items.find(topic => topicKey(data.country, topic.title) === topicKey(data.country, item.title));
      const news = (sourceItem?.news ?? []).filter(article => typeof article.title === 'string' && safeUrl(article.url)).slice(0, 3);
      const isTracked = tracked(data.country, item.title);
      return '<article class="radar-card live-radar-card"><div class="radar-category"><span>' + esc(countryName(data.country).toUpperCase()) + '</span><span>GOOGLE RSS</span></div><span class="feed-status ' + item.status + '">' + statusLabels[item.status] + '</span><h3>' + esc(item.title) + '</h3><div class="radar-growth">' + esc(item.trafficBucket ?? 'Not supplied') + '</div><p>' + (item.status === 'not-listed' ? 'Bucket at the selected comparison check' : 'Traffic bucket supplied by Google') + '</p>' + (item.bucketChanged ? '<p class="bucket-change">Bucket changed: ' + esc(item.previousBucket) + ' → ' + esc(item.trafficBucket) + '. Exact traffic change is unknown.</p>' : '') + '<p class="radar-date">Feed publication · ' + esc(timeText(item.publishedAt)) + '</p><div class="radar-news">' + (news.length ? news.map(article => '<a href="' + esc(safeUrl(article.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(article.title) + '<small>' + esc(article.publisher ?? '') + ' ↗</small></a>').join('') : '<p>' + (item.status === 'not-listed' ? 'Absent from this selected RSS snapshot. This does not mean the trend ended.' : archived ? 'News links were not retained with this saved check.' : 'No news links supplied.') + '</p>') + '</div><div class="live-radar-actions"><button class="outline-btn ' + (isTracked ? 'topic-tracked' : '') + '" data-live-save="' + esc(item.title) + '" data-market="' + data.country + '" aria-pressed="' + isTracked + '">' + (isTracked ? 'Saved ✓' : 'Save topic +') + '</button><a class="outline-btn" href="' + esc(exploreTopicUrl(data.country, item.title)) + '" target="_blank" rel="noopener noreferrer">Google ↗</a>' + '<button class="outline-btn" data-live-import="' + esc(item.title) + '">Import CSV ↗</button>' + '</div></article>';
    }).join('') : '<div class="empty-state"><h3>' + (!changes.previous && !['all','saved'].includes(selected) ? 'Record another check to compare.' : 'No topics match this view.') + '</h3><p>' + (selected === 'saved' ? 'Save a topic from this market first, or clear the view filters.' : 'Clear the view filters or choose another market.') + '</p><button type="button" class="outline-btn" id="radar-empty-reset">Reset view ↻</button></div>';
    if (!items.length) $('#radar-empty-reset').addEventListener('click',resetView);
    bindTopicButtons();
  }

  async function load() {
    const requestVersion = ++version, country = $('#radar-region').value;
    controller?.abort(); controller = new AbortController(); data = null; loadingCountry = country; archived = false; visibleState = null;
    $('#export-radar-view').disabled = true; $('#radar-archive-note').hidden = true; $('#radar-refresh').textContent = 'Refresh ↻';
    $('#radar-source').href = 'https://trends.google.com/trending/rss?geo=' + country;
    $('#radar-refresh').disabled = true; $('#radar-grid').setAttribute('aria-busy', 'true');
    $('#radar-summary').innerHTML = '';
    $('#radar-compare').disabled = true; $('#radar-view-help').textContent = '';
    $('#radar-status').textContent = 'Loading Google RSS · ' + countryName(country) + '…';
    $('#radar-grid').innerHTML = '<div class="empty-state"><h3>Finding the latest topics…</h3><p>Requesting Google’s public feed.</p></div>';
    renderJournal();
    try {
      const response = await fetch('/api/trending?country=' + country, { signal: controller.signal, cache: 'no-store' });
      const feed = await response.json(); if (requestVersion !== version) return;
      if (!response.ok) throw new Error(feed.error || 'The feed could not be loaded.');
      const check = observation(feed);
      if (check.country !== country) throw new Error('Unexpected feed market.');
      data = feed;
      const next = recordCheck(getChecks(), feed);
      if (next !== getChecks()) storageAvailable = setChecks(next);
      render(); renderSaved();
    } catch (error) {
      if (requestVersion !== version || error.name === 'AbortError') return;
      $('#radar-status').textContent = 'Feed unavailable · ' + countryName(country) + ' · No check recorded.';
      const lastCheck = getChecks().filter(check => check.country === country).at(-1);
      $('#radar-grid').innerHTML = '<div class="empty-state"><h3>Could not load this market.</h3><p>' + esc(error.message) + '</p><p>' + (lastCheck ? 'Your last saved check for this market is from ' + esc(timeText(lastCheck.fetchedAt)) + '. You can open it as a saved snapshot; it is not a live feed.' : 'No saved check is available for this market. Your other recorded checks remain in the journal.') + '</p><div class="live-radar-actions"><button type="button" class="outline-btn" id="radar-retry">Try again ↻</button>' + (lastCheck ? '<button type="button" class="outline-btn" id="radar-open-last">Open last saved snapshot ↗</button>' : '') + '<a class="outline-btn" href="https://trends.google.com/trending/rss?geo=' + country + '" target="_blank" rel="noopener noreferrer">Open Google RSS ↗</a></div></div>';
      $('#radar-retry').addEventListener('click', () => load());
      if (lastCheck) $('#radar-open-last').addEventListener('click', () => openCheck(country + '|' + lastCheck.fetchedAt));
    } finally {
      if (requestVersion === version) { loadingCountry = null; $('#radar-refresh').disabled = false; $('#radar-grid').setAttribute('aria-busy', 'false'); }
    }
  }

  function openTopic(topic) {
    const summary = topicObservations(topic, getChecks());
    $('#live-topic-title').textContent = topic.title;
    $('#live-topic-context').textContent = countryName(topic.country) + ' · Seen in ' + summary.appearances + ' of ' + summary.totalChecks + ' retained market checks · Saved ' + timeText(topic.savedAt);
    $('#live-topic-history').innerHTML = summary.trail.length ? summary.trail.toReversed().map(check => '<div class="topic-check"><time datetime="' + check.checkedAt + '">' + esc(timeText(check.checkedAt)) + '</time><span class="feed-status ' + (check.present ? 'continuing' : 'not-listed') + '">' + (check.present ? 'Listed in feed' : 'Not listed in feed') + '</span><strong>' + esc(check.trafficBucket ?? '—') + '</strong></div>').join('') : '<p class="journal-empty">No retained checks for this market. Open it in Radar to record a check.</p>';
    $('#live-topic-dialog').showModal();
  }

  function renderSaved() {
    const topics = getTopics(), entries = topics.map((topic,index) => ({topic,index,summary:topicObservations(topic,getChecks())}));
    const query = $('#live-topic-query').value.trim().normalize('NFC').toLowerCase(), view = $('#live-topic-view').value || 'all';
    const shown = entries.filter(({topic,summary}) => topic.title.normalize('NFC').toLowerCase().includes(query) && (view === 'all' || view === 'listed' && summary.latest?.present || view === 'missing' && summary.latest && !summary.latest.present || view === 'changed' && summary.bucketChanged || view === 'unobserved' && !summary.latest));
    if ($('#live-topic-sort').value === 'name') shown.sort((a,b)=>a.topic.title.localeCompare(b.topic.title));
    else shown.sort((a,b)=>(Date.parse(b.summary.latest?.checkedAt)||0)-(Date.parse(a.summary.latest?.checkedAt)||0));
    $('#live-topic-count').textContent = topics.length + ' Radar topics · ' + (getSeriesCount() + topics.length) + ' / ' + (getPlan() === 'pro' ? 50 : 5) + ' total saved';
    $('#live-topic-status').textContent = shown.length + ' of ' + topics.length + ' saved Radar topics shown · Status uses the last recorded check in each topic’s market.';
    $('#live-activity-summary').innerHTML = [['Saved topics',entries.length],['Listed at last check',entries.filter(x=>x.summary.latest?.present).length],['Absent at last check',entries.filter(x=>x.summary.latest&&!x.summary.latest.present).length],['No recorded checks',entries.filter(x=>!x.summary.latest).length]].map(([label,value])=>'<article><strong>'+value+'</strong><span>'+label+'</span></article>').join('');
    $('#live-topic-list').innerHTML = shown.length ? shown.map(({topic,index,summary}) => {
      const present = summary.latest?.present;
      const labels = {unobserved:'No recorded checks',baseline:'Listed in first check',new:'New at last check',returning:'Returned at last check',continuing:'Still listed at last check','not-listed':'Absent at last check'};
      return '<article class="live-watch-card"><div><span class="feed-status ' + (present ? 'continuing' : 'not-listed') + '">' + labels[summary.status] + '</span><h3>' + esc(topic.title) + '</h3><p>' + esc(countryName(topic.country)) + ' · Last market check: ' + esc(timeText(summary.latest?.checkedAt)) + '</p>' + (summary.bucketChanged ? '<p class="bucket-change">Recorded bucket change: ' + esc(summary.previous.trafficBucket) + ' → ' + esc(summary.latest.trafficBucket) + '. This is a label change, not exact growth.</p>' : '') + '<dl><dt>First recorded appearance</dt><dd>' + esc(timeText(summary.firstSeen)) + '</dd><dt>Last recorded appearance</dt><dd>' + esc(timeText(summary.lastSeen)) + '</dd><dt>Last observed traffic bucket</dt><dd>' + esc(summary.lastBucket ?? 'Not supplied') + '</dd><dt>Recorded feed appearances</dt><dd>' + summary.appearances + ' / ' + summary.totalChecks + ' checks</dd></dl></div><div class="live-watch-actions"><button class="outline-btn" data-topic-history="' + index + '">Observation history ↗</button><button class="outline-btn" data-topic-market="' + topic.country + '">Check market ↻</button><button class="text-btn" data-topic-remove="' + index + '" aria-label="Remove ' + esc(topic.title) + '">Remove</button></div></article>';
    }).join('') : '<div class="empty-state"><h3>' + (topics.length ? 'No saved topics match.' : 'Follow the topics you discover.') + '</h3><p>' + (topics.length ? 'Reset the filters to see all your saved Radar topics.' : 'Save a real Google RSS topic from Radar to keep track of its recorded appearances.') + '</p>' + (topics.length ? '<button id="live-topic-empty-reset" class="outline-btn" type="button">Reset filters ↻</button>' : '<a href="#radar" class="outline-btn">Discover trends ↗</a>') + '</div>';
    if (!shown.length && topics.length) $('#live-topic-empty-reset').addEventListener('click',resetSaved);
    $$('[data-topic-history]').forEach(button => button.addEventListener('click', () => openTopic(getTopics()[Number(button.dataset.topicHistory)])));
    $$('[data-topic-remove]').forEach(button => button.addEventListener('click', () => { const topic = getTopics()[Number(button.dataset.topicRemove)]; toggleTopic(topic.country, topic.title); }));
    $$('[data-topic-market]').forEach(button => button.addEventListener('click', () => {
      $('#radar-region').value = button.dataset.topicMarket; $('#radar-filter').value = ''; $('#radar-view').value = 'all';
      location.hash = 'radar'; load();
    }));
  }
  function resetSaved() { $('#live-topic-query').value = ''; $('#live-topic-view').value = 'all'; $('#live-topic-sort').value = 'recent'; renderSaved(); }

  $('#radar-reset').addEventListener('click',resetView);
  $('#radar-back-live').addEventListener('click',()=>load());
  $('#live-topic-query').addEventListener('input',renderSaved);
  $('#live-topic-view').addEventListener('change',renderSaved);
  $('#live-topic-sort').addEventListener('change',renderSaved);
  $('#live-topic-reset').addEventListener('click',resetSaved);
  $('#export-radar-view').addEventListener('click',()=>{
    if (!visibleState?.items.length) { toast('There are no visible topics to export.'); return; }
    if (!pro('Radar view exports')) return;
    download(exportRadarView(visibleState.changes,visibleState.items,visibleState.settings),'scopeflux-radar-'+visibleState.changes.current.country+'-'+visibleState.changes.current.fetchedAt.slice(0,10)+'.csv');
    toast('Exported '+visibleState.items.length+' visible topics with snapshot and comparison times.');
  });
  $('#radar-compare').addEventListener('change', () => { if (data) render(); });
  $('#radar-view').addEventListener('change', () => { if (data) render(); });
  $('#journal-market').addEventListener('change', renderJournal);
  $('#export-radar-journal').addEventListener('click', () => {
    if (!pro('Radar journal exports')) return;
    const checks = getChecks().filter(check => $('#journal-market').value === 'all' || check.country === $('#journal-market').value);
    if (!checks.length) { toast('Record a feed check first.'); return; }
    download(exportChecks(checks), 'scopeflux-radar-journal.csv'); toast('Radar journal exported with retrieval times and original traffic buckets.');
  });
  $('#clear-radar-journal').addEventListener('click', () => {
    if (!clearPending) { clearPending = true; $('#clear-radar-journal').textContent = 'Confirm clear journal'; $('#cancel-clear-journal').hidden = false; return; }
    storageAvailable = setChecks([]); clearPending = false;
    $('#clear-radar-journal').textContent = 'Clear local journal'; $('#cancel-clear-journal').hidden = true;
    controller?.abort(); version++; data = null; loadingCountry = null; archived = false; visibleState = null;
    $('#export-radar-view').disabled = true; $('#radar-archive-note').hidden = true; $('#radar-refresh').textContent = 'Refresh ↻';
    $('#radar-refresh').disabled = false; $('#radar-grid').setAttribute('aria-busy', 'false');
    $('#radar-summary').innerHTML = '';
    comparisonCountry = null; $('#radar-compare').value = 'latest'; $('#radar-compare').innerHTML = '<option value="latest">Record another check to compare</option>'; $('#radar-compare').disabled = true; $('#radar-view-help').textContent = '';
    $('#radar-status').textContent = 'Journal cleared. Refresh to record a new check.';
    $('#radar-grid').innerHTML = '<div class="empty-state"><h3>Start a fresh feed journal.</h3><p>Use Refresh to record a new check. Your saved topics remain.</p></div>';
    renderJournal(); renderSaved();
    if (storageAvailable) toast('Local journal cleared. Saved topics and series remain.');
  });
  $('#cancel-clear-journal').addEventListener('click', () => { clearPending = false; $('#clear-radar-journal').textContent = 'Clear local journal'; $('#cancel-clear-journal').hidden = true; });
  $('#close-live-topic').addEventListener('click', () => $('#live-topic-dialog').close());
  return { render, load, renderSaved, renderJournal, hasData: () => Boolean(data) };
}
