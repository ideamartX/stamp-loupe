// The stamp card used for a fresh scan and for saved stamps. Tabs:
// Overview (what it is), Value (price and where it comes from),
// Sell (channels, shipping, customs, listing), Record (saved stamps only).

import { $, h, icon, toast, copyBtn, segmented, tabset, field, textInput, numberInput, selectInput } from '../util/dom.js';
import { clean, fmtMoney, fmtNum, fmtRange, isNum, newId, sha256Hex, joinDot, initials } from '../util/format.js';
import {
  P, S, pref, emit, placeholderStamp, sec, ulPlain, factList, catRefs, confPill, priceLinks, setImage, stampSub,
  STATUSES, statusLabel, GRADERS, EXPERTS, sellPrefs, effectiveRules
} from './core.js';
import {
  DESTINATIONS, planningPrice, compsStats, STRENGTH_LABEL, compareChannels, recommend, shippingPlan, customsNotes,
  customsOrigin, isCanadianOrigin, listingFacts, CHANNELS
} from '../sell/planner.js';
import { listingPrompt } from '../ai/prompts.js';
import { centeringSummary } from '../capture/centering.js';
import { decodeImage, buildCapture } from '../capture/still.js';
import { normalizeListing } from '../ai/normalize.js';
import { AI_ERRORS, PERMANENT } from '../ai/providers.js';
import { writeErrorMessage } from '../store/claude-store.js';

/* ---------------------------------------------------------------------- */
/* Header                                                                  */
/* ---------------------------------------------------------------------- */

function sourceBadge(pp) {
  if (!pp) return null;
  const cls = { comps: 'src-comps', ai: 'src-ai', manual: 'src-manual' }[pp.source] || 'src-ai';
  const text = { comps: 'Sold prices', ai: 'AI estimate', manual: 'Your price' }[pp.source] || 'AI estimate';
  return h('span', { class: 'srcbadge ' + cls }, text);
}

function valueBlock(stamp) {
  const pp = planningPrice(stamp);
  const range = fmtRange(stamp.value);
  let sub = '';
  if (pp) {
    sub = pp.label + ' · ' + STRENGTH_LABEL[pp.strength] + ' basis';
    if (range) sub += pp.source === 'ai' ? ' · range ' + range : ' · AI range ' + range;
  }
  return h('div', { class: 'valblock' },
    h('div', { class: 'valrow' }, h('span', { class: 'lbl', text: 'Planning price' }), sourceBadge(pp)),
    h('div', { class: 'value', text: pp ? fmtMoney(pp.amount, pp.currency) : 'Not enough to price' }),
    sub ? h('p', { class: 'sub', text: sub }) : null);
}

function formatLine(stamp) {
  const f = stamp.format || {};
  if (!f.kind || f.kind === 'single') return null;
  return joinDot([f.kind.charAt(0).toUpperCase() + f.kind.slice(1) + (f.count > 1 ? ' of ' + f.count : ''), f.plate]);
}

function headBlock(stamp, photoEl) {
  return h('div', { class: 'result-head' }, photoEl,
    h('div', { class: 'head-text' },
      h('h2', { class: 'ttl', text: stamp.title }),
      h('p', { class: 'sub', text: stampSub(stamp) }),
      formatLine(stamp) ? h('p', { class: 'sub', text: formatLine(stamp) }) : null,
      h('div', { class: 'row' }, stamp.imported && !stamp.confidence ? h('span', { class: 'pill' }, 'From your list') : confPill(stamp.confidence)),
      stamp.confidence_note ? h('p', { class: 'note', text: stamp.confidence_note }) : null,
      valueBlock(stamp)));
}

/* ---------------------------------------------------------------------- */
/* Overview                                                                */
/* ---------------------------------------------------------------------- */

function overviewPanel(stamp, ctx) {
  const out = [];
  const f = stamp.format || {};
  const fmt = factList([
    ['Format', f.kind && f.kind !== 'single' ? f.kind + (f.count > 1 ? ' of ' + f.count : '') : null],
    ['Plate or imprint', f.plate], ['Postal markings', f.markings], ['Route', f.route]
  ]);
  if (fmt) out.push(sec('Format', fmt));
  const ident = factList([
    ['Issue', stamp.issue], ['Design', stamp.design], ['Printing', stamp.printing],
    ['Printed in', stamp.origin && stamp.origin.printedIn ? stamp.origin.printedIn + (stamp.origin.printer ? ', ' + stamp.origin.printer : '') : null],
    ['Perforation', stamp.perforation], ['Watermark', stamp.watermark],
    ['Catalogue', stamp.catalogue && stamp.catalogue.length ? catRefs(stamp.catalogue) : null]
  ]);
  if (ident) out.push(sec('Identification', ident));
  const c = stamp.condition || {};
  const faults = (c.faults || []).length ? ulPlain(c.faults) : 'None seen in the photo';
  const mc = stamp.measured && stamp.measured.centering;
  const cond = factList([
    ['State', c.state], ['Centering', c.centering],
    ['Measured centering', mc && mc.ok ? centeringSummary(mc) : null],
    [/imperf/i.test(stamp.perforation || '') ? 'Margins' : 'Perforations', c.margins_or_perfs],
    ['Cancel', c.cancel], ['Grade', c.grade], ['Faults', faults]
  ]);
  if (cond) out.push(sec('Condition', cond, mc && mc.ok ? h('p', { class: 'hint', text: 'Measured from the photo with a method from stamp-grader. Scores vary by a few points between photos.' }) : null));
  if (stamp.red_flags && stamp.red_flags.length) { const s = sec('Warning signs', ulPlain(stamp.red_flags)); s.classList.add('flags'); out.push(s); }
  if (stamp.checks && stamp.checks.length) out.push(sec('Check before you rely on this', ulPlain(stamp.checks), h('p', { class: 'hint', text: 'To gauge perforations, count the holes along 2 cm of one edge.' })));
  const ex = stamp.expertize || {};
  out.push(sec('Expert opinion',
    h('p', { text: ex.recommended ? 'Worth getting a certificate before you sell. ' + (ex.reason || '') : (ex.reason || 'A certificate is probably not worth the fee at this value.') }),
    ex.recommended ? h('div', { class: 'experts' }, EXPERTS.map(([where, who]) => h('p', null, h('span', { text: where }), who))) : null));
  if (stamp.alternates && stamp.alternates.length) out.push(sec('Could also be', h('div', { class: 'alts' }, stamp.alternates.map(a => h('p', null, h('strong', { text: a.title }), a.how_to_tell)))));
  if (stamp.story) out.push(sec('The story', h('p', { text: stamp.story })));
  if (ctx.mode === 'scan') out.push(sec('Next', saveRow(ctx)));
  return h('div', null, out);
}

function saveRow(ctx) {
  const b = h('button', { type: 'button', class: 'btn btn-primary', id: 'save-btn' }, 'Save to collection');
  b.addEventListener('click', () => ctx.onSave && ctx.onSave());
  const go = (t) => h('button', { type: 'button', class: 'btn', onclick: () => ctx.selectTab(t) }, t === 'value' ? 'Check the price' : 'Plan the sale');
  setTimeout(updateSaveBtn, 0);
  return h('div', { class: 'actions' }, b, go('value'), go('sell'));
}

export function updateSaveBtn() {
  const b = $('#save-btn');
  if (!b) return;
  b.dataset.mode = 'save';
  if (S.resultIsExample) { b.disabled = true; b.textContent = 'Scan a stamp to save'; return; }
  if (S.savedId) { b.disabled = false; b.textContent = 'Saved. Open in collection'; b.dataset.mode = 'open'; return; }
  if (P.storeState === 'none') { b.disabled = true; b.textContent = P.kind === 'claude' ? 'Saving is not available in this view' : 'Saving is not available in this browser'; return; }
  if (P.canWrite === false) { b.disabled = true; b.textContent = 'View only. Saving is off'; return; }
  b.disabled = !P.store || S.saving;
  b.textContent = S.saving ? 'Saving...' : S.upgradeId ? 'Update the saved stamp' : 'Save to collection';
}

/* ---------------------------------------------------------------------- */
/* Value: planning price and its sources                                   */
/* ---------------------------------------------------------------------- */

const VENUES = ['eBay', 'eBay.ca', 'HipStamp', 'Delcampe', 'Auction house', 'Dealer', 'Stamp show', 'Other'];
const GUMS = ['Mint never hinged', 'Mint hinged', 'Unused, no gum', 'Used', 'On cover or envelope'];

/** Only plain web links are rendered. Stored data can come from a backup file or another editor. */
function safeHref(u) {
  const t = String(u || '').trim();
  return /^https?:\/\/[^\s]+$/i.test(t) ? t : null;
}

function valuePanel(stamp, ctx) {
  const cur = (stamp.value && stamp.value.currency) || 'CAD';
  const pr = stamp.pricing || { basis: 'auto', comps: [] };
  const pp = planningPrice(stamp);
  const cs = compsStats(pr.comps, cur, new Date().toISOString());
  const editable = ctx.canEdit !== false;
  const px = ctx.mode === 'saved' ? 'dt-' : 'rs-';

  // Planning price chooser
  const manual = numberInput(px + 'manual', pr.manual, { min: 0, placeholder: 'Your price' });
  const manualWrap = h('div', { class: 'field', hidden: pr.basis !== 'manual' }, h('label', { for: px + 'manual' }, 'Your price in ' + cur), manual);
  const basis = segmented([['auto', 'Auto'], ['comps', 'Sold prices'], ['ai', 'AI estimate'], ['manual', 'My price']], pr.basis || 'auto', v => {
    manualWrap.hidden = v !== 'manual';
    if (v !== 'manual') ctx.update({ pricing: Object.assign({}, pr, { basis: v }) });
    else manual.focus();
  }, 'Price basis');
  manual.addEventListener('change', () => {
    const v = Number(manual.value);
    ctx.update({ pricing: Object.assign({}, pr, { basis: 'manual', manual: isNum(manual.value) && v > 0 ? v : null }) });
  });
  if (!editable) basis.el.querySelectorAll('button').forEach(b => { b.disabled = true; });

  const planning = h('div', { class: 'planning' },
    h('div', { class: 'valrow' }, h('span', { class: 'lbl', text: 'Planning price' }), sourceBadge(pp)),
    h('div', { class: 'value', text: pp ? fmtMoney(pp.amount, pp.currency) : 'Not set' }),
    h('p', { class: 'sub', text: pp ? pp.label + '. ' + STRENGTH_LABEL[pp.strength] + ' basis.' : 'Add sold prices or set your own price.' }),
    h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Use' }), basis.el),
    manualWrap,
    h('p', { class: 'hint', text: 'Auto uses the median of your sold prices once you have two or more. Until then it uses the middle of the AI range.' }));

  // Source 1: AI estimate
  const v = stamp.value || {};
  const aiSrc = h('li', { class: 'src' },
    h('div', { class: 'src-head' }, h('span', { class: 'srcbadge src-ai', text: 'AI estimate' }), h('strong', { text: fmtRange(v) || 'No range given' })),
    v.basis ? h('p', { text: v.basis }) : null,
    v.sources && v.sources.length ? h('ul', { class: 'plain small' }, v.sources.map(s => h('li', null, h('em', { text: (s.kind || 'general knowledge') + ': ' }), s.detail))) : null,
    h('p', { class: 'hint', text: 'From the model\'s general knowledge of catalogues and past sales. It is not a live market lookup, so check it against real sales.' }));

  // Source 2: catalogue
  const cat = pr.catalogue || {};
  const catAmt = numberInput(px + 'cat-amt', cat.amount, { min: 0, placeholder: '120' });
  const catEd = textInput(px + 'cat-ed', cat.edition, 'Unitrade 2027, Scott 2026');
  const catSave = h('button', { type: 'button', class: 'btn btn-small' }, 'Save catalogue value');
  catSave.addEventListener('click', () => {
    const amt = Number(catAmt.value);
    ctx.update({ pricing: Object.assign({}, pr, { catalogue: isNum(catAmt.value) && amt > 0 ? { amount: amt, currency: cur, edition: clean(catEd.value).slice(0, 80) } : null }) });
  });
  const catSrc = h('li', { class: 'src' },
    h('div', { class: 'src-head' }, h('span', { class: 'srcbadge src-cat', text: 'Catalogue' }),
      h('strong', { text: cat.amount ? fmtMoney(cat.amount, cat.currency || cur) + (cat.edition ? ' · ' + cat.edition : '') : 'Not entered' })),
    stamp.catalogue && stamp.catalogue.length ? catRefs(stamp.catalogue) : null,
    h('p', { class: 'hint', text: 'Catalogue value is a reference, not a selling price. Most stamps sell well below it. Look the number up in your catalogue and enter it here.' }),
    editable ? h('div', { class: 'two' }, h('div', { class: 'field' }, h('label', { for: px + 'cat-amt' }, 'Catalogue value (' + cur + ')'), catAmt), field('Catalogue and edition', catEd)) : null,
    editable ? h('div', { class: 'row' }, catSave) : null);

  // Source 3: sold comps
  const rows = (pr.comps || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const table = rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'comps' },
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Sold'), h('th', { scope: 'col' }, 'Where'), h('th', { scope: 'col', class: 'num' }, 'Price'), h('th', { scope: 'col' }, 'Condition'), editable ? h('th', { scope: 'col' }, h('span', { class: 'vh' }, 'Actions')) : null)),
    h('tbody', null, rows.map(c => h('tr', null,
      h('td', { class: 'mono', text: c.date || 'No date' }),
      h('td', null, safeHref(c.url) ? h('a', { href: safeHref(c.url), target: '_blank', rel: 'noopener noreferrer' }, c.venue || 'Link') : (c.venue || '')),
      h('td', { class: 'num mono', text: fmtMoney(c.price, c.currency || cur) }),
      h('td', { text: c.condition || '' }),
      editable ? h('td', null, h('button', { type: 'button', class: 'btn btn-small btn-quiet', 'aria-label': 'Remove this sold price', onclick: () => ctx.update({ pricing: Object.assign({}, pr, { comps: pr.comps.filter(x => x.id !== c.id) }) }) }, 'Remove')) : null))))) : null;

  const stats = cs.n ? h('p', { class: 'sub' },
    'Median ' + fmtMoney(cs.median, cur) + ' from ' + cs.n + (cs.n === 1 ? ' sale' : ' sales') + (cs.n > 1 ? ', range ' + fmtMoney(cs.min, cur) + ' to ' + fmtMoney(cs.max, cur) : '') + '.' +
    (cs.old ? ' ' + cs.old + ' are over three years old.' : '') + (cs.otherCurrency ? ' ' + cs.otherCurrency + ' in another currency are left out.' : '')) : null;

  const addForm = editable ? compForm(cur, px, comp => ctx.update({ pricing: Object.assign({}, pr, { comps: (pr.comps || []).concat([comp]) }) })) : null;
  const compSrc = h('li', { class: 'src' },
    h('div', { class: 'src-head' }, h('span', { class: 'srcbadge src-comps', text: 'Sold prices' }), h('strong', { text: cs.n ? cs.n + (cs.n === 1 ? ' sale' : ' sales') + ' recorded' : 'None yet' })),
    h('p', { class: 'hint', text: 'Real sales of the same stamp in similar condition are the best evidence. Use sold prices, not asking prices.' }),
    stats, table, addForm);

  const links = h('section', { class: 'sec' }, h('h3', { text: 'Find sold prices' }),
    h('ul', { class: 'linklist' }, priceLinks(stamp.search_query || stamp.title, stamp.country).map(([label, href, note]) =>
      h('li', null, h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label), h('span', { class: 'hint', text: note })))));

  const drivers = v.drivers && v.drivers.length ? sec('What moves the price', ulPlain(v.drivers)) : null;

  return h('div', null,
    h('section', { class: 'sec' }, planning),
    h('section', { class: 'sec' }, h('h3', { text: 'Where the numbers come from' }), h('ol', { class: 'srclist' }, aiSrc, catSrc, compSrc)),
    links, drivers);
}

function compForm(cur, px, onAdd) {
  const venue = selectInput(px + 'cf-venue', VENUES, 'eBay');
  const date = h('input', { type: 'date', id: px + 'cf-date' });
  date.value = new Date().toISOString().slice(0, 10);
  const price = numberInput(px + 'cf-price', '', { min: 0, placeholder: '0.00' });
  const cond = textInput(px + 'cf-cond', '', 'Used, fine, small thin');
  const url = h('input', { type: 'url', id: px + 'cf-url', placeholder: 'https://', autocomplete: 'off' });
  const err = h('p', { class: 'error', role: 'alert', hidden: true });
  const add = h('button', { type: 'submit', class: 'btn btn-primary btn-small' }, 'Add sold price');
  const form = h('form', { class: 'compform', novalidate: true },
    h('div', { class: 'three' },
      field('Where it sold', venue), field('Date sold', date),
      h('div', { class: 'field' }, h('label', { for: px + 'cf-price' }, 'Price (' + cur + ')'), price)),
    h('div', { class: 'two' }, field('Condition', cond), field('Link (optional)', url)),
    err, h('div', { class: 'row' }, add));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const p = Number(price.value);
    if (!isNum(price.value) || p <= 0) { err.textContent = 'Enter the price it sold for.'; err.hidden = false; price.focus(); return; }
    let link = url.value.trim();
    if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
    try { if (link) new URL(link); } catch (_) { err.textContent = 'That link does not look right. Leave it blank or paste the full address.'; err.hidden = false; url.focus(); return; }
    err.hidden = true;
    onAdd({ id: newId('c'), venue: venue.value, date: date.value || '', price: p, currency: cur, condition: clean(cond.value).slice(0, 120), url: link.slice(0, 500) });
  });
  return h('details', { class: 'more' }, h('summary', null, 'Add a sold price'), form);
}

/* ---------------------------------------------------------------------- */
/* Sell planner                                                            */
/* ---------------------------------------------------------------------- */

function sellPanel(stamp, ctx) {
  const pp = planningPrice(stamp);
  const host = h('div');
  if (!pp) {
    host.append(h('section', { class: 'sec' }, h('p', { text: 'There is no price to plan with yet. Add sold prices or your own price on the Value tab.' }),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => ctx.selectTab('value') }, 'Go to Value'))));
    return host;
  }
  const sp = sellPrefs();
  const rules = effectiveRules();
  const cur = pp.currency;
  const editable = ctx.canEdit !== false;
  const px = ctx.mode === 'saved' ? 'dt-' : 'rs-';

  const dest = selectInput(px + 'dest', DESTINATIONS, sp.dest);
  const printed = textInput(px + 'printed', (stamp.origin && stamp.origin.printedIn) || '', stamp.country || 'Country');
  if (!editable) printed.disabled = true;
  const certDefault = !!(stamp.expertize && stamp.expertize.recommended) && pp.amount >= rules.thresholds.certFrom && !stamp.certNumber;
  const cert = h('input', { type: 'checkbox', id: px + 'cert' });
  cert.checked = ctx.certChoice != null ? ctx.certChoice : certDefault;

  const out = h('div', { 'aria-live': 'polite' });
  function draw() {
    const d = dest.value;
    const canadian = isCanadianOrigin(Object.assign({}, stamp, { origin: Object.assign({}, stamp.origin, { printedIn: printed.value.trim() }) }));
    const now = new Date().toISOString();
    const c = { price: pp.amount, currency: cur, dest: d, canadian, certificate: cert.checked, certRecommended: !!(stamp.expertize && stamp.expertize.recommended), rules, shipFrom: sp.shipFrom, now };
    const cmp = compareChannels(c);
    const rec = recommend(c, cmp, rules);
    const best = cmp.channels.find(x => x.id === rec.best);
    const maxNet = Math.max(...cmp.channels.map(x => x.net), 1);

    const recBox = h('div', { class: 'reco' },
      h('div', { class: 'reco-head' }, h('span', { class: 'lbl', text: 'Best fit' }), h('strong', { text: best ? best.name : 'eBay.ca listing' }),
        best ? h('span', { class: 'reco-net', text: 'about ' + fmtMoney(best.net, cur) + ' to you' }) : null),
      ulPlain(rec.why));

    const rowsEl = cmp.channels.map(ch => {
      const pct = Math.max(0, ch.net) / maxNet;
      const details = h('details', { class: 'ch-more' }, h('summary', null, 'How this adds up'),
        h('dl', { class: 'facts tight' },
          h('dt', { text: ch.grossLabel || 'Sale price' }), h('dd', { class: 'mono', text: fmtMoney(ch.gross, cur) }),
          ch.lines.map(l => [h('dt', { text: l.label }), h('dd', { class: 'mono', text: (l.amount >= 0 ? '+' : '') + fmtMoney(l.amount, cur) })]),
          h('dt', { text: 'You receive' }), h('dd', { class: 'mono strong', text: fmtMoney(ch.net, cur) })),
        ch.notes.length ? ulPlain(ch.notes) : null);
      return h('li', { class: 'ch' + (ch.id === rec.best ? ' best' : '') + (ch.blocked ? ' blocked' : '') },
        h('div', { class: 'ch-top' },
          h('span', { class: 'ch-name', text: ch.name }),
          ch.id === rec.best ? h('span', { class: 'tag tag-good', text: 'Best fit' }) : null,
          ch.blocked ? h('span', { class: 'tag tag-warn', text: 'Not practical now' }) : null,
          h('span', { class: 'ch-net mono', text: fmtMoney(ch.net, cur) })),
        h('div', { class: 'ch-bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.round(pct * 100) + '%' })),
        h('p', { class: 'ch-meta', text: Math.round(ch.netPct * 100) + '% of the planning price · ' + ch.payout + ' · ' + ch.effort }),
        details);
    });

    const ship = cmp.ship;
    const shipBox = sec('Shipping',
      factList([['Method', ship.label], ['Estimated cost', fmtMoney(ship.cost, 'CAD') + ', usually charged to the buyer'], ['Postage checked', rules.asOf]]),
      ulPlain(ship.notes));
    const notes = customsNotes(Object.assign({}, stamp, { origin: Object.assign({}, stamp.origin, { printedIn: printed.value.trim() }) }), d, pp.amount, rules, now);
    const customsBox = sec('Customs and export', h('ul', { class: 'notes' }, notes.length ? notes.map(n => h('li', { class: n.level }, icon(n.level === 'warn' ? 'i-warn' : 'i-info'), h('span', { text: n.text }))) : h('li', { class: 'info' }, icon('i-info'), h('span', { text: 'No customs paperwork for a domestic sale.' }))));

    out.replaceChildren(recBox,
      h('section', { class: 'sec' }, h('h3', { text: 'What you would receive' }), h('ol', { class: 'channels' }, rowsEl),
        h('p', { class: 'hint', text: 'Estimates from the planning price of ' + fmtMoney(pp.amount, cur) + ' (' + pp.label.toLowerCase() + '). Fees and postage as of ' + rules.asOf + '. Change them in Settings.' })),
      shipBox, customsBox,
      listingSection(stamp, ctx, { pp, cmp, c, rules, px }));
  }
  dest.addEventListener('change', () => { const p = pref.get('sell', {}) || {}; p.dest = dest.value; pref.set('sell', p); draw(); });
  cert.addEventListener('change', () => { ctx.certChoice = cert.checked; draw(); });
  printed.addEventListener('change', () => {
    const val = clean(printed.value).slice(0, 80);
    ctx.update({ origin: Object.assign({}, stamp.origin || {}, { printedIn: val }) });
  });
  const aiPrinted = stamp.origin && stamp.origin.aiPrintedIn;
  host.append(
    h('section', { class: 'sec' },
      h('div', { class: 'three' },
        field('Buyer is in', dest),
        field('Printed in', printed, aiPrinted ? 'AI suggests ' + aiPrinted + '. Customs uses where it was printed.' : 'Customs uses where it was printed, not just the issuing country.'),
        h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Certificate' }), h('label', { class: 'check', for: px + 'cert' }, cert, ' Include an expert certificate (' + fmtMoney(rules.certificate.cost, 'CAD') + ')')))),
    out);
  draw();
  return host;
}

/* ---------- Listing writer ---------- */

function listingSection(stamp, ctx, plan) {
  const chans = [['ebay', 'eBay.ca'], ['hipstamp', 'HipStamp'], ['delcampe', 'Delcampe'], ['auction', 'Auction house']];
  const saved = pref.get('market', 'ebay');
  const mkt = selectInput(plan.px + 'ls-mkt', chans, chans.some(c => c[0] === saved) ? saved : 'ebay');
  mkt.addEventListener('change', () => pref.set('market', mkt.value));
  const type = segmented([['Auction', 'Auction'], ['Fixed price', 'Fixed price']], 'Auction', null, 'Sale type');
  const go = h('button', { type: 'button', class: 'btn btn-primary', id: plan.px + 'ls-write' }, 'Write listing');
  const out = h('div', { 'aria-live': 'polite' });
  go.addEventListener('click', async () => {
    if (!P.ai || P.aiState !== 'ready') {
      out.replaceChildren(h('p', { class: 'error', text: P.aiState === 'setup' ? AI_ERRORS.setup : 'Writing listings needs Claude, which is not available in this view.' }));
      if (P.aiState === 'setup') emit('open-settings', 'ai');
      return;
    }
    go.disabled = true; go.textContent = 'Writing...';
    out.replaceChildren(h('p', { class: 'hint', text: 'Writing the listing. This usually takes under a minute.' }));
    const facts = listingFacts(stamp, plan.c, plan.cmp, plan.rules);
    const extra = {
      notes: stamp.notes || (stamp.inputs && stamp.inputs.notes) || '',
      cert: stamp.grader ? (stamp.grader + (stamp.certNumber ? ' certificate ' + stamp.certNumber : '') + (stamp.grade ? ', grade ' + stamp.grade : '')) : '',
      currency: plan.pp.currency, price: fmtNum(plan.pp.amount), priceSource: plan.pp.label.toLowerCase(),
      shipping: facts.shipping, customs: facts.customs
    };
    try {
      const raw = await P.ai.json(listingPrompt(stamp, mkt.value, type.get(), extra), { tier: 'fast' });
      out.replaceChildren(renderListing(normalizeListing(raw, plan.pp.currency), mkt.value));
    } catch (e) {
      const code = e && e.code;
      if (PERMANENT.includes(code)) P.aiState = 'blocked';
      out.replaceChildren(h('p', { class: 'error', text: AI_ERRORS[code] || AI_ERRORS.upstream_error }));
    } finally {
      go.disabled = false; go.textContent = 'Write it again';
    }
  });
  return h('section', { class: 'sec listing' }, h('h3', { text: 'Listing' }),
    h('div', { class: 'listing-controls' }, field('Where', mkt), h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Sale type' }), type.el), go),
    out);
}

function copyBlock(label, text, extra) {
  return h('div', { class: 'block' },
    h('div', { class: 'block-head' }, h('span', { class: 'lbl', text: label }), h('div', { class: 'row' }, extra || null, copyBtn(text))),
    h('div', { class: 'copybox', text }));
}

function renderListing(L, market) {
  const over = L.title.length > 80;
  const specText = L.specifics.map(s => s.name + ': ' + s.value).join('\n');
  const all = [L.title, '', L.description, L.shipping ? '\n' + L.shipping : '', specText ? '\n' + specText : ''].join('\n').trim();
  const links = { ebay: 'https://www.ebay.ca/', hipstamp: 'https://www.hipstamp.com/', delcampe: 'https://www.delcampe.net/' };
  return h('div', { class: 'listing-result' },
    copyBlock('Title', L.title, market === 'auction' ? null : h('span', { class: 'count-chip' + (over ? ' over' : ''), text: L.title.length + ' of 80 characters' })),
    copyBlock('Description', L.description),
    L.shipping ? copyBlock('Shipping and customs', L.shipping) : null,
    L.specifics.length ? h('div', { class: 'block' },
      h('div', { class: 'block-head' }, h('span', { class: 'lbl', text: market === 'auction' ? 'Lot details' : 'Item specifics' }), copyBtn(specText)),
      factList(L.specifics.map(s => [s.name, s.value]))) : null,
    L.price.amount != null ? h('div', { class: 'block' },
      h('span', { class: 'lbl', text: 'Suggested price' }),
      h('div', { class: 'price-line' }, h('strong', { text: fmtMoney(L.price.amount, L.price.currency) }), L.price.note ? h('span', { class: 'sub', text: L.price.note }) : null)) : null,
    L.tips.length ? h('div', { class: 'block' }, h('span', { class: 'lbl', text: 'Photo tips' }), ulPlain(L.tips)) : null,
    h('div', { class: 'actions' }, copyBtn(all, 'Copy everything', 'btn'), links[market] ? h('a', { class: 'btn', href: links[market], target: '_blank', rel: 'noopener noreferrer' }, 'Open ' + ({ ebay: 'eBay.ca', hipstamp: 'HipStamp', delcampe: 'Delcampe' })[market]) : null));
}

/* ---------------------------------------------------------------------- */
/* Record (saved stamps)                                                   */
/* ---------------------------------------------------------------------- */

async function fingerprint(s, pub, priv) {
  const canon = JSON.stringify({
    v: 1, title: s.title || '', catalogue: (s.catalogue || []).map(c => c.system + ' ' + c.number).join('; '), photo: s.photoHash || '',
    grader: pub.grader || '', cert: pub.certNumber || '', grade: pub.grade || '', certDate: pub.certDate || '',
    custodian: priv.custodian || '', vaultRef: priv.vaultRef || ''
  });
  return sha256Hex(canon);
}

function fpBlock(fp) {
  const box = h('div', { class: 'fp' });
  if (fp) {
    box.append(h('span', { class: 'lbl', text: 'Provenance fingerprint' }), h('div', { class: 'fp-hash', text: fp }),
      h('div', { class: 'row' }, copyBtn(fp, 'Copy fingerprint')),
      h('p', { class: 'hint', text: 'A SHA-256 hash of the photo and these records. Change any detail and the fingerprint changes. Publishing this one line on a blockchain, or timestamping it, would prove the record existed on that date without revealing custody details.' }));
  } else {
    box.append(h('p', { class: 'hint', text: 'Add a certificate or custody record to create a provenance fingerprint.' }));
  }
  return box;
}

function failWrite(e) {
  const m = writeErrorMessage(e);
  if (m.readOnly) P.canWrite = false;
  toast(m.message);
}

function recordPanel(s, ctx) {
  const can = ctx.canEdit !== false && !!P.store;
  const wrap = h('div');
  if (!can) {
    wrap.append(sec('Record', factList([['Status', statusLabel(s.status)], ['Gum and use', s.gum], ['How many', s.quantity], ['Where it is kept', s.location], ['Notes', s.notes]]) || h('p', { class: 'hint', text: 'No notes.' })));
    const facts = factList([['Expertized by', s.grader], ['Certificate', s.certNumber], ['Grade', s.grade], ['Certificate date', s.certDate]]);
    wrap.append(sec('Provenance', facts || h('p', { class: 'hint', text: 'No certificate recorded.' }), fpBlock(s.fingerprint)));
    return wrap;
  }
  const sel = selectInput('dt-status', STATUSES.map(x => [x.id, x.label]), s.status || 'keep');
  sel.addEventListener('change', async () => {
    try { await P.store.updateStamp(s.id, { status: sel.value, updatedAt: new Date().toISOString() }); toast('Status set to ' + statusLabel(sel.value)); }
    catch (e) { failWrite(e); }
  });
  const notes = h('textarea', { id: 'dt-notes', rows: '3', maxlength: '4000', placeholder: 'Bought at a stamp show, 2026.' });
  notes.value = s.notes || '';
  // Collection fields after Tellico's stamp template: gum, how many, and where it is kept.
  const gum = selectInput('dt-gum', [['', 'Not recorded']].concat(GUMS.map(g => [g, g])), GUMS.includes(s.gum) ? s.gum : '');
  const qty = numberInput('dt-qty', s.quantity, { min: 1, step: 1, placeholder: '1' });
  const loc = textInput('dt-loc', s.location, 'Album 3, page 12, row 2');
  const saveNotes = h('button', { type: 'button', class: 'btn btn-small' }, 'Save record');
  saveNotes.addEventListener('click', async () => {
    saveNotes.disabled = true;
    const q = parseInt(qty.value, 10);
    const patch = { notes: notes.value.slice(0, 4000), gum: gum.value, quantity: Number.isFinite(q) && q > 0 ? q : null, location: loc.value.trim().slice(0, 200), updatedAt: new Date().toISOString() };
    try { await P.store.updateStamp(s.id, patch); toast('Record saved'); }
    catch (e) { failWrite(e); }
    finally { saveNotes.disabled = false; }
  });
  wrap.append(h('section', { class: 'sec' }, h('h3', { text: 'Your record' }), field('Status', sel),
    h('div', { class: 'two' }, field('Gum and use', gum), field('How many you have', qty)),
    field('Where it is kept', loc),
    field('Notes', notes), h('div', { class: 'row' }, saveNotes)));

  // Provenance
  const grader = selectInput('pv-grader', [['', 'Not expertized']].concat(GRADERS.map(g => [g, g])), GRADERS.includes(s.grader) ? s.grader : (s.grader ? 'Other' : ''));
  const cert = textInput('pv-cert', s.certNumber, '123456');
  const grade = textInput('pv-grade', s.grade, 'VF-XF 85');
  const certDate = h('input', { type: 'date', id: 'pv-date' });
  certDate.value = /^\d{4}-\d{2}-\d{2}$/.test(s.certDate || '') ? s.certDate : '';
  const cust = textInput('pv-cust', '', 'Brink\'s');
  const ref = textInput('pv-ref', '', 'Vault receipt number');
  const ins = textInput('pv-ins', '', 'CAD 2,500');
  const paid = textInput('pv-paid', '', 'CAD 900');
  const from = textInput('pv-from', '', 'Dealer or auction lot');
  const fillPriv = p => { cust.value = p.custodian || ''; ref.value = p.vaultRef || ''; ins.value = p.insured || ''; paid.value = p.paid || ''; from.value = p.boughtFrom || ''; };
  if (S.priv[s.id]) fillPriv(S.priv[s.id]);
  else P.store.getPrivate(s.id).then(d => { if (d) { S.priv[s.id] = d; fillPriv(d); } }).catch(() => {});
  let fpEl = fpBlock(s.fingerprint);
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary btn-small' }, 'Save provenance');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      const now = new Date().toISOString();
      const pub = { grader: grader.value, certNumber: cert.value.trim(), grade: grade.value.trim(), certDate: certDate.value.trim() };
      const priv = { custodian: cust.value.trim(), vaultRef: ref.value.trim(), insured: ins.value.trim(), paid: paid.value.trim(), boughtFrom: from.value.trim(), updatedAt: now };
      const any = pub.grader || pub.certNumber || pub.grade || priv.custodian || priv.vaultRef;
      let fp = '';
      if (any) { try { fp = await fingerprint(s, pub, priv); } catch (_) { fp = ''; } }
      await P.store.setPrivate(s.id, priv);
      S.priv[s.id] = priv;
      await P.store.updateStamp(s.id, Object.assign({}, pub, { fingerprint: fp, updatedAt: now }));
      const next = fpBlock(fp);
      fpEl.replaceWith(next);
      fpEl = next;
      toast('Provenance saved');
    } catch (e) {
      failWrite(e);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save provenance';
    }
  });
  wrap.append(h('section', { class: 'sec' }, h('h3', { text: 'Provenance' }),
    h('p', { class: 'hint', text: P.kind === 'claude' ? 'Certificate details show to anyone you share the collection with.' : 'Certificate details are included when you export or share this record.' }),
    field('Expertized by', grader),
    h('div', { class: 'two' }, field('Certificate number', cert), field('Grade on certificate', grade)),
    field('Certificate date', certDate),
    h('div', { class: 'private-box' },
      h('p', { class: 'hint', text: P.kind === 'claude' ? 'Private. Only you and your editors see custody and purchase details.' : 'Private. Kept on this device. Your own CSV and backup files include it. The sharing CSV leaves it out.' }),
      h('div', { class: 'two' }, field('Held by', cust), field('Vault or box reference', ref)),
      h('div', { class: 'two' }, field('Insured value', ins), field('Paid', paid)),
      field('Bought from', from)),
    h('div', { class: 'row' }, saveBtn),
    fpEl));

  // Delete
  const delBtn = h('button', { type: 'button', class: 'btn btn-small btn-danger' }, icon('i-trash'), 'Delete stamp');
  const yes = h('button', { type: 'button', class: 'btn btn-small btn-danger solid' }, 'Delete');
  const no = h('button', { type: 'button', class: 'btn btn-small' }, 'Keep it');
  const confirmBox = h('div', { class: 'confirm', hidden: true }, h('p', { text: 'Delete this stamp and its photos? This cannot be undone.' }), h('div', { class: 'row' }, yes, no));
  delBtn.addEventListener('click', () => { confirmBox.hidden = false; delBtn.hidden = true; yes.focus(); });
  no.addEventListener('click', () => { confirmBox.hidden = true; delBtn.hidden = false; delBtn.focus(); });
  yes.addEventListener('click', async () => {
    yes.disabled = true;
    try {
      await P.store.deleteStamp(s.id);
      for (const a of [s.photo, s.thumb, s.back]) if (a) await P.store.deleteImage(a);
      if (S.savedId === s.id) { S.savedId = null; updateSaveBtn(); }
      emit('close-detail');
      toast('Stamp deleted');
    } catch (e) {
      yes.disabled = false;
      failWrite(e);
    }
  });
  wrap.append(h('section', { class: 'sec' }, h('div', { class: 'row' }, delBtn), confirmBox));
  return wrap;
}

/* ---------------------------------------------------------------------- */
/* Card assembly                                                           */
/* ---------------------------------------------------------------------- */

/**
 * ctx: { mode: 'scan' | 'saved', example, photoEl, tab, onTab(id),
 *        update(patch), canEdit, onSave(), certChoice }
 */
export function stampCard(stamp, ctx) {
  const card = h('article', { class: 'result', 'aria-label': ctx.example ? 'Example result' : (ctx.mode === 'saved' ? stamp.title : 'Identification result') });
  if (ctx.example) card.append(h('div', { class: 'ribbon' }, h('span', { class: 'tag' }, 'Example'), h('span', null, 'This is what a scan returns. The figures and sold prices are illustrative.')));
  if (!stamp.is_stamp && stamp.is_stamp !== undefined) {
    card.append(h('div', { class: 'result-head' }, ctx.photoEl, h('div', { class: 'head-text' },
      h('h2', { class: 'ttl', text: 'This does not look like a postage stamp' }),
      h('p', { class: 'note', text: stamp.confidence_note || 'Try a clear, close photo of one stamp.' }))));
    return card;
  }
  if (ctx.mode === 'saved' && stamp.sort && ctx.onIdentify) {
    card.append(h('div', { class: 'ribbon' }, h('span', { class: 'tag tag-warn' }, 'Quick sort'),
      h('span', { text: 'Sorted from a photo of a whole page. Identify it on its own for a full description and value.' }),
      h('button', { type: 'button', class: 'btn btn-small', onclick: ctx.onIdentify }, 'Identify it now')));
  } else if (ctx.mode === 'saved' && stamp.imported && !stamp.photo && ctx.onScan) {
    card.append(h('div', { class: 'ribbon' }, h('span', { class: 'tag' }, 'From your list'),
      h('span', { text: 'Imported from ' + (stamp.imported.file || 'a spreadsheet') + '. Photograph it to identify it and check the value.' }),
      h('button', { type: 'button', class: 'btn btn-small', onclick: ctx.onScan }, 'Scan it now')));
  }
  card.append(headBlock(stamp, ctx.photoEl));
  const tabs = [
    { id: 'overview', label: 'Overview', render: () => overviewPanel(stamp, ctx) },
    { id: 'value', label: 'Value', badge: ((stamp.pricing && stamp.pricing.comps) || []).length ? String(stamp.pricing.comps.length) : null, render: () => valuePanel(stamp, ctx) },
    { id: 'sell', label: 'Sell', render: () => sellPanel(stamp, ctx) }
  ];
  if (ctx.mode === 'saved') tabs.push({ id: 'record', label: 'Record', render: () => recordPanel(stamp, ctx) });
  const ts = tabset(tabs, { prefix: ctx.mode === 'saved' ? 'dt' : 'rs', active: ctx.tab, label: 'Stamp details', onChange: id => ctx.onTab && ctx.onTab(id) });
  ctx.selectTab = id => { ts.select(id, true); ts.list.querySelector('[aria-selected="true"]').focus(); };
  card.append(ts.list, ts.panel);
  card.append(h('p', { class: 'disclaimer', text: 'AI identification and estimates from a photo, not an appraisal. Fees, postage and customs rules change. Check them, and get an expert opinion before you buy or sell anything valuable.' }));
  return card;
}

/* ---------- Scan result ---------- */

export function renderScanResult() {
  const root = $('#result');
  const r = S.result;
  const example = S.resultIsExample;
  const photo = h('div', { class: 'result-photo' });
  const shot = S.resultShots && S.resultShots.front;
  if (shot && !example) photo.append(h('div', { class: 'mount' }, h('img', { src: shot.url, alt: 'Your photo of the stamp' })));
  else photo.append(placeholderStamp(example ? 'Your photo' : ''));
  const ctx = {
    mode: 'scan', example, photoEl: photo, tab: S.resultTab || 'overview',
    onTab: id => { S.resultTab = id; },
    canEdit: true,
    certChoice: S.resultCert,
    update: patch => {
      Object.assign(S.result, patch);
      if (S.savedId && P.store && !example) P.store.updateStamp(S.savedId, Object.assign({}, patch, { updatedAt: new Date().toISOString() })).catch(failWrite);
      const scrollY = window.scrollY;
      S.resultCert = ctx.certChoice;
      renderScanResult();
      window.scrollTo(0, scrollY);
    },
    onSave: () => emit('save-result')
  };
  root.replaceChildren(stampCard(r, ctx));
  updateSaveBtn();
}

/* ---------- Saved stamp in the detail sheet ---------- */

export function savedCard(s) {
  const photoBox = h('div', { class: 'result-photo' });
  const showSide = side => {
    const id = side === 'back' ? s.back : s.photo;
    if (!id) { photoBox.replaceChildren(placeholderStamp(initials(s.country))); return; }
    const img = h('img', { alt: (side === 'back' ? 'Back of ' : 'Front of ') + (s.title || 'the stamp') });
    const m = h('div', { class: 'mount mount-detail' }, img);
    setImage(img, id, () => m.replaceChildren(placeholderStamp('Photo missing')));
    photoBox.replaceChildren(m);
  };
  showSide('front');
  let toggle = null;
  if (s.back) {
    const seg = segmented([['front', 'Front'], ['back', 'Back']], 'front', showSide, 'Photo side');
    toggle = seg.el;
  }
  const photoCol = h('div', { class: 'preview' }, photoBox, toggle);
  const canEdit = !!P.store && P.canWrite !== false;
  const ctx = {
    mode: 'saved', photoEl: photoCol, tab: S.detailTab || 'overview',
    onTab: id => { S.detailTab = id; },
    canEdit,
    update: patch => P.store.updateStamp(s.id, Object.assign({}, patch, { updatedAt: new Date().toISOString() })).catch(failWrite),
    onIdentify: canEdit && s.photo ? () => identifySaved(s) : null,
    onScan: canEdit ? () => { emit('close-detail'); emit('switch-tab', 'scan'); emit('scan-for', { id: s.id, label: s.title }); } : null
  };
  return stampCard(s, ctx);
}

/** Load a saved stamp's photo into the scan panel so a full identification updates the same record. */
async function identifySaved(s) {
  try {
    const url = await Promise.resolve(P.store.imageUrl(s.photo));
    if (!url) throw new Error('no photo');
    const blob = await (await fetch(url)).blob();
    const src = await decodeImage(blob);
    const cap = await buildCapture(src, null, { subject: 'single', origin: 'page', manualFull: true });
    emit('close-detail');
    emit('switch-tab', 'scan');
    emit('use-capture', { cap, upgradeId: s.id, label: s.title || 'The stamp' });
  } catch (_) {
    toast('The photo could not be opened. Scan the stamp again instead.');
  }
}
