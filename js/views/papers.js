/* ========== 试卷库 + A4 预览打印 ========== */
(function () {
  const V = window.Views = window.Views || {};

  /* 把试卷的 items 归一化成可直接渲染的行。
     原题实时读错题本（改了题目，卷子跟着变）；相似题读试卷里的快照（不随原题变）。 */
  function paperItems(paper) {
    const out = [];
    Store.normItems(paper).forEach((it, i) => {
      if (it.type === 'similar') {
        const src = Store.S.mistakes.find((m) => m.id === it.fromId);
        out.push({
          key: 's' + i,
          kind: 'similar',
          title: '',
          content: it.question || '',
          answer: it.answer || '',
          knowledge: it.knowledge ? [it.knowledge] : [],
          subject: it.subject || (src && src.subject) || '综合',
          from: src ? src.title : ''
        });
        return;
      }
      const m = Store.S.mistakes.find((x) => x.id === it.id);
      if (!m) return;
      const a = m.analysis || {};
      out.push({
        key: it.id,
        kind: 'mistake',
        title: m.title || '',
        content: m.content || '',
        answer: a.answer || '',
        knowledge: Array.isArray(a.knowledge) ? a.knowledge : [],
        subject: m.subject || '综合',
        from: ''
      });
    });
    return out;
  }

  /* ---------- 库列表 ---------- */
  V.papers = {
    title: '试卷',
    render() {
      const S = Store.S;
      const selCount = S.selection.size;

      return '<div class="page">' +
        '<div class="review-head">' +
          '<div style="flex:1;min-width:0">' +
            '<div class="sec-title" style="font-size:17px">我的练习卷</div>' +
            '<div class="tiny muted" style="margin-top:3px">从错题组卷，打印出来手写重做</div>' +
          '</div>' +
          (selCount
            ? '<button class="btn btn-primary" id="new-paper" type="button">' + icon('papers', 15) + ' 用选中的 ' + selCount + ' 道组卷</button>'
            : '<button class="btn btn-soft" data-go="/books" type="button">去错题本勾选</button>') +
        '</div>' +

        (S.papers.length
          ? '<div class="paper-grid">' + S.papers.map((p) => {
              const items = paperItems(p);
              const subj = items.length ? (items[0].subject + (items.some((x) => x.subject !== items[0].subject) ? ' 等' : '')) : '综合';
              return '<button class="paper-card" data-paper="' + p.id + '" type="button">' +
                '<span class="paper-thumb"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
                '<span class="paper-info">' +
                  '<span class="paper-name">' + UI.esc(p.title) + '</span>' +
                  '<span class="paper-meta">' + UI.fmtDate(p.createdAt) + ' · ' + items.length + ' 道题</span>' +
                  '<span class="paper-tags">' +
                    '<span class="tag primary">' + UI.esc(subj) + '</span>' +
                    (p.withAnswers ? '<span class="tag ok">含答案</span>' : '<span class="tag">空白卷</span>') +
                  '</span>' +
                '</span>' +
              '</button>';
            }).join('') + '</div>'
          : '<div class="card"><div class="empty" style="padding:52px 20px">' +
              '<div class="empty-ico">' + icon('papers', 24) + '</div>' +
              '<div class="empty-title">还没生成过试卷</div>' +
              '<div class="empty-desc">在错题本勾几道题，点「生成试卷」，就会得到一份 A4 排版的空白练习卷。</div>' +
              '<button class="btn btn-soft btn-sm" data-go="/books" type="button">去挑错题</button>' +
            '</div></div>') +

        '<div class="card card-pad" style="margin-top:16px">' +
          '<div class="sec-head"><div class="sec-title">组卷建议</div></div>' +
          '<div class="small" style="color:var(--text-2);line-height:1.9">' +
            '· 一次挑 5–10 道，够一页 A4，做起来不累<br>' +
            '· 原题做过一遍还想练，组卷时把「变式」勾上——解析时已经备好同型题<br>' +
            '· 想只做变式，进对话框点「全部换变式」，一键换掉<br>' +
            '· 生成时勾上答案页，做完直接对照' +
          '</div>' +
        '</div>' +
      '</div>';
    },

    mount(root) {
      root.querySelectorAll('[data-paper]').forEach((b) => {
        b.onclick = () => Router.go('/papers/' + b.dataset.paper);
      });
      const np = root.querySelector('#new-paper');
      if (np) np.onclick = () => window.Views.books.openPaperDlg(Array.from(Store.S.selection));
    },

    onData() { window.App.refreshCurrent(); }
  };

  /* ---------- A4 预览 ---------- */
  V.paper = {
    title: '试卷预览',
    render(id) {
      const p = Store.S.papers.find((x) => x.id === id);
      if (!p) {
        return '<div class="page"><div class="card"><div class="empty" style="padding:60px 20px">' +
          '<div class="empty-ico">' + icon('papers', 24) + '</div>' +
          '<div class="empty-title">试卷不存在</div>' +
          '<div class="empty-desc">可能已经被删除了。</div>' +
          '<button class="btn btn-soft btn-sm" data-go="/papers" type="button">返回试卷库</button>' +
        '</div></div></div>';
      }
      const items = paperItems(p);
      const today = new Date(p.createdAt).toLocaleDateString('zh-CN');

      const questions = items.map((it, i) =>
        '<div class="ps-q">' +
          '<div class="ps-q-head">' + (i + 1) + '. ' +
            (it.kind === 'similar' ? '<span class="ps-var">变式</span> ' : '') +
            (it.knowledge[0]
              ? '<span style="font-weight:500;font-size:11.5px;color:#666">［' + UI.esc(it.knowledge[0]) + '］</span> ' : '') +
            UI.esc(it.title) + '</div>' +
          (it.content ? '<div class="ps-q-text">' + UI.esc(it.content) + '</div>' : '') +
          '<div class="ps-blank' + (it.content && it.content.length > 60 ? ' tall' : '') + '"></div>' +
          (p.withAnswers && it.answer
            ? '<div class="ps-answer">答案：' + UI.esc(it.answer) + '</div>' : '') +
        '</div>').join('');

      return '<div class="page">' +
        '<div class="paper-wrap">' +
          '<div class="paper-toolbar no-print">' +
            '<button class="btn btn-ghost btn-sm" data-go="/papers" type="button">' + icon('left', 15) + ' 试卷库</button>' +
            '<span style="flex:1"></span>' +
            '<button class="btn btn-ghost btn-sm" id="toggle-ans" type="button">' +
              (p.withAnswers ? '隐藏答案' : '显示答案') + '</button>' +
            '<button class="btn btn-primary btn-sm" id="print-btn" type="button">' + icon('print', 15) + ' 打印 / 存 PDF</button>' +
            '<button class="btn btn-danger btn-sm btn-icon" id="del-paper" type="button" title="删除试卷">' + icon('trash', 15) + '</button>' +
          '</div>' +

          '<div class="paper-sheet">' +
            '<div class="ps-head">' +
              '<div class="ps-title">' + UI.esc(p.title) + '</div>' +
              '<div class="ps-sub"><span>姓名：____________</span><span>班级：____________</span>' +
              '<span>日期：' + today + '</span></div>' +
            '</div>' +
            '<div class="ps-tip">共 ' + items.length + ' 道题　·　请在每题下方空白处写出完整过程' +
              (p.withAnswers ? '　·　本题卷含参考答案' : '') + '</div>' +
            questions +
            '<div class="ps-foot"><span>错题训练 · 自动组卷</span><span>第 1 页</span></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    },

    mount(root, param) {
      const p = Store.S.papers.find((x) => x.id === param);
      const printBtn = root.querySelector('#print-btn');
      if (printBtn) printBtn.onclick = () => window.print();

      const tg = root.querySelector('#toggle-ans');
      if (tg && p) tg.onclick = () => Store.togglePaperAnswers(p.id);

      const del = root.querySelector('#del-paper');
      if (del && p) del.onclick = async () => {
        const ok = await UI.confirmDlg({ title: '删除这份试卷？', desc: '只删试卷，错题本身不受影响。', okText: '删除', danger: true });
        if (ok) { await Store.deletePaper(p.id); Router.go('/papers'); UI.toast('试卷已删除'); }
      };
    },

    onData() { window.App.refreshCurrent(); }
  };
})();
