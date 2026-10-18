// Local-first storage for the standalone app: IndexedDB on this device.
// Nothing leaves the browser unless the user exports a backup.

const DB_NAME = 'stamp-loupe';
const DB_VERSION = 1;
const STORES = ['stamps', 'private', 'settings', 'images'];

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('indexeddb')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(v => { out = v; }, reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('abort'));
  });
}

const reqP = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export async function localStore() {
  const db = await openDb();
  const listeners = { stamps: new Set(), settings: new Set(), private: new Set() };
  const urlCache = new Map();

  async function all(store) { return tx(db, store, 'readonly', s => reqP(s.getAll())); }
  async function emit(kind) {
    if (kind === 'stamps') { const v = await all('stamps'); listeners.stamps.forEach(cb => cb(v)); }
    if (kind === 'settings') { const v = await tx(db, 'settings', 'readonly', s => reqP(s.get('collection'))); listeners.settings.forEach(cb => cb(v ? v.data : {})); }
    if (kind === 'private') { const v = await all('private'); const o = {}; v.forEach(x => { o[x.id] = x.data; }); listeners.private.forEach(cb => cb(o)); }
  }
  const sub = (kind) => (cb) => { listeners[kind].add(cb); emit(kind); return () => listeners[kind].delete(cb); };

  const api = {
    kind: 'local',
    hasImages: true,
    subscribeStamps: sub('stamps'),
    subscribeSettings: sub('settings'),
    subscribePrivate: sub('private'),
    async addStamp(id, doc) { await tx(db, 'stamps', 'readwrite', s => s.put(Object.assign({}, doc, { id }))); emit('stamps'); },
    async updateStamp(id, patch) {
      await tx(db, 'stamps', 'readwrite', async s => {
        const cur = await reqP(s.get(id));
        if (!cur) throw Object.assign(new Error('missing'), { code: 'not_found' });
        s.put(Object.assign({}, cur, patch, { id }));
      });
      emit('stamps');
    },
    async deleteStamp(id) {
      await tx(db, 'stamps', 'readwrite', s => s.delete(id));
      await tx(db, 'private', 'readwrite', s => s.delete(id));
      emit('stamps'); emit('private');
    },
    async getPrivate(id) { const v = await tx(db, 'private', 'readonly', s => reqP(s.get(id))); return v ? v.data : null; },
    async setPrivate(id, data) { await tx(db, 'private', 'readwrite', s => s.put({ id, data })); emit('private'); },
    async setSettings(doc) { await tx(db, 'settings', 'readwrite', s => s.put({ id: 'collection', data: doc })); emit('settings'); },
    async putImage(blob) {
      const id = 'img' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await tx(db, 'images', 'readwrite', s => s.put({ id, blob, type: blob.type || 'image/jpeg' }));
      return id;
    },
    async imageUrl(id) {
      if (!id) return '';
      if (urlCache.has(id)) return urlCache.get(id);
      const rec = await tx(db, 'images', 'readonly', s => reqP(s.get(id)));
      if (!rec) return '';
      const u = URL.createObjectURL(rec.blob);
      urlCache.set(id, u);
      return u;
    },
    async deleteImage(id) {
      if (!id) return;
      await tx(db, 'images', 'readwrite', s => s.delete(id));
      if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
    },

    /** Everything, with photos as base64, for a backup file. */
    async exportAll() {
      const [stamps, priv, settings, images] = await Promise.all(['stamps', 'private', 'settings', 'images'].map(all));
      const imgs = [];
      for (const r of images) imgs.push({ id: r.id, type: r.type, data: await blobToBase64(r.blob) });
      return { app: 'stamp-loupe', version: 2, exportedAt: new Date().toISOString(), stamps, private: priv, settings, images: imgs };
    },
    async importAll(data, { replace } = {}) {
      if (!data || data.app !== 'stamp-loupe') throw Object.assign(new Error('not a backup'), { code: 'bad_backup' });
      if (replace) for (const s of STORES) await tx(db, s, 'readwrite', st => st.clear());
      for (const r of data.images || []) {
        const blob = base64ToBlob(r.data, r.type);
        await tx(db, 'images', 'readwrite', s => s.put({ id: r.id, blob, type: r.type }));
      }
      for (const r of data.stamps || []) await tx(db, 'stamps', 'readwrite', s => s.put(r));
      for (const r of data.private || []) await tx(db, 'private', 'readwrite', s => s.put(r));
      for (const r of data.settings || []) await tx(db, 'settings', 'readwrite', s => s.put(r));
      emit('stamps'); emit('settings'); emit('private');
      return { stamps: (data.stamps || []).length, images: (data.images || []).length };
    },
    async eraseAll() {
      for (const s of STORES) await tx(db, s, 'readwrite', st => st.clear());
      urlCache.forEach(u => URL.revokeObjectURL(u));
      urlCache.clear();
      emit('stamps'); emit('settings'); emit('private');
    }
  };
  return api;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: type || 'image/jpeg' });
}
