// ===== 功能：通用设置（聊天触发概率） =====
// 存储 + 设置页 stepper/开关交互；暴露 window.replyCfg 给聊天回复逻辑使用
(function () {
  const uid = 'xy-home-v2';
  const ls = window.xyStore(uid);

  // 全部概率/参数项（与星言 speedSettings 对应）
  const DEFAULTS = {
    'rs-min': 1, 'rs-max': 40,
    'reply-min': 1, 'reply-max': 2,
    'rn-prob': 20, 'touch-prob': 5,
    'sticker-prob': 10, 'emoji-prob': 5, 'image-prob': 5, 'voice-prob': 10,
    'kaomoji-prob': 5, 'quote-prob': 30,
    'rc-prob': 25, 'rc-refix': 35, 'cf-prob': 20,
    'py-en': 1, 'py-prob': 50, 'py-min': 2, 'py-max': 5,
    // v3.6.x：主动发送默认概率 10% 太低（每 5~10 分钟才掷一次），
    // 默认设置下第一条主动消息平均要约 75 分钟才来，用户会以为 TA 从不主动发消息；
    // 提到 30%（与信箱写信概率默认一致），平均约 25 分钟一条
    'as-en': 1, 'as-prob': 30, 'as-min': 5, 'as-max': 10,
    'as-count-min': 1, 'as-count-max': 2, 'dnd-en': 0,
    // 信箱（星言信箱设置）
    // v3.5.99：最长写信/回信时间默认 480 分钟（8 小时）太久，容易让用户误以为 TA 不写信，改为 120 分钟
    // v3.6.x：默认最多字卡条数 100 → 50（信太长反而像刷屏）；新增最少字卡条数默认 20
    'ml-min-cards': 20, 'ml-max-cards': 50,
    'ml-write-prob': 30, 'ml-write-min': 1, 'ml-write-max': 120,
    // v3.6.x：每天最多来信（封）——限制联系人主动写信频率，默认 3 封/天
    'ml-write-daily-max': 3,
    'ml-reply-prob': 80, 'ml-reply-min': 1, 'ml-reply-max': 120,
    'ml-kaomoji-en': 1, 'ml-emoji-en': 1, 'ml-sticker-en': 1,
    // 动态（星言朋友圈设置）
    'fd-like-prob': 60, 'fd-like-speed-min': 1, 'fd-like-speed-max': 60,
    'fd-comment-prob': 70, 'fd-comment-speed-min': 1, 'fd-comment-speed-max': 60,
    'fd-reply-prob': 60, 'fd-reply-speed-min': 1, 'fd-reply-speed-max': 60,
    'fd-likeback-prob': 50,
    'fd-card-prob': 80, 'fd-max-cards': 5, 'fd-image-prob': 50,
    'fd-post-prob': 40, 'fd-post-daily-max': 5, 'fd-post-cool': 30,
    'fd-min-interval': 1, 'fd-max-interval': 720,
    'fd-min-cards-post': 4, 'fd-max-cards-post': 15,
    'fd-post-kaomoji': 10, 'fd-post-emoji': 10, 'fd-post-sticker': 30, 'fd-post-image': 30,
    // 通话（星言通话设置）
    // v3.6.x：对方挂断默认 0.01% 实际几乎永不触发（每 30 秒检查一次），
    // 用户反馈"联系人从不挂断"——提到 5%，通话中约每 30 秒掷一次，几分钟后大概率会遇到
    // v3.6.x：来电默认 8% → 15%——原来只靠独立定时器每 60 秒掷一次、首次检查还延迟 2-5 分钟，
    // 默认设置下用户会以为 TA 从不来电；已改为「TA 回复/主动发消息后按概率来电」+ 定时器兜底
    'call-incoming': 15, 'call-pickup': 70, 'call-busy': 15, 'call-reject': 15, 'call-hangup': 5
  };

  function getCfg() {
    const out = {};
    Object.keys(DEFAULTS).forEach(k => {
      const v = ls.get('reply-' + k);
      // v3.6.x：对异常/损坏的存储值兜底——某些操作可能把 NaN 或非数字写进本地
      //（如摩托罗拉 Edge 上信箱「最短写信时间」显示 NaN 且 ± 按钮失效），
      // Number() 后 isNaN 一律回退默认值，并顺手修复坏数据，避免 NaN 传染
      let n = (v === null || v === undefined || v === '') ? DEFAULTS[k] : Number(v);
      if (isNaN(n)) {
        n = DEFAULTS[k];
        try { ls.set('reply-' + k, String(n)); } catch (e) {}
      }
      out[k] = n;
    });
    return out;
  }
  window.replyCfg = getCfg;
  window.saveReplyCfg = function (k, v) { ls.set('reply-' + k, String(v)); };

  // ---- 设置页 UI ----
  function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  function syncUI() {
    const cfg = getCfg();
    // stepper 数值
    document.querySelectorAll('.stepper').forEach(st => {
      const k = st.dataset.k;
      const val = st.querySelector('.stp-val');
      if (val) {
        const step = parseFloat(st.dataset.step) || 1;
        const v = cfg[k] !== undefined ? cfg[k] : DEFAULTS[k];
        val.value = step < 1 ? Number(v).toFixed(2) : v;
      }
    });
    // 开关
    ['py-en', 'as-en', 'dnd-en', 'ml-kaomoji-en', 'ml-emoji-en', 'ml-sticker-en'].forEach(k => {
      const el = document.getElementById(k);
      if (el) el.checked = cfg[k] === 1;
    });
  }

  // stepper 交互
  document.querySelectorAll('.stepper').forEach(st => {
    const k = st.dataset.k;
    // v3.6.x：data-min/max 缺失时兜底默认值，避免 NaN 写进存储（± 按钮失效、显示 NaN）
    const intAttr = (name, def) => { const v = parseInt(st.getAttribute(name), 10); return Number.isNaN(v) ? def : v; };
    const min = intAttr('data-min', 0);
    const max = intAttr('data-max', 100);
    const step = parseFloat(st.dataset.step) || 1;
    const val = st.querySelector('.stp-val');
    const fmt = (v) => step < 1 ? v.toFixed(2) : v;
    st.querySelector('.stp-min').addEventListener('click', () => {
      const cur = parseFloat(val.value);
      const nv = Math.max(min, cur - step);
      val.value = fmt(nv); window.saveReplyCfg(k, val.value);
    });
    st.querySelector('.stp-max').addEventListener('click', () => {
      const cur = parseFloat(val.value);
      const nv = Math.min(max, cur + step);
      val.value = fmt(nv); window.saveReplyCfg(k, val.value);
    });
  });
  // v3.6.x：数值可直接点击输入——点击 stepper 数值框临时允许手动输入数字，
  // 失焦后校验范围 + 按步长取整 + 保存（± 按钮仍可用）。
  // stp-val 平时保持 readonly（mobile-adapt 转换器跳过 readonly，不被 contenteditable 接管），
  // 点击时才解除只读进入编辑，避免手机上弹出「自动填充条」。
  document.querySelectorAll('.stepper .stp-val').forEach(val => {
    const st = val.closest('.stepper');
    if (!st) return;
    const k = st.dataset.k;
    if (!k) return;
    // v3.6.x：OPPO Edge 等安卓浏览器「无法直接输入概率」修复——
    // stp-val 平时 readonly（防自动填充条，mobile-adapt 转换器据此跳过它），
    // 但点击进入编辑后 readOnly 被解除，若期间触发全量转换（body 子节点变化，
    // 如首次创建 cc-toast 提示节点），它会被 contenteditable 化（ce-box），
    // 而这些浏览器对 ce-box 聚焦/输入失效（与雨见浏览器搜索框同源问题）→
    // 直接输入失效。预标记 ceDone 永久跳过转换，保持原生 input。
    val.dataset.ceDone = '1';
    const intAttr = (name, def) => { const v = parseInt(st.getAttribute(name), 10); return Number.isNaN(v) ? def : v; };
    const min = intAttr('data-min', 0);
    const max = intAttr('data-max', 100);
    const step = parseFloat(st.dataset.step) || 1;
    const fmt = (v) => step < 1 ? Number(v).toFixed(2) : String(Math.round(Number(v)));
    val.setAttribute('inputmode', 'decimal'); // 手机上弹数字键盘
    const startEdit = () => {
      val.readOnly = false;
      try { val.focus(); val.select(); } catch (e) {}
    };
    // v3.6.x：pointerdown 提前解除只读——部分安卓浏览器（OPPO Edge 等）在手势
    // 开始时输入框是 readonly 就判定「只读字段不弹键盘」，随后 JS 再解除只读 +
    // focus() 也唤不出软键盘（表现为点数值框没反应/无法输入）。pointerdown 先于
    // 浏览器默认聚焦执行，键盘可正常弹出；click 仍负责聚焦全选。
    val.addEventListener('pointerdown', function () { if (val.readOnly) val.readOnly = false; }, { passive: true });
    const commit = () => {
      let v = parseFloat(val.value);
      if (isNaN(v)) v = min;
      v = Math.min(max, Math.max(min, v));
      if (step < 1) v = Math.round(v / step) * step;
      else v = Math.round(v);
      val.value = fmt(v);
      window.saveReplyCfg(k, val.value);
      val.readOnly = true;
    };
    val.addEventListener('click', startEdit);
    val.addEventListener('change', commit);
    val.addEventListener('blur', commit);
  });
  // 开关交互
  ['py-en', 'as-en', 'dnd-en', 'ml-kaomoji-en', 'ml-emoji-en', 'ml-sticker-en'].forEach(k => {
    const el = document.getElementById(k);
    if (el) {
      el.addEventListener('change', () => window.saveReplyCfg(k, el.checked ? 1 : 0));
    }
  });
  // v3.5.101：关闭「主动发送」时明确提示（否则 TA 永不主动发消息且无任何提醒）
  const asEnEl = document.getElementById('as-en');
  if (asEnEl) {
    asEnEl.addEventListener('change', () => {
      if (!asEnEl.checked) {
        const d = document.getElementById('cc-toast');
        if (d) { d.textContent = '主动发送已关闭，TA 将不再主动发消息'; d.className = 'cc-toast'; void d.offsetWidth; d.className = 'cc-toast show'; clearTimeout(d._timer); d._timer = setTimeout(() => { d.className = 'cc-toast'; }, 2600); }
      }
    });
  }
  // v3.5.101：开启「免打扰」时提示（弱化主动发送，间隔最长可达 3 小时）
  const dndEl = document.getElementById('dnd-en');
  if (dndEl) {
    dndEl.addEventListener('change', () => {
      if (dndEl.checked) {
        const d = document.getElementById('cc-toast');
        if (d) { d.textContent = '免打扰已开启，TA 主动发送会大幅减弱（最长 3 小时一次）'; d.className = 'cc-toast'; void d.offsetWidth; d.className = 'cc-toast show'; clearTimeout(d._timer); d._timer = setTimeout(() => { d.className = 'cc-toast'; }, 3200); }
      }
    });
  }
  // v3.6.x：「保存设置」按钮——把当前页面上所有概率/开关一次性写入本地并提示。
  // 数值本身已随点击即时保存，这里提供明确的「保存」反馈（用户反馈刷新后设置会丢）
  const saveBtn = document.getElementById('reply-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      try {
        document.querySelectorAll('.stepper').forEach(st => {
          const k = st.dataset.k;
          const val = st.querySelector('.stp-val');
          if (k && val) window.saveReplyCfg(k, parseFloat(val.value) || 0);
        });
        ['py-en', 'as-en', 'dnd-en', 'ml-kaomoji-en', 'ml-emoji-en', 'ml-sticker-en'].forEach(k => {
          const el = document.getElementById(k);
          if (el) window.saveReplyCfg(k, el.checked ? 1 : 0);
        });
      } catch (e) {}
      const d = document.getElementById('cc-toast');
      if (d) { d.textContent = '已保存全部回复设置'; d.className = 'cc-toast'; void d.offsetWidth; d.className = 'cc-toast show'; clearTimeout(d._timer); d._timer = setTimeout(() => { d.className = 'cc-toast'; }, 2000); }
    });
  }
  // v3.6.x：IndexedDB 恢复完成后再同步一次设置页数值——
  // 刷新后立即打开设置页时，IDB 里的旧设置可能还没回填完，页面会显示默认值；
  // 恢复完成后重新 syncUI，保证保存过的设置不「消失」
  try {
    document.addEventListener('mochi-restore-done', () => {
      const page = document.getElementById('page-reply-settings');
      if (page && !page.hidden) syncUI();
    });
  } catch (e) {}

  syncUI();

  // 导航：设置页「回复设置」→ 回复设置页（聊天 tab 默认）
  const genRow = document.getElementById('row-general');
  if (genRow) {
    genRow.addEventListener('click', () => {
      syncUI();
      showPage('page-reply-settings');
    });
  }
  // 单页内三分类 tab 切换
  const rpTab = (k) => {
    document.querySelectorAll('#page-reply-settings .fav-tab').forEach(x => x.classList.toggle('sel', x.dataset.rp === k));
    document.querySelectorAll('#page-reply-settings .gs-panel').forEach(p => { p.hidden = p.dataset.rpanel !== k; });
  };
  document.querySelectorAll('#page-reply-settings .fav-tab').forEach(tab => {
    tab.addEventListener('click', () => rpTab(tab.dataset.rp));
  });
  // 返回：设置页
  const replyBack = document.getElementById('reply-back');
  if (replyBack) {
    replyBack.addEventListener('click', () => {
      showPage('page-setting');
    });
  }
  // 通话设置返回
  const calsBack = document.getElementById('cals-back');
  if (calsBack) {
    calsBack.addEventListener('click', () => {
      showPage('page-setting');
    });
  }
})();
