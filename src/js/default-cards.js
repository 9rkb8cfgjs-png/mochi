// ===== 功能：聊天默认字卡 =====
// 数据来自星言简易版默认通用字卡；可开关；分类浏览（主字卡/颜文字/emoji）；
// 开启后联系人回复按「整体概率 + 分类占比」混入默认字卡
(function () {
  const list = document.getElementById('dc-list');
  const tabsWrap = document.getElementById('dc-tabs');
  const enabledEl = document.getElementById('dc-enabled');
  if (!list || !tabsWrap || !enabledEl) return;

  const uid = window.activePrefix();
  const ls = window.activeStore();
  // v3.6.x：轻提示（复用 cc-toast 风格）
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }
  function toastCard(txt, off) {
    const s = String(txt == null ? '' : txt);
    toast((off ? '已关闭：' : '已开启：') + (s.length > 18 ? s.slice(0, 18) + '…' : s));
  }
  // 默认值（对应星言 defaultCommonOverallProb=30, probs 各30）
  function getEnabled() { const v = ls.get('dc-enabled'); return v === null ? true : v === '1'; }
  function getOverall() { const v = ls.get('dc-overall'); return v === null ? 30 : Number(v); }
  function getProb(k) { const v = ls.get('dc-prob-' + k); return v === null ? 30 : Number(v); }
  // v3.7.x：场景开关——默认字卡可分别用于 聊天 / 信箱 / 朋友圈（默认全开）
  //   存 localStorage 键：dc-use-chat / dc-use-mail / dc-use-feed（'1' 开启）
  function getUse(k) { const v = ls.get('dc-use-' + k); return v === null ? true : v === '1'; }
  function setUse(k, on) { ls.set('dc-use-' + k, on ? '1' : '0'); }
  window.defaultCardUse = function (k) { return getUse(k); };
  window.defaultCardCfg = function () {
    return { enabled: getEnabled(), overall: getOverall(), probs: { main: getProb('main'), kaomoji: getProb('kaomoji'), emoji: getProb('emoji'), touch: getProb('touch') } };
  };

  // 数据（提取自星言 08_default_cards_data.js）
  const DATA = (window.DEFAULT_CARD_DATA) || { main: [], kaomoji: [], emoji: [] };

  // v3.6.x：单卡开关——系统预设字卡可逐张开启/关闭使用
  //   存 localStorage 键：dc-off-<分类>:<字卡内容>，关闭为 '1'
  function isCardOff(cat, c) { return ls.get('dc-off-' + cat + ':' + c) === '1'; }
  function setCardOff(cat, c, off) { ls.set('dc-off-' + cat + ':' + c, off ? '1' : '0'); }
  // v3.6.x：暴露单卡开关查询（供 chat.js 字卡池兜底过滤：自定义字卡为空时
  //   系统字卡补池也必须跳过用户已关闭的字卡）
  window.isDefaultCardOff = function (cat, c) { return isCardOff(cat, c); };

  // ---- 页面 UI ----
  let cur = 'main';
  let q = '';
  enabledEl.checked = getEnabled();
  enabledEl.addEventListener('change', () => {
    ls.set('dc-enabled', enabledEl.checked ? '1' : '0');
    // v3.6.x：总开关也弹轻提示（与单卡开关一致）
    toast(enabledEl.checked ? '已开启：使用系统预设字卡' : '已关闭：使用系统预设字卡');
  });
  // v3.7.x：场景开关绑定——聊天 / 信箱 / 朋友圈 分别控制默认字卡的使用
  [['chat', '聊天'], ['mail', '信箱'], ['feed', '朋友圈']].forEach(([k, label]) => {
    const el = document.getElementById('dc-use-' + k);
    if (!el) return;
    el.checked = getUse(k);
    el.addEventListener('change', () => {
      setUse(k, el.checked);
      toast((el.checked ? '已开启' : '已关闭') + '：默认字卡' + label + '使用');
    });
  });

  let curGroup = '';
  function renderGroupsBar2() {
    const bar = document.getElementById('dc-groups-bar');
    if (!bar) return;
    bar.innerHTML = '';
    const grps = DATA[cur] || [];
    const chips = [['', '全部']].concat(grps.map(g => [g[0], g[0]]));
    chips.forEach(([val, label]) => {
      const cEl = document.createElement('span');
      cEl.className = 'cc-g-chip' + (curGroup === val ? ' sel' : '');
      cEl.textContent = label;
      cEl.addEventListener('click', () => { curGroup = val; renderGroupsBar2(); render(); });
      bar.appendChild(cEl);
    });
  }
  // v3.7.x：分批渲染——main 分类 4621 张字卡一次性同步构建 DOM（每卡 div+innerHTML+
  // querySelector+addEventListener）会阻塞 iOS Safari 主线程数百毫秒到数秒，低端机白屏；
  // 改为每帧挂载一批（rAF + DocumentFragment），首屏立即可滚动，后续渐进填充。
  // 切换 tab/分组/搜索时递增 renderToken，旧批次发现 token 不匹配即废弃，防旧卡复活。
  const RENDER_BATCH = 120;
  let renderToken = 0;
  // change 委托查表：idx → {c, item, input}。原每卡一个 change 监听器（4621 个）是
  // 内存与启动负担，改为 list 单一 change 监听器按 data-idx 查表（rec.input 校验防旧批次残留）
  let cardByIdx = [];
  function render() {
    const token = ++renderToken;
    const grps = DATA[cur] || [];
    let shown = grps;
    if (curGroup) shown = shown.filter(g => g[0] === curGroup);
    if (q) {
      // 基于已选分组过滤后的 shown 再筛内容（v3.6.x：修复搜索覆盖分组筛选的 bug）
      shown = shown.map(([g, arr]) => [g, arr.filter(c => c.indexOf(q) >= 0)]).filter(([g, arr]) => arr.length || g.indexOf(q) >= 0);
    }
    list.innerHTML = '';
    cardByIdx = [];
    if (!shown.length) {
      list.innerHTML = '<div class="cc-empty">暂无默认字卡</div>';
      return;
    }
    // 展开扁平结构：分组 header 与字卡项交错
    const flat = [];
    shown.forEach(([gname, arr]) => {
      flat.push({ header: true, gname, count: arr.length });
      arr.forEach(c => flat.push({ header: false, c }));
    });
    const frag = document.createDocumentFragment();
    let pos = 0;
    const step = () => {
      if (token !== renderToken) return; // 新渲染已开始，废弃本批次
      const end = Math.min(pos + RENDER_BATCH, flat.length);
      for (; pos < end; pos++) {
        const it = flat[pos];
        if (it.header) {
          const h = document.createElement('div');
          h.className = 'cc-group-header';
          h.innerHTML = '<span class="ccg-name">' + it.gname + '</span><span class="ccg-count">' + it.count + '</span>';
          frag.appendChild(h);
        } else {
          const c = it.c;
          const off = isCardOff(cur, c);
          const d = document.createElement('div');
          d.className = 'cc-item glass' + (off ? ' off' : '');
          // v3.6.x：整页为系统预设字卡，统一标【系统】与自定义字卡区分；
          // 右侧单卡开关——逐张开启/关闭该字卡（关闭后聊天回复不再抽取）
          d.innerHTML = '<div class="cc-txt"><div class="t">' + c + ' <span class="tc-known">系统</span></div></div>' +
            '<label class="toggle ccard-toggle"><input type="checkbox"' + (off ? '' : ' checked') + '><span class="tk"></span></label>';
          d.dataset.idx = cardByIdx.length;
          cardByIdx.push({ c, item: d, input: d.querySelector('input') });
          frag.appendChild(d);
        }
      }
      // 每帧挂载一批：列表渐进出现，首屏立即可滚动
      list.appendChild(frag);
      if (pos < flat.length) requestAnimationFrame(step);
    };
    step(); // 首帧同步跑第一批（小列表一次完成，行为与原一致）
  }
  // v3.7.x：change 事件委托——list 单一监听器替代每卡一个（4621 → 1）
  list.addEventListener('change', (e) => {
    const input = e.target;
    if (!input || input.type !== 'checkbox') return;
    const item = input.closest('.cc-item');
    if (!item) return;
    const rec = cardByIdx[Number(item.dataset.idx)];
    if (!rec || rec.input !== input) return; // 旧批次残留 DOM，忽略
    const nowOff = !input.checked;
    setCardOff(cur, rec.c, nowOff);
    item.classList.toggle('off', nowOff);
    toastCard(rec.c, nowOff);
  });

  // v3.7.x：互动回应 tab（JS 注入，避免改 template.html）——展示互动卡片预设话术池
  // （邀请TA 接受/拒绝、问问TA 回应、小问题/好奇/吐槽/询问 的预设回应，数据在
  // DEFAULT_CARD_DATA.interact）；逐张开关（dc-off-interact-*）与互动回复抽取联动，
  // ta-ask.js pickAskCardReply / chat.js chatChooseReply 会读取该开关过滤已关闭话术
  if (!tabsWrap.querySelector('[data-type="interact"]')) {
    const b = document.createElement('button');
    b.className = 'cc-tab';
    b.dataset.type = 'interact';
    b.textContent = '互动回应';
    tabsWrap.appendChild(b);
  }

  tabsWrap.querySelectorAll('.cc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      tabsWrap.querySelectorAll('.cc-tab').forEach(t => t.classList.remove('sel'));
      tab.classList.add('sel');
      cur = tab.dataset.type;
      q = '';
      curGroup = '';
      renderGroupsBar2();
      render();
    });
  });

  // 搜索：页内输入框直接过滤（v3.6.x：与自定义聊天字卡一致，不再弹窗，输入即筛，清空即恢复）
  const searchInput = document.getElementById('dc-search-input');
  if (searchInput) {
    // v3.5.138：不再标记 ceDone 跳过 contenteditable 转换——手机 Chrome 对
    // 原生 input 聚焦弹「自动填充」白条；ce-box 兼容 input 转发 + value 代理
    // v3.7.x：150ms 防抖——main 分类 4621 张字卡每敲一个字全量渲染会卡，输入停顿后再筛
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      q = searchInput.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(render, 150);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { searchInput.value = ''; q = ''; render(); searchInput.blur(); }
    });
  }

  // v3.6.x：懒渲染——4621+ 张系统字卡在启动时全部构建 DOM（每个都带开关 toggle），
  // 低端机（尤其 iOS Safari）启动同步构建数百毫秒级 DOM，改为首次打开「系统字卡」
  // 页才构建；聊天抽取（defaultCardCfg）走数据不依赖 DOM，功能不受影响
  let renderedOnce = false;
  function ensureRendered() {
    if (renderedOnce) return;
    renderedOnce = true;
    renderGroupsBar2();
    render();
  }

  // 入口/返回
  const li = document.getElementById('li-default-cards');
  if (li) {
    li.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const page = document.getElementById('page-default-cards');
      if (page) page.hidden = false;
      ensureRendered();
    });
  }
  const back = document.getElementById('dc-back');
  if (back) {
    back.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }

  // ---- 回复混入：供 chat.js 调用 ----
  // 返回当前分类下按权重选中一个分组的字卡数组；未触发返回 []
  window.getDefaultCards = function () {
    // v3.7.x：聊天场景开关——关闭后聊天回复混入/拍一拍均不使用默认字卡
    if (!getUse('chat')) return [];
    const cfg = window.defaultCardCfg();
    if (!cfg.enabled) return [];
    if (Math.random() * 100 >= cfg.overall) return [];
    // 按 probs 加权选分类
    const keys = ['main', 'kaomoji', 'emoji', 'touch'];
    const weights = keys.map(k => Math.max(0, cfg.probs[k] || 0));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return [];
    let roll = Math.random() * total;
    let chosen = 'main';
    for (let i = 0; i < keys.length; i++) {
      roll -= weights[i];
      if (roll < 0) { chosen = keys[i]; break; }
    }
    // v3.6.x：单卡开关过滤——用户关闭的字卡不参与抽取，整组关完则跳过该组
    const grps = (DATA[chosen] || [])
      .map(g => [g[0], g[1].filter(c => !isCardOff(chosen, c))])
      .filter(g => g[1].length);
    if (!grps.length) return [];
    const g = grps[Math.floor(Math.random() * grps.length)];
    const text = g[1][Math.floor(Math.random() * g[1].length)];
    return { text: text, type: chosen === 'touch' ? 'poke' : 'text' };
  };
  // 默认字卡分组（供页面按分组查看）
  window.getDefaultCardGroups = function (cat) {
    return (DATA[cat] || []).slice();
  };
  // v3.7.x：互动回应预设池读取（供互动卡片回复侧使用）——name 分组名（邀请TA·接受/
  // 邀请TA·拒绝/问问TA·回应/小问题·回应/好奇·回应/吐槽·回应/询问·回应），
  // 与「互动回应」tab 展示同源（DEFAULT_CARD_DATA.interact）；数据缺失时回退 fallback
  window.getInteractPool = function (name, fallback) {
    const g = (DATA.interact || []).find(x => x[0] === name);
    const arr = g && Array.isArray(g[1]) && g[1].length ? g[1] : (Array.isArray(fallback) ? fallback : []);
    return arr.slice();
  };
})();
