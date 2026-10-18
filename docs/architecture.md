# Architecture

Stamp Loupe is a static web app written in plain JavaScript modules. It has no framework, no runtime dependencies, and no server of its own. The same source runs in two places:

- **Standalone**: GitHub Pages, any static host, or `localhost`. `npm run build:site` bundles the app into `dist/site/app/` with a service worker, so it installs and works offline. The raw files also run with no build: the browser loads `index.html`, which loads `src/main.js` as an ES module.
- **Claude artifact**: `npm run build` bundles everything into one HTML file, `dist/stamp-loupe.html`, which is published as a Claude artifact.

## Module map

| File | What it does |
| ---- | ------------ |
| `index.html` | App shell: header, Scan and Collection views, the detail and settings sheets, icon symbols. Markers (`app:head`, `app:body`) tell the build what to copy into the single file. |
| `manifest.webmanifest` | Install details: name, colours, icons, home screen shortcuts (`?scan=single`, `?scan=page`) and the Android share target. |
| `sw.js` | Service worker for the built site. Caches the app shell and the hashed bundles, serves them offline, and receives photos shared from the Android gallery. Never touches API calls. |
| `src/main.js` | Entry point. Detects the platform, sets up storage and the AI provider, wires tabs, saving (including updating a saved stamp in place), launch parameters, the update banner, and events between views. |
| `src/styles.css` | All styles. Colour and font tokens at the top, with light and dark values. The camera and corner editor use a fixed dark palette. |
| `src/app/core.js` | Shared state (`S`), platform handles (`P`), per-viewer preferences in `localStorage`, an event hub, selling settings and `effectiveRules()`, constants (eras, statuses, graders), and small render helpers. |
| `src/app/scan.js` | Scan view: subject choice, front and back photo slots, quality chips, the centering line and duplicate note, retake, corner adjust, rotate, the Identify flow, and the example result. Hands over to `page-scan.js` in page mode. |
| `src/app/page-scan.js` | Page mode: loads the page photo, shows the numbered outlines with leave out, fix and add, sorts up to 30 stamps per sheet, renders the sorted list, and saves or identifies single stamps from it. The detection engine loads on first use. |
| `src/app/dupes.js` | Duplicate check: signs each capture and compares it with the collection, and the note shown under the photo. |
| `src/app/records.js` | `stampDoc()`: the shape of a saved stamp, shared by single scans, page sorts and imports. |
| `src/app/progress.js` | The progress bar and error card shared by identification and page sorting. |
| `src/app/importer.js` | Spreadsheet import: header matching in English and German, catalogue numbers, gum codes, values, and private purchase details. Loads on first use. |
| `src/app/pwa.js` | Service worker registration, the update flow, the install prompt, the screen wake lock, and photos shared to the app. |
| `src/app/stamp-view.js` | The stamp card used for a fresh scan and for saved stamps, with Overview, Value, Sell and Record tabs, the sold-price form, the sell planner view, and the listing writer. |
| `src/app/collection.js` | Collection grid, search, filters (including quick sort only and possible copies), sort, selling summary, CSV export, rename, and the detail sheet. Subscribes to the store. |
| `src/app/settings.js` | Settings sheet: Claude connection (standalone), selling defaults, fee and postage overrides, list import, install, data tools (keep data, backup export and import, erase), and about. |
| `src/capture/vision.js` | Pure image analysis: background model, foreground mask, morphology, connected components, convex hull, minimum-area rectangle, quad refinement, homography and perspective warp, blur, exposure and motion measures, the quality checklist, and live guidance. No DOM. |
| `src/capture/still.js` | Photo pipeline in the browser: decode with EXIF orientation, two-pass detection, straighten, focus probe, exposure check, JPEG encoding, rotation, and `fitBytes()` for AI upload limits. |
| `src/capture/live.js` | Live camera with the guide, per-frame analysis, meters, auto-capture, full-resolution still capture where supported, and the review screen. |
| `src/capture/cropper.js` | Corner editor with draggable handles, keyboard nudging and a magnifying loupe. |
| `src/capture/page.js` | Finds every stamp on an album or stockbook page, crops each one upright, and lays the crops out on numbered contact sheets. No DOM in the detector. |
| `src/capture/phash.js` | Picture signatures: a DCT perceptual hash, a mask of which bits are reliable, and a coarse colour code, with comparison and matching. |
| `src/capture/centering.js` | Centering measure ported from stamp-grader (Apache-2.0): the design box from ink projections, margin ratios, a score range and plain words. |
| `src/ai/prompts.js` | Identification, page sort and listing prompts. Each asks for one strict JSON object. |
| `src/ai/normalize.js` | Turns model JSON into safe records (`normalizeId`, `normalizePage`, `normalizeListing`), the value bands, and upgrades records saved by older versions (`upgradeStamp`). |
| `src/ai/providers.js` | AI providers with one shape: `claudeProvider` (artifact `sample` capability) and `anthropicProvider` (Claude Messages API, direct or through a proxy, streamed). Model list, error messages, and permanent error codes. |
| `src/sell/rules.js` | Fee, postage, customs and export figures with the date checked and sources. |
| `src/sell/planner.js` | Pure selling logic: planning price and its source, sold-price statistics, customs origin, the U.S. formal entry check, shipping plan, customs and export permit notes, channel comparison, recommendation, listing facts, and the collection selling summary. |
| `src/store/claude-store.js` | Storage inside a Claude artifact using the `db` and `assets` capabilities, plus write error messages. |
| `src/store/local-store.js` | Standalone storage in IndexedDB, with backup export, import and erase. |
| `src/util/dom.js` | `h()` element builder, icons, toast, copy to clipboard, segmented controls, tabs, form fields, full-screen layers, and the back-button stack (`pushBack`) that lets the phone's back gesture close the top layer. |
| `src/util/format.js` | Text cleanup (`clean()` removes em and en dashes), number and money formatting, dates, median, SHA-256, and `parseJSONLoose()`. |
| `src/util/csv.js` | CSV writing with formula-injection protection, the collection export columns, and a CSV reader for imports (quotes, byte order mark, comma, semicolon or tab). |
| `server/worker.js` | Optional Cloudflare Worker that forwards Messages API calls with a server-side key. |
| `scripts/build-artifact.mjs` | Bundles `src/main.js` with esbuild, inlines the CSS and markup, and writes `dist/stamp-loupe.html`. |
| `scripts/build-site.mjs` | Builds the hosted site in `dist/site/`: the launch page, the app with hashed and split bundles, the service worker's file list, the docs and the single-file build. |
| `site/` | The launch page and its images. |

## Two platforms

`src/main.js` checks for `window.claude.use` when the page boots.

| | Claude artifact | Standalone |
| - | - | - |
| Detected by | `window.claude.use` is a function | anything else |
| AI | `claude.use('sample')`, the viewer's own Claude account | Claude Messages API with the user's key, or a proxy |
| Records | `claude.use('db')` | IndexedDB |
| Photos | `claude.use('assets')`, served at `/_blob/<id>` | IndexedDB `images` store, shown through object URLs |
| Who can write | `claude.use('user')`: `can('data.write')`, then `canEdit()` | always the device owner |
| File downloads | `claude.use('downloads')` | a temporary `<a download>` link |
| Live camera | Not available. Artifacts cannot open the camera, so the app uses the phone's camera app through a file input. | Available on any secure page (`https` or `localhost`) |

Capabilities resolve after the first render. The page draws the example result and the empty collection first, then lights up features as each capability arrives. `P.aiState` (`pending`, `ready`, `setup`, `none`, `noimages`, `blocked`) and `P.storeState` (`pending`, `ready`, `none`) drive the buttons.

## A scan, step by step

1. **Capture.** The user takes a photo (live camera, phone camera app, upload, drag and drop, or paste).
2. **Locate and straighten.** `still.locate()` finds the item in two passes, and `buildCapture()` warps it upright with a small margin. See [capture.md](capture.md).
3. **Quality checks.** `vision.assessQuality()` returns a checklist (edges, focus, light, glare, detail, angle) with a fix for each problem. The scan view shows these as chips. For a single stamp, `centeringFromCanvas()` measures the centering, and `signCapture()` signs the photo and looks for it in the collection.
4. **Prepare images.** `fitBytes()` re-encodes the straightened front (and back, if the provider accepts two images) to fit the provider's byte limit, starting at 2,400 pixels on the long side.
5. **Ask Claude.** `idPrompt()` builds the prompt with the subject (single, block, cover), anything the user typed, and the measured centering. `provider.json()` sends the images first, then the text, and streams the reply so the progress bar moves.
6. **Normalise.** `parseJSONLoose()` extracts the JSON object. `normalizeId()` keeps only expected fields and cleans the text.
7. **Render.** The result gets default pricing (`basis: 'auto'`, no sold prices) and the capture checklist, then `renderScanResult()` draws the stamp card.
8. **Save (optional).** `saveResult()` hashes the photo, uploads the full image, a thumbnail and the back, and writes the stamp record with its signature, and `dupOf` when it matched a saved stamp. When the scan was started from a saved stamp (a quick sort or an imported row), it updates that record instead, keeping its status, notes, sold prices and date added. Later edits on the Value and Sell tabs update the saved record.

## A page sort, step by step

1. **Load.** `loadPagePhoto()` decodes the photo with its EXIF orientation into a working canvas of up to 3,200 pixels on the long side.
2. **Find the stamps.** `findStampsInPhoto()` models the page background, marks what differs from it, and splits that into stamp-sized pieces. Each piece gets an upright outline, a score, and a `review` flag when it may hold two stamps or a torn one. This runs on the device.
3. **Review.** The user leaves stamps out, fixes outlines in the corner editor, or adds missed ones.
4. **Crop and lay out.** `cropItems()` straightens each kept stamp (up to 1,200 pixels), and `contactSheet()` places up to 30 on a numbered sheet.
5. **Ask Claude.** One request per sheet with `pagePrompt()`, on the faster model. The answer is a list keyed by the numbers on the sheet. `normalizePage()` fills any missing number with "Not read" and flags it for a closer look.
6. **Check for copies.** Each crop is signed and matched against the collection.
7. **Show and save.** `renderPageResult()` lists the stamps by page order or value band. Saving writes a normal stamp record with a `sort` field. Identify hands the crop to the single stamp flow, which later updates the same record.

## The stamp record

Saved by `stampDoc()` in `src/app/records.js`, upgraded on load by `upgradeStamp()`.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | string | Document id, such as `s` plus a time-based suffix. Not stored inside the Claude db document. |
| `title` | string | Country, year, denomination, colour and common name. |
| `country`, `year`, `issue`, `denomination`, `color` | string | From the AI. `year` can be a range such as `c. 1870s`. |
| `design`, `printing`, `perforation`, `watermark` | string | From the AI. |
| `format` | object | `kind` (`single`, `pair`, `strip`, `block`, `sheetlet`, `booklet pane`, `cover`, `postcard`, `postal stationery`, or empty), `count` (number or null), `plate`, `markings`, `route` (strings). |
| `origin` | object | `printedIn` (editable; customs origin), `printer`, `aiPrintedIn` (what the AI said). |
| `catalogue` | array | `{ system, number, certainty }`, certainty `likely` or `unsure`. Up to 6. |
| `confidence` | string | `high`, `medium` or `low`. |
| `confidence_note` | string | |
| `alternates` | array | `{ title, how_to_tell }`. Up to 4. |
| `condition` | object | `state`, `centering`, `margins_or_perfs`, `cancel`, `grade` (strings), `faults` (array of strings). |
| `value` | object | `currency` (3 letters), `low`, `high` (numbers or null), `basis` (string), `drivers` (strings), `sources` (`{ kind, detail }`). This is the AI estimate. |
| `checks`, `red_flags` | array of strings | |
| `expertize` | object | `recommended` (boolean), `reason` (string). |
| `story`, `search_query` | string | |
| `subject` | string | `single`, `block` or `cover`, as chosen at capture. Stamps from a page sort are saved as `single`. |
| `inputs` | object | What the user typed: `country`, `perf`, `wmk`, `gum`, `notes`. |
| `pricing` | object | `basis` (`auto`, `comps`, `ai`, `manual`), `manual` (number or null), `catalogue` (`{ amount, currency, edition }` or null), `comps` (array of `{ id, venue, date, price, currency, condition, url }`). |
| `capture` | object or null | `state` (`pass`, `warn`, `fail`) and `checks` (`{ id, state }`) from the photo checks. |
| `measured` | object or null | `centering`: `score`, `low`, `high`, `band`, `words`, the left to right and top to bottom splits, `method` and `confidence`. Measured on the device. |
| `sort` | object or null | Set for a stamp saved from a page sort and not yet identified on its own: `page` (sort id), `n` (its number on the page), `band`, `look`, `at`. |
| `imported` | object or null | Set for a stamp imported from a list: `at`, `file`, `row`. |
| `gum`, `location` | string | Gum and use, and where the stamp is kept. |
| `quantity` | number or null | How many copies the owner has. |
| `sig` | object or null | Picture signature for the duplicate check: `v` (version), `p` (64-bit hash, hex), `m` (reliability mask, hex), `c` (colour code). |
| `dupOf` | string | Id of the saved stamp this one matched when it was saved, or empty. |
| `photo`, `thumb`, `back` | string or null | Image ids in the store. |
| `photoHash` | string | SHA-256 of the saved front photo. |
| `status` | string | `keep`, `sell`, `listed`, `sold`, `expert`, `vault`. |
| `notes` | string | Up to 4,000 characters. |
| `grader`, `certNumber`, `grade`, `certDate` | string | Certificate details. Visible to anyone the collection is shared with. |
| `fingerprint` | string | SHA-256 provenance fingerprint, or empty. |
| `addedAt`, `updatedAt` | string | ISO dates. |

**Private record** (one per stamp, same id): `custodian`, `vaultRef`, `insured`, `paid`, `boughtFrom`, `updatedAt`, all strings.

**Collection settings**: `{ name, updatedAt }`.

The planning price is never stored. `planningPrice()` works it out from `pricing` and `value` each time.

## Storage

**Standalone (IndexedDB database `stamp-loupe`, version 1):**

| Store | Key | Holds |
| ----- | --- | ----- |
| `stamps` | `id` | Stamp records. |
| `private` | `id` | `{ id, data }` where `data` is the private record. |
| `settings` | `id` | `{ id: 'collection', data }`. |
| `images` | `id` | `{ id, blob, type }`. |

Views subscribe through `subscribeStamps`, `subscribeSettings` and `subscribePrivate`. After each write the store re-reads and notifies. Backups (`exportAll`) include every store, with images as base64.

Per-viewer preferences (subject, depth, currency, sort, selling settings, Claude connection, last backup date) live in `localStorage` under keys that start with `stamp-loupe.`. An API key or proxy access code saved without "Remember" lives in `sessionStorage` under `stamp-loupe.ai.secrets`.

**Claude artifact:**

| Path | Holds |
| ---- | ----- |
| `stamps/<id>` | Stamp records. |
| `private/<id>` | Private records. The artifact's rules let only editors read or write this path. |
| `settings/collection` | Collection settings. |
| assets | Photos, by id. |

## The AI contract

- Prompts end with "Reply with only this JSON object" and a filled-in example schema. They ask for plain short sentences and no em or en dashes.
- Images come before text in the request.
- `anthropicProvider` posts to `/v1/messages` with `stream: true` and reads server-sent events. It adds the text deltas together and reports progress through `onText`.
- `parseJSONLoose()` strips code fences, then tries the whole text, then the span from the first `{` to the last `}`.
- Errors reject with `{ code, message }`. Codes include `auth`, `forbidden`, `model`, `bad_request`, `too_large`, `rate_limited`, `overloaded`, `network`, `refused`, `invalid_json`, `empty_completion`, `cancelled`, and the artifact runtime's own codes. `AI_ERRORS` maps each to a plain message. Codes in `PERMANENT` turn scanning off for the visit.
- Default models: Claude Opus 5.5 for thorough scans and Claude Sonnet 5.5 for faster scans and listings. Model names change over time; the list is in `MODELS` in `src/ai/providers.js`.

## The single-file build

`scripts/build-artifact.mjs`:

1. Reads `index.html` and copies the parts between the `app:head` and `app:body` markers.
2. Bundles `src/main.js` and its imports with esbuild into one script (IIFE, ES2020). Add `--minify` for a smaller file.
3. Inlines `src/styles.css`.
4. Writes `dist/stamp-loupe.html` without `<html>`, `<head>` or `<body>` tags, because the artifact host adds its own.

Page mode and the importer are loaded with dynamic `import()`. In this build esbuild folds them into the one script, so the artifact stays a single file.

## The hosted build

`scripts/build-site.mjs` writes `dist/site/`:

1. Bundles `src/main.js` as ES modules with code splitting, minified and named by content hash. Page mode and the importer become separate chunks that load on first use.
2. Bundles and minifies `src/styles.css` the same way.
3. Copies `index.html` to `app/index.html`, pointed at the built files, with `modulepreload` links for the first chunks.
4. Copies the manifest and icons, then writes `app/sw.js` with the list of files to cache and a version made from their contents. A new build means a new version, and the app shows the update banner.
5. Copies the docs, the single-file build and the launch page from `site/`.

Only this build defines `__SL_BUILD__`, which turns on the service worker. The raw files never register one, so local edits always show.

## Testing

- `npm test` runs Node's built-in test runner on `tests/*.test.mjs`.
- `tests/vision.test.mjs` draws synthetic stamps (`tests/helpers/synth.mjs`) and checks detection, rotation, keystone, edge-touch, warp size, blur ordering, glare and darkness, the checklist, and guidance codes.
- `tests/planner.test.mjs` checks planning price rules, customs origin, shipping steps, the U.S. duty effect, that every channel adds up, recommendations, customs notes, and the selling summary.
- `tests/format.test.mjs` checks text cleanup, money formatting, JSON parsing, median, CSV escaping, and the normalizers.
- `tests/page.test.mjs` draws synthetic album and stockbook pages (`tests/helpers/synth-page.mjs`) and checks that every stamp is found in reading order, that touching, cut-off and oversized pieces are handled or flagged, and the contact sheet layout.
- `tests/phash.test.mjs` checks that a signature is compact and fast, that a second photo of the same stamp and a quarter turn still match, that different designs never match as the same, and that a recoloured design is only similar.
- `tests/centering.test.mjs` checks the measure on drawn stamps with known margins, the darkness method for black designs, refusal on blank paper, and the wording.
- `tests/import.test.mjs` checks the CSV reader, header matching in English, German and Colnect style, catalogue numbers and gum words, and that rows from Colnect and Stamp Loupe exports import with nothing lost.
- `tests/vision.test.mjs` also covers `frameScore()`, which ranks live frames for the sharpest-frame capture.
- Browser behaviour (camera, IndexedDB, the service worker, rendering) is tested by hand or with Playwright and a mocked API. [capture.md](capture.md) explains how to feed Chromium a video as a fake camera.
