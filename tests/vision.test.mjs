import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectQuad, warpQuad, outputSize, blurScore, luminance, exposureStats, homography, applyH,
  assessQuality, overallState, guidance, orderQuad, quadShape, expandQuad, frameScore
} from '../src/capture/vision.js';
import { renderStamp, blurImage, addGlare, scaleBrightness, rotatedQuad, maxCornerError } from './helpers/synth.mjs';

test('homography maps the four corners exactly', () => {
  const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
  const dst = [{ x: 10, y: 20 }, { x: 210, y: 30 }, { x: 190, y: 140 }, { x: 5, y: 120 }];
  const H = homography(src, dst);
  src.forEach((p, i) => {
    const q = applyH(H, p.x, p.y);
    assert.ok(Math.abs(q.x - dst[i].x) < 1e-6 && Math.abs(q.y - dst[i].y) < 1e-6);
  });
});

test('orderQuad returns TL, TR, BR, BL whatever the input order', () => {
  const q = orderQuad([{ x: 90, y: 80 }, { x: 10, y: 10 }, { x: 10, y: 80 }, { x: 90, y: 10 }]);
  assert.deepEqual(q, [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 80 }, { x: 10, y: 80 }]);
});

test('finds an upright stamp on a dark background', () => {
  const truth = rotatedQuad(320, 240, 200, 240, 0);
  const img = renderStamp({ quad: truth });
  const det = detectQuad(img);
  assert.ok(det.found, 'stamp found');
  assert.ok(maxCornerError(det.quad, truth) < 6, 'corners within 6 px: ' + maxCornerError(det.quad, truth).toFixed(2));
  assert.equal(det.touchesEdge, false);
});

test('finds a rotated stamp and reports its tilt', () => {
  const truth = orderQuad(rotatedQuad(330, 230, 210, 250, 12));
  const img = renderStamp({ quad: truth });
  const det = detectQuad(img);
  assert.ok(det.found);
  assert.ok(maxCornerError(det.quad, truth) < 7, 'corner error ' + maxCornerError(det.quad, truth).toFixed(2));
  assert.ok(Math.abs(det.shape.tilt - 12) < 2, 'tilt ' + det.shape.tilt.toFixed(2));
});

test('follows a keystoned (perspective) stamp with four true corners', () => {
  const truth = [{ x: 220, y: 110 }, { x: 430, y: 125 }, { x: 455, y: 390 }, { x: 190, y: 372 }];
  const img = renderStamp({ quad: truth });
  const det = detectQuad(img);
  assert.ok(det.found);
  assert.ok(det.refined, 'quad refined beyond the min-area rectangle');
  assert.ok(maxCornerError(det.quad, truth) < 8, 'corner error ' + maxCornerError(det.quad, truth).toFixed(2));
});

test('finds a stamp on a light background', () => {
  const truth = rotatedQuad(320, 240, 220, 260, -6);
  const img = renderStamp({ quad: orderQuad(truth), bg: [246, 246, 244], paper: [228, 218, 190] });
  const det = detectQuad(img);
  assert.ok(det.found);
  assert.ok(maxCornerError(det.quad, orderQuad(truth)) < 9, 'corner error ' + maxCornerError(det.quad, orderQuad(truth)).toFixed(2));
});

test('flags a stamp cut off by the photo edge', () => {
  const truth = rotatedQuad(560, 240, 220, 260, 0);
  const img = renderStamp({ quad: truth });
  const det = detectQuad(img);
  assert.ok(det.found);
  assert.equal(det.touchesEdge, true);
});

test('reports nothing found on an empty background', () => {
  const img = renderStamp({ quad: rotatedQuad(-500, -500, 10, 10, 0) });
  const det = detectQuad(img);
  assert.equal(det.found, false);
});

test('warp produces an upright crop with true proportions', () => {
  const truth = orderQuad(rotatedQuad(320, 240, 200, 240, 9));
  const img = renderStamp({ quad: truth });
  const size = outputSize(truth, 2400);
  const out = warpQuad(img, truth, size.w, size.h);
  assert.ok(Math.abs(out.width - 200) <= 2 && Math.abs(out.height - 240) <= 2, out.width + 'x' + out.height);
  // The centre of the crop should be the stamp's ink, not the background.
  const i = ((out.height >> 1) * out.width + (out.width >> 1)) * 4;
  assert.ok(out.data[i + 2] > out.data[i], 'centre pixel is blue ink');
});

test('blur score separates sharp from blurred', () => {
  const truth = rotatedQuad(320, 240, 260, 300, 0);
  const sharp = renderStamp({ quad: truth, noise: 4 });
  const soft = blurImage(renderStamp({ quad: truth, noise: 4 }), 1);
  const blurry = blurImage(renderStamp({ quad: truth, noise: 4 }), 3);
  const region = { x: 220, y: 150, w: 200, h: 180 };
  const b0 = blurScore(luminance(sharp), 640, 480, region);
  const b1 = blurScore(luminance(soft), 640, 480, region);
  const b2 = blurScore(luminance(blurry), 640, 480, region);
  assert.ok(b0 < b1 && b1 < b2, `ordering ${b0.toFixed(3)} < ${b1.toFixed(3)} < ${b2.toFixed(3)}`);
  assert.ok(b0 <= 0.42, 'sharp passes: ' + b0.toFixed(3));
  assert.ok(b2 > 0.52, 'blurry fails: ' + b2.toFixed(3));
});

test('exposure stats catch glare and darkness', () => {
  const truth = rotatedQuad(320, 240, 260, 300, 0);
  const base = renderStamp({ quad: truth });
  const region = { x: 200, y: 100, w: 240, h: 280 };
  const clean = exposureStats(base, region);
  const glare = exposureStats(addGlare(renderStamp({ quad: truth }), 320, 220, 40, 26), region);
  const dark = exposureStats(scaleBrightness(renderStamp({ quad: truth }), 0.18), region);
  assert.ok(clean.clip < 0.006, 'clean clip ' + clean.clip);
  assert.ok(glare.clip > 0.025, 'glare clip ' + glare.clip);
  assert.ok(dark.mean < 40, 'dark mean ' + dark.mean);
});

test('quality checklist passes a good capture and fails a bad one', () => {
  const good = assessQuality({ found: true, touchesEdge: false, blur: 0.3, mean: 150, clip: 0, native: 1400, keystone: 0.02 });
  assert.equal(overallState(good), 'pass');
  const bad = assessQuality({ found: true, touchesEdge: true, blur: 0.6, mean: 30, clip: 0.05, native: 300, keystone: 0.3 });
  assert.equal(overallState(bad), 'fail');
  assert.ok(bad.every(i => i.state !== 'pass'));
});

test('guidance asks to move closer, centre, and then reports ready', () => {
  const guide = { x: 100, y: 60, w: 300, h: 300 };
  const small = { found: true, touchesEdge: false, quad: rotatedQuad(250, 210, 100, 120, 0), shape: quadShape(rotatedQuad(250, 210, 100, 120, 0)) };
  assert.equal(guidance(small, guide).code, 'closer');
  const offCentre = { found: true, touchesEdge: false, quad: rotatedQuad(300, 230, 200, 240, 0), shape: quadShape(rotatedQuad(300, 230, 200, 240, 0)) };
  assert.equal(guidance(offCentre, guide).code, 'center');
  const q = orderQuad(rotatedQuad(250, 210, 210, 250, 1));
  const good = { found: true, touchesEdge: false, quad: q, shape: quadShape(q) };
  assert.equal(guidance(good, guide, { mean: 140, clip: 0, motion: 1, blur: 0.3 }).code, 'ready');
  assert.equal(guidance(good, guide, { mean: 140, clip: 0, motion: 12, blur: 0.3 }).code, 'steady');
});

test('expandQuad grows the quad around its centre', () => {
  const q = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const e = expandQuad(q, 0.1);
  assert.ok(e[0].x < 0 && e[2].x > 10);
});

test('frameScore prefers sharp, steady, well lit frames', () => {
  const base = { blur: 0.32, motion: 1, fill: 0.95, align: 0.9, mean: 135, clip: 0 };
  const s = frameScore(base);
  assert.ok(s > 0.85 && s <= 1);
  assert.ok(frameScore({ ...base, blur: 0.5 }) < s - 0.1, 'blur costs the most');
  assert.ok(frameScore({ ...base, motion: 6 }) < s);
  assert.ok(frameScore({ ...base, clip: 0.03 }) < s);
  assert.ok(frameScore({ ...base, mean: 60 }) < s);
  // A sharper frame wins even when it is a little less steady.
  assert.ok(frameScore({ ...base, blur: 0.3, motion: 3 }) > frameScore({ ...base, blur: 0.45, motion: 0 }));
  assert.ok(frameScore({}) > 0 && frameScore({}) < 1, 'unknown values are neutral');
});
