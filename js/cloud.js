/* ========== 云端封装：Auth / Database / LLM（SDK 不可用时降级为本地模式） ========== */
(function () {
  const cfg = window.PUBLIC_CONFIG || {};
  let cloud = null;
  try {
    if (window.WorkBuddyCloud && typeof window.WorkBuddyCloud.createWorkBuddyCloud === 'function') {
      cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint: cfg.endpoint,
        oauthRelayBaseUrl: cfg.oauthRelayBaseUrl,
        publishableKey: cfg.publishableKey
      });
    } else {
      console.warn('[云端] SDK 未加载，降级为本地模式');
    }
  } catch (e) {
    console.warn('[云端] 初始化失败，降级为本地模式', e);
  }
  window.cloud = cloud;
  const ERR = { data: null, error: { message: '云端未连接（SDK 未加载或网络受限），本地功能不受影响' } };

  /* ---------- Auth ---------- */
  const auth = {
    getSession: () => cloud ? cloud.auth.getSession() : Promise.resolve({ data: null }),
    signOut: () => cloud ? cloud.auth.signOut() : Promise.resolve({ error: null }),

    sendPhoneCode: (phone) => cloud ? cloud.auth.sendOtp({ phone }) : Promise.resolve(ERR),
    verifyPhoneCode: (pending, token) => cloud
      ? cloud.auth.verifyOtp({
          phone: pending.phone,
          verificationId: pending.verificationId,
          isExistingUser: pending.isExistingUser,
          token
        })
      : Promise.resolve(ERR),

    signInWithWechat: () => {
      if (!cloud) return Promise.reject(new Error('云端未连接，暂时无法微信登录'));
      return cloud.auth.signInWithOAuth({ provider: 'wechat', redirectTo: location.origin })
        .then(({ data, error }) => {
          if (error) throw error;
          location.assign(data.url);
        });
    },

    restoreAuth: async function () {
      if (!cloud) return { session: null };
      const url = new URL(location.href);
      if (!url.searchParams.has('code') && !url.searchParams.has('error')) {
        const r = await cloud.auth.getSession();
        return { session: (r && r.data) || null };
      }
      const provider = url.searchParams.get('provider');
      if (provider !== 'workbuddy' && provider !== 'wechat') {
        return { session: null, callbackError: '授权回调缺少有效的登录方式，请重新登录。' };
      }
      const handler = provider === 'workbuddy'
        ? cloud.auth.handleWorkBuddyCallback
        : cloud.auth.handleWechatWebCallback;
      if (typeof handler !== 'function') {
        return { session: null, callbackError: '暂时无法使用此方式登录。' };
      }
      const { data: session, error } = await handler.call(cloud.auth);
      if (error) return { session: null, callbackError: error.message };
      if (session) {
        for (const key of ['code', 'state', 'provider']) url.searchParams.delete(key);
        history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      }
      return { session: session || null };
    }
  };

  /* ---------- Database ---------- */
  const db = {
    listMistakes: () => cloud
      ? cloud.database.from('mistakes').select('*').order('created_at', { ascending: false })
      : Promise.resolve(ERR),
    createMistake: (row) => cloud
      ? cloud.database.from('mistakes').insert(row).select() : Promise.resolve(ERR),
    updateMistake: (id, patch) => cloud
      ? cloud.database.from('mistakes').update(patch).eq('id', id).select() : Promise.resolve(ERR),
    deleteMistake: (id) => cloud
      ? cloud.database.from('mistakes').delete().eq('id', id).select() : Promise.resolve(ERR),
    savePaper: (row) => cloud
      ? cloud.database.from('papers').insert(row).select() : Promise.resolve(ERR),
    updatePaper: (id, patch) => cloud
      ? cloud.database.from('papers').update(patch).eq('id', id).select() : Promise.resolve(ERR),
    deletePaper: (id) => cloud
      ? cloud.database.from('papers').delete().eq('id', id).select() : Promise.resolve(ERR),
    listPapers: () => cloud
      ? cloud.database.from('papers').select('*').order('created_at', { ascending: false })
      : Promise.resolve(ERR)
  };

  /* ---------- LLM ---------- */
  let cachedModel = null;
  const FAST_MODELS = ['deepseek-v4-flash', 'deepseek-v4.1-flash', 'minimax-m3.1-flash', 'hunyuan-chat'];

  /* ---------- 图片识题（OCR）---------- */
  /* 实测（2026-10-23，模拟手机拍摄的试卷照片）：hy3 2.8s 印刷体4题全对、2.9s 手写3题全对且正确排除解答与红笔批改，标价 0 积分 */
  const OCR_MODELS = ['hy3', 'glm-5.3-flash'];
  const OCR_TIMEOUT = 45000;
  const OCR_PROMPT = [
    '请从这张照片中提取所有题目。',
    '只提取题目本身：不要提取学生的解答过程、不要提取老师的红笔批改和批注、不要自己解题。',
    '严格只输出 JSON：{"subject":"科目","items":[{"no":"题号","text":"题干原文"}]}',
    '科目只能从 数学、物理、英语、化学、其他 里选一个。',
    '数学符号原样保留：平方写 ²、角写 ∠、度写 °、不等号写 ≥ ≤，分数写成 3/4 形式。',
    '看不清的字用 □ 代替，绝对不要猜测或补全照片里没有的内容。'
  ].join('\n');

  function shrink(file, maxEdge, quality) {
    return new Promise((resolve, reject) => {
      const MAX = maxEdge || 1400, Q = quality || 0.72;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight;
        const scale = Math.min(1, MAX / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        cv.toBlob((b) => (b ? resolve(b) : reject(new Error('图片处理失败'))), 'image/jpeg', Q);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法读取')); };
      img.src = url;
    });
  }

  function toDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('图片读取失败'));
      fr.readAsDataURL(blob);
    });
  }

  /* 剥掉 ```json 包裹并解析；模型偶尔会带解释文字，取最外层 {...} */
  function parseOcrJSON(raw) {
    let t = String(raw || '').trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    const o = JSON.parse(t);
    const items = (o.items || []).map((it) => ({
      no: String(it.no == null ? '' : it.no).trim(),
      text: String(it.text == null ? '' : it.text).trim()
    })).filter((it) => it.text.length > 1);
    const subject = ['数学', '物理', '英语', '化学', '其他'].indexOf(o.subject) >= 0 ? o.subject : '其他';
    return { subject, items };
  }

  /* 单次视觉调用，带超时 */
  async function askVision(modelId, dataUrl) {
    const stream = await cloud.llm.chat.completions.create({
      model: modelId,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: OCR_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }],
      stream: true,
      temperature: 0.1
    });
    const it = stream[Symbol.asyncIterator]();
    let text = '', timedOut = false, guard = 0;
    const timer = setTimeout(() => {
      timedOut = true;
      try { it.return && it.return(); } catch (e) {}
    }, OCR_TIMEOUT);
    try {
      while (!timedOut && guard++ < 8000) {
        const step = await it.next();
        if (step.done) break;
        const c = step.value.choices && step.value.choices[0] && step.value.choices[0].delta;
        if (c && c.content) text += c.content;
      }
    } finally {
      clearTimeout(timer);
    }
    if (timedOut) {
      const err = new Error('识别超时');
      err.code = 'timeout';
      throw err;
    }
    return text;
  }

  const llm = {
    /* 识别一张照片里的题目：主模型失败自动切备用；照片压缩到 1400/0.72 再上传 */
    ocrPhoto: async function (file, onStep) {
      if (!cloud) {
        const err = new Error('当前无法联网识别，请手动录入题干');
        err.code = 'offline';
        throw err;
      }
      const blob = await shrink(file, 1400, 0.72);
      const dataUrl = await toDataURL(blob);
      let lastErr = null;
      for (let i = 0; i < OCR_MODELS.length; i++) {
        if (onStep) onStep({ model: OCR_MODELS[i], attempt: i + 1, bytes: blob.size });
        try {
          const text = await askVision(OCR_MODELS[i], dataUrl);
          const r = parseOcrJSON(text);
          if (!r.items.length) {
            const err = new Error('没在照片里找到题目');
            err.code = 'no_items';
            throw err;
          }
          return { subject: r.subject, items: r.items, model: OCR_MODELS[i], bytes: blob.size };
        } catch (e) {
          lastErr = e;
        }
      }
      const err = new Error((lastErr && lastErr.message) || '识别失败');
      err.code = 'ocr_failed';
      throw err;
    },

    getModel: async function () {
      if (cachedModel) return cachedModel;
      if (!cloud) return null;
      const models = await cloud.llm.models.list();
      const usable = (models || []).filter((m) => m.disabled !== true);
      cachedModel = FAST_MODELS.map((id) => usable.find((m) => m.id === id)).find(Boolean)
        || usable[0] || null;
      return cachedModel;
    },

    analyzeMistakes: async function (items, onProgress) {
      const model = await llm.getModel();
      if (!model) {
        const err = new Error('云端没有可用的大模型，暂时无法 AI 解析');
        err.code = 'no_model';
        throw err;
      }
      const list = items.map((it, i) =>
        `【第${i + 1}题】科目：${it.subject}\n题目：${it.content || it.title}`
      ).join('\n\n');

      const system = [
        '你是一位耐心严谨的中学理科助教，服务对象是学生与家长。',
        '严格按用户要求的 JSON 结构输出，不要输出多余文字。',
        '解析分步书写，每步标注易错点；相似题必须换数字/换情境，保持同一知识点与相近难度。',
        '涉及图片无法查看时，只依据文字部分作答，不要编造题目内容。'
      ].join('');

      const user = [
        '请对下面这些错题逐题完成四件事：分步解析、给出答案、归纳知识点、生成 2 道相似题。',
        '只输出 JSON，格式：',
        '{"results":[{"index":1,"analysis":"分步解析，用①②③分步","answer":"最终答案","knowledge":["知识点1","知识点2"],"similar":[{"question":"相似题1题干","answer":"相似题1答案"},{"question":"相似题2题干","answer":"相似题2答案"}]}]}',
        '',
        list
      ].join('\n');

      let answer = '';
      const stream = cloud.llm.chat.completions.create({
        model: model.id,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        stream: true,
        temperature: 0.4,
        response_format: { type: 'json_object' }
      });
      /* 手动消费 asyncIterator（比 for await 更稳，已验证两种环境） */
      const iterator = stream[Symbol.asyncIterator]();
      const budget = Math.max(150000, items.length * 90000);
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try { iterator.return && iterator.return(); } catch (e) {}
      }, budget);

      try {
        while (!timedOut) {
          const step = await iterator.next();
          if (step.done) break;
          const chunk = step.value;
          const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
          if (delta && delta.content) {
            answer += delta.content;
            if (onProgress) onProgress(answer);
          }
        }
      } finally {
        clearTimeout(timer);
      }
      if (timedOut) {
        const err = new Error('AI 解析超时（' + Math.round(budget / 1000) + ' 秒）');
        err.code = 'timeout';
        throw err;
      }
      let parsed;
      try {
        parsed = JSON.parse(answer);
      } catch (e) {
        const err = new Error('AI 返回的内容无法解析，请重试');
        err.code = 'parse_failed';
        throw err;
      }
      if (!parsed || !Array.isArray(parsed.results)) {
        const err = new Error('AI 返回结构不符合预期，请重试');
        err.code = 'bad_shape';
        throw err;
      }
      return parsed.results;
    }
  };

  window.Cuoti = { cloud, auth, db, llm };
})();
