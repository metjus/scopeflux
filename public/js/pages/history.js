// "Recent analyses" page (#history): series opened or imported in this browser.
import { $, $$, esc, icon, toast, countryName, periodName } from '../ui/dom.js';
import { workspace, persist, seriesLabel, storedSeries } from '../state.js';
import { analyzeTopic, openDataset } from './explorer.js';

export function renderHistory() {
  const { history } = workspace;
  if (!history.length) {
    $('#history-list').innerHTML =
      '<div class="empty-state"><h3>Your analysis trail starts here.</h3><p>Topics you look up and CSV files you import appear in this local history.</p><a href="#explorer" class="search-button">Analyze a trend ↗</a></div>';
    return;
  }
  $('#history-list').innerHTML = history
    .map(
      (item, index) =>
        '<article class="saved-item">' +
        icon('history') +
        '<div><h3>' +
        esc(item.query) +
        '</h3><p>' +
        esc(
          item.kind === 'imported'
            ? 'CSV import'
            : countryName(item.country) + ' · ' + seriesLabel(item),
        ) +
        ' · ' +
        periodName(item.period) +
        '</p></div><button class="outline-btn" data-history="' +
        index +
        '">Reopen ↗</button></article>',
    )
    .join('');
  $$('[data-history]').forEach(b =>
    b.addEventListener('click', () => {
      const item = history[Number(b.dataset.history)];
      const d = storedSeries().find(x => x.id === item.id);
      if (d) openDataset(d);
      // Only the 10 newest Wikipedia series are kept; older ones are fetched again.
      else if (item.source === 'wikipedia')
        analyzeTopic(item.query, { country: item.country, period: item.period });
      else toast('This stored series is no longer available. Import the CSV again.');
    }),
  );
}

export function initHistory() {
  $('#clear-history').addEventListener('click', () => {
    workspace.history = [];
    persist();
    renderHistory();
    toast('Local analysis history cleared.');
  });
}
