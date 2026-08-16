// ===== 功能：聊天默认字卡 =====
// 数据来自星言简易版默认通用字卡；可开关；分类浏览（主字卡/颜文字/emoji）；
// 开启后联系人回复按「整体概率 + 分类占比」混入默认字卡
(function () {
  const list = document.getElementById('dc-list');
  const tabsWrap = document.getElementById('dc-tabs');
  const enabledEl = document.getElementById('dc-enabled');
  if (!list || !tabsWrap || !enabledEl) return;

  const uid = 'xy-home-v2';
  const ls = window.xyStore(uid);
  // 默认值（对应星言 defaultCommonOverallProb=30, probs 各30）
  function getEnabled() { const v = ls.get('dc-enabled'); return v === null ? true : v === '1'; }
  function getOverall() { const v = ls.get('dc-overall'); return v === null ? 30 : Number(v); }
  function getProb(k) { const v = ls.get('dc-prob-' + k); return v === null ? 30 : Number(v); }
  window.defaultCardCfg = function () {
    return { enabled: getEnabled(), overall: getOverall(), probs: { main: getProb('main'), kaomoji: getProb('kaomoji'), emoji: getProb('emoji'), touch: getProb('touch') } };
  };

  // 数据（提取自星言 08_default_cards_data.js）
  const DATA = (window.DEFAULT_CARD_DATA) || { main: [], kaomoji: [], emoji: [] };

  // ---- 页面 UI ----
  let cur = 'main';
  let q = '';
  enabledEl.checked = getEnabled();
  enabledEl.addEventListener('change', () => ls.set('dc-enabled', enabledEl.checked ? '1' : '0'));

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
  function render() {
    const grps = DATA[cur] || [];
    let shown = grps;
    if (curGroup) shown = shown.filter(g => g[0] === curGroup);
    if (q) {
      shown = grps.map(([g, arr]) => [g, arr.filter(c => c.indexOf(q) >= 0)]).filter(([g, arr]) => arr.length || g.indexOf(q) >= 0);
    }
    list.innerHTML = '';
    if (!shown.length) {
      list.innerHTML = '<div class="cc-empty">暂无默认字卡</div>';
      return;
    }
    shown.forEach(([gname, arr]) => {
      const h = document.createElement('div');
      h.className = 'cc-group-header';
      h.innerHTML = '<span class="ccg-name">' + gname + '</span><span class="ccg-count">' + arr.length + '</span>';
      list.appendChild(h);
      arr.forEach(c => {
        const d = document.createElement('div');
        d.className = 'cc-item glass';
        // v3.6.x：整页为系统预设字卡，统一标【系统】与自定义字卡区分
        d.innerHTML = '<div class="cc-txt"><div class="t">' + c + ' <span class="tc-known">系统</span></div></div>';
        list.appendChild(d);
      });
    });
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

  const search = document.querySelector('#page-default-cards .card-search');
  if (search) {
    search.addEventListener('click', () => {
      if (window.openModal) {
        window.openModal('搜索默认字卡', q, (v) => {
          q = (v || '').trim();
          render();
        });
      }
    });
  }

  renderGroupsBar2();
  render();

  // 入口/返回
  const li = document.getElementById('li-default-cards');
  if (li) {
    li.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const page = document.getElementById('page-default-cards');
      if (page) page.hidden = false;
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
    const grps = (DATA[chosen] || []).filter(g => g[1].length);
    if (!grps.length) return [];
    const g = grps[Math.floor(Math.random() * grps.length)];
    const text = g[1][Math.floor(Math.random() * g[1].length)];
    return { text: text, type: chosen === 'touch' ? 'poke' : 'text' };
  };
  // 默认字卡分组（供页面按分组查看）
  window.getDefaultCardGroups = function (cat) {
    return (DATA[cat] || []).slice();
  };
})();
