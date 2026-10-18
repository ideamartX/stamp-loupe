# Security

## Supported versions

| Version | Supported |
| ------- | --------- |
| 2.x     | Yes       |
| 1.x     | No. It was a Claude artifact only. Use 2.x. |

## Reporting a vulnerability

Please report security problems privately. Do not open a public issue.

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**. This uses GitHub's private vulnerability reporting.
3. Describe the problem, how to reproduce it, and what an attacker could do.

Never include a real API key, a real collection, or photos that show private details. A maintainer will reply within a week and keep you updated until it is fixed.

## Security model

### Claude API keys

In the standalone app (GitHub Pages or your own host), you can connect with your own Claude API key.

- The key stays in your browser. With "Remember on this device" on, it is stored in `localStorage` under `stamp-loupe.ai`. With it off, the key is kept in `sessionStorage` under `stamp-loupe.ai.secrets` and is gone when you close the tab.
- The key is sent only to `https://api.anthropic.com/v1/messages`, with the `x-api-key` header. Because the call comes from a browser, the app also sends the `anthropic-dangerous-direct-browser-access: true` header that Anthropic requires for browser calls.
- Anyone who can use your browser profile, or any script that runs on the same site, could read a stored key. Use "Remember" only on your own device.
- "Forget key" in Settings removes it.

Recommendations:

- Set a monthly spend limit in the Claude Console for the key you use here.
- Use a key made only for Stamp Loupe, so you can revoke it without affecting anything else.
- Never commit a key to the repository, an issue, or a screenshot.

### Shared deployments: use the proxy

If other people use your copy of the site, do not ask them to share one key in their browsers. Run the proxy in `server/` instead. Your key stays on the server as a secret, and the browser never sees it.

The proxy has these controls (see [server/README.md](server/README.md)):

- `ALLOWED_ORIGINS`: only your site can call it.
- `ACCESS_CODE`: an optional shared code sent in the `x-stamp-loupe-token` header. Requests without it are refused.
- `ALLOWED_MODELS`: requests for any other model are switched to the first allowed model.
- `MAX_TOKENS`: caps output tokens per request.
- `LIMITER`: an optional Cloudflare rate limiting binding, keyed by visitor IP address.
- It forwards only `model`, `max_tokens`, `stream` and `messages`, and only for `POST /v1/messages`. Requests over 12 MB are refused.

The proxy address is stored in the browser's `localStorage` so the app can reconnect. The access code follows the same rule as an API key: `localStorage` only when "Remember on this device" is on, otherwise `sessionStorage` for the tab. Treat the access code as a shared password, not a secret.

### Model output is untrusted data

The AI can be wrong, and a photo could contain text designed to steer it. The app treats every answer as data:

- Answers are parsed as JSON and passed through the normalizers in `src/ai/normalize.js`. Unknown fields are dropped, numbers are checked, and lists are capped.
- All text is inserted with `textContent` through the `h()` helper. The app never uses `innerHTML`.
- Links the user adds to sold prices must be `http` or `https` addresses and open in a new tab with `rel="noopener noreferrer"`.
- Links stored with sold prices are shown only if they start with http:// or https://, so a crafted backup file cannot add a script link.
- CSV exports prefix any cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return with an apostrophe, so spreadsheets do not run it as a formula.

### Claude artifact build

Inside a Claude artifact the app uses the platform's own capabilities: `sample` for Claude, `db` and `assets` for storage, `downloads` for files, and `user` to check who can edit. No API key is involved.

The artifact's database rules keep the `private` collection (who holds a stamp, vault reference, insured value, price paid, seller) readable and writable by editors only. People you share the page with as viewers can see stamps, photos, values and certificate numbers, but not the private records.

### What the app does not do

- No analytics, tracking or advertising scripts.
- No accounts or passwords of its own.
- The camera feed is analysed in the browser. Frames are never uploaded. Only the photo you choose to identify is sent to Claude.
