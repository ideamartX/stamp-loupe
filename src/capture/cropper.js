// Corner editor: drag four handles to the stamp's corners. A loupe magnifies
// the area under your finger so perforation tips can be placed exactly.

import { h, openLayer } from '../util/dom.js';
import { dims } from './still.js';
import { orderQuad } from './vision.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  return el;
};

/**
 * Open the editor. Resolves with a quad in source pixels, the string 'full'
 * to use the whole photo, or null when cancelled.
 */
export function openCropper({ src, quad, title }) {
  return new Promise(resolve => {
    const { w: SW, h: SH } = dims(src);
    const inset = Math.min(SW, SH) * 0.1;
    const initial = quad ? quad.map(p => ({ ...p })) : [
      { x: inset, y: inset }, { x: SW - inset, y: inset }, { x: SW - inset, y: SH - inset }, { x: inset, y: SH - inset }
    ];
    let pts = initial.map(p => ({ ...p }));

    const canvas = h('canvas', { class: 'crop-canvas', 'aria-hidden': 'true' });
    const over = svg('svg', { class: 'crop-svg', role: 'presentation' });
    const shade = svg('path', { class: 'crop-shade', 'fill-rule': 'evenodd' });
    const poly = svg('polygon', { class: 'crop-poly' });
    over.append(shade, poly);
    const names = ['Top left corner', 'Top right corner', 'Bottom right corner', 'Bottom left corner'];
    const handles = names.map((name, i) => {
      const b = h('button', { type: 'button', class: 'crop-handle', 'aria-label': name + '. Use arrow keys to move.' });
      b.dataset.i = String(i);
      return b;
    });
    const loupe = h('canvas', { class: 'crop-loupe', width: '132', height: '132', 'aria-hidden': 'true', hidden: true });
    const stage = h('div', { class: 'crop-stage' }, canvas, over, ...handles, loupe);

    const cancel = h('button', { type: 'button', class: 'btn btn-small btn-quiet' }, 'Cancel');
    const reset = h('button', { type: 'button', class: 'btn btn-small' }, 'Reset');
    const full = h('button', { type: 'button', class: 'btn btn-small' }, 'Use whole photo');
    const apply = h('button', { type: 'button', class: 'btn btn-primary' }, 'Apply');
    const layer = h('div', { class: 'layer crop-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Adjust corners' },
      h('div', { class: 'crop-top' }, h('p', { class: 'crop-title', text: title || 'Adjust corners' }), cancel),
      h('p', { class: 'crop-help', text: 'Drag each corner to the tips of the perforations. The loupe shows where you are.' }),
      stage,
      h('div', { class: 'crop-bar' }, reset, full, apply));

    let ro = null;
    const ui = openLayer(layer, { onClose: r => { if (ro) ro.disconnect(); resolve(r === undefined ? null : r); } });

    let scale = 1, ox = 0, oy = 0, dpr = 1;
    function layout() {
      const r = stage.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      scale = Math.min(r.width / SW, r.height / SH);
      const dw = SW * scale, dh = SH * scale;
      ox = (r.width - dw) / 2;
      oy = (r.height - dh) / 2;
      canvas.style.left = ox + 'px';
      canvas.style.top = oy + 'px';
      canvas.style.width = dw + 'px';
      canvas.style.height = dh + 'px';
      canvas.width = Math.max(1, Math.round(dw * dpr));
      canvas.height = Math.max(1, Math.round(dh * dpr));
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      over.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
      over.setAttribute('width', r.width);
      over.setAttribute('height', r.height);
      draw();
    }
    const toScreen = p => ({ x: ox + p.x * scale, y: oy + p.y * scale });
    const toSource = (x, y) => ({ x: Math.max(0, Math.min(SW - 1, (x - ox) / scale)), y: Math.max(0, Math.min(SH - 1, (y - oy) / scale)) });

    function draw() {
      const s = pts.map(toScreen);
      const r = stage.getBoundingClientRect();
      poly.setAttribute('points', s.map(p => p.x + ',' + p.y).join(' '));
      shade.setAttribute('d', `M0 0H${r.width}V${r.height}H0Z M${s.map(p => p.x + ' ' + p.y).join(' L')}Z`);
      handles.forEach((b, i) => { b.style.left = s[i].x + 'px'; b.style.top = s[i].y + 'px'; });
    }

    function showLoupe(i) {
      const p = pts[i];
      const sp = toScreen(p);
      const r = stage.getBoundingClientRect();
      loupe.hidden = false;
      const size = 132;
      let lx = sp.x - size / 2, ly = sp.y - size - 36;
      if (ly < 4) ly = sp.y + 36;
      lx = Math.max(4, Math.min(r.width - size - 4, lx));
      loupe.style.left = lx + 'px';
      loupe.style.top = ly + 'px';
      const ctx = loupe.getContext('2d');
      const zoom = 4;
      const srcSize = size / (scale * zoom);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, p.x - srcSize / 2, p.y - srcSize / 2, srcSize, srcSize, 0, 0, size, size);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 2 - 14); ctx.lineTo(size / 2, size / 2 + 14);
      ctx.moveTo(size / 2 - 14, size / 2); ctx.lineTo(size / 2 + 14, size / 2);
      ctx.stroke();
    }

    let drag = null;
    handles.forEach((b, i) => {
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        const r = stage.getBoundingClientRect();
        const sp = toScreen(pts[i]);
        drag = { i, dx: sp.x - (e.clientX - r.left), dy: sp.y - (e.clientY - r.top) };
        b.classList.add('active');
        showLoupe(i);
      });
      b.addEventListener('pointermove', e => {
        if (!drag || drag.i !== i) return;
        const r = stage.getBoundingClientRect();
        pts[i] = toSource(e.clientX - r.left + drag.dx, e.clientY - r.top + drag.dy);
        draw();
        showLoupe(i);
      });
      const end = () => { if (drag && drag.i === i) { drag = null; b.classList.remove('active'); loupe.hidden = true; } };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
      b.addEventListener('keydown', e => {
        const step = (e.shiftKey ? 10 : 1) / scale;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (!d) return;
        e.preventDefault();
        pts[i] = { x: Math.max(0, Math.min(SW - 1, pts[i].x + d[0])), y: Math.max(0, Math.min(SH - 1, pts[i].y + d[1])) };
        draw();
        showLoupe(i);
      });
      b.addEventListener('blur', () => { if (!drag) loupe.hidden = true; });
    });

    cancel.addEventListener('click', () => ui.close(null));
    reset.addEventListener('click', () => { pts = initial.map(p => ({ ...p })); draw(); });
    full.addEventListener('click', () => ui.close('full'));
    apply.addEventListener('click', () => ui.close(orderQuad(pts)));

    ro = new ResizeObserver(() => layout());
    ro.observe(stage);
    requestAnimationFrame(() => { layout(); handles[0].focus({ preventScroll: true }); });
  });
}
