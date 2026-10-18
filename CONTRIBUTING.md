# Contributing to Stamp Loupe

Thank you for helping. This guide covers how to run the app, how the code is laid out, and what a good pull request looks like.

## Run it locally

You need Node.js 20 or newer and Python 3 (for the simple web server).

```sh
npm install        # installs esbuild, the only dev dependency
npm test           # runs the Node tests in tests/
npm run serve      # serves the repo at http://localhost:8080
npm run build      # writes dist/stamp-loupe.html, the single-file build
```

Open http://localhost:8080 in a browser. `localhost` counts as a secure page, so the live camera works there if your computer has a camera.

To identify stamps you need a Claude API key. Open Settings in the app, choose "My API key", and paste it in. See [docs/deployment.md](docs/deployment.md) for the other ways to connect.

## Project layout

```
index.html               App shell and markup for the standalone site
manifest.webmanifest     Lets phones add the site to the Home Screen
assets/                  App icons
site/                    The launch page
manifest.webmanifest     Install details for the hosted app
sw.js                    Service worker (built site only)
src/main.js              Entry point. Detects Claude artifact or standalone, wires everything
src/styles.css           All styles, with light and dark tokens
src/app/                 Views: scan, page sort, stamp card, collection, settings, import, shared state
src/capture/             Photo pipeline, live camera, corner editor, vision engine,
                         page detection, centering, picture signatures
src/ai/                  Prompts, response normalizers, AI providers
src/sell/                Fee, postage and customs figures, and the sell planner
src/store/               Storage adapters: Claude artifact and IndexedDB
src/util/                DOM helpers, formatting, CSV
server/                  Optional Cloudflare Worker proxy for the Claude API
scripts/build-artifact.mjs  Bundles everything into one HTML file
scripts/build-site.mjs   Builds the hosted site: launch page, app, docs
tests/                   Node tests and synthetic test images
docs/                    User and developer documentation
```

[docs/architecture.md](docs/architecture.md) has a line for every file and the stamp record schema.

## Code conventions

- Plain ES modules. No framework and no runtime dependencies. The browser loads `src/main.js` directly when you run `npm run serve`, and the site build bundles it for GitHub Pages.
- Keep logic pure where you can. `src/capture/vision.js`, `detectStamps()` in `src/capture/page.js`, `src/capture/phash.js`, `src/capture/centering.js` and `src/sell/planner.js` take plain data and return plain data, with no DOM access. That is why they can run in Node tests.
- Load large, rarely used parts with dynamic `import()`, as page mode and the importer do, so the first load stays small.
- Hover styles go inside `@media (hover: hover)`, so a tapped button on a phone does not stay highlighted.
- Build DOM nodes with the `h()` helper in `src/util/dom.js`. Do not use `innerHTML`. The `h()` helper refuses an `html` property on purpose. Model output and user input are set as text only.
- Treat model output as untrusted data. Anything from the AI goes through `src/ai/normalize.js` before it is shown or stored.
- Every form control gets a stable `id`. Stamp cards use a prefix (`rs-` for a fresh scan, `dt-` for the detail sheet) so ids stay unique when both are on the page.
- Colours come from the tokens at the top of `src/styles.css`. Add a token in all three theme blocks if you need a new colour.
- Respect `prefers-reduced-motion`, give every control a visible focus state, and test at phone width (about 390 px).

## Updating fees, postage and customs figures

The Sell planner reads its figures from `src/sell/rules.js`. These figures change, so each update needs care.

1. Check the figure against the official source (the marketplace's fee page, Canada Post's rate page, a government notice).
2. Change the value in `RULES`.
3. Set `RULES.asOf` to the date you checked it.
4. Add or update the entry in `RULES.sources`. Each entry is `{ label, url, checked }`: the page title, its address, and the date you checked it. Settings lists these under "Where these figures come from".
5. Update [docs/selling-rules.md](docs/selling-rules.md) if the explanation changes.
6. Add a line to [CHANGELOG.md](CHANGELOG.md) under "Unreleased".
7. Run `npm test`. The planner tests check that every channel adds up.

Users can override any figure in Settings, so the defaults should be the plain published rates, not a guess at someone's discount.

## Writing for the interface

Words in the app follow these rules:

- No em dashes or en dashes. Use commas, colons or periods.
- Plain, short sentences. Say what happens: a button says "Save notes", and the toast says "Notes saved".
- Name things the way a collector would. Say "sold prices", not "comps data".
- Errors say what went wrong and how to fix it, without apologising.
- No hype words, no stacked lists of three for effect, no filler openings.

The prompts in `src/ai/prompts.js` ask the model to follow the same rules, and `clean()` in `src/util/format.js` removes any dashes that slip through.

## Adding a test image

The vision tests draw their own images, so no binary files are needed.

- Use `renderStamp()` in `tests/helpers/synth.mjs` to draw a perforated stamp at any four corners (`rotatedQuad()` helps with rotation).
- Use `blurImage()`, `addGlare()` and `scaleBrightness()` to make it harder.
- For page mode, `tests/helpers/synth-page.mjs` draws album and stockbook pages with stamps in rows, touching pairs and stamps cut off at the edge.
- Assert on what matters: corner error in pixels, the checklist state, or a guidance code.

If you need a real photo to reproduce a bug, describe it in the issue instead of committing it. Photos of stamps can show addresses, signatures or other private details.

## Testing the live camera without a camera

Chromium can play a video file as a fake camera:

```sh
chromium --use-fake-ui-for-media-stream --use-fake-device-for-media-stream \
  --use-file-for-fake-video-capture=/path/to/stamp.y4m http://localhost:8080
```

[docs/capture.md](docs/capture.md) explains what the guide checks.

## Pull request checklist

- [ ] `npm test` passes.
- [ ] `npm run build` and `npm run build:site` succeed.
- [ ] You tried the change at phone width and in dark mode.
- [ ] New interface text follows the writing rules above.
- [ ] Changed figures in `rules.js` have a source, a date, and a CHANGELOG line.
- [ ] No API keys, real collection data or private photos in the diff.
- [ ] Docs are updated if behaviour changed.

By contributing, you agree that your work is released under the [MIT License](LICENSE).
