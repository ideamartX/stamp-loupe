// The status strip under the Identify button: a perforated progress bar,
// a message, the elapsed time, and errors. Shared by single stamps and pages.

import { $ } from '../util/dom.js';
import { S } from './core.js';
import { AI_ERRORS } from '../ai/providers.js';

function tick() {
  const s = Math.floor((Date.now() - S.t0) / 1000);
  $('#elapsed').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** opts: { msg, sub } */
export function startProgress(opts = {}) {
  S.t0 = Date.now();
  const bar = $('#perfbar');
  bar.classList.add('think');
  bar.firstElementChild.style.width = '';
  $('#status-msg').textContent = opts.msg || 'Examining the stamp';
  $('#status-sub').textContent = opts.sub != null ? opts.sub
    : S.mode === 'fast' ? 'Usually under a minute.' : 'A thorough look can take one to two minutes.';
  $('#status').hidden = false;
  $('#error').hidden = true;
  const l = $('#loupe');
  if (l) l.hidden = false;
  tick();
  clearInterval(S.timer);
  S.timer = setInterval(tick, 1000);
}

/** Called as the answer streams in. n = characters received so far. */
export function progressText(n, opts = {}) {
  const bar = $('#perfbar');
  if (bar.classList.contains('think')) {
    bar.classList.remove('think');
    $('#status-msg').textContent = opts.msg || 'Writing up the findings';
  }
  const lo = opts.from || 8, hi = opts.to || 96;
  bar.firstElementChild.style.width = Math.min(hi, lo + n / (opts.per || 40)) + '%';
}

/** Set the message, and optionally restart the thinking animation. */
export function setProgress(msg, sub, thinking) {
  $('#status-msg').textContent = msg;
  if (sub != null) $('#status-sub').textContent = sub;
  if (thinking) {
    const bar = $('#perfbar');
    bar.classList.add('think');
    bar.firstElementChild.style.width = '';
  }
}

export function stopProgress() {
  clearInterval(S.timer);
  $('#status').hidden = true;
  const l = $('#loupe');
  if (l) l.hidden = true;
}

export function showError(code, message) {
  const el = $('#error');
  el.textContent = AI_ERRORS[code] || message || AI_ERRORS.upstream_error;
  el.hidden = false;
}
