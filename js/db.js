/* =====================================================================
   本地数据层 · IndexedDB
   - mistakes / papers：结构化记录
   - photos：原始照片 Blob（不再受 localStorage 5MB 限制、不再存 base64）
   - 隐私模式等不可用时自动降级为内存态，界面会提示
   ===================================================================== */
(function () {
  const DB_NAME = 'cuoti-v2';
  const DB_VER = 1;
  let dbp = null;
  let degraded = false;
  const mem = { mistakes: new Map(), papers: new Map(), photos: new Map(), meta: new Map() };
  const urlCache = new Map();

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('no indexedDB'));
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('mistakes')) db.createObjectStore('mistakes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('papers')) db.createObjectStore('papers', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb open failed'));
      req.onblocked = () => reject(new Error('idb blocked'));
    }).catch((e) => { degraded = true; return null; });
    return dbp;
  }

  async function tx(storeName, mode, fn) {
    const db = await open();
    if (!db) return fn(null);
    return new Promise((resolve, reject) => {
      let t;
      try { t = db.transaction(storeName, mode); }
      catch (e) { degraded = true; return resolve(fn(null)); }
      const store = t.objectStore(storeName);
      let result;
      Promise.resolve(fn(store)).then((r) => { result = r; }).catch(reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('aborted'));
    });
  }

  function reqP(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  const DB = {
    get degraded() { return degraded; },

    async allMistakes() {
      const rows = await tx('mistakes', 'readonly', (s) => s ? reqP(s.getAll()) : [...mem.mistakes.values()]);
      return (rows || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    async putMistake(row) {
      await tx('mistakes', 'readwrite', (s) => s ? reqP(s.put(row)) : mem.mistakes.set(row.id, row));
      return row;
    },
    async deleteMistake(id) {
      await tx('mistakes', 'readwrite', (s) => s ? reqP(s.delete(id)) : mem.mistakes.delete(id));
    },

    async allPapers() {
      const rows = await tx('papers', 'readonly', (s) => s ? reqP(s.getAll()) : [...mem.papers.values()]);
      return (rows || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },
    async putPaper(row) {
      await tx('papers', 'readwrite', (s) => s ? reqP(s.put(row)) : mem.papers.set(row.id, row));
      return row;
    },
    async deletePaper(id) {
      await tx('papers', 'readwrite', (s) => s ? reqP(s.delete(id)) : mem.papers.delete(id));
    },

    async putPhoto(id, blob) {
      await tx('photos', 'readwrite', (s) => s ? reqP(s.put(blob, id)) : mem.photos.set(id, blob));
      const old = urlCache.get(id);
      if (old) { URL.revokeObjectURL(old); urlCache.delete(id); }
      return id;
    },
    async getPhoto(id) {
      if (!id) return null;
      return tx('photos', 'readonly', (s) => s ? reqP(s.get(id)) : mem.photos.get(id));
    },
    async deletePhoto(id) {
      if (!id) return;
      await tx('photos', 'readwrite', (s) => s ? reqP(s.delete(id)) : mem.photos.delete(id));
      const old = urlCache.get(id);
      if (old) { URL.revokeObjectURL(old); urlCache.delete(id); }
    },
    /* 取照片的可显示 URL（同一 Blob 只建一次 URL） */
    async photoURL(id) {
      if (!id) return null;
      if (urlCache.has(id)) return urlCache.get(id);
      const blob = await DB.getPhoto(id);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      urlCache.set(id, url);
      return url;
    },

    async getMeta(key, dflt) {
      const v = await tx('meta', 'readonly', (s) => s ? reqP(s.get(key)) : mem.meta.get(key));
      return v === undefined ? dflt : v;
    },
    async setMeta(key, val) {
      await tx('meta', 'readwrite', (s) => s ? reqP(s.put(val, key)) : mem.meta.set(key, val));
    },

    async clearAll() {
      await tx('mistakes', 'readwrite', (s) => s ? reqP(s.clear()) : mem.mistakes.clear());
      await tx('papers', 'readwrite', (s) => s ? reqP(s.clear()) : mem.papers.clear());
      urlCache.forEach((u) => URL.revokeObjectURL(u));
      urlCache.clear();
    },

    /* ---------- 工具：dataURL → Blob ---------- */
    dataURLtoBlob(dataURL) {
      try {
        const [head, body] = dataURL.split(',');
        const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
        const bin = atob(body);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
      } catch (e) { return null; }
    },
    blobToDataURL(blob) {
      return new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
    },

    /* ---------- 迁移旧版 localStorage 数据（cuoti.mistakes.v1） ---------- */
    async migrateLegacy() {
      const KEY = 'cuoti.mistakes.v1';
      let raw;
      try { raw = localStorage.getItem(KEY); } catch (e) { return 0; }
      if (!raw) return 0;
      if (await DB.getMeta('legacyMigrated')) return 0;
      let old;
      try { old = JSON.parse(raw); } catch (e) { return 0; }
      if (!Array.isArray(old) || !old.length) { await DB.setMeta('legacyMigrated', true); return 0; }
      const existing = await DB.allMistakes();
      if (existing.length) { await DB.setMeta('legacyMigrated', true); return 0; }
      let n = 0;
      for (const m of old) {
        const id = m.id || ('m_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
        let photoId = null;
        if (m.photo && typeof m.photo === 'string' && m.photo.startsWith('data:')) {
          const blob = DB.dataURLtoBlob(m.photo);
          if (blob) { photoId = 'p_' + id; await DB.putPhoto(photoId, blob); }
        }
        await DB.putMistake({
          id,
          subject: m.subject || '数学',
          title: m.title || '未命名错题',
          content: m.content || '',
          source: m.source || '手录',
          status: m.status || '待复习',
          photoId,
          analysis: m.analysis || null,
          notes: m.notes || '',
          createdAt: m.ts || m.createdAt || Date.now(),
          updatedAt: m.updatedAt || m.ts || Date.now()
        });
        n++;
      }
      await DB.setMeta('legacyMigrated', true);
      try { localStorage.removeItem(KEY); } catch (e) {}
      return n;
    }
  };

  window.DB = DB;
})();
