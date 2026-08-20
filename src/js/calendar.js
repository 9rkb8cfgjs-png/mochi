// ===== 功能：日历（按星言日历逻辑复刻） =====
// 每日生成：今日心情（分类/描述）+ TA 正在做什么 + TA 留言（从字卡池随机拼）
// 每次首次打开日历触发 TA 留言弹窗；美化毛玻璃、无 emoji、矢量图标
// v3.7.x：月历日期可点击自选——选中日期后上方卡片显示该日内容（当天心情/TA正在/TA留言/我的留言），
//   任意日期首次访问自动生成当日内容并落盘（cal-YYYY-MM-DD）；我的留言仅今天可编辑。
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  const page = document.getElementById('page-calendar');
  if (!page) return;

  // ---- 数据（无 emoji，纯文字）----
  const MOODS = [
    { mood: '温柔', cat: '温暖', desc: '今天很温柔。' },
    { mood: '开心', cat: '温暖', desc: '今天心情很好。' },
    { mood: '愉快', cat: '温暖', desc: '今天过得很轻松。' },
    { mood: '满足', cat: '温暖', desc: '今天觉得很满足。' },
    { mood: '放松', cat: '温暖', desc: '今天慢慢放松着。' },
    { mood: '安心', cat: '温暖', desc: '今天很安心。' },
    { mood: '平静', cat: '平静', desc: '今天很平静。' },
    { mood: '安静', cat: '平静', desc: '今天想安静一点。' },
    { mood: '专注', cat: '平静', desc: '今天专注于眼前的事。' },
    { mood: '思考中', cat: '平静', desc: '今天一直在思考。' },
    { mood: '想念', cat: '想念', desc: '今天有些想你。' },
    { mood: '等待', cat: '想念', desc: '今天静静等着与你相遇。' },
    { mood: '期待', cat: '想念', desc: '今天期待着一点惊喜。' },
    { mood: '牵挂', cat: '想念', desc: '今天一直惦记着你。' },
    { mood: '疲惫', cat: '低落', desc: '今天有一点累。' },
    { mood: '孤单', cat: '低落', desc: '今天有些安静。' },
    { mood: '烦恼', cat: '低落', desc: '今天有些事情放不下。' },
    { mood: '精神很好', cat: '活跃', desc: '今天状态很好。' },
    { mood: '兴致高涨', cat: '活跃', desc: '今天充满热情。' },
    { mood: '充满动力', cat: '活跃', desc: '今天想做很多事情。' }
  ];
  const ACTIVITIES = [
    '看书', '整理书籍', '写东西', '记录想法', '工作中', '整理资料',
    '回复消息', '听音乐', '戴着耳机发呆', '哼着歌', '喝茶', '泡茶中',
    '喝点饮料', '吃点心', '吃饭中', '休息中', '小睡一会', '发呆',
    '想事情', '思考中', '放空自己', '散步', '看风景', '晒太阳',
    '吹吹风', '听雨声', '看夜空', '看照片', '放松中', '创作中',
    '整理照片', '看视频', '看电影', '找点事情做', '整理东西', '安静待着',
    '看着窗外', '等待中', '想着你', '回忆过去', '想靠近你', '陪着你',
    '等你来聊天', '在线中', '忙碌中', '想给你一点惊喜', '静静待着', '在这里等你'
  ];
  // 心情图标（矢量 SVG，替代 emoji）
  const MOOD_ICONS = {
    '温暖': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7.5-4.7-9.3-9A5.3 5.3 0 0112 6.4a5.3 5.3 0 019.3 5.6c-1.8 4.3-9.3 9-9.3 9z"/></svg>',
    '平静': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    '想念': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    '低落': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
    '活跃': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0112 7.1a4.9 4.9 0 017.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/></svg>'
  };

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // 留言：从自定义聊天字卡 + 默认字卡池随机拼 3~8 条（无 emoji）
  // v3.6.x：过滤语音/图片字卡——语音字卡存储格式为「文件名|||audio;base64,...」，
  //   以文件名开头（indexOf('data:') 不为 0），旧逻辑漏过滤会把整段音频 base64
  //   拼进每日留言并持久化（几百 KB~数 MB，拖慢渲染且内容不可读）
  function genMessage() {
    const cards = [];
    const custom = (window.getCustomCards && window.getCustomCards()) || [];
    custom.forEach(c => {
      if (typeof c === 'string' && c.indexOf('data:') !== 0 && c.indexOf('|||') < 0) cards.push(c);
    });
    const defs = (window.getDefaultCardGroups && window.getDefaultCardGroups('main')) || [];
    defs.forEach(([g, arr]) => { if (Array.isArray(arr)) arr.forEach(c => cards.push(c)); });
    if (!cards.length) return '今天也想对你说点什么...';
    const maxCount = Math.min(8, cards.length);
    const minCount = Math.min(3, maxCount);
    const count = minCount + Math.floor(Math.random() * (maxCount - minCount + 1));
    const pool = cards.slice();
    const sel = [];
    for (let i = 0; i < count && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      sel.push(pool.splice(idx, 1)[0]);
    }
    return sel.join('  ');
  }

// 生成或获取某一日数据（按日期持久化，首次访问该日期时生成并落盘）
  // v3.7.x：抽出 getDayEntry 供「本周日常点击其他日期查看当日内容」复用，
  //   任意日期首次访问都会生成 TA 心情/正在/留言并保存（历史日期也补齐）。
  // v3.7.x bugfix：未来日期不读不写不生成——本周日常点击未来日期会现场随机生成
  //   TA 内容并落盘（"超前显示"），且会污染该日期当天真实的首次生成。
  //   已误生成的未来数据同步清理（LS remove + IDB delete），否则到点当天会被回填复用。
  function getDayEntry(dateStr) {
    if (!dateStr) return null;
    const p0 = dateStr.split('-');
    const d0 = new Date(+p0[0], +p0[1] - 1, +p0[2]);
    const n0 = new Date();
    if (d0 > new Date(n0.getFullYear(), n0.getMonth(), n0.getDate())) {
      try {
        const k = 'cal-' + dateStr;
        if (store.get(k)) store.remove(k);
        if (window.idbDelete) window.idbDelete(window.activePrefix() + ':' + k);
      } catch (e) {}
      return null;
    }
    const key = 'cal-' + dateStr;
    let entry = null;
    try { entry = JSON.parse(store.get(key) || 'null'); } catch (e) {}
    if (!entry) {
      const m = pick(MOODS);
      entry = {
        mood: m.mood, cat: m.cat, desc: m.desc,
        activity: pick(ACTIVITIES),
        message: genMessage(),
        date: dateStr
      };
      store.set(key, JSON.stringify(entry));
      // 手机端 localStorage 写入失败（空间满/隐私模式）时仍写入 IndexedDB 兜底
      try { if (window.idbSet) window.idbSet(window.activePrefix() + ':' + key, JSON.stringify(entry)); } catch (e) {}
    }
    return entry;
  }
  // 今日数据（本会话缓存，避免反复生成导致内容"变来变去"）
  let calCache = null;
  function getToday() {
    const ds = todayStr();
    if (calCache && calCache.date === ds) return calCache;
    calCache = getDayEntry(ds);
    return calCache;
  }
  // 暴露给 p2-features.js 的「本周日常」点击查看其他日期复用
  window.calGetDayEntry = getDayEntry;
  window.calGetMyMessage = function (ds) { return store.get('cal-my-' + ds) || ''; };

  // v3.6.x：多桌面——切换联系人后清掉本会话缓存（calCache 只按日期缓存、不区分
  // 桌面，残留会导致新桌面显示旧桌面的「今日数据」）；viewY/viewM/selDate 同步复位到当前月/今天
  document.addEventListener('contact-switched', function () {
    try { calCache = null; viewY = 0; viewM = -1; selDate = todayStr(); } catch (e) {}
  });

  // 渲染月历（可切换月份）
  let viewY = 0, viewM = -1; // 0=当前月
  // v3.7.x：点选日期查看当日内容——selDate 为当前查看的日期，默认今天
  let selDate = todayStr();
  function renderGrid() {
    const grid = document.getElementById('cal-grid');
    if (!grid) return;
    const now = new Date();
    if (viewM < 0) { viewY = now.getFullYear(); viewM = now.getMonth(); }
    const y = viewY, m = viewM;
    const monthEl = document.getElementById('cal-month-txt');
    if (monthEl) monthEl.textContent = y + ' 年 ' + (m + 1) + ' 月';
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const startWd = first.getDay();
    const wds = ['日', '一', '二', '三', '四', '五', '六'];
    let html = wds.map(w => '<span class="cal-wd">' + w + '</span>').join('');
    for (let i = 0; i < startWd; i++) html += '<span class="cal-cell blank"></span>';
    for (let d = 1; d <= days; d++) {
      const isToday = d === now.getDate() && y === now.getFullYear() && m === now.getMonth();
      const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      html += '<span class="cal-cell' + (isToday ? ' today' : '') + (ds === selDate ? ' sel' : '') + '" data-date="' + ds + '">' + d + '</span>';
    }
    grid.innerHTML = html;
  }
  // v3.7.x：点击日期自选 → 显示该日内容（当日心情 / TA 正在 / TA 留言 / 我的留言）
  const calGridEl = document.getElementById('cal-grid');
  if (calGridEl) {
    calGridEl.addEventListener('click', (ev) => {
      const cell = ev.target.closest('.cal-cell');
      if (!cell || cell.classList.contains('blank')) return;
      const ds = cell.getAttribute('data-date');
      if (!ds || ds === selDate) return;
      selDate = ds;
      render();
    });
  }
  // 月份前进/后退
  const calPrev = document.getElementById('cal-prev');
  if (calPrev) calPrev.addEventListener('click', () => { viewM--; if (viewM < 0) { viewM = 11; viewY--; } renderGrid(); });
  const calNext = document.getElementById('cal-next');
  if (calNext) calNext.addEventListener('click', () => { viewM++; if (viewM > 11) { viewM = 0; viewY++; } renderGrid(); });

  // ---- 我的留言（仅今天可编辑）----
  function getMyMessage() {
    const v = store.get('cal-my-' + todayStr());
    return v || '';
  }
  function renderMyMessage() {
    const el = document.getElementById('cal-my-message');
    if (!el) return;
    const msg = store.get('cal-my-' + selDate);
    el.textContent = msg || (selDate === todayStr() ? '今天想说点什么...' : '这一天没有留下留言');
    const btn = document.getElementById('cal-edit-btn');
    if (btn) btn.hidden = selDate !== todayStr();
  }

  function render() {
    const parts = selDate.split('-');
    const dd = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    const n2 = new Date();
    // v3.7.x：未来日期不生成不读取内容，只显示空态提示（与本周日常一致），避免"超前显示"
    const isFuture = dd > new Date(n2.getFullYear(), n2.getMonth(), n2.getDate());
    const e = isFuture ? null : getDayEntry(selDate);
    const dateEl = document.getElementById('cal-today-date');
    if (dateEl) dateEl.textContent = e ? e.date : selDate;
    const catEl = document.getElementById('cal-mood-cat');
    if (catEl) catEl.textContent = e ? e.cat : '未到来';
    const icoEl = document.getElementById('cal-mood-ico');
    if (icoEl) icoEl.innerHTML = MOOD_ICONS[e ? e.cat : '平静'] || MOOD_ICONS['平静'];
    const nameEl = document.getElementById('cal-mood-name');
    if (nameEl) nameEl.textContent = e ? e.mood : '未来';
    const descEl = document.getElementById('cal-mood-desc');
    if (descEl) descEl.textContent = e ? e.desc : '这一天还没有内容，等到了那一天再来看吧';
    const actEl = document.getElementById('cal-activity');
    if (actEl) actEl.textContent = e ? e.activity : '—';
    const msgEl = document.getElementById('cal-message');
    if (msgEl) msgEl.textContent = e ? e.message : '这一天还没有留言';
    renderMyMessage();
    renderGrid();
  }

  // 桌面【日历】图标进入
  const calApp = document.querySelector('.app[data-app="calendar"]');
  if (calApp && page) {
    calApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      page.hidden = false;
      // 每次进入回到本月、回到今天
      viewM = -1;
      selDate = todayStr();
      render();
    });
  }
  // 编辑我的留言
  const editBtn = document.getElementById('cal-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (window.openModal) {
        window.openModal('编辑我的留言', getMyMessage(), (v) => {
          const val = (v || '').trim();
          if (val) {
            store.set('cal-my-' + todayStr(), val);
            renderMyMessage();
          }
        });
      }
    });
  }
  const calBack = document.getElementById('cal-back');
  if (calBack) {
    calBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const phonePage = document.getElementById('page-phone');
      if (phonePage) phonePage.hidden = false;
    });
  }

  // 打开 mochi 即触发 TA 今日留言（每天一次）
  // v3.5.25 修复"手机端一直触发"：localStorage 写失败（空间满/隐私模式）时旧逻辑每次都弹。
  // 现在：本会话内存标记只弹一次 + 标记双写 IndexedDB（下次加载经 idbRestore 回填，不再重复弹）
  // v3.6.x：由「居中遮罩弹窗」改为「顶部非阻塞横幅」——遮罩弹窗（modal-mask z-index 90 +
  // 全屏锁滚动）在开屏数据加载期间就已弹出，用户点「点击进入」后第一眼就是被遮罩盖住的
  // 桌面：点【聊天】等图标实际点在遮罩上，「什么都点不了」（iPhone Edge 反馈：桌面卡住、
  // 点聊天无反应；iPad 夸克反馈：全部页面卡住）。横幅不锁滚动、不遮操作，
  // 仅停留 8 秒自动收起，点击横幅打开日历页查看完整内容。
  (function () {
    const key = 'greeted-' + todayStr();
    let greeted = false; // 本会话只显示一次
    function openCalPage() {
      const calApp = document.querySelector('.app[data-app="calendar"]');
      if (!calApp || !page) return;
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      page.hidden = false;
      viewM = -1;
      selDate = todayStr();
      render();
    }
    function hideGreetBanner() {
      const el = document.getElementById('daily-greet');
      if (!el) return;
      el.hidden = true;
      clearTimeout(el._timer);
    }
    function showGreetBanner(e2, name) {
      let el = document.getElementById('daily-greet');
      if (!el) {
        el = document.createElement('div');
        el.id = 'daily-greet';
        el.style.cssText = 'position:fixed;top:calc(12px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:89;width:min(330px,calc(100% - 24px));box-sizing:border-box;background:rgba(255,255,255,.97);border:1px solid rgba(0,0,0,.1);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.12);padding:12px 14px;cursor:pointer;-webkit-tap-highlight-color:transparent;font-family:inherit;text-align:left;';
        const t = document.createElement('div');
        t.style.cssText = 'font-size:12px;font-weight:700;color:var(--ink,#111);margin-bottom:6px;';
        const b = document.createElement('div');
        b.style.cssText = 'font-size:12px;color:#666;line-height:1.6;white-space:pre-line;word-break:break-word;';
        el.appendChild(t); el.appendChild(b);
        el._t = t; el._b = b;
        el.addEventListener('click', () => { hideGreetBanner(); openCalPage(); });
        document.body.appendChild(el);
      }
      el._t.textContent = name + ' 的今日留言';
      el._b.textContent = '今日心情：' + e2.mood + '（' + e2.cat + '）\nTA 正在：' + e2.activity + '\n\nTA 留言：\n' + e2.message;
      el.hidden = false;
      el.style.transition = 'none';
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(-8px)';
      requestAnimationFrame(() => {
        el.style.transition = 'opacity .25s ease, transform .25s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(0)';
      });
      clearTimeout(el._timer);
      el._timer = setTimeout(hideGreetBanner, 8000);
    }
    function doGreet() {
      // 多桌面：异步轮询期间切换联系人会把横幅/标记写到新桌面 → 捕获 cid 校验
      const myCid = window.__activeCid || 'default';
      greeted = true;
      store.set(key, '1');
      try { if (window.idbSet) window.idbSet(window.activePrefix() + ':' + key, '1'); } catch (e) {}
      // 等开屏关闭后再展示：数据加载 + 用户点「点击进入」通常 1-3s，过早弹出会被开屏
      // 盖住，8 秒自动收起多半已过期，用户根本看不到。轮询到开屏隐藏后 1s 再显示。
      const splashEl = document.getElementById('splash');
      const iv = setInterval(() => {
        if ((window.__activeCid || 'default') !== myCid) { try { clearInterval(iv); } catch (e) {} return; }
        if (!splashEl || splashEl.classList.contains('hide')) {
          clearInterval(iv);
          setTimeout(() => {
            if ((window.__activeCid || 'default') !== myCid) return;
            try {
              // 仅桌面可见时展示；聊天/其他页面或已有弹窗打开时不打扰（横幅随时可再进日历看）
              const phonePage = document.getElementById('page-phone');
              if (phonePage && phonePage.hidden) return;
              const mm = document.getElementById('modal-mask');
              const tc = document.getElementById('tc-mask');
              if ((mm && !mm.hidden) || (tc && !tc.hidden)) return;
            } catch (e) {}
            showGreetBanner(getToday(), store.get('lbl-partner') || 'TA');
          }, 1000);
        }
      }, 500);
      setTimeout(() => { try { clearInterval(iv); } catch (e) {} }, 30000); // 30s 兜底停止轮询
    }
    function maybeGreet() {
      if (greeted) return;
      if (store.get(key)) { greeted = true; return; }
      // localStorage 无标记：查 IndexedDB（防止 localStorage 写失败/被清导致每天重复弹）
      if (window.idbGet) {
        const myPrefix = window.activePrefix();
        window.idbGet(myPrefix + ':' + key).then(v => {
          if (window.activePrefix() !== myPrefix) return;
          if (v) { greeted = true; store.set(key, '1'); return; }
          if (greeted) return;
          doGreet();
        }).catch(() => { if (window.activePrefix() !== myPrefix) return; if (!greeted) doGreet(); });
      } else {
        doGreet();
      }
    }
    maybeGreet();
  })();
})();
