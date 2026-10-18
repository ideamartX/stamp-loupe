// Collection view: a stock-book grid of saved stamps with search, filters,
// a selling summary, CSV export, and the detail sheet.

import { $, h, toast, pushBack } from '../util/dom.js';
import { fmtMoney, fmtNum, joinDot, yearOf, initials, plural } from '../util/format.js';
import { collectionCSV } from '../util/csv.js';
import { P, S, pref, on, ERAS, STATUSES, statusLabel, placeholderStamp, setImage, sellPrefs, effectiveRules } from './core.js';
import { planningPrice, sellSummary, CHANNELS } from '../sell/planner.js';
import { upgradeStamp } from '../ai/normalize.js';
import { savedCard } from './stamp-view.js';
import { writeErrorMessage } from '../store/claude-store.js';
import { duplicateIds } from './dupes.js';

export function filterStamps(list, f) {
  const terms = String(f.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const era = ERAS.find(e => e.id === f.era);
  const dups = f.status === 'dups' ? duplicateIds(list) : null;
  const out = list.filter(s => {
    if (f.status === 'dups') { if (!dups.has(s.id)) return false; }
    else if (f.status === 'sorted') { if (!s.sort) return false; }
    else if (f.status && f.status !== 'all' && (s.status || 'keep') !== f.status) return false;
    if (f.country && f.country !== 'all' && (s.country || '') !== f.country) return false;
    if (era && era.test && !era.test(yearOf(s))) return false;
    if (terms.length) {
      const cats = Array.isArray(s.catalogue) ? s.catalogue.map(c => (c.system || '') + ' ' + (c.number || '')) : [];
      const hay = [s.title, s.country, s.year, s.issue, s.denomination, s.color, s.notes, s.grader, s.certNumber, s.grade, statusLabel(s.status), s.format && s.format.kind, s.location, s.gum].concat(cats).join(' ').toLowerCase();
      if (!terms.every(t => hay.includes(t))) return false;
    }
    return true;
  });
  const top = s => { const p = planningPrice(s); return p ? p.amount : -1; };
  const yr = s => { const y = yearOf(s); return y == null ? 9999 : y; };
  const sorters = {
    new: (a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')),
    value: (a, b) => top(b) - top(a),
    year: (a, b) => yr(a) - yr(b),
    country: (a, b) => String(a.country || '\uffff').localeCompare(String(b.country || '\uffff')) || yr(a) - yr(b)
  };
  return out.sort(sorters[f.sort] || sorters.new);
}

export function totals(list) {
  const by = {};
  for (const s of list) {
    const p = planningPrice(s);
    if (!p) continue;
    by[p.currency] = (by[p.currency] || 0) + p.amount;
  }
  return by;
}

/* ---------- Head and summary ---------- */

function renderHead() {
  $('#coll-name').textContent = (S.settings && S.settings.name) || 'Stamp collection';
  const writer = !!P.store && P.canWrite !== false;
  $('#rename').hidden = !writer || !$('#rename-form').hidden;
  $('#viewonly').hidden = !(P.store && P.canWrite === false);
  const st = $('#stats');
  if (P.storeState === 'none') { st.textContent = P.kind === 'claude' ? 'The collection is not available in this view.' : 'This browser cannot store a collection. Try another browser, or leave private browsing.'; return; }
  if (!S.loaded) { st.textContent = 'Loading the collection'; return; }
  const n = S.stamps.length;
  if (!n) { st.textContent = 'No stamps saved yet'; return; }
  const countries = new Set(S.stamps.map(s => s.country).filter(Boolean)).size;
  const t = totals(S.stamps);
  const tv = Object.entries(t).map(([c, v]) => fmtMoney(v, c)).join(' + ');
  st.textContent = joinDot([plural(n, 'item'), countries ? plural(countries, 'country', 'countries') : '', tv ? 'Planning value ' + tv : '']);
}

function renderSellSummary() {
  const box = $('#sell-summary');
  const sp = sellPrefs();
  const sum = sellSummary(S.stamps, { dest: sp.dest, rules: effectiveRules() });
  if (!sum.count) { box.hidden = true; return; }
  box.hidden = false;
  const names = Object.fromEntries(CHANNELS.map(c => [c.id, c.name]));
  const parts = Object.entries(sum.by).sort((a, b) => b[1] - a[1]).map(([id, n]) => (names[id] || id).replace(/ listing$/, '') + ' (' + n + ')');
  const cur = sum.currency === 'mixed' ? '' : sum.currency;
  box.replaceChildren(
    h('div', { class: 'sum-main' },
      h('span', { class: 'lbl', text: 'Selling plan' }),
      h('strong', { text: plural(sum.count, 'item') + ' for sale' }),
      sum.priced ? h('span', { class: 'sum-fig' }, 'Planning value ', h('b', { text: fmtMoney(sum.total, cur) }), ' · You would receive about ', h('b', { text: fmtMoney(sum.net, cur) })) : null),
    parts.length ? h('p', { class: 'hint', text: 'Best fit: ' + parts.join(', ') + '.' }) : null,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => { S.f.status = 'sell'; refreshStatus(); renderGrid(); } }, 'Show items for sale'),
      P.downloads ? h('button', { type: 'button', class: 'btn btn-small', onclick: () => exportCSV(true) }, 'Export selling list') : null));
}

/* ---------- Grid ---------- */

function card(s) {
  const ph = h('span', { class: 'card-ph' });
  const imgId = s.thumb || s.photo;
  if (imgId) {
    const img = h('img', { alt: '', loading: 'lazy' });
    ph.append(img);
    setImage(img, imgId, () => ph.replaceChildren(placeholderStamp(initials(s.country))));
  } else {
    ph.append(placeholderStamp(initials(s.country)));
  }
  const pp = planningPrice(s);
  const src = pp ? ({ comps: 'Comps', ai: 'AI', manual: 'Set' })[pp.source] : '';
  const b = h('button', { type: 'button', class: 'card', 'aria-label': joinDot([s.title, pp ? fmtMoney(pp.amount, pp.currency) : '', statusLabel(s.status)]) }, ph,
    h('span', { class: 'card-body' },
      h('span', { class: 'card-tags' }, h('span', { class: 'stag ' + (s.status || 'keep'), text: statusLabel(s.status) }),
        s.subject && s.subject !== 'single' ? h('span', { class: 'stag fmt', text: s.subject === 'cover' ? 'Cover' : 'Multiple' }) : null,
        s.sort ? h('span', { class: 'stag', text: 'Quick sort' }) : null,
        s.dupOf ? h('span', { class: 'stag expert', text: 'Copy?' }) : null),
      h('span', { class: 'card-t', text: s.title || 'Untitled stamp' }),
      h('span', { class: 'card-m', text: joinDot([s.country, s.year]) || ' ' }),
      h('span', { class: 'card-v' }, pp ? fmtMoney(pp.amount, pp.currency) : 'Not valued', src ? h('span', { class: 'card-src src-' + pp.source, text: src, title: ({ comps: 'Based on sold prices you recorded', ai: 'AI estimate', manual: 'Your price' })[pp.source] }) : null)));
  b.addEventListener('click', () => openDetail(s.id));
  return b;
}

export function renderGrid() {
  const grid = $('#grid'), empty = $('#empty'), none = $('#nomatch');
  if (P.storeState === 'none') {
    grid.replaceChildren();
    none.hidden = true;
    empty.hidden = false;
    $('#empty-title').textContent = 'The collection is not available here';
    $('#empty-body').textContent = P.kind === 'claude' ? 'Open this page in Claude to save and browse stamps.' : 'This browser blocks local storage. Try a normal window in Chrome, Edge, Firefox or Safari.';
    return;
  }
  if (!S.loaded) {
    grid.replaceChildren(...[0, 1, 2, 3].map(() => h('div', { class: 'skel', 'aria-hidden': 'true' })));
    empty.hidden = true;
    none.hidden = true;
    return;
  }
  const list = filterStamps(S.stamps, S.f);
  empty.hidden = S.stamps.length > 0;
  if (!S.stamps.length) {
    $('#empty-title').textContent = 'Start your collection';
    $('#empty-body').textContent = P.canWrite === false
      ? 'No stamps have been added yet. You can still scan stamps on the Scan tab.'
      : 'Scan a stamp, then choose Save to collection. Each item keeps its photo, value and its sources, condition notes, and certificate details.';
  }
  none.hidden = !(S.stamps.length > 0 && list.length === 0);
  grid.replaceChildren(...list.map(card));
}

export function renderCollection() {
  $('#count').textContent = String(S.stamps.length);
  const countries = Array.from(new Set(S.stamps.map(s => s.country).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const sel = $('#country');
  const keep = S.f.country;
  sel.replaceChildren(h('option', { value: 'all' }, 'All countries'), ...countries.map(c => h('option', { value: c }, c)));
  sel.value = countries.includes(keep) ? keep : 'all';
  S.f.country = sel.value;
  $('#export').hidden = !P.downloads;
  renderHead();
  renderSellSummary();
  renderGrid();
}

/* ---------- Chips ---------- */

function buildChips(sel, items, get, set) {
  const box = $(sel);
  const btns = items.map(([id, label]) => {
    const b = h('button', { type: 'button', class: 'chip', 'data-value': id, 'aria-pressed': String(get() === id) }, label);
    b.addEventListener('click', () => { set(id); btns.forEach((x, i) => x.setAttribute('aria-pressed', String(items[i][0] === id))); });
    return b;
  });
  box.replaceChildren(...btns);
  return () => btns.forEach((x, i) => x.setAttribute('aria-pressed', String(items[i][0] === get())));
}
let refreshEra = () => {};
let refreshStatus = () => {};

function clearFilters() {
  S.f.q = ''; S.f.era = 'all'; S.f.status = 'all'; S.f.country = 'all';
  $('#q').value = '';
  $('#country').value = 'all';
  refreshEra(); refreshStatus();
  renderGrid();
}

async function exportCSV(sellingOnly, forSharing) {
  if (!P.downloads) return;
  const list = sellingOnly ? S.stamps.filter(s => s.status === 'sell' || s.status === 'listed') : S.stamps;
  const csv = collectionCSV(list, { statusLabel, planning: planningPrice, priv: P.canWrite === true && !forSharing ? S.priv : null });
  try {
    await P.downloads.save({ filename: forSharing ? 'stamp-collection-to-share.csv' : sellingOnly ? 'stamps-for-sale.csv' : 'stamp-collection.csv', data: csv });
    toast('CSV saved');
  } catch (e) {
    const code = e && e.code;
    if (code === 'declined') return;
    toast(code === 'rate_limited' ? 'A save is already waiting. Finish that one first.' : 'Export is not available in this view.');
  }
}

/* ---------- Rename ---------- */

function startRename() {
  $('#rename-input').value = $('#coll-name').textContent;
  $('#rename-form').hidden = false;
  $('#rename').hidden = true;
  $('#rename-input').focus();
}
function endRename() {
  $('#rename-form').hidden = true;
  renderHead();
}
async function saveRename(e) {
  e.preventDefault();
  if (!P.store) return;
  const name = $('#rename-input').value.trim().slice(0, 80);
  try {
    await P.store.setSettings({ name, updatedAt: new Date().toISOString() });
    S.settings = { name };
    endRename();
    toast('Name saved');
  } catch (err) {
    const m = writeErrorMessage(err);
    if (m.readOnly) P.canWrite = false;
    toast(m.message);
  }
}

/* ---------- Detail sheet ---------- */

let sheetReturn = null, releaseSheetBack = null;
export function openDetail(id) {
  S.sheetId = id;
  if (!$('#sheet').hidden) { renderDetail(); return; }
  sheetReturn = document.activeElement;
  S.detailTab = 'overview';
  renderDetail();
  $('#sheet').hidden = false;
  document.body.classList.add('locked');
  releaseSheetBack = pushBack(closeSheet);
  $('#sheet-close').focus();
}
export function closeSheet() {
  if (releaseSheetBack) { const r = releaseSheetBack; releaseSheetBack = null; r(); }
  $('#sheet').hidden = true;
  if (!document.querySelector('.layer') && $('#settings').hidden) document.body.classList.remove('locked');
  S.sheetId = null;
  const r = sheetReturn;
  sheetReturn = null;
  if (r && r.isConnected && r.focus) r.focus();
}
export function renderDetail() {
  const s = S.stamps.find(x => x.id === S.sheetId);
  if (!s) { closeSheet(); return; }
  const pane = $('#sheet .pane');
  const keep = pane.scrollTop;
  $('#sheet-title').textContent = s.title || 'Stamp';
  $('#sheet-body').replaceChildren(savedCard(s));
  pane.scrollTop = keep;
}

/* ---------- Wiring ---------- */

export function bindCollection() {
  $('#q').addEventListener('input', e => { S.f.q = e.target.value; renderGrid(); });
  $('#sort').value = ['new', 'value', 'year', 'country'].includes(S.f.sort) ? S.f.sort : 'new';
  $('#sort').addEventListener('change', e => { S.f.sort = e.target.value; pref.set('sort', S.f.sort); renderGrid(); });
  $('#country').addEventListener('change', e => { S.f.country = e.target.value; renderGrid(); });
  refreshEra = buildChips('#era-chips', ERAS.map(e => [e.id, e.label]), () => S.f.era, v => { S.f.era = v; renderGrid(); });
  refreshStatus = buildChips('#status-chips', [['all', 'Any status']].concat(STATUSES.map(s => [s.id, s.label]), [['sorted', 'Quick sort only'], ['dups', 'Possible copies']]), () => S.f.status, v => { S.f.status = v; renderGrid(); });
  $('#export').addEventListener('click', () => exportCSV(false));
  $('#share-btn').addEventListener('click', () => {
    const p = $('#share-info');
    p.hidden = !p.hidden;
    $('#share-btn').setAttribute('aria-expanded', String(!p.hidden));
  });
  $('#rename').addEventListener('click', startRename);
  $('#rename-form').addEventListener('submit', saveRename);
  $('#rename-cancel').addEventListener('click', endRename);
  $('#clear-filters').addEventListener('click', clearFilters);
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#scrim').addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden && !document.querySelector('.layer')) closeSheet(); });
  on('close-detail', closeSheet);
  on('export-share', () => exportCSV(false, true));
}

/** Subscribe to the store and keep the view in sync. */
export function subscribeCollection() {
  if (!P.store) return;
  P.store.subscribeStamps(list => {
    S.stamps = list.map(upgradeStamp);
    S.loaded = true;
    renderCollection();
    if (S.sheetId) { if (S.stamps.some(x => x.id === S.sheetId)) renderDetail(); else closeSheet(); }
  }, () => {
    S.loaded = true;
    $('#stats').textContent = 'The collection could not load. Reload the page to try again.';
  });
  P.store.subscribeSettings(d => { S.settings = d || {}; renderHead(); });
}

let privSubscribed = false;
export function maybeSubscribePrivate() {
  if (privSubscribed || !P.store || P.canWrite !== true) return;
  privSubscribed = true;
  P.store.subscribePrivate(next => { S.priv = next; });
}
