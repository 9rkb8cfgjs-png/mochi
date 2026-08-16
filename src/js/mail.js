// ===== 功能：信箱（仿星言简约版【星言信箱】，矢量图简约风格） =====
// 收信（TA 主动来信）/ 寄信 / 回信；信纸样式展示；聊天里插入写信/回信/来信提示
(function () {
  const uid = 'xy-home-v2';
  const store = window.xyStore(uid);
  const KEY = 'mail-letters';
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
  function load() { try { return JSON.parse(store.get(KEY) || '[]'); } catch (e) { return []; } }
  function save(list) { store.set(KEY, JSON.stringify(list)); }

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
  // 正文支持字卡库图片（dataURL）直接显示；插入的媒体带标记前缀（sticker:/image:）
  // 以区分表情包小图 / 图片大图；旧数据无标记按大图显示
  // v3.6.x：完整 HTML 转义（只转 < 可被 `&lt;…&gt;` 实体绕过注入）
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function renderBody(content) {
    const s = String(content || '');
    let html = '';
    const re = /((?:sticker|image):)?(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      html += escHtml(s.slice(last, m.index));
      const cls = m[1] === 'sticker:' ? 'mail-body-img mail-body-img-stk' : 'mail-body-img';
      html += '<img class="' + cls + '" src="' + m[2] + '" alt="表情">';
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
    // 底部按钮：收到的信且未回信 → 提笔回信（打开独立回信页）
    let footer = '';
    if (l.type === 'received' && !l.myReply) {
      footer = '<div class="mail-actions"><button class="cc-tool" id="mail-reply-btn">提笔回信</button><button class="cc-tool" id="mail-close2">关闭</button></div>';
    } else {
      footer = '<div class="mail-actions"><button class="cc-tool" id="mail-close2">关闭</button></div>';
    }
    if (window.openTCPanel) window.openTCPanel('信件', html + footer);
    const close2 = document.getElementById('mail-close2');
    if (close2) close2.addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; viewLetter = null; });
    const replyBtn = document.getElementById('mail-reply-btn');
    if (replyBtn) replyBtn.addEventListener('click', () => openReply(l));
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
    if (origEl) origEl.innerHTML = letterPaper(l.tt || '来信', l.content, fmtDT(l.tm), name);
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
    // v3.6.x：保留 sticker:/image: 标记前缀（渲染区分大小图），不再剥掉
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
    }
  }
  // ===== TA 回信计划（持久化）：回信命中概率后，TA 的回信写入本地计划 =====
  // 到期由 checkPendingReply 落地为 partnerReply；刷新/重开页面不丢（旧逻辑用内存
  // setTimeout，刷新即丢失，回信永远收不到）。
  const REPLY_PENDING_KEY = 'mail-reply-pending';
  function replyPendingLoad() {
    try { const v = JSON.parse(store.get(REPLY_PENDING_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function replyPendingSave(arr) { try { store.set(REPLY_PENDING_KEY, JSON.stringify(arr)); } catch (e) {} }
  // 检查到期回信计划并落地（启动时 + 每分钟 tick 调用）
  function checkPendingReply() {
    try {
      const now = Date.now();
      const pending = replyPendingLoad();
      if (!pending.length) return;
      const name = partnerName();
      const rest = [];
      let changed = false;
      pending.forEach(p => {
        if (!p || !p.id) { changed = true; return; }
        const list = load();
        const idx = list.findIndex(x => x.id === p.id);
        if (idx < 0) { changed = true; return; }          // 信件已不存在 → 丢弃计划
        if (list[idx].partnerReply) { changed = true; return; } // 已有 TA 回信 → 丢弃计划
        if (p.due > now) { rest.push(p); return; }        // 未到期 → 保留
        // 到期：落地 TA 回信
        list[idx].partnerReply = { content: p.content, tm: now };
        save(list);
        if (window.chatAddSystem) window.chatAddSystem(name + ' 给你回了信');
        // v3.5.107：TA 回信且不在信箱页 → 前台桌面弹窗（点击进信箱）
        if (window.showDeskPopup && !mailPageVisible()) {
          window.showDeskPopup({ name: '信箱', text: '给你回了一封信：' + p.content, onClick: openMailPage });
        }
        changed = true;
      });
      if (changed) replyPendingSave(rest);
      updateBadge();
    } catch (e) {}
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
    // v3.6.x：保留 sticker:/image: 标记前缀（渲染区分大小图），不再剥掉
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
      maxCards: c['ml-max-cards'] !== undefined ? c['ml-max-cards'] : 100,
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
  function mailCardPool() {
    const custom = (window.getCustomCards && window.getCustomCards()) || [];
    const text = [], kaomoji = [], emoji = [];
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
    return {
      text: text,
      kaomoji: kaomoji,
      emoji: emoji,
      sticker: (window.getMediaCards && window.getMediaCards('sticker')) || [],
      image: (window.getMediaCards && window.getMediaCards('image')) || []
    };
  }
  // TA 写信内容：多个字卡（空格分隔）+ 概率加颜文字/emoji/表情包
  function taLetterContent(cfg) {
    const pool = mailCardPool();
    const words = pool.text.length ? pool.text : TA_LETTERS;
    // v3.6.x：字卡数量上限按设置「最多字卡条数」生效（去掉旧的硬编码 8 上限）
    const n = 1 + Math.floor(Math.random() * Math.max(1, cfg.maxCards || 1));
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(words[Math.floor(Math.random() * words.length)]);
    let t = parts.join(' ');
    if (cfg.kaomojiEn && pool.kaomoji.length && Math.random() * 100 < 30) t += ' ' + pool.kaomoji[Math.floor(Math.random() * pool.kaomoji.length)];
    if (cfg.emojiEn && pool.emoji.length && Math.random() * 100 < 15) t += ' ' + pool.emoji[Math.floor(Math.random() * pool.emoji.length)];
    const st = pool.sticker.concat(pool.image);
    if (cfg.stickerEn && st.length && Math.random() * 100 < 20) t += ' ' + st[Math.floor(Math.random() * st.length)];
    return t;
  }
  function letterLast() { const v = parseInt(store.get('mail-letter-last'), 10); return isNaN(v) ? 0 : v; }
  function letterNext() { const v = parseFloat(store.get('mail-letter-next')); return isNaN(v) ? 0 : v; }
  // v3.6.x：每日来信计数（按自然日）——mail-letter-day 存 { d:'日期', n:当天来信数 }
  function letterDayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function letterDayCount() {
    try {
      const r = JSON.parse(store.get('mail-letter-day') || 'null');
      return r && r.d === letterDayKey() ? Number(r.n) || 0 : 0;
    } catch (e) { return 0; }
  }
  function letterDayAdd() {
    const n = letterDayCount() + 1;
    try { store.set('mail-letter-day', JSON.stringify({ d: letterDayKey(), n: n })); } catch (e) {}
    return n;
  }
  function maybeIncomingLetter() {
    try {
      if (document.hidden) return; // v3.5.127：后台不来信
      const now = Date.now();
      const cfg = mailCfg();
      let last = letterLast(), next = letterNext();
      if (last > now || last < 0 || isNaN(last)) { last = 0; next = 0; }
      // 星言机制：最短/最长写信时间（分钟）内随机一次间隔，间隔到点后每分钟掷一次概率，命中才来信
      if ((now - last) / 60000 < next) return;
      // v3.6.x：每天最多来信（封）——达上限后当天不再来信（30 分钟后重试，跨天自动清零）
      const dailyMax = cfg.dailyMax > 0 ? cfg.dailyMax : 3;
      if (letterDayCount() >= dailyMax) {
        store.set('mail-letter-last', String(now));
        store.set('mail-letter-next', String(30));
        return;
      }
      // 未命中：不重置间隔，下一轮 tick 继续掷（概率真实生效，不会出现"等 8 小时再掷一次"）
      if (Math.random() * 100 >= cfg.writeProb) return;
      const name = partnerName();
      const content = taLetterContent(cfg);
      const letter = { id: 'l_' + Date.now(), type: 'received', tt: TITLES[Math.floor(Math.random() * TITLES.length)], content: content, tm: Date.now() };
      const list = load();
      list.unshift(letter);
      save(list);
      store.set('mail-letter-last', String(now));
      store.set('mail-letter-next', String(cfg.writeMin + Math.random() * Math.max(1, cfg.writeMax - cfg.writeMin)));
      letterDayAdd();
      if (window.chatAddSystem) window.chatAddSystem('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>' + name + ' 给你寄来了一封信');
      updateBadge();
      render();
      // v3.5.107：TA 来信且不在信箱页 → 前台桌面弹窗（点击进信箱）
      if (window.showDeskPopup && !mailPageVisible()) {
        window.showDeskPopup({ name: '信箱', text: '给你寄来了一封信：' + content, onClick: openMailPage });
      }
    } catch (e) {}
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

  render();
  updateBadge();

  // v3.5.94：信件含图片 dataURL，可能只存在 IndexedDB → 启动补读（信箱打开时才渲染，届时读到）
  // v3.5.132：本地已有值时不覆盖（防补读窗口内新写的信被旧 IDB 值回退）
  try {
    if (window.idbGet) {
      window.idbGet(uid + ':' + KEY).then(v => {
        if (v && typeof v === 'string' && v.length > 2 && !store.get(KEY)) store.set(KEY, v);
        updateBadge();
      });
    }
  } catch (e) {}
})();
