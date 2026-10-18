# Stamp Loupe proxy

The app can call the Claude API straight from the browser with each person's own API key. That works well when only you use it.

If you put Stamp Loupe on the web for other people, you probably do not want each visitor to need a key. The proxy solves that. It is a small Cloudflare Worker that holds your API key as a secret and forwards the app's requests to the Claude API. The browser never sees the key.

You pay for every scan made through your proxy. Read "Limit what you spend" below before you share it.

## What it does

- Accepts `POST /v1/messages` only. Everything else gets a 404.
- Accepts requests only from the sites in `ALLOWED_ORIGINS`.
- Optionally requires an access code in the `x-stamp-loupe-token` header.
- Forwards only `model`, `max_tokens`, `stream` and `messages`. Any other field is dropped.
- Uses only the models in `ALLOWED_MODELS`. A request for another model gets the first one on the list.
- Caps output at `MAX_TOKENS` per request.
- Refuses request bodies over 12 MB.
- Streams the reply straight back to the app.

## Deploy with Cloudflare Workers

You need a Cloudflare account (the free plan is enough to start), Node.js, and a Claude API key from the Claude Console.

1. Open a terminal in this `server/` folder.
2. Copy the example settings:

   ```sh
   cp wrangler.toml.example wrangler.toml
   ```

3. Edit `wrangler.toml`. Set `ALLOWED_ORIGINS` to the address of your Stamp Loupe site, with no trailing slash. For GitHub Pages that is `https://YOUR-USERNAME.github.io`. List more than one address with commas, for example a custom domain as well. Adjust `ALLOWED_MODELS` and `MAX_TOKENS` if you want.
4. Sign in to Cloudflare:

   ```sh
   npx wrangler login
   ```

5. Store your API key as a secret. Wrangler asks you to paste it:

   ```sh
   npx wrangler secret put ANTHROPIC_API_KEY
   ```

6. Optional: set an access code that people must enter in the app:

   ```sh
   npx wrangler secret put ACCESS_CODE
   ```

7. Deploy:

   ```sh
   npx wrangler deploy
   ```

   Wrangler prints the worker's address, such as `https://stamp-loupe-proxy.YOUR-SUBDOMAIN.workers.dev`.

`wrangler.toml` is listed in `.gitignore`, so your settings stay out of the repository. Secrets are never stored in that file.

## Point the app at it

1. Open Stamp Loupe and choose Settings.
2. Under "Connect to Claude", choose **A proxy server**.
3. Paste the worker address into **Proxy address**. Do not add `/v1/messages`; the app adds it.
4. If you set an access code, enter it in **Access code**.
5. Choose **Save and test**.

The app keeps the proxy address in the browser so it can reconnect next time. It keeps the access code only for the open tab, unless you turn on "Remember on this device".

## Limit what you spend

Every scan through the proxy is billed to your API key. A scan typically costs a few cents, more with the thorough model or a photo of the back. Current prices are on the [Claude models overview](https://platform.claude.com/docs/models/overview).

- Set a monthly spend limit in the Claude Console for the key the proxy uses. Make a key just for the proxy so you can revoke it on its own.
- Set `ACCESS_CODE` and share it only with people you trust. Change it if it leaks.
- Keep `ALLOWED_MODELS` to the models you are willing to pay for. Put the cheapest suitable model first.
- Add rate limiting. The worker checks for a Cloudflare rate limiting binding named `LIMITER` and, if present, limits each visitor IP address. The binding syntax has changed over time, so follow Cloudflare's current Workers documentation to add it.

## Other hosts

Nothing in the app is tied to Cloudflare. Any server works if it:

- accepts `POST /v1/messages` with a JSON body from your site's origin, with CORS headers that allow `content-type`, `anthropic-version` and `x-stamp-loupe-token`;
- forwards the body to `https://api.anthropic.com/v1/messages` with your key in the `x-api-key` header and `anthropic-version: 2023-06-01`;
- streams the response back unchanged.

`worker.js` is short and commented, so it is a good template for another platform.
