// Page mode: find every stamp in one photo of an album page, a stockbook
// page, or a table with loose stamps. Then crop each one and lay the crops
// out on a numbered contact sheet that can go to Claude in one call.
//
// detectStamps and sheetLayout are pure and run in Node tests. The other
// exports draw on canvases and need a browser.
//
// Coordinates: detectStamps works in pixels of the image it is given.
// findStampsInPhoto scales its quads back to pixels of the source photo.
// A quad is four points ordered top-left, top-right, bottom-right, bottom-left.

import * as V from './vision.js';
import { dims, drawScaled, straighten, canvasOf } from './still.js';

/* ---------------------------------------------------------------------- */
/* Fast binary helpers for whole-page masks                                */
/* ---------------------------------------------------------------------- */

// vision.js has the same operations, tuned for one stamp in a small region.
// A page is many times larger, so these use separable sliding windows over
// typed arrays.

/** Erode or dilate along rows: a pixel looks r pixels left and right. */
function morphH(src, w, h, r, erode) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let cnt = 0;
    for (let x = 0; x < Math.min(w, r); x++) cnt += src[row + x];
    for (let x = 0; x < w; x++) {
      if (x + r < w) cnt += src[row + x + r];
      if (x - r - 1 >= 0) cnt -= src[row + x - r - 1];
      out[row + x] = erode ? (cnt === Math.min(w - 1, x + r) - Math.max(0, x - r) + 1 ? 1 : 0) : (cnt > 0 ? 1 : 0);
    }
  }
  return out;
}

/** Erode or dilate along columns, row by row with running column counts. */
function morphV(src, w, h, r, erode) {
  const out = new Uint8Array(w * h);
  const col = new Int32Array(w);
  for (let y = 0; y < Math.min(h, r); y++) for (let x = 0, k = y * w; x < w; x++, k++) col[x] += src[k];
  for (let y = 0; y < h; y++) {
    const add = y + r, rem = y - r - 1;
    if (add < h) for (let x = 0, k = add * w; x < w; x++, k++) col[x] += src[k];
    if (rem >= 0) for (let x = 0, k = rem * w; x < w; x++, k++) col[x] -= src[k];
    const span = Math.min(h - 1, y + r) - Math.max(0, y - r) + 1;
    if (erode) for (let x = 0, k = y * w; x < w; x++, k++) out[k] = col[x] === span ? 1 : 0;
    else for (let x = 0, k = y * w; x < w; x++, k++) out[k] = col[x] > 0 ? 1 : 0;
  }
  return out;
}

// Square windows are separable: a row pass, then a column pass.
const dilateSq = (m, w, h, r) => (r <= 0 ? m.slice() : morphV(morphH(m, w, h, r, false), w, h, r, false));
const erodeSq = (m, w, h, r) => (r <= 0 ? m.slice() : morphV(morphH(m, w, h, r, true), w, h, r, true));
const openSq = (m, w, h, r) => dilateSq(erodeSq(m, w, h, r), w, h, r);
const closeSq = (m, w, h, r) => erodeSq(dilateSq(m, w, h, r), w, h, r);

/** Opening along one direction: removes structures thinner than 2r + 1 along it. */
function open1(m, w, h, r, dir) {
  const f = dir === 'h' ? morphH : morphV;
  return f(f(m, w, h, r, true), w, h, r, false);
}

/**
 * Remove long thin lines that run across the page: stockbook strip edges,
 * ruled grids, page edges. A run counts as a line when it is at least a
 * third of the page long in one direction and thinner than 2 * rBand + 1
 * across. Stamps stay whole, even dark stamps on a dark page, which show
 * only a thin frame of paper margin.
 */
function dropLongLines(fg, w, h, rBand) {
  const out = fg.slice();
  for (const [dir, across, len] of [['h', 'v', w], ['v', 'h', h]]) {
    // Part of a run at least a third of the page long...
    const long = open1(fg, w, h, Math.max(8, Math.round(len / 6)), dir);
    // ...and thin across it. A pixel inside a stamp is thick across, even
    // where a line crosses the stamp, so stamps are never cut.
    const thick = open1(fg, w, h, rBand, across);
    for (let q = 0; q < out.length; q++) if (long[q] && !thick[q]) out[q] = 0;
  }
  return out;
}

/** Fill enclosed holes with a flood from the border. */
function fillHolesFast(mask, w, h) {
  const out = mask.slice();
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = k => { if (!out[k] && !seen[k]) { seen[k] = 1; stack[sp++] = k; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp) {
    const k = stack[--sp];
    const y = (k / w) | 0, x = k - y * w;
    if (x > 0) push(k - 1);
    if (x < w - 1) push(k + 1);
    if (y > 0) push(k - w);
    if (y < h - 1) push(k + w);
  }
  for (let k = 0; k < out.length; k++) if (!out[k] && !seen[k]) out[k] = 1;
  return out;
}

/** Label 4-connected components. Returns the label map and per-component stats. */
function labelComponents(mask, w, h) {
  const lab = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  const comps = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const id = comps.length;
    let sp = 0;
    stack[sp++] = s;
    lab[s] = id;
    let area = 0, sx = 0, sy = 0, minX = w, minY = h, maxX = 0, maxY = 0;
    while (sp) {
      const k = stack[--sp];
      const y = (k / w) | 0, x = k - y * w;
      area++; sx += x; sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[k - 1] && lab[k - 1] < 0) { lab[k - 1] = id; stack[sp++] = k - 1; }
      if (x < w - 1 && mask[k + 1] && lab[k + 1] < 0) { lab[k + 1] = id; stack[sp++] = k + 1; }
      if (y > 0 && mask[k - w] && lab[k - w] < 0) { lab[k - w] = id; stack[sp++] = k - w; }
      if (y < h - 1 && mask[k + w] && lab[k + w] < 0) { lab[k + w] = id; stack[sp++] = k + w; }
    }
    comps.push({ id, area, cx: sx / area, cy: sy / area, minX, minY, maxX, maxY });
  }
  return { lab, comps };
}

/** Boundary pixels of the wanted components, in one pass over the label map. */
function boundariesOf(lab, w, h, wanted) {
  const pts = new Map();
  for (const id of wanted) pts.set(id, []);
  for (let y = 0; y < h; y++) {
    for (let x = 0, k = y * w; x < w; x++, k++) {
      const id = lab[k];
      if (id < 0) continue;
      const list = pts.get(id);
      if (!list) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        lab[k - 1] !== id || lab[k + 1] !== id || lab[k - w] !== id || lab[k + w] !== id) list.push({ x, y });
    }
  }
  return pts;
}

/** Box-average an RGBA image down by a whole factor k. */
function downsample(img, k) {
  const { width: W, data: d } = img;
  const w = Math.floor(W / k), h = Math.floor(img.height / k);
  const out = new Uint8ClampedArray(w * h * 4);
  const acc = new Float32Array(w * 3);
  const kk = k * k;
  for (let y = 0; y < h; y++) {
    acc.fill(0);
    for (let dy = 0; dy < k; dy++) {
      let i = (y * k + dy) * W * 4;
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let dx = 0; dx < k; dx++, i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        acc[x * 3] += r; acc[x * 3 + 1] += g; acc[x * 3 + 2] += b;
      }
    }
    for (let x = 0, o = y * w * 4; x < w; x++, o += 4) {
      out[o] = acc[x * 3] / kk; out[o + 1] = acc[x * 3 + 1] / kk; out[o + 2] = acc[x * 3 + 2] / kk; out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

/* ---------------------------------------------------------------------- */
/* Page background                                                         */
/* ---------------------------------------------------------------------- */

/** Most common colour, from a smoothed 16-level histogram. Border pixels count double. */
function pageColour(img, step) {
  const { width: w, height: h, data: d } = img;
  const hist = new Float32Array(4096);
  const bx = w * 0.08, by = h * 0.08;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const wt = x < bx || y < by || x > w - bx || y > h - by ? 2 : 1;
      hist[((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)] += wt;
    }
  }
  let best = -1, at = 0;
  for (let r = 0; r < 16; r++) {
    for (let g = 0; g < 16; g++) {
      for (let b = 0; b < 16; b++) {
        const c = hist[(r << 8) | (g << 4) | b];
        if (!c) continue;
        let s = c * 2;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dg = -1; dg <= 1; dg++) {
            for (let db = -1; db <= 1; db++) {
              const R = r + dr, G = g + dg, B = b + db;
              if (R < 0 || G < 0 || B < 0 || R > 15 || G > 15 || B > 15) continue;
              s += hist[(R << 8) | (G << 4) | B];
            }
          }
        }
        if (s > best) { best = s; at = (r << 8) | (g << 4) | b; }
      }
    }
  }
  let cr = ((at >> 8) << 4) + 8, cg = (((at >> 4) & 15) << 4) + 8, cb = ((at & 15) << 4) + 8;
  // Refine to the mean of nearby samples, twice.
  for (let pass = 0; pass < 2; pass++) {
    let n = 0, sr = 0, sg = 0, sb = 0;
    const lim = pass ? 22 : 30;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const dr = d[i] - cr, dg = d[i + 1] - cg, db = d[i + 2] - cb;
        if (dr * dr + dg * dg + db * db < lim * lim) { n++; sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; }
      }
    }
    if (n) { cr = sr / n; cg = sg / n; cb = sb / n; }
  }
  return [cr, cg, cb];
}

/**
 * A smooth background colour field on a coarse grid of blocks. Each block
 * takes the mean of its pixels near the reference colour; blocks covered by
 * stamps borrow from their neighbours. The second pass compares each pixel
 * with its own block from the first pass, so it follows uneven light.
 */
function backgroundField(img, ref, bs, opts = {}) {
  const { width: w, height: h, data: d } = img;
  const gw = Math.ceil(w / bs), gh = Math.ceil(h / bs);
  const exclude = opts.exclude || null;
  let field = opts.start || null;
  const passes = opts.passes || 2;
  for (let pass = 0; pass < passes; pass++) {
    const lim = field ? 30 : 46, lim2 = lim * lim;
    const sum = new Float64Array(gw * gh * 3), cnt = new Int32Array(gw * gh), tot = new Int32Array(gw * gh);
    for (let y = 0; y < h; y += 2) {
      const gy = (y / bs) | 0;
      for (let x = 0; x < w; x += 2) {
        const g = gy * gw + ((x / bs) | 0);
        if (exclude && exclude[y * w + x]) { tot[g]++; continue; }
        const i = (y * w + x) * 4;
        const rr = field ? field[g * 3] : ref[0], rg = field ? field[g * 3 + 1] : ref[1], rb = field ? field[g * 3 + 2] : ref[2];
        const dr = d[i] - rr, dg = d[i + 1] - rg, db = d[i + 2] - rb;
        tot[g]++;
        if (dr * dr + dg * dg + db * db < lim2) { cnt[g]++; sum[g * 3] += d[i]; sum[g * 3 + 1] += d[i + 1]; sum[g * 3 + 2] += d[i + 2]; }
      }
    }
    const F = new Float32Array(gw * gh * 3);
    const ok = new Uint8Array(gw * gh);
    let missing = 0;
    for (let g = 0; g < gw * gh; g++) {
      if (cnt[g] >= Math.max(4, tot[g] * 0.15)) {
        ok[g] = 1;
        F[g * 3] = sum[g * 3] / cnt[g]; F[g * 3 + 1] = sum[g * 3 + 1] / cnt[g]; F[g * 3 + 2] = sum[g * 3 + 2] / cnt[g];
      } else missing++;
    }
    if (missing === gw * gh) {
      for (let g = 0; g < gw * gh; g++) { F[g * 3] = ref[0]; F[g * 3 + 1] = ref[1]; F[g * 3 + 2] = ref[2]; ok[g] = 1; }
      missing = 0;
    }
    // Blocks with no background borrow from filled neighbours.
    for (let guard = 0; missing && guard < gw + gh; guard++) {
      const next = ok.slice();
      for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
          const g = gy * gw + gx;
          if (ok[g]) continue;
          let n = 0, r = 0, gg = 0, b = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const X = gx + dx, Y = gy + dy;
              if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue;
              const q = Y * gw + X;
              if (!ok[q]) continue;
              n++; r += F[q * 3]; gg += F[q * 3 + 1]; b += F[q * 3 + 2];
            }
          }
          if (n) { F[g * 3] = r / n; F[g * 3 + 1] = gg / n; F[g * 3 + 2] = b / n; next[g] = 1; missing--; }
        }
      }
      ok.set(next);
    }
    // Light smoothing so block seams do not show in the distance map.
    const S = new Float32Array(F.length);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let n = 0, a0 = 0, a1 = 0, a2 = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const X = gx + dx, Y = gy + dy;
            if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue;
            const q = (Y * gw + X) * 3, wt = dx || dy ? 1 : 2;
            a0 += F[q] * wt; a1 += F[q + 1] * wt; a2 += F[q + 2] * wt; n += wt;
          }
        }
        const g = (gy * gw + gx) * 3;
        S[g] = a0 / n; S[g + 1] = a1 / n; S[g + 2] = a2 / n;
      }
    }
    field = S;
  }
  return { field, gw, gh, bs };
}

/** Background colour at a point (work-image pixels), written into out. */
function fieldAt(bgf, x, y, out) {
  const { field: F, gw, gh, bs } = bgf;
  const fx = V.clamp(x / bs - 0.5, 0, gw - 1), fy = V.clamp(y / bs - 0.5, 0, gh - 1);
  const x0 = fx | 0, y0 = fy | 0, x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const a = (y0 * gw + x0) * 3, b = (y0 * gw + x1) * 3, c = (y1 * gw + x0) * 3, e = (y1 * gw + x1) * 3;
  for (let ch = 0; ch < 3; ch++) {
    const top = F[a + ch] + (F[b + ch] - F[a + ch]) * tx;
    const bot = F[c + ch] + (F[e + ch] - F[c + ch]) * tx;
    out[ch] = top + (bot - top) * ty;
  }
  return out;
}

/** Colour distance from the background field for every pixel. */
function distanceMap(img, bgf) {
  const { width: w, height: h, data: d } = img;
  const { field: F, gw, gh, bs } = bgf;
  const D = new Float32Array(w * h);
  const x0s = new Int32Array(w), x1s = new Int32Array(w), txs = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const fx = V.clamp(x / bs - 0.5, 0, gw - 1);
    x0s[x] = fx | 0; x1s[x] = Math.min(gw - 1, x0s[x] + 1); txs[x] = fx - x0s[x];
  }
  for (let y = 0; y < h; y++) {
    const fy = V.clamp(y / bs - 0.5, 0, gh - 1);
    const y0 = fy | 0, y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const a = (y0 * gw + x0s[x]) * 3, b = (y0 * gw + x1s[x]) * 3, c = (y1 * gw + x0s[x]) * 3, e = (y1 * gw + x1s[x]) * 3;
      const tx = txs[x];
      const i = (y * w + x) * 4;
      let s = 0;
      for (let ch = 0; ch < 3; ch++) {
        const top = F[a + ch] + (F[b + ch] - F[a + ch]) * tx;
        const bot = F[c + ch] + (F[e + ch] - F[c + ch]) * tx;
        const v = d[i + ch] - (top + (bot - top) * ty);
        s += v * v;
      }
      D[y * w + x] = Math.sqrt(s);
    }
  }
  return D;
}

/** Local texture: absolute luma differences, box-blurred with radius r. */
function textureMap(img, r) {
  const { width: w, height: h } = img;
  const L = V.luminance(img);
  const G = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1, k = y * w + 1; x < w - 1; x++, k++) {
      G[k] = Math.abs(L[k + 1] - L[k - 1]) + Math.abs(L[k + w] - L[k - w]);
    }
  }
  const T = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = 0; x < Math.min(w, r); x++) acc += G[row + x];
    for (let x = 0; x < w; x++) {
      if (x + r < w) acc += G[row + x + r];
      if (x - r - 1 >= 0) acc -= G[row + x - r - 1];
      T[row + x] = acc / (Math.min(w - 1, x + r) - Math.max(0, x - r) + 1);
    }
  }
  const col = new Float32Array(w);
  for (let y = 0; y < Math.min(h, r); y++) for (let x = 0; x < w; x++) col[x] += T[y * w + x];
  for (let y = 0; y < h; y++) {
    const add = y + r, rem = y - r - 1;
    if (add < h) for (let x = 0, k = add * w; x < w; x++, k++) col[x] += T[k];
    if (rem >= 0) for (let x = 0, k = rem * w; x < w; x++, k++) col[x] -= T[k];
    const span = Math.min(h - 1, y + r) - Math.max(0, y - r) + 1;
    for (let x = 0, k = y * w; x < w; x++, k++) out[k] = col[x] / span;
  }
  return out;
}

/**
 * Percentile p of arr[k] over every step-th k where gate[k] < limit, from a
 * histogram (0.5 wide bins up to 512) instead of a sort.
 */
function gatedPercentile(arr, gate, limit, p, step) {
  const bins = new Int32Array(1024);
  let n = 0;
  for (let k = 0; k < arr.length; k += step) {
    if (gate[k] >= limit) continue;
    const v = arr[k];
    bins[v >= 511.5 ? 1023 : (v * 2) | 0]++;
    n++;
  }
  if (!n) return 0;
  const want = Math.round((n - 1) * p);
  let acc = 0;
  for (let b = 0; b < 1024; b++) {
    acc += bins[b];
    if (acc > want) return (b + 0.5) / 2;
  }
  return 511.75;
}

/* ---------------------------------------------------------------------- */
/* Shapes                                                                  */
/* ---------------------------------------------------------------------- */

const toImage = (r, u, v) => ({ x: u * r.c - v * r.s, y: u * r.s + v * r.c });

/** Fit a quad to a boundary: min-area rectangle, refined to the true edges when consistent. */
function fitQuad(boundary) {
  const hull = V.convexHull(boundary);
  const rect = V.minAreaRect(hull);
  if (!rect) return null;
  const rectQuad = V.orderQuad([
    toImage(rect, rect.minU, rect.minV), toImage(rect, rect.maxU, rect.minV),
    toImage(rect, rect.maxU, rect.maxV), toImage(rect, rect.minU, rect.maxV)
  ]);
  let quad = rectQuad;
  const rq = V.refineQuad(rect, boundary);
  if (rq) {
    const oq = V.orderQuad(rq);
    const aR = V.polygonArea(rectQuad), aQ = V.polygonArea(oq);
    const diag = Math.hypot(rect.maxU - rect.minU, rect.maxV - rect.minV);
    const near = oq.every((p, i) => Math.hypot(p.x - rectQuad[i].x, p.y - rectQuad[i].y) < diag * 0.08);
    if (aQ > aR * 0.85 && aQ < aR * 1.06 && near) quad = oq;
  }
  const sw = rect.maxU - rect.minU, sh = rect.maxV - rect.minV;
  return { quad, rectArea: Math.max(1, sw * sh), long: Math.max(sw, sh), short: Math.min(sw, sh) };
}

/** Set every mask pixel inside a convex quad. */
function fillQuad(mask, w, h, q) {
  const b = V.quadBounds(q);
  const x0 = Math.max(0, Math.floor(b.x)), y0 = Math.max(0, Math.floor(b.y));
  const x1 = Math.min(w - 1, Math.ceil(b.x + b.w)), y1 = Math.min(h - 1, Math.ceil(b.y + b.h));
  const sgn = (q[1].x - q[0].x) * (q[2].y - q[0].y) - (q[1].y - q[0].y) * (q[2].x - q[0].x) >= 0 ? 1 : -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let inside = true;
      for (let i = 0; i < 4 && inside; i++) {
        const a = q[i], c = q[(i + 1) % 4];
        if (sgn * ((c.x - a.x) * (y - a.y) - (c.y - a.y) * (x - a.x)) < 0) inside = false;
      }
      if (inside) mask[y * w + x] = 1;
    }
  }
}

/** Move each side of a quad outward along its own normal by m = [top, right, bottom, left]. */
function offsetQuad(q, m) {
  const c = V.quadCentroid(q);
  const lines = [];
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    let nx = dy / len, ny = -dx / len;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if ((mx - c.x) * nx + (my - c.y) * ny < 0) { nx = -nx; ny = -ny; }
    lines.push({ p: { x: a.x + nx * m[i], y: a.y + ny * m[i] }, d: { x: dx, y: dy } });
  }
  const meet = (l1, l2) => {
    const den = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
    if (Math.abs(den) < 1e-9) return { x: l2.p.x, y: l2.p.y };
    const t = ((l2.p.x - l1.p.x) * l2.d.y - (l2.p.y - l1.p.y) * l2.d.x) / den;
    return { x: l1.p.x + l1.d.x * t, y: l1.p.y + l1.d.y * t };
  };
  // Corner i sits where side i-1 (ending there) meets side i (starting there).
  return [0, 1, 2, 3].map(i => meet(lines[(i + 3) % 4], lines[i]));
}

/**
 * On light pages a white stamp margin can match the page, so the page-wide
 * pass may find only the printed design. Walk outward from each side and
 * record what lies there: evidence that touches the found edge (visible
 * paper or an attached shadow), and thin detached lines further out (the
 * shadow a hinged stamp casts past an invisible margin, or a ruled line on
 * the page). A thick detached run is the next stamp, so the walk stops there.
 */
function scanSides(full, quad, ctx) {
  const { width: W, height: H, data: d } = full;
  const sides = [[quad[0], quad[1]], [quad[1], quad[2]], [quad[3], quad[2]], [quad[0], quad[3]]];
  const c = V.quadCentroid(quad);
  const lenU = (Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y) + Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y)) / 2;
  const lenV = (Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y) + Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y)) / 2;
  const maxOut = Math.max(4, Math.round(0.26 * Math.max(lenU, lenV)));
  const bg = [0, 0, 0];
  const k = ctx.k, off = (k - 1) / 2;
  // Mean colour of three pixels along the side, as distance from the page.
  const evidence = (x, y, tx, ty) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let s = -1; s <= 1; s++) {
      const X = Math.round(x + tx * s), Y = Math.round(y + ty * s);
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const i = (Y * W + X) * 4;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    if (!n) return 0;
    fieldAt(ctx.bgf, (x - off) / k, (y - off) / k, bg);
    return Math.hypot(r / n - bg[0], g / n - bg[1], b / n - bg[2]);
  };
  const inside = [], beyond = [];
  for (let j = 0; j < 20; j++) inside.push(0.12 + 0.76 * j / 19);
  // Well past the corners, so the stamp's own paper (up to about a fifth of
  // the side past a design-only find) is not mistaken for a page line.
  for (let j = 0; j < 8; j++) { beyond.push(-0.56 + 0.04 * j); beyond.push(1.28 + 0.04 * j); }
  const out = sides.map(([a, b], si) => {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const tx = dx / len, ty = dy / len;
    let nx = ty, ny = -tx;
    if (((a.x + b.x) / 2 - c.x) * nx + ((a.y + b.y) / 2 - c.y) * ny < 0) { nx = -nx; ny = -ny; }
    const fin = new Float32Array(maxOut + 2), fout = new Float32Array(maxOut + 2);
    for (let dist = 1; dist <= maxOut; dist++) {
      let hit = 0, past = 0;
      for (const t of inside) if (evidence(a.x + dx * t + nx * dist, a.y + dy * t + ny * dist, tx, ty) > ctx.tLow) hit++;
      // A line that runs on past the stamp's corners belongs to the page
      // (a ruled grid, a strip edge), not to this stamp. Look for it with a
      // lower threshold, since a faint line is still a line.
      for (const t of beyond) if (evidence(a.x + dx * t + nx * dist, a.y + dy * t + ny * dist, tx, ty) > ctx.tLow * 0.75) past++;
      fin[dist] = hit / inside.length;
      fout[dist] = past / beyond.length;
    }
    // A slight turn between the stamp and the page's lines moves the line a
    // few pixels between the corners and the middle, so compare nearby rows.
    const win = Math.max(2, Math.ceil(0.06 * len));
    // A line is thin across the walk. Evidence past the corners that spans
    // many rows is another stamp, not a line, so it does not count.
    const lineMax = 2 * win + 5;
    for (let dist = 1; dist <= maxOut;) {
      if (fout[dist] < 0.3) { dist++; continue; }
      let e = dist;
      while (e + 1 <= maxOut && fout[e + 1] >= 0.3) e++;
      if (e - dist + 1 > lineMax) for (let q = dist; q <= e; q++) fout[q] = 0;
      dist = e + 1;
    }
    const f = new Float32Array(maxOut + 2);
    for (let dist = 1; dist <= maxOut; dist++) {
      let fo = 0;
      for (let q = Math.max(1, dist - win); q <= Math.min(maxOut, dist + win); q++) if (fout[q] > fo) fo = fout[q];
      f[dist] = fo >= 0.3 && fo >= fin[dist] * 0.5 ? 0 : fin[dist];
    }
    const thinMax = Math.max(6, Math.round(0.07 * (si % 2 ? lenU : lenV)));
    let cont = null, dist = 1;
    const runs = [];
    while (dist <= maxOut) {
      if (f[dist] >= 0.4) {
        let e = dist, peak = f[dist];
        while (e + 1 <= maxOut && f[e + 1] >= 0.25) { e++; if (f[e] > peak) peak = f[e]; }
        const touching = dist <= (cont == null ? 0 : cont) + 2;
        if (touching && !runs.length) { cont = e; dist = e + 1; continue; }
        if (e - dist + 1 > thinMax) break;
        if (peak >= 0.6) runs.push({ start: dist, end: e, peak });
        dist = e + 1;
        continue;
      }
      dist++;
    }
    return { cont, runs };
  });
  return { sides: out, lenU, lenV };
}

/**
 * Turn a side scan into margins. shadowSides marks the sides where most
 * stamps on the page show a detached line: that is the shadow side for this
 * light. Elsewhere a detached line is more likely a ruled line or the next
 * stamp's shadow, so it is ignored. Sides with no evidence borrow the
 * opposite side's margin, since most designs sit near the middle of their
 * paper. With no evidence at all, a design-only find is widened by a
 * typical margin.
 */
function marginsFrom(scan, quad, shadowSides, paperBand) {
  const { sides, lenU, lenV } = scan;
  // A shadow falls on two neighbouring sides at about the same distance.
  // Two such lines on one stamp confirm each other, whatever the vote says.
  const confirmed = [false, false, false, false];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const a = sides[i].runs[0], b = sides[j].runs[0];
    if (a && b && Math.abs(a.end - b.end) <= 0.25 * Math.max(a.end, b.end) + 2) confirmed[i] = confirmed[j] = true;
  }
  const margins = sides.map((sd, i) => {
    let m = sd.cont;
    if ((shadowSides[i] || confirmed[i]) && sd.runs.length) m = Math.max(m || 0, sd.runs[0].end);
    return m;
  });
  for (const [p, q] of [[0, 2], [1, 3]]) {
    if (margins[p] == null && margins[q] != null) margins[p] = margins[q];
    if (margins[q] == null && margins[p] != null) margins[q] = margins[p];
  }
  if (margins.every(v => v == null)) {
    if (paperBand(quad)) return { quad, margins: [0, 0, 0, 0], guessed: false };
    const mu = 0.09 * lenU, mv = 0.09 * lenV;
    return { quad: offsetQuad(quad, [mv, mu, mv, mu]), margins: [mv, mu, mv, mu], guessed: true };
  }
  const m = margins.map((v, i) => {
    const val = v == null ? (margins[(i + 1) % 4] != null ? margins[(i + 1) % 4] : 0) : v;
    return Math.min(val, 0.22 * (i % 2 ? lenU : lenV));
  });
  return { quad: offsetQuad(quad, m), margins: m, guessed: false };
}

/**
 * Open one component with a square about 7% of its short side, keep the
 * largest piece, and refit. Thin stubs go; the body stays.
 */
function regularize(lab, w, h, c) {
  const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
  const r = Math.max(2, Math.round(0.07 * Math.min(bw, bh)));
  const pad = r + 1, sw = bw + 2 * pad, sh = bh + 2 * pad;
  const sub = new Uint8Array(sw * sh);
  for (let y = c.minY; y <= c.maxY; y++) {
    for (let x = c.minX, q = y * w + c.minX; x <= c.maxX; x++, q++) if (lab[q] === c.id) sub[(y - c.minY + pad) * sw + (x - c.minX + pad)] = 1;
  }
  const opened = openSq(sub, sw, sh, r);
  const { lab: l2, comps } = labelComponents(opened, sw, sh);
  if (!comps.length) return null;
  const big = comps.reduce((a, b) => (b.area > a.area ? b : a));
  const pts = boundariesOf(l2, sw, sh, [big.id]).get(big.id).map(p => ({ x: p.x + c.minX - pad, y: p.y + c.minY - pad }));
  if (pts.length < 12) return null;
  const fit = fitQuad(pts);
  if (!fit) return null;
  return { fit, fill: Math.min(1, big.area / fit.rectArea), area: big.area };
}

/** Sort items into reading order: rows top to bottom, then left to right. */
function readingOrder(items) {
  if (items.length < 2) return items;
  const hs = items.map(it => V.quadBounds(it.quad).h).sort((a, b) => a - b);
  const medH = hs[hs.length >> 1];
  const withC = items.map(it => ({ it, c: V.quadCentroid(it.quad) })).sort((a, b) => a.c.y - b.c.y);
  const rows = [];
  for (const e of withC) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(e.c.y - row.y) <= medH * 0.5) {
      row.list.push(e);
      row.y = row.list.reduce((s, q) => s + q.c.y, 0) / row.list.length;
    } else {
      rows.push({ y: e.c.y, list: [e] });
    }
  }
  return rows.flatMap(r => r.list.sort((a, b) => a.c.x - b.c.x).map(e => e.it));
}

/* ---------------------------------------------------------------------- */
/* Detection                                                               */
/* ---------------------------------------------------------------------- */

/**
 * Find every stamp, block or cover on a page.
 *
 * img: { width, height, data } RGBA (ImageData works). { w, h, data } is accepted too.
 * opts.minArea  smallest item as a share of the image (default 0.0012)
 * opts.maxArea  largest item as a share of the image (default 0.35)
 * opts.minFill  item area against its rectangle; below this it is dropped (default 0.6)
 * opts.texture  true or false to force the texture cue; default: on for light pages
 * opts.work     whole-number downscale for the page-wide pass (default: long side / 520)
 * opts.info     an object that receives diagnostics (page colour, thresholds, timings)
 *
 * Returns items in reading order: { quad, area, fill, score, edge, review }.
 * area is the quad's area in pixels. fill runs 0 to 1. edge means the item
 * touches the photo border and is probably cut off. review means the shape
 * is odd (torn, irregular, or about twice the size of the others, so maybe
 * two stamps touching) and the owner should check it.
 */
export function detectStamps(img, opts = {}) {
  const t0 = Date.now();
  const W = img.width != null ? img.width : img.w;
  const H = img.height != null ? img.height : img.h;
  const full = { width: W, height: H, data: img.data };
  const long = Math.max(W, H);
  const info = opts.info || {};
  if (Math.min(W, H) < 48) return [];
  const stages = {};
  let tick = Date.now();
  const lap = name => { const now = Date.now(); stages[name] = now - tick; tick = now; };

  // The page-wide pass runs on a smaller copy, about 500 px on the long
  // side. Stamps are at least a few tenths of a percent of the page, so that
  // is plenty, and it averages away noise and faint ruled lines. Margins are
  // then measured on the full image.
  const k = Math.max(1, opts.work || Math.round(long / 520));
  const im = k > 1 ? downsample(full, k) : full;
  const w = im.width, h = im.height, n = w * h, wl = Math.max(w, h);
  lap('downsample');

  // 1. The page and its uneven light.
  const step = Math.max(1, Math.floor(Math.sqrt(n / 160000)));
  const page = pageColour(im, step);
  const pageL = 0.2126 * page[0] + 0.7152 * page[1] + 0.0722 * page[2];
  const light = pageL > 150;
  const useTexture = opts.texture != null ? !!opts.texture : light;
  const bs = Math.max(10, Math.round(wl / 36));
  let bgf = backgroundField(im, page, bs);
  lap('background');

  const rLine = Math.max(1, Math.round(wl / 400));
  const rClose = Math.max(2, Math.round(wl / 170));
  const rCut = Math.max(1, Math.round(wl / 300));
  // Lines thinner than this across, and long, are page lines, not stamps.
  const rBand = Math.max(rLine + 1, Math.round(wl / 220));
  const T = useTexture ? textureMap(im, Math.max(2, Math.round(wl * 0.0035))) : null;
  const minA = n * (opts.minArea || 0.0012), maxA = n * (opts.maxArea || 0.35);

  // 2 and 3. Foreground (far from the page colour, or busy with printed
  // detail), then clean-up. Long thin lines (strip edges, ruled grids) and
  // specks go first, so they cannot join the stamps in a row. Closing then
  // joins each design to its margins and perforations.
  const segment = field => {
    const D = distanceMap(im, field);
    const spread = gatedPercentile(D, D, 30, 0.5, step);
    // On a dark page (a stockbook) stamps stand far from the page colour,
    // while the clear strips tint the black a little. A higher floor keeps
    // that tint, and its edges, out.
    const tD = V.clamp(spread * 3.5 + 8, pageL < 90 ? 26 : 14, 60);
    const fg = new Uint8Array(n);
    for (let q = 0; q < n; q++) fg[q] = D[q] > tD ? 1 : 0;
    let tT = null;
    if (T) {
      const bgT = gatedPercentile(T, D, tD, 0.5, step);
      tT = Math.max(10, bgT * 3 + 6);
      for (let q = 0; q < n; q++) if (T[q] > tT) fg[q] = 1;
    }
    let m = dropLongLines(fg, w, h, rBand);
    m = openSq(m, w, h, rLine);
    m = closeSq(m, w, h, rClose);
    m = fillHolesFast(m, w, h);
    m = openSq(m, w, h, rCut);
    const { lab, comps } = labelComponents(m, w, h);
    const cands = comps.filter(c => c.area >= minA && c.area <= maxA);
    const bounds = boundariesOf(lab, w, h, cands.map(c => c.id));
    return { D, spread, tD, tT, lab, cands, bounds };
  };
  let seg = segment(bgf);
  lap('segment');

  // On a light page, stamp paper close to the page colour drags the page
  // estimate toward itself near each stamp, which leaves a halo around it.
  // Estimate the page again with every found stamp left out, and segment
  // once more.
  let clean = null, excl = null;
  if (light) {
    const keep = new Uint8Array(n);
    for (const c of seg.cands) {
      const pts = seg.bounds.get(c.id);
      const fit = pts && pts.length >= 12 ? fitQuad(pts) : null;
      if (fit) fillQuad(keep, w, h, fit.quad);
    }
    excl = dilateSq(keep, w, h, Math.max(2, rClose));
    clean = backgroundField(im, page, bs, { exclude: excl, start: bgf.field, passes: 1 });
    seg = segment(clean);
    bgf = clean;
    lap('resegment');
  }
  const { D, spread, tD, tT, lab, cands, bounds } = seg;

  let ctx = null;
  if (light) {
    // Noise at full resolution, for the margin search on light pages.
    const vals = [];
    const bgc = [0, 0, 0];
    const st = Math.max(2, Math.floor(Math.sqrt(W * H / 6000)));
    for (let y = st >> 1; y < H; y += st) {
      for (let x = st >> 1; x < W; x += st) {
        const wx = Math.min(w - 1, (x / k) | 0), wy = Math.min(h - 1, (y / k) | 0);
        if (D[wy * w + wx] >= tD || excl[wy * w + wx]) continue;
        fieldAt(clean, (x - (k - 1) / 2) / k, (y - (k - 1) / 2) / k, bgc);
        const i = (y * W + x) * 4;
        vals.push(Math.hypot(full.data[i] - bgc[0], full.data[i + 1] - bgc[1], full.data[i + 2] - bgc[2]));
      }
    }
    vals.sort((a, b) => a - b);
    const fullSpread = vals.length ? vals[vals.length >> 1] : spread;
    const tLow = V.clamp(fullSpread * 2.5 + 4, 6, 24);
    // Is the band just inside a quad plain paper that differs from the page?
    const paperBand = quad => {
      const qc = V.quadCentroid(quad);
      const bgc2 = [0, 0, 0];
      const lumAt = q => 0.2126 * full.data[q] + 0.7152 * full.data[q + 1] + 0.0722 * full.data[q + 2];
      // Plain paper at (x, y): differs a little from the page, light, and smooth
      // (compared with a pixel 2 px further along the side).
      const paperAt = (x, y, ux, uy) => {
        const X = Math.round(x), Y = Math.round(y), X2 = Math.round(x + ux * 2), Y2 = Math.round(y + uy * 2);
        if (X < 0 || Y < 0 || X >= W || Y >= H || X2 < 0 || Y2 < 0 || X2 >= W || Y2 >= H) return false;
        fieldAt(clean, (X - (k - 1) / 2) / k, (Y - (k - 1) / 2) / k, bgc2);
        const ii = (Y * W + X) * 4;
        const dist = Math.hypot(full.data[ii] - bgc2[0], full.data[ii + 1] - bgc2[1], full.data[ii + 2] - bgc2[2]);
        const lum = lumAt(ii);
        return dist > tLow && dist < 70 && lum > pageL - 60 && Math.abs(lum - lumAt((Y2 * W + X2) * 4)) < 6;
      };
      let hit = 0, tot = 0;
      for (let i = 0; i < 4; i++) {
        const a = quad[i], b = quad[(i + 1) % 4];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
        for (let j = 1; j < 12; j++) {
          const t = j / 12;
          const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
          tot++;
          // Two depths: just inside the edge, and a little further in.
          if (paperAt(px + (qc.x - px) * 0.06, py + (qc.y - py) * 0.06, ux, uy) ||
            paperAt(px + (qc.x - px) * 0.12, py + (qc.y - py) * 0.12, ux, uy)) hit++;
        }
      }
      return hit / tot >= 0.6;
    };
    ctx = { k, bgf: clean, tLow, paperBand };
    info.tLow = tLow;
  }

  const minFill = opts.minFill || 0.6;
  const edgeM = Math.max(1.5, long * 0.004);
  const found = [];
  for (const c of cands) {
    const pts = bounds.get(c.id);
    if (!pts || pts.length < 12) continue;
    let fit = fitQuad(pts);
    if (!fit || fit.short < 6) continue;
    let fill = Math.min(1, c.area / fit.rectArea);
    if (fill < 0.92) {
      // Ruled lines or shadows that meet an edge can leave stubs on the
      // shape, which tilt and widen the fitted rectangle. Trim them.
      const reg = regularize(lab, w, h, c);
      if (reg && reg.fill > fill + 0.03 && reg.area > c.area * 0.8) { fit = reg.fit; fill = reg.fill; }
    }
    const aspect = fit.long / Math.max(1, fit.short);
    if (fill < minFill || aspect > 4) continue;
    // Back to full-resolution pixels (a work pixel covers k x k full pixels).
    const quad = fit.quad.map(p => ({ x: p.x * k + (k - 1) / 2, y: p.y * k + (k - 1) / 2 }));
    found.push({ quad, fill, aspect, scan: ctx ? scanSides(full, quad, ctx) : null });
  }
  // Light pages: which sides carry a shadow? Vote across the page.
  const shadowSides = [false, false, false, false];
  if (ctx && found.length) {
    for (let i = 0; i < 4; i++) {
      const withRun = found.filter(f => f.scan.sides[i].runs.length).length;
      shadowSides[i] = withRun / found.length >= 0.4;
    }
    info.shadowSides = shadowSides;
  }
  const items = [];
  for (const f of found) {
    let quad = f.quad, guessed = false;
    if (ctx) {
      const r = marginsFrom(f.scan, quad, shadowSides, ctx.paperBand);
      quad = r.quad;
      guessed = r.guessed;
    }
    quad = V.clampQuad(quad, W, H);
    const edge = quad.some(p => p.x < edgeM || p.y < edgeM || p.x > W - 1 - edgeM || p.y > H - 1 - edgeM);
    const score = Math.round(f.fill * (edge ? 0.6 : 1) * (guessed ? 0.85 : 1) * 1000) / 1000;
    items.push({ quad, area: Math.round(V.polygonArea(quad)), fill: Math.round(f.fill * 1000) / 1000, score, edge, review: f.fill < 0.75 || f.aspect > 3, aspect: f.aspect });
  }
  // Much larger than the typical item: probably two stamps touching, or a block.
  if (items.length >= 3) {
    const areas = items.map(i => i.area).sort((a, b) => a - b);
    const med = areas[areas.length >> 1];
    for (const it of items) if (it.area > med * 1.8) it.review = true;
  }
  lap('items');
  const out = readingOrder(items).map(({ aspect, ...rest }) => rest);
  Object.assign(info, { stages, page, light, spread, tD, tT, texture: useTexture, work: k, radii: { rLine, rBand, rClose, rCut }, ms: Date.now() - t0, found: out.length });
  return out;
}

/* ---------------------------------------------------------------------- */
/* Contact sheet layout (pure)                                             */
/* ---------------------------------------------------------------------- */

/**
 * Lay out item crops on one or more numbered sheets.
 *
 * sizes: [{ w, h }] of each crop, in order.
 * opts.maxSide   longest sheet side in pixels (default 1900)
 * opts.perSheet  most items on one sheet (default 48)
 * opts.gap, opts.pad  spacing in pixels (defaults 14 and 18)
 * opts.maxCell   largest cell side (default 520)
 * opts.start     number of the first item (default 1)
 *
 * Returns { sheets: [{ width, height, cell, cells: [{ n, x, y, w, h, box }] }] }.
 * x, y, w, h is where the crop is drawn, scaled to fit its cell with true
 * proportions; box is the whole square cell. Numbers continue across sheets.
 */
export function sheetLayout(sizes, opts = {}) {
  const maxSide = opts.maxSide || 1900;
  const per = Math.max(1, opts.perSheet || 48);
  const gap = opts.gap != null ? opts.gap : 14, pad = opts.pad != null ? opts.pad : 18;
  const maxCell = opts.maxCell || 520;
  const sheets = [];
  let num = opts.start || 1;
  for (let s = 0; s < sizes.length; s += per) {
    const part = sizes.slice(s, s + per);
    const count = part.length;
    let best = null;
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols);
      const cw = (maxSide - 2 * pad - (cols - 1) * gap) / cols;
      const ch = (maxSide - 2 * pad - (rows - 1) * gap) / rows;
      const cell = Math.floor(Math.min(cw, ch, maxCell));
      // Prefer bigger cells, then fewer rows (a wide sheet reads in order).
      if (!best || cell > best.cell || (cell === best.cell && rows < best.rows)) best = { cols, rows, cell };
    }
    const { cols, rows, cell } = best;
    const width = 2 * pad + cols * cell + (cols - 1) * gap;
    const height = 2 * pad + rows * cell + (rows - 1) * gap;
    const cells = part.map((sz, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const bx = pad + c * (cell + gap), by = pad + r * (cell + gap);
      const sc = Math.min(cell / Math.max(1, sz.w), cell / Math.max(1, sz.h));
      const cw = Math.max(1, Math.round(sz.w * sc)), chh = Math.max(1, Math.round(sz.h * sc));
      return { n: num++, x: bx + Math.round((cell - cw) / 2), y: by + Math.round((cell - chh) / 2), w: cw, h: chh, box: { x: bx, y: by, w: cell, h: cell } };
    });
    sheets.push({ width, height, cell, cells });
  }
  return { sheets };
}

/* ---------------------------------------------------------------------- */
/* Browser helpers                                                         */
/* ---------------------------------------------------------------------- */

const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Find stamps in a photo. src is an ImageBitmap, image or canvas.
 * opts.analysisSide  long side used for detection (default 1200)
 * Other opts go to detectStamps.
 * Returns { items, scale, analysisSize, source } with quads in source pixels.
 */
export async function findStampsInPhoto(src, opts = {}) {
  await nextFrame(); // let the page paint a busy state first
  const a = drawScaled(src, opts.analysisSide || 1200);
  const id = a.ctx.getImageData(0, 0, a.canvas.width, a.canvas.height);
  const found = detectStamps(id, opts);
  const inv = 1 / a.scale;
  const items = found.map(it => ({ ...it, quad: it.quad.map(p => ({ x: p.x * inv, y: p.y * inv })), area: Math.round(it.area * inv * inv) }));
  return { items, scale: a.scale, analysisSize: { w: a.canvas.width, h: a.canvas.height }, source: dims(src) };
}

/**
 * Straightened crop of each item.
 * opts.maxSide  long side of each crop (default 640; ask for more for one item)
 * opts.margin   corners move out by this share of their distance from the
 *               centre (default 0.04, about 2% of the size on every side)
 * Returns canvases in the same order as items.
 */
export function cropItems(src, items, opts = {}) {
  const maxSide = opts.maxSide || 640;
  const margin = opts.margin != null ? opts.margin : 0.04;
  return items.map(it => straighten(src, it.quad, { maxSide, margin, readCap: Math.max(Math.round(maxSide * 1.5), 800) }).canvas);
}

/**
 * Numbered contact sheets, one AI call each. Each sheet's long side stays at
 * or under 1900 px, so the Claude API keeps full detail (its high-resolution
 * limit is 4,784 visual tokens of 28 x 28 px).
 * opts: as sheetLayout, plus opts.background (default '#d9d9d6').
 * Returns { sheets: [{ canvas, cells }] } with cells as in sheetLayout.
 */
export function contactSheet(canvases, opts = {}) {
  const layout = sheetLayout(canvases.map(c => ({ w: c.width, h: c.height })), opts);
  let at = 0;
  const sheets = layout.sheets.map(sh => {
    const canvas = canvasOf(sh.width, sh.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.background || '#d9d9d6';
    ctx.fillRect(0, 0, sh.width, sh.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const badge = Math.max(28, Math.round(sh.cell * 0.15));
    for (const cell of sh.cells) {
      ctx.drawImage(canvases[at++], cell.x, cell.y, cell.w, cell.h);
      const label = String(cell.n);
      ctx.font = `700 ${Math.round(badge * 0.62)}px system-ui, sans-serif`;
      const bw = Math.max(badge, Math.ceil(ctx.measureText(label).width + badge * 0.5));
      const bx = cell.box.x, by = cell.box.y;
      roundRect(ctx, bx, by, bw, badge, Math.round(badge * 0.22));
      ctx.fillStyle = '#111111';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + bw / 2, by + badge / 2 + 1);
    }
    return { canvas, cells: sh.cells };
  });
  return { sheets };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
