// ===== 功能：聊天页 =====
// 桌面点「聊天」进入；顶部标题/双方头像读取桌面设置；可发送消息
// 联系人回复按「通用设置」概率链生成（被动回复 + 主动发送）
// 消息持久化到 localStorage，刷新后恢复
(function () {
  const body = document.getElementById('chat-body');
  if (!body) return;

  const uid = 'xy-home-v2';
  const store = window.xyStore(uid);

  // v3.5.116：收起输入法（手机端打开底部面板时先 blur，键盘不再挤压/遮挡面板）
  // v3.5.127：contenteditable 输入框（聊天输入栏 div 版）同样需 blur 收起输入法
  function closeIme() {
    try {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) ae.blur();
    } catch (e) {}
  }

  // ---- 消息存储 ----
  let msgs = [];
  // v3.6.x：本会话内被编辑/撤回/局部撤回过的消息索引——loadMsgs 用 IndexedDB 快照
  // 合并时，若命中索引（且与 IDB 条数对齐），以内存版本为准，防止防抖窗口内
  // 的编辑/撤回被旧 IDB 快照回滚（索引在消息只增不改的模型下稳定）
  const sessionChangedIdx = new Set();
  // v3.5.118：聊天记录权威加载防护——修复「导入后聊天记录丢失」的启动竞态：
  // 导入时聊天记录被挪进 IndexedDB（localStorage 无此键）；页面加载瞬间
  // 查岗/日常等模块会立即写入一条新消息（p2-features.doCheckin），此时 IDB
  // 权威数据尚未读回，若直接 saveMsgs 会用 [1条] 覆盖 IndexedDB 里的全部历史。
  // chatDbReady=false 期间 saveMsgs 只暂存内存、不落盘；loadMsgs 首次从 IDB
  // 读到完整历史后才置真，后续保存恢复正常双写。
  let chatDbReady = false;
  let pendingLocal = null; // 权威就绪前暂存的内存消息（绝不落盘，防止污染读取/覆盖 IDB）
  // v3.5.127：防抖——TA 连发多条（间隔 1-3s）时把多次全量序列化合并成一次
  //（历史上千条带图消息时每次 stringify 是几十 MB，逐条写会明显卡顿）
  // v3.6.x：聊天记录改为只写 IndexedDB——store.set 会同步写 localStorage
  //（<200KB 时），几千条带图记录下同步 setItem 会卡主线程；IDB 写入是异步的。
  // 读取路径（loadMsgs）同步改为 IDB 权威，localStorage 不再承担聊天记录快照。
  let saveTimer = null;
  function saveMsgs() {
    const data = JSON.stringify(msgs);
    // 权威未就绪：只暂存内存。既不能写 localStorage（会让 loadMsgs 第一步读到
    // 不完整的 [1条] 而忽略 IDB 权威），更不能写 IndexedDB（会覆盖历史）
    if (!chatDbReady) {
      try { pendingLocal = msgs.slice(); } catch (e) {}
      return;
    }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try { if (window.idbSet) window.idbSet(uid + ':chat-msgs', data); } catch (e) {}
    }, 400);
  }
  // v3.5.128：页面离开（刷新/关闭/切后台被回收）前强制落盘防抖窗口内的消息
  // v3.5.131：清除数据流程（window.__resetting）期间跳过——否则 beforeunload 会把
  // 清空前的聊天记录写回，等于没清
  function flushSave() {
    if (window.__resetting) return;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      try { if (window.idbSet) window.idbSet(uid + ':chat-msgs', JSON.stringify(msgs)); } catch (e) {}
    }
  }
  // v3.5.134：暴露给导出/清除等外部流程（导出前强制落盘，防止备份缺最后几条消息）
  window.chatFlushSave = flushSave;
  try {
    window.addEventListener('beforeunload', flushSave);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  } catch (e) {}
  // v3.5.127：暴露聊天记录内存数组（ta-ask/p2-features 等模块不要再 JSON.parse
  // 整条历史——几十 MB 的 stringify 结果每次解析几百毫秒，低端机点卡片即卡顿）
  window.getChatMsgs = function () { return msgs; };
  // v3.6.x：迁移历史乱码消息——之前「自动发送」把图片/表情包的 dataURL 当文本存了
  // （type='text'），渲染成超长 base64 乱码；按内容识别改回图片类型，历史恢复正常显示
  function migrateLegacyMediaMsgs() {
    let migrated = false;
    msgs.forEach(r => {
      if (r && (r.type === 'text' || !r.type) && typeof r.text === 'string' && r.text.indexOf('data:image/') === 0) {
        r.type = 'image';
        migrated = true;
      }
    });
    if (migrated) saveMsgs();
  }
  // v3.6.x：判断记录是否为「已作答」的互动卡片（小问题/好奇/吐槽/询问/邀请）
  function answeredRec(r) {
    if (!r) return false;
    if (r.special === 'ask-choose' && r.choiceStatus === 'answered') return true;
    if (r.special === 'ask-curious' && r.curiousStatus === 'answered') return true;
    if (r.special === 'ask-roast' && r.roastStatus === 'answered') return true;
    if (r.special === 'ask-card' && r.askStatus === 'answered') return true;
    if (r.special === 'invite' && r.inviteStatus === 'answered') return true;
    return false;
  }
  function loadMsgs() {
    // v3.6.x：聊天记录已改为只写 IndexedDB，这里不再优先读 localStorage 快照。
    // 仅当内存为空（首次启动/刷新）且 IDB 尚未读回时，用 localStorage 兜底渲染一次
    //（老版本数据/IDB 读取慢时的即时展示），IDB 权威合并后会覆盖它；
    // 后续读到 IDB 权威后会把 localStorage 残留清掉（见下）。
    if (!saveTimer && !msgs.length && !chatDbReady) {
      try { msgs = JSON.parse(store.get('chat-msgs') || '[]'); } catch (e) { msgs = []; }
      if (!Array.isArray(msgs)) msgs = [];
    }
    migrateLegacyMediaMsgs();
    // v3.5.119：每次进入聊天页都以 IndexedDB 为权威读一次并合并——
    // 手机上 IDB 读取可能偶发失败/时序靠后，之前"读完一次就置 chatDbReady 不再读"
    // 会让失败后的页面永远停留在空/残缺状态；现在每次 loadMsgs 都重试，
    // 且合并规则是「IDB 完整历史 + 本地更新的消息」，绝不覆盖 IDB 权威数据。
    try {
      if (window.idbGet) {
        window.idbGet(uid + ':chat-msgs').then(v => {
          if (v === undefined || v === null) {
            // IDB 无权威数据：若 localStorage 还有老版本数据，迁入 IDB 并清掉 LS 残留
            chatDbReady = true;
            const lsRaw = store.get('chat-msgs');
            if (lsRaw) {
              try {
                const lsArr = JSON.parse(lsRaw);
                if (Array.isArray(lsArr) && lsArr.length) {
                  if (window.idbSet) window.idbSet(uid + ':chat-msgs', lsRaw);
                  try { store.remove('chat-msgs'); } catch (e) {}
                }
              } catch (e) {}
            }
            return;
          }
          try {
            const idbArr = typeof v === 'string' ? JSON.parse(v) : v;
            if (!Array.isArray(idbArr)) { chatDbReady = true; return; }
            const idbLastTs = idbArr.length ? (idbArr[idbArr.length - 1].ts || 0) : 0;
            // 本地（暂存/当前内存）中比 IDB 最后一条更新的消息（启动瞬间注入的日常/查岗等）追加在末尾
            // v3.5.123：同 ts 的本地消息也保留（Date.now() 偶发与 IDB 末条同毫秒），
            // 用内容指纹去重防止与 IDB 已有消息重复
            const localNew = (pendingLocal || msgs || []).filter(m => {
              if (!m) return false;
              if (m.ts > idbLastTs) return true;
              if (m.ts < idbLastTs) return false;
              const sig = JSON.stringify({ t: m.text, s: m.side, i: m.img ? m.img.length : 0 });
              return !idbArr.some(x => x && x.text === m.text && x.side === m.side && JSON.stringify({ t: x.text, s: x.side, i: x.img ? x.img.length : 0 }) === sig);
            });
            const merged = idbArr.concat(localNew);
            // v3.6.x：防止过期快照把刚作答的卡片刷回未作答——
            // 用户点卡片作答后 saveMsgsNow 已把「已作答」状态写入 IDB；但若本次
            // idbGet 的快照早于那次写盘（低端机/大聊天记录读取慢，或其它模块
            // 恰在作答瞬间触发 loadMsgs），合并会把旧快照里的「未作答」卡片搬回来，
            // 表现就是：回答了但卡片不显示内容、还能重复点卡片再答。
            // 聊天记录只增不改（作答只是给旧记录打状态），按位置对齐后，
            // 内存中已作答的记录以内存版本为准，防止状态被回滚。
            const curArr = pendingLocal || msgs || [];
            // v3.6.x：本会话编辑/撤回过的消息，在「与 IDB 条数对齐」（同一批消息）
            // 时以内存版本为准——否则防抖窗口内 loadMsgs 用旧 IDB 快照把这些变更
            // 回滚，随后任意一次落盘就把「已编辑/已撤回」固化回旧内容（编辑/撤回失效）
            if (merged.length === curArr.length) {
              curArr.forEach((m, i) => {
                if (!m || i >= merged.length) return;
                if (sessionChangedIdx.has(i)) merged[i] = m;
              });
            }
            // 已作答卡片保护（原有逻辑，条数不一致时也生效）
            curArr.forEach((m, i) => {
              if (!m || i >= merged.length) return;
              if (!answeredRec(m) || answeredRec(merged[i])) return;
              merged[i] = m;
            });
            const changed = localNew.length > 0 || merged.length !== msgs.length;
            msgs = merged;
            // 条数不一致（IDB 快照与内存不是同一批消息）→ 索引已失效，清空会话改动标记
            if (merged.length !== curArr.length) sessionChangedIdx.clear();
            migrateLegacyMediaMsgs();
            pendingLocal = null;
            chatDbReady = true;
            // v3.6.x：IDB 权威已读到，清理老版本 localStorage 残留（老用户升级后
            // 聊天记录不再占 5MB 配额；读取路径已不再依赖它）
            try { store.remove('chat-msgs'); } catch (e) {}
            // v3.5.127：无变化（localNew 空且长度相同）时跳过重复写盘 + 全量重渲染
            // v3.6.x：IDB 合并产生新数据才写回（避免每次 loadMsgs 全量重写）
            if (changed) {
              try { if (window.idbSet) window.idbSet(uid + ':chat-msgs', JSON.stringify(msgs)); } catch (e) {}
              // 聊天页当前可见且贴近底部 → 重新渲染窗口，让恢复出的历史立即显示
              // v3.6.x：改用分页渲染（原全量 forEach 渲染几千条会卡顿）
              if (chatVisible() && chatNearBottom()) {
                renderWindow(false, true);
                scrollChatBottom();
              }
            }
          } catch (e) { /* 解析失败：不置 chatDbReady，下次进入再重试 */ }
        });
      }
    } catch (e) {}
    // 注意：换头像消息不做文案迁移——
    // 「昵称 更换了头像」是联系人自己换的头像（avatar-lib 自动随机/手动切换），
    // 「我 更换了 TA 的头像」是"我"给联系人换头像，两者都要保留原样
  // 旧消息迁移：来电消息里的铃铛图标 → 电话图标（历史消息的图标数据不会自动变）
  {
    const bellSvg = '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3M4.2 4.2l2.2 2.2M2 12h3M19 12h3M4.2 19.8l2.2-2.2M17.6 17.6l2.2 2.2"/><path d="M12 6a6 6 0 016 6v4h-3v-4a3 3 0 00-6 0v4H6v-4a6 6 0 016-6z"/><path d="M9 20h6"/></svg>';
    const telSvg = '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>';
    let iconMigrated = false;
    msgs.forEach(r => {
      if (r && typeof r.text === 'string' && r.text.indexOf(bellSvg) >= 0) {
        r.text = r.text.split(bellSvg).join(telSvg);
        iconMigrated = true;
      }
    });
    if (iconMigrated) saveMsgs();
  }
  // 旧消息迁移：来信提示里的 ✉️ emoji → 信封 SVG（历史消息的 emoji 不会自动变）
  {
    const envSvg = '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
    let envMigrated = false;
    msgs.forEach(r => {
      if (r && r.special === 'poke' && typeof r.text === 'string') {
        const t = r.text.replace(/✉️\s*/g, '').replace(/✉\s*/g, '');
        if (t !== r.text) { r.text = envSvg + t; envMigrated = true; }
      }
    });
    if (envMigrated) saveMsgs();
  }
    // 旧消息补时间戳（仅一次，保证每条都有精确到秒的时间）
    let changed = false;
    msgs.forEach(r => { if (r && !r.ts) { r.ts = Date.now(); changed = true; } });
    if (changed) saveMsgs();
  }

  // 头像回填（接受元素或 id）
  function fillAvatar(el, key) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    const data = store.get(key);
    el.innerHTML = data
      ? '<img src="' + data + '" alt="">'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="#999999" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg>';
  }
  // v3.5.113：供 personalize.js 在 IndexedDB 回填完成后重绘聊天头像
  window.fillAvatar = fillAvatar;
  fillAvatar('chat-user-av', 'avatar-user');
  fillAvatar('chat-partner-av', 'avatar-partner');
  // v3.5.113：IndexedDB 回填完成后（mochi-restore-done）轻量重绘——
  // 导入/配额异常恢复后聊天记录已在内存，聊天页可见时重新渲染一遍
  // v3.6.x：加贴底判断——数据恢复期间用户可能已在翻旧消息，全量重渲染
  // 会把滚动位置重置到底部（之前每条恢复消息也强制滚动到底）
  // v3.6.x：改用分页渲染（renderWindow）
  try {
    document.addEventListener('mochi-restore-done', function () {
      try {
        if (chatVisible() && chatNearBottom() && body && msgs.length) {
          renderWindow(false, true);
          scrollChatBottom();
        }
        fillAvatar('chat-user-av', 'avatar-user');
        fillAvatar('chat-partner-av', 'avatar-partner');
      } catch (e) {}
    });
  } catch (e) {}

  // 顶部标题 = 联系人的昵称
  const pname = document.getElementById('chat-partner-name');
  if (pname) {
    const saved = store.get('lbl-partner');
    if (saved) pname.textContent = saved;
  }

  // ---- 联系人「正在输入」状态 ----
  // typing 行位于消息区与输入栏之间（不悬浮、不覆盖消息）。
  // v3.5.44：typing 行出现/消失都会改变消息区高度，立即把聊天滚动到底，
  // 保证最后一条消息始终完整可见、不被这一行"顶出/遮挡"
  const typingEl = document.getElementById('chat-typing');
  let typingOn = false;
  function chatVisible() {
    const p = document.getElementById('page-chat');
    return !!(p && !p.hidden);
  }
  function scrollChatBottom() {
    const cb = document.getElementById('chat-body');
    if (cb) cb.scrollTop = cb.scrollHeight;
  }
  // v3.6.x：消息区是否「贴近底部」（最后一条可见）。追加消息自动滚动只在贴底时执行，
  // 用户正在翻旧消息时不打断阅读位置
  function chatNearBottom() {
    const cb = document.getElementById('chat-body');
    if (!cb) return true;
    return cb.scrollHeight - cb.scrollTop - cb.clientHeight < 120;
  }
  // v3.6.x：追加消息后滚动——批量渲染（进入聊天/恢复历史）或聊天页未打开时跳过；
  // 原实现 renderMsg 每条消息都执行 scrollTop=scrollHeight（同步布局，强制整页 reflow），
  // TA 连发多条（间隔 1-3s）时每条都卡一下 = 收消息卡顿的主因之一
  function maybeScrollChatBottom() {
    if (batchRendering || !chatVisible() || !chatNearBottom()) return;
    body.scrollTop = body.scrollHeight;
  }
  function showTyping() {
    if (!typingEl) return;
    typingOn = true;
    if (chatVisible()) {
      typingEl.hidden = false;
      // 行出现 → 消息区变矮 → 滚到底保持最后一条可见
      scrollChatBottom();
      setTimeout(scrollChatBottom, 60);
    }
  }
  function hideTyping() {
    if (!typingEl) return;
    typingOn = false;
    typingEl.hidden = true;
    // 行消失 → 消息区变高 → 保持底部对齐
    scrollChatBottom();
  }

  // ---- 概率工具 ----
  function cfg() { return (window.replyCfg && window.replyCfg()) || {}; }
  // 带默认值读取（replyCfg 异常/缺失时主动发送等不会失效）
  function cfgn(c, k, d) { const v = c[k]; return v === undefined ? d : v; }
  function hit(p) { return Math.random() * 100 < p; }
  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : ''; }
  function pickN(arr, n) {
    const copy = arr.slice();
    const out = [];
    while (copy.length && out.length < n) {
      out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return out;
  }

  // ---- 字卡池（按分类） ----
  function getPool() {
    const cards = (window.getCustomCards && window.getCustomCards()) || [];
    const text = [], kaomoji = [], emoji = [], sticker = [], image = [], voice = [], poke = [];
    // 媒体字卡（图片 dataURL）
    const mediaSticker = (window.getMediaCards && window.getMediaCards('sticker')) || [];
    const mediaImage = (window.getMediaCards && window.getMediaCards('image')) || [];
    const mediaVoice = (window.getMediaCards && window.getMediaCards('voice')) || [];
    sticker.push.apply(sticker, mediaSticker);
    image.push.apply(image, mediaImage);
    voice.push.apply(voice, mediaVoice);
    cards.forEach(c => {
      if (typeof c === 'string' && c.indexOf('data:') === 0) return; // dataURL 已按媒体分类
      // v3.6.x：语音字卡（文件名|||audio;base64）不以 data: 开头，需单独丢弃——
      //   否则整段音频 base64 会被当文字发进聊天
      if (typeof c === 'string' && c.indexOf('|||') >= 0) return;
      if (/[\uD800-\uDBFF]/.test(c) || /^[😀-🙏🌀-🫿]/u.test(c)) emoji.push(c);
      else if (/[\(（｡◕(◕)(づ｡(¬)]/.test(c) && /[\)）】)]/.test(c)) kaomoji.push(c);
      else text.push(c);
    });
    return { text, kaomoji, emoji, sticker, image, voice, poke };
  }

  // ---- 消息渲染 ----
  // 时间格式：精确到秒 HH:MM:SS
  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  // 聊天内语音播放：同一时间只播一条，播放中按钮高亮 + 波形动画
  let chatVoiceAudio = null;
  let chatVoiceBtn = null;
  function stopChatVoice() {
    if (chatVoiceAudio) { try { chatVoiceAudio.pause(); } catch (e) {} chatVoiceAudio = null; }
    if (chatVoiceBtn) { chatVoiceBtn.classList.remove('playing'); chatVoiceBtn = null; }
  }
  function playVoiceInChat(btn, src) {
    if (!src) { toast('语音数据缺失'); return; }
    if (chatVoiceBtn === btn) { stopChatVoice(); return; }
    stopChatVoice();
    const a = new Audio(src);
    chatVoiceAudio = a;
    chatVoiceBtn = btn;
    btn.classList.add('playing');
    a.addEventListener('ended', stopChatVoice);
    a.addEventListener('error', () => { stopChatVoice(); toast('语音播放失败'); });
    a.play().catch(() => { stopChatVoice(); toast('语音播放失败'); });
  }
  function quoteHtml(q, side) {
    // side = 被引用消息的发送方（'out'=我发，'in'=TA发）
    // v3.5.82：不再显示「引用 XX」标签行，只显示被引用的内容（方向也不再展示）
    if (q && typeof q === 'object') {
      // 组合消息引用：文字 + 图片缩略图（q = { t: 文字, imgs: [dataURL...] }）
      const imgs = (q.imgs || []).filter(s => typeof s === 'string' && s.indexOf('data:') === 0).slice(0, 3);
      const t = String(q.t || '');
      // t 若是 dataURL（纯表情包消息的 text 就是图片），不当作文字显示，避免 base64 乱码
      const tHtml = (t && t.indexOf('data:') !== 0) ? t.replace(/</g, '&lt;') : '';
      let inner = '';
      if (imgs.length) inner += '<span class="msg-quote-imgs">' + imgs.map(s => '<img class="msg-quote-img" src="' + s + '" alt="图片">').join('') + '</span>';
      if (tHtml) inner += '<span class="msg-quote-text">' + tHtml + '</span>';
      return '<div class="msg-quote">' + inner + '</div>';
    }
    if (typeof q === 'string' && q.indexOf('data:') === 0) {
      // 引用图片（表情包）缩略图
      return '<div class="msg-quote"><img class="msg-quote-img" src="' + q + '" alt="图片"></div>';
    }
    return '<div class="msg-quote"><span class="msg-quote-text">' + String(q || '').replace(/</g, '&lt;') + '</span></div>';
  }
  // v3.6.x：互动卡片就地作答——点击聊天里的互动卡片（小问题/好奇/吐槽/询问），
  // 直接在卡片内展开选项/输入框作答，不再强制弹窗。
  // TA 自动触发时的弹窗仍保留（带关闭按钮）；弹窗关闭后点卡片走就地作答。
  // 提交复用 window.chatChooseReply 等（它们会更新记录 + 发消息 + 就地重建卡片）。
  // 返回 true=就地展开成功；false=失败（调用方回退弹窗）
  function expandCardInPlace(idx, type) {
    const el = body.querySelector('.msg-ask[data-idx="' + idx + '"]');
    if (!el) return false;
    const rec = msgs[idx];
    if (!rec) return false;
    // 已有就地区 → 再点收起
    if (el.querySelector('.msg-inplace')) { el.querySelector('.msg-inplace').remove(); return true; }
    const done =
      (type === 'choose' && rec.choiceStatus === 'answered') ||
      (type === 'curious' && rec.curiousStatus === 'answered') ||
      (type === 'roast' && rec.roastStatus === 'answered') ||
      (type === 'ask' && rec.askStatus === 'answered');
    if (done) return false;
    const card = el.querySelector('.msg-choose-card, .msg-ask-card');
    if (!card) return false;
    const wrap = document.createElement('div');
    wrap.className = 'msg-inplace';
    if (type === 'choose') {
      // 单选题：选项按钮直接点选（默契计算与弹窗一致）
      const opts = rec.choiceOptions || [];
      if (!opts.length) return false;
      opts.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'ip-opt';
        b.textContent = String(o.t || '');
        b.addEventListener('click', () => {
          const prefIdx = typeof rec.choicePref === 'number' ? rec.choicePref : 0;
          const prefTxt = opts[prefIdx] ? opts[prefIdx].t : '';
          const isPref = i === prefIdx;
          const isLiked = o.liked === true || o.liked === 'true';
          const matchTxt = isPref ? '✦ 刚好想到了一起'
            : isLiked ? '你们想得不一样，不过TA似乎很喜欢你的答案'
            : '这次没有选到一起。TA心里想的是：「' + prefTxt + '」';
          if (window.chatChooseReply) window.chatChooseReply(idx, String(o.t || ''), String(o.reply || '…'), matchTxt);
          if (window.logFish) window.logFish();
        });
        wrap.appendChild(b);
      });
    } else {
      // 好奇/吐槽/询问：快捷回复 chips（好奇有）+ 输入框 + 发送
      const quicks = (type === 'curious' ? (rec.curiousQuick || []) : []).filter(q => typeof q === 'string' && q);
      if (quicks.length) {
        const chips = document.createElement('div');
        chips.className = 'ip-chips';
        quicks.forEach(q => {
          const c = document.createElement('button');
          c.className = 'ip-chip';
          c.textContent = q;
          c.addEventListener('click', () => { try { inp.value = q; inp.focus(); } catch (e) {} });
          chips.appendChild(c);
        });
        wrap.appendChild(chips);
      }
      const row = document.createElement('div');
      row.className = 'ip-row';
      const inp = document.createElement('input');
      inp.className = 'ip-input';
      inp.type = 'text';
      inp.placeholder = type === 'roast' ? '回 TA 一句…' : '输入你的回答…';
      const send = document.createElement('button');
      send.className = 'ip-send';
      send.textContent = type === 'roast' ? '回TA' : '回答';
      const doSend = () => {
        const v = (inp.value || '').trim();
        if (!v) return;
        if (type === 'curious' && window.chatCuriousReply) {
          const replies = (rec.curiousReplies && rec.curiousReplies.length) ? rec.curiousReplies : ['嗯，我记住了。', '原来是这样。', '好，我记住了。'];
          const reply = replies[Math.floor(Math.random() * replies.length)];
          const fw = (rec.curiousFollowup && Math.random() < 0.3) ? rec.curiousFollowup : null;
          window.chatCuriousReply(idx, v, reply, fw);
        } else if (type === 'roast' && window.chatRoastReply) {
          const defs = ['你觉得我会信？', '少骗我。', '哼。', '好吧好吧。', '就这一次？', '行吧，放过你。', '嗯，这还差不多。'];
          window.chatRoastReply(idx, v, defs[Math.floor(Math.random() * defs.length)]);
        } else if (type === 'ask' && window.chatAskReply) {
          window.chatAskReply(idx, v);
        }
        if (window.logFish) window.logFish();
      };
      send.addEventListener('click', doSend);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); doSend(); }
      });
      row.appendChild(inp);
      row.appendChild(send);
      wrap.appendChild(row);
    }
    card.appendChild(wrap);
    // 就地输入框聚焦（安卓 contenteditable 转换后 focus 会代理到 box）
    const fi = wrap.querySelector('input.ip-input');
    if (fi) setTimeout(() => { try { fi.focus(); } catch (e) {} }, 60);
    return true;
  }
  // v3.6.x：互动卡片事件委托——由 chat-body 统一监听点击（renderMsg 不再逐卡绑定），
  // 兼容重渲染/懒加载；就地展开失败（数据异常等）时回退到对应弹窗，保证点卡片必有反应
  if (body) {
    body.addEventListener('click', (e) => {
      // 就地作答区内部（选项按钮/发送/输入框）的点击不触发卡片委托
      if (e.target.closest('.msg-inplace')) return;
      const card = e.target.closest('.msg-ask-card, .msg-choose-card');
      if (!card) return;
      const item = card.closest('.msg-ask');
      if (!item || item.dataset.idx === undefined) return;
      if (card.classList.contains('answered')) return; // 已作答不重复展开
      const idx = Number(item.dataset.idx);
      const rec = msgs[idx];
      if (!rec) return;
      e.stopPropagation(); // 不冒泡触发气泡操作菜单
      let type = null;
      if (rec.special === 'ask-choose') type = 'choose';
      else if (rec.special === 'ask-curious') type = 'curious';
      else if (rec.special === 'ask-roast') type = 'roast';
      else if (rec.special === 'ask-card') type = 'ask';
      if (!type) return;
      // 先尝试就地展开；失败则回退弹窗（如弹窗已开着则由弹窗处理，这里跳过）
      const ok = expandCardInPlace(idx, type);
      if (!ok) {
        try {
          if (type === 'choose' && window.openTC) window.openTC(idx);
          else if (type === 'curious' && window.openCurious) window.openCurious(idx);
          else if (type === 'roast' && window.openRoast) window.openRoast(idx);
          else if (type === 'ask' && window.openAskReply) window.openAskReply(idx);
        } catch (err) {}
      }
    });
  }

  function bindToggle(b, side) {
    const who = side === 'out' ? '我' : '对方';
    b.style.cursor = 'pointer';
    b.onclick = function () {
      if (b.dataset.showing === '1') {
        b.innerHTML = '<span style="opacity:.6;font-size:12px;cursor:pointer">' + who + '撤回了一条消息</span>';
        b.dataset.showing = '0';
      } else {
        b.innerHTML = b.dataset.orig;
        b.dataset.showing = '1';
      }
    };
  }
  // v3.6.x：批量渲染标志——进入聊天/恢复历史时一次性渲染几百上千条消息，
  // 每条渲染后的强制滚动（scrollTop=scrollHeight）会触发同步布局，手机上
  // 大量消息时进入聊天页卡顿数秒；批量期间跳过滚动，结束后统一滚到底一次
  let batchRendering = false;

  // v3.6.x：聊天记录分页渲染——首屏只渲染最近 RENDER_MAX 条，向上滚动加载更早。
  // 数据不变（msgs 全量在内存，getChatMsgs/统计/搜索遍历不受影响），只分 DOM 渲染层：
  // 几千条历史不再一次性建几千个消息节点，进入聊天页与历史恢复大幅提速。
  const RENDER_MAX = 200;   // 渲染窗口条数上限
  const LOAD_STEP = 100;    // 向上滚动每次加载的条数
  const TOP_THRESHOLD = 150;// scrollTop 小于此值触发向上加载（px）
  const JUMP_VIEW = 30;     // 搜索跳转时目标索引上方预留的余量
  let renderStart = 0;      // 渲染窗口起点（msgs 下标）；0 = 全量
  let suppressScrollUntil = 0; // 程序化滚动后短暂忽略 scroll 事件（防渲染本身触发向上加载）
  // 渲染 [renderStart, msgs.length) 窗口。
  // keepScroll=true：保持视觉位置（向上加载时新内容补在顶部，scrollTop 需下移对应高度）
  // clampTop=true：窗口超出 RENDER_MAX 时收紧到最近 RENDER_MAX 条（进入聊天/新消息/恢复）
  function renderWindow(keepScroll, clampTop) {
    const len = msgs.length;
    const prevTop = keepScroll ? body.scrollTop : 0;
    const prevHeight = keepScroll ? body.scrollHeight : 0;
    if (clampTop) renderStart = Math.max(0, len - RENDER_MAX);
    const start = Math.min(renderStart, len);
    body.innerHTML = '';
    batchRendering = true;
    for (let i = start; i < len; i++) {
      const m = renderMsg(msgs[i]);
      m.dataset.idx = i; // 覆盖 renderMsg 内的 msgs.length-1（批量渲染时必须为真实下标）
    }
    batchRendering = false;
    if (keepScroll && prevHeight > 0) {
      body.scrollTop = prevTop + (body.scrollHeight - prevHeight);
    }
    suppressScrollUntil = Date.now() + 200; // 本轮渲染/滚动结束后 200ms 内不响应 scroll
  }
  // 向上滚动接近顶部 → 加载更早消息（节流 100ms，程序化滚动 200ms 内忽略）
  let bodyScrollTimer = null;
  body.addEventListener('scroll', function () {
    if (Date.now() < suppressScrollUntil) return;
    if (bodyScrollTimer) return;
    bodyScrollTimer = setTimeout(function () {
      bodyScrollTimer = null;
      if (renderStart <= 0 || !chatVisible()) return;
      if (body.scrollTop < TOP_THRESHOLD) {
        renderStart = Math.max(0, renderStart - LOAD_STEP);
        renderWindow(true, false);
      }
    }, 100);
  }, { passive: true });
  function renderMsg(rec) {
    const m = document.createElement('div');
    // 邀请TA：居中完整卡片（问题 + TA 的回应），等待中显示等待状态
    if (rec.special === 'invite') {
      m.className = 'msg-ask';
      m.dataset.idx = msgs.length - 1;
      const answered = rec.inviteStatus === 'answered';
      m.innerHTML = '<div class="msg-ask-card' + (answered ? ' answered' : '') + '">' +
        '<div class="msg-ask-q">邀请TA · ' + (rec.inviteContent || rec.text || '').replace(/</g, '&lt;') + '</div>' +
        (answered
          ? '<div class="msg-ask-a">✓ ' + (rec.inviteAnswer || 'TA 回应了你').replace(/</g, '&lt;') + '</div>'
          : '<div class="msg-ask-tip">等待 TA 回应…</div>') +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom();
      return m;
    }
    // 问问TA：居中完整卡片（问题 + TA 的回答）
    if (rec.special === 'ask') {
      m.className = 'msg-ask';
      m.dataset.idx = msgs.length - 1;
      const answered = rec.askStatus === 'answered';
      m.innerHTML = '<div class="msg-ask-card' + (answered ? ' answered' : '') + '">' +
        '<div class="msg-ask-q">问问TA · ' + (rec.askQuestion || '').replace(/</g, '&lt;') + '</div>' +
        (answered
          ? '<div class="msg-ask-a">✓ TA：' + (rec.askAnswer || '回答了你').replace(/</g, '&lt;') + '</div>'
          : '<div class="msg-ask-tip">等待 TA 回答…</div>') +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom();
      return m;
    }
    // 通话：居中卡片
    if (rec.special === 'call' || rec.special === 'call-reply' || rec.special === 'invite-reply') {
      m.className = 'msg-center';
      m.innerHTML = '<div class="msg-center-card">' + rec.text + '</div>';
      body.appendChild(m);
      maybeScrollChatBottom();
      return m;
    }
    // 拍一拍 / 换头像系统提示：居中灰字小卡片，可选附带一张头像图
    if (rec.special === 'poke') {
      m.className = 'msg-poke';
      m.innerHTML = '<span>' + rec.text + '</span>' +
        (rec.img ? '<img class="msg-poke-img" src="' + rec.img + '" alt="新头像">' : '');
      body.appendChild(m);
      maybeScrollChatBottom();
      return m;
    }
    // TA 的小问题：居中选择题卡片，未作答点击弹出选项
    if (rec.special === 'ask-choose') {
      m.className = 'msg-ask';
      m.dataset.idx = msgs.length - 1;
      const answered = rec.choiceStatus === 'answered';
      m.innerHTML = '<div class="msg-choose-card' + (answered ? ' answered' : '') + '">' +
        '<div class="msg-ask-q">' + (rec.choiceQuestion || '') + '</div>' +
        (answered
          ? '<div class="msg-ask-a">✓ 你选择了：' + rec.choiceAnswer + '</div><div class="msg-choose-r">TA：' + rec.choiceReply + '</div>'
          : '<div class="msg-ask-tip">点击选择你的答案</div>') +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom();
      return m;
    }
    // TA 的好奇：居中白卡显示问题，未回答可点击回答
    if (rec.special === 'ask-curious') {
      m.className = 'msg-ask';
      m.dataset.idx = msgs.length - 1;
      const answered = rec.curiousStatus === 'answered';
      m.innerHTML = '<div class="msg-choose-card' + (answered ? ' answered' : '') + '">' +
        '<div class="msg-ask-q">' + (rec.curiousQuestion || '') + '</div>' +
        (answered
          ? '<div class="msg-ask-a">✓ 你：' + rec.curiousAnswer + '</div><div class="msg-choose-r">TA：' + rec.curiousReply + '</div>'
          : '<div class="msg-ask-tip">点击回答 TA 的好奇</div>') +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom();
      return m;
    }
    // TA 的吐槽：居中白卡显示吐槽，未回应可点击回一句
    if (rec.special === 'ask-roast') {
      m.className = 'msg-ask';
      m.dataset.idx = msgs.length - 1;
      const answered = rec.roastStatus === 'answered';
      m.innerHTML = '<div class="msg-choose-card' + (answered ? ' answered' : '') + '">' +
        '<div class="msg-ask-q">' + (rec.roastText || '') + '</div>' +
        (answered
          ? '<div class="msg-ask-a">✓ 你：' + rec.roastAnswer + '</div><div class="msg-choose-r">TA：' + rec.roastReply + '</div>'
          : '<div class="msg-ask-tip">点击回 TA 一句</div>') +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom();
      return m;
    }
    // TA 的询问卡片：居中白卡显示问题，未回答可点击回答（星言 ta 的询问）
    if (rec.special === 'ask-card') {
      m.className = 'msg-ask';
      m.dataset.idx = msgs.length - 1;
      const answered = rec.askStatus === 'answered';
      m.innerHTML = '<div class="msg-ask-card' + (answered ? ' answered' : '') + '">' +
        '<div class="msg-ask-q">' + (rec.askQuestion || rec.text) + '</div>' +
        (answered
          ? '<div class="msg-ask-a">✓ 已回答：' + rec.askAnswer + '</div>'
          : '<div class="msg-ask-tip">点击回答 TA 的提问</div>') +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom();
      return m;
    }
    m.className = 'msg ' + (rec.side === 'out' ? 'msg-out' : 'msg-in');
    // 头像列：头像 + 时间轴（时间在头像底下）
    const timeHtml = rec.ts ? '<span class="msg-time">' + fmtTime(rec.ts) + '</span>' : '';
    const side = '<div class="msg-side"><div class="msg-av"></div>' + timeHtml + '</div>';
    // 我的消息：气泡在左、头像(带时间)在右；对方消息：头像(带时间)在左、气泡在右
    m.innerHTML = rec.side === 'out'
      ? '<div class="msg-bubble"></div>' + side
      : side + '<div class="msg-bubble"></div>';
    const av = m.querySelector('.msg-av');
    const b = m.querySelector('.msg-bubble');
    if (rec.special === 'read') {
      // 已读不回：保留正常聊天气泡
      b.innerHTML = '<span style="opacity:.5;font-size:12px">已读不回</span>';
    } else if (rec.type === 'sticker' || rec.type === 'image') {
      // 表情包：小图；图片：大图可点击查看（带引用则先显示引用块）
      b.style.padding = '6px';
      b.style.background = '';
      b.style.border = '';
      b.style.boxShadow = '';
      b.innerHTML = (rec.quote ? quoteHtml(rec.quote, rec.qside) : '') + (rec.type === 'image'
        ? '<img class="msg-img msg-img-big" src="' + rec.text + '" alt="图片" loading="lazy" decoding="async">'
        : '<img class="msg-img msg-img-sm" src="' + rec.text + '" alt="表情" loading="lazy" decoding="async">');
      if (rec.type === 'image') {
        // v3.6.x：stopPropagation 防穿透——否则点图片会同时冒泡到 body 委托弹出操作菜单
        b.querySelector('.msg-img-big').addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.viewChatImage) window.viewChatImage(rec.text);
        });
      }
    } else if (rec.type === 'voice') {
      // 语音消息：播放按钮 + 波形动画（数据格式：文件名|||音频dataURL）
      b.style.padding = '8px 10px';
      b.style.background = '';
      b.style.border = '';
      b.style.boxShadow = '';
      const vparts = String(rec.text || '').split('|||');
      // v3.6.x：语音名称去掉 mp3/mp4 等后缀（旧消息存的名字仍带后缀）
      const vname = (vparts[0] || '语音消息').replace(/\.[^.]+$/, '');
      const vsrc = vparts[1] || '';
      b.innerHTML = '<div class="msg-voice" data-src="' + vsrc + '">' +
        '<button class="msg-voice-play" title="播放">' +
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
        '</button>' +
        '<div class="msg-voice-wave"><i></i><i></i><i></i><i></i><i></i></div>' +
        '<span class="msg-voice-name">' + vname.replace(/</g, '&lt;') + '</span>' +
        '</div>';
      // v3.6.x：stopPropagation 防穿透——否则点播放会同时冒泡弹出操作菜单
      b.querySelector('.msg-voice-play').addEventListener('click', function (e) {
        e.stopPropagation();
        playVoiceInChat(this, vsrc);
      });
    } else if (rec.retracted) {
      b.dataset.orig = rec.orig || rec.text;
      b.innerHTML = '<span style="opacity:.6;font-size:12px;cursor:pointer">' + (rec.side === 'out' ? '我' : '对方') + '撤回了一条消息</span>';
      bindToggle(b, rec.side);
    } else if (rec.parts && rec.parts.length) {
      // 组合消息：文字 + 图片/表情（同一气泡内，图片网格 + 文字）
      // 图片 → 大图可点击；表情包 → 小图（sub 字段区分，旧数据按图片处理）
      const imgs = rec.parts.filter(p => p.k === 'img').map(p => p);
      const textPart = rec.parts.filter(p => p.k === 'text').map(p => p.v).join(' ');
      let inner = '';
      if (imgs.length) {
        inner += '<div class="msg-parts-imgs' + (imgs.length > 1 ? ' multi' : '') + '">' +
          imgs.map(p => {
            const isSticker = p.sub === 'sticker';
            return '<img class="msg-img' + (isSticker ? ' msg-img-sm' : ' msg-img-big') + '" src="' + p.v + '" alt="' + (isSticker ? '表情' : '图片') + '" loading="lazy" decoding="async">';
          }).join('') + '</div>';
      }
      if (textPart) {
        inner += '<span style="opacity:.85;word-break:break-word">' + textPart.replace(/</g, '&lt;') + '</span>';
      }
      b.innerHTML = rec.quote
        ? quoteHtml(rec.quote, rec.qside) + inner
        : inner;
      // 组合消息里的图片（大图）可点击查看（v3.6.x：stopPropagation 防穿透弹菜单）
      b.querySelectorAll('.msg-img-big').forEach(img => {
        img.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.viewChatImage) window.viewChatImage(img.src);
        });
      });
    } else if (rec.retractedSegs && rec.retractedSegs.length) {
      // ★ 字卡级局部撤回：正文隐藏被撤段，下方胶囊可展开查看
      const segs = splitCardSegs(rec.text);
      const rcs = rec.retractedSegs || [];
      let segHtml = '';
      for (let i = 0; i < segs.length; i++) {
        if (!rcs.some(r => r.idx === i)) {
          if (segHtml) segHtml += ' ';
          segHtml += String(segs[i]).replace(/</g, '&lt;');
        }
      }
      let sub = '';
      rcs.forEach(r => { sub += '<div style="padding:2px 0">（已撤回）' + String(r.text || '').replace(/</g, '&lt;') + '</div>'; });
      b.innerHTML = (rec.quote ? quoteHtml(rec.quote, rec.qside) : '') +
        '<span style="opacity:.85;word-break:break-word">' + (segHtml || '…') + '</span>' +
        '<div style="margin-top:6px;text-align:left">' +
        '<span class="msg-poke-seg" data-rc="1">' + (rec.side === 'out' ? '我' : '对方') + '撤回了 ' + rcs.length + ' 条字卡 ▾</span>' +
        '<div class="msg-poke-seg-detail" style="display:none">' + sub + '</div>' +
        '</div>';
      const tip = b.querySelector('.msg-poke-seg');
      if (tip) {
        // stopPropagation：展开/收起详情，不冒泡到 body 触发"引用/收藏"操作菜单（v3.5.42）
        tip.addEventListener('click', (e) => {
          e.stopPropagation();
          const d = tip.nextElementSibling;
          if (d) d.style.display = d.style.display === 'block' ? 'none' : 'block';
        });
      }
    } else {
      // v3.5.131：文本转义（用户输入含 < 会破坏气泡结构/注入 HTML）
      const escTxt = String(rec.text || '').replace(/</g, '&lt;');
      b.innerHTML = rec.quote
        ? quoteHtml(rec.quote, rec.qside) + '<span style="opacity:.85">' + escTxt + '</span>'
        : '<span style="opacity:.85">' + escTxt + '</span>';
    }
    // 恢复情绪字卡（持久化）：所有字卡包进一个 .msg-moods 容器，
    // 容器用一条虚线与正文隔离，字卡在容器内紧凑同行、放不下才自动换行
    if (rec.mood && rec.mood.length) {
      const mm = document.createElement('div');
      mm.className = 'msg-moods';
      rec.mood.forEach((md, mi) => {
        // 局部撤回：被撤的情绪字卡不显示
        if (rec.retractedMood && rec.retractedMood.indexOf(mi) >= 0) return;
        if (md.tag === '交流意图') {
          mm.innerHTML += '<div class="msg-mood msg-intent"><span class="msg-mood-tag">' + md.tag + '</span><span>' + md.label + '</span></div>';
        } else {
          mm.innerHTML += '<div class="msg-mood"><span class="msg-mood-tag">' + md.tag + '</span><span>' + md.label + '</span></div>';
        }
      });
      if (mm.children.length) b.appendChild(mm);
    }
    fillAvatar(av, rec.side === 'out' ? 'avatar-user' : 'avatar-partner');
    // 点击联系人消息左侧头像 → 打开拍一拍半框，对 TA 使用拍一拍
    if (rec.side === 'in') {
      av.style.cursor = 'pointer';
      av.title = '对 TA 拍一拍';
      av.addEventListener('click', (e) => {
        e.stopPropagation();
        openPokeCard();
      });
    }
    if (rec.side === 'in' || rec.side === 'out') m.dataset.idx = msgs.length - 1;
    body.appendChild(m);
    maybeScrollChatBottom();
    return m;
  }

  // 拍一拍：联系人用自定义字卡【拍一拍】里的字卡，居中灰字显示 "昵称 + 字卡 + 对我"
  function performPoke() {
    // 优先用默认字卡【拍一拍】（聊天默认字卡开启时）
    let action = '';
    const dcfg = (window.defaultCardCfg && window.defaultCardCfg()) || {};
    if (dcfg.enabled && dcfg.probs && (dcfg.probs.touch || 0) > 0) {
      const d = (window.getDefaultCards && window.getDefaultCards()) || null;
      if (d && d.type === 'poke') action = d.text;
    }
    if (!action) {
      const cards = (window.getPokeCards && window.getPokeCards()) || [];
      action = cards.length ? pick(cards) : '拍了拍你';
    }
    const name = store.get('lbl-partner') || 'TA';
    const myName = store.get('lbl-user') || '我';
    // 显示：联系人昵称 + 字卡 + 我的昵称
    let text;
    if (action.indexOf('你') >= 0) {
      text = name + ' ' + action.replace(/你/g, myName);
    } else {
      text = name + ' ' + action + ' ' + myName;
    }
    addIn(text, { special: 'poke' });
  }

  // v3.5.100：桌面「聊天」图标未读数字提醒
  // 未读数持久化到 chat-unread（跨页面/刷新保留），打开聊天页即清零（微信式）
  function chatUnread() { try { return parseInt(store.get('chat-unread'), 10) || 0; } catch (e) { return 0; } }
  function incChatUnread() {
    try { store.set('chat-unread', String(chatUnread() + 1)); } catch (e) {}
    updateChatBadge();
  }
  function clearChatUnread() {
    try { store.set('chat-unread', '0'); } catch (e) {}
    updateChatBadge();
  }
  function updateChatBadge() {
    const badge = document.getElementById('chat-badge');
    if (!badge) return;
    const n = chatUnread();
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : String(n);
  }

  // v3.6.x：删除全部聊天记录——聊天设置页调用，不刷新页面原地清空：
  // 内存 msgs + 未落盘暂存 + 防抖定时器 + localStorage + IndexedDB（store.remove 双写）
  // 全部清掉，同时清空已渲染的消息 DOM 与未读角标；回聊天页即为空。
  // 顺带置 chatDbReady=true，清空后新消息直接走正常落盘路径。
  window.clearChatHistory = function () {
    msgs = [];
    pendingLocal = null;
    sessionChangedIdx.clear();
    chatDbReady = true;
    renderStart = 0; // v3.6.x：分页窗口起点复位（消息已清空）
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try { store.remove('chat-msgs'); } catch (e) {}
    if (body) body.innerHTML = '';
    clearChatUnread();
  };

  // v3.5.102：桌面新消息横幅——TA 的普通消息进来且当前不在聊天页时，
  // 在桌面/任意页面顶部弹出横幅（头像 + 昵称 + 内容），点击直接进聊天
  const deskMsgEl = document.getElementById('desk-msg');
  const deskMsgAv = document.getElementById('desk-msg-av');
  const deskMsgName = document.getElementById('desk-msg-name');
  const deskMsgText = document.getElementById('desk-msg-text');
  let deskMsgTimer = null;
  let deskMsgAction = null; // v3.5.107：横幅点击回调（聊天进聊天页 / 信箱进信箱 / 朋友圈进朋友圈）
  // v3.5.103：设置页「桌面消息弹窗」开关（默认开启；关闭后 TA 消息只进聊天角标，不弹横幅）
  function deskMsgEnabled() {
    const v = store.get('desk-msg-en');
    return v === null || v === undefined || v === '' ? true : v === '1';
  }
  // v3.5.107：通用前台桌面弹窗——聊天新消息、信箱来信/回信、朋友圈通知共用顶部横幅
  // opts：{ name: 标题（默认 TA 昵称）, text: 内容, type: 消息类型（图片/表情包等）, onClick: 点击回调 }
  function showDeskPopup(opts) {
    opts = opts || {};
    if (!deskMsgEl || !deskMsgEnabled()) return;
    let t = String(opts.text || '');
    if (!t) return;
    if (t.indexOf('data:') === 0) t = opts.type === 'image' ? '[图片]' : '[表情包]';
    // v3.5.132：正文里混入的 dataURL 片段（写信内容带表情包/图片时，data: 前缀判断失效）
    // 统一替换为占位文案，不再显示 base64 乱码
    else if (t.indexOf('data:') > 0) t = t.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '[图片]');
    // v3.6.x：通话等系统消息的正文含内联 SVG（来电铃铛/电话图标），textContent 会把
    // 整段 SVG 源码当文本显示成乱码——剥离标签只保留可见文字（来电/挂断等）
    // v3.5.131：仅对含 svg 的系统消息剥离标签——普通消息里的 `<`（如"1<2"）不再被误删
    else if (t.indexOf('<svg') >= 0) t = t.replace(/<[^>]*>/g, '').trim();
    else if (t.length > 40) t = t.slice(0, 40) + '…';
    if (deskMsgText) deskMsgText.textContent = t;
    if (deskMsgName) deskMsgName.textContent = opts.name || store.get('lbl-partner') || 'TA';
    if (deskMsgAv) fillAvatar(deskMsgAv, 'avatar-partner');
    deskMsgAction = (typeof opts.onClick === 'function') ? opts.onClick : null;
    deskMsgEl.hidden = false;
    clearTimeout(deskMsgTimer);
    deskMsgTimer = setTimeout(() => { if (deskMsgEl) deskMsgEl.hidden = true; }, 6000);
  }
  // 聊天新消息横幅（TA 普通消息进来且不在聊天页时弹出，点击进聊天）
  function showDeskMsg(text, type) {
    if (chatVisible()) return;
    showDeskPopup({ name: store.get('lbl-partner') || 'TA', text: text, type: type, onClick: () => { if (!chatVisible()) enterChat(); } });
  }
  function hideDeskMsg() {
    clearTimeout(deskMsgTimer);
    deskMsgAction = null;
    if (deskMsgEl) deskMsgEl.hidden = true;
  }
  // 供信箱 / 朋友圈等模块复用（构建顺序：chat.js 先于 mail.js / feed.js 加载）
  window.showDeskPopup = showDeskPopup;
  window.hideDeskMsg = hideDeskMsg;
  // v3.5.106：横幅无 × 关闭按钮（v3.5.106 移除），点横幅直接进对应页面
  if (deskMsgEl) deskMsgEl.addEventListener('click', () => {
    if (deskMsgSuppressClick) { deskMsgSuppressClick = false; return; }
    const action = deskMsgAction;
    hideDeskMsg();
    if (action) action();
    else if (!chatVisible()) enterChat();
  });
  // v3.5.117：横幅滑动/拖动关闭——手机右滑、桌面鼠标拖动，超过阈值松手即关闭；
  // 拖动距离不够则回弹（不触发点击进入，避免误触）
  // v3.5.119：手感调优——拖动跟随阈值 6px → 24px：
  //   手指轻划/轻斜滑（<24px）横幅纹丝不动，松手=正常点击进入页面；
  //   只有明显横滑（≥24px）横幅才开始跟随位移，≥70px 松手才关闭
  // v3.6.x：手机端反馈右滑关闭「过于不灵敏」（70px 才关、24px 才开始跟随）——
  //   跟随阈值收到 12px、关闭阈值收到 45px（中间值）：轻滑即跟手，滑过屏宽约 1/8 即关闭
  // v3.5.134：继续收紧——跟随 8px、关闭 30px（配 touch-action:pan-y 后水平手势
  //   不再被浏览器抢占，真实位移即可跟手）；斜滑容忍放宽：dy 不超过 dx 的 1.25 倍
  //   仍按横滑处理（手指右滑时难免带一点纵向，之前 dy>dx 就放弃导致不灵敏）
  let deskMsgSuppressClick = false;
  let deskMsgSuppressTimer = null;
  let dDrag = null;
  function deskMsgDragStart(e) {
    if (!deskMsgEl || deskMsgEl.hidden) return;
    dDrag = { x: e.clientX, y: e.clientY, moved: false };
  }
  function deskMsgDragMove(e) {
    if (!dDrag) return;
    // v3.6.x：横幅已隐藏时立即放弃拖动状态——防止横幅计时关闭后 window 级
    // pointermove 继续 preventDefault 拦截页面手势（iOS Safari 上表现为页面
    // 触摸滚动/点击失灵，像"卡死"）
    if (!deskMsgEl || deskMsgEl.hidden) { dDrag = null; return; }
    const dx = e.clientX - dDrag.x;
    const dy = e.clientY - dDrag.y;
    // 横向位移 ≥8px 才视为拖动（明显右滑/左滑）；轻微斜划不算，不打扰点击
    if (Math.abs(dx) > 8) dDrag.moved = true;
    // 仅横向拖动跟随（纵向交给页面滚动；dy 不超过 dx 1.25 倍的轻微斜滑仍算横向）
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      try { e.preventDefault(); } catch (err) {}
      deskMsgEl.style.transform = 'translateX(' + dx + 'px)';
      deskMsgEl.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 120));
    }
  }
  function deskMsgDragEnd(e) {
    if (!dDrag) return;
    const dx = e.clientX - dDrag.x;
    const wasMoved = dDrag.moved;
    dDrag = null;
    deskMsgEl.style.transform = '';
    deskMsgEl.style.opacity = '';
    if (wasMoved) {
      // 只要有拖动，都抑制随后的 click——否则滑动松手会触发横幅点击进入页面
      deskMsgSuppressClick = true;
      clearTimeout(deskMsgSuppressTimer);
      deskMsgSuppressTimer = setTimeout(() => { deskMsgSuppressClick = false; }, 350);
      if (Math.abs(dx) > 30) {
        deskMsgSuppressClick = false;
        clearTimeout(deskMsgSuppressTimer);
        hideDeskMsg();
      }
    }
  }
  if (deskMsgEl) {
    deskMsgEl.addEventListener('pointerdown', deskMsgDragStart, { passive: true });
    window.addEventListener('pointermove', deskMsgDragMove, { passive: false });
    window.addEventListener('pointerup', deskMsgDragEnd);
    window.addEventListener('pointercancel', deskMsgDragEnd);
  }
  // v3.5.103：桌面消息弹窗开关绑定（设置页回复设置-主动发送组）
  const deskMsgToggle = document.getElementById('desk-msg-en');
  if (deskMsgToggle) {
    deskMsgToggle.checked = deskMsgEnabled();
    deskMsgToggle.addEventListener('change', () => {
      try { store.set('desk-msg-en', deskMsgToggle.checked ? '1' : '0'); } catch (e) {}
    });
  }

  // 追加记录（存 + 渲染）
  function addRec(rec) {
    if (!rec.ts) rec.ts = Date.now();
    msgs.push(rec);
    saveMsgs();
    // 后台通知：TA 的普通消息且页面不在前台时弹浏览器通知（系统提示类不弹）
    if (rec.side === 'in' && !rec.special && window.bgNotifyCheck) {
      window.bgNotifyCheck(rec.text, rec.ts);
    }
    // v3.5.100：TA 新消息进来且聊天页未打开 → 桌面「聊天」图标未读数 +1
    // v3.6.x：换头像/拍一拍等「系统提示」也计入提醒——手机端联系人主动换头像时
    //   不在聊天页也能看到角标/横幅，而不是静默写进聊天记录
    const notable = rec.side === 'in' && (!rec.special || rec.special === 'poke');
    if (notable && !chatVisible()) {
      incChatUnread();
      // v3.5.102：非聊天页时桌面弹出新消息横幅（点击进聊天）
      showDeskMsg(rec.text, rec.type);
    }
    // v3.6.x：分页渲染下窗口已满（新增后超出 RENDER_MAX）→ 重渲染窗口并贴底，
    // 避免窗口无限膨胀；否则走增量追加（renderMsg 尾部 append）
    if (renderStart > 0 && msgs.length - renderStart > RENDER_MAX) {
      renderWindow(false, true);
      scrollChatBottom();
      return body.lastElementChild;
    }
    return renderMsg(rec);
  }
  function addIn(text, opts) {
    opts = opts || {};
    // v3.5.60：联系人普通消息（非系统提示）播放设置的音效
    if (!opts.special && window.playSfx) window.playSfx('in');
    return addRec({ side: 'in', text: text, special: opts.special, quote: opts.quote, type: opts.type, img: opts.img, parts: opts.parts, askQuestion: opts.askQuestion, askStatus: opts.askStatus, choiceQuestion: opts.choiceQuestion, choiceOptions: opts.choiceOptions, choicePref: opts.choicePref, choiceCat: opts.choiceCat, choiceStatus: opts.choiceStatus, choiceAnswer: opts.choiceAnswer, choiceReply: opts.choiceReply, choiceMatch: opts.choiceMatch, curiousQuestion: opts.curiousQuestion, curiousQuick: opts.curiousQuick, curiousReplies: opts.curiousReplies, curiousFollowup: opts.curiousFollowup, curiousQid: opts.curiousQid, curiousCat: opts.curiousCat, curiousStatus: opts.curiousStatus, curiousAnswer: opts.curiousAnswer, curiousReply: opts.curiousReply, roastText: opts.roastText, roastCat: opts.roastCat, roastStatus: opts.roastStatus, roastAnswer: opts.roastAnswer, roastReply: opts.roastReply });
  }
  function addOut(text) {
    return addRec({ side: 'out', text: text });
  }
  // 供头像库等外部模块追加"居中系统消息"（更换头像/拍一拍类）：
  // 即使聊天页当前关闭也会写入记录，下次进入聊天自动恢复
  // opts.img：可选，消息附带一张小头像图片（更换头像时显示新头像）
  // opts.choice*：TA 的小问题选择题数据
  // 注意：页面加载时 msgs 尚未 loadMsgs()（进入聊天才加载），
  // 写入前必须重新读取历史，否则会把空数组覆盖回 localStorage 导致聊天记录丢失
  // v3.6.x：boot 已同步加载聊天记录到内存（loadMsgs 在模块末尾调用），
  // 且 chatDbReady 未就绪时 saveMsgs 只暂存 pendingLocal 不落盘、IDB 合并会补上——
  // 这里不再每次全量 loadMsgs()（同步 JSON.parse 全量历史 + 异步 IDB 全量合并，
  // changed 时还 innerHTML='' 全量重渲染，查岗/日常/TA 模块频繁调用时反复重建
  // 整个消息列表 = 收消息卡顿来源之一）
  window.chatAddSystem = function (text, opts) {
    opts = opts || {};
    return addIn(text, { special: opts.special || 'poke', img: opts.img, askQuestion: opts.askQuestion, askStatus: opts.askStatus, choiceQuestion: opts.choiceQuestion, choiceOptions: opts.choiceOptions, choicePref: opts.choicePref, choiceCat: opts.choiceCat, curiousQuestion: opts.curiousQuestion, curiousQuick: opts.curiousQuick, curiousReplies: opts.curiousReplies, curiousFollowup: opts.curiousFollowup, curiousQid: opts.curiousQid, curiousCat: opts.curiousCat, roastText: opts.roastText, roastCat: opts.roastCat });
  };
  // 供外部模块推送普通"联系人消息"（如查岗日常更新），持久化 + 渲染
  window.chatAddIn = function (text) {
    return addIn(text);
  };
  // v3.6.x：提交互动答案后立即同步写盘（不等防抖）——
  // chatChooseReply 等函数开头的 loadMsgs() 是异步读 IDB，其合并回调会在
  // 同步代码执行完后才跑，若此时 IDB 里还是旧的「未作答」数据，会触发
  // 全量重渲染把刚更新为 answered 的卡片刷回未作答（就地作答/弹窗提交都受影响）。
  // 这里立即把最新 msgs 写进 IndexedDB，让异步合并读到已作答状态。
  function saveMsgsNow() {
    const data = JSON.stringify(msgs);
    try { if (window.idbSet) window.idbSet(uid + ':chat-msgs', data); } catch (e) {}
  }

  // 回答 TA 的小问题（选择题）：更新记录 + 插入"我的选择"和 TA 回应
  window.chatChooseReply = function (msgIdx, answer, reply, match) {
    // v3.6.x：不再调用 loadMsgs()——该函数是异步读 IDB，其合并回调会在同步代码
    // 执行完后用【旧 IDB 数据】全量重渲染，把刚更新为 answered 的卡片刷回未作答。
    // 这些函数只由用户在聊天页点卡片/弹窗触发，此时 msgs 已加载且为最新。
    const rec = msgs[msgIdx];
    if (!rec || rec.special !== 'ask-choose' || rec.choiceStatus === 'answered') return;
    rec.choiceStatus = 'answered';
    rec.choiceAnswer = answer;
    rec.choiceReply = reply || '…';
    if (match) rec.choiceMatch = match;
    saveMsgs();
    saveMsgsNow();
    addOut(answer);
    addIn(reply || '…');
    // 就地更新已渲染的卡片
    const el = body.querySelector('.msg-ask[data-idx="' + msgIdx + '"]');
    if (el) {
      el.innerHTML = '<div class="msg-choose-card answered"><div class="msg-ask-q">' + (rec.choiceQuestion || '') + '</div><div class="msg-ask-a">✓ 你选择了：' + answer + '</div><div class="msg-choose-r">TA：' + (reply || '…') + '</div></div>';
    }
  };
  // 回答 TA 的好奇（开放式）：更新记录 + 插入"我的回答"和 TA 回应（含 30% 追问）
  window.chatCuriousReply = function (msgIdx, answer, reply, followup) {
    const rec = msgs[msgIdx];
    if (!rec || rec.special !== 'ask-curious' || rec.curiousStatus === 'answered') return;
    rec.curiousStatus = 'answered';
    rec.curiousAnswer = answer;
    rec.curiousReply = reply || '…';
    saveMsgs();
    saveMsgsNow();
    addOut(answer);
    addIn(reply || '…');
    if (followup) addIn(followup);
    const el = body.querySelector('.msg-ask[data-idx="' + msgIdx + '"]');
    if (el) {
      el.innerHTML = '<div class="msg-choose-card answered"><div class="msg-ask-q">' + (rec.curiousQuestion || '') + '</div><div class="msg-ask-a">✓ 你：' + answer + '</div><div class="msg-choose-r">TA：' + (reply || '…') + '</div></div>';
    }
  };
  // 回应 TA 的吐槽：更新记录 + 插入"我的回应"和 TA 回应
  window.chatRoastReply = function (msgIdx, answer, reply) {
    const rec = msgs[msgIdx];
    if (!rec || rec.special !== 'ask-roast' || rec.roastStatus === 'answered') return;
    rec.roastStatus = 'answered';
    rec.roastAnswer = answer;
    rec.roastReply = reply || '…';
    saveMsgs();
    saveMsgsNow();
    addOut(answer);
    addIn(reply || '…');
    const el = body.querySelector('.msg-ask[data-idx="' + msgIdx + '"]');
    if (el) {
      el.innerHTML = '<div class="msg-choose-card answered"><div class="msg-ask-q">' + (rec.roastText || '') + '</div><div class="msg-ask-a">✓ 你：' + answer + '</div><div class="msg-choose-r">TA：' + (reply || '…') + '</div></div>';
    }
  };
  // 回答 TA 的询问：更新记录 + 插入"我的回答"和 TA 确认消息
  window.chatAskReply = function (msgIdx, answer) {
    const rec = msgs[msgIdx];
    if (!rec || rec.special !== 'ask-card' || rec.askStatus === 'answered') return;
    rec.askStatus = 'answered';
    rec.askAnswer = answer;
    saveMsgs();
    saveMsgsNow();
    addOut(answer);
    addIn('收到你的回答。');
    // 就地更新已渲染的询问卡片
    const el = body.querySelector('.msg-ask[data-idx="' + msgIdx + '"]');
    if (el) {
      el.innerHTML = '<div class="msg-ask-card answered"><div class="msg-ask-q">' + (rec.askQuestion || '') + '</div><div class="msg-ask-a">✓ 已回答：' + answer + '</div></div>';
    }
  };
  // 撤回：更新记录 + DOM（点击可查看原文）
  // v3.6.x：节点可能已被聊天页重渲染替换（撤回定时器持旧节点）——
  // 已分离时改用 body 中当前对应节点，避免「界面显示正常、数据却是撤回」的不一致
  function retractMsg(msgEl, side) {
    const idx = parseInt(msgEl.dataset.idx, 10);
    let target = msgEl;
    if (!msgEl.isConnected && body) {
      const cur = body.querySelector('.msg[data-idx="' + idx + '"]');
      if (cur) target = cur; else return;
    }
    const b = target.querySelector('.msg-bubble');
    if (!b) return;
    if (!isNaN(idx) && msgs[idx]) {
      msgs[idx].retracted = true;
      msgs[idx].orig = b.innerHTML;
      sessionChangedIdx.add(idx); // v3.6.x：标记本会话变更，防 loadMsgs 合并回滚撤回
      saveMsgs();
      // v3.6.x：撤回我的消息后同步 lastMineText（TA 引用/收藏不再指向已撤回内容）
      if (msgs[idx].side === 'out') syncLastMineText();
    }
    b.dataset.orig = b.innerHTML;
    b.innerHTML = '<span style="opacity:.6;font-size:12px;cursor:pointer">' + (side === 'out' ? '我' : '对方') + '撤回了一条消息</span>';
    bindToggle(b, side);
  }

// ★ 字卡级局部撤回（仿星言）：把消息文本拆成多个「字卡段」，
// 联系人可只撤回其中 1~3 个段，正文隐藏被撤段，下方胶囊可展开查看撤了什么
// v3.5.39 修复：不再把颜文字/表情符号切碎——
//   - 标点（。！？；\n）是明确边界，必切
//   - 空格/逗号只在「前后都是完整词（以词字符结尾/开头）」时切，
//     含内部空格的颜文字（如 "( ´･･)ﾉ(._.`)"）整体保留为一个段
//   - 段长 ≤1 的碎片并入前段，保证撤回的永远是完整字卡
function splitCardSegs(text) {
  const str = String(text || '').trim();
  if (!str) return [];
  const isWord = (ch) => /[\u4e00-\u9fffA-Za-z0-9]/.test(ch);
  const out = [];
  let cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    // 强分隔：中文/英文句末标点、换行
    if ('。！？；\n!?;'.indexOf(ch) >= 0) {
      cur += ch;
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    // 弱分隔：空格/逗号——仅当前后都是完整词时切分
    if (ch === ' ' || ch === '，' || ch === ',') {
      const seg = cur.trim();
      const nextStart = str.slice(i + 1).trimStart()[0] || '';
      const segEnd = seg[seg.length - 1] || '';
      const canSplit = seg.length >= 2 && isWord(segEnd) && isWord(nextStart);
      if (canSplit) {
        if (seg) out.push(seg);
        cur = '';
      } else {
        cur += ch; // 并入当前段（保护颜文字/符号）
      }
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  // 碎片（≤1 字符）并入前段，避免纯符号段被单独撤回
  const filtered = [];
  out.forEach(s => {
    if (s.length <= 1 && filtered.length) filtered[filtered.length - 1] += ' ' + s;
    else filtered.push(s);
  });
  if (filtered.length < 2 && str.trim()) return [str.trim()];
  return filtered;
}
// 局部撤回：优先撤文本字卡段；文本单段则撤一条情绪/心意/意图字卡；都没有才整条撤回
function partialRetractMsg(msgEl, side) {
  const idx = parseInt(msgEl.dataset.idx, 10);
  // v3.6.x：节点可能已被重渲染替换——已分离时改用当前 body 中对应节点
  let target = msgEl;
  if (!msgEl.isConnected && body) {
    const cur = body.querySelector('.msg[data-idx="' + idx + '"]');
    if (cur) target = cur; else return;
  }
  const rec = (idx >= 0 && msgs[idx]) ? msgs[idx] : null;
  // v3.6.x：图片/表情包/语音消息不参与「字卡级局部撤回」——dataURL/base64 会被切成
  // 碎片并以文本形式露出，显示超长乱码；直接整条撤回
  if (!rec || rec.retracted || rec.parts || rec.type === 'sticker' || rec.type === 'image' || rec.type === 'voice') { retractMsg(target, side); return; }
  const segs = splitCardSegs(rec.text);
  if (segs.length > 1) {
    rec.retractedSegs = rec.retractedSegs || [];
    const remain = [];
    for (let i = 0; i < segs.length; i++) {
      if (!rec.retractedSegs.some(r => r.idx === i)) remain.push(i);
    }
    if (remain.length) {
      const n = 1 + Math.floor(Math.random() * Math.min(remain.length, 3));
      const k = Math.min(n, remain.length);
      for (let r = 0; r < k; r++) {
        const si = remain.splice(Math.floor(Math.random() * remain.length), 1)[0];
        rec.retractedSegs.push({ text: segs[si], idx: si });
      }
      sessionChangedIdx.add(idx); // v3.6.x：标记本会话变更，防 loadMsgs 合并回滚局部撤回
      saveMsgs();
      // 重建该条消息 DOM（沿用 renderMsg 渲染局部撤回样式）
      const m = renderMsg(rec);
      m.dataset.idx = idx;
      if (target.parentNode) target.parentNode.replaceChild(m, target);
      return;
    }
  }
  // 无多段文本：撤一条情绪/心意/意图字卡
  if (rec.mood && rec.mood.length) {
    rec.retractedMood = rec.retractedMood || [];
    const remain = [];
    for (let i = 0; i < rec.mood.length; i++) {
      if (rec.retractedMood.indexOf(i) < 0) remain.push(i);
    }
    if (remain.length) {
      const pick = remain[Math.floor(Math.random() * remain.length)];
      rec.retractedMood.push(pick);
      sessionChangedIdx.add(idx); // v3.6.x：标记本会话变更，防 loadMsgs 合并回滚局部撤回
      saveMsgs();
      const m = renderMsg(rec);
      m.dataset.idx = idx;
      if (target.parentNode) target.parentNode.replaceChild(m, target);
      return;
    }
  }
  retractMsg(target, side);
}

  // 按概率生成回复文本
  function genReplyText(c) {
    const pool = getPool();
    let reply = '', type = 'text';
    if (pool.sticker.length && hit(c['sticker-prob'])) {
      reply = pick(pool.sticker); type = 'sticker';
    } else if (pool.emoji.length && hit(c['emoji-prob'])) {
      reply = pick(pool.emoji); type = 'emoji';
    } else if (pool.image.length && hit(c['image-prob'])) {
      reply = pick(pool.image); type = 'image';
    } else if (pool.voice.length && hit(c['voice-prob'])) {
      reply = pick(pool.voice); type = 'voice';
    } else {
      reply = pick(pool.text) || '收到～';
    }
    if (type === 'text' && pool.kaomoji.length && hit(c['kaomoji-prob'])) {
      reply += ' ' + pick(pool.kaomoji);
    }
    return { text: reply, type: type };
  }

  // ---- 被动回复 ----
  function scheduleReply() {
    const c = cfg();
    if (hit(c['rn-prob'])) {
      setTimeout(() => addIn('', { special: 'read' }), randInt(1000, 4000));
      return;
    }
    const delay = (c['rs-min'] + Math.random() * Math.max(1, c['rs-max'] - c['rs-min'])) * 1000;
    // 等待回复期间显示「正在输入」
    showTyping();
    setTimeout(() => {
      hideTyping();
      if (hit(c['touch-prob'])) {
        performPoke();
        return;
      }
      const quote = hit(c['quote-prob']) ? (lastMineText || '…') : null;
      // 回复条数（每条消息独立生成内容）
      // v3.6.x：设置页最小/最大可被调反（min>max），randInt 会得负区间导致 TA 应回的
      // 消息静默消失——此处兜底保证至少 1 条
      const rpMin = Math.max(1, Number(c['reply-min']) || 1);
      const rpMax = Math.max(rpMin, Number(c['reply-max']) || 2);
      const count = randInt(rpMin, rpMax);
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          hideTyping();
          replyOnce(c, quote);
          // 还有下一条时继续显示「正在输入」
          if (i < count - 1) showTyping();
          // 最后一条回复完成后：音乐 TA 可能请求一起听歌（延后 2 秒）
          if (i === count - 1) {
            setTimeout(() => { if (window.maybeMusicRequest) window.maybeMusicRequest(); }, 2000);
          }
        }, i * randInt(1200, 2800));
      }
    }, delay);
  }
  // 单条回复：生成内容 + 发送 + 收藏/情绪/撤回 附带逻辑（供普通回复与「让对方继续说」共用）
  function replyOnce(c, quote) {
    const rep = genOneReply(c);
    // 引用我的消息：quote 是我发的文本，qside='out'（我发）
    const m = addIn(rep.text, { quote: quote, qside: 'out', type: rep.type, parts: rep.parts });
    // TA 收藏夹：联系人有概率（30%）收藏我发的最新一条消息（独立于情绪系统，任何回复后判定）
    if (lastMineText && Math.random() * 100 < 30) {
      const fav = getFav();
      // 同一条内容不重复收藏（已收藏过则跳过）
      if (!fav.some(f => f.side === 'out' && f.text === lastMineText)) {
        // 图片/表情按 dataURL 识别类型，避免收藏时按文本存导致显示超长乱码
        const favType = lastMineText.indexOf('data:') === 0 ? 'image' : 'text';
        fav.push({ side: 'out', text: lastMineText, type: favType, ts: Date.now(), by: 'ta' });
        saveFav(fav);
        setTimeout(() => toast('TA 收藏了你的一条消息'), 1200);
      }
    }
    // 情绪系统触发链（星言完整版）：文字回复和表情包回复都会触发
    if (rep.type === 'text' || rep.type === 'sticker' || rep.type === 'image') {
      if (window.addChatCount) window.addChatCount();
      const chain = (window.triggerEmotionChain && window.triggerEmotionChain()) || null;
      if (chain && chain.length) {
        // 类型名映射：情绪 / 心意 / 交流意图
        const typeName = { mood: '情绪', heart: '心意', intent: '交流意图' };
        setTimeout(() => {
          // 追加到主回复气泡 m 内部下方（不新增消息）
          // 所有字卡放进同一个 .msg-moods 容器：一条虚线与正文隔离，字卡紧凑同行
          const bm = m.querySelector('.msg-bubble');
          if (bm) {
            let mm = bm.querySelector('.msg-moods');
            if (!mm) {
              mm = document.createElement('div');
              mm.className = 'msg-moods';
              bm.appendChild(mm);
            }
            chain.forEach(it => {
              const tag = typeName[it.type] || '情绪';
              mm.innerHTML += '<div class="msg-mood' + (it.type === 'intent' ? ' msg-intent' : '') + '"><span class="msg-mood-tag">' + tag + '</span><span>' + it.content + '</span></div>';
            });
            // 持久化情绪字卡
            const idx2 = Number(m.dataset.idx);
            if (!isNaN(idx2) && msgs[idx2]) {
              msgs[idx2].mood = msgs[idx2].mood || [];
              chain.forEach(it => {
                msgs[idx2].mood.push({ tag: typeName[it.type] || '情绪', label: it.content });
              });
              saveMsgs();
            }
          }
        }, 500);
      }
    }
    if (hit(c['rc-prob'])) {
      setTimeout(() => {
        // ★ 字卡级局部撤回（仿星言）：多段文本/情绪卡优先局部撤回，否则整条撤回
        partialRetractMsg(m, 'in');
        if (hit(c['rc-refix'])) {
          showTyping();
          setTimeout(() => { hideTyping(); replyOnce(c, null); }, 600);
        }
      }, 900);
    }
  }
  // 「让对方继续说」：点击顶部联系人昵称触发，立即发 1 条（forceSingle）
  window.continueChat = function () {
    const c = cfg();
    showTyping();
    setTimeout(() => {
      hideTyping();
      replyOnce(c, null);
      setTimeout(() => { if (window.maybeMusicRequest) window.maybeMusicRequest(); }, 2000);
    }, 500);
  };
  // 点击顶部联系人昵称：让对方继续说（绑定复用顶部已声明的 pname）
  if (pname) {
    pname.addEventListener('click', () => {
      if (window.continueChat) window.continueChat();
    });
  }
  // 点击顶部联系人头像：打开查岗半框（复用 poke-card 样式）
  const pAv = document.getElementById('chat-partner-av');
  if (pAv) {
    pAv.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.openCkPanel) window.openCkPanel();
    });
  }
  let lastMineText = '';
  // v3.6.x：撤回/编辑我的消息后重新扫描最后一条可见的"我"的消息，
  // 避免 TA 引用/收藏到已撤回或已编辑的旧内容
  function syncLastMineText() {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m && m.side === 'out' && !m.retracted && typeof m.text === 'string' && m.text) {
        lastMineText = m.text;
        return;
      }
    }
    lastMineText = '';
  }

  // 生成一条回复文本：每条消息多字卡回复命中 → 多卡空格拼接；否则单卡（默认字卡按概率混入）
  function genOneReply(c) {
    const pool = getPool();
    let t, type = 'text';
    if (c['py-en'] === 1 && hit(c['py-prob']) && pool.text.length) {
      const n = randInt(c['py-min'], c['py-max']);
      t = pickN(pool.text, n).join(' ');
    } else {
      const r = genReplyText(c);
      t = r.text;
      type = r.type;
    }
    // 图片/表情包/语音类型：直接返回（不附加文字类字卡）
    if (type === 'sticker' || type === 'image' || type === 'voice') {
      return { text: t, type: type };
    }
    // 默认字卡混入（对应星言 defaultCommon 逻辑）
    const defs = (window.getDefaultCards && window.getDefaultCards()) || null;
    if (defs && defs.type === 'text' && defs.text) {
      t = defs.text;
    }
    // 回应字卡（独立池，类似默认字卡）：开启时按概率直接使用一条回应字卡
    const replyWord = (window.getReplyCard && window.getReplyCard()) || '';
    if (replyWord) {
      t = replyWord;
    }
    // 回应连接词附着（cf-prob 命中 + 按回复特征选类）
    if (hit(c['cf-prob'])) {
      const w = (window.getFollowupWord && window.getFollowupWord(t)) || '';
      if (w) t += ' ' + w;
    }
    // 联系人也可组合发送：按概率附加 1 张表情包/图片到同一条消息（图片池来自自定义字卡媒体）
    // 表情包 → 小图 sub:'sticker'；图片 → 大图 sub:'image'
    const parts = [{ k: 'text', v: t }];
    if (hit(c['sticker-prob'] || 0)) {
      const st = (window.getMediaCards && window.getMediaCards('sticker')) || [];
      if (st.length) parts.push({ k: 'img', v: st[Math.floor(Math.random() * st.length)], sub: 'sticker' });
    } else if (hit(c['image-prob'] || 0)) {
      const im = (window.getMediaCards && window.getMediaCards('image')) || [];
      if (im.length) parts.push({ k: 'img', v: im[Math.floor(Math.random() * im.length)], sub: 'image' });
    }
    return { text: t, type: 'text', parts: parts.length > 1 ? parts : null };
  }

  // ---- 主动发送 ----
  // 只在应用加载时启动一次（不再依赖进入聊天页，且进聊天页不再重置计时器，
  // 否则用户频繁进出会导致间隔反复重置、TA 几乎从不主动发消息）
  let autoTimer = null;
  function scheduleAutoSend() {
    clearTimeout(autoTimer);
    const c = cfg();
    if (cfgn(c, 'as-en', 1) !== 1) {
      autoTimer = setTimeout(scheduleAutoSend, 30000);
      return;
    }
    let asMin = cfgn(c, 'as-min', 5) * 60, asMax = cfgn(c, 'as-max', 10) * 60;
    if (cfgn(c, 'dnd-en', 0) === 1) { asMin = 1; asMax = 10800; }
    const delay = (asMin + Math.random() * Math.max(1, asMax - asMin)) * 1000;
    autoTimer = setTimeout(() => {
      tryAutoSend();
      scheduleAutoSend();
    }, delay);
  }
  function tryAutoSend() {
    const c = cfg();
    if (cfgn(c, 'as-en', 1) !== 1) return;
    // v3.5.101：概率为 0/空 时回退默认值——防止旧数据/误操作把概率存成 0 导致 TA 永不主动发送
    // v3.6.x：回退默认与回复设置默认一致（10 → 30）
    let prob = cfgn(c, 'as-prob', 30);
    if (!(prob > 0)) prob = 30;
    if (cfgn(c, 'dnd-en', 0) === 1) prob = 10;
    if (!hit(prob)) return;
    if (hit(cfgn(c, 'touch-prob', 5))) { performPoke(); return; }
    const pool = getPool();
    // 每条消息内容：主字卡/颜文字/emoji/表情包/图片 全 5 类混排（与回复一致）
    // v3.6.x：autoMsg 返回 {text, type}——之前直接返回 dataURL 字符串且 addIn 不传 type，
    //   图片/表情包会被当普通文本渲染成超长 base64 乱码
    const autoMsg = () => {
      const r = Math.random() * 100;
      if (pool.sticker.length && r < 15) return { text: pick(pool.sticker), type: 'sticker' };
      if (pool.image.length && r < 25) return { text: pick(pool.image), type: 'image' };
      if (pool.kaomoji.length && r < 40) return { text: pick(pool.kaomoji), type: 'text' };
      if (pool.emoji.length && r < 55) return { text: pick(pool.emoji), type: 'text' };
      return { text: pick(pool.text) || '在吗？', type: 'text' };
    };
    // v3.6.x：条数最少/最多调反时兜底（保证至少 1 条）
    const acMin = Math.max(1, Number(cfgn(c, 'as-count-min', 1)) || 1);
    const acMax = Math.max(acMin, Number(cfgn(c, 'as-count-max', 2)) || 2);
    const count = randInt(acMin, acMax);
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        hideTyping();
        const am = autoMsg();
        const m = addIn(am.text, { type: am.type });
        if (hit(c['rc-prob'])) {
          setTimeout(() => {
            retractMsg(m, 'in');
            if (hit(c['rc-refix'])) {
              showTyping();
              setTimeout(() => { hideTyping(); addIn(pick(pool.text) || '…'); }, 600);
            }
          }, 900);
        }
        // 还有下一条时继续显示「正在输入」
        if (i < count - 1) showTyping();
      }, i * randInt(900, 2600));
    }
  }

  // ---- 进入聊天页：恢复历史 ----
  const chatApp = document.querySelector('.app[data-app="chat"]');
  const chatPage = document.getElementById('page-chat');
  function scrollToBottom() {
    body.scrollTop = body.scrollHeight;
  }
  function enterChat() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const phoneTab = document.querySelector('.tab[data-page="page-phone"]');
    if (phoneTab) phoneTab.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    chatPage.hidden = false;
    fillAvatar('chat-user-av', 'avatar-user');
    fillAvatar('chat-partner-av', 'avatar-partner');
    if (window.applyChatSettings) window.applyChatSettings();
    // v3.5.100：打开聊天页即清零未读提醒（微信式）
    clearChatUnread();
    // 恢复历史消息（不打断 TA 正在输入的状态，返回时自动恢复显示）
    loadMsgs();
    // v3.6.x：分页渲染——首屏最近 RENDER_MAX 条（原全量渲染几千条卡顿数秒）
    renderWindow(false, true);
    // 定位到最新消息：立即滚 + 下一帧各补一次，
    // 避免图片/头像异步解码改变布局高度导致停在中间
    // v3.6.x：去重——原实现 rAF(→rAF) 与 setTimeout(80/400) 四重滚动效果相同，
    // 保留 rAF 双帧（等图片解码最紧的一帧）+ 单次延迟兜底，减少重复滚动
    scrollToBottom();
    if (window.requestAnimationFrame) {
      requestAnimationFrame(scrollToBottom);
      requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
    }
    setTimeout(scrollToBottom, 400);
    if (typingOn && chatVisible()) {
      typingEl.hidden = false;
      scrollChatBottom(); // typing 行占位时保持最后一条可见
    }
  }
  if (chatApp && chatPage) {
    chatApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid'))
        .some(g => g.classList.contains('editing'));
      if (editing) return;
      enterChat();
    });
  }

  // 返回桌面（不打断 TA 正在输入/发送的节奏）
  const back = document.getElementById('chat-back');
  if (back) {
    back.addEventListener('click', () => {
      const phonePage = document.getElementById('page-phone');
      if (phonePage) {
        document.querySelectorAll('.page').forEach(p => p.hidden = true);
        phonePage.hidden = false;
      }
    });
  }

  // 聊天设置：右上角三点进入，返回回聊天页
  const csBtn = document.getElementById('chat-settings-btn');
  const csPage = document.getElementById('page-chat-settings');
  if (csBtn && csPage) {
    csBtn.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      csPage.hidden = false;
    });
  }
  const csBack = document.getElementById('cs-back');
  if (csBack) {
    csBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      chatPage.hidden = false;
    });
  }

  // ---- 更多功能面板（顶部分类 tab：更多功能 / TA的提问，记住上次分类） ----
  const morePanel = document.getElementById('chat-more-panel');
  const moreBtn = document.getElementById('chat-more-btn');
  if (moreBtn && morePanel) {
    const moreTabFun = document.getElementById('more-tab-fun');
    const moreTabAsk = document.getElementById('more-tab-ask');
    const moreGridFun = document.getElementById('more-grid-fun');
    const moreGridAsk = document.getElementById('more-grid-ask');
    function applyMoreTab(tab) {
      const fun = tab !== 'ask';
      if (moreTabFun) moreTabFun.classList.toggle('sel', fun);
      if (moreTabAsk) moreTabAsk.classList.toggle('sel', !fun);
      if (moreGridFun) moreGridFun.hidden = !fun;
      if (moreGridAsk) moreGridAsk.hidden = fun;
      store.set('more-tab', fun ? 'fun' : 'ask');
    }
    if (moreTabFun) moreTabFun.addEventListener('click', (e) => { e.stopPropagation(); applyMoreTab('fun'); });
    if (moreTabAsk) moreTabAsk.addEventListener('click', (e) => { e.stopPropagation(); applyMoreTab('ask'); });
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 打开时停留在上次打开的分类
      if (morePanel.hidden) {
        let tab = 'fun';
        try {
          const saved = store.get('more-tab');
          if (saved === 'ask') tab = 'ask';
        } catch (err) {}
        applyMoreTab(tab);
        closeIme(); // v3.5.116：收起输入法，面板不被键盘遮挡
      }
      morePanel.hidden = !morePanel.hidden;
    });
    // 点击面板外部关闭
    document.addEventListener('click', (e) => {
      if (!morePanel.hidden && !morePanel.contains(e.target) && e.target !== moreBtn && !moreBtn.contains(e.target)) {
        morePanel.hidden = true;
      }
    });
  }
  // 我方拍一拍：聊天页内浮层卡片（展示分组/字卡，点击使用）
  const pokeCard = document.getElementById('poke-card');
  const pokeList = document.getElementById('poke-list');
  const pokeClose = document.getElementById('poke-card-close');
  const pokeName = document.getElementById('poke-partner-name');
  // 发送一次拍一拍（触发联系人回复）
  function sendPoke(action) {
    const name = store.get('lbl-partner') || 'TA';
    let text;
    if (action.indexOf('你') >= 0) {
      // 字卡含"你"：替换成联系人昵称，如"戳了戳你的脸蛋"→"戳了戳TA的脸蛋"
      text = '我 ' + action.replace(/你/g, name);
    } else {
      // 字卡不含"你"：在末尾补联系人昵称，如"戳一戳"→"戳一戳 TA"
      text = '我 ' + action + ' ' + name;
    }
    addRec({ side: 'in', text: text, special: 'poke' });
    if (window.logFish) window.logFish();
    // 拍一拍后联系人快速响应：1-3 秒内必回复或已读不回（不等 rs 长延迟）
    setTimeout(() => {
      const c2 = cfg();
      if (hit(c2['rn-prob'])) {
        addIn('', { special: 'read' });
        return;
      }
      showTyping();
      setTimeout(() => {
        hideTyping();
        if (hit(c2['touch-prob'])) { performPoke(); return; }
        const r = genOneReply(c2);
        const m2 = addIn(r.text, { type: r.type });
        if (hit(c2['rc-prob'])) {
          setTimeout(() => { retractMsg(m2, 'in'); }, 900);
        }
      }, randInt(800, 2000));
    }, randInt(600, 1200));
  }
  function renderPokeCard() {
    const name = store.get('lbl-partner') || 'TA';
    if (pokeName) pokeName.textContent = name;
    const groups = (window.getPokeGroups && window.getPokeGroups()) || [];
    if (!pokeList) return;
    pokeList.innerHTML = '';
    if (!groups.length) {
      pokeList.innerHTML = '<div class="cc-empty">暂无拍一拍字卡<br>请到 自定义聊天字卡 → 拍一拍 添加</div>';
      return;
    }
    groups.forEach(([gname, arr]) => {
      if (!arr.length) return;
      const h = document.createElement('div');
      h.className = 'cc-group-header';
      h.innerHTML = '<span class="ccg-name">' + gname + '</span><span class="ccg-count">' + arr.length + '</span>';
      pokeList.appendChild(h);
      arr.forEach(c => {
        const d = document.createElement('div');
        d.className = 'cc-item glass';
        d.innerHTML = '<div class="cc-txt"><div class="t">' + c + '</div></div>';
        d.addEventListener('click', () => { sendPoke(c); closePokeCard(); });
        pokeList.appendChild(d);
      });
    });
  }
  function closePokeCard() {
    if (pokeCard) pokeCard.hidden = true;
  }
  const morePoke = document.getElementById('more-poke');
  if (morePoke) {
    morePoke.addEventListener('click', (e) => {
      e.stopPropagation();
      openPokeCard();
    });
  }

  // ---- 占卜：聊天页底部半框（v3.5.53 露出聊天消息）----
  const chatDivinePanel = document.getElementById('chat-divine-panel');
  const chatDivineBody = document.getElementById('chat-divine-body');
  const chatDivineClose = document.getElementById('chat-divine-close');
  let chatDivineMode = 'tarot';
  let chatDivineCount = 3;
  function openChatDivine() {
    if (!chatDivinePanel) return;
    // 关闭其他底部半框
    const pc = document.getElementById('poke-card');
    if (pc) pc.hidden = true;
    const ep = document.getElementById('emoji-panel');
    if (ep) ep.hidden = true;
    const askP = document.getElementById('chat-ask-panel');
    if (askP) askP.hidden = true;
    const cs = document.getElementById('chat-search');
    if (cs) cs.hidden = true;
    if (window.closeAvlib) window.closeAvlib();
    chatDivinePanel.hidden = false;
  }
  const moreDivine = document.getElementById('more-divine');
  if (moreDivine) {
    moreDivine.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      openChatDivine();
    });
  }
  if (chatDivineClose) chatDivineClose.addEventListener('click', (e) => { e.stopPropagation(); chatDivinePanel.hidden = true; });
  // 占卜半框：模式 / 张数切换
  if (chatDivineBody) {
    chatDivineBody.querySelectorAll('[data-chatmode]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        chatDivineMode = b.getAttribute('data-chatmode');
        chatDivineBody.querySelectorAll('[data-chatmode]').forEach(x => x.classList.toggle('sel', x === b));
        const r = document.getElementById('div-chat-result');
        if (r) r.innerHTML = '<div class="div-result-empty">点击上方按钮开始抽牌</div>';
      });
    });
    chatDivineBody.querySelectorAll('[data-chatcount]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        chatDivineCount = Number(b.getAttribute('data-chatcount'));
        chatDivineBody.querySelectorAll('[data-chatcount]').forEach(x => x.classList.toggle('sel', x === b));
        const r = document.getElementById('div-chat-result');
        if (r) r.innerHTML = '<div class="div-result-empty">点击上方按钮开始抽牌</div>';
      });
    });
    const divDraw = document.getElementById('div-chat-draw');
    if (divDraw) {
      divDraw.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = document.getElementById('div-chat-result');
        if (!r) return;
        const question = (document.getElementById('div-chat-question') || {}).value || '';
        // 复用桌面占卜的牌库
        const deck = chatDivineMode === 'tarot' ? (window.__TAROT__ || []) : (window.__LENO__ || []);
        const icons = chatDivineMode === 'tarot' ? (window.__TAROT_ICONS__ || {}) : (window.__LENO_ICONS__ || {});
        const labels = (window.__MODE_LABELS__ || {})[chatDivineMode] || {};
        const labelsArr = labels[chatDivineCount] || [];
        const shuf = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = b[i]; b[i] = b[j]; b[j] = t; } return b; };
        const cardHtml = (ico, name, meaning, label, rev) =>
          '<div class="div-mini">' +
          (label ? '<div class="div-mini-tag">' + label + '</div>' : '') +
          '<div class="div-card-face">' +
          '<div class="div-card-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (icons[ico] || '') + '</svg></div>' +
          '<div class="div-card-name">' + (rev ? name + '（逆）' : name) + '</div>' +
          '</div>' +
          '<div class="div-card-meaning">' + meaning + '</div>' +
          '</div>';
        if (!deck.length) { r.innerHTML = '<div class="div-result-empty">占卜牌库加载中…</div>'; return; }
        const cards = shuf(deck).slice(0, chatDivineCount);
        let html = '<div class="div-spread">';
        cards.forEach((c, i) => {
          let rev = false, meaning = c.meaning;
          if (chatDivineMode === 'tarot') { rev = Math.random() > 0.5; meaning = rev ? c.neg : c.pos; }
          html += cardHtml(c.icon, c.name, meaning, labelsArr[i] || '', rev);
        });
        html += '</div>';
        // v3.5.130：总结用实际抽出的牌（原来重新洗牌取的牌与展示牌面无关）
        const names = cards.slice(0, 2).map(c => c.name).join(' · ');
        html += '<div class="div-summary">综合解读：' + names + '</div>';
        if (question) html += '<div class="div-card-meaning" style="opacity:.6;text-align:center;margin-top:8px">问：' + question + '</div>';
        r.innerHTML = html;
      });
    }
  }

  // ---- TA的提问：4 个"让TA现在…"按钮（TA的询问/小问题/好奇/吐槽） ----
  function bindTaNow(id, fn) {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (morePanel) morePanel.hidden = true;
        if (fn) fn();
      });
    }
  }
  bindTaNow('more-ask-now', () => { if (window.triggerTaAskNow) window.triggerTaAskNow(); });
  bindTaNow('more-choose-now', () => { if (window.triggerTaChooseNow) window.triggerTaChooseNow(); });
  bindTaNow('more-curious-now', () => { if (window.triggerTaCuriousNow) window.triggerTaCuriousNow(); });
  bindTaNow('more-roast-now', () => { if (window.triggerTaRoastNow) window.triggerTaRoastNow(); });

  // ---- 帮我决定：聊天页底部半框（v3.5.53 露出聊天消息）----
  const moreDecide = document.getElementById('more-decide');
  if (moreDecide) {
    moreDecide.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      if (window.openDecision) {
        // 关闭其他底部半框，再打开帮我决定
        const pc = document.getElementById('poke-card');
        if (pc) pc.hidden = true;
        const ep = document.getElementById('emoji-panel');
        if (ep) ep.hidden = true;
        const askP = document.getElementById('chat-ask-panel');
        if (askP) askP.hidden = true;
        const cs = document.getElementById('chat-search');
        if (cs) cs.hidden = true;
        const dv = document.getElementById('chat-divine-panel');
        if (dv) dv.hidden = true;
        if (window.closeAvlib) window.closeAvlib();
        window.openDecision();
      } else toast('帮我决定加载失败');
    });
  }
  const chatDecisionClose = document.getElementById('chat-decision-close');
  if (chatDecisionClose) {
    chatDecisionClose.addEventListener('click', (e) => {
      e.stopPropagation();
      const dp = document.getElementById('chat-decision-panel');
      if (dp) dp.hidden = true;
    });
  }

  // ---- 邀请TA / 问问TA 触发后随机追加 4 类提问卡片（v3.5.33）----
  // TA 回应后，有 35% 概率顺带触发 询问/小问题/好奇/吐槽 之一（卡片发送到聊天，尊重各自弹窗开关）
  function maybeFollowupAskCard() {
    if (Math.random() >= 0.35) return;
    const roll = Math.random();
    try {
      if (roll < 0.25 && window.triggerTaAskNow) { window.triggerTaAskNow(); return; }
      if (roll < 0.5 && window.triggerTaChooseNow) { window.triggerTaChooseNow(); return; }
      if (roll < 0.75 && window.triggerTaCuriousNow) { window.triggerTaCuriousNow(); return; }
      if (window.triggerTaRoastNow) window.triggerTaRoastNow();
    } catch (e) {}
  }

  // ---- 邀请TA / 问问TA：聊天页内嵌半框（v3.5.52 露出聊天消息，星言式）----
  // 半框内输入 → 发送邀请/提问卡片 → TA 必回应（接受/拒绝/未回应 或 回答），记录历史
  const chatAskPanel = document.getElementById('chat-ask-panel');
  const chatAskTitle = document.getElementById('chat-ask-title');
  const chatAskInput = document.getElementById('chat-ask-input');
  const chatAskOk = document.getElementById('chat-ask-ok');
  const chatAskCancel = document.getElementById('chat-ask-cancel');
  const chatAskClose = document.getElementById('chat-ask-close');
  let chatAskMode = 'invite'; // invite / ask
  function openChatAskPanel(mode) {
    if (!chatAskPanel) return;
    chatAskMode = mode || 'invite';
    if (chatAskTitle) chatAskTitle.textContent = chatAskMode === 'invite' ? '邀请TA' : '问问TA';
    if (chatAskInput) {
      chatAskInput.placeholder = chatAskMode === 'invite' ? '想邀请TA做什么？' : '你的问题？';
      chatAskInput.value = '';
    }
    // 关闭其他底部半框
    const pc = document.getElementById('poke-card');
    if (pc) pc.hidden = true;
    const ep = document.getElementById('emoji-panel');
    if (ep) ep.hidden = true;
    if (window.closeAvlib) window.closeAvlib();
    chatAskPanel.hidden = false;
    closeIme(); // v3.5.116：收起输入法，半框完整不被键盘遮挡
    setTimeout(() => chatAskInput && chatAskInput.focus(), 80);
  }
  function closeChatAskPanel() {
    if (chatAskPanel) chatAskPanel.hidden = true;
  }
  function submitChatAsk() {
    if (!chatAskInput) return;
    const content = (chatAskInput.value || '').trim();
    if (!content) { toast('请输入内容'); return; }
    closeChatAskPanel();
    if (chatAskMode === 'invite') {
      // 我的邀请：居中卡片（等待状态）
      addRec({ side: 'out', text: '邀请：' + content, special: 'invite', inviteContent: content, inviteStatus: 'pending' });
      const inviteIdx = msgs.length - 1;
      if (window.logFish) window.logFish();
      const histKey = 'invite-ask-history';
      const recTs = Date.now();
      setTimeout(() => {
        const roll = Math.random();
        const name = store.get('lbl-partner') || 'TA';
        let status, answer, reply = null;
        if (roll < 0.6) {
          status = '接受';
          answer = name + ' 接受了你的邀请';
          reply = ['好，我答应你。', '可以呀。', '我陪你。', '走吧。', '嗯，陪你。'][Math.floor(Math.random() * 5)];
          setTimeout(() => addIn(reply), 800);
        } else if (roll < 0.85) {
          status = '拒绝';
          answer = name + ' 拒绝了你的邀请';
          reply = ['这次不行。', '下次吧。', '抱歉。', '今天不方便。'][Math.floor(Math.random() * 4)];
          setTimeout(() => addIn(reply), 800);
        } else {
          status = '未回应';
          answer = name + ' 暂时没有回应';
        }
        const rec = msgs[inviteIdx];
        if (rec && rec.special === 'invite') {
          rec.inviteStatus = 'answered';
          rec.inviteAnswer = answer;
          saveMsgs();
          const el = body.querySelector('.msg-ask[data-idx="' + inviteIdx + '"]');
          if (el) {
            el.innerHTML = '<div class="msg-ask-card answered"><div class="msg-ask-q">邀请TA · ' + String(content).replace(/</g, '&lt;') + '</div><div class="msg-ask-a">✓ ' + answer + '</div></div>';
          }
        }
        try {
          const list = JSON.parse(store.get(histKey) || '[]');
          list.unshift({ type: 'invite', q: content, a: reply || status, ts: recTs });
          if (list.length > 200) list.length = 200;
          store.set(histKey, JSON.stringify(list));
        } catch (err) {}
        if (window.renderAskRecords) window.renderAskRecords();
        setTimeout(maybeFollowupAskCard, 1200);
      }, 1500 + Math.random() * 2500);
    } else {
      // 问问TA
      addRec({ side: 'out', text: '问：' + content, special: 'ask', askQuestion: content, askStatus: 'pending' });
      const askIdx = msgs.length - 1;
      if (window.logFish) window.logFish();
      const recTs = Date.now();
      setTimeout(() => {
        const defs = ['嗯嗯', '我想想…', '应该吧', '好呀', '我陪你', '可以的', '那挺好呀', '我觉得可以', '听你的', '当然可以', '我很乐意'];
        const text = defs[Math.floor(Math.random() * defs.length)];
        const rec = msgs[askIdx];
        if (rec && rec.special === 'ask') {
          rec.askStatus = 'answered';
          rec.askAnswer = text;
          saveMsgs();
          const el = body.querySelector('.msg-ask[data-idx="' + askIdx + '"]');
          if (el) {
            el.innerHTML = '<div class="msg-ask-card answered"><div class="msg-ask-q">问问TA · ' + String(content).replace(/</g, '&lt;') + '</div><div class="msg-ask-a">✓ TA：' + text + '</div></div>';
          }
        }
        addIn(text);
        try {
          const list = JSON.parse(store.get('invite-ask-history') || '[]');
          list.unshift({ type: 'ask', q: content, a: text, ts: recTs });
          if (list.length > 200) list.length = 200;
          store.set('invite-ask-history', JSON.stringify(list));
        } catch (err) {}
        if (window.renderAskRecords) window.renderAskRecords();
        setTimeout(maybeFollowupAskCard, 1200);
      }, 1500 + Math.random() * 2500);
    }
  }
  const moreInvite = document.getElementById('more-invite');
  if (moreInvite) {
    moreInvite.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      openChatAskPanel('invite');
    });
  }
  const moreAsk = document.getElementById('more-ask');
  if (moreAsk) {
    moreAsk.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      openChatAskPanel('ask');
    });
  }
  if (chatAskOk) chatAskOk.addEventListener('click', (e) => { e.stopPropagation(); submitChatAsk(); });
  if (chatAskCancel) chatAskCancel.addEventListener('click', (e) => { e.stopPropagation(); closeChatAskPanel(); });
  if (chatAskClose) chatAskClose.addEventListener('click', (e) => { e.stopPropagation(); closeChatAskPanel(); });
  if (chatAskInput) chatAskInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.stopPropagation(); submitChatAsk(); } });

// ---- 搜索聊天记录（完整版：搜索全部历史，结果可点击跳转定位） ----
// ---- 搜索聊天记录：聊天页内嵌覆盖层（v3.5.52，星言式——不离开聊天页）----
  // 覆盖层内：返回聊天 / 关键词搜索（命中高亮）/ 点击结果跳转 / 跳转最新消息
  const chatSearchEl = document.getElementById('chat-search');
  const chatSearchInput = document.getElementById('chat-search-input');
  const chatSearchGo = document.getElementById('chat-search-go');
  const chatSearchResults = document.getElementById('chat-search-results');
  const chatSearchNew = document.getElementById('chat-search-new');
  function openChatSearch() {
    if (!chatSearchEl) return;
    loadMsgs();
    chatSearchEl.hidden = false;
    chatSearchInput.value = '';
    chatSearchResults.innerHTML = '<div class="chat-search-empty">输入关键词搜索聊天记录</div>';
    setTimeout(() => chatSearchInput.focus(), 60);
  }
  function closeChatSearch() {
    if (chatSearchEl) chatSearchEl.hidden = true;
  }
  function runChatSearch() {
    if (!chatSearchResults) return;
    const q = (chatSearchInput.value || '').trim();
    if (!q) { chatSearchResults.innerHTML = '<div class="chat-search-empty">输入关键词搜索聊天记录</div>'; return; }
    loadMsgs();
    const partnerName = store.get('lbl-partner') || 'TA';
    const myName = store.get('lbl-user') || '我';
    const results = [];
    msgs.forEach((m, i) => {
      if (!m || m.special) return;
      let txt = typeof m.text === 'string' ? m.text : '';
      if (m.askQuestion) txt += ' ' + m.askQuestion;
      if (m.choiceQuestion) txt += ' ' + m.choiceQuestion;
      if (m.curiousQuestion) txt += ' ' + m.curiousQuestion;
      if (m.roastText) txt += ' ' + m.roastText;
      if (txt.indexOf(q) >= 0) results.push({ i: i, m: m, txt: txt });
    });
    if (!results.length) {
      chatSearchResults.innerHTML = '<div class="chat-search-empty">没有找到包含「' + q + '」的消息</div>';
      return;
    }
    const esc = (x) => String(x == null ? '' : x).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const hl = (x) => esc(x).split(q).join('<span class="chat-search-hl">' + esc(q) + '</span>');
    let html = '<div style="font-size:11px;color:var(--muted);margin:6px 2px 10px">共 ' + results.length + ' 条 · 点击结果跳转到对应消息</div>';
    results.slice(0, 80).forEach(r => {
      const isImg = r.txt.indexOf('data:') === 0;
      const label = isImg ? '[图片]' : (r.txt.length > 60 ? r.txt.slice(0, 60) + '…' : r.txt);
      const who = r.m.side === 'out' ? myName : partnerName;
      const time = r.m.ts ? fmtTime(r.m.ts) : '';
      html += '<div class="tc-listitem" data-sidx="' + r.i + '"><div class="tc-li-top"><span class="tc-li-q">' + who + '：' + (isImg ? '[图片]' : hl(label)) + '</span><span class="tc-li-time">' + time + '</span></div></div>';
    });
    if (results.length > 80) html += '<div class="ta-empty">还有 ' + (results.length - 80) + ' 条…</div>';
    chatSearchResults.innerHTML = html;
    chatSearchResults.querySelectorAll('.tc-listitem').forEach(el => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.sidx);
        closeChatSearch();
        let target = body.querySelector('.msg[data-idx="' + idx + '"]');
        // v3.6.x：分页渲染下目标可能落在未渲染的旧消息区 → 扩窗后跳转
        if (!target && idx < renderStart) {
          renderStart = Math.max(0, idx - JUMP_VIEW);
          renderWindow(true, false);
          target = body.querySelector('.msg[data-idx="' + idx + '"]');
        }
        if (target) {
          try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { target.scrollIntoView(); }
          target.classList.add('highlight');
          setTimeout(() => target.classList.remove('highlight'), 2200);
        } else {
          body.scrollTop = body.scrollHeight;
        }
      });
    });
  }
  const moreSearch = document.getElementById('more-search');
  if (moreSearch) {
    moreSearch.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      // 关闭其他底部半框，再打开搜索半框
      const pc = document.getElementById('poke-card');
      if (pc) pc.hidden = true;
      const askP = document.getElementById('chat-ask-panel');
      if (askP) askP.hidden = true;
      if (window.closeAvlib) window.closeAvlib();
      openChatSearch();
    });
  }
  if (chatSearchGo) chatSearchGo.addEventListener('click', (e) => { e.stopPropagation(); runChatSearch(); });
  if (chatSearchInput) chatSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.stopPropagation(); runChatSearch(); } });
  const chatSearchClose = document.getElementById('chat-search-close');
  if (chatSearchClose) chatSearchClose.addEventListener('click', (e) => { e.stopPropagation(); closeChatSearch(); });
  if (chatSearchNew) chatSearchNew.addEventListener('click', (e) => {
    e.stopPropagation();
    closeChatSearch();
    scrollChatBottom();
    const last = body.lastElementChild;
    if (last) {
      try { last.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch (e2) { last.scrollIntoView(); }
    }
  });

  // ---- 通话（星言版：拨号 → 接通/未接，模拟通话）----
  const moreCall = document.getElementById('more-call');
  if (moreCall) {
    moreCall.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      // 完整通话系统：拨打弹窗 → 忙线/拒绝/接通 → 接通后小框
      if (window.placeCall) window.placeCall();
      else {
        // 降级：旧逻辑
        const name = store.get('lbl-partner') || 'TA';
        addRec({ side: 'out', text: '拨打 ' + name + ' 语音通话', special: 'call' });
        if (window.logFish) window.logFish();
      }
    });
  }
  if (pokeClose) pokeClose.addEventListener('click', (e) => { e.stopPropagation(); closePokeCard(); });
  // 打开拍一拍：关掉其他底部半框（表情包/头像互动），露出聊天消息
  function openPokeCard() {
    if (!pokeCard) return;
    const ep = document.getElementById('emoji-panel');
    if (ep) ep.hidden = true;
    if (window.closeAvlib) window.closeAvlib();
    pokeCard.hidden = false;
    if (morePanel) morePanel.hidden = true;
    closeIme(); // v3.5.116：收起输入法，面板不被键盘遮挡
    renderPokeCard();
  }
  // 点击卡片外部关闭
  document.addEventListener('click', (e) => {
    if (pokeCard && !pokeCard.hidden && !pokeCard.contains(e.target)) closePokeCard();
  });
  // ---- 消息气泡操作：引用 / 收藏 / 撤回 / 编辑 ----
  const msgActions = document.getElementById('msg-actions');
  let activeMsgEl = null;   // 当前操作的消息 DOM
  let activeSide = 'in';    // 当前操作消息方向
  let lastQuote = null;     // 待引用内容

  // 收藏存储
  function getFav() { try { return JSON.parse(store.get('fav-msgs') || '[]'); } catch (e) { return []; } }
  function saveFav(list) { store.set('fav-msgs', JSON.stringify(list)); }

  function closeMsgActions() {
    if (msgActions) msgActions.hidden = true;
    activeMsgEl = null;
  }
  // 气泡点击弹出操作菜单
  if (body) {
    body.addEventListener('click', (e) => {
      const b = e.target.closest('.msg-bubble');
      if (!b) { closeMsgActions(); return; }
      const item = b.closest('.msg');
      if (!item) return;
      // 特殊消息不弹菜单（已读不回/拍一拍/撤回提示/局部撤回胶囊）
      const special = item.classList.contains('msg-poke');
      if (special) return;
      if (e.target.closest('.msg-poke-seg')) return;
      if (b.textContent.indexOf('撤回了一条消息') >= 0 || b.textContent.indexOf('已读不回') >= 0) return;
      e.stopPropagation();
      activeMsgEl = item;
      activeSide = item.classList.contains('msg-out') ? 'out' : 'in';
      // 显示对应按钮：我的消息多 撤回/编辑
      if (msgActions) {
        msgActions.querySelectorAll('.ma-mine').forEach(b2 => b2.hidden = activeSide !== 'out');
        msgActions.hidden = false;
        // 定位到气泡旁边：优先气泡上方，空间不足放下方
        // v3.5.116：手机端输入法弹出时可视高度按 visualViewport 计算，
        // 菜单不再被键盘盖住/跑到键盘下面（全屏模式下老问题）
        const bRect = b.getBoundingClientRect();
        const aw = msgActions.offsetWidth || 200;
        const ah = msgActions.offsetHeight || 50;
        const vv = window.visualViewport;
        const vw = vv ? vv.width : window.innerWidth;
        const vh = vv ? vv.height : window.innerHeight;
        let x = bRect.left + bRect.width / 2 - aw / 2;
        x = Math.max(10, Math.min(vw - aw - 10, x));
        let y = bRect.top - ah - 8;
        const below = bRect.bottom + 8;
        const aboveFits = y >= 50;
        const belowFits = below + ah <= vh - 8;
        // 上方放得下优先上方；下方被输入法/底部遮挡时也退回上方
        y = aboveFits || !belowFits ? y : below;
        msgActions.style.left = x + 'px';
        msgActions.style.top = y + 'px';
      }
    });
    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (msgActions && !msgActions.hidden && !msgActions.contains(e.target)) closeMsgActions();
    });
  }
  // 操作执行
  if (msgActions) {
    msgActions.addEventListener('click', (e) => {
      const btn = e.target.closest('.ma-btn');
      if (!btn) return;
      const act = btn.dataset.act;
      const idx = activeMsgEl ? Number(activeMsgEl.dataset.idx) : -1;
      const rec = (idx >= 0 && msgs[idx]) ? msgs[idx] : null;
      if (act === 'quote') {
        // 引用：记录待引用内容，下次发送带引用块（组合消息同时带图片缩略图）
        if (rec) {
          const qimgs = (rec.parts || []).filter(p => p.k === 'img').map(p => p.v).slice(0, 3);
          // v3.5.131：语音消息引用存占位文案（rec.text 是「文件名|||base64」，
          // 直接引用会在气泡里显示整段 base64 乱码）
          const qtext = rec.type === 'voice' ? '[语音] ' + String(rec.text || '').split('|||')[0] : rec.text;
          lastQuote = { side: rec.side, text: qtext, type: rec.type, imgs: qimgs };
          toast('已选择引用，发送消息时带上');
        }
        closeMsgActions();
      } else if (act === 'fav') {
        if (rec) {
          const fav = getFav();
          // 同一条内容不重复收藏
          if (fav.some(f => f.side === rec.side && f.text === rec.text)) {
            toast('已收藏过这条消息');
          } else {
            fav.push({ side: rec.side, text: rec.text, type: rec.type || 'text', ts: rec.ts || Date.now(), by: 'me', mood: (rec.mood || []).slice() });
            saveFav(fav);
            toast('已收藏到我的收藏');
          }
        }
        closeMsgActions();
      } else if (act === 'retract') {
        if (activeMsgEl) retractMsg(activeMsgEl, 'out');
        closeMsgActions();
      } else if (act === 'edit') {
        if (rec && window.openModal) {
          const orig = rec.text;
          // v3.5.131：闭包捕获气泡元素——closeMsgActions 会置 activeMsgEl=null，
          // 回调里再读必现 TypeError（编辑结果不更新界面）
          const editEl = activeMsgEl;
          window.openModal('编辑消息', orig.indexOf('data:') === 0 ? '' : orig, (v) => {
            const val = (v || '').trim();
            if (!val) return;
            // 更新记录与 DOM
            rec.text = val;
            rec.type = 'text';
            sessionChangedIdx.add(idx); // v3.6.x：标记本会话变更，防 loadMsgs 合并回滚编辑
            saveMsgs();
            syncLastMineText(); // v3.6.x：编辑后 TA 引用/收藏不再拿旧文本
            const b = editEl && editEl.querySelector('.msg-bubble');
            if (b) b.innerHTML = '<span style="opacity:.85">' + String(val).replace(/</g, '&lt;') + '</span>';
          });
        }
        closeMsgActions();
      }
    });
  }
  // 轻提示（复用 cc-toast 风格）
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cc-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }

  // ---- 收藏页 ----
  const favPage = document.getElementById('page-fav');
  const favList = document.getElementById('fav-list');
  let favTab = 'mine'; // mine=我的收藏 ta=联系人的收藏
  function renderFav() {
    if (!favList) return;
    const fav = getFav();
    favList.innerHTML = '';
    const partnerName = store.get('lbl-partner') || 'TA';
    const myName = store.get('lbl-user') || '我';
    // 按"谁收藏"分组：TA 收藏夹自动收藏（by==='ta'）归 TA；手动收藏（含旧数据）归我
    const myFav = fav.filter(f => f.by !== 'ta');
    const taFav = fav.filter(f => f.by === 'ta');
    // tab 高亮
    const tabsEl = document.getElementById('fav-tabs');
    if (tabsEl) {
      tabsEl.querySelectorAll('.fav-tab').forEach(t => t.classList.toggle('sel', t.dataset.tab === favTab));
    }
    const list = favTab === 'ta' ? taFav : myFav;
    // 最新收藏在上
    list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const title = favTab === 'ta' ? partnerName + ' 的收藏' : myName + ' 的收藏';
    const empty = favTab === 'ta' ? 'TA 还没有收藏' : '暂无收藏';
    // 组标题
    const h = document.createElement('div');
    h.className = 'cc-group-header';
    h.innerHTML = '<span class="ccg-name">' + title + '</span><span class="ccg-count">' + list.length + '</span>';
    favList.appendChild(h);
    if (!list.length) {
      favList.innerHTML += '<div class="fav-empty">' + empty + '</div>';
      return;
    }
    list.forEach(f => renderFavItem(f));
    function renderFavItem(f) {
      const m = document.createElement('div');
      m.className = 'msg ' + (f.side === 'out' ? 'msg-out' : 'msg-in');
      const timeHtml = f.ts ? '<span class="msg-time">' + fmtTime(f.ts) + '</span>' : '';
      const side = '<div class="msg-side"><div class="msg-av"></div>' + timeHtml + '</div>';
      m.innerHTML = f.side === 'out'
        ? '<div class="msg-bubble"></div>' + side
        : side + '<div class="msg-bubble"></div>';
      const b = m.querySelector('.msg-bubble');
      // 图片/表情：按类型或按 dataURL 内容识别（兼容旧数据收藏时 type 误存为 text 的乱码）
      const isImg = f.type === 'sticker' || f.type === 'image' || (typeof f.text === 'string' && f.text.indexOf('data:') === 0);
      if (isImg) {
        b.style.padding = '6px';
        b.innerHTML = '<img class="msg-img" src="' + f.text + '" alt="表情">';
      } else {
        b.innerHTML = '<span style="opacity:.85">' + f.text + '</span>';
      }
      // 收藏消息的情绪字卡
      if (f.mood && f.mood.length) {
        f.mood.forEach(md => {
          if (md.tag === '交流意图') {
            b.innerHTML += '<div class="msg-mood msg-intent"><span class="msg-mood-tag">' + md.tag + '</span><span>' + md.label + '</span></div>';
          } else {
            b.innerHTML += '<div class="msg-mood"><span class="msg-mood-tag">' + md.tag + '</span><span>' + md.label + '</span></div>';
          }
        });
      }
      fillAvatar(m.querySelector('.msg-av'), f.side === 'out' ? 'avatar-user' : 'avatar-partner');
      // 长按删除收藏（600ms）
      let pressTimer = null;
      m.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
          const fav2 = getFav();
          // v3.5.131：按内容匹配——getFav() 每次 JSON.parse 新对象，indexOf 恒 -1（删除失效）
          const idx2 = fav2.findIndex(x => x.side === f.side && x.text === f.text && x.ts === f.ts);
          if (idx2 >= 0) {
            if (window.openModal) {
              window.openModal('删除这条收藏？', '', () => {
                fav2.splice(idx2, 1);
                saveFav(fav2);
                renderFav();
              }, { noInput: true });
            }
          }
        }, 600);
      }, { passive: true });
      m.addEventListener('touchend', () => clearTimeout(pressTimer));
      m.addEventListener('touchmove', () => clearTimeout(pressTimer));
      m.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const fav2 = getFav();
        // v3.5.131：按内容匹配（indexOf 恒 -1）
        const idx2 = fav2.findIndex(x => x.side === f.side && x.text === f.text && x.ts === f.ts);
        if (idx2 >= 0 && window.openModal) {
          window.openModal('删除这条收藏？', '', () => {
            fav2.splice(idx2, 1);
            saveFav(fav2);
            renderFav();
          }, { noInput: true });
        }
      });
      favList.appendChild(m);
    }
  }
  // 收藏 tab 切换
  const favTabs = document.getElementById('fav-tabs');
  if (favTabs) {
    favTabs.addEventListener('click', (e) => {
      const tb = e.target.closest('.fav-tab');
      if (!tb) return;
      favTab = tb.dataset.tab;
      renderFav();
    });
  }

  // 桌面收藏图标进入
  const favApp = document.querySelector('.app[data-app="note"]');
  if (favApp && favPage) {
    favApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      favPage.hidden = false;
      renderFav();
    });
  }
  const favBack = document.getElementById('fav-back');
  if (favBack) {
    favBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const phonePage = document.getElementById('page-phone');
      if (phonePage) phonePage.hidden = false;
    });
  }

  // ---- 表情包面板：TA 的表情包 + 我的表情包（v3.5.31）----
  // 我的表情包独立存储（my-emoji-groups）：可新建/管理分组、批量管理、添加表情
  const emojiPanel = document.getElementById('emoji-panel');
  const emojiList = document.getElementById('emoji-list');
  const emojiClose = document.getElementById('emoji-close');
  const emojiBtn = document.getElementById('chat-emoji-btn');
  const emojiGroupsBar = document.getElementById('emoji-groups');
  const emojiTools = document.getElementById('emoji-tools');
  const emojiBatch = document.getElementById('emoji-batch');
  const emojiBatchCount = document.getElementById('emoji-batch-count');
  let emojiMode = 'ta';        // ta / mine
  let emojiCurGroup = '';      // TA 表情包分组筛选（记住上次打开的分类）
  let myCurGroup = '';         // 我的表情包分组筛选（记住上次打开的分类）
  let myBatchMode = false;     // 批量管理模式
  let myGroups = [];           // 我的表情包 [[分组名, [dataURL...]], ...]
  let mySel = new Set();       // 批量勾选：分组名\u0001索引
  let emojiInsertCb = null;    // v3.6.x：写信/回信「插入模式」回调（点击表情插入信纸）
  const MYE_KEY = uid + ':my-emoji-groups';

  // 记住最后打开的表情包分类（localStorage 持久化，刷新后仍在）
  function saveEmojiGroupPref() {
    store.set('emoji-last', JSON.stringify({ ta: emojiCurGroup, mine: myCurGroup }));
  }
  (function () {
    try {
      const pref = JSON.parse(store.get('emoji-last') || 'null');
      if (pref && typeof pref === 'object') {
        if (typeof pref.ta === 'string') emojiCurGroup = pref.ta;
        if (typeof pref.mine === 'string') myCurGroup = pref.mine;
      }
    } catch (e) {}
  })();

  // ---- 我的表情包数据：localStorage + IndexedDB 双写（失败检测 + 兜底恢复）----
  function myEmojiLoad() {
    try { const v = JSON.parse(store.get('my-emoji-groups') || 'null'); if (Array.isArray(v)) return v; } catch (e) {}
    return [];
  }
  function myEmojiSave() {
    const data = JSON.stringify(myGroups);
    // 统一走适配层：localStorage 快照 + IndexedDB 权威（配额满也不丢，启动自动恢复）
    store.set('my-emoji-groups', data);
    return true;
  }
  // 启动恢复：IDB 内容更多优先（与字卡库一致，防配额丢数据）
  (function () {
    if (!window.idbGet) return;
    window.idbGet(MYE_KEY).then(v => {
      if (!v) return;
      try {
        const data = typeof v === 'string' ? JSON.parse(v) : v;
        if (!Array.isArray(data)) return;
        const cnt = (g) => { let n = 0; g.forEach(x => n += (Array.isArray(x[1]) ? x[1].length : 0)); return n; };
        let local = null;
        try { local = JSON.parse(store.get('my-emoji-groups') || 'null'); } catch (e) {}
        const lc = Array.isArray(local) ? cnt(local) : -1;
        if (lc < 0 || cnt(data) > lc) {
          myGroups = data;
          if (!emojiPanel.hidden) renderEmojiPanel();
        }
      } catch (e) {}
    });
  })();

    // 待引用 → 引用块数据：有图片则对象 {t, imgs}（组合消息），否则字符串
  function quoteValue(q) {
    if (!q) return null;
    if (q.imgs && q.imgs.length) return { t: q.text, imgs: q.imgs };
    return q.text;
  }
  // 发送一个表情包（我的/TA 共用；有文字合并气泡，无文字直接发送；带引用则显示引用块）
  function sendSticker(src) {
    // v3.5.127：聊天输入框已改为 contenteditable div（防 Chrome 自动填充条），
    // 读取文本用 textContent 代替 input.value
    const inputEl = document.getElementById('chat-input');
    const text = (inputEl ? (inputEl.textContent || '') : '').trim();
    const quote = lastQuote ? { q: quoteValue(lastQuote), s: lastQuote.side } : null;
    if (quote) lastQuote = null;
    if (text) {
      lastMineText = text;
      const rec = { side: 'out', text: text, parts: [{ k: 'text', v: text }, { k: 'img', v: src, sub: 'sticker' }] };
      if (quote) { rec.quote = quote.q; rec.qside = quote.s; }
      addRec(rec);
      if (inputEl) inputEl.textContent = '';
      renderDraft();
      if (window.logFish) window.logFish();
      scheduleReply();
    } else {
      lastMineText = src;
      const rec = { side: 'out', text: src, type: 'sticker', parts: [{ k: 'img', v: src }] };
      if (quote) { rec.quote = quote.q; rec.qside = quote.s; }
      addRec(rec);
      if (window.logFish) window.logFish();
      scheduleReply();
    }
    closeEmojiPanel();
  }

  // 分组栏
  // 顶部分组栏：只显示有内容的分组，chip 文本 = 分组名 + 张数（如「猫206」），
  // 点击才在下方显示该分组内容；再点同一分组取消选中（回到提示态）
  function renderEmojiGroupsBar() {
    if (!emojiGroupsBar) return;
    emojiGroupsBar.innerHTML = '';
    let list = [];
    let cur = '';
    if (emojiMode === 'ta') {
      list = (window.getMediaGroups && window.getMediaGroups('sticker')) || [];
      cur = emojiCurGroup;
    } else {
      list = myGroups;
      cur = myCurGroup;
    }
    if (cur && !list.some(g => g[0] === cur)) cur = '';
    const chips = list.filter(g => g[1].length).map(g => [g[0], g[0] + g[1].length]);
    chips.forEach(([val, label]) => {
      const c = document.createElement('span');
      c.className = 'emoji-g-chip' + (cur === val ? ' sel' : '');
      c.textContent = label;
      // stopPropagation：防止重渲染后元素被移除，事件冒泡到 document 误判"面板外点击"而关闭面板
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        if (emojiMode === 'ta') emojiCurGroup = (cur === val ? '' : val);
        else myCurGroup = (cur === val ? '' : val);
        saveEmojiGroupPref();
        renderEmojiPanel();
      });
      emojiGroupsBar.appendChild(c);
    });
  }

  // 渲染一个分组的网格（分组名已在上方分组栏显示，网格内不再重复标题）
  function renderEmojiGroup(gname, arr, mode) {
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    arr.forEach((src, i) => {
      const d = document.createElement('div');
      d.className = 'emoji-item';
      if (mode === 'mine' && myBatchMode) {
        const k = gname + '\u0001' + i;
        const on = mySel.has(k);
        d.classList.toggle('sel', on);
        d.innerHTML = '<img src="' + src + '" alt="表情">' + (on ? '<span class="emoji-check">✓</span>' : '');
        d.addEventListener('click', () => {
          if (mySel.has(k)) mySel.delete(k); else mySel.add(k);
          updateBatchCount();
          // v3.5.127：局部 toggle——原先每次勾选整格全量重建（几百张表情时 O(n²)）
          d.classList.toggle('sel', mySel.has(k));
          let ck = d.querySelector('.emoji-check');
          if (mySel.has(k)) {
            if (!ck) { ck = document.createElement('span'); ck.className = 'emoji-check'; ck.textContent = '✓'; d.appendChild(ck); }
          } else if (ck) {
            ck.remove();
          }
        });
      } else {
        d.innerHTML = '<img src="' + src + '" alt="表情">';
        d.addEventListener('click', () => {
          // v3.6.x：写信/回信场景通过 openEmojiPanelForInsert 打开面板 →
          // 点击表情插入信纸而不是发消息（与聊天发消息共用同一个面板）
          if (emojiInsertCb) {
            const cb = emojiInsertCb;
            emojiInsertCb = null;
            cb(src);
            closeEmojiPanel();
          } else {
            sendSticker(src);
          }
        });
      }
      grid.appendChild(d);
    });
    emojiList.appendChild(grid);
  }

  function updateBatchCount() {
    if (emojiBatchCount) emojiBatchCount.textContent = '已选 ' + mySel.size + ' 张';
  }

  function renderEmojiPanel() {
    if (!emojiList) return;
    // 头部 tab 高亮
    document.querySelectorAll('.emoji-tab').forEach(t => t.classList.toggle('sel', t.dataset.etab === emojiMode));
    // 工具行 / 批量条：仅我的表情包模式
    if (emojiTools) emojiTools.hidden = emojiMode !== 'mine';
    if (emojiBatch) emojiBatch.hidden = !(emojiMode === 'mine' && myBatchMode);
    renderEmojiGroupsBar();
    emojiList.innerHTML = '';
    if (emojiMode === 'ta') {
      // ---- TA 的表情包（sticker 字卡池）：点分组才显示内容 ----
      const groups = (window.getMediaGroups && window.getMediaGroups('sticker')) || [];
      if (!groups.length) {
        emojiList.innerHTML = '<div class="emoji-empty">暂无表情包<br>请到 自定义聊天字卡 → 表情包 上传</div>';
        return;
      }
      if (!emojiCurGroup) {
        emojiList.innerHTML = '<div class="emoji-empty">点击上方分组查看表情包</div>';
        return;
      }
      const g = groups.find(x => x[0] === emojiCurGroup);
      if (!g || !g[1].length) {
        emojiList.innerHTML = '<div class="emoji-empty">该分组暂无表情包<br>请到 自定义聊天字卡 → 表情包 上传</div>';
        return;
      }
      renderEmojiGroup(g[0], g[1], 'ta');
    } else {
      // ---- 我的表情包：点分组才显示内容 ----
      if (!myGroups.length) {
        emojiList.innerHTML = '<div class="emoji-empty">暂无我的表情包<br>点击上方「添加」上传，或「新建分组」</div>';
        return;
      }
      if (!myCurGroup) {
        emojiList.innerHTML = '<div class="emoji-empty">点击上方分组查看表情包</div>';
        return;
      }
      const g = myGroups.find(x => x[0] === myCurGroup);
      if (!g || !g[1].length) {
        emojiList.innerHTML = '<div class="emoji-empty">该分组暂无表情包<br>点击「添加」上传到该分组</div>';
        return;
      }
      renderEmojiGroup(g[0], g[1], 'mine');
      updateBatchCount();
    }
  }

  function openEmojiPanel() {
    if (!emojiPanel) return;
    // 关闭其他底部半框（拍一拍/头像互动）
    const pc = document.getElementById('poke-card');
    if (pc) pc.hidden = true;
    if (window.closeAvlib) window.closeAvlib();
    // v3.6.x：聊天入口打开 → 面板底部位置恢复正常（写信/回信时用 mail-emoji-mode 贴近底部）
    document.body.classList.remove('mail-emoji-mode');
    // 分组保留上次打开的分类（不重置）；仅退出批量模式
    myBatchMode = false;
    mySel.clear();
    closeIme(); // v3.5.116：收起输入法，面板完整不被键盘遮挡
    renderEmojiPanel();
    emojiPanel.hidden = false;
    if (morePanel) morePanel.hidden = true;
  }
  function closeEmojiPanel() {
    if (emojiPanel) emojiPanel.hidden = true;
    // v3.6.x：关闭面板即放弃「插入信纸」模式，回到聊天发消息语义
    emojiInsertCb = null;
  }
  // v3.6.x：写信/回信以「插入模式」打开同一个表情包面板——点击表情回调 cb（插入信纸）
  window.openEmojiPanelForInsert = function (cb) {
    emojiInsertCb = cb || null;
    openEmojiPanel();
    document.body.classList.add('mail-emoji-mode');
  };
  if (emojiBtn) {
    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiInsertCb = null; // 聊天入口始终是发消息
      openEmojiPanel();
    });
  }
  if (emojiClose) emojiClose.addEventListener('click', (e) => { e.stopPropagation(); closeEmojiPanel(); });
  document.addEventListener('click', (e) => {
    if (emojiPanel && !emojiPanel.hidden && !emojiPanel.contains(e.target) && !emojiBtn.contains(e.target)) closeEmojiPanel();
  });

  // ---- 我的表情包：tab 切换 + 工具 ----
  document.querySelectorAll('.emoji-tab').forEach(t => t.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiMode = t.dataset.etab;
    myBatchMode = false;
    mySel.clear();
    // 分组各自保留（TA/我的 分开记忆），切换不重置
    saveEmojiGroupPref();
    renderEmojiPanel();
  }));

  // 压缩图片（我的表情包添加用，260px 与字卡库一致）
  function compressMyEmoji(dataUrl, maxSide) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/png'));
        } catch (e) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // 新建分组（已并入「管理分组」弹层，不再单独展示按钮）
  const myeNew = document.getElementById('mye-new');
  if (myeNew) {
    myeNew.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.openModal) {
        window.openModal('新建表情包分组', '', (v) => {
          const name = (v || '').trim();
          if (!name) return;
          if (myGroups.some(g => g[0] === name)) { toast('分组「' + name + '」已存在'); return; }
          myGroups.push([name, []]);
          myEmojiSave();
          myCurGroup = name;
          saveEmojiGroupPref();
          renderEmojiPanel();
        });
      }
    });
  }

  // 添加表情（上传图片到当前分组；无分组自动建「默认」）
  const myeAdd = document.getElementById('mye-add');
  if (myeAdd) {
    myeAdd.addEventListener('click', (e) => {
      e.stopPropagation();
      const fi = document.createElement('input');
      fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true;
      fi.onchange = () => {
        const files = Array.prototype.slice.call(fi.files || []);
        if (!files.length) return;
        // 目标分组：当前选中分组 → 第一个分组 → 新建「默认」
        let g = null;
        if (myCurGroup) g = myGroups.find(x => x[0] === myCurGroup) || null;
        if (!g && myGroups.length) g = myGroups[0];
        if (!g) { g = ['默认', []]; myGroups.push(g); }
        let done = 0, okCount = 0;
        files.forEach(f => {
          const reader = new FileReader();
          reader.onload = () => {
            compressMyEmoji(reader.result, 260).then(data => {
              g[1].push(data);
              okCount++;
              done++;
              if (done === files.length) {
                const ok = myEmojiSave();
                myCurGroup = g[0];
                renderEmojiPanel();
                if (!ok) toast('存储空间不足：表情已用备用存储，刷新后恢复。请清理不用的表情');
                else toast('已添加 ' + okCount + ' 个表情');
              }
            });
          };
          reader.onerror = () => { done++; if (done === files.length) { myEmojiSave(); renderEmojiPanel(); toast('部分图片读取失败'); } };
          reader.readAsDataURL(f);
        });
      };
      fi.click();
    });
  }

  // 批量管理：进入 / 全选 / 删除 / 退出
  const myeBatch = document.getElementById('mye-batch');
  if (myeBatch) {
    myeBatch.addEventListener('click', (e) => {
      e.stopPropagation();
      myBatchMode = true;
      mySel.clear();
      renderEmojiPanel();
    });
  }
  const emojiBatchAll = document.getElementById('emoji-batch-all');
  if (emojiBatchAll) {
    emojiBatchAll.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!myCurGroup) { toast('请先点击上方分组'); return; }
      const keys = [];
      const list = myGroups.filter(g => g[0] === myCurGroup);
      list.forEach(([gname, arr]) => arr.forEach((c, i) => keys.push(gname + '\u0001' + i)));
      if (mySel.size === keys.length && keys.length) mySel.clear();
      else keys.forEach(k => mySel.add(k));
      renderEmojiPanel();
    });
  }
  const emojiBatchDel = document.getElementById('emoji-batch-del');
  if (emojiBatchDel) {
    emojiBatchDel.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!mySel.size) { toast('请先选择要删除的表情'); return; }
      if (window.openModal) {
        window.openModal('删除选中的 ' + mySel.size + ' 个表情？', '', () => {
          myGroups.forEach(([gname, arr]) => {
            for (let i = arr.length - 1; i >= 0; i--) {
              if (mySel.has(gname + '\u0001' + i)) arr.splice(i, 1);
            }
          });
          mySel.clear();
          myEmojiSave();
          renderEmojiPanel();
        }, { noInput: true });
      }
    });
  }
  const emojiBatchExit = document.getElementById('emoji-batch-exit');
  if (emojiBatchExit) {
    emojiBatchExit.addEventListener('click', (e) => {
      e.stopPropagation();
      myBatchMode = false;
      mySel.clear();
      renderEmojiPanel();
    });
  }

  // 管理分组：弹层（新建 / 重命名 / 删除）
  let myMgMask = null;
  function openMyEmojiManage() {
    if (!myMgMask) {
      myMgMask = document.createElement('div');
      myMgMask.className = 'mg-mask';
      myMgMask.innerHTML =
        '<div class="mg-panel my-mg-panel">' +
          '<div class="mg-head"><span>管理表情包分组</span><button class="mg-close">✕</button></div>' +
          '<div class="mg-list"></div>' +
          '<button class="mg-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><path d="M12 5v14M5 12h14"/></svg>新建分组</button>' +
        '</div>';
      document.body.appendChild(myMgMask);
      myMgMask.querySelector('.mg-close').addEventListener('click', () => { myMgMask.hidden = true; });
      myMgMask.addEventListener('click', (e) => { if (e.target === myMgMask) myMgMask.hidden = true; });
      myMgMask.querySelector('.mg-add').addEventListener('click', () => {
        if (window.openModal) {
          window.openModal('新建表情包分组', '', (v) => {
            const name = (v || '').trim();
            if (!name) return;
            if (myGroups.some(g => g[0] === name)) { toast('分组「' + name + '」已存在'); return; }
            myGroups.push([name, []]);
            myEmojiSave();
            renderMyMgList();
            renderEmojiPanel();
          });
        }
      });
    }
    function renderMyMgList() {
      const listEl = myMgMask.querySelector('.mg-list');
      if (!myGroups.length) { listEl.innerHTML = '<div class="mg-empty">暂无分组，点击下方新建</div>'; return; }
      listEl.innerHTML = '';
      myGroups.forEach((g, gi) => {
        const row = document.createElement('div');
        row.className = 'mg-row';
        row.innerHTML = '<span class="mg-name">' + g[0] + '</span><span class="mg-count">' + (g[1] || []).length + ' 张</span>' +
          '<button class="mg-rn">改名</button><button class="mg-del">✕</button>';
        row.querySelector('.mg-rn').addEventListener('click', () => {
          if (window.openModal) {
            window.openModal('重命名分组', g[0], (v) => {
              const name = (v || '').trim();
              if (!name || name === g[0]) return;
              if (myGroups.some(x => x[0] === name)) { toast('分组「' + name + '」已存在'); return; }
              g[0] = name;
              // v3.5.128：重命名后旧分组名的勾选键失效——清空选择，避免计数残留/删错
              mySel.clear();
              updateBatchCount();
              myEmojiSave();
              renderMyMgList();
              renderEmojiPanel();
            });
          }
        });
        row.querySelector('.mg-del').addEventListener('click', () => {
          if (window.openModal) {
            window.openModal('删除分组「' + g[0] + '」及其全部表情？', '', () => {
              myGroups.splice(gi, 1);
              if (myCurGroup === g[0]) myCurGroup = '';
              mySel.clear();
              myEmojiSave();
              renderMyMgList();
              renderEmojiPanel();
            }, { noInput: true });
          }
        });
        listEl.appendChild(row);
      });
    }
    myMgMask.hidden = false;
    renderMyMgList();
  }
  const myeManage = document.getElementById('mye-manage');
  if (myeManage) {
    myeManage.addEventListener('click', (e) => {
      e.stopPropagation();
      openMyEmojiManage();
    });
  }


  // 发送消息（支持 文字 + 图片/表情 组合成一条消息）
  const input = document.getElementById('chat-input');
  const send = document.getElementById('chat-send');
  const draftEl = document.getElementById('chat-draft');
  const draftItems = document.getElementById('chat-draft-items');
  let draftImgs = []; // 待发送图片（表情包/图片 dataURL）
  function renderDraft() {
    if (!draftEl || !draftItems) return;
    draftEl.hidden = !draftImgs.length;
    draftItems.innerHTML = '';
    draftImgs.forEach((src, i) => {
      const it = document.createElement('div');
      it.className = 'chat-draft-item';
      it.innerHTML = '<img src="' + src + '" alt=""><button class="chat-draft-x" data-i="' + i + '">✕</button>';
      it.querySelector('.chat-draft-x').addEventListener('click', () => {
        draftImgs.splice(i, 1);
        renderDraft();
      });
      draftItems.appendChild(it);
    });
  }
  // 图片按钮：多选图片 → 压缩 → 加入待发送
  const imgBtn = document.getElementById('chat-img-btn');
  if (imgBtn) {
    imgBtn.addEventListener('click', (e) => {
      e.stopPropagation();
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
                draftImgs.push(c.toDataURL('image/jpeg', 0.85));
              } catch (err) {
                draftImgs.push(reader.result);
              }
              renderDraft();
            };
            // v3.5.131：解码失败（HEIC/损坏图）不再静默丢失——原图兜底 + 提示
            img.onerror = () => {
              draftImgs.push(reader.result);
              renderDraft();
              toast('部分图片无法压缩，已按原图添加');
            };
            img.src = reader.result;
          };
          reader.readAsDataURL(f);
        });
      };
      fi.click();
    });
  }
  function buildParts(text) {
    const parts = [];
    const t = (text || '').trim();
    if (t) parts.push({ k: 'text', v: t });
    // 插入的图片：大图（可点击查看）
    draftImgs.forEach(src => parts.push({ k: 'img', v: src, sub: 'image' }));
    return parts;
  }
  const addMsg = (text) => {
    const parts = buildParts(text);
    if (!parts.length) return;
    const t = (text || '').trim();
    lastMineText = t || (draftImgs.length ? draftImgs[0] : '');
    const rec = { side: 'out', text: lastMineText, parts: parts };
    if (lastQuote) {
      rec.quote = quoteValue(lastQuote);
      rec.qside = lastQuote.side;
      lastQuote = null;
    }
    addRec(rec);
    // v3.5.60：我发送消息播放设置的音效
    if (window.playSfx) window.playSfx('out');
    // v3.5.127：contenteditable 版输入框清空用 textContent
    input.textContent = '';
    draftImgs = [];
    renderDraft();
    if (window.logFish) window.logFish();
    scheduleReply();
  };
  if (send) send.addEventListener('click', () => addMsg(input.innerText));
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        // v3.5.127：contenteditable 里 Enter 默认插入换行——阻止后由发送逻辑接管
        e.preventDefault();
        // v3.5.134：innerText 读值——粘贴多行文本时 textContent 会把换行拼成一行
        addMsg(input.innerText);
      }
    });
  }
  // 主动发送：应用加载即启动（不依赖进入聊天页，进聊天页也不重置计时器）
  // v3.6.x：延迟到 replyCfg 就绪后再启动——chat.js 先于 reply-settings.js 加载，
  // 同步启动会在 replyCfg 未定义时用代码内默认值（5~10 分钟）计算首次延迟，
  // 导致即使把发送间隔调到 1 分钟，第一条主动消息也要等 5~10 分钟
  function bootAutoSend() {
    if (window.replyCfg) scheduleAutoSend();
    else setTimeout(bootAutoSend, 500);
  }
  bootAutoSend();
  // v3.5.128：启动即加载聊天记录到内存——统计页/TA问答等模块通过 getChatMsgs
  // 读取时不再拿到空数组（原先只有进聊天页才 loadMsgs）
  loadMsgs();
  // 对外发送消息接口（占卜结果发送给 TA 等复用）
  window.chatSendMsg = (text) => { if (typeof text === 'string' && text.trim()) addMsg(text.trim()); };
  // v3.5.94：收藏消息含图片，可能只存在 IndexedDB → 启动补读（收藏页打开时才渲染，届时读到）
  try {
    if (window.idbGet) {
      window.idbGet(uid + ':fav-msgs').then(v => {
        if (v && typeof v === 'string' && v.length > 2) store.set('fav-msgs', v);
      });
    }
  } catch (e) {}
  // v3.5.100：页面加载时恢复桌面「聊天」未读提醒
  updateChatBadge();
})();
