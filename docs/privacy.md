# Privacy

Stamp Loupe is built so that your collection stays yours. This page explains what leaves your device, when, and where your records are kept.

## What leaves your device

**When you choose Identify stamp**, the app sends to Anthropic's Claude:

- the straightened photo of the front, and the back if you added one;
- what you typed under "Add what you know": country, perforation, watermark, gum, and notes;
- for a single stamp, the centering measured on your device, as one line of text.

**When you sort an album page**, the app sends one sheet for every 30 stamps: the stamps you kept, cropped from the page photo and numbered. The full page photo is not sent, and neither are stamps you left out.

**When you choose Write listing**, the app sends text only: the stamp's identification, condition and value, your notes, any certificate details (expert, certificate number, grade), the planning price, and the shipping and customs facts from the Sell tab. No photo is sent, and no custody or purchase details.

**When you choose Save and test** in Settings, the app sends a one-line test message.

Nothing else is sent to Claude. In particular:

- Live camera frames are analysed in your browser and never uploaded.
- Finding the stamps on a page, measuring centering and the duplicate check run in your browser.
- Each photo's picture signature is a short code of about 50 characters, worked out on your device and saved with the stamp. It cannot be turned back into the photo, and it is only ever compared on your device.
- A list you import is read in your browser and saved like any other stamps. Purchase details from the list go to the private records.
- Your collection, sold prices, notes and custody records are not sent anywhere unless they are part of one of the requests above.

How Anthropic handles API requests is set out in Anthropic's own privacy policy and terms. Inside a Claude artifact, requests use your Claude account under its settings.

### Other requests the page makes

- The page loads its typefaces from Google Fonts. Your browser asks Google's servers for the font files.
- Links to eBay, HipStamp, Google searches, Stamp Auction Network and catalogues open those sites only when you click them.
- There are no analytics, tracking or advertising scripts.

## Where your collection is stored

**On GitHub Pages or your own host (standalone):** in your browser's IndexedDB storage, on that one device and in that one browser. Photos are stored there too. Nothing is synced to a server. Clearing your browser's site data deletes the collection, and Safari can clear it for sites you have not used for seven days unless you add the app to your Home Screen. Use **Keep my data on this device** and **Export backup** in Settings.

**Inside a Claude artifact:** in the artifact's own storage on Claude. Photos are stored as the artifact's files.

**Your settings** (subject, depth, currency, selling figures, Claude connection) are kept in your browser's `localStorage`. An API key or proxy access code saved without "Remember" is kept only for the browser tab.

## Sharing a Claude artifact

When you share the artifact page from Claude, the people you share it with can see:

- every stamp record: titles, photos, conditions, values, price sources and sold prices you recorded, status and notes;
- certificate details: expert, certificate number, grade and date;
- the provenance fingerprint.

They cannot see the private records: who holds each stamp, the vault or box reference, the insured value, what you paid, and who you bought it from. Only you and the people you make editors can see those.

## Exports and backups

- **Export CSV** writes a spreadsheet of the collection. It includes the private custody and purchase columns when you can edit the collection. In the standalone app you always can, so it is your own working copy.
- **Export sharing CSV** (under Share in the standalone app) writes the same spreadsheet without the custody and purchase columns. Use it when you send the list to someone.
- **Export selling list** writes the same columns for items marked for sale or listed.
- **Export backup** (standalone) writes everything: every record, the private records, settings, and every photo. Store backups somewhere safe, and do not share them.

## If you run the proxy

The proxy in `server/` passes each request, including photos, through your Cloudflare Worker to Anthropic. It does not store them, but your hosting provider's logs and your own settings apply. If other people use your proxy, tell them their photos pass through it.

## Questions

Open an issue in the repository for questions about how the app handles data. Never include an API key or private custody details in an issue.
