// Stamp Loupe entry point. Detects where it is running:
//   - inside a Claude artifact: Claude account for AI, artifact storage
//   - anywhere else: Claude API (own key or proxy), IndexedDB on the device
// and wires the views together.

import { $, h, toast, enableBackButton } from './util/dom.js';
import { newId, sha256Hex } from './util/format.js';
import { P, S, on, emit, pref } from './app/core.js';
import { bindScan, renderShots, updateGo, EXAMPLE } from './app/scan.js';
import { renderScanResult, updateSaveBtn } from './app/stamp-view.js';
import { bindCollection, renderCollection, renderDetail, subscribeCollection, maybeSubscribePrivate, openDetail } from './app/collection.js';
import { bindSettings, openSettings, readAIConfig } from './app/settings.js';
import { claudeProvider, anthropicProvider } from './ai/providers.js';
import { claudeStore, writeErrorMessage } from './store/claude-store.js';
import { localStore } from './store/local-store.js';
import { liveCameraSupported } from './capture/live.js';
import { initPWA, applyUpdate, takeSharedFiles } from './app/pwa.js';
import { setSubject, loadFile } from './app/scan.js';
import { stampDoc } from './app/records.js';

/* ---------- Tabs ---------- */
function setTab(t) {
  S.tab = t;
  for (const id of ['scan', 'collection']) {
    const on_ = id === t;
    const tab = $('#tab-' + id);
    tab.setAttribute('aria-selected', String(on_));
    tab.tabIndex = on_ ? 0 : -1;
    $('#view-' + id).hidden = !on_;
  }
  try { history.replaceState(null, '', '#' + t); } catch (_) { /* sandboxed */ }
}

/* ---------- Saving a scan ---------- */
async function saveResult() {
  const b = $('#save-btn');
  if (b && b.dataset.mode === 'open' && S.savedId) { setTab('collection'); openDetail(S.savedId); return; }
  if (!P.store || !S.result || S.resultIsExample || S.saving || P.canWrite === false) return;
  S.saving = true;
  updateSaveBtn();
  const shots = S.resultShots || {};
  try {
    let photo = null, thumb = null, back = null, photoHash = '';
    if (shots.front) {
      try { photoHash = await sha256Hex(await shots.front.full.arrayBuffer()); } catch (_) { photoHash = ''; }
      if (P.store.hasImages) {
        photo = await P.store.putImage(shots.front.full);
        thumb = await P.store.putImage(shots.front.thumb);
        if (shots.back) back = await P.store.putImage(shots.back.full);
      }
    }
    const now = new Date().toISOString();
    const front = shots.front || {};
    const same = (front.dups || []).find(m => m.level === 'same');
    const doc = stampDoc(S.result, { photo, thumb, back, photoHash, sig: front.sig || null, dupOf: same ? same.id : '', now });
    // A stamp first saved from a page sort is upgraded in place, keeping its status and notes.
    const upgrade = S.upgradeId && S.stamps.some(s => s.id === S.upgradeId) ? S.upgradeId : null;
    if (upgrade) {
      const old = S.stamps.find(s => s.id === upgrade);
      const keep = { status: old.status, notes: old.notes, addedAt: old.addedAt, pricing: Object.assign({}, doc.pricing, { comps: (old.pricing && old.pricing.comps) || [] }), sort: null, dupOf: old.dupOf || doc.dupOf };
      await P.store.updateStamp(upgrade, Object.assign({}, doc, keep));
      for (const k of ['photo', 'thumb', 'back']) if (old[k] && old[k] !== doc[k] && P.store.deleteImage) P.store.deleteImage(old[k]).catch(() => {});
      S.savedId = upgrade;
      S.upgradeId = null;
      toast('Updated in the collection');
    } else {
      const id = newId();
      await P.store.addStamp(id, doc);
      S.savedId = id;
      toast(doc.dupOf ? 'Saved. It looks like a stamp you already have.' : 'Saved to the collection');
    }
  } catch (e) {
    const m = writeErrorMessage(e);
    if (m.readOnly) P.canWrite = false;
    toast(m.message);
  } finally {
    S.saving = false;
    updateSaveBtn();
  }
}

/* ---------- Standalone helpers ---------- */
function configureStandaloneAI() {
  const cfg = readAIConfig();
  if (cfg.proxyUrl || cfg.apiKey) { P.ai = anthropicProvider(cfg); P.aiState = 'ready'; }
  else { P.ai = null; P.aiState = 'setup'; }
  updateGo();
}

function browserDownloads() {
  return {
    async save({ filename, data }) {
      const type = /\.csv$/i.test(filename) ? 'text/csv' : /\.json$/i.test(filename) ? 'application/json' : 'application/octet-stream';
      const blob = data instanceof Blob ? data : new Blob([data], { type });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: filename, hidden: true });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return { status: 'saved' };
    }
  };
}

function platformCopy() {
  $('#fine').textContent = P.kind === 'claude'
    ? 'Your photo goes to Claude on your own account, and the first scan asks you to allow that. Nothing is stored until you choose Save to collection.'
    : 'Your photo goes to Anthropic\'s Claude API, using your key or your proxy. Your collection stays in this browser.';
  const share = $('#share-info');
  share.replaceChildren(...(P.kind === 'claude'
    ? [h('p', null, h('strong', { text: 'Share this page from Claude.' }), ' Use the Share button at the top of the page. Anyone you share with can browse, search, and scan.'),
      h('p', { text: 'They see the stamps, photos, values, and certificate numbers. Custody and purchase details stay visible only to you and anyone you make an editor.' })]
    : [h('p', null, h('strong', { text: 'This collection lives in this browser.' }), ' To share it, send a sharing CSV. It leaves out custody and purchase details.'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-small', id: 'export-share', onclick: () => emit('export-share') }, 'Export sharing CSV'))]));
}

/* ---------- Installed app: updates, shortcuts and shared photos ---------- */
function showUpdateReady() {
  if ($('#update-banner')) return;
  const bar = h('div', { class: 'banner', id: 'update-banner', role: 'status' },
    h('p', { text: 'A new version of Stamp Loupe is ready.' }),
    h('button', { type: 'button', class: 'btn btn-small btn-primary', onclick: () => applyUpdate() }, 'Update now'));
  $('main').prepend(bar);
}

async function handleLaunchParams() {
  const q = new URLSearchParams(location.search);
  if (!q.has('scan') && !q.has('shared')) return;
  setTab('scan');
  const scan = q.get('scan');
  if (scan === 'page' || scan === 'single') setSubject(scan);
  if (q.get('shared') === '1') {
    const files = (await takeSharedFiles()).filter(f => !f.type || /^image\//.test(f.type));
    if (files.length) {
      await loadFile('front', files[0], 'file');
      if (files[1] && S.subject !== 'page') await loadFile('back', files[1], 'file');
      toast(files.length > 1 && S.subject !== 'page' ? 'Front and back added' : 'Photo added');
    }
  }
  try { history.replaceState(null, '', location.pathname + '#' + S.tab); } catch (_) { /* sandboxed */ }
}

function backupReminder() {
  if (P.kind !== 'standalone' || !S.stamps.length) return;
  const last = pref.get('lastBackup', null);
  const days = last ? (Date.now() - new Date(last).getTime()) / 86400000 : Infinity;
  if (S.stamps.length >= 5 && days > 30) {
    const box = $('#backup-nudge');
    box.hidden = false;
  }
}

/* ---------- Boot ---------- */
function boot() {
  bindScan();
  bindCollection();
  bindSettings();
  $('#tab-scan').addEventListener('click', () => setTab('scan'));
  $('#tab-collection').addEventListener('click', () => setTab('collection'));
  $('.tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = S.tab === 'scan' ? 'collection' : 'scan';
    setTab(next);
    $('#tab-' + next).focus();
    e.preventDefault();
  });
  $('#brand').addEventListener('click', e => { e.preventDefault(); setTab('scan'); });
  $('#empty-scan').addEventListener('click', () => setTab('scan'));
  $('#backup-now').addEventListener('click', () => openSettings('data'));

  S.result = JSON.parse(JSON.stringify(EXAMPLE));
  S.resultIsExample = true;
  renderScanResult();
  setTab(location.hash === '#collection' ? 'collection' : 'scan');

  on('open-settings', section => openSettings(section));
  on('switch-tab', t => setTab(t));
  on('open-stamp', id => { setTab('collection'); openDetail(id); });
  on('save-result', saveResult);
  on('sell-settings', () => { renderCollection(); renderScanResult(); if (S.sheetId) renderDetail(); });

  const c = window.claude;
  if (c && typeof c.use === 'function') {
    P.kind = 'claude';
    P.live = false;
    platformCopy();
    renderShots();
    renderCollection();
    c.use('sample').then(async sample => {
      if (!sample) { P.aiState = 'none'; return; }
      const lim = await sample.limits().catch(() => null);
      P.ai = claudeProvider(sample, lim);
      P.aiState = P.ai.images ? 'ready' : 'noimages';
    }).catch(() => { P.aiState = 'none'; }).finally(() => { updateGo(); });

    c.use('user').then(async u => {
      let w = null;
      if (u) {
        try { w = await u.can('data.write'); } catch (_) { w = null; }
        if (w === null) { try { if (await u.canEdit()) w = true; } catch (_) { /* unknown */ } }
      }
      P.canWrite = w;
    }).catch(() => {}).finally(() => { maybeSubscribePrivate(); renderCollection(); updateSaveBtn(); });

    Promise.all([c.use('db').catch(() => null), c.use('assets').catch(() => null)]).then(([db, assets]) => {
      if (db) { P.store = claudeStore({ db, assets }); P.storeState = 'ready'; subscribeCollection(); }
      else P.storeState = 'none';
    }).finally(() => { maybeSubscribePrivate(); renderCollection(); updateSaveBtn(); });

    c.use('downloads').then(d => { P.downloads = d; renderCollection(); }).catch(() => {});
  } else {
    P.kind = 'standalone';
    P.live = liveCameraSupported('standalone');
    P.canWrite = true;
    enableBackButton();
    P.downloads = browserDownloads();
    platformCopy();
    configureStandaloneAI();
    on('ai-config', configureStandaloneAI);
    renderShots();
    renderCollection();
    initPWA({ onUpdateReady: showUpdateReady, onInstallChange: () => emit('install-change') });
    handleLaunchParams();
    localStore().then(st => {
      P.store = st;
      P.storeState = 'ready';
      subscribeCollection();
      maybeSubscribePrivate();
      setTimeout(backupReminder, 1500);
    }).catch(() => { P.storeState = 'none'; }).finally(() => { renderCollection(); updateSaveBtn(); });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
