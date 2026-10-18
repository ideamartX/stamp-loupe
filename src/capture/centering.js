// Centering: how evenly the printed design sits inside the stamp's margins.
//
// Ported from stamp-grader (https://github.com/DanMat/stamp-grader),
// Copyright 2026 Dan Matthew, licensed under the Apache License, Version 2.0.
// Changes for Stamp Loupe: rewritten in JavaScript; runs on the app's own
// straightened crop, so stamp-grader's segmentation, outline fit and
// perforation gauge are not used; adds a reading as a range and plain
// wording for the result. See NOTICE.md for the license notice.
//
// The design box is found by projecting an "ink" mask onto each axis:
// colour saturation for coloured stamps, darkness for black or grey ones.
// Margins run from the stamp's edge (perforation tips) to the design box.

import { clamp } from './vision.js';

/** Grade bands from stamp-grader. Its author calls them uncalibrated. */
export const CENTERING_BANDS = [
  [95, 'Superb'],
  [80, 'Extremely Fine'],
  [65, 'Very Fine'],
  [50, 'Fine to Very Fine'],
  [0, 'Fine or lower']
];

/** Python-style rounding: halves go to the even neighbour. */
export function roundHalfEven(x) {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Percentile with linear interpolation, as numpy computes it. */
export function percentile(values, p) {
  const n = values.length;
  if (!n) return 0;
  const a = Float64Array.from(values).sort();
  const pos = (n - 1) * p / 100;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

/** Index span of the design along one axis profile (stamp-grader's _design_span). */
export function designSpan(profile) {
  const len = profile.length;
  let max = 0;
  for (let i = 0; i < len; i++) if (profile[i] > max) max = profile[i];
  if (max <= 0) return null;
  const runs = [];
  let start = -1;
  for (let i = 0; i <= len; i++) {
    const on = i < len && profile[i] > 0.15 * max;
    if (on && start < 0) start = i;
    if (!on && start >= 0) { runs.push([start, i - 1]); start = -1; }
  }
  if (!runs.length) return null;
  const minLen = Math.max(1, Math.floor(0.03 * len));
  let kept = runs.filter(r => r[1] - r[0] + 1 >= minLen);
  if (!kept.length) kept = runs;
  const s = kept[0][0], e = kept[kept.length - 1][1];
  return { start: s, end: e, clampedLo: s === 0, clampedHi: e === len - 1 };
}

function closeMask(mask, w, h, r) {
  // Square dilation then erosion, done separably with running counts.
  const pass = (src, horizontal, dilate) => {
    const out = new Uint8Array(w * h);
    const n = horizontal ? w : h, m = horizontal ? h : w;
    for (let j = 0; j < m; j++) {
      let count = 0;
      const at = i => (horizontal ? src[j * w + i] : src[i * w + j]);
      for (let i = 0; i < Math.min(r, n); i++) count += at(i);
      for (let i = 0; i < n; i++) {
        if (i + r < n) count += at(i + r);
        if (i - r - 1 >= 0) count -= at(i - r - 1);
        const lo = Math.max(0, i - r), hi = Math.min(n - 1, i + r);
        const v = dilate ? (count > 0 ? 1 : 0) : (count === hi - lo + 1 ? 1 : 0);
        if (horizontal) out[j * w + i] = v; else out[i * w + j] = v;
      }
    }
    return out;
  };
  const d = pass(pass(mask, true, true), false, true);
  return pass(pass(d, true, false), false, false);
}

/**
 * Measure centering on an upright crop of one stamp.
 * img: { width, height, data } RGBA (ImageData shape).
 * opts.inset: fraction of each side that is background outside the stamp
 *   (the app straightens with a 2.5% margin, which leaves about 1.2%).
 * Returns { ok: true, score, low, high, band, words, margins: { left, right, top, bottom } (fractions of the stamp),
 *   lr: [left %, right %], tb: [top %, bottom %], method, confidence, reasons }
 * or { ok: false, reason }.
 */
export function measureCentering(img, opts = {}) {
  const fullW = img.width, fullH = img.height, d = img.data;
  const inset = opts.inset != null ? opts.inset : (1 - 1 / 1.025) / 2;
  const x0 = Math.round(fullW * inset), y0 = Math.round(fullH * inset);
  const W = fullW - 2 * x0, H = fullH - 2 * y0;
  if (W < 40 || H < 40) return { ok: false, reason: 'too_small' };
  const N = W * H;
  const S = new Float32Array(N), G = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = ((y + y0) * fullW + (x + x0)) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      S[y * W + x] = mx > 0 ? 255 * (mx - mn) / mx : 0;
      G[y * W + x] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  const minSide = Math.min(W, H);
  const inner = (perf, arr) => {
    const out = [];
    for (let y = perf; y < H - perf; y++) for (let x = perf; x < W - perf; x++) out.push(arr[y * W + x]);
    return out;
  };

  let perf = Math.floor(0.025 * minSide);
  let sIn = inner(perf, S);
  let colourShare = 0;
  for (const v of sIn) if (v > 40) colourShare++;
  colourShare /= Math.max(1, sIn.length);
  let method, test;
  if (colourShare > 0.06) {
    method = 'colour';
    const thr = Math.max(40, percentile(sIn, 60));
    test = i => S[i] > thr;
  } else {
    method = 'mono';
    perf = Math.floor(0.05 * minSide);
    const p85 = percentile(inner(perf, G), 85);
    test = i => G[i] < 0.6 * p85;
  }
  const iw = W - 2 * perf, ih = H - 2 * perf;
  if (iw < 8 || ih < 8) return { ok: false, reason: 'too_small' };
  let ink = new Uint8Array(iw * ih);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) ink[y * iw + x] = test((y + perf) * W + (x + perf)) ? 1 : 0;
  ink = closeMask(ink, iw, ih, 2);
  let total = 0;
  const cols = new Float64Array(iw), rows = new Float64Array(ih);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    if (ink[y * iw + x]) { total++; cols[x]++; rows[y]++; }
  }
  if (total < 20) return { ok: false, reason: 'no_design_found' };
  const sx = designSpan(cols), sy = designSpan(rows);
  if (!sx || !sy) return { ok: false, reason: 'no_design_found' };

  const dx0 = perf + sx.start, dx1 = perf + sx.end, dy0 = perf + sy.start, dy1 = perf + sy.end;
  // dx1 and dy1 are inclusive, so right and bottom carry one extra pixel, as in stamp-grader.
  const L = dx0, R = W - dx1, T = dy0, B = H - dy1;
  const ratio = (a, b) => (Math.max(a, b) > 0 ? Math.min(a, b) / Math.max(a, b) : 1);
  const hc = ratio(L, R), vc = ratio(T, B);
  const score = roundHalfEven(Math.min(hc, vc) * 100);

  const reasons = [];
  const fill = ((dx1 - dx0 + 1) * (dy1 - dy0 + 1)) / (W * H);
  if (fill < 0.35 || fill > 0.97) reasons.push('implausible_design_fill');
  if (sx.clampedLo || sx.clampedHi || sy.clampedLo || sy.clampedHi) reasons.push('design_in_perf_band');
  const confidence = reasons.length ? 'low' : 'ok';
  if (method === 'mono') reasons.push('design_isolated_by_darkness');

  // Photos of the same stamp vary by a few points, so report a range.
  const spread = confidence === 'low' ? 10 : 5;
  const low = clamp(score - spread, 0, 100), high = clamp(score + spread, 0, 100);
  const band = (CENTERING_BANDS.find(b => score >= b[0]) || CENTERING_BANDS[CENTERING_BANDS.length - 1])[1];
  return {
    ok: true, score, low, high, band, words: centeringWords(score, { L, R, T, B }),
    margins: { left: L / W, right: R / W, top: T / H, bottom: B / H },
    lr: [Math.round(100 * L / Math.max(1, L + R)), Math.round(100 * R / Math.max(1, L + R))],
    tb: [Math.round(100 * T / Math.max(1, T + B)), Math.round(100 * B / Math.max(1, T + B))],
    method, confidence, reasons, fill
  };
}

/** Plain wording, after stamp-grader's app. */
export function centeringWords(score, m) {
  let w = score >= 92 ? 'Beautifully centred' : score >= 80 ? 'Well centred' : score >= 65 ? 'Fairly centred' : 'Off centre';
  const sits = [];
  if (m) {
    if (m.L < 0.8 * m.R) sits.push('left');
    else if (m.R < 0.8 * m.L) sits.push('right');
    if (m.T < 0.8 * m.B) sits.push('high');
    else if (m.B < 0.8 * m.T) sits.push('low');
  }
  if (sits.length) w += ', the design sits ' + sits.join(' and ');
  return w;
}

/** One-line summary for the result card and the AI prompt. */
export function centeringSummary(c) {
  if (!c || !c.ok) return '';
  return `${c.words}. Left to right ${c.lr[0]}/${c.lr[1]}, top to bottom ${c.tb[0]}/${c.tb[1]}. Score about ${c.low} to ${c.high} of 100 (${c.band}).`;
}

/** Browser helper: measure on a canvas, scaled to about 700 px on the long side. */
export function centeringFromCanvas(canvas, opts = {}) {
  const k = Math.min(1, 700 / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * k)), h = Math.max(1, Math.round(canvas.height * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, w, h);
  return measureCentering(ctx.getImageData(0, 0, w, h), opts);
}
