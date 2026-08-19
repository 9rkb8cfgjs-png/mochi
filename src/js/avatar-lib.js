// ===== 功能：头像互动（联系人头像池 + 我的头像池） =====
// 聊天页内底部半框：两个头像池——联系人头像池（按昵称命名）与我的头像池，
// 各自支持上传多张 + 删除单张 + 清空 + 开关
// 定时随机更换联系人聊天头像（1-8 小时）；更换时聊天显示"昵称 更换了头像"
// 我的头像池：联系人也会定时（1-8 小时）主动给我换头像——有概率直接换，
// 有概率弹窗邀请我同意/拒绝（机制与联系人随机换头像一致，计时独立）
// 上传/清空有成功/失败提示（toast）
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  const page = document.getElementById('page-chat-settings');
  if (!page) return;

  // 轻提示（全局唯一，带动画显示/隐藏）
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

  // 换头像邀请的回应概率（手动点击切换时触发）
  const INVITE_PROB = 50; // 触发"邀请/直接换"的概率 %（我换 TA 的：触发同意/拒绝回应；TA 换我的：触发弹窗邀请）
  const AGREE_PROB = 70;  // 触发回应时同意的概率 %（拒绝 = 100 - AGREE_PROB）

  // 联系人头像池
  function getLib() { try { return JSON.parse(store.get('avatar-lib') || '[]'); } catch (e) { return []; } }
  function saveLib(list) { store.set('avatar-lib', JSON.stringify(list)); }
  function getEnabled() { const v = store.get('avatar-lib-enabled'); return v === null ? true : v === '1'; }
  // 我的头像池
  function getMeLib() { try { return JSON.parse(store.get('avatar-me-lib') || '[]'); } catch (e) { return []; } }
  function saveMeLib(list) { store.set('avatar-me-lib', JSON.stringify(list)); }
  function getMeEnabled() { const v = store.get('avatar-me-lib-enabled'); return v === null ? true : v === '1'; }

  // ===== 功能：头像互动（原联系人头像库，改为聊天页内底部半框） =====
  // 半框展示头像池：上传多张 + 删除单张 + 清空 + 开关 + 点击切换（半框露出聊天消息，方便边看边玩）
  // 定时随机更换联系人聊天头像（1-8 小时）；更换时聊天显示"昵称 更换了头像"
  // 上传/清空有成功/失败提示（toast）
  const avPage = document.getElementById('avlib-card');
  const avGrid = document.getElementById('avlib-grid');
  const avCount = document.getElementById('avlib-count');
  const avEmpty = document.getElementById('avlib-empty');
  const avEnabled = document.getElementById('avlib-enabled');
  const avUpload = document.getElementById('avlib-upload');
  const avClear = document.getElementById('avlib-clear');
  const avName = document.getElementById('avlib-name');
  const avPoolName = document.getElementById('avlib-pool-name');
  const avMeGrid = document.getElementById('avlib-me-grid');
  const avMeCount = document.getElementById('avlib-me-count');
  const avMeEmpty = document.getElementById('avlib-me-empty');
  const avMeEnabled = document.getElementById('avlib-me-enabled');
  const avMeUpload = document.getElementById('avlib-me-upload');
  const avMeClear = document.getElementById('avlib-me-clear');
  const avTabA = document.getElementById('avlib-tab-a');
  const avTabB = document.getElementById('avlib-tab-b');
  const avPaneA = document.getElementById('avlib-pane-a');
  const avPaneB = document.getElementById('avlib-pane-b');
  const avMeTabName = document.getElementById('avlib-me-tab-name');

  function syncVal() {
    if (avEnabled) avEnabled.checked = getEnabled();
    if (avMeEnabled) avMeEnabled.checked = getMeEnabled();
    if (avName) avName.textContent = store.get('lbl-partner') || 'TA';
    if (avPoolName) avPoolName.textContent = (store.get('lbl-partner') || 'TA') + ' 的头像库';
    if (avMeTabName) {
      const myName = store.get('lbl-user');
      avMeTabName.textContent = myName ? myName + ' 的头像库' : '我的头像库';
    }
  }
  // 顶部页签切换：联系人头像库 / 我的头像库（点页签直接切换）
  function switchAvTab(me) {
    if (avTabA) avTabA.classList.toggle('active', !me);
    if (avTabB) avTabB.classList.toggle('active', me);
    if (avPaneA) avPaneA.hidden = me;
    if (avPaneB) avPaneB.hidden = !me;
  }
  function renderGrid() {
    if (!avGrid) return;
    const lib = getLib();
    const current = store.get('avatar-partner');
    avGrid.innerHTML = '';
    if (avCount) avCount.textContent = lib.length;
    if (avEmpty) avEmpty.hidden = lib.length > 0;
    lib.forEach((src, idx) => {
      const d = document.createElement('div');
      d.className = 'avlib-cell' + (src === current ? ' avlib-now' : '');
      // v3.6.x：img src 用属性赋值（dataURL 里含引号时拼 innerHTML 会逃逸注入 HTML）
      const img = document.createElement('img');
      img.src = src;
      img.alt = '头像';
      const delBtn = document.createElement('button');
      delBtn.className = 'avlib-del';
      delBtn.textContent = '✕';
      d.appendChild(img);
      d.appendChild(delBtn);
      // 点击图片：直接切换联系人头像（可能触发同意/拒绝回应）
      img.addEventListener('click', () => {
        switchAvatarFromLib(src);
      });
      delBtn.addEventListener('click', () => {
        const l = getLib();
        l.splice(idx, 1);
        saveLib(l);
        renderGrid();
        syncVal();
      });
      avGrid.appendChild(d);
    });
  }
  // 我的头像池网格：点击图片直接换成我的头像（也记入主页记录 + 聊天系统消息）；
  // 另支持删除单张
  function renderMeGrid() {
    if (!avMeGrid) return;
    const lib = getMeLib();
    const current = store.get('avatar-user');
    avMeGrid.innerHTML = '';
    if (avMeCount) avMeCount.textContent = lib.length;
    if (avMeEmpty) avMeEmpty.hidden = lib.length > 0;
    lib.forEach((src, idx) => {
      const d = document.createElement('div');
      d.className = 'avlib-cell' + (src === current ? ' avlib-now' : '');
      const img = document.createElement('img');
      img.src = src;
      img.alt = '头像';
      const delBtn = document.createElement('button');
      delBtn.className = 'avlib-del';
      delBtn.textContent = '✕';
      d.appendChild(img);
      d.appendChild(delBtn);
      // 点击图片：直接换成我的头像（我的头像池可手动切换）
      img.addEventListener('click', () => {
        switchMyAvatarFromLib(src);
      });
      delBtn.addEventListener('click', () => {
        const l = getMeLib();
        l.splice(idx, 1);
        saveMeLib(l);
        renderMeGrid();
      });
      avMeGrid.appendChild(d);
    });
  }

  // 打开/关闭半框
  function openAvlib() {
    if (!avPage) return;
    // 关闭其他底部半框（拍一拍/表情包）
    const pc = document.getElementById('poke-card');
    if (pc) pc.hidden = true;
    const ep = document.getElementById('emoji-panel');
    if (ep) ep.hidden = true;
    renderGrid();
    renderMeGrid();
    syncVal();
    avPage.hidden = false;
  }
  function closeAvlib() {
    if (avPage) avPage.hidden = true;
  }
  window.openAvlib = openAvlib;
  // v3.6.x：closeAvlib 也导出到 window——chat.js 等模块用 window.closeAvlib()
  // 关闭头像互动半框（打开拍一拍/表情包/查岗时互斥），此前漏导出导致调用无效、
  // 面板关不掉（有 if 守卫所以不报错，但功能失效）
  window.closeAvlib = closeAvlib;
  const avClose = document.getElementById('avlib-close');
  if (avClose) avClose.addEventListener('click', closeAvlib);
  // 顶部页签点击切换
  if (avTabA) avTabA.addEventListener('click', () => switchAvTab(false));
  if (avTabB) avTabB.addEventListener('click', () => switchAvTab(true));
  // 聊天页更多功能 → 头像互动
  const moreAvatar = document.getElementById('more-avatar');
  if (moreAvatar) {
    moreAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      const morePanel = document.getElementById('chat-more-panel');
      if (morePanel) morePanel.hidden = true;
      openAvlib();
    });
  }
  // 开关
  if (avEnabled) {
    avEnabled.addEventListener('change', () => {
      store.set('avatar-lib-enabled', avEnabled.checked ? '1' : '0');
      syncVal();
    });
  }
  if (avMeEnabled) {
    avMeEnabled.addEventListener('change', () => {
      store.set('avatar-me-lib-enabled', avMeEnabled.checked ? '1' : '0');
      syncVal();
    });
  }
  // 上传多张（两个头像池共用）：读取失败的文件会跳过，全部成功/部分失败都有提示
  function bindPoolUpload(btn, listFn, saveFn, rerender) {
    if (!btn) return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      const files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if (!files.length) return;
      const list = listFn();
      let done = 0, okCount = 0, failCount = 0;
      files.forEach(f => {
        const reader = new FileReader();
        reader.onerror = () => { done++; failCount++; if (done === files.length) finish(); };
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            try {
              const c = document.createElement('canvas');
              const scale = Math.min(1, 256 / Math.max(img.width, img.height));
              c.width = Math.max(1, Math.round(img.width * scale));
              c.height = Math.max(1, Math.round(img.height * scale));
              c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
              list.push(c.toDataURL('image/jpeg', 0.85));
              okCount++;
            } catch (e) {
              list.push(reader.result);
              okCount++;
            }
            done++;
            if (done === files.length) finish();
          };
          img.onerror = () => { done++; failCount++; if (done === files.length) finish(); };
          img.src = reader.result;
        };
        reader.readAsDataURL(f);
      });
      function finish() {
        saveFn(list);
        rerender();
        if (okCount > 0 && failCount === 0) {
          toast('成功添加 ' + okCount + ' 张头像');
        } else if (okCount > 0 && failCount > 0) {
          toast('添加成功 ' + okCount + ' 张，失败 ' + failCount + ' 张');
        } else {
          toast('添加失败，请选择有效的图片文件');
        }
      }
    };
    btn.addEventListener('click', () => input.click());
  }
  bindPoolUpload(avUpload, getLib, saveLib, () => { renderGrid(); syncVal(); });
  bindPoolUpload(avMeUpload, getMeLib, saveMeLib, () => { renderMeGrid(); syncVal(); });
  // 清空（两个头像池共用）
  function bindPoolClear(btn, saveFn, rerender, title, okText) {
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (window.openModal) {
        window.openModal(title, '', () => {
          saveFn([]);
          rerender();
          toast(okText);
        }, { noInput: true });
      }
    });
  }
  bindPoolClear(avClear, saveLib, () => { renderGrid(); syncVal(); }, '清空头像池？', '已清空头像池');
  bindPoolClear(avMeClear, saveMeLib, () => { renderMeGrid(); syncVal(); }, '清空我的头像池？', '已清空我的头像池');

  // 头像实时生效：聊天页顶部头像 + 桌面纪念日卡头像 + 已渲染的消息气泡头像
  // out=false 换联系人头像（.msg-in .msg-av 是"对方消息"旁的头像）；
  // out=true 换我的头像（.msg-out .msg-av 是我的消息旁的头像）
  // data 为空时恢复默认人物图标
  // v3.6.x：img 用属性赋值（dataURL 含引号时拼 innerHTML 会逃逸注入 HTML）
  function applyAvatarImg(data, out) {
    const chatAv = document.getElementById(out ? 'chat-user-av' : 'chat-partner-av');
    const deskRing = document.querySelector(out ? '#avatar-user .ring' : '#avatar-partner .ring');
    const applyTo = (el) => {
      if (!el) return;
      el.innerHTML = '';
      if (data) {
        const img = document.createElement('img');
        img.src = data;
        img.alt = '';
        el.appendChild(img);
      } else {
        el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#999999" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg>';
      }
    };
    applyTo(chatAv);
    applyTo(deskRing);
    document.querySelectorAll((out ? '.msg-out' : '.msg-in') + ' .msg-av').forEach(av => { applyTo(av); });
  }
  // 聊天里显示系统消息（chatAddSystem 会持久化，下次进聊天也能看到）
  // img：可选，消息里附带换的头像图片
  function chatSystem(text, img) {
    if (window.chatAddSystem) window.chatAddSystem(text, { img: img });
    // 记录：换头像事件（写入主页「换头像记录」，含事件文案 + 头像缩略图）。
    // records.js 在 avatar-lib 之后加载，启动即触发的换头像可能赶不上
    // addAvatarRecord 定义 → 延迟到下一轮 tick 再补写
    if (window.addAvatarRecord) {
      window.addAvatarRecord(img, text);
    } else {
      setTimeout(function () {
        try { if (window.addAvatarRecord) window.addAvatarRecord(img, text); } catch (e) {}
      }, 600);
    }
  }
  // 聊天消息 + 黑色小字通知：换头像邀请的回应（消息带换的头像图片）
  // v3.6.x：不再弹白底可输入的 modal 弹窗——与头像互动其它通知一致，
  // 用 toast（黑色小字、发完自动关闭）
  function replyInvite(accepted, img) {
    const name = store.get('lbl-partner') || 'TA';
    const myName = store.get('lbl-user') || '我';
    const text = accepted
      ? name + ' 同意了' + myName + '的换头像邀请'
      : name + ' 拒绝了' + myName + '的换头像邀请';
    chatSystem(text, img);
    toast(text);
  }
  // 手动点击头像库的图片：立即切换联系人头像
  // 有概率触发 TA 的回应（同意保持 / 拒绝换回），并重置随机更换计时
  function switchAvatarFromLib(data) {
    const lib = getLib();
    if (!data || lib.indexOf(data) === -1) return;
    const before = store.get('avatar-partner');
    store.set('avatar-partner', data);
    applyAvatarImg(data);
    // 手动更换后重置随机计时：1-8 小时后才可能再随机换（与星言一致）
    store.set('avatar-lib-last', String(Date.now()));
    store.set('avatar-lib-next', String(1 + Math.random() * 7));
    renderGrid();
    // 邀请回应：触发时同意概率高（AGREE_PROB），拒绝概率低
    if (Math.random() * 100 < INVITE_PROB) {
      if (Math.random() * 100 < AGREE_PROB) {
        replyInvite(true, data); // 同意：头像保持新换的，消息带新头像图
      } else {
        // 拒绝：头像换回原来那张（原本没自定义过头像则恢复默认图标）
        if (before) store.set('avatar-partner', before);
        else { store.remove('avatar-partner'); }
        applyAvatarImg(before);
        renderGrid();
        replyInvite(false, before || null); // 消息带换回的头像图
      }
    } else {
      // 直接切换成功：轻提示 + 聊天里显示"我的昵称 更换了 联系人昵称 的头像"+ 新头像图片
      toast('头像已切换');
      const name = store.get('lbl-partner') || 'TA';
      const myName = store.get('lbl-user') || '我';
      chatSystem(myName + ' 更换了 ' + name + ' 的头像', data);
    }
  }

  // 手动点击我的头像库的图片：立即换成我的头像（聊天系统消息 + 主页记录）
  function switchMyAvatarFromLib(data) {
    const lib = getMeLib();
    if (!data || lib.indexOf(data) === -1) return;
    store.set('avatar-user', data);
    applyAvatarImg(data, true);
    renderMeGrid();
    toast('头像已更换');
    const myName = store.get('lbl-user') || '我';
    chatSystem(myName + ' 更换了头像', data);
  }

  // TA 主动给我换头像：邀请回应文案（聊天消息 + toast）
  function replyMeInvite(accepted, data) {
    const name = store.get('lbl-partner') || 'TA';
    const myName = store.get('lbl-user') || '我';
    const text = accepted
      ? myName + ' 同意了' + name + '的换头像邀请'
      : myName + ' 拒绝了' + name + '的换头像邀请';
    chatSystem(text, accepted ? data : null);
    toast(text);
  }
  // 弹窗邀请：带新头像预览，我同意则直接换上 / 拒绝则保持原样
  function showMeAvatarInvite(data) {
    const name = store.get('lbl-partner') || 'TA';
    window.openModal(name + ' 的换头像邀请', '', (v) => {
      if (v === '1') {
        store.set('avatar-user', data);
        applyAvatarImg(data, true);
        renderMeGrid();
        replyMeInvite(true, data);
      } else {
        replyMeInvite(false, null);
      }
    }, {
      noInput: true,
      // v3.6.x：锁定弹窗——点遮罩/取消都不关闭，必须点同意/拒绝
      lock: true,
      pills: [{ label: '同意', value: '1' }, { label: '拒绝', value: '0' }],
      staticText: name + ' 邀请你换上这张头像'
    });
    // 弹窗里附上新头像预览（openModal 只支持文字，预览图追加进 static 区）
    const se = document.getElementById('modal-static');
    if (se) {
      const img = document.createElement('img');
      img.src = data;
      img.alt = '';
      img.style.cssText = 'width:96px;height:96px;border-radius:50%;object-fit:cover;display:block;margin:10px auto;';
      se.appendChild(img);
    }
  }

  // 我的头像池定时换头像（触发概率/刷新机制与联系人主动换头像一致，计时独立）：
  // 每 60 秒轮询检查一次 + 启动时立即检查；
  // 上次/下次更换时间戳持久化（avatar-me-lib-last=0 / avatar-me-lib-next=0 初始值 → 首次加载立即触发），
  // 触发后 next = 1 + random*7 小时；刷新页面周期不重置；异常时间戳归零重试。
  // 触发时掷 INVITE_PROB：弹窗邀请我同意/拒绝，否则直接换上我的新头像
  function getMeAvatarLast() { const v = parseInt(store.get('avatar-me-lib-last'), 10); return isNaN(v) ? 0 : v; }
  function getMeAvatarNext() { const v = parseFloat(store.get('avatar-me-lib-next')); return isNaN(v) ? 0 : v; }
  function checkMeAvatarRefresh() {
    try {
      // v3.6.x：去掉 document.hidden return——后台时也检查换头像周期，
      // 到时间就换 + 写聊天消息 + 发后台通知（用户在后台也能收到系统通知）
      if (!getMeEnabled()) return;
      const now = Date.now();
      let last = getMeAvatarLast();
      let next = getMeAvatarNext();
      // 异常时间戳 → 归零，下次检查立即触发
      if (last > now || last < 0 || isNaN(last)) { last = 0; next = 0; }
      if ((now - last) / 36e5 < next) return;
      const lib = getMeLib();
      if (!lib.length) return;
      const idx = Math.floor(Math.random() * lib.length);
      const data = lib[idx];
      if (!data) return;
      // 随机到当前头像：跳过不换，也不推进计时（60 秒后再随机一次）
      if (data === store.get('avatar-user')) return;
      const invite = Math.random() * 100 < INVITE_PROB;
      if (invite) {
        // 已有其他弹窗打开时本次跳过（不推进计时，60 秒后再触发）
        const mask = document.getElementById('modal-mask');
        if (mask && !mask.hidden) return;
      }
      // 推进周期：下次 1-8 小时
      store.set('avatar-me-lib-last', String(now));
      store.set('avatar-me-lib-next', String(1 + Math.random() * 7));
      if (invite) {
        showMeAvatarInvite(data);
        // v3.6.x：后台时弹窗不可见，发系统通知让用户知道有换头像邀请
        if (document.visibilityState === 'hidden' && window.bgNotifyCheck) {
          const iname = store.get('lbl-partner') || 'TA';
          window.bgNotifyCheck(iname + ' 想给你换头像', Date.now(), { name: iname, img: data });
        }
      } else {
        // 直接换：换上 + 聊天显示"昵称 更换了你的头像" + 新头像图片
        store.set('avatar-user', data);
        applyAvatarImg(data, true);
        renderMeGrid();
        const name = store.get('lbl-partner') || 'TA';
        const text = name + ' 更换了你的头像';
        chatSystem(text, data);
        toast(text);
      }
    } catch (e) {}
  }

  // 定时随机更换（与星言简约版机制一致）：
  // 每 60 秒轮询检查一次 + 启动时立即检查；
  // 上次/下次更换时间戳持久化（lastChange=0 / nextChange=0 初始值 → 首次加载立即换一次），
  // 换完后 nextChange = 1 + random*7 小时；刷新页面周期不重置；
  // 异常时间戳（未来/负数/NaN）归零，下次检查立即重试
  function getAvatarLast() { const v = parseInt(store.get('avatar-lib-last'), 10); return isNaN(v) ? 0 : v; }
  function getAvatarNext() { const v = parseFloat(store.get('avatar-lib-next')); return isNaN(v) ? 0 : v; }
  function checkAvatarLibRefresh() {
    try {
      // v3.6.x：去掉 document.hidden return——后台时也检查换头像周期，
      // 到时间就换 + 写聊天消息 + 发后台通知（时间未到时在 getLib 前 return，不解析头像池）
      if (!getEnabled()) return;
      const now = Date.now();
      let last = getAvatarLast();
      let next = getAvatarNext();
      // 异常时间戳 → 归零，下次检查立即触发
      if (last > now || last < 0 || isNaN(last)) { last = 0; next = 0; }
      // v3.5.127：时间未到就先不解析头像池（原先每 60s 无条件 getLib() 全量解析）
      if ((now - last) / 36e5 < next) return;
      const lib = getLib();
      if (!lib.length) return;
      const idx = Math.floor(Math.random() * lib.length);
      const data = lib[idx];
      if (!data) return;
      // 随机到当前头像：跳过不换，也不推进计时（60 秒后再随机一次，与星言一致）
      if (data === store.get('avatar-partner')) return;
      store.set('avatar-partner', data);
      applyAvatarImg(data);
      renderGrid();
      // 聊天里显示"昵称 更换了头像" + 新头像图片
      chatSystem((store.get('lbl-partner') || 'TA') + ' 更换了头像', data);
      // v3.5.153：换头像后补发后台通知——确保后台收到的通知右侧是新头像
      //（头像数据在 avatar-partner 已更新，通知由 bgNotifyCheck 读它；这里显式
      //  触发一条，避免只有聊天系统消息、后台用户没感知到换头像）
      try {
        if (window.bgNotifyCheck) {
          window.bgNotifyCheck((store.get('lbl-partner') || 'TA') + ' 更换了头像', Date.now(), { name: store.get('lbl-partner') || 'TA' });
        }
      } catch (e) {}
      // 推进周期：下次 1-8 小时
      store.set('avatar-lib-last', String(now));
      store.set('avatar-lib-next', String(1 + Math.random() * 7));
    } catch (e) {}
  }
  // 每 60 秒轮询一次 + 启动立即检查（首次加载立即换一次）
  try { setInterval(checkAvatarLibRefresh, 60000); } catch (e) {}
  checkAvatarLibRefresh();
  try { setInterval(checkMeAvatarRefresh, 60000); } catch (e) {}
  checkMeAvatarRefresh();

  syncVal();
  // v3.5.93：头像池大键（图片 dataURL）可能只存在 IndexedDB（导入兜底写入/运行时大键策略），
  // localStorage 读不到 → 启动时从 IDB 补读进内存缓存；半框是打开时才渲染的，届时自然读到
  try {
    if (window.idbGet) {
      window.idbGet(window.activePrefix() + ':avatar-lib').then(v => {
        if (v && typeof v === 'string' && v.length > 2) {
          store.set('avatar-lib', v);
        }
      });
    }
  } catch (e) {}
  try {
    if (window.idbGet) {
      window.idbGet(window.activePrefix() + ':avatar-me-lib').then(v => {
        if (v && typeof v === 'string' && v.length > 2) {
          store.set('avatar-me-lib', v);
        }
      });
    }
  } catch (e) {}
})();
