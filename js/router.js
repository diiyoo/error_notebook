/* =====================================================================
   hash 路由：真前进 / 后退，刷新后停在原页面
   #/            首页
   #/capture     拍题录入
   #/books       错题本
   #/books/:id   错题详情（宽屏为右侧详情，手机为整页）
   #/review      AI 解析台
   #/papers      试卷库
   #/papers/:id  试卷预览 / 打印
   #/settings    设置
   ===================================================================== */
(function () {
  let onChange = null;
  let current = { name: 'home', id: null };

  function parse() {
    const raw = (location.hash || '').replace(/^#/, '');
    const parts = raw.split('/').filter(Boolean);
    const name = parts[0] || 'home';
    return { name, id: parts[1] || null };
  }

  function apply() {
    current = parse();
    if (onChange) onChange(current);
  }

  function go(path) {
    const target = '#' + (path.charAt(0) === '/' ? path : '/' + path);
    if (location.hash === target) { apply(); return; }
    location.hash = target;
  }

  function start(handler) {
    onChange = handler;
    window.addEventListener('hashchange', apply);
    if (!location.hash) {
      history.replaceState(null, '', location.pathname + location.search + '#/');
    }
    apply();
  }

  window.Router = {
    start, go,
    get current() { return current; },
    /* 手机端判断（仅用于渲染差异，布局仍由 CSS 负责） */
    isNarrow() { return window.matchMedia('(max-width: 767.98px)').matches; }
  };
})();
