# Deploying Stamp Loupe

Stamp Loupe is a static site. It needs no database server. `npm run build:site` makes an optimized copy in `dist/site/`:

- `/` is the launch page, from the `site/` folder.
- `/app/` is the app. Its code is bundled, minified and named by content, so browsers can keep it cached. It installs to a phone's home screen and opens with no connection.
- `/docs/` is this documentation.
- `/stamp-loupe.html` is the single-file build for publishing as a Claude artifact.

The raw files also run as they are, with no build. That is handy while you work on the code: run `npm run serve` and open `http://localhost:8080`. This copy never installs a service worker, so it always shows your latest edits.

The site must be served over HTTPS. Browsers allow camera access and service workers only on secure pages. `localhost` counts as secure while you test. Every option below gives you HTTPS.

## Option A: GitHub Pages

This repository includes a workflow, `.github/workflows/pages.yml`, that tests, builds and publishes the site on every push to `main`.

1. Push the repository to GitHub.
2. Open the repository's **Settings**, then **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main`, or run the "Deploy to GitHub Pages" workflow from the **Actions** tab.

The launch page appears at `https://USERNAME.github.io/stamp-loupe/` and the app at `https://USERNAME.github.io/stamp-loupe/app/`. Put your GitHub username in place of `USERNAME`, and your repository name if you renamed it.

The single-file build is at `https://USERNAME.github.io/stamp-loupe/stamp-loupe.html`, so people can download it.

GitHub Pages is free for public repositories. The action versions in the workflow were current in October 2026; GitHub releases new major versions from time to time.

To preview the built site on your own computer, run `npm run build`, then `npm run build:site`, then `npm run serve:site`, and open `http://localhost:8080/app/`.

## Option B: a custom domain or subdomain

You can serve the same site from your own address, such as `stamps.example.com`.

1. In **Settings**, then **Pages**, enter the domain under **Custom domain** and save. This records the domain for the Pages site. (With the Actions workflow, set it in Settings rather than relying on a `CNAME` file in the repository.)
2. At your domain registrar or DNS host, add the records GitHub asks for:
   - for a subdomain such as `stamps.example.com`, a `CNAME` record pointing to `USERNAME.github.io`;
   - for a root domain such as `example.com`, the `A` and `AAAA` records listed in GitHub's Pages documentation.
3. Wait for DNS to update. This can take from minutes to a day.
4. Back in **Settings**, then **Pages**, tick **Enforce HTTPS** once it becomes available.

A subdomain of a domain you already own costs nothing extra. If you use the proxy, add the new address to its `ALLOWED_ORIGINS`.

## Option C: any static host

The built site also runs on Netlify, Cloudflare Pages, Vercel, an S3 bucket behind a CDN, or your own web server.

- Run `npm ci`, then `npm run build`, then `npm run build:site`.
- Upload the contents of `dist/site/`, keeping the folder structure. On a host that builds for you, set the build command to `npm run build && npm run build:site` and the publish folder to `dist/site`.
- Make sure the host serves `.js` files with a JavaScript content type, which all common hosts do.
- Keep the cache time for `app/sw.js` and `app/index.html` short, a few minutes at most, so updates reach people quickly. GitHub Pages does this already. The files in `app/build/` never change once published, so they can be cached for a year.
- Turn on HTTPS.

## Installing the app and working offline

- **Android, in Chrome:** open the app page, then choose **Install app** or **Add to Home screen** from the menu.
- **iPhone and iPad, in Safari:** open the app page, tap **Share**, then **Add to Home Screen**.
- After the first visit, the app opens with no connection. Taking and checking photos, the collection and the selling planner all work offline. Identifying a stamp and writing a listing need a connection, because they call Claude.
- On Android, the installed app appears in the share sheet. Share a photo from your gallery to Stamp Loupe to scan it.
- When a new version is published, the app downloads it in the background and offers to switch. Nothing reloads by surprise.
- The service worker passes every request to Anthropic, and to a proxy, straight to the network. It does not read or store them.

## The launch page's sign-up form

The launch page has a form for launch news. It stays closed until you fill in the `SITE` settings near the end of `site/index.html`:

- `kitFormId`: the number in your Kit form's address. Any list service that accepts a plain form post with an `email_address` field works.
- `maker`: your name or business name. The consent text names you as the sender.
- `mailingAddress`: a postal box is enough.
- `contactEmail`: shown with the consent text.

Canada's anti-spam law (CASL) asks for the sender's name, a mailing address, and an email or website on the form. The form will not open until `kitFormId`, `maker` and `mailingAddress` are set. Until then, the page says the list is not open yet.

## Connecting Claude

Identifying stamps and writing listings use the Claude API. In the app, open **Settings**, then **Connect to Claude**.

**Your own key.** Best when only you use the site.

1. Create an API key in the Claude Console, and set a monthly spend limit for it.
2. In Settings, choose **My API key**, paste the key, and choose **Save and test**.
3. Turn on **Remember on this device** only on your own device. Otherwise the key is forgotten when you close the tab.

The key stays in your browser and goes only to Anthropic. See [SECURITY.md](../SECURITY.md).

**A proxy.** Best when other people use your site. Your key stays on a server, and visitors need no key. You pay for their scans. Follow [server/README.md](../server/README.md) to deploy the Cloudflare Worker, then choose **A proxy server** in Settings and enter its address (and access code, if you set one).

You can choose which model handles thorough scans and faster scans in Settings. The defaults are Claude Opus 5.5 for thorough scans and Claude Sonnet 5.5 for faster scans and listings. Model names and prices change, so check the list in Settings against Anthropic's current models.

### What it costs

A scan sends one or two photos and about a page of instructions, and gets back a page of JSON. With the models above, that is typically a few cents of API usage per scan. It costs more with a stronger model or a photo of the back, and less with a faster model. Writing a listing sends text only and costs less than a scan. Check current prices on the [Claude models overview](https://platform.claude.com/docs/models/overview).

## The Claude artifact version

Inside Claude, the app needs no API key and no hosting. It uses the viewer's own Claude account and stores the collection with the artifact.

1. Run `npm install`, then `npm run build`. This writes `dist/stamp-loupe.html`.
2. Publish that file as a Claude artifact.
3. Declare these capabilities when you publish:
   - `sample` with images allowed, for identifying stamps and writing listings;
   - `db`, with rules so everyone the page is shared with can read the `stamps` and `settings` paths, only editors can write them, and only editors can read or write the `private` path;
   - `assets`, for photos;
   - `downloads`, for CSV exports;
   - `user`, to tell editors from viewers.
4. Open the artifact. The first scan asks the viewer to allow Claude.

Inside an artifact the camera cannot be opened directly, so "Take photo" uses the phone's camera app, and the photo is straightened and checked after you take it. See [capture.md](capture.md).

When you publish a new build to the same artifact, keep the same capabilities so the collection and its rules carry over.
