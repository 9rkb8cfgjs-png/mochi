// ===== 功能：信箱（仿星言简约版【星言信箱】，矢量图简约风格） =====
// 收信（TA 主动来信）/ 寄信 / 回信；信纸样式展示；聊天里插入写信/回信/来信提示
(function () {
  const store = window.activeStore();
  const KEY = 'mail-letters';
  // v3.7.x：LS 剥图快照兜底——对齐 feed.js feed-posts-snap。信件含图片 dataURL 时主键
  //   >200KB 只进 IndexedDB（LS 5MB 配额保护），Edge 杀后台/强制关闭丢 IDB 后信件全没。
  //   与 feed.js 同策略：剥掉图片 dataURL 只保文本，写一份 ≤200KB 的 LS 快照兜底。
  const SNAP_KEY = 'mail-letters-snap';
  const LS_BIG_LIMIT = 200 * 1024;
  const TITLES = ['好久不见', '最近还好吗', '想你了', '给你写了封信', '深夜随想', '一些想说的话'];
  let mtab = 'in';
  let viewLetter = null;

  function partnerName() { return store.get('lbl-partner') || 'TA'; }
  function fmtDT(ts) {
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }
  // v3.6.x：load() 合并暂存——权威读取（mailDbReady=false）期间收到的信只暂存在
  // mailPending，原 load() 只读持久层 → 来信弹窗已提示「给你寄来了一封信」、信箱列表
  // 却是空白（OPPO 雨见浏览器 IndexedDB 打开/读取慢或挂起时真实复现）；这里把暂存
  // 信件按 id 合并在持久层之上，弹窗提示过的一切信件都可见可回可清角标。
  // v3.7.x：快照键用【动态】activePrefix——原实现模块加载时 const uid 固定，
  // 切到其它联系人桌面后 loadSnap/writeSnap 仍读写 default 桌面的快照：
  // 非 default 桌面信箱主键为空时兜底读到 default 桌面的信 → 串桌面 +
  // 「同一封信在谁桌面就显示谁的名字」（信箱是每桌面隔离数据，快照必须按桌面分开）
  // v3.7.x 多联系人来信：cid 指定该联系人桌面（后台遍历来信用），undefined 表示当前激活桌面
  function csFor(cid) { return cid ? window.storeFor(cid) : store; }
  function prefixFor(cid) { return cid ? ('xy-home-v2:' + cid) : window.activePrefix(); }
  function snapKey(cid) { return prefixFor(cid) + ':' + SNAP_KEY; }
  function loadSnap(cid) {
    try {
      const v = localStorage.getItem(snapKey(cid));
      if (v) { const a = JSON.parse(v); if (Array.isArray(a)) return a; }
    } catch (e) {}
    return [];
  }
  // 剥图：信件正文/回信/对方回信里的图片 dataURL 换 [图片]，快照只保文本历史
  function stripLetterImg(l) {
    if (!l || typeof l !== 'object') return l;
    const c = Object.assign({}, l);
    const strip = (s) => { if (typeof s !== 'string') return s; let t = s.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '[图片]'); if (t.length > 8192) t = t.slice(0, 8192) + '…'; return t; };
    c.content = strip(c.content);
    if (c.myReply) { c.myReply = Object.assign({}, c.myReply); c.myReply.content = strip(c.myReply.content); }
    if (c.partnerReply) { c.partnerReply = Object.assign({}, c.partnerReply); c.partnerReply.content = strip(c.partnerReply.content); }
    return c;
  }
  function writeSnap(list, cid) {
    if (!list || !list.length) { try { localStorage.removeItem(snapKey(cid)); } catch (e) {} return; }
    try { const snap = JSON.stringify(list.map(stripLetterImg)); if (snap.length <= LS_BIG_LIMIT) localStorage.setItem(snapKey(cid), snap); } catch (e) {}
  }
  function load(cid) {
    const cs = csFor(cid);
    let list = [];
    const raw = cs.get(KEY);
    if (raw !== null) { try { list = JSON.parse(raw); } catch (e) { list = []; } }
    // v3.7.x：主键缺失兜底——大列表只进 IDB（Edge 丢 IDB / LS 被清）时读剥图快照，
    //   文本+标题+时间保留；IDB 存活时模块底部 idbGet 会随后用完整数据重渲染
    if (!list.length) { try { const v = loadSnap(cid); if (v.length) list = v; } catch (e) {} }
    // v3.7.x：暂存合并仅对当前桌面（cid undefined）生效——mailPending 是当前桌面
    //   contact-switched 时的暂存，后台遍历其它 cid 时不并入（避免串桌面）
    if (!cid && !mailDbReady && mailPending && mailPending.length) {
      const map = {};
      list.forEach(x => { if (x && x.id) map[x.id] = x; });
      mailPending.forEach(x => { if (x && x.id) map[x.id] = x; });
      list = Object.keys(map).map(k => map[k]).sort((a, b) => (b.tm || 0) - (a.tm || 0));
    }
    return list;
  }
  // 按 id 合并两个信件列表（后者覆盖同 id），按 tm 倒序
  function mergeLists(a, b) {
    const map = {};
    (a || []).forEach(x => { if (x && x.id) map[x.id] = x; });
    (b || []).forEach(x => { if (x && x.id) map[x.id] = x; });
    return Object.keys(map).map(k => map[k]).sort((x, y) => (y.tm || 0) - (x.tm || 0));
  }
  // v3.5.120：信箱权威加载防护——修复「刷新后信箱数据丢失」：
  // 信箱数据导入后只在 IndexedDB（备份把它归为大键），localStorage 空时
  // load() 返回 []，此时任何 save([]) 都会用空列表覆盖 IDB 里的全部信件。
  // 权威未从 IDB 读回前，save 只暂存内存、绝不落盘。
  let mailDbReady = false;
  let mailPending = null;
  function save(list, cid) {
    // v3.7.x：cid undefined = 当前桌面，走 mailDbReady 门槛（防启动早期 save([]) 覆盖 IDB）；
    //   cid 指定 = 后台遍历该联系人来信，直接写（maybeIncomingLetterFor 已确认该桌面
    //   load 非空才 unshift，不会用 [新信] 覆盖 IDB 旧信）
    // v3.7.x：未就绪时除暂存内存外立即写剥图快照（对齐 chat.js 同场景的 LS 快照兜底）——
    //   原实现只进 mailPending 内存、保险丝(15s)触发前页面被杀/重载则来信整封丢失，
    //   而聊天通知已持久化 → 用户看到「联系人来信」信箱却是空的（iQOO Neo5 SE +
    //   QQ浏览器 X5 IDB 挂起实测）。快照仅文本兜底，IDB 权威读回后 mailMergeFromIdb
    //   按 id 合并恢复完整数据（含图片），不破坏权威防护（主键 store.set 仍等就绪）。
    if (!cid && !mailDbReady) { try { mailPending = (list || []).slice(); } catch (e) {} writeSnap(list, cid); return; }
    csFor(cid).set(KEY, JSON.stringify(list));
    writeSnap(list, cid);
  }

  // v3.5.99：桌面「信箱」图标未读角标——有新来信（未读）时显示数字，进入信箱或打开信件后清除
  function updateBadge() {
    const badge = document.getElementById('mail-badge');
    if (!badge) return;
    try {
      const unread = load().filter(l => l.type === 'received' && !l.read && !l.myReply).length;
      if (unread > 0) {
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    } catch (e) {}
  }

  // v3.5.107：信箱前台弹窗辅助——当前是否在信箱页（在信箱页内时来信/回信不弹横幅）
  function mailPageVisible() {
    return ['page-mail', 'page-mail-write', 'page-mail-reply'].some(id => {
      const el = document.getElementById(id);
      return el && !el.hidden;
    });
  }
  // 打开信箱页（渲染 + 清角标），供信箱图标点击与弹窗点击共用
  function openMailPage() {
    render();
    updateBadge();
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    const mp = document.getElementById('page-mail');
    if (mp) mp.hidden = false;
  }
  // 写信纸 HTML（简约卡片：标题 + 寄信人/时间 + 正文）
  // 正文支持字卡库图片（dataURL）直接显示；图片/表情包都是字卡，统一渲染为
  // 同尺寸缩略图（sticker:/image: 前缀仅作历史类型标记，不再区分显示大小）
  // v3.6.x：完整 HTML 转义（只转 < 可被 `&lt;…&gt;` 实体绕过注入）
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function renderBody(content) {
    const s = String(content || '');
    let html = '';
    const re = /((?:sticker|image):)?(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      html += escHtml(s.slice(last, m.index));
      html += '<img class="mail-body-img" src="' + m[2] + '" alt="表情"> ';
      last = m.index + m[0].length;
    }
    html += escHtml(s.slice(last));
    return html;
  }
  // 信箱列表摘要：剔除图片/表情包 dataURL（含标记前缀），避免显示超长 base64 乱码
  function shortDesc(s) {
    const str = String(s || '');
    const cleaned = str
      .replace(/(?:sticker|image):data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '')
      .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '')
      .replace(/\s+/g, ' ').trim();
    return (cleaned || '（图片）').slice(0, 30);
  }
  function letterPaper(title, content, date, author) {
    return '<div class="mail-paper">' +
      '<div class="mail-paper-head"><span class="mail-paper-author">' + escHtml(author) + '</span><span class="mail-paper-date">' + date + '</span></div>' +
      (title ? '<div class="mail-paper-title">' + escHtml(title) + '</div>' : '') +
      '<div class="mail-paper-body">' + renderBody(content) + '</div>' +
      '</div>';
  }
  // 信纸图片可点击查看大图（复用聊天大图查看器 viewChatImage）
  // v3.6.x：信箱来信/回信里的图片与表情包一律为缩略图，点击后打开原图查看
  function bindLetterImgClicks(root) {
    if (!root) return;
    root.querySelectorAll('.mail-body-img').forEach(im => {
      im.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.viewChatImage) window.viewChatImage(im.src);
      });
    });
  }
  // 打开信详情（复用 tc-mask 弹层；v3.5.68 打开即标记已读）
  function openLetter(l) {
    viewLetter = l;
    // 收到的来信：打开后标记已读（「新来信」消失）
    if (l && l.type === 'received' && !l.read) {
      l.read = true;
      const list = load();
      const idx = list.findIndex(x => x.id === l.id);
      if (idx >= 0) { list[idx].read = true; save(list); }
    }
    updateBadge();
    const name = partnerName();
    const myName = store.get('lbl-user') || '我';
    let html = '';
    // 收到的信 / 寄出的信 都完整显示（含标题）
    if (l.type === 'received' || l.fromMe) {
      html += letterPaper(l.tt || '来信', l.content, fmtDT(l.tm), l.fromMe ? myName : name);
    } else if (l.type === 'sent') {
      html += letterPaper(l.tt || '寄出的信', l.content, fmtDT(l.tm), myName);
    }
    // 我的回信（寄出的信内容已在上方完整展示，不再重复）
    if (l.myReply && l.type !== 'sent') html += letterPaper('我的回信', l.myReply.content, fmtDT(l.myReply.tm), myName);
    if (l.partnerReply) html += letterPaper('对方的回信', l.partnerReply.content, fmtDT(l.partnerReply.tm), name);
    // 底部按钮：收到的信且未回信 → 提笔回信（打开独立回信页）；任意信可删除
    let footer = '';
    if (l.type === 'received' && !l.myReply) {
      footer = '<div class="mail-actions"><button class="cc-tool" id="mail-reply-btn">提笔回信</button><button class="cc-tool cc-tool-danger" id="mail-del-btn">删除</button><button class="cc-tool" id="mail-close2">关闭</button></div>';
    } else {
      footer = '<div class="mail-actions"><button class="cc-tool cc-tool-danger" id="mail-del-btn">删除</button><button class="cc-tool" id="mail-close2">关闭</button></div>';
    }
    if (window.openTCPanel) window.openTCPanel('信件', html + footer);
    bindLetterImgClicks(document.getElementById('tc-body'));
    const close2 = document.getElementById('mail-close2');
    if (close2) close2.addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; viewLetter = null; });
    const replyBtn = document.getElementById('mail-reply-btn');
    if (replyBtn) replyBtn.addEventListener('click', () => openReply(l));
    const delBtn = document.getElementById('mail-del-btn');
    if (delBtn) delBtn.addEventListener('click', () => deleteLetter(l));
  }
  function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }
  // 回信（独立全屏页，保留原信上下文）
  function openReply(l) {
    viewLetter = l;
    const name = partnerName();
    const origEl = document.getElementById('mail-reply-original');
    if (origEl) {
      origEl.innerHTML = letterPaper(l.tt || '来信', l.content, fmtDT(l.tm), name);
      bindLetterImgClicks(origEl);
    }
    const toEl = document.getElementById('mail-reply-to');
    if (toEl) toEl.textContent = name;
    const input = document.getElementById('mail-reply-input');
    if (input) input.value = '';
    document.getElementById('tc-mask').hidden = true;
    showPage('page-mail-reply');
  }
  function submitReply() {
    const l = viewLetter;
    if (!l) return;
    // v3.6.x：保留 sticker:/image: 标记前缀（区分图片/表情包类型），不再剥掉
    const val = document.getElementById('mail-reply-input').value.trim();
    if (!val) { toast('回信内容不能为空'); return; }
    const name = partnerName();
    const list = load();
    const idx = list.findIndex(x => x.id === l.id);
    if (idx >= 0 && !list[idx].myReply) {
      list[idx].myReply = { content: val, tm: Date.now() };
      // TA 定时回信确认（概率与时间在回复设置-信箱调整）
      const cfg = mailCfg();
      if (Math.random() * 100 < cfg.replyProb) {
        const replyMsg = taLetterContent(cfg);
        const delayMs = (cfg.replyMin + Math.random() * Math.max(1, cfg.replyMax - cfg.replyMin)) * 60000;
        // v3.6.x：TA 回信计划持久化——不再用内存 setTimeout（页面刷新/重开即丢失，
        // 表现为「回了信却永远收不到回信」）；写入计划，由 checkPendingReply 到期落地
        const pending = replyPendingLoad();
        pending.push({ id: l.id, due: Date.now() + delayMs, content: replyMsg });
        replyPendingSave(pending);
      }
      save(list);
      viewLetter = null;
      render();
      updateBadge();
      showPage('page-mail');
      if (window.chatAddSystem) window.chatAddSystem('你给 ' + name + ' 回了一封信');
      toast('回信已寄出');
      // v3.6.x：TA 收藏我的回信（30% 概率，与聊天消息收藏一致）
      if (Math.random() * 100 < 30 && window.addTaFavItem) {
        window.addTaFavItem({ kind: 'mail', title: l.tt || '', text: val, ts: Date.now() });
        setTimeout(() => toast('TA 收藏了你的回信'), 1200);
      }
    }
  }
  // ===== TA 回信计划（持久化）：回信命中概率后，TA 的回信写入本地计划 =====
  // 到期由 checkPendingReply 落地为 partnerReply；刷新/重开页面不丢（旧逻辑用内存
  // setTimeout，刷新即丢失，回信永远收不到）。
  const REPLY_PENDING_KEY = 'mail-reply-pending';
  function replyPendingLoad(cid) {
    try { const v = JSON.parse(csFor(cid).get(REPLY_PENDING_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function replyPendingSave(arr, cid) { try { csFor(cid).set(REPLY_PENDING_KEY, JSON.stringify(arr)); } catch (e) {} }
  // v3.7.x：信件系统消息写入「信件所属桌面」的聊天——与 feed.js notifyFeedPostToChat
  //   同模式：当前桌面走内存链路（chatAddSystem 实时渲染）；非当前桌面直接写该桌面
  //   IDB 聊天记录 + LS 快照（该桌面 msgs 在 contact-switched 时重置，下次进入由 loadMsgs 读回）
  function notifyMailToChat(cid, text) {
    const cur = window.__activeCid || 'default';
    if (cid === cur) {
      if (window.chatAddSystem) window.chatAddSystem(text);
      return;
    }
    const prefix = 'xy-home-v2:' + cid;
    try {
      if (window.idbGet && window.idbSet) {
        window.idbGet(prefix + ':chat-msgs').then(v => {
          let arr = [];
          try { arr = Array.isArray(v) ? v : JSON.parse(v || '[]'); } catch (e) { arr = []; }
          if (!Array.isArray(arr)) arr = [];
          arr.push({ side: 'in', special: 'poke', text: text, ts: Date.now() });
          try { window.idbSet(prefix + ':chat-msgs', JSON.stringify(arr)); } catch (e) {}
          try { localStorage.setItem(prefix + ':chat-msgs', JSON.stringify(arr)); } catch (e) {}
        }).catch(() => {});
      }
    } catch (e) {}
  }
  // 该联系人桌面的 TA 昵称（lbl-partner，回退 contacts.name，再回退 'TA'）
  function partnerNameFor(cid) {
    try {
      const cs = csFor(cid);
      const v = cs.get('lbl-partner');
      if (v) return v;
      if (window.getContacts) {
        const c = window.getContacts().find(x => x.id === cid);
        if (c && c.name) return c.name;
      }
    } catch (e) {}
    return 'TA';
  }
  // 检查到期回信计划并落地（启动时 + 每分钟 tick 调用）
  // v3.7.x：改为遍历各联系人——原实现单定时器用 store（当前激活桌面），回信计划
  //   读写当前桌面，用户在 A 桌面时 B 的回信计划永远不落地。改为每个联系人独立
  //   checkPendingReplyFor(cid)，用 csFor(cid) 读写各自命名空间。
  function checkPendingReplyFor(cid) {
    try {
      const now = Date.now();
      const pending = replyPendingLoad(cid);
      if (!pending.length) return;
      const name = partnerNameFor(cid);
      const rest = [];
      let changed = false;
      pending.forEach(p => {
        if (!p || !p.id) { changed = true; return; }
        const list = load(cid);
        const idx = list.findIndex(x => x.id === p.id);
        if (idx < 0) { changed = true; return; }          // 信件已不存在 → 丢弃计划
        if (list[idx].partnerReply) { changed = true; return; } // 已有 TA 回信 → 丢弃计划
        if (p.due > now) { rest.push(p); return; }        // 未到期 → 保留
        // 到期：落地 TA 回信
        list[idx].partnerReply = { content: p.content, tm: now };
        save(list, cid);
        notifyMailToChat(cid, name + ' 给你回了信');
        // v3.5.107：TA 回信且不在信箱页 → 前台桌面弹窗（仅当前激活桌面才弹，用户能看到）
        if (cid === (window.__activeCid || 'default') && window.showDeskPopup && !mailPageVisible()) {
          window.showDeskPopup({ name: '信箱', text: '给你回了一封信：' + p.content, onClick: openMailPage });
        }
        changed = true;
      });
      if (changed) replyPendingSave(rest, cid);
      if (cid === (window.__activeCid || 'default')) { render(); updateBadge(); }
    } catch (e) {}
  }
  function checkPendingReply() {
    const list = (window.getContacts && window.getContacts()) || [{ id: 'default' }];
    list.forEach(c => checkPendingReplyFor(c.id));
  }
  // 渲染列表
  function render() {
    const list = load().slice().sort((a, b) => b.tm - a.tm);
    const name = partnerName();
    const inEl = document.getElementById('mail-in-list');
    const outEl = document.getElementById('mail-out-list');
    // 收到的信：TA 来信 + 已回信
    const inList = list.filter(l => l.type === 'received');
    if (inEl) {
      inEl.innerHTML = inList.length
        ? inList.map(l => '<div class="mail-item" data-id="' + l.id + '"><div class="mail-item-av"><svg viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>' +
            '<div class="mail-item-body"><div class="mail-item-title">来自 ' + name +
              (l.myReply ? ' <span class="mail-tag">已回信</span>' : (l.read ? '' : ' <span class="mail-tag new">新来信</span>')) + '</div>' +
            '<div class="mail-item-desc">' + shortDesc(l.content) + '</div></div>' +
            '<div class="mail-item-time">' + fmtDT(l.tm) + '</div></div>').join('')
        : '<div class="ta-empty">还没有收到信，等等 TA 吧</div>';
      inEl.querySelectorAll('.mail-item').forEach(it => it.addEventListener('click', () => {
        const l = list.find(x => x.id === it.dataset.id);
        if (l) openLetter(l);
      }));
    }
    // 寄出的信
    const outList = list.filter(l => l.type === 'sent');
    if (outEl) {
      outEl.innerHTML = outList.length
        ? outList.map(l => '<div class="mail-item" data-id="' + l.id + '"><div class="mail-item-av"><svg viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>' +
            '<div class="mail-item-body"><div class="mail-item-title">寄给 ' + name + (l.partnerReply ? ' <span class="mail-tag">对方已回信</span>' : '') + '</div>' +
            '<div class="mail-item-desc">' + shortDesc(l.content) + '</div></div>' +
            '<div class="mail-item-time">' + fmtDT(l.tm) + '</div></div>').join('')
        : '<div class="ta-empty">还没有寄出任何信，提笔写一封吧</div>';
      outEl.querySelectorAll('.mail-item').forEach(it => it.addEventListener('click', () => {
        const l = list.find(x => x.id === it.dataset.id);
        if (l) openLetter(l);
      }));
    }
  }
  // 存储时保留媒体标记前缀（sticker:/image:）——渲染时靠前缀区分表情包小图/图片大图
  // v3.6.x：旧实现提交时剥掉前缀，renderBody 匹配不到 sticker: 导致表情包按大图显示；
  // 现在保留前缀存储；历史无前缀数据仍按大图显示不变
  // 寄信
  function sendLetter() {
    const input = document.getElementById('mail-input');
    // v3.6.x：保留 sticker:/image: 标记前缀（区分图片/表情包类型），不再剥掉
    const content = input ? input.value.trim() : '';
    if (!content) { toast('信件内容不能为空'); return; }
    const name = partnerName();
    const title = TITLES[Math.floor(Math.random() * TITLES.length)];
    const letter = { id: 'l_' + Date.now(), type: 'sent', tt: title, content: content, tm: Date.now(), myReply: { content: content, tm: Date.now() } };
    const list = load();
    list.unshift(letter);
    save(list);
    if (input) input.value = '';
    if (window.chatAddSystem) window.chatAddSystem('你给 ' + name + ' 写了一封信');
    toast('信件已寄出');
    render();
  }
  // ================= TA 主动来信（定时机制，概率可在回复设置-信箱调整） =================
  const TA_LETTERS = [
    '最近总是想起我们以前聊的那些话。时间过得真快，但有些东西一直没变。给我回信吧。',
    '今天路过一个地方，突然很想你。最近过得还好吗？想听听你的消息。',
    '忽然想给你写封信。有些话，用字卡说不完，写下来好像更踏实。',
    '晚安前突然想起你。最近有没有好好休息？有空给我回封信吧。',
    '今天看到一片很好看的云，第一反应是想拍给你看。想你了。'
  ];
  function mailCfg() {
    const c = (window.replyCfg && window.replyCfg()) || {};
    // v3.5.99：概率为 0/空 时回退默认值——防止 TA 永不写信/永不回信（旧数据可能把概率存成 0）
    const prob = (k, def) => {
      const v = c[k];
      return v !== undefined && v !== '' && Number(v) > 0 ? Number(v) : def;
    };
    return {
      // v3.6.x：最少/最多字卡条数（回复设置-信箱可调；默认 20~50）
      minCards: c['ml-min-cards'] !== undefined ? Number(c['ml-min-cards']) : 20,
      maxCards: c['ml-max-cards'] !== undefined ? c['ml-max-cards'] : 50,
      writeProb: prob('ml-write-prob', 30),
      writeMin: c['ml-write-min'] !== undefined ? c['ml-write-min'] : 1,
      writeMax: c['ml-write-max'] !== undefined ? c['ml-write-max'] : 120,
      // v3.6.x：每天最多来信（封），默认 3（回复设置-信箱可调）
      dailyMax: c['ml-write-daily-max'] !== undefined ? Number(c['ml-write-daily-max']) : 3,
      replyProb: prob('ml-reply-prob', 80),
      replyMin: c['ml-reply-min'] !== undefined ? c['ml-reply-min'] : 1,
      replyMax: c['ml-reply-max'] !== undefined ? c['ml-reply-max'] : 120,
      kaomojiEn: c['ml-kaomoji-en'] !== undefined ? c['ml-kaomoji-en'] : 1,
      emojiEn: c['ml-emoji-en'] !== undefined ? c['ml-emoji-en'] : 1,
      stickerEn: c['ml-sticker-en'] !== undefined ? c['ml-sticker-en'] : 1
    };
  }
  // 字卡库分类（与聊天/朋友圈同一套规则）：文字 / 颜文字 / emoji / 表情包(图片)
  // v3.6.x：用户未添加自定义字卡时（内置预设已移除）用系统默认字卡补池——
  //   否则信件只能从 5 条固定文案里抽，内容单一且条数上限超过池子时爆重复
  // v3.7.x：补池受「信箱使用」场景开关控制（默认字卡-设置页可关闭）
  function mailCardPool(cid) {
    const custom = cid ? (window.getCustomCardsFor ? window.getCustomCardsFor(cid) : []) : ((window.getCustomCards && window.getCustomCards()) || []);
    const text = [], kaomoji = [], emoji = [];
    const pushDefault = () => {
      try {
        if (window.defaultCardUse && !window.defaultCardUse('mail')) return;
        if (!text.length) {
          const dg = (window.getDefaultCardGroups && window.getDefaultCardGroups('main')) || [];
          dg.forEach(g => (g[1] || []).forEach(c => { if (typeof c === 'string' && c) text.push(c); }));
        }
        if (!kaomoji.length) {
          const kg = (window.getDefaultCardGroups && window.getDefaultCardGroups('kaomoji')) || [];
          kg.forEach(g => (g[1] || []).forEach(c => { if (typeof c === 'string' && c) kaomoji.push(c); }));
        }
        if (!emoji.length) {
          const eg = (window.getDefaultCardGroups && window.getDefaultCardGroups('emoji')) || [];
          eg.forEach(g => (g[1] || []).forEach(c => { if (typeof c === 'string' && c) emoji.push(c); }));
        }
      } catch (e) {}
    };
    custom.forEach(s => {
      if (!s || typeof s !== 'string') return;
      if (/^data:/.test(s)) return;
      // v3.6.x：语音字卡（文件名|||audio;base64）不以 data: 开头，需单独丢弃——
      //   否则整段音频 base64 会被当文字写进信件
      if (s.indexOf('|||') >= 0) return;
      let isEmoji = false;
      for (const ch of s) {
        const c = ch.codePointAt(0);
        if ((c >= 0x1F000 && c <= 0x1FAFF) || (c >= 0x2600 && c <= 0x27BF)) { isEmoji = true; break; }
      }
      if (isEmoji) { emoji.push(s); return; }
      if (/[\(（｡◕(◕)(づ｡(¬)]/.test(s) && /[\)）】)]/.test(s)) { kaomoji.push(s); return; }
      text.push(s);
    });
    pushDefault();
    return {
      text: text,
      kaomoji: kaomoji,
      emoji: emoji,
      sticker: cid ? (window.getMediaCardsFor ? window.getMediaCardsFor(cid, 'sticker') : []) : ((window.getMediaCards && window.getMediaCards('sticker')) || []),
      image: cid ? (window.getMediaCardsFor ? window.getMediaCardsFor(cid, 'image') : []) : ((window.getMediaCards && window.getMediaCards('image')) || [])
    };
  }
  // TA 写信内容：多个字卡（空格分隔）+ 概率加颜文字/emoji/表情包
  function taLetterContent(cfg, cid) {
    const pool = mailCardPool(cid);
    const words = pool.text.length ? pool.text : TA_LETTERS;
    // v3.6.x：条数在「最少/最多字卡条数」之间随机；上限不超过池子大小——
    // 移除自定义字卡内置预设后用户没添加字卡时 words 回退为固定文案，
    // 条数超过池子会从同几段里反复抽 → 内容复制粘贴很多次（已修）。
    const maxN = Math.max(1, words.length);
    const wantMin = Math.min(Math.max(1, cfg.minCards || 1), maxN);
    const wantMax = Math.min(Math.max(wantMin, cfg.maxCards || wantMin), maxN);
    const n = wantMin + Math.floor(Math.random() * (wantMax - wantMin + 1));
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(words[Math.floor(Math.random() * words.length)]);
    let t = parts.join(' ');
    if (cfg.kaomojiEn && pool.kaomoji.length && Math.random() * 100 < 30) t += ' ' + pool.kaomoji[Math.floor(Math.random() * pool.kaomoji.length)];
    if (cfg.emojiEn && pool.emoji.length && Math.random() * 100 < 15) t += ' ' + pool.emoji[Math.floor(Math.random() * pool.emoji.length)];
    const st = pool.sticker.concat(pool.image);
    if (cfg.stickerEn && st.length && Math.random() * 100 < 20) t += ' ' + st[Math.floor(Math.random() * st.length)];
    return t;
  }
  function letterLast(cid) { const v = parseInt(csFor(cid).get('mail-letter-last'), 10); return isNaN(v) ? 0 : v; }
  function letterNext(cid) { const v = parseFloat(csFor(cid).get('mail-letter-next')); return isNaN(v) ? 0 : v; }
  // v3.6.x：每日来信计数（按自然日）——mail-letter-day 存 { d:'日期', n:当天来信数 }
  function letterDayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function letterDayCount(cid) {
    try {
      const r = JSON.parse(csFor(cid).get('mail-letter-day') || 'null');
      return r && r.d === letterDayKey() ? Number(r.n) || 0 : 0;
    } catch (e) { return 0; }
  }
  function letterDayAdd(cid) {
    const n = letterDayCount(cid) + 1;
    try { csFor(cid).set('mail-letter-day', JSON.stringify({ d: letterDayKey(), n: n })); } catch (e) {}
    return n;
  }
  // v3.7.x：单联系人的 TA 来信——用该联系人自己的字卡 + 写到该联系人命名空间。
  //   原实现 maybeIncomingLetter 单定时器用 store（当前激活桌面），用户在 default
  //   桌面时所有联系人的来信都写到 default 命名空间 → 串桌面（default 桌面堆所有
  //   联系人的信，切到其它桌面看不到自己的信）。改为遍历各联系人，每个独立写各自
  //   命名空间，互不串。前台弹窗仅当前激活桌面才弹（用户能看到），非当前桌面走
  //   notifyMailToChat 写该桌面聊天系统消息（下次切到该桌面可见）。
  function maybeIncomingLetterFor(cid) {
    try {
      const cs = csFor(cid);
      const now = Date.now();
      const cfg = mailCfg();
      let last = letterLast(cid), next = letterNext(cid);
      if (last > now || last < 0 || isNaN(last)) { last = 0; next = 0; }
      if ((now - last) / 60000 < next) return;
      const dailyMax = cfg.dailyMax > 0 ? cfg.dailyMax : 3;
      if (letterDayCount(cid) >= dailyMax) {
        cs.set('mail-letter-last', String(now));
        cs.set('mail-letter-next', String(30));
        return;
      }
      if (Math.random() * 100 >= cfg.writeProb) return;
      const name = partnerNameFor(cid);
      const content = taLetterContent(cfg, cid);
      const letter = { id: 'l_' + Date.now() + '_' + cid, type: 'received', tt: TITLES[Math.floor(Math.random() * TITLES.length)], content: content, tm: Date.now() };
      const list = load(cid);
      list.unshift(letter);
      save(list, cid);
      cs.set('mail-letter-last', String(now));
      cs.set('mail-letter-next', String(cfg.writeMin + Math.random() * Math.max(1, cfg.writeMax - cfg.writeMin)));
      letterDayAdd(cid);
      notifyMailToChat(cid, '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>' + name + ' 给你寄来了一封信');
      // 前台弹窗 + 角标刷新仅当前激活桌面（用户能看到）；非当前桌面下次切回时 load 自然显示
      if (cid === (window.__activeCid || 'default')) {
        updateBadge();
        render();
        if (window.showDeskPopup && !mailPageVisible()) {
          window.showDeskPopup({ name: '信箱', text: '给你寄来了一封信：' + content, onClick: openMailPage });
        }
      }
    } catch (e) {}
  }
  function maybeIncomingLetter() {
    const list = (window.getContacts && window.getContacts()) || [{ id: 'default' }];
    list.forEach(c => maybeIncomingLetterFor(c.id));
  }
  setTimeout(() => {
    setInterval(() => { maybeIncomingLetter(); checkPendingReply(); }, 60000);
    maybeIncomingLetter();
    checkPendingReply(); // v3.6.x：启动立即补上「刷新期间已到期」的 TA 回信
  }, (20 + Math.random() * 40) * 1000);

  // ================= 入口与交互 =================
  const mailApp = document.querySelector('.app[data-app="mail"]');
  const mailPage = document.getElementById('page-mail');
  if (mailApp && mailPage) {
    mailApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      openMailPage();
    });
  }
  const mailBack = document.getElementById('mail-back');
  if (mailBack) mailBack.addEventListener('click', () => {
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    const phone = document.getElementById('page-phone');
    if (phone) phone.hidden = false;
  });
  // 写信：写信 tab 按钮 / 独立写信页
  const openWriteBtn = document.getElementById('mail-open-write');
  if (openWriteBtn) {
    openWriteBtn.addEventListener('click', () => {
      const toEl = document.getElementById('mail-write-to');
      if (toEl) toEl.textContent = partnerName();
      showPage('page-mail-write');
    });
  }
  const mailWriteBack = document.getElementById('mail-write-back');
  if (mailWriteBack) mailWriteBack.addEventListener('click', () => { if (window.closeEmojiPanel) window.closeEmojiPanel(); showPage('page-mail'); });
  const mailSend = document.getElementById('mail-send');
  if (mailSend) mailSend.addEventListener('click', sendLetter);
  // 回信页：返回 / 寄出
  const mailReplyBack = document.getElementById('mail-reply-back');
  if (mailReplyBack) mailReplyBack.addEventListener('click', () => { if (window.closeEmojiPanel) window.closeEmojiPanel(); viewLetter = null; showPage('page-mail'); });
  const mailReplySend = document.getElementById('mail-reply-send');
  if (mailReplySend) mailReplySend.addEventListener('click', submitReply);
  // tab 切换
  document.querySelectorAll('#page-mail .fav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      mtab = tab.dataset.mtab;
      document.querySelectorAll('#page-mail .fav-tab').forEach(x => x.classList.toggle('sel', x === tab));
      document.querySelectorAll('#page-mail .cal-card').forEach(c => { c.hidden = c.dataset.mpanel !== mtab; });
    });
  });

  // ================= 写信/回信：表情包 / 图片 工具栏（v3.6.x 只留这两个按钮） =================
  // 表情包：直接复用聊天页同一个表情包面板（window.openEmojiPanelForInsert），
  // 界面/分组/数据与聊天完全一致；点击表情以 sticker:dataURL 插入信纸（渲染时显示小图）。
  // 图片：多选上传 → 压缩到 720px 后按大图（image:）插入信纸。
  // 向写信/回信输入框追加内容（插入到光标处）
  function mailInsertInto(textarea, s) {
    if (!textarea) return;
    // v3.5.135：contenteditable 转换模式（__ceBox）——插入**图片缩略图**而非纯文本，
    // 否则输入框里显示一大串 base64 字母；隐藏的 span 保留完整标记文本供 value 读取
    if (textarea.__ceBox) {
      try {
        const box = textarea.__ceBox;
        box.focus();
        const sel = window.getSelection();
        let node = box;
        let offset = 0;
        if (sel && sel.rangeCount && box.contains(sel.anchorNode)) {
          offset = sel.anchorOffset;
          node = sel.anchorNode;
        }
        const range = document.createRange();
        range.setStart(node, offset);
        range.collapse(true);
        // 图片缩略图（dataURL 直接作 src；sticker 小图/图片大图都用中等缩略）
        const img = document.createElement('img');
        img.src = String(s).replace(/^(?:sticker|image):/, '');
        img.style.cssText = 'max-width:120px;max-height:120px;border-radius:8px;vertical-align:middle;margin:2px;display:inline-block;';
        img.contentEditable = 'false';
        // 隐藏文本占位（完整标记文本，供 value getter 读回存储）
        const span = document.createElement('span');
        span.className = 'mail-media-mark';
        span.style.display = 'none';
        span.textContent = s;
        span.contentEditable = 'false';
        // v3.6.x：用 DocumentFragment 一次性插入保证 DOM 顺序为 img → span → 空格。
        // 直接连续 range.insertNode 每次都插到 range 起点且起点不移动，结果是逆序
        // （span 跑到 img 前面）；mobile-adapt 的 value getter 靠「img 后紧跟标记 span」
        // 跳过 img 去重，逆序时检测失败 → 同一张图被输出两遍（信件里表情包变两个）。
        const frag = document.createDocumentFragment();
        frag.appendChild(img);
        frag.appendChild(span);
        frag.appendChild(document.createTextNode(' '));
        range.insertNode(frag);
        // 光标移到插入内容之后
        range.setStartAfter(span);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        // 触发 input 事件（业务可能监听）
        try { textarea.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        return;
      } catch (e) {
        // 回退到文本插入
      }
    }
    try {
      let start = textarea.selectionStart;
      if (typeof start !== 'number' || isNaN(start)) start = textarea.value.length;
      const end = start;
      textarea.value = textarea.value.slice(0, start) + s + textarea.value.slice(end);
      textarea.focus();
      const pos = start + s.length;
      textarea.setSelectionRange(pos, pos);
    } catch (e) {
      textarea.value += s;
    }
  }
  // 上传本地图片：多选 → 压缩到 720px 后按大图（image:）插入信纸
  function mailUploadImage(textarea) {
    const fi = document.createElement('input');
    fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true;
    fi.onchange = () => {
      const files = Array.prototype.slice.call(fi.files || []);
      if (!files.length) return;
      files.forEach(f => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            try {
              const c = document.createElement('canvas');
              const scale = Math.min(1, 720 / Math.max(img.width, img.height));
              c.width = Math.max(1, Math.round(img.width * scale));
              c.height = Math.max(1, Math.round(img.height * scale));
              c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
              mailInsertInto(textarea, 'image:' + c.toDataURL('image/png'));
            } catch (err) {
              mailInsertInto(textarea, 'image:' + reader.result);
            }
          };
          img.onerror = () => toast('图片读取失败');
          img.src = reader.result;
        };
        reader.onerror = () => toast('图片读取失败');
        reader.readAsDataURL(f);
      });
    };
    fi.click();
  }
  // 绑定写信/回信工具栏（v3.6.x 只保留 表情包 / 图片 两个按钮）
  function bindMailToolbar(scope, textareaId) {
    const root = document.querySelector(scope);
    const textarea = document.getElementById(textareaId);
    if (!root || !textarea) return;
    const stickerBtn = root.querySelector('.mail-tb-sticker');
    if (stickerBtn) stickerBtn.addEventListener('click', (e) => {
      // stopPropagation：防止冒泡到 document 的「面板外点击关闭」把刚打开的面板又关掉
      e.stopPropagation();
      // 复用聊天同一个表情包面板（插入模式：点击表情插入信纸）
      if (window.openEmojiPanelForInsert) window.openEmojiPanelForInsert((src) => mailInsertInto(textarea, 'sticker:' + src));
    });
    const upImg = root.querySelector('.mail-tb-image');
    if (upImg) upImg.addEventListener('click', () => mailUploadImage(textarea));
  }
  bindMailToolbar('#page-mail-write', 'mail-input');
  bindMailToolbar('#page-mail-reply', 'mail-reply-input');

  // ================= 信箱数据：导出 / 导入 / 清空（v3.6.x） =================
  // 数据就是 mail-letters 数组（含收信/寄信/回信/对方回信），导出为 JSON 下载；
  // 导入按信件 id 去重合并；清空需确认，同时清掉待回信计划。
  function mailExportData() {
    const list = load();
    const json = JSON.stringify({ version: '1.0', app: 'mochi-mail', exportTime: new Date().toISOString(), letters: list }, null, 2);
    try {
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '信箱数据_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('已导出 ' + list.length + ' 封信');
    } catch (e) { toast('导出失败'); }
  }
  // 兼容旧 iOS：读取文件文本（File.text() 不支持时退回 FileReader）
  function mailReadFileText(file) {
    return new Promise((resolve) => {
      if (typeof file.text === 'function') {
        file.text().then(resolve).catch(() => readViaReader());
      } else readViaReader();
      function readViaReader() {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => resolve('');
        r.readAsText(file, 'utf-8');
      }
    });
  }
  function mailImportFile(file) {
    mailReadFileText(file).then((text) => {
      let arr = null;
      try {
        const data = JSON.parse(text || 'null');
        if (Array.isArray(data)) arr = data;
        else if (data && Array.isArray(data.letters)) arr = data.letters;
      } catch (e) {}
      if (!arr || !arr.length) { toast('无效的信箱数据文件'); return; }
      const valid = arr.filter(x => x && typeof x === 'object' && x.id);
      if (!valid.length) { toast('文件中没有有效的信件数据'); return; }
      const cur = load();
      // 按 id 去重合并：导入的信件覆盖同 id，新增的追加
      const map = {};
      cur.forEach(l => { if (l && l.id) map[l.id] = l; });
      valid.forEach(l => { map[l.id] = l; });
      const merged = Object.keys(map).map(k => map[k]);
      if (window.openModal) {
        window.openModal('导入 ' + valid.length + ' 封信？', '', () => {
          save(merged);
          viewLetter = null;
          render();
          updateBadge();
          toast('已导入 ' + valid.length + ' 封信（共 ' + merged.length + ' 封）');
        }, { noInput: true, staticText: '将合并进现有信箱（当前 ' + cur.length + ' 封）：\n· 导入 ' + valid.length + ' 封，其中 ' + (valid.length - (merged.length - cur.length)) + ' 封覆盖同 id 旧信\n· 同 id 以导入内容为准，其余保留\n导入后共 ' + merged.length + ' 封。' });
      }
    });
  }
  function mailClearAll() {
    const n = load().length;
    if (window.openModal) {
      window.openModal('清空所有信件？', '', () => {
        save([]);
        replyPendingSave([]); // 同时清掉未到期的 TA 回信计划
        viewLetter = null;
        render();
        updateBadge();
        toast('信箱已清空');
      }, { noInput: true, staticText: '将删除全部 ' + n + ' 封信（收信/寄信/回信），且无法恢复。' });
    }
  }
  // 删除单封信：确认后移除该信及其 TA 回信计划，关闭详情并刷新列表/角标
  function deleteLetter(l) {
    if (!l || !l.id) return;
    if (window.openModal) {
      window.openModal('删除这封信？', '', () => {
        const list = load();
        save(list.filter(x => x.id !== l.id));
        const pending = replyPendingLoad().filter(p => !p || p.id !== l.id);
        replyPendingSave(pending);
        viewLetter = null;
        render();
        updateBadge();
        const mask = document.getElementById('tc-mask');
        if (mask) mask.hidden = true;
        toast('信件已删除');
      }, { noInput: true, staticText: '删除后将无法恢复。' });
    }
  }
  const mailExportBtn = document.getElementById('mail-export');
  if (mailExportBtn) mailExportBtn.addEventListener('click', mailExportData);
  const mailImportBtn = document.getElementById('mail-import');
  if (mailImportBtn) {
    mailImportBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (f) mailImportFile(f);
      };
      input.click();
    });
  }
  const mailClearBtn = document.getElementById('mail-clear');
  if (mailClearBtn) mailClearBtn.addEventListener('click', mailClearAll);

  render();
  updateBadge();

  // v3.5.94：信件含图片 dataURL，可能只存在 IndexedDB → 启动补读（信箱打开时才渲染，届时读到）
  // v3.5.120：改为权威加载——每次启动都从 IDB 读 mail-letters，并合并暂存期间
  // （mailDbReady=false）用户写入的信件/已读标记（按 id 覆盖 + 按 tm 保序），
  // 就绪后重渲染。修复「刷新后信箱数据丢失」：旧逻辑只在 localStorage 空时补读一次，
  // 补读窗口内任何 save([]) 都会先覆盖 IDB，导致补读被跳过、信件永久丢失。
  // v3.6.x：① 合并基准扩展——原实现只在「IDB 有信件」时合并 mailPending，IDB 空时
  // 暂存被静默丢弃；改为：基准 = IDB 信件（备份导入语义），否则当前 localStorage，
  // 暂存按 id 覆盖合并后落盘。② 保险丝后 IDB 迟到返回时取并集，不覆盖已落盘信件。
  function mailMergeFromIdb(v) {
    try {
      const pending = mailPending || [];
      mailPending = null;
      let base = [];
      if (v && typeof v === 'string' && v.length > 2) {
        const idbArr = JSON.parse(v);
        if (Array.isArray(idbArr)) base = idbArr;
      }
      let cur = null;
      if (mailDbReady || !base.length) {
        // 保险丝已就绪：store 里已含暂存信件，并集保留；IDB 空：保留本地旧信
        try { cur = JSON.parse(store.get(KEY) || '[]'); } catch (e) { cur = []; }
      }
      const merged = mergeLists(base, mergeLists(cur || [], pending));
      if (merged.length) { store.set(KEY, JSON.stringify(merged)); writeSnap(merged); }
    } catch (e) { /* 解析失败：仍置就绪，避免下次启动重复合并 */ }
  }
  try {
    if (window.idbGet) {
      window.idbGet(window.activePrefix() + ':' + KEY).then(v => {
        mailMergeFromIdb(v);
        mailDbReady = true;
        render();
        updateBadge();
      });
    } else {
      mailDbReady = true;
    }
  } catch (e) { mailDbReady = true; }
  // v3.6.x：权威读取保险丝——IndexedDB 打开/读取在个别手机（OPPO 雨见浏览器后台
  // 挂起/存储异常）可能迟迟不返回，mailDbReady 一直为 false，来信只进内存暂存：
  // 弹窗提示了「给你寄来了一封信」信箱却空白、刷新后信件丢失。15 秒后强制就绪并
  // 把暂存信件落盘（与 idbRestore 的 12s 保险同理；正常情况 idbGet 早已返回，
  // 该保险只在病理场景触发，mailDbReady 已真时直接跳过）
  setTimeout(function () {
    if (mailDbReady) return;
    try {
      const all = load();
      if (all.length) store.set(KEY, JSON.stringify(all));
    } catch (e) {}
    mailDbReady = true;
    render();
    updateBadge();
  }, 15000);

  // v3.6.x：多桌面——切换联系人后重置信箱状态并重新从新桌面的 IDB 权威加载。
  // 若不重置，mailDbReady/mailPending 仍属旧桌面：load() 读的是新桌面持久层，
  // 但暂存信件（mailPending）会按 id 合并进来（串桌面）；权威已就绪标志也会
  // 让 save() 直接把新桌面数据写进 store（正确），但旧桌面暂存仍残留。
  document.addEventListener('contact-switched', function () {
    try {
      mailDbReady = false;
      mailPending = null;
      // v3.7.x：补 15s 保险丝（与启动 line 798 同理）——切换联系人后 idbGet 在
      // 个别手机（华为/edge/OPPO 后台挂起）可能不返回，mailDbReady 永远 false →
      // 之后 save() 只暂存内存不落盘，新来信刷新即丢。chat.js 切换时调了
      // armReadyFuse()，mail 缺这步。到期强制就绪并把暂存信件落盘。
      let fuseFired = false;
      const fuse = setTimeout(function () {
        if (fuseFired || mailDbReady) return;
        fuseFired = true;
        try {
          const all = load();
          if (all.length) store.set(KEY, JSON.stringify(all));
        } catch (e) {}
        mailDbReady = true;
        render();
        updateBadge();
      }, 15000);
      if (window.idbGet) {
        window.idbGet(window.activePrefix() + ':' + KEY).then(v => {
          if (fuseFired) return; // 保险丝已先就绪，idbGet 迟到则跳过（load 已含暂存）
          clearTimeout(fuse);
          mailMergeFromIdb(v);
          mailDbReady = true;
          render();
          updateBadge();
        }).catch(() => {
          if (fuseFired) return;
          clearTimeout(fuse);
          mailDbReady = true; render(); updateBadge();
        });
      } else {
        clearTimeout(fuse);
        mailDbReady = true;
        render();
        updateBadge();
      }
    } catch (e) { mailDbReady = true; }
  });
})();
