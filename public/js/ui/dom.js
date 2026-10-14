// Small helpers shared by every page: element lookup, escaping, number and
// date formatting, icons, toasts and file downloads.

export const $ = selector => document.querySelector(selector);
export const $$ = selector => [...document.querySelectorAll(selector)];

// Escape text before putting it into HTML strings.
export const esc = value =>
  String(value).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

// "1,234.5" — or "N/A" when there is no usable number.
export const fmt = (v, digits = 1) =>
  v === null || !Number.isFinite(v)
    ? 'N/A'
    : new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(v);

// "+12.3%" / "-4%" / "N/A"
export const pct = v =>
  v === null || !Number.isFinite(v) ? 'N/A' : (v > 0 ? '+' : '') + fmt(v) + '%';

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
export function countryName(code) {
  try {
    return code ? regionNames.of(code) : 'Worldwide';
  } catch {
    return 'Worldwide';
  }
}

export const periodName = days =>
  ({
    30: 'Past 30 days',
    90: 'Past 90 days',
    365: 'Past 12 months',
    1095: 'Past 3 years',
    1825: 'Past 5 years',
    available: 'Available provider history',
  })[days] || 'Imported history';

// Inline SVG icons (24×24, stroked). Use icon('search') in HTML strings, or
// <span data-icon="search"></span> in index.html (replaced on start-up).
const ICON_PATHS = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 6-7"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
  history: '<path d="M3 11a9 9 0 1 1 2.5 7M3 5v6h6M12 7v5l3 2"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  database:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  sparkles: '<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7zM20 2v4m-2-2h4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  compare: '<path d="M8 3v18M16 3v18M3 8h10M11 16h10M5 6 3 8l2 2M19 14l2 2-2 2"/>',
  pulse: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
};
export const icon = name =>
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICON_PATHS[name] + '</svg>';

export function replaceIconPlaceholders() {
  $$('[data-icon]').forEach(el => (el.outerHTML = icon(el.dataset.icon)));
}

// Short message at the bottom of the screen, hidden after 5 seconds.
let toastTimer;
export function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5000);
}

// Save text as a file on the visitor's device.
export function download(text, name, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// "2024-01-01 — 2024-12-31"
export const datesText = d => d.records[0].date + ' — ' + d.records.at(-1).date;
