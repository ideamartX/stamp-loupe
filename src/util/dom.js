// Small DOM helpers. No framework.

export const $ = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const SVGNS = 'http://www.w3.org/2000/svg';

/**
 * h('div', { class: 'x', text: 'hi', onclick: fn }, child, [children])
 * Attributes set to null, undefined or false are skipped. true sets an empty attribute.
 */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') throw new Error('html is not allowed; build nodes instead');
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' && 'value' in el) el.value = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === '') continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/** An inline SVG that references a <symbol> by id. */
export function icon(id, cls) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('class', cls || 'icon');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  const u = document.createElementNS(SVGNS, 'use');
  u.setAttribute('href', '#' + id);
  s.append(u);
  return s;
}

let toastTimer = null;
export function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
}

export function flash(btn, msg) {
  const old = btn.dataset.label || btn.textContent;
  btn.dataset.label = old;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = old; }, 1600);
}

/** Copy text to the clipboard inside the click handler, with a select-to-copy fallback. */
export function copyText(text, btn) {
  let p;
  try { p = navigator.clipboard.writeText(text); } catch (_) { p = Promise.reject(new Error('no clipboard')); }
  return p.then(() => { if (btn) flash(btn, 'Copied'); return true; }, () => {
    const ta = h('textarea', { class: 'vh', 'aria-hidden': 'true' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    if (btn) flash(btn, ok ? 'Copied' : 'Select the text to copy');
    return ok;
  });
}

export function copyBtn(text, label, cls) {
  const b = h('button', { type: 'button', class: cls || 'btn btn-small' }, label || 'Copy');
  b.addEventListener('click', () => copyText(typeof text === 'function' ? text() : text, b));
  return b;
}

/** A segmented control. options: [[value, label]]. Returns { el, get, set }. */
export function segmented(options, value, onChange, label) {
  let current = value;
  const btns = options.map(([v, text]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(v === current), 'data-value': v }, text);
    b.addEventListener('click', () => { set(v); if (onChange) onChange(v); });
    return b;
  });
  const el = h('div', { class: 'seg', role: 'group', 'aria-label': label || null }, btns);
  function set(v) {
    current = v;
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === String(v))));
  }
  return { el, get: () => current, set };
}

/** Accessible tabs inside a container. tabs: [{ id, label, render() -> Node }]. */
export function tabset(tabs, opts = {}) {
  const prefix = opts.prefix || 'tab';
  let active = opts.active && tabs.some(t => t.id === opts.active) ? opts.active : tabs[0].id;
  const list = h('div', { class: 'rtabs', role: 'tablist', 'aria-label': opts.label || 'Sections' });
  const panel = h('div', { class: 'rpanel', role: 'tabpanel', tabindex: '-1' });
  const btns = tabs.map(t => {
    const b = h('button', { type: 'button', role: 'tab', id: prefix + '-' + t.id, 'aria-controls': prefix + '-panel' }, t.label, t.badge ? h('span', { class: 'tab-badge', text: t.badge }) : null);
    b.addEventListener('click', () => select(t.id, true));
    return b;
  });
  panel.id = prefix + '-panel';
  list.append(...btns);
  list.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = tabs.findIndex(t => t.id === active);
    const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    select(tabs[n].id, true);
    btns[n].focus();
    e.preventDefault();
  });
  function select(id, user) {
    active = id;
    tabs.forEach((t, i) => {
      const on = t.id === id;
      btns[i].setAttribute('aria-selected', String(on));
      btns[i].tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', prefix + '-' + id);
    const t = tabs.find(x => x.id === id);
    panel.replaceChildren(t.render());
    if (user && opts.onChange) opts.onChange(id);
  }
  select(active, false);
  return { list, panel, select, get active() { return active; } };
}

export function field(label, control, hint) {
  return h('div', { class: 'field' }, h('label', { for: control.id }, label), control, hint ? h('p', { class: 'hint', text: hint }) : null);
}

export function textInput(id, value, placeholder, extra) {
  const i = h('input', Object.assign({ type: 'text', id, placeholder: placeholder || null, autocomplete: 'off', maxlength: '200' }, extra || {}));
  i.value = value == null ? '' : String(value);
  return i;
}

export function numberInput(id, value, opts = {}) {
  const i = h('input', { type: 'number', id, inputmode: 'decimal', step: opts.step || 'any', min: opts.min != null ? String(opts.min) : null, max: opts.max != null ? String(opts.max) : null, placeholder: opts.placeholder || null });
  i.value = value == null || value === '' ? '' : String(value);
  return i;
}

export function selectInput(id, options, value) {
  const s = h('select', { id }, options.map(o => Array.isArray(o) ? h('option', { value: o[0] }, o[1]) : h('option', { value: o }, o)));
  if (value != null) s.value = value;
  return s;
}

/* ---------- Back button ----------
 * On phones the back gesture should close the open sheet or camera, not
 * leave the app. Each open pushes a history entry. The back button pops it
 * and closes the top item; closing by a button removes the entry quietly.
 * Off by default; main.js turns it on outside Claude, where the page owns
 * its history. */
const backStack = [];
let backOn = false, ignorePops = 0;
export function enableBackButton() {
  if (backOn || typeof window === 'undefined') return;
  backOn = true;
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) { ignorePops--; return; }
    const top = backStack.pop();
    if (top) { top.done = true; top.onBack(); }
  });
}
/** Register something the back button should close. Returns release(), to call when it closes another way. */
export function pushBack(onBack) {
  if (!backOn) return () => {};
  const entry = { onBack, done: false };
  backStack.push(entry);
  try { history.pushState({ sl: backStack.length }, ''); } catch (_) { /* history unavailable */ }
  return function release() {
    if (entry.done) return;
    entry.done = true;
    const i = backStack.indexOf(entry);
    if (i >= 0) backStack.splice(i, 1);
    ignorePops++;
    try { history.back(); } catch (_) { ignorePops--; }
  };
}

/** A modal layer with focus return. Returns { el, close }. */
export function openLayer(el, opts = {}) {
  const prev = document.activeElement;
  document.body.append(el);
  document.body.classList.add('locked');
  const onKey = e => { if (e.key === 'Escape' && opts.escape !== false) close(); };
  document.addEventListener('keydown', onKey);
  let closed = false;
  const releaseBack = pushBack(() => close());
  function close(result) {
    if (closed) return;
    closed = true;
    releaseBack();
    document.removeEventListener('keydown', onKey);
    el.remove();
    if (!document.querySelector('.layer')) document.body.classList.remove('locked');
    if (prev && prev.isConnected && prev.focus) prev.focus();
    if (opts.onClose) opts.onClose(result);
  }
  return { el, close };
}
