# Selling rules and sources

The Sell planner uses the figures in [`src/sell/rules.js`](../src/sell/rules.js). This page explains each one, where it came from, and how sure we are. Every figure was checked on **October 17, 2026**. Users can override any number in Settings.

Confidence labels:
- **Verified**: read on the provider's own page or in the law.
- **Partly verified**: the provider's pages conflict, or the figure comes from a reliable second source.
- **Estimate**: not published. A reasonable default you should replace with your own figure.

This is not legal, tax or customs advice. Rules change, sometimes within weeks. Check before you rely on a plan, and ask a customs broker about anything valuable.

## Contents

- [How the planner works](#how-the-planner-works)
- [Marketplace fees](#marketplace-fees)
- [Auction houses, dealers and lots](#auction-houses-dealers-and-lots)
- [Expert certificates](#expert-certificates)
- [Postage from Canada](#postage-from-canada)
- [United States customs](#united-states-customs)
- [United Kingdom and European Union](#united-kingdom-and-european-union)
- [Canadian export permits](#canadian-export-permits)
- [Country of origin](#country-of-origin)
- [Keeping this page current](#keeping-this-page-current)

## How the planner works

1. **Planning price (P).** From your sold prices, the AI estimate, or your own figure. See the [user guide](user-guide.md#value-and-its-sources).
2. **Buyer's side costs.** Where buyers pay something on top, they bid less. The planner assumes a buyer's total budget stays near P:
   - U.S. buyer of a Canadian-origin stamp: price lands near P / 1.5, because of the 50% duty.
   - Auction house: hammer lands near P / (1 + buyer's premium).
   - Delcampe: price lands near (P minus the fixed buyer fee) / 1.10.
3. **Shipping** is chosen by value and destination. It is usually charged to the buyer, so it appears both as income and as a cost. Fees that apply to shipping (eBay, HipStamp) are calculated on the total.
4. **Fees** for each channel are subtracted, along with a certificate if you include one.
5. **Best fit** is the channel with the highest net, with these exceptions:
   - Under $5: a lot is recommended.
   - Auctions are not considered under $50.
   - Channels marked "Not practical now" are skipped.

Thresholds (CAD): lot under 5; tracked shipping from 30; private insurance from 100; auctions considered from 50 and suggested from 750; certificate advice from 300.

## Marketplace fees

### eBay.ca

| Item | Figure | Confidence |
|---|---|---|
| Final value fee, no store | 13.6% of the total up to $7,500 per item, then 2.35% | Partly verified. Stamps falls under "most categories" and is not named on the page. |
| Final value fee, with a store (Stamps) | 9.7% up to $2,500 per item, then 2.35% | Verified |
| Per-order fee | $0.30 for orders of $10 or less, $0.40 above | Verified |
| International fee | 0.4% for U.S. buyers, 1% for other countries. None with eBay International Shipping. | Verified on eBay's page. A third-party article from August 2026 gives 1.45%, which conflicts. |
| What fees apply to | Item price, handling, shipping and sales tax | Verified |

Sources: [eBay.ca selling fees](https://www.ebay.ca/help/selling/fees-credits-invoices/selling-fees-managed-payments-sellers?id=4822), [eBay.ca store selling fees](https://www.ebay.ca/help/selling/fees-credits-invoices/store-selling-fees?id=4809).

### HipStamp

| Item | Figure | Confidence |
|---|---|---|
| Commission | 8.95% of the sale including shipping, capped at $350 per item (Basic, Featured and Premium plans) | Partly verified. The fees page lists 11.95% for the Starter plan; the Help Center (January 2026) lists 8.95%. |
| Listing fees | $0 for fixed price. Auctions $0.05 per listing (one FAQ says 3 cents). | Partly verified |
| Store plans | Starter, Basic, Featured and Premium, from about $4.95 to $129.95 a month | Verified |
| Payment processing | Buyers pay through PayPal. HipStamp does not list a seller fee. The planner assumes 2.9% plus $0.30. | Estimate. Check your PayPal fees. |

Sources: [HipStamp fees](https://www.hipstamp.com/fees), [HipStamp seller fees help](https://hip.helpscoutdocs.com/article/112-seller-fees).

### Delcampe

| Item | Figure | Confidence |
|---|---|---|
| Seller commission and listing fees | None | Verified |
| Seller payment fee | 1.60% plus EUR 0.15 per payment | Verified |
| Buyer fee | 10% plus EUR 0.30 per item, paid by the buyer | Verified. In place since 2024. |
| Euro to Canadian dollars | 1.6, a rough conversion | Estimate. Update `eurToCad` in rules.js. |

Source: [Delcampe fees](https://www.delcampe.net/en_US/tarifas.html).

## Auction houses, dealers and lots

Auction houses publish their buyer's premium. Seller commissions are usually negotiated and rarely published.

| House | Buyer's premium | Seller terms found |
|---|---|---|
| Sparks Auctions, Ottawa | 20% plus tax, 3.5% surcharge for card payments | Not published |
| Eastern Auctions, Bathurst | 20% | "Very competitive", not stated |
| Vance Auctions, Smithville | None (no buyer's fee) | Not published |
| Garden City Philatelic Auctions, Victoria | 17% | Not stated. Minimum consignment $1,000. Paid 45 business days after the sale. |
| Longley Auctions, Waterdown | 18%, plus 3% for card payments | Not published |
| Weeda Stamps bidboard, Victoria | None | 30% on the bidboard terms page, 25% on the consignments page. $500 minimum. |

Planner defaults:
- **Buyer's premium**: 20%. Verified as the most common figure.
- **Seller commission**: 15%. Estimate. Ask the house, and replace it in Settings.
- **Dealer offer**: 35% of retail. Estimate. The American Philatelic Society says only that collections "generally may be purchased for less than catalog value". No association publishes a percentage.
- **Lot share**: 50% of value. Estimate for low-value stamps sold together.

## Expert certificates

| Expertizer | Fee | Confidence |
|---|---|---|
| Vincent Graves Greene Philatelic Research Foundation, Toronto | Tiered by catalogue value, from $50 CAD | Partly verified |
| Philatelic Foundation, New York | 5.5% of value, minimum $27, maximum $1,000. Covers minimum $40, foreign stamps minimum $35. Faster service costs more. | Partly verified |
| British Philatelic Association | 40 pounds per certificate up to 2,000 pounds catalogue value, 2% above that | Partly verified |
| Professional Stamp Experts | Not found | Unverified |

Planner default: **$75 CAD**, an estimate covering a basic Greene Foundation certificate plus return postage.

## Postage from Canada

| Service | Price | Confidence |
|---|---|---|
| Lettermail, Canada, up to 30 g | $1.24 with a Permanent stamp from a booklet or coil, $1.44 as a single stamp | Verified. In effect since January 13, 2025, unchanged in 2026. |
| Lettermail, United States, up to 30 g | $1.75, but **documents only**. Goods, including stamps you sell, cannot go to the U.S. by letter-post. | Verified |
| Lettermail, international, up to 30 g | $3.65 | Verified |
| Registered Mail, Canada | $13.15 plus postage | Verified |
| Registered Mail, international | $26.25 plus postage. To the U.S., only through Xpresspost-USA. | Verified |
| Tracked Packet USA | About $13.05 for 100 g (January 2025 price) | Partly verified. The current table would not load. |
| Tracked Packet coverage | $100 included. No extra coverage. Up to 1 kg to the U.S. | Verified |
| Registered coverage, U.S. and international | $60. Canada Post's pages conflict on whether stamps are covered at all. | Partly verified |
| Customs declaration to the U.S. | Every item needs a Zonos Declaration ID with duties prepaid. The fee is $1.99 plus 10% of duties (verified business account) or $3.99 plus 10% (Prepay app). | Verified. The page still describes older tariff rules in places. |

Planner defaults:
- Canada: Lettermail $1.24; Registered Mail $14.39.
- U.S.: Tracked Packet USA $13.05, plus the $3.99 declaration fee and 10% of any duty.
- International: Lettermail $3.65; Registered Mail $29.90.
- Supplies: $0.60 per order.

Sources: [Lettermail prices](https://origin-www.canadapost.ca/cpc/doc/en/support/LM-e.pdf), [U.S. and international letter-post prices](https://www.canadapost-postescanada.ca/cpc/doc/en/support/LP-e.pdf), [Shipping to the U.S.: duty updates](https://www.canadapost-postescanada.ca/cpc/en/support/campaign/shipping-to-us-duty-updates.page).

## United States customs

| Date | Change |
|---|---|
| Feb 20, 2026 | The U.S. Supreme Court rules that the emergency (IEEPA) tariffs were never authorized. |
| Feb 24 to Jul 24, 2026 | A 10% Section 122 surcharge applies, with CUSMA goods exempt. It expired on July 24. |
| From Jul 24, 2026 | A 10% Section 301 tariff on Canadian goods. Stamps (9704.00.00) are on its exemption list. |
| Jun 24 and Jul 24, 2026 | U.S. Customs suspends the low-value (de minimis) exemption indefinitely, for couriers and then for mail. |
| Aug 22, 2026 | A **50% duty** on many Canadian goods takes effect under Section 338 (Proclamation 11048, heading 9903.03.14). **Stamps, covers and postal stationery (HTS 9704.00.00) are covered. There is no CUSMA exemption.** |
| Sep 15, 2026 | Eight codes are removed from the 50% list. Stamps are not one of them. |
| **Oct 22, 2026** | U.S.-bound mail carrying the Section 338 duty must go through **formal customs entry**, which normally needs a licensed customs broker and a bond. A voluntary electronic mail entry test opens the same day. |
| Jul 1, 2027 | The low-value exemption ends by law. |

What this means for a seller in Canada:
- **Canadian-origin stamps to U.S. buyers.** The buyer, or you if you prepay through Canada Post, pays 50% on top. From October 22, 2026, mailing them needs formal entry. For most private sellers this is not practical, so the planner marks marketplace channels "Not practical now" for U.S. buyers. Sell to Canadian and overseas buyers, or through a Canadian auction house that handles its own exports.
- **Stamps printed elsewhere.** The 50% duty applies to Canadian goods, so it should not apply to a British or American stamp you ship from Canada. The Canadian Stamp Dealers' Association says non-Canadian stamps "should not be treated as Canadian-origin simply because it is shipped from Canada." The base U.S. duty on stamps is free. Every parcel still needs the Zonos declaration.

Sources: [Canadian Stamp News, August 17, 2026](https://canadianstampnews.com/new-u-s-tariff-could-hit-canadian-stamp-shipments/), [Canadian Stamp News, September 10, 2026](https://canadianstampnews.com/u-s-tariff-squeezes-canadian-stamp-dealers/), and the Canada Post page above. The research behind this table also used Federal Register document 2026-14997 (Proclamation 11048), U.S. Customs messages CSMS 69606660, 69851916, 67844987 and 69326983, and Federal Register documents 2026-12669 and 2026-12670.

## United Kingdom and European Union

**United Kingdom.**
- The VAT Act 1994, section 21, values philatelic collectors' pieces at 25% of their value on import, which works out to **5% VAT**. This covers postage and revenue stamps, postmarks, first day covers and pre-stamped stationery, franked or not legal tender.
- On orders of 135 pounds or less, the marketplace charges VAT at checkout. eBay UK lists 20% as standard. Collectors have reported being charged 20% on stamps rather than 5%.
- Source: [VAT Act 1994, section 21](https://www.legislation.gov.uk/ukpga/1994/23/section/21).

**European Union.**
- Article 103 of the VAT Directive lets member states apply a reduced import rate to collectors' items. Annex IX Part B lists stamps, postmarks, first day covers and pre-stamped stationery under CN code 9704. Rates vary by country.
- On orders of 150 euros or less, the marketplace collects VAT at checkout under IOSS. Whether those sales get the reduced rate is not confirmed.
- Since July 1, 2026, a 3 euro duty applies per item in low-value parcels.

## Canadian export permits

The [Cultural Property Export Control List](https://laws-lois.justice.gc.ca/eng/regulations/c.r.c.,_c._448/FullText.html) sets out what needs a permit to leave Canada. It applies only to objects 50 years old or older, made by someone no longer living.

- **Group VII**: a "cover or sheet that contains postal markings or that incorporates postage or revenue stamps" needs a permit if it is worth more than **$1,000 in Canada**. It must also have been made in Canada, made abroad by a resident, or relate to Canadian history or national life.
- **Group IV**: a pre-production proof of a Canadian stamp made outside Canada needs a permit above $3,000.
- Loose stamps are not named.

The planner shows an amber note when a cover, sheet or similar item from a Canadian context is at least 50 years old, worth over $1,000, and headed outside Canada. A Yukon or Atlin cover from the 1930s worth $1,500 would trigger it. Ask the Movable Cultural Property program before you ship.

## Country of origin

U.S. Customs defines country of origin as the country of manufacture, production or growth ([19 CFR 134.1](https://www.law.cornell.edu/cfr/text/19/134.1)). For stamps, that points to where they were printed, which is why the app asks "Printed in".

No U.S. Customs ruling settles stamp origin directly. Ruling H354294 (October 2025) classified foreign stamps and a first day cover under 9704 without deciding origin. Treat "Printed in" as your best information, and confirm with a customs broker for anything valuable. Some examples:
- The 1851 to 1859 stamps of the Province of Canada were printed in New York.
- Many early Newfoundland and British colonial stamps were printed in London.

## Keeping this page current

When a figure changes:

1. Update it in `src/sell/rules.js`, with a short comment if the source conflicts.
2. Update `asOf` and the matching entry in `sources`.
3. Update this page and `CHANGELOG.md`.
4. Run `npm test`. The planner tests check the arithmetic, the U.S. formal entry date, and the export permit rule.

Likely to change soon:
- The Section 338 product list and the Canada and U.S. negotiations.
- U.S. formal entry for mail, which starts October 22, 2026.
- The legal challenges to Sections 301 and 122.
- The statutory end of U.S. de minimis on July 1, 2027.
- EU customs handling fees.
- Canada Post prices.
