import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planningPrice, compsStats, compareChannels, recommend, shippingPlan, customsNotes, isCanadianOrigin, customsOrigin, sellSummary
} from '../src/sell/planner.js';
import { RULES } from '../src/sell/rules.js';

const base = {
  title: 'Canada 1859 5c Beaver', country: 'Canada', year: '1859',
  value: { currency: 'CAD', low: 40, high: 90 },
  origin: { printedIn: '' },
  pricing: { basis: 'auto', manual: null, comps: [] },
  expertize: { recommended: false }
};
const now = '2026-10-17T00:00:00Z';

test('planning price falls back to the AI midpoint with no comps', () => {
  const p = planningPrice(base, now);
  assert.equal(p.source, 'ai');
  assert.equal(p.amount, 65);
  assert.equal(p.strength, 'rough');
});

test('two or more comps switch Auto to the median of sold prices', () => {
  const s = { ...base, pricing: { basis: 'auto', comps: [
    { id: 'a', price: 50, currency: 'CAD', date: '2026-09-01' },
    { id: 'b', price: 80, currency: 'CAD', date: '2026-07-01' },
    { id: 'c', price: 70, currency: 'CAD', date: '2026-08-01' }
  ] } };
  const p = planningPrice(s, now);
  assert.equal(p.source, 'comps');
  assert.equal(p.amount, 70);
  assert.equal(p.strength, 'strong');
});

test('comps in another currency are left out and counted', () => {
  const st = compsStats([{ price: 10, currency: 'USD' }, { price: 20, currency: 'CAD' }], 'CAD', now);
  assert.equal(st.n, 1);
  assert.equal(st.otherCurrency, 1);
});

test('a manual price wins when chosen', () => {
  const p = planningPrice({ ...base, pricing: { basis: 'manual', manual: 120, comps: [] } }, now);
  assert.equal(p.source, 'manual');
  assert.equal(p.amount, 120);
});

test('customs origin uses where it was printed when known', () => {
  assert.equal(isCanadianOrigin(base), true);
  const printed = { ...base, origin: { printedIn: 'United States' } };
  assert.equal(customsOrigin(printed), 'United States');
  assert.equal(isCanadianOrigin(printed), false);
  assert.equal(isCanadianOrigin({ country: 'Newfoundland', origin: {} }), true);
});

test('shipping steps up from lettermail to tracked to insured', () => {
  assert.equal(shippingPlan(5, 'CA').method, 'letter');
  assert.equal(shippingPlan(60, 'CA').method, 'tracked');
  assert.equal(shippingPlan(900, 'INTL').method, 'insured');
});

test('goods to the U.S. never go by Lettermail and carry the declaration fee', () => {
  const s = shippingPlan(5, 'US');
  assert.equal(s.method, 'tracked');
  assert.ok(s.cost > RULES.postage.US.tracked);
  const withDuty = shippingPlan(100, 'US', RULES, { duty: 50 });
  assert.ok(withDuty.cost > shippingPlan(100, 'US').cost);
});

test('Canadian-origin sales to the U.S. are flagged from the formal entry date', () => {
  const before = compareChannels({ price: 300, currency: 'CAD', dest: 'US', canadian: true, now: '2026-10-17T12:00:00Z' });
  const after = compareChannels({ price: 300, currency: 'CAD', dest: 'US', canadian: true, now: '2026-10-22T12:00:00Z' });
  assert.equal(before.blockedUS, false);
  assert.equal(after.blockedUS, true);
  assert.ok(after.channels.filter(c => c.kind === 'marketplace').every(c => c.blocked));
  const rec = recommend({ price: 300, currency: 'CAD', dest: 'US' }, after);
  assert.ok(!['ebay', 'hipstamp', 'delcampe'].includes(rec.best));
  assert.ok(rec.why.some(w => /Canadian or overseas buyers/.test(w)));
});

test('old Canadian covers over $1,000 get the export permit note', () => {
  const cover = { ...base, year: '1934', subject: 'cover', format: { kind: 'cover' } };
  const notes = customsNotes(cover, 'UK', 1500, RULES, '2026-10-17T00:00:00Z');
  assert.ok(notes.some(n => /export permit/.test(n.text)));
  assert.ok(!customsNotes(cover, 'UK', 400, RULES, '2026-10-17T00:00:00Z').some(n => /export permit/.test(n.text)));
  assert.ok(!customsNotes({ ...base, year: '1934' }, 'UK', 1500, RULES, '2026-10-17T00:00:00Z').some(n => /export permit/.test(n.text)));
});

test('Delcampe prices account for the fee buyers pay on top', () => {
  const cmp = compareChannels({ price: 110, currency: 'CAD', dest: 'CA', canadian: true });
  const d = cmp.channels.find(c => c.id === 'delcampe');
  assert.ok(d.gross < 100 && d.gross > 95, String(d.gross));
});

test('the U.S. duty lowers expected bids on Canadian-origin items', () => {
  const ca = compareChannels({ price: 300, currency: 'CAD', dest: 'CA', canadian: true, now: '2026-10-17T00:00:00Z' });
  const us = compareChannels({ price: 300, currency: 'CAD', dest: 'US', canadian: true, now: '2026-10-17T00:00:00Z' });
  const ebayCA = ca.channels.find(c => c.id === 'ebay');
  const ebayUS = us.channels.find(c => c.id === 'ebay');
  assert.ok(us.tariff > 0);
  assert.ok(ebayUS.net < ebayCA.net, `${ebayUS.net} < ${ebayCA.net}`);
  const usOther = compareChannels({ price: 300, currency: 'CAD', dest: 'US', canadian: false });
  assert.equal(usOther.tariff, 0);
});

test('every channel adds up: net = gross + lines', () => {
  const cmp = compareChannels({ price: 150, currency: 'CAD', dest: 'UK', canadian: false, certificate: true });
  for (const c of cmp.channels) {
    const sum = c.gross + c.lines.reduce((s, l) => s + l.amount, 0);
    assert.ok(Math.abs(sum - c.net) < 1e-9, c.id);
  }
});

test('cheap stamps are steered to a lot; valuable ones get auction advice', () => {
  const low = { price: 2, currency: 'CAD', dest: 'CA', canadian: true };
  assert.equal(recommend(low, compareChannels(low)).best, 'lot');
  const high = { price: 2000, currency: 'CAD', dest: 'CA', canadian: true, certRecommended: true, certificate: false };
  const r = recommend(high, compareChannels(high));
  assert.ok(r.why.some(w => /auction house/i.test(w)));
  assert.ok(r.why.some(w => /certificate/i.test(w)));
});

test('customs notes warn about the U.S. duty only for Canadian-origin items', () => {
  const w = customsNotes(base, 'US', 100);
  assert.ok(w.some(n => n.level === 'warn' && /Canadian-origin/.test(n.text)));
  const other = customsNotes({ ...base, country: 'Great Britain', origin: { printedIn: 'United Kingdom' } }, 'US', 100);
  assert.ok(!other.some(n => n.level === 'warn' && /Canadian-origin/.test(n.text)));
  assert.equal(customsNotes(base, 'CA', 100).filter(n => /customs declaration/i.test(n.text)).length, 0);
});

test('sell summary counts items marked for sale', () => {
  const list = [
    { ...base, id: '1', status: 'sell' },
    { ...base, id: '2', status: 'keep' },
    { ...base, id: '3', status: 'listed', value: { currency: 'CAD', low: 1, high: 2 } }
  ];
  const s = sellSummary(list, { dest: 'CA' });
  assert.equal(s.count, 2);
  assert.equal(s.priced, 2);
  assert.ok(s.net > 0 && s.net <= s.total);
  assert.equal(s.by.lot, 1);
});

test('rules carry a checked date', () => {
  assert.match(RULES.asOf, /^\d{4}-\d{2}-\d{2}$/);
});
