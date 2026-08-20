// ===== 功能：帮我决定（仿星言简约版【帮我决定】完整版） =====
// 类型A：是/否/半对 随机决定；类型B：自定义选项随机决定
// 思考时间倒计时、最多选几个（可多选）、决定结果、历史记录
// 结果可发送到聊天（联系人回复样式）
// 功能参考：小红书@FelixFelicis（9416318007）
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  const HISTORY_KEY = 'decision-history';
  const SETTINGS_KEY = 'decision-settings';

  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }
  function partnerName() { return store.get('lbl-partner') || 'TA'; }
  function fmtDT(ts) {
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  // v3.6.x：恢复窗口保护——IDB 权威恢复完成前不落盘，防止用空数组覆盖
  // IndexedDB 里的全部历史（历史超 200KB 只存 IDB，恢复完成前 store.get 读到
  // 空数组，直接写会丢历史）。暂存待写，恢复完成后与 IDB 合并去重再写入。
  let histReady = false;
  let histPending = null;
  // v3.6.x：历史数据损坏（非数组）时返回空数组，避免 unshift/map 抛错中断
  function loadHistory() { try { const v = JSON.parse(store.get(HISTORY_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function saveHistory(h) {
    if (!histReady) {
      try { histPending = Array.isArray(h) ? h.slice() : []; } catch (e) {}
      return;
    }
    store.set(HISTORY_KEY, JSON.stringify(h));
  }
  function flushPendingHist() {
    if (!histPending) return;
    const pending = histPending;
    histPending = null;
    if (!pending.length) return;
    const finish = (base) => {
      try { store.set(HISTORY_KEY, JSON.stringify(base)); } catch (e) {}
      try { renderHistory(); } catch (e) {}
    };
    const merge = (base) => {
      const have = {};
      base.forEach(x => { if (x && x.ts !== undefined) have[x.ts] = true; });
      pending.forEach(x => { if (x && x.ts !== undefined && !have[x.ts]) { base.push(x); have[x.ts] = true; } });
      finish(base);
    };
    if (window.idbGet) {
      window.idbGet(window.activePrefix() + ':' + HISTORY_KEY).then(v => {
        let base = [];
        try { const p = typeof v === 'string' ? JSON.parse(v) : v; if (Array.isArray(p)) base = p; } catch (e) {}
        merge(base);
      }).catch(() => merge(loadHistory()));
    } else {
      merge(loadHistory());
    }
  }
  try {
    document.addEventListener('mochi-restore-done', function () {
      histReady = true;
      flushPendingHist();
    });
  } catch (e) {}
  // v3.6.x：多桌面——切换联系人后重置历史权威状态（防止旧桌面的 histPending 串入新桌面）
  document.addEventListener('contact-switched', function () {
    try { histReady = true; histPending = null; } catch (e) {}
  });
  // v3.6.x：思考时间 / 最多选几个 也持久化——之前每次打开面板都重置回默认值
  // （关掉面板再打开，「帮我决定时间」又得重新设置）
  function loadSettings() {
    const d = { replyToChat: true, thinkA: 3, thinkB: 3, maxB: 1 };
    try { return Object.assign(d, JSON.parse(store.get(SETTINGS_KEY) || '{}')); } catch (e) { return d; }
  }
  function saveSettings(s) { store.set(SETTINGS_KEY, JSON.stringify(s)); }
  // v3.6.x：完整 HTML 转义（只转 < 可被 `&lt;…&gt;` 实体绕过注入）
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  let activeTab = 'typea';
  let countdownTimer = null;
  let decideTimer = null; // v3.6.x：结果 setTimeout 句柄——防连点导致历史/聊天消息重复

  // ---- 聊天页底部半框（v3.5.53 露出聊天消息，星言式）----
  const panel = document.getElementById('chat-decision-panel');
  const body = document.getElementById('chat-decision-body');
  // v3.6.x：面板 DOM 只构建一次（不再每次打开都 innerHTML 重建），
  // 打开时仅恢复设置 + 切回默认 tab——避免反复重建导致的闪烁/焦点丢失
  function ensureBuilt() {
    if (!body || body.dataset.built) return;
    body.innerHTML = panelHtml();
    bindEvents();
    body.dataset.built = '1';
  }
  function openPanel() {
    if (!body || !panel) return;
    ensureBuilt();
    activeTab = 'typea';
    document.querySelectorAll('#chat-decision-body .dc-tab').forEach(tb => tb.classList.toggle('sel', tb.dataset.dtab === 'typea'));
    document.querySelectorAll('#chat-decision-body .dc-panel').forEach(p => { p.hidden = p.dataset.dpanel !== 'typea'; });
    applySettings();
    panel.hidden = false;
  }
  function closePanel() {
    if (panel) panel.hidden = true;
  }
  function panelHtml() {
    return '' +
      '<div class="dc-tabs"><button class="dc-tab sel" data-dtab="typea">是/否/半对</button>' +
      '<button class="dc-tab" data-dtab="typeb">自定义选项</button>' +
      '<button class="dc-tab" data-dtab="history">历史记录</button></div>' +
      '<div class="dc-panel" data-dpanel="typea">' +
      '<div class="sm-fld"><label>输入你的纠结</label><div class="dec-inp-wrap"><textarea class="tc-input" id="dec-q-a" rows="3" placeholder="例如：我今晚该吃火锅吗？"></textarea><button class="dec-inp-clear" data-clear="dec-q-a" aria-label="清空" title="清空">✕</button></div></div>' +
      '<div class="gs-row"><span>思考时间（秒）</span><div class="stepper" id="dec-think-a" data-min="1" data-max="10" data-step="1"><button class="stp-min">−</button><input class="stp-val" id="dec-think-a-val" readonly><button class="stp-max">+</button></div></div>' +
      '<button class="ta-add-btn" style="width:100%;margin-top:10px" id="dec-go-a">让对方决定</button>' +
      '<div class="dc-result" id="dec-result-a" hidden></div></div>' +
      '<div class="dc-panel" data-dpanel="typeb" hidden>' +
      '<div class="sm-fld"><label>输入你的纠结</label><div class="dec-inp-wrap"><textarea class="tc-input" id="dec-q-b" rows="2" placeholder="例如：我今晚该吃什么？"></textarea><button class="dec-inp-clear" data-clear="dec-q-b" aria-label="清空" title="清空">✕</button></div></div>' +
      '<div class="sm-fld"><label>输入选项（每行一个）</label><div class="dec-inp-wrap"><textarea class="tc-input" id="dec-opts" rows="4" placeholder="吃火锅&#10;吃烧烤&#10;吃日料"></textarea><button class="dec-inp-clear" data-clear="dec-opts" aria-label="清空" title="清空">✕</button></div></div>' +
      '<div class="gs-row"><span>思考时间（秒）</span><div class="stepper" id="dec-think-b" data-min="1" data-max="10" data-step="1"><button class="stp-min">−</button><input class="stp-val" id="dec-think-b-val" readonly><button class="stp-max">+</button></div></div>' +
      '<div class="gs-row"><span>最多选几个</span><div class="stepper" id="dec-max-b" data-min="1" data-max="5" data-step="1"><button class="stp-min">−</button><input class="stp-val" id="dec-max-b-val" readonly><button class="stp-max">+</button></div></div>' +
      '<button class="ta-add-btn" style="width:100%;margin-top:10px" id="dec-go-b">让对方决定</button>' +
      '<div class="dc-result" id="dec-result-b" hidden></div></div>' +
      '<div class="dc-panel" data-dpanel="history" hidden>' +
      '<div class="sm-set-row"><span>结果发送到聊天</span><label class="toggle"><input type="checkbox" id="dec-reply-chat"><span class="tk"></span></label></div>' +
      '<div id="dec-history"></div></div>' +
      '<div class="dc-credit">帮我决定功能参考：小红书@FelixFelicis（9416318007）</div>';
  }
  // 恢复设置：思考时间 / 最多选几个 / 结果发送到聊天
  function applySettings() {
    const s = loadSettings();
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    setVal('dec-think-a-val', s.thinkA);
    setVal('dec-think-b-val', s.thinkB);
    setVal('dec-max-b-val', s.maxB);
    const rc = document.getElementById('dec-reply-chat');
    if (rc) rc.checked = !!s.replyToChat;
  }
  function bindEvents() {
    const scope = '#chat-decision-body';
    // tab 切换
    document.querySelectorAll(scope + ' .dc-tab').forEach(tb => {
      tb.addEventListener('click', () => {
        activeTab = tb.dataset.dtab;
        document.querySelectorAll(scope + ' .dc-tab').forEach(x => x.classList.toggle('sel', x === tb));
        document.querySelectorAll(scope + ' .dc-panel').forEach(p => { p.hidden = p.dataset.dpanel !== activeTab; });
        if (activeTab === 'history') renderHistory();
      });
    });
    // 思考时间 / 最多选几个 stepper（点击即持久化，关掉面板再打开不重置）
    const sMap = { 'dec-think-a': 'thinkA', 'dec-think-b': 'thinkB', 'dec-max-b': 'maxB' };
    Object.keys(sMap).forEach(id => {
      const st = document.getElementById(id);
      if (!st) return;
      const val = st.querySelector('.stp-val');
      const min = parseInt(st.dataset.min, 10), max = parseInt(st.dataset.max, 10);
      const save = (v) => { const s = loadSettings(); s[sMap[id]] = v; saveSettings(s); };
      st.querySelector('.stp-min').addEventListener('click', () => {
        const nv = Math.max(min, parseInt(val.value, 10) - 1);
        val.value = nv; save(nv);
      });
      st.querySelector('.stp-max').addEventListener('click', () => {
        const nv = Math.min(max, parseInt(val.value, 10) + 1);
        val.value = nv; save(nv);
      });
    });
    // 决定按钮
    const goA = document.getElementById('dec-go-a');
    if (goA) goA.addEventListener('click', () => makeDecision('typea'));
    const goB = document.getElementById('dec-go-b');
    if (goB) goB.addEventListener('click', () => makeDecision('typeb'));
    // v3.6.x：输入框一键清空按钮——直接清空对应输入框（contenteditable 转换的 ghost
    // input 的 value 已代理到 box，读 value 再置空即可；box 用 textContent 清空）
    document.querySelectorAll(scope + ' .dec-inp-clear').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.clear;
        const ta = document.getElementById(id);
        if (!ta) return;
        // 手机端 contenteditable 转换器下，原 textarea 已退场为 ghost，value 代理到 box
        const box = ta.__ceBox;
        if (box) box.textContent = '';
        else ta.value = '';
        ta.focus();
        toast('已清空');
      });
    });
    // 回复到聊天开关
    const rc = document.getElementById('dec-reply-chat');
    if (rc) { rc.addEventListener('change', () => { const s = loadSettings(); s.replyToChat = rc.checked; saveSettings(s); }); }
  }

  function makeDecision(type) {
    // v3.6.x：防连点/中途再点——先取消上一轮的倒计时与结果定时器，避免
    // 「帮我决定」历史与聊天消息重复（旧 setTimeout 仍会执行导致重复写入）
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (decideTimer) { clearTimeout(decideTimer); decideTimer = null; }
    let question, thinkTime, maxSelect;
    if (type === 'typea') {
      question = (document.getElementById('dec-q-a').value || '').trim();
      thinkTime = parseInt(document.getElementById('dec-think-a-val').value, 10) || 3;
      maxSelect = 1; // 是/否/半对：固定单选，最多选几个只用于自定义选项
    } else {
      question = (document.getElementById('dec-q-b').value || '').trim();
      thinkTime = parseInt(document.getElementById('dec-think-b-val').value, 10) || 3;
      maxSelect = parseInt(document.getElementById('dec-max-b-val').value, 10) || 1;
    }
    if (!question) { toast('请输入你的问题'); return; }
    let options = null;
    if (type === 'typeb') {
      const optsText = (document.getElementById('dec-opts').value || '').trim();
      if (!optsText) { toast('请输入选项'); return; }
      options = optsText.split('\n').map(o => o.trim()).filter(Boolean);
      if (options.length < 2) { toast('至少需要 2 个选项'); return; }
    }
    const resultEl = document.getElementById(type === 'typea' ? 'dec-result-a' : 'dec-result-b');
    resultEl.hidden = false;
    resultEl.classList.remove('done');
    resultEl.textContent = '对方正在思考中… ' + thinkTime + ' 秒';
    let count = thinkTime;
    countdownTimer = setInterval(() => {
      count--;
      if (count > 0) resultEl.textContent = '对方正在思考中… ' + count + ' 秒';
    }, 1000);
    // v3.6.x：结果定时器存入 decideTimer（倒计时结束自动清；重复点击先取消旧轮）
    decideTimer = setTimeout(() => {
      decideTimer = null;
      if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
      let result;
      if (type === 'typea') {
        const pool = ['是', '否', '半对', '这个我不选', '正在忙，暂未回复'];
        const shuffled = pool.slice().sort(() => Math.random() - 0.5);
        const n = Math.floor(Math.random() * maxSelect) + 1;
        result = shuffled.slice(0, Math.min(n, shuffled.length)).join('、');
      } else {
        const pool = options.slice().concat(['这个我不选', '正在忙，暂未回复']);
        const shuffled = pool.slice().sort(() => Math.random() - 0.5);
        const n = Math.floor(Math.random() * maxSelect) + 1;
        result = shuffled.slice(0, Math.min(n, shuffled.length)).join('、');
      }
      resultEl.textContent = result;
      resultEl.classList.add('done');
      // 历史记录（全部保存）
      const h = loadHistory();
      h.unshift({ id: 'd_' + Date.now(), type: type, question: question, result: result, options: options, ts: Date.now() });
      if (h.length > 1000) h.splice(1000);
      saveHistory(h);
      // 发送到聊天（联系人回复样式）
      if (loadSettings().replyToChat) {
        const replyText = type === 'typeb' && options
          ? '【帮我决定】' + question + '\n选项：\n' + options.map((o, i) => (i + 1) + '. ' + o).join('\n') + '\n→ ' + result
          : '【帮我决定】' + question + ' → ' + result;
        if (window.chatAddIn) window.chatAddIn(replyText, { enter: true });
      }
      toast('帮我决定已完成');
    }, thinkTime * 1000);
  }

  function renderHistory() {
    const el = document.getElementById('dec-history');
    if (!el) return;
    const h = loadHistory();
    el.innerHTML = h.length
      ? h.map(r =>
          '<div class="tc-listitem">' +
          '<div class="tc-li-q">' + esc(r.question) + '</div>' +
          (r.options && r.options.length ? '<div class="dc-h-options">选项：' + r.options.map((o, i) => (i + 1) + '. ' + esc(o)).join('，') + '</div>' : '') +
          '<div class="dc-h-result">→ ' + esc(r.result) + '</div>' +
          '<div class="dc-h-time">' + fmtDT(r.ts) + '</div></div>'
        ).join('')
      : '<div class="ta-empty">暂无帮我决定记录</div>';
  }

  // 入口：聊天更多功能 → 帮我决定（chat.js 里 more-decide 调用）
  window.openDecision = openPanel;
})();
