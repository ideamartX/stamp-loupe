// Stamp Loupe proxy for the Claude API, as a Cloudflare Worker.
//
// Use it when you host Stamp Loupe for other people and do not want each
// visitor to paste in their own API key. Your key stays on the server as a
// secret. The worker only forwards Messages API requests, only from the
// sites you list, only to models you allow, with a cap on output tokens.
//
// Setup: see server/README.md.

const DEFAULT_MODELS = 'claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5';
const MAX_BODY_BYTES = 12 * 1024 * 1024;

function list(value, fallback) {
  return String(value || fallback || '').split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeaders(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, anthropic-version, x-stamp-loupe-token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function reply(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'content-type': 'application/json' }, cors) });
}

function error(type, message, status, cors) {
  return reply({ type: 'error', error: { type, message } }, status, cors);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = list(env.ALLOWED_ORIGINS);
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/v1/messages') return error('not_found_error', 'Not found.', 404, cors);
    if (!allowed.includes(origin)) return error('permission_error', 'This site is not allowed to use the proxy.', 403, cors);
    if (env.ACCESS_CODE && request.headers.get('x-stamp-loupe-token') !== env.ACCESS_CODE) {
      return error('authentication_error', 'The access code is missing or wrong.', 401, cors);
    }
    if (!env.ANTHROPIC_API_KEY) return error('api_error', 'The proxy has no API key set.', 500, cors);

    // Optional per-visitor rate limit (Cloudflare rate limiting binding named LIMITER).
    if (env.LIMITER && typeof env.LIMITER.limit === 'function') {
      const key = request.headers.get('CF-Connecting-IP') || 'anonymous';
      const { success } = await env.LIMITER.limit({ key });
      if (!success) return error('rate_limit_error', 'Too many requests. Wait a minute, then try again.', 429, cors);
    }

    const size = Number(request.headers.get('content-length') || 0);
    if (size > MAX_BODY_BYTES) return error('request_too_large', 'The request is too large.', 413, cors);

    let body;
    try { body = await request.json(); } catch (_) { return error('invalid_request_error', 'The request body is not JSON.', 400, cors); }
    if (!body || !Array.isArray(body.messages)) return error('invalid_request_error', 'Missing messages.', 400, cors);

    const models = list(env.ALLOWED_MODELS, DEFAULT_MODELS);
    const cap = Number(env.MAX_TOKENS || 4096);
    // Forward only what Stamp Loupe sends. Nothing else reaches the API.
    const clean = {
      model: models.includes(body.model) ? body.model : models[0],
      max_tokens: Math.max(1, Math.min(Number(body.max_tokens) || cap, cap)),
      stream: body.stream === true,
      messages: body.messages
    };

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(clean)
    });

    const headers = new Headers(cors);
    headers.set('content-type', upstream.headers.get('content-type') || 'application/json');
    headers.set('cache-control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
