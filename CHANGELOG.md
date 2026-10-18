# Changelog

All notable changes to Stamp Loupe are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

Fee, postage and customs figures in `src/sell/rules.js` change over time. Record every update to them here, with the date the figure was checked.

## [Unreleased]

## [2.1.0] - 2026-10-17

### Added

- Page mode: photograph a whole album or stockbook page. Every stamp on it is found on the device, outlined and numbered. Tap a stamp to leave it out or fix its outline, or add one that was missed. Up to 30 stamps go to Claude on one numbered sheet for a quick sort: an identification, a value band and a flag for stamps worth a closer look. Identify a flagged stamp on its own with one tap, and save the rest as a list.
- Duplicate check: every photo gets a small picture signature. Before you spend an identification, the app tells you when the stamp looks like one already in your collection. Page sorts mark stamps you already own, and the collection has a "Possible copies" filter.
- Measured centering, ported from stamp-grader: the design's position between the margins, shown as a score range, sent to Claude with the photo, and saved with the stamp.
- Sharper auto-capture: the live camera keeps the sharpest frame of the hold instead of the last one, and keeps the video frame when the sensor still comes out softer.
- Import a list from a spreadsheet: CSV from Excel, Numbers or Google Sheets, Colnect exports, StampManage, or a Stamp Loupe export. Columns are matched in English and German, catalogue numbers and gum codes are understood, and anything unmatched is kept in the stamp's notes. Purchase details go to the private record.
- Record fields: gum and use, how many you have, and where it is kept.
- Stamps saved from a page sort or an import can be identified later, and the result updates the same record.
- More price research links: Philasearch, Catawiki, Colnect search, the Canadian Stamp Identifier for Canadian stamps, and the National Postal Museum for U.S. stamps. eBay links now use the stamp category, newest sales first.
- Installable web app: a service worker for offline use, app icons, home screen shortcuts, an "Update ready" banner, an install section in Settings, and, on Android, sharing photos from the gallery straight into the app.
- A launch page in `site/`, with the app moved to `/app/` on GitHub Pages.
- NOTICE.md and LICENSES/ for the code ported from stamp-grader and the facts reused from other projects.

### Changed

- On phones, the Scan and Collection tabs sit in a bar at the bottom of the screen, buttons and chips are at least 44 pixels tall, and the Identify button stays in view once a photo is ready.
- The phone's back gesture closes the open sheet or camera instead of leaving the app.
- Hover styles apply only where there is a mouse or trackpad, so a tapped button on a phone no longer stays highlighted.
- The screen stays on while the live camera is open.
- The hosted app is bundled and minified: about 68 KB compressed on first load instead of 22 separate files. Page mode and the list importer load when first used.
- Collection cards render lazily, so long collections scroll smoothly.

### Fixed

- A photo shown in the current result is no longer released when you take the next photo.

## [2.0.0] - 2026-10-17

### Added

- Guided capture for single stamps, blocks and strips, and covers. Each photo is straightened and cropped automatically, then checked for edges, focus, light, glare, detail and camera angle, with a plain fix for anything that fails.
- Live camera with a cheque-style guide and auto-capture, where the browser allows camera access (any HTTPS site, such as GitHub Pages). It tells you to move closer, centre, straighten or hold steady, and takes the photo when everything holds for a moment. On Chrome for Android it takes a full-resolution still from the sensor.
- Corner editor with a magnifying loupe, for placing corners on perforation tips by hand.
- Photo of the back, sent with the front when the AI provider accepts two images.
- Value tab: a planning price with its source shown (sold prices, AI estimate, or your own price), the AI's stated basis, a catalogue value you enter, a log of sold prices with median and range, and links to find sold prices.
- Sell planner: what you would receive from eBay.ca, HipStamp, Delcampe, an auction house, a dealer, or a lot, with every fee shown; a best-fit recommendation; shipping by value; customs and export notes by buyer location, including the U.S. 50% duty on Canadian-origin stamps that took effect on 2026-08-22, the formal U.S. customs entry such mail needs from 2026-10-22, and the Canadian cultural property export permit that older covers and sheets over $1,000 may need; and a "Printed in" field, because customs origin follows where a stamp was printed.
- Fee, postage and customs figures checked on 2026-10-17, each with its source, and editable in Settings.
- Listing writer for eBay.ca, HipStamp, Delcampe and auction house consignment, with shipping and customs text built from the planner's facts.
- Collection selling summary for items marked for sale or listed, with an export of the selling list.
- Standalone mode: connect with your own Claude API key or through a proxy, and keep the collection in the browser (IndexedDB) with backup export and import, a request to keep data on the device, and backup reminders.
- Optional Cloudflare Worker proxy in `server/` that keeps the API key on the server.
- "Export sharing CSV" in the standalone app, which leaves out custody and purchase details.
- The API key and proxy access code are kept only for the open tab unless "Remember on this device" is on.
- Single-file build (`npm run build`) for publishing as a Claude artifact.
- Node tests for the vision engine, the sell planner, the normalizers and CSV export.
- GitHub Actions workflows for tests and GitHub Pages.

### Changed

- The stamp card is organised into tabs: Overview, Value, Sell, and Record for saved stamps.
- Settings moved into its own panel, with the Claude connection, selling defaults, editable fees and postage, and data tools.
- Records saved by version 1 are upgraded on load. Nothing needs to be migrated by hand.

## [1.0.0] - 2026-10-16

### Added

- First version, published as a Claude artifact.
- Identify a stamp from a photo, with a condition summary and a value range.
- Listing writer.
- Collection with search, filters, statuses, and CSV export.
- Provenance records with certificate details, private custody details for editors, and a SHA-256 provenance fingerprint.

[Unreleased]: https://github.com/OWNER/stamp-loupe/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/OWNER/stamp-loupe/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/OWNER/stamp-loupe/releases/tag/v1.0.0
