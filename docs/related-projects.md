# Related projects

Open-source work that Stamp Loupe can learn from, reuse, or improve on. Every entry was checked on **October 17, 2026**. Star counts and dates change, so treat them as a snapshot. The last section says what version 2.1 took from each.

License key:
- **OK**: the code can be used in an MIT project. Keep any Apache or BSD notices.
- **Ideas only**: GPL, AGPL, an unclear license, or no license. Learn from the approach, but do not copy the code.

## Stamp and philately software and data

**[stamp-grader](https://github.com/DanMat/stamp-grader)**
- Apache-2.0, OK. New, with a PyPI release in August 2026.
- Scores centering from a photo and reports the perforation gauge on each axis. It refuses, with a stated reason, when it cannot measure.
- **For Stamp Loupe:** port the centering measure to run on the straightened crop. Its README says scores drift a few percent between photos, so show a range rather than one number.

**[philately-tool](https://github.com/code2k13/philately-tool)**
- Apache-2.0, OK. Updated January 2026.
- Crops stamps from album scans with a YOLO model trained on SAM masks and generated album pages. Stores CLIP embeddings in SQLite for photo and text search.
- **For Stamp Loupe:** the best starting point for album page mode, and a working example of image search over a collection.

**[Vitrine-hub](https://github.com/count-core/Vitrine-hub)**
- MIT, OK. Beta, updated October 2026.
- A self-hosted collection app with a German interface. Several AI providers return JSON for each item: box, year, face value and a suggested Michel number.
- **For Stamp Loupe:** its provider adapters, its price-research links (eBay sold, Delcampe, Philasearch, Catawiki, Colnect), and its median and range summary of the owner's own price records. That last one matches our Sold prices list.

**[Canadian-Stamp-Identifier](https://github.com/adrianspeyer/Canadian-Stamp-Identifier)**
- AGPL-3.0, ideas only. Its images are excluded from the license. Updated October 2026.
- A plain JavaScript site over a versioned JSON catalogue of 3,488 Canadian stamps, in English and French, with text search.
- **For Stamp Loupe:** a model for a bilingual Canadian reference. Note its image-permission rules and its choice not to publish Scott numbers, a licensing caution worth reading. Stamp Loupe adds what it lacks: photo matching and values.

**[Tellico](https://invent.kde.org/office/tellico)**
- GPL, ideas only. Version 4.2.1.
- A desktop collection manager with a stamp template.
- **For Stamp Loupe:** a sensible baseline of fields: denomination, currency, country, year, colour, grade, cancelled, hinged, centering, gummed, purchase price and date, and location.

**[WorldCovers](https://github.com/CoverCensus/worldcovers)**
- GPL-3.0, ideas only. Updated August 2026.
- A catalogue of stampless covers and postal markings, with contributor submissions and editor review.
- **For Stamp Loupe:** a model if the project ever accepts community catalogue edits.

**[Smithsonian Open Access](https://www.si.edu/openaccess/devtools)** (including the National Postal Museum)
- CC0 where marked. Refreshed weekly.
- An API and a JSON dump. Object pages carry Scott numbers in their descriptions and CC0 image labels.
- **For Stamp Loupe:** a legal source of reference images for U.S. stamps. Check the [rights page](https://postalmuseum.si.edu/rights-and-reproductions): USPS holds copyright on U.S. stamps issued after December 31, 1978.

**[Detect Postage Stamp](https://universe.roboflow.com/jackwildgooglecom/detect-postage-stamp)** (Roboflow)
- CC BY 4.0, OK with credit. November 2024.
- Several hundred to about a thousand phone photos with one class. The page's counts conflict. The hosted model reports 80% mAP@50.
- **For Stamp Loupe:** enough to start a small detector for several stamps in one photo. Expect to add your own labels.

## Browser capture and auto-capture

Stamp Loupe's engine already finds the stamp against its background, fits and warps the corners, and scores blur, light, glare and motion (see [capture.md](capture.md)). These projects matter most as patterns.

**[jscanify](https://github.com/puffinsoft/jscanify)**
- MIT, OK. About 1,800 stars, version 1.4.3 from July 2026.
- Document detection with OpenCV.js, live highlighting, and extraction with glare suppression.
- **For Stamp Loupe:** study the glare suppression. Skip the multi-megabyte OpenCV.js dependency.

**[scanic](https://github.com/marquaye/scanic)**
- MIT, OK. Version 1.7.1 from October 15, 2026.
- A scanner with no OpenCV, using a Rust and WebAssembly core under 100 KB. An optional ONNX detector loads on demand.
- **For Stamp Loupe:** move the hottest loops to WebAssembly for slow phones, and load a learned detector only when the classic one fails.

**[docuSnap](https://github.com/petermartis/docuSnap)**
- License unclear, ideas only.
- Live document capture in plain JavaScript. It smooths corners over time, needs ten good frames in a row and a short countdown, then keeps the best of the last ten full-resolution frames. Best is scored 40% sharpness, 30% edge confidence, 15% brightness and 15% low glare.
- **For Stamp Loupe:** write our own best-of-recent-frames capture. It would pick the sharpest frame instead of the one at the moment of capture.

## Coin and card identification

**[Coin-CLIP](https://github.com/breezedeus/Coin-CLIP)**
- Apache-2.0 code, OK. The weights' license is not stated. December 2023.
- CLIP fine-tuned on more than 340,000 coin images, with a retrieval tool.
- **For Stamp Loupe:** the recipe for tuning an image encoder on stamps and exporting it for the browser. It publishes no accuracy figures, so measure your own.

**[OpenNumismat](https://github.com/OpenNumismat/open-numismat)**
- GPL-3.0, ideas only. About 140 stars, updated July 2026.
- A mature desktop coin manager, also offered for stamps, with find-by-image and imports from Colnect, Numista, Tellico and Excel.
- **For Stamp Loupe:** study its import mappers. An "import from Colnect or a spreadsheet" feature would help collectors with existing lists.

**[nomisma](https://github.com/nikolareljin/nomisma)**
- MIT according to its README, OK once the license file is confirmed. Updated June 2026.
- A coin app using an AI vision model for identification, grading and defects, with microscope capture and eBay listings.
- **For Stamp Loupe:** a parallel project. Its values are AI estimates with no named sources. Stamp Loupe's planning price, with its sources shown, is the stronger model.

**[YamCR](https://github.com/ForOhForError/Yet-Another-Magic-Card-Recognizer)**
- Apache-2.0, OK.
- Real-time recognition of every Magic card. A fast perceptual-hash pass narrows the candidates, then a slower, accurate scorer ranks the best few.
- **For Stamp Loupe:** the shape for matching a photo against a large reference set.

**[mtg_card_detector](https://github.com/hj3yoo/mtg_card_detector)**
- No license shown, ideas only. Last updated 2022.
- Its development log explains dropping a trained detector for contour finding plus perceptual hashing against reference images. One model per card worked for ten cards and would not scale to ten thousand.
- **For Stamp Loupe:** match against reference images rather than training a classifier per stamp.

**[MTGJSON](https://github.com/mtgjson/mtgjson)**
- MIT, OK. About 480 stars, updated October 2026.
- An open card catalogue rebuilt daily, keyed by a stable id, with a 90-day price history file.
- **For Stamp Loupe:** the template for an open stamp catalogue and price feed, which does not exist yet.

## Image search, hashing and text in the browser

**[transformers.js](https://github.com/huggingface/transformers.js)**
- Apache-2.0, OK. About 16,000 stars, version 4.3.1 from October 2026.
- Runs CLIP and DINO image models in the browser, on WebAssembly or WebGPU, with small quantized weights.
- **For Stamp Loupe:** on-device "find this stamp in my collection" and duplicate checks. Searching tens of thousands of vectors fits in a background worker. A world catalogue would need splitting by country or a server index.

**[imagehash](https://github.com/JohannesBuchner/imagehash)**
- BSD-2-Clause, OK. About 3,900 stars.
- The reference set of perceptual hashes.
- **For Stamp Loupe:** use its JavaScript port, imagehash-web (MIT). Its README warns that browsers resample images differently from the Python version, so build catalogue hashes with the same code the app runs. [blockhash](https://github.com/commonsmachinery/blockhash) (MIT) is older, and its JavaScript port has not shipped since 2014.

**[tesseract.js](https://github.com/naptha/tesseract.js)**
- Apache-2.0, OK. About 38,700 stars, version 7.0.0.
- Text recognition in the browser, in more than 100 languages.
- **For Stamp Loupe:** read the country name, face value and imprint year from the straightened crop to narrow candidates before visual matching.

## Local-first storage

**[Dexie.js](https://github.com/dexie/Dexie.js)**
- Apache-2.0, OK. About 14,600 stars, version 4.4.6 from September 2026.
- An IndexedDB wrapper with bulk writes and live queries. Its export-import add-on writes single-file backups.
- **For Stamp Loupe:** worth adopting if the collection grows into the thousands. Syncing needs Dexie's paid cloud service or your own server.

## Gaps Stamp Loupe could own

The survey found nothing that does these well in the open:

- **An open stamp reference set.**
  - Wikistamp is only a proposal, and the Wikibooks World Stamp Catalogue is an index page.
  - Datasets named "stamp" on Hugging Face, Mendeley and Zenodo turned out to be document seals or bookbinding tools. Kaggle had none.
  - BankNote-Net published image embeddings and an encoder rather than images, because copying banknotes is regulated. The same approach could ease copyright limits on stamp images.
- **Stamp matching that runs entirely in the browser.** philately-tool and Coin-CLIP prove the method in desktop Python.
- **Values with cited sources.** Other tools link out to marketplaces or show bare AI estimates. Nothing like MTGJSON's price feed exists for stamps.
- **A selling planner** that covers fees, shipping and customs. None found.
- **Provenance as a real record.** At most, other tools store purchase details. None keeps an ownership chain, certificates or capture details.
- **Condition and varieties.** stamp-grader leaves out gum, thins and creases. A 2025 thesis from Liberec checked stamp types with feature matching, but published no code.

## What version 2.1 took from this

Every project above was read for what Stamp Loupe could use. Code was copied only where the license allows it, and [NOTICE.md](../NOTICE.md) records each one.

| Project | License | What Stamp Loupe took | Where |
|---|---|---|---|
| stamp-grader | Apache-2.0 | The centering measure, ported to JavaScript: the design box from ink projections, margin ratios, the score and grade bands. Shown as a range, as its README advises. | `src/capture/centering.js` |
| philately-tool | Apache-2.0 | Album page mode as a feature. Its YOLO model is not used. A classic detector finds the stamps on the device instead, with no model to download. | `src/capture/page.js` |
| Vitrine-hub | MIT | The price research link patterns: eBay's stamp category, sold and completed listings, newest first, plus Philasearch, Catawiki and Colnect. | `priceLinks()` in `src/app/core.js` |
| docuSnap | unclear | The idea of keeping the best recent frame. The frame score is Stamp Loupe's own. | `frameScore()` in `src/capture/vision.js` |
| YamCR, mtg_card_detector | Apache-2.0, none | The idea of a fast perceptual hash with a firm cutoff, run before anything slower. | `src/capture/phash.js` |
| imagehash | BSD-2-Clause | The DCT perceptual hash, rewritten for stamps: paper-only hashing, a reliability mask, a colour code, and quarter turns. | `src/capture/phash.js` |
| OpenNumismat | GPL-3.0 | Only the Colnect field names the importer matches. No code. | `src/app/importer.js` |
| Tellico | GPL | Only the baseline of fields: gum, quantity and location. No code. | `src/app/records.js` |
| Canadian-Stamp-Identifier | AGPL-3.0 | A research link for Canadian stamps. No code, data or images. | `priceLinks()` |
| Smithsonian National Postal Museum | CC0 where marked | A research link for U.S. stamps. No images are bundled. | `priceLinks()` |

Left out for now, and why:

- **transformers.js and Coin-CLIP.** Image embeddings mean tens of megabytes of model weights and slow first runs on older phones. The signature check covers duplicates today. Embeddings stay on the roadmap for "find this stamp".
- **tesseract.js.** Several megabytes of language data, and Claude already reads the text on the stamp.
- **jscanify and OpenCV.js.** Several megabytes, and Stamp Loupe's own engine already finds and straightens the stamp.
- **scanic's WebAssembly core.** The JavaScript engine is fast enough for now. Worth revisiting if slow phones struggle with page mode.
- **Dexie.js.** The plain IndexedDB store copes at today's collection sizes.
- **The Roboflow dataset.** It trains a detector, and page mode needs none.
- **MTGJSON and WorldCovers.** Models for an open stamp reference set, which is still to come.

See [roadmap.md](roadmap.md) for what comes next.
