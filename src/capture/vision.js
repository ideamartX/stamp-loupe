// Stamp Loupe vision engine.
//
// Pure functions over RGBA pixel buffers, with no DOM access, so the same
// code runs on live camera frames, on still photos, and in Node tests.
//
// An "image" is { width, height, data } where data is a Uint8ClampedArray
// (or Uint8Array) of RGBA bytes. ImageData satisfies this shape.
//
// Coordinates are in pixels of the image passed in. A quad is four points
// ordered top-left, top-right, bottom-right, bottom-left.

/* ---------------------------------------------------------------------- */
/* Basic helpers                                                           */
/* ---------------------------------------------------------------------- */

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function makeImage(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** Rec. 709 luma for every pixel. */
export function luminance(img) {
  const { width: w, height: h, data: d } = img;
  const L = new Float32Array(w * h);
  for (let i = 0, j = 0; j < L.length; i += 4, j++) {
    L[j] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  }
  return L;
}

function median(values) {
  if (!values.length) return 0;
  const a = Float32Array.from(values).sort();
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const a = Float32Array.from(values).sort();
  return a[clamp(Math.round((a.length - 1) * p), 0, a.length - 1)];
}

/** Normalise a region of interest to integer bounds inside the image. */
export function normRoi(img, roi) {
  const W = img.width, H = img.height;
  if (!roi) return { x: 0, y: 0, w: W, h: H };
  const x = clamp(Math.floor(roi.x), 0, W - 1);
  const y = clamp(Math.floor(roi.y), 0, H - 1);
  const x1 = clamp(Math.ceil(roi.x + roi.w), x + 1, W);
  const y1 = clamp(Math.ceil(roi.y + roi.h), y + 1, H);
  return { x, y, w: x1 - x, h: y1 - y };
}

/* ---------------------------------------------------------------------- */
/* Background model and foreground mask                                   */
/* ---------------------------------------------------------------------- */

/**
 * Estimate the background colour from a ring just inside the ROI border.
 * Returns the median colour and a spread figure (80th percentile distance).
 */
export function estimateBackground(img, roi, ringFrac = 0.06) {
  const { width: W, data: d } = img;
  const t = Math.max(2, Math.round(Math.min(roi.w, roi.h) * ringFrac));
  const step = Math.max(1, Math.round(Math.min(roi.w, roi.h) / 160));
  const rs = [], gs = [], bs = [];
  for (let y = roi.y; y < roi.y + roi.h; y += step) {
    const inBandY = y < roi.y + t || y >= roi.y + roi.h - t;
    for (let x = roi.x; x < roi.x + roi.w; x += inBandY ? step : 1) {
      const inBand = inBandY || x < roi.x + t || x >= roi.x + roi.w - t;
      if (!inBand) { x = roi.x + roi.w - t - 1; continue; }
      const i = (y * W + x) * 4;
      rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]);
    }
  }
  const r = median(rs), g = median(gs), b = median(bs);
  const dist = rs.map((_, k) => Math.hypot(rs[k] - r, gs[k] - g, bs[k] - b));
  // The median distance stays a fair noise figure even when the item
  // overlaps part of the ring (a stamp pushed against one edge).
  return { r, g, b, spread: percentile(dist, 0.5), samples: rs.length };
}

/** Binary mask (1 = differs from background) for the ROI, in ROI coordinates. */
export function foregroundMask(img, roi, bg, minDist = 26) {
  const { width: W, data: d } = img;
  const T = clamp(bg.spread * 3 + 8, minDist, 84);
  const T2 = T * T;
  const mask = new Uint8Array(roi.w * roi.h);
  for (let y = 0; y < roi.h; y++) {
    let i = ((roi.y + y) * W + roi.x) * 4;
    const row = y * roi.w;
    for (let x = 0; x < roi.w; x++, i += 4) {
      const dr = d[i] - bg.r, dg = d[i + 1] - bg.g, db = d[i + 2] - bg.b;
      mask[row + x] = dr * dr + dg * dg + db * db > T2 ? 1 : 0;
    }
  }
  return { mask, threshold: T };
}

/* ---------------------------------------------------------------------- */
/* Binary morphology (square structuring element via integral images)     */
/* ---------------------------------------------------------------------- */

function integral(mask, w, h) {
  const S = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      run += mask[y * w + x];
      S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + run;
    }
  }
  return S;
}

function boxCount(S, w, h, x, y, r) {
  const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r);
  const x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
  const W1 = w + 1;
  return { n: S[y1 * W1 + x1] - S[y0 * W1 + x1] - S[y1 * W1 + x0] + S[y0 * W1 + x0], area: (x1 - x0) * (y1 - y0) };
}

export function dilate(mask, w, h, r) {
  if (r <= 0) return mask.slice();
  const S = integral(mask, w, h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = boxCount(S, w, h, x, y, r).n > 0 ? 1 : 0;
  return out;
}

export function erode(mask, w, h, r) {
  if (r <= 0) return mask.slice();
  const S = integral(mask, w, h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = boxCount(S, w, h, x, y, r);
      out[y * w + x] = c.n === c.area ? 1 : 0;
    }
  }
  return out;
}

export function closeMask(mask, w, h, r) {
  return erode(dilate(mask, w, h, r), w, h, r);
}

export function openMask(mask, w, h, r) {
  return dilate(erode(mask, w, h, r), w, h, r);
}

/** Fill enclosed holes: any background pixel not reachable from the border becomes foreground. */
export function fillHoles(mask, w, h) {
  const out = mask.slice();
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const k = y * w + x;
    if (!out[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const k = stack.pop();
    const x = k % w, y = (k - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let k = 0; k < out.length; k++) if (!out[k] && !seen[k]) out[k] = 1;
  return out;
}

/* ---------------------------------------------------------------------- */
/* Connected components                                                    */
/* ---------------------------------------------------------------------- */

export function components(mask, w, h, minArea = 1) {
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    const id = comps.length;
    const c = { id, area: 0, sx: 0, sy: 0, minX: w, minY: h, maxX: 0, maxY: 0 };
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const k = stack.pop();
      const x = k % w, y = (k - x) / w;
      c.area++; c.sx += x; c.sy += y;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      const nb = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1];
      for (const n of nb) {
        if (n >= 0 && mask[n] && label[n] === -1) { label[n] = id; stack.push(n); }
      }
    }
    c.cx = c.sx / c.area;
    c.cy = c.sy / c.area;
    c.touches = (c.minX === 0) + (c.minY === 0) + (c.maxX === w - 1) + (c.maxY === h - 1);
    if (c.area >= minArea) comps.push(c); else comps.push(Object.assign(c, { tiny: true }));
  }
  return { label, comps: comps.filter(c => !c.tiny) };
}

/** Boundary pixels of one labelled component. */
export function boundaryPoints(label, w, h, id) {
  const pts = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (label[k] !== id) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        label[k - 1] !== id || label[k + 1] !== id || label[k - w] !== id || label[k + w] !== id) {
        pts.push({ x, y });
      }
    }
  }
  return pts;
}

/* ---------------------------------------------------------------------- */
/* Geometry                                                                */
/* ---------------------------------------------------------------------- */

const cross3 = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull, Andrew's monotone chain. Returns points counter-clockwise in y-down space order. */
export function convexHull(points) {
  if (points.length < 3) return points.slice();
  const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross3(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross3(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Minimum-area bounding rectangle of a convex hull (rotating calipers, O(n^2) for small n). */
export function minAreaRect(hull) {
  if (hull.length < 3) return null;
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(ang), s = Math.sin(ang);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = p.x * c + p.y * s;
      const v = -p.x * s + p.y * c;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) best = { area, ang, c, s, minU, maxU, minV, maxV };
  }
  return best;
}

function rectFrameToImage(r, u, v) {
  return { x: u * r.c - v * r.s, y: u * r.s + v * r.c };
}

/** Order four points as top-left, top-right, bottom-right, bottom-left. */
export function orderQuad(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const byAngle = pts.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // byAngle runs clockwise on screen (y down) starting near the left.
  let start = 0, best = Infinity;
  byAngle.forEach((p, i) => { const v = p.x + p.y; if (v < best) { best = v; start = i; } });
  const out = [];
  for (let i = 0; i < 4; i++) out.push(byAngle[(start + i) % 4]);
  // Ensure clockwise order TL, TR, BR, BL.
  if (cross3(out[0], out[1], out[2]) < 0) { const t = out[1]; out[1] = out[3]; out[3] = t; }
  return out.map(p => ({ x: p.x, y: p.y }));
}

function fitLine(points, key) {
  // Least squares fit of other = a + b * key over points; key is 'u' or 'v'.
  const other = key === 'u' ? 'v' : 'u';
  const n = points.length;
  if (n < 2) return null;
  let sk = 0, so = 0, skk = 0, sko = 0;
  for (const p of points) { sk += p[key]; so += p[other]; skk += p[key] * p[key]; sko += p[key] * p[other]; }
  const den = n * skk - sk * sk;
  if (Math.abs(den) < 1e-9) return { a: so / n, b: 0 };
  const b = (n * sko - sk * so) / den;
  return { a: (so - b * sk) / n, b };
}

function intersectUV(hLine, vLine) {
  // hLine: v = a1 + b1 u ; vLine: u = a2 + b2 v
  const den = 1 - hLine.b * vLine.b;
  if (Math.abs(den) < 1e-9) return null;
  const v = (hLine.a + hLine.b * vLine.a) / den;
  const u = vLine.a + vLine.b * v;
  return { u, v };
}

function isConvexQuad(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross3(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (Math.abs(c) < 1e-9) return false;
    const sg = c > 0 ? 1 : -1;
    if (!sign) sign = sg; else if (sg !== sign) return false;
  }
  return true;
}

/**
 * Refine a min-area rectangle into a quadrilateral that follows each edge
 * of the shape, so a keystoned (perspective) stamp gets four true corners.
 * For each side, the outermost boundary point in each of several bins along
 * the side is used, so perforation tips set the edge, not the valleys.
 */
export function refineQuad(rect, boundary) {
  const W = rect.maxU - rect.minU, H = rect.maxV - rect.minV;
  if (W < 8 || H < 8) return null;
  const pts = boundary.map(p => ({ u: p.x * rect.c + p.y * rect.s, v: -p.x * rect.s + p.y * rect.c }));
  const bandV = H * 0.12, bandU = W * 0.12;
  const bins = 12;
  const pick = (cands, along, lo, len, outward) => {
    const best = new Array(bins).fill(null);
    for (const p of cands) {
      const t = (p[along] - lo) / len;
      if (t < 0.08 || t > 0.92) continue;
      const bi = Math.min(bins - 1, Math.floor(t * bins));
      if (!best[bi] || outward(p, best[bi])) best[bi] = p;
    }
    return best.filter(Boolean);
  };
  const top = pick(pts.filter(p => p.v <= rect.minV + bandV), 'u', rect.minU, W, (a, b) => a.v < b.v);
  const bottom = pick(pts.filter(p => p.v >= rect.maxV - bandV), 'u', rect.minU, W, (a, b) => a.v > b.v);
  const left = pick(pts.filter(p => p.u <= rect.minU + bandU), 'v', rect.minV, H, (a, b) => a.u < b.u);
  const right = pick(pts.filter(p => p.u >= rect.maxU - bandU), 'v', rect.minV, H, (a, b) => a.u > b.u);
  if (top.length < 4 || bottom.length < 4 || left.length < 4 || right.length < 4) return null;
  const lt = fitLine(top, 'u'), lb = fitLine(bottom, 'u');
  const ll = fitLine(left, 'v'), lr = fitLine(right, 'v');
  const c = [intersectUV(lt, ll), intersectUV(lt, lr), intersectUV(lb, lr), intersectUV(lb, ll)];
  if (c.some(x => !x)) return null;
  const quad = c.map(p => rectFrameToImage(rect, p.u, p.v));
  if (!isConvexQuad(quad)) return null;
  return quad;
}

export function quadCentroid(q) {
  return { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
}

/** Move corners away from the centroid by a fraction of their distance. */
export function expandQuad(q, frac) {
  const c = quadCentroid(q);
  return q.map(p => ({ x: c.x + (p.x - c.x) * (1 + frac), y: c.y + (p.y - c.y) * (1 + frac) }));
}

export function clampQuad(q, w, h) {
  return q.map(p => ({ x: clamp(p.x, 0, w - 1), y: clamp(p.y, 0, h - 1) }));
}

export function scaleQuad(q, sx, sy = sx, ox = 0, oy = 0) {
  return q.map(p => ({ x: p.x * sx + ox, y: p.y * sy + oy }));
}

export function quadBounds(q) {
  const xs = q.map(p => p.x), ys = q.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Side lengths, output size, tilt and keystone figures for a quad. */
export function quadShape(q) {
  const top = dist(q[0], q[1]), right = dist(q[1], q[2]), bottom = dist(q[3], q[2]), left = dist(q[0], q[3]);
  const width = Math.max(top, bottom), height = Math.max(left, right);
  let tilt = Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x) * 180 / Math.PI;
  if (tilt > 45) tilt -= 90;
  if (tilt < -45) tilt += 90;
  const keystone = Math.max(Math.abs(top - bottom) / Math.max(top, bottom), Math.abs(left - right) / Math.max(left, right));
  return { top, right, bottom, left, width, height, tilt, keystone, aspect: width / Math.max(1, height) };
}

/* ---------------------------------------------------------------------- */
/* Detection                                                               */
/* ---------------------------------------------------------------------- */

/**
 * Find the most likely stamp (or block, or cover) inside a region.
 *
 * opts.roi       search region; its outer ring is treated as background
 * opts.ringFrac  thickness of the background ring as a fraction of the ROI
 * opts.close     closing radius in pixels (default scales with ROI size)
 */
export function detectQuad(img, opts = {}) {
  const roi = normRoi(img, opts.roi);
  const minSide = Math.min(roi.w, roi.h);
  if (minSide < 24) return { found: false, reason: 'tiny', roi };
  const bg = estimateBackground(img, roi, opts.ringFrac || 0.06);
  const { mask: raw, threshold } = foregroundMask(img, roi, bg, opts.minDist || 26);
  const r = opts.close != null ? opts.close : Math.max(1, Math.round(minSide / 110));
  // Opening drops speckle; closing joins the design to its margins and perforations.
  let m = openMask(raw, roi.w, roi.h, 1);
  m = closeMask(m, roi.w, roi.h, r);
  m = fillHoles(m, roi.w, roi.h);
  const roiArea = roi.w * roi.h;
  const { label, comps } = components(m, roi.w, roi.h, Math.max(12, roiArea * 0.004));
  if (!comps.length) return { found: false, reason: 'empty', roi, bg, threshold };
  const ccx = roi.w / 2, ccy = roi.h / 2, diag = Math.hypot(roi.w, roi.h) / 2;
  let best = null;
  for (const c of comps) {
    const frac = c.area / roiArea;
    if (frac > 0.97) continue;
    const off = Math.hypot(c.cx - ccx, c.cy - ccy) / diag;
    let score = c.area * (1 - 0.75 * off);
    if (c.touches >= 3) score *= 0.25;
    else if (c.touches === 2) score *= 0.6;
    if (!best || score > best.score) best = { c, score };
  }
  if (!best) return { found: false, reason: 'background', roi, bg, threshold };
  const comp = best.c;
  const boundary = boundaryPoints(label, roi.w, roi.h, comp.id);
  const hull = convexHull(boundary);
  const rect = minAreaRect(hull);
  if (!rect) return { found: false, reason: 'shape', roi, bg, threshold };
  const rectQuad = orderQuad([
    rectFrameToImage(rect, rect.minU, rect.minV), rectFrameToImage(rect, rect.maxU, rect.minV),
    rectFrameToImage(rect, rect.maxU, rect.maxV), rectFrameToImage(rect, rect.minU, rect.maxV)
  ]);
  let quad = rectQuad;
  let refined = false;
  const rq = refineQuad(rect, boundary);
  if (rq) {
    const oq = orderQuad(rq);
    const aR = polygonArea(rectQuad), aQ = polygonArea(oq);
    const diagLen = Math.hypot(rect.maxU - rect.minU, rect.maxV - rect.minV);
    const near = oq.every((p, i) => dist(p, rectQuad[i]) < diagLen * 0.12);
    if (aQ > aR * 0.8 && aQ < aR * 1.08 && near) { quad = oq; refined = true; }
  }
  const qa = polygonArea(quad);
  const fill = comp.area / Math.max(1, qa);
  const global = quad.map(p => ({ x: p.x + roi.x, y: p.y + roi.y }));
  const margin = Math.max(1.5, minSide * 0.012);
  const touchesEdge = quad.some(p => p.x < margin || p.y < margin || p.x > roi.w - 1 - margin || p.y > roi.h - 1 - margin);
  return {
    found: true,
    quad: global,
    rectQuad: rectQuad.map(p => ({ x: p.x + roi.x, y: p.y + roi.y })),
    refined,
    areaFrac: qa / roiArea,
    fill,
    touchesEdge,
    roi,
    bg,
    threshold,
    shape: quadShape(global)
  };
}

/* ---------------------------------------------------------------------- */
/* Image quality                                                           */
/* ---------------------------------------------------------------------- */

/**
 * No-reference blur estimate (Crete-Roffet et al., 2007, "The blur effect").
 * Compares the image with a re-blurred copy. 0 is sharp, 1 is very blurry.
 * Measure at native pixel scale: downscaling makes any photo look sharp.
 */
export function blurScore(L, w, h, region) {
  const x0 = clamp(Math.floor(region ? region.x : 0), 0, w - 1);
  const y0 = clamp(Math.floor(region ? region.y : 0), 0, h - 1);
  const x1 = clamp(Math.ceil(region ? region.x + region.w : w), x0 + 1, w);
  const y1 = clamp(Math.ceil(region ? region.y + region.h : h), y0 + 1, h);
  const rw = x1 - x0, rh = y1 - y0;
  if (rw < 20 || rh < 20) return null;
  const k = 4;
  let sFh = 0, sVh = 0, sFv = 0, sVv = 0;
  const row = new Float32Array(rw);
  for (let y = y0; y < y1; y++) {
    const base = y * w;
    let acc = 0, n = 0;
    for (let x = x0; x < Math.min(x1, x0 + k + 1); x++) { acc += L[base + x]; n++; }
    for (let x = x0; x < x1; x++) {
      row[x - x0] = acc / n;
      const add = x + k + 1, rem = x - k;
      if (add < x1) { acc += L[base + add]; n++; }
      if (rem >= x0) { acc -= L[base + rem]; n--; }
    }
    for (let x = x0 + 1; x < x1; x++) {
      const dF = Math.abs(L[base + x] - L[base + x - 1]);
      const dB = Math.abs(row[x - x0] - row[x - x0 - 1]);
      sFh += dF;
      if (dF > dB) sVh += dF - dB;
    }
  }
  const col = new Float32Array(rh);
  for (let x = x0; x < x1; x++) {
    let acc = 0, n = 0;
    for (let y = y0; y < Math.min(y1, y0 + k + 1); y++) { acc += L[y * w + x]; n++; }
    for (let y = y0; y < y1; y++) {
      col[y - y0] = acc / n;
      const add = y + k + 1, rem = y - k;
      if (add < y1) { acc += L[add * w + x]; n++; }
      if (rem >= y0) { acc -= L[rem * w + x]; n--; }
    }
    for (let y = y0 + 1; y < y1; y++) {
      const dF = Math.abs(L[y * w + x] - L[(y - 1) * w + x]);
      const dB = Math.abs(col[y - y0] - col[y - y0 - 1]);
      sFv += dF;
      if (dF > dB) sVv += dF - dB;
    }
  }
  if (sFh < 1e-6 || sFv < 1e-6) return 1;
  const bh = (sFh - sVh) / sFh, bv = (sFv - sVv) / sFv;
  return Math.max(bh, bv);
}

/** Brightness, clipped highlights (glare) and crushed shadows inside a region. */
export function exposureStats(img, region) {
  const { width: W, height: H, data: d } = img;
  const x0 = clamp(Math.floor(region ? region.x : 0), 0, W - 1);
  const y0 = clamp(Math.floor(region ? region.y : 0), 0, H - 1);
  const x1 = clamp(Math.ceil(region ? region.x + region.w : W), x0 + 1, W);
  const y1 = clamp(Math.ceil(region ? region.y + region.h : H), y0 + 1, H);
  let n = 0, sum = 0, clip = 0, dark = 0;
  const step = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / 90000)));
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * W + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += l; n++;
      if (r >= 250 && g >= 250 && b >= 250) clip++;
      if (l < 18) dark++;
    }
  }
  return { mean: n ? sum / n : 0, clip: n ? clip / n : 0, dark: n ? dark / n : 0 };
}

/** Mean absolute luma difference between two same-size luma arrays (0 to 255). */
export function motionScore(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let s = 0;
  const step = Math.max(1, Math.floor(a.length / 20000));
  let n = 0;
  for (let i = 0; i < a.length; i += step) { s += Math.abs(a[i] - b[i]); n++; }
  return s / n;
}

/* ---------------------------------------------------------------------- */
/* Perspective correction                                                  */
/* ---------------------------------------------------------------------- */

/** Solve the 3x3 homography that maps src[i] -> dst[i] for four point pairs. */
export function homography(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X]);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y]);
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix.
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      if (!f) continue;
      for (let c = col; c < 9; c++) A[r][c] -= f * A[col][c];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/**
 * Warp the quad in img to an upright outW x outH image (bilinear sampling).
 * Pass a white or dark fill colour for pixels that fall outside the source.
 */
export function warpQuad(img, quad, outW, outH, fill = [255, 255, 255]) {
  outW = Math.max(1, Math.round(outW));
  outH = Math.max(1, Math.round(outH));
  const dstRect = [{ x: 0, y: 0 }, { x: outW - 1, y: 0 }, { x: outW - 1, y: outH - 1 }, { x: 0, y: outH - 1 }];
  const H = homography(dstRect, quad);
  if (!H) return null;
  const { width: W, height: Hh, data: s } = img;
  const out = makeImage(outW, outH);
  const o = out.data;
  for (let v = 0; v < outH; v++) {
    // Incremental evaluation along the row.
    let nx = H[1] * v + H[2], ny = H[4] * v + H[5], nw = H[7] * v + H[8];
    for (let u = 0; u < outW; u++, nx += H[0], ny += H[3], nw += H[6]) {
      const x = nx / nw, y = ny / nw;
      const j = (v * outW + u) * 4;
      if (x < 0 || y < 0 || x > W - 1 || y > Hh - 1) {
        o[j] = fill[0]; o[j + 1] = fill[1]; o[j + 2] = fill[2]; o[j + 3] = 255;
        continue;
      }
      const xi = x | 0, yi = y | 0;
      const fx = x - xi, fy = y - yi;
      const x2 = xi + 1 < W ? xi + 1 : xi, y2 = yi + 1 < Hh ? yi + 1 : yi;
      const i00 = (yi * W + xi) * 4, i10 = (yi * W + x2) * 4, i01 = (y2 * W + xi) * 4, i11 = (y2 * W + x2) * 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      o[j] = s[i00] * w00 + s[i10] * w10 + s[i01] * w01 + s[i11] * w11;
      o[j + 1] = s[i00 + 1] * w00 + s[i10 + 1] * w10 + s[i01 + 1] * w01 + s[i11 + 1] * w11;
      o[j + 2] = s[i00 + 2] * w00 + s[i10 + 2] * w10 + s[i01 + 2] * w01 + s[i11 + 2] * w11;
      o[j + 3] = 255;
    }
  }
  return out;
}

/** Output size for a quad: true proportions, long side capped at maxSide. */
export function outputSize(quad, maxSide = 2400) {
  const s = quadShape(quad);
  const k = Math.min(1, maxSide / Math.max(s.width, s.height));
  return { w: Math.max(1, Math.round(s.width * k)), h: Math.max(1, Math.round(s.height * k)), scale: k, native: Math.max(s.width, s.height) };
}

/* ---------------------------------------------------------------------- */
/* Quality checks                                                          */
/* ---------------------------------------------------------------------- */

export const THRESHOLDS = {
  blurGood: 0.42,      // at or below: sharp
  blurSoft: 0.52,      // above: blurry
  darkMean: 62,
  veryDarkMean: 40,
  brightMean: 222,
  glareWarn: 0.015,    // share of clipped pixels; white paper alone stays under this
  glareFail: 0.04,
  detailGood: 900,     // long side of the stamp in pixels
  detailMin: 520,
  keystoneWarn: 0.16
};

/**
 * Turn measurements into a checklist. Each item: { id, label, state, fix }.
 * state is 'pass', 'warn' or 'fail'.
 */
export function assessQuality(m, t = THRESHOLDS) {
  const items = [];
  if (!m.found) {
    items.push({ id: 'frame', label: 'Edges found', state: 'fail', fix: 'The edges did not stand out. Use a plain dark background, or adjust the corners by hand.' });
  } else if (m.touchesEdge) {
    items.push({ id: 'frame', label: 'Whole item in view', state: 'fail', fix: 'Part of it is cut off. Move back a little so all four edges show.' });
  } else {
    items.push({ id: 'frame', label: 'Edges found', state: 'pass', fix: m.straightened ? 'Straightened and cropped automatically.' : '' });
  }
  if (m.blur == null) {
    items.push({ id: 'focus', label: 'Focus', state: 'warn', fix: 'Could not measure focus. Check the lettering is crisp.' });
  } else if (m.blur <= t.blurGood) {
    items.push({ id: 'focus', label: 'Sharp focus', state: 'pass', fix: '' });
  } else if (m.blur <= t.blurSoft) {
    items.push({ id: 'focus', label: 'Focus', state: 'warn', fix: 'Slightly soft. Tap the stamp on screen to focus, or move back a little.' });
  } else {
    items.push({ id: 'focus', label: 'Focus', state: 'fail', fix: 'Blurry. Hold steady, move back a little, and let the camera focus.' });
  }
  if (m.mean < t.veryDarkMean) items.push({ id: 'light', label: 'Light', state: 'fail', fix: 'Too dark. Move near a window or turn on a lamp.' });
  else if (m.mean < t.darkMean) items.push({ id: 'light', label: 'Light', state: 'warn', fix: 'A little dark. More even light will show the colour better.' });
  else if (m.mean > t.brightMean) items.push({ id: 'light', label: 'Light', state: 'warn', fix: 'Very bright. Fine detail may wash out.' });
  else items.push({ id: 'light', label: 'Even light', state: 'pass', fix: '' });
  if (m.clip >= t.glareFail) items.push({ id: 'glare', label: 'Glare', state: 'fail', fix: 'Glare is hiding detail. Tilt the phone slightly or move the light to one side.' });
  else if (m.clip >= t.glareWarn) items.push({ id: 'glare', label: 'Glare', state: 'warn', fix: 'Some glare. Tilt the phone slightly to remove the bright spot.' });
  else items.push({ id: 'glare', label: 'No glare', state: 'pass', fix: '' });
  if (m.found && m.native) {
    if (m.native >= t.detailGood) items.push({ id: 'detail', label: 'Detail', state: 'pass', fix: '' });
    else if (m.native >= t.detailMin) items.push({ id: 'detail', label: 'Detail', state: 'warn', fix: 'Move closer, or use 2x zoom, so perforations and fine lines show.' });
    else items.push({ id: 'detail', label: 'Detail', state: 'fail', fix: 'Too small in the photo. Move closer, or use 2x zoom.' });
  }
  if (m.found && m.keystone > t.keystoneWarn) {
    items.push({ id: 'angle', label: 'Camera angle', state: 'warn', fix: 'Hold the phone flat above the stamp. Angled shots lose sharpness at one end.' });
  }
  return items;
}

export function overallState(items) {
  if (items.some(i => i.state === 'fail')) return 'fail';
  if (items.some(i => i.state === 'warn')) return 'warn';
  return 'pass';
}

/* ---------------------------------------------------------------------- */
/* Live guidance                                                           */
/* ---------------------------------------------------------------------- */

/**
 * Compare a detection with the on-screen guide and produce one instruction.
 * guide and det.quad are in the same coordinate space.
 * Returns { ready, code, message, alignScore } where alignScore runs 0 to 1.
 */
export function guidance(det, guide, frame) {
  const gx = guide.x + guide.w / 2, gy = guide.y + guide.h / 2;
  const gLong = Math.max(guide.w, guide.h);
  if (!det || !det.found) return { ready: false, code: 'find', message: 'Place the stamp inside the frame', alignScore: 0 };
  const b = quadBounds(det.quad);
  const c = quadCentroid(det.quad);
  const s = det.shape;
  const long = Math.max(s.width, s.height);
  const slack = gLong * 0.07;
  const outside = det.quad.some(p => p.x < guide.x - slack || p.y < guide.y - slack || p.x > guide.x + guide.w + slack || p.y > guide.y + guide.h + slack);
  const off = Math.hypot(c.x - gx, c.y - gy) / gLong;
  const fillRatio = long / gLong;
  let align = 1;
  align -= clamp((0.7 - fillRatio) / 0.5, 0, 1) * 0.45;
  align -= clamp(off / 0.25, 0, 1) * 0.35;
  align -= clamp((Math.abs(s.tilt) - 2) / 12, 0, 1) * 0.2;
  align = clamp(align, 0, 1);
  if (det.touchesEdge || outside || b.w > guide.w * 1.12 || b.h > guide.h * 1.12) return { ready: false, code: 'back', message: 'Move back a little', alignScore: align * 0.7 };
  if (fillRatio < 0.5) return { ready: false, code: 'closer', message: 'Move closer', alignScore: align };
  if (off > 0.12) return { ready: false, code: 'center', message: 'Center the stamp in the frame', alignScore: align };
  if (Math.abs(s.tilt) > 7) return { ready: false, code: 'straighten', message: 'Straighten the stamp', alignScore: align };
  if (frame) {
    if (frame.mean != null && frame.mean < THRESHOLDS.veryDarkMean) return { ready: false, code: 'dark', message: 'More light, please', alignScore: align };
    if (frame.clip != null && frame.clip >= THRESHOLDS.glareFail) return { ready: false, code: 'glare', message: 'Glare. Tilt the phone a little', alignScore: align };
    if (frame.motion != null && frame.motion > 6) return { ready: false, code: 'steady', message: 'Hold steady', alignScore: align };
    if (frame.blur != null && frame.blur > THRESHOLDS.blurSoft) return { ready: false, code: 'focus', message: 'Focusing', alignScore: align };
  }
  return { ready: true, code: 'ready', message: 'Hold still', alignScore: align };
}

/**
 * Score one live frame from 0 to 1 so auto-capture can keep the best of the
 * last few frames instead of the one at the moment the hold completes.
 * Sharpness carries most of the weight, then steadiness, then how cleanly
 * the edges were found, then light and glare.
 * m: { blur, motion, fill, align, mean, clip }; missing values count as neutral.
 */
export function frameScore(m, t = THRESHOLDS) {
  const sharp = m.blur == null ? 0.5 : clamp((0.62 - m.blur) / 0.37, 0, 1);
  const steady = m.motion == null ? 0.5 : clamp(1 - m.motion / 8, 0, 1);
  const fit = m.fill == null ? 0.5 : clamp((m.fill - 0.8) / 0.18, 0, 1);
  const edges = 0.5 * fit + 0.5 * (m.align == null ? 0.5 : clamp(m.align, 0, 1));
  const light = m.mean == null ? 0.5 : 1 - clamp(Math.abs(m.mean - 135) / 95, 0, 1);
  const glare = m.clip == null ? 0.5 : 1 - clamp(m.clip / t.glareFail, 0, 1);
  return 0.45 * sharp + 0.2 * steady + 0.15 * edges + 0.1 * light + 0.1 * glare;
}
