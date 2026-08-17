// ===== 功能：联系人头像库（完整版） =====
// 独立页面：头像池缩略图网格 + 上传多张 + 删除单张 + 清空 + 开关
// 定时随机更换联系人聊天头像（1-8 小时）；更换时聊天显示"昵称 更换了头像"
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
  const INVITE_PROB = 50; // 触发"同意/拒绝"回应的概率 %
  const AGREE_PROB = 70;  // 触发回应时同意的概率 %（拒绝 = 100 - AGREE_PROB）

  // 头像池
  function getLib() { try { return JSON.parse(store.get('avatar-lib') || '[]'); } catch (e) { return []; } }
  function saveLib(list) { store.set('avatar-lib', JSON.stringify(list)); }
  function getEnabled() { const v = store.get('avatar-lib-enabled'); return v === null ? true : v === '1'; }

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

  function syncVal() {
    if (avEnabled) avEnabled.checked = getEnabled();
    if (avName) avName.textContent = store.get('lbl-partner') || 'TA';
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

  // 打开/关闭半框
  function openAvlib() {
    if (!avPage) return;
    // 关闭其他底部半框（拍一拍/表情包）
    const pc = document.getElementById('poke-card');
    if (pc) pc.hidden = true;
    const ep = document.getElementById('emoji-panel');
    if (ep) ep.hidden = true;
    renderGrid();
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
  // 上传多张：读取失败的文件会跳过，全部成功/部分失败都有提示
  if (avUpload) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      const files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if (!files.length) return;
      const list = getLib();
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
        saveLib(list);
        renderGrid();
        syncVal();
        if (okCount > 0 && failCount === 0) {
          toast('成功添加 ' + okCount + ' 张头像');
        } else if (okCount > 0 && failCount > 0) {
          toast('添加成功 ' + okCount + ' 张，失败 ' + failCount + ' 张');
        } else {
          toast('添加失败，请选择有效的图片文件');
        }
      }
    };
    avUpload.addEventListener('click', () => input.click());
  }
  // 清空
  if (avClear) {
    avClear.addEventListener('click', () => {
      if (window.openModal) {
        window.openModal('清空头像池？', '', () => {
          saveLib([]);
          renderGrid();
          syncVal();
          toast('已清空头像池');
        }, { noInput: true });
      }
    });
  }

  // 头像实时生效：聊天页顶部头像 + 桌面纪念日卡头像 + 已渲染的对方消息气泡头像
  // （.msg-in .msg-av 是"对方消息"旁的头像；我的消息旁是 avatar-user，不动）
  // data 为空时恢复默认人物图标
  // v3.6.x：img 用属性赋值（dataURL 含引号时拼 innerHTML 会逃逸注入 HTML）
  function applyAvatarImg(data) {
    const chatAv = document.getElementById('chat-partner-av');
    const deskRing = document.querySelector('#avatar-partner .ring');
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
    document.querySelectorAll('.msg-in .msg-av').forEach(av => { applyTo(av); });
  }
  // 聊天里显示系统消息（chatAddSystem 会持久化，下次进聊天也能看到）
  // img：可选，消息里附带换的头像图片
  function chatSystem(text, img) {
    if (window.chatAddSystem) window.chatAddSystem(text, { img: img });
    // 记录：联系人主动换头像（写入记录页，含头像缩略图）
    if (window.addAvatarRecord) window.addAvatarRecord(img);
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

  // 定时随机更换（与星言简约版机制一致）：
  // 每 60 秒轮询检查一次 + 启动时立即检查；
  // 上次/下次更换时间戳持久化（lastChange=0 / nextChange=0 初始值 → 首次加载立即换一次），
  // 换完后 nextChange = 1 + random*7 小时；刷新页面周期不重置；
  // 异常时间戳（未来/负数/NaN）归零，下次检查立即重试
  function getAvatarLast() { const v = parseInt(store.get('avatar-lib-last'), 10); return isNaN(v) ? 0 : v; }
  function getAvatarNext() { const v = parseFloat(store.get('avatar-lib-next')); return isNaN(v) ? 0 : v; }
  function checkAvatarLibRefresh() {
    try {
      // v3.5.127：页面隐藏时不检查（后台 interval 白跑 + 每 60s 全量解析整个头像池）
      if (document.hidden) return;
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
      // 推进周期：下次 1-8 小时
      store.set('avatar-lib-last', String(now));
      store.set('avatar-lib-next', String(1 + Math.random() * 7));
    } catch (e) {}
  }
  // 每 60 秒轮询一次 + 启动立即检查（首次加载立即换一次）
  try { setInterval(checkAvatarLibRefresh, 60000); } catch (e) {}
  checkAvatarLibRefresh();

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
})();
