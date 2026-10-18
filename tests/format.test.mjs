import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, fmtRange, fmtMoney, parseJSONLoose, median } from '../src/util/format.js';
import { csvEscape, toCSV } from '../src/util/csv.js';
import { normalizeId, normalizeListing, upgradeStamp } from '../src/ai/normalize.js';

test('clean removes em and en dashes', () => {
  assert.equal(clean('Used \u2014 light cancel'), 'Used, light cancel');
  assert.equal(clean('1851\u20131857'), '1851 to 1857');
});

test('money and ranges format plainly', () => {
  assert.equal(fmtRange({ currency: 'cad', low: 40, high: 90 }), 'CAD 40 to 90');
  assert.equal(fmtMoney(73.5, 'CAD'), 'CAD 73.50');
  assert.equal(fmtMoney(1250, 'CAD'), 'CAD 1,250');
});

test('loose JSON parsing survives code fences and prose', () => {
  assert.deepEqual(parseJSONLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJSONLoose('Here you go: {"a": 2} Thanks'), { a: 2 });
  assert.throws(() => parseJSONLoose('no json here'), e => e.code === 'invalid_json');
});

test('median handles odd and even lists', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test('CSV escapes quotes and blocks formula injection', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  const csv = toCSV([{ n: 'x' }], [['Name', r => r.n]]);
  assert.equal(csv, 'Name\r\nx\r\n');
});

test('normalizeId fills defaults and keeps only safe values', () => {
  const r = normalizeId({
    title: 'Canada 1859 5c \u2014 Beaver',
    catalogue: [{ system: 'Scott', number: '15', certainty: 'Likely' }, { system: '', number: '' }],
    value: { low: 90, high: 40, sources: ['From auction records'] },
    format: { kind: 'Block', count: '4' },
    origin: { printed_in: 'United States' },
    confidence: 'HIGH'
  }, 'CAD');
  assert.equal(r.title, 'Canada 1859 5c, Beaver');
  assert.equal(r.catalogue.length, 1);
  assert.equal(r.catalogue[0].certainty, 'likely');
  assert.deepEqual([r.value.low, r.value.high], [40, 90]);
  assert.equal(r.value.currency, 'CAD');
  assert.equal(r.value.sources[0].kind, 'general knowledge');
  assert.equal(r.format.kind, 'block');
  assert.equal(r.format.count, 4);
  assert.equal(r.origin.printedIn, 'United States');
  assert.equal(r.confidence, 'high');
});

test('normalizeListing keeps shipping text', () => {
  const L = normalizeListing({ title: 'T', description: 'D', shipping_text: 'Ships from Yukon.', price: { amount: '12' } }, 'CAD');
  assert.equal(L.shipping, 'Ships from Yukon.');
  assert.equal(L.price.amount, 12);
  assert.equal(L.price.currency, 'CAD');
});

test('upgradeStamp gives old records the new fields', () => {
  const s = upgradeStamp({ title: 'Old', value: { currency: 'CAD', low: 1, high: 2 } });
  assert.equal(s.subject, 'single');
  assert.deepEqual(s.pricing.comps, []);
  assert.equal(s.status, 'keep');
});
