// Shared state, preferences, constants and small render helpers.

import { h, icon } from '../util/dom.js';
import { clean, fmtRange, joinDot } from '../util/format.js';
import { RULES } from '../sell/rules.js';

export const VERSION = '2.1.0';

/* ---------- Preferences (per viewer, per browser) ---------- */
export const pref = {
  get(k, d) {
    try { const v = localStorage.getItem('stamp-loupe.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('stamp-loupe.' + k, JSON.stringify(v)); } catch (_) { /* storage unavailable */ }
  },
  remove(k) {
    try { localStorage.removeItem('stamp-loupe.' + k); } catch (_) { /* storage unavailable */ }
  }
};

/* ---------- Platform: filled in by main.js ---------- */
export const P = {
  kind: 'standalone',          // 'claude' inside a Claude artifact
  ai: null,                    // provider from ai/providers.js
  aiState: 'pending',          // pending | ready | setup | none | noimages | blocked
  store: null,                 // claude-store or local-store
  storeState: 'pending',       // pending | ready | none
  canWrite: null,              // true | false | null (unknown)
  downloads: null,             // { save({ filename, data }) }
  live: false                  // live camera available
};

/* ---------- App state ---------- */
export const S = {
  subject: pref.get('subject', 'single'),
  shots: { front: null, back: null },
  mode: pref.get('mode', 'thorough') === 'fast' ? 'fast' : 'thorough',
  busy: false, ctl: null, timer: null, t0: 0,
  result: null, resultIsExample: true, resultInputs: null, resultShots: null, savedId: null, saving: false,
  stamps: [], loaded: false, priv: {}, settings: {},
  f: { q: '', era: 'all', status: 'all', country: 'all', sort: pref.get('sort', 'new') },
  tab: 'scan', sheetId: null
};

/* ---------- Event hub ---------- */
const hub = new Map();
export function on(evt, fn) { if (!hub.has(evt)) hub.set(evt, new Set()); hub.get(evt).add(fn); return () => hub.get(evt).delete(fn); }
export function emit(evt, data) { (hub.get(evt) || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

/* ---------- Selling settings (per viewer) ---------- */
export function sellPrefs() {
  const p = pref.get('sell', {}) || {};
  return {
    dest: p.dest || 'CA',
    shipFrom: p.shipFrom || 'Canada',
    fees: p.fees || {},
    postage: p.postage || {},
    certCost: p.certCost
  };
}

/** RULES with the viewer's overrides applied. */
export function effectiveRules() {
  const sp = sellPrefs();
  const r = JSON.parse(JSON.stringify(RULES));
  for (const [k, v] of Object.entries(sp.fees || {})) if (r.fees[k]) Object.assign(r.fees[k], v);
  for (const [k, v] of Object.entries(sp.postage || {})) if (r.postage[k] && typeof r.postage[k] === 'object') Object.assign(r.postage[k], v); else if (k === 'supplies') r.postage.supplies = v;
  if (Number.isFinite(sp.certCost)) r.certificate.cost = sp.certCost;
  return r;
}

/* ---------- Constants ---------- */
export const ERAS = [
  { id: 'all', label: 'All eras' },
  { id: 'classic', label: 'Before 1900', test: y => y != null && y < 1900 },
  { id: 'early', label: '1900 to 1949', test: y => y != null && y >= 1900 && y < 1950 },
  { id: 'mid', label: '1950 to 1999', test: y => y != null && y >= 1950 && y < 2000 },
  { id: 'modern', label: '2000 on', test: y => y != null && y >= 2000 }
];
export const STATUSES = [
  { id: 'keep', label: 'Keeping' },
  { id: 'sell', label: 'For sale' },
  { id: 'listed', label: 'Listed' },
  { id: 'sold', label: 'Sold' },
  { id: 'expert', label: 'With an expert' },
  { id: 'vault', label: 'In a vault' }
];
export const statusLabel = id => (STATUSES.find(s => s.id === id) || STATUSES[0]).label;
export const GRADERS = ['Professional Stamp Experts (PSE)', 'Philatelic Foundation', 'Philatelic Stamp Authentication and Grading (PSAG)', 'Greene Foundation', 'BPA Expertising', 'Royal Philatelic Society London', 'American Philatelic Expertizing Service (APEX)', 'Other'];
export const EXPERTS = [
  ['Canada and British North America', 'Greene Foundation, Toronto'],
  ['United States and worldwide', 'Professional Stamp Experts (PSE), Philatelic Foundation'],
  ['Great Britain and the Commonwealth', 'BPA Expertising, Royal Philatelic Society London']
];
export const CURRENCIES = ['CAD', 'USD', 'GBP', 'EUR', 'AUD', 'NZD'];

/* ---------- Render helpers ---------- */
export function placeholderStamp(label) {
  return h('div', { class: 'ph-stamp', 'aria-hidden': 'true' },
    h('div', { class: 'perf' }, h('div', { class: 'ph-inner' }, icon('i-maltese', 'ph-cross'), label ? h('span', { class: 'ph-label', text: label }) : null)));
}
export function sec(title, ...content) { return h('section', { class: 'sec' }, h('h3', { text: title }), ...content); }
export function ulPlain(items) { return h('ul', { class: 'plain' }, items.map(t => h('li', { text: t }))); }
export function factList(pairs) {
  const rows = pairs.filter(p => p[1] != null && p[1] !== '' && !(Array.isArray(p[1]) && !p[1].length));
  if (!rows.length) return null;
  return h('dl', { class: 'facts' }, rows.map(([k, v]) => [h('dt', { text: k }), h('dd', null, v instanceof Node ? v : String(v))]));
}
export function catRefs(list) {
  return h('div', { class: 'cats' }, list.map(c => h('span', { class: 'catref' },
    h('span', { class: 'sys', text: c.system }), c.number, c.certainty === 'likely' ? null : h('span', { class: 'unsure', text: 'unsure' }))));
}
export function confPill(c) {
  const label = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }[c] || 'Low confidence';
  return h('span', { class: 'pill ' + (c || 'low') }, h('span', { class: 'dot' }), label);
}

/**
 * Price research links. The marketplace URL patterns follow Vitrine-hub
 * (MIT): eBay's stamp category 260, sold and completed listings, newest first.
 */
export function priceLinks(q, country) {
  const query = clean(q || '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const e = encodeURIComponent;
  const g = s => 'https://www.google.com/search?q=' + e(s);
  const c = String(country || '').toLowerCase();
  const links = [
    ['eBay sold (worldwide)', 'https://www.ebay.com/sch/i.html?_nkw=' + e(query) + '&_sacat=260&LH_Sold=1&LH_Complete=1&_sop=13', 'Completed sales from the last 90 days, newest first'],
    ['eBay.ca sold', 'https://www.ebay.ca/sch/i.html?_nkw=' + e(query) + '&_sacat=260&LH_Sold=1&LH_Complete=1&_sop=13', 'Canadian buyers'],
    ['Auction results', g('site:stampauctionnetwork.com ' + query), 'Prices realized at stamp auctions since 2001'],
    ['Philasearch', g('site:philasearch.com ' + query), 'Lots from many auction houses'],
    ['Catawiki', 'https://www.catawiki.com/en/s?q=' + e(query), 'Weekly European auctions'],
    ['HipStamp', 'https://www.hipstamp.com/search?keywords=' + e(query), 'Asking prices, not sales'],
    ['Delcampe', g('site:delcampe.net ' + query), 'European buyers'],
    ['Colnect catalogue', 'https://colnect.com/en/stamps/list/search/' + e(query), 'Identification and catalogue numbers']
  ];
  if (/canada|newfoundland|nova scotia|new brunswick|prince edward|british columbia|vancouver island/.test(c)) {
    links.push(['Canadian Stamp Identifier', 'https://adrianspeyer.github.io/Canadian-Stamp-Identifier/', '3,488 Canadian stamps by decade, in English and French']);
  }
  if (/united states|^usa?$|u\.s\./.test(c)) {
    links.push(['National Postal Museum', g('site:postalmuseum.si.edu ' + query), 'Smithsonian reference images for U.S. stamps']);
  }
  return links;
}

/** Put a stored image into an <img>, whether the store returns a URL or a promise. */
export function setImage(img, id, onFail) {
  if (!id || !P.store) { if (onFail) onFail(); return; }
  Promise.resolve(P.store.imageUrl(id)).then(u => { if (u) img.src = u; else if (onFail) onFail(); }, () => { if (onFail) onFail(); });
  img.addEventListener('error', () => { if (onFail) onFail(); }, { once: true });
}

export function stampSub(s) {
  return joinDot([s.country, s.year, s.denomination, s.color]);
}

export { fmtRange };
