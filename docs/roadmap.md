# Roadmap

Ideas for future versions, roughly in order of value to collectors. None of these are promises. Pull requests are welcome; see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Done in 2.1

These were on the roadmap and shipped in version 2.1. The [changelog](../CHANGELOG.md) has the details.

- **Album page mode.** One photo of a page, every stamp found on the device, and a quick sort of up to 30 stamps in one request.
- **Sharper auto-capture.** The live camera keeps the sharpest frame of the hold.
- **Centering score.** Ported from [stamp-grader](https://github.com/DanMat/stamp-grader) and shown as a range.
- **Duplicate check.** A perceptual hash of each photo, compared on the device before an identification is paid for.
- **Imports.** Spreadsheets, Colnect exports and StampManage lists.
- **Offline install.** A service worker, app icons, home screen shortcuts and an Android share target.

## Next

**Accounts and credits for a hosted service.** Sign-in, prepaid credits checked by the proxy before each call to Claude, a daily cap per account and on free trials, and payments through a merchant of record. Anyone who brings their own API key keeps unlimited use.

**Cheaper page sorts.** Test Claude Haiku for page sorts, and move over if accuracy holds. Use the Message Batches API for large overnight sorts, which halves the cost.

**Sold prices from eBay.** eBay's Marketplace Insights API returns sales history. It is a limited release, so eBay must approve the app. Requests would go through the proxy, which holds the credentials. Results would land in the Sold prices list, tagged with their source.

**Live postage.** Canada Post's Get Rates service returns counter prices without a contract. It needs developer credentials and XML requests, so it also belongs in the proxy. It would replace the dated postage table for anyone who sets it up.

**Exchange rates.** The Bank of Canada Valet API publishes daily rates with no key. It would let sold prices in U.S. dollars, pounds or euros count toward a Canadian planning price, and keep the Delcampe euro conversion current.

**Timestamped provenance.** OpenTimestamps can prove a provenance fingerprint existed on a date, using public calendar servers and no account. A "Timestamp this record" button would store the proof file with the stamp.

## Later

**Sync across devices.** The standalone app keeps the collection in one browser. A small backend would add sign-in, sync, and a public showcase page for a collection, with photos in object storage. Two options:
- Supabase: Postgres with sign-in, row-level security and file storage.
- Cloudflare D1 and R2: on the same platform as the proxy.

The storage interface in `src/store/` is already separate from the views, so a third store can sit beside the two that exist.

**Find this stamp in my collection.** The duplicate check compares small signatures. Image embeddings from [transformers.js](https://github.com/huggingface/transformers.js) would add a closer second look, and the same two steps could match against a reference catalogue. Smithsonian Open Access has CC0 images of many U.S. stamps.

**An open reference set.** Owners could choose to share an identified stamp's signature, catalogue numbers and a small image. Each shared match would make the next scan of that stamp nearly free, the way MTGJSON did for trading cards.

**Check a listing.** Photograph or upload a listing's photo, get an identification and a value band, and compare it with the asking price.

**Estate inventory.** A page by page inventory with value bands, for executors who would otherwise sell an album at dealer prices.

**Better capture on hard backgrounds.** White stamps on white paper, pale stamps on white album pages, stamps behind glossy stockbook strips, and glossy covers are the weakest cases. Edge-based refinement and a "tap the stamp" hint for the detector would help.

**Lot builder.** Group low-value stamps by country or theme into lots with a combined description, photo checklist and suggested starting price. Page sorts already find the stamps that belong in a lot.

**Sale tracking.** Record what each item actually sold for, with fees and postage. The Sold status would then feed a realized-price history, and a year-end summary would support tax records.

**Languages.** French first, for Canadian collectors. Any Indigenous-language interface should be made with language speakers, not by translation software.

## Watching

These outside changes would mean updating [selling-rules.md](selling-rules.md):
- The U.S. duty on Canadian goods and the Canada and U.S. negotiations.
- Formal customs entry for U.S.-bound mail.
- The statutory end of U.S. de minimis on July 1, 2027.
- Canada Post price changes.
- Marketplace fee changes.

See also [related-projects.md](related-projects.md) for open-source work this roadmap could build on.
