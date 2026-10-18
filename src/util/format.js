// Formatting and small pure helpers shared by the app and tests.

/** Keep model text free of em and en dashes (house style), and tidy commas. */
export function clean(v) {
  if (v == null) return '';
  return String(v)
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1 to $2')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/^[\s,]+/, '')
    .trim();
}

export const isNum = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

export function fmtNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  const frac = v > 0 && v < 10 && Math.round(v) !== v ? 2 : 0;
  return v.toLocaleString('en-CA', { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

/** Money with two decimals under 100, whole dollars above. */
export function fmtMoney(n, cur) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  const digits = abs < 100 ? 2 : 0;
  const s = abs.toLocaleString('en-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (v < 0 ? '-' : '') + (cur ? cur + ' ' : '') + s;
}

export function fmtRange(val) {
  if (!val) return '';
  const cur = String(val.currency || '').toUpperCase();
  const lo = isNum(val.low) ? Number(val.low) : null;
  const hi = isNum(val.high) ? Number(val.high) : null;
  if (lo == null && hi == null) return '';
  if (lo != null && hi != null && lo !== hi) return (cur + ' ' + fmtNum(lo) + ' to ' + fmtNum(hi)).trim();
  return (cur + ' ' + fmtNum(hi != null ? hi : lo)).trim();
}

export const joinDot = parts => parts.filter(Boolean).join(' · ');

export function yearOf(s) {
  const m = String((s && s.year) || '').match(/(1[6-9]\d\d|20\d\d)/);
  return m ? Number(m[1]) : null;
}

export function initials(c) {
  return String(c || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function newId(prefix = 's') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function median(nums) {
  const a = nums.filter(n => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function monthsBetween(isoA, isoB) {
  const a = new Date(isoA), b = new Date(isoB);
  if (isNaN(a) || isNaN(b)) return null;
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : (many || one + 's'));
}

export async function sha256Hex(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const dig = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(dig), b => b.toString(16).padStart(2, '0')).join('');
}

/** Strip code fences and surrounding prose, then parse the first JSON object. */
export function parseJSONLoose(text) {
  if (text && typeof text === 'object') return text;
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch (_) { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch (_) { /* fall through */ }
  }
  const err = new Error('invalid_json');
  err.code = 'invalid_json';
  throw err;
}
