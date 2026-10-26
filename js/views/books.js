/* ========== 错题本：宽屏列表 + 详情并排 / 手机整页切换 ========== */
(function () {
  const V = window.Views = window.Views || {};
  let rootEl = null;
  let lastSig = '';

  const VAR_LABEL = ['变式①', '变式②', '变式③'];

  /* 组卷取题记录：{ 错题id: Set<'o' | 变式序号> }，'o' = 原题。
     勾上题后卡片下方直接展开「原题 / 变式① / 变式②」，和组卷弹窗共用这一份状态，
     所以两边改哪边都算数。 */
  let picks = {};

  function simsOf(m) {
    return (m.analysis && Array.isArray(m.analysis.similar)) ? m.analysis.similar.slice(0, 3) : [];
  }
  function readPick(m) { return picks[m.id] || new Set(['o']); }
  function getPick(m) {
    if (!picks[m.id]) picks[m.id] = new Set(['o']);
    return picks[m.id];
  }
  function keyOf(v) { return v === 'o' ? 'o' : +v; }
  function prunePicks() {
    Object.keys(picks).forEach((id) => {
      if (!Store.S.selection.has(id)) delete picks[id];
    });
  }
  /* 已选里一共选了多少道变式 */
  function totalVars() {
    let n = 0;
    Store.S.selection.forEach((id) => {
      const keys = picks[id];
      if (!keys) return;
      keys.forEach((k) => { if (k !== 'o') n++; });
    });
    return n;
  }
  /* 这份卷最终会有几道题（原题 + 变式，跳过的不算） */
  function totalQuestions() {
    let n = 0;
    Store.S.selection.forEach((id) => {
      const keys = picks[id];
      n += keys ? keys.size : 1;
    });
    return n;
  }

  function sigOf() {
    const S = Store.S;
    return S.currentId + '|' + S.mistakes.map((m) => m.id + ':' + m.updatedAt).join(',') + '|' + S.papers.length;
  }

  /* 只改勾选状态，不重绘（保住搜索框焦点和滚动位置） */
  function paintSel() {
    if (!rootEl) return;
    rootEl.querySelectorAll('.m-card').forEach((card) => {
      const id = card.dataset.id;
      const sel = Store.S.selection.has(id);
      card.classList.toggle('sel', sel);
      const chk = card.querySelector('.m-check');
      if (chk) {
        chk.classList.toggle('on', sel);
        chk.setAttribute('aria-checked', String(sel));
        chk.innerHTML = sel ? icon('check', 12) : '';
      }
      /* 勾上才展开「进卷：原题 / 变式①②」那一行 */
      const pick = rootEl.querySelector('[data-pick-row="' + id + '"]');
      if (pick) pick.hidden = !sel;
    });
    const n = Store.S.selection.size;
    const bar = rootEl.querySelector('.action-bar');
    if (!n && bar) bar.remove();
    else if (n && bar) {
      const c = bar.querySelector('.sel-count');
      const q = totalQuestions();
      if (c) c.innerHTML = q !== n
        ? '已选 <b>' + n + '</b> 道 · 共 <b>' + q + '</b> 题'
        : '已选 <b>' + n + '</b> 道';
    }
    else if (n && !bar) { lastSig = ''; window.App.refreshCurrent(); }
  }

  /* 把弹窗里改过的选择同步回列表卡片（不重绘，保住滚动位置） */
  function syncPickChips() {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-pick-row]').forEach((row) => {
      const m = Store.S.mistakes.find((x) => x.id === row.dataset.pickRow);
      const keys = m ? readPick(m) : new Set(['o']);
      row.querySelectorAll('[data-pick-k]').forEach((b) => {
        b.classList.toggle('on', keys.has(keyOf(b.dataset.pickK)));
      });
    });
    paintSel();
  }

  /* ---- 列表卡片 ---- */
  /* 勾上之后在卡片下方展开的选择行：这道题进卷用原题，还是换成变式 */
  function pickRowHTML(m, selected) {
    const sims = simsOf(m);
    if (!sims.length) return '';
    const keys = readPick(m);
    const chips = ['o'].concat(sims.map((_, k) => k)).map((k) => {
      const lab = k === 'o' ? '原题' : (VAR_LABEL[k] || ('变式' + (k + 1)));
      return '<button class="pick-chip' + (keys.has(k) ? ' on' : '') + '" type="button"' +
        ' data-pick-id="' + m.id + '" data-pick-k="' + k + '">' + lab + '</button>';
    }).join('');
    return '<div class="m-pick" data-pick-row="' + m.id + '"' + (selected ? '' : ' hidden') + '>' +
      '<span class="m-pick-label">进卷</span>' + chips + '</div>';
  }

  function cardHTML(m, opts) {
    const selected = Store.S.selection.has(m.id);
    const active = m.id === Store.S.currentId;
    const kn = m.analysis && m.analysis.knowledge && m.analysis.knowledge.length
      ? m.analysis.knowledge.slice(0, 2).join(' · ') : '';
    const simN = simsOf(m).length;
    return '<div class="m-item" data-item="' + m.id + '">' +
      '<div class="m-card' + (active ? ' on' : '') + (selected ? ' sel' : '') + '" data-id="' + m.id + '" role="button" tabindex="0">' +
      '<span class="m-check' + (selected ? ' on' : '') + '" data-check="' + m.id + '" role="checkbox" aria-checked="' + selected + '" tabindex="-1">' +
        (selected ? icon('check', 12) : '') + '</span>' +
      '<span class="m-body">' +
        '<span class="m-top">' +
          '<span class="m-subject" style="' + UI.subjStyle(m.subject) + '">' + UI.esc(m.subject) + '</span>' +
          (m.analysis ? '<span class="tag primary">已解析</span>' : '') +
          '<span class="m-time">' + UI.fmtRel(m.createdAt) + '</span>' +
        '</span>' +
        '<span class="m-title">' + UI.esc(m.title) + '</span>' +
        (kn ? '<span class="m-excerpt">' + UI.esc(kn) + '</span>'
            : (m.content ? '<span class="m-excerpt">' + UI.esc(m.content.slice(0, 80)) + '</span>' : '')) +
        '<span class="m-foot">' + UI.statusTag(m.status) +
          (simN ? '<span class="m-var-tag">' + simN + ' 道变式</span>' : '') + '</span>' +
      '</span>' +
      UI.thumbHTML(m, 'm-thumb') +
      '</div>' +
      pickRowHTML(m, selected) +
    '</div>';
  }

  /* ---- 详情 ---- */
  function detailHTML(m) {
    if (!m) {
      return '<div class="detail-empty">' +
        '<div class="empty-ico">' + icon('book', 26) + '</div>' +
        '<div class="empty-title">选一道题看解析</div>' +
        '<div class="empty-desc">左侧（手机上是列表）点任意一道题，题干、解析、答案和批注都会显示在这里。</div>' +
      '</div>';
    }
    const a = m.analysis;
    const steps = a && a.analysis
      ? String(a.analysis).split(/\n+/).filter(Boolean)
      : [];

    return '<div class="page">' +
      '<div class="dt-head">' +
        '<button class="dt-back" id="dt-back" type="button" aria-label="返回列表">' + icon('left', 17) + '</button>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="dt-title">' + UI.esc(m.title) + '</div>' +
          '<div class="dt-meta">' +
            '<span class="tag primary" style="' + UI.subjStyle(m.subject) + '">' + UI.esc(m.subject) + '</span>' +
            UI.statusTag(m.status) +
            '<span class="tiny muted">' + UI.esc(m.source) + ' · ' + UI.fmtDate(m.createdAt) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="dt-actions">' +
          '<button class="btn btn-ghost btn-sm btn-icon" id="dt-edit" title="编辑" type="button">' + icon('edit', 15) + '</button>' +
          '<button class="btn btn-ghost btn-sm btn-icon" id="dt-del" title="删除" type="button">' + icon('trash', 15) + '</button>' +
        '</div>' +
      '</div>' +

      (m.photoId ? '<div class="dt-photo"><img data-photo-src="' + m.photoId + '" alt="题目原图"></div>' : '') +

      '<section class="block">' +
        '<div class="block-head">' + icon('book', 16) + ' 题目</div>' +
        '<div class="block-body">' + (m.content ? UI.esc(m.content) : '<span class="muted">没有录入题干文字。</span>') + '</div>' +
      '</section>' +

      (a
        ? '<section class="block">' +
            '<div class="block-head">' + icon('sparkles', 16) + ' AI 解析' +
              '<span class="tag primary" style="margin-left:auto">分步</span></div>' +
            '<div class="block-body">' + (steps.length
              ? '<div class="steps">' + steps.map((s, i) =>
                  '<div class="step"><span class="step-no">' + (i + 1) + '</span><span>' + UI.esc(s.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')) + '</span></div>').join('') + '</div>'
              : UI.esc(String(a.analysis || ''))) + '</div>' +
          '</section>' +
          '<section class="block">' +
            '<div class="block-head">' + icon('target', 16) + ' 答案</div>' +
            '<div class="block-body plain"><div class="answer-box">' + UI.esc(a.answer || '（未给出）') + '</div></div>' +
          '</section>' +
          (a.knowledge && a.knowledge.length
            ? '<section class="block"><div class="block-head">' + icon('grade', 16) + ' 知识点</div>' +
              '<div class="block-body plain"><div style="display:flex;gap:6px;flex-wrap:wrap">' +
                a.knowledge.map((k) => '<span class="chip on">' + UI.esc(k) + '</span>').join('') + '</div></div></section>'
            : '') +
          (a.similar && a.similar.length
            ? '<section class="block"><div class="block-head">' + icon('copy', 16) + ' 相似练习' +
                '<span class="tag" style="margin-left:auto">' + a.similar.length + ' 道</span></div>' +
              '<div class="block-body plain">' + a.similar.map((sq, i) =>
                '<div class="similar-item"><div class="similar-q">' + (i + 1) + '. ' + UI.esc(sq.question) + '</div>' +
                '<div class="similar-a">答案：<b>' + UI.esc(sq.answer) + '</b></div></div>').join('') + '</div></section>'
            : '')
        : '<section class="block">' +
            '<div class="block-head">' + icon('sparkles', 16) + ' AI 解析</div>' +
            '<div class="block-body" style="text-align:center;padding:26px 16px">' +
              '<div class="small muted" style="margin-bottom:12px">这道题还没解析过。发给 AI 会得到分步解析、答案、知识点和 2 道相似题。</div>' +
              '<button class="btn btn-primary" data-analyze="' + m.id + '" type="button">' + icon('sparkles', 15) + ' 解析这道题</button>' +
            '</div>' +
          '</section>') +

      '<section class="block">' +
        '<div class="block-head">' + icon('pen', 16) + ' 我的批注</div>' +
        '<div class="block-body plain">' +
          '<textarea class="input" id="dt-note" rows="3" maxlength="1000" placeholder="错在哪、下次注意什么……">' + UI.esc(m.notes || '') + '</textarea>' +
          '<div style="display:flex;justify-content:flex-end;margin-top:8px">' +
            '<button class="btn btn-soft btn-sm" id="dt-note-save" type="button">保存批注</button>' +
          '</div>' +
        '</div>' +
      '</section>' +
    '</div>';
  }

  V.books = {
    title: '错题本',
    render() {
      const S = Store.S;
      const list = Store.filtered();
      const m = S.currentId ? S.mistakes.find((x) => x.id === S.currentId) : null;
      const isNarrow = Router.isNarrow();
      const mdetail = isNarrow && !!m;
      const subjects = ['全部'].concat(UI.SUBJECTS.filter((s) => S.mistakes.some((x) => x.subject === s)));
      const statuses = ['全部', '待复习', '未掌握', '已掌握'];
      const selCount = S.selection.size;

      return '<div class="split" id="split" data-mdetail="' + mdetail + '">' +

        /* ---------- 列表 ---------- */
        '<section class="list-pane' + (mdetail ? ' mdetail-hidden' : '') + '">' +
          '<div class="list-tools">' +
            '<div class="search-box">' +
              '<span class="s-ico">' + icon('search', 15) + '</span>' +
              '<input class="input" id="q-input" type="search" placeholder="搜标题、题干、批注" autocomplete="off">' +
            '</div>' +
          '</div>' +
          '<div class="chip-row" id="subj-row" style="margin-bottom:8px">' +
            subjects.map((s) => '<button class="chip' + (s === '全部' ? ' on' : '') + '" data-subj="' + s + '" type="button">' + s + '</button>').join('') +
          '</div>' +
          '<div class="chip-row" id="status-row" style="margin-bottom:13px">' +
            statuses.map((s) => '<button class="chip' + (s === '全部' ? ' on' : '') + '" data-status="' + s + '" type="button">' + s + '</button>').join('') +
          '</div>' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
            '<span class="tiny muted" id="list-count">共 ' + list.length + ' 道</span>' +
            '<button class="tiny" id="sel-all" style="color:var(--primary);font-weight:600" type="button">全选</button>' +
          '</div>' +
          '<div class="m-list" id="m-list">' +
            (list.length ? list.map((x) => cardHTML(x)).join('')
              : '<div class="empty">' +
                  '<div class="empty-ico">' + icon('book', 22) + '</div>' +
                  '<div class="empty-title">' + (S.mistakes.length ? '没有匹配的题' : '错题本还是空的') + '</div>' +
                  '<div class="empty-desc">' + (S.mistakes.length ? '换个关键词或筛选条件试试。' : '拍一道，或者手动录一道，马上开始。') + '</div>' +
                  (S.mistakes.length ? '' : '<button class="btn btn-soft btn-sm" data-go="/capture" type="button">去拍题</button>') +
                '</div>') +
          '</div>' +
          (selCount ? '<div class="action-bar no-print">' +
            '<span class="sel-count">已选 <b>' + selCount + '</b> 道</span>' +
            '<span style="flex:1"></span>' +
            '<button class="btn btn-ghost btn-sm" id="sel-clear" type="button">取消</button>' +
            '<button class="btn btn-soft btn-sm" id="sel-ai" type="button">' + icon('sparkles', 14) + ' AI 解析</button>' +
            '<button class="btn btn-primary btn-sm" id="sel-paper" type="button">' + icon('papers', 14) + ' 生成试卷</button>' +
          '</div>' : '') +
        '</section>' +

        /* ---------- 详情 ---------- */
        '<section class="detail-pane">' + detailHTML(m) + '</section>' +
      '</div>';
    },

    mount(root) {
      const S = Store.S;
      rootEl = root;
      lastSig = sigOf();
      let q = '';
      let subj = '全部';
      let status = '全部';

      function applyFilter() {
        const list = S.mistakes.filter((m) => {
          if (subj !== '全部' && m.subject !== subj) return false;
          if (status !== '全部' && m.status !== status) return false;
          if (q) {
            const hay = (m.title + ' ' + m.content + ' ' + (m.notes || '')).toLowerCase();
            if (hay.indexOf(q.toLowerCase()) < 0) return false;
          }
          return true;
        });
        const box = root.querySelector('#m-list');
        if (box) {
          box.innerHTML = list.length ? list.map((x) => cardHTML(x)).join('')
            : '<div class="empty"><div class="empty-ico">' + icon('book', 22) + '</div>' +
              '<div class="empty-title">没有匹配的题</div><div class="empty-desc">换个关键词或筛选条件试试。</div></div>';
          UI.hydratePhotos(box);
        }
        const cnt = root.querySelector('#list-count');
        if (cnt) cnt.textContent = '共 ' + list.length + ' 道';
      }

      const qi = root.querySelector('#q-input');
      if (qi) {
        qi.oninput = () => { q = qi.value.trim(); applyFilter(); };
      }

      root.querySelectorAll('[data-subj]').forEach((b) => {
        b.onclick = () => {
          subj = b.dataset.subj;
          root.querySelectorAll('[data-subj]').forEach((x) => x.classList.toggle('on', x === b));
          applyFilter();
        };
      });
      root.querySelectorAll('[data-status]').forEach((b) => {
        b.onclick = () => {
          status = b.dataset.status;
          root.querySelectorAll('[data-status]').forEach((x) => x.classList.toggle('on', x === b));
          applyFilter();
        };
      });

      /* 列表点击：选中详情 / 勾选
         注意：root 是持久容器（#view-inner），必须用赋值而非 addEventListener，
         否则每次重绘都会累积监听器，一次点击被执行多次。 */
      root.onclick = (e) => {
        /* 卡片下方「原题 / 变式」选择行：只改选择，不重绘整页 */
        const chip = e.target.closest('[data-pick-k]');
        if (chip) {
          e.stopPropagation();
          const m = S.mistakes.find((x) => x.id === chip.dataset.pickId);
          if (m) {
            const k = keyOf(chip.dataset.pickK);
            const keys = getPick(m);
            if (keys.has(k)) keys.delete(k);
            else keys.add(k);
            chip.closest('.m-pick').querySelectorAll('[data-pick-k]').forEach((b) => {
              b.classList.toggle('on', keys.has(keyOf(b.dataset.pickK)));
            });
            paintSel();
          }
          return;
        }
        const check = e.target.closest('[data-check]');
        if (check) {
          e.stopPropagation();
          Store.toggleSelect(check.dataset.check);
          return;
        }
        const card = e.target.closest('.m-card');
        if (card) {
          const id = card.dataset.id;
          Store.setCurrent(id);
          if (Router.isNarrow()) Router.go('/books/' + id);
          else window.App.refreshCurrent();
          return;
        }
      };

      root.onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        const card = e.target.closest('.m-card');
        if (!card) return;
        Store.setCurrent(card.dataset.id);
        if (Router.isNarrow()) Router.go('/books/' + card.dataset.id);
        else window.App.refreshCurrent();
      };

      const selAll = root.querySelector('#sel-all');
      if (selAll) selAll.onclick = () => {
        const ids = Array.from(root.querySelectorAll('.m-card')).map((c) => c.dataset.id);
        Store.selectIds(ids);
      };

      const selClear = root.querySelector('#sel-clear');
      if (selClear) selClear.onclick = () => Store.clearSelection();

      const selAi = root.querySelector('#sel-ai');
      if (selAi) selAi.onclick = () => Router.go('/review');

      const selPaper = root.querySelector('#sel-paper');
      if (selPaper) selPaper.onclick = () => openPaperDlg(Array.from(Store.S.selection));

      /* 详情交互 */
      const back = root.querySelector('#dt-back');
      if (back) back.onclick = () => { Store.setCurrent(null); Router.go('/books'); };

      const cur = Store.S.currentId ? Store.S.mistakes.find((x) => x.id === Store.S.currentId) : null;

      const edit = root.querySelector('#dt-edit');
      if (edit && cur) edit.onclick = () => openEditDlg(cur);

      const del = root.querySelector('#dt-del');
      if (del && cur) del.onclick = async () => {
        const ok = await UI.confirmDlg({
          title: '删除这道错题？',
          desc: '题目、解析和批注都会一起删除，无法恢复。',
          okText: '删除', danger: true
        });
        if (ok) { await Store.removeMistake(cur.id); Router.go('/books'); UI.toast('已删除'); }
      };

      const noteSave = root.querySelector('#dt-note-save');
      if (noteSave && cur) noteSave.onclick = async () => {
        const ta = root.querySelector('#dt-note');
        await Store.updateMistake(cur.id, { notes: ta.value.trim() });
        UI.toast('批注已保存');
      };

      root.querySelectorAll('[data-analyze]').forEach((b) => {
        b.onclick = () => {
          Store.selectIds([b.dataset.analyze]);
          Router.go('/review');
        };
      });

      UI.hydratePhotos(root);
      prunePicks();
      paintSel();   /* 把「勾上才展开的选择行」和已选题数刷成当前状态 */
    },

    onData() {
      /* 勾选只做局部刷新；题目/选中项变了才整页重绘 */
      const sig = sigOf();
      if (sig !== lastSig) { lastSig = sig; window.App.refreshCurrent(); return; }
      paintSel();
    }
  };

  /* ---------- 生成试卷对话框 ----------
     原题和相似题都能进卷。相似题来自 AI 解析出的 similar（每题最多 2 道），
     组卷时按题逐条勾选，也可以一键全部换成变式——原题已经做过，想直接练同型题。 */
  function openPaperDlg(ids) {
    if (!ids.length) { UI.toast('先勾选至少一道题', 'warn'); return; }
    const rows = ids.map((id) => {
      const m = Store.S.mistakes.find((x) => x.id === id);
      if (!m) return null;
      return { m, sims: simsOf(m), keys: getPick(m) };
    }).filter(Boolean);
    if (!rows.length) { UI.toast('选中的题已经不在错题本里了', 'warn'); return; }

    const varCount = rows.reduce((n, r) => n + r.sims.length, 0);
    const title = '错题练习 · ' + new Date().toLocaleDateString('zh-CN');
    let bodyEl = null;
    let dlgEl = null;

    const total = () => rows.reduce((n, r) => n + r.keys.size, 0);

    function pickedPreview(r) {
      const ks = Array.from(r.keys).filter((k) => k !== 'o');
      if (!ks.length) return '';
      return ks.map((k) => {
        const s = r.sims[k];
        return s ? '<div class="pick-prev">' + UI.esc(s.question || '') + '</div>' : '';
      }).join('');
    }

    function rowsHTML() {
      return rows.map((r, i) => {
        const skipped = r.keys.size === 0;
        const chips = ['o'].concat(r.sims.map((_, k) => k)).map((k) => {
          const on = r.keys.has(k);
          const lab = k === 'o' ? '原题' : (VAR_LABEL[k] || ('变式' + (k + 1)));
          return '<button class="pick-chip' + (on ? ' on' : '') + '" type="button" data-row="' + i + '" data-k="' + k + '">' + lab + '</button>';
        }).join('');
        return '<div class="pick-row' + (skipped ? ' skipped' : '') + '">' +
          '<div class="pick-head">' +
            '<span class="pick-no">' + (i + 1) + '</span>' +
            '<span class="pick-title">' + UI.esc(r.m.title || '未命名') + '</span>' +
            '<span class="pick-subj">' + UI.esc(r.m.subject) + '</span>' +
          '</div>' +
          '<div class="pick-opts">' + chips +
            (r.sims.length ? '' : '<span class="pick-none">无变式</span>') +
            (skipped ? '<span class="pick-none" style="color:var(--danger)">已跳过</span>' : '') +
          '</div>' +
          pickedPreview(r) +
        '</div>';
      }).join('');
    }

    function repaint() {
      if (!bodyEl) return;
      const box = bodyEl.querySelector('#pp-rows');
      if (box) box.innerHTML = rowsHTML();
      const hint = bodyEl.querySelector('#pp-count');
      if (hint) hint.textContent = '将生成 ' + total() + ' 道题';
      if (dlgEl) {
        const btn = dlgEl.querySelector('[data-act="1"]');
        if (btn) {
          btn.textContent = total() ? ('生成 ' + total() + ' 道') : '生成';
          btn.disabled = total() === 0;
        }
      }
    }

    UI.openDlg({
      title: '生成练习试卷',
      sub: rows.length + ' 道题，其中可用变式 ' + varCount + ' 道。这里的勾选和列表里那张卡片是同一份，改哪边都算数。',
      body: '<div class="field"><label class="field-label">试卷标题</label>' +
            '<input class="input" id="pp-title" value="' + UI.esc(title) + '" maxlength="40"></div>' +
            '<div class="pick-toolbar">' +
              '<span class="tiny muted" id="pp-count">将生成 ' + total() + ' 道题</span>' +
              '<span style="flex:1"></span>' +
              (varCount ? '<button class="tiny" id="pp-all-var" type="button" style="color:var(--primary);font-weight:600">全部换变式</button>' : '') +
              '<button class="tiny" id="pp-all-orig" type="button" style="color:var(--text-3);font-weight:600">恢复原题</button>' +
            '</div>' +
            '<div id="pp-rows">' + rowsHTML() + '</div>' +
            '<label style="display:flex;align-items:center;gap:9px;font-size:13.5px;padding:12px 0 8px">' +
            '<input type="checkbox" id="pp-ans" style="width:17px;height:17px;accent-color:var(--primary)">' +
            '同时生成答案页</label>' +
            '<div class="form-note">' + icon('print', 15) + '<span>变式题会连同答案一起存进试卷，之后原题改了也不影响这份卷。</span></div>',
      actions: [
        { label: '取消', kind: 'btn-ghost' },
        {
          label: '生成',
          kind: 'btn-primary',
          onClick: async ({ el }) => {
            const items = [];
            rows.forEach((r) => {
              ['o'].concat(r.sims.map((_, k) => k)).forEach((k) => {
                if (!r.keys.has(k)) return;
                if (k === 'o') { items.push({ type: 'mistake', id: r.m.id }); return; }
                const s = r.sims[k] || {};
                items.push({
                  type: 'similar',
                  fromId: r.m.id,
                  question: s.question || '',
                  answer: s.answer || '',
                  knowledge: (r.m.analysis && r.m.analysis.knowledge && r.m.analysis.knowledge[0]) || null,
                  subject: r.m.subject
                });
              });
            });
            if (!items.length) { UI.toast('至少留一道题', 'warn'); return false; }
            /* 旧版 store.js 只认 opts.ids，传 items 会直接 return null，弹窗静默关掉、
               什么也不生成。这类"看着成功其实没存"的失败必须喊出来。 */
            if (typeof Store.normItems !== 'function') {
              UI.toast('前端文件版本不一致：store.js 还是旧版，存不下跌式。请刷新页面（电脑 Ctrl+F5 / 手机下拉刷新）后重试。', 'err');
              return false;
            }
            const t = el.querySelector('#pp-title').value.trim();
            const ans = el.querySelector('#pp-ans').checked;
            let paper = null;
            try {
              paper = await Store.createPaper({ title: t, items, withAnswers: ans });
            } catch (e) {
              UI.toast('生成失败：' + ((e && e.message) || e), 'err');
              return false;   /* 留在弹窗里，勾选不丢 */
            }
            if (!paper) {
              UI.toast('生成失败：试卷没存进库里（多半是 store.js 还是旧版），这次真的没生成。', 'err');
              return false;
            }
            picks = {};
            Store.clearSelection();
            Router.go('/papers/' + paper.id);
            UI.toast('试卷已生成 · ' + items.length + ' 道');
          }
        }
      ],
      onMount: ({ el }) => {
        dlgEl = el;
        bodyEl = el.querySelector('.dlg-body');
        const box = el.querySelector('#pp-rows');
        box.onclick = (e) => {
          const chip = e.target.closest('[data-k]');
          if (!chip) return;
          const r = rows[+chip.dataset.row];
          const k = chip.dataset.k === 'o' ? 'o' : +chip.dataset.k;
          if (r.keys.has(k)) r.keys.delete(k);
          else r.keys.add(k);
          repaint();
        };
        const allVar = el.querySelector('#pp-all-var');
        if (allVar) allVar.onclick = () => {
          rows.forEach((r) => {
            r.keys.clear();
            if (r.sims.length) r.keys.add(0);
            else r.keys.add('o');
          });
          repaint();
        };
        el.querySelector('#pp-all-orig').onclick = () => {
          rows.forEach((r) => { r.keys.clear(); r.keys.add('o'); });
          repaint();
        };
        repaint();   /* 初始把「生成 N 道」按默认选择刷出来 */
      },
      /* 弹窗里改过的选择，关掉后要回到列表卡片上 */
      onClose: () => syncPickChips()
    });
  }

  /* ---------- 编辑错题对话框 ---------- */
  function openEditDlg(m) {
    const segs = UI.SUBJECTS.map((s) =>
      '<button type="button" class="seg-item' + (s === m.subject ? ' on' : '') + '" data-v="' + s + '">' + s + '</button>').join('');
    const stOpts = ['待复习', '未掌握', '已掌握'].map((s) =>
      '<option' + (s === m.status ? ' selected' : '') + '>' + s + '</option>').join('');
    const srcOpts = ['拍摄', '作业', '考试', '手录'].map((s) =>
      '<option' + (s === m.source ? ' selected' : '') + '>' + s + '</option>').join('');

    UI.openDlg({
      title: '编辑错题',
      sub: '改完保存，已解析的内容不受影响',
      body:
        '<div class="field"><span class="field-label">科目</span><div class="seg" id="ed-subj">' + segs + '</div></div>' +
        '<div class="field"><label class="field-label">标题</label><input class="input" id="ed-title" maxlength="40" value="' + UI.esc(m.title) + '"></div>' +
        '<div class="field"><label class="field-label">题干</label><textarea class="input" id="ed-content" rows="6">' + UI.esc(m.content) + '</textarea></div>' +
        '<div class="form-row">' +
          '<div class="field"><label class="field-label">来源</label><select class="input" id="ed-source">' + srcOpts + '</select></div>' +
          '<div class="field"><label class="field-label">状态</label><select class="input" id="ed-status">' + stOpts + '</select></div>' +
        '</div>',
      actions: [
        { label: '取消', kind: 'btn-ghost' },
        {
          label: '保存', kind: 'btn-primary',
          onClick: async ({ el }) => {
            const on = el.querySelector('#ed-subj .seg-item.on');
            await Store.updateMistake(m.id, {
              subject: on ? on.dataset.v : m.subject,
              title: el.querySelector('#ed-title').value.trim() || m.title,
              content: el.querySelector('#ed-content').value.trim(),
              source: el.querySelector('#ed-source').value,
              status: el.querySelector('#ed-status').value
            });
            UI.toast('已保存');
          }
        }
      ],
      onMount: ({ el }) => {
        el.querySelectorAll('#ed-subj .seg-item').forEach((b) => {
          b.onclick = () => {
            el.querySelectorAll('#ed-subj .seg-item').forEach((x) => x.classList.remove('on'));
            b.classList.add('on');
          };
        });
      }
    });
  }

  V.books.openPaperDlg = openPaperDlg;
})();
