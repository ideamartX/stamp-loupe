// Scan view: capture the front (and optionally the back), check the photo,
// then ask Claude to identify and value it.

import { $, h, icon, toast } from '../util/dom.js';
import { P, S, pref, emit, on, CURRENCIES } from './core.js';
import { SUBJECTS, processPhoto, buildCapture, rotateCapture, releaseCapture, fitBytes } from '../capture/still.js';
import { openLiveCamera } from '../capture/live.js';
import { openCropper } from '../capture/cropper.js';
import { idPrompt } from '../ai/prompts.js';
import { normalizeId } from '../ai/normalize.js';
import { PERMANENT } from '../ai/providers.js';
import { renderScanResult } from './stamp-view.js';
import { centeringFromCanvas, centeringSummary } from '../capture/centering.js';
import { isPageMode, renderPageShot, loadPagePhoto, pageGo, sortPage, renderPageResult, pageBackLink } from './page-scan.js';
import { signCapture, duplicateNote } from './dupes.js';
import { startProgress, progressText, stopProgress, showError } from './progress.js';
export { showError };

export const EXAMPLE = {
  is_stamp: true,
  title: 'Great Britain 1840 1d black (Penny Black)',
  country: 'Great Britain', year: '1840', issue: 'Penny Black', denomination: '1d', color: 'Black',
  design: 'Young Queen Victoria in profile, with check letters in the lower corners.',
  printing: 'Line engraved by Perkins, Bacon and Petch',
  perforation: 'Imperforate. Cut from the sheet with scissors.',
  watermark: 'Small Crown',
  format: { kind: 'single', count: 1, plate: '', markings: '', route: '' },
  origin: { printedIn: 'United Kingdom', printer: 'Perkins, Bacon and Petch', aiPrintedIn: 'United Kingdom' },
  catalogue: [{ system: 'Stanley Gibbons', number: '2', certainty: 'likely' }, { system: 'Scott', number: '1', certainty: 'likely' }],
  confidence: 'high',
  confidence_note: 'The design and corner letters are clear. The printing plate cannot be fixed from this photo.',
  alternates: [{ title: '1840 1d black VR official, never issued', how_to_tell: 'It has the letters V and R in the upper corners instead of the usual ornaments.' }],
  condition: { state: 'Used', centering: 'Design sits a little to the right', margins_or_perfs: 'Three clear margins. The right margin touches the frame line.', cancel: 'Red Maltese cross, light and clear of the face', faults: [], grade: 'Fine' },
  value: {
    currency: 'CAD', low: 100, high: 300, basis: 'Used, three margins, red Maltese cross. Example figures only.',
    drivers: ['Four clear margins can double the price.', 'The plate matters. Plate 11 is the scarcest.', 'A black Maltese cross is scarcer than red on this stamp.', 'Thins, creases, and repairs cut the value sharply.'],
    sources: [
      { kind: 'auction records', detail: 'Three-margin used examples with red cancels sell often at auction, which gives a steady price band.' },
      { kind: 'general knowledge', detail: 'Margins and plate move the price more than anything else on this stamp.' }
    ]
  },
  checks: ['Check the back for thins, creases, or old repairs.', 'Work out the plate from the corner letters and plate marks.', 'Confirm the Small Crown watermark.'],
  red_flags: [],
  expertize: { recommended: false, reason: 'A certificate costs more than it adds at this value. Get one if it proves to be Plate 11 or has four wide margins.' },
  story: 'The world\'s first adhesive postage stamp. It went on sale in May 1840 as part of Rowland Hill\'s reform, which set one price for a letter sent anywhere in Britain.',
  search_query: 'Penny Black 1840 used 3 margins',
  subject: 'single',
  pricing: {
    basis: 'auto', manual: null, catalogue: null,
    comps: [
      { id: 'ex1', venue: 'Auction house', date: '2026-06-14', price: 210, currency: 'CAD', condition: 'Used, 3 margins, red MX', url: '' },
      { id: 'ex2', venue: 'eBay', date: '2026-08-02', price: 165, currency: 'CAD', condition: 'Used, 3 margins, small thin', url: '' },
      { id: 'ex3', venue: 'HipStamp', date: '2026-09-21', price: 240, currency: 'CAD', condition: 'Used, 3 to 4 margins', url: '' }
    ]
  }
};

/* ---------- Shot slots ---------- */

function liveHint() {
  if (P.live) return 'Hold the phone over the stamp. The photo is taken for you when it is square, sharp, and free of glare.';
  if (P.kind === 'claude') return 'Your camera opens. After you shoot, the photo is straightened, cropped, and checked for focus and glare.';
  return 'Take or upload a photo. It is straightened, cropped, and checked for focus and glare.';
}

function chips(cap) {
  const ico = { pass: 'i-check', warn: 'i-warn', fail: 'i-x' };
  const box = h('div', { class: 'qchips', role: 'list', 'aria-label': 'Photo checks' },
    cap.checks.map(c => h('span', { class: 'qchip ' + c.state, role: 'listitem' }, icon(ico[c.state]), c.label)));
  const first = cap.checks.find(c => c.state === 'fail') || cap.checks.find(c => c.state === 'warn');
  const done = cap.checks.find(c => c.id === 'frame' && c.state === 'pass' && c.fix);
  return h('div', { class: 'qwrap' }, box,
    first ? h('p', { class: 'qfix ' + first.state, text: first.fix }) : done ? h('p', { class: 'qfix pass', text: done.fix }) : null);
}
export { chips as qualityChips };

/** Measurements taken on the device for every capture: centering and the duplicate signature. */
function measure(cap) {
  if (!cap || !cap.canvas) return cap;
  cap.centering = null;
  if (cap.subject === 'single') { try { cap.centering = centeringFromCanvas(cap.canvas); } catch (_) { cap.centering = null; } }
  signCapture(cap);
  return cap;
}

/** Free a capture's photo, unless the result on screen still shows it. */
function release(cap) {
  if (!cap) return;
  const r = S.resultShots || {};
  if (cap === r.front || cap === r.back) return;
  releaseCapture(cap);
}

function renderShot(side) {
  const host = $('#shot-' + side);
  const cap = S.shots[side];
  const front = side === 'front';
  if (isPageMode()) {
    host.hidden = !front;
    if (front) renderPageShot(host);
    return;
  }
  host.hidden = false;
  if (host.dataset.busy === '1') {
    host.replaceChildren(h('div', { class: 'shot-busy' }, h('div', { class: 'perfbar think' }, h('i')), h('p', { class: 'hint', text: 'Straightening and checking the photo' })));
    return;
  }
  if (!cap) {
    if (front) {
      const vf = h('div', { class: 'viewfinder', 'data-subject': S.subject, 'aria-hidden': 'true' },
        h('span', { class: 'gc tl' }), h('span', { class: 'gc tr' }), h('span', { class: 'gc br' }), h('span', { class: 'gc bl' }),
        h('div', { class: 'vf-art' }, ...(S.subject === 'block' ? [0, 1, 2, 3] : [0]).map(() => h('div', { class: 'ph-stamp' }, h('div', { class: 'perf' }, h('div', { class: 'ph-inner' }, icon('i-maltese', 'ph-cross')))))));
      host.replaceChildren(
        h('div', { class: 'shot-empty' }, vf,
          h('div', { class: 'row center' },
            h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'front-camera', onclick: () => camera('front') }, icon('i-camera'), P.live ? 'Scan with live guide' : 'Take photo'),
            h('button', { type: 'button', class: 'btn btn-lg', id: 'front-file', onclick: () => pickFile('front') }, icon('i-upload'), 'Upload')),
          h('p', { class: 'hint center', text: liveHint() })));
    } else {
      const backText = {
        single: ['Back of the stamp ', 'Shows gum, hinge marks, thins, and sometimes the watermark.'],
        block: ['Back of the block ', 'Shows gum, hinge marks, separations and thins.'],
        cover: ['Back of the cover ', 'Shows backstamps, transit and receiving marks, and repairs.']
      }[S.subject] || ['Back ', ''];
      host.replaceChildren(h('div', { class: 'back-empty' },
        h('p', { class: 'hint' }, h('strong', { text: backText[0] }), h('em', { text: 'optional' }), h('br'), backText[1]),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-small', id: 'back-camera', onclick: () => camera('back') }, icon('i-camera'), 'Photo of back'),
          h('button', { type: 'button', class: 'btn btn-small', id: 'back-file', onclick: () => pickFile('back') }, icon('i-upload'), 'Upload'))));
    }
    return;
  }
  const img = h('img', { src: cap.url, alt: (front ? 'Front' : 'Back') + ', straightened and cropped' });
  const mount = h('div', { class: 'mount' + (front ? '' : ' mount-small') }, img, front ? h('span', { class: 'loupe', id: 'loupe', hidden: !S.busy }) : null);
  const cent = front && cap.centering && cap.centering.ok ? cap.centering : null;
  host.replaceChildren(h('div', { class: 'shot-full' }, mount, chips(cap),
    cent ? h('p', { class: 'qfix pass', text: 'Centering: ' + cent.words + ', about ' + cent.low + ' to ' + cent.high + ' of 100.' }) : null,
    front ? duplicateNote(cap) : null,
    cap.state === 'fail' && front ? h('p', { class: 'callout warn', text: 'This photo may give a poor result. Retake it, or go ahead anyway.' }) : null,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => camera(side) }, icon('i-camera'), 'Retake'),
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => adjust(side) }, icon('i-crop'), 'Adjust corners'),
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => rotate(side) }, icon('i-rotate'), 'Rotate'),
      h('button', { type: 'button', class: 'btn btn-small btn-quiet', onclick: () => removeShot(side) }, 'Remove'))));
}

export function renderShots() {
  renderShot('front');
  renderShot('back');
  updateGo();
}

function setBusy(side, on) {
  $('#shot-' + side).dataset.busy = on ? '1' : '';
  renderShot(side);
}

async function accept(side, cap) {
  release(S.shots[side]);
  S.shots[side] = side === 'front' ? measure(cap) : cap;
  // A new front photo starts a new stamp, unless it was taken for a saved one.
  if (side === 'front') { S.upgradeId = S.upgradeNext || null; S.upgradeNext = null; }
  renderShots();
  $('#error').hidden = true;
  if (cap.state === 'pass') toast(side === 'front' ? 'Photo looks good' : 'Back added');
}

async function handleFile(side, file, origin) {
  if (!file) return;
  if (file.type && !/^image\//.test(file.type)) { toast('That file is not an image.'); return; }
  if (isPageMode()) { if (side === 'front') await loadPagePhoto(file, origin); return; }
  setBusy(side, true);
  try {
    const cap = await processPhoto(file, S.subject, origin);
    setBusy(side, false);
    await accept(side, cap);
  } catch (e) {
    setBusy(side, false);
    toast('That photo did not open. Try a JPEG or PNG.');
  }
}

/** Load a photo from outside the scan panel (a shared photo, for example). */
export function loadFile(side, file, origin) {
  return handleFile(side, file, origin || 'file');
}

export function pickFile(side) {
  const el = $('#' + side + '-file-input');
  el.value = '';
  el.click();
}

export async function camera(side) {
  // Page photos use the phone's own camera app, which gives full resolution.
  if (!P.live || isPageMode()) {
    const el = $('#' + side + '-cam-input');
    el.value = '';
    el.click();
    return;
  }
  const r = await openLiveCamera({ subject: S.subject, side, checklist: chips });
  if (!r) return;
  if (r.error) {
    toast(r.error === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser settings, or upload a photo.' : 'The camera did not start. Upload a photo instead.');
    return;
  }
  if (r.subject && r.subject !== S.subject && side === 'front') setSubject(r.subject);
  await accept(side, r);
}

async function adjust(side) {
  const cap = S.shots[side];
  if (!cap) return;
  const q = await openCropper({ src: cap.src, quad: cap.quad, title: 'Adjust corners' });
  if (!q) return;
  setBusy(side, true);
  try {
    const next = await buildCapture(cap.src, q === 'full' ? null : q, { subject: cap.subject, auto: false, origin: cap.origin, manualFull: q === 'full' });
    const shown = S.resultShots && (S.resultShots.front === cap || S.resultShots.back === cap);
    if (cap.url && !shown) URL.revokeObjectURL(cap.url);
    if (!shown) cap.src = null; // ownership moved to the new capture
    S.shots[side] = side === 'front' ? measure(next) : next;
  } finally {
    setBusy(side, false);
    renderShots();
  }
}

async function rotate(side) {
  const cap = S.shots[side];
  if (!cap) return;
  await rotateCapture(cap);
  if (side === 'front') measure(cap);
  renderShot(side);
}

function removeShot(side) {
  release(S.shots[side]);
  S.shots[side] = null;
  renderShots();
}

export function setSubject(v) {
  if (!SUBJECTS[v]) return;
  const prev = S.subject;
  S.subject = v;
  pref.set('subject', v);
  document.querySelectorAll('#subject-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
  const page = v === 'page';
  const depth = $('#depth-field');
  if (depth) depth.hidden = page;
  if (page || prev === 'page') {
    renderShots();
    // The result column follows the mode: the sorted page, or the single stamp.
    if (page && S.pageResult) renderPageResult();
    else if (prev === 'page' && !page) { renderScanResult(); pageBackLink(); }
    return;
  }
  if (S.shots.front) { S.shots.front.subject = v; measure(S.shots.front); renderShot('front'); }
  if (!S.shots.front) renderShot('front');
  if (!S.shots.back) renderShot('back');
}

/* ---------- Identify ---------- */

export function setMode(m) {
  S.mode = m;
  pref.set('mode', m);
  $('#mode-thorough').setAttribute('aria-pressed', String(m === 'thorough'));
  $('#mode-fast').setAttribute('aria-pressed', String(m === 'fast'));
}

export function updateGo() {
  const go = $('#go');
  if (!go) return;
  if (isPageMode()) {
    const st = pageGo();
    go.textContent = st.label;
    go.disabled = !st.enabled;
    go.dataset.action = st.action;
    $('#go-hint').hidden = st.hasPhoto || S.busy;
    $('#go-hint').textContent = 'Add a photo of the page to begin.';
    return;
  }
  $('#go-hint').textContent = 'Add a photo of the front to begin.';
  let label = 'Identify stamp';
  const ok = !!S.shots.front && !S.busy && P.aiState === 'ready';
  if (P.aiState === 'setup') label = 'Connect to Claude to identify';
  else if (P.aiState === 'blocked') label = 'Scanning is off for this visit';
  else if (P.aiState === 'none') label = 'Identifying is not available here';
  else if (P.aiState === 'noimages') label = 'Photo scanning is not available here';
  if (S.busy) label = 'Identifying...';
  go.textContent = label;
  go.disabled = !(ok || P.aiState === 'setup');
  go.dataset.action = P.aiState === 'setup' ? 'setup' : 'identify';
  $('#go-hint').hidden = !!S.shots.front || S.busy;
}

function readInputs() {
  return {
    country: $('#in-country').value.trim().slice(0, 120),
    perf: $('#in-perf').value.trim().slice(0, 60),
    wmk: $('#in-wmk').value.trim().slice(0, 120),
    gum: $('#in-gum').value,
    notes: $('#in-notes').value.trim().slice(0, 1200)
  };
}


export async function identify() {
  if ($('#go').dataset.action === 'setup') { emit('open-settings', 'ai'); return; }
  if (isPageMode()) { await sortPage(); return; }
  if (S.busy || !S.shots.front || !P.ai) return;
  const inputs = readInputs();
  const cur = $('#in-cur').value || 'CAD';
  const ai = P.ai;
  const hasBack = !!S.shots.back && ai.maxImages > 1;
  const shots = { front: S.shots.front, back: hasBack ? S.shots.back : null };
  const subject = S.subject;
  S.busy = true;
  S.ctl = new AbortController();
  startProgress();
  updateGo();
  try {
    const images = [await fitBytes(shots.front.canvas, ai.maxImageBytes * 0.95)];
    if (hasBack) images.push(await fitBytes(shots.back.canvas, ai.maxImageBytes * 0.95, 1600));
    const cent = shots.front.centering && shots.front.centering.ok ? shots.front.centering : null;
    const raw = await ai.json(idPrompt(inputs, cur, { subject, hasBack, centering: cent ? centeringSummary(cent) : '' }), {
      images, tier: S.mode, signal: S.ctl.signal, onText: ({ text }) => progressText(text.length)
    });
    const r = normalizeId(raw, cur);
    S.result = Object.assign(r, {
      subject,
      inputs,
      pricing: { basis: 'auto', manual: null, catalogue: null, comps: [] },
      capture: { state: shots.front.state, checks: shots.front.checks.map(c => ({ id: c.id, state: c.state })), origin: shots.front.origin || '' },
      measured: cent ? { centering: { ok: true, score: cent.score, low: cent.low, high: cent.high, band: cent.band, words: cent.words, lr: cent.lr, tb: cent.tb, method: cent.method, confidence: cent.confidence } } : null,
      sort: shots.front.sort || null
    });
    S.resultIsExample = false;
    S.resultInputs = inputs;
    const oldShots = S.resultShots;
    S.resultShots = shots;
    // The previous result's photos can go once nothing shows them.
    if (oldShots) for (const c of [oldShots.front, oldShots.back]) if (c && c !== S.shots.front && c !== S.shots.back && c !== shots.front && c !== shots.back) releaseCapture(c);
    S.savedId = null;
    S.resultTab = 'overview';
    renderScanResult();
    pageBackLink();
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
    updateGo();
  }
}

/* ---------- Wiring ---------- */

export function bindScan() {
  for (const side of ['front', 'back']) {
    $('#' + side + '-cam-input').addEventListener('change', e => handleFile(side, e.target.files && e.target.files[0], 'camera'));
    $('#' + side + '-file-input').addEventListener('change', e => handleFile(side, e.target.files && e.target.files[0], 'file'));
    const z = $('#shot-' + side);
    z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over'); });
    z.addEventListener('dragleave', () => z.classList.remove('over'));
    z.addEventListener('drop', e => {
      e.preventDefault();
      z.classList.remove('over');
      const f = Array.from((e.dataTransfer && e.dataTransfer.files) || []).find(x => /^image\//.test(x.type));
      if (f) handleFile(side, f, 'file');
    });
  }
  document.addEventListener('paste', e => {
    if (S.tab !== 'scan') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const f = Array.from((e.clipboardData && e.clipboardData.files) || []).find(x => /^image\//.test(x.type));
    if (f) { e.preventDefault(); handleFile(S.shots.front ? 'back' : 'front', f, 'file'); }
  });
  document.querySelectorAll('#subject-seg button').forEach(b => b.addEventListener('click', () => setSubject(b.dataset.value)));
  setSubject(S.subject);
  $('#mode-thorough').addEventListener('click', () => setMode('thorough'));
  $('#mode-fast').addEventListener('click', () => setMode('fast'));
  setMode(S.mode);
  const cur = $('#in-cur');
  cur.replaceChildren(...CURRENCIES.map(c => h('option', { value: c }, c)));
  const savedCur = pref.get('currency', 'CAD');
  cur.value = CURRENCIES.includes(savedCur) ? savedCur : 'CAD';
  cur.addEventListener('change', () => pref.set('currency', cur.value));
  $('#go').addEventListener('click', identify);
  $('#stop').addEventListener('click', () => { if (S.ctl) S.ctl.abort(); });

  // Page mode and other views talk to the scan panel through events.
  on('scan-refresh', renderShots);
  on('page-camera', () => camera('front'));
  on('page-file', () => pickFile('front'));
  on('set-subject', v => setSubject(v));
  on('scan-for', ({ id, label }) => {
    if (S.subject !== 'single') setSubject('single');
    S.upgradeNext = id;
    toast('Photograph ' + (label || 'the stamp') + '. Saving the result updates the stamp in your collection.');
  });
  on('use-capture', async ({ cap, upgradeId, label }) => {
    if (S.subject !== 'single') setSubject('single');
    release(S.shots.back);
    S.shots.back = null;
    await accept('front', cap);
    S.upgradeId = upgradeId || null;
    // The result column waits for this stamp instead of showing the last one.
    $('#result').replaceChildren(h('div', { class: 'result' }, h('div', { class: 'result-head' }, h('div', { class: 'head-text' },
      h('h2', { class: 'ttl', text: (label || 'The stamp') + ' is ready to identify' }),
      h('p', { class: 'note', text: 'Add a photo of the back if you can, then press Identify.' + (upgradeId ? ' Saving the result updates the stamp already in your collection.' : '') })))));
    pageBackLink();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('#capture').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    toast((label || 'The stamp') + ' is ready. Add a photo of the back if you can, then press Identify.');
  });
}
