// ===== 功能：全屏模式（v3.5.93） =====
// 安卓 Chrome PWA standalone 会保留系统状态栏（顶部时间/电量）——manifest 无法隐藏。
// 提供设置页「全屏模式」开关：开启后用 Fullscreen API 真正全屏（隐藏系统状态栏）。
// v3.6.x：iOS 无 Fullscreen API（Safari 仅视频支持），系统状态栏永远无法隐藏：
//   · 从主屏幕打开（standalone）：开关改为隐藏应用内模拟状态栏（唯一还能藏的一栏），
//     内容顶到系统状态栏下方、屏幕利用更满；状态持久化、切后台回来自动恢复。
//   · 浏览器内打开：开关不可用，弹说明引导「添加到主屏幕」（iOS 唯一真全屏途径）。
// v3.6.x：Via 等安卓浏览器网页全屏默认转横屏（视频式全屏），与本应用竖屏设计冲突。
//   进入全屏后用 Screen Orientation API 锁竖屏（Chrome 在全屏态允许）；
//   锁定失败且视口已横屏 → 退出原生全屏，走 CSS 兜底（fs-css-active）保持竖屏，
//   并提示浏览器限制（浏览器自带「竖屏锁定」/ 添加到主屏幕）。
(function () {
  const uid = 'xy-home-v2';
  const store = {
    get(k){ try { return localStorage.getItem(uid + ':' + k); } catch(e){ return null; } },
    set(k, v){ try { localStorage.setItem(uid + ':' + k, v); } catch(e){} }
  };
  const FS_KEY = 'fullscreen-enabled';
  // v3.6.x：iOS 检测（与 mobile-adapt.js 同一判断）+ 主屏幕打开检测
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const inIosStandalone = isIOS && (
    window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  );

  function fsSupported() {
    // v3.6.x：webkit 前缀也判为支持（老版安卓 WebView/Chromium 只有 webkitRequestFullscreen）
    return typeof document.documentElement.requestFullscreen === 'function'
        || typeof document.documentElement.webkitRequestFullscreen === 'function';
  }
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  // v3.6.x：开关的「视觉激活」判定——原生全屏 / CSS 兜底全屏 / iOS 兜底 /
  // display-mode 全屏（display_override fullscreen 直启）任一成立即视为开启。
  // 修复：Via 等浏览器走 CSS 兜底后开关被 fullscreenchange 误关（syncToggle 只看
  // isFullscreen()，兜底时已退出原生全屏 → 开关显示关闭但兜底实际生效，状态对不上）
  function fsVisualActive() {
    const d = document.documentElement;
    return isFullscreen()
      || d.classList.contains('fs-css-active')
      || d.classList.contains('ios-fs-active')
      || !!(window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches);
  }
  // v3.6.x：Via 等浏览器网页全屏默认转横屏（视频式全屏），与本应用竖屏设计冲突。
  // 进入全屏后用 Screen Orientation API 锁竖屏；锁定失败且视口已横屏 → 退出原生
  // 全屏，改走 CSS 兜底（fs-css-active 类，保持竖屏），不再请求原生全屏。
  const FB_KEY = 'fullscreen-fallback';
  function lockFsOrient() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        const p = screen.orientation.lock('portrait');
        if (p && p.then) {
          p.then(() => {}, () => setTimeout(checkFsLandscape, 500));
          return true;
        }
        return true;
      }
    } catch (e) {}
    return false;
  }
  function unlockFsOrient() {
    try {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch (e) {}
  }
  // v3.6.x：CSS 兜底全屏——进入/恢复时同步复选框（syncBox 默认 true）；
  //   仅在「重试原生全屏前清理旧兜底」场景传 false（此时开关仍保持用户勾选态）
  function applyFsCss(on, syncBox) {
    document.documentElement.classList.toggle('fs-css-active', on);
    store.set(FB_KEY, on ? '1' : '0');
    if (syncBox === false) return;
    const el = document.getElementById('sf-fullscreen');
    if (el) el.checked = on;
  }
  let _fsTipShown = false;
  function showFsFallbackTip() {
    if (_fsTipShown) return;
    _fsTipShown = true;
    const msg = '当前浏览器的网页全屏会自动转成横屏，与本应用的竖屏设计冲突，已自动退出并保持竖屏。\n\n想真全屏（隐藏浏览器栏）请：\n· 浏览器工具栏开启「竖屏锁定」后再开全屏；\n· 或「添加到主屏幕」从桌面图标打开（竖屏全屏）。';
    if (window.openModal) {
      window.openModal('竖屏全屏提示', '', () => {}, { noInput: true, staticText: msg });
    } else {
      try { new Notification('竖屏全屏提示', { body: msg }); } catch (e) {}
    }
  }
  let _fsFailTipShown = false;
  function showFsFailTip() {
    if (_fsFailTipShown) return;
    _fsFailTipShown = true;
    const msg = '当前浏览器未允许进入全屏，已自动关闭该开关。\n\n可重试一次；或使用 Chrome/Edge 并允许全屏权限，或添加到主屏幕后从桌面图标打开。';
    if (window.openModal) {
      window.openModal('无法进入全屏', '', () => {}, { noInput: true, staticText: msg });
    } else {
      try { new Notification('无法进入全屏', { body: msg }); } catch (e) {}
    }
  }
  // 全屏态复核：锁竖屏失败且视口被浏览器强制成横屏 → 退出恢复竖屏 + CSS 兜底
  function checkFsLandscape() {
    if (!isFullscreen()) return;
    if (window.innerWidth <= window.innerHeight) return; // 已保持竖屏
    exitFs();
    applyFsCss(true);
    showFsFallbackTip();
  }
  function enterFs() {
    try {
      const el = document.documentElement;
      let p;
      if (el.requestFullscreen) p = el.requestFullscreen();
      else if (el.webkitRequestFullscreen) p = el.webkitRequestFullscreen();
      // 进入后锁竖屏（需全屏态 + 用户手势，此时均满足）；
      // 无论锁屏 API 是否报成功，稍后都复核一次视口方向，仍横屏则回退
      const tryLock = () => {
        lockFsOrient();
        setTimeout(checkFsLandscape, 600);
      };
      if (p && p.then) { p.then(tryLock, tryLock); return p; }
      setTimeout(tryLock, 300);
    } catch (e) {}
    return null;
  }
  function exitFs() {
    try {
      unlockFsOrient();
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {}
  }
  // 启动时若用户开过全屏且处于 PWA 环境，尝试恢复（需用户手势才能生效时静默跳过）
  // v3.5.113：userIntent=true 时是用户主动切换（写入存储）；
  //   系统级退出（切后台/手势 Esc）只同步 UI 显示，不覆盖用户「开全屏」的持久化意图
  let _sysToggle = false;
  function syncToggle(userIntent) {
    const el = document.getElementById('sf-fullscreen');
    if (el) { if (!userIntent) _sysToggle = true; el.checked = fsVisualActive(); }
    if (!userIntent) setTimeout(() => { _sysToggle = false; }, 0);
  }
  // v3.5.109：Chrome 安卓全屏模式下输入框聚焦会错误弹出浏览器「密码/安全提示」条（位置错乱）。
  // 全屏激活时统一给输入框禁用自动填充/自动校正/自动大写，退出全屏后恢复原属性。
  function applyFsInputHacks() {
    const fs = isFullscreen();
    document.querySelectorAll('input, textarea').forEach(inp => {
      if (inp.type === 'checkbox' || inp.type === 'range' || inp.type === 'file' || inp.type === 'color') return;
      if (fs) {
        if (!inp.dataset.fsAuto) {
          // v3.5.126：全屏时统一 autocomplete="off"（不删属性——之前 removeAttribute
          // 让输入框变裸文本框被 Chrome 识别成可自动填充字段，弹「管理密码」条）。
          // 与 mobile-adapt.js 聚焦策略一致：off 保留，只清 password 语义值。
          // v3.5.123：进入时把 autocorrect/autocapitalize/spellcheck 的模板原值存进 dataset，
          // 退出时还原（不能直接删除——会销毁模板静态声明的防自动填充属性）
          inp.dataset.fsAuto = '1';
          inp.dataset.fsTplAc = inp.getAttribute('autocomplete') || '';
          const ac = inp.getAttribute('autocomplete');
          if (ac === 'new-password' || ac === 'current-password') inp.removeAttribute('autocomplete');
          inp.setAttribute('autocomplete', 'off');
          inp.dataset.fsOrigCorr = inp.getAttribute('autocorrect') || '';
          inp.dataset.fsOrigCap = inp.getAttribute('autocapitalize') || '';
          inp.dataset.fsOrigSpell = inp.getAttribute('spellcheck') || '';
          inp.setAttribute('autocorrect', 'off');
          inp.setAttribute('autocapitalize', 'off');
          inp.setAttribute('spellcheck', 'false');
        }
      } else if (inp.dataset.fsAuto !== undefined) {
        // v3.5.126：退出时还原模板 autocomplete（模板声明 off 则还原 off）
        const tplAc = inp.dataset.fsTplAc;
        if (tplAc) inp.setAttribute('autocomplete', tplAc); else inp.removeAttribute('autocomplete');
        delete inp.dataset.fsTplAc;
        // 还原模板原值（空值 = 删除属性）
        const restore = (key, origKey) => {
          const orig = inp.dataset[origKey] || '';
          if (orig) inp.setAttribute(key, orig); else inp.removeAttribute(key);
          delete inp.dataset[origKey];
        };
        restore('autocorrect', 'fsOrigCorr');
        restore('autocapitalize', 'fsOrigCap');
        restore('spellcheck', 'fsOrigSpell');
        delete inp.dataset.fsAuto;
      }
    });
  }
  // v3.6.x：iOS 全屏说明弹窗——用应用内 openModal（原 Notification 在无权限时直接
  // 抛异常且不检查，用户点了开关毫无反馈，看起来像「不能用」）
  function showIosGuide() {
    const msg = inIosStandalone
      ? 'iOS 的系统状态栏（时间/电量）由系统控制，任何网页都无法隐藏，这是所有 iPhone 应用的共同限制。\n\n应用内的模拟状态栏已自动隐藏，内容直接顶到系统状态栏下方，屏幕利用更满，无需额外设置。'
      : 'iOS Safari 不支持网页隐藏系统状态栏（Fullscreen API 仅对视频生效）。\n\n真正全屏的方法：点底部「分享」→「添加到主屏幕」，再从主屏幕图标打开 Mochi，即可全屏（无浏览器栏）。';
    if (window.openModal) {
      window.openModal('iOS 全屏说明', '', () => {}, { noInput: true, staticText: msg });
    } else {
      try { new Notification('iOS 全屏说明', { body: msg }); } catch (e) {}
    }
  }
  // v3.6.x：iOS standalone「全屏模式」= 隐藏应用内模拟状态栏（系统状态栏不可隐藏，
  // 交给 base.css 的 .ios-fs-active 规则处理安全区）；与 Fullscreen API 互斥
  function applyIosFs(on) {
    document.documentElement.classList.toggle('ios-fs-active', on);
    store.set(FS_KEY, on ? '1' : '0');
    const el = document.getElementById('sf-fullscreen');
    if (el) el.checked = on;
  }
  // v3.6.x：iOS 上改开关文案，明示平台限制，避免「点了没反应 / 不是真全屏」的困惑
  //   （模拟状态栏已在手机端统一隐藏，iOS 开关仅保留持久化 + 说明，不再声称"隐藏状态栏"）
  function relabelIosToggle() {
    const el = document.getElementById('sf-fullscreen');
    if (!el) return;
    const row = el.closest('.gs-row');
    if (!row) return;
    const span = row.querySelector('span');
    if (!span) return;
    span.textContent = inIosStandalone
      ? '全屏模式（iOS 系统状态栏不可隐藏）'
      : '全屏模式（iOS 需添加到主屏幕）';
  }
  const fsToggle = document.getElementById('sf-fullscreen');
  if (fsToggle) {
    fsToggle.addEventListener('change', () => {
      if (fsToggle.checked) {
        // v3.6.x：iOS 分支优先——standalone 走隐藏模拟状态栏，浏览器内引导安装
        if (isIOS) {
          if (inIosStandalone) { applyIosFs(true); showIosGuide(); }
          else { fsToggle.checked = false; showIosGuide(); }
          return;
        }
        if (!fsSupported()) {
          // 非 iOS 且不支持全屏 API（老 WebView）：无法全屏，回滚并提示
          fsToggle.checked = false;
          try { new Notification('当前浏览器不支持全屏', { body: '请使用 Chrome/Edge 浏览器，或添加到主屏幕后从桌面图标打开' }); } catch (e) {}
          return;
        }
        // 重新尝试原生全屏前清掉上次的 CSS 兜底（enterFs 内部按需回退）
        // 不重置复选框——开关此刻是用户刚勾上的状态
        applyFsCss(false, false);
        enterFs();
        syncFsClass();
        // v3.6.x：原生全屏可能被浏览器拦截（无手势/权限/WebView）——900ms 后
        // 仍既未进入全屏也未走 CSS 兜底则回滚开关（避免「已开全屏却无效果」）。
        // Via 横屏回退（checkFsLandscape ~600ms 应用 fs-css-active）先生效时
        // fsVisualActive() 已为 true，本回调不会误回滚。
        setTimeout(() => {
          const t = document.getElementById('sf-fullscreen');
          if (t && t.checked && !fsVisualActive()) {
            t.checked = false;
            showFsFailTip();
          }
        }, 900);
      } else {
        if (isIOS && inIosStandalone) { applyIosFs(false); return; }
        // 无论原生全屏还是 CSS 兜底，关闭时都退出并清兜底类
        applyFsCss(false);
        exitFs();
        syncFsClass();
      }
    });
    try { relabelIosToggle(); } catch (e) {}
  }
  // 退出全屏（Esc 键/手势/切后台系统退出）时同步开关状态 + 输入框属性还原
  // v3.5.113：传 false——系统级变化不覆盖用户意图（否则切后台后开关被置灰，永远不再自动恢复）
  // v3.5.11x：Fullscreen API 激活时给根元素加 fs-active 类（挖孔屏顶部安全区适配）
  function syncFsClass() {
    document.documentElement.classList.toggle('fs-active', isFullscreen());
  }
  document.addEventListener('fullscreenchange', () => { syncToggle(false); applyFsInputHacks(); syncFsClass(); });
  document.addEventListener('webkitfullscreenchange', () => { syncToggle(false); applyFsInputHacks(); syncFsClass(); });
  syncFsClass();
  // v3.6.x：启动时同步开关——display_override fullscreen 直启（无 Fullscreen API 调用、
  // 不触发 fullscreenchange）时开关也应显示开启；此处在 MutationObserver 注册前执行，
  // 不会误写持久化状态。
  try { syncToggle(false); } catch (e) {}
  // v3.5.126：聚焦兜底已移除——autocomplete="off"/"new-password" 会被 Chrome
  //   当密码字段处理（new-password 更甚），反而弹「保存密码/管理密码」条。
  //   密码/自动填充提示的压制统一交给 mobile-adapt.js 的 readonly 起手方案
  //   （readonly 破坏 Chrome 表单签名解析，触摸时解除，公认对 Chrome 最有效）。
  // 页面加载后若已在全屏（PWA 恢复/重新挂载场景），立即应用输入框 hacks
  try { applyFsInputHacks(); } catch (e) {}
  // v3.5.113：自动恢复全屏（启动时 / 切后台回来时）——用户开过全屏就尽量恢复
  // v3.5.122：修监听器泄漏——isFullscreen 时也移除监听、retry 前复查用户意图、
  //   只响应真实触摸（isTrusted，防 tabs.js 合成 click 拒接电话时误进全屏）
  let _retryArmed = false;
  function disarmRetry() {
    if (!_retryArmed) return;
    _retryArmed = false;
    document.removeEventListener('click', retryClick);
    document.removeEventListener('touchstart', retryTouch);
  }
  function retryClick(e) { if (!e.isTrusted) return; doRetry(); }
  function retryTouch(e) { if (!e.isTrusted) return; doRetry(); }
  function doRetry() {
    disarmRetry();
    if (store.get(FS_KEY) !== '1' || isFullscreen()) return; // 用户已关闭/已全屏 → 放弃
    enterFs();
  }
  function reenterFs() {
    // v3.6.x：上次走的是 CSS 兜底（浏览器转横屏）→ 直接恢复兜底，不再请求原生全屏
    if (store.get(FB_KEY) === '1') { applyFsCss(true); return; }
    if (store.get(FS_KEY) !== '1' || !fsSupported() || isFullscreen()) return;
    // Fullscreen API 需要用户手势；自动调用会被浏览器拦截——先试一次，
    // 被拦则等用户首次触摸/点击时再试（手势时刻的请求浏览器允许）
    enterFs();
    setTimeout(() => {
      if (isFullscreen()) return;
      disarmRetry();
      _retryArmed = true;
      document.addEventListener('click', retryClick);
      document.addEventListener('touchstart', retryTouch);
    }, 600);
  }
  // 启动时恢复
  // v3.6.x：iOS standalone 用 CSS 类恢复（无需用户手势、无 Fullscreen API 可调）
  try {
    if (store.get(FS_KEY) === '1') {
      if (isIOS && inIosStandalone) applyIosFs(true);
      else reenterFs();
    }
  } catch (e) {}
  // 切后台回来（Android/iOS 切走再切回会退出全屏）→ 自动恢复
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (isIOS && inIosStandalone) { if (store.get(FS_KEY) === '1') applyIosFs(true); }
    else reenterFs();
  });
  // 记录开关状态（供下次启动尝试恢复）
  // v3.5.113：系统级全屏变化（切后台退出）不覆盖用户「开全屏」的意图
  const obs = new MutationObserver(() => {
    if (_sysToggle) return;
    const el = document.getElementById('sf-fullscreen');
    if (el) store.set(FS_KEY, el.checked ? '1' : '0');
  });
  const el0 = document.getElementById('sf-fullscreen');
  if (el0) { obs.observe(el0, { attributes: true, attributeFilter: ['checked'] }); }
})();
