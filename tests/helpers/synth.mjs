// Synthetic test images: a perforated "stamp" on a plain background.
// Pure JS so tests run in Node with no image libraries.

import { makeImage, homography, applyH } from '../../src/capture/vision.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Render a stamp whose corners land on `quad` (TL, TR, BR, BL) in an image of
 * size w x h. The stamp's own design is drawn in a 300 x 360 local space and
 * mapped through a homography, so rotation and perspective are exact.
 */
export function renderStamp({
  w = 640, h = 480, quad, bg = [24, 26, 32], paper = [238, 232, 214], ink = [42, 62, 150],
  perfs = true, noise = 6, seed = 7
}) {
  const img = makeImage(w, h);
  const d = img.data;
  const rand = rng(seed);
  const LW = 300, LH = 360;
  const local = [{ x: 0, y: 0 }, { x: LW, y: 0 }, { x: LW, y: LH }, { x: 0, y: LH }];
  const toLocal = homography(quad, local);
  const tooth = 9; // perforation pitch in local units
  const holeR = 3.4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let c = bg;
      const p = applyH(toLocal, x + 0.5, y + 0.5);
      if (p.x >= 0 && p.y >= 0 && p.x <= LW && p.y <= LH) {
        let inHole = false;
        if (perfs) {
          const dx = Math.min(p.x, LW - p.x), dy = Math.min(p.y, LH - p.y);
          if (dy < holeR) {
            const k = Math.round(p.x / tooth) * tooth;
            inHole = Math.hypot(p.x - k, dy) < holeR;
          }
          if (!inHole && dx < holeR) {
            const k = Math.round(p.y / tooth) * tooth;
            inHole = Math.hypot(dx, p.y - k) < holeR;
          }
        }
        if (!inHole) {
          c = paper;
          const mx = 34, my = 40;
          if (p.x > mx && p.x < LW - mx && p.y > my && p.y < LH - my) {
            // Engraved design: fine horizontal lines and a central oval.
            const line = Math.floor(p.y / 3) % 2 === 0;
            const ox = (p.x - LW / 2) / 90, oy = (p.y - LH / 2) / 110;
            const oval = ox * ox + oy * oy < 1;
            c = oval ? (line ? ink : [200, 205, 230]) : (line ? [70, 90, 170] : paper);
            if (p.y > LH - my - 34 && p.y < LH - my - 12 && Math.floor(p.x / 14) % 2 === 0) c = ink;
          }
        }
      }
      const n = noise ? (rand() - 0.5) * noise : 0;
      d[i] = c[0] + n; d[i + 1] = c[1] + n; d[i + 2] = c[2] + n; d[i + 3] = 255;
    }
  }
  return img;
}

/** Box blur passes approximate a Gaussian (three passes is close). */
export function blurImage(img, radius, passes = 3) {
  const { width: w, height: h } = img;
  let src = img.data;
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < 4; c++) {
        let acc = 0, n = 0;
        for (let x = -radius; x <= radius; x++) { if (x >= 0 && x < w) { acc += src[(y * w + x) * 4 + c]; n++; } }
        for (let x = 0; x < w; x++) {
          tmp[(y * w + x) * 4 + c] = acc / n;
          const add = x + radius + 1, rem = x - radius;
          if (add < w) { acc += src[(y * w + add) * 4 + c]; n++; }
          if (rem >= 0) { acc -= src[(y * w + rem) * 4 + c]; n--; }
        }
      }
    }
    const out = new Uint8ClampedArray(w * h * 4);
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let acc = 0, n = 0;
        for (let y = -radius; y <= radius; y++) { if (y >= 0 && y < h) { acc += tmp[(y * w + x) * 4 + c]; n++; } }
        for (let y = 0; y < h; y++) {
          out[(y * w + x) * 4 + c] = acc / n;
          const add = y + radius + 1, rem = y - radius;
          if (add < h) { acc += tmp[(add * w + x) * 4 + c]; n++; }
          if (rem >= 0) { acc -= tmp[(rem * w + x) * 4 + c]; n--; }
        }
      }
    }
    src = out;
  }
  return { width: w, height: h, data: src };
}

/** Add a clipped white glare blob. */
export function addGlare(img, cx, cy, rx, ry) {
  const { width: w, height: h, data: d } = img;
  for (let y = Math.max(0, cy - ry); y < Math.min(h, cy + ry); y++) {
    for (let x = Math.max(0, cx - rx); x < Math.min(w, cx + rx); x++) {
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (e < 1) { const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; }
    }
  }
  return img;
}

/** Scale brightness. */
export function scaleBrightness(img, k) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
  return img;
}

export function rotatedQuad(cx, cy, w, h, deg) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
}

export function maxCornerError(a, b) {
  return Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
}
