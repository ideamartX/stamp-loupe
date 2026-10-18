// AI providers. Both expose the same shape:
//   { kind, label, images, maxImages, maxImageBytes, json(prompt, opts) }
// opts: { images: Blob[], tier: 'thorough' | 'fast', signal, onText({ text }) }
// Errors reject with { code, message }.

import { parseJSONLoose } from '../util/format.js';

export const MODELS = [
  ['claude-opus-5-5', 'Claude Opus 5.5 (best accuracy)'],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (balanced)'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 (fastest, lowest cost)'],
  ['claude-fable-5-1', 'Claude Fable 5.1 (most capable, highest cost)']
];
export const DEFAULT_MODELS = { thorough: 'claude-opus-5-5', fast: 'claude-sonnet-5-5' };

/** Claude artifact runtime: the viewer's own Claude account through `sample`. */
export function claudeProvider(sample, limits) {
  const imgs = limits && limits.images;
  return {
    kind: 'claude',
    label: 'Your Claude account',
    images: !!imgs,
    maxImages: (imgs && imgs.maxCount) || 1,
    maxImageBytes: (imgs && imgs.maxInputBytes) || 5e6,
    json(prompt, opts = {}) {
      return sample.json(prompt, {
        images: opts.images && opts.images.length ? opts.images : undefined,
        modelTier: opts.tier === 'fast' ? 'default' : 'complex',
        signal: opts.signal,
        cache: false,
        onText: opts.onText
      });
    }
  };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function httpCode(status) {
  if (status === 400) return 'bad_request';
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'model';
  if (status === 413) return 'too_large';
  if (status === 429) return 'rate_limited';
  if (status === 529 || status === 503) return 'overloaded';
  return 'upstream_error';
}

/**
 * Claude API (Messages API) from the browser, either directly with the
 * user's own key or through a proxy that holds the key.
 * cfg: { apiKey, proxyUrl, proxyToken, models: { thorough, fast } }
 */
export function anthropicProvider(cfg) {
  const models = Object.assign({}, DEFAULT_MODELS, cfg.models || {});
  return {
    kind: 'anthropic',
    label: cfg.proxyUrl ? 'Claude API through your proxy' : 'Claude API with your key',
    images: true,
    maxImages: 4,
    // The API accepts up to 10 MB of base64 per image; stay well under it.
    maxImageBytes: 4.5e6,
    async json(prompt, opts = {}) {
      const content = [];
      for (const b of opts.images || []) {
        content.push({ type: 'image', source: { type: 'base64', media_type: b.type || 'image/jpeg', data: await blobToBase64(b) } });
      }
      content.push({ type: 'text', text: prompt });
      const direct = !cfg.proxyUrl;
      const url = direct ? 'https://api.anthropic.com/v1/messages' : cfg.proxyUrl.replace(/\/+$/, '') + '/v1/messages';
      const headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' };
      if (direct) {
        headers['x-api-key'] = cfg.apiKey;
        headers['anthropic-dangerous-direct-browser-access'] = 'true';
      } else if (cfg.proxyToken) {
        headers['x-stamp-loupe-token'] = cfg.proxyToken;
      }
      const body = {
        model: opts.tier === 'fast' ? models.fast : models.thorough,
        max_tokens: opts.maxTokens || 4096,
        stream: true,
        messages: [{ role: 'user', content }]
      };
      let res;
      try {
        res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal });
      } catch (e) {
        if (e && e.name === 'AbortError') throw { code: 'cancelled' };
        throw { code: 'network', message: String(e && e.message || e) };
      }
      if (!res.ok) {
        let msg = '';
        try { const j = await res.json(); msg = (j && j.error && j.error.message) || ''; } catch (_) { /* not json */ }
        throw { code: httpCode(res.status), message: msg, status: res.status };
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', text = '', stop = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const line = chunk.split('\n').find(l => l.startsWith('data:'));
            if (!line) continue;
            let ev;
            try { ev = JSON.parse(line.slice(5).trim()); } catch (_) { continue; }
            if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
              text += ev.delta.text;
              if (opts.onText) opts.onText({ text, delta: ev.delta.text });
            } else if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) {
              stop = ev.delta.stop_reason;
            } else if (ev.type === 'error') {
              throw { code: ev.error && ev.error.type === 'overloaded_error' ? 'overloaded' : 'upstream_error', message: ev.error && ev.error.message };
            }
          }
        }
      } catch (e) {
        if (e && e.name === 'AbortError') throw { code: 'cancelled' };
        throw e && e.code ? e : { code: 'network', message: String(e && e.message || e) };
      }
      if (!text) throw { code: 'empty_completion' };
      if (stop === 'refusal') throw { code: 'refused' };
      return parseJSONLoose(text);
    }
  };
}

export const AI_ERRORS = {
  // Claude artifact runtime
  not_granted: 'Claude was not allowed for this page, so scanning is off for this visit.',
  sampling_disabled: 'Claude is not available on this account.',
  not_declared: 'Scanning is not available on this version of the page.',
  capability_disabled: 'Scanning is not available in this view.',
  capability_removed: 'Scanning is not available in this view.',
  images_unavailable: 'Photo scanning is not available in this view.',
  session_expired: 'Your Claude session ended. Sign in again, then retry.',
  image_rejected: 'That photo could not be used. Try a JPEG or PNG under 20 MB.',
  prompt_too_large: 'Too much text was sent. Shorten your notes and try again.',
  // Claude API
  auth: 'The API key was refused. Check it in Settings.',
  forbidden: 'This API key is not allowed to use that model. Pick another model in Settings.',
  model: 'That model name was not found. Pick another model in Settings.',
  bad_request: 'The request was refused. Try a smaller photo, then try again.',
  too_large: 'The photo is too large to send. Retake it a little further back.',
  overloaded: 'Claude is busy right now. Wait a minute, then try again.',
  network: 'The connection failed. Check your internet connection, then try again.',
  setup: 'Connect to Claude in Settings to identify stamps.',
  // Both
  rate_limited: 'Too many requests right now. Wait a minute, then try again.',
  refused: 'Claude could not help with this image. Try a clear photo of one stamp.',
  invalid_json: 'The answer came back incomplete. Try again.',
  empty_completion: 'No answer came back. Try again with a clearer photo.',
  upstream_error: 'The connection dropped. Try again.'
};

/** Errors after which the provider will not work again this visit. */
export const PERMANENT = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'images_unavailable'];
