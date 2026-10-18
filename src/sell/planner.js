// Sell planner: planning price and its source, net proceeds by channel,
// shipping by value and destination, and customs and export notes.
// Pure functions. All fee and postage figures come from rules.js and can be
// overridden in Settings, because they change.

import { isNum, median, monthsBetween, fmtMoney, yearOf } from '../util/format.js';
import { RULES } from './rules.js';

export const DESTINATIONS = [
  ['CA', 'Canada'],
  ['US', 'United States'],
  ['UK', 'United Kingdom'],
  ['EU', 'European Union'],
  ['INTL', 'Elsewhere']
];

const CANADA_NAMES = /^(canada|province of canada|dominion of canada|newfoundland|nova scotia|new brunswick|prince edward island|british columbia(?: and| &) vancouver island|british columbia|vancouver island)$/i;

/** The country customs will treat as origin: where it was printed, else the issuing country. */
export function customsOrigin(stamp) {
  const printed = stamp && stamp.origin && String(stamp.origin.printedIn || '').trim();
  return printed || String((stamp && stamp.country) || '').trim();
}

export function isCanadianOrigin(stamp) {
  return CANADA_NAMES.test(customsOrigin(stamp));
}

export function aiMid(v) {
  if (!v) return null;
  const lo = isNum(v.low) ? Number(v.low) : null, hi = isNum(v.high) ? Number(v.high) : null;
  if (lo != null && hi != null) return (lo + hi) / 2;
  return lo != null ? lo : hi;
}

export function compsStats(comps, currency, nowIso) {
  const all = Array.isArray(comps) ? comps : [];
  const valid = all.filter(c => c && isNum(c.price) && Number(c.price) > 0 && (!c.currency || c.currency === currency));
  const prices = valid.map(c => Number(c.price)).sort((a, b) => a - b);
  const ages = valid.map(c => (c.date ? monthsBetween(c.date, nowIso) : null)).filter(m => m != null);
  return {
    n: valid.length,
    median: median(prices),
    min: prices.length ? prices[0] : null,
    max: prices.length ? prices[prices.length - 1] : null,
    recent: ages.filter(m => m <= 18).length,
    old: ages.filter(m => m > 36).length,
    otherCurrency: all.length - valid.length
  };
}

/**
 * The price used for planning, and where it came from.
 * pricing.basis: 'auto' (sold prices when there are two or more, else the AI
 * midpoint), 'comps', 'ai', or 'manual'.
 */
export function planningPrice(stamp, nowIso = new Date().toISOString()) {
  if (!stamp) return null;
  const p = stamp.pricing || {};
  const cur = (stamp.value && stamp.value.currency) || 'CAD';
  const cs = compsStats(p.comps, cur, nowIso);
  const ai = aiMid(stamp.value);
  const basis = p.basis || 'auto';
  if (basis === 'manual' && isNum(p.manual) && Number(p.manual) > 0) {
    return { amount: Number(p.manual), currency: cur, source: 'manual', label: 'Your price', strength: 'set', stats: cs };
  }
  if ((basis === 'comps' && cs.n >= 1) || (basis === 'auto' && cs.n >= 2)) {
    const strength = cs.n >= 3 && cs.recent >= 2 ? 'strong' : 'fair';
    return { amount: cs.median, currency: cur, source: 'comps', label: 'Median of ' + cs.n + ' sold', strength, stats: cs };
  }
  if (ai != null) return { amount: ai, currency: cur, source: 'ai', label: 'AI estimate, midpoint', strength: 'rough', stats: cs };
  return null;
}

export const STRENGTH_LABEL = { strong: 'Strong', fair: 'Fair', rough: 'Rough', set: 'Set by you' };

/** True when Canadian-origin mail to the U.S. needs formal customs entry. */
export function usFormalEntry(canadian, dest, nowIso, rules = RULES) {
  return dest === 'US' && !!canadian && String(nowIso || '').slice(0, 10) >= rules.customs.US.formalEntryFrom;
}

/* ---------------------------------------------------------------------- */
/* Shipping                                                                */
/* ---------------------------------------------------------------------- */

/** opts: { duty } the U.S. duty to be prepaid, if any. */
export function shippingPlan(price, dest, rules = RULES, opts = {}) {
  const zone = dest === 'CA' ? 'CA' : dest === 'US' ? 'US' : 'INTL';
  const post = rules.postage[zone];
  const t = rules.thresholds;
  const supplies = rules.postage.supplies;
  const notes = [];
  let method, label, cost;
  if (post.letter != null && price < t.tracked) {
    method = 'letter';
    label = post.letterLabel;
    cost = post.letter + supplies;
    notes.push('No tracking. Fine for low-value stamps sent flat in a stiffened envelope.');
    if (zone === 'INTL') notes.push('Attach a customs declaration, and check that Canada Post accepts it as letter-post for that country.');
  } else {
    method = 'tracked';
    label = post.trackedLabel;
    cost = post.tracked + supplies;
    notes.push(zone === 'US' ? 'Goods to the U.S. must go as a tracked parcel.' : 'Tracking protects you if a buyer says it never arrived.');
  }
  if (zone === 'US') {
    const duty = Math.max(0, Number(opts.duty) || 0);
    const fee = post.declarationFee + duty * post.declarationDutyShare;
    cost += fee;
    notes.push('Includes about ' + fmtMoney(fee, 'CAD') + ' for the Zonos customs declaration' + (duty ? ', which also takes ' + fmtMoney(duty, 'CAD') + ' of prepaid duty' : '') + '.');
    if (post.trackedEstimate) notes.push('The Tracked Packet USA price is from January 2025. Check the current rate.');
  }
  if (price >= t.insure) {
    method = 'insured';
    const cov = post.coverageIncluded;
    notes.push(cov
      ? 'Canada Post coverage on this service tops out at ' + fmtMoney(cov, 'CAD') + ', and its pages conflict on whether stamps are covered. Insure the full value privately.'
      : 'Insure the full sale value privately, for example with a philatelic insurer.');
    notes.push('Ask for a signature on delivery.');
  }
  return { method, zone, label, cost, notes };
}

/* ---------------------------------------------------------------------- */
/* Customs and export                                                      */
/* ---------------------------------------------------------------------- */

function exportPermitMayApply(stamp, price, rules, nowIso) {
  const ex = rules.export;
  if (!ex) return false;
  const kind = (stamp && stamp.format && stamp.format.kind) || (stamp && stamp.subject === 'cover' ? 'cover' : stamp && stamp.subject === 'block' ? 'block' : 'single');
  const y = yearOf(stamp);
  const nowYear = Number(String(nowIso || new Date().toISOString()).slice(0, 4));
  const canadian = isCanadianOrigin(stamp) || CANADA_NAMES.test(String((stamp && stamp.country) || ''));
  return ex.formats.includes(kind) && y != null && y <= nowYear - ex.minAgeYears && price > ex.valueFrom && canadian;
}

/** Notes a seller in Canada should know for a destination. level: info | warn */
export function customsNotes(stamp, dest, price, rules = RULES, nowIso = new Date().toISOString()) {
  const out = [];
  const origin = customsOrigin(stamp) || 'unknown';
  const canadian = isCanadianOrigin(stamp);
  const c = rules.customs;
  if (dest !== 'CA') {
    out.push({ level: 'info', text: 'Fill in a customs declaration. Describe it as "' + c.description + '", HS ' + c.hs + ', origin ' + origin + ', with the true sale value. Never under-declare.' });
  }
  if (dest === 'US') {
    if (canadian) {
      out.push({ level: 'warn', text: c.US.canadaTariffNote });
      out.push({ level: 'warn', text: c.US.formalEntryNote });
    } else {
      out.push({ level: 'info', text: c.US.otherOriginNote.replace('{origin}', origin) });
    }
    out.push({ level: 'info', text: c.US.postalNote });
    out.push({ level: 'info', text: c.US.deMinimisNote });
  }
  if (dest === 'UK') out.push({ level: 'info', text: c.UK.note });
  if (dest === 'EU') out.push({ level: 'info', text: c.EU.note });
  if (dest === 'INTL') out.push({ level: 'info', text: c.INTL.note });
  if (dest !== 'CA' && exportPermitMayApply(stamp, price, rules, nowIso)) out.push({ level: 'warn', text: rules.export.note });
  if (stamp && stamp.origin && !stamp.origin.printedIn && canadian && dest === 'US') {
    out.push({ level: 'info', text: 'Customs origin is where a stamp was printed. Some early Canadian stamps were printed in New York or London. Set "Printed in" if you know it.' });
  }
  return out;
}

/* ---------------------------------------------------------------------- */
/* Channels                                                                */
/* ---------------------------------------------------------------------- */

export const CHANNELS = [
  { id: 'ebay', name: 'eBay.ca listing', kind: 'marketplace', payout: 'About 2 days after the buyer pays', effort: 'You photograph, list, pack and ship' },
  { id: 'hipstamp', name: 'HipStamp listing', kind: 'marketplace', payout: 'After the buyer pays', effort: 'You photograph, list, pack and ship' },
  { id: 'delcampe', name: 'Delcampe listing', kind: 'marketplace', payout: 'After the buyer pays', effort: 'You photograph, list, pack and ship' },
  { id: 'auction', name: 'Auction house consignment', kind: 'auction', payout: 'Weeks to months, after the sale settles', effort: 'The house describes, photographs and sells it' },
  { id: 'dealer', name: 'Dealer buys outright', kind: 'dealer', payout: 'Same day', effort: 'Least work' },
  { id: 'lot', name: 'Group into a lot', kind: 'lot', payout: 'When the lot sells', effort: 'Bundle low-value stamps together' }
];

/**
 * Compare channels for one item.
 * ctx: { price, currency, dest, canadian, certificate, rules, now }
 */
export function compareChannels(ctx) {
  const rules = ctx.rules || RULES;
  const f = rules.fees;
  const P = Math.max(0, Number(ctx.price) || 0);
  const dest = ctx.dest || 'CA';
  const nowIso = ctx.now || new Date().toISOString();
  const tariff = dest === 'US' && ctx.canadian ? rules.customs.US.canadaTariff : 0;
  const blockedUS = usFormalEntry(ctx.canadian, dest, nowIso, rules);
  // A U.S. buyer who pays the duty on top will bid about P / (1 + duty).
  const marketP = tariff ? P / (1 + tariff) : P;
  const ship = shippingPlan(marketP, dest, rules, { duty: marketP * tariff });
  const cert = ctx.certificate ? rules.certificate.cost : 0;
  const eur = rules.eurToCad || 1.6;
  const out = [];

  const line = (label, amount) => ({ label, amount });
  const push = (ch, gross, lines, extra = {}) => {
    const net = gross + lines.reduce((s, l) => s + l.amount, 0);
    out.push(Object.assign({ id: ch.id, name: ch.name, kind: ch.kind, payout: ch.payout, effort: ch.effort, gross, lines, net, netPct: P ? net / P : 0, notes: [], blocked: false }, extra));
  };
  const shipLines = () => [line('Shipping paid by buyer', ship.cost), line('Your postage, declaration and supplies', -ship.cost)];

  // eBay.ca: final value fee on the total paid, per-order fee, international fee.
  {
    const e = f.ebay;
    const total = marketP + ship.cost;
    const rate = e.store ? e.storeRate : e.rate;
    const tierAt = e.store ? e.storeTierAt : e.tierAt;
    const fvf = Math.min(total, tierAt) * rate + Math.max(0, total - tierAt) * e.rateHigh;
    const perOrder = total > e.perOrderAt ? e.perOrderLarge : e.perOrderSmall;
    const intlRate = dest === 'CA' ? 0 : dest === 'US' ? e.intlUS : e.intlOther;
    const lines = [line('Final value fee' + (e.store ? ' (store)' : ''), -fvf), line('Per-order fee', -perOrder)];
    if (intlRate) lines.push(line('International fee', -total * intlRate));
    lines.push(...shipLines());
    if (cert) lines.push(line('Expert certificate', -cert));
    push(CHANNELS[0], marketP, lines);
  }
  // HipStamp: commission on item plus shipping, capped; PayPal fees estimated.
  {
    const hs = f.hipstamp;
    const total = marketP + ship.cost;
    const lines = [line('Commission', -Math.min(hs.cap, total * hs.rate)), line('Payment processing (estimate)', -(total * hs.payRate + (marketP > 0 ? hs.payFixed : 0))), ...shipLines()];
    if (cert) lines.push(line('Expert certificate', -cert));
    push(CHANNELS[1], marketP, lines);
  }
  // Delcampe: buyers pay a 10% fee plus a fixed fee, so the price lands near (P - fixed) / 1.10.
  {
    const dc = f.delcampe;
    const item = Math.max(0, (marketP - dc.buyerFixedEur * eur) / (1 + dc.buyerRate));
    const lines = [];
    if (dc.sellerRate) lines.push(line('Commission', -item * dc.sellerRate));
    lines.push(line('Payment fee', -((item + ship.cost) * dc.payRate + dc.payFixedEur * eur)), ...shipLines());
    if (cert) lines.push(line('Expert certificate', -cert));
    push(CHANNELS[2], item, lines, { grossLabel: 'Expected price (buyers add a 10% fee)' });
  }
  // Auction house: buyers add a premium, so the hammer price lands near P / (1 + premium).
  {
    const a = f.auction;
    const hammer = marketP / (1 + a.buyerPremium);
    const lines = [line('Seller commission' + (a.commissionEstimate ? ' (estimate)' : ''), -hammer * a.commission)];
    if (a.lotFee) lines.push(line('Lot fee', -a.lotFee));
    if (cert) lines.push(line('Expert certificate', -cert));
    push(CHANNELS[3], hammer, lines, { grossLabel: 'Expected hammer price' });
  }
  // Dealer: a share of retail, paid at once (a Canadian dealer, so no U.S. duty).
  push(CHANNELS[4], P * f.dealer.share, [], { grossLabel: 'Typical offer (estimate)' });
  // Lot: low-value items earn a share of their value as part of a bundle.
  push(CHANNELS[5], P * f.lot.share, [], { grossLabel: 'Share of a lot (estimate)' });

  for (const r of out) {
    if (r.kind === 'marketplace' && P < rules.thresholds.lot) r.notes.push('Fees and postage take most of a price this low.');
    if (r.kind === 'auction' && P < rules.thresholds.auctionMin) r.notes.push('Most houses only lot items this cheap as part of a larger group.');
    if (tariff && r.kind === 'marketplace') r.notes.push('U.S. buyers pay a ' + Math.round(tariff * 100) + '% duty on Canadian-origin stamps, so expect lower bids from them.');
    if (blockedUS && r.kind === 'marketplace') {
      r.blocked = true;
      r.notes.unshift('Not practical now: mail of Canadian-origin stamps to the U.S. needs formal customs entry from ' + rules.customs.US.formalEntryFrom + '.');
    }
  }
  return { channels: out, ship, marketP, tariff, blockedUS };
}

/** Pick a recommendation and say why. */
export function recommend(ctx, cmp, rules = RULES) {
  const P = Number(ctx.price) || 0;
  const t = rules.thresholds;
  const why = [];
  let best;
  if (P < t.lot) {
    best = 'lot';
    why.push('At this price, fees and postage would take most of the sale. Sell it in a lot with similar stamps.');
  } else {
    const pool = cmp.channels.filter(c => !c.blocked && c.kind !== 'lot' && (P >= t.auctionMin || c.kind !== 'auction'));
    pool.sort((a, b) => b.net - a.net);
    best = pool[0] ? pool[0].id : 'dealer';
    const top = pool[0];
    if (top) why.push(top.name + ' leaves you the most: about ' + fmtMoney(top.net, ctx.currency) + '.');
    if (P >= t.auctionFrom) why.push('At this value, an auction house reaches specialist bidders and handles the risk of shipping and returns.');
  }
  if (ctx.certRecommended && !ctx.certificate && P >= t.certFrom) why.push('Get an expert certificate first. Buyers pay more for a certified stamp at this level.');
  if (cmp.blockedUS) why.push('Plan this sale for Canadian or overseas buyers. Mailing Canadian-origin stamps to the U.S. now needs formal customs entry.');
  else if (cmp.tariff) why.push('This stamp counts as Canadian-origin, so U.S. buyers face the duty. Canadian and overseas buyers will usually pay more.');
  return { best, why };
}

/** Facts for the listing writer, so the listing never invents shipping rules. */
export function listingFacts(stamp, ctx, cmp, rules = RULES) {
  const ship = cmp.ship;
  const from = ctx.shipFrom || 'Canada';
  const shipping = ['Ships from ' + from + ' by Canada Post ' + ship.label + '.'];
  if (ship.method === 'letter') shipping.push('Sent flat in a stiffened envelope. Tracking is available on request.');
  if (ship.method === 'insured') shipping.push('Sent tracked and insured, with a signature on delivery.');
  shipping.push('Combined shipping for multiple purchases.');
  const customs = [];
  if (ctx.dest === 'US') {
    customs.push(ctx.canadian ? rules.customs.US.listingLine : 'U.S. orders ship with a customs declaration, and any duty is prepaid through Canada Post.');
  } else if (ctx.dest !== 'CA') {
    customs.push('International buyers pay any import duties and taxes.');
  }
  return { shipping, customs };
}

/** Collection-level summary for items marked for sale or listed. */
export function sellSummary(stamps, opts = {}) {
  const items = stamps.filter(s => s.status === 'sell' || s.status === 'listed');
  let total = 0, net = 0, priced = 0;
  const by = {};
  const currencies = new Set();
  for (const s of items) {
    const pp = planningPrice(s);
    if (!pp) continue;
    priced++;
    currencies.add(pp.currency);
    total += pp.amount;
    const ctx = { price: pp.amount, currency: pp.currency, dest: opts.dest || 'CA', canadian: isCanadianOrigin(s), certificate: false, certRecommended: !!(s.expertize && s.expertize.recommended), rules: opts.rules, now: opts.now };
    const cmp = compareChannels(ctx);
    const rec = recommend(ctx, cmp, opts.rules);
    const ch = cmp.channels.find(c => c.id === rec.best);
    net += ch ? Math.max(0, ch.net) : 0;
    by[rec.best] = (by[rec.best] || 0) + 1;
  }
  return { count: items.length, priced, total, net, by, currency: currencies.size === 1 ? [...currencies][0] : (currencies.size ? 'mixed' : 'CAD') };
}
