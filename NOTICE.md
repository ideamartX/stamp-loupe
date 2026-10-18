# Notices

Stamp Loupe is released under the MIT License. See [LICENSE](LICENSE).

Parts of it come from, or were shaped by, other open-source projects. This file says which, and under what terms.

## Code ported from other projects

### stamp-grader

- Source: https://github.com/DanMat/stamp-grader
- Copyright 2026 Dan Matthew
- License: Apache License, Version 2.0. A copy is in [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt).
- Used in: `src/capture/centering.js`
- What was ported: finding the design box by projecting an ink mask onto each axis, the margin measures, the centering score, the grade bands and the plain wording of the result.
- What was changed: rewritten in JavaScript; runs on Stamp Loupe's own straightened crop, so stamp-grader's segmentation, outline fit and perforation gauge are not used; the result is reported as a range of a few points either way.

## Facts and ideas reused, with no code copied

- **Vitrine-hub** (MIT, https://github.com/count-core/Vitrine-hub): the price research link patterns for eBay (stamp category 260, sold and completed listings, newest first), Catawiki and Colnect.
- **OpenNumismat** (GPL-3.0, https://github.com/OpenNumismat/open-numismat): the Colnect field names that the list importer matches. Only the names were reused.
- **Tellico** (GPL, https://invent.kde.org/office/tellico): the baseline of collection fields, such as gum, quantity and location.
- **docuSnap** (https://github.com/petermartis/docuSnap): the idea of keeping the sharpest of the last few camera frames. Stamp Loupe's frame score is its own.
- **YamCR** (Apache-2.0, https://github.com/ForOhForError/Yet-Another-Magic-Card-Recognizer) and **mtg_card_detector** (https://github.com/hj3yoo/mtg_card_detector): matching photos with a fast perceptual hash and a firm cutoff, and handling glare from plastic sleeves.
- **imagehash** (BSD-2-Clause, https://github.com/JohannesBuchner/imagehash): the DCT perceptual hash that the duplicate check starts from.
- **philately-tool** (Apache-2.0, https://github.com/code2k13/philately-tool): album page mode as a feature. Its trained model is not used or included.
- **Canadian-Stamp-Identifier** (AGPL-3.0, https://github.com/adrianspeyer/Canadian-Stamp-Identifier): linked from the research links for Canadian stamps. None of its code, data or images are included.

## Fonts

Old Standard TT, Schibsted Grotesk and IBM Plex Mono load from Google Fonts, under the SIL Open Font License.
