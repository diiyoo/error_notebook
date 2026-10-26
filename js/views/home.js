/* ========== 首页：概览 + 快速入口 ========== */
(function () {
  const V = window.Views = window.Views || {};

  function subjectBars(bySubject, total) {
    const list = Object.entries(bySubject).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!list.length) return '<div class="empty" style="padding:20px"><div class="small">还没有数据</div></div>';
    return list.map(([name, n]) => {
      const pct = total ? Math.round((n / total) * 100) : 0;
      return '<div class="subj-line">' +
        '<span class="subj-name">' + UI.esc(name) + '</span>' +
        '<span class="subj-bar"><i style="width:' + pct + '%;background:' + UI.subjColor(name) + '"></i></span>' +
        '<span class="subj-val">' + n + '</span>' +
        '</div>';
    }).join('');
  }

  function advice(st) {
    const entries = Object.entries(st.bySubject).sort((a, b) => b[1] - a[1]);
    if (!st.total) return '先拍第一道错题，解析完就能看到薄弱点分布。';
    if (!entries.length) return '把错题按科目归档，建议会更准。';
    const top = entries[0];
    const share = Math.round((top[1] / st.total) * 100);
    if (st.analyzed === 0) return '有 ' + st.total + ' 道题还没解析，先挑 3 道发给 AI，看清错在哪。';
    if (share >= 50) return top[0] + '占了 ' + share + '%，是最集中的薄弱科目，建议优先补。';
    return '错题分布比较均匀，保持每天复习 ' + Math.min(5, st.pending) + ' 道的节奏。';
  }

  V.home = {
    title: '首页',
    render() {
      const S = Store.S;
      const st = Store.stats();
      const recent = S.mistakes.slice(0, 4);
      const pendingList = S.mistakes.filter((m) => m.status !== '已掌握').slice(0, 3);

      const hero = S.mistakes.length
        ? '<section class="hero">' +
            '<div class="hero-main">' +
              '<div class="hero-kicker">错题训练</div>' +
              '<div class="hero-title">今天，把不会的题<br>再走一遍</div>' +
              '<div class="hero-desc">共 ' + st.total + ' 道错题，' + st.pending + ' 道待复习' +
                (st.analyzed ? '，' + st.analyzed + ' 道已有解析' : '') + '。</div>' +
              '<div class="hero-cta">' +
                '<button class="hero-btn" data-go="/capture">' + icon('camera', 16) + ' 拍一道错题</button>' +
                '<button class="hero-btn ghost" data-go="/review">' + icon('sparkles', 16) + ' AI 解析</button>' +
              '</div>' +
            '</div>' +
            heroArt() +
          '</section>'
        : '<section class="hero">' +
            '<div class="hero-main">' +
              '<div class="hero-kicker">从这里开始</div>' +
              '<div class="hero-title">拍下第一道错题</div>' +
              '<div class="hero-desc">拍照存题 → AI 分步解析 → 自动归类 → 生成可打印的练习卷。数据存在你自己的设备里。</div>' +
              '<div class="hero-cta"><button class="hero-btn" data-go="/capture">' + icon('camera', 16) + ' 开始拍题</button></div>' +
            '</div>' +
            heroArt() +
          '</section>';

      return '<div class="page">' +
        hero +
        '<div class="stat-grid">' +
          stat('错题总数', st.total, '道') +
          stat('待复习', st.pending, '道') +
          stat('解析覆盖', st.rate, '%') +
          stat('本周新增', st.week, '道') +
        '</div>' +
        '<div class="home-grid">' +
          '<div class="home-col">' +
            '<section class="card">' +
              '<div class="card-pad" style="padding-bottom:6px">' +
                '<div class="sec-head"><div class="sec-title">最近加的题</div>' +
                  (S.mistakes.length > 4 ? '<button class="sec-more" data-go="/books">全部 ' + st.total + ' 道</button>' : '') +
                '</div>' +
              '</div>' +
              '<div class="card-pad" style="padding-top:2px">' +
                (recent.length ? '<div class="recent">' + recent.map((m) =>
                  '<button class="recent-item" data-open="' + m.id + '">' +
                    UI.thumbHTML(m, 'recent-thumb') +
                    '<span class="recent-main">' +
                      '<span class="recent-title">' + UI.esc(m.title) + '</span>' +
                      '<span class="recent-meta">' + UI.esc(m.subject) + ' · ' + UI.fmtRel(m.createdAt) +
                        (m.analysis ? ' · 已解析' : '') + '</span>' +
                    '</span>' +
                    '<span class="todo-go">' + icon('right', 16) + '</span>' +
                  '</button>').join('') + '</div>'
                  : '<div class="empty" style="padding:24px 10px">' +
                      '<div class="empty-ico">' + icon('book', 22) + '</div>' +
                      '<div class="empty-title">错题本还是空的</div>' +
                      '<div class="empty-desc">拍一张题，或手动录入一道，就会出现在这里。</div>' +
                      '<button class="btn btn-soft btn-sm" data-go="/capture">去拍题</button>' +
                    '</div>') +
              '</div>' +
            '</section>' +
            '<section class="card card-pad">' +
              '<div class="sec-head"><div class="sec-title">科目分布</div><span class="tiny muted">共 ' + st.total + ' 道</span></div>' +
              '<div class="subj-row">' + subjectBars(st.bySubject, st.total) + '</div>' +
            '</section>' +
          '</div>' +
          '<div class="home-col">' +
            '<section class="card card-pad">' +
              '<div class="sec-head"><div class="sec-title">该复习了</div>' +
                (st.pending ? '<span class="tag warn">' + st.pending + ' 道</span>' : '') + '</div>' +
              (pendingList.length
                ? '<div class="todo">' + pendingList.map((m) =>
                    '<button class="todo-item" data-open="' + m.id + '">' +
                      '<span class="todo-dot" style="background:' + UI.subjColor(m.subject) + '"></span>' +
                      '<span class="todo-main">' +
                        '<span class="todo-title">' + UI.esc(m.title) + '</span>' +
                        '<span class="todo-meta">' + UI.esc(m.subject) + ' · ' + UI.esc(m.status) + '</span>' +
                      '</span><span class="todo-go">' + icon('right', 15) + '</span>' +
                    '</button>').join('') + '</div>'
                : '<div class="small muted" style="padding:8px 0">全部掌握了，休息一下。</div>') +
            '</section>' +
            '<section class="card card-pad">' +
              '<div class="sec-head"><div class="sec-title">学习建议</div><span class="tiny muted">AI 归纳</span></div>' +
              '<div class="small" style="line-height:1.85;color:var(--text-2)">' + UI.esc(advice(st)) + '</div>' +
              '<button class="btn btn-soft btn-sm" style="margin-top:12px" data-go="/review">' + icon('sparkles', 14) + ' 去解析错题</button>' +
            '</section>' +
            '<section class="card card-pad">' +
              '<div class="sec-head"><div class="sec-title">快捷操作</div></div>' +
              '<div style="display:flex;flex-direction:column;gap:8px">' +
                quick('camera', '拍题录入', '拍照存题、补录文字', '/capture') +
                quick('sparkles', 'AI 解析', '分步解答 + 知识点 + 相似题', '/review') +
                quick('papers', '生成试卷', '选中错题，打印空白练习卷', '/papers') +
              '</div>' +
            '</section>' +
          '</div>' +
        '</div>' +
      '</div>';
    },
    mount(root) { UI.hydratePhotos(root); }
  };

  function stat(label, num, unit) {
    return '<div class="stat"><div class="stat-label">' + label + '</div>' +
      '<div class="stat-num">' + num + '<small>' + unit + '</small></div></div>';
  }

  function quick(ic, title, desc, path) {
    return '<button class="recent-item" data-go="' + path + '">' +
      '<span class="recent-thumb" style="background:var(--primary-soft);color:var(--primary)">' + icon(ic, 19) + '</span>' +
      '<span class="recent-main"><span class="recent-title">' + title + '</span>' +
      '<span class="recent-meta">' + desc + '</span></span>' +
      '<span class="todo-go">' + icon('right', 15) + '</span></button>';
  }

  function heroArt() {
    return '<div class="hero-art">' +
      '<svg width="120" height="120" viewBox="0 0 120 120" fill="none">' +
        '<rect x="26" y="14" width="68" height="92" rx="10" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>' +
        '<rect x="38" y="30" width="44" height="4" rx="2" fill="rgba(255,255,255,.75)"/>' +
        '<rect x="38" y="42" width="34" height="3" rx="1.5" fill="rgba(255,255,255,.45)"/>' +
        '<rect x="38" y="52" width="40" height="3" rx="1.5" fill="rgba(255,255,255,.45)"/>' +
        '<rect x="38" y="62" width="26" height="3" rx="1.5" fill="rgba(255,255,255,.45)"/>' +
        '<circle cx="84" cy="86" r="17" fill="#0F766E" stroke="rgba(255,255,255,.7)" stroke-width="1.5"/>' +
        '<path d="M77.5 86.5l4.5 4.5 8.5-9" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg></div>';
  }
})();
