# Stamp Loupe user guide

This guide covers everything the app does, in the order you will use it.

1. [Before you start](#before-you-start)
2. [Taking the photo](#taking-the-photo)
3. [Photo checks](#photo-checks)
4. [Identifying the stamp](#identifying-the-stamp)
5. [Sorting an album page](#sorting-an-album-page)
6. [Reading the result](#reading-the-result)
7. [Value and its sources](#value-and-its-sources)
8. [Planning a sale](#planning-a-sale)
9. [Writing a listing](#writing-a-listing)
10. [Your collection](#your-collection)
11. [A stamp's record](#a-stamps-record)
12. [Settings](#settings)
13. [Backups and moving devices](#backups-and-moving-devices)
14. [Working through a large collection](#working-through-a-large-collection)
15. [Troubleshooting](#troubleshooting)
16. [Questions](#questions)

## Before you start

Stamp Loupe runs in a web browser on a phone, tablet or computer. There are two versions.

- **On a website** (your GitHub Pages site, or another host). Open Settings and connect to Claude, either with your own API key or with a proxy address someone gave you. Your collection is stored in this browser on this device.
- **Inside Claude** (a Claude artifact). Nothing to set up. Claude asks you once to allow the page to use your account. Your collection is stored with the page, and you can share it from Claude.

You can take photos, run the photo checks, find the stamps on an album page and check for duplicates without connecting to Claude. Identifying, sorting a page and writing listings need Claude.

On a phone, the Scan and Collection tabs sit in a bar at the bottom of the screen. The phone's back gesture closes whatever is open, such as a stamp card or the camera, before it leaves the app.

What you need on the table: stamp tongs, a plain dark card (black is best), and soft daylight from one side.

## Taking the photo

### Choose what you are photographing

At the top of the Scan tab, pick one:

- **Single stamp.** A square frame. Stamps come in many shapes, so the square leaves room for tall and wide stamps.
- **Block or strip.** A wider frame for pairs, strips, blocks, sheetlets and booklet panes.
- **Cover or card.** A wide frame for envelopes, postcards and postal stationery.
- **Album page.** A whole album or stockbook page. The app finds every stamp on it. See [Sorting an album page](#sorting-an-album-page).

The choice changes the frame shape and tells Claude what to look for. For a block it reports the format, count, plate number or imprint. For a cover it also reports postmarks, route and rate.

### The live guide (website version)

Tap **Scan with live guide**. The first time, your browser asks for camera permission.

1. Lay the stamp flat on a dark card.
2. Hold the phone flat above it, about a hand's width away.
3. Follow the message at the top of the screen.

| Message | What to do |
|---|---|
| Place the stamp inside the frame | Move the phone until the stamp is inside the corner marks. |
| Move closer | Bring the phone closer, or tap 2x if your phone offers it. |
| Move back a little | Part of the stamp is outside the frame. |
| Center the stamp in the frame | Slide the phone until the stamp sits in the middle. |
| Straighten the stamp | Turn the stamp or the phone until the edges line up with the frame. |
| More light, please | Move near a window or turn on a lamp. |
| Glare. Tilt the phone a little | A bright spot is hiding detail. Tilt slightly, or move the light to one side. |
| Focusing | Wait a moment. If it stays, move back a little or use 2x zoom. |
| Hold steady | Keep the phone still. |
| Hold still | Everything is right. The ring around the shutter fills, and the photo is taken. |

The corner marks turn amber while you line up, and green when the stamp is ready. Three small meters at the bottom show **Focus**, **Light** and **Steady**.

You can also tap the shutter button at any time to take the photo yourself.

Other controls:
- **Single, Block, Cover** switch the frame without leaving the camera.
- **Turn** (for blocks and covers) rotates the frame between wide and tall.
- **Light** turns on the phone's torch, where available. Glare is more likely with it on.
- **1x and 2x** appear when your phone supports zoom. 2x helps small stamps when the phone cannot focus up close.
- Tap the picture to focus on that spot, where supported.

The app keeps the sharpest frame from the moment you held still, not just the last one. On Android phones with Chrome, it also takes a full-resolution still from the camera sensor, and uses it unless it came out softer than the video frame. The screen stays on while the camera is open.

After the photo is taken you see it straightened and cropped, with the photo checks underneath. Choose **Use photo**, **Retake**, or **Adjust corners**.

### Using your phone's camera app

Inside Claude, and in browsers without live camera access, **Take photo** opens your phone's own camera. Take the picture, confirm it, and Stamp Loupe straightens and checks it in the same way.

### Uploading a photo

**Upload** accepts a photo from your library or computer. You can also drag a photo onto the capture area, or paste one with Ctrl+V or Command+V. A pasted photo goes to the front, or to the back if the front is already filled.

### The back of the stamp

The back shows gum, hinge marks, thins and sometimes the watermark. Add it with **Photo of back** or **Upload** under the front photo. Claude looks at both photos together.

## Photo checks

Every photo gets five checks. Each shows as a chip: green for good, amber for a warning, red for a problem. The first problem comes with a fix.

| Check | What it means | Common fix |
|---|---|---|
| Edges found | The app found the stamp's outline and straightened it. | Use a plain dark background, or adjust the corners by hand. |
| Whole item in view | Part of the stamp was cut off by the photo edge. | Move back so all four edges show. |
| Sharp focus | Fine lines and lettering are crisp. | Hold steady, move back a little, and let the camera focus. |
| Even light | The photo is neither too dark nor washed out. | Use daylight from one side, or a lamp. |
| No glare | No bright reflection hides the design. | Tilt the phone slightly, or move the light. |
| Detail | The stamp is large enough in the photo for perforations and fine lines to show. | Move closer, or use 2x zoom. |
| Camera angle | Shows only when the photo was taken at a slant. | Hold the phone flat above the stamp. |

A red check does not stop you. If a photo fails, the app suggests retaking it, and you can still go ahead.

### Centering

For a single stamp, a line under the checks measures how well the design sits between the margins, for example "Centering: Well centred, about 80 to 90 of 100." The score is measured on your device from the straightened photo, so a good crop matters. It is shown as a range because the edge of the design is never perfectly sharp. Claude sees the measurement with the photo, and it is saved with the stamp as **Measured centering**.

### Already in your collection?

Every photo gets a small picture signature, worked out on your device. If it matches a stamp you saved before, a note appears under the photo: **You may already have this stamp**, or **A similar stamp is in your collection** when only the design matches. **Open it** shows the saved stamp, so you can skip paying for a second identification. The check compares pictures only, so treat it as a hint. Two copies of the same stamp in different shades or conditions can still be worth identifying.

### Adjusting the corners

Tap **Adjust corners** to open the corner editor.

- Drag each green dot to a corner of the stamp, at the tips of the perforations.
- A magnifying loupe appears above your finger so you can place it exactly.
- With a keyboard, Tab to a corner and use the arrow keys. Hold Shift to move faster.
- **Reset** returns to the automatic corners. **Use whole photo** skips cropping. **Apply** straightens the photo with your corners.

### Rotate and remove

**Rotate** turns the photo a quarter turn. **Remove** clears it.

## Identifying the stamp

Optional details under **Add what you know** help Claude:

- **Country** if you know it, especially for unusual issues.
- **Perforation.** Count the holes along 2 cm of one edge. That number is the gauge. A stamp with no holes is imperforate.
- **Watermark.** Lay the stamp face down on black. A drop of watermark fluid, or a light behind it, can show the mark.
- **Gum or use.** Mint never hinged, mint hinged, unused without gum, used, or on cover.
- **Notes.** Anything else, such as where it came from.

Then choose:

- **Value in.** The currency for prices.
- **Depth.** **Thorough** uses the most capable model and takes one to two minutes. **Faster** usually takes under a minute.

Tap **Identify stamp**. A progress bar shows while Claude works. **Stop** cancels.

## Sorting an album page

Most collections arrive in albums, and most album stamps are common. Page mode finds the few worth your time.

1. Choose **Album page**, then **Take photo** or **Upload**. Photograph the whole page from straight above, in even light. A black stockbook page works best. Page photos use your phone's own camera app, which gives the most detail.
2. The app finds every stamp on the page, outlines it and numbers it. This happens on your device, usually within a few seconds.
3. Check the outlines. Tap a stamp to **Leave out** or **Put back**, or **Fix outline** to place its corners by hand. **Add a missed stamp** lets you outline one the app did not find. Outlines that may hold two stamps, or a torn one, are marked in amber.
4. Tap **Sort**. Up to 30 stamps go to Claude on one numbered sheet. A bigger page is split into several sheets.

The sorted page lists each stamp with a short name, a value band and a confidence. The bands are under 1, 1 to 10, 10 to 50, 50 to 250 and over 250, in the currency you chose. Stamps **Worth a closer look** are marked, with the reason, such as a perforation or shade variety that changes the value. Stamps you already have are marked **In your collection**.

- **Page order** keeps the order on the page. **Highest value** puts the best first. **Only worth a closer look** hides the rest.
- **Identify** on a stamp crops it from the page photo and gets it ready for a full identification. **Back to the sorted page** returns to the list.
- **Save** keeps one stamp. The buttons at the end save the ones worth a closer look, or all of them at once.

A quick sort is a first pass from one photo, at a lower resolution than a single stamp photo. Identify a stamp on its own before you rely on its value or catalogue number. Saved stamps from a sort are marked **Quick sort** in the collection, and **Identify it now** on the stamp card runs the full identification and updates the same record.

## Reading the result

The result card opens with the title, the country, year, value and colour, and a confidence pill: high, medium or low. A short note says what is certain and what is not. The **planning price** sits below, with a badge that says where it comes from.

The card has three tabs: **Overview**, **Value** and **Sell**. Saved stamps also have **Record**.

### Overview

- **Format.** For blocks and covers: the kind, count, plate or imprint, postal markings and route.
- **Identification.** Issue, design, printing method, where it was printed, perforation, watermark, and catalogue numbers. Each catalogue number is marked "likely" or "unsure". Claude is told never to invent one.
- **Condition.** State, centering, margins or perforations, cancel, grade, and faults.
- **Warning signs.** Signs of forgery, repair, regumming, reperforation, faked cancels or reprints, shown on a red band.
- **Check before you rely on this.** Specific things to check by hand.
- **Expert opinion.** Whether a certificate is worth the fee, and who issues them for that country.
- **Could also be.** Look-alike stamps and how to tell them apart.
- **The story.** A little history.

**Save to collection** stores the stamp, its photos and everything on the card.

## Value and its sources

The Value tab answers two questions: what is it worth, and how sure are we?

### Planning price

The planning price drives the Sell planner. Choose how it is set:

- **Auto** (default). The median of your sold prices once you have recorded two or more. Until then, the middle of the AI range.
- **Sold prices.** The median of your sold prices, even with just one.
- **AI estimate.** The middle of the AI range.
- **My price.** A figure you type.

The basis is graded:
- **Strong**: three or more sold prices, at least two from the last 18 months.
- **Fair**: one or two sold prices.
- **Rough**: AI estimate only.
- **Set by you**: your own price.

### Where the numbers come from

- **AI estimate.** The range Claude gave, what it assumes, and what it rests on (auction records, catalogue knowledge, dealer prices or general knowledge). The model has no live market data, so check the range against real sales.
- **Catalogue.** The catalogue numbers Claude suggested, plus a catalogue value you can enter with its edition, such as "Unitrade 2027". Catalogue value is a reference, not a selling price. Most stamps sell well below it.
- **Sold prices.** Real sales you record: where it sold, the date, the price, the condition, and a link. The app shows the median, the range, and how many sales are over three years old. Sales in another currency are left out of the median.

To add a sold price, open **Add a sold price**, fill in the form, and tap **Add sold price**. Remove one with **Remove**.

### Finding sold prices

**Find sold prices** links straight to searches:
- **eBay sold (worldwide)** and **eBay.ca sold**: completed sales from about the last 90 days.
- **HipStamp**: asking prices, not sales. Useful as a ceiling.
- **Auction results**: prices realized at stamp auctions.
- **Delcampe**: European buyers.
- **Colnect catalogue**: identification and catalogue numbers.

Record sold prices for the same stamp in similar condition. A stamp with a short perforation does not compare with a sound one.

**What moves the price** lists the factors that raise or lower this stamp's value.

## Planning a sale

The Sell tab compares ways to sell, based on the planning price.

### Inputs

- **Buyer is in.** Canada, the United States, the United Kingdom, the European Union, or elsewhere. The app remembers your choice.
- **Printed in.** Customs treats a stamp's origin as the country where it was printed, which can differ from the issuing country. The first stamps of the Province of Canada, for example, were printed in New York. Claude suggests a country when it knows. Change it if you know better.
- **Certificate.** Include the cost of an expert certificate. It is ticked for you when Claude recommends one and the price is high enough.

### Best fit

A green box names the channel that leaves you the most, with the reasons. It also tells you when:
- The stamp is worth so little that it belongs in a lot.
- An auction house is the better route for a valuable item.
- A certificate should come first.
- U.S. buyers face a duty on Canadian-origin stamps.

### What you would receive

Each channel shows what reaches your pocket, its share of the planning price, how soon you are paid, and how much work it takes. **How this adds up** shows every fee line.

- **eBay.ca listing.** Final value fee on the total the buyer pays, per-order fee, and the international fee when the buyer is outside Canada. If you have an eBay Store, tick it in Settings.
- **HipStamp listing.** Commission on the sale including shipping, capped per item, plus an estimate of the PayPal fee.
- **Delcampe listing.** No seller commission, but buyers pay a 10% fee on top, so they bid a little lower. You pay a small payment fee.
- **Auction house consignment.** Buyers pay a premium on top of the hammer price, so the hammer lands below the planning price. The house takes a seller commission, which you agree with them.
- **Dealer buys outright.** Paid the same day, at a share of retail.
- **Group into a lot.** For stamps worth a few dollars, sold together.

Channels that are not practical, such as mailing Canadian-origin stamps to the U.S. after formal customs entry starts, show as **Not practical now**.

### Shipping

The planner picks a shipping method from the value and the destination:
- Under $30 within Canada or overseas: Lettermail, flat in a stiffened envelope.
- Above that, or to the U.S. at any value: a tracked service. Canada Post does not accept goods to the U.S. by Lettermail.
- From $100: insure privately and ask for a signature, because Canada Post coverage is limited.

U.S. shipments include the fee for Canada Post's required Zonos customs declaration.

### Customs and export

Notes for the destination, including:
- How to fill in the customs declaration.
- The U.S. duty on Canadian-origin stamps, and the formal entry requirement.
- UK and EU import VAT.
- When a Canadian cover may need an export permit.

Amber notes need attention. The full rules, with dates and sources, are in [selling-rules.md](selling-rules.md).

## Writing a listing

At the bottom of the Sell tab:

1. Choose **Where**: eBay.ca, HipStamp, Delcampe, or an auction house consignment.
2. Choose **Auction** or **Fixed price**.
3. Tap **Write listing**.

You get:
- A title (with a character count for marketplaces).
- A plain description that names every visible fault.
- A shipping and customs paragraph built only from the planner's facts.
- Item specifics.
- A suggested price with a reason.
- Photo tips.

Copy each part, or **Copy everything**. **Open eBay.ca** (or the other marketplace) opens the site in a new tab.

Read every listing before you post it. You are responsible for what it says.

## Your collection

The Collection tab shows every saved item as a mounted card. Each card shows the status, title, country and year, the planning price, and a badge for its source: **Comps** (your sold prices), **AI**, or **Set** (your price).

- **Search** matches title, country, year, catalogue number, notes, certificate details, status, gum and where it is kept.
- **Country** and **Sort** (newest, highest value, oldest issue, country A to Z).
- **Era** chips: before 1900, 1900 to 1949, 1950 to 1999, 2000 on.
- **Status** chips: keeping, for sale, listed, sold, with an expert, in a vault. **Quick sort only** shows stamps saved from a page sort that have not had a full identification. **Possible copies** shows stamps saved as a likely copy of another, next to the stamp they match.
- Cards carry small tags: **Quick sort** for a stamp from a page sort, and **Copy?** for a likely copy.
- **Selling plan.** When items are marked for sale or listed, a summary shows their planning value, what you would receive, and the best channel for each. **Export selling list** saves them as a spreadsheet.
- **Export CSV** saves the whole collection as a spreadsheet.
- **Share.** Inside Claude, use Claude's Share button. Anyone you share with can browse and scan, but only you and your editors see custody and purchase details. On the website version, **Export sharing CSV** leaves the private columns out.
- **Rename** changes the collection's name.

## A stamp's record

Open a card to see the full stamp card, with a **Record** tab:

- **Status** and **Notes**.
- **Gum and use**, **How many you have** and **Where it is kept**, such as an album and page. **Save record** keeps them.
- **Provenance.** Who expertized it, the certificate number, grade and date. These are visible to anyone you share with.
- **Private details.** Who holds it, the vault or box reference, insured value, what you paid, and who you bought it from. Only you (and your editors, inside Claude) can see these.
- **Provenance fingerprint.** A SHA-256 hash of the photo, the catalogue numbers and these records. If any detail changes, the fingerprint changes. You can publish or timestamp this one line to prove the record existed on a date, without revealing the private details.
- **Delete stamp.** Asks you to confirm, then removes the record and its photos.

Changes to the planning price, sold prices and "Printed in" on a saved stamp are saved as you make them.

A stamp saved from a page sort shows a **Quick sort** ribbon with **Identify it now**. A stamp brought in from a list shows **From your list** with **Scan it now**, which opens the Scan tab so you can photograph it. Either way, the full identification updates the same record. Your status, notes and sold prices stay, and the button reads **Update the saved stamp**.

## Settings

Open Settings with the sliders button at the top right.

### Connect to Claude (website version)

- **My API key.** Paste a key from the Claude Console. Set a monthly spend limit there.
- **A proxy server.** Paste the address and access code from whoever runs the proxy.
- **Remember on this device.** With this on, the key or code stays until you choose **Forget key**. With it off, it is cleared when you close the tab. Leave it off on shared computers.
- **Thorough scans** and **Faster scans.** Choose the model for each depth. Opus gives the best accuracy. Sonnet balances speed and cost. Haiku is fastest and cheapest.
- **Save and test** checks the connection with a tiny request.

### Selling

- **Ships from.** Used in listings, for example "Yukon, Canada".
- **Usual buyer location.**
- **Certificate cost.**
- **Fee and postage figures** for every channel. Defaults show the date they were checked. Items marked "estimate" are not published by the provider, so replace them with your own figures. **Reset to defaults** restores the checked figures. **Where these figures come from** lists the sources.

### Import a list

Bring in a list you already keep. **Choose a CSV file** accepts a CSV from Excel, Numbers or Google Sheets, a Colnect export, StampManage, or a Stamp Loupe export. Save Excel files as CSV first.

- Columns such as Country, Year, Denomination, Scott, SG, Michel, Unitrade, Condition, Album and Notes are matched in English and German.
- Before anything is added, the app shows how many rows it found, which columns it matched, and which it will keep in each stamp's notes.
- A catalogue value column becomes the stamp's catalogue value. What you paid and who you bought from go to the private details.
- Imported stamps have no photos. Scan them when you have time, and the identification updates the same record.

The website version imports up to 5,000 rows at a time. Inside Claude, the limit is 300.

### Install on this phone (website version)

Install the app to open it full screen from your home screen. Settings shows the steps for your phone. On Android it is one button. On iPhone and iPad, open the page in Safari, tap **Share**, then **Add to Home Screen**. Once installed, the app opens with no connection, and everything except identifying, sorting and listings works offline. On Android, the installed app also appears when you share a photo from your gallery.

When a new version is published, a banner says it is ready, and **Update now** switches to it. Nothing reloads by surprise.

### Data on this device (website version)

- Storage used.
- **Keep my data on this device** asks the browser not to clear your collection to save space.
- **Export backup** and **Import backup**.
- **Erase everything**, after a confirmation.

## Backups and moving devices

On the website version, your collection lives in one browser on one device. Clearing site data, uninstalling the browser or a lost phone would lose it. Safari can also clear data for sites you have not opened in seven days, unless you add the app to your Home Screen.

- Tap **Keep my data on this device** once.
- On iPhone and iPad, add the app to your Home Screen from the Share menu.
- **Export backup** after each session. The file holds every record and photo, including private custody details, so store it somewhere safe.
- To move to another device, export a backup, then **Import backup** on the new one. Importing adds to what is there. It does not replace it.

The app reminds you when you have five or more stamps and no backup in 30 days.

## Working through a large collection

For thousands of stamps, sort pages first and identify single stamps second.

1. If you already keep a list in a spreadsheet, import it first, so the duplicate check knows what you have once you scan those stamps.
2. Sort each album or stockbook page with **Album page**. Save the stamps worth a closer look, and note the album and page under **Where it is kept**.
3. Pull out anything else that deserves a closer look: anything before 1900, imperforates, covers, blocks, errors, and your strongest countries.
4. Identify those one at a time, and record sold prices for the best. Watch for the note that you may already have a stamp.
5. Mark items **For sale** and use the **Selling plan** to decide what goes to auction, what to list, and what to group into lots.
6. Get certificates for the few items worth it before you sell them.

Common stamps sell best as country collections or whole albums. Listing them one at a time costs more in fees and time than they earn.

## Troubleshooting

**The camera button opens my phone's camera app instead of the live guide.** Live camera access needs a secure (https) page and a browser that allows it. Claude artifacts never allow it. The photo is still straightened and checked after you take it.

**"Camera access was blocked."** Allow camera access for the site in your browser settings, then try again. Or use **Upload**.

**Edges are not found.** Use a plain dark card with nothing else in the frame. White stamps on white paper are the hardest case. Use **Adjust corners** if needed.

**Focus keeps failing.** Phones cannot focus closer than about 8 to 10 cm. Move back and use 2x zoom, or crop with the corner editor.

**Glare keeps failing.** Glossy stamps and stamps in plastic mounts reflect light. Light from the side, tilt the phone slightly, or take the stamp out of the mount with tongs.

**Page mode misses stamps, or joins two together.** Stamps that touch, pale stamps on a white page, and stamps behind glossy stockbook strips are the hardest. Use **Add a missed stamp**, or **Fix outline** on a joined pair. A black stockbook page in soft, even light works best.

**The duplicate note is wrong.** The check compares pictures only. A second copy in another shade, or a different value with the same design, can look alike. Go ahead and identify it if you think it differs.

**"Connect to Claude to identify."** Open Settings and add a key or proxy.

**"The API key was refused."** Check the key in the Claude Console. Keys start with `sk-ant-`.

**"Claude is busy right now."** Wait a minute and try again.

**The answer came back incomplete.** Try again. If it keeps happening, switch to Thorough or retake the photo.

**My collection is empty after a while.** The browser cleared its storage. Import your latest backup. Then turn on **Keep my data on this device**, and on Apple devices add the app to the Home Screen.

## Questions

**Is the value an appraisal?** No. It is a starting point from a photo. Check it against real sold prices, and get an expert opinion before you buy or sell anything valuable.

**Where do my photos go?** On the website version, photos go to Anthropic's Claude API only when you identify a stamp or sort a page. A page sort sends a sheet of the cropped stamps, not the whole page photo. Listing requests send text only. Finding stamps on a page, the centering measure and the duplicate check all run on your device. Inside Claude, photos go to Claude on your account. See [privacy.md](privacy.md).

**Can I use it offline?** Capture, photo checks, finding stamps on a page, the duplicate check, the collection and the planner work offline. Install the app, or load the page once, first. Identifying, sorting and listing need a connection.

**Why does the planner say U.S. sales are not practical?** Since August 22, 2026, the U.S. charges a 50% duty on Canadian-origin stamps. From October 22, 2026, mail carrying that duty needs formal customs entry, which normally needs a customs broker. See [selling-rules.md](selling-rules.md).
