// ===== 功能：PWA（安装到桌面/主屏 + beforeinstallprompt 安装按钮 + 静默更新最新版）=====
(function () {
  // v3.6.x：请求持久化存储——iOS Safari / 安卓 Chrome 在设备存储紧张或配额记账异常时
  // 会直接清掉整个源（origin）的网站数据（localStorage + IndexedDB 一起没，用户表现
  // 为「每次重新打开都是全新、聊天记录全丢」；WebKit 有同款已知 bug：
  // bugs.webkit.org/266559——配额未初始化导致所有网站的 localStorage/IDB 周期性被清）。
  // persist() 获批后该源数据豁免「存储压力清理」，是本应用（数据全在本地）唯一
  // 的官方防线；iOS Safari 15.4+ 支持，获批失败静默忽略，不影响任何功能。
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(function () {});
    }
  } catch (e) {}

  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 3000);
  }

  // ================= v3.6.x：新版本检测（版本文件轮询，iOS/安卓均可靠） =================
  // 纯 Service Worker 检测不可靠：sw 只在页面加载/导航时检查、iOS Safari 对 sw 更新
  // 事件支持差——用户开着旧页面永远收不到「新版本」提醒。
  // 方案：构建时在站点根目录生成 version.json（含构建时间戳），页面定期 fetch 对比；
  // 服务器时间戳更新即认为有新版本，显示常驻提示条，点击「刷新使用新版」立即刷新。
  // 当前页面读到的时间戳作为基线（首次 fetch 即最新 → 不误报）。
  (function () {
    const bar = document.getElementById('ver-update-bar');
    if (!bar) return;
    const act = document.getElementById('ver-update-refresh');
    let baseTs = null;      // 当前页面的版本时间戳（首次读取即基线）
    let baseGot = false;
    let noticed = false;
    // 防抖：检查到新版本后只提示一次，避免每次轮询都闪
    let lastCheck = 0;
    function showBar() {
      if (noticed) return;
      noticed = true;
      bar.hidden = false;
      if (act) act.onclick = function () { try { location.reload(); } catch (e) {} };
      // v3.5.134：可关闭（"稍后"）——不挡用户当前操作；关闭后本会话不再提示
      const closeBtn = document.getElementById('ver-update-close');
      if (closeBtn) closeBtn.onclick = function () { bar.hidden = true; };
    }
    function checkVersion() {
      const now = Date.now();
      if (now - lastCheck < 30000) return; // 每 30 秒检查一次
      lastCheck = now;
      // 加时间戳参数绕过缓存：fetch 拿到的必须是最新 version.json
      const url = './version.json?v=' + now;
      fetch(url, { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
        .then(function (d) {
          const ts = Number(d && d.ts);
          if (!ts || isNaN(ts)) return;
          if (!baseGot) { baseTs = ts; baseGot = true; return; } // 基线 = 当前页面版本
          if (ts > baseTs) showBar();
        })
        .catch(function () {});
    }
    checkVersion();
    setInterval(checkVersion, 30000);
    // 切回前台时立即检查（用户在别的 tab 待了很久，回来立刻发现新版）
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkVersion();
    });
  })();

  // ================= v3.6.x：定期备份提醒（本地数据只存在浏览器，Safari 可能意外清空） =================
  // iOS Safari 会因存储压力/系统 bug（WebKit#266559）清掉整个源的 localStorage+IDB，
  // 用户表现为「每次重开数据全丢」。代码无法阻止系统级清空，唯一防线是定期导出备份文件
  //（存到 iOS「文件」App，清空后能一键恢复）。距上次成功导出超 7 天且近 7 天未提醒过时，
  // 在顶部显示提醒条（复用 ver-update-bar 样式，更新提示优先显示时让位）。
  (function () {
    const bar = document.getElementById('backup-remind-bar');
    if (!bar) return;
    const G = 'xy-home-v2:';
    const DAY = 86400000;
    const INTERVAL = 7 * DAY;
    function ts(key) { try { return Number(localStorage.getItem(G + key)) || 0; } catch (e) { return 0; } }
    function show(days, everBacked) {
      // 版本更新提示条优先（两栏同位置 fixed，同时显示会重叠）
      const upd = document.getElementById('ver-update-bar');
      if (upd && !upd.hidden) return;
      const txt = document.getElementById('backup-remind-txt');
      if (txt) {
        txt.textContent = everBacked
          ? '距上次导出备份已 ' + days + ' 天，数据只存本机浏览器，建议导出备份'
          : '数据只存在本机浏览器里，建议定期导出备份（防浏览器意外清除）';
      }
      bar.hidden = false;
      try { localStorage.setItem(G + '__last-backup-remind', String(Date.now())); } catch (e) {}
    }
    function tryShow() {
      if (window.__resetting) return;
      const lastBackup = ts('__last-backup');
      const lastRemind = ts('__last-backup-remind');
      if (lastRemind && Date.now() - lastRemind < INTERVAL) return; // 近期已提醒过
      if (lastBackup && Date.now() - lastBackup < INTERVAL) return; // 刚备份过
      show(lastBackup ? Math.max(Math.floor((Date.now() - lastBackup) / DAY), 7) : 7, !!lastBackup);
    }
    function gated() {
      // 全新安装/数据被清空的空状态不提醒（没有可备份的数据，避免噪音）
      try { if (!localStorage.getItem(G + 'contacts')) return; } catch (e) {}
      tryShow();
    }
    document.addEventListener('mochi-restore-done', gated);
    const poll = setInterval(function () {
      if (window.__mochiDataReady) { clearInterval(poll); gated(); }
    }, 300);
    const go = document.getElementById('backup-remind-go');
    if (go) go.addEventListener('click', function () {
      bar.hidden = true;
      try { if (window.runBackupExport) window.runBackupExport(); } catch (e) {}
    });
    const close = document.getElementById('backup-remind-close');
    if (close) close.addEventListener('click', function () { bar.hidden = true; });
  })();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        // v3.5.114：不再自动刷新页面——原逻辑在检测到新 sw 后清旧缓存并 FORCE_RELOAD，
        // 会导致用户刚进入桌面就被打断回到开屏（每次构建 sw.js 都会变，更新频繁时必现）。
        // 新版 sw 用 skipWaiting 安装即接管 + activate 自动清旧缓存，当前页面可继续使用，
        // 下次刷新自然加载最新版；这里只轻提示一次（版本条已覆盖主要场景）。
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              try { toast('已检测到新版本，刷新页面即可更新'); } catch (e) {}
            }
          });
        });
      }).catch(() => {});
    });
  }

  let deferredPrompt = null;
  const btn = document.getElementById('pwa-install');
  const hide = () => { if (btn) btn.hidden = true; };

  window.addEventListener('beforeinstallprompt', (e) => {
    // 不阻止默认行为：让浏览器自由弹安装提示，菜单安装不受影响
    deferredPrompt = e;
    if (btn) {
      // v3.5.123：聊天页（.page.full）可见时不显示安装按钮——避免遮挡输入栏/发送按钮
      const chatVisible = Array.from(document.querySelectorAll('.page')).some(p => p.id === 'page-chat' && !p.hidden);
      btn.hidden = chatVisible;
    }
  });

  // v3.5.131：聊天页可见性持续跟踪（原实现只在 prompt 触发时刻检查一次——
  // 之后进聊天页按钮仍悬在输入栏上方遮挡发送按钮）
  if (btn) {
    const chatPage = document.getElementById('page-chat');
    if (chatPage) {
      const mo = new MutationObserver(() => {
        if (deferredPrompt) btn.hidden = !chatPage.hidden;
      });
      mo.observe(chatPage, { attributes: true, attributeFilter: ['hidden'] });
    }
  }

  if (btn) {
    btn.addEventListener('click', () => {
      if (!deferredPrompt) {
        // beforeinstallprompt 未触发（不满足可安装条件 / 已安装过旧版 / 浏览器 UI 变化）→ 引导手动安装
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
        const isAndroid = /android/i.test(navigator.userAgent);
        let guide = isIOS
          ? 'iPhone 安装：点底部「分享」按钮 → 「添加到主屏幕」。'
          : isAndroid
            ? '安卓安装：点右上角「⋮」菜单 → 「安装应用」。\n若没有该选项：① 确认打开的是最新版 https 页面；② 到手机设置里删除已安装的旧版「Mochi」后重试。'
            : '电脑安装：点地址栏右侧「安装」图标，或菜单 → 保存并分享 → 安装应用。';
        if (window.openModal) {
          window.openModal('安装到桌面', '', () => {}, { noInput: true, staticText: guide });
        } else {
          toast(guide);
        }
        return;
      }
      try {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((r) => {
          if (r.outcome === 'accepted') hide();
          deferredPrompt = null;
        });
      } catch (e) {
        // v3.5.131：prompt 抛错（事件已失效等）时兜底引导
        deferredPrompt = null;
        try { btn.hidden = true; } catch (e2) {}
        window.openModal('安装到桌面', '', () => {}, { noInput: true, staticText: '请在浏览器菜单中点击「安装应用」' });
      }
    });
  }

  window.addEventListener('appinstalled', hide);
  // iOS Safari 提示（无 beforeinstallprompt）
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    const iOSHint = document.getElementById('pwa-ios-hint');
    if (iOSHint) {
      try { if (window.navigator.standalone) { iOSHint.hidden = true; return; } } catch (e) {}
      setTimeout(() => { iOSHint.hidden = false; }, 60000);
      iOSHint.addEventListener('click', () => { iOSHint.hidden = true; });
    }
  }
})();

// ===== 全新环境引导：无任何数据时首次提示「可导入备份」 =====
// 背景：Edge/Chrome 安卓「安装应用」的 PWA 与浏览器标签页使用独立存储分区
// （storage partition），用户从标签页换到桌面图标打开时看到的是全新空环境
// （昵称/打卡/摸鱼全默认值），误以为数据丢了。
// 判定：localStorage + IndexedDB 都没有 xy-home-v2: 数据键 → 全新环境。
// 时机：等数据就绪（__mochiDataReady）且开屏关闭后再弹——modal-mask z-index(90)
// 低于 splash(999)，开屏期间弹会被盖住。弹过一次写标记（含点取消），不再打扰。
(function () {
  const G = 'xy-home-v2:';
  const MARK = G + '__onboard-done';
  // localStorage 侧：无任何数据键（标记键除外）
  function freshLs() {
    try {
      if (localStorage.getItem(MARK)) return false; // 已提示过
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(G) === 0 && k !== MARK) return false; // 有任何数据键 → 老环境
      }
    } catch (e) { return false; }
    return true;
  }
  // IndexedDB 侧：大键（聊天/字卡/音乐等）可能只进 IDB 不占 localStorage，也要查
  function idbEmpty() {
    return new Promise((resolve) => {
      try {
        if (!window.idbGetAllKeys) { resolve(true); return; }
        window.idbGetAllKeys().then((keys) => {
          resolve(!(keys || []).some(k => String(k).indexOf(G) === 0));
        }).catch(() => resolve(true));
      } catch (e) { resolve(true); }
    });
  }
  // 开屏是否已关闭（clock.js：点击进入 → 加 .hide 类 → 400ms 后移除节点）
  function splashGone() {
    const s = document.getElementById('splash');
    return !s || !s.isConnected || s.classList.contains('hide');
  }
  function maybeShow() {
    if (!freshLs()) return;
    if (window.__resetting) return; // 重置/导入流程中不打扰
    idbEmpty().then((clean) => {
      if (!clean) return; // IndexedDB 有数据 → 不是全新环境
      // 先写标记：无论用户确定/取消，只提示这一次
      try { localStorage.setItem(MARK, String(Date.now())); } catch (e) {}
      if (!window.openModal) return;
      const go = () => {
        // 切到设置页并触发「导入数据」文件选择（row-import 已由 data-backup.js 绑定）
        try {
          const tab = document.querySelector('.tab[data-page="page-setting"]');
          if (tab) tab.click();
        } catch (e) {}
        setTimeout(() => {
          try {
            const row = document.getElementById('row-import');
            if (row) row.click();
          } catch (e) {}
        }, 120);
      };
      window.openModal('欢迎使用 Mochi', '', go, {
        noInput: true,
        staticText: '检测到当前是全新环境，还没有任何数据。\n\n· 如果之前在浏览器标签页里设置过昵称/打卡：点「确定」会打开设置页的数据导入，选择之前导出的备份文件即可全部恢复。\n\n· 如果是第一次使用：点「取消」直接开始设置即可。'
      });
    });
  }
  let ready = false;
  const poll = setInterval(function () {
    if (window.__mochiDataReady) ready = true;
    if (ready && splashGone()) {
      clearInterval(poll);
      setTimeout(maybeShow, 300); // 留一点开屏退出动画缓冲
    }
  }, 300);
})();