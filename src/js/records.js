// ===== 功能：主页（最近动态：换头像记录 + 通话记录） =====
// 桌面「主页」按钮进入；换头像/通话事件自动写入，完整展示
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  function fmtDT(ts) {
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  // ---- 换头像记录（含事件文案 + 头像缩略图；最多 30 条） ----
  // 记录所有换头像事件：联系人主动换我的头像（直接换 / 邀请同意 / 邀请拒绝）、
  // 我手动换自己的头像等——统一由 chatSystem 写入，text 为聊天系统消息原文
  function avatarsLoad() {
    try { return JSON.parse(store.get('records-avatar') || '[]'); } catch (e) { return []; }
  }
  function avatarsSave(list) { store.set('records-avatar', JSON.stringify(list.slice(0, 30))); }
  window.addAvatarRecord = function (img, text) {
    const list = avatarsLoad();
    list.unshift({ img: img, text: text || '', ts: Date.now() });
    avatarsSave(list);
    if (!document.getElementById('page-home').hidden) render();
  };
  // ---- 通话记录 ----
  function callsLoad() {
    try { return JSON.parse(store.get('records-call') || '[]'); } catch (e) { return []; }
  }
  function callsSave(list) { store.set('records-call', JSON.stringify(list.slice(0, 50))); }
  window.addCallRecord = function (type, text) {
    const list = callsLoad();
    list.unshift({ type: type, text: text, ts: Date.now() });
    callsSave(list);
    if (!document.getElementById('page-home').hidden) render();
  };
  // ---- 渲染主页记录 ----
  function histList(key) { try { return JSON.parse(store.get(key) || '[]'); } catch (e) { return []; } }
  let htab = 'quotes';
  // 每日摸鱼值记录
  window.renderFishHistory = function () {
    const el = document.getElementById('home-fish');
    if (!el) return;
    const h = (window.getFishHistory && window.getFishHistory()) || [];
    const name = store.get('lbl-partner') || 'TA';
    const myName = store.get('lbl-user') || '我';
    // 顶部历史累计（我的 + 联系人）
    const tot = (window.getFishTotals && window.getFishTotals()) || { mine: 0, ta: 0 };
    const totalHtml =
      '<div class="fish-total">' +
        '<span class="ft-item"><b>' + myName + '</b> 累计 ' + (tot.mine || 0) + '</span>' +
        '<span class="ft-item"><b>' + name + '</b> 累计 ' + (tot.ta || 0) + '</span>' +
      '</div>';
    el.innerHTML = totalHtml + (h.length
      ? h.map(x => '<div class="tc-listitem"><div class="tc-li-top"><span class="tc-li-q">' + x.date + '</span></div>' +
          '<div class="tc-li-line">' + myName + ' 当天摸鱼：+' + (x.mine || 0) + '</div>' +
          '<div class="tc-li-line">' + name + ' 当天摸鱼：+' + (x.ta || 0) + '</div></div>').join('')
      : '<div class="ta-empty">暂无摸鱼值记录</div>');
  };
  // 每日打工值记录（v3.5.65：与每日摸鱼值同款——顶部累计 + 每日新增）
  window.renderWorkHistory = function () {
    const el = document.getElementById('home-work');
    if (!el) return;
    const h = (window.getWorkHistory && window.getWorkHistory()) || [];
    const name = store.get('lbl-partner') || 'TA';
    const myName = store.get('lbl-user') || '我';
    const tot = (window.getWorkTotals && window.getWorkTotals()) || { mine: 0, ta: 0 };
    const totalHtml =
      '<div class="fish-total">' +
        '<span class="ft-item"><b>' + myName + '</b> 累计 ' + (tot.mine || 0) + '</span>' +
        '<span class="ft-item"><b>' + name + '</b> 累计 ' + (tot.ta || 0) + '</span>' +
      '</div>';
    el.innerHTML = totalHtml + (h.length
      ? h.map(x => '<div class="tc-listitem"><div class="tc-li-top"><span class="tc-li-q">' + x.date + '</span></div>' +
          '<div class="tc-li-line">' + myName + ' 当天打工：+' + (x.mine || 0) + '</div>' +
          '<div class="tc-li-line">' + name + ' 当天打工：+' + (x.ta || 0) + '</div></div>').join('')
      : '<div class="ta-empty">暂无打工值记录</div>');
  };
  function render() {
    // 只渲染当前 tab 面板（避免隐藏面板无谓渲染）
    const showOnly = htab;
    // 每日打工值记录
    if (showOnly === 'work') {
      window.renderWorkHistory();
    }
    // 每日摸鱼值记录
    if (showOnly === 'fish') {
      window.renderFishHistory();
    }
    // 联系人今日情话记录
    if (showOnly === 'quotes') {
      const qEl = document.getElementById('home-quotes');
      if (qEl) {
        const list = histList('quote-history');
        qEl.innerHTML = list.length
          ? list.map(x => '<div class="tc-listitem"><div class="tc-li-q">' + String(x.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div><div class="tc-li-time">' + x.date + '</div></div>').join('')
          : '<div class="ta-empty">暂无情话记录</div>';
      }
    }
    // 我的今日备忘记录
    if (showOnly === 'memos') {
      const mEl = document.getElementById('home-memos');
      if (mEl) {
        const list = histList('memo-history');
        mEl.innerHTML = list.length
          ? list.map(x => '<div class="tc-listitem"><div class="tc-li-q">' + String(x.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div><div class="tc-li-time">' + fmtDT(x.ts) + '</div></div>').join('')
          : '<div class="ta-empty">暂无备忘记录</div>';
      }
    }
    // 我的今天的心情记录
    if (showOnly === 'moods') {
      const wEl = document.getElementById('home-moods');
      if (wEl) {
        const list = histList('mood-history');
        wEl.innerHTML = list.length
          ? list.map(x => '<div class="tc-listitem"><div class="tc-li-q">' + String(x.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div><div class="tc-li-time">' + fmtDT(x.ts) + '</div></div>').join('')
          : '<div class="ta-empty">暂无心情记录</div>';
      }
    }
    // 换头像记录（全部事件：直接换 / 邀请同意 / 邀请拒绝 / 我手动更换）
    if (showOnly === 'av') {
      const avEl = document.getElementById('home-av');
      if (avEl) {
        const list = avatarsLoad();
        const name = store.get('lbl-partner') || 'TA';
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        avEl.innerHTML = list.length
          ? list.map(x =>
              '<div class="tc-listitem"><div class="tc-li-top"><span class="tc-li-q">' + esc(x.text || (name + ' 更换了头像')) + '</span><span class="tc-li-time">' + fmtDT(x.ts) + '</span></div>' +
              (x.img ? '<img class="rec-av-img" src="' + x.img + '" alt="头像">' : '') +
              '</div>'
            ).join('')
          : '<div class="ta-empty">暂无换头像记录</div>';
      }
    }
    // 通话记录
    if (showOnly === 'call') {
      const callEl = document.getElementById('home-call');
      if (callEl) {
        const list = callsLoad();
        const name = store.get('lbl-partner') || 'TA';
        callEl.innerHTML = list.length
          ? list.map(x =>
              '<div class="tc-listitem"><div class="tc-li-top"><span class="tc-li-q">' +
              (x.type === 'in' ? '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>' + name + ' 来电' : '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/><path d="M16 3v6M19 6h-6"/></svg>' + name + ' 拨打') +
              '</span><span class="tc-li-time">' + fmtDT(x.ts) + '</span></div>' +
              (x.text ? '<div class="tc-li-line">' + x.text + '</div>' : '') +
              '</div>'
            ).join('')
          : '<div class="ta-empty">暂无通话记录</div>';
      }
    }
  }
  // 主页顶部 tab 切换
  document.querySelectorAll('#page-home .fav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      htab = tab.dataset.htab;
      document.querySelectorAll('#page-home .fav-tab').forEach(x => x.classList.toggle('sel', x === tab));
      document.querySelectorAll('#page-home .cal-card').forEach(c => { c.hidden = c.dataset.hpanel !== htab; });
      render();
    });
  });
  // v3.5.113：IndexedDB 回填完成后重绘主页当前面板（导入/配额异常恢复后的数据）
  try {
    document.addEventListener('mochi-restore-done', function () {
      try {
        if (!document.getElementById('page-home').hidden) render();
      } catch (e) {}
    });
  } catch (e) {}
  // 入口：桌面「主页」按钮
  const homeApp = document.querySelector('.app[data-app="home"]');
  const homePage = document.getElementById('page-home');
  if (homeApp && homePage) {
    homeApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      render();
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      homePage.hidden = false;
    });
  }
  const homeBack = document.getElementById('home-back');
  if (homeBack) {
    homeBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const phone = document.getElementById('page-phone');
      if (phone) phone.hidden = false;
    });
  }
  render();

  // v3.5.94：换头像记录含图片，可能只存在 IndexedDB → 启动补读（主页打开时才渲染，届时读到）
  try {
    if (window.idbGet) {
      const myPrefix = window.activePrefix();
      window.idbGet(myPrefix + ':records-avatar').then(v => {
        if (window.activePrefix() !== myPrefix) return;
        if (v && typeof v === 'string' && v.length > 2) store.set('records-avatar', v);
      });
    }
  } catch (e) {}

  // 联系人主动来电已由 call.js 统一管理（弹窗/接听/小框/概率），此处仅保留记录存储

  // v3.6.x：多桌面——切换联系人后若记录页可见则重渲染（读新桌面数据）
  document.addEventListener('contact-switched', function () {
    try {
      const hp = document.getElementById('page-home');
      if (hp && !hp.hidden) render();
    } catch (e) {}
  });
})();
