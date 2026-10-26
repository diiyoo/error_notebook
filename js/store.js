/* =====================================================================
   应用状态 + 仓库层 + 订阅
   所有写操作走这里，写完通知 UI 重绘；数据落 IndexedDB
   ===================================================================== */
(function () {
  const C = window.Cuoti;
  const subs = [];

  const S = {
    ready: false,
    mistakes: [],
    papers: [],
    currentId: null,
    selection: new Set(),
    filters: { subject: '全部', status: '全部', q: '' },
    user: null,
    syncing: false,
    lastSync: null,
    ai: { running: false, stage: '', stream: '', results: [] }
  };

  function uid(prefix) {
    return (prefix || 'm_') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function emit() {
    subs.forEach((fn) => { try { fn(S); } catch (e) { console.error(e); } });
  }

  /* ---------- 初始化 ---------- */
  async function init() {
    let migrated = 0;
    try { migrated = await DB.migrateLegacy(); } catch (e) { console.warn('migrate failed', e); }
    await rescan();
    S.ready = true;
    emit();
    if (migrated) UI.toast('已把旧版本的 ' + migrated + ' 道错题迁移过来');
  }

  async function rescan() {
    S.mistakes = await DB.allMistakes();
    S.papers = await DB.allPapers();
    if (S.currentId && !S.mistakes.some((m) => m.id === S.currentId)) S.currentId = null;
    S.selection.forEach((id) => {
      if (!S.mistakes.some((m) => m.id === id)) S.selection.delete(id);
    });
  }

  /* ---------- 照片：压缩后存 Blob ---------- */
  function compressImage(file, maxEdge, quality) {
    const MAX = maxEdge || 1600;
    const Q = quality || 0.78;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        const scale = Math.min(1, MAX / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        cv.toBlob((blob) => {
          if (!blob) return reject(new Error('图片处理失败'));
          resolve(blob);
        }, 'image/jpeg', Q);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法读取')); };
      img.src = url;
    });
  }

  async function attachPhoto(file) {
    const blob = await compressImage(file);
    const id = 'p_' + uid('').slice(1);
    await DB.putPhoto(id, blob);
    return { photoId: id, size: blob.size };
  }

  /* ---------- 错题 CRUD ---------- */
  async function addMistake(payload, file) {
    let photoId = payload.photoId || null;
    if (file) {
      const r = await attachPhoto(file);
      photoId = r.photoId;
    }
    const now = Date.now();
    const row = {
      id: uid('m_'),
      subject: payload.subject || '其他',
      title: (payload.title || '').trim() || '未命名错题',
      content: (payload.content || '').trim(),
      source: payload.source || '手录',
      status: payload.status || '待复习',
      photoId,
      analysis: null,
      notes: '',
      createdAt: now,
      updatedAt: now,
      cloudId: null
    };
    await DB.putMistake(row);
    S.mistakes.unshift(row);
    emit();
    return row;
  }

  async function updateMistake(id, patch, file) {
    const m = S.mistakes.find((x) => x.id === id);
    if (!m) return null;
    if (file) {
      const r = await attachPhoto(file);
      if (m.photoId) await DB.deletePhoto(m.photoId);
      m.photoId = r.photoId;
    }
    if (patch.photoId !== undefined) m.photoId = patch.photoId;
    ['subject', 'title', 'content', 'source', 'status', 'notes', 'analysis'].forEach((k) => {
      if (patch[k] !== undefined) m[k] = patch[k];
    });
    m.updatedAt = Date.now();
    await DB.putMistake({ ...m });
    S.mistakes.sort((a, b) => b.updatedAt - a.updatedAt);
    emit();
    /* 已同步过的题，改动回推云端（失败不阻塞本地） */
    if (m.cloudId) pushOne(m).catch(() => {});
    return m;
  }

  async function removeMistake(id) {
    const m = S.mistakes.find((x) => x.id === id);
    if (!m) return;
    if (m.photoId) await DB.deletePhoto(m.photoId);
    await DB.deleteMistake(id);
    S.mistakes = S.mistakes.filter((x) => x.id !== id);
    S.selection.delete(id);
    if (S.currentId === id) S.currentId = null;
    emit();
    if (m.cloudId) {
      /* 删除也要同步，否则另一台设备下次拉取会把这条又拉回来。
         删失败（离线/网络）先记进待删队列，下次同步重试。 */
      try {
        const r = await C.db.deleteMistake(m.cloudId);
        if (r.error) await queueDelete('mistakes', m.cloudId);
      } catch (e) {
        await queueDelete('mistakes', m.cloudId);
      }
    }
  }

  /* ---------- 待删队列（离线删除的兜底） ---------- */
  const DEL_KEY = 'pendingDeletes';
  async function readDeletes() {
    try {
      const q = await DB.getMeta(DEL_KEY, null);
      return q && typeof q === 'object' ? { mistakes: q.mistakes || [], papers: q.papers || [] } : { mistakes: [], papers: [] };
    } catch (e) { return { mistakes: [], papers: [] }; }
  }
  async function queueDelete(kind, cloudId) {
    const q = await readDeletes();
    if (q[kind].indexOf(cloudId) < 0) q[kind].push(cloudId);
    await DB.setMeta(DEL_KEY, q);
  }
  /* 重试未完成的删除；返回仍然失败的 id（拉取时要跳过，避免复活） */
  async function flushDeletes() {
    const q = await readDeletes();
    const left = { mistakes: [], papers: [] };
    for (const id of q.mistakes) {
      const r = await C.db.deleteMistake(id);
      if (r && r.error) left.mistakes.push(id);
    }
    for (const id of q.papers) {
      const r = await C.db.deletePaper(id);
      if (r && r.error) left.papers.push(id);
    }
    await DB.setMeta(DEL_KEY, left);
    return left;
  }

  /* ---------- 选择 ---------- */
  function toggleSelect(id) {
    if (S.selection.has(id)) S.selection.delete(id);
    else S.selection.add(id);
    emit();
  }
  function selectIds(ids) {
    ids.forEach((id) => S.selection.add(id));
    emit();
  }
  function clearSelection() { S.selection.clear(); emit(); }

  /* ---------- 试卷 ----------
     试卷题目有两种来源，统一放进 items：
       { type:'mistake', id }                                    引用一道错题
       { type:'similar', fromId, question, answer, knowledge }   某道错题的相似练习（快照）
     相似题不是独立记录，必须把题干和答案存进试卷里；好处是原题以后改了/删了，
     这张卷子还是当初组的那份，打印出来不会变。
     云端 papers 表没有 items 列，所以跟着 config(jsonb) 一起存。 */
  function normItems(p) {
    if (Array.isArray(p.items) && p.items.length) return p.items;
    return (p.mistakeIds || []).map((id) => ({ type: 'mistake', id }));
  }

  async function createPaper(opts) {
    const items = (opts.items && opts.items.length)
      ? opts.items.map((x) => ({ ...x }))
      : (opts.ids || []).map((id) => ({ type: 'mistake', id }));
    if (!items.length) return null;
    const now = Date.now();
    const ids = items.filter((x) => x.type === 'mistake' && x.id).map((x) => x.id);
    const subj = opts.subject
      || (S.mistakes.find((m) => m.id === (ids[0] || items[0].fromId)) || {}).subject
      || '综合';
    const row = {
      id: uid('pp_'),
      title: (opts.title || '').trim() || ('错题练习 · ' + new Date(now).toLocaleDateString('zh-CN')),
      subject: subj,
      items,
      mistakeIds: ids,
      withAnswers: !!opts.withAnswers,
      createdAt: now,
      updatedAt: now,
      cloudId: null
    };
    await DB.putPaper(row);
    S.papers.unshift(row);
    emit();
    /* 已登录就顺手推到云端；失败不阻塞本地使用 */
    if (S.user) pushPaper(row).catch(() => {});
    return row;
  }
  async function deletePaper(id) {
    const p = S.papers.find((x) => x.id === id);
    await DB.deletePaper(id);
    S.papers = S.papers.filter((x) => x.id !== id);
    emit();
    if (p && p.cloudId) {
      try {
        const r = await C.db.deletePaper(p.cloudId);
        if (r.error) await queueDelete('papers', p.cloudId);
      } catch (e) { await queueDelete('papers', p.cloudId); }
    }
  }
  async function togglePaperAnswers(id) {
    const p = S.papers.find((x) => x.id === id);
    if (!p) return;
    p.withAnswers = !p.withAnswers;
    p.updatedAt = Date.now();
    await DB.putPaper({ ...p });
    emit();
    if (S.user) pushPaper(p).catch(() => {});
  }

  /* ---------- 筛选 / 派生 ---------- */
  function filtered() {
    const f = S.filters;
    const q = f.q.trim().toLowerCase();
    return S.mistakes.filter((m) => {
      if (f.subject !== '全部' && m.subject !== f.subject) return false;
      if (f.status !== '全部' && m.status !== f.status) return false;
      if (q) {
        const hay = (m.title + ' ' + m.content + ' ' + (m.notes || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function stats() {
    const all = S.mistakes;
    const total = all.length;
    const pending = all.filter((m) => m.status !== '已掌握').length;
    const mastered = all.filter((m) => m.status === '已掌握').length;
    const analyzed = all.filter((m) => m.analysis).length;
    const weekAgo = Date.now() - 7 * 864e5;
    const week = all.filter((m) => m.createdAt >= weekAgo).length;
    const bySubject = {};
    all.forEach((m) => { bySubject[m.subject] = (bySubject[m.subject] || 0) + 1; });
    return {
      total, pending, mastered, analyzed, week,
      rate: total ? Math.round((analyzed / total) * 100) : 0,
      bySubject
    };
  }

  /* ---------- 云端同步 ----------
     云端 mistakes 表的真实列（2026-10-23 用 describe_table 核对）：
     id / owner_id / owner_name / subject / title / content / analysis / tags /
     status / source / note / photo / created_at / updated_at
     多带一个表里没有的字段，整条写入会被服务端拒绝（此前 note 列缺失，
     导致每次上传都失败且错误被吞掉，两台设备因此永远同步不出数据）。 */
  function cloudRow(m) {
    return {
      subject: m.subject || '其他',
      title: m.title || '',
      content: m.content || '',
      status: m.status || '待复习',
      source: m.source || '网页',
      note: m.notes || '',
      owner_name: (S.user && (S.user.name || S.user.email || S.user.phone)) || null,
      analysis: m.analysis ? JSON.stringify(m.analysis) : null,
      tags: (m.analysis && m.analysis.knowledge) || [],
      photo: m._photoData || null,
      updated_at: new Date(m.updatedAt || Date.now()).toISOString()
    };
  }

  function cloudTime(row) {
    const raw = row.updated_at || row.created_at;
    const t = raw ? new Date(raw).getTime() : 0;
    return isNaN(t) ? 0 : t;
  }

  function parseAnalysis(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  async function applyCloudRow(local, row, at) {
    local.subject = row.subject || local.subject;
    local.title = row.title || local.title;
    if (row.content != null) local.content = row.content;
    local.status = row.status || local.status;
    local.source = row.source || local.source;
    if (row.note != null) local.notes = row.note;
    const a = parseAnalysis(row.analysis);
    if (a) local.analysis = a;
    if (!local.photoId && row.photo && String(row.photo).startsWith('data:')) {
      const blob = DB.dataURLtoBlob(row.photo);
      if (blob) { local.photoId = 'p_' + row.id; await DB.putPhoto(local.photoId, blob); }
    }
    local.updatedAt = at;
  }

  async function pushOne(m) {
    /* 有照片时把 Blob 转 dataURL 一并推到云端备份 */
    if (m.photoId && !m._photoData) {
      const blob = await DB.getPhoto(m.photoId);
      if (blob) m._photoData = await DB.blobToDataURL(blob);
    }
    const payload = cloudRow(m);
    const r = m.cloudId
      ? await C.db.updateMistake(m.cloudId, payload)
      : await C.db.createMistake(payload);
    if (r.error) return { ok: false, error: r.error.message || String(r.error) };
    if (!m.cloudId && r.data && r.data[0]) {
      m.cloudId = r.data[0].id;
      await DB.putMistake({ ...m, cloudId: m.cloudId });
    }
    return { ok: true };
  }

  function syncErrText(e) {
    const m = (e && e.message) || '';
    if (/401|unauthor|jwt|session|token/i.test(m)) return '登录状态已失效，请重新登录';
    if (/42501|row-level security|permission denied/i.test(m)) return '云端权限拒绝：' + m;
    return m || '网络异常';
  }

  /* ---------- 试卷同步 ----------
     papers 表列：id / owner_id / owner_name / title / mistake_ids(jsonb) /
     config(jsonb) / created_at / updated_at
     试卷里引用的是本机 id，上传前必须换成 cloudId，否则另一台设备对不上题。
     相似题是快照，不依赖题目存在，fromId 能映射就带上、映射不到留空。
     items 一起塞进 config，不用改表结构。 */
  async function pushPaper(p) {
    const items = normItems(p);
    const cloudIds = [];
    const cloudItems = [];
    for (const it of items) {
      if (it.type === 'similar') {
        const src = S.mistakes.find((x) => x.id === it.fromId);
        cloudItems.push({
          type: 'similar',
          fromId: src ? (src.cloudId || null) : null,
          question: it.question || '',
          answer: it.answer || '',
          knowledge: it.knowledge || null,
          subject: it.subject || null
        });
        continue;
      }
      const m = S.mistakes.find((x) => x.id === it.id);
      if (!m) continue;
      if (!m.cloudId) {
        const r = await pushOne(m);
        if (!r.ok) continue;   /* 题没上云，这张卷里就先不引用它 */
      }
      cloudIds.push(m.cloudId);
      cloudItems.push({ type: 'mistake', id: m.cloudId });
    }
    const payload = {
      title: p.title || '未命名试卷',
      owner_name: (S.user && (S.user.name || S.user.email || S.user.phone)) || null,
      mistake_ids: cloudIds,
      config: { subject: p.subject || '综合', withAnswers: !!p.withAnswers, items: cloudItems },
      updated_at: new Date(p.updatedAt || p.createdAt || Date.now()).toISOString()
    };
    const r = p.cloudId
      ? await C.db.updatePaper(p.cloudId, payload)
      : await C.db.savePaper(payload);
    if (r.error) return { ok: false, error: r.error.message || String(r.error) };
    if (!p.cloudId && r.data && r.data[0]) {
      p.cloudId = r.data[0].id;
      await DB.putPaper({ ...p });
    }
    return { ok: true };
  }

  /* 云端 cloudId → 本机 mistake id；映射不到的（题被删/没同步）直接丢 */
  function toLocalIds(cloudIds) {
    return (cloudIds || []).map((cid) => {
      const m = S.mistakes.find((x) => String(x.cloudId) === String(cid));
      return m ? m.id : null;
    }).filter(Boolean);
  }

  /* 云端 items → 本机 items。原题映射不到就丢；相似题是快照，永远保留。
     老试卷没有 items，退回用 mistake_ids。 */
  function toLocalItems(cloudItems, fallbackIds) {
    if (!Array.isArray(cloudItems) || !cloudItems.length) {
      return (fallbackIds || []).map((id) => ({ type: 'mistake', id }));
    }
    const out = [];
    for (const it of cloudItems) {
      if (it && it.type === 'similar') {
        out.push({
          type: 'similar',
          fromId: it.fromId ? (toLocalIds([it.fromId])[0] || null) : null,
          question: it.question || '',
          answer: it.answer || '',
          knowledge: it.knowledge || null,
          subject: it.subject || null
        });
        continue;
      }
      const lid = it && it.id ? toLocalIds([it.id])[0] : null;
      if (lid) out.push({ type: 'mistake', id: lid });
    }
    return out;
  }

  async function syncPapers(skipIds) {
    let pulled = 0, pushed = 0;
    const errs = [];
    const { data, error } = await C.db.listPapers();
    if (error) return { pulled, pushed, errs: [error.message || '试卷读取失败'] };
    const rows = data || [];
    const byCloud = new Map(rows.map((r) => [String(r.id), r]));
    const skip = new Set((skipIds || []).map(String));

    /* ① 拉 */
    for (const row of rows) {
      if (skip.has(String(row.id))) continue;
      const at = cloudTime(row);
      const cfg = row.config || {};
      const ids = toLocalIds(row.mistake_ids);
      const items = toLocalItems(cfg.items, ids);
      const local = S.papers.find((p) => String(p.cloudId) === String(row.id));
      if (local) {
        if (at > (local.updatedAt || 0)) {
          local.title = row.title || local.title;
          local.subject = cfg.subject || local.subject;
          local.withAnswers = !!cfg.withAnswers;
          local.mistakeIds = ids;
          local.items = items;
          local.updatedAt = at;
          await DB.putPaper(local);
          pulled++;
        }
        continue;
      }
      const item = {
        id: uid('pp_'),
        cloudId: row.id,
        title: row.title || '云端试卷',
        subject: cfg.subject || '综合',
        mistakeIds: ids,
        items,
        withAnswers: !!cfg.withAnswers,
        createdAt: row.created_at ? new Date(row.created_at).getTime() : (at || Date.now()),
        updatedAt: at || Date.now()
      };
      await DB.putPaper(item);
      S.papers.push(item);
      pulled++;
    }

    /* ①-b 对账：云端已不存在的试卷，本地跟着删 */
    if (rows.length < 1000) {
      const alive = new Set(rows.map((r) => String(r.id)));
      const gone = S.papers.filter((p) => p.cloudId && !alive.has(String(p.cloudId)) && !skip.has(String(p.cloudId)));
      if (gone.length) {
        for (const p of gone) await DB.deletePaper(p.id);
        S.papers = S.papers.filter((p) => gone.indexOf(p) < 0);
        pulled += gone.length;
      }
    }

    /* ② 推 */
    for (const p of S.papers.slice()) {
      const c = p.cloudId ? byCloud.get(String(p.cloudId)) : null;
      if (c && (p.updatedAt || 0) <= cloudTime(c)) continue;
      const r = await pushPaper(p);
      if (r.ok) pushed++;
      else if (errs.length < 3) errs.push(r.error);
    }
    return { pulled, pushed, errs };
  }

  /* 双向同步：先拉（云端较新的覆盖本地）→ 再推（本地较新的或云端没有的）
     顺序不能反：先推会把本机旧副本盖掉另一台设备刚写的内容。 */
  async function sync() {
    if (!S.user) { UI.toast('登录后才能同步云端', 'warn'); return; }
    if (S.syncing) return;
    S.syncing = true; emit();
    let pulled = 0, pushed = 0, pulledP = 0, pushedP = 0;
    const errs = [];
    try {
      /* ⓪ 先补做上次没删成功的云端删除，否则下面拉取会把它们复活 */
      const pending = await flushDeletes();
      const skipM = new Set(pending.mistakes.map(String));

      const { data, error } = await C.db.listMistakes();
      if (error) throw new Error(error.message || '云端读取失败');
      const rows = data || [];
      const byCloud = new Map(rows.map((r) => [String(r.id), r]));

      /* ① 拉：云端新增 / 云端更新的 */
      for (const row of rows) {
        if (skipM.has(String(row.id))) continue;
        const at = cloudTime(row);
        const local = S.mistakes.find((m) => String(m.cloudId) === String(row.id));
        if (local) {
          if (at > (local.updatedAt || 0)) {
            await applyCloudRow(local, row, at);
            await DB.putMistake(local);
            pulled++;
          }
          continue;
        }
        const item = {
          id: uid('m_'),
          cloudId: row.id,
          subject: row.subject || '其他',
          title: row.title || '云端错题',
          content: row.content || '',
          source: row.source || '云端',
          status: row.status || '待复习',
          photoId: null,
          analysis: parseAnalysis(row.analysis),
          notes: row.note || '',
          createdAt: row.created_at ? new Date(row.created_at).getTime() : (at || Date.now()),
          updatedAt: at || Date.now()
        };
        if (row.photo && String(row.photo).startsWith('data:')) {
          const blob = DB.dataURLtoBlob(row.photo);
          if (blob) { item.photoId = 'p_' + row.id; await DB.putPhoto(item.photoId, blob); }
        }
        await DB.putMistake(item);
        S.mistakes.push(item);
        pulled++;
      }

      /* ①-b 对账：本地有 cloudId、云端已经没有了 → 是在别的设备删掉的，本地跟着删。
         行数异常多时跳过，避免分页截断导致误删。 */
      if (rows.length < 1000) {
        const alive = new Set(rows.map((r) => String(r.id)));
        const gone = S.mistakes.filter((m) => m.cloudId && !alive.has(String(m.cloudId)));
        if (gone.length) {
          for (const m of gone) {
            if (m.photoId) await DB.deletePhoto(m.photoId);
            await DB.deleteMistake(m.id);
            S.selection.delete(m.id);
            if (S.currentId === m.id) S.currentId = null;
          }
          S.mistakes = S.mistakes.filter((m) => gone.indexOf(m) < 0);
          pulled += gone.length;
        }
      }

      /* ② 推：云端没有的，或本地比云端新的 */
      for (const m of S.mistakes.slice()) {
        const c = m.cloudId ? byCloud.get(String(m.cloudId)) : null;
        if (c && (m.updatedAt || 0) <= cloudTime(c)) continue;
        const r = await pushOne(m);
        if (r.ok) pushed++;
        else if (errs.length < 3) errs.push(r.error);
      }

      /* ③ 试卷：必须放在题之后，因为卷内引用要换算成 cloudId */
      const pr = await syncPapers(pending.papers);
      pulledP = pr.pulled; pushedP = pr.pushed;
      pr.errs.forEach((e) => { if (errs.length < 3) errs.push(e); });

      S.mistakes.sort((a, b) => b.updatedAt - a.updatedAt);
      S.papers = await DB.allPapers();
      S.lastSync = Date.now();
      if (errs.length) {
        UI.toast('同步未完成：' + errs[0], 'err');
      } else {
        UI.toast('同步完成 · 错题 拉取 ' + pulled + ' / 上传 ' + pushed +
          ' · 试卷 拉取 ' + pulledP + ' / 上传 ' + pushedP);
      }
    } catch (e) {
      UI.toast('同步失败：' + syncErrText(e), 'err');
    } finally {
      S.syncing = false; emit();
    }
  }

  window.Store = {
    S, init, rescan, emit, sub(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
    addMistake, updateMistake, removeMistake,
    attachPhoto, compressImage,
    toggleSelect, selectIds, clearSelection,
    createPaper, deletePaper, togglePaperAnswers, normItems,
    filtered, stats, sync, pushOne,
    setFilter(k, v) { S.filters[k] = v; emit(); },
    /* 只改当前选中，不触发全局重绘（由调用方决定手机跳页 / 宽屏局部刷新） */
    setCurrent(id) { S.currentId = id; },
    setUser(u) { S.user = u; emit(); }
  };
})();
