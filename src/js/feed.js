// ===== 功能：朋友圈（仿星言简约版【星言朋友圈】，矢量图简约风格） =====
// 朋友圈形态：封面 + 我的头像；TA 自动发动态；我可发布；
// 每条动态：发布者头像/昵称/时间/内容 + 点赞列表 + 评论区（可回复）
// TA 会点赞/评论我的动态；我点赞/评论后 TA 有概率回应
(function () {
  const uid = 'xy-home-v2';
  const store = window.xyStore(uid);
  const KEY = 'feed-posts';
  function partnerName() { return store.get('lbl-partner') || 'TA'; }
  function partnerAv() { return store.get('avatar-partner') || ''; }
  function myName() { return store.get('lbl-user') || '我'; }
  function myAv() { return store.get('avatar-user') || ''; }
  // ===== 多联系人：发布者身份快照（owner=联系人cid，role=me/ta） =====
  function activeMe() {
    const s = window.activeStore();
    return { role: 'me', owner: window.__activeCid || 'default', authorName: s.get('lbl-user') || '我', authorAv: s.get('avatar-user') || '' };
  }
  function taAuthorOf(p) {
    return { role: 'ta', owner: p.owner || 'default', authorName: p.taName || partnerName(), authorAv: p.taAv || partnerAv() };
  }
  function stampAuthor(obj, a) { obj.role = a.role; obj.owner = a.owner; obj.authorName = a.authorName; obj.authorAv = a.authorAv; return obj; }
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }
  function fmtDT(ts) {
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function normPost(p) { if (p.by && !p.role) { p.role = p.by; if (!p.owner) p.owner = 'default'; } return p; }
  function load() { try { const a = JSON.parse(store.get(KEY) || '[]'); return (Array.isArray(a) ? a : []).map(normPost); } catch (e) { return []; } }
  function save(list) { store.set(KEY, JSON.stringify(list)); }
  function avHtml(data, cls) {
    const c = cls || 'feed-av';
    return data
      ? '<div class="' + c + '"><img src="' + attrEsc(data) + '" alt=""></div>'
      : '<div class="' + c + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg></div>';
  }
  const TA_COMMENT_POOL = ['收到啦~', '我看到了！', '这条动态好可爱', '记住啦', '我也是这么想的', '嗯嗯，说得对'];

  // ---- TA 内容素材池：调用聊天字卡库（主字卡/颜文字/emoji/表情包/图片），缺省用内置池 ----
  function cardPool(cid) {
    const cards = cid ? (window.getCustomCardsFor ? window.getCustomCardsFor(cid) : []) : ((window.getCustomCards && window.getCustomCards()) || []);
    const text = [], kaomoji = [], emoji = [];
    const mediaSticker = cid ? (window.getMediaCardsFor ? window.getMediaCardsFor(cid, 'sticker') : []) : ((window.getMediaCards && window.getMediaCards('sticker')) || []);
    const mediaImage = cid ? (window.getMediaCardsFor ? window.getMediaCardsFor(cid, 'image') : []) : ((window.getMediaCards && window.getMediaCards('image')) || []);
    cards.forEach(c => {
      if (typeof c === 'string' && c.indexOf('data:') === 0) return; // dataURL 已按媒体分类
      // v3.6.x：语音字卡（文件名|||audio;base64）不以 data: 开头，需单独丢弃——
      //   否则整段音频 base64 会被当文字拼进朋友圈正文/评论
      if (typeof c === 'string' && c.indexOf('|||') >= 0) return;
      if (/[\uD800-\uDBFF]/.test(c) || /^[😀-🙏🌀-🫿]/u.test(c)) emoji.push(c);
      else if (/[\(（｡◕(◕)(づ｡(¬)]/.test(c) && /[\)）】)]/.test(c)) kaomoji.push(c);
      else text.push(c);
    });
    return { text: text, kaomoji: kaomoji, emoji: emoji, sticker: mediaSticker, image: mediaImage };
  }
  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  // v3.6.x：完整 HTML 转义（昵称/评论/点赞列表/分组名是用户输入，直拼 innerHTML 可注入）
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function attrEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  // 图文混排正文渲染（与聊天一致）：data:image 段 → 内联图片，其余文字保留空格
  function inlineBody(s) {
    const str = String(s || '');
    let html = '';
    const re = /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g;
    let last = 0, m;
    while ((m = re.exec(str))) {
      html += str.slice(last, m.index).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      html += '<img class="feed-inline-img" src="' + m[0] + '" alt="图片">';
      last = m.index + m[0].length;
    }
    html += str.slice(last).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    return html;
  }
  // 图文混排生成器：主字卡/颜文字/emoji/表情包/图片 全 5 类，每张卡是一块内容（图片/表情包即 1 个字卡）
  // opts: { kaoP, emoP, stP, imP, imgP } —— 各类别每卡出现概率（0~100，直接取回复设置数值）；
  //       imgP 为表情包+图片合并概率（评论/回复用「使用表情包概率」fd-image-prob）
  // v3.6.x：cid 指定用该联系人桌面的字卡（朋友圈 TA 评论/回复/动态都用所属桌面字卡）
  function genMixedCards(cfg, minN, maxN, opts, cid) {
    const o = opts || {};
    const pool = cardPool(cid);
    const fb = TA_COMMENT_POOL.concat(TA_REPLY_POOL);
    const n = minN + Math.floor(Math.random() * Math.max(1, maxN - minN + 1));
    const parts = [];
    for (let i = 0; i < n; i++) {
      const r = Math.random() * 100;
      let pushed = false;
      if (o.imP > 0 && pool.image.length && r < o.imP) { parts.push(rand(pool.image)); pushed = true; }
      if (!pushed && o.stP > 0 && pool.sticker.length && r < o.stP) { parts.push(rand(pool.sticker)); pushed = true; }
      if (!pushed && o.imgP > 0 && (pool.sticker.length || pool.image.length) && r < o.imgP) { parts.push(rand(pool.sticker.concat(pool.image))); pushed = true; }
      if (!pushed && o.emoP > 0 && pool.emoji.length && r < o.emoP) { parts.push(rand(pool.emoji)); pushed = true; }
      if (!pushed && o.kaoP > 0 && pool.kaomoji.length && r < o.kaoP) { parts.push(rand(pool.kaomoji)); pushed = true; }
      if (!pushed) parts.push(pool.text.length ? rand(pool.text) : rand(fb));
    }
    return parts.join(' ');
  }
  // v3.5.94：TA 发布动态专用生成器——文字（主字卡/颜文字/emoji）与图片（表情包/图片）
  // 分离：图片进 imgs 数组独立展示（与我的发布一致），不再混插在文字中间
  // v3.5.95：每类独立抽随机数——各概率设置（fd-post-kaomoji/emoji/sticker/image）独立生效
  function genPostContent(cfg, cid) {
    const pool = cardPool(cid);
    const fb = TA_COMMENT_POOL.concat(TA_REPLY_POOL);
    const n = cfg.minCardsPost + Math.floor(Math.random() * Math.max(1, cfg.maxCardsPost - cfg.minCardsPost + 1));
    const textParts = [];
    const imgs = [];
    for (let i = 0; i < n; i++) {
      let pushed = false;
      if (cfg.postImage > 0 && pool.image.length && Math.random() * 100 < cfg.postImage) { imgs.push(rand(pool.image)); pushed = true; }
      if (!pushed && cfg.postSticker > 0 && pool.sticker.length && Math.random() * 100 < cfg.postSticker) { imgs.push(rand(pool.sticker)); pushed = true; }
      if (!pushed && cfg.postEmoji > 0 && pool.emoji.length && Math.random() * 100 < cfg.postEmoji) { textParts.push(rand(pool.emoji)); pushed = true; }
      if (!pushed && cfg.postKaomoji > 0 && pool.kaomoji.length && Math.random() * 100 < cfg.postKaomoji) { textParts.push(rand(pool.kaomoji)); pushed = true; }
      if (!pushed) textParts.push(pool.text.length ? rand(pool.text) : rand(fb));
    }
    return { content: textParts.join(' '), imgs: imgs };
  }
  // 动态正文 HTML：文字混排 + 独立图片区（九宫格）
  // v3.5.95：兼容旧数据 p.img 字段
  // v3.6.x：老数据兼容——旧版动态把图片/表情包 dataURL 直接拼进正文（含 sticker:/image:
  // 前缀与无前缀两种），与我的发布/新 TA 动态的 imgs 网格显示不一致；这里渲染时把它们
  // 抽出来并入图片网格，保证「联系人发布的图片/表情包 与 我发布的 大小一致」。
  function contentHtmlFor(p) {
    let content = String(p.content || '');
    const imgs = (p.imgs && p.imgs.length) ? p.imgs.slice() : (p.img ? [p.img] : []);
    // 前缀与 dataURL 必须整体作为一个可选分组（冒号在分组内）——若写成 (?:sticker|image):?
    // 引擎会在 'data:image' 中间误匹配 'image'，导致后面 (data:image…) 整体匹配失败
    // （mail.js renderBody 同款已生效模式）
    content = content.replace(/((?:sticker|image):)?(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g, (m, pre, u) => { imgs.push(u); return ' '; });
    let html = inlineBody(content);
    if (imgs.length) {
      html += '<div class="feed-imgs">' + imgs.map(u => '<img src="' + attrEsc(u) + '" alt="图片" loading="lazy">').join('') + '</div>';
    }
    return html;
  }
  // 评论区 HTML（v3.5.95：提升到模块作用域，主列表 + 全部朋友圈共用）
  function commentsHtmlFor(p, name) {
    if (!p.comments || !p.comments.length) return '';
    return '<div class="feed-comments">' + p.comments.map((c, ci) => {
      const cName = esc(c.authorName || ((c.role || c.by) === 'me' ? myName() : (name || taFeedName())));
      const cBody = inlineBody(c.content);
      let repliesHtml = '';
      if (c.replies && c.replies.length) {
        repliesHtml = '<div class="feed-replies">' + c.replies.map(r => {
          const rName = esc(r.authorName || ((r.role || r.by) === 'me' ? myName() : (name || taFeedName())));
          const rBody = inlineBody(r.content);
          return '<div class="feed-reply"><b>' + rName + '</b> 回复 <b>' + cName + '</b>：' + rBody + '</div>';
        }).join('') + '</div>';
      }
      return '<div class="feed-comment" data-c="' + p.id + '" data-ci="' + ci + '">' +
        '<div class="feed-c-line"><b>' + cName + '</b>：' + cBody + '</div>' +
        repliesHtml + '</div>';
    }).join('') + '</div>';
  }
  // 生成一条评论/回复内容（应用回复内容设置：多字卡概率/最多字卡数/使用表情包概率；主字卡/颜文字/emoji/表情包/图片全类别混排）
  // v3.6.x：cid 指定用该联系人桌面的字卡（TA 评论/回复用动态所属桌面的字卡）
  function pickReplyContent(cfg, cid) {
    const c = cfg || feedCfg();
    const maxN = Math.random() * 100 < c.cardProb ? Math.max(1, c.maxCards) : 1;
    // 「使用表情包概率」fd-image-prob：每张卡出现表情包/图片的概率；颜文字/emoji 固定 15%
    return genMixedCards(c, 1, maxN, { imgP: c.imageProb, kaoP: 15, emoP: 15 }, cid);
  }
  // v3.5.57：TA 回应我的回复的回复池
  const TA_REPLY_POOL = ['哈哈，好呀', '那你呢？', '嗯嗯，说得对', '我记住啦', '跟你分享过的', '被你发现了', '那很好呀', '我也这么觉得'];

  // 渲染封面（含可设置的背景图）
  // v3.6.x：多桌面——封面背景/头像/昵称按当前桌面独立存储（activeStore），
  // 读取时回退全局旧键（老数据：迁移前存在 xy-home-v2:feed-cover-bg 顶层）
  // v3.6.x：存量大图渲染防护——旧版本封面压缩失败时回退存过原图（48MP 级 dataURL），
  // 渲染 backgroundImage 会让 iOS Safari 解码卡死（打开页面卡顿点不动）；封面正常
  // 压缩产物（800px JPEG）<200KB，>500KB 判定为异常存量，清除回默认（LS+IDB 双清）
  function safeBg(v, key, s) {
    if (v && typeof v === 'string' && v.length > 500 * 1024) {
      try { s.remove(key); } catch (e) {}
      return '';
    }
    return v || '';
  }
  function coverBg() {
    const s = window.activeStore();
    const v = s.get('feed-cover-bg');
    if (v) return safeBg(v, 'feed-cover-bg', s);
    return safeBg(store.get('feed-cover-bg'), 'feed-cover-bg', store);
  }
  function renderCover() {
    const as = window.activeStore();
    const myAvEl = document.getElementById('feed-my-av');
    const myNameEl = document.getElementById('feed-my-name');
    const myAvStr = as.get('avatar-user') || '';
    const myNameStr = as.get('lbl-user') || '我';
    if (myAvEl) myAvEl.innerHTML = myAvStr ? '<img src="' + attrEsc(myAvStr) + '" alt="">' : '';
    if (myNameEl) myNameEl.textContent = myNameStr;
    const cover = document.getElementById('feed-cover');
    if (cover) {
      const bg = coverBg();
      if (bg) {
        cover.style.backgroundImage = 'url("' + bg + '")';
        cover.classList.add('has-bg');
      } else {
        cover.style.backgroundImage = '';
        cover.classList.remove('has-bg');
      }
    }
  }
  // 压缩图片（最长边 800px，JPEG 0.82，避免撑爆 localStorage 配额）
  function compressImage(file, cb) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const max = 800;
        let w = img.width, h = img.height;
        if (Math.max(w, h) > max) {
          const r = max / Math.max(w, h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(cv.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { toast('图片读取失败'); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }
  // v3.5.63：联系人在朋友圈展示的昵称/头像/背景（可独立于聊天修改）
  // v3.6.x：多桌面——按当前桌面独立存储，回退全局旧键（老数据兼容）
  function taFeedName() { return window.activeStore().get('feed-ta-name') || store.get('feed-ta-name') || partnerName(); }
  function taFeedAv() { return window.activeStore().get('feed-ta-avatar') || store.get('feed-ta-avatar') || partnerAv(); }
  function taFeedCover() {
    const s = window.activeStore();
    const v = s.get('feed-ta-cover');
    if (v) return safeBg(v, 'feed-ta-cover', s);
    return safeBg(store.get('feed-ta-cover'), 'feed-ta-cover', store);
  }
  // 渲染动态列表
  function render() {
    renderCover();
    const listEl = document.getElementById('feed-list');
    if (!listEl) return;
    const posts = load().slice().sort((a, b) => b.ts - a.ts);
    const name = partnerName();
    listEl.innerHTML = posts.length
      ? posts.map(p => {
          const isMine = (p.role || p.by) === 'me';
          const author = p.authorName || (isMine ? myName() : taFeedName());
          const av = p.authorAv || (isMine ? myAv() : taFeedAv());
          // 头像可点击 → 打开该联系人的全部朋友圈
          const avWrap = '<div class="feed-head-av" data-owner="' + esc(p.owner || '') + '" title="查看' + esc(author) + '的全部朋友圈">' + avHtml(av) + '</div>';
          // 点赞列表：显示"XX、XX 觉得很赞"
          const likes = p.likes && p.likes.length
            ? '<div class="feed-likes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:-2px;margin-right:5px"><path d="M12 21s-7.5-4.7-9.3-9A5.3 5.3 0 0112 6.4a5.3 5.3 0 019.3 5.6c-1.8 4.3-9.3 9-9.3 9z"/></svg>' + esc(p.likes.join('、')) + ' 觉得很赞</div>'
            : '';
          const liked = p.likes && p.likes.some(l => l === myName());
          return '<div class="feed-post" id="feed-post-' + p.id + '"><div class="feed-head">' + avWrap +
            '<div class="feed-who"><div class="feed-name">' + esc(author) + '</div><div class="feed-time">' + fmtDT(p.ts) + '</div></div>' +
            '<button class="feed-del" data-id="' + p.id + '" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2"/><path d="M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14"/></svg></button>' + '</div>' +
            '<div class="feed-content">' + contentHtmlFor(p) + '</div>' +
            '<div class="feed-actions">' +
            '<button class="feed-act' + (liked ? ' liked' : '') + '" data-like="' + p.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-3px;margin-right:4px"><path d="M12 21s-7.5-4.7-9.3-9A5.3 5.3 0 0112 6.4a5.3 5.3 0 019.3 5.6c-1.8 4.3-9.3 9-9.3 9z"/></svg>赞</button>' +
            '<button class="feed-act" data-comment="' + p.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-3px;margin-right:4px"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>评论</button>' +
            '</div>' + likes + commentsHtmlFor(p, name) + '</div>';
        }).join('')
      : '<div class="ta-empty">还没有动态，TA 会不定期分享生活</div>';
    bindEvents(listEl);
  }
  // v3.5.95：朋友圈图片点击放大（复用聊天大图查看器）
  // v3.6.x：抽成独立函数，主列表与「全部朋友圈」共用（原先全部朋友圈页图片点不动）
  function bindFeedImageClicks(listEl) {
    listEl.querySelectorAll('.feed-imgs img, .feed-inline-img').forEach(img => img.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.viewChatImage) window.viewChatImage(img.src);
    }));
  }
  // v3.6.x：删除单条动态（主列表 + 全部朋友圈共用），删除后按当前可见页面重渲染
  function deletePostConfirm(pid) {
    if (!window.openModal) return;
    window.openModal('删除这条动态？', '', () => {
      save(load().filter(x => x.id !== pid));
      // v3.5.130：删除的是评论条正在编辑的动态 → 同步关闭评论条（防悬空状态）
      if (comPid === pid) hideCommentBar();
      const fa = document.getElementById('page-feed-all');
      if (fa && !fa.hidden) openFeedAll(feedAllCid); else render();
    }, { noInput: true });
  }
  function bindEvents(listEl) {
    // v3.5.63：动态头像点击 → 打开该人的全部朋友圈
    listEl.querySelectorAll('.feed-head-av').forEach(av => av.addEventListener('click', (e) => {
      e.stopPropagation();
      openFeedAll(av.dataset.owner);
    }));
    bindFeedImageClicks(listEl);
    listEl.querySelectorAll('.feed-del').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePostConfirm(b.dataset.id);
    }));
    // 点赞：我点赞后 TA 有概率回赞
    listEl.querySelectorAll('.feed-act[data-like]').forEach(b => b.addEventListener('click', () => {
      const list = load();
      const p = list.find(x => x.id === b.dataset.like);
      if (!p) return;
      p.likes = p.likes || [];
      // 我的点赞存我的昵称（"我的昵称 觉得很赞"），TA 的点赞存 TA 昵称
      const nm = myName();
      const i = p.likes.indexOf(nm);
      const wasMe = i >= 0;
      if (wasMe) p.likes.splice(i, 1); else p.likes.push(nm);
      save(list);
      render();
      if (!wasMe && (p.role || p.by) === 'me' && Math.random() * 100 < feedCfg().likeback) {
        const cfg = feedCfg();
        setTimeout(() => {
          const list2 = load();
          const p2 = list2.find(x => x.id === p.id);
          if (!p2) return;
          p2.likes = p2.likes || [];
          if (p2.likes.indexOf(p2.taName || partnerName()) < 0) p2.likes.push(p2.taName || partnerName());
          save(list2);
          render();
          addNotice('like', p2.id, (p2.taName || partnerName()) + ' 赞了你的动态');
        }, (cfg.likeSpeedMin + Math.random() * Math.max(1, cfg.likeSpeedMax - cfg.likeSpeedMin)) * 1000);
      }
    }));

    listEl.querySelectorAll('.feed-act[data-comment]').forEach(b => b.addEventListener('click', () => {
      showCommentBar(b.dataset.comment);
    }));
    // 点击评论 → 回复（TA 的评论可回复）：复用页面内评论条（v3.5.58 不再用独立弹窗）
    listEl.querySelectorAll('.feed-comment').forEach(c => c.addEventListener('click', () => {
      const pid = c.dataset.c;
      const ci = Number(c.dataset.ci);
      const list = load();
      const p = list.find(x => x.id === pid);
      if (!p || !p.comments || !p.comments[ci] || (p.comments[ci].role || p.comments[ci].by) === 'me') return;
      showCommentBar(pid, { pid: pid, ci: ci });
    }));
  }
  // ================= 评论条（固定元素只绑定一次，v3.5.64 修复重复弹窗） =================
// 评论：点【评论】→ 页面内评论条（不用独立弹窗），可发文字/表情包/图片；TA 有概率回复评论
const comBar = document.getElementById('feed-comment-bar');
const comInput = document.getElementById('feed-comment-input');
const comSend = document.getElementById('feed-comment-send');
const comSticker = document.getElementById('feed-comment-sticker');
const comImg = document.getElementById('feed-comment-img');
let comPid = null;
let comReplyTarget = null; // v3.5.58：回复模式 { pid, ci }
let comImgData = []; // 评论携带的图片（dataURL），不塞进输入框文本（避免乱码）
function renderComPv() {
  const pv = document.getElementById('feed-comment-pv');
  if (!pv) return;
  pv.innerHTML = '';
  comImgData.forEach((d, i) => {
    // v3.6.x：img 用属性赋值（dataURL 含引号时拼 innerHTML 会逃逸注入 HTML）
    const span = document.createElement('span');
    span.className = 'feed-pv feed-pv-sm';
    const img = document.createElement('img');
    img.src = d;
    img.alt = '';
    const delBtn = document.createElement('button');
    delBtn.className = 'feed-preview-del';
    delBtn.dataset.i = i;
    delBtn.textContent = '✕';
    span.appendChild(img);
    span.appendChild(delBtn);
    pv.appendChild(span);
  });
  pv.hidden = comImgData.length === 0;
  pv.querySelectorAll('.feed-preview-del').forEach(b => b.addEventListener('click', () => {
    comImgData.splice(parseInt(b.dataset.i, 10), 1);
    renderComPv();
  }));
}
function showCommentBar(pid, replyTarget) {
  comPid = pid;
  comReplyTarget = replyTarget || null;
  comImgData = [];
  if (comBar) comBar.hidden = false;
  if (comInput) {
    comInput.value = '';
    comInput.placeholder = comReplyTarget ? '回复 ' + partnerName() + '…' : '评论…';
    setTimeout(() => comInput.focus(), 60);
  }
  renderComPv();
  const panel = document.getElementById('feed-comment-panel');
  if (panel && !panel.hidden) panel.hidden = true;
}
function hideCommentBar() {
  if (comBar) comBar.hidden = true;
  if (comInput) { comInput.value = ''; comInput.placeholder = '评论…'; }
  comPid = null;
  comReplyTarget = null;
  comImgData = [];
  renderComPv();
  const panel = document.getElementById('feed-comment-panel');
  if (panel) panel.hidden = true;
}
// v3.5.56：评论内容支持 dataURL 图片（压缩 240px，同字卡库表情包规格）
function compressCommentImg(dataUrl, maxSide) {
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
// 表情包选择半框（v3.5.70 完全复刻聊天表情面板：双 tab「TA 的表情包/我的表情包」+ 顶部分组栏 + 4 列网格）
let comStickerPanel = null;
let comStickerTab = 'ta';   // 'ta' | 'mine'
let comStickerCur = '';     // 当前分组
function comStickerGroups() {
  // TA 的表情包：聊天字卡库 sticker 分类；我的表情包：my-emoji-groups
  if (comStickerTab === 'ta') return (window.getMediaGroups && window.getMediaGroups('sticker')) || [];
  try { const v = JSON.parse(store.get('my-emoji-groups') || 'null'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
function openComStickerPanel() {
  const host = document.getElementById('feed-comment-panel');
  if (!host) return;
  // v3.5.79：父容器 #feed-comment-panel 模板默认 hidden——必须先显示，否则子面板永远看不到（点击无反应）
  host.hidden = false;
  if (!comStickerPanel) {
    comStickerPanel = document.createElement('div');
    // 内容样式复用聊天表情面板，定位改为相对 #feed-comment-panel（紧贴评论条上方）
    comStickerPanel.className = 'poke-card emoji-card';
    comStickerPanel.style.position = 'absolute';
    comStickerPanel.style.top = 'auto';
    comStickerPanel.style.bottom = '0';
    comStickerPanel.style.left = '0';
    comStickerPanel.style.right = '0';
    comStickerPanel.style.maxHeight = '46vh';
    comStickerPanel.style.padding = '12px 14px';
    comStickerPanel.innerHTML =
      '<div class="emoji-head">' +
        '<div class="emoji-tabs">' +
          '<button class="emoji-tab sel" data-cs-tab="ta">TA \u7684\u8868\u60c5\u5305</button>' +
          '<button class="emoji-tab" data-cs-tab="mine">\u6211\u7684\u8868\u60c5\u5305</button>' +
        '</div>' +
        '<button class="poke-card-close" data-cs="1">\u2715</button>' +
      '</div>' +
      '<div class="emoji-groups" id="com-sticker-groups"></div>' +
      '<div class="poke-card-scroll" style="min-height:100px;max-height:34vh" id="com-sticker-list"></div>';
    host.appendChild(comStickerPanel);
    // v3.5.79：关闭时同时隐藏父容器（避免空面板挡住下方评论条）
    function closeComSticker() {
      comStickerPanel.hidden = true;
      host.hidden = true;
    }
    comStickerPanel.querySelector('[data-cs]').addEventListener('click', (e) => { e.stopPropagation(); closeComSticker(); });
    comStickerPanel.addEventListener('click', (e) => { if (e.target === comStickerPanel) closeComSticker(); });
    comStickerPanel.querySelectorAll('[data-cs-tab]').forEach(tb => tb.addEventListener('click', (e) => {
      e.stopPropagation();
      comStickerTab = tb.getAttribute('data-cs-tab');
      comStickerCur = '';
      comStickerPanel.querySelectorAll('[data-cs-tab]').forEach(x => x.classList.toggle('sel', x === tb));
      renderComStickerBar();
      renderComStickerList();
    }));
  }
  function renderComStickerBar() {
    const groupsBar = document.getElementById('com-sticker-groups');
    if (!groupsBar) return;
    groupsBar.innerHTML = '';
    const groups = comStickerGroups();
    if (comStickerCur && !groups.some(g => g[0] === comStickerCur)) comStickerCur = '';
    const chips = groups.filter(g => g[1].length).map(g => [g[0], g[0] + g[1].length]);
    chips.forEach(([val, label]) => {
      const c = document.createElement('span');
      c.className = 'emoji-g-chip' + (comStickerCur === val ? ' sel' : '');
      c.textContent = label;
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        comStickerCur = (comStickerCur === val ? '' : val);
        renderComStickerList();
      });
      groupsBar.appendChild(c);
    });
  }
  function renderComStickerList() {
    const list = document.getElementById('com-sticker-list');
    if (!list) return;
    list.innerHTML = '';
    const groups = comStickerGroups();
    if (!groups.length) {
      list.innerHTML = '<div class="ta-empty">\u6682\u65e0\u8868\u60c5\u5305\uff0c\u8bf7\u5230\u81ea\u5b9a\u4e49\u5b57\u5361 \u2192 \u8868\u60c5\u5305 \u4e0a\u4f20</div>';
      return;
    }
    if (!comStickerCur) {
      list.innerHTML = '<div class="emoji-empty">\u70b9\u51fb\u4e0a\u65b9\u5206\u7ec4\u67e5\u770b\u8868\u60c5\u5305</div>';
      return;
    }
    const g = groups.find(x => x[0] === comStickerCur);
    if (!g || !g[1].length) { list.innerHTML = '<div class="ta-empty">\u8be5\u5206\u7ec4\u6682\u65e0\u8868\u60c5\u5305</div>'; return; }
    const h = document.createElement('div');
    h.className = 'cc-group-header';
    h.innerHTML = '<span class="ccg-name">' + esc(g[0]) + '</span><span class="ccg-count">' + g[1].length + '</span>';
    list.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'emoji-grid'; // 复用聊天 4 列网格样式
    g[1].forEach(src => {
      const d = document.createElement('div');
      d.className = 'emoji-item';
      // v3.6.x：img 用属性赋值（dataURL 含引号时拼 innerHTML 会逃逸注入 HTML）
      const img = document.createElement('img');
      img.src = src;
      img.alt = '表情';
      d.appendChild(img);
      d.addEventListener('click', (e) => {
        e.stopPropagation();
        // v3.5.130：评论图片上限 9 张（与发布一致）——无限累积会撑爆存储配额
        if (comImgData.length >= 9) { toast('最多附带 9 张图片/表情'); return; }
        comImgData.push(src); // 表情包作为图片加入评论（不塞输入框文本）
        renderComPv();
        comStickerPanel.hidden = true;
        const hostEl = document.getElementById('feed-comment-panel');
        if (hostEl) hostEl.hidden = true;
        if (comInput) comInput.focus();
      });
      grid.appendChild(d);
    });
    list.appendChild(grid);
  }
  comStickerTab = 'ta';
  comStickerCur = '';
  comStickerPanel.querySelectorAll('[data-cs-tab]').forEach(x => x.classList.toggle('sel', x.getAttribute('data-cs-tab') === 'ta'));
  renderComStickerBar();
  renderComStickerList();
  comStickerPanel.hidden = false;
}
if (comSticker) comSticker.addEventListener('click', (e) => { e.stopPropagation(); openComStickerPanel(); });
// 评论图片：压缩后加入评论图片列表（输入框上方缩略图预览）；
// busy 锁 + preventDefault 防止移动端 file 选择器关闭后 click 二次触发（重复弹窗）
let comImgBusy = false;
if (comImg) {
  comImg.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (comImgBusy) return;
    comImgBusy = true;
    const fi = document.createElement('input');
    fi.type = 'file'; fi.accept = 'image/*';
    fi.style.display = 'none';
    document.body.appendChild(fi);
    const done = () => {
      comImgBusy = false;
      try { fi.remove(); } catch (err) {}
    };
    fi.onchange = () => {
      done();
      const f = fi.files && fi.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        compressCommentImg(reader.result, 240).then(data => {
          comImgData.push(data);
          renderComPv();
          if (comInput) comInput.focus();
        });
      };
      reader.readAsDataURL(f);
    };
    fi.addEventListener('cancel', done);
    fi.click();
    setTimeout(done, 5000);
  });
}
function submitComment() {
  const val = comInput ? comInput.value.trim() : '';
  // 图文混排：文字 + 携带的图片（dataURL，空格分隔，每张图即 1 个字卡）
  const content = (val + (comImgData.length ? (val ? ' ' : '') + comImgData.join(' ') : '')).trim();
  if (!content || !comPid) return;
  const pid = comPid;
  const list = load();
  const p = list.find(x => x.id === pid);
  if (!p) return;
  // v3.5.58：回复模式——写入该评论的回复区（不是新评论）；否则新增评论
  if (comReplyTarget && p.comments && p.comments[comReplyTarget.ci]) {
    const tc = p.comments[comReplyTarget.ci];
    tc.replies = tc.replies || [];
    tc.replies.push(stampAuthor({ content: content, ts: Date.now() }, activeMe()));
    save(list);
    // v3.5.130：调度定时器前捕获回复下标——hideCommentBar 会把 comReplyTarget 置 null，
    // 回调里再读必现 TypeError（TA 回应回复 100% 失效）
    const replyCi = comReplyTarget.ci;
    hideCommentBar();
    render();
    // TA 有概率回应我的回复（写回复区 + 消息提醒）
    if (Math.random() * 100 < feedCfg().replyProb) {
      const cfg = feedCfg();
      setTimeout(() => {
        const list2 = load();
        const p2 = list2.find(x => x.id === pid);
        if (!p2 || !p2.comments || !p2.comments[replyCi]) return;
        p2.comments[replyCi].replies = p2.comments[replyCi].replies || [];
        const replyText = pickReplyContent(cfg, p2.owner || 'default');
        p2.comments[replyCi].replies.push(stampAuthor({ content: replyText, ts: Date.now() }, taAuthorOf(p2)));
        save(list2);
        render();
        addNotice('comment', p2.id, (p2.taName || partnerName()) + ' 回复了你：' + noticeTextClean(replyText));
      }, (cfg.replySpeedMin + Math.random() * Math.max(1, cfg.replySpeedMax - cfg.replySpeedMin)) * 1000);
    }
    return;
  }
  p.comments = p.comments || [];
  // v3.5.58：TA 评论回应内容按概率混入表情包（使用表情包概率）
  const commentText = pickReplyContent(feedCfg(), p.owner || 'default');
  p.comments.push(stampAuthor({ content: content, ts: Date.now(), replies: [] }, activeMe()));
  save(list);
  hideCommentBar();
  render();
  // TA 有概率评论回应
  if (Math.random() * 100 < feedCfg().commentProb) {
    const cfg = feedCfg();
    setTimeout(() => {
      const list2 = load();
      const p2 = list2.find(x => x.id === pid);
      if (!p2) return;
      p2.comments = p2.comments || [];
      p2.comments.push(stampAuthor({ content: pickReplyContent(cfg, p2.owner || 'default'), ts: Date.now(), replies: [] }, taAuthorOf(p2)));
      save(list2);
      render();
      if ((p2.role || p2.by) === 'me') addNotice('comment', p2.id, (p2.taName || partnerName()) + ' 评论了你的动态');
    }, (cfg.commentSpeedMin + Math.random() * Math.max(1, cfg.commentSpeedMax - cfg.commentSpeedMin)) * 1000);
  }
}
if (comSend) comSend.addEventListener('click', submitComment);
if (comInput) comInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submitComment(); } });
  // ================= 通知提醒（TA 点赞/评论/发布动态 → 未读角标 + 列表 + 点击跳转） =================
  // v3.5.81：通知文本里的 dataURL（表情包/图片）清洗为 [表情包]，避免乱码长串；面板显示缩略图
  function noticeTextClean(s) {
    return String(s || '').replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '[表情包]');
  }
  function notices() { try { return JSON.parse(store.get('feed-notices') || '[]'); } catch (e) { return []; } }
  function saveNotices(list) { store.set('feed-notices', JSON.stringify(list)); }
  // v3.5.107：朋友圈前台弹窗辅助——当前是否在朋友圈页（在朋友圈页内时通知不弹横幅）
  function feedPageVisible() {
    return ['page-feed', 'page-feed-all'].some(id => {
      const el = document.getElementById(id);
      return el && !el.hidden;
    });
  }
  // 打开朋友圈页（渲染 + 清桌面未读角标），供朋友圈图标点击与弹窗点击共用
  function openFeedPage() {
    clearFeedAppUnread();
    render();
    renderNoticeBadge();
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    const fp = document.getElementById('page-feed');
    if (fp) fp.hidden = false;
  }
  function addNotice(type, pid, text) {
    const list = notices();
    list.unshift({ type: type, pid: pid, text: text, ts: Date.now(), read: false });
    if (list.length > 100) list.length = 100;
    saveNotices(list);
    // v3.5.100：通知新增 → 桌面「朋友圈」图标未读数 +1
    try { store.set('feed-app-unread', String(feedAppUnread() + 1)); } catch (e) {}
    renderNoticeBadge();
    // v3.5.107：新增朋友圈通知且不在朋友圈页 → 前台桌面弹窗（点击进朋友圈）
    if (window.showDeskPopup && !feedPageVisible()) {
      window.showDeskPopup({ name: '朋友圈', text: noticeTextClean(text), onClick: openFeedPage });
    }
  }
  function unreadCount() { return notices().filter(n => !n.read).length; }
  // v3.5.100：桌面「朋友圈」图标独立未读计数（进入朋友圈清零，不依赖通知面板的已读标记）
  function feedAppUnread() { try { return parseInt(store.get('feed-app-unread'), 10) || 0; } catch (e) { return 0; } }
  function clearFeedAppUnread() {
    try { store.set('feed-app-unread', '0'); } catch (e) {}
    renderNoticeBadge();
  }
  function renderNoticeBadge() {
    const b = document.getElementById('feed-badge');
    if (b) {
      const n = unreadCount();
      b.hidden = n === 0;
      b.textContent = n > 99 ? '99+' : String(n);
    }
    // v3.5.100：桌面「朋友圈」图标同步未读提醒（进入朋友圈清零见入口）
    const ab = document.getElementById('feed-app-badge');
    if (ab) {
      const n = feedAppUnread();
      ab.hidden = n === 0;
      ab.textContent = n > 99 ? '99+' : String(n);
    }
  }
  function jumpToPost(pid) {
    const el = document.getElementById('feed-post-' + pid);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('feed-flash');
    void el.offsetWidth;
    el.classList.add('feed-flash');
  }
  function renderNotices() {
    const listEl = document.getElementById('feed-notice-list');
    if (!listEl) return;
    const list = notices();
    // v3.5.59：每条提醒显示联系人头像
    const av = partnerAv();
    const avHtml = av
      ? '<span class="fn-av"><img src="' + attrEsc(av) + '" alt=""></span>'
      : '<span class="fn-av"><svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg></span>';
    listEl.innerHTML = list.length
      ? list.map(n => {
          const ico = n.type === 'like'
            ? '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" style="width:14px;height:14px"><path d="M12 21s-7.5-4.7-9.3-9A5.3 5.3 0 0112 6.4a5.3 5.3 0 019.3 5.6c-1.8 4.3-9.3 9-9.3 9z"/></svg>'
            : n.type === 'comment'
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:14px;height:14px"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:14px;height:14px"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
          return '<div class="feed-notice-item' + (n.read ? '' : ' new') + '" data-pid="' + n.pid + '">' + avHtml + '<span class="fn-ico">' + ico + '</span><span class="fn-text">' + noticeTextClean(n.text) + '</span><span class="fn-time">' + fmtDT(n.ts) + '</span></div>';
        }).join('')
      : '<div class="ta-empty">暂时没有新的提醒</div>';
    listEl.querySelectorAll('.feed-notice-item').forEach(it => it.addEventListener('click', () => {
      document.getElementById('feed-notice-panel').hidden = true;
      jumpToPost(it.dataset.pid);
    }));
  }
  // 发布框：添加多张图片（每张压缩后存 dataURL，与文字混排进正文，同一张图片即 1 个字卡）
  const pickBtn = document.getElementById('feed-pick-img');
  const pickFile = document.getElementById('feed-pick-file');
  const preview = document.getElementById('feed-preview');
  let pickedImgs = [];
  const MAX_PICK = 9;
  function renderPreview() {
    if (!preview) return;
    preview.innerHTML = '';
    pickedImgs.forEach((d, i) => {
      // v3.6.x：img 用属性赋值（dataURL 含引号时拼 innerHTML 会逃逸注入 HTML）
      const span = document.createElement('span');
      span.className = 'feed-pv';
      const img = document.createElement('img');
      img.src = d;
      img.alt = '';
      const delBtn = document.createElement('button');
      delBtn.className = 'feed-preview-del';
      delBtn.dataset.i = i;
      delBtn.textContent = '✕';
      span.appendChild(img);
      span.appendChild(delBtn);
      preview.appendChild(span);
    });
    preview.hidden = pickedImgs.length === 0;
    preview.querySelectorAll('.feed-preview-del').forEach(b => b.addEventListener('click', () => {
      pickedImgs.splice(parseInt(b.dataset.i, 10), 1);
      renderPreview();
    }));
  }
  if (pickBtn && pickFile) {
    pickBtn.addEventListener('click', () => pickFile.click());
    pickFile.addEventListener('change', () => {
      const files = Array.from(pickFile.files || []);
      if (!files.length) return;
      if (pickedImgs.length + files.length > MAX_PICK) { toast('最多发布 ' + MAX_PICK + ' 张图片'); }
      files.slice(0, MAX_PICK - pickedImgs.length).forEach(f => {
        compressImage(f, (dataUrl) => {
          pickedImgs.push(dataUrl);
          renderPreview();
        });
      });
      pickFile.value = '';
    });
  }
  // ===== 朋友圈封面交互（v3.5.62：直接点击，不用相机按钮） =====
  //  - 点封面背景 → 更换背景（已有背景可更换/恢复默认）
  //  - 点封面我的头像 → 更换头像（与桌面「我」头像一致）
  //  - 点封面我的昵称 → 修改昵称（与桌面昵称一致）
  const coverEl = document.getElementById('feed-cover');
  const coverFile = document.getElementById('feed-cover-file');
  const coverAvEl = document.getElementById('feed-my-av');
  const coverNameEl = document.getElementById('feed-my-name');
  // 点封面背景 → 更换/恢复
  if (coverEl && coverFile) {
    coverEl.addEventListener('click', (e) => {
      // 头像/昵称点击不触发换背景（它们自己有处理）
      if (e.target === coverAvEl || coverAvEl && coverAvEl.contains(e.target)) return;
      if (e.target === coverNameEl || coverNameEl && coverNameEl.contains(e.target)) return;
      if (coverBg()) {
        if (window.openModal) {
          window.openModal('已设置朋友圈背景', '', (v) => {
            if (v === '1') coverFile.click();
            if (v === '2') { window.activeStore().set('feed-cover-bg', ''); renderCover(); toast('已恢复默认背景'); }
          }, { noInput: true, pills: [{ label: '更换背景', value: '1' }, { label: '恢复默认', value: '2' }] });
        }
      } else {
        coverFile.click();
      }
    });
    coverFile.addEventListener('change', () => {
      const f = coverFile.files && coverFile.files[0];
      if (!f) return;
      compressImage(f, (dataUrl) => {
        window.activeStore().set('feed-cover-bg', dataUrl);
        renderCover();
        toast('朋友圈背景已更新');
      });
      coverFile.value = '';
    });
  }
  // 点头像 → 更换（压缩 256，与桌面「我」头像一致，按当前桌面生效）
  if (coverAvEl) {
    coverAvEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            try {
              const scale = Math.min(1, 256 / Math.max(img.width, img.height));
              const c = document.createElement('canvas');
              c.width = Math.max(1, Math.round(img.width * scale));
              c.height = Math.max(1, Math.round(img.height * scale));
              c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
              window.activeStore().set('avatar-user', c.toDataURL('image/jpeg', 0.85));
              renderCover();
              toast('头像已更新');
            } catch (err) { toast('图片处理失败'); }
          };
          img.onerror = () => toast('图片读取失败');
          img.src = reader.result;
        };
        reader.readAsDataURL(f);
      };
      input.click();
    });
  }
  // 点昵称 → 修改（与桌面昵称一致，按当前桌面生效）
  if (coverNameEl) {
    coverNameEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.openModal) {
        window.openModal('修改昵称', window.activeStore().get('lbl-user') || '我', (v) => {
          const val = (v || '').trim();
          if (val) {
            window.activeStore().set('lbl-user', val);
            renderCover();
            toast('昵称已更新');
          }
        }, { maxlength: 12 });
      }
    });
  }
  // 发布
  function publish() {
    const input = document.getElementById('feed-input');
    const content = input ? input.value.trim() : '';
    if (!content && !pickedImgs.length) { toast('写点什么再发布吧'); return; }
    // v3.5.95：图片独立存 imgs 数组（九宫格展示，与 TA 动态一致），不再混排进文字
    const list = load();
    const id = 'f_' + Date.now();
    const me = activeMe();
    const cs = window.activeStore();
    const taName = cs.get('lbl-partner') || 'TA';
    const taAv = cs.get('avatar-partner') || '';
    const post = { id: id, role: 'me', owner: me.owner, authorName: me.authorName, authorAv: me.authorAv, taName: taName, taAv: taAv, content: content, imgs: pickedImgs.slice(), ts: Date.now(), likes: [], comments: [] };
    list.unshift(post);
    save(list);
    pickedImgs = [];
    renderPreview();
    if (input) input.value = '';
    render();
    toast('已发布');
    // v3.5.59：发布后收起发布框
    const pubCardEl = document.getElementById('feed-publish-card');
    if (pubCardEl) pubCardEl.hidden = true;
    // TA 有概率立即点赞
    if (Math.random() * 100 < feedCfg().likeProb) {
      const cfg = feedCfg();
      setTimeout(() => {
        const list2 = load();
        const p2 = list2.find(x => x.id === id);
        if (!p2) return;
        p2.likes = p2.likes || [];
        p2.likes.push(p2.taName || partnerName());
        save(list2);
        render();
        addNotice('like', p2.id, (p2.taName || partnerName()) + ' 赞了你的动态');
      }, (cfg.likeSpeedMin + Math.random() * Math.max(1, cfg.likeSpeedMax - cfg.likeSpeedMin)) * 1000);
    }
    // TA 有概率首次评论我的动态（首次评论概率 fd-comment-prob + 评论最快/最慢时间）
    if (Math.random() * 100 < feedCfg().commentProb) {
      const cfg = feedCfg();
      setTimeout(() => {
        const list2 = load();
        const p2 = list2.find(x => x.id === id);
        if (!p2) return;
        p2.comments = p2.comments || [];
        p2.comments.push(stampAuthor({ content: pickReplyContent(cfg, p2.owner || 'default'), ts: Date.now(), replies: [] }, taAuthorOf(p2)));
        save(list2);
        render();
        addNotice('comment', p2.id, (p2.taName || partnerName()) + ' 评论了你的动态');
      }, (cfg.commentSpeedMin + Math.random() * Math.max(1, cfg.commentSpeedMax - cfg.commentSpeedMin)) * 1000);
    }
  }
  // ================= TA 自动发布（定时机制，概率在回复设置-朋友圈调整，星言朋友圈机制） =================
  function feedCfg() {
    const c = (window.replyCfg && window.replyCfg()) || {};
    const num = (k, d) => c[k] !== undefined ? c[k] : d;
    return {
      likeProb: num('fd-like-prob', 60), likeSpeedMin: num('fd-like-speed-min', 1), likeSpeedMax: num('fd-like-speed-max', 60),
      commentProb: num('fd-comment-prob', 70), commentSpeedMin: num('fd-comment-speed-min', 1), commentSpeedMax: num('fd-comment-speed-max', 60),
      replyProb: num('fd-reply-prob', 60), replySpeedMin: num('fd-reply-speed-min', 1), replySpeedMax: num('fd-reply-speed-max', 60),
      likeback: num('fd-likeback-prob', 50),
      cardProb: num('fd-card-prob', 80), maxCards: num('fd-max-cards', 5),
      imageProb: num('fd-image-prob', 50),
      postProb: num('fd-post-prob', 40), dailyMax: num('fd-post-daily-max', 5),
      postCool: num('fd-post-cool', 30),
      minInterval: num('fd-min-interval', 1), maxInterval: num('fd-max-interval', 720),
      minCardsPost: num('fd-min-cards-post', 4), maxCardsPost: num('fd-max-cards-post', 15),
      postKaomoji: num('fd-post-kaomoji', 10), postEmoji: num('fd-post-emoji', 10),
      postSticker: num('fd-post-sticker', 30), postImage: num('fd-post-image', 30)
    };
  }
  function feedLast() { const v = parseInt(store.get('feed-last'), 10); return isNaN(v) ? 0 : v; }
  function feedNext() { const v = parseFloat(store.get('feed-next')); return isNaN(v) ? 0 : v; }
  function feedDayCount() { try { return JSON.parse(store.get('feed-day-count') || '0'); } catch (e) { return 0; } }
  function feedToday() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  // 单个联系人的 TA 自动发动态（用该联系人自己的字卡 + TA 身份）
  function maybeAutoPostFor(cid) {
    try {
      const cs = window.storeFor(cid);
      const now = Date.now();
      const cfg = feedCfg();
      let last = parseInt(cs.get('feed-last'), 10); if (isNaN(last)) last = 0;
      let next = parseFloat(cs.get('feed-next')); if (isNaN(next)) next = 0;
      if (last > now || last < 0) { last = 0; next = 0; }
      if ((now - last) / 60000 < next) return;
      let dayCount = (function () { try { return JSON.parse(cs.get('feed-day-count') || '0'); } catch (e) { return 0; } })();
      const today = feedToday();
      if (dayCount.t !== today) dayCount = { t: today, n: 0 };
      if (dayCount.n >= cfg.dailyMax) { cs.set('feed-next', String(cfg.postCool)); return; }
      if (Math.random() * 100 >= cfg.postProb) {
        cs.set('feed-next', String(cfg.minInterval + Math.random() * Math.max(1, cfg.maxInterval - cfg.minInterval)));
        return;
      }
      // 内容取该联系人桌面的字卡库
      const g = genPostContent(cfg, cid);
      const taName = cs.get('lbl-partner') || 'TA';
      const taAv = cs.get('avatar-partner') || '';
      const list = load();
      const post = { id: 'f_' + Date.now() + '_' + cid, role: 'ta', owner: cid, authorName: taName, authorAv: taAv, taName: taName, taAv: taAv, content: g.content, imgs: g.imgs, ts: Date.now(), likes: [], comments: [] };
      list.unshift(post);
      save(list);
      cs.set('feed-last', String(now));
      cs.set('feed-next', String(cfg.minInterval + Math.random() * Math.max(1, cfg.maxInterval - cfg.minInterval)));
      cs.set('feed-day-count', JSON.stringify({ t: today, n: dayCount.n + 1 }));
      if (window.chatAddSystem) window.chatAddSystem(taName + ' 发布了一条朋友圈动态');
      addNotice('post', post.id, taName + ' 发布了一条新动态');
      render();
    } catch (e) {}
  }
  // 遍历所有联系人：每个联系人的 TA 都可能自动发动态（朋友圈共享）
  function maybeAutoPost() {
    const list = (window.getContacts && window.getContacts()) || [{ id: 'default' }];
    list.forEach(c => maybeAutoPostFor(c.id));
  }
  setTimeout(() => {
    setInterval(maybeAutoPost, 60000);
    maybeAutoPost();
  }, (120 + Math.random() * 180) * 1000);

  // ================= 全部朋友圈（v3.5.63：点头像进入，封面背景/头像/昵称可直接修改） =================
  let feedAllCid = 'default';
  // v3.6.x：多桌面——全部朋友圈页读写「该联系人桌面」的数据（storeFor(cid)），
  // 背景/头像/昵称按 cid 独立；me 身份用 avatar-user/lbl-user/feed-cover-bg，
  // ta 身份用 feed-ta-avatar/feed-ta-name/feed-ta-cover（与主朋友圈一致）。
  function feedAllStore() { return window.storeFor(feedAllCid); }
  function feedAllBg() {
    const s = feedAllStore();
    // 该桌面「我」的封面背景优先；TA 动态桌面则用 TA 背景
    const me = s.get('feed-cover-bg');
    if (me) return safeBg(me, 'feed-cover-bg', s);
    const ta = s.get('feed-ta-cover');
    if (ta) return safeBg(ta, 'feed-ta-cover', s);
    return safeBg(store.get('feed-cover-bg'), 'feed-cover-bg', store);
  }
  function renderFeedAllCover() {
    const cover = document.getElementById('feed-all-cover');
    const avEl = document.getElementById('feed-all-av');
    const nameEl = document.getElementById('feed-all-name');
    if (!cover) return;
    const c = (window.getContacts && window.getContacts().find(x => x.id === feedAllCid)) || { name: feedAllCid };
    const bg = feedAllBg();
    if (bg) { cover.style.backgroundImage = 'url("' + bg + '")'; cover.classList.add('has-bg'); }
    else { cover.style.backgroundImage = ''; cover.classList.remove('has-bg'); }
    // 该联系人桌面的 TA 头像（feed-ta-avatar），回退该桌面 TA 聊天头像
    if (avEl) {
      const s = feedAllStore();
      let av = s.get('feed-ta-avatar');
      if (av) { av = safeBg(av, 'feed-ta-avatar', s); }
      if (!av) { av = store.get('feed-ta-avatar'); av = safeBg(av, 'feed-ta-avatar', store); }
      if (!av) av = s.get('avatar-partner') || '';
      avEl.innerHTML = av ? '<img src="' + attrEsc(av) + '" alt="">' : '';
    }
    if (nameEl) nameEl.textContent = c.name || feedAllCid;
  }
  function openFeedAll(cid) {
    // v3.5.130：进全部朋友圈前重置评论条（否则返回后旧回复目标/草稿残留，发错位置）
    hideCommentBar();
    feedAllCid = cid || window.__activeCid || 'default';
    const c = (window.getContacts && window.getContacts().find(x => x.id === feedAllCid)) || { name: feedAllCid };
    const title = document.getElementById('feed-all-title');
    if (title) title.textContent = (c.name || feedAllCid) + ' 的全部朋友圈';
    const listEl = document.getElementById('feed-all-list');
    const posts = load().filter(p => (p.owner || 'default') === feedAllCid).sort((a, b) => b.ts - a.ts);
    listEl.innerHTML = posts.length
      ? posts.map(p => {
          const author = p.authorName || ((p.role || p.by) === 'me' ? myName() : taFeedName());
          const av = p.authorAv || ((p.role || p.by) === 'me' ? myAv() : taFeedAv());
          const likes = p.likes && p.likes.length
            ? '<div class="feed-likes" style="font-size:11px;color:var(--muted);padding:6px 2px">' + esc(p.likes.join('、')) + ' 觉得很赞</div>'
            : '';
          return '<div class="feed-post"><div class="feed-head">' + avHtml(av) +
            '<div class="feed-who"><div class="feed-name">' + esc(author) + '</div><div class="feed-time">' + fmtDT(p.ts) + '</div></div>' +
            '<button class="feed-del" data-id="' + p.id + '" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2"/><path d="M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14"/></svg></button></div>' +
            '<div class="feed-content">' + contentHtmlFor(p) + '</div>' + likes +
            commentsHtmlFor(p, author) + '</div>';
        }).join('')
      : '<div class="ta-empty">还没有动态</div>';
    // v3.6.x：全部朋友圈页同样支持删除单条动态（我的与 TA 的均可删）
    listEl.querySelectorAll('.feed-del').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePostConfirm(b.dataset.id);
    }));
    // v3.6.x：全部朋友圈页图片同样可点击放大（动态图/评论图，原先点不动）
    bindFeedImageClicks(listEl);
    renderFeedAllCover();
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    const ap = document.getElementById('page-feed-all');
    if (ap) ap.hidden = false;
  }
  const feedAllBack = document.getElementById('feed-all-back');
  if (feedAllBack) {
    feedAllBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      feedPage.hidden = false;
      render();
    });
  }
  // 全部朋友圈封面：点背景换背景、点头像换头像、点昵称改昵称（每个联系人桌面各自独立）
  // v3.6.x：写入 storeFor(feedAllCid)（该联系人自己的命名空间）——TA 身份
  // 用 feed-ta-* 键；「我」在默认桌面的主朋友圈封面操作仍走 activeStore。
  const feedAllCover = document.getElementById('feed-all-cover');
  const feedAllAv = document.getElementById('feed-all-av');
  const feedAllName = document.getElementById('feed-all-name');
  if (feedAllCover) {
    feedAllCover.addEventListener('click', (e) => {
      if (feedAllAv && (e.target === feedAllAv || feedAllAv.contains(e.target))) return;
      if (feedAllName && (e.target === feedAllName || feedAllName.contains(e.target))) return;
      // 换背景（该联系人桌面的 TA 封面背景）
      const key = 'feed-ta-cover';
      if (feedAllStore().get(key) || store.get(key)) {
        if (window.openModal) {
          window.openModal('已设置朋友圈背景', '', (v) => {
            if (v === '1') pickCoverFile();
            if (v === '2') { feedAllStore().set(key, ''); renderFeedAllCover(); toast('已恢复默认背景'); }
          }, { noInput: true, pills: [{ label: '更换背景', value: '1' }, { label: '恢复默认', value: '2' }] });
        }
      } else {
        pickCoverFile();
      }
      function pickCoverFile() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = () => {
          const f = input.files && input.files[0];
          if (!f) return;
          compressImage(f, (dataUrl) => {
            feedAllStore().set(key, dataUrl);
            renderFeedAllCover();
            toast('朋友圈背景已更新');
          });
        };
        input.click();
      }
    });
  }
  if (feedAllAv) {
    feedAllAv.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = 'feed-ta-avatar';
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            try {
              const scale = Math.min(1, 256 / Math.max(img.width, img.height));
              const c = document.createElement('canvas');
              c.width = Math.max(1, Math.round(img.width * scale));
              c.height = Math.max(1, Math.round(img.height * scale));
              c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
              feedAllStore().set(key, c.toDataURL('image/jpeg', 0.85));
              renderFeedAllCover();
              toast('头像已更新');
            } catch (err) { toast('图片处理失败'); }
          };
          img.onerror = () => toast('图片读取失败');
          img.src = reader.result;
        };
        reader.readAsDataURL(f);
      };
      input.click();
    });
  }
  if (feedAllName) {
    feedAllName.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = 'feed-ta-name';
      const cur = feedAllStore().get(key) || store.get(key) || (feedAllStore().get('lbl-partner') || 'TA');
      if (window.openModal) {
        window.openModal('修改昵称', cur, (v) => {
          const val = (v || '').trim();
          if (val) {
            feedAllStore().set(key, val);
            renderFeedAllCover();
            toast('昵称已更新');
          }
        }, { maxlength: 12 });
      }
    });
  }

  // ================= 入口 =================
  const feedApp = document.querySelector('.app[data-app="feed"]');
  const feedPage = document.getElementById('page-feed');
  if (feedApp && feedPage) {
    feedApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      // v3.5.100：进入朋友圈即清零桌面「朋友圈」未读提醒（微信式）
      openFeedPage();
    });
  }
  // 通知提醒面板：开关 + 打开时全部标记已读（微信式）
  const noticeBtn = document.getElementById('feed-notice-btn');
  const noticePanel = document.getElementById('feed-notice-panel');
  if (noticeBtn && noticePanel) {
    noticeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      noticePanel.hidden = !noticePanel.hidden;
      if (!noticePanel.hidden) {
        const list = notices();
        let dirty = false;
        list.forEach(n => { if (!n.read) { n.read = true; dirty = true; } });
        if (dirty) saveNotices(list);
        renderNotices();
        renderNoticeBadge();
      }
    });
    document.addEventListener('click', (e) => {
      if (!noticePanel.hidden && !noticePanel.contains(e.target) && !noticeBtn.contains(e.target)) {
        noticePanel.hidden = true;
      }
    });
  }
  const feedBack = document.getElementById('feed-back');
  if (feedBack) feedBack.addEventListener('click', () => {
    const cb = document.getElementById('feed-comment-bar');
    if (cb) cb.hidden = true;
    const np = document.getElementById('feed-notice-panel');
    if (np) np.hidden = true;
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    const phone = document.getElementById('page-phone');
    if (phone) phone.hidden = false;
  });
  // v3.5.59：点顶部「发布朋友圈」+ 图标 → 展开/收起发布框（不再默认显示在顶部）
  const feedPubBtn = document.getElementById('feed-publish-btn');
  const feedPubCard = document.getElementById('feed-publish-card');
  if (feedPubBtn && feedPubCard) {
    feedPubBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      feedPubCard.hidden = !feedPubCard.hidden;
      if (!feedPubCard.hidden) {
        const fi = document.getElementById('feed-input');
        if (fi) setTimeout(() => fi.focus(), 60);
        feedPubCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
  const pubBtn = document.getElementById('feed-publish');
  if (pubBtn) pubBtn.addEventListener('click', publish);
  // v3.6.x：设置页「清除所有朋友圈数据」——清空全部动态（我的与 TA 的）、评论、点赞、
  // 通知提醒与未读角标（动态/通知为全局键，跨桌面一次清空）
  const feedClearAll = document.getElementById('feed-clear-all');
  if (feedClearAll) {
    feedClearAll.addEventListener('click', () => {
      if (!window.openModal) return;
      window.openModal('清除所有朋友圈数据？', '', () => {
        save([]);
        saveNotices([]);
        try { store.set('feed-app-unread', '0'); } catch (e) {}
        hideCommentBar();
        renderNoticeBadge();
        render();
        const np = document.getElementById('feed-notice-panel');
        if (np && !np.hidden) renderNotices();
        toast('朋友圈数据已全部清除');
      }, { noInput: true, staticText: '将删除全部动态（我的与 TA 的）、评论、点赞和通知提醒，且无法恢复。确定继续吗？' });
    });
  }
  render();
  // v3.5.93：朋友圈大键（动态里的图片 dataURL）可能只存在 IndexedDB（导入兜底写入）——
  // 启动时从 IDB 补读进内存缓存后重新渲染
  // v3.5.95：localStorage 有值时不再覆盖（防旧 IDB 值回退掉较新的本地更新）
  // v3.6.x：多桌面——美化类大键按当前桌面命名空间（activePrefix）读写，全局旧键兜底
  try {
    if (window.idbGet) {
      window.idbGet(uid + ':' + KEY).then(v => {
        if (v && typeof v === 'string' && v.length > 2 && !store.get(KEY)) {
          store.set(KEY, v);
          render();
        }
      });
      // v3.5.94：TA 朋友圈封面也可能 >200KB → 同样补读（主列表 + 全部朋友圈封面都刷新）
      window.idbGet(window.activePrefix() + ':feed-ta-cover').then(v => {
        if (v && typeof v === 'string' && v.length > 2 && !window.activeStore().get('feed-ta-cover')) {
          window.activeStore().set('feed-ta-cover', v);
          renderCover();
          renderFeedAllCover();
        }
      });
      // v3.5.94：朋友圈背景图同样补读
      window.idbGet(window.activePrefix() + ':feed-cover-bg').then(v => {
        if (v && typeof v === 'string' && v.length > 2 && !window.activeStore().get('feed-cover-bg')) {
          window.activeStore().set('feed-cover-bg', v);
          renderCover();
        }
      });
      // v3.5.95：我的头像/TA 朋友圈头像补读（压缩失败兜底可能存原始大图）
      window.idbGet(window.activePrefix() + ':avatar-user').then(v => {
        if (v && typeof v === 'string' && v.length > 2 && !window.activeStore().get('avatar-user')) {
          window.activeStore().set('avatar-user', v);
          renderCover();
        }
      });
      window.idbGet(window.activePrefix() + ':feed-ta-avatar').then(v => {
        if (v && typeof v === 'string' && v.length > 2 && !window.activeStore().get('feed-ta-avatar')) {
          window.activeStore().set('feed-ta-avatar', v);
          renderCover();
        }
      });
    }
  } catch (e) {}
  // v3.6.x：多桌面——切换联系人后刷新朋友圈封面（我/TA 的头像昵称背景按新桌面）
  document.addEventListener('contact-switched', function () {
    try { renderCover(); } catch (e) {}
    try { renderFeedAllCover(); } catch (e) {}
  });
  // v3.5.100：页面加载时恢复桌面「朋友圈」通知未读提醒
  renderNoticeBadge();
})();
