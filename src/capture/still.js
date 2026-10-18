// Photo pipeline: decode, find the item, straighten it, and check quality.
// Works on any photo: from the live camera, the phone's camera app, or a file.

import * as V from './vision.js';

export const SUBJECTS = {
  single: { id: 'single', label: 'Single stamp', short: 'Single', aspect: 1, guide: 'square' },
  block: { id: 'block', label: 'Block or strip', short: 'Block', aspect: 4 / 3, guide: 'rect' },
  cover: { id: 'cover', label: 'Cover or card', short: 'Cover', aspect: 16 / 9, guide: 'wide' },
  // A whole album or stockbook page: many stamps, found and sorted together.
  page: { id: 'page', label: 'Album page', short: 'Page', aspect: 4 / 3, guide: 'rect', multi: true }
};

/** Pixel size of an image, bitmap, canvas or video. */
export function dims(src) {
  return {
    w: src.naturalWidth || src.videoWidth || src.width,
    h: src.naturalHeight || src.videoHeight || src.height
  };
}

export function clampRect(r, w, h) {
  const x = V.clamp(Math.floor(r.x), 0, w - 1);
  const y = V.clamp(Math.floor(r.y), 0, h - 1);
  const x1 = V.clamp(Math.ceil(r.x + r.w), x + 1, w);
  const y1 = V.clamp(Math.ceil(r.y + r.h), y + 1, h);
  return { x, y, w: x1 - x, h: y1 - y };
}

/** Decode a File or Blob, honouring the EXIF orientation from the camera. */
export async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (_) { /* fall back */ }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch (_) {
    URL.revokeObjectURL(url);
    const e = new Error('decode');
    e.code = 'decode';
    throw e;
  }
  return img;
}

export function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Draw a region of a source into a canvas whose long side is at most maxSide. */
export function drawScaled(src, maxSide, region) {
  const { w, h } = dims(src);
  const r = region || { x: 0, y: 0, w, h };
  const k = Math.min(1, maxSide / Math.max(r.w, r.h));
  const canvas = canvasOf(r.w * k, r.h * k);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx, scale: canvas.width / r.w, region: r };
}

const pixels = d => d.ctx.getImageData(0, 0, d.canvas.width, d.canvas.height);

/**
 * Find the stamp, block or cover in a source. Two passes: a coarse search on
 * the whole frame (or ROI), then a finer one around the first answer.
 * Returns { found, quad (source pixels), touchesEdge, det }.
 */
export function locate(src, opts = {}) {
  const { w, h } = dims(src);
  const roi = opts.roi ? clampRect(opts.roi, w, h) : { x: 0, y: 0, w, h };
  const a = drawScaled(src, opts.coarse || 640, roi);
  const det = V.detectQuad(pixels(a));
  if (!det.found) return { found: false, det };
  let quad = det.quad.map(p => ({ x: roi.x + p.x / a.scale, y: roi.y + p.y / a.scale }));
  const b = V.quadBounds(quad);
  const pad = Math.max(b.w, b.h) * 0.12;
  const r2 = clampRect({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad }, w, h);
  const c2 = drawScaled(src, opts.fine || 1100, r2);
  const det2 = V.detectQuad(pixels(c2), { ringFrac: 0.05 });
  if (det2.found && !det2.touchesEdge && det2.areaFrac > 0.3) {
    quad = det2.quad.map(p => ({ x: r2.x + p.x / c2.scale, y: r2.y + p.y / c2.scale }));
  }
  return { found: true, quad, touchesEdge: det.touchesEdge, det };
}

/** Warp the quad into an upright canvas at up to maxSide pixels on the long side. */
export function straighten(src, quad, opts = {}) {
  const { w, h } = dims(src);
  const q = V.clampQuad(V.expandQuad(quad, opts.margin != null ? opts.margin : 0.025), w, h);
  const b = V.quadBounds(q);
  const region = clampRect({ x: b.x - 1, y: b.y - 1, w: b.w + 3, h: b.h + 3 }, w, h);
  const rd = drawScaled(src, opts.readCap || 3600, region);
  const local = q.map(p => ({ x: (p.x - region.x) * rd.scale, y: (p.y - region.y) * rd.scale }));
  const size = V.outputSize(local, opts.maxSide || 2400);
  const out = V.warpQuad(pixels(rd), local, size.w, size.h, [255, 255, 255]);
  const canvas = canvasOf(out.width, out.height);
  canvas.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
  return { canvas, native: size.native / rd.scale };
}

/**
 * Focus probe: a centre patch of the item, scaled so the item's long side is
 * about 1,000 pixels. That is close to the detail the AI receives, so phones
 * with very large sensors are judged fairly.
 */
export function focusProbe(src, quad) {
  const { w, h } = dims(src);
  const q = quad || [{ x: 0, y: 0 }, { x: w - 1, y: 0 }, { x: w - 1, y: h - 1 }, { x: 0, y: h - 1 }];
  const s = V.quadShape(q);
  const c = V.quadCentroid(q);
  const long = Math.max(s.width, s.height);
  const k = Math.min(1, 1000 / Math.max(1, long));
  const side = Math.min(s.width, s.height) * 0.62;
  const r = clampRect({ x: c.x - side / 2, y: c.y - side / 2, w: side, h: side }, w, h);
  const d = drawScaled(src, Math.max(r.w, r.h) * k, r);
  const id = pixels(d);
  const L = V.luminance(id);
  // Five patches: the centre and four around it. A glare spot or a plain
  // area can look "soft" on its own, so the sharpest patch decides.
  const pw = id.width / 2, ph = id.height / 2;
  const patches = [
    { x: pw / 2, y: ph / 2, w: pw, h: ph },
    { x: 0, y: 0, w: pw, h: ph }, { x: pw, y: 0, w: pw, h: ph },
    { x: 0, y: ph, w: pw, h: ph }, { x: pw, y: ph, w: pw, h: ph }
  ];
  const scores = patches.map(p => V.blurScore(L, id.width, id.height, p)).filter(v => v != null);
  return scores.length ? Math.min(...scores) : V.blurScore(L, id.width, id.height);
}

export function exposureOf(canvas) {
  const d = drawScaled(canvas, 480);
  const id = pixels(d);
  const inset = 0.06;
  return V.exposureStats(id, { x: id.width * inset, y: id.height * inset, w: id.width * (1 - 2 * inset), h: id.height * (1 - 2 * inset) });
}

export function toBlob(canvas, type = 'image/jpeg', q = 0.9) {
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode'))), type, q));
}

export function rotateCanvas(canvas, deg) {
  const turn = deg % 180 !== 0;
  const c = canvasOf(turn ? canvas.height : canvas.width, turn ? canvas.width : canvas.height);
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(deg * Math.PI / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return c;
}

/**
 * Build a capture record from a source and an optional quad.
 * info: { subject, auto, touchesEdge, origin: 'live' | 'camera' | 'file' }
 */
export async function buildCapture(src, quad, info = {}) {
  const { w, h } = dims(src);
  let canvas, native;
  if (quad) {
    const st = straighten(src, quad);
    canvas = st.canvas;
    native = st.native;
  } else {
    canvas = drawScaled(src, 2400).canvas;
    native = Math.max(w, h);
  }
  const blur = focusProbe(src, quad);
  const ex = exposureOf(canvas);
  const metrics = {
    found: !!quad,
    touchesEdge: !!(quad && info.touchesEdge),
    straightened: !!quad,
    blur,
    mean: ex.mean,
    clip: ex.clip,
    native,
    keystone: quad ? V.quadShape(quad).keystone : 0
  };
  if (!quad && info.manualFull) metrics.found = true;
  const checks = V.assessQuality(metrics);
  const cap = {
    src, srcW: w, srcH: h, quad: quad || null,
    subject: info.subject || 'single', auto: !!info.auto, origin: info.origin || 'file',
    canvas, metrics, checks, state: V.overallState(checks), rot: 0
  };
  await encode(cap);
  return cap;
}

async function encode(cap) {
  if (cap.url) URL.revokeObjectURL(cap.url);
  cap.full = await toBlob(cap.canvas, 'image/jpeg', 0.9);
  cap.thumb = await toBlob(drawScaled(cap.canvas, 480).canvas, 'image/jpeg', 0.82);
  cap.url = URL.createObjectURL(cap.full);
  cap.width = cap.canvas.width;
  cap.height = cap.canvas.height;
}

export async function rotateCapture(cap) {
  cap.canvas = rotateCanvas(cap.canvas, 90);
  cap.rot = (cap.rot + 90) % 360;
  await encode(cap);
  return cap;
}

/** Full pipeline for a file from the camera app or the photo library. */
export async function processPhoto(blob, subject, origin) {
  const src = await decodeImage(blob);
  const loc = locate(src);
  return buildCapture(src, loc.found ? loc.quad : null, { subject, auto: true, touchesEdge: loc.touchesEdge, origin: origin || 'file' });
}

export function releaseCapture(cap) {
  if (!cap) return;
  if (cap.url) URL.revokeObjectURL(cap.url);
  if (cap.src && typeof cap.src.close === 'function') { try { cap.src.close(); } catch (_) { /* already closed */ } }
}

/** Shrink a JPEG until it fits a byte limit (for AI upload limits). */
export async function fitBytes(canvas, maxBytes, startSide = 2400) {
  let side = Math.min(startSide, Math.max(canvas.width, canvas.height));
  let q = 0.9;
  for (let i = 0; i < 8; i++) {
    const c = side < Math.max(canvas.width, canvas.height) ? drawScaled(canvas, side).canvas : canvas;
    const b = await toBlob(c, 'image/jpeg', q);
    if (b.size <= maxBytes) return b;
    if (q > 0.72) q -= 0.08; else side = Math.round(side * 0.8);
  }
  return toBlob(drawScaled(canvas, 1200).canvas, 'image/jpeg', 0.7);
}
