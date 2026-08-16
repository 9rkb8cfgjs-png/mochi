// ===== 功能：PWA（安装到桌面/主屏 + beforeinstallprompt 安装按钮 + 静默更新最新版）=====
(function () {
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