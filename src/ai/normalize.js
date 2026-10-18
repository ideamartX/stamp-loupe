// Turn model JSON into safe, predictable records. Anything missing becomes
// an empty value; anything malformed is dropped rather than trusted.

import { clean, isNum } from '../util/format.js';

const arr = v => (Array.isArray(v) ? v : []);
const str = v => clean(v == null ? '' : (typeof v === 'object' ? '' : v));
const num = v => (isNum(v) ? Number(v) : null);
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const KINDS = ['single', 'pair', 'strip', 'block', 'sheetlet', 'booklet pane', 'cover', 'postcard', 'postal stationery'];

export function normalizeId(r, cur) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) { const e = new Error('invalid_json'); e.code = 'invalid_json'; throw e; }
  const c = r.condition && typeof r.condition === 'object' ? r.condition : {};
  const v = r.value && typeof r.value === 'object' ? r.value : {};
  const f = r.format && typeof r.format === 'object' ? r.format : {};
  const o = r.origin && typeof r.origin === 'object' ? r.origin : {};
  const conf = String(r.confidence || '').toLowerCase();
  const kind = String(f.kind || '').toLowerCase().trim();
  const out = {
    is_stamp: r.is_stamp !== false,
    title: str(r.title) || 'Unidentified stamp',
    country: str(r.country), year: str(r.year), issue: str(r.issue), denomination: str(r.denomination), color: str(r.color),
    design: str(r.design), printing: str(r.printing), perforation: str(r.perforation), watermark: str(r.watermark),
    format: {
      kind: KINDS.includes(kind) ? kind : '',
      count: isNum(f.count) && Number(f.count) > 0 ? Math.round(Number(f.count)) : null,
      plate: str(f.plate_or_imprint), markings: str(f.postal_markings), route: str(f.route)
    },
    origin: { printedIn: str(o.printed_in), printer: str(o.printer), aiPrintedIn: str(o.printed_in) },
    catalogue: arr(r.catalogue).map(x => (typeof x === 'string'
      ? { system: 'Ref', number: clean(x), certainty: 'unsure' }
      : { system: str(x && x.system), number: str(x && x.number), certainty: /likely/i.test(String(x && x.certainty)) ? 'likely' : 'unsure' }))
      .filter(x => x.system && x.number).slice(0, 6),
    confidence: ['high', 'medium', 'low'].includes(conf) ? conf : 'low',
    confidence_note: str(r.confidence_note),
    alternates: arr(r.alternates).map(a => ({ title: str(a && a.title), how_to_tell: str(a && a.how_to_tell) })).filter(a => a.title).slice(0, 4),
    condition: {
      state: cap(str(c.state)), centering: cap(str(c.centering)), margins_or_perfs: cap(str(c.margins_or_perfs)),
      cancel: cap(str(c.cancel)), faults: arr(c.faults).map(str).filter(Boolean).map(cap).slice(0, 8), grade: cap(str(c.grade))
    },
    value: {
      currency: (str(v.currency) || cur).toUpperCase().slice(0, 3), low: num(v.low), high: num(v.high),
      basis: str(v.basis), drivers: arr(v.drivers).map(str).filter(Boolean).slice(0, 6),
      sources: arr(v.sources).map(s => (typeof s === 'string' ? { kind: 'general knowledge', detail: clean(s) } : { kind: str(s && s.kind).toLowerCase(), detail: str(s && s.detail) }))
        .filter(s => s.detail).slice(0, 5)
    },
    checks: arr(r.checks).map(str).filter(Boolean).slice(0, 8),
    red_flags: arr(r.red_flags).map(str).filter(Boolean).slice(0, 6),
    expertize: { recommended: !!(r.expertize && r.expertize.recommended === true), reason: str(r.expertize && r.expertize.reason) },
    story: str(r.story),
    search_query: str(r.search_query)
  };
  if (out.value.low != null && out.value.high != null && out.value.low > out.value.high) {
    const t = out.value.low; out.value.low = out.value.high; out.value.high = t;
  }
  if (out.value.low != null && out.value.low < 0) out.value.low = 0;
  return out;
}

export function normalizeListing(r, cur) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) { const e = new Error('invalid_json'); e.code = 'invalid_json'; throw e; }
  const p = r.price && typeof r.price === 'object' ? r.price : {};
  return {
    title: clean(r.title).replace(/\s+/g, ' '),
    description: clean(r.description),
    specifics: arr(r.specifics).map(x => ({ name: clean(x && x.name), value: clean(x && x.value) })).filter(x => x.name && x.value).slice(0, 12),
    price: { amount: isNum(p.amount) ? Number(p.amount) : null, currency: String(p.currency || cur || '').toUpperCase().slice(0, 3), note: clean(p.note) },
    shipping: clean(r.shipping_text),
    tips: arr(r.photo_tips).map(clean).filter(Boolean).slice(0, 4)
  };
}

/** Fill defaults on records saved by older versions of the app. */
export function upgradeStamp(s) {
  const out = Object.assign({}, s);
  out.subject = out.subject || 'single';
  out.format = Object.assign({ kind: '', count: null, plate: '', markings: '', route: '' }, out.format || {});
  out.origin = Object.assign({ printedIn: '', printer: '', aiPrintedIn: '' }, out.origin || {});
  out.value = Object.assign({ currency: 'CAD', low: null, high: null, basis: '', drivers: [], sources: [] }, out.value || {});
  out.pricing = Object.assign({ basis: 'auto', manual: null, catalogue: null, comps: [] }, out.pricing || {});
  if (!Array.isArray(out.pricing.comps)) out.pricing.comps = [];
  out.status = out.status || 'keep';
  return out;
}

/* ---------- Page sort ---------- */

/** Value bands for a page sort, in the owner's currency. */
export const BANDS = [
  { id: 'under1', low: 0, high: 1 },
  { id: '1to10', low: 1, high: 10 },
  { id: '10to50', low: 10, high: 50 },
  { id: '50to250', low: 50, high: 250 },
  { id: 'over250', low: 250, high: null },
  { id: 'unknown', low: null, high: null }
];
const BAND_IDS = BANDS.map(b => b.id);

export function bandLabel(id, cur) {
  const c = cur || 'CAD';
  switch (id) {
    case 'under1': return 'Under ' + c + ' 1';
    case '1to10': return c + ' 1 to 10';
    case '10to50': return c + ' 10 to 50';
    case '50to250': return c + ' 50 to 250';
    case 'over250': return 'Over ' + c + ' 250';
    default: return 'Not valued';
  }
}

function bandFor(low, high) {
  const mid = low != null && high != null ? (low + high) / 2 : (high != null ? high : low);
  if (mid == null) return 'unknown';
  if (mid < 1) return 'under1';
  if (mid < 10) return '1to10';
  if (mid < 50) return '10to50';
  if (mid < 250) return '50to250';
  return 'over250';
}

function normCat(c) {
  if (Array.isArray(c)) c = c[0];
  if (!c || typeof c !== 'object') return null;
  const number = str(c.number).slice(0, 40);
  if (!number) return null;
  return { system: str(c.system).slice(0, 40) || 'Catalogue', number, certainty: /likely/i.test(String(c.certainty || '')) ? 'likely' : 'unsure' };
}

/**
 * Turn a page-sort answer into one entry per expected number.
 * Numbers the answer skipped come back as "Not read" and marked for a closer look.
 */
export function normalizePage(raw, cur, nums) {
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.stamps) ? raw.stamps : [];
  const want = new Set(nums);
  const byN = new Map();
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const n = parseInt(r.n, 10);
    if (!want.has(n) || byN.has(n)) continue;
    let low = num(r.low), high = num(r.high);
    if (low != null && low < 0) low = null;
    if (high != null && high < 0) high = null;
    if (low != null && high != null && low > high) [low, high] = [high, low];
    let band = BAND_IDS.includes(r.band) ? r.band : bandFor(low, high);
    const b = BANDS.find(x => x.id === band);
    if (low == null && b.low != null) low = b.low;
    if (high == null && b.high != null) high = b.high;
    if (high == null && low != null) high = low;
    const conf = String(r.confidence || '').toLowerCase();
    byN.set(n, {
      n,
      isStamp: r.is_stamp !== false,
      title: str(r.title).slice(0, 160) || 'Not identified',
      country: str(r.country).slice(0, 80), year: str(r.year).slice(0, 40),
      denomination: str(r.denomination).slice(0, 40), color: str(r.color).slice(0, 60),
      catalogue: normCat(r.catalogue),
      band, low, high,
      look: r.look_closer === true || r.look_closer === 'true',
      reason: str(r.reason).slice(0, 220),
      confidence: ['high', 'medium', 'low'].includes(conf) ? conf : 'low'
    });
  }
  return nums.map(n => byN.get(n) || {
    n, isStamp: true, title: 'Not read', country: '', year: '', denomination: '', color: '', catalogue: null,
    band: 'unknown', low: null, high: null, look: true,
    reason: 'The sort did not cover this one. Identify it on its own.', confidence: 'low'
  });
}
