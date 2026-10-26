/* =====================================================================
   应用引导：导航渲染 / 路由分发 / 登录 / 全局事件
   ===================================================================== */
(function () {
  const C = window.Cuoti;
  const $ = (s) => document.querySelector(s);

  const NAV = [
    { path: '/', key: 'home', label: '首页', short: '首页', icon: 'home' },
    { path: '/capture', key: 'capture', label: '拍题', short: '拍题', icon: 'camera' },
    { path: '/books', key: 'books', label: '错题本', short: '错题', icon: 'book' },
    { path: '/review', key: 'review', label: 'AI 解析', short: '解析', icon: 'sparkles' },
    { path: '/papers', key: 'papers', label: '试卷', short: '试卷', icon: 'papers' },
    { path: '/settings', key: 'settings', label: '我的', short: '我的', icon: 'settings' }
  ];
  const TABS = ['home', 'books', 'capture', 'papers', 'settings'];

  let lastTier = tierOf(window.innerWidth);

  function tierOf(w) {
    return w < 768 ? 'mobile' : (w < 1200 ? 'tablet' : 'desktop');
  }

  /* ---------- 手机端拍题：直接进相机 ----------
     浏览器只允许在用户手势的同步栈里调起文件选择，所以点按钮时先 click()
     再切路由。拍到的文件暂存在 CaptureInbox，由拍题页 take() 取走。 */
  const camInput = document.getElementById('cam-input');

  function isHandset() {
    return window.matchMedia('(max-width: 767.98px)').matches;
  }

  /* 云端 SDK 的报错是英文（如 "verifyOtp requires exactly one of email or phone"），
     家长看不懂，转成能照着做的中文；认不出的原样返回，便于排查。 */
  function authErrText(e) {
    const m = (e && e.message) || '';
    /* 参数装配类错误不能被下面的正则吞掉，否则真 bug 会被伪装成"验证码不对" */
    if (/requires exactly one|requires .*verificationId|requires a verificationToken/i.test(m)) {
      return '登录参数异常（' + m + '），请把这个提示发给我';
    }
    /* 真机实测：验证码错误时后端回的是「无效的验证码%!(EXTRA string=rpc error...)」，
       后半截是服务端格式化泄漏，不能原样给家长看 */
    if (/无效的验证码|malformed jwt|InvalidArgument|rpc error/i.test(m)) {
      return '验证码不正确或已失效，请重新获取';
    }
    if (/verification|invalid.*(code|token)|(code|token).*invalid|otp/i.test(m)) {
      return '验证码不正确或已失效，请重新获取';
    }
    if (/too many|rate.?limit/i.test(m)) return '操作太频繁，请过一会儿再试';
    if (/phone/i.test(m)) return '手机号没被接受，请检查号码后重新获取验证码';
    if (/network|fetch|timeout/i.test(m)) return '网络不通，请检查网络后重试';
    return m || '登录失败';
  }

  function triggerCamera() {
    if (!camInput) return;
    try {
      camInput.value = '';
      camInput.click();
    } catch (e) { /* 浏览器拦截时静默，仍会进入拍题页 */ }
  }

  function goCapture() {
    if (isHandset()) triggerCamera();
    /* 已经在拍题页就不再重绘，否则用户填了一半的内容会被清掉 */
    if (Router.current.name === 'capture') return;
    Router.go('/capture');
  }

  if (camInput) {
    camInput.onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      camInput.value = '';
      if (!f) return;
      const inbox = window.CaptureInbox;
      /* 人已经在拍题页：直接交给当前视图，不重绘、不丢已填内容 */
      if (Router.current.name === 'capture' && inbox && inbox.sink) {
        try { inbox.sink(f); return; } catch (err) { /* 落到下面走路由 */ }
      }
      inbox.file = f;
      Router.go('/capture');
    };
  }

  /* ---------- 导航 ---------- */
  function renderNav() {
    const cur = Router.current.name;
    const activeKey = cur === 'paper' ? 'papers' : cur;

    $('#sb-nav').innerHTML = NAV.map((n) =>
      '<button class="sb-item' + (n.key === activeKey ? ' on' : '') + '" data-short="' + n.short + '" data-nav="' + n.path + '" type="button" title="' + n.label + '">' +
        '<span class="sb-ico">' + icon(n.icon, 19) + '</span>' +
        '<span class="sb-label">' + n.label + '</span>' +
      '</button>').join('');

    const tabs = TABS.map((k) => {
      const n = NAV.find((x) => x.key === k);
      return '<button class="tb-item' + (k === 'capture' ? ' tb-capture' : '') + (k === activeKey ? ' on' : '') + '" data-nav="' + n.path + '" type="button">' +
        '<span class="tb-ico">' + icon(n.icon, k === 'capture' ? 24 : 22) + '</span>' +
        '<span class="tb-txt">' + n.label + '</span>' +
      '</button>';
    }).join('');
    $('#tabbar').innerHTML = tabs;

    document.querySelectorAll('[data-nav]').forEach((b) => {
      b.onclick = () => {
        /* 手机端点「拍题」直接起相机，不再先落在录字表单上 */
        if (b.dataset.nav === '/capture') goCapture();
        else Router.go(b.dataset.nav);
      };
    });
  }

  /* ---------- 路由渲染 ---------- */
  function viewFor(name) {
    if (name === 'home') return Views.home;
    if (name === 'capture') return Views.capture;
    if (name === 'books') return Views.books;
    if (name === 'review') return Views.review;
    if (name === 'papers') return Router.current.id ? Views.paper : Views.papers;
    if (name === 'settings') return Views.settings;
    return Views.home;
  }

  function titleFor(name, id) {
    if (name === 'home') return '首页';
    if (name === 'capture') return '拍题';
    if (name === 'books') return id ? '错题详情' : '错题本';
    if (name === 'review') return 'AI 解析';
    if (name === 'papers') return id ? '试卷预览' : '试卷';
    if (name === 'settings') return '我的';
    return '错题训练';
  }

  function render() {
    const { name, id } = Router.current;

    /* 进入 /books/:id 时同步当前选中；手机上回到 /books 则回到列表 */
    if (name === 'books') {
      if (id) { if (Store.S.currentId !== id) Store.S.currentId = id; }
      else if (Router.isNarrow()) Store.S.currentId = null;
    }

    const V = viewFor(name);
    const viewEl = $('#view');
    const inner = $('#view-inner');

    $('#tb-title').textContent = titleFor(name, id);

    const isSplit = name === 'books';
    viewEl.classList.toggle('view-split', isSplit);

    let html = '';
    try {
      html = V.render(id);
    } catch (e) {
      console.error(e);
      html = '<div class="card"><div class="empty"><div class="empty-title">页面渲染出错</div>' +
        '<div class="empty-desc">' + UI.esc(e.message) + '</div></div></div>';
    }
    inner.innerHTML = html;

    if (V.mount) {
      try { V.mount(inner, id); } catch (e) { console.error('mount', e); }
    }
    renderNav();
    updateChrome();
  }

  function refreshCurrent() {
    const scroller = document.querySelector('.list-pane') || document.querySelector('#view');
    const top = scroller ? scroller.scrollTop : 0;
    render();
    const s2 = document.querySelector('.list-pane') || document.querySelector('#view');
    if (s2 && top) s2.scrollTop = top;
  }

  /* ---------- 顶栏账号状态 ---------- */
  function updateChrome() {
    const u = Store.S.user;
    const chip = $('#sync-chip');
    const btn = $('#auth-btn');
    if (u) {
      chip.textContent = Store.S.syncing ? '同步中…' : '云端已连接';
      chip.style.color = 'var(--primary)';
      chip.style.background = 'var(--primary-soft)';
      btn.textContent = (u.name || u.email || '我的').slice(0, 6);
      btn.classList.add('signed');
      btn.onclick = () => Router.go('/settings');
      $('#sb-user-name').textContent = u.name || u.email || '已登录';
      $('#sb-user-sub').textContent = '云端同步已开启';
      $('#sb-avatar').textContent = (u.name || u.email || 'U').slice(0, 1);
    } else {
      chip.textContent = DB.degraded ? '内存态' : '本机存储';
      chip.style.color = '';
      chip.style.background = '';
      btn.textContent = '登录';
      btn.classList.remove('signed');
      btn.onclick = openLogin;
      $('#sb-user-name').textContent = '本地模式';
      $('#sb-user-sub').textContent = '未登录 · 数据存本机';
      $('#sb-avatar').textContent = '本';
    }
    $('#sb-user').onclick = () => Router.go('/settings');
  }

  /* ---------- 登录 ---------- */
  let pendingOtp = null;

  function openLogin() {
    pendingOtp = null;
    /* 手机浏览器没有第二块屏可以扫自己，微信网页登录（qrconnect）只会给一张二维码。
       普通手机浏览器不摆这条死路，直接用手机号；但微信内置浏览器里长按二维码可识别，
       那条路仍然可用，所以保留。 */
    const handset = isHandset();
    const inWeChat = /MicroMessenger/i.test(navigator.userAgent);
    const showWechat = !handset || inWeChat;
    const wxPart = showWechat
      ? '<div style="display:flex;align-items:center;gap:10px;margin:16px 0;color:var(--text-4);font-size:11px">' +
          '<span style="flex:1;height:1px;background:var(--line)"></span>或<span style="flex:1;height:1px;background:var(--line)"></span></div>' +
        '<button class="btn btn-ghost btn-lg btn-block" id="lg-wx" type="button">微信扫码登录</button>' +
        '<div class="tiny muted" style="margin-top:12px;line-height:1.7">' +
          (inWeChat && handset
            ? '微信里打开的话，二维码可以长按识别；也可以直接用上面的手机号登录。'
            : '会打开微信扫码页，用手机微信扫一下即可，扫完本机自动登录。') +
        '</div>'
      : '<div class="tiny muted" style="margin-top:16px;line-height:1.8">' +
          '手机上用手机号登录，不用扫码；微信扫码登录只在电脑上出现。' +
        '</div>';

    UI.openDlg({
      title: '登录后同步错题',
      sub: handset
        ? '用手机号登录，换手机、换电脑都能接着看。不登录也能用，数据存在这台设备上。'
        : '不登录也能用，数据存在这台设备上；登录后换手机、换电脑都能接着看。',
      body:
        '<div class="field"><label class="field-label">手机号</label>' +
          '<input class="input" id="lg-phone" type="tel" maxlength="11" placeholder="11 位手机号" autocomplete="tel" inputmode="numeric"></div>' +
        '<div style="display:flex;gap:10px;align-items:flex-start">' +
          '<div class="field" style="flex:1"><label class="field-label">验证码</label>' +
            '<input class="input" id="lg-code" maxlength="6" placeholder="6 位验证码" autocomplete="one-time-code" inputmode="numeric"></div>' +
          '<button class="btn btn-soft" id="lg-send" type="button" style="margin-top:20px;flex:none">获取验证码</button>' +
        '</div>' +
        '<div class="field-error" id="lg-err"></div>' +
        '<button class="btn btn-primary btn-lg btn-block" id="lg-submit" type="button">登录 / 注册</button>' +
        wxPart,
      actions: [],
      onMount: ({ el, close }) => {
        const err = el.querySelector('#lg-err');
        const phone = el.querySelector('#lg-phone');
        const code = el.querySelector('#lg-code');
        const send = el.querySelector('#lg-send');

        send.onclick = async () => {
          const p = phone.value.trim();
          if (!/^1\d{10}$/.test(p)) { err.textContent = '请输入 11 位手机号'; return; }
          send.disabled = true; send.textContent = '发送中…';
          try {
            const { data, error } = await C.auth.sendPhoneCode(p);
            if (error) throw error;
            /* sendOtp 只回 { verificationId, isExistingUser }，不带手机号；
               verifyOtp 却要求 email / phone 恰好有一个，所以这里必须自己补上 */
            pendingOtp = Object.assign({ phone: p }, data);
            err.textContent = '';
            UI.toast('验证码已发送');
            let left = 60;
            send.textContent = left + ' 秒后重发';
            const t = setInterval(() => {
              left--;
              if (left <= 0) { clearInterval(t); send.disabled = false; send.textContent = '重新获取'; }
              else send.textContent = left + ' 秒后重发';
            }, 1000);
          } catch (e) {
            send.disabled = false; send.textContent = '获取验证码';
            err.textContent = authErrText(e);
          }
        };

        el.querySelector('#lg-submit').onclick = async () => {
          const p = phone.value.trim();
          const v = code.value.trim();
          if (!pendingOtp) { err.textContent = '先获取验证码'; return; }
          if (pendingOtp.phone && pendingOtp.phone !== p) {
            err.textContent = '手机号已改，请重新获取验证码';
            return;
          }
          if (!/^\d{4,6}$/.test(v)) { err.textContent = '请输入验证码'; return; }
          const btn = el.querySelector('#lg-submit');
          btn.disabled = true; btn.textContent = '登录中…';
          try {
            const { data, error } = await C.auth.verifyPhoneCode(pendingOtp, v);
            if (error) throw error;
            awaiting = false;
            Store.setUser(data.user || (data.session && data.session.user) || data);
            close();
            UI.toast('登录成功');
            Store.sync();
          } catch (e) {
            err.textContent = authErrText(e);
            btn.disabled = false; btn.textContent = '登录 / 注册';
          }
        };

        const wxBtn = el.querySelector('#lg-wx');
        if (wxBtn) wxBtn.onclick = async () => {
          wxBtn.disabled = true;
          wxBtn.textContent = '正在打开微信扫码页…';
          try { await C.auth.signInWithWechat(); }
          catch (e) {
            err.textContent = e.message || '微信登录不可用';
            wxBtn.disabled = false;
            wxBtn.textContent = '微信扫码登录';
          }
        };
      }
    });
  }

  /* ---------- 启动 ---------- */
  let awaiting = false;

  async function restoreAuth() {
    try {
      const { session } = await C.auth.restoreAuth();
      if (session) {
        Store.setUser(session.user || session);
      }
    } catch (e) { console.warn('auth restore', e); }
  }

  async function boot() {
    renderNav();
    Router.start(() => { render(); });

    Store.sub(() => {
      const cur = viewFor(Router.current.name);
      if (cur && cur.onData) { try { cur.onData(); } catch (e) { console.error(e); } }
      updateChrome();
    });

    await Store.init();
    await restoreAuth();
    refreshCurrent();

    if (Store.S.user) Store.sync();

    /* 断点变化时重绘（真正的自适应：布局由 CSS 完成，这里只处理视图差异） */
    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const t = tierOf(window.innerWidth);
        if (t !== lastTier) { lastTier = t; refreshCurrent(); }
        else if (Router.current.name === 'settings') {
          const tag = document.getElementById('tier-tag');
          const w = document.getElementById('tier-w');
          if (tag && w) {
            w.textContent = window.innerWidth;
            tag.textContent = t === 'mobile' ? '手机布局' : (t === 'tablet' ? '平板布局' : '桌面布局');
          }
        }
      }, 120);
    });

    /* 全局事件：data-go / data-open */
    document.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (go) {
        e.preventDefault();
        if (go.dataset.go === '/capture') goCapture();
        else Router.go(go.dataset.go);
        return;
      }
      const open = e.target.closest('[data-open]');
      if (open) { e.preventDefault(); Store.setCurrent(open.dataset.open); Router.go('/books/' + open.dataset.open); }
    });

    /* 后台服务（若配置了 Service Worker 预缓存可在此注册；本期不引入构建） */
  }

  window.App = { refreshCurrent, openLogin, render, boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
