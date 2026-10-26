/* =====================================================================
   通用 UI：toast / 对话框 / 格式化 / 小工具
   ===================================================================== */
(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- Toast ---------- */
  function toast(msg, type) {
    const wrap = $('#toast-wrap');
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .2s, transform .2s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 220);
    }, 2400);
  }

  /* ---------- 对话框（手机从底部升起 / 桌面居中，同一元素） ---------- */
  function openDlg(opts) {
    const mask = $('#dlg-mask');
    const actions = opts.actions || [];
    mask.innerHTML =
      '<div class="dlg" role="dialog" aria-modal="true">' +
        '<div class="dlg-head">' +
          '<div style="flex:1;min-width:0">' +
            '<div class="dlg-title">' + esc(opts.title || '') + '</div>' +
            (opts.sub ? '<div class="dlg-sub">' + esc(opts.sub) + '</div>' : '') +
          '</div>' +
          '<button class="dlg-close" data-close type="button" aria-label="关闭">' + icon('close', 16) + '</button>' +
        '</div>' +
        '<div class="dlg-body">' + (opts.body || '') + '</div>' +
        (actions.length
          ? '<div class="dlg-foot">' + actions.map((a, i) =>
              '<button class="btn ' + (a.kind || 'btn-ghost') + '" data-act="' + i + '" type="button"' +
              (a.disabled ? ' disabled' : '') + '>' + esc(a.label) + '</button>').join('') + '</div>'
          : '') +
      '</div>';
    mask.hidden = false;
    document.body.style.overflow = 'hidden';
    const dlgEl = $('.dlg', mask);

    function close() {
      mask.hidden = true;
      mask.innerHTML = '';
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    mask.onclick = (e) => { if (e.target === mask) close(); };
    mask.querySelectorAll('[data-close]').forEach((b) => { b.onclick = close; });
    actions.forEach((a, i) => {
      const btn = mask.querySelector('[data-act="' + i + '"]');
      if (!btn) return;
      btn.onclick = async () => {
        if (a.onClick) {
          const keep = await a.onClick({ el: dlgEl, close });
          if (keep === false) return;
        }
        if (a.close !== false) close();
      };
    });
    if (opts.onMount) opts.onMount({ el: dlgEl, close });
    return { el: dlgEl, close };
  }

  function confirmDlg(opts) {
    return new Promise((resolve) => {
      openDlg({
        title: opts.title || '确认操作',
        sub: opts.sub,
        body: '<div class="small muted" style="padding:4px 0 12px">' + esc(opts.desc || '') + '</div>',
        actions: [
          { label: opts.cancelText || '取消', kind: 'btn-ghost', onClick: () => resolve(false) },
          { label: opts.okText || '确定', kind: opts.danger ? 'btn-danger' : 'btn-primary', onClick: () => resolve(true) }
        ],
        onClose: () => resolve(false)
      });
    });
  }

  /* ---------- 格式化 ---------- */
  const pad = (n) => (n < 10 ? '0' + n : '' + n);

  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate());
  }

  function fmtRel(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60e3) return '刚刚';
    if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
    const d = new Date(ts);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    if (sameDay) return '今天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    const yest = new Date(today.getTime() - 864e5);
    if (d.toDateString() === yest.toDateString()) return '昨天';
    if (diff < 7 * 864e5) return Math.floor(diff / 864e5) + ' 天前';
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  const SUBJ = {
    '数学': { c: 'var(--subj-math)', s: 'var(--subj-math-soft)' },
    '物理': { c: 'var(--subj-phys)', s: 'var(--subj-phys-soft)' },
    '英语': { c: 'var(--subj-en)', s: 'var(--subj-en-soft)' },
    '化学': { c: 'var(--subj-chem)', s: 'var(--subj-chem-soft)' },
    '其他': { c: 'var(--subj-other)', s: 'var(--subj-other-soft)' }
  };
  const SUBJECTS = ['数学', '物理', '英语', '化学', '其他'];
  function subjStyle(s) {
    const k = SUBJ[s] || SUBJ['其他'];
    return 'color:' + k.c + ';background:' + k.s;
  }
  function subjColor(s) {
    const k = SUBJ[s] || SUBJ['其他'];
    return k.c;
  }

  function statusTag(status) {
    if (status === '已掌握') return '<span class="tag ok">已掌握</span>';
    if (status === '未掌握') return '<span class="tag danger">未掌握</span>';
    return '<span class="tag warn">待复习</span>';
  }

  /* 题目缩略图：异步填 src，避免把 objectURL 直接写进字符串 */
  function thumbHTML(m, cls) {
    const letter = esc((m.subject || '题').slice(0, 1));
    return '<div class="' + (cls || 'm-thumb') + '" data-photo="' + esc(m.id) + '" style="' + subjStyle(m.subject) + '">' +
      (m.photoId ? '' : '<span style="font-size:13px;font-weight:700">' + letter + '</span>') + '</div>';
  }

  async function hydratePhotos(root) {
    const nodes = $$('[data-photo]', root || document);
    for (const node of nodes) {
      const id = node.getAttribute('data-photo');
      const m = Store.S.mistakes.find((x) => x.id === id);
      if (!m || !m.photoId) continue;
      if (node.querySelector('img')) continue;
      const url = await DB.photoURL(m.photoId);
      if (!url) continue;
      node.innerHTML = '<img alt="" src="' + url + '">';
    }
    const imgs = $$('[data-photo-src]', root || document);
    for (const node of imgs) {
      const pid = node.getAttribute('data-photo-src');
      if (!pid) continue;
      const url = await DB.photoURL(pid);
      if (url) node.src = url;
    }
  }

  window.UI = { $, $$, esc, toast, openDlg, confirmDlg, fmtDate, fmtRel, subjStyle, subjColor, statusTag, thumbHTML, hydratePhotos, SUBJECTS };
})();
