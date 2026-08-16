// ===== 功能：情侣空间个性化 =====
// 头像上传、签名、纪念日照片、手机背景、自定义图标、恋爱纪念日、每日打卡（localStorage 持久化）
(function () {
  const uid = 'xy-home-v2';
  const store = window.xyStore(uid);

  // 图片压缩后再存储：大幅缩小体积，本地存储容量更宽松（头像/图标 256px，背景/照片 1000px）
  function compressImage(dataUrl, maxSide) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.85));
        } catch (e) {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }
  // v3.5.107：手机壁纸清晰度——按设备物理像素计算压缩上限。
  // 之前固定压到最长边 1000px，在 2-3x 高分屏（物理宽 1080-1440）上会被放大发糊；
  // 这里用「屏幕物理最高边 × DPR」计算，保证壁纸铺满时不吃放大，同时不超 4096 防止体积过大
  // v3.5.117：上限 4096 → 2880——4096px 壁纸 base64 动辄 3-6MB，回填/解码明显拖慢
  //   启动（桌面图片慢加载的主因之一）；2880px 在 3x 屏依然清晰，体积约减半
  function phoneBgMaxSide() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const h = (window.screen && window.screen.height) || 1920;
    return Math.min(2880, Math.max(2160, Math.round(h * dpr)));
  }

  // 头像（位于桌面纪念日卡片内，点击不触发卡片背景上传）
  function applyAvatar(id, key) {
    const box = document.getElementById(id);
    if (!box) return;
    const ring = box.querySelector('.ring');
    const saved = store.get(key);
    if (saved && ring) ring.innerHTML = '<img src="' + saved + '" alt="">';
  }
  function bindAvatar(id, key) {
    const box = document.getElementById(id);
    if (!box) return;
    applyAvatar(id, key);
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          compressImage(reader.result, 256).then(data => {
            const ring = box.querySelector('.ring');
            if (ring) ring.innerHTML = '<img src="' + data + '" alt="">';
            store.set(key, data);
          });
        };
        reader.readAsDataURL(f);
      };
      input.click();
    });
  }
  bindAvatar('avatar-user', 'avatar-user');
  bindAvatar('avatar-partner', 'avatar-partner');

  // v3.5.113：IndexedDB 回填完成后（mochi-restore-done 事件）轻量重绘——
  // 头像/摸鱼值/聊天统计等只在启动时渲染一次的界面，导入/配额异常恢复后
  // 不会自动更新；这里统一重绘，不再整页 reload（v3.5.112 的回归修复）
  window.applyAvatars = function () {
    applyAvatar('avatar-user', 'avatar-user');
    applyAvatar('avatar-partner', 'avatar-partner');
    // 聊天页头像（chat.js 暴露的 fillAvatar）
    try {
      if (window.fillAvatar) {
        window.fillAvatar('chat-user-av', 'avatar-user');
        window.fillAvatar('chat-partner-av', 'avatar-partner');
      }
    } catch (e) {}
  };
  try {
    document.addEventListener('mochi-restore-done', function () {
      window.applyAvatars();
      try { syncFishUI(); } catch (e) {}
      // v3.5.116：回填完成后一并重绘桌面图标 + 壁纸——
      //   自定义图标/壁纸大键可能只存 IDB，回填完成前桌面显示的是默认/空白
      try { restoreAppIcons(); } catch (e) {}
      try { applyBgVisibility(); } catch (e) {}
    });
  } catch (e) {}

  // 通用弹层：IAB 不支持 prompt/confirm，用页面内模态框替代；支持输入 / 色板
  (function () {
    const mask = document.getElementById('modal-mask');
    const title = document.getElementById('modal-title');
    const staticEl = document.getElementById('modal-static');
    const input = document.getElementById('modal-input');
    const textarea = document.getElementById('modal-textarea');
    const swatches = document.getElementById('modal-swatches');
    const pillsEl = document.getElementById('modal-pills');
    const colorInput = document.getElementById('modal-color');
    const customBtn = document.getElementById('modal-custom');
    const selectEl = document.getElementById('modal-select');
    const fileBtn = document.getElementById('modal-file');
    const fileInput = document.getElementById('modal-file-input');
    const okBtn = document.getElementById('modal-ok');
    const cancelBtn = document.getElementById('modal-cancel');
    if (!mask || !input) return;
    let cb = null;
    let pillsOnOk = null;
    let noInput = false;
    let picked = -1;
    let customVal = null;
    let pillVal = null;
    let selectedGroup = null;
    window.openModal = function (t, v, fn, opts) {
      opts = opts || {};
      pillsOnOk = opts.pillsOnOk || null;
      noInput = !!(opts.noInput);
      title.textContent = t;
      if (staticEl) {
        staticEl.hidden = !opts.staticText;
        staticEl.textContent = opts.staticText || '';
      }
      input.hidden = noInput || !!opts.textarea;
      input.value = v || '';
      // v3.5.130：maxlength 由调用方控制——模板不再写死 12（编辑消息/备忘会被截断）；
      // 昵称类短输入传 opts.maxlength，编辑消息等不传
      if (opts.maxlength) input.maxLength = opts.maxlength;
      else input.removeAttribute('maxlength');
      if (textarea) {
        textarea.hidden = !opts.textarea;
        if (opts.textarea) {
          textarea.value = v || '';
          textarea.placeholder = opts.textareaPlaceholder || '多行内容';
        }
      }
      // 目标分组下拉
      if (selectEl) {
        selectEl.hidden = !(opts.groups && opts.groups.length);
        selectEl.innerHTML = '';
        selectedGroup = null;
        if (opts.groups && opts.groups.length) {
          const none = document.createElement('option');
          none.value = '';
          none.textContent = '导入到新分组（按【组名】识别）';
          selectEl.appendChild(none);
          opts.groups.forEach(g => {
            const o = document.createElement('option');
            o.value = g;
            o.textContent = '导入到现有分组：' + g;
            selectEl.appendChild(o);
          });
        }
      }
      // txt 文件导入
      if (fileBtn) {
        fileBtn.hidden = !opts.txtImport;
        fileBtn.onclick = () => { if (fileInput) fileInput.click(); };
      }
      // 色板
      swatches.hidden = !(opts.swatches && opts.swatches.length);
      swatches.innerHTML = '';
      picked = -1;
      customVal = null;
      if (opts.swatches && opts.swatches.length) {
        opts.swatches.forEach((label, i) => {
          const s = document.createElement('span');
          s.className = 'sw' + (i === opts.pick ? ' on' : '');
          s.style.background = label.color;
          s.title = label.label;
          s.addEventListener('click', () => {
            Array.prototype.forEach.call(swatches.children, c => c.classList.remove('on'));
            s.classList.add('on');
            picked = i;
            customBtn.classList.remove('on');
          });
          swatches.appendChild(s);
        });
      }
      // 选项胶囊（pills）
      pillsEl.hidden = !(opts.pills && opts.pills.length);
      pillsEl.innerHTML = '';
      pillVal = opts.pill !== undefined ? opts.pill : null;
      if (opts.pills && opts.pills.length) {
        opts.pills.forEach(p => {
          const b = document.createElement('button');
          b.className = 'pill' + (p.value === pillVal ? ' on' : '');
          b.textContent = p.label;
          b.addEventListener('click', () => {
            Array.prototype.forEach.call(pillsEl.children, c => c.classList.remove('on'));
            b.classList.add('on');
            pillVal = p.value;
          });
          pillsEl.appendChild(b);
        });
      }
      // 自定义取色（简约按钮）
      customBtn.hidden = !opts.colorPicker;
      customBtn.classList.remove('on');
      if (opts.colorPicker && opts.pick === -2) customBtn.classList.add('on');
      if (opts.color) colorInput.value = opts.color;
      cb = fn;
      mask.hidden = false;
      // v3.5.133：多行模式聚焦 textarea（原只 focus 单行 input——多行模式下 input 隐藏、
      // focus 打在 display:none 元素上，键盘不弹，批量导入用户首触必失败一次）
      setTimeout(() => {
        if (noInput) return;
        if (opts.textarea && textarea) textarea.focus();
        else if (input) input.focus();
      }, 60);
    };
    customBtn.addEventListener('click', () => colorInput.click());
    colorInput.addEventListener('change', () => {
      customVal = colorInput.value;
      Array.prototype.forEach.call(swatches.children, c => c.classList.remove('on'));
      customBtn.classList.add('on');
      picked = -2;
    });
    function close() { mask.hidden = true; cb = null; }
    function fire() {
      if (!cb) return;
      if (pillsEl && !pillsEl.hidden) {
        if (pillsOnOk) pillsOnOk(pillVal);
        cb(pillVal);
        return;
      }
      if (textarea && !textarea.hidden) { cb(textarea.value, selectedGroup); return; }
      if (swatches.hidden) cb(noInput ? 'ok' : input.value);
      else if (picked === -2 && customVal) cb(customVal);
      else if (picked >= 0) cb(picked);
    }
    // 分组下拉变化
    if (selectEl) {
      selectEl.addEventListener('change', () => { selectedGroup = selectEl.value || null; });
    }
    // txt 文件读取
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          const txt = String(reader.result || '');
          if (textarea) textarea.value = txt; // 填入文本框，由用户确认
        };
        reader.readAsText(f);
        fileInput.value = '';
      });
    }
    okBtn.addEventListener('click', () => {
      // v3.5.130：回调抛异常（如存储配额满）也必须关闭弹窗，防止残留卡死
      try { fire(); } finally { close(); }
    });
    cancelBtn.addEventListener('click', close);
    mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { fire(); close(); }
    });
  })();

  // 昵称（点击「我」/「TA」下方文字，弹层修改）
  function bindLabel(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = store.get(key);
    if (saved) el.textContent = saved;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.openModal) {
        window.openModal('修改昵称', el.textContent, (v) => {
          const val = (v || '').trim();
          if (val) {
            el.textContent = val;
            store.set(key, val);
            // 同步聊天页顶部标题（联系人的昵称）
            if (key === 'lbl-partner') {
              const pname = document.getElementById('chat-partner-name');
              if (pname) pname.textContent = val;
            }
          }
        }, { maxlength: 12 });
      }
    });
  }
  bindLabel('lbl-user', 'lbl-user');
  bindLabel('lbl-partner', 'lbl-partner');

  // 上传手机背景图片：设为 .phone 全屏背景铺满整个手机屏幕，仅桌面显示；localStorage 持久化
  const phoneEl = document.querySelector('.phone');
  const bgRow = document.getElementById('row-bg-upload');
  const bgVal = document.getElementById('bg-val');
  const bgRemove = document.getElementById('row-bg-remove');
  const bgHome = document.getElementById('page-phone');
  // v3.5.139：壁纸同时铺到 body——电脑桌面下 .phone 只是 390px 模拟器框，
  // 只设 .phone 的话两侧灰底还是默认背景，视觉上"壁纸没铺满页面"。
  // body 背景铺满整个窗口（桌面含两侧灰底；手机端 body 即全屏，与 .phone 同图无缝）。
  const applyBodyBg = (data) => {
    try {
      const b = document.body;
      if (data) {
        b.style.backgroundImage = 'url("' + data + '")';
        b.style.backgroundSize = 'cover';
        b.style.backgroundPosition = 'center';
        b.style.backgroundAttachment = 'scroll';
      } else {
        b.style.backgroundImage = '';
        b.style.backgroundSize = '';
        b.style.backgroundPosition = '';
        b.style.backgroundAttachment = '';
      }
    } catch (e) {}
  };
  const applyPhoneBg = (data) => {
    if (!phoneEl) return;
    // 壁纸铺满整个手机屏幕（含状态栏/导航条区域），且只在桌面显示
    phoneEl.style.backgroundImage = 'url("' + data + '")';
    phoneEl.style.backgroundSize = 'cover';
    phoneEl.style.backgroundPosition = 'center';
    phoneEl.style.backgroundAttachment = 'scroll';
    applyBodyBg(data);
    if (bgHome) {
      bgHome.classList.add('has-bg');
      bgHome.style.backgroundImage = 'none';
    }
  };
  const syncBgUI = () => {
    const has = !!store.get('phone-bg');
    if (bgVal) bgVal.textContent = has ? '已设置' : '';
    if (bgRemove) bgRemove.hidden = !has;
  };
  const clearPhoneBg = () => {
    if (phoneEl) phoneEl.style.backgroundImage = '';
    applyBodyBg(null);
    if (bgHome) {
      bgHome.classList.remove('has-bg');
      bgHome.style.backgroundImage = '';
    }
    store.remove('phone-bg');
    syncBgUI();
  };
  if (bgRow) {
    const savedBg = store.get('phone-bg');
    if (savedBg) applyPhoneBg(savedBg);
    syncBgUI();
    bgRow.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          compressImage(reader.result, phoneBgMaxSide()).then(data => {
            applyPhoneBg(data);
            store.set('phone-bg', data);
            syncBgUI();
            // v3.5.111：上传后立即同步一次桌面可见性，确保回桌面时壁纸已应用
            //（配合内存缓存修复：大壁纸不写 localStorage，靠内存缓存当前会话内读回）
            applyBgVisibility();
            toast('壁纸已设置');
          });
        };
        reader.readAsDataURL(f);
      };
      input.click();
    });
  }
  if (bgRemove) {
    bgRemove.addEventListener('click', () => clearPhoneBg());
  }

  // 壁纸只在桌面显示：桌面时铺满全屏，切到字卡库/设置/聊天时隐藏（数据保留）
  const bgData = () => store.get('phone-bg');
  const applyBgVisibility = () => {
    if (!phoneEl) return;
    const home = document.getElementById('page-phone');
    const show = home && !home.hidden && bgData();
    if (show) {
      phoneEl.style.backgroundImage = 'url("' + bgData() + '")';
      phoneEl.style.backgroundSize = 'cover';
      phoneEl.style.backgroundPosition = 'center';
      phoneEl.style.backgroundAttachment = 'scroll';
      applyBodyBg(bgData());
    } else {
      phoneEl.style.backgroundImage = '';
      applyBodyBg(null);
    }
  };
  // 页面切换时同步壁纸显示
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', applyBgVisibility));
  document.querySelectorAll('.app[data-app="chat"]').forEach(a => a.addEventListener('click', applyBgVisibility));
  document.getElementById('chat-back') && document.getElementById('chat-back').addEventListener('click', applyBgVisibility);
  // 监听桌面容器 hidden 变化（兜底）
  const homePage = document.getElementById('page-phone');
  if (homePage) {
    const mo = new MutationObserver(applyBgVisibility);
    mo.observe(homePage, { attributes: true, attributeFilter: ['hidden'] });
  }
  applyBgVisibility();
  // v3.5.93：桌面壁纸大键可能只存在 IndexedDB（导入兜底写入/大键只进 IDB）——
  // 启动时从 IDB 补读后重新应用
  try {
    if (window.idbGet) {
      window.idbGet(uid + ':phone-bg').then(v => {
        if (v && typeof v === 'string' && v.length > 2 && !store.get('phone-bg')) {
          store.set('phone-bg', v);
          applyBgVisibility();
        }
      });
    }
  } catch (e) {}

  // 自定义手机桌面图标：点击设置项切到手机页进入编辑模式，再点击目标 app 上传替换
  // 注意：桌面分页后可能存在多个 .app-grid，全部绑定
  // v3.5.87：装修模式下点击已有自定义图的图标 → 弹「更换 / 清除」；清除恢复默认图标
  const grids = document.querySelectorAll('.app-grid');
  // 给每个图标存一份原始 SVG，清除时还原
  document.querySelectorAll('.app .app-ico').forEach(ico => {
    if (!ico.dataset.orig) ico.dataset.orig = ico.innerHTML;
  });
  const restoreAppIcons = () => {
    document.querySelectorAll('.app').forEach(app => {
      const saved = store.get('app-icon-' + app.dataset.app);
      const ico = app.querySelector('.app-ico');
      if (saved) {
        if (ico) ico.innerHTML = '<img src="' + saved + '" alt="">';
      } else if (ico && ico.dataset.orig) {
        ico.innerHTML = ico.dataset.orig;
      }
    });
  };
  restoreAppIcons();
  // v3.5.95：自定义图标大键可能只存在 IndexedDB（压缩失败兜底会存原始大图）→ 补读后重新恢复图标
  try {
    if (window.idbGetAllKeys) {
      window.idbGetAllKeys().then(keys => {
        const iconKeys = (keys || []).filter(k => k.indexOf(uid + ':app-icon-') === 0);
        if (!iconKeys.length) return;
        let p = Promise.resolve();
        iconKeys.forEach(k => {
          p = p.then(() => window.idbGet(k)).then(v => {
            if (v && typeof v === 'string' && v.length > 2) store.set(k.slice(uid.length + 1), v);
          });
        });
        p.then(() => restoreAppIcons());
      });
    }
  } catch (e) {}

  grids.forEach(grid => {
    grid.addEventListener('click', (e) => {
      if (!grid.classList.contains('editing')) return;
      const app = e.target.closest('.app');
      if (!app) return;
      e.stopPropagation();
      const key = app.dataset.app;
      const ico = app.querySelector('.app-ico');
      const hasCustom = !!store.get('app-icon-' + key);
      const pickFile = () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = () => {
          const f = input.files && input.files[0];
          if (!f) { return; }
          const reader = new FileReader();
          reader.onload = () => {
            compressImage(reader.result, 256).then(data => {
              if (ico) ico.innerHTML = '<img src="' + data + '" alt="">';
              store.set('app-icon-' + key, data);
              // 持续装修：上传后保持编辑模式，手动点击"退出装修模式"才退出
            });
          };
          reader.readAsDataURL(f);
        };
        input.click();
      };
      // 已有自定义图 → 可更换或清除；无自定义图 → 直接选文件
      if (hasCustom && window.openModal) {
        window.openModal('图标已自定义', '', (v) => {
          if (v === '1') pickFile();
          if (v === '2') {
            store.remove('app-icon-' + key);
            if (ico && ico.dataset.orig) ico.innerHTML = ico.dataset.orig;
            toast('已恢复默认图标');
          }
        }, { noInput: true, pills: [{ label: '更换图片', value: '1' }, { label: '清除图片', value: '2' }] });
      } else {
        pickFile();
      }
    });
  });

  const iconRow = document.getElementById('row-custom-icon');
  if (iconRow) {
    iconRow.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      const phoneTab = document.querySelector('.tab[data-page="page-phone"]');
      if (phoneTab) phoneTab.classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const phonePage = document.getElementById('page-phone');
      if (phonePage) phonePage.hidden = false;
      grids.forEach(g => g.classList.add('editing'));
      const bar = document.getElementById('decor-bar');
      if (bar) bar.hidden = false;
    });
  }

  // 退出装修模式（含桌面顶部"完成"按钮）
  function exitDecor() {
    grids.forEach(g => g.classList.remove('editing'));
    const bar = document.getElementById('decor-bar');
    if (bar) bar.hidden = true;
  }
  // v3.5.131：暴露给 tabs.js 返回键（返回时退出编辑态，防止"点了没反应"）
  window.exitDecor = exitDecor;
  const decorDone = document.getElementById('decor-done');
  if (decorDone) {
    decorDone.addEventListener('click', exitDecor);
  }

  // 点击底部 tab 切换页面时退出图标编辑模式
  const tabbar = document.querySelector('.tabbar');
  if (tabbar && grids.length) {
    tabbar.addEventListener('click', () => {
      grids.forEach(g => g.classList.remove('editing'));
      const bar = document.getElementById('decor-bar');
      if (bar) bar.hidden = true;
    });
  }

  // 已摸鱼天数：按和 TA 打卡或聊天的自然日统计
  function fishToday() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function getFishLog() {
    try { return JSON.parse(store.get('fish-log') || '[]'); } catch (e) { return []; }
  }
  function logFish() {
    const list = getFishLog();
    const t = fishToday();
    if (list.indexOf(t) === -1) {
      list.push(t);
      store.set('fish-log', JSON.stringify(list));
    }
    updateFishDays();
  }
  function updateFishDays() {
    const el = document.getElementById('fish-days');
    if (el) el.textContent = getFishLog().length || 0;
  }
  window.logFish = logFish; // 供聊天页调用
  updateFishDays();

  // 兼容旧数据：以前打过卡但未计入摸鱼天数的，自动补记（旧标记视为今天打卡）
  (function () {
    const ck = store.get('checkin');
    if (ck) {
      const d = ck === '1' ? fishToday() : ck; // 旧格式 '1' -> 今天；新格式为日期
      const list = getFishLog();
      if (list.indexOf(d) === -1) {
        list.push(d);
        store.set('fish-log', JSON.stringify(list));
        updateFishDays();
      }
    }
  })();

  // 今日情话：每天固定随机一条（按日期种子，当天不变，隔天换新）
  // 字卡库「桌面今日情话」可自定义字卡库；未自定义时用默认库
  (function () {
    const el = document.getElementById('love-quote');
    if (!el) return;
    const text = (window.getQuoteOfDay && window.getQuoteOfDay()) || '我偏爱你。';
    el.textContent = text;
    // 今日情话存档：每天一条，全部历史保存在主页（同一天不重复）
    try {
      const today = fishToday();
      const list = JSON.parse(store.get('quote-history') || '[]');
      if (!list.length || list[0].date !== today) {
        list.unshift({ date: today, text: text, ts: Date.now() });
        store.set('quote-history', JSON.stringify(list));
      }
    } catch (e) {}
  })();

  // 恋爱纪念日：已在一起天数（默认不预设日期，设置页选择后显示）
  function updateLove() {
    const start = store.get('love-start');
    const daysEl = document.getElementById('love-days');
    const dateEl = document.getElementById('love-date');
    const mDays = document.getElementById('mem-love-days');
    const mDate = document.getElementById('mem-love-date');
    const mNext = document.getElementById('mem-next');
    if (!start) {
      if (daysEl) daysEl.textContent = '';
      if (dateEl) dateEl.textContent = '';
      if (mDays) mDays.textContent = '—';
      if (mDate) mDate.textContent = '';
      if (mNext) mNext.textContent = '请先设置恋爱纪念日';
      return;
    }
    const d = new Date(start + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    const days = Math.max(1, Math.floor((new Date() - d) / 864e5));
    const fmt = start.split('-').join('.');
    if (daysEl) daysEl.textContent = days + ' 天';
    if (dateEl) dateEl.textContent = fmt + ' 起 · 我们在一起';
    if (mDays) mDays.textContent = days;
    if (mDate) mDate.textContent = fmt + ' 起 · 我们在一起';
    // 下一个纪念日倒计时（下次同月同日）
    const now = new Date();
    const ann = new Date(now.getFullYear(), d.getMonth(), d.getDate());
    if (ann.getTime() < now.getTime()) ann.setFullYear(ann.getFullYear() + 1);
    const cd = Math.ceil((ann - now) / 864e5);
    if (mNext) mNext.textContent = '还有 ' + cd + ' 天 · ' + (ann.getMonth() + 1) + ' 月 ' + ann.getDate() + ' 日';
  }
  updateLove();

  // 设置页恋爱纪念日：原生日期选择器（任何浏览器/手机上都能点开）
  const dateInput = document.getElementById('love-date-input');
  if (dateInput) {
    const saved = store.get('love-start');
    if (saved) dateInput.value = saved;
    dateInput.addEventListener('change', () => {
      if (dateInput.value) {
        store.set('love-start', dateInput.value);
        updateLove();
      }
    });
  }

  // 其他纪念日：可自由添加/删除（存本地）
  // 条目：{ name, date, type }——type: 'ann' 纪念日（已 X 天）/ 'count' 倒数日（还有 X 天）
  function getExtras() {
    try { return JSON.parse(store.get('mem-extras') || '[]'); } catch (e) { return []; }
  }
  function saveExtras(list) { store.set('mem-extras', JSON.stringify(list)); }
  function renderExtras() {
    const list = document.getElementById('mem-extra-list');
    if (!list) return;
    const extras = getExtras();
    list.innerHTML = '';
    extras.forEach((it, i) => {
      const d = document.createElement('div');
      d.className = 'mem-extra';
      const target = new Date(it.date + 'T00:00:00');
      // v3.5.131：非法日期（导入的脏数据）跳过，不再显示"还有 NaN 天"
      if (isNaN(target.getTime())) return;
      // diff 正 = 日期在未来（倒计时）；负 = 已过
      const diff = Math.round((target.getTime() - Date.now()) / 864e5);
      const isCount = it.type === 'count' || diff > 0;
      const label = isCount
        ? (diff > 0 ? '还有 ' + diff + ' 天' : '就是今天')
        : '已 ' + Math.abs(diff) + ' 天';
      const fmt = it.date.split('-').join('.');
      d.innerHTML =
        '<span class="me-name">' + it.name + '</span>' +
        '<span class="me-date">' + fmt + '</span>' +
        '<span class="me-days' + (isCount ? ' count' : '') + '">' + label + '</span>' +
        '<button class="me-del">✕</button>';
      d.querySelector('.me-del').addEventListener('click', () => {
        const ex = getExtras();
        ex.splice(i, 1);
        saveExtras(ex);
        renderExtras();
      });
      list.appendChild(d);
    });
  }
  const memAdd = document.getElementById('mem-add');
  if (memAdd) {
    memAdd.addEventListener('click', openMemAddModal);
  }

  // ================= 添加纪念日 / 倒数日：日历选择弹层 =================
  // v3.5.29：从"文本输入名称+日期"改为可视化月历点选（更直观美观）
  let memMask = null;      // 弹层单例
  let memSelDate = '';     // 选中日期 'YYYY-MM-DD'
  let memSelType = 'auto'; // auto/ann/count
  let mvY = 0, mvM = -1;   // 弹层当前查看的年/月（-1=本月）
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function memToday() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function renderMemCal() {
    if (!memMask) return;
    const now = new Date();
    if (mvM < 0) { mvY = now.getFullYear(); mvM = now.getMonth(); }
    const y = mvY, m = mvM;
    memMask.querySelector('.mem-cal-title').textContent = y + ' 年 ' + (m + 1) + ' 月';
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const startWd = first.getDay();
    const wds = ['日', '一', '二', '三', '四', '五', '六'];
    const t = memToday();
    let html = wds.map(w => '<span class="mem-cal-wd">' + w + '</span>').join('');
    for (let i = 0; i < startWd; i++) html += '<span class="mem-cal-cell blank"></span>';
    for (let d = 1; d <= days; d++) {
      const ds = y + '-' + pad2(m + 1) + '-' + pad2(d);
      const isToday = ds === t;
      const isSel = ds === memSelDate;
      html += '<span class="mem-cal-cell' + (isToday ? ' today' : '') + (isSel ? ' sel' : '') + '" data-d="' + ds + '">' + d + '</span>';
    }
    const grid = memMask.querySelector('.mem-cal-grid');
    grid.innerHTML = html;
    grid.querySelectorAll('.mem-cal-cell[data-d]').forEach(cell => {
      cell.addEventListener('click', () => {
        memSelDate = cell.getAttribute('data-d');
        renderMemCal();
      });
    });
  }
  function closeMemAdd() {
    if (memMask) memMask.hidden = true;
  }
  function openMemAddModal() {
    if (!memMask) {
      memMask = document.createElement('div');
      memMask.id = 'mem-add-mask';
      memMask.className = 'mg-mask';
      memMask.innerHTML =
        '<div class="mg-panel mem-add-panel">' +
          '<div class="mg-head"><span>添加纪念日 / 倒数日</span><button class="mg-close">✕</button></div>' +
          '<input type="text" class="mem-add-input" placeholder="名称（如：在一起一周年 / 生日）" maxlength="24">' +
          '<div class="mem-cal">' +
            '<div class="mem-cal-nav">' +
              '<button class="mem-cal-btn" data-nav="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M15 18l-6-6 6-6"/></svg></button>' +
              '<span class="mem-cal-title"></span>' +
              '<button class="mem-cal-btn" data-nav="1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M9 18l6-6-6-6"/></svg></button>' +
            '</div>' +
            '<div class="mem-cal-grid"></div>' +
          '</div>' +
          '<div class="mem-type-row">' +
            '<button class="mem-type-pill sel" data-type="auto">自动</button>' +
            '<button class="mem-type-pill" data-type="ann">纪念日</button>' +
            '<button class="mem-type-pill" data-type="count">倒数日</button>' +
          '</div>' +
          '<div class="mem-type-hint">未来日期自动按倒数日显示，过去日期按纪念日显示</div>' +
          '<div class="mem-add-foot">' +
            '<button class="mem-add-cancel">取消</button>' +
            '<button class="mem-add-ok">添加</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(memMask);
      memMask.querySelector('.mg-close').addEventListener('click', closeMemAdd);
      memMask.addEventListener('click', (e) => { if (e.target === memMask) closeMemAdd(); });
      memMask.querySelector('.mem-add-cancel').addEventListener('click', closeMemAdd);
      // 月份切换
      memMask.querySelectorAll('.mem-cal-btn').forEach(b => b.addEventListener('click', () => {
        mvM += parseInt(b.getAttribute('data-nav'), 10);
        if (mvM < 0) { mvM = 11; mvY--; }
        if (mvM > 11) { mvM = 0; mvY++; }
        renderMemCal();
      }));
      // 类型切换
      memMask.querySelectorAll('.mem-type-pill').forEach(b => b.addEventListener('click', () => {
        memSelType = b.getAttribute('data-type');
        memMask.querySelectorAll('.mem-type-pill').forEach(x => x.classList.toggle('sel', x === b));
      }));
      // 确定添加
      memMask.querySelector('.mem-add-ok').addEventListener('click', () => {
        // v3.6.x：用 input.mem-add-input 精确命中输入框锚点——手机端（安卓 Chrome/Edge）
        // contenteditable 转换器会在原 input 前插一个同类的 .ce-box div，querySelector('.mem-add-input')
        // 会先匹配到这个 div（div.value 恒为 undefined），导致名称永远为空、纪念日添加不了
        const nameInput = memMask.querySelector('input.mem-add-input');
        const name = (nameInput.value || '').trim();
        if (!name) { nameInput.focus(); toast('请填写名称'); return; }
        if (!memSelDate) { toast('请选择日期'); return; }
        const type = memSelType === 'auto'
          ? (new Date(memSelDate + 'T00:00:00').getTime() > Date.now() ? 'count' : 'ann')
          : memSelType;
        const ex = getExtras();
        ex.push({ name: name, date: memSelDate, type: type });
        saveExtras(ex);
        renderExtras();
        closeMemAdd();
      });
    }
    // 每次打开重置：默认今天 + 自动类型
    memMask.hidden = false;
    memSelDate = memToday();
    memSelType = 'auto';
    const nameInput = memMask.querySelector('input.mem-add-input');
    nameInput.value = '';
    memMask.querySelectorAll('.mem-type-pill').forEach(x => x.classList.toggle('sel', x.getAttribute('data-type') === 'auto'));
    mvY = 0; mvM = -1;
    renderMemCal();
    setTimeout(() => nameInput.focus(), 80);
  }

  // 纪念页：桌面【纪念】图标进入
  const memApp = document.querySelector('.app[data-app="memory"]');
  const memPage = document.getElementById('page-memory');
  if (memApp && memPage) {
    memApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      updateLove();
      renderExtras();
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      memPage.hidden = false;
    });
  }
  const memBack = document.getElementById('mem-back');
  if (memBack) {
    memBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const phonePage = document.getElementById('page-phone');
      if (phonePage) phonePage.hidden = false;
    });
  }

  // 清除本地数据（重置所有自定义内容）
  const resetRow = document.getElementById('row-reset');
  if (resetRow) {
    resetRow.addEventListener('click', () => {
      if (window.openModal) {
        window.openModal('确认清除所有本地数据？（头像、昵称、背景、图标、纪念日、打卡、聊天记录、字卡、音乐、设置）', '', () => {
          // v3.5.131：清空屏障——reload 触发的 beforeunload 会调 flushSave 把内存里的
          // 聊天记录写回（等于没清）；置标志后各模块的落盘路径跳过
          try { window.__resetting = true; } catch (e) {}
          // v3.5.109：彻底清除——除 uid 前缀键外，一并删除历史遗留的「裸键」
          //   （divine-history 是 v3.5.92 前占卜历史存的无前缀键，不删的话刷新后
          //   divination.histLoad 会把它重新迁回，等于没清除）
          const BARE_KEYS = ['divine-history'];
          try {
            Object.keys(localStorage)
              .filter(k => k.indexOf(uid + ':') === 0 || BARE_KEYS.indexOf(k) >= 0)
              .forEach(k => localStorage.removeItem(k));
          } catch (e) {}
          // 清会话级迁移标记（大键迁移标记，随会话残留无实际数据，一并清掉）
          try { sessionStorage.removeItem('xy-ls-big-migrated'); } catch (e) {}
          // 清空 IndexedDB（mochi-db）：只清 localStorage 不清 IDB 的话，
          // 刷新后 idbRestore 会把 IDB 里的旧数据全部回填，等于没清除（手机端必现）
          const idbDone = (window.idbClearAll && window.idbClearAll()) || Promise.resolve(true);
          // 顺带清理 Service Worker 离线缓存（只缓存页面静态资源，不含用户数据）
          if (window.caches && caches.keys) {
            try {
              caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).catch(() => {});
            } catch (e) {}
          }
          idbDone.then(() => { location.reload(); });
        }, { noInput: true });
      }
    });
  }

  // 每日打卡
  const checkin = document.querySelector('.checkin');
  if (checkin) {
    const btn = checkin.querySelector('.ck-btn');
    // v3.5.131：按日期判断——键存在但跨天时恢复可打卡（原逻辑首次打卡后永久锁定）
    if (store.get('checkin') === fishToday()) {
      btn.textContent = '✓ 已打卡';
      btn.classList.add('done');
    }
    // 打卡反馈弹窗（IAB 用页面内弹窗）
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
    checkin.addEventListener('click', () => {
      if (btn.classList.contains('done')) {
        toast('今天已经打过卡啦');
        return;
      }
      btn.textContent = '✓ 已打卡';
      btn.classList.add('done');
      store.set('checkin', fishToday()); // 存日期，便于识别是哪天打的卡
      logFish();
      const days = getFishLog().length;
      toast('打卡成功！已摸鱼 ' + days + ' 天');
    });
  }

  // 离周末还有几天（点击摸鱼 +1，当天数值）
  const weDays = document.getElementById('weekend-days');
  const weCount = document.getElementById('weekend-count');
  const weFish = document.getElementById('weekend-fish');
  if (weDays) {
    const day = new Date().getDay(); // 0=日 6=六
    let daysTo = (6 - day + 7) % 7;   // 距周六
    if (day === 6 || day === 0) {
      // v3.5.131：周日距周六还有 6 天（原"明天是周六"文案错误）
      weDays.textContent = day === 6 ? '今天就是周末啦' : '离周末还有 6 天';
    } else {
      weDays.textContent = '离周末还有 ' + daysTo + ' 天';
    }
  }

  // ===== 摸鱼值（当天值 + 每日新增记录 + 历史累计）=====
  // 三套数据（v3.5.26 起）：
  //  - day-fish-<日期> / day-fish-ta-<日期>：当天摸鱼值（每天 0 点自动重置）
  //  - fish-day-add：每日新增记录 [{date,mine,ta}]（按日期独立累加，导入备份不会互相覆盖）
  //  - fish-total / fish-total-ta：历史累计（主页「每日摸鱼值」顶部展示）
  function fishDayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function fishDayLog() {
    try { return JSON.parse(store.get('fish-day-add') || '[]'); } catch (e) { return []; }
  }
  function saveFishDayLog(list) { store.set('fish-day-add', JSON.stringify(list)); }
  function dayVal(k) { return parseInt(store.get(k) || '0', 10) || 0; }
  // 当天摸鱼值（读 day 键；新的一天自动从 0 开始）
  function todayMine() { return dayVal('day-fish-' + fishDayKey()); }
  function todayTa() { return dayVal('day-fish-ta-' + fishDayKey()); }
  // 增加当天摸鱼值：写入 day 键（当天）+ fish-day-add（每日新增）+ fish-total*（历史累计）
  function addFish(addMine, addTa) {
    const key = fishDayKey();
    if (addMine) {
      store.set('day-fish-' + key, String(todayMine() + addMine));
      store.set('fish-total', String((dayVal('fish-total') || 0) + addMine));
    }
    if (addTa) {
      store.set('day-fish-ta-' + key, String(todayTa() + addTa));
      store.set('fish-total-ta', String((dayVal('fish-total-ta') || 0) + addTa));
    }
    // 每日新增记录：当天独立累加（不覆盖历史）
    const list = fishDayLog();
    const ex = list.find(x => x.date === key);
    if (ex) { ex.mine += addMine || 0; ex.ta += addTa || 0; }
    else list.push({ date: key, mine: addMine || 0, ta: addTa || 0 });
    if (list.length > 365) list.splice(0, list.length - 365);
    saveFishDayLog(list);
  }
  // 一次性迁移 v3.5.25 及更早数据：
  //  旧 weekend-fish / weekend-fish-ta（历史累计）→ fish-total*（历史累计）
  //  旧 fish-day-log（按天累计值）→ 按天差值拆成每日新增 fish-day-add + 重建当天 day-fish-*
  (function () {
    if (store.get('fish-migrated')) return;
    try {
      const oldMine = parseInt(store.get('weekend-fish') || '0', 10) || 0;
      const oldTa = parseInt(store.get('weekend-fish-ta') || '0', 10) || 0;
      // 历史累计
      if (!store.get('fish-total') && oldMine) store.set('fish-total', String(oldMine));
      if (!store.get('fish-total-ta') && oldTa) store.set('fish-total-ta', String(oldTa));
      // 旧按天累计记录 → 每日新增（后一天减前一天）
      let oldLog = [];
      try { oldLog = JSON.parse(store.get('fish-day-log') || '[]'); } catch (e) {}
      if (Array.isArray(oldLog) && oldLog.length) {
        const days = [];
        let prevMine = 0, prevTa = 0;
        // v3.5.131：按日期数值排序（原字符串排序在跨月时错乱——'2026-10-1' < '2026-8-16'）
        // v3.6.x：iOS Safari 对不补零日期（'2026-8-16'）按 ISO 解析返回 NaN——先补零再解析，
        // 否则 iOS 上比较器恒为 0、排序失效（超过 365 天记录时 slice(-365) 会截错）
        const parseDay = (s) => {
          const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || ''));
          if (!m) return NaN;
          return Date.parse(m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) + 'T00:00:00');
        };
        const byDate = (a, b) => (parseDay(a.date) || 0) - (parseDay(b.date) || 0);
        oldLog.slice().sort(byDate).forEach(x => {
          const m = parseInt(x.mine || '0', 10) || 0;
          const t = parseInt(x.ta || '0', 10) || 0;
          days.push({ date: x.date, mine: Math.max(0, m - prevMine), ta: Math.max(0, t - prevTa) });
          prevMine = m; prevTa = t;
        });
        const list = fishDayLog(); // 新格式（迁移前为空）
        const map = {};
        list.forEach(x => { map[x.date] = x; });
        days.forEach(x => {
          if (map[x.date]) { map[x.date].mine += x.mine; map[x.date].ta += x.ta; }
          else map[x.date] = x;
        });
        const merged = Object.keys(map).map(k => map[k]).sort((a, b) => (parseDay(a.date) || 0) - (parseDay(b.date) || 0)).slice(-365);
        saveFishDayLog(merged);
        // 重建当天 day 键（今天的新增 = 记录里今天的新增）
        const key = fishDayKey();
        const today = merged.find(x => x.date === key);
        if (today) {
          store.set('day-fish-' + key, String(dayVal('day-fish-' + key) + (today.mine || 0)));
          store.set('day-fish-ta-' + key, String(dayVal('day-fish-ta-' + key) + (today.ta || 0)));
        }
      } else {
        // 无旧记录：旧累计直接作为当天值（沿用）
        const key = fishDayKey();
        if (oldMine) store.set('day-fish-' + key, String(oldMine));
        if (oldTa) store.set('day-fish-ta-' + key, String(oldTa));
      }
      store.set('fish-migrated', '1');
    } catch (e) {}
  })();

  // ===== 工作值（v3.5.65：与摸鱼值完全并行——当天值 + 每日新增记录 + 历史累计） =====
  //  - day-work-<日期> / day-work-ta-<日期>：当天工作值（每天 0 点自动重置）
  //  - work-day-add：每日新增记录 [{date,mine,ta}]
  //  - work-total / work-total-ta：历史累计（主页「每日打工值」顶部展示）
  function workDayLog() {
    try { return JSON.parse(store.get('work-day-add') || '[]'); } catch (e) { return []; }
  }
  function saveWorkDayLog(list) { store.set('work-day-add', JSON.stringify(list)); }
  function todayWorkMine() { return dayVal('day-work-' + fishDayKey()); }
  function todayWorkTa() { return dayVal('day-work-ta-' + fishDayKey()); }
  function addWork(addMine, addTa) {
    const key = fishDayKey();
    if (addMine) {
      store.set('day-work-' + key, String(todayWorkMine() + addMine));
      store.set('work-total', String((dayVal('work-total') || 0) + addMine));
    }
    if (addTa) {
      store.set('day-work-ta-' + key, String(todayWorkTa() + addTa));
      store.set('work-total-ta', String((dayVal('work-total-ta') || 0) + addTa));
    }
    const list = workDayLog();
    const ex = list.find(x => x.date === key);
    if (ex) { ex.mine += addMine || 0; ex.ta += addTa || 0; }
    else list.push({ date: key, mine: addMine || 0, ta: addTa || 0 });
    if (list.length > 365) list.splice(0, list.length - 365);
    saveWorkDayLog(list);
  }

  // 我的摸鱼值（当天，与按钮数值一致）
  const weMineEl = document.getElementById('weekend-mine');
  const weMineName = document.getElementById('weekend-mine-name');
  if (weMineName) {
    const myName = store.get('lbl-user') || '我';
    // v3.5.75：新结构 grid 两列（.pair > i）——按列标签更新昵称
    const lab = weMineName.querySelectorAll('.pair i');
    if (lab.length >= 2) { lab[0].textContent = myName + ' 摸鱼值'; lab[1].textContent = myName + ' 工作值'; }
  }
  if (weMineEl) {
    weMineEl.textContent = todayMine();
  }
  if (weFish) {
    weFish.addEventListener('click', () => {
      addFish(1, 0);
      if (weCount) weCount.textContent = todayMine();
      if (weMineEl) weMineEl.textContent = todayMine();
      if (window.logFish) window.logFish();
    });
  }
  // 联系人摸鱼值：使用网站时每 60 秒 60% 概率 +1~10（当天值 + 每日记录 + 历史累计）
  // 我的摸鱼值：同样每 60 秒 60% 概率 +1~10（自动增长，按钮点击仍可 +1）
  const weTaEl = document.getElementById('weekend-ta');
  const weTaName = document.getElementById('weekend-ta-name');
  if (weTaName) {
    const name = store.get('lbl-partner') || 'TA';
    // v3.5.75：新结构 grid 两列（.pair > i）——按列标签更新昵称，不覆盖 pair 结构
    const lab = weTaName.querySelectorAll('.pair i');
    if (lab.length >= 2) { lab[0].textContent = name + ' 摸鱼值'; lab[1].textContent = name + ' 工作值'; }
  }
  function syncFishUI() {
    const mine = todayMine();
    const ta = todayTa();
    if (weMineEl) weMineEl.textContent = mine;
    if (weTaEl) weTaEl.textContent = ta;
    if (weCount) weCount.textContent = mine;
    // v3.5.65：工作值同步显示（桌面小字 + 主页历史）
    const wMine = todayWorkMine();
    const wTa = todayWorkTa();
    const weWorkMine = document.getElementById('weekend-work');
    const weWorkTa = document.getElementById('weekend-work-ta');
    if (weWorkMine) weWorkMine.textContent = wMine;
    if (weWorkTa) weWorkTa.textContent = wTa;
    // v3.5.74：昵称标签同步（摸鱼值 + 工作值标签一起更新昵称）
    const myName = store.get('lbl-user') || '我';
    const taName = store.get('lbl-partner') || 'TA';
    if (weMineName) {
      const lm = weMineName.querySelectorAll('.pair i');
      if (lm.length >= 2) { lm[0].textContent = myName + ' 摸鱼值'; lm[1].textContent = myName + ' 工作值'; }
    }
    if (weTaName) {
      const lt = weTaName.querySelectorAll('.pair i');
      if (lt.length >= 2) { lt[0].textContent = taName + ' 摸鱼值'; lt[1].textContent = taName + ' 工作值'; }
    }
    if (window.renderFishHistory) window.renderFishHistory();
    if (window.renderWorkHistory) window.renderWorkHistory();
  }
  if (weTaEl) {
    syncFishUI();
    setInterval(() => {
      try {
        if (document.hidden) return; // v3.5.127：后台不累计摸鱼/打工值
        let addMine = 0, addTa = 0, addWM = 0, addWT = 0;
        // 摸鱼值：双方各 60% 概率 +1~10
        if (Math.random() * 100 < 60) addTa = 1 + Math.floor(Math.random() * 10);
        if (Math.random() * 100 < 60) addMine = 1 + Math.floor(Math.random() * 10);
        // 工作值：同样各 60% 概率 +1~10（与摸鱼值刷新机制一致）
        if (Math.random() * 100 < 60) addWT = 1 + Math.floor(Math.random() * 10);
        if (Math.random() * 100 < 60) addWM = 1 + Math.floor(Math.random() * 10);
        if (addMine || addTa) addFish(addMine, addTa);
        if (addWM || addWT) addWork(addWM, addWT);
        syncFishUI();
      } catch (e) {}
    }, 60000);
  }
  // 每日摸鱼值历史（供主页展示；fish-day-add 按日期独立，最新在前）
  window.getFishHistory = function () { return fishDayLog().slice().reverse(); };
  // 历史累计（供主页顶部展示）
  window.getFishTotals = function () {
    return { mine: dayVal('fish-total'), ta: dayVal('fish-total-ta') };
  };
  // v3.5.65：每日工作值历史 + 累计（供主页「每日打工值」）
  window.getWorkHistory = function () { return workDayLog().slice().reverse(); };
  window.getWorkTotals = function () {
    return { mine: dayVal('work-total'), ta: dayVal('work-total-ta') };
  };

  // 可二传二改的说明：点设置行 → 全屏说明页
  const licRow = document.getElementById('row-license');
  if (licRow) {
    licRow.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const licPage = document.getElementById('page-license');
      if (licPage) licPage.hidden = false;
    });
  }
  const licBack = document.getElementById('lic-back');
  if (licBack) {
    licBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const setPage = document.getElementById('page-setting');
      if (setPage) setPage.hidden = false;
    });
  }

  // 原版功能介绍：点设置行 → 全屏介绍页
  const aboutRow = document.getElementById('row-about');
  if (aboutRow) {
    aboutRow.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const aboutPage = document.getElementById('page-about');
      if (aboutPage) aboutPage.hidden = false;
    });
  }
  const aboutBack = document.getElementById('about-back');
  if (aboutBack) {
    aboutBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const setPage = document.getElementById('page-setting');
      if (setPage) setPage.hidden = false;
    });
  }

  // 通话设置：点设置行 → 全屏设置页
  const callSettingsRow = document.getElementById('row-call-settings');
  if (callSettingsRow) {
    callSettingsRow.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const csPage = document.getElementById('page-call-settings');
      if (csPage) csPage.hidden = false;
    });
  }
})();