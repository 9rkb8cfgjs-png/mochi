// ===== 功能：多联系人 / 多桌面（数据隔离 + 共享朋友圈） =====
// 设计：每个联系人 = 独立命名空间 xy-home-v2:<cid>:*，数据互不互通；
// 仅朋友圈（feed-posts）为全局共享层，按 owner(cid)+role 聚合所有联系人动态。
// 归属：系统/全局（AI-B 域），须最先于功能模块加载（build.mjs 中放在 idb.js 之后）。
(function () {
  const G = 'xy-home-v2';
  const EXCLUDE = ['contacts', 'active-contact', 'feed-posts', 'migrated-v1', 'js-errors'];
  function isExcluded(k) {
    const r = k.slice(G.length + 1);
    if (EXCLUDE.indexOf(r) >= 0) return true;
    if (r.indexOf('music-file:') === 0) return true;
    // v3.6.x：命名空间键（default:* / <cid>:*）不是"旧顶层键"，绝不能迁移——
    // 否则会把 xy-home-v2:default:avatar-user 再迁成 xy-home-v2:default:default:avatar-user
    // 并删除原键（刷新后头像/壁纸/聊天壁纸丢失 + default:default: 双重前缀垃圾键）。
    // 注意：旧业务键本身可能含冒号（dc-off-分类:内容 / quote-off:内容 / day-fish-日期 等），
    // 只能排除「冒号前是联系人 id（default 或 c 开头）且不是已知业务键前缀」的键。
    const m = r.match(/^([^:]+):/);
    if (m) {
      const head = m[1];
      // 联系人命名空间：default 或本应用生成的联系人 id（c + 时间戳36进制）
      if (head === 'default' || /^c[0-9a-z]{5,}$/.test(head)) return true;
      // 已知业务键前缀（含冒号但属旧顶层业务数据，需要迁移）
      const bizPrefix = ['dc-off', 'rc-off', 'mc-off', 'ck-off', 'quote-off', 'day-fish', 'greeted', 'cal'];
      if (bizPrefix.some(p => head.indexOf(p) === 0)) return false;
      // 其他含冒号的未知键保守视为命名空间键（防误迁 default:xxx 类数据）
      return true;
    }
    return false;
  }

  // ---- 当前激活联系人 ----
  let _cid = 'default';
  try { const a = localStorage.getItem(G + ':active-contact'); if (a) _cid = a; } catch (e) {}
  window.__activeCid = _cid;

  // 当前激活命名空间前缀（动态读取，切换后新调用即生效）
  window.activePrefix = function () { return G + ':' + (window.__activeCid || 'default'); };

  // 默认联系人专属存储：优先读 default 命名空间，回退读旧版顶层键（兼容未迁移老数据）
  function defaultStore() {
    const ns = G + ':default';
    return {
      get(k) {
        let v = null;
        try { v = window.xyStore(ns).get(k); } catch (e) {}
        if (v !== null) return v;
        try { v = window.xyStore(G).get(k); } catch (e) {}
        return v;
      },
      set(k, v) {
        window.xyStore(ns).set(k, v);
        // 写入后清掉旧顶层键，避免回退读到脏数据
        try { localStorage.removeItem(G + ':' + k); } catch (e) {}
        if (window.idbDelete) window.idbDelete(G + ':' + k);
      },
      remove(k) {
        window.xyStore(ns).remove(k);
        try { localStorage.removeItem(G + ':' + k); } catch (e) {}
        if (window.idbDelete) window.idbDelete(G + ':' + k);
      }
    };
  }

  // 激活联系人的存储（各功能模块使用）
  // v3.6.x 多桌面：default 联系人始终走 defaultStore()（带旧顶层键回退），
  // 绝不能因为 migrated-v1 标记就直接读空命名空间——idbRestore 是异步的，
  // 若数据主要在 IndexedDB，migrateLegacy 同步跑时 localStorage 还是空的，
  // 标记后 activeStore 会读到空的 default 命名空间而丢数据。回退读旧键可兜住该场景。
  // 关键：返回的 store 必须【动态绑定当前联系人】——各模块在顶部 const store = activeStore()
  // 一次性缓存，若在创建时把 cid 闭包固定，切换联系人后所有模块仍读写旧桌面，隔离失效。
  window.activeStore = function () {
    const dyn = function () {
      const cid = window.__activeCid || 'default';
      return cid === 'default' ? defaultStore() : window.xyStore(G + ':' + cid);
    };
    return {
      get: (k) => dyn().get(k),
      set: (k, v) => dyn().set(k, v),
      remove: (k) => dyn().remove(k)
    };
  };

  // 任意联系人的存储（供朋友圈后台遍历各联系人生成 TA 动态/评论）
  window.storeFor = function (cid) { return window.xyStore(G + ':' + cid); };

  // ---- 联系人注册表（全局，不随某个联系人隔离） ----
  function regStore() { return window.xyStore(G); }
  function getContacts() {
    try {
      const v = regStore().get('contacts');
      if (v) { const a = JSON.parse(v); if (Array.isArray(a) && a.length) return a; }
    } catch (e) {}
    return [{ id: 'default', name: '默认' }];
  }
  window.getContacts = getContacts;
  window.getActiveContact = function () { return window.__activeCid || 'default'; };

  window.createContact = function (name) {
    const list = getContacts();
    const id = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    list.push({ id: id, name: name || ('联系人' + (list.length)) });
    regStore().set('contacts', JSON.stringify(list));
    return id;
  };
  window.renameContact = function (id, name) {
    const list = getContacts(); const c = list.find(x => x.id === id);
    if (c) { c.name = name || c.name; regStore().set('contacts', JSON.stringify(list)); }
  };
  window.deleteContact = function (id) {
    if (id === 'default') return false;
    const list = getContacts().filter(x => x.id !== id);
    regStore().set('contacts', JSON.stringify(list));
    const prefix = G + ':' + id + ':';
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(prefix) === 0) { try { localStorage.removeItem(k); } catch (e) {} }
    }
    if (window.idbGetAllKeys) {
      window.idbGetAllKeys().then(keys => {
        (keys || []).forEach(k => { if (typeof k === 'string' && k.indexOf(prefix) === 0 && window.idbDelete) window.idbDelete(k); });
      }).catch(() => {});
    }
    if (window.__activeCid === id) window.setActiveContact('default');
    return true;
  };

  // 切换联系人：更新状态 + 刷新 UI + 回桌面 + 广播事件
  window.setActiveContact = function (id) {
    if (id === (window.__activeCid || 'default')) return;
    // v3.6.x：切换前把当前桌面的未保存聊天立即写盘（防抖定时器可能尚未触发，
    // 若等它回写会用旧命名空间把 A 桌面的消息存到 B 桌面）
    try { if (window.chatFlushSave) window.chatFlushSave(); } catch (e) {}
    window.__activeCid = id;
    try { localStorage.setItem(G + ':active-contact', id); } catch (e) {}
    try { if (window.idbSet) window.idbSet(G + ':active-contact', id); } catch (e) {}
    if (window.refreshActiveContactUI) window.refreshActiveContactUI();
    try { document.dispatchEvent(new Event('contact-switched')); } catch (e) {}
    try {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-phone'); if (home) home.hidden = false;
    } catch (e) {}
  };
  window.switchContact = window.setActiveContact;

  // 切换后刷新首页头像/昵称（deco-avatar 在 template.html 中）
  window.refreshActiveContactUI = function () {
    const s = window.activeStore();
    const meAv = s.get('avatar-user') || '';
    const taAv = s.get('avatar-partner') || '';
    ['avatar-user', 'avatar-partner'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const av = id === 'avatar-user' ? meAv : taAv;
      el.style.backgroundImage = av ? 'url(' + av + ')' : '';
    });
    try { if (window.renderChatHeader) window.renderChatHeader(); } catch (e) {}
  };

  // ---- 一次性迁移：把老顶层数据归入 default 联系人（不破坏老数据，先拷后删） ----
  // v3.6.x：迁移条件改为「只要发现旧顶层键就迁移」——原实现首次空加载（如刚清空
  // 存储/新设备）时 old 为空也会设 migrated-v1 标记，之后若旧键再出现（如 idbRestore
  // 异步回填、或测试/外部写入）就永远不迁移，default 桌面数据丢失（storeFor 读空）。
  // 补迁移时不得覆盖已有 contacts 注册表（用户可能已新建联系人）。
  // v3.6.x 修复（刷新丢失头像/壁纸）：① isExcluded 排除命名空间键（防 default:default:*）；
  //   ② 迁移延迟到 mochi-restore-done 后执行（防与 idbRestore 竞态删键）；
  //   ③ 迁移只删 localStorage 旧键、**保留 IndexedDB 旧键**——idbRestore 有 12s 保险丝，
  //   restore-done 只是放行开屏、后台可能仍在回填；若迁移删了 IDB 旧键而新键又不在
  //   restore 列表，大键（头像/壁纸，只存 IDB）刷新后彻底丢失。保留 IDB 旧键后，
  //   restore 每次都能回填它，defaultStore 优先读新键、回退旧键，数据永不丢；
  //   IDB 旧键冗余会在后续写入新键后自然闲置（无副作用）。
  function migrateLegacy() {
    const old = [];
    // v3.6.x：顺带清理存量双重前缀垃圾键（default:default:*）——旧版迁移误把命名空间键
    // 再迁一层产生，读取不命中但占存储，安全删除
    const garbage = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.indexOf(G + ':default:default:') === 0) garbage.push(k);
    }
    garbage.forEach(k => {
      try { localStorage.removeItem(k); } catch (e) {}
      if (window.idbDelete) try { window.idbDelete(k); } catch (e) {}
    });
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(G + ':') === 0 && !isExcluded(k)) old.push(k);
    }
    const finish = function () {
      try {
        if (!regStore().get('contacts')) {
          let name = '默认';
          try { const n = localStorage.getItem(G + ':default:lbl-partner'); if (n) name = n; } catch (e) {}
          regStore().set('contacts', JSON.stringify([{ id: 'default', name: name }]));
        }
        // v3.6.x：active-contact 仅在未设置时写 default——迁移不应覆盖用户已选的联系人
        if (!localStorage.getItem(G + ':active-contact')) regStore().set('active-contact', 'default');
        localStorage.setItem(G + ':migrated-v1', '1');
      } catch (e) {}
      window.__contactsMigrated = true;
      window.__activeCid = window.__activeCid || 'default';
    };
    // 无旧键：首次运行（或全部迁移完）——只确保注册表存在，不重复迁移
    if (!old.length) { finish(); return; }
    const step = function (i) {
      if (i >= old.length) { finish(); return; }
      const k = old[i];
      const rest = k.slice(G.length + 1);
      const next = function () { step(i + 1); };
      let v = null; try { v = localStorage.getItem(k); } catch (e) {}
      if (v !== null) {
        // 幂等：default 命名空间已有此键（已迁移过）则不重复写，只删 LS 旧键
        try { if (!window.xyStore(G + ':default').get(rest)) window.xyStore(G + ':default').set(rest, v); } catch (e) {}
        try { localStorage.removeItem(k); } catch (e) {}
        // 不删 IDB 旧键（见文件头注释 ③）：restore 保险丝期间仍需它能回填
        next();
      } else if (window.idbGet) {
        window.idbGet(k).then(r => {
          if (r !== undefined && r !== null) {
            try { if (!window.xyStore(G + ':default').get(rest)) window.xyStore(G + ':default').set(rest, r); } catch (e) {}
          }
          try { localStorage.removeItem(k); } catch (e) {}
          next();
        }).catch(next);
      } else next();
    };
    if (window.idbGetAllKeys) {
      window.idbGetAllKeys().then(keys => {
        (keys || []).forEach(k => {
          if (typeof k === 'string' && k.indexOf(G + ':') === 0 && !isExcluded(k) && old.indexOf(k) < 0) old.push(k);
        });
        step(0);
      }).catch(() => step(0));
    } else step(0);
  }
  // v3.6.x：迁移必须等 IndexedDB 回填完成（mochi-restore-done）后再执行——
  // idbRestore 是异步的，它先拿到旧键列表再分批读值回填；若 migrateLegacy 与它并发，
  // 迁移删掉旧键（localStorage + IndexedDB）后，idbRestore 读旧键得到空、新键
  //（xy-home-v2:default:*）又不在它的键列表里 → 内存缓存/localStorage 全部缺失，
  // 刷新后头像/壁纸/聊天壁纸（大键只存 IDB）全部丢失。
  function runMigrateWhenReady() {
    if (window.__mochiDataReady) { migrateLegacy(); return; }
    try {
      document.addEventListener('mochi-restore-done', function h() {
        document.removeEventListener('mochi-restore-done', h);
        migrateLegacy();
      });
    } catch (e) { migrateLegacy(); }
  }
  runMigrateWhenReady();

  // ---- 联系人管理 UI ----
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  // v3.6.x 修复（按钮无反应）：内联 display:flex 会覆盖 hidden 属性的 UA 样式
  // （[hidden]{display:none}），导致 m.hidden=true/false 完全失效——弹窗关不掉、
  // 点击遮罩/关闭/切换后仍盖在页面上；z-index 9999 又盖住全局 openModal 的
  // #modal-mask(z-index 90)，新建/改名弹输入框在联系人弹窗下面看不到也点不到。
  // 修复：display 显式控制显隐（showContactModal/hideContactModal），
  // z-index 降到 89（低于 modal-mask，openModal 输入框可浮在其上）。
  function showContactModal(m) { m.style.display = 'flex'; m.hidden = false; }
  function hideContactModal(m) { m.style.display = 'none'; m.hidden = true; }
  function ensureModal() {
    let m = document.getElementById('contact-manager');
    if (!m) {
      m = el('div'); m.id = 'contact-manager'; m.hidden = true;
      m.style.cssText = 'position:fixed;inset:0;z-index:89;align-items:center;justify-content:center;background:rgba(0,0,0,.4)';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m) hideContactModal(m); });
    }
    return m;
  }
  window.openContactManager = function () {
    const m = ensureModal();
    m.innerHTML = '';
    const box = el('div');
    box.style.cssText = 'width:min(92vw,420px);max-height:80vh;overflow:auto;background:#fff;border-radius:16px;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,.2)';
    box.appendChild(el('div', '', '<div style="font-size:16px;font-weight:600;margin-bottom:4px">联系人 / 桌面</div><div style="font-size:12px;color:#888;margin-bottom:12px">每个联系人数据独立；仅朋友圈互通</div>'));
    const list = el('div'); list.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:12px';
    getContacts().forEach(c => {
      const row = el('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #eee;border-radius:10px';
      const dot = el('div');
      dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:' + (c.id === window.__activeCid ? '#111' : '#ccc');
      const nm = el('div', '', '<div style="font-size:14px;font-weight:500">' + (c.name || c.id) + '</div><div style="font-size:11px;color:#999">' + (c.id === window.__activeCid ? '当前桌面' : '点击切换') + '</div>');
      nm.style.flex = '1';
      row.appendChild(dot); row.appendChild(nm);
      if (c.id !== window.__activeCid) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => { window.setActiveContact(c.id); hideContactModal(m); });
      }
      const acts = el('div'); acts.style.cssText = 'display:flex;gap:6px';
      const ren = el('button', '', '改名');
      ren.style.cssText = 'font-size:12px;padding:4px 8px;border:1px solid #ddd;border-radius:8px;background:#fafafa';
      ren.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.openModal) window.openModal('改名', c.name || '', (v) => { if (v && v.trim()) { window.renameContact(c.id, v.trim()); window.openContactManager(); } });
      });
      acts.appendChild(ren);
      if (c.id !== 'default') {
        const del = el('button', '', '删除');
        del.style.cssText = 'font-size:12px;padding:4px 8px;border:1px solid #f3c0c0;border-radius:8px;background:#fff5f5;color:#a32';
        del.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(c, m); });
        acts.appendChild(del);
      }
      row.appendChild(acts);
      list.appendChild(row);
    });
    box.appendChild(list);
    const add = el('button', '', '+ 添加联系人 / 桌面');
    add.style.cssText = 'width:100%;padding:12px;border:none;border-radius:10px;background:#111;color:#fff;font-size:14px;font-weight:600';
    add.addEventListener('click', () => {
      if (window.openModal) window.openModal('新建联系人', '', (v) => {
        const name = (v || '').trim(); if (!name) return;
        const id = window.createContact(name); window.setActiveContact(id); hideContactModal(m);
      });
    });
    box.appendChild(add);
    const close = el('button', '', '关闭');
    close.style.cssText = 'width:100%;margin-top:8px;padding:10px;border:1px solid #eee;border-radius:10px;background:#fafafa';
    close.addEventListener('click', () => { hideContactModal(m); });
    box.appendChild(close);
    m.appendChild(box);
    showContactModal(m);
  };
  function confirmDelete(c, m) {
    const m2 = ensureModal();
    m2.innerHTML = '';
    const box = el('div');
    box.style.cssText = 'width:min(88vw,340px);background:#fff;border-radius:16px;padding:18px;text-align:center';
    box.appendChild(el('div', '', '<div style="font-size:15px;font-weight:600;margin-bottom:6px">删除「' + (c.name || c.id) + '」？</div><div style="font-size:12px;color:#a32;margin-bottom:14px">该联系人的全部数据将清空，且不可恢复</div>'));
    const row = el('div'); row.style.cssText = 'display:flex;gap:10px';
    const ok = el('button', '', '删除');
    ok.style.cssText = 'flex:1;padding:10px;border:none;border-radius:10px;background:#a32d2d;color:#fff;font-weight:600';
    ok.addEventListener('click', () => { window.deleteContact(c.id); hideContactModal(m2); hideContactModal(m); window.openContactManager(); });
    const no = el('button', '', '取消');
    no.style.cssText = 'flex:1;padding:10px;border:1px solid #eee;border-radius:10px;background:#fafafa';
    no.addEventListener('click', () => { hideContactModal(m2); });
    row.appendChild(ok); row.appendChild(no); box.appendChild(row);
    m2.appendChild(box); showContactModal(m2);
  }

  // 设置页入口
  const row = document.getElementById('row-contacts');
  if (row) {
    row.addEventListener('click', () => window.openContactManager());
    function refreshContactsVal() {
      const val = document.getElementById('contacts-val');
      if (!val) return;
      const c = getContacts().find(x => x.id === (window.__activeCid || 'default'));
      val.textContent = c ? (c.name || c.id) : '';
    }
    refreshContactsVal();
    document.addEventListener('contact-switched', refreshContactsVal);
  }
})();
