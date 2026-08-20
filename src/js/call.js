// ===== 功能：完整通话系统（仿星言简约版） =====
// 来电：全屏弹窗（头像/名称/对方来电 + 接听/拒绝 + 30 秒倒计时未接）
// 去电：拨打 → 忙线/拒绝/接通/未接 概率
// 接通：显示通话时长，2 秒后最小化为通话小框（底部悬浮，可挂断）
// 概率（与星言一致）：来电 15% / 接通 70% / 忙线 15% / 拒绝 15% / 对方挂断 2%（接通满 3 分钟后每 60 秒检查）
// 来电触发：TA 回复消息/主动发消息后按概率掷一次 + 独立定时器每 30 秒兜底检查（5 分钟冷却）
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  const CALL = { incoming: 15, pickup: 70, busy: 15, reject: 15, hangup: 2 };
  // 从回复设置读取（可自由调整概率，与星言通话设置一致）
  function callCfg() {
    const c = (window.replyCfg && window.replyCfg()) || {};
    return {
      incoming: c['call-incoming'] !== undefined ? c['call-incoming'] : CALL.incoming,
      pickup: c['call-pickup'] !== undefined ? c['call-pickup'] : CALL.pickup,
      busy: c['call-busy'] !== undefined ? c['call-busy'] : CALL.busy,
      reject: c['call-reject'] !== undefined ? c['call-reject'] : CALL.reject,
      hangup: c['call-hangup'] !== undefined ? c['call-hangup'] : CALL.hangup
    };
  }

  // 通话背景（v3.5.50）：设置页上传图片 → 应用到大面板 + 通话小框
  const CALL_BG_KEY = 'call-bg';
  function applyCallBg() {
    const bg = store.get(CALL_BG_KEY) || '';
    const panel = document.querySelector('.call-panel');
    const miniEl = document.getElementById('call-mini');
    [panel, miniEl].forEach(el => {
      if (!el) return;
      if (bg) {
        el.style.backgroundImage = 'url("' + bg + '")';
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.classList.add('has-bg');
      } else {
        el.style.backgroundImage = '';
        el.classList.remove('has-bg');
      }
    });
    const val = document.getElementById('call-bg-val');
    if (val) val.textContent = bg ? '已设置' : '默认';
    const rm = document.getElementById('call-bg-remove');
    if (rm) rm.hidden = !bg;
  }
  const callBgRow = document.getElementById('call-bg-row');
  if (callBgRow) {
    callBgRow.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            try {
              const scale = Math.min(1, 600 / Math.max(img.width, img.height));
              const c = document.createElement('canvas');
              c.width = Math.max(1, Math.round(img.width * scale));
              c.height = Math.max(1, Math.round(img.height * scale));
              c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
              const data = c.toDataURL('image/jpeg', 0.85);
              store.set(CALL_BG_KEY, data);
              applyCallBg();
              toast('通话背景已设置');
            } catch (e) {
              toast('图片处理失败');
            }
          };
          img.onerror = () => toast('图片读取失败');
          img.src = reader.result;
        };
        reader.onerror = () => toast('图片读取失败');
        reader.readAsDataURL(f);
      };
      input.click();
    });
  }
  const callBgRm = document.getElementById('call-bg-remove');
  if (callBgRm) {
    callBgRm.addEventListener('click', () => {
      store.remove(CALL_BG_KEY);
      applyCallBg();
      toast('已恢复默认通话背景');
    });
  }
  // v3.5.94：通话背景大键可能只存在 IndexedDB（导入兜底写入/大键只进 IDB）→ 启动补读后重新应用
  // v3.6.x：修复——这段补读原本被错位写进「上传背景图片」的回调里，只在用户上传图片时才执行，
  //   页面加载时从不运行，导致导入数据后通话背景无法从 IndexedDB 恢复；移回模块顶层随加载执行
  try {
    if (window.idbGet) {
      const myPrefix = window.activePrefix();
      window.idbGet(myPrefix + ':' + CALL_BG_KEY).then(v => {
        if (window.activePrefix() !== myPrefix) return;
        if (v && typeof v === 'string' && v.length > 2 && !store.get(CALL_BG_KEY)) {
          store.set(CALL_BG_KEY, v);
          applyCallBg();
        }
      });
    }
  } catch (e) {}
  applyCallBg();

  // v3.7.x：通话小框开关（每联系人桌面独立，默认开启）
  //   - 开启：接通后 2 秒自动最小化为底部悬浮小框（原行为）
  //   - 隐藏：接通后保持通话大面板常驻；点「缩小」收起进后台，不显示悬浮小框
  const CALL_MINI_KEY = 'call-mini-enabled';
  function callMiniEnabled() {
    try { return store.get(CALL_MINI_KEY) !== '0'; } catch (e) { return true; }
  }
  window.getCallMiniEnabled = function () { return callMiniEnabled(); };
  window.setCallMiniEnabled = function (v) {
    try { store.set(CALL_MINI_KEY, v ? '1' : '0'); } catch (e) {}
  };

  // ---- 来电 / 去电 / 通话中 ----
  let currentCall = null; // { direction, status, startTime, connectedTime, timer }
  let durationTimer = null;

  const mask = document.getElementById('call-mask');
  const mini = document.getElementById('call-mini');
  const avEl = document.getElementById('call-av');
  const nameEl = document.getElementById('call-name');
  const statusEl = document.getElementById('call-status');
  const durEl = document.getElementById('call-duration');
  const cdEl = document.getElementById('call-countdown');
  const hangBtn = document.getElementById('call-hang-btn');
  const rejectBtn = document.getElementById('call-reject-btn');
  const answerBtn = document.getElementById('call-answer-btn');
  const miniBtn = document.getElementById('call-minimize-btn');
  const miniAv = document.getElementById('call-mini-av');
  const miniName = document.getElementById('call-mini-name');
  const miniTime = document.getElementById('call-mini-time');
  // 小框位置持久化（可拖动）
  // v3.5.108：校验保存的位置有效（形如「数字px」且在视口内），
  //   无效/越界/空值一律忽略并清除，回退默认底部居中——避免旧坏数据导致小框闪到别处
  let miniPos = null;
  try { miniPos = JSON.parse(store.get('call-mini-pos') || 'null'); } catch (e) {}
  function miniPosValid(p) {
    if (!p || typeof p !== 'object') return false;
    const lm = String(p.left || '').match(/^(-?\d+(\.\d+)?)px$/);
    const tm = String(p.top || '').match(/^(-?\d+(\.\d+)?)px$/);
    if (!lm || !tm) return false;
    const x = parseFloat(lm[1]), y = parseFloat(tm[1]);
    if (isNaN(x) || isNaN(y)) return false;
    if (x < 0 || x > window.innerWidth - 30) return false;
    if (y < 0 || y > window.innerHeight - 30) return false;
    return true;
  }
  if (miniPos && mini && miniPosValid(miniPos)) {
    mini.style.left = miniPos.left;
    mini.style.top = miniPos.top;
    mini.style.bottom = 'auto';
    mini.style.transform = 'none';
  } else if (miniPos) {
    // 旧坏数据：清除，用默认底部居中
    try { store.remove('call-mini-pos'); } catch (e) {}
    miniPos = null;
  }

  function partnerName() { return store.get('lbl-partner') || 'TA'; }
  function partnerAv() { return store.get('avatar-partner') || ''; }
  // v3.6.x：通话绑定归属桌面（cid + 昵称 + 头像）——通话中切换到其他联系人桌面再挂断时，
  // 文案与记录仍归属发起通话的桌面，不会显示成当前桌面的联系人
  function bindCall(callObj) {
    callObj.cid = window.__activeCid || 'default';
    callObj.name = partnerName();
    callObj.av = partnerAv();
    return callObj;
  }
  function fillAv(el, data) {
    if (!el) return;
    // v3.6.x：img 用属性赋值（dataURL 含引号时拼 innerHTML 会逃逸注入 HTML）
    el.innerHTML = '';
    if (data) {
      const img = document.createElement('img');
      img.src = data;
      img.alt = '头像';
      el.appendChild(img);
    } else {
      el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg>';
    }
  }
  // v3.7.x：通话中头像实时跟随——联系人换头像（头像库手动/自动/设置页）后，
  // 通话大面板与小框同步刷新；按归属桌面读 avatar-partner（跨桌面通话仍显示正确的 TA）
  let shownAv = null;
  function syncCallAv() {
    if (!currentCall) return;
    let av = '';
    try {
      const s = (window.storeFor && window.storeFor(currentCall.cid)) || store;
      av = s.get('avatar-partner') || '';
    } catch (e) { av = currentCall.av || partnerAv(); }
    if (av === shownAv) return;
    shownAv = av;
    fillAv(avEl, av);
    fillAv(miniAv, av);
  }
  function fmtDur(sec) {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }
  function setMaskBtns(mode) {
    // mode: 'ringing' 来电(接听/拒绝) | 'calling' 去电中(挂断+缩小) | 'active' 通话中(挂断+缩小) | 'none'
    if (hangBtn) hangBtn.hidden = !(mode === 'calling' || mode === 'active');
    if (rejectBtn) rejectBtn.hidden = !(mode === 'ringing');
    if (answerBtn) answerBtn.hidden = !(mode === 'ringing');
    if (miniBtn) miniBtn.hidden = !(mode === 'calling' || mode === 'active');
  }
  // 缩小到小框（弹层 → 底部小框；小框被隐藏时仅收起大面板，通话转后台）
  // v3.7.x：通话小框开关关闭 → 不显示悬浮小框（后台通话，经通话半框挂断）
  function minimizeCall() {
    if (!currentCall) return;
    if (mask) mask.hidden = true;
    if (cdEl) cdEl.hidden = true;
    if (mini) {
      if (callMiniEnabled()) {
        if (miniName) miniName.textContent = currentCall.name || partnerName();
        syncCallAv();
        mini.hidden = false;
      } else {
        mini.hidden = true;
      }
    }
  }
  function stopTimers() {
    if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
  }
  function updateDur() {
    if (!currentCall) return;
    const sec = Math.floor((Date.now() - currentCall.startTime) / 1000);
    if (durEl) durEl.textContent = fmtDur(sec);
    if (miniTime) miniTime.textContent = fmtDur(sec);
  }
  // 进入通话中：计时 + 状态
  function startCallDuration() {
    stopTimers();
    currentCall.connectedTime = Date.now();
    let checkCount = 0;
    durationTimer = setInterval(() => {
      updateDur();
      syncCallAv();
      // 对方挂断概率：接通 3 分钟保护期后，每 60 秒检查一次
      // v3.6.x：放宽——原实现 10 秒保护后每 30 秒掷一次，默认 5% 实际效果远超设置字面值
      //（约 3 分钟累计 ~23% 被挂断、10 分钟内累计 ~62%），用户反馈「3 分钟左右自动挂断、
      // 没一通超过 10 分钟」；改 3 分钟保护 + 60 秒周期后，挂断概率才接近设置的字面含义
      if (currentCall && currentCall.status === 'connected') {
        if (Date.now() - currentCall.connectedTime >= 180000) {
          checkCount++;
          if (checkCount >= 60) {
            checkCount = 0;
            if (Math.random() * 100 < callCfg().hangup) {
              endCall('对方挂断了电话');
            }
          }
        }
      }
    }, 1000);
  }
  // 通话结束信息写入归属桌面（v3.6.x 修复跨桌面挂断显示成当前联系人）：
  // 当前桌面走内存链路（实时渲染/未读角标）；非当前桌面直接写该桌面 IDB 聊天记录
  // + LS 快照 + 通话记录存储（该桌面 msgs 内存已在 contact-switched 时重置，
  // 下次进入由 loadMsgs 从 IDB 读回）
  function notifyCallEnd(cid, sysHtml, recType, recText) {
    const cur = window.__activeCid || 'default';
    if (cid === cur) {
      if (window.chatAddSystem) window.chatAddSystem(sysHtml);
      if (window.addCallRecord) window.addCallRecord(recType, recText);
      return;
    }
    const prefix = 'xy-home-v2:' + cid;
    try {
      if (window.idbGet && window.idbSet) {
        window.idbGet(prefix + ':chat-msgs').then(v => {
          let arr = [];
          try { arr = Array.isArray(v) ? v : JSON.parse(v || '[]'); } catch (e) { arr = []; }
          if (!Array.isArray(arr)) arr = [];
          arr.push({ side: 'in', special: 'poke', text: sysHtml, ts: Date.now() });
          try { window.idbSet(prefix + ':chat-msgs', JSON.stringify(arr)); } catch (e) {}
          try { localStorage.setItem(prefix + ':chat-msgs', JSON.stringify(arr)); } catch (e) {}
        }).catch(() => {});
      }
    } catch (e) {}
    try {
      const s = (window.storeFor && window.storeFor(cid)) || store;
      let list = [];
      try { list = JSON.parse(s.get('records-call') || '[]'); } catch (e) { list = []; }
      if (!Array.isArray(list)) list = [];
      list.unshift({ type: recType, text: recText, ts: Date.now() });
      s.set('records-call', JSON.stringify(list.slice(0, 50)));
    } catch (e) {}
  }
  // 结束通话：清界面 + 聊天系统消息（接通过必带时长）+ 记录
  // v3.5.51：真实时长从 startTime 计算（覆盖对方挂断/不明原因中断路径）；
  //   接通后结束 → 系统消息明确「通话已挂断 / 对方已挂断 · 时长 xx」
  function endCall(text) {
    // v3.5.127：所有结束路径（超时/拒绝/挂断/对方挂断）统一停铃声
    if (window.stopSfx) window.stopSfx('ring');
    // v3.5.129：通话结束恢复音乐播放/悬浮小框
    if (window.musicHoldForCall) window.musicHoldForCall(false);
    stopTimers();
    if (mask) mask.hidden = true;
    if (mini) mini.hidden = true;
    if (cdEl) cdEl.hidden = true;
    if (currentCall) {
      // 真实通话时长：durationSec（接通后已计时）兜底用 startTime 计算
      const dur = currentCall.durationSec || (currentCall.connectedTime ? Math.max(0, Math.floor((Date.now() - currentCall.connectedTime) / 1000)) : 0);
      const dir = currentCall.direction;
      // v3.6.x：姓名用通话绑定的桌面（通话中切桌面后挂断不显示成当前联系人）
      const name = currentCall.name || partnerName();
      const durTxt = dur > 0 ? ' · 时长 ' + fmtDur(dur) : '';
      // 接通过 → 系统消息明确「挂断/对方挂断/中断 + 时长」；未接通保持原结果文案
      // v3.5.129：只有真正接通（connectedTime 存在）才改写文案+加时长——
      // 否则"未接听/忙线/拒绝/取消"都会被误标成「通话已结束 · 时长 xx」
      let resText = text;
      if (dur > 0 && currentCall.connectedTime) {
        if (text === '对方挂断了电话') resText = '对方已挂断';
        else if (text === '已挂断') resText = '通话已挂断';
        else resText = '通话已结束'; // 不明原因中断等
        resText += durTxt;
      }
      notifyCallEnd(currentCall.cid || 'default', '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>' + (dir === 'in' ? name + ' 来电' : '我拨打 ' + name) + ' · ' + resText, dir, text + (dur ? '（' + fmtDur(dur) + '）' : ''));
    }
    currentCall = null;
    shownAv = null;
  }
  // v3.5.129：响铃中切后台（锁屏/切走）→ 停铃声并结束来电——
  // 后台无法接听，30 秒干响没有意义（安卓后台音频还会常驻媒体通知）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && currentCall && currentCall.status === 'ringing') {
      endCall('未接听');
    }
  });
  // v3.6.x：通话弹层开始时先关闭大图查看器——img-view-mask z-index 高于 call-mask，
  // 不关的话来电/去电面板被大图完全盖住，接听/拒绝按钮点不到
  function closeImageOverlay() {
    try {
      const iv = document.getElementById('img-view-mask');
      if (iv) iv.hidden = true;
    } catch (e) {}
  }
  // 来电
  function incomingCall() {
    if (currentCall) return;
    closeImageOverlay();
    // v3.5.60：来电播放设置的铃声音效
    if (window.playSfx) window.playSfx('ring');
    // v3.5.129：来电暂停音乐 + 隐藏悬浮小框（避免铃声+音乐同响、小框遮挡接听按钮）
    if (window.musicHoldForCall) window.musicHoldForCall(true);
    // v3.5.127：来电时收起输入法（键盘会盖住通话面板下半部的接听/拒绝按钮）
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
    const name = partnerName();
    currentCall = bindCall({ direction: 'in', status: 'ringing', startTime: Date.now(), durationSec: 0 });
    shownAv = null;
    syncCallAv();
    if (nameEl) nameEl.textContent = name;
    if (statusEl) statusEl.textContent = '对方来电...';
    if (durEl) durEl.textContent = '00:00';
    if (mask) mask.hidden = false;
    setMaskBtns('ringing');
    if (window.chatAddSystem) window.chatAddSystem('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>' +  name + ' 给你打来了语音通话');
    // 30 秒倒计时未接
    let count = 30;
    if (cdEl) { cdEl.hidden = false; cdEl.textContent = count + ' 秒后未接听'; }
    const t = setInterval(() => {
      if (!currentCall || currentCall.status !== 'ringing') { clearInterval(t); return; }
      syncCallAv();
      count--;
      if (count <= 0) {
        clearInterval(t);
        if (cdEl) cdEl.hidden = true;
        currentCall.status = 'ended';
        endCall('未接听');
      } else if (cdEl) {
        cdEl.textContent = count + ' 秒后未接听';
      }
    }, 1000);
  }
  // 接听
  function answerCall() {
    if (!currentCall || currentCall.status !== 'ringing') return;
    // v3.5.127：接听即停铃声（不走 endCall 路径）
    if (window.stopSfx) window.stopSfx('ring');
    currentCall.status = 'connected';
    if (cdEl) cdEl.hidden = true;
    if (nameEl) nameEl.textContent = partnerName();
    if (statusEl) statusEl.textContent = '正在通话...';
    setMaskBtns('active');
    if (window.chatAddSystem) window.chatAddSystem('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg> 通话已接通');
    startCallDuration();
    // 2 秒后最小化小框（星言一致）；v3.7.x：小框开关隐藏时保持大面板常驻
    setTimeout(() => {
      if (currentCall && currentCall.status === 'connected') {
        if (callMiniEnabled()) {
          if (mask) mask.hidden = true;
          if (mini) {
            if (miniName) miniName.textContent = currentCall.name || partnerName();
            syncCallAv();
            mini.hidden = false;
          }
        }
      }
    }, 2000);
  }
  // 拒绝
  function rejectCall() {
    if (!currentCall || currentCall.status !== 'ringing') return;
    currentCall.status = 'ended';
    endCall('已拒绝');
  }
  // 用户挂断（去电中或通话中）
  function userHangup() {
    if (!currentCall) return;
    if (currentCall.status === 'ringing') { currentCall.status = 'ended'; endCall('已取消'); return; }
    // v3.6.x：未接通（呼叫中取消）不算时长——endCall 只在 connectedTime 存在时才标注时长
    if (currentCall.connectedTime) currentCall.durationSec = Math.floor((Date.now() - currentCall.startTime) / 1000);
    currentCall.status = 'ended';
    endCall('已挂断');
  }
  // 去电：拨打 → 忙线/拒绝/接通/未接（星言概率）
  window.placeCall = function () {
    if (currentCall) { toast('已有通话中'); return; }
    const name = partnerName();
    currentCall = bindCall({ direction: 'out', status: 'calling', startTime: Date.now(), durationSec: 0 });
    // v3.6.x：绑定本次通话对象——结果定时器回调里校验 currentCall === callRef，
    // 否则「挂断后 3 秒内重拨」会让上一次的随机结果套到新通话上
    const callRef = currentCall;
    closeImageOverlay();
    // v3.6.x：去电同样暂停音乐 + 隐藏悬浮小框（与来电一致），挂断后才能自动恢复播放
    if (window.musicHoldForCall) window.musicHoldForCall(true);
    shownAv = null;
    syncCallAv();
    if (nameEl) nameEl.textContent = name;
    if (statusEl) statusEl.textContent = '正在呼叫...';
    if (durEl) durEl.textContent = '00:00';
    if (mask) mask.hidden = false;
    setMaskBtns('calling');
    if (window.chatAddSystem) window.chatAddSystem('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>' +  name + ' 语音通话');
    const r = Math.random() * 100;
    const cc = callCfg();
    setTimeout(() => {
      // v3.6.x：必须是本次通话仍在呼叫中才执行（挂断后重拨不套用旧结果）
      if (currentCall !== callRef || callRef.status !== 'calling') return;
      if (r < cc.busy) {
        callRef.status = 'ended'; endCall('忙线中');
      } else if (r < cc.busy + cc.reject) {
        callRef.status = 'ended'; endCall('对方已拒绝');
      } else if (r < cc.busy + cc.reject + cc.pickup) {
        callRef.status = 'connected';
        if (statusEl) statusEl.textContent = '正在通话...';
        startCallDuration();
        // v3.7.x：小框开关隐藏时接通后保持大面板常驻（不自动最小化）
        setTimeout(() => {
          if (currentCall === callRef && callRef.status === 'connected') {
            if (callMiniEnabled()) {
              if (mask) mask.hidden = true;
              if (mini) { if (miniName) miniName.textContent = callRef.name || partnerName(); syncCallAv(); mini.hidden = false; }
            }
          }
        }, 2000);
      } else {
        callRef.status = 'ended'; endCall('未接通');
      }
    }, 1800 + Math.random() * 1500);
  };
  // 按钮绑定
  if (answerBtn) answerBtn.addEventListener('click', answerCall);
  if (rejectBtn) rejectBtn.addEventListener('click', rejectCall);
  if (hangBtn) hangBtn.addEventListener('click', userHangup);
  if (miniBtn) miniBtn.addEventListener('click', minimizeCall);
  if (document.getElementById('call-mini-hang')) document.getElementById('call-mini-hang').addEventListener('click', userHangup);
  // 小框拖拽（pointer 事件，兼容鼠标/触摸）
  // v3.5.108：轻点/误触不再导致小框跳位——
  //   - pointerdown 不立即清 bottom（避免 top/bottom 同时 auto 时 fixed 元素跳到别处）
  //   - 只有真正移动（拖动）才切到拖动态：清 bottom + 设 left/top
  //   - pointerup 只在「真实拖动过」才保存位置，轻点不写入（防止存坏坐标）
  if (mini) {
    let dragging = false, moved = false, offX = 0, offY = 0;
    mini.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#call-mini-hang')) return; // 挂断按钮不触发拖动
      dragging = true;
      moved = false;
      const r = mini.getBoundingClientRect();
      offX = e.clientX - r.left;
      offY = e.clientY - r.top;
      mini.setPointerCapture && mini.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    mini.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (!moved) {
        // 首次移动：切换为拖动态（清除 bottom，避免与 top 同时存在导致拉伸）
        mini.style.bottom = 'auto';
        mini.style.transform = 'none';
        moved = true;
      }
      let x = e.clientX - offX, y = e.clientY - offY;
      const mw = mini.offsetWidth, mh = mini.offsetHeight;
      x = Math.max(4, Math.min(window.innerWidth - mw - 4, x));
      y = Math.max(4, Math.min(window.innerHeight - mh - 4, y));
      mini.style.left = x + 'px';
      mini.style.top = y + 'px';
    });
    const endDrag = () => { dragging = false; };
    mini.addEventListener('pointerup', endDrag);
    mini.addEventListener('pointercancel', endDrag);
    mini.addEventListener('pointerup', () => {
      // 只有真实拖动过才保存（位置有效）
      if (moved && mini.style.left && mini.style.top) {
        if (miniPos) { miniPos.left = mini.style.left; miniPos.top = mini.style.top; }
        else miniPos = { left: mini.style.left, top: mini.style.top };
        store.set('call-mini-pos', JSON.stringify(miniPos));
      }
    });
  }

  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }

  // ================= 联系人主动来电（星言机制：每 5 分钟冷却 + 来电概率） =================
  window.triggerIncomingCall = incomingCall;
  // 上次来电时间戳：首次约 1-2 分钟检查（原 2-5 分钟太久，用户会以为 TA 从不来电），
  // 之后每 30 秒检查一次（来电概率 + 冷却至少 5 分钟；与对方挂断机制同为周期检查）
  function callLast() { const v = parseInt(store.get('records-call-last'), 10); return isNaN(v) ? 0 : v; }
  function maybeIncoming() {
    try {
      if (document.hidden) return; // v3.5.127：后台不触发来电
      if (currentCall) return;
      const now = Date.now();
      // v3.6.x：冷却戳为未来时间（设备时钟被改动过）→ 按 0 处理，避免来电被永久锁死
      const last = Math.min(callLast(), now);
      if (now - last < 300000) return; // 5 分钟冷却
      if (Math.random() * 100 >= callCfg().incoming) return;
      store.set('records-call-last', String(now));
      incomingCall();
    } catch (e) {}
  }
  // v3.6.x：暴露给聊天模块——TA 回复消息/主动发消息后按「通话设置-来电概率」掷一次来电
  // （与 maybeMusicRequest 同模式：chat.js 只调 window 钩子，来电逻辑全在本模块）
  window.callMaybeTrigger = maybeIncoming;
  // v3.7.x：通话半框用的状态快照 + 挂断（chat.js 打开半框时每秒轮询显示）
  window.getCallState = function () {
    if (!currentCall) return null;
    const start = currentCall.connectedTime || currentCall.startTime;
    return {
      status: currentCall.status,           // ringing(来电) | calling(呼出中) | connected(通话中)
      direction: currentCall.direction,     // in | out
      name: currentCall.name || partnerName(),
      durationSec: Math.max(0, Math.floor((Date.now() - start) / 1000))
    };
  };
  window.hangupCall = function () { userHangup(); };
  setTimeout(() => {
    setInterval(maybeIncoming, 30000);
    maybeIncoming();
  }, (45 + Math.random() * 75) * 1000);
})();
