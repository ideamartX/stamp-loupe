import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureCentering, designSpan, percentile, roundHalfEven, centeringWords, centeringSummary } from '../src/capture/centering.js';

/**
 * An upright stamp as the app's straightening step produces it: a thin band
 * of dark background, perforated paper, and a printed design whose margins
 * (in pixels of the stamp) are given.
 */
function upright({ W = 300, H = 360, inset = (1 - 1 / 1.025) / 2, m = { l: 36, r: 36, t: 42, b: 42 }, ink = [40, 70, 160], mono = false, design = true, seed = 3 }) {
  const fw = Math.round(W / (1 - 2 * inset)), fh = Math.round(H / (1 - 2 * inset));
  const x0 = Math.round(fw * inset), y0 = Math.round(fh * inset);
  const data = new Uint8ClampedArray(fw * fh * 4);
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const paper = mono ? [246, 246, 244] : [240, 234, 216];
  const inkC = mono ? [30, 30, 30] : ink;
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const i = (y * fw + x) * 4;
      let c = [22, 24, 30];
      const lx = x - x0, ly = y - y0;
      if (lx >= 0 && ly >= 0 && lx < W && ly < H) {
        const dx = Math.min(lx, W - 1 - lx), dy = Math.min(ly, H - 1 - ly);
        const hole = (dy < 3.5 && Math.hypot((lx % 10) - 5, dy) < 3.5) || (dx < 3.5 && Math.hypot(dx, (ly % 10) - 5) < 3.5);
        c = hole ? [22, 24, 30] : paper;
        if (!hole && design && lx >= m.l && lx < W - m.r && ly >= m.t && ly < H - m.b) {
          const line = Math.floor(ly / 3) % 2 === 0;
          const ox = (lx - (m.l + (W - m.r)) / 2) / ((W - m.l - m.r) / 2.4), oy = (ly - (m.t + (H - m.b)) / 2) / ((H - m.t - m.b) / 2.4);
          const oval = ox * ox + oy * oy < 1;
          c = oval ? (line ? inkC : paper) : (line ? inkC : [inkC[0] + 60, inkC[1] + 60, inkC[2] + 60]);
          // A solid frame line round the design, as engraved stamps have.
          if (lx < m.l + 3 || lx >= W - m.r - 3 || ly < m.t + 3 || ly >= H - m.b - 3) c = inkC;
        }
      }
      const n = (rand() - 0.5) * 6;
      data[i] = c[0] + n; data[i + 1] = c[1] + n; data[i + 2] = c[2] + n; data[i + 3] = 255;
    }
  }
  return { width: fw, height: fh, data };
}

test('helpers match numpy and Python behaviour', () => {
  assert.equal(roundHalfEven(2.5), 2);
  assert.equal(roundHalfEven(3.5), 4);
  assert.equal(roundHalfEven(66.4), 66);
  assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
  assert.equal(percentile([10, 20, 30, 40, 50], 60), 34);
  const p = [0, 0, 5, 9, 9, 9, 0, 1, 0, 0];
  assert.deepEqual(designSpan(p), { start: 2, end: 5, clampedLo: false, clampedHi: false });
});

test('a well centred stamp scores high', () => {
  const c = measureCentering(upright({}));
  assert.ok(c.ok, c.reason);
  assert.ok(c.score >= 90, 'score ' + c.score);
  assert.equal(c.method, 'colour');
  assert.equal(c.confidence, 'ok');
  assert.ok(c.low <= c.score && c.high >= c.score);
  assert.match(c.words, /centred/);
});

test('a design shifted right is measured and named', () => {
  const c = measureCentering(upright({ m: { l: 56, r: 24, t: 42, b: 42 } }));
  assert.ok(c.ok, c.reason);
  // Left 56, right 24 (plus the inclusive pixel): about 25/56 = 0.45.
  assert.ok(c.score >= 38 && c.score <= 52, 'score ' + c.score);
  assert.equal(c.band, 'Fine or lower');
  assert.match(c.words, /sits right/);
  assert.ok(c.lr[0] > c.lr[1]);
});

test('a black design on white paper uses the darkness method', () => {
  const c = measureCentering(upright({ mono: true, m: { l: 30, r: 40, t: 50, b: 40 } }));
  assert.ok(c.ok, c.reason);
  assert.equal(c.method, 'mono');
  assert.ok(c.score >= 64 && c.score <= 84, 'score ' + c.score);
  assert.ok(c.reasons.includes('design_isolated_by_darkness'));
});

test('blank paper is refused, not guessed', () => {
  const c = measureCentering(upright({ design: false }));
  assert.equal(c.ok, false);
  assert.equal(c.reason, 'no_design_found');
});

test('a design running into the perforations lowers confidence', () => {
  const c = measureCentering(upright({ m: { l: 2, r: 36, t: 42, b: 42 } }));
  assert.ok(c.ok, c.reason);
  assert.equal(c.confidence, 'low');
  assert.ok(c.reasons.includes('design_in_perf_band'));
  assert.ok(c.high - c.low >= 20);
});

test('words and summary read plainly', () => {
  assert.equal(centeringWords(95, { L: 10, R: 10, T: 10, B: 10 }), 'Beautifully centred');
  assert.equal(centeringWords(50, { L: 20, R: 10, T: 10, B: 20 }), 'Off centre, the design sits right and high');
  const sum = centeringSummary({ ok: true, words: 'Well centred', lr: [48, 52], tb: [50, 50], low: 80, high: 90, band: 'Extremely Fine' });
  assert.equal(sum, 'Well centred. Left to right 48/52, top to bottom 50/50. Score about 80 to 90 of 100 (Extremely Fine).');
  assert.doesNotMatch(sum, /[–—]/);
});
