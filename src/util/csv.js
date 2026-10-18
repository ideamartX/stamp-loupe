// CSV export with a guard against spreadsheet formula injection.

import { isNum } from './format.js';

export function csvEscape(v) {
  let t = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

export function toCSV(rows, columns) {
  const lines = [columns.map(c => csvEscape(c[0])).join(',')];
  for (const r of rows) lines.push(columns.map(c => csvEscape(c[1](r))).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** Collection export. priv maps stamp id to private custody fields (owners only). */
export function collectionCSV(list, opts) {
  const { statusLabel, planning, priv } = opts;
  const cols = [
    ['Title', s => s.title], ['Country', s => s.country], ['Year', s => s.year], ['Issue', s => s.issue],
    ['Format', s => s.subject || 'single'],
    ['Denomination', s => s.denomination], ['Colour', s => s.color],
    ['Catalogue', s => (s.catalogue || []).map(c => c.system + ' ' + c.number + (c.certainty === 'likely' ? '' : ' (unsure)')).join('; ')],
    ['Condition', s => (s.condition && s.condition.state) || ''], ['Grade estimate', s => (s.condition && s.condition.grade) || ''],
    ['AI value low', s => (s.value && isNum(s.value.low)) ? s.value.low : ''], ['AI value high', s => (s.value && isNum(s.value.high)) ? s.value.high : ''],
    ['Currency', s => (s.value && s.value.currency) || ''],
    ['Planning price', s => { const p = planning(s); return p ? p.amount : ''; }],
    ['Price source', s => { const p = planning(s); return p ? p.label : ''; }],
    ['Sold comps', s => ((s.pricing && s.pricing.comps) || []).length || ''],
    ['Printed in', s => (s.origin && s.origin.printedIn) || ''],
    ['Status', s => statusLabel(s.status)],
    ['Expertized by', s => s.grader], ['Certificate', s => s.certNumber], ['Grade', s => s.grade], ['Certificate date', s => s.certDate],
    ['Fingerprint', s => s.fingerprint], ['Notes', s => s.notes], ['Added', s => s.addedAt]
  ];
  if (priv) {
    cols.push(['Held by', s => (priv[s.id] || {}).custodian], ['Vault reference', s => (priv[s.id] || {}).vaultRef],
      ['Insured value', s => (priv[s.id] || {}).insured], ['Paid', s => (priv[s.id] || {}).paid], ['Bought from', s => (priv[s.id] || {}).boughtFrom]);
  }
  return toCSV(list, cols);
}

/**
 * Parse CSV text (RFC 4180: quoted fields, doubled quotes, line breaks in
 * quotes, CRLF or LF, a byte order mark). Also reads semicolon or tab
 * separated files, which some spreadsheet locales write.
 * Returns an array of rows, each an array of strings.
 */
export function parseCSV(text) {
  let t = String(text || '');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  const firstLine = t.slice(0, t.search(/\r?\n|$/));
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let q = false;
  for (const ch of firstLine) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++; }
  const sep = counts[';'] > counts[','] && counts[';'] >= counts['\t'] ? ';' : counts['\t'] > counts[','] ? '\t' : ',';
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"' && field === '') inQ = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v !== '')) rows.push(row);
  return rows;
}

/** Undo the formula guard that csvEscape adds on export. */
export function unguard(v) {
  const s = String(v == null ? '' : v);
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}
