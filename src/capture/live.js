// Live camera with a cheque-style guide and auto-capture.
//
// Each frame: find the item inside the guide, measure focus, light, glare and
// motion, then show one instruction. When everything holds for a moment, the
// photo is taken automatically, straightened, and shown for review.
//
// Needs a secure page (https) and camera permission. Claude artifacts do not
// allow camera access, so the app falls back to the phone's camera app there.

import { h, openLayer, icon } from '../util/dom.js';
import * as V from './vision.js';
import { SUBJECTS, buildCapture, canvasOf, clampRect, decodeImage, dims, focusProbe, locate, releaseCapture } from './still.js';
import { openCropper } from './cropper.js';
import { keepAwake } from '../app/pwa.js';

const HOLD_MS = 700;
const ANALYSIS_SIDE = 420;

export function liveCameraSupported(platformKind) {
  if (platformKind === 'claude') return false;
  return !!(typeof window !== 'undefined' && window.isSecureContext && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
}

/**
 * Open the live camera.
 * opts: { subject, side: 'front' | 'back', checklist(cap) -> Node }
 * Resolves with a capture, null when closed, or { error } when the camera
 * could not start (so the caller can fall back to a file input).
 */
export function openLiveCamera(opts = {}) {
  return new Promise(resolve => {
    let subject = SUBJECTS[opts.subject] && !SUBJECTS[opts.subject].multi ? opts.subject : 'single';
    let portrait = false;
    let stream = null, track = null, caps = {};
    let running = false, timer = null;
    let prevL = null, readySince = 0, lastMsg = '', lastBlur = null, frameNo = 0, lastQuadVideo = null;
    const recent = [], msgFor = {};
    // Best frame of the current hold: a full-resolution copy, its outline and score.
    let best = null, lastScore = 0;
    const bestCv = canvasOf(2, 2);
    // Keep the screen on while the camera is open.
    const releaseAwake = keepAwake();
    let pending = null;
    let done = false;

    const video = h('video', { class: 'cam-video', playsinline: true, muted: true, autoplay: true, 'aria-hidden': 'true' });
    video.muted = true;
    const overlay = h('canvas', { class: 'cam-overlay', 'aria-hidden': 'true' });
    const guide = h('div', { class: 'cam-guide', 'data-state': 'find' },
      h('span', { class: 'gc tl' }), h('span', { class: 'gc tr' }), h('span', { class: 'gc br' }), h('span', { class: 'gc bl' }));
    const hint = h('p', { class: 'cam-hint', role: 'status', 'aria-live': 'polite' }, 'Starting the camera');
    const meter = (label) => {
      const bar = h('i');
      const el = h('div', { class: 'cam-meter' }, h('span', { text: label }), h('b', null, bar));
      return { el, set(v, state) { bar.style.width = Math.round(V.clamp(v, 0, 1) * 100) + '%'; el.dataset.state = state || ''; } };
    };
    const mFocus = meter('Focus'), mLight = meter('Light'), mSteady = meter('Steady');
    const flashEl = h('div', { class: 'cam-flash', 'aria-hidden': 'true' });
    const stage = h('div', { class: 'cam-stage' }, video, overlay, guide, hint, h('div', { class: 'cam-meters' }, mFocus.el, mLight.el, mSteady.el), flashEl);

    const closeBtn = h('button', { type: 'button', class: 'cam-btn', 'aria-label': 'Close camera' }, icon('i-close'));
    const torchBtn = h('button', { type: 'button', class: 'cam-btn', 'aria-label': 'Light', 'aria-pressed': 'false', style: 'visibility:hidden' }, icon('i-torch'));
    const title = h('p', { class: 'cam-title', text: opts.side === 'back' ? 'Back of the stamp' : 'Front' });

    const subjBtns = Object.values(SUBJECTS).filter(s => !s.multi).map(s => {
      const b = h('button', { type: 'button', 'aria-pressed': String(s.id === subject), 'data-value': s.id }, s.short);
      b.addEventListener('click', () => { subject = s.id; subjBtns.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.value === subject))); layoutGuide(); });
      return b;
    });
    const subjSeg = h('div', { class: 'seg seg-dark', role: 'group', 'aria-label': 'What are you photographing' }, subjBtns);
    const turnBtn = h('button', { type: 'button', class: 'cam-btn', 'aria-label': 'Turn the frame' }, icon('i-turn'));
    turnBtn.addEventListener('click', () => { portrait = !portrait; layoutGuide(); });
    const ring = h('span', { class: 'shutter-ring', 'aria-hidden': 'true' });
    const shutter = h('button', { type: 'button', class: 'shutter', 'aria-label': 'Take photo now' }, ring);
    const zoomWrap = h('div', { class: 'cam-zoom', style: 'visibility:hidden' });

    const reviewImg = h('img', { class: 'review-img', alt: 'The captured photo, straightened' });
    const reviewChecks = h('div', { class: 'review-checks' });
    const useBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Use photo');
    const retakeBtn = h('button', { type: 'button', class: 'btn' }, 'Retake');
    const adjustBtn = h('button', { type: 'button', class: 'btn' }, 'Adjust corners');
    const review = h('div', { class: 'cam-review', hidden: true },
      h('div', { class: 'review-mount' }, reviewImg), reviewChecks, h('div', { class: 'review-actions' }, retakeBtn, adjustBtn, useBtn));

    const layer = h('div', { class: 'layer cam-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Camera' },
      h('div', { class: 'cam-top' }, closeBtn, title, torchBtn),
      stage,
      h('div', { class: 'cam-bottom' }, h('div', { class: 'cam-row' }, subjSeg, turnBtn), h('div', { class: 'cam-row cam-shoot' }, zoomWrap, shutter, h('span', { class: 'cam-spacer' }))),
      review);

    const ui = openLayer(layer, { onClose: result => { stop(); resolve(result === undefined ? null : result); } });
    closeBtn.addEventListener('click', () => finish(null));

    function finish(result) {
      if (done) return;
      done = true;
      ui.close(result);
    }

    function stop() {
      running = false;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach(t => t.stop());
      releaseAwake();
      best = null;
      bestCv.width = bestCv.height = 1;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', layoutGuide);
    }

    function onVis() {
      if (document.hidden) { running = false; }
      else if (stream && review.hidden && !done) { running = true; schedule(); }
    }

    /* Guide geometry in stage pixels */
    let G = { x: 0, y: 0, w: 0, h: 0 };
    function layoutGuide() {
      const r = stage.getBoundingClientRect();
      const s = SUBJECTS[subject];
      let aspect = s.aspect;
      if (s.id !== 'single' && portrait) aspect = 1 / aspect;
      turnBtn.hidden = s.id === 'single';
      const maxW = r.width * 0.86, maxH = r.height * 0.7;
      let gw = maxW, gh = gw / aspect;
      if (gh > maxH) { gh = maxH; gw = gh * aspect; }
      G = { x: (r.width - gw) / 2, y: (r.height - gh) / 2 - r.height * 0.03, w: gw, h: gh };
      Object.assign(guide.style, { left: G.x + 'px', top: G.y + 'px', width: G.w + 'px', height: G.h + 'px' });
      overlay.width = Math.round(r.width);
      overlay.height = Math.round(r.height);
    }

    /* Map between stage pixels and video pixels (video uses object-fit: cover) */
    function mapping() {
      const r = stage.getBoundingClientRect();
      const vw = video.videoWidth, vh = video.videoHeight;
      const k = Math.max(r.width / vw, r.height / vh);
      return { k, ox: (r.width - vw * k) / 2, oy: (r.height - vh * k) / 2, vw, vh };
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }
        });
      } catch (e) {
        finish({ error: (e && e.name) || 'camera' });
        return;
      }
      if (done) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream;
      track = stream.getVideoTracks()[0];
      try { caps = (track.getCapabilities && track.getCapabilities()) || {}; } catch (_) { caps = {}; }
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      }
      if (caps.torch) torchBtn.style.visibility = 'visible';
      if (caps.zoom && caps.zoom.max >= 2) {
        const levels = [1, 2].filter(z => z >= caps.zoom.min && z <= caps.zoom.max);
        const btns = levels.map(z => {
          const b = h('button', { type: 'button', class: 'zoom-chip', 'aria-pressed': String(z === 1) }, z + 'x');
          b.addEventListener('click', () => {
            track.applyConstraints({ advanced: [{ zoom: z }] }).then(() => btns.forEach(x => x.setAttribute('aria-pressed', String(x === b)))).catch(() => {});
          });
          return b;
        });
        zoomWrap.replaceChildren(...btns);
        zoomWrap.style.visibility = 'visible';
      }
      try { await video.play(); } catch (_) { /* autoplay muted should work */ }
      layoutGuide();
      running = true;
      schedule();
    }

    torchBtn.addEventListener('click', () => {
      const on = torchBtn.getAttribute('aria-pressed') !== 'true';
      track.applyConstraints({ advanced: [{ torch: on }] }).then(() => torchBtn.setAttribute('aria-pressed', String(on))).catch(() => {});
    });

    // Tap to focus where supported.
    stage.addEventListener('click', e => {
      if (!track || !Array.isArray(caps.focusMode) || !caps.focusMode.includes('single-shot')) return;
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      track.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }], focusMode: 'single-shot' }] })
        .then(() => setTimeout(() => track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}), 1200))
        .catch(() => {});
    });

    // About 12 analyses a second is plenty for guidance and kind to batteries.
    function schedule() {
      if (!running) return;
      clearTimeout(timer);
      timer = setTimeout(analyse, 80);
    }

    const A = canvasOf(8, 8);
    const actx = A.getContext('2d', { willReadFrequently: true });

    function say(msg) {
      if (msg !== lastMsg) { hint.textContent = msg; lastMsg = msg; }
    }

    function analyse() {
      if (!running) return;
      const t0 = performance.now();
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) { schedule(); return; }
      frameNo++;
      const M = mapping();
      const gV = { x: (G.x - M.ox) / M.k, y: (G.y - M.oy) / M.k, w: G.w / M.k, h: G.h / M.k };
      const pad = Math.max(gV.w, gV.h) * 0.18;
      const roi = clampRect({ x: gV.x - pad, y: gV.y - pad, w: gV.w + 2 * pad, h: gV.h + 2 * pad }, vw, vh);
      const s = Math.min(1, ANALYSIS_SIDE / Math.max(roi.w, roi.h));
      const aw = Math.max(16, Math.round(roi.w * s)), ah = Math.max(16, Math.round(roi.h * s));
      if (A.width !== aw || A.height !== ah) { A.width = aw; A.height = ah; prevL = null; }
      actx.drawImage(video, roi.x, roi.y, roi.w, roi.h, 0, 0, aw, ah);
      const img = actx.getImageData(0, 0, aw, ah);
      const det = V.detectQuad(img);
      const L = V.luminance(img);
      const motion = V.motionScore(L, prevL);
      prevL = L;
      const gA = { x: (gV.x - roi.x) * s, y: (gV.y - roi.y) * s, w: gV.w * s, h: gV.h * s };
      let ex = null;
      let quadVideo = null;
      let freshBlur = false;
      if (det.found) {
        const b = V.quadBounds(det.quad);
        ex = V.exposureStats(img, { x: b.x + b.w * 0.12, y: b.y + b.h * 0.12, w: b.w * 0.76, h: b.h * 0.76 });
        quadVideo = det.quad.map(p => ({ x: roi.x + p.x / s, y: roi.y + p.y / s }));
        if (frameNo % 2 === 0 || lastBlur == null) { lastBlur = focusProbe(video, quadVideo); freshBlur = true; }
      } else {
        lastBlur = null;
      }
      lastQuadVideo = quadVideo;
      const g = V.guidance(det, gA, { mean: ex && ex.mean, clip: ex && ex.clip, motion, blur: lastBlur });

      // Meters
      mFocus.set(lastBlur == null ? 0 : 1 - (lastBlur - 0.25) / 0.4, lastBlur == null ? '' : lastBlur <= V.THRESHOLDS.blurGood ? 'ok' : lastBlur <= V.THRESHOLDS.blurSoft ? 'mid' : 'bad');
      const light = ex ? (ex.clip >= V.THRESHOLDS.glareWarn ? 0.4 : V.clamp((ex.mean - 30) / 100, 0, 1)) : 0;
      mLight.set(light, !ex ? '' : ex.clip >= V.THRESHOLDS.glareFail || ex.mean < V.THRESHOLDS.veryDarkMean ? 'bad' : ex.clip >= V.THRESHOLDS.glareWarn || ex.mean < V.THRESHOLDS.darkMean ? 'mid' : 'ok');
      mSteady.set(motion == null ? 0 : 1 - motion / 12, motion == null ? '' : motion <= 3 ? 'ok' : motion <= 6 ? 'mid' : 'bad');

      // Overlay: the detected outline
      const octx = overlay.getContext('2d');
      octx.clearRect(0, 0, overlay.width, overlay.height);
      if (quadVideo) {
        const sp = quadVideo.map(p => ({ x: p.x * M.k + M.ox, y: p.y * M.k + M.oy }));
        octx.lineWidth = 2;
        octx.strokeStyle = g.ready ? 'rgba(105, 214, 161, 0.95)' : 'rgba(255, 255, 255, 0.85)';
        octx.beginPath();
        sp.forEach((p, i) => (i ? octx.lineTo(p.x, p.y) : octx.moveTo(p.x, p.y)));
        octx.closePath();
        octx.stroke();
      }

      // Auto-capture after a steady hold
      const now = performance.now();
      if (g.ready) {
        if (!readySince) readySince = now;
        // Keep the sharpest frame of this hold. Only frames with a fresh focus
        // reading are scored, and a full-size copy is made only for a new best.
        if (freshBlur && quadVideo) {
          lastScore = V.frameScore({ blur: lastBlur, motion, fill: det.fill, align: g.alignScore, mean: ex && ex.mean, clip: ex && ex.clip });
          if (!best || lastScore > best.score) keepBest(lastScore, quadVideo, now);
        }
        const p = Math.min(1, (now - readySince) / HOLD_MS);
        guide.dataset.state = 'ready';
        ring.style.setProperty('--p', String(p));
        say(p > 0.15 ? 'Hold still' : g.message);
        if (p >= 1 && quadVideo) { take(quadVideo, true); return; }
      } else {
        readySince = 0;
        best = null;
        ring.style.setProperty('--p', '0');
        guide.dataset.state = g.code === 'find' ? 'find' : 'align';
        // Show the most common instruction of the last few frames, so the
        // hint does not flicker between two messages.
        recent.push(g.code);
        if (recent.length > 6) recent.shift();
        msgFor[g.code] = g.message;
        const tally = {};
        for (const c of recent) tally[c] = (tally[c] || 0) + 1;
        const top = Object.keys(tally).reduce((a, b) => (tally[a] >= tally[b] ? a : b));
        say(msgFor[top] || g.message);
      }
      // Back off on slow phones.
      const spent = performance.now() - t0;
      if (spent > 70) { clearTimeout(timer); timer = setTimeout(analyse, 80 + spent); } else schedule();
    }

    function keepBest(score, quad, t) {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      if (bestCv.width !== vw || bestCv.height !== vh) { bestCv.width = vw; bestCv.height = vh; }
      bestCv.getContext('2d').drawImage(video, 0, 0, vw, vh);
      best = { score, quad: quad.map(p => ({ x: p.x, y: p.y })), t, blur: lastBlur };
    }

    // Where the browser supports it (Chrome on Android), take a full-resolution
    // still from the sensor. Video frames are often only 1080p or 720p.
    async function grabStill() {
      if (typeof window.ImageCapture !== 'function' || !track || track.readyState !== 'live') return null;
      try {
        const ic = new window.ImageCapture(track);
        const settings = {};
        try {
          const pc = await ic.getPhotoCapabilities();
          if (pc && Array.isArray(pc.fillLightMode) && pc.fillLightMode.includes('off')) settings.fillLightMode = 'off';
          if (pc && pc.imageWidth && pc.imageWidth.max) settings.imageWidth = pc.imageWidth.max;
        } catch (_) { /* capabilities unknown */ }
        const blob = await Promise.race([
          ic.takePhoto(settings),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
        return await decodeImage(blob);
      } catch (_) {
        return null;
      }
    }

    async function take(quadVideo, auto) {
      running = false;
      ring.style.setProperty('--p', '0');
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw) return;
      // Use the sharpest frame of the hold when it beats the current one.
      const useBest = !!(auto && best && performance.now() - best.t < 1500 && best.score > lastScore + 0.03 &&
        bestCv.width === vw && bestCv.height === vh);
      const frame = canvasOf(vw, vh);
      if (useBest) frame.getContext('2d').drawImage(bestCv, 0, 0);
      else frame.getContext('2d').drawImage(video, 0, 0, vw, vh);
      if (useBest) quadVideo = best.quad;
      const frameBlur = useBest ? best.blur : lastBlur;
      best = null;
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        flashEl.classList.remove('go');
        void flashEl.offsetWidth;
        flashEl.classList.add('go');
      }
      if (navigator.vibrate) { try { navigator.vibrate(25); } catch (_) { /* not allowed */ } }
      say('Straightening');
      let src = frame, quad = quadVideo, touches = false;
      if (quadVideo) {
        const still = await grabStill();
        const sd = still ? dims(still) : null;
        if (still && Math.max(sd.w, sd.h) > Math.max(vw, vh) * 1.2) {
          // The still may have a different field of view, so search it whole.
          const loc = locate(still, { coarse: 800, fine: 1400 });
          // The sensor still can come out softer if the lens refocused, so
          // keep the video frame when the still is clearly blurrier.
          const softer = loc.found && frameBlur != null && focusProbe(still, loc.quad) > frameBlur + 0.08;
          if (loc.found && !loc.touchesEdge && !softer) { src = still; quad = loc.quad; }
        }
        if (src === frame) {
          const b = V.quadBounds(quadVideo);
          const pad = Math.max(b.w, b.h) * 0.2;
          const loc = locate(frame, { roi: { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad }, coarse: 720, fine: 1200 });
          if (loc.found && !loc.touchesEdge) quad = loc.quad;
          touches = !!(loc.found && loc.touchesEdge);
        }
      }
      const cap = await buildCapture(src, quad, { subject, auto, touchesEdge: touches, origin: 'live' });
      showReview(cap);
    }

    shutter.addEventListener('click', () => { if (running) take(lastQuadVideo, false); });

    function showReview(cap) {
      pending = cap;
      reviewImg.src = cap.url;
      reviewChecks.replaceChildren(opts.checklist ? opts.checklist(cap) : h('span'));
      review.hidden = false;
      useBtn.textContent = cap.state === 'fail' ? 'Use anyway' : 'Use photo';
      useBtn.className = cap.state === 'fail' ? 'btn' : 'btn btn-primary';
      retakeBtn.className = cap.state === 'fail' ? 'btn btn-primary' : 'btn';
      (cap.state === 'fail' ? retakeBtn : useBtn).focus();
    }
    retakeBtn.addEventListener('click', () => {
      releaseCapture(pending);
      pending = null;
      review.hidden = true;
      readySince = 0;
      prevL = null;
      best = null;
      say('Place the stamp inside the frame');
      running = true;
      schedule();
    });
    useBtn.addEventListener('click', () => { const c = pending; pending = null; finish(c); });
    adjustBtn.addEventListener('click', async () => {
      if (!pending) return;
      const cap = pending;
      const q = await openCropper({ src: cap.src, quad: cap.quad, title: 'Adjust corners' });
      if (!q) return;
      const next = await buildCapture(cap.src, q === 'full' ? null : q, { subject: cap.subject, auto: false, origin: 'live', manualFull: q === 'full' });
      if (cap.url) URL.revokeObjectURL(cap.url);
      showReview(next);
    });

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', layoutGuide);
    requestAnimationFrame(() => { layoutGuide(); start(); });
  });
}
