/* ========== 拍题：照片 + 录入 ========== */
(function () {
  const V = window.Views = window.Views || {};

  /* 手机端从「拍题」入口起相机时，文件在这里交接：
     app.js 拍照后放进 file → 路由切到拍题页 → mount 时 take() 取走 */
  window.CaptureInbox = window.CaptureInbox || {
    file: null,
    sink: null,
    take() { const f = this.file; this.file = null; return f; }
  };

  V.capture = {
    title: '拍题',
    render() {
      const S = Store.S;
      const narrow = Router.isNarrow();
      return '<div class="page">' +
        '<div class="capture-grid">' +

          '<section class="card card-pad">' +
            '<div class="sec-head"><div class="sec-title">题目照片</div>' +
              '<span class="tiny muted">可选</span></div>' +
            '<div class="drop" id="drop">' +
              '<div id="drop-empty">' +
                '<div class="drop-ico">' + icon('camera', 24) + '</div>' +
                '<div class="drop-title" style="margin-top:10px">' + (narrow ? '拍下这道题' : '拍照或拖入一张图') + '</div>' +
                '<div class="drop-desc">' + (narrow
                  ? '点这里直接打开相机 · 拍完自动识题'
                  : '手机可直接调起相机；电脑可拖拽图片进来 · 拍完自动识题') + '</div>' +
              '</div>' +
              '<div class="drop-preview" id="drop-preview" hidden>' +
                '<img id="preview-img" alt="题目预览">' +
              '</div>' +
            '</div>' +
            '<div class="drop-actions">' +
              '<button class="btn btn-primary btn-sm" id="pick-camera" type="button">' + icon('camera', 15) + ' ' + (narrow ? '拍照识题' : '相机拍摄') + '</button>' +
              '<button class="btn btn-ghost btn-sm" id="pick-file" type="button">' + icon('image', 15) + ' 从相册选</button>' +
              '<button class="btn btn-danger btn-sm" id="clear-photo" type="button" hidden>移除</button>' +
            '</div>' +
            '<div class="ocr-box" id="ocr-box" hidden><div class="ocr-line" id="ocr-line"></div></div>' +
            '<input type="file" id="file-input" accept="image/*" hidden>' +
            '<input type="file" id="file-camera" accept="image/*" capture="environment" hidden>' +
          '</section>' +

          '<section class="card card-pad">' +
            '<div class="sec-head"><div class="sec-title">题目信息</div>' +
              '<span class="tiny muted">带 * 为必填</span></div>' +

            '<div class="field">' +
              '<span class="field-label">科目 *</span>' +
              '<div class="seg" id="seg-subject">' +
                UI.SUBJECTS.map((s, i) =>
                  '<button type="button" class="seg-item' + (i === 0 ? ' on' : '') + '" data-v="' + s + '">' + s + '</button>').join('') +
              '</div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="field-label" for="f-title">标题</label>' +
              '<input class="input" id="f-title" maxlength="40" placeholder="一句话概括，如：二次函数顶点式">' +
            '</div>' +

            '<div class="field">' +
              '<label class="field-label" for="f-content">题干 *</label>' +
              '<textarea class="input" id="f-content" rows="6" maxlength="3000" placeholder="把题目文字录进来。AI 会依据它分步解析、给答案、归纳知识点。"></textarea>' +
            '</div>' +

            '<div class="form-row">' +
              '<div class="field">' +
                '<label class="field-label" for="f-source">来源</label>' +
                '<select class="input" id="f-source"><option>拍摄</option><option>作业</option><option>考试</option><option>手录</option></select>' +
              '</div>' +
              '<div class="field">' +
                '<label class="field-label" for="f-status">状态</label>' +
                '<select class="input" id="f-status"><option>待复习</option><option>未掌握</option><option>已掌握</option></select>' +
              '</div>' +
            '</div>' +

            '<div class="field-error" id="f-error"></div>' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
              '<button class="btn btn-ghost btn-lg" id="save-only" type="button" style="flex:1">保存</button>' +
              '<button class="btn btn-primary btn-lg" id="save-review" type="button" style="flex:1.4">' + icon('sparkles', 16) + ' 保存并解析</button>' +
            '</div>' +
          '</section>' +

        '</div>' +
      '</div>';
    },

    mount(root) {
      const $ = (s) => root.querySelector(s);
      let currentFile = null;
      let subject = '数学';

      const drop = $('#drop');
      const empty = $('#drop-empty');
      const preview = $('#drop-preview');
      const img = $('#preview-img');
      const clearBtn = $('#clear-photo');
      const fileInput = $('#file-input');
      const cameraInput = $('#file-camera');

      function showPreview(file) {
        if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
        const url = URL.createObjectURL(file);
        img.dataset.url = url;
        img.src = url;
        empty.hidden = true;
        preview.hidden = false;
        clearBtn.hidden = false;
      }
      function clearPhoto() {
        currentFile = null;
        if (img.dataset.url) { URL.revokeObjectURL(img.dataset.url); delete img.dataset.url; }
        img.removeAttribute('src');
        empty.hidden = false;
        preview.hidden = true;
        clearBtn.hidden = true;
        const box = $('#ocr-box');
        if (box) { box.hidden = true; box.className = 'ocr-box'; $('#ocr-line').innerHTML = ''; }
      }

      async function accept(files) {
        const f = files && files[0];
        if (!f) return;
        if (!/^image\//.test(f.type)) { UI.toast('请选择图片文件', 'warn'); return; }
        if (f.size > 12 * 1024 * 1024) { UI.toast('图片超过 12MB，请压缩后再传', 'warn'); return; }
        currentFile = f;
        showPreview(f);
        /* 清空 input，保证同一张图再次选择也能触发 change */
        fileInput.value = '';
        cameraInput.value = '';
        await runOcr(f);
      }

      /* ---------- 图片识题 ---------- */
      const C = window.Cuoti;
      let ocrBusy = false;

      function ocrState(kind, html) {
        const box = $('#ocr-box');
        box.hidden = false;
        box.className = 'ocr-box ' + kind;
        $('#ocr-line').innerHTML = html;
      }

      function titleFrom(text) {
        const t = String(text || '').replace(/^[（(]?\d{1,2}[)）.、．]\s*/, '').replace(/\s+/g, ' ').trim();
        const head = t.split(/[，,。；;？?]/)[0];
        const base = head.length >= 6 ? head : t;
        return base.length > 20 ? base.slice(0, 20) + '…' : base;
      }

      function applySingle(r) {
        const it = r.items[0];
        setSubject(r.subject);
        if (!$('#f-content').value.trim()) $('#f-content').value = it.text;
        if (!$('#f-title').value.trim()) $('#f-title').value = titleFrom(it.text);
      }

      async function runOcr(file) {
        if (ocrBusy) return;
        if (!C.llm || typeof C.llm.ocrPhoto !== 'function') {
          ocrState('warn', icon('close', 15) + '<span>当前版本不支持识题，请手动录入题干</span>');
          return;
        }
        ocrBusy = true;
        const t0 = Date.now();
        ocrState('running', '<span class="ocr-spin"></span><span>正在识别题目…</span>');
        try {
          const r = await C.llm.ocrPhoto(file, (st) => {
            if (st.attempt > 1) ocrState('running', '<span class="ocr-spin"></span><span>换一个模型再试一次…</span>');
          });
          const secs = ((Date.now() - t0) / 1000).toFixed(1);
          if (r.items.length === 1) {
            applySingle(r);
            ocrState('ok', icon('check', 15) + '<span>已识别 1 道题（' + secs + ' 秒）· 题干已填入下方，请核对后保存</span>');
            /* 手机上不自动聚焦，否则会立刻弹起键盘挡住核对区域 */
            if (!Router.isNarrow()) $('#f-content').focus();
          } else {
            ocrState('ok', icon('check', 15) + '<span>识别到 ' + r.items.length + ' 道题（' + secs + ' 秒）</span>');
            openMulti(r);
          }
        } catch (e) {
          ocrState('warn', icon('close', 15) + '<span>' + UI.esc(e.message || '识别失败') + '，请手动录入题干</span>');
        } finally {
          ocrBusy = false;
        }
      }

      /* 一图多题：确认清单，可改字、可去掉不要的 */
      function openMulti(r) {
        const body =
          '<div class="ocr-multi">' +
            '<div class="ocr-subj-row">' +
              '<span class="field-label" style="margin:0">科目</span>' +
              '<div class="seg" id="ocr-subj">' +
                UI.SUBJECTS.map((s) =>
                  '<button type="button" class="seg-item' + (s === r.subject ? ' on' : '') + '" data-v="' + s + '">' + s + '</button>').join('') +
              '</div>' +
            '</div>' +
            '<div class="ocr-list">' +
              r.items.map((it, i) =>
                '<div class="ocr-item" data-i="' + i + '">' +
                  '<label class="ocr-pick"><input type="checkbox" checked></label>' +
                  '<div class="ocr-item-body">' +
                    '<div class="ocr-no">' + (it.no ? '第 ' + UI.esc(it.no) + ' 题' : '第 ' + (i + 1) + ' 题') + '</div>' +
                    '<textarea class="input ocr-ta" rows="3">' + UI.esc(it.text) + '</textarea>' +
                  '</div>' +
                '</div>').join('') +
            '</div>' +
            '<div class="tiny muted" style="margin-top:2px">看不清的字会显示为 □，请按原题补上。照片原图只保存在第 1 道题上。</div>' +
          '</div>';

        let subj = r.subject;
        UI.openDlg({
          title: '识别到 ' + r.items.length + ' 道题',
          sub: '核对一下再入库，可以直接改字',
          body: body,
          actions: [
            { label: '先不入库', kind: 'btn-ghost' },
            {
              label: '保存选中的题',
              kind: 'btn-primary',
              onClick: async ({ el }) => {
                const picks = Array.from(el.querySelectorAll('.ocr-item')).filter((it) => {
                  const cb = it.querySelector('input[type=checkbox]');
                  return cb && cb.checked && it.querySelector('textarea').value.trim();
                });
                if (!picks.length) { UI.toast('至少选一道题', 'warn'); return false; }
                let first = true, n = 0;
                for (const it of picks) {
                  const text = it.querySelector('textarea').value.trim();
                  await Store.addMistake({
                    subject: subj,
                    title: titleFrom(text) || '拍摄错题',
                    content: text,
                    source: '拍摄',
                    status: '待复习'
                  }, first ? currentFile : null);
                  first = false;
                  n++;
                }
                UI.toast('已入库 ' + n + ' 道错题 · 共 ' + Store.S.mistakes.length + ' 道');
                clearPhoto();
                $('#f-title').value = '';
                $('#f-content').value = '';
                return true;
              }
            }
          ],
          onMount: ({ el }) => {
            el.querySelectorAll('#ocr-subj .seg-item').forEach((b) => {
              b.onclick = () => {
                el.querySelectorAll('#ocr-subj .seg-item').forEach((x) => x.classList.remove('on'));
                b.classList.add('on');
                subj = b.dataset.v;
              };
            });
          }
        });
      }

      $('#pick-file').onclick = () => fileInput.click();
      $('#pick-camera').onclick = () => cameraInput.click();
      clearBtn.onclick = clearPhoto;
      fileInput.onchange = (e) => accept(e.target.files);
      cameraInput.onchange = (e) => accept(e.target.files);
      /* 手机端点大区域直接拍照；桌面点大区域选文件 */
      drop.onclick = (e) => {
        if (e.target.closest('.drop-preview')) return;
        if (Router.isNarrow()) cameraInput.click();
        else fileInput.click();
      };

      /* 手机端从底部「拍题」直接起相机后的文件交接 */
      const inbox = window.CaptureInbox;
      inbox.sink = (f) => accept([f]);
      const queued = inbox.take();
      if (queued) accept([queued]);

      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault(); drop.classList.remove('over');
        accept(e.dataTransfer.files);
      });

      function setSubject(name) {
        if (UI.SUBJECTS.indexOf(name) < 0) return;
        subject = name;
        root.querySelectorAll('#seg-subject .seg-item').forEach((x) => {
          x.classList.toggle('on', x.dataset.v === name);
        });
      }

      root.querySelectorAll('#seg-subject .seg-item').forEach((b) => {
        b.onclick = () => setSubject(b.dataset.v);
      });

      async function save(andReview) {
        const title = $('#f-title').value.trim();
        const content = $('#f-content').value.trim();
        const err = $('#f-error');
        if (!content && !currentFile) {
          err.textContent = '至少要有照片或题干文字，否则 AI 无从解析。';
          $('#f-content').focus();
          return;
        }
        const btns = [$('#save-only'), $('#save-review')];
        btns.forEach((b) => { b.disabled = true; });
        try {
          const row = await Store.addMistake({
            subject,
            title: title || (content ? content.slice(0, 18) : '拍摄错题'),
            content,
            source: $('#f-source').value,
            status: $('#f-status').value
          }, currentFile);

          $('#f-title').value = '';
          $('#f-content').value = '';
          clearPhoto();
          err.textContent = '';

          if (andReview) {
            Store.selectIds([row.id]);
            Router.go('/review');
          } else {
            UI.toast('已保存 · 共 ' + Store.S.mistakes.length + ' 道错题');
          }
        } catch (e) {
          err.textContent = '保存失败：' + (e.message || '未知错误');
        } finally {
          btns.forEach((b) => { b.disabled = false; });
        }
      }

      $('#save-only').onclick = () => save(false);
      $('#save-review').onclick = () => save(true);

      /* 持久容器用赋值绑定，避免多次 mount 后监听器累积 */
      root.onkeydown = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(false); }
      };

      /* 桌面端进来直接可以打字；手机端不抢焦点（会弹键盘，像是逼人录字） */
      if (!Router.isNarrow()) setTimeout(() => $('#f-content').focus(), 60);
    },

    onData() { /* 录入页有输入状态，不因数据变化重绘 */ }
  };
})();
