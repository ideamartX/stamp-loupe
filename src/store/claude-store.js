// Storage inside a Claude artifact: the `db` capability for records and the
// `assets` capability for photos. Records are shared with anyone the owner
// shares the page with; the `private` collection is readable by editors only
// (see the db rules declared when the artifact is published).

export function claudeStore({ db, assets }) {
  return {
    kind: 'claude',
    hasImages: !!assets,
    subscribeStamps(cb, onErr) {
      return db.collection('stamps').onSnapshot(snap => cb(snap.docs.map(d => Object.assign({ id: d.id }, d.data()))), onErr || (() => {}));
    },
    subscribeSettings(cb) {
      return db.doc('settings/collection').onSnapshot(d => cb(d.exists ? d.data() : {}), () => {});
    },
    subscribePrivate(cb) {
      return db.collection('private').onSnapshot(snap => {
        const out = {};
        for (const d of snap.docs) out[d.id] = d.data();
        cb(out);
      }, () => {});
    },
    addStamp(id, doc) { return db.collection('stamps').doc(id).set(doc); },
    updateStamp(id, patch) { return db.collection('stamps').doc(id).update(patch); },
    async deleteStamp(id) {
      await db.collection('stamps').doc(id).delete();
      try { await db.collection('private').doc(id).delete(); } catch (_) { /* nothing private */ }
    },
    async getPrivate(id) {
      const d = await db.collection('private').doc(id).get();
      return d.exists ? d.data() : null;
    },
    setPrivate(id, data) { return db.collection('private').doc(id).set(data); },
    setSettings(doc) { return db.doc('settings/collection').set(doc); },
    async putImage(blob) {
      if (!assets) return null;
      const r = await assets.upload(blob, { type: blob.type || 'image/jpeg' });
      return r.id;
    },
    imageUrl(id) { return id ? '/_blob/' + id : ''; },
    async deleteImage(id) { if (assets && id) { try { await assets.delete(id); } catch (_) { /* already gone */ } } }
  };
}

/** Map db write errors to plain messages. */
export function writeErrorMessage(e) {
  const code = e && e.code;
  if (code === 'invalid_argument' || code === 'not_granted' || code === 'permission_denied') return { readOnly: true, message: 'This collection is view only for you.' };
  if (code === 'quota_exceeded' || code === 'quota_or_state') return { message: 'Storage is full. Delete some stamps, then try again.' };
  if (code === 'too_large') return { message: 'That photo is too large to store.' };
  if (code === 'rate_limited' || code === 'resource_exhausted') return { message: 'Too many changes at once. Wait a moment, then try again.' };
  return { message: 'That did not save. Check your connection and try again.' };
}
