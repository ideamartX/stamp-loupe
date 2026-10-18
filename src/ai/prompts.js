// Prompts for identification and listings. The model is asked for strict
// JSON so the app can render and store the answer field by field.

const SUBJECT_LINES = {
  single: 'Image 1 shows the front of one postage stamp. The app has already straightened and cropped it.',
  block: 'Image 1 shows a multiple of stamps: a pair, strip, block, sheetlet or booklet pane. The app has straightened and cropped it.',
  cover: 'Image 1 shows a cover, postcard or other postal item with stamps and postal markings. The app has straightened and cropped it.'
};

export function idPrompt(inp, cur, opts = {}) {
  const subject = SUBJECT_LINES[opts.subject] ? opts.subject : 'single';
  const schema = {
    is_stamp: true,
    title: 'Country, year, denomination, colour, and common name. Example: Great Britain 1840 1d black (Penny Black)',
    country: '', year: '1840, or a range such as c. 1870s', issue: 'set or series name', denomination: '', color: '',
    design: 'one sentence', printing: 'printing method, or unknown', perforation: 'imperforate, perf 14, or unknown', watermark: 'name, none, or unknown',
    format: { kind: 'single, pair, strip, block, sheetlet, booklet pane, cover, postcard, or postal stationery', count: 1, plate_or_imprint: 'plate number, imprint or position if visible', postal_markings: 'covers only: postmarks, registration, airmail, censor marks', route: 'covers only: from and to, if readable' },
    origin: { printed_in: 'country where these stamps were printed, if known; blank if unsure', printer: 'printer name if known' },
    catalogue: [{ system: 'Scott, Stanley Gibbons, Michel, Yvert, Unitrade, or WNS', number: '', certainty: 'likely or unsure' }],
    confidence: 'high, medium, or low',
    confidence_note: 'one or two sentences on what is certain and what is not',
    alternates: [{ title: 'a similar stamp it could be', how_to_tell: 'how to tell them apart' }],
    condition: { state: 'used, mint never hinged, mint hinged, no gum, on cover, or unknown', centering: '', margins_or_perfs: '', cancel: '', faults: ['visible faults; empty if none seen'], grade: 'Fine, Very Fine, and so on' },
    value: {
      currency: cur, low: 0, high: 0,
      basis: 'one sentence on what the range assumes',
      drivers: ['what would raise or lower the price'],
      sources: [{ kind: 'catalogue, auction records, dealer prices, marketplace sales, or general knowledge', detail: 'one sentence on what this part of the estimate rests on' }]
    },
    checks: ['specific things to check by hand to confirm identity or condition'],
    red_flags: ['signs of forgery, repair, regumming, reperforation, a faked cancel, or a reprint; empty if none'],
    expertize: { recommended: false, reason: 'one sentence' },
    story: 'two or three sentences of history about this stamp',
    search_query: 'short query to find comparable sales. Example: Penny Black 1840 used'
  };
  return [
    'You are an expert philatelist and stamp appraiser.',
    SUBJECT_LINES[subject] + (opts.hasBack ? ' Image 2 is the back of the same item.' : ''),
    'Identify it as precisely as the photo allows, judge its condition, and estimate what it would realistically sell for today.',
    '',
    'What the owner says (blank means unknown):',
    '- Country or origin: ' + (inp.country || ''),
    '- Perforation gauge measured: ' + (inp.perf || ''),
    '- Watermark seen: ' + (inp.wmk || ''),
    '- Gum or use: ' + (inp.gum || ''),
    '- Notes: ' + (inp.notes || ''),
    ...(opts.centering ? ['', 'Measured by the app from the straightened photo (use it for centering and grade):', '- Centering: ' + opts.centering] : []),
    '',
    'Rules:',
    '- Be honest about uncertainty. Many stamps differ only by perforation, watermark, paper, shade, or printing. Name what must be checked by hand.',
    '- Give a catalogue number only when you are reasonably sure. Mark each one likely or unsure. Never invent a number to fill the field.',
    '- "value" is a realistic market price range in ' + cur + ' for this item in the condition shown. It is not catalogue value. Many stamps are worth very little. Say so plainly when that is the case.',
    '- value.sources: say what the range rests on. You have no live market data, so say when a figure comes from general knowledge rather than a specific catalogue or sale record. Never invent a specific sale.',
    '- For a multiple, identify the stamp, give the format and count, note any plate number, imprint or position, and value the whole multiple.',
    '- For a cover, describe the stamps, postmarks, route and rate, and any special markings. Value the whole item. Postal history can be worth more than the stamps on it.',
    '- origin.printed_in is the country where the stamps were printed. It can differ from the issuing country. For example, the first stamps of the Province of Canada were printed in New York. Leave it blank if unsure.',
    '- Flag forgeries, reprints, repairs, regumming, faked cancels, cinderellas, and revenue stamps when you see signs of them.',
    '- If several separate stamps are in the photo, describe the most prominent one and mention the others in confidence_note.',
    '- If the image is not a stamp or postal item, set is_stamp to false and explain in confidence_note.',
    '- Do not copy personal names or street addresses from envelopes.',
    '- Write plain, short sentences. Do not use em dashes or en dashes.',
    '',
    'Reply with only this JSON object, filled in:',
    JSON.stringify(schema, null, 1)
  ].join('\n');
}

const CHANNEL_RULES = {
  ebay: [
    'Title: 80 characters or fewer. Start with country, year and issue. Add the catalogue number only if it is marked likely. Add the condition word (Used, MNH, MH) when known.',
    'Item specifics: the fields eBay stamp buyers filter by, such as Country/Region of Manufacture, Year of Issue, Quality, Grade, Certification, Type, Colour and Catalogue Number.'
  ],
  hipstamp: [
    'Title: 80 characters or fewer. HipStamp buyers search by country, year and catalogue number, so lead with those.',
    'Item specifics: Country, Year, Catalogue number, Condition, Centering, Gum, Certificate.'
  ],
  delcampe: [
    'Title: 80 characters or fewer. Delcampe buyers come from many countries, so use plain words and standard catalogue references.',
    'Item specifics: Country, Year, Catalogue number, Condition, Certificate.'
  ],
  auction: [
    'Title: a lot heading in auction catalogue style, such as "Canada 1859 5c vermilion Beaver, Scott 15".',
    'Description: an auction lot description: catalogue number, condition, centering, faults, and certificate, in the compact style auction houses use.',
    'Item specifics: Catalogue number, Condition, Certificate, Estimate.'
  ]
};

export function listingPrompt(st, channel, saleType, extra) {
  const cur = (extra && extra.currency) || (st.value && st.value.currency) || 'CAD';
  const data = {
    title: st.title, country: st.country, year: st.year, issue: st.issue, denomination: st.denomination, color: st.color,
    design: st.design, printing: st.printing, perforation: st.perforation, watermark: st.watermark, format: st.format,
    catalogue: st.catalogue, condition: st.condition, value: st.value, red_flags: st.red_flags
  };
  const rules = CHANNEL_RULES[channel] || CHANNEL_RULES.ebay;
  const where = { ebay: 'eBay', hipstamp: 'HipStamp', delcampe: 'Delcampe', auction: 'a stamp auction house consignment' }[channel] || 'eBay';
  return [
    'You write honest, accurate stamp listings for ' + where + '.',
    '',
    'Item data from an AI identification. The owner has not checked every detail:',
    JSON.stringify(data, null, 1),
    '',
    'Owner notes: ' + ((extra && extra.notes) || 'none'),
    'Expert certificate: ' + ((extra && extra.cert) || 'none'),
    'Sale type: ' + saleType,
    'Planning price: ' + ((extra && extra.price) ? cur + ' ' + extra.price + ' (' + extra.priceSource + ')' : 'not set'),
    'Shipping facts to include: ' + JSON.stringify((extra && extra.shipping) || []),
    'Customs facts to include: ' + JSON.stringify((extra && extra.customs) || []),
    'Currency: ' + cur,
    '',
    'Rules:',
    ...rules.map(r => '- ' + r),
    '- Description: 80 to 160 words in plain, short sentences. Say what it is and its condition. Name every visible fault. Say catalogue numbers are for reference. Say whether it has an expert certificate. Say the photos show the actual item. Claim nothing the data does not support. No hype words such as rare unless the data supports them.',
    '- shipping_text: two to four short sentences for the shipping and customs section, built only from the shipping and customs facts above. Do not add rules of your own.',
    saleType === 'Auction' ? '- Price: suggest a starting bid and explain it in one sentence.' : '- Price: suggest a fixed price and explain it in one sentence.',
    '- Photo tips: two or three short tips for photographing this item for buyers.',
    '- Do not use em dashes or en dashes.',
    '',
    'Reply with only this JSON object:',
    JSON.stringify({ title: '', description: '', specifics: [{ name: '', value: '' }], price: { amount: 0, currency: cur, note: '' }, shipping_text: '', photo_tips: [''] })
  ].join('\n');
}

/**
 * Page sort: one sheet of numbered crops from an album or stockbook page.
 * o: { count, first, last, cur, country, notes }
 */
export function pagePrompt(o) {
  const cur = o.cur || 'CAD';
  const first = o.first || 1, last = o.last || o.count;
  const schema = {
    stamps: [{
      n: first, is_stamp: true,
      title: 'Country, year, denomination, colour, and common name',
      country: '', year: '', denomination: '', color: '',
      catalogue: { system: 'Scott, Stanley Gibbons, Michel, Yvert, or Unitrade', number: '', certainty: 'likely or unsure' },
      band: 'under1, 1to10, 10to50, 50to250, or over250',
      low: 0, high: 0, look_closer: false,
      reason: 'up to 15 words', confidence: 'high, medium, or low'
    }],
    page_note: 'one sentence about the page as a whole'
  };
  return [
    'You are an expert philatelist sorting a page from a stamp album or stockbook.',
    `Image 1 is a sheet of ${o.count} stamps cut from one photo of the page. Each has a number in a dark badge at its top left, numbered ${first} to ${last}.`,
    'For each number, give a quick identification and a realistic value band for that stamp as photographed. Most album stamps are common and worth very little. Say so plainly.',
    `Value bands in ${cur}: under1 is under 1, then 1to10, 10to50, 50to250, and over250. low and high give your range in ${cur}, inside the band.`,
    `Set look_closer to true when the stamp could be worth more than about 10 ${cur}, or when a perforation, watermark, shade, overprint or plate variety could change its value a lot and needs checking by hand. Say why in reason.`,
    'Give a catalogue number only when you are reasonably sure, and mark it likely or unsure. Never invent one. Leave the catalogue number blank when unsure.',
    'If a numbered crop is not a stamp, set is_stamp to false. If it is too blurred or cut off to read, set confidence to low and say so in reason.',
    '',
    'What the owner says (blank means unknown):',
    '- Country or origin: ' + (o.country || ''),
    '- Notes: ' + (o.notes || ''),
    '',
    'Write plain, short sentences. Do not use em dashes or en dashes.',
    'Reply with only this JSON object. Include one entry for every number, in order:',
    JSON.stringify(schema)
  ].join('\n');
}
