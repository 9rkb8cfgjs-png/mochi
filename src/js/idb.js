// ===== 功能：IndexedDB 存储（持久化关键数据，不丢失任何记录） =====
// 用于：字卡数据（cc-groups）、查岗记录（checkin-history）、聊天记录等
// 策略：写入时双写（localStorage 缓存 + IndexedDB 权威持久），
//       读取时优先 localStorage（同步快），初始化时从 IndexedDB 合并/恢复最新数据
(function () {
  const DB_NAME = 'mochi-db';
  const DB_VERSION = 1;
  const STORE = 'kv';

  let dbPromise = null;
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      try {
        if (!window.indexedDB) { reject(new Error('no idb')); return; }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
    return dbPromise;
  }

  // 写入（key: 完整键名，如 'xy-home-v2:cc-groups'）
  window.idbSet = function (key, value) {
    return open().then(db => new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    })).catch(() => false);
  };

  // 批量写入（单事务一次完成，比逐条 idbSet 快；任一条失败则整体失败）
  window.idbSetAll = function (pairs) {
    if (!pairs || !pairs.length) return Promise.resolve(true);
    return open().then(db => new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const os = tx.objectStore(STORE);
        pairs.forEach(p => { os.put(p.v, p.k); });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    })).catch(() => false);
  };

  // 读取
  window.idbGet = function (key) {
    return open().then(db => new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch (e) { resolve(undefined); }
    })).catch(() => undefined);
  };

  // v3.5.117：批量读取（单事务内多个 get，替代 N 次独立事务）——
  //   启动回填头像/图标/壁纸等几十个键时，从"几十次事务排队"降到"1 次事务"，
  //   手机端明显提速（每张图一个独立事务是桌面图片加载慢的主因之一）
  window.idbGetMany = function (keys) {
    const list = (keys || []).filter(Boolean);
    if (!list.length) return Promise.resolve({});
    return open().then(db => new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const os = tx.objectStore(STORE);
        const out = {};
        let pending = list.length;
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(out); } };
        list.forEach(k => {
          const req = os.get(k);
          req.onsuccess = () => { out[k] = req.result; if (--pending <= 0) finish(); };
          req.onerror = () => { out[k] = undefined; if (--pending <= 0) finish(); };
        });
        tx.onerror = finish;
        tx.onabort = finish;
      } catch (e) { resolve({}); }
    })).catch(() => ({}));
  };

  // 列出所有键
  window.idbGetAllKeys = function () {
    return open().then(db => new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) { resolve([]); }
    })).catch(() => []);
  };

  // 删除
  window.idbDelete = function (key) {
    return open().then(db => new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    })).catch(() => false);
  };

  // 清空全部键（"清除所有数据"用）：不删库，避免连接占用导致 blocked
  window.idbClearAll = function () {
    return open().then(db => new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    })).catch(() => false);
  };

  // 存储适配层：各模块统一用它读写（接口与原 store 一致）。
  // IndexedDB 是权威持久层；localStorage 只是快速快照（配额满/隐私模式写失败也不丢数据——
  // 启动时从 IDB 恢复）；内存缓存兜底 localStorage 缺失的键。
  // v3.5.92：大键（>200KB，如头像池/壁纸/朋友圈背景等图片 dataURL）只写 IndexedDB，
  //   不写 localStorage——手机 5MB 配额不再被几十 MB 图片撑爆，大数据全进 IDB（配额大得多）
  const LS_BIG_LIMIT = 200 * 1024;
  let memoryCache = null;
  window.xyStore = function (prefix) {
    return {
      get(k) {
        const key = prefix + ':' + k;
        try { const v = localStorage.getItem(key); if (v !== null) return v; } catch (e) {}
        if (memoryCache && key in memoryCache) return memoryCache[key];
        return null;
      },
      set(k, v) {
        const key = prefix + ':' + k;
        // v3.5.111：内存缓存无条件初始化并写入——大键（壁纸/头像池等）只进 IDB + 内存、
        // 不进 localStorage；若缓存未初始化（页面刚加载、IDB 恢复未完成）就上传大图，
        // 会既不在 localStorage 也不在内存缓存，切回桌面时读空导致壁纸被清掉。
        if (!memoryCache) memoryCache = {};
        memoryCache[key] = v;
        // 大键跳过 localStorage（只进 IDB + 内存缓存）
        const big = typeof v === 'string' && v.length > LS_BIG_LIMIT;
        if (!big) {
          try { localStorage.setItem(key, v); } catch (e) {}
        } else {
          try { localStorage.removeItem(key); } catch (e) {}
        }
        try { if (window.idbSet) window.idbSet(key, v); } catch (e) {}
      },
      remove(k) {
        const key = prefix + ':' + k;
        if (memoryCache) delete memoryCache[key];
        try { localStorage.removeItem(key); } catch (e) {}
        try { if (window.idbDelete) window.idbDelete(key); } catch (e) {}
      }
    };
  };

  // 恢复：从 IndexedDB 读回 localStorage 缺失的键（初始化时调用）
  window.idbRestore = function (uidPrefix) {
    // v3.5.116：所有路径都设置就绪标志（空数据/无 IDB 也算就绪），
    //   开屏「点击进入」靠它判断，避免空数据场景误等
    let readySent = false;
    const sendReady = function () {
      if (readySent) return;
      readySent = true;
      try { window.__mochiDataReady = true; } catch (e) {}
      try { document.dispatchEvent(new Event('mochi-restore-done')); } catch (e) {}
    };
    let finished = false;
    const finish = function () {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      sendReady();
    };
    // v3.5.122：整体保险——极端情况（IndexedDB 事务挂起/设备存储异常）下
    //   12 秒后强制置就绪。否则 open() 或任一事务永不完成时，开屏永远
    //   「正在加载数据…」没有进入按钮（低端安卓机曾现卡死数分钟）。
    // v3.6.x：保险丝超时只放行开屏、不再截断恢复——低端机大量图片键分批恢复
    //   可能真的超过 12 秒，原逻辑会把剩余键丢弃（本会话数据缺失，只能刷新重试）；
    //   现在超时后开屏可进入，恢复循环继续后台把剩余键补齐
    const safety = setTimeout(function () {
      if (finished) return;
      sendReady(); // 放行开屏，不阻塞用户
      // 不置 finished：processBatch 继续恢复剩余键
    }, 12000);
    window.idbGetAllKeys().then(keys => {
      if (!keys || !keys.length) { finish(); return; }
      const need = (keys || []).filter(k =>
        k.indexOf(uidPrefix) === 0 &&
        k.indexOf(uidPrefix + 'music-file:') !== 0);
      if (!need.length) { finish(); return; }
      // v3.5.122：分批恢复（每批 8 个键，批间让出主线程）——v3.5.117 的单事务
      //   idbGetMany 会把几百个键（含几十 MB 大图）一次性读进内存，低端手机
      //   内存飙升/事务挂起导致回填卡死，开屏永远转圈。分批后每批只占少量内存，
      //   让出主线程避免 UI 卡死，总耗时仍远低于单事务挂起。
      const BATCH = 8;
      let idx = 0;
      function processBatch() {
        if (finished) return;
        const batch = need.slice(idx, idx + BATCH);
        idx += BATCH;
        if (!batch.length) { finish(); return; }
        window.idbGetMany(batch).then(map => {
          batch.forEach(k => {
            const v = map[k];
            if (v === undefined || v === null) return;
            const str = typeof v === 'string' ? v : JSON.stringify(v);
            if (!memoryCache) memoryCache = {};
            memoryCache[k] = str;
            // v3.5.92：大键（>200KB 图片 dataURL）只留 IDB + 内存缓存，不回填 localStorage
            if (str.length > LS_BIG_LIMIT) return;
            try {
              // 仅当 localStorage 无此键，或 IndexedDB 数据更新时覆盖
              if (!localStorage.getItem(k)) localStorage.setItem(k, str);
            } catch (e) {}
          });
          setTimeout(processBatch, 0); // 让出主线程，下一批
        }).catch(() => {
          // v3.5.132：批次失败继续下一批（原实现 finish() 会截断剩余全部键——
          // 低端机偶发事务失败时几百个键本会话不恢复）
          setTimeout(processBatch, 0);
        });
      }
      setTimeout(processBatch, 0);
    }).catch(() => { finish(); });
  };
  window.__mochiLoadT = Date.now();
  // v3.5.24：启动时自动从 IndexedDB 回填 localStorage 缺失的键。
  // 之前只定义不调用——手机端导入/配额异常导致 localStorage 部分丢失后，IndexedDB 里的
  // 聊天记录/字卡/查岗等备份永远不会回填。现在初始化自动跑一次。
  try { window.idbRestore('xy-home-v2:'); } catch (e) {}

  // v3.5.92：一次性迁移——localStorage 里 >200KB 的旧大键（头像池/壁纸/朋友圈背景等）
  // 移入 IndexedDB 并从 localStorage 删除（老用户升级后 LS 立刻瘦身，不再撑爆 5MB）
  // v3.5.122：music-file 旧双写残留也一并迁移（旧版本音频存过 LS，读取路径会先查 IDB，
  //   迁移删掉 LS 副本后仍能从 IDB 读到；写入成功才删，失败保留下次重试）
  try {
    if (!sessionStorage.getItem('xy-ls-big-migrated')) {
      let moved = 0;
      // 先收集键再处理：避免边删边遍历导致索引跳跃漏项
      const bigKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf('xy-home-v2:') !== 0) continue;
        const v = localStorage.getItem(k);
        if (v && v.length > LS_BIG_LIMIT) bigKeys.push(k);
      }
      // v3.5.95：逐键写入成功才从 localStorage 删除（防 IDB 写失败时数据双丢）；
      // 全部成功才置迁移标记（部分失败时下次启动会重试未迁移的键）
      (async () => {
        let moved = 0;
        for (const k of bigKeys) {
          const v = localStorage.getItem(k);
          if (!v) continue;
          try {
            const ok = await window.idbSet(k, v);
            if (ok) {
              // v3.5.132：同步写 memoryCache——迁移的键不在 idbRestore 的快照里，
              // 不写 cache 的话本会话 store.get 三路全空（壁纸/背景"消失"直到刷新）
              if (!memoryCache) memoryCache = {};
              memoryCache[k] = v;
              try { localStorage.removeItem(k); } catch (e) {}
              moved++;
            }
          } catch (e) {}
        }
        if (moved > 0) { try { sessionStorage.setItem('xy-ls-big-migrated', '1'); } catch (e) {} }
      })();
    }
  } catch (e) {}
})();
