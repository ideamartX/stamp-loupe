// The shape of a saved stamp record, shared by single scans, page sorts and imports.

/**
 * r: an identification result (normalizeId output plus app fields).
 * x: { photo, thumb, back, photoHash, sig, dupOf, now, status, notes }
 */
export function stampDoc(r, x) {
  return {
    title: r.title, country: r.country, year: r.year, issue: r.issue || '', denomination: r.denomination, color: r.color || '',
    design: r.design || '', printing: r.printing || '', perforation: r.perforation || '', watermark: r.watermark || '',
    format: r.format || null, origin: r.origin || null,
    catalogue: r.catalogue || [], confidence: r.confidence || 'low', confidence_note: r.confidence_note || '', alternates: r.alternates || [],
    condition: r.condition || {}, value: r.value || null, checks: r.checks || [], red_flags: r.red_flags || [], expertize: r.expertize || { recommended: false, reason: '' },
    story: r.story || '', search_query: r.search_query || '',
    subject: r.subject || 'single', inputs: r.inputs || {}, pricing: r.pricing || { basis: 'auto', manual: null, catalogue: null, comps: [] },
    capture: r.capture || null,
    // Measured on the device: centering from the photo.
    measured: r.measured || null,
    // Set when the stamp came from a page sort and has not been identified on its own.
    sort: r.sort || null,
    // Where the record came from when it was imported from a spreadsheet.
    imported: r.imported || null,
    // Collection details from the record tab or an import.
    gum: r.gum || '', location: r.location || '', quantity: r.quantity || null,
    photo: x.photo || null, thumb: x.thumb || null, back: x.back || null, photoHash: x.photoHash || '',
    // Duplicate check: a small picture signature, and the stamp it matched when saved.
    sig: x.sig || null, dupOf: x.dupOf || '',
    status: x.status || 'keep', notes: x.notes || '', grader: '', certNumber: '', grade: '', certDate: '', fingerprint: '',
    addedAt: x.now, updatedAt: x.now
  };
}
