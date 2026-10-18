// Import a list of stamps from a spreadsheet: a CSV from Excel, Numbers or
// Google Sheets, a Colnect export, StampManage, or a Stamp Loupe export.
// Column names are matched in several languages; anything unmatched is kept
// in the stamp's notes, so nothing in the file is lost.
//
// The header names for Colnect and German lists come from the import code in
// OpenNumismat (GPL) and Vitrine-hub (MIT). Only the facts were reused.

import { parseCSV, unguard } from '../util/csv.js';
import { clean, isNum } from '../util/format.js';

const norm = s => String(s || '').toLowerCase().replace(/[#.:_*()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();

/** Field name to accepted header names (already normalised). Order matters: first match wins. */
export const HEADERS = {
  title: ['title', 'name', 'item', 'item name', 'stamp', 'titel'],
  design: ['design', 'description', 'maintopic', 'main topic', 'motif', 'motiv', 'subject', 'topic', 'theme', 'beschreibung'],
  country: ['country', 'country region', 'land', 'gebiet', 'issuer', 'country or region', 'pays'],
  year: ['year', 'issued on', 'issue year', 'issue date', 'date of issue', 'jahr', 'issued', 'year of issue', 'date', 'annee'],
  denomination: ['denomination', 'face value', 'facevalue', 'nennwert', 'face'],
  faceCurrency: ['face currency'],
  issue: ['issue', 'series', 'set', 'serie', 'satz'],
  color: ['colour', 'color', 'colors', 'colours', 'farbe', 'couleur'],
  catalogue: ['catalogue', 'catalog', 'catalog codes', 'catalogue numbers', 'catalog numbers', 'catalogue number', 'catalog number', 'cat no', 'catalogue no', 'katalog'],
  scott: ['scott', 'scott no', 'scott number', 'sc'],
  sg: ['sg', 'sg no', 'stanley gibbons', 'gibbons'],
  michel: ['michel', 'mi', 'michel no', 'michel nr', 'mi nr'],
  yvert: ['yvert', 'yt', 'yvert et tellier', 'y t'],
  unitrade: ['unitrade', 'unitrade no', 'ut'],
  condition: ['condition', 'gum', 'erhaltung', 'state', 'mint used', 'used unused', 'cancelled', 'gum condition'],
  grade: ['grade', 'grade estimate', 'centering grade'],
  quantity: ['quantity', 'qty', 'menge', 'count', 'copies', 'anzahl', 'number owned'],
  album: ['album', 'stockbook', 'binder'],
  page: ['page', 'blatt', 'seite', 'sheet'],
  position: ['position', 'slot', 'row'],
  location: ['location', 'where', 'storage', 'stored in'],
  notes: ['notes', 'note', 'comments', 'comment', 'notiz', 'remarks', 'memo'],
  perforation: ['perforation', 'perf', 'perfs', 'perforations', 'zahnung'],
  watermark: ['watermark', 'wmk', 'wasserzeichen'],
  printing: ['printing', 'print method', 'printing method', 'druck'],
  printer: ['printer', 'printed by'],
  catValue: ['catalog value', 'catalogue value', 'cat value', 'scott value', 'katalogwert', 'cv'],
  myValue: ['value', 'price', 'est value', 'estimated value', 'my value', 'market value', 'planning price', 'worth'],
  aiLow: ['ai value low', 'value low', 'low estimate'],
  aiHigh: ['ai value high', 'value high', 'high estimate'],
  currency: ['currency', 'wahrung'],
  paid: ['purchase price', 'paid', 'cost', 'price paid', 'kaufpreis'],
  boughtOn: ['purchase date', 'bought', 'date bought', 'acquired', 'date acquired', 'kaufdatum'],
  boughtFrom: ['bought from', 'seller', 'purchased from', 'source', 'dealer'],
  status: ['status'],
  certificate: ['certificate', 'cert', 'certificate number', 'cert no'],
  grader: ['expertized by', 'expert', 'grader'],
  printedIn: ['printed in']
};

/** Columns our own export writes that carry nothing to import. */
const SKIP = ['format', 'price source', 'sold comps', 'fingerprint', 'added', 'certificate date', 'held by', 'vault reference', 'insured value'];

/** Map each column index to a field, or null. Returns { fields: [...], matched: [{ header, field }], unmatched: [header] }. */
export function mapHeaders(headers) {
  const used = new Set();
  const fields = headers.map(raw => {
    const k = norm(raw);
    if (!k || SKIP.includes(k)) return null;
    for (const [field, names] of Object.entries(HEADERS)) {
      if (names.includes(k) && !(used.has(field) && field !== 'notes')) { used.add(field); return field; }
    }
    return null;
  });
  // Colnect writes a face value and a face currency in the same file.
  if (fields.includes('denomination') && fields.includes('currency') && !fields.includes('aiLow') && !fields.includes('myValue') && !fields.includes('catValue')) {
    fields[fields.indexOf('currency')] = 'faceCurrency';
  }
  const matched = [], unmatched = [];
  headers.forEach((hd, i) => { if (fields[i]) matched.push({ header: hd, field: fields[i] }); else if (hd && !SKIP.includes(norm(hd))) unmatched.push(hd); });
  return { fields, matched, unmatched };
}

const CAT_SYS = [
  [/^(scott|sc)\b/i, 'Scott'], [/^(stanley gibbons|sg)\b/i, 'Stanley Gibbons'], [/^(michel|mi)\b/i, 'Michel'],
  [/^(yvert et tellier|yvert|yt|y&t)\b/i, 'Yvert'], [/^(unitrade|ut)\b/i, 'Unitrade'], [/^colnect\b/i, 'Colnect'], [/^(wns)\b/i, 'WNS']
];

/** "Scott 15; SG 31 (unsure)" or "Sc# 15, Mi 12" to catalogue entries. */
export function parseCatalogue(text, defSystem) {
  const out = [];
  for (let part of String(text || '').split(/[;,|]/)) {
    part = part.trim();
    if (!part) continue;
    const unsure = /\(unsure\)|\?/.test(part);
    part = part.replace(/\(unsure\)|\?/g, '').trim();
    let system = defSystem || '';
    for (const [re, name] of CAT_SYS) { if (re.test(part)) { system = name; part = part.replace(re, '').replace(/^[\s#:.]+/, '').trim(); break; } }
    if (!part) continue;
    out.push({ system: system || 'Catalogue', number: part.slice(0, 40), certainty: unsure ? 'unsure' : 'likely' });
  }
  return out;
}

/** Free-text gum and use to the app's choices. */
export function normGum(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  if (/^\*\*$|mnh|never hinged|postfrisch|\bmint nh\b|\bum\b|unmounted/.test(s)) return 'Mint never hinged';
  if (/^\(\*\)$|no gum|without gum|\bng\b|ohne gummi|regummed/.test(s)) return 'Unused, no gum';
  if (/^\*$|\bmh\b|hinged|mounted mint|\bmm\b|ungebraucht|falz/.test(s)) return 'Mint hinged';
  if (/cover|brief|envelope|fdc/.test(s)) return 'On cover or envelope';
  if (/^o$|^0$|used|gestempelt|cancelled|cancel|\bfu\b|^yes$|^true$|^1$/.test(s)) return 'Used';
  if (/mint|unused/.test(s)) return 'Mint hinged';
  return '';
}

function money(v) {
  const s = String(v || '').replace(/[^0-9.,-]/g, '');
  if (!s) return null;
  // 1.234,56 (European) or 1,234.56
  const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, ''));
  return isNum(n) && n >= 0 ? n : null;
}

/**
 * One CSV row to a record (for stampDoc) and its private fields.
 * opts: { cur, statuses: [{ id, label }], file, index, now }
 */
export function rowToStamp(cells, map, headers, opts = {}) {
  const get = f => { const i = map.fields.indexOf(f); return i >= 0 ? clean(unguard(cells[i] || '')).trim() : ''; };
  const all = f => map.fields.map((x, i) => (x === f ? clean(unguard(cells[i] || '')).trim() : '')).filter(Boolean);
  // Colnect puts item links in a column whose name changes with the export.
  const links = cells.map(c => String(c || '').trim()).filter(c => /^https:\/\/colnect\.com\//i.test(c));
  const country = get('country'), year = get('year').slice(0, 40), design = get('design');
  let denomination = get('denomination');
  if (denomination && get('faceCurrency')) denomination += ' ' + get('faceCurrency');
  const title = get('title') || [country, year.slice(0, 4), denomination, design].filter(Boolean).join(' ') || 'Imported stamp';
  const catalogue = [
    ...parseCatalogue(all('catalogue').join(';')),
    ...parseCatalogue(get('scott'), 'Scott'), ...parseCatalogue(get('sg'), 'Stanley Gibbons'), ...parseCatalogue(get('michel'), 'Michel'),
    ...parseCatalogue(get('yvert'), 'Yvert'), ...parseCatalogue(get('unitrade'), 'Unitrade')
  ].slice(0, 8);
  const cur = (get('currency') || opts.cur || 'CAD').toUpperCase().slice(0, 3);
  const lo = money(get('aiLow')), hi = money(get('aiHigh'));
  const catValue = money(get('catValue')), myValue = money(get('myValue'));
  const gumRaw = get('condition');
  const gum = normGum(gumRaw);
  const extra = [];
  map.fields.forEach((f, i) => {
    const v = clean(unguard(cells[i] || '')).trim();
    if (!f && v && headers[i] && !/^https:\/\/colnect\.com\//i.test(v) && !SKIP.includes(norm(headers[i]))) extra.push(headers[i] + ': ' + v);
  });
  const notes = [...all('notes'), ...extra, ...links.map(l => 'Colnect: ' + l)].join('\n').slice(0, 4000);
  const loc = [get('album') && 'Album ' + get('album'), get('page') && 'page ' + get('page'), get('position') && 'position ' + get('position'), get('location')].filter(Boolean).join(', ');
  const qty = parseInt(get('quantity'), 10);
  const st = get('status').toLowerCase();
  const status = (opts.statuses || []).find(s => s.id === st || s.label.toLowerCase() === st);
  const printedIn = get('printedIn');
  const record = {
    title: title.slice(0, 200), country: country.slice(0, 80), year, issue: get('issue').slice(0, 120), denomination: denomination.slice(0, 60), color: get('color').slice(0, 80),
    design: design.slice(0, 300), printing: [get('printing'), get('printer')].filter(Boolean).join(', ').slice(0, 160),
    perforation: get('perforation').slice(0, 60), watermark: get('watermark').slice(0, 80),
    format: { kind: 'single', count: 1, plate: '', markings: '', route: '' },
    origin: printedIn ? { printedIn, printer: get('printer'), aiPrintedIn: '' } : null,
    catalogue, confidence: '', confidence_note: '',
    condition: { state: gum || gumRaw.slice(0, 60), centering: '', margins_or_perfs: '', cancel: '', faults: [], grade: get('grade').slice(0, 60) },
    value: lo != null || hi != null
      ? { currency: cur, low: lo != null ? lo : hi, high: hi != null ? hi : lo, basis: 'From the imported list.', drivers: [], sources: [{ kind: 'imported list', detail: 'Value carried over from the imported file.' }] }
      : { currency: cur, low: null, high: null, basis: '', drivers: [], sources: [] },
    search_query: [country, year.slice(0, 4), denomination, design].filter(Boolean).join(' ').slice(0, 120) || title.slice(0, 120),
    subject: 'single',
    pricing: {
      basis: myValue != null && myValue > 0 ? 'manual' : 'auto',
      manual: myValue != null && myValue > 0 ? myValue : null,
      catalogue: catValue != null && catValue > 0 ? { amount: catValue, currency: cur, edition: 'From the imported list' } : null,
      comps: []
    },
    gum, location: loc.slice(0, 200), quantity: isNum(qty) && qty > 0 ? qty : null,
    imported: { at: opts.now || new Date().toISOString(), file: String(opts.file || '').slice(0, 120), row: opts.index != null ? opts.index + 2 : null }
  };
  const priv = {};
  if (get('paid')) priv.paid = get('paid').slice(0, 60);
  const from = [get('boughtFrom'), get('boughtOn') && 'on ' + get('boughtOn')].filter(Boolean).join(', ');
  if (from) priv.boughtFrom = from.slice(0, 160);
  return {
    record, priv: Object.keys(priv).length ? priv : null, notes,
    status: status ? status.id : 'keep',
    cert: { certNumber: get('certificate').slice(0, 60), grader: get('grader').slice(0, 80) }
  };
}

/** Parse a whole file. Returns { headers, rows, map } or throws { code: 'empty' }. */
export function readList(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) { const e = new Error('empty'); e.code = 'empty'; throw e; }
  // Colnect exports can start with a few title lines; use the first row with several filled cells as the header.
  let hi = 0;
  while (hi < Math.min(rows.length - 1, 10) && rows[hi].filter(c => String(c).trim()).length < 2) hi++;
  const headers = rows[hi].map(h => String(h || '').trim());
  const body = rows.slice(hi + 1).filter(r => r.some(c => String(c).trim()));
  return { headers, rows: body, map: mapHeaders(headers) };
}
