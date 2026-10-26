/* ========== 设置 / 我的 ========== */
(function () {
  const V = window.Views = window.Views || {};
  const C = window.Cuoti;

  function tier() {
    const w = window.innerWidth;
    if (w < 768) return { name: '手机布局', note: '单列 + 底部导航', w };
    if (w < 1200) return { name: '平板布局', note: '图标侧栏 + 双栏', w };
    return { name: '桌面布局', note: '完整侧栏 + 多栏', w };
  }

  V.settings = {
    title: '我的',
    render() {
      const S = Store.S;
      const st = Store.stats();
      const t = tier();
      const u = S.user;

      return '<div class="page">' +
        '<div class="home-grid" style="margin-top:0">' +

          '<div class="home-col">' +
            /* 账号 */
            '<section class="card card-pad">' +
              '<div style="display:flex;align-items:center;gap:13px">' +
                '<div class="sb-avatar" style="width:46px;height:46px;font-size:16px">' +
                  UI.esc(u ? ((u.name || u.email || 'U')[0]) : '本') + '</div>' +
                '<div style="flex:1;min-width:0">' +
                  '<div style="font-size:15px;font-weight:650">' + (u ? UI.esc(u.name || u.email || '已登录') : '本地模式') + '</div>' +
                  '<div class="tiny muted" style="margin-top:2px">' + (u ? '错题会同步到云端，换设备可继续' : '数据只存在这台设备，换设备不会带走') + '</div>' +
                '</div>' +
                (u
                  ? '<button class="btn btn-ghost btn-sm" id="logout" type="button">退出</button>'
                  : '<button class="btn btn-primary btn-sm" id="login" type="button">登录</button>') +
              '</div>' +
            '</section>' +

            /* 数据 */
            '<section class="card">' +
              '<div class="set-row" style="border-bottom:1px solid var(--line-soft)">' +
                '<span class="set-ico">' + icon('chart', 16) + '</span>' +
                '<span class="set-main"><span class="set-t">数据概览</span>' +
                '<span class="set-s">' + st.total + ' 道错题 · ' + st.analyzed + ' 道已解析 · ' + S.papers.length + ' 份试卷</span></span>' +
              '</div>' +
              '<button class="set-row" id="do-sync" type="button"' + (u ? '' : ' disabled') + '>' +
                '<span class="set-ico">' + icon('cloud', 16) + '</span>' +
                '<span class="set-main"><span class="set-t">立即同步云端</span>' +
                '<span class="set-s">' + (u
                  ? (S.lastSync ? '上次同步 ' + UI.fmtRel(S.lastSync) : '还没同步过')
                  : '登录后可用') + '</span></span>' +
                '<span class="set-go">' + icon('right', 15) + '</span>' +
              '</button>' +
              '<button class="set-row" id="export" type="button">' +
                '<span class="set-ico">' + icon('download', 16) + '</span>' +
                '<span class="set-main"><span class="set-t">导出数据</span>' +
                '<span class="set-s">下载 JSON 备份（含题目与解析，不含照片原图）</span></span>' +
                '<span class="set-go">' + icon('right', 15) + '</span>' +
              '</button>' +
              '<button class="set-row" id="wipe" type="button">' +
                '<span class="set-ico" style="background:var(--danger-soft);color:var(--danger)">' + icon('trash', 16) + '</span>' +
                '<span class="set-main"><span class="set-t" style="color:var(--danger)">清空本地数据</span>' +
                '<span class="set-s">删除本机所有错题和试卷，不可恢复</span></span>' +
                '<span class="set-go">' + icon('right', 15) + '</span>' +
              '</button>' +
            '</section>' +

            /* 存储 */
            '<section class="card card-pad">' +
              '<div class="sec-head"><div class="sec-title">存储方式</div>' +
                '<span class="tag ' + (DB.degraded ? 'warn' : 'primary') + '">' + (DB.degraded ? '内存态' : 'IndexedDB') + '</span></div>' +
              '<div class="small" style="color:var(--text-2);line-height:1.9">' +
                (DB.degraded
                  ? '当前浏览器不允许本地数据库，数据只保存在内存里，刷新会丢。请退出无痕模式，或换一个浏览器。'
                  : '题目、解析和试卷存在浏览器本地数据库；照片按原图压缩后单独存为二进制，不再受 5MB 限制。清缓存会丢，重要数据建议定期导出或用登录同步。') +
              '</div>' +
            '</section>' +
          '</div>' +

          '<div class="home-col">' +
            /* 当前布局 */
            '<section class="card card-pad">' +
              '<div class="sec-head"><div class="sec-title">当前布局</div><span class="tag primary" id="tier-tag">' + t.name + '</span></div>' +
              '<div class="small" style="color:var(--text-2);line-height:1.9">' +
                '窗口宽度 <b id="tier-w">' + t.w + '</b> px · ' + t.note + '<br>' +
                '<span class="tiny muted">拖动浏览器窗口改变宽度，界面会实时切换，不是靠按钮切的。</span>' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px">' +
                tierBox('手机', '<768px', t.w < 768) +
                tierBox('平板', '768–1199', t.w >= 768 && t.w < 1200) +
                tierBox('桌面', '≥1200', t.w >= 1200) +
              '</div>' +
            '</section>' +

            /* 打印 */
            '<section class="card card-pad">' +
              '<div class="sec-head"><div class="sec-title">打印小贴士</div></div>' +
              '<div class="small" style="color:var(--text-2);line-height:1.9">' +
                '· 打印时只输出试卷，导航和按钮会自动隐藏<br>' +
                '· 纸张选 A4，页边距用「默认」<br>' +
                '· 想存电子版，在打印对话框里把目标改成「另存为 PDF」' +
              '</div>' +
            '</section>' +

            /* 关于 */
            '<section class="card about-card">' +
              '<div class="about-mark">' +
                '<svg width="26" height="26" viewBox="0 0 18 18" fill="none"><path d="M9 1L10.8 7.2L17 9L10.8 10.8L9 17L7.2 10.8L1 9L7.2 7.2L9 1Z" fill="#fff"/></svg>' +
              '</div>' +
              '<div class="about-name">错题训练</div>' +
              '<div class="about-desc">拍题收集 · AI 分步解析 · 自动归类<br>一键组卷 · A4 打印</div>' +
              '<div class="tiny muted" style="margin-top:10px">v2.0 · 一套页面自适应三端</div>' +
            '</section>' +
          '</div>' +

        '</div>' +
      '</div>';
    },

    mount(root) {
      const login = root.querySelector('#login');
      if (login) login.onclick = () => window.App.openLogin();

      const logout = root.querySelector('#logout');
      if (logout) logout.onclick = async () => {
        const ok = await UI.confirmDlg({ title: '退出登录？', desc: '退出后本地数据保留，只是不再同步。', okText: '退出' });
        if (!ok) return;
        try { await C.auth.signOut(); } catch (e) {}
        Store.setUser(null);
        UI.toast('已退出');
      };

      const sync = root.querySelector('#do-sync');
      if (sync && !sync.disabled) sync.onclick = () => Store.sync();

      const exp = root.querySelector('#export');
      if (exp) exp.onclick = () => {
        const data = {
          exportedAt: new Date().toISOString(),
          mistakes: Store.S.mistakes.map((m) => ({
            id: m.id, subject: m.subject, title: m.title, content: m.content,
            source: m.source, status: m.status, notes: m.notes,
            analysis: m.analysis, createdAt: m.createdAt, updatedAt: m.updatedAt,
            hasPhoto: !!m.photoId
          })),
          papers: Store.S.papers
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '错题训练-备份-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        UI.toast('备份已下载');
      };

      const wipe = root.querySelector('#wipe');
      if (wipe) wipe.onclick = async () => {
        const ok = await UI.confirmDlg({
          title: '清空本地数据？',
          desc: '本机的 ' + Store.S.mistakes.length + ' 道错题和 ' + Store.S.papers.length + ' 份试卷都会删除，云端不受影响。',
          okText: '全部删除', danger: true
        });
        if (!ok) return;
        await DB.clearAll();
        Store.S.mistakes = [];
        Store.S.papers = [];
        Store.S.currentId = null;
        Store.S.selection.clear();
        Store.emit();
        UI.toast('已清空');
      };
    },

    onData() { window.App.refreshCurrent(); }
  };

  function tierBox(name, range, on) {
    return '<div style="text-align:center;padding:8px 4px;border-radius:9px;border:1px solid ' +
      (on ? 'var(--primary-border)' : 'var(--line)') + ';background:' + (on ? 'var(--primary-soft)' : 'var(--card-sub)') + '">' +
      '<div style="font-size:11.5px;font-weight:' + (on ? '700' : '500') + ';color:' + (on ? 'var(--primary)' : 'var(--text-3)') + '">' + name + '</div>' +
      '<div style="font-size:10px;color:var(--text-4);margin-top:1px">' + range + '</div></div>';
  }
})();
