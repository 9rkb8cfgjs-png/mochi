// ===== Mochi Service Worker：离线缓存 + 网络优先 =====
// v3.5.54：CACHE 名由 build.mjs 每次构建自动更新（mochi-<时间戳>），
// 新版本部署后旧缓存自动失效 → 强制更新到最新版
// v3.6.x：网络优先 + 超时兜底。GitHub Pages 在国内网络经常慢/卡，原实现
// fetch/addAll 均无超时——SW 卡在 installing 时 Chrome 安卓「安装到桌面」
// 会一直显示「正在安装」永不完成（WebAPK 安装要经 SW 拉 start_url/图标）。
// 现在每个请求最多等 NETWORK_TIMEOUT 毫秒，超时立即回退缓存（没缓存则快速
// 失败），SW 最迟约 10 秒内必然激活，安装/加载都不再无限挂起。
const CACHE = 'mochi-mszunkjg';
const BUILD_INFO = '部署于 2026-08-19 16:48';
const PRECACHE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-180.png'];
const NETWORK_TIMEOUT = 8000; // 网络请求等待上限（毫秒）

// 带超时的 fetch：超时按失败处理，走回退逻辑
function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('net-timeout')), ms);
    fetch(req).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

self.addEventListener('install', (e) => {
  // 跳过等待：新 sw 安装后立即接管（配合每次构建新缓存名 → 强制更新）
  self.skipWaiting();
  // 预缓存逐文件超时 + 单文件失败不影响整体：网络再差也保证 SW 能激活，
  // 不阻塞浏览器安装流程
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.allSettled(PRECACHE.map((url) =>
        fetchWithTimeout(url, NETWORK_TIMEOUT).then((res) => {
          if (res && res.ok) return c.put(url, res);
        })
      ))
    ).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 跨域请求不接管，交给浏览器原生网络（不缓存、不拦截）
  if (new URL(req.url).origin !== self.location.origin) return;
  // 网络优先：在线时始终用最新，超时/失败才回退缓存
  e.respondWith(
    fetchWithTimeout(req, NETWORK_TIMEOUT)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => {
        // 仅导航请求回退到 index.html；其他资源（manifest/图标/JS 等）
        // 只回退自身缓存，绝不用 HTML 顶替——否则安装/更新流程会拿到错误内容
        const fallback = req.mode === 'navigate'
          ? caches.match('./index.html')
          : caches.match(req);
        return fallback.then((m) => m || Response.error());
      })
  );
});

// v3.5.114：移除「页面通知 → 清缓存 + 强制 reload」机制。
// 旧逻辑会让用户刚进入桌面就被打断刷新回开屏（每次构建 sw.js 内容都变，更新频繁时必现）。
// 现在新 sw 安装即 skipWaiting 接管，activate 自动清理旧缓存，当前页面继续可用，
// 用户下次刷新自然加载最新版；旧页面发来的 UPDATE_READY 消息在此一律忽略。
