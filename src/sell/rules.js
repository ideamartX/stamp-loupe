// Fees, postage and customs facts used by the Sell planner.
//
// These change. Every figure below was checked on the date in `asOf` against
// the source listed in `sources`. Figures marked `estimate: true` are not
// published by the provider; they are reasonable defaults the user should
// replace in Settings. When you update a figure, update `asOf`, its source,
// and CHANGELOG.md. See docs/selling-rules.md for the full notes.

export const RULES = {
  asOf: '2026-10-17',
  currency: 'CAD',
  eurToCad: 1.6, // rough conversion for Delcampe's euro fees; update as needed

  fees: {
    // eBay.ca. Stamps falls under "most categories" for sellers without a store.
    ebay: {
      rate: 0.136, tierAt: 7500, rateHigh: 0.0235,          // no store
      store: false, storeRate: 0.097, storeTierAt: 2500,    // with a store, Stamps category
      perOrderSmall: 0.30, perOrderLarge: 0.40, perOrderAt: 10,
      intlUS: 0.004, intlOther: 0.01                       // buyer outside Canada; none with eBay International Shipping
    },
    // HipStamp: commission on the sale including shipping, capped per item.
    // Buyers pay through PayPal; the seller's PayPal fee is an estimate.
    hipstamp: { rate: 0.0895, cap: 350, payRate: 0.029, payFixed: 0.30, payEstimate: true },
    // Delcampe: no seller commission. Sellers pay a payment fee; buyers pay a 10% fee plus EUR 0.30 per item.
    delcampe: { sellerRate: 0, payRate: 0.016, payFixedEur: 0.15, buyerRate: 0.10, buyerFixedEur: 0.30 },
    // Auction houses publish buyer's premiums; seller commissions are negotiated.
    auction: { commission: 0.15, commissionEstimate: true, buyerPremium: 0.20, lotFee: 0 },
    // No published norm. Offers vary widely with the material.
    dealer: { share: 0.35, estimate: true },
    lot: { share: 0.5, estimate: true }
  },

  postage: {
    supplies: 0.6, // envelope, stiffener, sleeve (estimate)
    CA: {
      letter: 1.24, letterLabel: 'Lettermail',
      tracked: 14.39, trackedLabel: 'Registered Mail', // $13.15 registration plus $1.24 postage
      coverageIncluded: 0, coverageRate: 0
    },
    US: {
      letter: null, letterLabel: 'Not allowed for goods', // U.S. letter-post is limited to documents
      tracked: 13.05, trackedLabel: 'Tracked Packet USA', trackedEstimate: true,
      coverageIncluded: 100, coverageRate: 0,
      declarationFee: 3.99, declarationDutyShare: 0.10 // Zonos declaration with prepaid duties, Prepay app rate
    },
    INTL: {
      letter: 3.65, letterLabel: 'International Lettermail',
      tracked: 29.90, trackedLabel: 'Registered Mail International', // $26.25 registration plus $3.65 postage
      coverageIncluded: 60, coverageRate: 0
    }
  },

  certificate: { cost: 75, estimate: true }, // Greene Foundation fees start at $50; add return postage

  thresholds: { lot: 5, tracked: 30, insure: 100, auctionMin: 50, auctionFrom: 750, certFrom: 300 },

  customs: {
    description: 'Postage stamps for collectors',
    hs: '9704.00',
    US: {
      canadaTariff: 0.5,
      tariffSince: '2026-08-22',
      formalEntryFrom: '2026-10-22',
      canadaTariffNote: 'Since August 22, 2026, the U.S. charges an extra 50% duty on Canadian-origin stamps and covers (HTS 9704.00.00), with no CUSMA exemption. Canada Post collects it up front through its Zonos declaration.',
      formalEntryNote: 'From October 22, 2026, U.S.-bound mail carrying this duty must go through formal customs entry, which normally needs a licensed customs broker. For most private sellers, shipping Canadian-origin stamps to U.S. buyers is not practical right now.',
      otherOriginNote: 'This item\'s customs origin is {origin}, so the U.S. duty on Canadian goods should not apply. U.S. customs has not ruled on how stamp origin is set, so confirm with a customs broker.',
      postalNote: 'Canada Post requires a Zonos declaration with duties prepaid for every U.S.-bound item. The fee is about $1.99 to $3.99 plus 10% of any duty. U.S. Lettermail is limited to documents, so stamps must go as a parcel, such as Tracked Packet USA.',
      deMinimisNote: 'The U.S. low-value exemption is suspended, so U.S. customs processes every parcel.',
      listingLine: 'U.S. buyers: this item is Canadian-origin. U.S. customs charges a 50% duty, and shipping it to the U.S. may not be possible right now.'
    },
    UK: { note: 'UK import VAT on collectors\' stamps works out to 5% of the value. On orders of 135 pounds or less, marketplaces charge VAT at checkout, sometimes at the standard 20%.' },
    EU: { note: 'EU countries may charge reduced import VAT on collectors\' stamps. On orders of 150 euros or less, marketplaces collect VAT at checkout. Since July 1, 2026, low-value parcels also carry a 3 euro duty per item.' },
    INTL: { note: 'The buyer may owe import duty or tax in their country.' }
  },

  export: {
    // Canadian Cultural Property Export Control List, Group VII.
    formats: ['cover', 'postcard', 'postal stationery', 'sheetlet', 'block', 'booklet pane'],
    minAgeYears: 50,
    valueFrom: 1000,
    note: 'Covers and sheets over 50 years old and worth more than $1,000 in Canada may need a Canadian cultural property export permit before they leave the country (Control List, Group VII). Loose stamps are not named. Check with the Movable Cultural Property program before you ship.'
  },

  sources: [
    { label: 'eBay.ca selling fees', url: 'https://www.ebay.ca/help/selling/fees-credits-invoices/selling-fees-managed-payments-sellers?id=4822', checked: '2026-10-17' },
    { label: 'eBay.ca store selling fees', url: 'https://www.ebay.ca/help/selling/fees-credits-invoices/store-selling-fees?id=4809', checked: '2026-10-17' },
    { label: 'HipStamp seller fees', url: 'https://www.hipstamp.com/fees', checked: '2026-10-17' },
    { label: 'Delcampe fees', url: 'https://www.delcampe.net/en_US/tarifas.html', checked: '2026-10-17' },
    { label: 'Canada Post Lettermail prices', url: 'https://origin-www.canadapost.ca/cpc/doc/en/support/LM-e.pdf', checked: '2026-10-17' },
    { label: 'Canada Post U.S. and international letter-post prices', url: 'https://www.canadapost-postescanada.ca/cpc/doc/en/support/LP-e.pdf', checked: '2026-10-17' },
    { label: 'Canada Post shipping to the U.S. (duties and Zonos)', url: 'https://www.canadapost-postescanada.ca/cpc/en/support/campaign/shipping-to-us-duty-updates.page', checked: '2026-10-17' },
    { label: 'New U.S. tariff could hit Canadian stamp shipments (Canadian Stamp News)', url: 'https://canadianstampnews.com/new-u-s-tariff-could-hit-canadian-stamp-shipments/', checked: '2026-10-17' },
    { label: 'Cultural Property Export Control List', url: 'https://laws-lois.justice.gc.ca/eng/regulations/c.r.c.,_c._448/FullText.html', checked: '2026-10-17' },
    { label: 'UK VAT Act 1994, section 21', url: 'https://www.legislation.gov.uk/ukpga/1994/23/section/21', checked: '2026-10-17' },
    { label: 'Claude models and pricing', url: 'https://platform.claude.com/docs/models/overview', checked: '2026-10-17' }
  ]
};
