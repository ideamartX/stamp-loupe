// Settings sheet: Claude connection (standalone), selling defaults, fee and
// postage assumptions, data on this device, and about.

import { $, h, icon, toast, field, textInput, numberInput, selectInput, segmented, pushBack } from '../util/dom.js';
import { fmtMoney, plural, newId } from '../util/format.js';
import { P, S, pref, emit, on, sellPrefs, VERSION, STATUSES } from './core.js';
import { stampDoc } from './records.js';
import { canInstall, promptInstall, isIOS, isStandalone } from './pwa.js';
import { writeErrorMessage } from '../store/claude-store.js';
import { RULES } from '../sell/rules.js';
import { DESTINATIONS } from '../sell/planner.js';
import { MODELS, DEFAULT_MODELS } from '../ai/providers.js';

/* ---------- Claude API configuration (standalone) ---------- */

export function readAIConfig() {
  const saved = pref.get('ai', {}) || {};
  let secrets = {};
  if (saved.remember) secrets = { apiKey: saved.apiKey || '', proxyToken: saved.proxyToken || '' };
  else { try { secrets = JSON.parse(sessionStorage.getItem('stamp-loupe.ai.secrets') || '{}') || {}; } catch (_) { secrets = {}; } }
  return {
    apiKey: secrets.apiKey || '',
    proxyToken: secrets.proxyToken || '',
    remember: !!saved.remember,
    proxyUrl: saved.proxyUrl || '',
    models: Object.assign({}, DEFAULT_MODELS, saved.models || {})
  };
}

// The API key and the proxy access code are secrets. They are kept in
// localStorage only when "Remember on this device" is on; otherwise they live
// in sessionStorage and are gone when the tab closes.
function writeAIConfig(cfg) {
  const out = { proxyUrl: cfg.proxyUrl || '', models: cfg.models, remember: !!cfg.remember };
  if (cfg.remember) { out.apiKey = cfg.apiKey || ''; out.proxyToken = cfg.proxyToken || ''; }
  pref.set('ai', out);
  try {
    if (cfg.remember) sessionStorage.removeItem('stamp-loupe.ai.secrets');
    else sessionStorage.setItem('stamp-loupe.ai.secrets', JSON.stringify({ apiKey: cfg.apiKey || '', proxyToken: cfg.proxyToken || '' }));
  } catch (_) { /* session storage blocked */ }
}

function aiSection() {
  if (P.kind === 'claude') {
    return h('section', { class: 'sec' }, h('h3', { text: 'Claude' }),
      h('p', { text: 'This page uses your Claude account. There is nothing to set up. The first scan asks you to allow it.' }));
  }
  const cfg = readAIConfig();
  const how = segmented([['key', 'My API key'], ['proxy', 'A proxy server']], cfg.proxyUrl ? 'proxy' : 'key', v => { keyBox.hidden = v !== 'key'; proxyBox.hidden = v !== 'proxy'; }, 'Connection type');
  const key = h('input', { type: 'password', id: 'set-key', autocomplete: 'off', spellcheck: 'false', placeholder: 'sk-ant-...' });
  key.value = cfg.apiKey;
  const remember = h('input', { type: 'checkbox', id: 'set-remember' });
  remember.checked = cfg.remember;
  const keyBox = h('div', { class: 'fields', hidden: !!cfg.proxyUrl },
    field('Claude API key', key, 'Create one in the Claude Console. Set a monthly spend limit there. The key is sent only to Anthropic.'));
  const proxy = h('input', { type: 'url', id: 'set-proxy', autocomplete: 'off', placeholder: 'https://stamp-loupe-proxy.example.workers.dev' });
  proxy.value = cfg.proxyUrl;
  const token = h('input', { type: 'password', id: 'set-token', autocomplete: 'off', placeholder: 'Optional access code' });
  token.value = cfg.proxyToken;
  const proxyBox = h('div', { class: 'fields', hidden: !cfg.proxyUrl },
    field('Proxy address', proxy, 'A server you run that holds the API key, such as the Cloudflare Worker in the server folder.'),
    field('Access code', token));
  const rememberRow = h('div', { class: 'fields' },
    h('label', { class: 'check', for: 'set-remember' }, remember, ' Remember on this device'),
    h('p', { class: 'hint', text: 'With this on, the key or access code stays in this browser until you choose Forget, so anyone who uses this browser profile could use it. With it off, it is cleared when you close the tab. Leave it off on shared computers.' }));
  const thorough = selectInput('set-m-thorough', MODELS, cfg.models.thorough);
  const fast = selectInput('set-m-fast', MODELS, cfg.models.fast);
  const status = h('p', { class: 'hint', role: 'status' }, P.aiState === 'ready' ? 'Connected: ' + P.ai.label + '.' : 'Not connected yet.');
  const save = h('button', { type: 'button', class: 'btn btn-primary' }, 'Save and test');
  save.addEventListener('click', async () => {
    const useProxy = how.get() === 'proxy';
    const next = {
      apiKey: useProxy ? '' : key.value.trim(),
      remember: remember.checked,
      proxyUrl: useProxy ? proxy.value.trim().replace(/\/+$/, '') : '',
      proxyToken: useProxy ? token.value.trim() : '',
      models: { thorough: thorough.value, fast: fast.value }
    };
    if (!useProxy && !/^sk-ant-/.test(next.apiKey)) { status.textContent = 'That does not look like a Claude API key. It starts with sk-ant-.'; return; }
    if (useProxy && !/^https:\/\//.test(next.proxyUrl)) { status.textContent = 'Enter the full https:// address of your proxy.'; return; }
    writeAIConfig(next);
    emit('ai-config');
    save.disabled = true;
    status.textContent = 'Testing the connection...';
    try {
      const r = await P.ai.json('Reply with only this JSON: {"ok": true}', { tier: 'fast', maxTokens: 20 });
      status.textContent = r && r.ok ? 'Connected. You can identify stamps now.' : 'Connected, but the reply was unexpected. Try a scan.';
    } catch (e) {
      status.textContent = 'The test failed: ' + ((e && e.message) || (e && e.code) || 'unknown error') + '.';
    } finally {
      save.disabled = false;
    }
  });
  const forget = h('button', { type: 'button', class: 'btn btn-quiet' }, 'Forget key');
  forget.addEventListener('click', () => {
    pref.remove('ai');
    try { sessionStorage.removeItem('stamp-loupe.ai.secrets'); } catch (_) { /* blocked */ }
    key.value = ''; proxy.value = ''; token.value = '';
    emit('ai-config');
    status.textContent = 'Removed from this device.';
  });
  return h('section', { class: 'sec', id: 'settings-ai' }, h('h3', { text: 'Connect to Claude' }),
    h('p', { text: 'Identifying stamps and writing listings use the Claude API. Each scan costs a few cents in API fees.' }),
    h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Connect with' }), how.el),
    keyBox, proxyBox, rememberRow,
    h('div', { class: 'two' }, field('Thorough scans', thorough), field('Faster scans', fast)),
    h('div', { class: 'row' }, save, forget), status);
}

/* ---------- Selling defaults and assumptions ---------- */

function pctInput(id, v) { return numberInput(id, v == null ? '' : Math.round(v * 10000) / 100, { min: 0, max: 100, step: '0.01' }); }
function moneyInput(id, v) { return numberInput(id, v == null ? '' : v, { min: 0, step: '0.01' }); }

function sellingSection() {
  const sp = sellPrefs();
  const fees = JSON.parse(JSON.stringify(RULES.fees));
  for (const [k, v] of Object.entries(sp.fees || {})) if (fees[k]) Object.assign(fees[k], v);
  const post = JSON.parse(JSON.stringify(RULES.postage));
  for (const [k, v] of Object.entries(sp.postage || {})) { if (post[k] && typeof post[k] === 'object') Object.assign(post[k], v); else if (k === 'supplies') post.supplies = v; }

  const from = textInput('set-from', sp.shipFrom, 'Yukon, Canada');
  const dest = selectInput('set-dest', DESTINATIONS, sp.dest);
  const cert = moneyInput('set-cert', Number.isFinite(sp.certCost) ? sp.certCost : RULES.certificate.cost);

  const ebayStore = h('input', { type: 'checkbox', id: 'f-ebay-store' });
  ebayStore.checked = !!fees.ebay.store;
  const F = {
    ebayRate: pctInput('f-ebay-rate', fees.ebay.rate), ebayStoreRate: pctInput('f-ebay-srate', fees.ebay.storeRate),
    ebayUS: pctInput('f-ebay-us', fees.ebay.intlUS), ebayIntl: pctInput('f-ebay-intl', fees.ebay.intlOther),
    ebayOrderS: moneyInput('f-ebay-os', fees.ebay.perOrderSmall), ebayOrderL: moneyInput('f-ebay-ol', fees.ebay.perOrderLarge),
    hsRate: pctInput('f-hs-rate', fees.hipstamp.rate), hsCap: moneyInput('f-hs-cap', fees.hipstamp.cap),
    hsPay: pctInput('f-hs-pay', fees.hipstamp.payRate), hsFixed: moneyInput('f-hs-fixed', fees.hipstamp.payFixed),
    dcPay: pctInput('f-dc-pay', fees.delcampe.payRate), dcBuyer: pctInput('f-dc-buyer', fees.delcampe.buyerRate),
    auComm: pctInput('f-au-comm', fees.auction.commission), auBP: pctInput('f-au-bp', fees.auction.buyerPremium),
    dlShare: pctInput('f-dl-share', fees.dealer.share), lotShare: pctInput('f-lot-share', fees.lot.share)
  };
  const Q = {
    caL: moneyInput('p-ca-l', post.CA.letter), caT: moneyInput('p-ca-t', post.CA.tracked),
    usT: moneyInput('p-us-t', post.US.tracked), usDecl: moneyInput('p-us-d', post.US.declarationFee),
    inL: moneyInput('p-in-l', post.INTL.letter), inT: moneyInput('p-in-t', post.INTL.tracked),
    sup: moneyInput('p-sup', post.supplies)
  };
  const num = el => (el.value === '' ? null : Number(el.value));
  const pct = el => (el.value === '' ? null : Number(el.value) / 100);
  const save = h('button', { type: 'button', class: 'btn btn-primary' }, 'Save selling settings');
  save.addEventListener('click', () => {
    const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && Number.isFinite(v)));
    const next = {
      shipFrom: from.value.trim().slice(0, 80) || 'Canada',
      dest: dest.value,
      certCost: num(cert),
      fees: {
        ebay: Object.assign(clean({ rate: pct(F.ebayRate), storeRate: pct(F.ebayStoreRate), intlUS: pct(F.ebayUS), intlOther: pct(F.ebayIntl), perOrderSmall: num(F.ebayOrderS), perOrderLarge: num(F.ebayOrderL) }), { store: ebayStore.checked }),
        hipstamp: clean({ rate: pct(F.hsRate), cap: num(F.hsCap), payRate: pct(F.hsPay), payFixed: num(F.hsFixed) }),
        delcampe: clean({ payRate: pct(F.dcPay), buyerRate: pct(F.dcBuyer) }),
        auction: clean({ commission: pct(F.auComm), buyerPremium: pct(F.auBP) }),
        dealer: clean({ share: pct(F.dlShare) }),
        lot: clean({ share: pct(F.lotShare) })
      },
      postage: {
        CA: clean({ letter: num(Q.caL), tracked: num(Q.caT) }),
        US: clean({ tracked: num(Q.usT), declarationFee: num(Q.usDecl) }),
        INTL: clean({ letter: num(Q.inL), tracked: num(Q.inT) }),
        supplies: num(Q.sup)
      }
    };
    if (next.postage.supplies == null) delete next.postage.supplies;
    pref.set('sell', next);
    emit('sell-settings');
    toast('Selling settings saved');
  });
  const reset = h('button', { type: 'button', class: 'btn btn-quiet' }, 'Reset to defaults');
  reset.addEventListener('click', () => {
    pref.remove('sell');
    emit('sell-settings');
    emit('open-settings', 'selling');
    toast('Back to the default figures');
  });
  const grp = (title, ...kids) => h('fieldset', { class: 'grp' }, h('legend', { text: title }), h('div', { class: 'grid2' }, ...kids));
  const lab = (label, input, unit) => h('div', { class: 'field' }, h('label', { for: input.id }, label + (unit ? ' (' + unit + ')' : '')), input);
  return h('section', { class: 'sec', id: 'settings-selling' }, h('h3', { text: 'Selling' }),
    h('div', { class: 'three' }, field('Ships from', from), field('Usual buyer location', dest), lab('Certificate cost', cert, 'CAD')),
    h('p', { class: 'hint', text: 'Default figures checked ' + RULES.asOf + '. Items marked estimate are not published by the provider. Fees, postage and duties change, so check them before you rely on a plan.' }),
    grp('eBay.ca',
      h('label', { class: 'check span2', for: 'f-ebay-store' }, ebayStore, ' I have an eBay Store'),
      lab('Final value fee, no store', F.ebayRate, '%'), lab('Final value fee, with a store', F.ebayStoreRate, '%'),
      lab('International fee, U.S. buyers', F.ebayUS, '%'), lab('International fee, other buyers', F.ebayIntl, '%'),
      lab('Per-order fee, orders up to $10', F.ebayOrderS, 'CAD'), lab('Per-order fee, larger orders', F.ebayOrderL, 'CAD')),
    grp('HipStamp', lab('Commission', F.hsRate, '%'), lab('Commission cap per item', F.hsCap, 'CAD'), lab('PayPal fee (estimate)', F.hsPay, '%'), lab('PayPal fixed fee (estimate)', F.hsFixed, 'CAD')),
    grp('Delcampe', lab('Your payment fee', F.dcPay, '%'), lab('Fee buyers pay on top', F.dcBuyer, '%')),
    grp('Auction houses', lab('Seller commission (ask the house)', F.auComm, '%'), lab('Buyer\'s premium', F.auBP, '%')),
    grp('Dealers and lots', lab('Dealer offer, share of retail (estimate)', F.dlShare, '%'), lab('Lot share of value (estimate)', F.lotShare, '%')),
    grp('Postage from Canada', lab('Canada, Lettermail', Q.caL, 'CAD'), lab('Canada, Registered Mail', Q.caT, 'CAD'), lab('U.S., Tracked Packet', Q.usT, 'CAD'), lab('U.S., customs declaration fee', Q.usDecl, 'CAD'), lab('International, Lettermail', Q.inL, 'CAD'), lab('International, Registered Mail', Q.inT, 'CAD'), lab('Envelope and stiffener', Q.sup, 'CAD')),
    h('div', { class: 'row' }, save, reset),
    RULES.sources && RULES.sources.length ? h('details', { class: 'more' }, h('summary', null, 'Where these figures come from'),
      h('ul', { class: 'plain small' }, RULES.sources.map(s => h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.label), s.checked ? ' (checked ' + s.checked + ')' : '')))) : null);
}

/* ---------- Data on this device (standalone) ---------- */

function dataSection() {
  if (P.kind === 'claude') {
    return h('section', { class: 'sec' }, h('h3', { text: 'Your data' }),
      h('p', { text: 'The collection is stored with this page in Claude. Photos go to Claude only when you scan or save. Use Export CSV on the Collection tab for a spreadsheet copy.' }));
  }
  const usage = h('p', { class: 'hint', text: 'Checking storage...' });
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(e => {
      const mb = n => (n / 1048576).toFixed(n > 1048576 * 100 ? 0 : 1) + ' MB';
      usage.textContent = 'Using ' + mb(e.usage || 0) + (e.quota ? ' of about ' + mb(e.quota) + ' available' : '') + ' in this browser.';
    }).catch(() => { usage.textContent = ''; });
  } else usage.textContent = '';
  const keep = h('button', { type: 'button', class: 'btn' }, 'Keep my data on this device');
  const keepNote = h('p', { class: 'hint' });
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then(p => { if (p) { keep.disabled = true; keep.textContent = 'Data is kept on this device'; } }).catch(() => {});
  }
  keep.addEventListener('click', async () => {
    if (!navigator.storage || !navigator.storage.persist) { keepNote.textContent = 'This browser does not support that. Export backups regularly.'; return; }
    const ok = await navigator.storage.persist().catch(() => false);
    keepNote.textContent = ok ? 'Done. The browser will not clear this data to save space.' : 'The browser said no. On iPhone and iPad, add this app to your Home Screen, and export backups regularly.';
    if (ok) { keep.disabled = true; keep.textContent = 'Data is kept on this device'; }
  });
  const exp = h('button', { type: 'button', class: 'btn' }, 'Export backup');
  exp.addEventListener('click', async () => {
    exp.disabled = true;
    try {
      const data = await P.store.exportAll();
      await P.downloads.save({ filename: 'stamp-loupe-backup-' + new Date().toISOString().slice(0, 10) + '.json', data: JSON.stringify(data) });
      pref.set('lastBackup', new Date().toISOString());
      toast('Backup saved');
    } catch (_) { toast('The backup could not be saved.'); }
    finally { exp.disabled = false; }
  });
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'vh', id: 'set-import', tabindex: '-1', 'aria-hidden': 'true' });
  const imp = h('button', { type: 'button', class: 'btn' }, 'Import backup');
  imp.addEventListener('click', () => { file.value = ''; file.click(); });
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const r = await P.store.importAll(data, { replace: false });
      toast('Imported ' + plural(r.stamps, 'item'));
    } catch (_) { toast('That file is not a Stamp Loupe backup.'); }
  });
  const erase = h('button', { type: 'button', class: 'btn btn-danger' }, 'Erase everything');
  const yes = h('button', { type: 'button', class: 'btn btn-danger solid' }, 'Erase');
  const no = h('button', { type: 'button', class: 'btn' }, 'Keep it');
  const confirm = h('div', { class: 'confirm', hidden: true }, h('p', { text: 'Erase every stamp, photo and setting stored in this browser? Export a backup first. This cannot be undone.' }), h('div', { class: 'row' }, yes, no));
  erase.addEventListener('click', () => { confirm.hidden = false; erase.hidden = true; no.focus(); });
  no.addEventListener('click', () => { confirm.hidden = true; erase.hidden = false; erase.focus(); });
  yes.addEventListener('click', async () => { await P.store.eraseAll(); confirm.hidden = true; erase.hidden = false; toast('Everything was erased'); });
  const last = pref.get('lastBackup', null);
  return h('section', { class: 'sec', id: 'settings-data' }, h('h3', { text: 'Data on this device' }),
    h('p', { text: 'Your collection lives in this browser only. Nothing leaves this device except what you send to Claude: the photos and notes for a scan, and the stamp details for a listing.' }),
    usage,
    h('div', { class: 'row' }, keep), keepNote,
    h('p', { class: 'hint', text: last ? 'Last backup: ' + last.slice(0, 10) + '.' : 'No backup yet. Export one after you add stamps.' }),
    h('div', { class: 'row' }, exp, imp, file),
    h('div', { class: 'row' }, erase), confirm);
}

function aboutSection() {
  return h('section', { class: 'sec' }, h('h3', { text: 'About' }),
    h('p', { text: 'Stamp Loupe ' + VERSION + '. Open source under the MIT License.' }),
    h('p', { class: 'hint', text: 'Identification and values come from an AI model looking at a photo. They are a starting point, not an appraisal.' }));
}

/* ---------- Import a list ---------- */

function importSection() {
  if (!P.store || P.canWrite === false) return null;
  const file = h('input', { type: 'file', accept: '.csv,text/csv,.tsv,.txt,text/plain', class: 'vh', id: 'set-list', tabindex: '-1', 'aria-hidden': 'true' });
  const pick = h('button', { type: 'button', class: 'btn' }, icon('i-upload'), 'Choose a CSV file');
  const out = h('div', { class: 'fields' });
  pick.addEventListener('click', () => { file.value = ''; file.click(); });
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const { readList, rowToStamp } = await import('./importer.js');
    let L;
    try { L = readList(await f.text()); } catch (_) {
      out.replaceChildren(h('p', { class: 'error', text: 'That file has no rows to import. Save the sheet as CSV and try again.' }));
      return;
    }
    const max = P.kind === 'claude' ? 300 : 5000;
    const n = Math.min(L.rows.length, max);
    const go = h('button', { type: 'button', class: 'btn btn-primary', disabled: !L.map.matched.length }, 'Import ' + plural(n, 'stamp'));
    const status = h('p', { class: 'hint', role: 'status' });
    out.replaceChildren(
      h('p', { text: 'Found ' + plural(L.rows.length, 'row') + (L.rows.length > max ? '. The first ' + max + ' will be imported.' : '.') }),
      L.map.matched.length
        ? h('p', { class: 'hint', text: 'Matched: ' + L.map.matched.map(m => m.header).join(', ') + '.' })
        : h('p', { class: 'error', text: 'No columns were recognised. Name them Country, Year, Denomination, Scott, and so on.' }),
      L.map.unmatched.length ? h('p', { class: 'hint', text: 'Kept in each stamp\'s notes: ' + L.map.unmatched.join(', ') + '.' }) : null,
      h('div', { class: 'row' }, go), status);
    go.addEventListener('click', async () => {
      go.disabled = true;
      const cur = pref.get('currency', 'CAD');
      const now = new Date().toISOString();
      let done = 0;
      try {
        for (let i = 0; i < n; i++) {
          const r = rowToStamp(L.rows[i], L.map, L.headers, { cur, statuses: STATUSES, file: f.name, index: i, now });
          const id = newId();
          const doc = stampDoc(r.record, { now, notes: r.notes, status: r.status });
          if (r.cert.certNumber) doc.certNumber = r.cert.certNumber;
          if (r.cert.grader) doc.grader = r.cert.grader;
          await P.store.addStamp(id, doc);
          if (r.priv && P.store.setPrivate) await P.store.setPrivate(id, Object.assign({}, r.priv, { updatedAt: now }));
          done++;
          if (done % 25 === 0) { status.textContent = 'Imported ' + done + ' of ' + n + '...'; await new Promise(res => setTimeout(res, 0)); }
        }
        status.textContent = 'Imported ' + plural(done, 'stamp') + '. They are on the Collection tab.';
        toast('Imported ' + plural(done, 'stamp'));
      } catch (e) {
        status.textContent = 'Stopped after ' + done + '. ' + writeErrorMessage(e).message;
      }
    });
  });
  return h('section', { class: 'sec', id: 'settings-import' }, h('h3', { text: 'Import a list' }),
    h('p', { text: 'Bring in a list you already keep: a CSV from Excel, Numbers or Google Sheets, a Colnect export, StampManage, or a Stamp Loupe export. Save Excel files as CSV first.' }),
    h('p', { class: 'hint', text: 'Columns such as Country, Year, Denomination, Scott, SG, Michel, Unitrade, Condition, Album and Notes are matched in English and German. Anything else goes into each stamp\'s notes. Purchase details stay private.' }),
    h('div', { class: 'row' }, pick, file), out);
}

/* ---------- Install ---------- */

function installSection() {
  if (P.kind === 'claude' || isStandalone()) return null;
  const box = h('section', { class: 'sec', id: 'settings-install' }, h('h3', { text: 'Install on this phone' }));
  if (canInstall()) {
    const b = h('button', { type: 'button', class: 'btn btn-primary' }, icon('i-install'), 'Install Stamp Loupe');
    b.addEventListener('click', async () => {
      const r = await promptInstall();
      if (r === 'accepted') toast('Installed. Open it from your home screen.');
      openSettings('install');
    });
    box.append(h('p', { text: 'Install it like an app. It opens full screen, keeps working offline for everything except identification, and on Android can take photos shared from your gallery.' }), h('div', { class: 'row' }, b));
  } else if (isIOS()) {
    box.append(h('p', { text: 'On iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen. It then opens full screen and keeps working offline.' }));
  } else {
    box.append(h('p', { text: 'Use your browser\'s menu to install this site or add it to your home screen. It then opens full screen and keeps working offline.' }));
  }
  return box;
}

/* ---------- Sheet ---------- */

let returnFocus = null, releaseBack = null;
export function openSettings(section) {
  const sheet = $('#settings');
  const body = $('#settings-body');
  body.replaceChildren(...[aiSection(), sellingSection(), dataSection(), importSection(), installSection(), aboutSection()].filter(Boolean));
  if (sheet.hidden) {
    returnFocus = document.activeElement;
    sheet.hidden = false;
    document.body.classList.add('locked');
    releaseBack = pushBack(closeSettings);
  }
  const target = section && $('#settings-' + section);
  if (target) target.scrollIntoView({ block: 'start' });
  $('#settings-close').focus({ preventScroll: !!target });
}

export function closeSettings() {
  if (releaseBack) { const r = releaseBack; releaseBack = null; r(); }
  $('#settings').hidden = true;
  if ($('#sheet').hidden && !document.querySelector('.layer')) document.body.classList.remove('locked');
  if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  returnFocus = null;
}

export function bindSettings() {
  on('install-change', () => { if (!$('#settings').hidden) openSettings(); });
  $('#settings-btn').addEventListener('click', () => openSettings());
  $('#settings-close').addEventListener('click', closeSettings);
  $('#settings-scrim').addEventListener('click', closeSettings);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#settings').hidden && !document.querySelector('.layer')) closeSettings(); });
}
