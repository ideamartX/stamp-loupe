# How capture works

Stamp Loupe finds the stamp (or block, or cover) in a photo, straightens it, and checks that the photo is good enough to identify. The same engine runs on live camera frames and on still photos. All of it happens in the browser. Nothing is uploaded until you choose Identify.

The code is in `src/capture/`:

- `vision.js` holds the pure image analysis. It works on plain RGBA pixel arrays, so it runs in Node tests too.
- `still.js` connects it to the browser: decoding, canvases, and JPEG encoding.
- `live.js` runs the live camera and auto-capture.
- `cropper.js` is the corner editor.
- `centering.js` measures centering on the straightened photo.
- `page.js` finds every stamp on an album or stockbook page.
- `phash.js` makes the picture signatures behind the duplicate check.

## Finding the item

`detectQuad(img, { roi })` looks inside a region of interest (the whole photo, or the area around the on-screen guide) and returns four corners: top-left, top-right, bottom-right, bottom-left.

1. **Background model.** It samples a ring just inside the edge of the region, 6% of its shorter side by default. The median colour of the ring is the background. The median distance of ring pixels from that colour measures how noisy the background is. The median keeps working even when the stamp overlaps part of the ring.
2. **Foreground mask.** Every pixel whose colour differs from the background by more than a threshold is marked as foreground. The threshold is three times the noise figure plus 8, kept between 26 and 84 (RGB distance). Plain backgrounds get a low threshold. Textured ones, such as wood grain, get a higher one.
3. **Clean-up.** An opening with radius 1 removes specks. A closing joins the design to its margins and perforations; its radius is about 1% of the region (shorter side divided by 110). Then enclosed holes are filled: any background pixel that cannot be reached from the region's edge becomes foreground. That fills the dark parts of a design, such as a black frame line.
4. **Pick the item.** Connected components are labelled. Tiny ones are ignored (under 0.4% of the region), and so is anything covering more than 97% of it. Each remaining component is scored by its area, reduced as its centre moves away from the middle of the region. A component that touches three or four sides of the region is probably background and is marked down heavily; one that touches two sides is marked down a little.
5. **Outline.** The boundary pixels of the chosen component go into a convex hull (Andrew's monotone chain). The smallest rectangle that encloses the hull, at any angle, comes from testing each hull edge as a side.
6. **Follow each edge.** A rectangle cannot follow a stamp photographed at an angle, so each side is refined on its own. Boundary points near the side are split into 12 bins along it, skipping the last 8% at each end. The outermost point in each bin is kept, so perforation tips set the edge rather than the gaps between them. A straight line is fitted through those points, and the four lines are intersected to give four true corners. The refined shape is kept only if it is convex, its area is between 80% and 108% of the rectangle's, and every corner is within 12% of the diagonal of the matching rectangle corner. Otherwise the rectangle is used.
7. **Edge check.** If any corner sits within about 1.2% of the region's edge, the item is probably cut off, and the result says so (`touchesEdge`).

`still.locate()` runs this twice. The first pass works on a copy of the photo at 640 pixels on the long side. The second pass looks again at a crop around the first answer (padded by 12%) at up to 1,100 pixels, with a thinner background ring, for more accurate corners.

## Straightening

`straighten()` widens the four corners by 2.5% so the perforation tips are not trimmed, reads that part of the photo at up to 3,600 pixels, and warps it into an upright rectangle. The output keeps the item's true proportions, capped at 2,400 pixels on the long side.

The warp uses a homography: the 3 by 3 transform that maps the output rectangle onto the four corners, solved from the four point pairs by Gaussian elimination. Each output pixel is mapped back into the photo and sampled with bilinear interpolation. Pixels that fall outside the photo are filled white.

## Quality checks

### Focus

The blur measure is the no-reference "blur effect" metric by Crete-Roffet and colleagues (2007). It compares the image with a copy blurred by a 9-pixel average, horizontally and vertically. A sharp image loses a lot of fine variation when blurred; a blurry one barely changes. The score runs from 0 (sharp) to 1 (very blurry).

Measuring blur depends on scale, because shrinking any photo makes it look sharp. `focusProbe()` therefore takes a square patch from the middle of the item (62% of its shorter side) and scales it so the item's long side would be about 1,000 pixels. That is close to the detail the AI receives. The patch is split into five smaller patches (the centre and four around it), and the sharpest one decides. A glare spot or a plain area can look soft on its own, so this avoids false alarms.

### Light and glare

`exposureStats()` samples the straightened image (scaled to 480 pixels, with a 6% border left out) and reports:

- `mean`: average brightness, using Rec. 709 luma (0 to 255).
- `clip`: the share of pixels where red, green and blue are all 250 or more. That is blown-out highlight, usually glare.
- `dark`: the share of pixels with luma under 18.

### Thresholds

These live in `THRESHOLDS` in `src/capture/vision.js`.

| Name | Value | Meaning |
| ---- | ----- | ------- |
| `blurGood` | 0.42 | At or below: sharp focus (pass). |
| `blurSoft` | 0.52 | Above `blurGood` up to this: slightly soft (warn). Above it: blurry (fail). |
| `veryDarkMean` | 40 | Average brightness below this: too dark (fail). |
| `darkMean` | 62 | Below this: a little dark (warn). |
| `brightMean` | 222 | Above this: very bright, fine detail may wash out (warn). |
| `glareWarn` | 0.015 | 1.5% or more of pixels clipped: some glare (warn). White paper alone stays under this. |
| `glareFail` | 0.04 | 4% or more clipped: glare is hiding detail (fail). |
| `detailGood` | 900 | The item's long side in the original photo, in pixels. At or above: pass. |
| `detailMin` | 520 | Between this and `detailGood`: warn. Below: fail. |
| `keystoneWarn` | 0.16 | Opposite sides differ in length by more than 16%: the camera was angled (warn). |

`assessQuality()` turns the measurements into a checklist of items (`frame`, `focus`, `light`, `glare`, `detail`, `angle`), each `pass`, `warn` or `fail`, with a plain instruction for anything that is not a pass. `overallState()` gives the worst state. A failed photo can still be used, but the app suggests a retake.

## Live camera and auto-capture

The live camera opens only on a secure page (`https` or `localhost`) where the browser offers `navigator.mediaDevices.getUserMedia`. It asks for the rear camera at up to 3840 by 2160. Where the camera supports them, it turns on continuous focus, offers a light (torch) button, offers 1x and 2x zoom, and lets you tap the picture to focus.

### The guide

The guide is a square for single stamps, 4:3 for blocks, and 16:9 for covers, with a button to turn the rectangle upright. The guide is mapped from screen pixels to video pixels, allowing for the way the video is cropped to fill the screen.

### Each frame

About 12 times a second (every 80 ms, slower if a phone falls behind), `live.js`:

1. Copies the area around the guide (the guide plus 18% on each side) into a small canvas, about 420 pixels on the long side.
2. Runs `detectQuad()` on it.
3. Measures motion as the average brightness change from the previous frame.
4. Measures light and glare inside the detected item.
5. Measures focus on every second frame, from the full-resolution video.
6. Calls `guidance()` to pick one instruction.

### Guidance codes

| Code | Shown as | When |
| ---- | -------- | ---- |
| `find` | Place the stamp inside the frame | Nothing found. |
| `back` | Move back a little | The item is cut off, outside the guide by more than 7% of its size, or more than 12% bigger than the guide. |
| `closer` | Move closer | The item's long side is under half the guide's long side. |
| `center` | Center the stamp in the frame | Its centre is more than 12% of the guide's size from the guide's centre. |
| `straighten` | Straighten the stamp | It is turned more than 7 degrees. |
| `dark` | More light, please | Average brightness under 40. |
| `glare` | Glare. Tilt the phone a little | 4% or more of pixels clipped. |
| `steady` | Hold steady | Motion above 6. |
| `focus` | Focusing | Blur above 0.52. |
| `ready` | Hold still | Everything is in range. |

The instruction shown is the most common one over the last six frames, so the hint does not flicker between two messages. The corner brackets turn amber while you are lining up and green when everything is in range.

### Auto-capture

When every check stays in range for 700 ms (`HOLD_MS`), the ring around the shutter button fills and the photo is taken. The screen flashes (unless you prefer reduced motion) and the phone vibrates briefly where that is allowed. You can also press the shutter at any time.

While you hold still, every analysed frame gets a score from `frameScore()` in `vision.js`: sharpness counts most (45%), then steadiness (20%), how clearly the edges were found (15%), light (10%) and glare (10%). The best frame of the last 1.5 seconds is kept in full video resolution.

On capture:

1. The best frame is used when it scores clearly higher than the current one (by more than 0.03 on a scale of 0 to 1). Otherwise the current video frame is copied.
2. Where the browser supports the ImageCapture API (Chrome on Android), the app also asks the camera for a full-resolution still, with the flash off, waiting at most 3 seconds. Video is often only 1080p or 720p, while a still can be several times larger. If the still is at least 20% larger than the video frame, the item is searched for again in the whole still, because a still can have a different field of view. The still is used only if it found the item and is not softer than the video frame. A still taken as the phone moves can blur, so its focus is measured, and it is skipped when its blur score is more than 0.08 worse.
3. Otherwise the item is searched for again in the video frame, around where it was seen.
4. The photo is straightened and checked, and the review screen shows it with the checklist. You can use it, retake it, or adjust the corners.

The screen is kept awake (Screen Wake Lock API) while the camera is open, where the browser allows it.

### Why Claude artifacts use the phone's camera app

Claude artifacts run in a locked-down frame that does not allow pages to open the camera. Inside an artifact, "Take photo" opens the phone's own camera app through a file input instead. After you take the picture, the same straightening and checks run on it. The live guide and auto-capture work when the app is hosted on its own site, such as GitHub Pages.

## The corner editor

Choose **Adjust corners** to place the corners by hand. Drag each handle to the tips of the perforations. A loupe above your finger shows the area under the handle at 4x, with a crosshair. Each handle can also be moved with the arrow keys (hold Shift for bigger steps). **Use whole photo** skips cropping.

## Centering

`measureCentering()` in `centering.js` is ported from [stamp-grader](https://github.com/DanMat/stamp-grader) (Apache-2.0; see NOTICE.md). It runs on the straightened single stamp, so the stamp's outer edge is already known.

1. **Ink.** Each pixel gets an ink value: colour saturation for a coloured stamp, or darkness for a black or grey one. The method is chosen from the stamp itself.
2. **Design box.** The ink is summed along each row and each column. The design is the span where the sum stays above 15% of its peak, ignoring runs shorter than 3% of the side.
3. **Margins.** Left, right, top and bottom margins run from the edge of the crop, inset past the perforation tips, to the design box.
4. **Score.** For each direction, the smaller margin divided by the larger. The score is the worse of the two directions, times 100. Bands follow stamp-grader: 95 Superb, 80 Extremely Fine, 65 Very Fine, 50 Fine to Very Fine. Its author calls these bands uncalibrated, and so does this app.
5. **Range.** Two photos of the same stamp vary by a few points, so the result is reported as a range around the score, with the left to right and top to bottom splits, such as 48/52.

The measure refuses blank paper, and it lowers its confidence when the design runs into the perforations, where the margin cannot be measured. A photo that is not straightened well gives a wrong reading, so it is only shown for single stamps.

## Finding stamps on a page

`detectStamps()` in `page.js` finds every stamp, block or cover in one photo of an album page, a stockbook page or a table. It is pure and runs in Node tests. `findStampsInPhoto()` runs it on the browser's copy of the photo.

1. **Work small.** The page-wide pass runs on a copy about 500 pixels on the long side. Stamps are at least a few tenths of a percent of the page, so this is enough, and it averages away noise and faint ruled lines.
2. **The page and its light.** The page colour is estimated across the photo, allowing for uneven light.
3. **Foreground.** A pixel is foreground when its colour is far from the page, or, on a light page, when it is busy with printed detail.
4. **Remove page lines.** Stockbook strip edges, ruled grids and page edges are long and thin. Runs at least a third of the page long and thin across are removed first, so they cannot join a row of stamps. A pixel inside a stamp is thick across even where a line crosses it, so stamps are never cut.
5. **Clean up and split.** Specks go, then a closing joins each design to its margins and perforations. Connected pieces between 0.12% and 35% of the page are kept when they fill at least 60% of their rectangle.
6. **Second look on light pages.** Stamp paper close to the page colour drags the page estimate toward it, which leaves a halo. The page is estimated again with every found stamp left out, and segmented once more.
7. **Outlines.** Each piece gets a four-cornered outline that follows its angle. On light pages, shadows are allowed for by a vote across the page on which side they fall.
8. **Flags.** `edge` marks a stamp cut off by the photo border. `review` marks an odd shape: torn, irregular, or about twice the size of the others, which may be two stamps touching.

Items come back in reading order. `cropItems()` straightens each one with a small margin, and `contactSheet()` lays up to 30 out on a numbered sheet of up to 1,900 pixels, scaled to fit with true proportions.

## Picture signatures

`signatureFromCanvas()` in `phash.js` makes a short signature of a straightened photo. It starts from the DCT perceptual hash of the [imagehash](https://github.com/JohannesBuchner/imagehash) library, with changes for stamps.

- **Pattern (`p`).** The paper is found inside the crop, and only the paper is hashed, inset past the perforation teeth. Its brightness goes onto a 32 by 32 grid, and the signs of the 63 lowest DCT coefficients become 16 hex characters. Signs ignore exposure.
- **Reliability mask (`m`).** Frames and centred portraits leave many coefficients near zero, and their signs are noise. The mask marks the coefficients strong enough to trust (above half the average strength), and only those are compared.
- **Colour (`c`).** After white balance on the paper, the ink colour on a 3 by 3 grid, the ink lightness and two flags, in 16 characters.

The classic perceptual hash compares each coefficient with the median. Using its sign instead means a quarter turn of the photo is an exact reordering of the bits, so one stored signature covers all four ways up.

`compareSignatures()` measures the share of trusted signs that disagree, and a colour difference in CIELAB units. Two photos are the **same** stamp when at most 25% of the trusted signs differ and the colour difference is 12 or less. They are **similar** when at most 32% differ but they fail the test for the same stamp, as with one design printed in two colours. `findMatches()` ranks the collection and keeps only those two levels. A comparison takes well under a microsecond, so thousands of saved stamps are checked before an identification is paid for. Stored as text, a signature is 52 characters.

The duplicate check is a hint. Another value of one design in the same colour can match, which the tests record as a known limit.

## Known limitations

- **White on white.** A stamp with white margins on a white background has almost no colour difference at its edge, so the mask may find only the printed design. Use a dark background, or adjust the corners.
- **Album pages in single mode.** When stamps touch on a page, the single stamp finder can merge them into one shape. Use **Album page** instead, or photograph one stamp at a time.
- **Glossy covers and mounts.** Shiny paper and clear mounts reflect light. Tilt the phone slightly, or light from one side.
- **Very small items.** Below about 520 pixels on the long side, perforations and fine lines are lost. Move closer, or use 2x zoom so the camera can still focus.
- **Strong perspective.** The warp corrects the shape, but the far end of a steeply angled shot is less sharp. Hold the phone flat above the item.

## Tuning and testing

- Change thresholds in `THRESHOLDS` and run `npm test`. The tests in `tests/vision.test.mjs` check detection on upright, rotated and keystoned stamps, light backgrounds, a stamp cut off by the edge, an empty frame, warp proportions, blur ordering, glare and darkness, the checklist, and the guidance codes.
- Make new test cases with `tests/helpers/synth.mjs`. `renderStamp()` draws a perforated stamp at any four corners, and `blurImage()`, `addGlare()` and `scaleBrightness()` make it harder.
- To test the live camera without a camera, give Chromium a video file as a fake camera:

  ```sh
  chromium --use-fake-ui-for-media-stream --use-fake-device-for-media-stream \
    --use-file-for-fake-video-capture=/path/to/stamp.y4m http://localhost:8080
  ```

  The file must be in Y4M (`.y4m`) or MJPEG format. A useful test video shows an empty background, then a stamp sliding into place, then the stamp holding still for a few seconds.
