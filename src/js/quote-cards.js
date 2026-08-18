// ===== 功能：桌面今日情话（自定义字卡库） =====
// 字卡库入口 → 管理页：批量添加 / 删除 情话字卡
// 桌面「今日情话」每天从库中随机一句（自定义优先，未添加用默认库）
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  const KEY = 'quote-cards';
  // v3.6.x：是否使用系统预设情话（默认开启；关闭后桌面今日情话只从用户添加的情话里抽取）
  const DEF_KEY = 'quote-cards-default';
  function getUseDefault() {
    const v = store.get(DEF_KEY);
    return v === null ? true : v === '1';
  }

  // v3.6.x：单卡开关——系统预设情话可逐句开启/关闭使用（关闭后今日情话不再抽取）
  function isQuoteOff(q) { return store.get('quote-off:' + q) === '1'; }
  function setQuoteOff(q, off) { store.set('quote-off:' + q, off ? '1' : '0'); }

  // 默认情话库（与桌面今日情话一致）
  const DEFAULT_QUOTES = [
    '我偏爱你。', '我只对你这样。', '过来，让我抱一下。', '别走，再陪我一会儿。',
    '你是我的例外。', '今天也很喜欢你。', '你在，我就安心。', '我舍不得你。',
    '我想和你待久一点。', '你是我想留下的人。', '我想把你留在身边。', '你可以一直依赖我。',
    '不用猜，我就是喜欢你。', '你对我很重要。', '来我身边。', '我想一直站在你这边。',
    '你可以多依赖我一点。', '我喜欢你看着我的时候。', '我喜欢你待在我身边。', '你来了，我就不想走了。',
    '再靠近一点。', '让我抱抱你。', '今天也想见你。', '我想陪着你。',
    '我希望你一直在。', '你可以把我当成你的归处。', '我想成为你最先想到的人。', '我想把我的偏爱都给你。',
    '你不用和任何人比较。', '在我这里，你一直是特别的。', '我怎么可能舍得丢下你。', '你回来，我就高兴。',
    '我等你，不是因为没事做。', '我只是想陪你。', '我喜欢你需要我的样子。', '你不用一个人撑着。',
    '累了就来找我。', '不管什么时候，你都可以来找我。', '我想听你多说一会儿。', '我还想和你聊很久。',
    '今天也想把时间留给你。', '我有很多话想告诉你。', '其实我一直都在想你。', '你不在的时候，我会想你。',
    '我喜欢你在我身边的感觉。', '只要是你，久一点也没关系。'
  ];
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }
  // v3.6.x：完整 HTML 转义（只转 < 可被 `&lt;…&gt;` 实体绕过注入）
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  // 自定义情话库（空则用默认）
  // v3.6.x：hasCustom 区分「是否有用户自定义库」——管理页不再把默认 46 句当
  //   可删除条目展示（删除默认句会把它固化进 localStorage，等于把默认库"转正"）
  function hasCustom() {
    try {
      const v = JSON.parse(store.get(KEY) || 'null');
      return Array.isArray(v) && v.length > 0;
    } catch (e) { return false; }
  }
  function getQuotes() {
    try {
      const v = JSON.parse(store.get(KEY) || 'null');
      if (Array.isArray(v) && v.length) return v;
    } catch (e) {}
    return DEFAULT_QUOTES.slice();
  }
  // 供桌面「今日情话」使用：当天固定一条（自定义库优先）
  // v3.6.x：关闭「使用系统预设」后只从用户添加的情话里抽；没有用户自定义则返回空（桌面显示默认兜底文案）
  // v3.6.x：单卡开关过滤——用户关闭的预设句（quote-off:*）不参与抽取
  window.getQuoteOfDay = function () {
    const useDefault = getUseDefault();
    let custom = [];
    try {
      const v = JSON.parse(store.get(KEY) || 'null');
      if (Array.isArray(v) && v.length) custom = v;
    } catch (e) {}
    let quotes = null;
    if (useDefault) quotes = (custom.length ? custom : DEFAULT_QUOTES.filter(q => !isQuoteOff(q))).filter(q => !isQuoteOff(q));
    else quotes = custom.filter(q => !isQuoteOff(q)); // 只用自己的
    if (!quotes.length) return '';
    const d = new Date();
    const today = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    let hash = 0;
    for (let i = 0; i < today.length; i++) hash = (hash * 31 + today.charCodeAt(i)) >>> 0;
    return quotes[hash % quotes.length];
  };
  window.quoteCardCount = function () { return getQuotes().length; };

  // v3.6.x：顶部双分类 tab——系统预设 / 我的添加，数据分开渲染互不干扰
  function isDefaultQuote(q) { return DEFAULT_QUOTES.indexOf(q) >= 0; }
  function getCustom() {
    try {
      const v = JSON.parse(store.get(KEY) || 'null');
      if (Array.isArray(v)) return v;
    } catch (e) {}
    return [];
  }
  // 入口处计数：可用情话总数（系统开启的 + 用户添加的）
  function updateEntryCount() {
    const cnt = document.getElementById('cc-quote-count');
    if (!cnt) return;
    const useDefault = getUseDefault();
    const custom = getCustom();
    let n = custom.length;
    if (useDefault) n += DEFAULT_QUOTES.filter(q => !isQuoteOff(q)).length;
    cnt.textContent = n;
  }
  // 渲染【系统预设】tab：每句带单卡开关，不可删除；关闭总开关时灰化提示
  function renderSysList() {
    const el = document.getElementById('cq-sys-list');
    if (!el) return;
    const useDefault = getUseDefault();
    const defEl = document.getElementById('cq-default');
    if (defEl) defEl.checked = useDefault;
    el.innerHTML = '';
    if (!useDefault) {
      const tip = document.createElement('div');
      tip.className = 'ta-empty';
      tip.textContent = '系统预设情话已关闭（桌面今日情话只从「我的添加」里抽取）。开启上方开关即可恢复使用。';
      el.appendChild(tip);
      return;
    }
    DEFAULT_QUOTES.forEach(q => {
      const off = isQuoteOff(q);
      const row = document.createElement('div');
      row.className = 'tc-qrow' + (off ? ' off' : '');
      row.innerHTML = '<div class="tc-qmain"><div class="tc-qtext">' + esc(q) + ' <span class="tc-known">系统</span></div></div>';
      const lab = document.createElement('label');
      lab.className = 'toggle ccard-toggle';
      lab.innerHTML = '<input type="checkbox"' + (off ? '' : ' checked') + '><span class="tk"></span>';
      lab.querySelector('input').addEventListener('change', () => {
        const nowOff = !lab.querySelector('input').checked;
        setQuoteOff(q, nowOff);
        renderSysList();
        updateEntryCount();
        const s = String(q == null ? '' : q);
        toast((nowOff ? '已关闭：' : '已开启：') + (s.length > 18 ? s.slice(0, 18) + '…' : s));
      });
      row.appendChild(lab);
      el.appendChild(row);
    });
  }
  // 渲染【我的添加】tab：用户自定义情话，每条带删除按钮
  function renderMineList() {
    const el = document.getElementById('cq-mine-list');
    if (!el) return;
    const custom = getCustom();
    el.innerHTML = '';
    if (!custom.length) {
      const empty = document.createElement('div');
      empty.className = 'ta-empty';
      empty.textContent = '暂未添加自定义情话，可在上方批量输入（每行一句）。';
      el.appendChild(empty);
      return;
    }
    custom.forEach((q, i) => {
      const row = document.createElement('div');
      row.className = 'tc-qrow';
      row.innerHTML = '<div class="tc-qmain"><div class="tc-qtext">' + esc(q) + '</div></div>';
      const del = document.createElement('button');
      del.className = 'ta-del';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        const list = getCustom();
        list.splice(i, 1);
        store.set(KEY, JSON.stringify(list));
        renderMineList();
        updateEntryCount();
        toast('已删除');
      });
      row.appendChild(del);
      el.appendChild(row);
    });
  }
  let curTab = 'sys';
  function switchTab(tab) {
    curTab = tab;
    const tabsWrap = document.getElementById('cq-tabs');
    if (tabsWrap) tabsWrap.querySelectorAll('.cc-tab').forEach(t => t.classList.toggle('sel', t.dataset.tab === tab));
    const sysPanel = document.getElementById('cq-sys-panel');
    const minePanel = document.getElementById('cq-mine-panel');
    if (sysPanel) sysPanel.hidden = tab !== 'sys';
    if (minePanel) minePanel.hidden = tab !== 'mine';
    if (tab === 'sys') renderSysList(); else renderMineList();
  }
  // 批量添加（只追加到用户自定义库，不污染系统预设）
  const batchAdd = document.getElementById('cq-batch-add');
  if (batchAdd) {
    batchAdd.addEventListener('click', () => {
      const ta = document.getElementById('cq-batch');
      const raw = ta ? ta.value : '';
      const items = raw.split('\n').map(s => s.trim()).filter(Boolean);
      if (!items.length) { toast('请输入内容，每行一句'); return; }
      const list = getCustom();
      items.forEach(it => list.push(it));
      store.set(KEY, JSON.stringify(list));
      if (ta) ta.value = '';
      renderMineList();
      updateEntryCount();
      toast('已添加 ' + items.length + ' 句今日情话');
    });
  }
  // v3.6.x：使用系统预设情话开关（默认开启；关闭后桌面今日情话只从用户添加的情话里抽）
  const cqDefault = document.getElementById('cq-default');
  if (cqDefault) {
    cqDefault.addEventListener('change', () => {
      store.set(DEF_KEY, cqDefault.checked ? '1' : '0');
      renderSysList();
      updateEntryCount();
      toast(cqDefault.checked ? '系统预设情话已开启' : '系统预设情话已关闭（仅用你添加的情话）');
    });
  }
  // tab 切换
  const tabsWrap = document.getElementById('cq-tabs');
  if (tabsWrap) {
    tabsWrap.querySelectorAll('.cc-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
  }
  // 入口：字卡库页点「桌面今日情话」→ 管理页
  const liQuote = document.getElementById('li-quote-cards');
  const quotePage = document.getElementById('page-quote-cards');
  if (liQuote && quotePage) {
    liQuote.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      quotePage.hidden = false;
      switchTab(curTab);
    });
  }
  const quoteBack = document.getElementById('quote-cards-back');
  if (quoteBack) {
    quoteBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }
  switchTab('sys');
  updateEntryCount();
})();
