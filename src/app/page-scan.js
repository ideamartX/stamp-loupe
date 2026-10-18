// Page mode: one photo of a whole album or stockbook page. Every stamp on it
// is found on the device, cropped, and sent to Claude on a numbered sheet for
// a quick sort. Stamps worth a closer look can then be identified on their own.

import { $, h, icon, toast, segmented } from '../util/dom.js';
import { newId, sha256Hex, plural, joinDot } from '../util/format.js';
import { P, S, emit } from './core.js';
import { decodeImage, drawScaled, buildCapture, toBlob, fitBytes } from '../capture/still.js';
import { openCropper } from '../capture/cropper.js';
import { pagePrompt } from '../ai/prompts.js';
import { normalizePage, bandLabel, BANDS } from '../ai/normalize.js';
import { PERMANENT } from '../ai/providers.js';
import { startProgress, progressText, setProgress, stopProgress, showError } from './progress.js';
import { signCanvas, matchCollection } from './dupes.js';
import { stampDoc } from './records.js';
import { writeErrorMessage } from '../store/claude-store.js';

// The page detector is only needed in page mode, so it loads on first use.
const pageEngine = () => import('../capture/page.js');

/** Stamps per sheet sent to Claude. One sheet is one AI call. */
export const PER_SHEET = 30;
const SVGNS = 'http://www.w3.org/2000/svg';

export const isPageMode = () => S.subject === 'page';

function svg(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k) el.append(k);
  return el;
}

/* ---------- State ---------- */

function releasePage() {
  const pg = S.page;
  if (pg && pg.url) URL.revokeObjectURL(pg.url);
  S.page = null;
}

function releasePageResult() {
  const pr = S.pageResult;
  if (pr) for (const it of pr.items) if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
  S.pageResult = null;
}

function kept() {
  return S.page ? S.page.items.filter(it => it.keep) : [];
}

/** The Sort button's state, for scan.js. */
export function pageGo() {
  const hasPhoto = !!S.page;
  if (P.aiState === 'setup') return { label: 'Connect to Claude to sort', enabled: true, action: 'setup', hasPhoto };
  if (P.aiState === 'blocked') return { label: 'Scanning is off for this visit', enabled: false, action: 'none', hasPhoto };
  if (P.aiState === 'none') return { label: 'Sorting is not available here', enabled: false, action: 'none', hasPhoto };
  if (P.aiState === 'noimages') return { label: 'Photo scanning is not available here', enabled: false, action: 'none', hasPhoto };
  if (S.busy) return { label: 'Sorting...', enabled: false, action: 'none', hasPhoto };
  const n = kept().length;
  if (!hasPhoto) return { label: 'Sort the page', enabled: false, action: 'none', hasPhoto };
  if (!n) return { label: 'Pick at least one stamp', enabled: false, action: 'none', hasPhoto };
  const sheets = Math.ceil(n / PER_SHEET);
  return { label: 'Sort ' + plural(n, 'stamp') + (sheets > 1 ? ' (' + sheets + ' sheets)' : ''), enabled: P.aiState === 'ready', action: 'identify', hasPhoto };
}

/* ---------- The page photo ---------- */

function pageArt() {
  return h('div', { class: 'viewfinder', 'data-subject': 'page', 'aria-hidden': 'true' },
    h('span', { class: 'gc tl' }), h('span', { class: 'gc tr' }), h('span', { class: 'gc br' }), h('span', { class: 'gc bl' }),
    h('div', { class: 'vf-art' }, [0, 1, 2, 3, 4, 5, 6, 7].map(() => h('div', { class: 'ph-stamp' }, h('div', { class: 'perf' }, h('div', { class: 'ph-inner' }))))));
}

export function renderPageShot(host) {
  if (S.pageBusy) {
    host.replaceChildren(h('div', { class: 'shot-busy' }, h('div', { class: 'perfbar think' }, h('i')), h('p', { class: 'hint', text: 'Finding the stamps on the page' })));
    return;
  }
  const pg = S.page;
  if (!pg) {
    host.replaceChildren(h('div', { class: 'shot-empty' }, pageArt(),
      h('div', { class: 'row center' },
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'front-camera', onclick: () => emit('page-camera') }, icon('i-camera'), 'Take photo'),
        h('button', { type: 'button', class: 'btn btn-lg', id: 'front-file', onclick: () => emit('page-file') }, icon('i-upload'), 'Upload')),
      h('p', { class: 'hint center', text: 'Photograph the whole page from straight above, in even light. Stamps on a black stockbook page are found most reliably.' })));
    return;
  }
  const n = pg.items.length, k = kept().length;
  const fig = h('div', { class: 'page-fig' }, h('img', { src: pg.url, alt: 'The album page, with each stamp outlined and numbered' }), overlay(pg));
  const sel = pg.sel != null ? pg.items[pg.sel] : null;
  const review = pg.items.filter(it => it.review && it.keep).length;
  host.replaceChildren(h('div', { class: 'page-shot' },
    fig,
    h('p', { class: 'hint', role: 'status' }, n
      ? 'Found ' + plural(n, 'stamp') + (k < n ? ', ' + k + ' to sort' : '') + '. Tap a stamp to leave it out or fix its outline.'
      : 'No stamps were found. Add them by hand, or retake the photo on a plain dark page.'),
    review ? h('p', { class: 'callout warn', text: plural(review, 'outline') + ' may hold more than one stamp, or a torn one. They are marked in amber. Check them before you sort.' }) : null,
    sel ? selectionBar(pg, sel) : null,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn btn-small', onclick: addItem }, 'Add a missed stamp'),
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => emit('page-camera') }, icon('i-camera'), 'Retake'),
      h('button', { type: 'button', class: 'btn btn-small btn-quiet', onclick: () => { releasePage(); emit('scan-refresh'); } }, 'Remove'))));
}

function overlay(pg) {
  const s = Math.max(pg.w, pg.h) / 1000;
  const root = svg('svg', { class: 'page-svg', viewBox: '0 0 ' + pg.w + ' ' + pg.h, preserveAspectRatio: 'none', role: 'group', 'aria-label': 'Stamps found on the page' });
  pg.items.forEach((it, i) => {
    const pts = it.quad.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const cls = 'pg-item' + (it.keep ? '' : ' off') + (it.review ? ' review' : '') + (pg.sel === i ? ' sel' : '');
    const tl = it.quad.reduce((a, p) => (p.x + p.y < a.x + a.y ? p : a), it.quad[0]);
    // Badges stay readable on a phone: about 3% of the photo's long side.
    const r = 32 * s;
    const g = svg('g', { class: cls, tabindex: '0', role: 'button', 'aria-label': 'Stamp ' + it.n + (it.keep ? '' : ', left out') },
      svg('polygon', { points: pts }),
      svg('circle', { cx: tl.x + r * 0.6, cy: tl.y + r * 0.6, r }),
      svg('text', { x: tl.x + r * 0.6, y: tl.y + r * 0.6 + 10 * s, 'font-size': 30 * s, 'text-anchor': 'middle' }, document.createTextNode(String(it.n))));
    const pick = () => { pg.sel = pg.sel === i ? null : i; emit('scan-refresh'); };
    g.addEventListener('click', pick);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    root.append(g);
  });
  return root;
}

function selectionBar(pg, it) {
  return h('div', { class: 'pg-bar', role: 'group', 'aria-label': 'Stamp ' + it.n },
    h('strong', { text: 'Stamp ' + it.n }),
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => { it.keep = !it.keep; emit('scan-refresh'); } }, it.keep ? 'Leave out' : 'Put back'),
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => adjustItem(it) }, icon('i-crop'), 'Fix outline'),
    h('button', { type: 'button', class: 'btn btn-small btn-quiet', onclick: () => { pg.sel = null; emit('scan-refresh'); } }, 'Done'));
}

async function adjustItem(it) {
  const pg = S.page;
  if (!pg) return;
  const q = await openCropper({ src: pg.photo, quad: it.quad, title: 'Fix the outline of stamp ' + it.n });
  if (!q || q === 'full') return;
  it.quad = q;
  it.review = false;
  it.keep = true;
  emit('scan-refresh');
}

async function addItem() {
  const pg = S.page;
  if (!pg) return;
  const w = pg.w * 0.18, hh = pg.h * 0.18, cx = pg.w / 2, cy = pg.h / 2;
  const start = [{ x: cx - w, y: cy - hh }, { x: cx + w, y: cy - hh }, { x: cx + w, y: cy + hh }, { x: cx - w, y: cy + hh }];
  const q = await openCropper({ src: pg.photo, quad: start, title: 'Outline the missed stamp' });
  if (!q || q === 'full') return;
  const n = pg.items.reduce((m, x) => Math.max(m, x.n), 0) + 1;
  pg.items.push({ quad: q, n, keep: true, manual: true, review: false });
  pg.sel = null;
  emit('scan-refresh');
}

/** Decode a page photo and find the stamps on it. */
export async function loadPagePhoto(file, origin) {
  S.pageBusy = true;
  emit('scan-refresh');
  try {
    const src = await decodeImage(file);
    const big = drawScaled(src, 3200).canvas;
    if (typeof src.close === 'function') { try { src.close(); } catch (_) { /* already closed */ } }
    const { findStampsInPhoto } = await pageEngine();
    const found = await findStampsInPhoto(big, {});
    const disp = await toBlob(drawScaled(big, 1600).canvas, 'image/jpeg', 0.85);
    releasePage();
    S.page = {
      photo: big, w: big.width, h: big.height, url: URL.createObjectURL(disp), origin: origin || 'file', sel: null,
      items: (found.items || []).map((it, i) => ({ quad: it.quad, n: i + 1, keep: true, review: !!it.review, edge: !!it.edge }))
    };
    const n = S.page.items.length;
    toast(n ? 'Found ' + plural(n, 'stamp') : 'No stamps found. Add them by hand, or retake the photo.');
  } catch (_) {
    toast('That photo did not open. Try a JPEG or PNG.');
  } finally {
    S.pageBusy = false;
    emit('scan-refresh');
  }
}

/* ---------- Sorting ---------- */

export async function sortPage() {
  const pg = S.page;
  if (!pg || S.busy || !P.ai) return;
  const items = kept();
  if (!items.length) return;
  const cur = $('#in-cur').value || 'CAD';
  const hint = { country: $('#in-country').value.trim().slice(0, 120), notes: $('#in-notes').value.trim().slice(0, 600) };
  S.busy = true;
  S.ctl = new AbortController();
  const sheetsN = Math.ceil(items.length / PER_SHEET);
  startProgress({ msg: 'Cropping the stamps', sub: sheetsN > 1 ? 'Each sheet of up to ' + PER_SHEET + ' stamps takes about a minute.' : 'Usually about a minute.' });
  emit('scan-refresh');
  try {
    const { cropItems, contactSheet } = await pageEngine();
    const crops = cropItems(pg.photo, items, { maxSide: 1200 });
    const { sheets } = contactSheet(crops, { perSheet: PER_SHEET });
    const answers = new Map();
    for (let si = 0; si < sheets.length; si++) {
      const sh = sheets[si];
      const nums = sh.cells.map(c => c.n);
      setProgress(sheets.length > 1 ? 'Sorting sheet ' + (si + 1) + ' of ' + sheets.length : 'Sorting the stamps', null, true);
      const img = await fitBytes(sh.canvas, P.ai.maxImageBytes * 0.95, 1900);
      const raw = await P.ai.json(pagePrompt({ count: nums.length, first: nums[0], last: nums[nums.length - 1], cur, country: hint.country, notes: hint.notes }), {
        images: [img], tier: 'fast', signal: S.ctl.signal, maxTokens: Math.min(8000, 700 + 140 * nums.length),
        onText: ({ text }) => progressText(text.length, { msg: 'Reading the answers', per: 45 })
      });
      for (const r of normalizePage(raw, cur, nums)) answers.set(r.n, r);
    }
    setProgress('Checking your collection for copies');
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const crop = crops[i];
      const a = answers.get(i + 1) || normalizePage(null, cur, [i + 1])[0];
      const sig = signCanvas(crop);
      const dup = (matchCollection(sig) || []).find(m => m.level === 'same') || null;
      const thumb = await toBlob(drawScaled(crop, 360).canvas, 'image/jpeg', 0.82);
      out.push(Object.assign({}, a, { n: items[i].n, crop, sig, dup, thumbUrl: URL.createObjectURL(thumb), savedId: null }));
    }
    releasePageResult();
    S.pageResult = { id: newId('pg'), at: new Date().toISOString(), cur, items: out, view: 'page', onlyLook: false };
    renderPageResult();
    if (window.matchMedia('(max-width: 919px)').matches) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      $('#result').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  } catch (e) {
    const code = e && e.code;
    if (code !== 'cancelled') {
      if (PERMANENT.includes(code)) P.aiState = 'blocked';
      showError(code, e && e.message);
    }
  } finally {
    S.busy = false;
    stopProgress();
    emit('scan-refresh');
  }
}

/* ---------- Results ---------- */

const BAND_RANK = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));

function bandChip(it, cur) {
  const cls = { under1: 'b0', '1to10': 'b1', '10to50': 'b2', '50to250': 'b3', over250: 'b4' }[it.band] || 'bx';
  return h('span', { class: 'band ' + cls, text: bandLabel(it.band, cur) });
}

function confWord(c) {
  return { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }[c] || 'Low confidence';
}

function itemCard(it, pr) {
  const cat = it.catalogue ? it.catalogue.system + ' ' + it.catalogue.number + (it.catalogue.certainty === 'likely' ? '' : ', unsure') : '';
  const save = h('button', { type: 'button', class: 'btn btn-small', disabled: !!it.savedId || P.canWrite === false || !P.store }, it.savedId ? 'Saved' : 'Save');
  save.addEventListener('click', () => saveItems([it]));
  const ident = h('button', { type: 'button', class: 'btn btn-small' + (it.look ? ' btn-primary' : '') }, 'Identify');
  ident.addEventListener('click', () => identifyItem(it));
  return h('li', { class: 'pr-card' + (it.look ? ' look' : '') + (it.isStamp ? '' : ' notstamp') },
    h('div', { class: 'pr-ph' }, h('img', { src: it.thumbUrl, alt: 'Stamp ' + it.n, loading: 'lazy', decoding: 'async' }), h('span', { class: 'pr-n', text: String(it.n) })),
    h('div', { class: 'pr-body' },
      h('p', { class: 'pr-t', text: it.isStamp ? it.title : 'Not a stamp' }),
      h('p', { class: 'pr-m', text: joinDot([cat, confWord(it.confidence)]) }),
      h('div', { class: 'card-tags' }, bandChip(it, pr.cur),
        it.look ? h('span', { class: 'stag expert', text: 'Worth a closer look' }) : null,
        it.dup ? h('span', { class: 'stag', text: 'In your collection' }) : null),
      it.reason ? h('p', { class: 'pr-r', text: it.reason }) : null,
      h('div', { class: 'row' }, ident, save)));
}

export function renderPageResult() {
  const pr = S.pageResult;
  const host = $('#result');
  if (!pr || !host) return;
  const n = pr.items.length;
  const look = pr.items.filter(i => i.look);
  const counts = {};
  for (const it of pr.items) counts[it.band] = (counts[it.band] || 0) + 1;
  let list = pr.onlyLook ? look : pr.items.slice();
  if (pr.view === 'value') list.sort((a, b) => (BAND_RANK[b.band] === 5 ? -1 : BAND_RANK[b.band]) - (BAND_RANK[a.band] === 5 ? -1 : BAND_RANK[a.band]) || (b.high || 0) - (a.high || 0));
  else list.sort((a, b) => a.n - b.n);
  const order = segmented([['page', 'Page order'], ['value', 'Highest value']], pr.view, v => { pr.view = v; renderPageResult(); }, 'Order');
  const onlyBtn = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(pr.onlyLook) }, 'Only worth a closer look');
  onlyBtn.addEventListener('click', () => { pr.onlyLook = !pr.onlyLook; renderPageResult(); });
  const unsaved = pr.items.filter(i => !i.savedId && i.isStamp);
  const canSave = !!P.store && P.canWrite !== false;
  const saveAll = h('button', { type: 'button', class: 'btn', disabled: !canSave || !unsaved.length }, unsaved.length ? 'Save all ' + unsaved.length : 'All saved');
  saveAll.addEventListener('click', () => saveItems(unsaved));
  const lookUnsaved = look.filter(i => !i.savedId && i.isStamp);
  const saveLook = lookUnsaved.length && lookUnsaved.length < unsaved.length
    ? h('button', { type: 'button', class: 'btn btn-primary', disabled: !canSave }, 'Save the ' + lookUnsaved.length + ' worth a closer look') : null;
  if (saveLook) saveLook.addEventListener('click', () => saveItems(lookUnsaved));
  host.replaceChildren(h('article', { class: 'result page-result', 'aria-label': 'Sorted page' },
    h('div', { class: 'ribbon' }, h('span', { class: 'tag' }, 'Page sort'), h('span', { text: plural(n, 'stamp') + ' · values in ' + pr.cur })),
    h('div', { class: 'pr-head' },
      h('h2', { class: 'ttl', text: plural(n, 'stamp') + ' sorted' }),
      h('p', { class: 'sub', text: look.length ? look.length + ' worth a closer look. Identify those on their own before you price them.' : 'Nothing stands out. Most album stamps are common.' }),
      h('div', { class: 'bands', role: 'list', 'aria-label': 'Stamps by value band' },
        BANDS.filter(b => counts[b.id]).map(b => h('span', { class: 'bandcount', role: 'listitem' }, bandChip({ band: b.id }, pr.cur), h('b', { text: String(counts[b.id]) })))),
      h('div', { class: 'row pr-tools' }, order.el, look.length ? onlyBtn : null)),
    h('ul', { class: 'pr-grid' }, list.map(it => itemCard(it, pr))),
    h('div', { class: 'actions pr-actions' }, saveLook, saveAll),
    h('p', { class: 'disclaimer', text: 'A quick sort from one photo of the page. Identify a stamp on its own before you rely on its value or catalogue number.' })));
}

/** Above a single-stamp result: a way back to the sorted page. */
export function pageBackLink() {
  const pr = S.pageResult;
  const host = $('#result');
  if (!pr || !host || isPageMode() || host.querySelector('.pr-back')) return;
  host.prepend(h('button', { type: 'button', class: 'btn btn-small pr-back', onclick: () => emit('set-subject', 'page') }, 'Back to the sorted page (' + plural(pr.items.length, 'stamp') + ')'));
}

async function identifyItem(it) {
  const pr = S.pageResult;
  try {
    const cap = await buildCapture(it.crop, null, { subject: 'single', origin: 'page', manualFull: true });
    cap.sort = { page: pr ? pr.id : '', n: it.n, band: it.band };
    emit('use-capture', { cap, upgradeId: it.savedId || null, label: 'Stamp ' + it.n });
  } catch (_) {
    toast('That stamp could not be opened. Try sorting the page again.');
  }
}

function sortedStamp(it, pr) {
  return {
    title: it.title, country: it.country, year: it.year, issue: '', denomination: it.denomination, color: it.color,
    format: { kind: 'single', count: 1, plate: '', markings: '', route: '' }, origin: null,
    catalogue: it.catalogue ? [it.catalogue] : [], confidence: it.confidence, confidence_note: it.reason || '',
    condition: { state: '', centering: '', margins_or_perfs: '', cancel: '', faults: [], grade: '' },
    value: {
      currency: pr.cur, low: it.low, high: it.high, basis: 'A quick sort from a photo of the whole page.', drivers: [],
      sources: [{ kind: 'general knowledge', detail: 'A quick sort of a whole album page. Identify this stamp on its own before you rely on the value.' }]
    },
    checks: it.look && it.reason ? [it.reason] : [], search_query: it.title, subject: 'single',
    capture: { origin: 'page' },
    sort: { page: pr.id, n: it.n, band: it.band, look: !!it.look, at: pr.at }
  };
}

async function saveItems(list) {
  const pr = S.pageResult;
  if (!pr || !P.store || P.canWrite === false) { toast('Saving is not available here.'); return; }
  let n = 0;
  for (const it of list) {
    if (it.savedId || !it.isStamp) continue;
    try {
      const full = await toBlob(drawScaled(it.crop, 1600).canvas, 'image/jpeg', 0.88);
      const thumb = await toBlob(drawScaled(it.crop, 480).canvas, 'image/jpeg', 0.82);
      let photoHash = '';
      try { photoHash = await sha256Hex(await full.arrayBuffer()); } catch (_) { photoHash = ''; }
      let photo = null, thumbId = null;
      if (P.store.hasImages) { photo = await P.store.putImage(full); thumbId = await P.store.putImage(thumb); }
      const id = newId();
      const now = new Date().toISOString();
      await P.store.addStamp(id, stampDoc(sortedStamp(it, pr), { photo, thumb: thumbId, photoHash, sig: it.sig, dupOf: it.dup ? it.dup.id : '', now }));
      it.savedId = id;
      n++;
    } catch (e) {
      const m = writeErrorMessage(e);
      if (m.readOnly) P.canWrite = false;
      toast(m.message);
      break;
    }
  }
  if (n) toast('Saved ' + plural(n, 'stamp') + ' to the collection');
  renderPageResult();
}
