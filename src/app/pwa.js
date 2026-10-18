// Installable, offline web app support for the hosted build.
//
// The service worker is registered only when the site build defines
// __SL_BUILD__ (npm run build:site). The raw dev setup (npm run serve) and
// the single-file Claude artifact (npm run build) leave it undefined, so
// initPWA does nothing there. This module has no UI; the app decides what
// to show.

/* global __SL_BUILD__ */
const BUILD = typeof __SL_BUILD__ !== 'undefined' ? __SL_BUILD__ : null;
const INBOX = 'share-inbox';

let reg = null;
let onUpdate = null;
let onInstall = null;
let wantReload = false;
let reloading = false;
let deferredPrompt = null;

if (typeof window !== 'undefined') {
  // Keep the browser's install prompt so the app can offer it at a better moment.
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (onInstall) onInstall(true);
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (onInstall) onInstall(false);
  });
}

/** True when this build should use a service worker. */
export function swEnabled() {
  return !!(BUILD && BUILD.sw) &&
    typeof window !== 'undefined' && window.isSecureContext === true &&
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/** Build version, or '' outside the site build. */
export function buildVersion() {
  return (BUILD && BUILD.version) || '';
}

/**
 * Register the service worker. opts.onUpdateReady() runs when a new version
 * has downloaded and is waiting; call applyUpdate() to switch to it.
 * opts.onInstallChange(available) runs when the install prompt appears or goes.
 * Resolves to the registration, or null when there is none.
 */
export async function initPWA(opts = {}) {
  onUpdate = typeof opts.onUpdateReady === 'function' ? opts.onUpdateReady : null;
  onInstall = typeof opts.onInstallChange === 'function' ? opts.onInstallChange : null;
  if (onInstall && deferredPrompt) onInstall(true);
  if (!swEnabled()) return null;
  try {
    reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (_) {
    return null;
  }
  const notify = () => {
    if (reg && reg.waiting && navigator.serviceWorker.controller && onUpdate) onUpdate();
  };
  if (reg.waiting) notify();
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') notify(); });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The first install also changes the controller; reload only after applyUpdate().
    if (!wantReload || reloading) return;
    reloading = true;
    location.reload();
  });
  // An installed app can stay open for days, so look for updates now and then.
  let checked = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !reg || Date.now() - checked < 3600e3) return;
    checked = Date.now();
    reg.update().catch(() => {});
  });
  return reg;
}

/** Switch to the waiting version. The page reloads once it takes over. */
export function applyUpdate() {
  if (!reg || !reg.waiting) return false;
  wantReload = true;
  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

/** True when the browser has offered to install the app. */
export function canInstall() {
  return !!deferredPrompt;
}

/** Show the browser's install dialog. Resolves to 'accepted', 'dismissed' or 'unavailable'. */
export async function promptInstall() {
  const e = deferredPrompt;
  if (!e) return 'unavailable';
  deferredPrompt = null;
  if (onInstall) onInstall(false);
  try {
    await e.prompt();
    const choice = await e.userChoice;
    return (choice && choice.outcome) || 'dismissed';
  } catch (_) {
    return 'unavailable';
  }
}

/** iPhone and iPad, including iPads that report a desktop browser. */
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** True when running as an installed app rather than in a browser tab. */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch (_) { /* old browser */ }
  return typeof navigator !== 'undefined' && navigator.standalone === true;
}

/**
 * Keep the screen on, for example while the live camera is open.
 * Returns a function that lets the screen sleep again. Does nothing where
 * the Screen Wake Lock API is missing.
 */
export function keepAwake() {
  if (typeof navigator === 'undefined' || typeof document === 'undefined' || !('wakeLock' in navigator)) return () => {};
  let sentinel = null;
  let wanted = true;
  const acquire = async () => {
    if (!wanted || sentinel || document.visibilityState !== 'visible') return;
    try {
      const s = await navigator.wakeLock.request('screen');
      if (!wanted) { s.release().catch(() => {}); return; }
      sentinel = s;
      s.addEventListener('release', () => { if (sentinel === s) sentinel = null; });
    } catch (_) {
      sentinel = null; // denied, low battery, or not visible
    }
  };
  const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
  document.addEventListener('visibilitychange', onVisible);
  acquire();
  return () => {
    wanted = false;
    document.removeEventListener('visibilitychange', onVisible);
    if (sentinel) { sentinel.release().catch(() => {}); sentinel = null; }
  };
}

/**
 * Photos shared to the installed app from another app (Android share sheet).
 * Returns File objects in the order they were shared and empties the inbox.
 */
export async function takeSharedFiles() {
  if (typeof caches === 'undefined') return [];
  try {
    if (!(await caches.has(INBOX))) return [];
    const inbox = await caches.open(INBOX);
    const keys = (await inbox.keys()).sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
    const files = [];
    for (const key of keys) {
      const res = await inbox.match(key);
      if (res) {
        const blob = await res.blob();
        let name = 'shared-photo.jpg';
        try { name = decodeURIComponent(res.headers.get('x-file-name') || name); } catch (_) { /* keep default */ }
        const type = blob.type || res.headers.get('content-type') || 'image/jpeg';
        files.push(typeof File === 'function' ? new File([blob], name, { type }) : blob);
      }
      await inbox.delete(key);
    }
    return files;
  } catch (_) {
    return [];
  }
}
