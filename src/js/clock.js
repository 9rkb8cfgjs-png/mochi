// ===== 功能：状态栏显示真实时间 =====
(function () {
  const el = document.getElementById('clock');
  if (!el) return;
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  function update() {
    const d = new Date();
    el.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  update();
  setInterval(update, 15000); // 每 15 秒校准一次
})();

// ===== 开屏加载动画：页面就绪后淡出并移除 =====
(function () {
  const splash = document.getElementById('splash');
  if (!splash) return;
  // v3.5.96：开屏显示「部署版本（构建时注入）+ 实时时间」——手机端可随时验证是否最新部署
  const verEl = document.getElementById('splash-ver');
  let _verIv = null;
  if (verEl) {
    const base = (verEl.textContent || '').trim();
    const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
    const fill = () => {
      const d = new Date();
      const t = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
      verEl.textContent = (base ? base + ' · ' : '') + t;
    };
    fill();
    _verIv = setInterval(fill, 1000);
  }
  // v3.5.111：开屏含公告 → 点击进入才进页面（点任意处或「点击进入」按钮均可）
  // v3.5.122：开屏等待数据（IndexedDB 回填）就绪后才显示「点击进入」——
  //   就绪前只显示「正在加载数据…」，不提供"跳过加载"入口（跳过后桌面数据
  //   未加载完，正是最初"没加载完就进入"的 bug）。idbRestore 已改为分批恢复
  //   + 12 秒整体保险（idb.js），正常几秒完成；这里 20 秒保险丝兜底任何意外，
  //   确保开屏永不卡死、进入时数据已完整。
  const hide = () => {
    // v3.5.129：开屏隐藏时才停止版本时间刷新（数据恢复慢时版本时间不再提前冻结）
    if (_verIv) { clearInterval(_verIv); _verIv = null; }
    if (splash.classList.contains('hide')) return;
    splash.classList.add('hide');
    setTimeout(() => { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 400);
  };
  const ready = () => !!(window.__mochiDataReady);
  const enterEl = document.getElementById('splash-enter');
  const loadingEl = document.getElementById('splash-loading');
  function updateEnterState() {
    const ok = ready();
    if (enterEl) enterEl.hidden = !ok;
    if (loadingEl) loadingEl.hidden = ok;
  }
  const enter = () => {
    if (splash.classList.contains('hide')) return;
    if (!ready()) return; // 数据未就绪：禁止进入
    hide();
  };
  updateEnterState();
  if (enterEl) enterEl.addEventListener('click', (e) => { e.stopPropagation(); enter(); });
  splash.addEventListener('click', enter);
  // 数据回填完成 → 显示按钮（事件 + 轮询双保险：空数据场景只置标志不派发事件）
  document.addEventListener('mochi-restore-done', updateEnterState);
  const readyPoll = setInterval(() => {
    if (ready()) { clearInterval(readyPoll); updateEnterState(); }
  }, 300);
  // 20 秒保险丝：极端异常下自动进入（idbRestore 自身 12 秒必置就绪，正常不触发）
  setTimeout(hide, 20000);
})();
