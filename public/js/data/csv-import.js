// Reads a user's CSV text into dated series. Strict on purpose: invalid dates,
// duplicates, missing or censored values are rejected rather than guessed.
function splitCsv(text) {
  if (text.length > 2_000_000) throw new Error('CSV exceeds the 2 MB limit.');
  const clean = text
    .replace(/^\ufeff/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const first =
    clean.split('\n').find(line => /date|month|week|day|time/i.test(line)) || clean.split('\n')[0];
  let commas = 0,
    semicolons = 0,
    headerQuoted = false;
  for (let i = 0; i < first.length; i++) {
    if (first[i] === '"') {
      if (headerQuoted && first[i + 1] === '"') i++;
      else headerQuoted = !headerQuoted;
    } else if (!headerQuoted) {
      if (first[i] === ',') commas++;
      if (first[i] === ';') semicolons++;
    }
  }
  const delimiter = semicolons > commas ? ';' : ',';
  const rows = [],
    row = [];
  let cell = '',
    quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === '"') {
      if (quoted && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if (c === '\n' && !quoted) {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push([...row]);
      row.length = 0;
      cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV contains an unfinished quoted field.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push([...row]);
  return { rows, delimiter };
}
function validDate(text) {
  const token = text.trim().split(' ')[0];
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(token)) return null;
  const date = token.length === 7 ? token + '-01' : token;
  const parsed = new Date(date + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}
function csvTable(text) {
  const { rows, delimiter } = splitCsv(text);
  const headerIndex = rows.findIndex(row =>
    row.some(cell => /^(date|month|week|day|time)$/i.test(cell)),
  );
  if (headerIndex < 0)
    throw new Error(
      'Add a date, month, week, day or time header and at least one numeric value column.',
    );
  const headers = rows[headerIndex],
    dateIndex = headers.findIndex(cell => /^(date|month|week|day|time)$/i.test(cell));
  const columns = headers
    .map((name, index) => ({ name: name || 'Column ' + (index + 1), index }))
    .filter(x => x.index !== dateIndex);
  if (!columns.length) throw new Error('No value column was found.');
  if (columns.length > 100) throw new Error('Use a CSV with up to 100 value columns.');
  return { rows, delimiter, headerIndex, dateIndex, columns };
}
function csvColumn(table, column) {
  const { rows, delimiter, headerIndex, dateIndex, columns } = table;
  const chosen = columns.find(x => x.index === Number(column));
  if (!chosen) throw new Error('Select a valid value column.');
  const records = [],
    seen = new Set();
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some(Boolean)) continue;
    const date = validDate(row[dateIndex] || '');
    if (!date)
      throw new Error('Invalid date on CSV row ' + (i + 1) + '. Use YYYY-MM-DD or YYYY-MM.');
    const raw = row[chosen.index] ?? '';
    if (!raw || raw === '<1')
      throw new Error(
        'Missing or censored value on CSV row ' +
          (i + 1) +
          '. Values such as <1 need an explicit numeric choice before importing.',
      );
    const value = Number(delimiter === ';' ? raw.replace(',', '.') : raw);
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)
      throw new Error(
        'Invalid value on CSV row ' +
          (i + 1) +
          '. Use finite, non-negative values within JavaScript’s safe numeric range.',
      );
    if (seen.has(date))
      throw new Error('Duplicate date ' + date + '. Use one observation per date.');
    seen.add(date);
    records.push({ date, value });
  }
  if (records.length < 6) throw new Error('Import at least six dated observations.');
  if (records.length > 10000) throw new Error('Import up to 10,000 observations per series.');
  records.sort((a, b) => a.date.localeCompare(b.date));
  return { records, columns, selectedColumn: chosen.index, name: chosen.name };
}
export function parseCsv(text, valueColumn) {
  const table = csvTable(text);
  return csvColumn(table, valueColumn === undefined ? table.columns[0].index : valueColumn);
}
export function inspectCsv(text) {
  const table = csvTable(text);
  return {
    columns: table.columns.map(column => {
      try {
        const parsed = csvColumn(table, column.index);
        return {
          ...column,
          valid: true,
          count: parsed.records.length,
          from: parsed.records[0].date,
          to: parsed.records.at(-1).date,
        };
      } catch (error) {
        return { ...column, valid: false, error: error.message };
      }
    }),
  };
}
export function parseCsvColumns(text, valueColumns) {
  if (!Array.isArray(valueColumns) || valueColumns.length < 1 || valueColumns.length > 5)
    throw new Error('Select between one and five value columns.');
  const indices = valueColumns.map(Number);
  if (new Set(indices).size !== indices.length)
    throw new Error('Select each value column only once.');
  const table = csvTable(text);
  return indices.map(index => {
    const name = table.columns.find(c => c.index === index)?.name || 'Unknown column';
    try {
      return csvColumn(table, index);
    } catch (error) {
      throw new Error(name + ': ' + error.message);
    }
  });
}
