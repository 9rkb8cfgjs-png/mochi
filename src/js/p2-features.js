// ===== 功能：聊天统计页 / 小互动页 / 今日备忘·心情 =====
// 音乐：音乐库、播放列表、播放历史
// 聊天统计：相处天数、消息数、表情包/拍一拍/情绪统计
// 小互动：拍一拍 TA / 送一句情话
// v3.5.27：今日备忘/今天的心情历史双写 IndexedDB——导入备份覆盖 localStorage 后记录可从 IDB 回填
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  // 备忘/心情历史：localStorage + IndexedDB 双写；启动时从 IDB 回填缺失键（导入/清空后不丢记录）
  function pushHist(key, text) {
    try {
      const list = JSON.parse(store.get(key) || '[]');
      list.unshift({ text: text, ts: Date.now() });
      if (list.length > 200) list.length = 200;
      store.set(key, JSON.stringify(list));
      try { if (window.idbSet) window.idbSet(window.activePrefix() + ':' + key, JSON.stringify(list)); } catch (e) {}
    } catch (e) {}
  }
  function restoreHist(key) {
    try {
      if (window.idbGet && !store.get(key)) {
        window.idbGet(window.activePrefix() + ':' + key).then(v => {
          if (!v) return;
          try { store.set(key, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {}
        });
      }
    } catch (e) {}
  }
  restoreHist('memo-history');
  restoreHist('mood-history');
  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  // 轻提示（全局唯一，与其它模块一致）
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

  // ================= 聊天统计页 =================
  const statsApp = document.querySelector('.app[data-app="stats"]');
  const statsPage = document.getElementById('page-stats');
  if (statsApp && statsPage) {
    statsApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      statsPage.hidden = false;
      renderStats();
    });
  }
  const statsBack = document.getElementById('stats-back');
  if (statsBack) {
    statsBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-phone');
      if (home) home.hidden = false;
    });
  }
  // ================= 聊天统计（完整版：相处记录 / 聊天记录 / 情绪表达） =================
  function statsInfoCard(icon, label, value) {
    return '<div class="stats-row"><span class="stats-label">' + icon + ' ' + label + '</span><span class="stats-num" style="font-size:15px">' + value + '</span></div>';
  }
  function fmtDTFull(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function calcStreak(dateSet) {
    const dates = Array.from(dateSet).sort();
    if (!dates.length) return 0;
    let max = 1, cur = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 864e5;
      if (diff === 1) { cur++; max = Math.max(max, cur); } else cur = 1;
    }
    return max;
  }
  function statsBarSection(icon, title, countMap, topLabel, emptyText) {
    const entries = [];
    for (const k in countMap) if (countMap.hasOwnProperty(k)) entries.push({ name: k, count: countMap[k] });
    entries.sort((a, b) => b.count - a.count);
    let html = '<div class="stats-sec">' +
      '<div class="stats-sec-head"><span class="stats-sec-title">' + icon + title + '</span>' +
      '<span class="stats-sec-count">' + entries.length + ' 种</span></div>';
    if (!entries.length) {
      html += '<div class="ta-empty">' + emptyText + '</div>';
    } else {
      const top = entries[0].name;
      const topCount = entries[0].count;
      html += '<div class="stats-top">' +
        '<div class="stats-top-tag">' + topLabel + '</div>' +
        '<div class="stats-top-name">「' + String(top).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '」</div>' +
        '<div class="stats-top-num">' + topCount + ' 次</div></div>';
      html += '<div class="stats-list">';
      entries.slice(0, 5).forEach(e => {
        html += '<div class="stats-item">' +
          '<span class="stats-item-name">' + String(e.name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</span>' +
          '<span class="stats-item-num">' + e.count + '</span></div>';
      });
      html += '</div>';
    }
    return html + '</div>';
  }
  function renderStats() {
    let msgs = [];
    try { msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]')); } catch (e) {}
    const real = msgs.filter(m => m && m.side && m.text);
    const firstTs = real.length ? (real[0].ts || Date.now()) : 0;
    const lastTs = real.length ? (real[real.length - 1].ts || firstTs) : 0;
    // v3.5.81：相处天数 = 恋爱纪念日（love-start）起算；未设置则用第一条聊天记录时间；
    //   聊天记录被清空/新装时不再显示 0（用纪念日兜底）
    let daysStart = firstTs;
    try {
      const loveStart = store.get('love-start');
      if (loveStart) {
        const ls = new Date(loveStart + 'T00:00:00').getTime();
        if (!isNaN(ls)) daysStart = ls;
      }
    } catch (e) {}
    const days = daysStart ? Math.max(0, Math.floor((Date.now() - daysStart) / 864e5)) : 0;
    // ---- 相处记录 ----
    const recordEl = document.getElementById('st-record-cards');
    if (recordEl) {
      let mine = 0, ta = 0, textChars = 0;
      real.forEach(m => {
        if (m.side === 'out') mine++; else ta++;
        if (typeof m.text === 'string' && m.text.indexOf('data:') !== 0) textChars += m.text.length;
      });
      let favsCount = 0;
      try { favsCount = (JSON.parse(store.get('fav-msgs') || '[]') || []).length; } catch (e) {}
      recordEl.innerHTML =
        statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>', '第一次聊天', fmtDTFull(firstTs) || '暂无记录') +
        statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/></svg>', '最近聊天', fmtDTFull(lastTs) || '暂无记录') +
        statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>', '聊天消息', (mine + ta) + ' 条') +
        statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13l2 2 4-4"/></svg>', '文字数量', textChars + ' 字') +
        statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 5 5.6.8-4 4 .9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-4 5.6-.8z"/></svg>', '收藏记录', favsCount + ' 条');
    }
    // ---- 聊天记录 ----
    const chatEl = document.getElementById('st-chat-content');
    if (chatEl) {
      if (!real.length) { chatEl.innerHTML = '<div class="ta-empty">暂无聊天记录</div>'; }
      else {
        let userCount = 0, taCount = 0;
        const hourCount = {}, dayCount = {}, dateCount = {};
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        real.forEach(m => {
          if (m.side === 'out') userCount++; else taCount++;
          const t = new Date(m.ts || Date.now());
          hourCount[t.getHours()] = (hourCount[t.getHours()] || 0) + 1;
          dayCount[t.getDay()] = (dayCount[t.getDay()] || 0) + 1;
          const ds = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
          dateCount[ds] = (dateCount[ds] || 0) + 1;
        });
        const total = userCount + taCount;
        const userPct = total ? Math.round(userCount / total * 100) : 0;
        const taPct = total ? Math.round(taCount / total * 100) : 0;
        let peakHour = 0, peakHourVal = 0;
        for (const h in hourCount) if (hourCount[h] > peakHourVal) { peakHourVal = hourCount[h]; peakHour = Number(h); }
        let peakDay = 0, peakDayVal = 0;
        for (const d in dayCount) if (dayCount[d] > peakDayVal) { peakDayVal = dayCount[d]; peakDay = Number(d); }
        const totalDays = Math.max(1, Math.floor((Date.now() - firstTs) / 864e5));
        let maxSingle = 0;
        for (const d in dateCount) maxSingle = Math.max(maxSingle, dateCount[d]);
        const name = store.get('lbl-partner') || 'TA';
        chatEl.innerHTML =
          '<div style="margin-bottom:16px"><div style="font-size:13px;font-weight:700;color:#555;margin-bottom:8px">消息比例</div>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div style="font-size:12px;color:var(--muted);width:28px">我</div>' +
          '<div style="flex:1;height:8px;background:rgba(0,0,0,.06);border-radius:4px;overflow:hidden"><div style="height:100%;background:var(--ink);width:' + userPct + '%;border-radius:4px"></div></div>' +
          '<div style="font-size:12px;color:var(--ink);width:76px;text-align:right">' + userCount + ' 条 ' + userPct + '%</div></div>' +
          '<div style="display:flex;align-items:center;gap:8px"><div style="font-size:12px;color:var(--muted);width:28px">' + name + '</div>' +
          '<div style="flex:1;height:8px;background:rgba(0,0,0,.06);border-radius:4px;overflow:hidden"><div style="height:100%;background:#999;width:' + taPct + '%;border-radius:4px"></div></div>' +
          '<div style="font-size:12px;color:var(--ink);width:76px;text-align:right">' + taCount + ' 条 ' + taPct + '%</div></div></div>' +
          statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>', '最常聊天时间', peakHour + ':00 - ' + ((peakHour + 1) % 24) + ':00') +
          statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>', '最常聊天日期', '星期' + dayNames[peakDay]) +
          statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="20" x2="6" y2="14"/><line x1="12" y1="20" x2="12" y2="8"/><line x1="18" y1="20" x2="18" y2="11"/></svg>', '平均每日消息', Math.round(total / totalDays) + ' 条') +
          statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3-3 4-3 7a3 3 0 006 0c0-1-.3-2-.8-3 1.8 1 3 3 3 5a6 6 0 11-12 0c0-4 3-6 4.5-8.5z"/></svg>', '最长连续聊天', calcStreak(Object.keys(dateCount)) + ' 天') +
          statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>', '单日最高消息', maxSingle + ' 条');
      }
    }
    // ---- 情绪表达 ----
    const exprEl = document.getElementById('st-expr-content');
    if (exprEl) {
      if (!real.length) { exprEl.innerHTML = '<div class="ta-empty">暂无聊天记录</div>'; }
      else {
        const textCount = {}, emotion = {}, heart = {}, intent = {};
        real.forEach(m => {
          if (typeof m.text === 'string' && m.text.indexOf('data:') !== 0 && !m.special && !m.retracted) {
            textCount[m.text] = (textCount[m.text] || 0) + 1;
          }
          (m.mood || []).forEach(md => {
            // v3.6.x：脏数据防御——mood 条目非对象（导入/损坏数据）时跳过，避免统计页中断
            if (!md || typeof md !== 'object') return;
            if (md.tag === '交流意图') intent[md.label] = (intent[md.label] || 0) + 1;
            else if (md.tag === '心意') heart[md.label] = (heart[md.label] || 0) + 1;
            else emotion[md.label] = (emotion[md.label] || 0) + 1;
          });
        });
        exprEl.innerHTML =
          statsBarSection('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>', '文字字卡', textCount, '常用文字', '暂无使用记录') +
          statsBarSection('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9.5l.01.01M15 9.5l.01.01"/></svg>', '情绪字卡', emotion, '常见情绪', '暂无使用记录') +
          statsBarSection('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0112 7.1a4.9 4.9 0 017.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/><path d="M19 3.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z"/></svg>', '心意字卡', heart, '常传递心意', '暂无使用记录') +
          statsBarSection('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 01-12.6 7.4L4 21l1.5-4.4A8.5 8.5 0 1121 12z"/><path d="M8.5 10h7M8.5 13h4.5"/></svg>', '交流意图', intent, '常用交流', '暂无使用记录');
      }
    }
    const daysEl = document.getElementById('st-days');
    if (daysEl) daysEl.textContent = days;
  }
  // 统计 tab 切换
  document.querySelectorAll('#page-stats .fav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#page-stats .fav-tab').forEach(x => x.classList.toggle('sel', x === tab));
      const k = tab.dataset.stab;
      document.querySelectorAll('#page-stats .cal-card').forEach(c => {
        c.hidden = c.dataset.stpanel !== k;
      });
    });
  });

  // ================= 提问记录页（原小互动页） =================
  const interactApp = document.querySelector('.app[data-app="interact"]');
  const interactPage = document.getElementById('page-interact');
  if (interactApp && interactPage) {
    interactApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      if (window.renderAskRecords) window.renderAskRecords();
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      interactPage.hidden = false;
    });
  }
  const interactBack = document.getElementById('interact-back');
  if (interactBack) {
    interactBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-phone');
      if (home) home.hidden = false;
    });
  }

// ================= 查岗（TA 的日常）=================
const DEF_PLACES = ['在家', '在公司', '在咖啡店', '在公园', '在图书馆', '在路上', '在朋友家', '在健身房', '在超市', '在电影院'];
const DEF_ACTIONS = ['刷手机', '看书', '发呆', '听歌', '写东西', '吃零食', '喝奶茶', '散步', '玩游戏', '想你'];
const DEF_CHECK_MSGS = ['想你了', '记得按时吃饭', '今天也很喜欢你', '早点休息', '有空给我回消息', '别太累'];
// 查岗日常字卡（可自定义，localStorage 持久化；空则用默认）
// v3.6.x：是否使用系统预设字卡（默认开启；关闭后查岗只从用户添加的字卡里抽）
const CK_DEF_KEY = 'checkin-cards-default';
function getCkDefault() {
  const v = store.get(CK_DEF_KEY);
  return v === null ? true : v === '1';
}
function ckList(k, def) {
  try {
    const v = JSON.parse(store.get('checkin-cards-' + k) || 'null');
    if (Array.isArray(v) && v.length) return v;
  } catch (e) {}
  return def.slice();
}
function ckSaveList(k, list) { store.set('checkin-cards-' + k, JSON.stringify(list)); }
// v3.6.x：查岗系统预设字卡单卡开关——逐张开启/关闭（关闭后查岗不再抽取该条）
function isCkCardOff(k, x) { return store.get('ck-off-' + k + ':' + x) === '1'; }
function setCkCardOff(k, x, off) { store.set('ck-off-' + k + ':' + x, off ? '1' : '0'); }
function genCheckin() {
  const useDefault = getCkDefault();
  const places = ckList('place', DEF_PLACES);
  const actions = ckList('action', DEF_ACTIONS);
  const msgs = ckList('msg', DEF_CHECK_MSGS);
  const out = {};
  // 关闭「使用系统预设」时：只从用户添加的字卡里抽；某分类没有用户自定义则跳过该字段
  // v3.6.x：单卡开关过滤——用户关闭的字卡（ck-off-*）不参与抽取
  let place = useDefault ? places.filter(p => !isCkCardOff('place', p)) : places.filter(p => DEF_PLACES.indexOf(p) < 0 && !isCkCardOff('place', p));
  let action = useDefault ? actions.filter(a => !isCkCardOff('action', a)) : actions.filter(a => DEF_ACTIONS.indexOf(a) < 0 && !isCkCardOff('action', a));
  let msg = useDefault ? msgs.filter(m => !isCkCardOff('msg', m)) : msgs.filter(m => DEF_CHECK_MSGS.indexOf(m) < 0 && !isCkCardOff('msg', m));
  // 兜底：关闭预设且完全没有用户自定义时回退使用系统预设（避免查岗空白/undefined）
  if (!place.length && !action.length && !msg.length) {
    place = places; action = actions; msg = msgs;
  }
  if (place.length) out.place = place[Math.floor(Math.random() * place.length)];
  if (action.length) out.action = action[Math.floor(Math.random() * action.length)];
  if (msg.length) out.msg = msg[Math.floor(Math.random() * msg.length)];
  return out;
}
function renderCheckinHistory() {
  const histEl = document.getElementById('ck-history');
    if (!histEl) return;
    try {
      let h = [];
      try { h = JSON.parse(store.get('checkin-history') || '[]'); } catch (e) { h = []; }
      // 过滤无有效内容的记录（不渲染 "-- · -- · --" 占位），只显示实际存在的字段
      const valid = (Array.isArray(h) ? h : []).filter(x => x && (x.place || x.action));
      histEl.innerHTML = valid.length
        ? valid.slice().reverse().map(x => {
            const parts = [x.t, x.place, x.action].filter(Boolean);
            return '<div class="ck-location"><div class="ck-value" style="font-size:13px">' + parts.join(' · ') + '</div><div class="ck-label">' + (x.msg || '') + '</div></div>';
          }).join('')
        : '<div class="div-result-empty">暂无查岗记录</div>';
    } catch (e) {}
  }
  // 初始化：从 IndexedDB 恢复全部查岗记录
  (function () {
    if (window.idbGet) {
      window.idbGet(window.activePrefix() + ':checkin-history').then(v => {
        if (!v) return;
        try {
          const data = typeof v === 'string' ? JSON.parse(v) : v;
          if (Array.isArray(data) && data.length && !store.get('checkin-history')) {
            store.set('checkin-history', JSON.stringify(data));
          }
        } catch (e) {}
      });
    }
  })();
  const checkinApp = document.querySelector('.app[data-app="checkin"]');
  const checkinPage = document.getElementById('page-checkin');
  // ---- 星言顶部栏字卡/随机换头像同款刷新机制 ----
  // 上次/下次更新时间戳持久化：首次启动立即生成一条，之后每 1-8 小时更新一次；
  // 每 60 秒轮询检查，刷新页面周期不重置
  function ckLast() { const v = parseInt(store.get('checkin-last'), 10); return isNaN(v) ? 0 : v; }
  function ckNext() { const v = parseFloat(store.get('checkin-next')); return isNaN(v) ? 0 : v; }
  function renderCheckinUI(ck) {
    const place = document.getElementById('ck-place');
    const action = document.getElementById('ck-action');
    const msg = document.getElementById('ck-msg');
    const status = document.getElementById('ck-status');
    const name = store.get('lbl-partner') || 'TA';
    // v3.6.x：关闭系统预设且某分类无自定义字卡时该字段为空——显示空串而非字面量 "undefined"
    if (place) place.textContent = ck.place || '';
    if (action) action.textContent = ck.action || '';
    if (msg) msg.textContent = ck.msg || '';
    if (status) status.textContent = name + ' 的日常';
  }
  function recordCheckin(ck) {
    // v3.6.x：undefined 字段不写入记录（JSON.stringify 自动丢弃 undefined 键）
    const entry = { t: fmtTime(Date.now()), place: ck.place, action: ck.action, msg: ck.msg, ts: Date.now() };
    try {
      const h = JSON.parse(store.get('checkin-history') || '[]');
      h.push(entry);
      store.set('checkin-history', JSON.stringify(h));
      if (window.idbSet) window.idbSet(window.activePrefix() + ':checkin-history', JSON.stringify(h));
    } catch (e) {}
    renderCheckinHistory();
  }
  // 生成新日常：渲染 + 推聊天消息（更新提示 + 概率提醒）+ 记录 + 重置计时
  function doCheckin() {
    const ck = genCheckin();
    store.set('checkin-current', JSON.stringify(ck));
    renderCheckinUI(ck);
    const name = store.get('lbl-partner') || 'TA';
    // 日常更新显示在聊天消息里（普通气泡消息，持久化）
    // v3.6.x：只拼接存在的字段，避免 "在咖啡店 · undefined" 写进聊天记录
    if (window.chatAddIn) {
      const line = [ck.place, ck.action, ck.msg].filter(Boolean).join(' · ');
      if (line) window.chatAddIn(line);
    }
    // 更新提示系统消息 + 概率触发「提醒你来查岗」
    if (window.chatAddSystem) {
      window.chatAddSystem(name + ' 更新了一条日常');
      if (Math.random() * 100 < 30) {
        window.chatAddIn(name + ' 提醒你快来查岗');
      }
    }
    recordCheckin(ck);
    store.set('checkin-last', String(Date.now()));
    store.set('checkin-next', String(1 + Math.random() * 7));
    // 同步聊天里打开的查岗半框
    const p = document.getElementById('ck-p-place');
    const a = document.getElementById('ck-p-action');
    const m = document.getElementById('ck-p-msg');
    if (p) p.textContent = ck.place || '';
    if (a) a.textContent = ck.action || '';
    if (m) m.textContent = ck.msg || '';
  }
  // 供聊天页「点联系人头像打开查岗半框」使用
  window.openCkPanel = function () {
    // 关闭其他底部半框（拍一拍/表情包/头像互动）
    const pc = document.getElementById('poke-card');
    if (pc) pc.hidden = true;
    const ep = document.getElementById('emoji-panel');
    if (ep) ep.hidden = true;
    if (window.closeAvlib) window.closeAvlib();
    const panel = document.getElementById('ck-panel');
    const nameEl = document.getElementById('ck-panel-name');
    const name = store.get('lbl-partner') || 'TA';
    if (nameEl) nameEl.textContent = name;
    // 显示当前日常；从未生成过则立即生成一条
    let cur = null;
    try { cur = JSON.parse(store.get('checkin-current') || 'null'); } catch (e) {}
    if (cur && cur.place) {
      const p = document.getElementById('ck-p-place');
      const a = document.getElementById('ck-p-action');
      const m = document.getElementById('ck-p-msg');
      if (p) p.textContent = cur.place || '';
      if (a) a.textContent = cur.action || '';
      if (m) m.textContent = cur.msg || '';
    } else {
      doCheckin();
    }
    // 更新时间：日常更新时记录的时间戳
    const upd = document.getElementById('ck-p-updated');
    if (upd) {
      const last = parseInt(store.get('checkin-last'), 10);
      upd.textContent = last ? '更新于 ' + fmtTime(last) : '';
    }
    if (panel) panel.hidden = false;
  };
  const ckPanelClose = document.getElementById('ck-panel-close');
  if (ckPanelClose) ckPanelClose.addEventListener('click', () => { document.getElementById('ck-panel').hidden = true; });
  // 自动轮询：启动立即 + 每 60 秒检查（首次 last=0 立即生成）
  // v3.5.118：首次检查延迟到 IndexedDB 回填完成后（mochi-restore-done）——
  // 否则启动瞬间 doCheckin→chatAddIn 会在聊天记录权威数据（导入后只在 IDB）
  // 读回前写入新消息，触发 saveMsgs 用 1 条覆盖 IDB 里的全部历史（导入后聊天记录丢失）
  let ckBootDone = false;
  // v3.5.128：回前台冷静期——后台切回时多个模块（发动态/来电/来信/询问/查岗）
  // 会同时判定，错峰 90 秒避免连环弹窗+连发消息
  let ckWakeAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ckWakeAt = Date.now() + 90000;
  });
  function checkAutoCheckin() {
    if (document.hidden) return; // v3.5.127：后台不自动查岗
    if (Date.now() < ckWakeAt) return; // 回前台冷静期
    if (!ckBootDone) return; // 首次：等数据就绪标志
    try {
      const now = Date.now();
      let last = ckLast(), next = ckNext();
      if (last > now || last < 0 || isNaN(last)) { last = 0; next = 0; }
      if ((now - last) / 36e5 < next) return;
      doCheckin();
    } catch (e) {}
  }
  setInterval(checkAutoCheckin, 60000);
  function bootCheckin() {
    // v3.5.129：数据未就绪不启动——3s 兜底在慢设备（分批恢复 >3s）上会
    // 绕过门控提前生成日常，导致导入后首启多出一条"日常更新"且查岗节奏被重置
    if (!window.__mochiDataReady) { setTimeout(bootCheckin, 500); return; }
    ckBootDone = true;
    checkAutoCheckin();
  }
  // 数据就绪（IDB 回填完成）后启动；无事件兜底 3 秒（空数据场景 idbRestore 也会派发）
  document.addEventListener('mochi-restore-done', bootCheckin);
  setTimeout(bootCheckin, 3000);
  if (checkinApp && checkinPage) {
    checkinApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      checkinPage.hidden = false;
      // 显示当前日常；从未生成过则立即生成一条
      let cur = null;
      try { cur = JSON.parse(store.get('checkin-current') || 'null'); } catch (e) {}
      if (cur && cur.place) renderCheckinUI(cur);
      else doCheckin();
      renderCheckinHistory();
    });
  }
  const checkinBack = document.getElementById('checkin-back');
  if (checkinBack) {
    checkinBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-phone');
      if (home) home.hidden = false;
    });
  }
const ckRefresh = document.getElementById('ck-refresh');
if (ckRefresh) {
  // v3.5.132：5 秒最小间隔——连点会在聊天里刷出多条"更新日常"消息
  let ckLastRefresh = 0;
  ckRefresh.addEventListener('click', () => {
    const now = Date.now();
    if (now - ckLastRefresh < 5000) { toast('刷新太频繁，稍后再试'); return; }
    ckLastRefresh = now;
    doCheckin();
  });
}

  // ================= 查岗日常字卡（管理页 + 字卡库入口） =================
  const CK_DEFS = [
    ['place', DEF_PLACES],
    ['action', DEF_ACTIONS],
    ['msg', DEF_CHECK_MSGS]
  ];
  const CK_LABEL = { place: '地点', action: '在做什么', msg: '说的话' };
  let ckTab = 'place';
  // v3.6.x：是否有用户自定义的查岗列表（有则默认项按内容匹配标【系统】；无则整库为系统预设）
  function ckHasCustom(k) {
    try {
      const v = JSON.parse(store.get('checkin-cards-' + k) || 'null');
      return Array.isArray(v) && v.length > 0;
    } catch (e) { return false; }
  }
  function renderCheckinCards() {
    // 顶部分类 tab
    document.querySelectorAll('#page-checkin-cards .fav-tab').forEach(tab => {
      tab.classList.toggle('sel', tab.dataset.cktab === ckTab);
    });
    // v3.6.x：使用系统预设开关状态同步
    const useDefault = getCkDefault();
    const defEl = document.getElementById('ck-default');
    if (defEl) defEl.checked = useDefault;
    const listEl = document.getElementById('cck-list');
    const titleEl = document.getElementById('cck-list-title');
    if (titleEl) titleEl.textContent = CK_LABEL[ckTab] || '';
    if (listEl) {
      const def = { place: DEF_PLACES, action: DEF_ACTIONS, msg: DEF_CHECK_MSGS }[ckTab];
      const list = ckList(ckTab, def);
      const custom = ckHasCustom(ckTab);
      listEl.innerHTML = '';
      if (!list.length) { listEl.innerHTML = '<div class="ta-empty">暂无，可添加</div>'; }
      else {
        list.forEach((x, i) => {
          // 系统预设 = 无自定义（整库默认）或内容匹配默认项；系统项不可删除
          const sys = !custom || def.indexOf(x) >= 0;
          const off = isCkCardOff(ckTab, x) || (sys && !useDefault);
          const row = document.createElement('div');
          row.className = 'tc-qrow' + (off ? ' off' : '');
          row.innerHTML = '<div class="tc-qmain"><div class="tc-qtext">' + String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + (sys ? ' <span class="tc-known">系统</span>' : '') + '</div></div>';
          if (sys) {
            // v3.6.x：系统预设单卡开关——逐张开启/关闭（关闭后查岗不再抽取）
            const lab = document.createElement('label');
            lab.className = 'toggle ccard-toggle';
            lab.innerHTML = '<input type="checkbox"' + (off ? '' : ' checked') + '><span class="tk"></span>';
            lab.querySelector('input').addEventListener('change', () => {
              const nowOff = !lab.querySelector('input').checked;
              setCkCardOff(ckTab, x, nowOff);
              renderCheckinCards();
              const s = String(x == null ? '' : x);
              toast((nowOff ? '已关闭：' : '已开启：') + (s.length > 18 ? s.slice(0, 18) + '…' : s));
            });
            row.appendChild(lab);
          } else {
            const del = document.createElement('button');
            del.className = 'ta-del';
            del.textContent = '✕';
            del.addEventListener('click', () => {
              const l = ckList(ckTab, def);
              l.splice(i, 1);
              ckSaveList(ckTab, l);
              renderCheckinCards();
            });
            row.appendChild(del);
          }
          listEl.appendChild(row);
        });
      }
    }
    // 数字
    const total = CK_DEFS.reduce((s, [k, def]) => s + ckList(k, def).length, 0);
    const cnt = document.getElementById('cc-checkin-count');
    if (cnt) cnt.textContent = total;
  }
  // v3.6.x：使用系统预设字卡开关（默认开启；关闭后查岗只从用户添加的字卡里抽）
  const ckDefaultEl = document.getElementById('ck-default');
  if (ckDefaultEl) {
    ckDefaultEl.addEventListener('change', () => {
      store.set(CK_DEF_KEY, ckDefaultEl.checked ? '1' : '0');
      renderCheckinCards();
      toast(ckDefaultEl.checked ? '系统预设字卡已开启' : '系统预设字卡已关闭（仅用你添加的字卡）');
    });
  }
  // 分类 tab 切换
  document.querySelectorAll('#page-checkin-cards .fav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      ckTab = tab.dataset.cktab;
      renderCheckinCards();
    });
  });
  // 批量输入：每行一个，添加到当前分类
  const batchAdd = document.getElementById('cck-batch-add');
  if (batchAdd) {
    batchAdd.addEventListener('click', () => {
      const ta = document.getElementById('cck-batch');
      const raw = ta ? ta.value : '';
      const items = raw.split('\n').map(s => s.trim()).filter(Boolean);
      if (!items.length) { toast('请输入内容，每行一个'); return; }
      const def = { place: DEF_PLACES, action: DEF_ACTIONS, msg: DEF_CHECK_MSGS }[ckTab];
      const list = ckList(ckTab, def);
      items.forEach(it => list.push(it));
      ckSaveList(ckTab, list);
      if (ta) ta.value = '';
      renderCheckinCards();
      toast('已添加 ' + items.length + ' 条到「' + (CK_LABEL[ckTab] || ckTab) + '」');
    });
  }
  // 入口：字卡库「查岗日常字卡」→ 管理页
  const liCK = document.getElementById('li-checkin-cards');
  const ckCardsPage = document.getElementById('page-checkin-cards');
  if (liCK && ckCardsPage) {
    liCK.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      ckCardsPage.hidden = false;
      renderCheckinCards();
    });
  }
  const ckCardsBack = document.getElementById('checkin-cards-back');
  if (ckCardsBack) {
    ckCardsBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }
  renderCheckinCards();

  // ================= 桌面第二页补充：今日备忘 / 今天的心情 / 本周日常 =================
  // 备忘/心情保存时写入历史（主页展示全部记录）
  const memoEl = document.getElementById('memo-text');
  if (memoEl) {
    const saved = store.get('memo');
    if (saved) memoEl.textContent = saved;
    memoEl.addEventListener('click', () => {
      if (window.openModal) {
        window.openModal('今日备忘', memoEl.textContent === '点这里记一句话' ? '' : memoEl.textContent, (v) => {
          const val = (v || '').trim();
          if (val) {
            memoEl.textContent = val; store.set('memo', val); pushHist('memo-history', val);
            try { if (window.idbSet) window.idbSet(window.activePrefix() + ':memo', val); } catch (e) {}
          }
        });
      }
    });
  }
  const moodEl = document.getElementById('today-mood-text');
  if (moodEl) {
    const saved = store.get('today-mood');
    if (saved) moodEl.textContent = saved;
    moodEl.addEventListener('click', () => {
      if (window.openModal) {
        const moods = ['开心', '平静', '想你', '忙碌', '困', '充实', '温柔'];
        window.openModal('今天的心情', '', (v) => {
          const val = (v || '').trim();
          if (val) {
            moodEl.textContent = val; store.set('today-mood', val); pushHist('mood-history', val);
            try { if (window.idbSet) window.idbSet(window.activePrefix() + ':today-mood', val); } catch (e) {}
          }
        }, { pills: moods.map(m => ({ label: m, value: m })), pill: store.get('today-mood') || '' });
      }
    });
  }
  const weekEl = document.getElementById('week-days');
  if (weekEl) {
    // v3.5.37：统一布局——第一行周（日一二三四五六，今天显示「今」），第二行本周对应日期数字
    const names = ['日', '一', '二', '三', '四', '五', '六'];
    const now = new Date();
    const todayIdx = now.getDay();
    // 本周起始 = 本周日（getDay() 0 即周日，周一~周六往前推）
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - todayIdx);
    weekEl.innerHTML = names.map((n, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return '<div class="week-day' + (i === todayIdx ? ' today' : '') + '"><b>' + (i === todayIdx ? '今' : n) + '</b>' + d.getDate() + '</div>';
    }).join('');
  }

  // v3.6.x：多桌面——切换联系人后刷新桌面第二页常驻组件（备忘/心情按新桌面的值回显）。
  // store 动态绑定当前联系人，直接重读即可。
  document.addEventListener('contact-switched', function () {
    try {
      const memoEl2 = document.getElementById('memo-text');
      if (memoEl2) {
        const v = store.get('memo');
        memoEl2.textContent = v || '点这里记一句话';
      }
      const moodEl2 = document.getElementById('today-mood-text');
      if (moodEl2) {
        const v = store.get('today-mood');
        moodEl2.textContent = v || '';
      }
    } catch (e) {}
  });
})();
