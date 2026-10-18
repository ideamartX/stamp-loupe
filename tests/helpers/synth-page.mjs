// Synthetic album, stockbook and table pages with many stamps, for the
// page-mode tests. Pure JS, no image libraries. Every stamp's true corners
// are returned so tests can score each detection by overlap (IoU).

import { makeImage, homography, applyH, orderQuad, polygonArea } from '../../src/capture/vision.js';
import { rotatedQuad, blurImage } from './synth.mjs';

/** Small seeded generator (same LCG as synth.mjs) so pages repeat exactly. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const INKS = [
  [42, 62, 150], [158, 42, 44], [34, 108, 62], [112, 72, 40],
  [92, 52, 122], [36, 36, 40], [196, 108, 34], [26, 112, 128]
];

/** Page kinds. papers are the stamp paper colours used on that page. */
export const PAGE_KINDS = {
  white: {
    page: [247, 246, 242], shadow: 24, grid: 40,
    papers: [[236, 229, 208], [240, 236, 222], [229, 220, 196], [238, 234, 226]]
  },
  cream: {
    page: [236, 228, 206], shadow: 24,
    papers: [[248, 246, 240], [244, 241, 232], [224, 214, 190], [250, 249, 245]]
  },
  stockbook: {
    page: [22, 22, 25], shadow: 0, strips: true,
    papers: [[238, 232, 214], [246, 244, 238], [226, 216, 192], [240, 238, 230]]
  },
  cloth: {
    page: [52, 94, 70], shadow: 12, texture: 18,
    papers: [[238, 232, 214], [246, 244, 238], [226, 216, 192], [240, 238, 230]]
  }
};

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Colour of a stamp at local point p (LW x LH space), or null for a perforation hole. */
function stampColour(p, LW, LH, st) {
  if (st.perfs) {
    const dx = Math.min(p.x, LW - p.x), dy = Math.min(p.y, LH - p.y);
    if (dy < st.holeR) {
      const k = Math.round(p.x / st.pitch) * st.pitch;
      if (Math.hypot(p.x - k, dy) < st.holeR) return null;
    }
    if (dx < st.holeR) {
      const k = Math.round(p.y / st.pitch) * st.pitch;
      if (Math.hypot(dx, p.y - k) < st.holeR) return null;
    }
  }
  const mx = LW * st.margin, my = LH * st.margin;
  if (p.x <= mx || p.x >= LW - mx || p.y <= my || p.y >= LH - my) return st.paper;
  const u = (p.x - mx) / (LW - 2 * mx), v = (p.y - my) / (LH - 2 * my);
  const ink = st.ink, tint = mix(st.paper, ink, 0.28);
  switch (st.kind) {
    case 'engraved': {
      const line = Math.floor(p.y / 3) % 2 === 0;
      const ox = (u - 0.5) / 0.32, oy = (v - 0.5) / 0.38;
      const oval = ox * ox + oy * oy < 1;
      if (v > 0.82 && v < 0.94 && Math.floor(p.x / 14) % 2 === 0) return ink;
      return oval ? (line ? ink : tint) : (line ? mix(ink, st.paper, 0.35) : st.paper);
    }
    case 'pictorial': {
      if (u < 0.06 || u > 0.94 || v < 0.06 || v > 0.94) return ink;
      const sun = Math.hypot(u - 0.7, v - 0.3) < 0.12;
      if (sun) return [236, 196, 70];
      return v < 0.58 ? mix(st.paper, st.ink2, 0.45) : st.ink2;
    }
    case 'portrait': {
      const ox = (u - 0.5) / 0.3, oy = (v - 0.45) / 0.36;
      if (ox * ox + oy * oy < 1) return mix(st.paper, ink, 0.18 + 0.2 * Math.max(0, oy));
      if (v > 0.84) return Math.floor(p.x / 10) % 3 === 0 ? st.paper : ink;
      return ink;
    }
    default: { // pale: a light tint with thin lines, the hardest on light pages
      const line = Math.floor(p.y / 6) % 3 === 0 || Math.floor(p.x / 9) % 4 === 0;
      return line ? mix(st.paper, ink, 0.7) : mix(st.paper, ink, 0.16);
    }
  }
}

function randomStyle(rand, papers) {
  const kinds = ['engraved', 'pictorial', 'portrait', 'pale'];
  return {
    kind: kinds[Math.floor(rand() * kinds.length)],
    paper: papers[Math.floor(rand() * papers.length)],
    ink: INKS[Math.floor(rand() * INKS.length)],
    ink2: INKS[Math.floor(rand() * INKS.length)],
    margin: 0.09 + rand() * 0.05,
    perfs: rand() > 0.18,
    pitch: 9 + rand() * 2.5,
    holeR: 3 + rand() * 0.8
  };
}

function quadBox(q, pad, w, h) {
  const xs = q.map(p => p.x), ys = q.map(p => p.y);
  return {
    x0: Math.max(0, Math.floor(Math.min(...xs) - pad)), y0: Math.max(0, Math.floor(Math.min(...ys) - pad)),
    x1: Math.min(w - 1, Math.ceil(Math.max(...xs) + pad)), y1: Math.min(h - 1, Math.ceil(Math.max(...ys) + pad))
  };
}

/** Draw one stamp (and its drop shadow on light pages) into img. */
export function drawStamp(img, quad, st, shadow = 0) {
  const { width: w, height: h, data: d } = img;
  const sideU = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
  const sideV = Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y);
  const LW = 300, LH = 300 * sideV / sideU;
  const local = [{ x: 0, y: 0 }, { x: LW, y: 0 }, { x: LW, y: LH }, { x: 0, y: LH }];
  const toLocal = homography(quad, local);
  const b = quadBox(quad, 4, w, h);
  if (shadow) {
    // A soft shadow down and to the right, as a hinged stamp casts on a page.
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        let k = 0;
        for (const [sx, sy, wt] of [[1.5, 1.5, 0.6], [2.5, 2.5, 0.4]]) {
          const p = applyH(toLocal, x + 0.5 - sx, y + 0.5 - sy);
          if (p.x >= 0 && p.y >= 0 && p.x <= LW && p.y <= LH) k += wt;
        }
        if (!k) continue;
        const i = (y * w + x) * 4;
        const f = 1 - (shadow * k) / 255;
        d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
      }
    }
  }
  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const p = applyH(toLocal, x + 0.5, y + 0.5);
      if (p.x < 0 || p.y < 0 || p.x > LW || p.y > LH) continue;
      const c = stampColour(p, LW, LH, st);
      if (!c) continue;
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
  }
}

function fillPage(img, kind, rand) {
  const { width: w, height: h, data: d } = img;
  const k = PAGE_KINDS[kind];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let [r, g, b] = k.page;
      if (k.texture) {
        // Woven cloth: fine noise, a diagonal weave and slow variation.
        const n = (rand() - 0.5) * k.texture + (((x + y) & 3) < 2 ? 5 : -5) + Math.sin(x / 37) * 4 + Math.cos(y / 53) * 4;
        r += n; g += n; b += n;
      }
      if (k.grid && (x % k.grid === 0 || y % k.grid === 0)) { r -= 16; g -= 16; b -= 12; }
      // Gentle uneven light: darker toward one corner, as in a room photo.
      const shade = 1 - 0.07 * ((x / w) * 0.6 + (y / h) * 0.4);
      d[i] = r * shade; d[i + 1] = g * shade; d[i + 2] = b * shade; d[i + 3] = 255;
    }
  }
}

/** Clear stockbook strips: a faint band and thin light glare lines at their edges. */
function drawStrips(img, strips) {
  const { width: w, data: d } = img;
  for (const s of strips) {
    for (let y = s.y; y < s.y + s.h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        d[i] += 9; d[i + 1] += 9; d[i + 2] += 10;
      }
    }
    for (const [yy, t, thick] of [[s.y, 0.62, 2], [s.y + s.h, 0.32, 1]]) {
      for (let y = yy; y < yy + thick; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          d[i] += (205 - d[i]) * t; d[i + 1] += (206 - d[i + 1]) * t; d[i + 2] += (212 - d[i + 2]) * t;
        }
      }
    }
  }
}

function addNoise(img, amount, rand) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
}

/**
 * Lay out stamps on a loose grid. Returns quads in TL, TR, BR, BL order.
 * opts: { count, cols, fill (stamp size against its cell), rot (max degrees), gap }
 */
export function layoutStamps(rand, w, h, opts) {
  const count = opts.count;
  const cols = opts.cols || Math.max(1, Math.round(Math.sqrt(count * (w / h) * 0.85)));
  const rows = Math.ceil(count / cols);
  const mx = w * 0.05, my = h * 0.05;
  const cw = (w - 2 * mx) / cols, ch = (h - 2 * my) / rows;
  const fill = opts.fill || 0.72;
  const rot = opts.rot != null ? opts.rot : 8;
  const quads = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const base = Math.min(cw, ch) * fill * (0.86 + rand() * 0.14);
    const a = 0.82 + rand() * 0.36;
    const sw = Math.min(base * a, cw * fill), sh = Math.min(base / a, ch * fill);
    const slackX = (cw - sw * 1.15) / 2, slackY = (ch - sh * 1.15) / 2;
    const cx = mx + (c + 0.5) * cw + (rand() - 0.5) * Math.max(0, slackX) * 0.6;
    const cy = my + (r + 0.5) * ch + (rand() - 0.5) * Math.max(0, slackY) * 0.6;
    const deg = (rand() * 2 - 1) * rot;
    quads.push(orderQuad(rotatedQuad(cx, cy, sw, sh, deg)));
  }
  return quads;
}

/**
 * Render a page of stamps.
 * opts: { w, h, kind: 'white' | 'cream' | 'stockbook' | 'cloth', count, seed,
 *         noise, blur, quads (to place stamps yourself), cols, fill, rot }
 * Returns { img, truth } where truth is the list of stamp quads.
 */
export function renderPage(opts = {}) {
  const w = opts.w || 960, h = opts.h || 720;
  const kind = opts.kind || 'white';
  const rand = rng(opts.seed || 1);
  const k = PAGE_KINDS[kind];
  const img = makeImage(w, h);
  fillPage(img, kind, rand);
  let quads = opts.quads;
  let strips = [];
  if (!quads) {
    if (k.strips) {
      // Stockbook: stamps sit in rows, tucked behind clear strips.
      quads = layoutStamps(rand, w, h, { count: opts.count || 12, cols: opts.cols, fill: opts.fill || 0.8, rot: opts.rot != null ? opts.rot : 3 });
    } else {
      quads = layoutStamps(rand, w, h, { count: opts.count || 12, cols: opts.cols, fill: opts.fill, rot: opts.rot });
    }
  }
  if (opts.strips) {
    strips = opts.strips;
  } else if (k.strips && quads.length) {
    // One strip per row of stamps, its top edge about 40% down the stamps.
    const ys = quads.map(q => ({ top: Math.min(q[0].y, q[1].y), bot: Math.max(q[2].y, q[3].y) }));
    const groups = [];
    for (const y of ys.sort((a, b) => a.top - b.top)) {
      const g = groups.find(gr => Math.abs(gr.top - y.top) < (y.bot - y.top) * 0.5);
      if (g) { g.top = Math.min(g.top, y.top); g.bot = Math.max(g.bot, y.bot); } else groups.push({ ...y });
    }
    strips = groups.slice(0, opts.stripCount || 3).map(g => ({ y: Math.round(g.top + (g.bot - g.top) * 0.4), h: Math.round((g.bot - g.top) * 0.7) }));
  }
  const styles = quads.map(q => {
    const st = randomStyle(rand, k.papers);
    drawStamp(img, q, st, k.shadow);
    return st;
  });
  if (strips.length) drawStrips(img, strips);
  addNoise(img, opts.noise != null ? opts.noise : 6, rand);
  const out = opts.blur === 0 ? img : blurImage(img, opts.blur || 1, 1);
  return { img: out, truth: quads, strips, styles };
}

/* ---------------------------------------------------------------------- */
/* Scoring                                                                 */
/* ---------------------------------------------------------------------- */

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Sutherland-Hodgman clipping of a polygon by a convex polygon. */
function clip(subject, clipper) {
  const sign = signedArea(clipper) >= 0 ? 1 : -1;
  const inside = (a, b, p) => sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= 0;
  const hit = (a, b, p, q) => {
    const a1 = b.y - a.y, b1 = a.x - b.x, c1 = a1 * a.x + b1 * a.y;
    const a2 = q.y - p.y, b2 = p.x - q.x, c2 = a2 * p.x + b2 * p.y;
    const det = a1 * b2 - a2 * b1;
    if (Math.abs(det) < 1e-12) return p;
    return { x: (b2 * c1 - b1 * c2) / det, y: (a1 * c2 - a2 * c1) / det };
  };
  let out = subject;
  for (let i = 0; i < clipper.length && out.length; i++) {
    const a = clipper[i], b = clipper[(i + 1) % clipper.length];
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length];
      const pin = inside(a, b, p), qin = inside(a, b, q);
      if (pin) out.push(p);
      if (pin !== qin) out.push(hit(a, b, p, q));
    }
  }
  return out;
}

/** Intersection over union of two convex quads. */
export function quadIoU(a, b) {
  const inter = clip(a, b);
  const ia = inter.length >= 3 ? polygonArea(inter) : 0;
  const u = polygonArea(a) + polygonArea(b) - ia;
  return u > 0 ? ia / u : 0;
}

/** Best IoU of each truth quad against the detected quads. */
export function matchTruth(truth, items) {
  return truth.map(t => {
    let best = 0, at = -1;
    items.forEach((it, i) => { const v = quadIoU(t, it.quad); if (v > best) { best = v; at = i; } });
    return { iou: best, at };
  });
}
