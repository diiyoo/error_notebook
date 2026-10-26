/* ========== AI 解析台 ========== */
(function () {
  const V = window.Views = window.Views || {};
  const C = window.Cuoti;

  let running = false;
  let streamText = '';
  let lastError = '';
  let lastBatch = [];

  function queue() {
    const S = Store.S;
    return Array.from(S.selection)
      .map((id) => S.mistakes.find((m) => m.id === id))
      .filter(Boolean);
  }

  function itemHTML(m) {
    return '<div class="sel-item">' +
      '<span style="width:7px;height:7px;border-radius:50%;background:' + UI.subjColor(m.subject) + ';flex:none"></span>' +
      '<span class="si-main"><span class="si-t">' + UI.esc(m.title) + '</span>' +
      '<span class="si-s">' + UI.esc(m.subject) + (m.analysis ? ' · 已解析过' : ' · 待解析') + '</span></span>' +
      '<button class="btn btn-ghost btn-sm" data-rm="' + m.id + '" type="button" style="height:26px;padding:0 8px">移除</button>' +
    '</div>';
  }

  function resultsHTML(list) {
    if (!list.length) return '';
    return '<div style="display:flex;flex-direction:column;gap:10px">' + list.map((r, i) => {
      const m = r.mistake;
      return '<div class="res-card">' +
        '<div class="res-head">' +
          '<span class="tag primary" style="' + UI.subjStyle(m.subject) + '">' + UI.esc(m.subject) + '</span>' +
          '<span style="font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + UI.esc(m.title) + '</span>' +
          '<button class="btn btn-ghost btn-sm" data-open="' + m.id + '" type="button" style="height:26px;padding:0 9px">查看</button>' +
        '</div>' +
        '<div class="res-body">' +
          '<div class="res-row"><div class="res-lab">答案</div><div style="font-weight:650;color:var(--primary-deep)">' + UI.esc(r.answer || '—') + '</div></div>' +
          '<div class="res-row"><div class="res-lab">知识点</div><div style="display:flex;gap:5px;flex-wrap:wrap">' +
            (r.knowledge || []).map((k) => '<span class="chip on" style="height:24px;font-size:11.5px">' + UI.esc(k) + '</span>').join('') +
          '</div></div>' +
          '<div class="res-row"><div class="res-lab">相似题</div>' +
            ((r.similar || []).length
              ? r.similar.map((s) => '<div style="font-size:12.5px;color:var(--text-2);padding:3px 0">· ' + UI.esc(s.question) + '</div>').join('')
              : '<span class="small muted">—</span>') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function runBoxHTML() {
    const list = queue();
    if (running) {
      return '<div class="run-state"><div class="spinner"></div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:650">AI 正在解析 ' + lastBatch.length + ' 道题…</div>' +
        '<div class="tiny muted" style="margin-top:3px">通常 4–20 秒。解析完会自动写回每道题。</div></div></div>' +
        (streamText ? '<pre style="margin-top:12px;font-size:11px;line-height:1.6;color:var(--text-3);max-height:180px;overflow:auto;white-space:pre-wrap;background:var(--card-sub);padding:10px;border-radius:10px">' + UI.esc(streamText.slice(-700)) + '</pre>' : '');
    }
    if (lastError) {
      return '<div class="run-state" style="background:var(--danger-soft);border-color:#FECACA">' +
        '<div style="color:var(--danger)">' + icon('close', 18) + '</div>' +
        '<div style="flex:1"><div style="font-size:13.5px;font-weight:650;color:#991B1B">解析失败</div>' +
        '<div class="tiny" style="color:#B91C1C;margin-top:2px">' + UI.esc(lastError) + '</div></div></div>';
    }
    return '';
  }

  V.review = {
    title: 'AI 解析',
    render() {
      const S = Store.S;
      const q = queue();
      const unanalyzed = S.mistakes.filter((m) => !m.analysis).slice(0, 8);

      return '<div class="page">' +
        '<div class="review-grid">' +

          '<div class="home-col">' +
            '<section class="card card-pad">' +
              '<div class="sec-head"><div class="sec-title">待解析</div>' +
                '<span class="tag' + (q.length ? ' primary' : '') + '">' + q.length + ' 道</span></div>' +
              (q.length
                ? '<div class="sel-list">' + q.map(itemHTML).join('') + '</div>' +
                  '<button class="btn btn-primary btn-lg btn-block" id="run-btn" type="button" style="margin-top:14px"' +
                  (running ? ' disabled' : '') + '>' + icon('sparkles', 16) + ' 开始解析</button>' +
                  '<div class="tiny muted" style="text-align:center;margin-top:8px">解析结果会自动写回题目，刷新不丢</div>'
                : '<div class="empty" style="padding:22px 8px">' +
                    '<div class="empty-ico">' + icon('sparkles', 22) + '</div>' +
                    '<div class="empty-title">还没选要解析的题</div>' +
                    '<div class="empty-desc">从错题本勾选，或在下面直接点一道。</div>' +
                    '<button class="btn btn-soft btn-sm" data-go="/books" type="button">去错题本勾选</button>' +
                  '</div>') +
            '</section>' +

            (unanalyzed.length
              ? '<section class="card card-pad">' +
                  '<div class="sec-head"><div class="sec-title">还没解析过</div><span class="tiny muted">点即加入</span></div>' +
                  '<div class="sel-list">' + unanalyzed.map((m) =>
                    '<button class="sel-item" data-add="' + m.id + '" type="button" style="width:100%;text-align:left">' +
                      '<span style="width:7px;height:7px;border-radius:50%;background:' + UI.subjColor(m.subject) + ';flex:none"></span>' +
                      '<span class="si-main"><span class="si-t">' + UI.esc(m.title) + '</span>' +
                      '<span class="si-s">' + UI.esc(m.subject) + ' · ' + UI.fmtRel(m.createdAt) + '</span></span>' +
                      '<span style="color:var(--primary);flex:none">' + icon('plus', 15) + '</span>' +
                    '</button>').join('') + '</div>' +
                '</section>'
              : '') +
          '</div>' +

          '<div class="home-col">' +
            '<section class="card card-pad">' +
              '<div class="sec-head"><div class="sec-title">解析结果</div>' +
                (lastBatch.length ? '<span class="tag ok">刚完成 ' + lastBatch.length + ' 道</span>' : '') + '</div>' +
              '<div id="run-box">' + runBoxHTML() + '</div>' +
              (lastBatch.length
                ? '<div id="res-box" style="margin-top:' + (running ? '12' : '0') + 'px">' + resultsHTML(lastBatch) + '</div>'
                : (running ? '' : '<div class="empty" style="padding:34px 12px">' +
                    '<div class="empty-ico">' + icon('sparkles', 24) + '</div>' +
                    '<div class="empty-title">解析结果会显示在这里</div>' +
                    '<div class="empty-desc">分步解析、最终答案、知识点标签、2 道相似练习，一次全给你。</div>' +
                  '</div>')) +
            '</section>' +

            '<section class="card card-pad">' +
              '<div class="sec-head"><div class="sec-title">解析包含什么</div></div>' +
              '<div style="display:flex;flex-direction:column;gap:10px">' +
                feature('chart', '分步解析', '按 ①②③ 拆开每一步，标出易错点') +
                feature('target', '最终答案', '独立成块，方便对照') +
                feature('grade', '知识点', '自动打标签，用于薄弱点统计') +
                feature('copy', '相似练习', '换数字、换情境，同难度再练两道') +
              '</div>' +
            '</section>' +
          '</div>' +

        '</div>' +
      '</div>';
    },

    mount(root) {
      const rerender = () => window.App.refreshCurrent();

      /* 持久容器用赋值绑定，避免多次 mount 后监听器累积 */
      root.onclick = (e) => {
        const rm = e.target.closest('[data-rm]');
        if (rm) { Store.S.selection.delete(rm.dataset.rm); Store.emit(); return; }
        const add = e.target.closest('[data-add]');
        if (add) { Store.selectIds([add.dataset.add]); return; }
      };

      const runBtn = root.querySelector('#run-btn');
      if (runBtn) runBtn.onclick = () => run(root);
    },

    onData() { if (!running) window.App.refreshCurrent(); }
  };

  function feature(ic, t, d) {
    return '<div style="display:flex;gap:10px;align-items:flex-start">' +
      '<span style="width:28px;height:28px;border-radius:8px;background:var(--primary-soft);color:var(--primary);display:flex;align-items:center;justify-content:center;flex:none">' + icon(ic, 15) + '</span>' +
      '<span><span style="display:block;font-size:12.5px;font-weight:600">' + t + '</span>' +
      '<span style="display:block;font-size:11.5px;color:var(--text-4);line-height:1.5">' + d + '</span></span></div>';
  }

  async function run(root) {
    if (running) return;
    const items = queue();
    if (!items.length) { UI.toast('先选几道题', 'warn'); return; }

    running = true;
    lastError = '';
    lastBatch = [];
    streamText = '';
    Store.S.ai.running = true;

    const box = root.querySelector('#run-box');
    const btn = root.querySelector('#run-btn');
    if (btn) { btn.disabled = true; }
    if (box) box.innerHTML = runBoxHTML();

    lastBatch = items.map((m) => ({ mistake: m }));
    try {
      const results = await C.llm.analyzeMistakes(
        items.map((m) => ({ subject: m.subject, content: m.content || m.title, title: m.title })),
        (txt) => {
          streamText = txt;
          const b = root.querySelector('#run-box');
          if (b) b.innerHTML = runBoxHTML();
        }
      );

      const mapped = [];
      for (let i = 0; i < results.length; i++) {
        const r = results[i] || {};
        const target = items[(r.index || i + 1) - 1] || items[i];
        if (!target) continue;
        const analysis = {
          steps: r.analysis || r.steps || '',
          answer: r.answer || '',
          knowledge: Array.isArray(r.knowledge) ? r.knowledge : [],
          similar: Array.isArray(r.similar) ? r.similar : [],
          at: Date.now()
        };
        /* 兼容详情页读取 analysis 字段 */
        analysis.analysis = analysis.steps;
        await Store.updateMistake(target.id, { analysis });
        mapped.push({
          mistake: target,
          answer: analysis.answer,
          knowledge: analysis.knowledge,
          similar: analysis.similar
        });
      }
      lastBatch = mapped;
      UI.toast('解析完成 · ' + mapped.length + ' 道已写回');
    } catch (e) {
      lastError = e.code === 'no_model'
        ? '云端暂时没有可用模型'
        : (e.code === 'timeout' ? '请求超时了，可以减少题量再试' : (e.message || '未知错误'));
      lastBatch = [];
      UI.toast('解析失败：' + lastError, 'err');
    } finally {
      running = false;
      streamText = '';
      Store.S.ai.running = false;
      window.App.refreshCurrent();
    }
  }
})();
