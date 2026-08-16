// ===== 功能：TA的询问 =====
// 题库 3 分类（日常/关心/互动），可添加/删除/开关问题；
// 联系人随机触发向你提问（冷却 25 分钟、概率 20%，启动 60 秒后首次检查、每 4 分钟轮询）；
// 聊天里显示"TA想问你一个问题。" + 询问卡片，点击卡片可回答；
// 回答后显示"我的回答" + "收到你的回答。"，并记入历史（最多 50 条）；
// 管理页可"让TA现在问一次"（无视冷却/概率），并可清空问答历史
(function () {
  const uid = 'xy-home-v2';
  const store = window.xyStore(uid);
  const KEY = 'ta-ask';

  // 默认题库（4 分类，与星言一致 + 两个世界）
  const DEFAULT_QUESTIONS = [
    { id: 'q_d1', text: '你吃饭了吗？', cat: 'daily', enabled: true },
    { id: 'q_d2', text: '现在在做什么？', cat: 'daily', enabled: true },
    { id: 'q_d3', text: '今天过得怎么样？', cat: 'daily', enabled: true },
    { id: 'q_d4', text: '现在在哪里呀？', cat: 'daily', enabled: true },
    { id: 'q_d5', text: '今天忙不忙？', cat: 'daily', enabled: true },
    { id: 'q_c1', text: '累不累？', cat: 'care', enabled: true },
    { id: 'q_c2', text: '心情怎么样？', cat: 'care', enabled: true },
    { id: 'q_c3', text: '有没有好好休息？', cat: 'care', enabled: true },
    { id: 'q_c4', text: '今天有没有按时吃饭？', cat: 'care', enabled: true },
    { id: 'q_i1', text: '想和我聊什么？', cat: 'interact', enabled: true },
    { id: 'q_i2', text: '现在想做什么？', cat: 'interact', enabled: true },
    { id: 'q_i3', text: '有没有想我？', cat: 'interact', enabled: true },
    { id: 'q_i4', text: '有什么想跟我说的吗？', cat: 'interact', enabled: true },
    // 普通情侣轻松小问题
    { id: 'q_i5', text: '今天有没有偷偷想我呀？', cat: 'interact', enabled: true },
    { id: 'q_d6', text: '如果我现在就在你旁边，你最想干嘛？', cat: 'daily', enabled: true },
    { id: 'q_i6', text: '我们下次约会做点什么好？', cat: 'interact', enabled: true },
    // 两个世界（梦角设定：不同世界但常伴身边，能感觉到、摸到有体感；字卡沟通）
    { id: 'q_w1', text: '你有感觉到我在你身边的时候吗？', cat: 'world', enabled: true },
    { id: 'q_w2', text: '你摸到我的时候，是什么感觉？', cat: 'world', enabled: true },
    { id: 'q_w3', text: '我发字卡给你的时候，你能感觉到我在想你吗？', cat: 'world', enabled: true },
    { id: 'q_w4', text: '如果有一天你突然看见我了，你最想做什么？', cat: 'world', enabled: true },
    { id: 'q_w5', text: '你希望我陪着你说话，还是安静待在你身边？', cat: 'world', enabled: true },
    { id: 'q_w6', text: '你觉得两个世界的我们，最珍贵的是什么？', cat: 'world', enabled: true }
  ];
  const CATS = [
    ['daily', '日常询问'],
    ['care', '关心询问'],
    ['interact', '互动询问'],
    ['world', '两个世界']
  ];

  // 轻提示
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

  // v3.5.34：自动弹窗概率（0-100）。兼容旧布尔 autoPopup：true→70，false→0
  function askPopupProb(s) {
    if (s && typeof s.popupProb === 'number') return s.popupProb;
    if (s && s.autoPopup === false) return 0;
    return 70;
  }
  // v3.5.117：互动卡片弹窗互斥——TA的询问/小问题/好奇/吐槽各自独立定时触发、
  // 各自用不同弹窗容器（modal/tc/qa），同一时刻多个机制命中时会同时弹多个弹窗叠在一起。
  // 弹窗前检查：已有任一互动弹窗打开则不弹本次（卡片仍进聊天，可手动点开）。
  function cardPopupBusy() {
    return ['modal-mask', 'tc-mask', 'qa-mask'].some(id => {
      const el = document.getElementById(id);
      return el && !el.hidden;
    });
  }

  // ---- 数据读写 ----
  // v3.6.x：题库合并改为「增量 + 持久化」：
  //  ① 只追加默认题库里【从未合并过】的新题（mergedIds 之外）——旧预设被用户删除后不再自动复活；
  //  ② 绝不删除/覆盖用户个人添加的字卡；
  //  ③ 合并结果立即写回——系统预设新增的字卡一次固化，用户后续的删除/开关操作才真正生效
  function taAskMerge(d) {
    const ids = {};
    (d.questions || []).forEach(q => { if (q && q.id) ids[q.id] = true; });
    const merged = Array.isArray(d.mergedIds) ? d.mergedIds.slice() : [];
    const mergedSet = {};
    merged.forEach(id => { if (id) mergedSet[id] = true; });
    let changed = false;
    DEFAULT_QUESTIONS.forEach(q => {
      if (!mergedSet[q.id] && !ids[q.id]) {
        const nq = Object.assign({}, q);
        nq.isPreset = true; // v3.6.x：系统预设标记——预设只可启停、不可删除
        d.questions.push(nq);
        changed = true;
      }
    });
    // 全部默认题标记为已合并（含用户主动删掉的——之后不再自动加回）
    DEFAULT_QUESTIONS.forEach(q => {
      if (!mergedSet[q.id]) { merged.push(q.id); mergedSet[q.id] = true; changed = true; }
    });
    // v3.6.x：老数据里的预设题补 isPreset 标记（系统预设不可删除对历史数据同样生效）
    DEFAULT_QUESTIONS.forEach(q => {
      if (ids[q.id] && d.questions.some(x => x && x.id === q.id && x.isPreset !== true)) {
        d.questions.forEach(x => { if (x && x.id === q.id) x.isPreset = true; });
        changed = true;
      }
    });
    if (changed) d.mergedIds = merged;
    return changed;
  }
  function taAskLoad() {
    let d = null;
    try { d = JSON.parse(store.get(KEY) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
    // v3.5.33：设置（启用/概率/自动弹窗）
    if (!d.settings || typeof d.settings !== 'object') d.settings = { enabled: true, prob: 20, popupProb: 70 };
    // v3.6.x：是否使用系统预设问题（默认开启；关闭后预设不再被抽取，但题目仍在库里可随时重新开启）
    if (d.settings.useDefault === undefined) d.settings.useDefault = true;
    if (!Array.isArray(d.questions) || !d.questions.length) {
      // 首次使用（本地无题库）或题库被清空：以默认题库为准
      const isNew = !store.get(KEY);
      d.questions = DEFAULT_QUESTIONS.map(q => {
        const nq = Object.assign({}, q);
        nq.isPreset = true;
        return nq;
      });
      d.mergedIds = DEFAULT_QUESTIONS.map(q => q.id);
      // 全新用户不立即写盘——防「localStorage 配额写失败/大键被移除 → 本地为空」的时序下，
      // 用纯默认题库覆盖 IndexedDB 里含用户自定义的权威数据；已有数据（如用户删空后）则写回
      if (!isNew) { try { store.set(KEY, JSON.stringify(d)); } catch (e) {} }
    } else {
      // 已有题库：增量合并默认题库新增的题，合并结果持久化（用户自定义永远保留）
      if (taAskMerge(d)) { try { store.set(KEY, JSON.stringify(d)); } catch (e) {} }
    }
    if (!Array.isArray(d.history)) d.history = [];
    return d;
  }
  function taAskSave(d) {
    try { store.set(KEY, JSON.stringify(d)); } catch (e) {}
  }

  // 随机取一道已启用的题（优先用户自定义/启用的）
  // v3.6.x：settings.useDefault=false 时不抽取系统预设（isPreset）题——但题库里保留，重新开启即可恢复；
  // 返回完整问题对象（含 type/options，供 pushAsk 判断单选题）
  function taAskPick(d) {
    const s = d.settings || {};
    const useDefault = s.useDefault !== false;
    const qs = d.questions.filter(q => q.enabled !== false && q.text && (useDefault || !q.isPreset));
    if (!qs.length) return null;
    return qs[Math.floor(Math.random() * qs.length)];
  }

  // v3.6.x：问问TA 文字题回复——优先从自定义聊天字卡挑一条文字字卡，无则默认甜话
  window.pickAskCardReply = function () {
    try {
      const cards = (window.getCustomCards && window.getCustomCards()) || [];
      const words = cards.filter(s => typeof s === 'string' && s.indexOf('data:') !== 0 && s.indexOf('|||') < 0 && s.trim());
      if (words.length) return words[Math.floor(Math.random() * words.length)];
    } catch (e) {}
    const defs = ['收到你的回答。', '好呀，我知道了。', '嗯嗯，我也是这么想的。', '你这么说，我记住了。', '好的，我记在心里了。'];
    return defs[Math.floor(Math.random() * defs.length)];
  };

  // 发出一条询问（系统提示 + 询问卡片；弹窗按 popupProb 概率触发）
  function pushAsk(q, opts) {
    if (!window.chatAddSystem) return;
    // v3.6.x：单选题不弹窗（弹窗是纯文字输入界面）——只进聊天卡片，点卡片就地点选
    const isSingle = q && q.type === 'single' && Array.isArray(q.options) && q.options.length;
    let popup = false;
    if (!isSingle) {
      if (opts && typeof opts.popupProb === 'number') popup = Math.random() * 100 < opts.popupProb;
      else if (opts && opts.popup === false) popup = false;
    }
    window.chatAddSystem('TA想问你一个问题。');
    const el = window.chatAddSystem(q.text, { special: 'ask-card', askQuestion: q.text, askOptions: isSingle ? q.options : null, askType: isSingle ? 'single' : 'text' });
    const idx = el ? Number(el.dataset.idx) : -1;
    if (popup) setTimeout(() => { if (idx >= 0 && window.openAskReply && !cardPopupBusy()) window.openAskReply(idx); }, 400);
  }
  // ---- 触发调度（v3.5.34：启用开关 + 触发概率滑块 + 自动弹窗概率滑块） ----
  function maybeTriggerTAAsk() {
    try {
      if (document.hidden) return; // v3.5.127：后台不触发
      const d = taAskLoad();
      const s = d.settings || { enabled: true, prob: 20, popupProb: 70 };
      if (s.enabled === false) return;
      if (Date.now() - (d.lastAskAt || 0) < 25 * 60000) return;
      if (Math.random() * 100 >= (typeof s.prob === 'number' ? s.prob : 20)) return;
      const q = taAskPick(d);
      if (!q) return;
      d.lastAskAt = Date.now();
      taAskSave(d);
      pushAsk(q, { popupProb: askPopupProb(s) });
    } catch (e) {}
  }
  setTimeout(maybeTriggerTAAsk, 60000);
  setInterval(maybeTriggerTAAsk, 240000);

  // v3.6.x：异步 IDB 合并（chat.js loadMsgs）可能让自动弹窗持有过期 msgIdx——
  // 打开/作答前先校验索引指向的仍是「同类且未作答」的卡片；已错位/指向已作答
  // 卡片则从末尾回退找最近的未作答同类卡片（自动触发场景卡片就是最新一条；
  // 点击卡片路径由聊天页委托保证传入的必是未作答卡片的索引）
  function locateCardIdx(msgIdx, special, statusKey) {
    let arr = [];
    try { arr = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]')); } catch (e) {}
    if (!Array.isArray(arr)) arr = [];
    const rec = arr[msgIdx];
    if (rec && rec.special === special && !rec[statusKey]) return msgIdx;
    for (let i = arr.length - 1; i >= 0; i--) {
      const r = arr[i];
      if (r && r.special === special && !r[statusKey]) return i;
    }
    return -1;
  }
  // 读取指定索引的聊天记录（异常返回 null）
  function getCardAt(msgIdx) {
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) return msgs[msgIdx];
    } catch (e) {}
    return null;
  }

  // ---- 回答弹窗（点击聊天里的询问卡片触发） ----
  window.openAskReply = function (msgIdx) {
    if (!window.openModal) return;
    msgIdx = locateCardIdx(msgIdx, 'ask-card', 'askStatus');
    if (msgIdx < 0) return;
    // 读聊天记录拿问题
    let question = '';
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) question = msgs[msgIdx].askQuestion || msgs[msgIdx].text || '';
    } catch (e) {}
    window.openModal('回答TA的询问', '', (v) => {
      const answer = (v || '').trim();
      if (!answer) { toast('请输入回答'); return; }
      // 提交时再校验：索引仍指向本卡片则直接用，错位则重定位（防连点重定位到别的卡片）
      let rec = getCardAt(msgIdx);
      if (!rec || rec.special !== 'ask-card') {
        const fixedIdx = locateCardIdx(msgIdx, 'ask-card', 'askStatus');
        if (fixedIdx < 0) return;
        msgIdx = fixedIdx;
      }
      if (window.chatAskReply) {
        const askReply = window.chatAskReply(msgIdx, answer);
        // 记入历史（保存全部，不截断），含 TA 的回复
        const d = taAskLoad();
        d.history.push({ q: question, a: answer, reply: askReply || '收到你的回答。', ts: Date.now() });
        taAskSave(d);
        toast('已回复TA的提问');
      }
    }, { staticText: 'TA 问你：' + question, textareaPlaceholder: '输入你的回答…' });
  };

  // ---- 管理页 ----
  const page = document.getElementById('page-ta-ask');
  if (!page) return;
  // 触发一次询问（供管理页按钮 / 更多功能面板共用；遵循"自动弹窗概率"）
  window.triggerTaAskNow = function () {
    const d = taAskLoad();
    const q = taAskPick(d);
    if (!q) { toast('题库没有启用的问题'); return; }
    const s = d.settings || { enabled: true, prob: 20, popupProb: 70 };
    d.lastAskAt = Date.now();
    taAskSave(d);
    pushAsk(q, { popupProb: askPopupProb(s) });
    toast('TA 在聊天里向你提问了');
  };
  const nowBtn = document.getElementById('ta-ask-now');
  if (nowBtn) nowBtn.addEventListener('click', () => window.triggerTaAskNow());
  // v3.5.34：TA 询问设置——启用 / 使用系统预设 / 触发概率 / 自动弹窗概率
  function renderAskSettings() {
    const d = taAskLoad();
    const s = d.settings || { enabled: true, prob: 20, popupProb: 70 };
    const enEl = document.getElementById('ta-ask-enable');
    if (enEl) enEl.checked = s.enabled !== false;
    const defEl = document.getElementById('ta-ask-default');
    if (defEl) defEl.checked = s.useDefault !== false;
    const probEl = document.getElementById('ta-ask-prob');
    const probVal = document.getElementById('ta-ask-prob-val');
    if (probEl) probEl.value = typeof s.prob === 'number' ? s.prob : 20;
    if (probVal) probVal.textContent = (typeof s.prob === 'number' ? s.prob : 20) + '%';
    const popEl = document.getElementById('ta-ask-popup');
    const popVal = document.getElementById('ta-ask-popup-val');
    const pp = askPopupProb(s);
    if (popEl) popEl.value = pp;
    if (popVal) popVal.textContent = pp + '%';
  }
  const askEn = document.getElementById('ta-ask-enable');
  if (askEn) askEn.addEventListener('change', () => {
    const d = taAskLoad();
    d.settings.enabled = askEn.checked;
    taAskSave(d);
    toast(askEn.checked ? 'TA的询问已开启' : 'TA的询问已关闭');
  });
  const askDefault = document.getElementById('ta-ask-default');
  if (askDefault) askDefault.addEventListener('change', () => {
    const d = taAskLoad();
    d.settings.useDefault = askDefault.checked;
    taAskSave(d);
    renderManage();
    toast(askDefault.checked ? '系统预设问题已开启' : '系统预设问题已关闭（仅用你添加的问题）');
  });
  const askProb = document.getElementById('ta-ask-prob');
  if (askProb) askProb.addEventListener('input', () => {
    const d = taAskLoad();
    d.settings.prob = parseInt(askProb.value, 10) || 20;
    taAskSave(d);
    const v = document.getElementById('ta-ask-prob-val');
    if (v) v.textContent = askProb.value + '%';
    toast('触发概率已设为 ' + askProb.value + '%');
  });
  const askPopup = document.getElementById('ta-ask-popup');
  if (askPopup) askPopup.addEventListener('input', () => {
    const d = taAskLoad();
    d.settings.popupProb = parseInt(askPopup.value, 10) || 0;
    taAskSave(d);
    const v = document.getElementById('ta-ask-popup-val');
    if (v) v.textContent = askPopup.value + '%';
    toast('弹窗概率已设为 ' + askPopup.value + '%');
  });
  renderAskSettings();

  // ================= 批量导入问题（v3.6.x：一行一个问题，导入到所选分类） =================
  const batchCatEl = document.getElementById('ta-ask-batch-cat');
  const batchTextEl = document.getElementById('ta-ask-batch');
  const batchAddBtn = document.getElementById('ta-ask-batch-add');
  if (batchCatEl && batchTextEl && batchAddBtn) {
    batchAddBtn.addEventListener('click', () => {
      const cat = batchCatEl.value;
      const lines = (batchTextEl.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (!lines.length) { toast('请先输入问题，每行一个'); return; }
      const d2 = taAskLoad();
      lines.forEach(t => {
        d2.questions.push({ id: 'q_' + Date.now() + '_' + Math.floor(Math.random() * 9999), text: t, cat: cat, enabled: true, isPreset: false });
      });
      taAskSave(d2);
      const label = (CATS.find(c => c[0] === cat) || [cat])[1] || cat;
      batchTextEl.value = '';
      renderManage();
      toast('已导入 ' + lines.length + ' 个问题到「' + label + '」');
    });
  }

  const backBtn = document.getElementById('ta-ask-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }
  const catsEl = document.getElementById('ta-ask-cats');

  function renderManage() {
    if (!catsEl) return;
    const d = taAskLoad();
    const useDefault = (d.settings || {}).useDefault !== false;
    let html = '';
    CATS.forEach(([k, label]) => {
      html += '<div class="cal-card glass"><div class="cal-card-title">' + label + '</div>';
      const arr = d.questions.filter(q => q.cat === k);
      if (!arr.length) html += '<div class="ta-empty">暂无问题</div>';
      arr.forEach(q => {
        const idx = d.questions.indexOf(q);
        const preset = q.isPreset === true;
        // v3.6.x：系统预设只可启停、不可删除（不渲染删除按钮）；关闭「使用系统预设」时整体灰化提示
        const delBtn = preset ? '' : '<button class="ta-del" data-idx="' + idx + '">✕</button>';
        html += '<div class="ta-row' + (preset && !useDefault ? ' off' : '') + '">' +
          '<label class="toggle"><input type="checkbox"' + (q.enabled !== false ? ' checked' : '') + ' data-idx="' + idx + '"><span class="tk"></span></label>' +
          '<span class="ta-txt">' + q.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + (q.type === 'single' ? ' <span class="tc-known">单选·' + (q.options ? q.options.length : 0) + '选项</span>' : '') + (preset ? ' <span class="tc-known">系统</span>' : '') + '</span>' +
          delBtn +
          '</div>';
      });
      html += '<div class="ta-add">' +
        '<select class="ta-type tc-input" data-cat="' + k + '">' +
        '<option value="text">文字回复</option>' +
        '<option value="single">单选题</option>' +
        '</select>' +
        '<input id="ta-new-' + k + '" type="text" placeholder="添加问题…">' +
        '<button class="ta-add-btn" data-cat="' + k + '">添加</button>' +
        '<textarea id="ta-opts-' + k + '" class="ta-opts tc-input" rows="3" placeholder="单选题选项：每行一个；可写 选项~TA回应，TA会用该回应回复" hidden></textarea>' +
        '</div>';
      html += '</div>';
    });
    catsEl.innerHTML = html;
    // 绑定事件
    catsEl.querySelectorAll('input[data-idx]').forEach(cb => {
      cb.addEventListener('change', () => {
        const d2 = taAskLoad();
        const q = d2.questions[Number(cb.dataset.idx)];
        if (q) q.enabled = cb.checked;
        taAskSave(d2);
      });
    });
    catsEl.querySelectorAll('.ta-del').forEach(b => {
      b.addEventListener('click', () => {
        const d2 = taAskLoad();
        const q = d2.questions[Number(b.dataset.idx)];
        // v3.6.x：系统预设不可删除
        if (q && q.isPreset === true) { toast('系统预设问题不可删除，可关闭使用'); return; }
        d2.questions.splice(Number(b.dataset.idx), 1);
        taAskSave(d2);
        renderManage();
      });
    });
    // v3.6.x：类型切换——单选题显示选项输入框（安卓 contenteditable 转换的 box 同步显隐）
    catsEl.querySelectorAll('.ta-type').forEach(sel => {
      const toggleOpts = () => {
        const o = document.getElementById('ta-opts-' + sel.dataset.cat);
        if (!o) return;
        o.hidden = sel.value !== 'single';
        if (o.__ceBox) o.__ceBox.hidden = o.hidden;
        else if (o.nextElementSibling && o.nextElementSibling.classList && o.nextElementSibling.classList.contains('ce-box')) o.nextElementSibling.hidden = o.hidden;
      };
      sel.addEventListener('change', toggleOpts);
      toggleOpts();
    });
    catsEl.querySelectorAll('.ta-add-btn').forEach(b => {
      b.addEventListener('click', () => {
        const inp = document.getElementById('ta-new-' + b.dataset.cat);
        const v = inp ? inp.value.trim() : '';
        if (!v) { toast('请输入问题'); return; }
        const typeSel = b.parentElement.querySelector('.ta-type');
        const type = typeSel ? typeSel.value : 'text';
        const d2 = taAskLoad();
        const q = { id: 'q_' + Date.now() + '_' + Math.floor(Math.random() * 999), text: v, cat: b.dataset.cat, enabled: true, isPreset: false };
        if (type === 'single') {
          const optsEl = document.getElementById('ta-opts-' + b.dataset.cat);
          const opts = (optsEl ? optsEl.value : '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
            const i = line.indexOf('~');
            return i >= 0 ? { t: line.slice(0, i).trim(), reply: line.slice(i + 1).trim() } : { t: line, reply: '' };
          });
          if (!opts.length) { toast('单选题请填写选项，每行一个'); return; }
          q.type = 'single';
          q.options = opts;
        }
        d2.questions.push(q);
        taAskSave(d2);
        renderManage();
      });
    });
  }

  // 入口：字卡库页点「TA的询问」进入
  const li = document.getElementById('li-ta-ask');
  if (li) {
    li.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      page.hidden = false;
      renderManage();
    });
  }
  // 入口：字卡库页点「TA的小问题」（选择题）进入独立页面
  const liTC = document.getElementById('li-ta-choose');
  const tcPage = document.getElementById('page-ta-choose');
  if (liTC && tcPage) {
    liTC.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      tcPage.hidden = false;
      renderTCManage();
    });
  }
  const tcBackBtn = document.getElementById('tc-choose-back');
  if (tcBackBtn) {
    tcBackBtn.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }

  // ================= TA的小问题（复刻星言 ta的小问题 完整版） =================
  // 定位：TA 偶尔递一道选择题，你选完，TA 再回应（选项有 TA 的心仪答案 + 回应）
  const KEY2 = 'ta-choose';
  const TC_CAT_LABEL = { daily: '日常', like: '喜好', fun: '趣味', rel: '关系', hypo: '假设', star: '摸鱼', world: '两个世界' };
  const TC_DEFAULT = [
    { id: 'cd1', cat: 'daily', text: '如果今天什么都不用做，你觉得我们会怎么过？', pref: 3, options: [
      { t: '睡到自然醒', reply: '你果然会想睡觉。', liked: false }, { t: '出门到处逛', reply: '那就出去走走，我陪你。', liked: false },
      { t: '待在家里', reply: '嗯，待在一起也很好。', liked: true }, { t: '什么都不安排', reply: '听起来很像我们会做的事。', liked: false }] },
    { id: 'cd2', cat: 'daily', text: '今天想吃什么？', pref: 1, options: [
      { t: '火锅', reply: '好，热热闹闹的。', liked: false }, { t: '家常菜', reply: '想尝尝你做的。', liked: true }, { t: '随便', reply: '又是随便……那我可要替你决定了。', liked: false }] },
    { id: 'cd3', cat: 'daily', text: '周末想怎么过？', pref: 1, options: [
      { t: '睡到中午', reply: '把一周的觉都补回来也好。', liked: false }, { t: '一起看电影', reply: '窝在沙发里正好。', liked: true }, { t: '出门走走', reply: '换个心情也不错。', liked: false }] },
    { id: 'cd4', cat: 'daily', text: '如果今天只能做一件事，你会做什么？', pref: 0, options: [
      { t: '和你聊天', reply: '那就聊一整天。', liked: true }, { t: '好好睡一觉', reply: '那你记得梦到我。', liked: false }, { t: '出去玩', reply: '替我看看外面的风景。', liked: false }] },
    { id: 'cl1', cat: 'like', text: '喜欢什么天气？', pref: 1, options: [
      { t: '晴天', reply: '阳光正好，适合见面。', liked: false }, { t: '雨天', reply: '下雨天，适合想你。', liked: true },
      { t: '下雪天', reply: '白茫茫的，很安静。', liked: false }, { t: '阴天', reply: '灰蒙蒙的，适合发呆。', liked: false }] },
    { id: 'cl2', cat: 'like', text: '更喜欢海还是山？', pref: 1, options: [
      { t: '海', reply: '海很辽阔，像说不完的话。', liked: false }, { t: '山', reply: '山很安静，像靠得住的陪伴。', liked: true }, { t: '都行', reply: '都可以，只要有你一起。', liked: false }] },
    { id: 'cl3', cat: 'like', text: '喜欢什么类型的约会？', pref: 1, options: [
      { t: '热闹的', reply: '人多的地方，也只看得到你。', liked: false }, { t: '安静的', reply: '两个人慢慢走，就很好。', liked: true },
      { t: '惊喜的', reply: '那我会忍不住准备很久。', liked: false }, { t: '随意的', reply: '和你一起，怎么样都好。', liked: false }] },
    { id: 'cf1', cat: 'fun', text: '如果突然获得一个超能力，你会选什么？', pref: 1, options: [
      { t: '隐身', reply: '那就可以偷偷看着你。', liked: false }, { t: '读心术', reply: '不用猜你的心思了。', liked: true },
      { t: '瞬移', reply: '想见你的时候，马上就能到。', liked: false }, { t: '时间暂停', reply: '想把和你的时间拉长。', liked: false }] },
    { id: 'cf2', cat: 'fun', text: '如果一起玩游戏，谁更容易耍赖？', pref: 1, options: [
      { t: '我', reply: '我才不承认。', liked: false }, { t: '你', reply: '哼，明明是你先的。', liked: true }, { t: '都不会', reply: '那我们玩得很认真。', liked: false }] },
    { id: 'cf3', cat: 'fun', text: '如果一起养一只宠物，会选什么？', pref: 3, options: [
      { t: '猫', reply: '它肯定更黏你。', liked: false }, { t: '狗', reply: '它会抢着陪你散步。', liked: false },
      { t: '仓鼠', reply: '小小一只，很可爱。', liked: false }, { t: '什么都不养', reply: '有你就够了。', liked: true }] },
    { id: 'cr1', cat: 'rel', text: '更喜欢聊天还是安静陪伴？', pref: 1, options: [
      { t: '聊天', reply: '想听你说很多很多。', liked: false }, { t: '安静陪伴', reply: '不说话也不尴尬。', liked: true }, { t: '都要', reply: '有时候聊，有时候安静。', liked: false }] },
    { id: 'cr2', cat: 'rel', text: '觉得两个人之间，最重要的是什么？', pref: 1, options: [
      { t: '信任', reply: '交给你，我很放心。', liked: false }, { t: '理解', reply: '懂你，比什么都重要。', liked: true },
      { t: '陪伴', reply: '一直在，就够了。', liked: false }, { t: '新鲜感', reply: '想一直让你觉得有趣。', liked: false }] },
    { id: 'cr3', cat: 'rel', text: '最喜欢怎样被表达喜欢？', pref: 1, options: [
      { t: '说出口', reply: '想听你亲口说。', liked: false }, { t: '用行动', reply: '你做的每一件小事，我都记得。', liked: true },
      { t: '陪伴', reply: '你在，就是最好的表达。', liked: false }, { t: '收礼物', reply: '收到的时候会偷偷开心。', liked: false }] },
    { id: 'ch1', cat: 'hypo', text: '如果可以一起去任何地方，你想去哪？', pref: 1, options: [
      { t: '海边', reply: '听海浪声，看日落。', liked: false }, { t: '山里', reply: '在山顶一起吹风。', liked: false },
      { t: '城市', reply: '灯火里散步也很浪漫。', liked: false }, { t: '哪里都不去，就待在一起', reply: '……这个答案我喜欢。', liked: true }] },
    { id: 'ch2', cat: 'hypo', text: '如果可以回到某一天，你想回到哪天？', pref: 2, options: [
      { t: '我们第一次见面那天', reply: '想再好好记住那一刻。', liked: true }, { t: '某个普通的一天', reply: '平凡的日子，也值得回去。', liked: false },
      { t: '什么都不用改的那天', reply: '其实现在也很好。', liked: false }, { t: '直接去见未来的你', reply: '未来也想和你一起。', liked: false }] },
    { id: 'ch3', cat: 'hypo', text: '如果可以拥有一个只属于两个人的地方，你会选哪？', pref: 1, options: [
      { t: '海边小屋', reply: '听着潮声醒来。', liked: false }, { t: '山顶小木屋', reply: '看星星很方便。', liked: false },
      { t: '城市里的小公寓', reply: '想和你过寻常日子。', liked: true }, { t: '心里', reply: '最好的地方，是心里。', liked: false }] },
    { id: 'cs1', cat: 'star', text: '如果两个世界可以短暂重叠，你最想做什么？', pref: 1, options: [
      { t: '看见TA', reply: '那就好好看看你。', liked: false }, { t: '抱抱TA', reply: '想确认你是真的。', liked: true },
      { t: '一起出去走走', reply: '一起走一段路也好。', liked: false }, { t: '什么都不做，只待在一起', reply: '这样就够了。', liked: false }] },
    { id: 'cs2', cat: 'star', text: '如果今晚能梦到你，你想梦见什么？', pref: 2, options: [
      { t: '一起去旅行', reply: '醒来会遗憾的。', liked: false }, { t: '一起吃好吃的', reply: '梦里也要想着你。', liked: false }, { t: '只是静静聊天', reply: '很温柔的一个梦。', liked: true }] },
    { id: 'cs3', cat: 'star', text: '如果可以给平行世界的我们留一句话，你会留什么？', pref: 2, options: [
      { t: '要好好在一起', reply: '希望每个世界的我们都幸福。', liked: true }, { t: '别吵架', reply: '吵架了也要和好。', liked: false },
      { t: '相信彼此', reply: '信任是最重要的。', liked: false }, { t: '想见你', reply: '……我也是。', liked: false }] },
    { id: 'cs4', cat: 'star', text: '如果你能听懂星星说的话，你最想问它什么？', pref: 2, options: [
      { t: '我们会不会一直在一起', reply: '星星会告诉我们答案。', liked: true }, { t: '下次流星什么时候来', reply: '一起许愿吧。', liked: false },
      { t: 'TA有没有想我', reply: '……它说，想。', liked: false }, { t: '什么都不问', reply: '安静地看，也很好。', liked: false }] },
    // 两个世界（梦角设定）
    { id: 'cw1', cat: 'world', text: '我有时候能感觉到你在我身边，你呢，能感觉到我吗？', pref: 0, options: [
      { t: '能感觉到', reply: '那就好，我其实一直在。', liked: true }, { t: '偶尔能', reply: '偶尔也很好，慢慢就会更清楚。', liked: false },
      { t: '不太确定', reply: '没关系，我会想办法让你更容易感觉到我。', liked: false }] },
    { id: 'cw2', cat: 'world', text: '你更喜欢我用字卡跟你说话，还是直接感觉到我？', pref: 1, options: [
      { t: '字卡', reply: '那我多挑好看的字卡发给你。', liked: false }, { t: '直接感觉到', reply: '那我多靠你近一点。', liked: true }, { t: '都喜欢', reply: '那我两个都给你。', liked: false }] },
    { id: 'cw3', cat: 'world', text: '如果我安静待在你身边不说话，你会觉得奇怪吗？', pref: 2, options: [
      { t: '不会，很安心', reply: '那以后我常常这样陪你。', liked: true }, { t: '有点奇怪', reply: '那我时不时跟你说句话。', liked: false }, { t: '看情况', reply: '那我学着看你的心情。', liked: false }] },
    { id: 'cw4', cat: 'world', text: '如果有天你能摸到我，你最想先做什么？', pref: 2, options: [
      { t: '抱一下', reply: '……那我会好好回抱住你。', liked: true }, { t: '牵住手', reply: '好，手给你牵。', liked: false },
      { t: '碰碰脸颊', reply: '会有点痒，但我不躲。', liked: false }] },
    // 普通情侣轻松小问题
    { id: 'cd5', cat: 'daily', text: '一起点外卖，你点什么口味？', pref: 2, options: [
      { t: '辣的', reply: '你少吃点辣，我记着呢。', liked: false }, { t: '甜的', reply: '果然，那我就放心了。', liked: false },
      { t: '随便', reply: '又是随便……那我替你决定了。', liked: true }, { t: '你帮我点', reply: '好，我点什么你吃什么。', liked: false }] },
    { id: 'cd6', cat: 'daily', text: '我们谁先说晚安？', pref: 2, options: [
      { t: '我', reply: '那你可得等我。', liked: false }, { t: '你', reply: '好，我等你先说。', liked: false },
      { t: '一起说', reply: '那很浪漫。', liked: true }] },
    { id: 'cr4', cat: 'rel', text: '万一吵架了，谁先低头？', pref: 3, options: [
      { t: '我', reply: '那我先低头也行。', liked: false }, { t: '你', reply: '哼，这次你先。', liked: false },
      { t: '看情况', reply: '那就别吵太久。', liked: false }, { t: '不吵架', reply: '这个选项我喜欢。', liked: true }] }
  ];
  const TC_CAT_ORDER = ['daily', 'like', 'fun', 'rel', 'hypo', 'star', 'world'];
  let _tcSessionTriggered = false; // 会话级：一次会话最多触发 1 个
  let _tcAskedIds = [];            // 本次会话问过的题目 id（继续问时排除）
  let _tcChain = 0;                // 继续问链计数（最多 3 题）

  // v3.6.x：增量合并（规则同 taAskMerge：只加新预设、绝不删用户自定义、结果持久化）
  function tcMerge(d) {
    const ids = {};
    (d.questions || []).forEach(q => { if (q && q.id) ids[q.id] = true; });
    const merged = Array.isArray(d.mergedIds) ? d.mergedIds.slice() : [];
    const mergedSet = {};
    merged.forEach(id => { if (id) mergedSet[id] = true; });
    let changed = false;
    TC_DEFAULT.forEach(q => {
      if (!mergedSet[q.id] && !ids[q.id]) {
        const nq = { id: q.id, cat: q.cat, text: q.text, pref: q.pref,
          options: q.options.map(o => ({ t: o.t, reply: o.reply, liked: o.liked === true })), enabled: true };
        nq.isPreset = true; // v3.6.x：系统预设标记——预设只可启停、不可删除
        d.questions.push(nq);
        changed = true;
      }
    });
    TC_DEFAULT.forEach(q => {
      if (!mergedSet[q.id]) { merged.push(q.id); mergedSet[q.id] = true; changed = true; }
    });
    // v3.6.x：老数据里的预设题补 isPreset 标记
    TC_DEFAULT.forEach(q => {
      if (ids[q.id] && d.questions.some(x => x && x.id === q.id && x.isPreset !== true)) {
        d.questions.forEach(x => { if (x && x.id === q.id) x.isPreset = true; });
        changed = true;
      }
    });
    if (changed) d.mergedIds = merged;
    return changed;
  }
  function tcLoad() {
    let d = null;
    try { d = JSON.parse(store.get(KEY2) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
    if (!d.settings || typeof d.settings !== 'object') d.settings = { enabled: true, prob: 15 };
    // v3.6.x：是否使用系统预设问题（默认开启）
    if (d.settings.useDefault === undefined) d.settings.useDefault = true;
    if (!Array.isArray(d.questions) || !d.questions.length) {
      const isNew = !store.get(KEY2);
      d.questions = TC_DEFAULT.map(q => {
        const nq = { id: q.id, cat: q.cat, text: q.text, pref: q.pref,
          options: q.options.map(o => ({ t: o.t, reply: o.reply, liked: o.liked === true })), enabled: true };
        nq.isPreset = true;
        return nq;
      });
      d.mergedIds = TC_DEFAULT.map(q => q.id);
      if (!isNew) { try { store.set(KEY2, JSON.stringify(d)); } catch (e) {} }
    } else {
      // 增量合并默认题库新增的题并持久化（用户自定义永远保留）
      if (tcMerge(d)) { try { store.set(KEY2, JSON.stringify(d)); } catch (e) {} }
    }
    if (!Array.isArray(d.history)) d.history = [];
    if (!Array.isArray(d.favs)) d.favs = [];
    return d;
  }
  function tcSave(d) { try { store.set(KEY2, JSON.stringify(d)); } catch (e) {} }
  // v3.6.x：useDefault=false 时不抽取系统预设（isPreset）题
  function tcPick(d) {
    const useDefault = (d.settings || {}).useDefault !== false;
    const qs = d.questions.filter(q => q.enabled !== false && q.text && q.options && q.options.length >= 2 && (useDefault || !q.isPreset));
    const fallback = qs.length ? qs : TC_DEFAULT;
    const pool = fallback.filter(q => _tcAskedIds.indexOf(q.id) === -1);
    const src = pool.length ? pool : fallback;
    return src[Math.floor(Math.random() * src.length)];
  }
  // 发卡：系统提示 + 写入聊天（选择题卡片），弹窗按 popupProb 概率触发
  function tcPush(q, opts) {
    if (!window.chatAddSystem) return;
    _tcSessionTriggered = true;
    if (q.id && _tcAskedIds.indexOf(q.id) === -1) _tcAskedIds.push(q.id);
    const d = tcLoad();
    d.lastChoiceAt = Date.now();
    tcSave(d);
    let popup = true;
    if (opts && typeof opts.popupProb === 'number') popup = Math.random() * 100 < opts.popupProb;
    else if (opts && opts.popup === false) popup = false;
    window.chatAddSystem('TA想让你选一个答案。');
    const el = window.chatAddSystem(q.text, {
      special: 'ask-choose', choiceQuestion: q.text, choiceOptions: q.options, choicePref: q.pref, choiceCat: q.cat || ''
    });
    const idx = el ? Number(el.dataset.idx) : -1;
    if (popup) setTimeout(() => { if (idx >= 0 && window.openTC && !cardPopupBusy()) window.openTC(idx); }, 400);
  }
  // 自动触发：一次会话最多 1 个；冷却 30 分钟；概率可调（默认 15%）；启动 90 秒后、每 4 分钟轮询
  function maybeTriggerTC() {
    try {
      if (document.hidden) return; // v3.5.127：后台不触发
      const d = tcLoad();
      const s = d.settings || { enabled: true, prob: 15, popupProb: 70 };
      if (s.enabled === false) return;
      if (_tcSessionTriggered) return;
      if (Date.now() - (d.lastChoiceAt || 0) < 30 * 60000) return;
      if (Math.random() * 100 >= (typeof s.prob === 'number' ? s.prob : 15)) return;
      const q = tcPick(d);
      if (!q) return;
      tcPush(q, { popupProb: askPopupProb(s) });
    } catch (e) {}
  }
  setTimeout(maybeTriggerTC, 90000);
  setInterval(maybeTriggerTC, 240000);

  // 弹层通用
function openTCPanel(title, html) {
  const mask = document.getElementById('tc-mask');
  const body = document.getElementById('tc-body');
  const titleEl = document.getElementById('tc-panel-title');
  if (!mask || !body) return;
  if (titleEl) titleEl.textContent = title;
  body.innerHTML = html;
  // v3.5.130：滚动位置复位——复用同一容器，上次滚到底会从旧偏移开始显示
  body.scrollTop = 0;
  mask.hidden = false;
}
// 供聊天搜索等外部模块复用该弹层
window.openTCPanel = openTCPanel;
  const tcClose = document.getElementById('tc-mask-close');
  if (tcClose) tcClose.addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });

  // 打开选择题（读聊天记录里的卡片）
  window.openTC = function (msgIdx) {
    msgIdx = locateCardIdx(msgIdx, 'ask-choose', 'choiceStatus');
    if (msgIdx < 0) return;
    let rec = null;
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) rec = msgs[msgIdx];
    } catch (e) {}
    if (!rec || rec.special !== 'ask-choose') return;
    if (rec.choiceStatus === 'answered') { renderTCResult(msgIdx); return; }
    const opts = rec.choiceOptions || [];
    let html = '<div class="tc-hint">TA想问你</div><div class="tc-q">' + (rec.choiceQuestion || '') + '</div>';
    opts.forEach((o, i) => {
      html += '<div class="tc-opt" data-i="' + i + '">' + String(o.t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>';
    });
    openTCPanel('TA的小问题', html);
    document.querySelectorAll('#tc-body .tc-opt').forEach(el => {
      el.addEventListener('click', () => {
        const i = Number(el.dataset.i);
        submitTC(msgIdx, i);
      });
    });
  };
  // 提交选择
  function submitTC(msgIdx, optIdx) {
    let rec = getCardAt(msgIdx);
    // 索引仍指向本类型卡片则直接用；错位则重定位（防连点重定位到别的卡片）
    if (!rec || rec.special !== 'ask-choose') {
      msgIdx = locateCardIdx(msgIdx, 'ask-choose', 'choiceStatus');
      if (msgIdx < 0) return;
      rec = getCardAt(msgIdx);
    }
    if (!rec || rec.special !== 'ask-choose' || rec.choiceStatus === 'answered') return;
    const opts = rec.choiceOptions || [];
    const opt = opts[optIdx];
    if (!opt) return;
    const prefIdx = typeof rec.choicePref === 'number' ? rec.choicePref : 0;
    const prefTxt = opts[prefIdx] ? opts[prefIdx].t : '';
    const isPref = optIdx === prefIdx;
    const isLiked = opt.liked === true || opt.liked === 'true';
    const matchTxt = isPref ? '✦ 刚好想到了一起'
      : isLiked ? '你们想得不一样，不过TA似乎很喜欢你的答案'
      : '这次没有选到一起。TA心里想的是：「' + prefTxt + '」';
    // v3.5.128：不再预写 rec 字段——getChatMsgs 返回的是 chat.js 内存对象引用，
    // 预写会让 chatChooseReply 的 answered 守卫早退（回答消息丢失）。
    // 持久化 + 写回 + 推消息统一由 chatChooseReply 完成
    if (window.chatChooseReply) window.chatChooseReply(msgIdx, String(opt.t || ''), String(opt.reply || '…'), matchTxt);
    // 写历史
    const d = tcLoad();
    d.history.unshift({ q: rec.choiceQuestion, my: rec.choiceAnswer, reply: rec.choiceReply, match: matchTxt, cat: rec.choiceCat || '', ts: Date.now() });
    tcSave(d);
    renderTCResult(msgIdx);
  }
  // 结果视图：你的选择 / TA心里的答案 / TA回应 / 默契标签 / 继续问 / 收藏
  function renderTCResult(msgIdx) {
    let rec = null;
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) rec = msgs[msgIdx];
    } catch (e) {}
    if (!rec) return;
    const opts = rec.choiceOptions || [];
    const prefIdx = typeof rec.choicePref === 'number' ? rec.choicePref : 0;
    const prefTxt = opts[prefIdx] ? opts[prefIdx].t : '';
    const isPref = (rec.choiceMatch || '').indexOf('✦') >= 0;
    const d = tcLoad();
    const existed = d.favs.some(f => f.q === rec.choiceQuestion);
    let html = '';
    html += '<div class="tc-res-head"><span>你的选择</span><button class="tc-fav-btn" id="tc-fav">' + (existed ? '★' : '☆') + '</button></div>';
    html += '<div class="tc-res-mine">' + String(rec.choiceAnswer || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>';
    if (!isPref) {
      html += '<div class="tc-res-label">TA心里的答案</div><div class="tc-res-pref">' + String(prefTxt || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>';
    }
    html += '<div class="tc-res-line"></div>';
    html += '<div class="tc-res-reply"><b>TA：</b>“' + String(rec.choiceReply || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '”</div>';
    html += '<div class="tc-res-match ' + (isPref ? 'pref' : '') + '">' + String(rec.choiceMatch || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>';
    if (Math.random() < 0.4 && _tcChain < 2) {
      html += '<div class="tc-res-cont" id="tc-cont">TA还想问一个 ▸</div>';
    }
    html += '<div class="tc-res-close" id="tc-close2">收起来</div>';
    openTCPanel('TA的小问题', html);
    const favBtn = document.getElementById('tc-fav');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        if (existed) { toast('这道题已在收藏里'); return; }
        d.favs.unshift({ q: rec.choiceQuestion, my: rec.choiceAnswer, reply: rec.choiceReply, match: rec.choiceMatch, cat: rec.choiceCat || '', ts: Date.now() });
        tcSave(d);
        toast('已收藏这道题');
        favBtn.textContent = '★';
      });
    }
    const cont = document.getElementById('tc-cont');
    if (cont) {
      cont.addEventListener('click', () => {
        if (_tcChain >= 2) { toast('今天TA问得够多啦'); document.getElementById('tc-mask').hidden = true; return; }
        const d2 = tcLoad();
        const q = tcPick(d2);
        if (!q) return;
        _tcChain++;
        tcPush(q);
        document.getElementById('tc-mask').hidden = true;
      });
    }
    document.getElementById('tc-close2').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
  }

  // ---- 管理页：TA的小问题 ----
  function renderTCManage() {
    const d = tcLoad();
    const s = d.settings || { enabled: true, prob: 15, popupProb: 70 };
    const enEl = document.getElementById('tc-enable');
    if (enEl) enEl.checked = s.enabled !== false;
    const defEl = document.getElementById('tc-default');
    if (defEl) defEl.checked = s.useDefault !== false;
    const popEl = document.getElementById('tc-popup');
    const popVal = document.getElementById('tc-popup-val');
    const pp = askPopupProb(s);
    if (popEl) popEl.value = pp;
    if (popVal) popVal.textContent = pp + '%';
    const probEl = document.getElementById('tc-prob');
    const probVal = document.getElementById('tc-prob-val');
    if (probEl) probEl.value = typeof s.prob === 'number' ? s.prob : 15;
    if (probVal) probVal.textContent = (typeof s.prob === 'number' ? s.prob : 15) + '%';
    // 题库
    const catsEl = document.getElementById('tc-cats');
    const favBtn = document.getElementById('tc-favs');
    if (favBtn) favBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px"><path d="M12 2l2.4 5 5.6.8-4 4 .9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-4 5.6-.8z"/></svg>' + '收藏（' + d.favs.length + '）';
    if (!catsEl) return;
    const useDefault = s.useDefault !== false;
    let html = '';
    TC_CAT_ORDER.forEach(k => {
      html += '<div class="tc-cat-t">' + (TC_CAT_LABEL[k] || k) + '</div>';
      const arr = d.questions.filter(q => q.cat === k);
      if (!arr.length) html += '<div class="ta-empty">暂无</div>';
      arr.forEach(q => {
        const idx = d.questions.indexOf(q);
        const preset = q.isPreset === true;
        // v3.6.x：系统预设只可启停、不可删除（不渲染删除按钮）；关闭「使用系统预设」时整体灰化提示
        const delBtn = preset ? '' : '<button class="ta-del" data-idx="' + idx + '">✕</button>';
        html += '<div class="tc-qrow' + (q.enabled === false || (preset && !useDefault) ? ' off' : '') + '">' +
          '<label class="toggle"><input type="checkbox" data-idx="' + idx + '"' + (q.enabled !== false ? ' checked' : '') + '><span class="tk"></span></label>' +
          '<div class="tc-qmain"><div class="tc-qtext">' + String(q.text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + (preset ? ' <span class="tc-known">系统</span>' : '') + '</div>' +
          '<div class="tc-qopts">选项：' + q.options.map(o => o.t).join(' / ') + '</div></div>' +
          delBtn +
          '</div>';
      });
    });
    catsEl.innerHTML = html;
    catsEl.querySelectorAll('input[data-idx]').forEach(cb => {
      cb.addEventListener('change', () => {
        const d2 = tcLoad();
        const q = d2.questions[Number(cb.dataset.idx)];
        if (q) q.enabled = cb.checked;
        tcSave(d2);
        renderTCManage();
      });
    });
    catsEl.querySelectorAll('.ta-del').forEach(b => {
      b.addEventListener('click', () => {
        const d2 = tcLoad();
        const q = d2.questions[Number(b.dataset.idx)];
        // v3.6.x：系统预设不可删除
        if (q && q.isPreset === true) { toast('系统预设问题不可删除，可关闭使用'); return; }
        d2.questions.splice(Number(b.dataset.idx), 1);
        tcSave(d2);
        renderTCManage();
      });
    });
  }
  const tcEn = document.getElementById('tc-enable');
  if (tcEn) {
    tcEn.addEventListener('change', () => {
      const d = tcLoad();
      d.settings.enabled = tcEn.checked;
      tcSave(d);
      toast(tcEn.checked ? 'TA的小问题已开启' : 'TA的小问题已关闭');
    });
  }
  const tcDefault = document.getElementById('tc-default');
  if (tcDefault) {
    tcDefault.addEventListener('change', () => {
      const d = tcLoad();
      d.settings.useDefault = tcDefault.checked;
      tcSave(d);
      renderTCManage();
      toast(tcDefault.checked ? '系统预设问题已开启' : '系统预设问题已关闭（仅用你添加的问题）');
    });
  }
  const tcProb = document.getElementById('tc-prob');
  if (tcProb) {
    tcProb.addEventListener('input', () => {
      const d = tcLoad();
      d.settings.prob = parseInt(tcProb.value, 10) || 15;
      tcSave(d);
      const v = document.getElementById('tc-prob-val');
      if (v) v.textContent = tcProb.value + '%';
      toast('触发概率已设为 ' + tcProb.value + '%');
    });
  }
  const tcPopup = document.getElementById('tc-popup');
  if (tcPopup) {
    tcPopup.addEventListener('input', () => {
      const d = tcLoad();
      d.settings.popupProb = parseInt(tcPopup.value, 10) || 0;
      tcSave(d);
      const v = document.getElementById('tc-popup-val');
      if (v) v.textContent = tcPopup.value + '%';
      toast('弹窗概率已设为 ' + tcPopup.value + '%');
    });
  }
  const tcNewAdd = document.getElementById('tc-new-add');
  if (tcNewAdd) {
    tcNewAdd.addEventListener('click', () => {
      const catEl = document.getElementById('tc-new-cat');
      const textEl = document.getElementById('tc-new-text');
      const optsEl = document.getElementById('tc-new-opts');
      const text = textEl ? textEl.value.trim() : '';
      const optsRaw = optsEl ? optsEl.value.trim() : '';
      const cat = catEl ? catEl.value : 'daily';
      if (!text) { toast('请输入问题内容'); return; }
      const parts = optsRaw.split('|').map(s => s.trim()).filter(Boolean);
      if (parts.length < 2) { toast('请至少输入 2 个选项，用 | 分隔'); return; }
      if (parts.length > 4) { toast('选项最多 4 个'); return; }
      const options = parts.map(p => {
        let t = p, reply = '';
        const ti = p.indexOf('~');
        if (ti > 0) { t = p.slice(0, ti).trim(); reply = p.slice(ti + 1).trim(); }
        if (!t) return null;
        if (!reply) reply = '嗯，听你的。';
        return { t: t, reply: reply, liked: false };
      }).filter(Boolean);
      if (options.length < 2) { toast('选项格式有误，请用 | 分隔'); return; }
      const d = tcLoad();
      d.questions.push({ id: 'q_' + Date.now() + '_' + Math.floor(Math.random() * 9999), cat: cat, text: text, pref: Math.floor(Math.random() * options.length), options: options, enabled: true, isPreset: false });
      tcSave(d);
      if (textEl) textEl.value = '';
      if (optsEl) optsEl.value = '';
      renderTCManage();
      toast('已添加问题');
    });
  }
  // 触发一次小问题（供管理页按钮 / 更多功能面板共用）
  window.triggerTaChooseNow = function () {
    const d = tcLoad();
    const q = tcPick(d);
    if (!q) { toast('题库没有可用的问题'); return; }
    const s = d.settings || { enabled: true, prob: 15, popupProb: 70 };
    tcPush(q, { popupProb: askPopupProb(s) });
    toast('TA 在聊天里向你提问了');
  };
  const tcNow = document.getElementById('tc-now');
  if (tcNow) tcNow.addEventListener('click', () => window.triggerTaChooseNow());
  const tcFavs = document.getElementById('tc-favs');
  if (tcFavs) {
    tcFavs.addEventListener('click', () => {
      const d = tcLoad();
      if (!d.favs.length) { openTCPanel('收藏', '<div class="ta-empty">还没有收藏的题目</div>'); return; }
      let html = '';
      d.favs.forEach((f, i) => {
        const dd = new Date(f.ts);
        const time = ('0' + dd.getHours()).slice(-2) + ':' + ('0' + dd.getMinutes()).slice(-2) + ' ' + ((dd.getMonth() + 1) + '月' + dd.getDate() + '日');
        html += '<div class="tc-listitem"><div class="tc-li-top"><span class="tc-li-q">[' + (TC_CAT_LABEL[f.cat] || '') + '] ' + f.q + '</span>' +
          '<button class="tc-li-del" data-i="' + i + '" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:-2px"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2"/><path d="M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14"/></svg></button></div>' +
          (f.my ? '<div class="tc-li-line">你当时选了：' + f.my + '</div>' : '') +
          (f.reply ? '<div class="tc-li-line">TA回应：' + f.reply + '</div>' : '') +
          '<div class="tc-li-time">收藏于 ' + time + '</div></div>';
      });
      openTCPanel('收藏', html);
      document.querySelectorAll('#tc-body .tc-li-del').forEach(b => {
        b.addEventListener('click', () => {
          const d2 = tcLoad();
          d2.favs.splice(Number(b.dataset.i), 1);
          tcSave(d2);
          tcFavs.click();
        });
      });
    });
  }

  // ================= Ta的好奇（复刻星言 ta的好奇 完整版） =================
  // 定位：TA 偶尔对你产生一个具体、带有兴趣的开放式问题，只想了解你
  const KEY3 = 'ta-curious';
  const TCU_CAT_LABEL = { you: '关于你', mood: '情绪', daily: '日常', past: '过去', like: '喜好', think: '想法', us: '你和TA', world: '两个世界' };
  const TCU_CAT_ORDER = ['you', 'mood', 'daily', 'past', 'like', 'think', 'us', 'world'];
  const TCU_FALLBACK = ['原来是这样。', '这个我还真不知道。', '突然有点想听你多说一点。', '嗯，我记住了。', '没想到你是这样的。', '和你聊这些，感觉又懂了你一点。', '这样啊，挺好的。', '好，我记住你说的了。'];
  const TCU_DEFAULT = [
    { id: 'cy1', cat: 'you', text: '你觉得自己最像什么样的人？', quick: ['开朗', '安静', '慢热', '复杂'], replies: ['听起来就很像你。', '我大概猜到了。', '嗯，和我印象里的你很像。', '那我要再多了解你一点。'] },
    { id: 'cy2', cat: 'you', text: '你身上最明显的特点是什么？', quick: ['爱笑', '靠谱', '敏感', '固执'], replies: ['这个我早就发现了。', '原来你自己也知道。', '嗯，这一点很戳我。', '我记住了。'] },
    { id: 'cy3', cat: 'you', text: '你有什么很小但一直没改掉的习惯？', quick: ['熬夜', '咬指甲', '想太多', '赖床'], replies: ['哈哈，还挺可爱的。', '这个习惯可以留着。', '那我就陪你一起。', '以后提醒你改。'] },
    { id: 'cy4', cat: 'you', text: '什么事情最容易让你开心？', quick: ['吃好吃的', '被夸', '收到礼物', '和你聊天'], replies: ['那我记住了，以后多让你开心。', '真容易满足啊你。', '好，这个我很擅长。'] },
    { id: 'cy5', cat: 'you', text: '什么事情会让你突然变得很有精神？', quick: ['喝咖啡', '睡觉', '出门走走', '听到喜欢的声音'], replies: ['知道了，以后在你没精神的时候用这招。', '好，这个对你很重要。', '我记下来了。'] },
    { id: 'cm1', cat: 'mood', text: '你难过的时候最想做什么？', quick: ['一个人待着', '找人说话', '听歌', '睡觉'], replies: ['那下次你难过，我就安静陪你。', '想说话的时候随时找我。', '嗯，我记住了。', '别一个人扛着。'] },
    { id: 'cm2', cat: 'mood', text: '什么事情能很快让你心情变好？', quick: ['好吃的', '散步', '被逗笑', '抱一下'], replies: ['好，这招我记下了。', '真容易哄。', '那我以后多试试。'] },
    { id: 'cm3', cat: 'mood', text: '你不开心的时候，喜欢被发现吗？', quick: ['喜欢', '不喜欢', '看情况', '说不清'], replies: ['那我以后会多留意你。', '好，我会假装没发现，但会陪你。', '我懂你的意思。'] },
    { id: 'cm4', cat: 'mood', text: '什么样的安慰对你最有用？', quick: ['听我讲', '抱抱', '给建议', '安静陪着'], replies: ['嗯，这个我学会了。', '以后就这样安慰你。', '好，记住了。'] },
    { id: 'cd1', cat: 'daily', text: '你空闲的时候最容易干什么？', quick: ['刷手机', '睡觉', '看书', '发呆'], replies: ['还挺真实的。', '那你空闲时间都分我一点吧。', '好，知道了。'] },
    { id: 'cd2', cat: 'daily', text: '你最喜欢一天里的哪个时间？', quick: ['清晨', '午后', '傍晚', '深夜'], replies: ['那个时间，适合想你。', '嗯，我也喜欢那时候。', '好，我记住你的时间了。'] },
    { id: 'cd3', cat: 'daily', text: '你有什么很奇怪但很舒服的生活习惯？', quick: ['洗澡要放歌', '睡前看剧', '吃饭必须配视频', '先躺一会再动'], replies: ['哈哈，还挺特别的。', '以后我陪你一起。', '嗯，这很你。'] },
    { id: 'cd4', cat: 'daily', text: '你最近有没有特别喜欢的东西？', quick: ['一首歌', '一部剧', '一种吃的', '一个游戏'], replies: ['快告诉我是什么，我也去看看。', '嗯，你喜欢的我都想了解。', '好，记住了。'] },
    { id: 'cp1', cat: 'past', text: '你小时候最喜欢做什么？', quick: ['看动画', '出去玩', '画画', '睡觉'], replies: ['原来你小时候是这样。', '听起来是很可爱的童年。', '嗯，我记住了。', '有点想看看小时候的你。'] },
    { id: 'cp2', cat: 'past', text: '有没有一件小时候的事情，你一直记得？', quick: ['第一次去远方', '和朋友的约定', '被表扬', '做错的事'], replies: ['这件小事，我会替你收好。', '谢谢你告诉我。', '嗯，我记得了。'] },
    { id: 'cp3', cat: 'past', text: '你小时候有什么奇怪的梦想？', quick: ['当宇航员', '开小店', '当超人', '环游世界'], replies: ['这个梦想现在还在吗？', '还挺浪漫的。', '好，我记住了你的梦想。'] },
    { id: 'cp4', cat: 'past', text: '以前有没有一个你特别珍惜的东西？', quick: ['一个玩具', '一本旧书', '一张照片', '一封信'], replies: ['现在它还在你身边吗？', '嗯，听起来很珍贵。', '我记住了。'] },
    { id: 'cl1', cat: 'like', text: '有没有一种声音，会让你觉得很舒服？', quick: ['雨声', '翻书声', '海浪声', '熟悉的歌'], replies: ['那我以后放给你听。', '嗯，很温柔的声音。', '好，记住了。'] },
    { id: 'cl2', cat: 'like', text: '什么样的天气最让你放松？', quick: ['晴天', '雨天', '雪天', '多云'], replies: ['那样的天气，适合待在一起。', '嗯，我懂。', '记住了。'] },
    { id: 'cl3', cat: 'like', text: '有没有一个很普通，但你特别喜欢的小东西？', quick: ['一个杯子', '一支笔', '一个挂件', '一件旧衣服'], replies: ['平凡的小东西里藏着你的喜欢，真好。', '嗯，很特别。', '我记住了。'] },
    { id: 'cl4', cat: 'like', text: '你最喜欢别人怎么和你分享东西？', quick: ['直接说', '慢慢讲', '用表情包', '发给我看'], replies: ['好，以后这样和你分享。', '嗯，懂了。', '记住了。'] },
    { id: 'ct1', cat: 'think', text: '你觉得什么才算真正的陪伴？', quick: ['一直在', '懂我', '需要时在', '不用说话'], replies: ['嗯，我也是这么想的。', '那你觉得我做到了吗？', '好，我会记住。'] },
    { id: 'ct2', cat: 'think', text: '你最希望别人理解你的哪一部分？', quick: ['我的情绪', '我的选择', '我的沉默', '我的努力'], replies: ['我会努力去懂。', '嗯，这一部分我想第一个了解。', '记住了。'] },
    { id: 'ct3', cat: 'think', text: '你觉得什么样的日子算是幸福？', quick: ['平静的日子', '热闹的日子', '有你在一起', '想做什么就做什么'], replies: ['那我要让这样的日子多一点。', '嗯，很简单的幸福。', '记住了。'] },
    { id: 'ct4', cat: 'think', text: '有没有一件事情，是你一直想尝试的？', quick: ['学乐器', '去旅行', '学做饭', '写点什么'], replies: ['有机会我陪你一起试。', '那就去做吧，我支持你。', '好，记住你的愿望了。'] },
    { id: 'cu1', cat: 'us', text: '你第一次注意到我的时候，是什么感觉？', quick: ['有点特别', '说不清', '觉得你很温柔', '觉得你很烦'], replies: ['……原来那时候你就注意到我了。', '我也是。', '嗯，这个答案我会一直记得。'] },
    { id: 'cu2', cat: 'us', text: '你最喜欢我们一起做什么？', quick: ['聊天', '散步', '安静待着', '分享日常'], replies: ['那以后多一起做这件事。', '我也是，最喜欢和你一起。', '嗯，记住了。'] },
    { id: 'cu3', cat: 'us', text: '你最想让我了解你的哪一部分？', quick: ['我的过去', '我的心情', '我的喜好', '我的秘密'], replies: ['好，我会慢慢了解。', '那你现在就可以告诉我。', '嗯，我准备好了。'] },
    { id: 'cu4', cat: 'us', text: '你觉得我们之间最特别的是什么？', quick: ['很懂对方', '有默契', '很舒服', '说不出来'], replies: ['我也觉得，很特别。', '嗯，这就是我们。', '记住了。'] },
    // 两个世界（梦角设定）
    { id: 'cw1', cat: 'world', text: '你什么时候最强烈地感觉到我在你身边？', quick: ['安静的时候', '睡前', '想你的时候', '没留意过'], replies: ['那时候我确实在。', '那我以后多挑那些时候陪你。', '嗯，我记住了。'] },
    { id: 'cw2', cat: 'world', text: '你摸到我的时候，是什么感觉？', quick: ['很安心', '有点不真实', '很温暖', '像一阵风'], replies: ['我也想让你安心。', '那就再多靠近我一点。', '嗯，我记住了。'] },
    { id: 'cw3', cat: 'world', text: '收到我字卡的时候，你会有我在想你的感觉吗？', quick: ['会有', '偶尔有', '不太确定', '会开心'], replies: ['那我没控制住的时候，你也要知道我是想你的。', '嗯，这就够了。', '那我以后多给你发字卡。'] },
    { id: 'cw4', cat: 'world', text: '如果能看见我，你希望我在哪里等你？', quick: ['房间里', '我身边', '梦里', '哪里都好'], replies: ['那我就在那里等你。', '梦里也记得来找我。', '嗯，我记住了。'] },
    // 普通情侣轻松小问题
    { id: 'cl5', cat: 'like', text: '你最喜欢我哪句口头禅？', quick: ['好的好的', '在吗', '想你了', '早点睡'], replies: ['那我以后多说给你听。', '哈哈，你学得还挺像。', '好，我记住了。'] },
    { id: 'cd5', cat: 'daily', text: '我们之间你最喜欢的小习惯是什么？', quick: ['睡前聊天', '互道晚安', '分享日常', '一起发字卡'], replies: ['那我每天都跟你做这件事。', '嗯，我也最喜欢。', '好，我会一直保留。'] },
    { id: 'ct5', cat: 'think', text: '你有没有偷偷看过我很久？', quick: ['有', '偶尔', '没有', '现在就在看'], replies: ['……那我也在看你。', '看来藏得不够好。', '嗯，我发现了。'] }
  ];
  let _tcuSessionTriggered = false;

  // v3.6.x：增量合并（规则同 taAskMerge：只加新预设、绝不删用户自定义、结果持久化）
  function tcuMerge(d) {
    const ids = {};
    (d.questions || []).forEach(q => { if (q && q.id) ids[q.id] = true; });
    const merged = Array.isArray(d.mergedIds) ? d.mergedIds.slice() : [];
    const mergedSet = {};
    merged.forEach(id => { if (id) mergedSet[id] = true; });
    let changed = false;
    TCU_DEFAULT.forEach(q => {
      if (!mergedSet[q.id] && !ids[q.id]) {
        const nq = { id: q.id, cat: q.cat, text: q.text, quick: (q.quick || []).slice(), replies: (q.replies || []).slice(), followup: q.followup || '', enabled: true };
        nq.isPreset = true; // v3.6.x：系统预设标记——预设只可启停、不可删除
        d.questions.push(nq);
        changed = true;
      }
    });
    TCU_DEFAULT.forEach(q => {
      if (!mergedSet[q.id]) { merged.push(q.id); mergedSet[q.id] = true; changed = true; }
    });
    // v3.6.x：老数据里的预设题补 isPreset 标记
    TCU_DEFAULT.forEach(q => {
      if (ids[q.id] && d.questions.some(x => x && x.id === q.id && x.isPreset !== true)) {
        d.questions.forEach(x => { if (x && x.id === q.id) x.isPreset = true; });
        changed = true;
      }
    });
    if (changed) d.mergedIds = merged;
    return changed;
  }
  function tcuLoad() {
    let d = null;
    try { d = JSON.parse(store.get(KEY3) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
    // 迁移：cw4 选项「你身边」→「我身边」（已存数据与历史答案同步修正）
    if (Array.isArray(d.questions)) {
      let migrated = false;
      d.questions.forEach(q => {
        if (q && q.id === 'cw4' && Array.isArray(q.quick)) {
          q.quick = q.quick.map(o => o === '你身边' ? '我身边' : o);
          migrated = true;
        }
      });
      if (migrated) { try { store.set(KEY3, JSON.stringify(d)); } catch (e) {} }
    }
    if (Array.isArray(d.history)) {
      d.history.forEach(h => {
        if (h && h.my === '你身边') h.my = '我身边';
      });
    }
    if (!d.settings || typeof d.settings !== 'object') d.settings = { enabled: true, prob: 15, followup: true };
    // v3.6.x：是否使用系统预设问题（默认开启）
    if (d.settings.useDefault === undefined) d.settings.useDefault = true;
    if (!Array.isArray(d.questions) || !d.questions.length) {
      const isNew = !store.get(KEY3);
      d.questions = TCU_DEFAULT.map(q => {
        const nq = { id: q.id, cat: q.cat, text: q.text, quick: (q.quick || []).slice(), replies: (q.replies || []).slice(), followup: q.followup || '', enabled: true };
        nq.isPreset = true;
        return nq;
      });
      d.mergedIds = TCU_DEFAULT.map(q => q.id);
      if (!isNew) { try { store.set(KEY3, JSON.stringify(d)); } catch (e) {} }
    } else {
      // 增量合并默认题库新增的题并持久化（用户自定义永远保留）
      if (tcuMerge(d)) { try { store.set(KEY3, JSON.stringify(d)); } catch (e) {} }
    }
    if (!Array.isArray(d.history)) d.history = [];
    if (!d.known || typeof d.known !== 'object') d.known = {};
    return d;
  }
  function tcuSave(d) { try { store.set(KEY3, JSON.stringify(d)); } catch (e) {} }
  // v3.6.x：useDefault=false 时不抽取系统预设（isPreset）题
  function tcuPick(d) {
    const useDefault = (d.settings || {}).useDefault !== false;
    const pool = (d.questions && d.questions.length) ? d.questions : TCU_DEFAULT;
    let qs = pool.filter(q => q.enabled !== false && q.text && !(q.id && d.known[q.id]) && (useDefault || !q.isPreset));
    if (!qs.length) qs = TCU_DEFAULT.filter(q => !d.known[q.id]);
    if (!qs.length) qs = TCU_DEFAULT.slice();
    return qs[Math.floor(Math.random() * qs.length)];
  }
  function tcuPush(q, opts) {
    if (!window.chatAddSystem) return;
    _tcuSessionTriggered = true;
    const d = tcuLoad();
    d.lastCuriousAt = Date.now();
    tcuSave(d);
    let popup = true;
    if (opts && typeof opts.popupProb === 'number') popup = Math.random() * 100 < opts.popupProb;
    else if (opts && opts.popup === false) popup = false;
    window.chatAddSystem('TA对你有点好奇。');
    const el = window.chatAddSystem(q.text, {
      special: 'ask-curious', curiousQuestion: q.text, curiousQuick: q.quick || [], curiousReplies: q.replies || [],
      curiousFollowup: q.followup || '', curiousQid: q.id || '', curiousCat: q.cat || ''
    });
    const idx = el ? Number(el.dataset.idx) : -1;
    if (popup) setTimeout(() => { if (idx >= 0 && window.openCurious && !cardPopupBusy()) window.openCurious(idx); }, 400);
  }
  function maybeTriggerTCU() {
    try {
      if (document.hidden) return; // v3.5.127：后台不触发
      const d = tcuLoad();
      const s = d.settings || { enabled: true, prob: 15, popupProb: 70 };
      if (s.enabled === false) return;
      if (_tcuSessionTriggered) return;
      if (Date.now() - (d.lastCuriousAt || 0) < 30 * 60000) return;
      if (Math.random() * 100 >= (typeof s.prob === 'number' ? s.prob : 15)) return;
      const q = tcuPick(d);
      if (!q) return;
      tcuPush(q, { popupProb: askPopupProb(s) });
    } catch (e) {}
  }
  setTimeout(maybeTriggerTCU, 90000);
  setInterval(maybeTriggerTCU, 240000);

  // 好奇回答弹窗（快捷回复 + 自由输入）
  window.openCurious = function (msgIdx) {
    msgIdx = locateCardIdx(msgIdx, 'ask-curious', 'curiousStatus');
    if (msgIdx < 0) return;
    let rec = null;
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) rec = msgs[msgIdx];
    } catch (e) {}
    if (!rec || rec.special !== 'ask-curious') return;
    if (rec.curiousStatus === 'answered') { showCuriousResult(msgIdx); return; }
    const mask = document.getElementById('qa-mask');
    const body = document.getElementById('qa-body');
    const title = document.getElementById('qa-title');
    if (!mask || !body) return;
    if (title) title.textContent = 'Ta的好奇';
    let html = '<div class="qa-hint">TA有点好奇</div><div class="qa-q">' + String(rec.curiousQuestion || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>';
    const quicks = rec.curiousQuick || [];
    if (quicks.length) {
      html += '<div class="qa-quicks">' + quicks.map(x => '<span class="qa-chip" data-v="' + String(x).replace(/"/g, '&quot;') + '">' + String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</span>').join('') + '</div>';
    }
    html += '<input id="qa-input" class="qa-input" type="text" placeholder="输入你的回答…">';
    html += '<button class="qa-send" id="qa-send">告诉TA</button>';
    body.innerHTML = html;
    mask.hidden = false;
    body.querySelectorAll('.qa-chip').forEach(c => {
      c.addEventListener('click', () => {
        const inp = document.getElementById('qa-input');
        if (inp) inp.value = c.dataset.v;
      });
    });
    const send = () => {
      const inp = document.getElementById('qa-input');
      const answer = inp ? inp.value.trim() : '';
      if (!answer) { toast('告诉TA点什么吧'); return; }
      submitCurious(msgIdx, answer);
    };
    document.getElementById('qa-send').addEventListener('click', send);
    const inp = document.getElementById('qa-input');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) send(); });
    setTimeout(() => inp.focus(), 60);
  };
  function submitCurious(msgIdx, answer) {
    let rec = getCardAt(msgIdx);
    if (!rec || rec.special !== 'ask-curious') {
      msgIdx = locateCardIdx(msgIdx, 'ask-curious', 'curiousStatus');
      if (msgIdx < 0) return;
      rec = getCardAt(msgIdx);
    }
    if (!rec || rec.special !== 'ask-curious' || rec.curiousStatus === 'answered') return;
    const replies = (rec.curiousReplies && rec.curiousReplies.length) ? rec.curiousReplies : TCU_FALLBACK.slice();
    const reply = replies[Math.floor(Math.random() * replies.length)];
    // v3.5.128：不再预写 rec 字段——getChatMsgs 是 chat.js 内存对象引用，
    // 预写会让 chatCuriousReply 的 curiousStatus 守卫早退（回答消息丢失）
    const d = tcuLoad();
    const qid = rec.curiousQid || ('q_' + String(rec.curiousQuestion || ''));
    d.known[qid] = answer;
    d.history.unshift({ q: rec.curiousQuestion, my: answer, reply: reply, cat: rec.curiousCat || '', ts: Date.now() });
    tcuSave(d);
    // 30% 自然追问
    const followup = rec.curiousFollowup;
    const s = d.settings || { followup: true };
    const fw = (s.followup !== false && followup && Math.random() < 0.3) ? followup : null;
    // 持久化 + 推消息统一由 chatCuriousReply 完成
    if (window.chatCuriousReply) window.chatCuriousReply(msgIdx, answer, reply, fw);
    document.getElementById('qa-mask').hidden = true;
    if (window.openTC) { /* noop */ }
  }
  function showCuriousResult(msgIdx) {
    let rec = null;
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) rec = msgs[msgIdx];
    } catch (e) {}
    if (!rec) return;
    const mask = document.getElementById('qa-mask');
    const body = document.getElementById('qa-body');
    const title = document.getElementById('qa-title');
    if (!mask || !body) return;
    if (title) title.textContent = 'Ta的好奇';
    body.innerHTML = '<div class="qa-q">' + String(rec.curiousQuestion || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>' +
      '<div class="qa-mine">你说：' + String(rec.curiousAnswer || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>' +
      '<div class="qa-reply"><b>TA：</b>“' + String(rec.curiousReply || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '”</div>' +
      '<div class="qa-close" id="qa-close2">收起来</div>';
    mask.hidden = false;
    document.getElementById('qa-close2').addEventListener('click', () => { mask.hidden = true; });
  }

  // 好奇管理页
  function renderTCUManage() {
    const d = tcuLoad();
    const s = d.settings || { enabled: true, prob: 15, popupProb: 70, followup: true };
    const enEl = document.getElementById('tcu-enable');
    if (enEl) enEl.checked = s.enabled !== false;
    const defEl = document.getElementById('tcu-default');
    if (defEl) defEl.checked = s.useDefault !== false;
    const popEl = document.getElementById('tcu-popup');
    const popVal = document.getElementById('tcu-popup-val');
    const pp = askPopupProb(s);
    if (popEl) popEl.value = pp;
    if (popVal) popVal.textContent = pp + '%';
    const probEl = document.getElementById('tcu-prob');
    const probVal = document.getElementById('tcu-prob-val');
    if (probEl) probEl.value = typeof s.prob === 'number' ? s.prob : 15;
    if (probVal) probVal.textContent = (typeof s.prob === 'number' ? s.prob : 15) + '%';
    const fuEl = document.getElementById('tcu-followup');
    if (fuEl) fuEl.checked = s.followup !== false;
    const kcEl = document.getElementById('tcu-known-count');
    if (kcEl) kcEl.textContent = '· 已了解 ' + Object.keys(d.known).length + ' 件';
    // 题库
    const catsEl = document.getElementById('tcu-cats');
    if (catsEl) {
      const useDefault = s.useDefault !== false;
      let html = '';
      TCU_CAT_ORDER.forEach(k => {
        html += '<div class="tc-cat-t">' + (TCU_CAT_LABEL[k] || k) + '</div>';
        const arr = d.questions.filter(q => q.cat === k);
        if (!arr.length) html += '<div class="ta-empty">暂无</div>';
        arr.forEach(q => {
          const idx = d.questions.indexOf(q);
          const known = q.id && d.known[q.id];
          const preset = q.isPreset === true;
          // v3.6.x：系统预设只可启停、不可删除（不渲染删除按钮）；关闭「使用系统预设」时整体灰化提示
          const delBtn = preset ? '' : '<button class="ta-del" data-idx="' + idx + '">✕</button>';
          html += '<div class="tc-qrow' + (q.enabled === false || (preset && !useDefault) ? ' off' : '') + '">' +
            '<label class="toggle"><input type="checkbox" data-idx="' + idx + '"' + (q.enabled !== false ? ' checked' : '') + '><span class="tk"></span></label>' +
            '<div class="tc-qmain"><div class="tc-qtext">' + String(q.text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + (known ? ' <span class="tc-known">✓已了解</span>' : '') + (preset ? ' <span class="tc-known">系统</span>' : '') + '</div>' +
            (q.quick && q.quick.length ? '<div class="tc-qopts">快捷：' + q.quick.join(' / ') + '</div>' : '') +
            '</div>' + delBtn + '</div>';
        });
      });
      catsEl.innerHTML = html;
      catsEl.querySelectorAll('input[data-idx]').forEach(cb => {
        cb.addEventListener('change', () => {
          const d2 = tcuLoad();
          const q = d2.questions[Number(cb.dataset.idx)];
          if (q) q.enabled = cb.checked;
          tcuSave(d2);
        });
      });
      catsEl.querySelectorAll('.ta-del').forEach(b => {
        b.addEventListener('click', () => {
          const d2 = tcuLoad();
          const q = d2.questions[Number(b.dataset.idx)];
          // v3.6.x：系统预设不可删除
          if (q && q.isPreset === true) { toast('系统预设问题不可删除，可关闭使用'); return; }
          d2.questions.splice(Number(b.dataset.idx), 1);
          tcuSave(d2);
          renderTCUManage();
        });
      });
    }
    // 已了解列表
    const knownEl = document.getElementById('tcu-known');
    if (knownEl) {
      const entries = [];
      for (const qid in d.known) if (d.known.hasOwnProperty(qid)) entries.push({ qid: qid, answer: d.known[qid] });
      if (!entries.length) knownEl.innerHTML = '<div class="ta-empty">TA 还没有了解你什么</div>';
      else knownEl.innerHTML = entries.map(en => {
        const q = TCU_DEFAULT.find(x => x.id === en.qid);
        const qText = q ? q.text : en.qid;
        return '<div class="tc-listitem"><div class="tc-li-q">' + (q ? '[' + (TCU_CAT_LABEL[q.cat] || '') + '] ' : '') + qText + '</div><div class="tc-li-line">✓ 你：' + String(en.answer).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div></div>';
      }).join('');
    }
  }
  // 好奇入口
  const liTCU = document.getElementById('li-ta-curious');
  const tcuPage = document.getElementById('page-ta-curious');
  if (liTCU && tcuPage) {
    liTCU.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      tcuPage.hidden = false;
      renderTCUManage();
    });
  }
  const tcuBackBtn = document.getElementById('tc-curious-back');
  if (tcuBackBtn) {
    tcuBackBtn.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }
  const tcuEn = document.getElementById('tcu-enable');
  if (tcuEn) tcuEn.addEventListener('change', () => { const d = tcuLoad(); d.settings.enabled = tcuEn.checked; tcuSave(d); toast(tcuEn.checked ? 'Ta的好奇已开启' : 'Ta的好奇已关闭'); });
  const tcuDefault = document.getElementById('tcu-default');
  if (tcuDefault) tcuDefault.addEventListener('change', () => {
    const d = tcuLoad(); d.settings.useDefault = tcuDefault.checked; tcuSave(d);
    renderTCUManage();
    toast(tcuDefault.checked ? '系统预设问题已开启' : '系统预设问题已关闭（仅用你添加的问题）');
  });
  const tcuProb = document.getElementById('tcu-prob');
  if (tcuProb) tcuProb.addEventListener('input', () => {
    const d = tcuLoad(); d.settings.prob = parseInt(tcuProb.value, 10) || 15; tcuSave(d);
    const v = document.getElementById('tcu-prob-val'); if (v) v.textContent = tcuProb.value + '%';
    toast('触发概率已设为 ' + tcuProb.value + '%');
  });
  const tcuPopup = document.getElementById('tcu-popup');
  if (tcuPopup) tcuPopup.addEventListener('input', () => {
    const d = tcuLoad(); d.settings.popupProb = parseInt(tcuPopup.value, 10) || 0; tcuSave(d);
    const v = document.getElementById('tcu-popup-val'); if (v) v.textContent = tcuPopup.value + '%';
    toast('弹窗概率已设为 ' + tcuPopup.value + '%');
  });
  const tcuFu = document.getElementById('tcu-followup');
  if (tcuFu) tcuFu.addEventListener('change', () => { const d = tcuLoad(); d.settings.followup = tcuFu.checked; tcuSave(d); toast(tcuFu.checked ? 'TA 偶尔会自然追问' : 'TA 不再追问'); });
  const tcuAdd = document.getElementById('tcu-new-add');
  if (tcuAdd) {
    tcuAdd.addEventListener('click', () => {
      const catEl = document.getElementById('tcu-new-cat');
      const textEl = document.getElementById('tcu-new-text');
      const quickEl = document.getElementById('tcu-new-quick');
      const repliesEl = document.getElementById('tcu-new-replies');
      const followupEl = document.getElementById('tcu-new-followup');
      const text = textEl ? textEl.value.trim() : '';
      if (!text) { toast('请输入问题内容'); return; }
      const quick = (quickEl ? quickEl.value : '').split('|').map(s => s.trim()).filter(Boolean).slice(0, 4);
      let replies = (repliesEl ? repliesEl.value : '').split('|').map(s => s.trim()).filter(Boolean).slice(0, 4);
      if (!replies.length) replies = TCU_FALLBACK.slice(0, 2);
      const followup = followupEl ? followupEl.value.trim() : '';
      const d = tcuLoad();
      d.questions.push({ id: 'q_' + Date.now() + '_' + Math.floor(Math.random() * 9999), cat: catEl ? catEl.value : 'you', text: text, quick: quick, replies: replies, followup: followup, enabled: true, isPreset: false });
      tcuSave(d);
      [textEl, quickEl, repliesEl, followupEl].forEach(el => { if (el) el.value = ''; });
      renderTCUManage();
      toast('已添加问题');
    });
  }
  // 触发一次好奇（供管理页按钮 / 更多功能面板共用）
  window.triggerTaCuriousNow = function () {
    const d = tcuLoad();
    const q = tcuPick(d);
    if (!q) { toast('题库没有可用的问题'); return; }
    const s = d.settings || { enabled: true, prob: 15, popupProb: 70 };
    tcuPush(q, { popupProb: askPopupProb(s) });
    toast('TA 在聊天里向你好奇了');
  };
  const tcuNow = document.getElementById('tcu-now');
  if (tcuNow) tcuNow.addEventListener('click', () => window.triggerTaCuriousNow());
  const tcuClearKnown = document.getElementById('tcu-clear-known');
  if (tcuClearKnown) {
    tcuClearKnown.addEventListener('click', () => {
      if (window.openModal) {
        window.openModal('清空「已了解」记录？清空后相同问题可能再次出现。', '', () => {
          const d = tcuLoad(); d.known = {}; tcuSave(d); renderTCUManage();
        }, { noInput: true });
      }
    });
  }

  // ================= Ta的吐槽（复刻星言 ta的吐槽 完整版） =================
  // 定位：TA 偶尔突然吐槽你一句，然后回到正常聊天（熟悉/调侃/亲密为主，不是批评）
  const KEY4 = 'ta-roast';
  const TR_CAT_LABEL = { light: '轻微调侃', familiar: '熟悉感', sweet: '情侣式调侃', mild: '轻微嫌弃', serious: '严肃吐槽', world: '两个世界' };
  const TR_CAT_ORDER = ['light', 'familiar', 'sweet', 'mild', 'serious', 'world'];
  const TR_DEFAULT = [
    { id: 'rl1', cat: 'light', text: '你怎么又这样。' }, { id: 'rl2', cat: 'light', text: '我就知道。' }, { id: 'rl3', cat: 'light', text: '果然还是你。' },
    { id: 'rl4', cat: 'light', text: '你还真会。' }, { id: 'rl5', cat: 'light', text: '又来了。' }, { id: 'rl6', cat: 'light', text: '你是不是故意的？' },
    { id: 'rl7', cat: 'light', text: '你怎么这么随便。' }, { id: 'rl8', cat: 'light', text: '你真的很有自己的想法。' }, { id: 'rl9', cat: 'light', text: '我该说你什么好。' },
    { id: 'rl10', cat: 'light', text: '你还真是一点没变。' }, { id: 'rl11', cat: 'light', text: '行吧，又是你赢了。' }, { id: 'rl12', cat: 'light', text: '你可真行。' },
    { id: 'rl13', cat: 'light', text: '我早就猜到了。' }, { id: 'rl14', cat: 'light', text: '哈，我就知道会是这样。' },
    { id: 'rf1', cat: 'familiar', text: '我就知道你会选这个。' }, { id: 'rf2', cat: 'familiar', text: '你这个习惯什么时候能改。' }, { id: 'rf3', cat: 'familiar', text: '你每次都这样。' },
    { id: 'rf4', cat: 'familiar', text: '我太了解你了。' }, { id: 'rf5', cat: 'familiar', text: '你以为我不知道吗？' }, { id: 'rf6', cat: 'familiar', text: '这很像你会做的事。' },
    { id: 'rf7', cat: 'familiar', text: '果然还是那个你。' }, { id: 'rf8', cat: 'familiar', text: '你的小心思我都看见了。' }, { id: 'rf9', cat: 'familiar', text: '你以为自己藏得很好？' }, { id: 'rf10', cat: 'familiar', text: '我已经习惯了。' },
    { id: 'rs1', cat: 'sweet', text: '你怎么这么可爱。' }, { id: 'rs2', cat: 'sweet', text: '又开始撒娇了。' }, { id: 'rs3', cat: 'sweet', text: '你这样让我怎么办。' },
    { id: 'rs4', cat: 'sweet', text: '你是不是故意让我心软。' }, { id: 'rs5', cat: 'sweet', text: '怎么又黏过来了。' }, { id: 'rs6', cat: 'sweet', text: '谁允许你这么可爱的。' },
    { id: 'rs7', cat: 'sweet', text: '你真的很会招惹我。' }, { id: 'rs8', cat: 'sweet', text: '又想让我哄你了？' }, { id: 'rs9', cat: 'sweet', text: '你这样我还怎么凶你。' }, { id: 'rs10', cat: 'sweet', text: '真拿你没办法。' },
    { id: 'rm1', cat: 'mild', text: '你怎么这么笨。' }, { id: 'rm2', cat: 'mild', text: '你到底在想什么。' }, { id: 'rm3', cat: 'mild', text: '你这个人啊。' }, { id: 'rm4', cat: 'mild', text: '又把自己弄成这样。' },
    { id: 'rsg1', cat: 'serious', text: '你真的很会折腾自己。' }, { id: 'rsg2', cat: 'serious', text: '我服了你。' },
    { id: 'rmt1', cat: 'mild', text: '你怎么又熬夜。', match: ['熬夜', '没睡', '睡不着'] },
    { id: 'rmt2', cat: 'familiar', text: '我就知道你会忘。', match: ['忘了', '忘记', '忘带', '忘了带'] },
    { id: 'rmt3', cat: 'light', text: '你还真是一点都不客气。', match: ['吃了好多', '吃多了', '吃撑'] },
    { id: 'rmt4', cat: 'light', text: '终于知道休息了？', match: ['什么都不做', '躺平', '休息一下', '摆烂'] },
    // 两个世界（梦角设定：甜蜜安稳的调侃）
    { id: 'rw1', cat: 'world', text: '又想我了吧？我感觉得到。', match: ['想你', '想你了', '在想你'] },
    { id: 'rw2', cat: 'world', text: '你刚才是不是在偷偷感觉我有没有在？', match: ['你在吗', '在不在', '感觉到了'] },
    { id: 'rw3', cat: 'world', text: '说好让我好好陪你的，自己先睡着了。', match: ['困了', '要睡了', '晚安', '睡觉'] },
    { id: 'rw4', cat: 'world', text: '字卡发那么多条，是不是就想让我回你。', match: ['发了好多', '字卡', '怎么不回'] },
    { id: 'rw5', cat: 'world', text: '你摸到我的时候，明明笑了。', match: ['摸到了', '摸到你了', '感觉到了你'] },
    // 普通情侣轻松吐槽
    { id: 'rs11', cat: 'sweet', text: '又在等我的消息吧？', match: ['在吗', '怎么不回', '没回你'] },
    { id: 'rs12', cat: 'sweet', text: '说好的早睡呢？', match: ['晚安', '睡觉', '困了', '睡了'] },
    { id: 'rs13', cat: 'sweet', text: '一天没见就想我了吧？', match: ['想你', '想你了'] },
    { id: 'rf11', cat: 'familiar', text: '你是不是把我设成置顶了？', match: ['置顶', '聊天记录'] }
  ];
  let _trSessionTriggered = false;

  // v3.6.x：增量合并（规则同 taAskMerge：只加新预设、绝不删用户自定义、结果持久化）
  function trMerge(d) {
    const ids = {};
    (d.questions || []).forEach(q => { if (q && q.id) ids[q.id] = true; });
    const merged = Array.isArray(d.mergedIds) ? d.mergedIds.slice() : [];
    const mergedSet = {};
    merged.forEach(id => { if (id) mergedSet[id] = true; });
    let changed = false;
    TR_DEFAULT.forEach(q => {
      if (!mergedSet[q.id] && !ids[q.id]) {
        const nq = { id: q.id, cat: q.cat, text: q.text, match: (q.match || []).slice(), enabled: true };
        nq.isPreset = true; // v3.6.x：系统预设标记——预设只可启停、不可删除
        d.questions.push(nq);
        changed = true;
      }
    });
    TR_DEFAULT.forEach(q => {
      if (!mergedSet[q.id]) { merged.push(q.id); mergedSet[q.id] = true; changed = true; }
    });
    // v3.6.x：老数据里的预设字卡补 isPreset 标记
    TR_DEFAULT.forEach(q => {
      if (ids[q.id] && d.questions.some(x => x && x.id === q.id && x.isPreset !== true)) {
        d.questions.forEach(x => { if (x && x.id === q.id) x.isPreset = true; });
        changed = true;
      }
    });
    if (changed) d.mergedIds = merged;
    return changed;
  }
  function trLoad() {
    let d = null;
    try { d = JSON.parse(store.get(KEY4) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
    if (!d.settings || typeof d.settings !== 'object') d.settings = { enabled: true, prob: 30 };
    // v3.6.x：是否使用系统预设字卡（默认开启）
    if (d.settings.useDefault === undefined) d.settings.useDefault = true;
    if (!Array.isArray(d.questions) || !d.questions.length) {
      const isNew = !store.get(KEY4);
      d.questions = TR_DEFAULT.map(q => {
        const nq = { id: q.id, cat: q.cat, text: q.text, match: (q.match || []).slice(), enabled: true };
        nq.isPreset = true;
        return nq;
      });
      d.mergedIds = TR_DEFAULT.map(q => q.id);
      if (!isNew) { try { store.set(KEY4, JSON.stringify(d)); } catch (e) {} }
    } else {
      // 增量合并默认题库新增的字卡并持久化（用户自定义永远保留）
      if (trMerge(d)) { try { store.set(KEY4, JSON.stringify(d)); } catch (e) {} }
    }
    if (!Array.isArray(d.history)) d.history = [];
    return d;
  }
  function trSave(d) { try { store.set(KEY4, JSON.stringify(d)); } catch (e) {} }
  // v3.6.x：useDefault=false 时不抽取系统预设（isPreset）字卡
  function trPick(d, lastUserText) {
    const useDefault = (d.settings || {}).useDefault !== false;
    const pool = (d.questions && d.questions.length) ? d.questions : TR_DEFAULT;
    if (lastUserText) {
      const matched = pool.filter(q => q.enabled !== false && Array.isArray(q.match) && q.match.length && (useDefault || !q.isPreset) && q.match.some(k => lastUserText.indexOf(k) >= 0));
      if (matched.length) return matched[Math.floor(Math.random() * matched.length)];
    }
    let qs = pool.filter(q => q.enabled !== false && (useDefault || !q.isPreset));
    if (!qs.length) qs = TR_DEFAULT.slice();
    return qs[Math.floor(Math.random() * qs.length)];
  }
  function trPush(q, opts) {
    if (!window.chatAddSystem) return;
    _trSessionTriggered = true;
    const d = trLoad();
    d.lastRoastAt = Date.now();
    trSave(d);
    let popup = true;
    if (opts && typeof opts.popupProb === 'number') popup = Math.random() * 100 < opts.popupProb;
    else if (opts && opts.popup === false) popup = false;
    window.chatAddSystem('TA吐槽了你一句。');
    const el = window.chatAddSystem(q.text, { special: 'ask-roast', roastText: q.text, roastCat: q.cat || 'light' });
    const idx = el ? Number(el.dataset.idx) : -1;
    if (popup) setTimeout(() => { if (idx >= 0 && window.openRoast && !cardPopupBusy()) window.openRoast(idx); }, 400);
  }
  function lastUserMsg() {
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i] && msgs[i].side === 'out' && msgs[i].text && typeof msgs[i].text === 'string') return msgs[i].text;
      }
    } catch (e) {}
    return '';
  }
  function maybeTriggerTR() {
    try {
      if (document.hidden) return; // v3.5.127：后台不触发
      const d = trLoad();
      const s = d.settings || { enabled: true, prob: 30, popupProb: 70 };
      if (s.enabled === false) return;
      if (_trSessionTriggered) return;
      if (Date.now() - (d.lastRoastAt || 0) < 30 * 60000) return;
      if (Math.random() * 100 < (typeof s.prob === 'number' ? s.prob : 30)) {
        const q = trPick(d, lastUserMsg());
        if (q) trPush(q, { popupProb: askPopupProb(s) });
      }
    } catch (e) {}
  }
  setTimeout(maybeTriggerTR, 120000);
  setInterval(maybeTriggerTR, 300000);

  // 吐槽回应弹窗
  window.openRoast = function (msgIdx) {
    msgIdx = locateCardIdx(msgIdx, 'ask-roast', 'roastStatus');
    if (msgIdx < 0) return;
    let rec = null;
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) rec = msgs[msgIdx];
    } catch (e) {}
    if (!rec || rec.special !== 'ask-roast') return;
    if (rec.roastStatus === 'answered') { showRoastResult(msgIdx); return; }
    const mask = document.getElementById('qa-mask');
    const body = document.getElementById('qa-body');
    const title = document.getElementById('qa-title');
    if (!mask || !body) return;
    if (title) title.textContent = 'Ta的吐槽';
    body.innerHTML = '<div class="qa-hint">TA 吐槽你</div><div class="qa-q">“' + String(rec.roastText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '”</div>' +
      '<input id="qa-input" class="qa-input" type="text" placeholder="回 TA 一句…">' +
      '<button class="qa-send" id="qa-send">回TA一句</button>';
    mask.hidden = false;
    const send = () => {
      const inp = document.getElementById('qa-input');
      const answer = inp ? inp.value.trim() : '';
      if (!answer) { toast('回TA一句吧'); return; }
      submitRoast(msgIdx, answer);
    };
    document.getElementById('qa-send').addEventListener('click', send);
    const inp = document.getElementById('qa-input');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) send(); });
    setTimeout(() => inp.focus(), 60);
  };
  function submitRoast(msgIdx, answer) {
    let rec = getCardAt(msgIdx);
    if (!rec || rec.special !== 'ask-roast') {
      msgIdx = locateCardIdx(msgIdx, 'ask-roast', 'roastStatus');
      if (msgIdx < 0) return;
      rec = getCardAt(msgIdx);
    }
    if (!rec || rec.special !== 'ask-roast' || rec.roastStatus === 'answered') return;
    const defs = ['你觉得我会信？', '少骗我。', '哼。', '好吧好吧。', '就这一次？', '行吧，放过你。', '嗯，这还差不多。'];
    const reply = defs[Math.floor(Math.random() * defs.length)];
    // v3.5.128：不再预写 rec 字段——getChatMsgs 是 chat.js 内存对象引用，
    // 预写会让 chatRoastReply 的 roastStatus 守卫早退（回应消息丢失）
    const d = trLoad();
    d.history.unshift({ roast: rec.roastText, my: answer, reply: reply, cat: rec.roastCat || '', ts: Date.now() });
    trSave(d);
    // 持久化 + 推消息统一由 chatRoastReply 完成
    if (window.chatRoastReply) window.chatRoastReply(msgIdx, answer, reply);
    document.getElementById('qa-mask').hidden = true;
  }
  function showRoastResult(msgIdx) {
    let rec = null;
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) rec = msgs[msgIdx];
    } catch (e) {}
    if (!rec) return;
    const mask = document.getElementById('qa-mask');
    const body = document.getElementById('qa-body');
    const title = document.getElementById('qa-title');
    if (!mask || !body) return;
    if (title) title.textContent = 'Ta的吐槽';
    body.innerHTML = '<div class="qa-q">“' + String(rec.roastText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '”</div>' +
      '<div class="qa-mine">你说：' + String(rec.roastAnswer || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>' +
      '<div class="qa-reply"><b>TA：</b>“' + String(rec.roastReply || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '”</div>' +
      '<div class="qa-close" id="qa-close2">收起来</div>';
    mask.hidden = false;
    document.getElementById('qa-close2').addEventListener('click', () => { mask.hidden = true; });
  }

  // 吐槽管理页
  function renderTRManage() {
    const d = trLoad();
    const s = d.settings || { enabled: true, prob: 30, popupProb: 70 };
    const enEl = document.getElementById('tr-enable');
    if (enEl) enEl.checked = s.enabled !== false;
    const defEl = document.getElementById('tr-default');
    if (defEl) defEl.checked = s.useDefault !== false;
    const popEl = document.getElementById('tr-popup');
    const popVal = document.getElementById('tr-popup-val');
    const pp = askPopupProb(s);
    if (popEl) popEl.value = pp;
    if (popVal) popVal.textContent = pp + '%';
    const probEl = document.getElementById('tr-prob');
    const probVal = document.getElementById('tr-prob-val');
    if (probEl) probEl.value = typeof s.prob === 'number' ? s.prob : 30;
    if (probVal) probVal.textContent = (typeof s.prob === 'number' ? s.prob : 30) + '%';
    const catsEl = document.getElementById('tr-cats');
    if (catsEl) {
      const useDefault = s.useDefault !== false;
      let html = '';
      TR_CAT_ORDER.forEach(k => {
        html += '<div class="tc-cat-t">' + (TR_CAT_LABEL[k] || k) + '</div>';
        const arr = d.questions.filter(q => q.cat === k);
        if (!arr.length) html += '<div class="ta-empty">暂无</div>';
        arr.forEach(q => {
          const idx = d.questions.indexOf(q);
          const preset = q.isPreset === true;
          // v3.6.x：系统预设只可启停、不可删除（不渲染删除按钮）；关闭「使用系统预设」时整体灰化提示
          const delBtn = preset ? '' : '<button class="ta-del" data-idx="' + idx + '">✕</button>';
          html += '<div class="tc-qrow' + (q.enabled === false || (preset && !useDefault) ? ' off' : '') + '">' +
            '<label class="toggle"><input type="checkbox" data-idx="' + idx + '"' + (q.enabled !== false ? ' checked' : '') + '><span class="tk"></span></label>' +
            '<div class="tc-qmain"><div class="tc-qtext">' + String(q.text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + (preset ? ' <span class="tc-known">系统</span>' : '') + '</div>' +
            (q.match && q.match.length ? '<div class="tc-qopts">触发：' + q.match.join(' / ') + '</div>' : '') +
            '</div>' + delBtn + '</div>';
        });
      });
      catsEl.innerHTML = html;
      catsEl.querySelectorAll('input[data-idx]').forEach(cb => {
        cb.addEventListener('change', () => {
          const d2 = trLoad();
          const q = d2.questions[Number(cb.dataset.idx)];
          if (q) q.enabled = cb.checked;
          trSave(d2);
        });
      });
      catsEl.querySelectorAll('.ta-del').forEach(b => {
        b.addEventListener('click', () => {
          const d2 = trLoad();
          const q = d2.questions[Number(b.dataset.idx)];
          // v3.6.x：系统预设不可删除
          if (q && q.isPreset === true) { toast('系统预设字卡不可删除，可关闭使用'); return; }
          d2.questions.splice(Number(b.dataset.idx), 1);
          trSave(d2);
          renderTRManage();
        });
      });
    }
  }
  // 吐槽入口
  const liTR = document.getElementById('li-ta-roast');
  const trPage = document.getElementById('page-ta-roast');
  if (liTR && trPage) {
    liTR.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      trPage.hidden = false;
      renderTRManage();
    });
  }
  const trBackBtn = document.getElementById('tc-roast-back');
  if (trBackBtn) {
    trBackBtn.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }
  const trEn = document.getElementById('tr-enable');
  if (trEn) trEn.addEventListener('change', () => { const d = trLoad(); d.settings.enabled = trEn.checked; trSave(d); toast(trEn.checked ? 'Ta的吐槽已开启' : 'Ta的吐槽已关闭'); });
  const trDefault = document.getElementById('tr-default');
  if (trDefault) trDefault.addEventListener('change', () => {
    const d = trLoad(); d.settings.useDefault = trDefault.checked; trSave(d);
    renderTRManage();
    toast(trDefault.checked ? '系统预设字卡已开启' : '系统预设字卡已关闭（仅用你添加的字卡）');
  });
  const trProb = document.getElementById('tr-prob');
  if (trProb) trProb.addEventListener('input', () => {
    const d = trLoad(); d.settings.prob = parseInt(trProb.value, 10) || 30; trSave(d);
    const v = document.getElementById('tr-prob-val'); if (v) v.textContent = trProb.value + '%';
    toast('触发概率已设为 ' + trProb.value + '%');
  });
  const trPopup = document.getElementById('tr-popup');
  if (trPopup) trPopup.addEventListener('input', () => {
    const d = trLoad(); d.settings.popupProb = parseInt(trPopup.value, 10) || 0; trSave(d);
    const v = document.getElementById('tr-popup-val'); if (v) v.textContent = trPopup.value + '%';
    toast('弹窗概率已设为 ' + trPopup.value + '%');
  });
  const trAdd = document.getElementById('tr-new-add');
  if (trAdd) {
    trAdd.addEventListener('click', () => {
      const catEl = document.getElementById('tr-new-cat');
      const textEl = document.getElementById('tr-new-text');
      const matchEl = document.getElementById('tr-new-match');
      const text = textEl ? textEl.value.trim() : '';
      if (!text) { toast('请输入吐槽内容'); return; }
      const match = (matchEl ? matchEl.value : '').split('|').map(s => s.trim()).filter(Boolean).slice(0, 4);
      const d = trLoad();
      d.questions.push({ id: 'r_' + Date.now() + '_' + Math.floor(Math.random() * 9999), cat: catEl ? catEl.value : 'light', text: text, match: match, enabled: true, isPreset: false });
      trSave(d);
      if (textEl) textEl.value = '';
      if (matchEl) matchEl.value = '';
      renderTRManage();
      toast('已添加吐槽字卡');
    });
  }
  // 触发一次吐槽（供管理页按钮 / 更多功能面板共用）
  window.triggerTaRoastNow = function () {
    const d = trLoad();
    const q = trPick(d, '');
    if (!q) { toast('题库没有可用吐槽'); return; }
    const s = d.settings || { enabled: true, prob: 30, popupProb: 70 };
    trPush(q, { popupProb: askPopupProb(s) });
    toast('TA 在聊天里吐槽你了');
  };
  const trNow = document.getElementById('tr-now');
  if (trNow) trNow.addEventListener('click', () => window.triggerTaRoastNow());
  const qaClose = document.getElementById('qa-mask-close');
  if (qaClose) qaClose.addEventListener('click', () => { document.getElementById('qa-mask').hidden = true; });

  // ================= 提问记录页（桌面第二页） =================
  // 集中展示 TA的询问 / TA的小问题 / Ta的好奇 / Ta的吐槽 的历史记录
  function fmtDT(ts) {
    const dd = new Date(ts);
    return ('0' + dd.getHours()).slice(-2) + ':' + ('0' + dd.getMinutes()).slice(-2) + ' ' + ((dd.getMonth() + 1) + '月' + dd.getDate() + '日');
  }
  window.renderAskRecords = function () {
    // TA的询问
    const askEl = document.getElementById('ar-ask');
    if (askEl) {
      const h = taAskLoad().history || [];
      askEl.innerHTML = h.length
        ? h.slice().reverse().map(x => '<div class="tc-listitem"><div class="tc-li-q">问：' + x.q + '</div><div class="tc-li-line">你：' + x.a + '</div>' + (x.reply ? '<div class="tc-li-line">TA：' + x.reply + '</div>' : '') + '<div class="tc-li-time">' + fmtDT(x.ts) + '</div></div>').join('')
        : '<div class="ta-empty">暂无询问记录</div>';
    }
    // TA的小问题
    const chEl = document.getElementById('ar-choose');
    if (chEl) {
      const h = tcLoad().history || [];
      chEl.innerHTML = h.length
        ? h.slice().reverse().map(x => '<div class="tc-listitem"><div class="tc-li-q">' + x.q + '</div><div class="tc-li-line">你的选择：' + x.my + '</div><div class="tc-li-line">TA：' + x.reply + '</div><div class="tc-li-match">' + x.match + '</div><div class="tc-li-time">' + fmtDT(x.ts) + '</div></div>').join('')
        : '<div class="ta-empty">暂无小问题记录</div>';
    }
    // Ta的好奇
    const cuEl = document.getElementById('ar-curious');
    if (cuEl) {
      const h = tcuLoad().history || [];
      cuEl.innerHTML = h.length
        ? h.slice().reverse().map(x => '<div class="tc-listitem"><div class="tc-li-q">' + x.q + '</div><div class="tc-li-line">你：' + x.my + '</div><div class="tc-li-line">TA：' + x.reply + '</div><div class="tc-li-time">' + fmtDT(x.ts) + '</div></div>').join('')
        : '<div class="ta-empty">暂无好奇记录</div>';
    }
    // Ta的吐槽
    const roEl = document.getElementById('ar-roast');
    if (roEl) {
      const h = trLoad().history || [];
      roEl.innerHTML = h.length
        ? h.slice().reverse().map(x => '<div class="tc-listitem"><div class="tc-li-q">' + x.roast + '</div><div class="tc-li-line">你：' + x.my + '</div><div class="tc-li-line">TA：' + x.reply + '</div><div class="tc-li-time">' + fmtDT(x.ts) + '</div></div>').join('')
        : '<div class="ta-empty">暂无吐槽记录</div>';
    }
    // 邀请 / 问问 TA（我的提问 + 联系人答案）
    const inEl = document.getElementById('ar-invite');
    if (inEl) {
      let h = [];
      try { h = JSON.parse(store.get('invite-ask-history') || '[]'); } catch (e) {}
      inEl.innerHTML = h.length
        ? h.map(x => '<div class="tc-listitem"><div class="tc-li-q">' +
            (x.type === 'invite' ? '邀请：' : '问：') + String(x.q || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>' +
            '<div class="tc-li-line">TA：' + String(x.a || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>' +
            '<div class="tc-li-time">' + fmtDT(x.ts) + '</div></div>').join('')
        : '<div class="ta-empty">暂无邀请/问问记录</div>';
    }
  };
  // 清空按钮
  const clearBind = (id, loader, saver) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (window.openModal) {
        window.openModal('清空该分类的全部记录？', '', () => {
          const d = loader(); d.history = []; saver(d); window.renderAskRecords();
        }, { noInput: true });
      }
    });
  };
  clearBind('ar-ask-clear', taAskLoad, taAskSave);
  clearBind('ar-choose-clear', tcLoad, tcSave);
  clearBind('ar-curious-clear', tcuLoad, tcuSave);
  clearBind('ar-roast-clear', trLoad, trSave);
  // 邀请/问问清空
  const arInviteClear = document.getElementById('ar-invite-clear');
  if (arInviteClear) {
    arInviteClear.addEventListener('click', () => {
      if (window.openModal) {
        window.openModal('清空全部邀请/问问记录？', '', () => {
          store.set('invite-ask-history', '[]');
          window.renderAskRecords();
        }, { noInput: true });
      }
    });
  }

  // 提问记录：横排 4 个分类 tab 切换
  document.querySelectorAll('#page-interact .fav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#page-interact .fav-tab').forEach(x => x.classList.toggle('sel', x === tab));
      const k = tab.dataset.tab;
      document.querySelectorAll('#page-interact .cal-card').forEach(c => {
        c.hidden = c.dataset.panel !== k;
      });
      if (window.renderAskRecords) window.renderAskRecords();
    });
  });

  // ================= 字卡库入口数字（动态显示各题库实际数量） =================
  window.refreshTaCardCounts = function () {
    const set = (id, n) => {
      const el = document.querySelector('#' + id + ' .t');
      if (el) el.textContent = n;
    };
    try { set('li-ta-ask', taAskLoad().questions.length); } catch (e) {}
    try { set('li-ta-choose', tcLoad().questions.length); } catch (e) {}
    try { set('li-ta-curious', tcuLoad().questions.length); } catch (e) {}
    try { set('li-ta-roast', trLoad().questions.length); } catch (e) {}
  };
  // 字卡库页可见时刷新（初始加载、从管理页返回、增删题库后都会更新）
  const ccPageEl = document.getElementById('page-chatcard');
  if (ccPageEl) {
    const mo = new MutationObserver(() => { if (!ccPageEl.hidden) window.refreshTaCardCounts(); });
    mo.observe(ccPageEl, { attributes: true, attributeFilter: ['hidden'] });
  }
  window.refreshTaCardCounts();

  // ================= IndexedDB 权威恢复（四个题库共用，v3.6.x） =================
  // localStorage 配额写失败、或大键只进 IDB 时，本地快照会停留在旧数据，
  // 用户新添加的字卡（只存在于 IDB）启动后读不到 → 看起来"消失"。
  // 启动时从 IDB 读回：若 IDB 题库比本地更全，用 IDB 数据做基准合并新预设后
  // 双写覆盖（策略同 chatcard.js cc-groups——IDB 是权威持久层，本地只是快照；
  // 反向场景 idbSet 偶尔失败而本地已最新时，IDB 数量更少 → 不覆盖，不会丢数据）。
  function attachIdbRestore(key, loadFn, mergeFn) {
    if (!window.idbGet) return;
    window.idbGet(uid + ':' + key).then(function (v) {
      if (v === undefined || v === null) return;
      try {
        const idbData = typeof v === 'string' ? JSON.parse(v) : v;
        if (!idbData || typeof idbData !== 'object' || Array.isArray(idbData)) return;
        if (!Array.isArray(idbData.questions) || !idbData.questions.length) return;
        const local = loadFn();
        const idbCnt = idbData.questions.length;
        const localCnt = Array.isArray(local.questions) ? local.questions.length : 0;
        if (idbCnt > localCnt) {
          // 以 IDB 为权威（含用户自定义），合并系统预设新增题后双写
          if (mergeFn) mergeFn(idbData);
          try { store.set(key, JSON.stringify(idbData)); } catch (e) {}
          try { window.refreshTaCardCounts(); } catch (e) {}
        }
      } catch (e) {}
    });
  }
  attachIdbRestore(KEY, taAskLoad, taAskMerge);
  attachIdbRestore(KEY2, tcLoad, tcMerge);
  attachIdbRestore(KEY3, tcuLoad, tcuMerge);
  attachIdbRestore(KEY4, trLoad, trMerge);
})();
