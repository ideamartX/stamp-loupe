// Stamp Loupe duplicate check.
//
// Each straightened stamp photo gets a short signature:
//   p  sign bits of the 63 lowest DCT coefficients of its brightness (16 hex)
//   m  which of those coefficients are strong enough to trust (16 hex)
//   c  ink colour on a 3 x 3 grid, ink lightness and two flags (16 characters)
// Two signatures compare in well under a microsecond, so a new photo can be
// checked against thousands of saved stamps before an identification is paid
// for. A signature is 76 characters as JSON, or 52 as the string from
// encodeSignature.
//
// Pure functions over RGBA bytes, like vision.js, except signatureFromCanvas,
// which needs a browser canvas.
//
// How it holds up, measured in tests/phash.test.mjs:
// - Crop shifts and zoom. The paper is found inside the crop (it differs from
//   the background ring) and only the paper is hashed. Without that step a 3%
//   shift moved a third of the bits.
// - Symmetric designs. Frames and centred portraits leave many DCT
//   coefficients near zero, and their signs are noise. The mask marks the
//   strong ones and only those are compared.
// - Exposure, white balance, blur and noise. Signs of DCT coefficients ignore
//   exposure; the colour grid is white-balanced on the paper first.
// - Quarter turns. With a zero threshold (the classic pHash uses the median)
//   a quarter turn of the photo is an exact reordering and flipping of bits,
//   so one stored signature covers all four orientations. Landscape stamps
//   are turned upright before hashing, so for clearly oblong stamps only 0 and
//   180 degrees are tried; near-square stamps try all four.
// Larger hashes (256 bits from a 16 x 16 block) were tried and separated
// designs worse here: the extra high frequencies move with every small shift.

/* ---------------------------------------------------------------------- */
/* Constants                                                              */
/* ---------------------------------------------------------------------- */

const G = 32;          // luma grid the DCT runs on
const K = 8;           // low-frequency block kept from the DCT (K x K)
const CN = 3;          // colour grid (CN x CN)
const INSET = 0.05;    // per side of the found paper: skips the perforation teeth
const TRIM = 0.06;     // per side of the crop when no paper edge is found
const C_INSET = 0.1;   // per side: the colour grid covers the central 80%
const STRONG = 0.5;    // a coefficient is trusted above this share of the RMS
const WHITE = 235;     // white-patch target for the brightest paper
const SQUARE = 1.15;   // sides within 15% of each other count as square

/**
 * Decision thresholds, calibrated in tests/phash.test.mjs. pDist is the share
 * of trusted DCT signs that disagree (0 to 1). colourDist is a hue-weighted
 * CIELAB difference of the ink, per cell, in Lab units.
 */
export const MATCH = Object.freeze({
  pSame: 0.25,
  pSimilar: 0.32,
  cSame: 12
});

const LEVEL_RANK = { same: 0, similar: 1, different: 2 };

/* ---------------------------------------------------------------------- */
/* Small helpers                                                           */
/* ---------------------------------------------------------------------- */

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Number of set bits in a 32-bit integer. */
function popcount32(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Hamming distance between two hex strings of the same length. */
export function hamming(hexA, hexB) {
  if (typeof hexA !== 'string' || typeof hexB !== 'string' || hexA.length !== hexB.length) return NaN;
  let n = 0;
  for (let i = 0; i < hexA.length; i += 8) {
    const a = parseInt(hexA.slice(i, i + 8), 16), b = parseInt(hexB.slice(i, i + 8), 16);
    if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
    n += popcount32((a ^ b) >>> 0);
  }
  return n;
}

/** 64 bits (bit i is worth 2^i) as [high word, low word]. */
function bitsToWords(bits) {
  let hi = 0, lo = 0;
  for (let i = 0; i < 32; i++) {
    lo |= bits[i] << i;
    hi |= bits[i + 32] << i;
  }
  return [hi >>> 0, lo >>> 0];
}

function wordsToHex([hi, lo]) {
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

function wordsToBits(hi, lo) {
  const bits = new Uint8Array(64);
  for (let i = 0; i < 32; i++) {
    bits[i] = (lo >>> i) & 1;
    bits[i + 32] = (hi >>> i) & 1;
  }
  return bits;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = (() => {
  const t = new Int8Array(128).fill(-1);
  for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

/* ---------------------------------------------------------------------- */
/* Rotation of grids and hashes                                            */
/* ---------------------------------------------------------------------- */

// A quarter turn clockwise of an n x n grid: new(x, y) = old(y, n - 1 - x).
// The same rule turns an image, so hashing a turned photo and turning a hash
// agree.
function oldIndexAfterTurn(n, x, y) {
  return (n - 1 - x) * n + y;
}

function rotateGrid(g, n) {
  const out = new Float64Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[y * n + x] = g[oldIndexAfterTurn(n, x, y)];
  return out;
}

// cos(pi (2x + 1) u / 2G) for the K lowest frequencies.
const COS = Array.from({ length: K }, (_, u) => Float64Array.from({ length: G }, (_, x) => Math.cos(Math.PI * (2 * x + 1) * u / (2 * G))));

/** The K x K lowest DCT-II coefficients of a G x G grid, index v * K + u. */
function lowDct(grid) {
  const tmp = new Float64Array(G * K);
  for (let y = 0; y < G; y++) {
    const row = y * G;
    for (let u = 0; u < K; u++) {
      const cu = COS[u];
      let s = 0;
      for (let x = 0; x < G; x++) s += grid[row + x] * cu[x];
      tmp[y * K + u] = s;
    }
  }
  const out = new Float64Array(K * K);
  for (let v = 0; v < K; v++) {
    const cv = COS[v];
    for (let u = 0; u < K; u++) {
      let s = 0;
      for (let y = 0; y < G; y++) s += tmp[y * K + u] * cv[y];
      out[v * K + u] = s;
    }
  }
  return out;
}

// A quarter turn of a hash is a table: new bit i = old bit src[i] XOR flip[i].
// The DCT table is derived once from the rotation rule itself: each basis
// pattern is turned and its new coefficient (and sign) looked up.
function deriveDctTurn() {
  const src = new Int16Array(K * K), flip = new Uint8Array(K * K);
  for (let v = 0; v < K; v++) {
    for (let u = 0; u < K; u++) {
      const basis = new Float64Array(G * G);
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) basis[y * G + x] = COS[u][x] * COS[v][y];
      const c = lowDct(rotateGrid(basis, G));
      let best = 0, at = 0;
      for (let i = 0; i < K * K; i++) if (Math.abs(c[i]) > Math.abs(best)) { best = c[i]; at = i; }
      src[at] = v * K + u;
      flip[at] = best < 0 ? 1 : 0;
    }
  }
  return { src, flip };
}

function composeTurn(t1, times) {
  let src = Int16Array.from(t1.src.keys()), flip = new Uint8Array(t1.src.length);
  for (let k = 0; k < times; k++) {
    const s2 = new Int16Array(src.length), f2 = new Uint8Array(src.length);
    for (let i = 0; i < src.length; i++) { s2[i] = src[t1.src[i]]; f2[i] = flip[t1.src[i]] ^ t1.flip[i]; }
    src = s2; flip = f2;
  }
  return { src, flip };
}

const DCT_TURN = deriveDctTurn();
const P_TURNS = [0, 1, 2, 3].map(k => composeTurn(DCT_TURN, k));
const CELL_TURN = (() => {
  const src = new Int16Array(CN * CN);
  for (let y = 0; y < CN; y++) for (let x = 0; x < CN; x++) src[y * CN + x] = oldIndexAfterTurn(CN, x, y);
  return { src, flip: new Uint8Array(CN * CN) };
})();
const C_TURNS = [0, 1, 2, 3].map(k => composeTurn(CELL_TURN, k).src);

function turnBits(bits, table, withFlip) {
  const out = new Uint8Array(64);
  for (let i = 0; i < 64; i++) out[i] = bits[table.src[i]] ^ (withFlip ? table.flip[i] : 0);
  return out;
}

/* ---------------------------------------------------------------------- */
/* Finding the paper inside the crop                                       */
/* ---------------------------------------------------------------------- */

function histMedian(hist, n) {
  let run = 0;
  for (let v = 0; v < 256; v++) { run += hist[v]; if (run * 2 >= n) return v; }
  return 255;
}

/**
 * The stamp's own rectangle inside a crop that has a margin of background
 * round it: the rows and columns where most pixels differ from the colour of
 * the outer ring. Returns null when the paper and background are too alike to
 * tell apart (a white stamp on white card), and the caller trims instead.
 */
function paperBox(data, w, h) {
  const t = Math.max(1, Math.round(Math.min(w, h) * 0.03));
  const hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256);
  let n = 0;
  for (let y = 0; y < h; y++) {
    const band = y < t || y >= h - t;
    for (let x = 0; x < w; x++) {
      if (!band && x >= t && x < w - t) { x = w - t - 1; continue; }
      const i = (y * w + x) * 4;
      hr[data[i]]++; hg[data[i + 1]]++; hb[data[i + 2]]++; n++;
    }
  }
  const r = histMedian(hr, n), g = histMedian(hg, n), b = histMedian(hb, n);
  const dist = new Float32Array(n);
  let k = 0;
  for (let y = 0; y < h; y++) {
    const band = y < t || y >= h - t;
    for (let x = 0; x < w; x++) {
      if (!band && x >= t && x < w - t) { x = w - t - 1; continue; }
      const i = (y * w + x) * 4;
      dist[k++] = Math.hypot(data[i] - r, data[i + 1] - g, data[i + 2] - b);
    }
  }
  dist.sort();
  const spread = dist[k >> 1] || 0;
  const T = clamp(spread * 3 + 12, 30, 90), T2 = T * T;
  const row = new Float64Array(h), col = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    let i = y * w * 4;
    for (let x = 0; x < w; x++, i += 4) {
      const dr = data[i] - r, dg = data[i + 1] - g, db = data[i + 2] - b;
      if (dr * dr + dg * dg + db * db > T2) { row[y]++; col[x]++; }
    }
  }
  for (let y = 0; y < h; y++) row[y] /= w;
  for (let x = 0; x < w; x++) col[x] /= h;
  // Each edge sits where more than 35% of a row (or column) differs from the
  // background, placed between pixels by interpolation so a one-pixel wobble
  // in a resampled crop does not move the hashed region. On light card the
  // paper itself may not differ; the ink frame then sets the edges, which
  // still moves with the stamp.
  const edges = prof => {
    const thr = 0.35;
    let a = 0;
    while (a < prof.length && prof[a] < thr) a++;
    let z = prof.length - 1;
    while (z > a && prof[z] < thr) z--;
    if (a >= prof.length) return null;
    const lo = a > 0 ? a - 1 + (thr - prof[a - 1]) / (prof[a] - prof[a - 1]) + 0.5 : 0;
    const hi = z < prof.length - 1 ? z + (prof[z] - thr) / (prof[z] - prof[z + 1]) + 0.5 : prof.length;
    return [lo, hi];
  };
  const ey = edges(row), ex = edges(col);
  if (!ey || !ex) return null;
  const bw = ex[1] - ex[0], bh = ey[1] - ey[0];
  if (bw < w * 0.6 || bh < h * 0.6) return null;
  return { x: ex[0], y: ey[0], w: bw, h: bh };
}

/* ---------------------------------------------------------------------- */
/* Colour                                                                  */
/* ---------------------------------------------------------------------- */

const LINEAR = Float64Array.from({ length: 256 }, (_, c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
});

function labFromLinear(r, g, b) {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// a* and b* in 16 steps of 8, centred on zero: -60, -52, ... -4, 4, ... 60.
const qAB = v => clamp(Math.round((v + 60) / 8), 0, 15);
const dqAB = q => q * 8 - 60;

// The colour code packs 96 bits as 16 base64url characters:
//   bit 0      square: the sides are within 15% of each other
//   bit 1      turned: a landscape crop was turned upright before hashing
//   bits 2-5   ink lightness, 0 to 100 in 16 steps
//   then per cell (9 cells, row by row): a* 4 bits, b* 4 bits, ink cover 2 bits
function packColour(flags, inkL, cells) {
  const bits = new Uint8Array(96);
  let at = 0;
  const put = (v, n) => { for (let i = 0; i < n; i++) bits[at++] = (v >> i) & 1; };
  put(flags, 2);
  put(clamp(Math.round(inkL * 15 / 100), 0, 15), 4);
  for (const c of cells) { put(qAB(c[0]), 4); put(qAB(c[1]), 4); put(clamp(Math.round(c[2] * 3), 0, 3), 2); }
  let s = '';
  for (let i = 0; i < 96; i += 6) {
    let v = 0;
    for (let j = 0; j < 6; j++) v |= bits[i + j] << j;
    s += B64[v];
  }
  return s;
}

function unpackColour(code) {
  if (typeof code !== 'string' || code.length !== 16) return null;
  const bits = new Uint8Array(96);
  for (let i = 0; i < 16; i++) {
    const ch = code.charCodeAt(i);
    const v = ch < 128 ? B64_INDEX[ch] : -1;
    if (v < 0) return null;
    for (let j = 0; j < 6; j++) bits[i * 6 + j] = (v >> j) & 1;
  }
  let at = 0;
  const get = n => { let v = 0; for (let i = 0; i < n; i++) v |= bits[at++] << i; return v; };
  const flags = get(2);
  const inkL = get(4) * 100 / 15;
  const cells = new Float64Array(CN * CN * 3);
  for (let i = 0; i < CN * CN; i++) {
    cells[3 * i] = dqAB(get(4));
    cells[3 * i + 1] = dqAB(get(4));
    cells[3 * i + 2] = get(2) / 3;
  }
  return { square: !!(flags & 1), turned: !!(flags & 2), inkL, cells };
}

// One cell: when both are coloured, how far apart their hues are, scaled by
// the weaker chroma (blur and haze wash chroma out, they do not turn red into
// blue), plus a little for chroma itself. Grey against a colour counts the
// colour's chroma. Grey against grey compares the ink lightness.
function cellDistance(a1, b1, a2, b2, dL) {
  const c1 = Math.hypot(a1, b1), c2 = Math.hypot(a2, b2);
  if (c1 < 10 && c2 < 10) return 0.3 * Math.abs(c1 - c2) + 0.5 * dL;
  if (c1 < 10 || c2 < 10) return Math.max(c1, c2);
  const cos = (a1 * a2 + b1 * b2) / (c1 * c2);
  return Math.sqrt(Math.max(0, 2 - 2 * cos)) * Math.min(c1, c2) + 0.3 * Math.abs(c1 - c2);
}

function colourDistance(ca, cb, cellMap) {
  const dL = Math.abs(ca.inkL - cb.inkL);
  let sum = 0, wsum = 0;
  for (let i = 0; i < CN * CN; i++) {
    const j = cellMap[i];
    const w = Math.min(ca.cells[3 * j + 2], cb.cells[3 * i + 2]) + 0.05;
    sum += w * cellDistance(ca.cells[3 * j], ca.cells[3 * j + 1], cb.cells[3 * i], cb.cells[3 * i + 1], dL);
    wsum += w;
  }
  return sum / wsum;
}

/* ---------------------------------------------------------------------- */
/* Signatures                                                              */
/* ---------------------------------------------------------------------- */

/**
 * Signature of one straightened stamp photo, as RGBA bytes of any size
 * (96 x 96 is plenty). The photo should include the stamp's edges with a
 * little background round them, as the app's crops do.
 *
 * opts.aspect: height / width of the original crop, when the pixels passed
 * in were resampled to a square. Defaults to h / w.
 *
 * Returns { v: 1, p, m, c }: hex strings p and m, and the colour code c.
 */
export function signatureFromRGBA(data, w, h, opts = {}) {
  if (!data || !(w > 0) || !(h > 0) || data.length < w * h * 4) throw new Error('signatureFromRGBA: bad image');
  const aspect = opts.aspect > 0 ? opts.aspect : h / w;
  const square = Math.abs(Math.log(aspect)) < Math.log(SQUARE);
  const turned = aspect < 1;

  // The region to hash: the paper found inside the crop, or a plain trim.
  const box = w >= 24 && h >= 24 ? paperBox(data, w, h) : null;
  let rx, ry, rw, rh;
  if (box) {
    rx = box.x + box.w * INSET; ry = box.y + box.h * INSET;
    rw = box.w * (1 - 2 * INSET); rh = box.h * (1 - 2 * INSET);
  } else {
    rx = w * TRIM; ry = h * TRIM; rw = w * (1 - 2 * TRIM); rh = h * (1 - 2 * TRIM);
  }
  const xa = clamp(Math.floor(rx), 0, w - 1), xb = clamp(Math.ceil(rx + rw), xa + 1, w);
  const ya = clamp(Math.floor(ry), 0, h - 1), yb = clamp(Math.ceil(ry + rh), ya + 1, h);

  // Luma grid and channel histograms for the white patch.
  const sum = new Float64Array(G * G), cnt = new Float64Array(G * G);
  const hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256);
  let total = 0;
  for (let y = ya; y < yb; y++) {
    const gy = Math.floor((y + 0.5 - ry) * G / rh);
    if (gy < 0 || gy >= G) continue;
    let i = (y * w + xa) * 4;
    for (let x = xa; x < xb; x++, i += 4) {
      const gx = Math.floor((x + 0.5 - rx) * G / rw);
      if (gx < 0 || gx >= G) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      sum[gy * G + gx] += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      cnt[gy * G + gx]++;
      hr[r]++; hg[g]++; hb[b]++; total++;
    }
  }
  let grid = new Float64Array(G * G);
  for (let i = 0; i < G * G; i++) grid[i] = cnt[i] ? sum[i] / cnt[i] : (i ? grid[i - 1] : 0);
  if (turned) grid = rotateGrid(grid, G);

  // p and m: signs of the low DCT coefficients, and which ones are strong.
  const coef = lowDct(grid);
  let ss = 0;
  for (let i = 1; i < 64; i++) ss += coef[i] * coef[i];
  const strong = STRONG * Math.sqrt(ss / 63);
  const pBits = new Uint8Array(64), mBits = new Uint8Array(64);
  for (let i = 1; i < 64; i++) {
    pBits[i] = coef[i] > 0 ? 1 : 0;
    mBits[i] = Math.abs(coef[i]) > strong ? 1 : 0;
  }

  // c: white-balance each channel on its 95th percentile (the paper), then
  // take the ink-weighted mean a* and b* per cell of the central 80%.
  const p95 = hist => { let run = 0; for (let v = 0; v < 256; v++) { run += hist[v]; if (run >= total * 0.95) return v; } return 255; };
  const scale = [hr, hg, hb].map(hist => clamp(WHITE / Math.max(1, p95(hist)), 0.5, 3));
  const lut = scale.map(s => Float64Array.from({ length: 256 }, (_, v) => LINEAR[Math.min(255, Math.round(v * s))]));
  const cbx = box || { x: 0, y: 0, w, h };
  const cx0 = cbx.x + cbx.w * C_INSET, cy0 = cbx.y + cbx.h * C_INSET;
  const cw = cbx.w * (1 - 2 * C_INSET), ch = cbx.h * (1 - 2 * C_INSET);
  const acc = new Float64Array(CN * CN * 4);
  let inkLsum = 0, inkW = 0;
  for (let y = clamp(Math.floor(cy0), 0, h - 1); y < clamp(Math.ceil(cy0 + ch), 1, h); y++) {
    const ky = Math.floor((y + 0.5 - cy0) * CN / ch);
    if (ky < 0 || ky >= CN) continue;
    for (let x = clamp(Math.floor(cx0), 0, w - 1); x < clamp(Math.ceil(cx0 + cw), 1, w); x++) {
      const kx = Math.floor((x + 0.5 - cx0) * CN / cw);
      if (kx < 0 || kx >= CN) continue;
      const i = (y * w + x) * 4;
      const [L, A, B] = labFromLinear(lut[0][data[i]], lut[1][data[i + 1]], lut[2][data[i + 2]]);
      // Ink: darker than the paper, or clearly coloured.
      const wt = Math.min(1, Math.max(0, (92 - L) / 40) + Math.hypot(A, B) / 40);
      const k = (ky * CN + kx) * 4;
      acc[k] += wt * A; acc[k + 1] += wt * B; acc[k + 2] += wt; acc[k + 3]++;
      inkLsum += wt * L; inkW += wt;
    }
  }
  let cells = [];
  for (let i = 0; i < CN * CN; i++) {
    const k = i * 4, W = acc[k + 2];
    cells.push(W > 0 ? [acc[k] / W, acc[k + 1] / W, Math.min(1, 2 * W / Math.max(1, acc[k + 3]))] : [0, 0, 0]);
  }
  if (turned) cells = Array.from(C_TURNS[1], j => cells[j]);
  const c = packColour((square ? 1 : 0) | (turned ? 2 : 0), inkW ? inkLsum / inkW : 50, cells);

  return { v: 1, p: wordsToHex(bitsToWords(pBits)), m: wordsToHex(bitsToWords(mBits)), c };
}

/**
 * Signature of a canvas, ImageBitmap or video frame in the browser. Draws
 * into a size x size canvas first (96 is plenty) and passes the original
 * proportions along, so oblong stamps are still told from square ones.
 */
export function signatureFromCanvas(source, size = 96) {
  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(size, size);
  else { canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const sw = source.naturalWidth || source.videoWidth || source.width || size;
  const sh = source.naturalHeight || source.videoHeight || source.height || size;
  return signatureFromRGBA(img.data, size, size, { aspect: sh / sw });
}

/** Short string form, "1.p.m.c", for storage. */
export function encodeSignature(sig) {
  return sig && sig.p ? [sig.v || 1, sig.p, sig.m, sig.c].join('.') : '';
}

/** Either form back to { v, p, m, c }, or null when it is not a signature. */
export function decodeSignature(s) {
  if (!s) return null;
  if (typeof s === 'string') {
    const [v, p, m, c] = s.split('.');
    s = { v: Number(v), p, m, c };
  }
  if (s.v !== 1 || !/^[0-9a-f]{16}$/.test(s.p || '') || !/^[0-9a-f]{16}$/.test(s.m || '') || typeof s.c !== 'string' || s.c.length !== 16) return null;
  return s;
}

/* ---------------------------------------------------------------------- */
/* Comparison                                                              */
/* ---------------------------------------------------------------------- */

// Unpacked form used for comparisons, cached per signature. Only the
// pattern words and the two flags are read up front; the colour grid is
// unpacked the first time a comparison gets that far, which for most of a
// collection is never.
const cacheObjects = new WeakMap();
const cacheStrings = new Map();

/** 8 lowercase hex digits starting at `at` as an unsigned 32-bit number, or -1. */
function hexWord(s, at) {
  let w = 0;
  for (let i = at; i < at + 8; i++) {
    const ch = s.charCodeAt(i);
    const v = ch >= 48 && ch <= 57 ? ch - 48 : ch >= 97 && ch <= 102 ? ch - 87 : -1;
    if (v < 0) return -1;
    w = (w << 4) | v;
  }
  return w >>> 0;
}

function unpackParts(p, pAt, m, mAt, c, cAt) {
  if (typeof p !== 'string' || typeof m !== 'string' || p.length < pAt + 16 || m.length < mAt + 16) return null;
  const p0 = hexWord(p, pAt), p1 = hexWord(p, pAt + 8), m0 = hexWord(m, mAt), m1 = hexWord(m, mAt + 8);
  const ch = c.charCodeAt(cAt), f = ch < 128 ? B64_INDEX[ch] : -1;
  if (p0 < 0 || p1 < 0 || m0 < 0 || m1 < 0 || f < 0) return null;
  return { p0, p1, m0, m1, square: (f & 1) === 1, turned: (f & 2) === 2, c, cAt, colour: undefined, turns: null };
}

// The string form has fixed places: "1." then p, ".", m, "." and the colour
// code, 52 characters in all. Reading it in place avoids splitting it.
function unpack(sig) {
  if (!sig) return null;
  const isObj = typeof sig === 'object';
  const hit = isObj ? cacheObjects.get(sig) : cacheStrings.get(sig);
  if (hit !== undefined) return hit;
  let u = null;
  if (isObj) {
    if (sig.v === 1 && typeof sig.c === 'string' && sig.c.length === 16) u = unpackParts(sig.p, 0, sig.m, 0, sig.c, 0);
  } else if (typeof sig === 'string' && sig.length === 52 && sig.charCodeAt(0) === 49 && sig.charCodeAt(1) === 46 && sig.charCodeAt(18) === 46 && sig.charCodeAt(35) === 46) {
    u = unpackParts(sig, 2, sig, 19, sig, 36);
  }
  if (isObj) cacheObjects.set(sig, u);
  else {
    if (cacheStrings.size > 50000) cacheStrings.clear();
    cacheStrings.set(sig, u);
  }
  return u;
}

function colourOf(u) {
  if (u.colour === undefined) u.colour = unpackColour(u.cAt ? u.c.slice(u.cAt, u.cAt + 16) : u.c);
  return u.colour;
}

// The four quarter turns of one signature, ready to compare.
function turnsOf(u) {
  if (!u.turns) {
    const pBits = wordsToBits(u.p0, u.p1), mBits = wordsToBits(u.m0, u.m1);
    u.turns = P_TURNS.map((t, k) => ({
      p: bitsToWords(turnBits(pBits, t, true)),
      m: bitsToWords(turnBits(mBits, t, false)),
      cells: C_TURNS[k]
    }));
  }
  return u.turns;
}

// Share of trusted signs that disagree. Coefficients strong in one photo and
// weak in the other count half, so two designs cannot look alike just by
// sharing few strong coefficients.
function pDistance(t, ub) {
  const both0 = (t.m[0] & ub.m0) >>> 0, both1 = (t.m[1] & ub.m1) >>> 0;
  const n = popcount32(both0) + popcount32(both1);
  const mis = popcount32((both0 & (t.p[0] ^ ub.p0)) >>> 0) + popcount32((both1 & (t.p[1] ^ ub.p1)) >>> 0);
  const half = 0.5 * (popcount32((t.m[0] ^ ub.m0) >>> 0) + popcount32((t.m[1] ^ ub.m1) >>> 0));
  return (mis + half) / Math.max(16, n + half);
}

const ALL_TURNS = [0, 1, 2, 3], HALF_TURNS = [0, 2];

function turnsToTry(ua, ub) {
  return ua.square || ub.square ? ALL_TURNS : HALF_TURNS;
}

function levelOf(pDist, colourDist) {
  if (pDist <= MATCH.pSame && colourDist <= MATCH.cSame) return 'same';
  if (pDist <= MATCH.pSimilar) return 'similar';
  return 'different';
}

function compareUnpacked(ua, ub) {
  const ts = turnsOf(ua);
  let best = -1, bestD = 2;
  for (const k of turnsToTry(ua, ub)) {
    const d = pDistance(ts[k], ub);
    if (d < bestD) { bestD = d; best = k; }
  }
  const ca = colourOf(ua), cb = colourOf(ub);
  const colourDist = ca && cb ? Math.round(colourDistance(ca, cb, ts[best].cells) * 10) / 10 : 100;
  const pDist = Math.round(bestD * 1000) / 1000;
  const rot = ((best + (ua.turned ? 1 : 0) - (ub.turned ? 1 : 0)) * 90 + 360) % 360;
  return { level: levelOf(pDist, colourDist), pDist, colourDist, rot };
}

/**
 * Compare a candidate signature `a` (a new photo) with a stored one `b`.
 * Returns { level, pDist, colourDist, rot }:
 * - level: 'same' (same design and colour: another copy, or the same stamp
 *   photographed again), 'similar' (same design in another colour, or a near
 *   match worth a look) or 'different'.
 * - pDist: share of trusted pattern bits that disagree, 0 to 1.
 * - colourDist: ink colour difference in Lab units.
 * - rot: clockwise turn, in degrees, that brings photo `a` into line with `b`.
 * Either argument may be the object or the encoded string.
 */
export function compareSignatures(a, b) {
  const ua = unpack(a), ub = unpack(b);
  if (!ua || !ub) return { level: 'different', pDist: 1, colourDist: 100, rot: 0 };
  return compareUnpacked(ua, ub);
}

/**
 * Saved stamps that look like this one. entries: [{ id, sig }] with sig in
 * either form. Returns up to opts.limit (default 5) matches at 'same' or
 * 'similar', best first, as { id, level, pDist, colourDist, rot }.
 * opts.exclude skips one id (the stamp itself).
 */
export function findMatches(sig, entries, opts = {}) {
  const ua = unpack(sig);
  if (!ua || !entries) return [];
  const ts = turnsOf(ua);
  const limit = opts.limit || 5;
  const found = [];
  for (const e of entries) {
    if (!e || e.id === opts.exclude) continue;
    const ub = unpack(e.sig);
    if (!ub) continue;
    // The pattern alone rules out nearly every saved stamp; colour is only
    // worked out for the few left.
    let near = false;
    for (const k of turnsToTry(ua, ub)) if (pDistance(ts[k], ub) <= MATCH.pSimilar) { near = true; break; }
    if (!near) continue;
    const r = compareUnpacked(ua, ub);
    if (r.level !== 'different') found.push({ id: e.id, ...r });
  }
  found.sort((x, y) => LEVEL_RANK[x.level] - LEVEL_RANK[y.level] || (x.pDist * 40 + x.colourDist) - (y.pDist * 40 + y.colourDist));
  return found.slice(0, limit);
}
