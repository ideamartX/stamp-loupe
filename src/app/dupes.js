// Duplicate check. Every straightened photo gets a small picture signature
// (a perceptual hash and a colour code). Before an identification is spent,
// it is compared on the device with the stamps already in the collection.

import { h, icon } from '../util/dom.js';
import { S, emit } from './core.js';
import { signatureFromCanvas, findMatches } from '../capture/phash.js';

export function signCanvas(canvas) {
  try { return canvas ? signatureFromCanvas(canvas) : null; } catch (_) { return null; }
}

// The comparison list is rebuilt only when the collection changes.
let cacheFor = null, cacheList = [];
function entries() {
  if (cacheFor !== S.stamps) {
    cacheFor = S.stamps;
    cacheList = S.stamps.filter(s => s.sig && s.sig.p).map(s => ({ id: s.id, sig: s.sig }));
  }
  return cacheList;
}

/** Matches in the collection, best first: [{ id, level: 'same' | 'similar', ... }]. */
export function matchCollection(sig, opts = {}) {
  if (!sig) return [];
  try { return findMatches(sig, entries(), opts) || []; } catch (_) { return []; }
}

/** Sign a capture and look for it in the collection. */
export function signCapture(cap) {
  if (!cap) return cap;
  cap.sig = signCanvas(cap.canvas);
  cap.dups = cap.sig ? matchCollection(cap.sig) : [];
  return cap;
}

/** A note under the photo when the stamp seems to be in the collection already. */
export function duplicateNote(cap) {
  const m = ((cap && cap.dups) || []).filter(x => x.level === 'same' || x.level === 'similar');
  if (!m.length) return null;
  const best = m[0];
  const s = S.stamps.find(x => x.id === best.id);
  if (!s) return null;
  const same = best.level === 'same';
  return h('div', { class: 'dupnote' + (same ? ' same' : ''), role: 'status' },
    icon('i-copies'),
    h('p', null,
      h('strong', { text: same ? 'You may already have this stamp. ' : 'A similar stamp is in your collection. ' }),
      (s.title || 'Untitled') + '. ',
      same ? 'Open it before you spend an identification.' : 'It may be another value or colour of the same design.'),
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => emit('open-stamp', s.id) }, 'Open it'));
}

/** Ids of stamps that were saved as likely copies of another, and the stamps they copy. */
export function duplicateIds(list) {
  const ids = new Set(list.map(s => s.id));
  const out = new Set();
  for (const s of list) {
    if (s.dupOf && ids.has(s.dupOf)) { out.add(s.id); out.add(s.dupOf); }
  }
  return out;
}
