// "Import data" page (#imports): read a CSV in the browser, let the visitor pick
// columns, store each column as its own series. Nothing is uploaded.
import { inspectCsv, parseCsvColumns } from '../data/csv-import.js';
import { $, $$, esc, icon, toast, download, datesText } from '../ui/dom.js';
import { workspace, persist, meta, seriesChanged, MAX_IMPORTS } from '../state.js';
import { openDataset } from './explorer.js';
import { compareStored } from './compare.js';

const MAX_FILE_BYTES = 2_000_000;
let preview = null; // result of inspectCsv() for the current text
let namedColumn = null; // column whose name was copied into "Topic name"
let lastImportIds = [];
let fileReadVersion = 0; // ignore a slow file read if the visitor changed the input

const slotsLeft = () => Math.max(0, MAX_IMPORTS - workspace.imports.length);
const selectedColumns = () =>
  $$('#import-column-options input:checked').map(input => Number(input.value));

function showError(message) {
  $('#import-error').textContent = message;
  $('#import-error').hidden = false;
}

function resetPreview() {
  preview = null;
  namedColumn = null;
  $('#import-column-preview').hidden = true;
  $('#import-column-options').innerHTML = '';
  $('#import-name-entry').hidden = true;
  $('#import-name').required = false;
  $('#import-submit').disabled = true;
  $('#import-submit').textContent = 'Review your CSV first ↗';
  $('#import-error').hidden = true;
  $('#import-success').hidden = true;
}

function syncSelection() {
  if (!preview) return;
  const selected = selectedColumns(),
    available = slotsLeft(),
    count = selected.length;
  // A single column gets a name field, pre-filled from its header or file name.
  $('#import-name-entry').hidden = count !== 1;
  $('#import-name').required = count === 1;
  if (count === 1 && namedColumn !== selected[0]) {
    namedColumn = selected[0];
    const column = preview.columns.find(c => c.index === selected[0]);
    const file = $('#import-file').files[0];
    $('#import-name').value = (
      /^(value|values)$/i.test(column?.name || '') && file
        ? file.name.replace(/\.csv$/i, '')
        : column?.name || 'Imported topic'
    ).slice(0, 120);
  }
  $('#import-selection-help').textContent =
    available === 0
      ? 'Your workspace is full (' +
        MAX_IMPORTS +
        ' topics). Remove an imported topic below before adding another.'
      : count +
        ' of ' +
        preview.columns.filter(c => c.valid).length +
        ' valid topics selected · ' +
        available +
        ' workspace slots available. ' +
        (count > 1 ? 'Topic names will come from their column headers.' : '');
  $('#import-submit').disabled = count < 1 || count > available;
  $('#import-submit').textContent = count
    ? 'Import ' + count + ' selected topic' + (count === 1 ? '' : 's') + ' ↗'
    : 'Choose a topic to import ↗';
}

function columnRowHtml(c, checked) {
  return (
    '<label class="import-column-row ' +
    (c.valid ? '' : 'has-error') +
    '"><input type="checkbox" value="' +
    c.index +
    '" ' +
    (checked ? 'checked ' : '') +
    (!c.valid ? 'disabled ' : '') +
    '><span><strong>' +
    esc(c.name) +
    '</strong><small>' +
    (c.valid ? c.count + ' observations · ' + c.from + ' — ' + c.to : esc(c.error)) +
    '</small></span><span class="import-column-status">' +
    (c.valid ? 'Ready' : 'Needs correction') +
    '</span></label>'
  );
}

function detectColumns() {
  resetPreview();
  try {
    preview = inspectCsv($('#import-text').value);
    const available = slotsLeft();
    let chosen = 0;
    // Pre-select valid columns while there are free slots.
    $('#import-column-options').innerHTML = preview.columns
      .map(c => columnRowHtml(c, c.valid && chosen++ < available))
      .join('');
    $('#import-column-preview').hidden = false;
    $$('#import-column-options input').forEach(input =>
      input.addEventListener('change', syncSelection),
    );
    syncSelection();
    if (!preview.columns.some(c => c.valid))
      showError(
        'No topics are ready to import. Correct the values shown above, then review the CSV again.',
      );
  } catch (error) {
    showError(error.message);
  }
}

function importData() {
  try {
    if (!preview) throw new Error('Review your CSV first, then choose the topics to import.');
    const selected = selectedColumns();
    if (selected.length + workspace.imports.length > MAX_IMPORTS)
      throw new Error(
        'This workspace supports five imported topics. Select fewer columns or remove a topic below.',
      );
    const parsed = parseCsvColumns($('#import-text').value, selected),
      single = parsed.length === 1;
    const name = $('#import-name').value.trim();
    if (single && (!name || name.length > 120))
      throw new Error('Name your topic using 1–120 characters.');
    const createdAt = Date.now(),
      datasets = parsed.map(series => ({
        id: crypto.randomUUID(),
        query: single ? name : series.name.slice(0, 120),
        country: '',
        source: 'csv',
        kind: 'imported',
        period: 'imported',
        unit: $('#import-unit').value,
        records: series.records,
        createdAt,
      }));
    workspace.imports = [...datasets, ...workspace.imports];
    workspace.history = [...datasets.map(meta), ...workspace.history].slice(0, 50);
    const stored = persist();
    lastImportIds = datasets.map(d => d.id);
    fileReadVersion++;
    $('#import-text').value = '';
    $('#import-file').value = '';
    resetPreview();
    renderImports();
    $('#import-success-title').textContent =
      datasets.length + ' topic' + (single ? '' : 's') + ' imported';
    $('#import-success-detail').textContent =
      (stored
        ? 'Saved in this browser. '
        : 'Available for this session only: browser storage is full or unavailable. ') +
      (single
        ? 'Open the analysis for ' + datasets[0].query + '.'
        : 'Each selected column is now a separate topic. Open ' +
          datasets[0].query +
          ' or compare the topics below.');
    $('#import-open-analysis').textContent = 'Analyze ' + datasets[0].query + ' ↗';
    $('#import-open-comparison').hidden = single;
    $('#import-success').hidden = false;
    $('#import-success-title').focus();
    toast(
      stored
        ? 'Your selected topics were imported. No file was uploaded.'
        : 'Imported for this session only. Browser storage is full or unavailable.',
    );
  } catch (error) {
    showError(error.message);
  }
}

export function renderImports() {
  seriesChanged();
  syncSelection();
  const { imports } = workspace;
  $('#import-count').textContent = imports.length + ' / ' + MAX_IMPORTS + ' local topics';
  $('#import-list').innerHTML = imports.length
    ? imports
        .map(
          (d, index) =>
            '<article class="import-item">' +
            icon('database') +
            '<div><h3>' +
            esc(d.query) +
            '</h3><p>' +
            d.records.length +
            ' observations · ' +
            esc(d.unit) +
            ' · ' +
            datesText(d) +
            '</p></div><button class="outline-btn" data-import-open="' +
            index +
            '">Analyze ↗</button><button class="icon-btn" data-import-remove="' +
            index +
            '" aria-label="Remove ' +
            esc(d.query) +
            '">×</button></article>',
        )
        .join('')
    : '<div class="empty-state"><h3>Add one file, explore several topics.</h3><p>Each numeric column becomes a topic. Your values can be used for analytics, seasonality, comparison and watchlists.</p></div>';
  $$('[data-import-open]').forEach(b =>
    b.addEventListener('click', () => openDataset(imports[Number(b.dataset.importOpen)])),
  );
  $$('[data-import-remove]').forEach(b =>
    b.addEventListener('click', () => {
      imports.splice(Number(b.dataset.importRemove), 1);
      persist();
      $('#import-success').hidden = true;
      renderImports();
      toast('Imported topic removed. Existing watchlist snapshots remain.');
    }),
  );
}

// A blank file in the expected format: monthly dates, values left for the visitor.
function templateCsv() {
  const firstYear = new Date().getUTCFullYear() - 2;
  const dates = Array.from(
    { length: 24 },
    (_, i) => firstYear + Math.floor(i / 12) + '-' + String((i % 12) + 1).padStart(2, '0') + '-01',
  );
  return 'date,Your topic\r\n' + dates.map(date => date + ',').join('\r\n');
}

export function initImports() {
  $('#inspect-columns').addEventListener('click', detectColumns);
  $('#import-text').addEventListener('input', () => {
    fileReadVersion++;
    resetPreview();
  });
  $('#import-file').addEventListener('change', async () => {
    const file = $('#import-file').files[0],
      version = ++fileReadVersion;
    resetPreview();
    $('#import-text').value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      showError('Choose a CSV file up to 2 MB.');
      return;
    }
    try {
      const text = await file.text();
      if (version !== fileReadVersion) return;
      $('#import-text').value = text;
      detectColumns();
    } catch {
      if (version === fileReadVersion)
        showError('The file could not be read. Try pasting its contents.');
    }
  });
  $('#import-form').addEventListener('submit', event => {
    event.preventDefault();
    importData();
  });
  $('#import-open-analysis').addEventListener('click', () => {
    const d = workspace.imports.find(d => d.id === lastImportIds[0]);
    if (d) openDataset(d);
  });
  $('#import-open-comparison').addEventListener('click', () =>
    compareStored(lastImportIds.filter(id => workspace.imports.some(d => d.id === id))),
  );
  $('#download-template').addEventListener('click', () => {
    download(templateCsv(), 'scopeflux-template.csv');
    toast('Template downloaded. Fill in a value for every date, then import it.');
  });
}
