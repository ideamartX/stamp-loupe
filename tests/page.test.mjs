import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectStamps, sheetLayout } from '../src/capture/page.js';
import { quadCentroid, orderQuad } from '../src/capture/vision.js';
import { rotatedQuad } from './helpers/synth.mjs';
import { renderPage, matchTruth, quadIoU } from './helpers/synth-page.mjs';

// Pages at the size the app analyses (1200 x 900), with a fixed seed each.
const PAGES = [
  ['white album page with a ruled grid', 'white', 8, 21],
  ['white album page, many stamps', 'white', 28, 22],
  ['cream album page', 'cream', 9, 23],
  ['cream album page, many stamps', 'cream', 26, 24],
  ['black stockbook with strips', 'stockbook', 10, 25],
  ['black stockbook, many stamps', 'stockbook', 30, 26],
  ['green cloth', 'cloth', 7, 27],
  ['green cloth, many stamps', 'cloth', 24, 28]
];

for (const [name, kind, count, seed] of PAGES) {
  test(`finds every stamp on a ${name}`, () => {
    const { img, truth } = renderPage({ kind, count, seed, w: 1200, h: 900 });
    const info = {};
    const items = detectStamps(img, { info });
    assert.equal(items.length, truth.length, `found ${items.length} of ${truth.length}`);
    const m = matchTruth(truth, items);
    const worst = Math.min(...m.map(x => x.iou));
    assert.ok(worst >= 0.75, `every stamp matched with IoU >= 0.75 (worst ${worst.toFixed(3)})`);
    // Each detection is used once.
    assert.equal(new Set(m.map(x => x.at)).size, truth.length);
    assert.ok(info.ms < 3000, `took ${info.ms} ms`);
  });
}

test('also works at a smaller analysis size', () => {
  const { img, truth } = renderPage({ kind: 'white', count: 20, seed: 31, w: 800, h: 600 });
  const items = detectStamps(img);
  assert.equal(items.length, truth.length);
  assert.ok(Math.min(...matchTruth(truth, items).map(x => x.iou)) >= 0.7);
});

test('an empty page returns no items', () => {
  for (const kind of ['white', 'cream', 'cloth']) {
    const { img } = renderPage({ kind, quads: [], seed: 5, w: 1200, h: 900 });
    assert.deepEqual(detectStamps(img), [], kind);
  }
  const { img } = renderPage({ kind: 'stockbook', quads: [], seed: 5, w: 1200, h: 900, strips: [{ y: 180, h: 160 }, { y: 520, h: 160 }] });
  assert.deepEqual(detectStamps(img), [], 'stockbook strips alone are not stamps');
});

test('two touching stamps come back as one or two items, never three', () => {
  for (const kind of ['white', 'stockbook']) {
    const quads = [
      orderQuad(rotatedQuad(500, 450, 200, 240, 0)),
      orderQuad(rotatedQuad(700, 450, 200, 240, 0))
    ];
    const { img } = renderPage({ kind, quads, seed: 9, w: 1200, h: 900 });
    const items = detectStamps(img);
    assert.ok(items.length === 1 || items.length === 2, `${kind}: ${items.length} items`);
    // Whatever comes back covers both stamps.
    for (const q of quads) assert.ok(items.some(it => quadIoU(q, it.quad) > 0.35), `${kind}: stamp covered`);
  }
});

test('items come back in reading order for a 3 x 4 grid', () => {
  const quads = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      // Rows wander a little, as hand-placed stamps do.
      const jitter = ((r * 4 + c) % 3 - 1) * 9;
      quads.push(orderQuad(rotatedQuad(170 + c * 280, 160 + r * 280 + jitter, 170, 200, ((c + r) % 3 - 1) * 4)));
    }
  }
  const { img, truth } = renderPage({ kind: 'cream', quads, seed: 12, w: 1200, h: 900 });
  const items = detectStamps(img);
  assert.equal(items.length, 12);
  const order = items.map(it => {
    let best = -1, at = -1;
    truth.forEach((t, i) => { const v = quadIoU(t, it.quad); if (v > best) { best = v; at = i; } });
    return at;
  });
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test('a stamp cut off by the photo edge is flagged', () => {
  const quads = [orderQuad(rotatedQuad(600, 450, 200, 240, 3)), orderQuad(rotatedQuad(1150, 300, 200, 240, 0))];
  const { img } = renderPage({ kind: 'stockbook', quads, seed: 4, w: 1200, h: 900 });
  const items = detectStamps(img);
  const cut = items.find(it => quadCentroid(it.quad).x > 1000);
  const whole = items.find(it => Math.abs(quadCentroid(it.quad).x - 600) < 40);
  assert.ok(cut && cut.edge, 'cut-off stamp has edge: true');
  assert.ok(whole && !whole.edge, 'whole stamp has edge: false');
});

test('an item much larger than the rest is marked for review', () => {
  const quads = [];
  for (let i = 0; i < 5; i++) quads.push(orderQuad(rotatedQuad(150 + i * 220, 220, 150, 180, 0)));
  // Two stamps side by side with no gap: likely one item twice the usual size.
  quads.push(orderQuad(rotatedQuad(450, 620, 150, 180, 0)), orderQuad(rotatedQuad(600, 620, 150, 180, 0)));
  const { img } = renderPage({ kind: 'stockbook', quads, seed: 6, w: 1200, h: 900 });
  const items = detectStamps(img);
  const singles = items.filter(it => quadCentroid(it.quad).y < 400);
  assert.equal(singles.length, 5);
  assert.ok(singles.every(it => !it.review), 'single stamps are not marked');
  const pair = items.filter(it => quadCentroid(it.quad).y > 400);
  if (pair.length === 1) assert.equal(pair[0].review, true, 'a merged pair is marked for review');
  else assert.equal(pair.length, 2);
});

test('items carry the documented fields', () => {
  const { img } = renderPage({ kind: 'cloth', count: 6, seed: 3, w: 1200, h: 900 });
  const items = detectStamps(img);
  for (const it of items) {
    assert.equal(it.quad.length, 4);
    assert.ok(it.area > 0 && it.fill > 0 && it.fill <= 1 && it.score > 0 && it.score <= 1);
    assert.equal(typeof it.edge, 'boolean');
    assert.equal(typeof it.review, 'boolean');
    // Corners run clockwise from the top left.
    const [tl, tr, br, bl] = it.quad;
    assert.ok(tl.x < tr.x && bl.x < br.x && tl.y < bl.y && tr.y < br.y);
  }
});

/* Contact sheet layout */

const within = (c, sh) => c.x >= 0 && c.y >= 0 && c.x + c.w <= sh.width && c.y + c.h <= sh.height;

test('sheetLayout keeps proportions and fits the size limit', () => {
  const sizes = [{ w: 300, h: 360 }, { w: 640, h: 480 }, { w: 200, h: 600 }, { w: 500, h: 500 }];
  const { sheets } = sheetLayout(sizes);
  assert.equal(sheets.length, 1);
  const sh = sheets[0];
  assert.ok(Math.max(sh.width, sh.height) <= 1900);
  sh.cells.forEach((c, i) => {
    assert.equal(c.n, i + 1);
    assert.ok(within(c, sh));
    const want = sizes[i].w / sizes[i].h;
    assert.ok(Math.abs(c.w / c.h - want) < 0.02, `aspect ${c.w}x${c.h}`);
    // Each crop sits inside its own cell.
    assert.ok(c.x >= c.box.x && c.y >= c.box.y && c.x + c.w <= c.box.x + c.box.w && c.y + c.h <= c.box.y + c.box.h);
  });
});

test('sheetLayout cells do not overlap', () => {
  const sizes = Array.from({ length: 30 }, (_, i) => ({ w: 200 + (i % 5) * 40, h: 240 - (i % 3) * 30 }));
  const { sheets } = sheetLayout(sizes);
  assert.equal(sheets.length, 1);
  const boxes = sheets[0].cells.map(c => c.box);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.ok(apart, `cells ${i + 1} and ${j + 1} overlap`);
    }
  }
});

test('sheetLayout splits large pages and keeps numbering', () => {
  const sizes = Array.from({ length: 100 }, () => ({ w: 300, h: 360 }));
  const { sheets } = sheetLayout(sizes);
  assert.deepEqual(sheets.map(s => s.cells.length), [48, 48, 4]);
  assert.deepEqual(sheets.flatMap(s => s.cells.map(c => c.n)), Array.from({ length: 100 }, (_, i) => i + 1));
  for (const sh of sheets) {
    assert.ok(Math.max(sh.width, sh.height) <= 1900);
    assert.ok(sh.cells.every(c => within(c, sh)));
  }
  const { sheets: s2 } = sheetLayout([{ w: 10, h: 10 }], { start: 49 });
  assert.equal(s2[0].cells[0].n, 49);
});

test('sheetLayout caps the cell size for a single small item', () => {
  const { sheets } = sheetLayout([{ w: 120, h: 150 }]);
  assert.ok(sheets[0].cell <= 520);
  assert.ok(sheets[0].width < 600 && sheets[0].height < 600);
});
