// ===== Mochi Service Worker：离线缓存 + 网络优先 =====
// v3.5.54：CACHE 名由 build.mjs 每次构建自动更新（mochi-<时间戳>），
// 新版本部署后旧缓存自动失效 → 强制更新到最新版
const CACHE = 'mochi-msx92vwf';
const BUILD_INFO = '部署于 2026-08-17 21:09';
const PRECACHE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-180.png'];

self.addEventListener('install', (e) => {
  // 跳过等待：新 sw 安装后立即接管（配合每次构建新缓存名 → 强制更新）
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})
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
  // 网络优先：在线时始终用最新，失败才回退缓存
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => {
        // 仅导航请求回退到 index.html；其他资源（manifest/图标/JS 等）
        // 只回退自身缓存，绝不用 HTML 顶替——否则安装/更新流程会拿到错误内容
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return caches.match(req);
      })
  );
});

// v3.5.114：移除「页面通知 → 清缓存 + 强制 reload」机制。
// 旧逻辑会让用户刚进入桌面就被打断刷新回开屏（每次构建 sw.js 内容都变，更新频繁时必现）。
// 现在新 sw 安装即 skipWaiting 接管，activate 自动清理旧缓存，当前页面继续可用，
// 用户下次刷新自然加载最新版；旧页面发来的 UPDATE_READY 消息在此一律忽略。
