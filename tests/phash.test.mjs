// Duplicate check: calibration and behaviour of src/capture/phash.js.
//
// The designs below differ the way separate issues do (frame, motif, text
// layout, proportions, ink). Each is photographed again under the changes a
// second photo brings: crop shifts and zoom, exposure, white balance, blur,
// JPEG damage and quarter turns. Distance tables print with the results.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signatureFromRGBA, compareSignatures, findMatches, encodeSignature, decodeSignature, hamming, MATCH
} from '../src/capture/phash.js';
import { blurImage } from './helpers/synth.mjs';

/* ---------------------------------------------------------------------- */
/* Synthetic stamps                                                        */
/* ---------------------------------------------------------------------- */

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function starPoints(cx, cy, r1, r2, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r2 : r1;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** Colour of a design at paper point (u, v), both 0 to 1. */
function designAt(spec, u, v) {
  const { paper, ink, ink2 } = spec;
  const m = 0.09;
  const inner = u > m + 0.035 && u < 1 - m - 0.035 && v > m + 0.035 && v < 1 - m - 0.035;
  const inFrame = u > m && u < 1 - m && v > m && v < 1 - m;
  let c = paper;
  if (spec.frame === 'rect' && inFrame && !inner) c = ink;
  if (spec.frame === 'double') {
    const ring = (a, b) => u > a && u < 1 - a && v > a && v < 1 - a && !(u > b && u < 1 - b && v > b && v < 1 - b);
    if (ring(m, m + 0.012) || ring(m + 0.03, m + 0.042)) c = ink;
  }
  if (spec.frame === 'arch' && inFrame && ((v < 0.42 && !inEllipse(u, v, 0.5, 0.42, 0.36, 0.3)) || !inner)) c = ink;
  if (spec.frame === 'oval' && inFrame && !inEllipse(u, v, 0.5, 0.5, 0.36, 0.38)) c = ink2;
  const ex = 0.5 + (spec.mx || 0), ey = 0.5 + (spec.my || 0);
  if (inner || spec.frame === 'none') {
    switch (spec.motif) {
      case 'portrait':
        if (inEllipse(u, v, ex, ey, 0.25, 0.3)) c = ink2;
        if (inEllipse(u, v, ex + 0.03, ey - 0.04, 0.11, 0.14)) c = ink;
        if (inEllipse(u, v, ex - 0.02, ey + 0.17, 0.17, 0.08)) c = ink;
        break;
      case 'star':
        if (inPoly(u, v, starPoints(ex, ey, 0.3, 0.13))) c = ink;
        break;
      case 'band':
        if (Math.abs((u - ex) - (v - ey)) < 0.1) c = ink;
        if (Math.abs((u - ex) - (v - ey)) < 0.04) c = ink2;
        break;
      case 'landscape':
        if (v > ey + 0.08) c = ink2;
        if (inPoly(u, v, [[0.15, ey + 0.1], [0.38, ey - 0.2], [0.6, ey + 0.1]])) c = ink;
        if (inPoly(u, v, [[0.45, ey + 0.1], [0.66, ey - 0.08], [0.88, ey + 0.1]])) c = ink;
        if (inEllipse(u, v, 0.72, ey - 0.24, 0.07, 0.06)) c = ink;
        break;
      case 'numeral':
        if ((u > ex - 0.18 && u < ex - 0.08 && Math.abs(v - ey) < 0.25) ||
          (u > ex + 0.04 && u < ex + 0.2 && Math.abs(v - ey) < 0.25 && !(u > ex + 0.08 && u < ex + 0.16 && Math.abs(v - ey) < 0.19))) c = ink;
        break;
      case 'ship':
        if (inPoly(u, v, [[0.2, ey + 0.08], [0.8, ey + 0.08], [0.7, ey + 0.2], [0.3, ey + 0.2]])) c = ink;
        if (Math.abs(u - 0.42) < 0.012 && v > ey - 0.3 && v < ey + 0.08) c = ink;
        if (inPoly(u, v, [[0.44, ey - 0.28], [0.68, ey + 0.04], [0.44, ey + 0.04]])) c = ink2;
        if (v > ey + 0.2) c = ink2;
        break;
      case 'stripes':
        if (Math.floor((v - 0.14) / 0.09) % 2 === 0) c = ink;
        if (u < 0.45 && v < 0.5) c = ink2;
        break;
      case 'ring':
        if (inEllipse(u, v, ex, ey, 0.3, 0.3) && !inEllipse(u, v, ex, ey, 0.2, 0.2)) c = ink;
        if (inEllipse(u, v, ex, ey, 0.08, 0.08)) c = ink2;
        break;
      case 'bird':
        if (inEllipse(u, v, ex, ey, 0.22, 0.1)) c = ink;
        if (inPoly(u, v, [[ex - 0.1, ey], [ex + 0.05, ey - 0.3], [ex + 0.12, ey - 0.02]])) c = ink;
        if (inEllipse(u, v, ex + 0.24, ey - 0.06, 0.06, 0.05)) c = ink2;
        break;
      case 'cross':
        if ((Math.abs(u - ex) < 0.06 && Math.abs(v - ey) < 0.3) || (Math.abs(v - ey + 0.05) < 0.06 && Math.abs(u - ex) < 0.22)) c = ink;
        break;
      case 'leaf':
        if (inEllipse(u, v, ex, ey, 0.16, 0.3) && Math.abs(u - ex) > 0.012) c = ink;
        break;
      default:
        break;
    }
    if (spec.engraved && c === ink && Math.floor(v * 140) % 3 === 0) c = ink2;
  }
  for (const t of spec.text || []) {
    let a, b, along;
    if (t === 'top') { a = v > 0.135 && v < 0.19; along = u; b = u > 0.18 && u < 0.82; }
    if (t === 'bottom') { a = v > 0.79 && v < 0.85; along = u; b = u > 0.24 && u < 0.76; }
    if (t === 'left') { a = u > 0.135 && u < 0.18; along = v; b = v > 0.3 && v < 0.7; }
    if (t === 'right') { a = u > 0.82 && u < 0.865; along = v; b = v > 0.3 && v < 0.7; }
    if (a && b && Math.floor(along * 60) % 3 !== 0) c = ink;
  }
  // A denomination in one corner: a value changes this block only.
  if (spec.value && u > 0.72 && u < 0.86 && v > 0.12 && v < 0.24) {
    const cell = Math.floor((u - 0.72) / 0.035) + 4 * Math.floor((v - 0.12) / 0.04);
    if (((spec.value * 2654435761) >>> cell) & 1) c = ink;
  }
  return c;
}

/**
 * A straightened crop as the app makes one: the paper with perforation
 * teeth and a 2.5% margin of background all round.
 */
function renderCrop(spec, opts = {}) {
  const W = opts.width || 150;
  const aspect = spec.aspect || 1.2;
  const H = Math.round(W * aspect);
  const rand = rng(opts.seed || 1);
  const bg = opts.bg || [22, 24, 30];
  const data = new Uint8ClampedArray(W * H * 4);
  const margin = 0.025, zoom = opts.zoom || 1, sx = opts.shiftX || 0, sy = opts.shiftY || 0;
  const LW = 300, LH = 300 * aspect, tooth = 9, holeR = 3.4;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fx = ((x + 0.5) / W - 0.5) / zoom + 0.5 + sx;
      const fy = ((y + 0.5) / H - 0.5) / zoom + 0.5 + sy;
      const u = (fx - margin) / (1 - 2 * margin), v = (fy - margin) / (1 - 2 * margin);
      let c = bg;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        const px = u * LW, py = v * LH;
        const dx = Math.min(px, LW - px), dy = Math.min(py, LH - py);
        let hole = false;
        if (dy < holeR) { const k = Math.round(px / tooth) * tooth; hole = Math.hypot(px - k, dy) < holeR; }
        if (!hole && dx < holeR) { const k = Math.round(py / tooth) * tooth; hole = Math.hypot(dx, py - k) < holeR; }
        if (!hole) c = designAt(spec, u, v);
      }
      const n = opts.noise ? (rand() - 0.5) * 2 * opts.noise : 0;
      const i = (y * W + x) * 4;
      data[i] = c[0] + n; data[i + 1] = c[1] + n; data[i + 2] = c[2] + n; data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

/** Quarter turns clockwise: new(x, y) = old(y, h - 1 - x). */
function turnImage(img, quarter) {
  let out = img;
  for (let q = 0; q < quarter; q++) {
    const { width: w, height: h, data } = out;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < w; y++) for (let x = 0; x < h; x++) {
      const si = ((h - 1 - x) * w + y) * 4, di = (y * h + x) * 4;
      d[di] = data[si]; d[di + 1] = data[si + 1]; d[di + 2] = data[si + 2]; d[di + 3] = 255;
    }
    out = { width: h, height: w, data: d };
  }
  return out;
}

function mapPixels(img, fn) {
  const d = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = fn(img.data[i], img.data[i + 1], img.data[i + 2]);
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data: d };
}

/** JPEG-like damage: an offset per 8 x 8 block plus pixel noise. */
function jpegish(img, seed, amount) {
  const rand = rng(seed);
  const { width: w, height: h } = img;
  const bw = Math.ceil(w / 8);
  const off = Array.from({ length: bw * Math.ceil(h / 8) }, () => (rand() - 0.5) * amount);
  const d = new Uint8ClampedArray(img.data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, o = off[(y >> 3) * bw + (x >> 3)] + (rand() - 0.5) * amount;
    d[i] = img.data[i] + o; d[i + 1] = img.data[i + 1] + o; d[i + 2] = img.data[i + 2] + o; d[i + 3] = 255;
  }
  return { width: w, height: h, data: d };
}

/** Area-average to size x size, as the app's canvas helper does. */
function shrink(img, size) {
  const { width: w, height: h, data } = img;
  const sum = new Float64Array(size * size * 3), cnt = new Float64Array(size * size);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = Math.min(size - 1, Math.floor(y * size / h)) * size + Math.min(size - 1, Math.floor(x * size / w));
    const i = (y * w + x) * 4;
    sum[3 * k] += data[i]; sum[3 * k + 1] += data[i + 1]; sum[3 * k + 2] += data[i + 2]; cnt[k]++;
  }
  const d = new Uint8ClampedArray(size * size * 4);
  for (let k = 0; k < size * size; k++) {
    d[4 * k] = sum[3 * k] / cnt[k]; d[4 * k + 1] = sum[3 * k + 1] / cnt[k]; d[4 * k + 2] = sum[3 * k + 2] / cnt[k]; d[4 * k + 3] = 255;
  }
  return { width: size, height: size, data: d };
}

/** Signature the way the app takes one: shrink to 96 x 96, keep the proportions. */
function sigOf(img) {
  const s = shrink(img, 96);
  return signatureFromRGBA(s.data, 96, 96, { aspect: img.height / img.width });
}

const PAPER = { cream: [238, 232, 214], white: [244, 243, 238], buff: [232, 220, 190], grey: [226, 226, 222] };
const INK = {
  vermilion: [196, 58, 40], blue: [40, 62, 150], green: [36, 112, 64], brown: [112, 70, 40], black: [32, 30, 34],
  violet: [104, 54, 128], carmine: [168, 30, 70], olive: [104, 110, 46], orange: [214, 120, 34], slate: [70, 84, 96],
  ultramarine: [36, 50, 190], sepia: [94, 72, 56]
};
const tint = c => c.map(v => Math.round(v + (245 - v) * 0.55));
const recolour = (spec, ink) => ({ ...spec, ink, ink2: tint(ink) });

const DESIGNS = [
  { name: 'portrait-rect', frame: 'rect', motif: 'portrait', text: ['top', 'bottom'], ink: INK.blue, paper: PAPER.cream, engraved: true },
  { name: 'star-double', frame: 'double', motif: 'star', text: ['bottom'], ink: INK.vermilion, paper: PAPER.white },
  { name: 'band-none', frame: 'none', motif: 'band', text: ['top'], ink: INK.green, paper: PAPER.white, aspect: 0.85 },
  { name: 'landscape-rect', frame: 'rect', motif: 'landscape', text: ['bottom'], ink: INK.brown, paper: PAPER.buff, aspect: 0.8 },
  { name: 'numeral-oval', frame: 'oval', motif: 'numeral', text: ['top', 'bottom'], ink: INK.black, paper: PAPER.white },
  { name: 'ship-arch', frame: 'arch', motif: 'ship', text: ['top'], ink: INK.ultramarine, paper: PAPER.cream, aspect: 1.25 },
  { name: 'stripes-none', frame: 'none', motif: 'stripes', text: [], ink: INK.carmine, paper: PAPER.white, aspect: 0.75 },
  { name: 'ring-double', frame: 'double', motif: 'ring', text: ['left', 'right'], ink: INK.violet, paper: PAPER.cream },
  { name: 'bird-rect', frame: 'rect', motif: 'bird', text: ['top'], ink: INK.olive, paper: PAPER.white, mx: -0.05 },
  { name: 'cross-arch', frame: 'arch', motif: 'cross', text: ['bottom'], ink: INK.orange, paper: PAPER.white },
  { name: 'leaf-none', frame: 'none', motif: 'leaf', text: ['top', 'bottom'], ink: INK.green, paper: PAPER.buff, aspect: 1.35 },
  { name: 'portrait-oval', frame: 'oval', motif: 'portrait', text: ['bottom'], ink: INK.sepia, paper: PAPER.cream, my: 0.04 },
  { name: 'star-none-wide', frame: 'none', motif: 'star', text: ['top', 'bottom'], ink: INK.slate, paper: PAPER.grey, aspect: 0.7, mx: 0.12 },
  { name: 'landscape-double', frame: 'double', motif: 'landscape', text: ['top'], ink: INK.carmine, paper: PAPER.white, aspect: 0.82, my: 0.06 },
  { name: 'numeral-rect', frame: 'rect', motif: 'numeral', text: ['left', 'right'], ink: INK.green, paper: PAPER.white, mx: 0.05 },
  { name: 'ship-none', frame: 'none', motif: 'ship', text: ['bottom'], ink: INK.black, paper: PAPER.white, aspect: 0.8 },
  { name: 'ring-oval', frame: 'oval', motif: 'ring', text: [], ink: INK.blue, paper: PAPER.white, mx: 0.06, my: -0.05 },
  { name: 'bird-arch', frame: 'arch', motif: 'bird', text: ['bottom'], ink: INK.brown, paper: PAPER.cream, my: 0.08 },
  { name: 'cross-rect', frame: 'rect', motif: 'cross', text: ['top', 'bottom'], ink: INK.vermilion, paper: PAPER.cream },
  { name: 'band-double', frame: 'double', motif: 'band', text: ['left'], ink: INK.violet, paper: PAPER.white, mx: -0.1 }
].map(d => ({ ...d, ink2: tint(d.ink) }));

// Designs that look alike after some quarter turn, so the reported turn may
// be another of the equivalent ones.
const SYMMETRIC = new Set(['ring-double', 'leaf-none', 'cross-rect', 'star-double']);

function perturbations(bg) {
  const R = (s, o) => renderCrop(s, { ...o, bg });
  const scale = k => (r, g, b) => [r * k, g * k, b * k];
  return {
    'shift +3% x, +2% y': s => R(s, { shiftX: 0.03, shiftY: 0.02, noise: 3, seed: 2 }),
    'shift -4% x, -3% y': s => R(s, { shiftX: -0.04, shiftY: -0.03, noise: 3, seed: 3 }),
    'shift +2% x, -4% y': s => R(s, { shiftX: 0.02, shiftY: -0.04, noise: 3, seed: 23 }),
    'zoom in 4%': s => R(s, { zoom: 1.04, noise: 3, seed: 4 }),
    'zoom out 4%': s => R(s, { zoom: 0.96, noise: 3, seed: 5 }),
    'darker x0.65': s => mapPixels(R(s, { noise: 3, seed: 6 }), scale(0.65)),
    'brighter x1.25': s => mapPixels(R(s, { noise: 3, seed: 7 }), scale(1.25)),
    'contrast x0.8': s => mapPixels(R(s, { noise: 3, seed: 8 }), (r, g, b) => [128 + (r - 128) * 0.8, 128 + (g - 128) * 0.8, 128 + (b - 128) * 0.8]),
    'warm light': s => mapPixels(R(s, { noise: 3, seed: 9 }), (r, g, b) => [r * 1.12, g, b * 0.86]),
    'cool light': s => mapPixels(R(s, { noise: 3, seed: 19 }), (r, g, b) => [r * 0.9, g, b * 1.1]),
    'blur radius 1': s => blurImage(R(s, { noise: 3, seed: 10 }), 1),
    'blur radius 2': s => blurImage(R(s, { noise: 3, seed: 11 }), 2),
    'jpeg damage': s => jpegish(R(s, { noise: 6, seed: 12 }), 13, 10),
    'turn 90': s => turnImage(R(s, { noise: 3, seed: 14 }), 1),
    'turn 180': s => turnImage(R(s, { noise: 3, seed: 15 }), 2),
    'turn 270': s => turnImage(R(s, { noise: 3, seed: 16 }), 3),
    'all at once': s => turnImage(blurImage(jpegish(mapPixels(R(s, { shiftX: 0.025, shiftY: -0.02, zoom: 1.02, noise: 5, seed: 17 }),
      (r, g, b) => [r * 0.9, g * 0.85, b * 0.78]), 18, 8), 1), 1)
  };
}

/** Compare every design with every perturbation of itself. */
function sameDesignRuns(bg) {
  const rows = {};
  for (const spec of DESIGNS) {
    const base = sigOf(renderCrop(spec, { noise: 3, seed: 1, bg }));
    for (const [name, make] of Object.entries(perturbations(bg))) {
      const r = compareSignatures(sigOf(make(spec)), base);
      const row = rows[name] = rows[name] || { p: 0, c: 0, same: 0, similar: 0, different: 0, rotOk: true };
      row.p = Math.max(row.p, r.pDist);
      row.c = Math.max(row.c, r.colourDist);
      row[r.level]++;
      if (name.startsWith('turn ') && !SYMMETRIC.has(spec.name)) {
        const want = (360 - Number(name.slice(5))) % 360;
        if (r.rot !== want) row.rotOk = false;
      }
    }
  }
  return rows;
}

function printTable(title, rows) {
  const lines = [title, 'change               max p   max colour  same/similar/different'];
  for (const [name, r] of Object.entries(rows)) {
    lines.push(`${name.padEnd(20)} ${r.p.toFixed(3).padStart(6)} ${r.c.toFixed(1).padStart(10)}   ${r.same}/${r.similar}/${r.different}`);
  }
  console.log(lines.join('\n'));
}

/* ---------------------------------------------------------------------- */
/* Tests                                                                   */
/* ---------------------------------------------------------------------- */

test('fast enough for a phone', () => {
  const img = shrink(renderCrop(DESIGNS[0], { noise: 3, seed: 1 }), 64);
  for (let i = 0; i < 50; i++) signatureFromRGBA(img.data, 64, 64);
  let t = performance.now();
  for (let i = 0; i < 300; i++) signatureFromRGBA(img.data, 64, 64);
  const perSig = (performance.now() - t) / 300;

  const query = sigOf(renderCrop(DESIGNS[0], { noise: 3, seed: 1 }));
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const collection = seed => {
    const rand = rng(seed);
    const hex = () => Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(rand() * 16)]).join('');
    const code = () => Array.from({ length: 16 }, () => B64[Math.floor(rand() * 64)]).join('');
    return Array.from({ length: 10000 }, (_, i) => ({ id: 's' + i, sig: `1.${hex()}.${hex()}.${code()}` }));
  };
  findMatches(query, collection(99).slice(0, 2000));
  const runs = [];
  for (let k = 0; k < 5; k++) {
    const entries = collection(100 + k); // new strings each time: nothing cached
    t = performance.now();
    findMatches(query, entries);
    runs.push(performance.now() - t);
  }
  runs.sort((a, b) => a - b);
  const entries = collection(200);
  findMatches(query, entries);
  t = performance.now();
  findMatches(query, entries);
  const warm = performance.now() - t;
  console.log(`signature of a 64 x 64 crop: ${perSig.toFixed(3)} ms; one photo against 10,000 saved stamps: ${runs[0].toFixed(1)} ms best and ${runs[2].toFixed(1)} ms median of 5 first checks, ${warm.toFixed(1)} ms when the same list is checked again`);
  assert.ok(perSig < 2, 'signature ' + perSig.toFixed(3) + ' ms');
  // Best of five, so a garbage-collection pause on a busy test machine does not fail the run.
  assert.ok(runs[0] < 30, '10,000 entries ' + runs[0].toFixed(1) + ' ms');
});

test('a signature is compact and survives encoding', () => {
  const sig = sigOf(renderCrop(DESIGNS[0], { noise: 3, seed: 1 }));
  assert.equal(sig.v, 1);
  assert.match(sig.p, /^[0-9a-f]{16}$/);
  assert.match(sig.m, /^[0-9a-f]{16}$/);
  assert.equal(sig.c.length, 16);
  assert.ok(JSON.stringify(sig).length <= 80, 'JSON length ' + JSON.stringify(sig).length);
  const enc = encodeSignature(sig);
  assert.equal(enc.length, 52);
  assert.deepEqual(decodeSignature(enc), sig);
  const r = compareSignatures(enc, sig);
  assert.equal(r.level, 'same');
  assert.equal(r.pDist, 0);
  assert.equal(r.colourDist, 0);
});

test('hamming counts differing bits', () => {
  assert.equal(hamming('0000000000000000', '0000000000000000'), 0);
  assert.equal(hamming('ffffffffffffffff', '0000000000000000'), 64);
  assert.equal(hamming('8000000000000001', '0000000000000000'), 2);
  assert.ok(Number.isNaN(hamming('00', '000')));
});

test('a quarter turn of the photo is a quarter turn of the hash', () => {
  // Full-size pixels, no resampling, so this checks the bit tables alone.
  const raw = img => signatureFromRGBA(img.data, img.width, img.height);
  for (const spec of DESIGNS.filter(s => !SYMMETRIC.has(s.name))) {
    const img = renderCrop(spec, { seed: 1 });
    const base = raw(img);
    for (const q of [1, 2, 3]) {
      const r = compareSignatures(raw(turnImage(img, q)), base);
      assert.ok(r.pDist <= 0.07, `${spec.name} turned ${q * 90}: p ${r.pDist}`);
      assert.ok(r.colourDist <= 3, `${spec.name} turned ${q * 90}: colour ${r.colourDist}`);
      assert.equal(r.rot, (360 - q * 90) % 360, `${spec.name} turned ${q * 90}: rot ${r.rot}`);
    }
  }
});

test('the same stamp photographed again is "same" (dark card)', () => {
  const rows = sameDesignRuns(undefined);
  printTable(`Same design, dark card. Thresholds: p <= ${MATCH.pSame} and colour <= ${MATCH.cSame} for same, p <= ${MATCH.pSimilar} for similar.`, rows);
  for (const [name, r] of Object.entries(rows)) {
    assert.equal(r.same, DESIGNS.length, `${name}: ${r.similar} similar, ${r.different} different`);
    assert.ok(r.rotOk, `${name}: wrong turn reported`);
  }
});

test('on light card, where the paper edge is hard to find, most still match', () => {
  const rows = sameDesignRuns([238, 238, 234]);
  printTable('Same design, light card:', rows);
  const total = Object.values(rows).reduce((a, r) => ({ same: a.same + r.same, similar: a.similar + r.similar, different: a.different + r.different }), { same: 0, similar: 0, different: 0 });
  const n = total.same + total.similar + total.different;
  console.log(`light card totals: ${total.same} same, ${total.similar} similar, ${total.different} different of ${n}`);
  assert.ok(total.same >= n * 0.93, 'same ' + total.same + ' of ' + n);
  assert.ok(total.different <= n * 0.03, 'different ' + total.different + ' of ' + n);
});

test('different designs are never "same"', () => {
  const sigs = DESIGNS.map(s => sigOf(renderCrop(s, { noise: 3, seed: 1 })));
  const pairs = [];
  for (let i = 0; i < sigs.length; i++) for (let j = 0; j < sigs.length; j++) {
    if (i !== j) pairs.push({ a: DESIGNS[i].name, b: DESIGNS[j].name, ...compareSignatures(sigs[i], sigs[j]) });
  }
  pairs.sort((x, y) => x.pDist - y.pDist);
  console.log('Closest different designs:\n' + pairs.filter((_, k) => k % 2 === 0).slice(0, 5).map(r => `${r.a} / ${r.b}: p ${r.pDist}, colour ${r.colourDist}, ${r.level}`).join('\n'));
  const similar = pairs.filter(r => r.level === 'similar').length;
  console.log(`different designs: ${pairs.filter(r => r.level === 'same').length} same, ${similar} similar, ${pairs.length - similar} different of ${pairs.length}`);
  assert.equal(pairs.filter(r => r.level === 'same').length, 0);
  // The only "similar" pairs share a motif and layout and differ in the frame.
  assert.ok(similar <= pairs.length * 0.02, similar + ' similar pairs');
  for (const r of pairs.filter(p => p.level === 'similar')) assert.equal(r.a.split('-')[0], r.b.split('-')[0], `${r.a} / ${r.b}`);
});

test('the same design in another colour is "similar", not "same"', () => {
  const far = ['vermilion', 'blue', 'green', 'brown', 'black', 'violet', 'orange'];
  const counts = { same: 0, similar: 0, different: 0 };
  let lowest = { colourDist: 1e9 };
  for (const spec of DESIGNS) {
    const base = sigOf(renderCrop(spec, { noise: 3, seed: 1 }));
    for (const name of far) {
      const ink = INK[name];
      if (Math.hypot(ink[0] - spec.ink[0], ink[1] - spec.ink[1], ink[2] - spec.ink[2]) < 60) continue;
      const r = compareSignatures(sigOf(renderCrop(recolour(spec, ink), { noise: 3, seed: 21 })), base);
      counts[r.level]++;
      if (r.colourDist < lowest.colourDist) lowest = { ...r, what: `${spec.name} in ${name}` };
    }
  }
  const n = counts.same + counts.similar + counts.different;
  console.log(`recoloured: ${counts.same} same, ${counts.similar} similar, ${counts.different} different of ${n}; closest colours: ${lowest.what}, colour ${lowest.colourDist}`);
  assert.equal(counts.different, 0);
  assert.ok(counts.similar >= n * 0.95, counts.similar + ' of ' + n);
  const close = [['blue', 'ultramarine'], ['carmine', 'vermilion'], ['brown', 'sepia'], ['green', 'olive'], ['black', 'slate']].map(([a, b]) => {
    const spec = recolour(DESIGNS[0], INK[a]);
    const r = compareSignatures(sigOf(renderCrop(recolour(spec, INK[b]), { noise: 3, seed: 21 })), sigOf(renderCrop(spec, { noise: 3, seed: 1 })));
    assert.notEqual(r.level, 'different', `${a} / ${b}`);
    return `${a}/${b} colour ${r.colourDist} ${r.level}`;
  });
  console.log('close shades (either level is fine): ' + close.join(', '));
});

test('another value of one design in the same colour also matches (a known limit)', () => {
  for (const spec of DESIGNS.slice(0, 6)) {
    const r = compareSignatures(sigOf(renderCrop({ ...spec, value: 7 }, { noise: 3, seed: 22 })), sigOf(renderCrop({ ...spec, value: 3 }, { noise: 3, seed: 1 })));
    assert.notEqual(r.level, 'different', spec.name);
  }
});

test('findMatches ranks matches, applies the cutoff, and skips bad entries', () => {
  const owned = DESIGNS.slice(0, 15);
  const entries = owned.map(s => ({ id: s.name, sig: encodeSignature(sigOf(renderCrop(s, { noise: 3, seed: 1 }))) }));
  entries.push({ id: 'broken', sig: 'not a signature' }, { id: 'empty', sig: null }, null);
  const make = perturbations(undefined)['all at once'];
  for (const s of owned) {
    const hits = findMatches(sigOf(make(s)), entries);
    assert.ok(hits.length >= 1 && hits.length <= 5, s.name);
    assert.equal(hits[0].id, s.name);
    assert.equal(hits[0].level, 'same');
  }
  // Stamps the owner does not have get no "same" match, however close the nearest is.
  for (const s of DESIGNS.slice(15)) {
    const hits = findMatches(sigOf(renderCrop(s, { noise: 3, seed: 5 })), entries);
    assert.equal(hits.filter(h => h.level === 'same').length, 0, s.name + ': ' + JSON.stringify(hits));
  }
  const self = entries[0];
  assert.equal(findMatches(self.sig, entries, { exclude: self.id }).some(h => h.id === self.id), false);
  assert.equal(findMatches(self.sig, entries, { limit: 1 }).length, 1);
  assert.deepEqual(findMatches('junk', entries), []);
  assert.equal(compareSignatures('junk', self.sig).level, 'different');
  assert.equal(decodeSignature({ v: 2, p: 'x' }), null);
});
