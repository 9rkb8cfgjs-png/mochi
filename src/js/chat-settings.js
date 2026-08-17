// ===== 功能：聊天设置 =====
// 聊天壁纸、双方气泡颜色/文字颜色、字体大小、气泡框大小（localStorage 持久化）
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  const root = document.documentElement;
  const body = document.getElementById('chat-body');
  if (!body) return;
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }
  // 壁纸铺满整个聊天页（含顶部栏/输入栏）
  const chatPage = document.getElementById('page-chat');

  const FONT_SIZES = [
    { label: '小', value: '13px' },
    { label: '标准', value: '14px' },
    { label: '大', value: '16px' },
    { label: '特大', value: '18px' }
  ];
  const BUBBLE_SIZES = [
    { label: '紧凑', value: '8px 10px' },
    { label: '标准', value: '11px 14px' },
    { label: '宽松', value: '14px 18px' }
  ];

  function applySettings() {
    // 设置页值写入（定义在最前，避免暂时性死区）
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const inBg = store.get('cs-in-bg') || '#ffffff';
    const inInk = store.get('cs-in-ink') || '#111111';
    const outBg = store.get('cs-out-bg') || '#111111';
    const outInk = store.get('cs-out-ink') || '#ffffff';
    const fs = store.get('cs-font-size') || '14px';
    const pad = store.get('cs-bubble-size') || '11px 14px';
    root.style.setProperty('--msg-in-bg', inBg);
    root.style.setProperty('--msg-in-ink', inInk);
    root.style.setProperty('--msg-out-bg', outBg);
    root.style.setProperty('--msg-out-ink', outInk);
    root.style.setProperty('--chat-font-size', fs);
    root.style.setProperty('--chat-bubble-pad', pad);
    // 时间轴颜色（默认黑）
    const timeInk = store.get('cs-time-ink') || '#111111';
    root.style.setProperty('--msg-time-ink', timeInk);
    // 正在输入中颜色（默认灰）
    const typingInk = store.get('cs-typing-ink') || '#8a8a8a';
    root.style.setProperty('--typing-ink', typingInk);
    // 发送按钮颜色（默认黑）
    const sendBg = store.get('cs-send-bg') || '#111111';
    root.style.setProperty('--send-bg', sendBg);
    // 发送按钮文字颜色（默认白）
    const sendInk = store.get('cs-send-ink') || '#ffffff';
    root.style.setProperty('--send-ink', sendInk);
    // 双方气泡颜色/文字颜色当前值回显（默认值显示「默认 #色值」，让用户知道默认颜色）
    set('cs-out-bg-val', outBg === '#111111' ? '默认 #111111' : outBg);
    set('cs-out-ink-val', outInk === '#ffffff' ? '默认 #ffffff' : outInk);
    set('cs-in-bg-val', inBg === '#ffffff' ? '默认 #ffffff' : inBg);
    set('cs-in-ink-val', inInk === '#111111' ? '默认 #111111' : inInk);
    // 聊天头像形状（circle 圆形 / square 方形）
    const avShape = store.get('cs-av-shape') || 'circle';
    root.style.setProperty('--msg-av-radius', avShape === 'square' ? '10px' : '50%');
    set('cs-av-shape-val', avShape === 'square' ? '方形' : '圆形');
    // 聊天壁纸：铺满整个聊天页
    // v3.6.x：值没变时不重写 style——applySettings 在每次进入聊天页时调用，
    // 反复重设 background-image（大图 dataURL）会让浏览器重新解码、触发重绘
    // v3.5.126：去掉 background-attachment:fixed——手机上 fixed 背景相对视口定位，
    // 全屏/输入法/安全区变化时与元素尺寸不一致 → 比例错位、露白；且移动端
    // 对 fixed 背景降采样 → 发糊。聊天页本身 overflow:hidden 不滚动（只有
    // .chat-body 内部滚动），默认 scroll 模式下背景相对 page 本来就是固定的，
    // fixed 纯属多余并引入视口耦合。
    // v3.6.x：存量大图渲染防护——旧版本聊天壁纸压缩失败时回退存过原图（48MP/ProRAW
    // 级别十几 MB），渲染 backgroundImage 会让 iOS Safari 解码卡死（打开页面卡顿点不动）。
    // 正常压缩产物（2160-4096px JPEG 0.85）≤6MB，>6MB 判定为异常存量，清除回默认
    let bg = store.get('cs-bg');
    if (bg && typeof bg === 'string' && bg.length > 6 * 1024 * 1024) {
      try { store.remove('cs-bg'); } catch (e) {}
      bg = null;
    }
    if (bg && chatPage) {
      if (chatPage.style.backgroundImage !== 'url("' + bg + '")') {
        chatPage.style.backgroundImage = 'url("' + bg + '")';
        chatPage.style.backgroundSize = 'cover';
        chatPage.style.backgroundPosition = 'center';
      }
    } else if (chatPage && chatPage.style.backgroundImage) {
      chatPage.style.backgroundImage = '';
    }
    set('cs-font-size-val', fs);
    const pn = BUBBLE_SIZES.find(p => p.value === pad);
    set('cs-bubble-size-val', pn ? pn.label : '自定义');
    set('cs-bg-val', bg ? '已设置' : '');
    const rm = document.getElementById('cs-bg-remove');
    if (rm) rm.hidden = !bg;
  }
  window.applyChatSettings = applySettings;
  applySettings();

  // 各设置行
  const row = (id) => document.getElementById(id);
  const csBg = row('cs-bg-upload');
  if (csBg) {
    csBg.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          // 压缩：v3.5.126 按设备物理像素定上限——之前固定 900px，
          // 在 2-3x 高分屏（物理宽 1080-1440）铺满时被放大发糊
          const img = new Image();
          img.onload = () => {
            try {
              const dpr = Math.max(1, window.devicePixelRatio || 1);
              const screenH = (window.screen && window.screen.height) || 1920;
              const maxSide = Math.min(4096, Math.max(2160, Math.round(screenH * dpr)));
              const c = document.createElement('canvas');
              const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
              c.width = Math.max(1, Math.round(img.width * scale));
              c.height = Math.max(1, Math.round(img.height * scale));
              c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
              const data = c.toDataURL('image/jpeg', 0.85);
              store.set('cs-bg', data);
              applySettings();
            } catch (e) {}
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(f);
      };
      input.click();
    });
  }
  const csBgRm = row('cs-bg-remove');
  if (csBgRm) {
    csBgRm.addEventListener('click', () => {
      store.remove('cs-bg');
      applySettings();
    });
  }

  const csAvShape = row('cs-av-shape');
  if (csAvShape) {
    csAvShape.addEventListener('click', () => {
      if (!window.openModal) return;
      window.openModal('聊天头像形状', '', (v) => { store.set('cs-av-shape', v); applySettings(); }, {
        pills: [
          { label: '圆形', value: 'circle' },
          { label: '方形', value: 'square' }
        ],
        pill: store.get('cs-av-shape') || 'circle',
        noInput: true
      });
    });
  }
  // ================= 双方气泡颜色 / 文字颜色 =================
  // 色板：气泡底色与文字色（v3.6.x：新增颜色设置入口，走 openModal 色板）
  const BUBBLE_BG_COLORS = [
    { color: '#111111', label: '默认黑' },
    { color: '#ffffff', label: '白色' },
    { color: '#3a3a3a', label: '炭灰' },
    { color: '#ffd6e0', label: '樱花粉' },
    { color: '#d6e4ff', label: '雾霭蓝' },
    { color: '#d8f5e0', label: '薄荷绿' },
    { color: '#fff3d6', label: '奶油黄' },
    { color: '#e8dcff', label: '淡紫' },
    { color: '#ffdcc0', label: '暖橘' }
  ];
  const BUBBLE_INK_COLORS = [
    { color: '#111111', label: '默认黑' },
    { color: '#ffffff', label: '白色' },
    { color: '#444444', label: '深灰' },
    { color: '#d6336c', label: '玫红' },
    { color: '#1a56db', label: '蓝' },
    { color: '#1e8e5a', label: '绿' },
    { color: '#9a6b00', label: '黄褐' },
    { color: '#7048e8', label: '紫' },
    { color: '#b3540a', label: '橘' }
  ];
  // 气泡颜色行统一处理：openModal 色板 → 存 cs-* 键 → applySettings 生效
  function bindBubbleColorRow(rowId, key, def, title, swatches) {
    const el = row(rowId);
    if (!el) return;
    el.addEventListener('click', () => {
      if (!window.openModal) return;
      const cur = store.get(key) || def;
      window.openModal(title, '', (v) => {
        // v 可能是色板下标（number）或自定义色值（#hex 字符串）
        const color = (typeof v === 'number' && swatches[v]) ? swatches[v].color : v;
        if (!color) return;
        store.set(key, color);
        applySettings();
        const val = document.getElementById(rowId + '-val');
        if (val) val.textContent = color === def ? '默认 ' + color : color;
      }, {
        colorPicker: true,
        color: cur,
        swatches: swatches
      });
    });
  }
  // 我的气泡（out 深色系）/ 联系人气泡（in 浅色系）与各自文字色
  bindBubbleColorRow('cs-out-bg', 'cs-out-bg', '#111111', '我的气泡颜色', BUBBLE_BG_COLORS);
  bindBubbleColorRow('cs-out-ink', 'cs-out-ink', '#ffffff', '我的消息文字颜色', BUBBLE_INK_COLORS);
  bindBubbleColorRow('cs-in-bg', 'cs-in-bg', '#ffffff', '联系人气泡颜色', BUBBLE_BG_COLORS);
  bindBubbleColorRow('cs-in-ink', 'cs-in-ink', '#111111', '联系人消息文字颜色', BUBBLE_INK_COLORS);

  const csFont = row('cs-font-size');
  if (csFont) {
    csFont.addEventListener('click', () => {
      if (!window.openModal) return;
      window.openModal('聊天气泡字体大小', '', (v) => { store.set('cs-font-size', v); applySettings(); }, {
        pills: FONT_SIZES,
        pill: store.get('cs-font-size') || '14px'
      });
    });
  }
  const csPad = row('cs-bubble-size');
  if (csPad) {
    csPad.addEventListener('click', () => {
      if (!window.openTCPanel) return;
      const cur = store.get('cs-bubble-size') || '11px 14px';
      const curLabel = (BUBBLE_SIZES.find(p => p.value === cur) || {}).label || '自定义';
      window.openTCPanel('聊天气泡框大小', '' +
        '<div class="sm-fld"><label>预设大小</label><select class="tc-input" id="cs-pad-preset">' +
        '<option value="">自定义</option>' +
        BUBBLE_SIZES.map(p => '<option value="' + p.value + '"' + (p.value === cur ? ' selected' : '') + '>' + p.label + '</option>').join('') +
        '</select></div>' +
        '<div class="sm-fld"><label>自定义（格式：上下 左右，如 <code>8px 10px</code>）</label>' +
        // v3.6.x：回填值做 HTML 转义——用户可写的值含 " 会破坏 value 属性（与 cs-font-name 一致）
        '<input class="tc-input" id="cs-pad-input" value="' + String(cur).replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"></div>' +
        '<div class="sm-set-hint">示例：紧凑 8px 10px · 标准 11px 14px · 宽松 14px 18px</div>' +
        '<div class="mail-actions"><button class="cc-tool" id="cs-pad-cancel">取消</button><button class="cc-tool" id="cs-pad-ok">应用</button></div>');
      document.getElementById('cs-pad-cancel').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
      document.getElementById('cs-pad-preset').addEventListener('change', () => {
        const v = document.getElementById('cs-pad-preset').value;
        if (v) document.getElementById('cs-pad-input').value = v;
      });
      document.getElementById('cs-pad-ok').addEventListener('click', () => {
        let v = (document.getElementById('cs-pad-input').value || '').trim();
        if (!v) { toast('请输入气泡框大小'); return; }
        // 规范化：数字+px 或 纯数字（默认px）
        // v3.6.x：原正则会把 "1.5px" 改坏成 "1px.5px"（回溯拆开小数）——改为分词处理，
        // 已带 px 的 token 不动，纯数字补 px，避免无效 CSS 静默回退默认
        v = String(v).split(/[,\s]+/).filter(Boolean).map(function (tok) {
          return /^-?\d+(?:\.\d+)?px$/.test(tok) ? tok : tok.replace(/^(-?\d+(?:\.\d+)?)$/, '$1px');
        }).join(' ');
        store.set('cs-bubble-size', v);
        document.getElementById('tc-mask').hidden = true;
        applySettings();
        toast('气泡框大小已应用');
      });
    });
  }

  // ================= 全局字体（上传本地字体 / 输入字体名或链接，v3.5.34 起全局应用） =================
  const csFontRow = row('cs-font');
  const FONT_KEY = 'cs-font';
  function fontVal() { return store.get(FONT_KEY) || ''; }
  function applyFont() {
    // 移除旧的字体样式
    const old = document.getElementById('cs-font-style');
    if (old) old.remove();
    const v = fontVal();
    const setVal = document.getElementById('cs-font-val');
    if (setVal) setVal.textContent = v ? (v.indexOf('data:') === 0 ? '已上传' : v) : '默认';
    if (!v) {
      document.body.style.fontFamily = '';
      document.documentElement.style.fontFamily = '';
      return;
    }
    // dataURL → @font-face 注入 + 全局应用（body/html 继承到全部页面，不只聊天）
    if (v.indexOf('data:') === 0) {
      const st = document.createElement('style');
      st.id = 'cs-font-style';
      st.textContent = '@font-face{font-family:"cs-custom-font";src:url("' + v + '");font-display:swap;}' +
        'body,html{font-family:"cs-custom-font",sans-serif !important;}';
      document.head.appendChild(st);
      document.body.style.fontFamily = '';
      document.documentElement.style.fontFamily = '';
      return;
    }
    // 字体名直接应用（全局）
    document.body.style.fontFamily = '"' + v + '",sans-serif';
    document.documentElement.style.fontFamily = '"' + v + '",sans-serif';
  }
  if (csFontRow) {
    csFontRow.addEventListener('click', () => {
      if (!window.openTCPanel) return;
      window.openTCPanel('全局字体', '' +
        '<div class="sm-fld"><label>上传本地字体（ttf / otf / woff / woff2），应用后全局生效</label>' +
        // v3.6.x：字体名做 HTML 转义——原逻辑直接拼接 value 属性，字体名含 " 或 < 会破坏弹层结构
        '<input class="tc-input" id="cs-font-name" placeholder="也可直接输入字体名或链接，如 Microsoft YaHei"' + (fontVal() && fontVal().indexOf('data:') !== 0 && fontVal().indexOf('http') !== 0 ? ' value="' + String(fontVal()).replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"' : '') + '></div>' +
        '<div class="mail-actions"><button class="cc-tool" id="cs-font-upload">上传字体</button><button class="cc-tool" id="cs-font-clear">恢复默认</button><button class="cc-tool" id="cs-font-ok">应用</button></div>');
      document.getElementById('cs-font-upload').addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.ttf,.otf,.woff,.woff2';
        inp.onchange = () => {
          const f = inp.files && inp.files[0];
          if (!f) return;
          toast('正在读取字体文件…');
          const reader = new FileReader();
          reader.onload = () => {
            store.set(FONT_KEY, reader.result);
            document.getElementById('tc-mask').hidden = true;
            applyFont();
            toast('字体已应用成功');
          };
          reader.onerror = () => { toast('字体文件读取失败，请重试'); };
          reader.readAsDataURL(f);
        };
        inp.click();
      });
      document.getElementById('cs-font-clear').addEventListener('click', () => {
        store.remove(FONT_KEY);
        document.getElementById('tc-mask').hidden = true;
        applyFont();
        toast('已恢复默认字体');
      });
      document.getElementById('cs-font-ok').addEventListener('click', () => {
        const name = (document.getElementById('cs-font-name').value || '').trim();
        if (!name) { toast('请输入字体名或链接'); return; }
        // 链接：尝试下载并转 dataURL（失败则按字体名应用）；下载期间先提示，避免"没反应"
        if (/^https?:\/\/.+\.(ttf|otf|woff|woff2)$/i.test(name)) {
          toast('正在下载字体，请稍候…');
          fetch(name, { mode: 'cors' }).then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
          }).then(blob => {
            const rd = new FileReader();
            rd.onload = () => {
              store.set(FONT_KEY, rd.result);
              document.getElementById('tc-mask').hidden = true;
              applyFont();
              toast('字体下载并应用成功');
            };
            rd.onerror = () => {
              store.set(FONT_KEY, name);
              document.getElementById('tc-mask').hidden = true;
              applyFont();
              toast('字体读取失败，已按字体名应用');
            };
            rd.readAsDataURL(blob);
          }).catch(() => {
            store.set(FONT_KEY, name);
            document.getElementById('tc-mask').hidden = true;
            applyFont();
            toast('链接下载失败，已按字体名应用');
          });
          return;
        }
        store.set(FONT_KEY, name);
        document.getElementById('tc-mask').hidden = true;
        applyFont();
        toast('字体已应用成功');
      });
    });
  }
  applyFont();

  // ================= 气泡 CSS（自定义样式，极简黑白灰） =================
  const csCss = row('cs-css');
  const CSS_KEY = 'cs-bubble-css';
  function applyCss() {
    const old = document.getElementById('cs-bubble-style');
    if (old) old.remove();
    const css = store.get(CSS_KEY) || '';
    const setVal = document.getElementById('cs-css-val');
    if (setVal) setVal.textContent = css ? '已设置' : '默认';
    if (!css) return;
    let out = css;
    // 声明块（无选择器）→ 应用到我的/对方气泡
    if (css.indexOf('{') < 0) {
      out = '.msg-out .msg-bubble{' + css + '!important;}' +
            '.msg-in .msg-bubble{' + css + '!important;}';
    } else {
      // 用户选择器映射到 mochi 气泡
      out = css
        .replace(/\.msg-out\b/g, '.msg-out')
        .replace(/\.msg-in\b/g, '.msg-in')
        .replace(/\.message-sent\b/g, '.msg-out .msg-bubble')
        .replace(/\.message-received\b/g, '.msg-in .msg-bubble')
        .replace(/\.mb\.self\b/g, '.msg-out .msg-bubble')
        .replace(/\.mb\.other\b/g, '.msg-in .msg-bubble')
        .replace(/\.bubble-self\b/g, '.msg-out .msg-bubble')
        .replace(/\.bubble-other\b/g, '.msg-in .msg-bubble');
    }
    const st = document.createElement('style');
    st.id = 'cs-bubble-style';
    st.textContent = out;
    document.head.appendChild(st);
  }
  if (csCss) {
    csCss.addEventListener('click', () => {
      if (!window.openTCPanel) return;
      window.openTCPanel('气泡 CSS', '' +
        '<div class="sm-fld-hint" style="margin-bottom:8px">输入自定义样式，支持两种写法：<br>· 直接写声明，如 <code>border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,.1)</code>（自动应用到双方气泡）<br>· 或写选择器，如 <code>.msg-out .msg-bubble{...}</code></div>' +
        '<textarea id="cs-css-input" class="tc-input" rows="6" placeholder="border-radius: 20px;' + '&#10;box-shadow: 0 2px 8px rgba(0,0,0,.12);"></textarea>' +
        '<div class="mail-actions"><button class="cc-tool" id="cs-css-clear">清空</button><button class="cc-tool" id="cs-css-ok">应用</button></div>');
      const ta = document.getElementById('cs-css-input');
      if (ta) ta.value = store.get(CSS_KEY) || '';
      document.getElementById('cs-css-clear').addEventListener('click', () => {
        store.remove(CSS_KEY);
        document.getElementById('tc-mask').hidden = true;
        applyCss();
        toast('已清空气泡样式');
      });
      document.getElementById('cs-css-ok').addEventListener('click', () => {
        const v = (document.getElementById('cs-css-input').value || '').trim();
        store.set(CSS_KEY, v);
        document.getElementById('tc-mask').hidden = true;
        applyCss();
        toast('气泡样式已应用');
      });
    });
  }
  applyCss();

  // ================= 导出 / 导入聊天记录（数据，与清空同组） =================
  // 导出：打包为独立 JSON 下载（聊天记录可能含图片 dataURL，体积大也直接下载，不走 localStorage）
  const csExport = row('cs-export-msgs');
  if (csExport) {
    csExport.addEventListener('click', () => {
      if (!window.chatExportMsgs) { toast('聊天记录暂不可用'); return; }
      toast('正在导出，请稍候…');
      const arr = window.chatExportMsgs();
      const data = { app: 'mochi-zika-chat', version: '1.0', exportTime: new Date().toISOString(), msgs: arr };
      const json = JSON.stringify(data);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '聊天记录_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('已导出 ' + arr.length + ' 条聊天记录');
    });
  }
  // 导入：读取 JSON → 校验 → 预览摘要二次确认 → 覆盖当前记录
  const csImport = row('cs-import-msgs');
  if (csImport) {
    csImport.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        // FileReader 全兼容（旧 iOS File.text() 不支持）
        const reader = new FileReader();
        reader.onload = () => {
          let data;
          try { data = JSON.parse(String(reader.result || '')); } catch (e) { toast('无效的聊天记录文件'); return; }
          if (!data || typeof data !== 'object') { toast('无效的聊天记录文件'); return; }
          // 兼容三种结构：本功能导出的 {app,msgs} / 裸数组 / 整份 mochi 备份（取其中聊天记录）
          let arr = Array.isArray(data) ? data : null;
          if (!arr && data.msgs && Array.isArray(data.msgs)) arr = data.msgs;
          if (!arr && data.ls && typeof data.ls === 'object') {
            const raw = (data.idb && data.idb['xy-home-v2:chat-msgs']) || data.ls['xy-home-v2:chat-msgs'];
            try { arr = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { arr = null; }
          }
          if (!Array.isArray(arr) || !arr.length) { toast('文件里没有聊天记录数据'); return; }
          const n = arr.length;
          const fmt = (t) => t ? new Date(t).toLocaleString() : '未知';
          const lines = ['文件包含 ' + n + ' 条消息：',
            '· 最早：' + fmt(arr[0] && arr[0].ts),
            '· 最新：' + fmt(arr[n - 1] && arr[n - 1].ts),
            '导入将覆盖当前全部聊天记录（不可恢复）。'];
          if (!window.openModal) return;
          window.openModal('确认导入聊天记录？', '', () => {
            if (window.chatImportMsgs && window.chatImportMsgs(arr)) toast('已导入 ' + n + ' 条聊天记录');
            else toast('导入失败');
          }, { noInput: true, staticText: lines.join('\n') });
        };
        reader.onerror = () => { toast('文件读取失败，请重试'); };
        reader.readAsText(f, 'utf-8');
      };
      input.click();
    });
  }

  // ================= 删除全部聊天记录（危险操作，二次确认） =================
  const csClear = row('cs-clear-msgs');
  if (csClear) {
    csClear.addEventListener('click', () => {
      if (!window.openModal) return;
      window.openModal('确认删除全部聊天记录？（双方所有消息将被清空，且不可恢复）', '', () => {
        if (window.clearChatHistory) window.clearChatHistory();
        toast('聊天记录已清空');
      }, { noInput: true });
    });
  }

  // v3.5.93：聊天壁纸/上传字体等大键可能只存在 IndexedDB（导入兜底写入/大键只进 IDB）——
  // 启动时从 IDB 补读后重新应用
  try {
    if (window.idbGet) {
      window.idbGet(window.activePrefix() + ':cs-bg').then(v => {
        if (v && typeof v === 'string' && v.length > 2 && !store.get('cs-bg')) {
          store.set('cs-bg', v);
          applySettings();
        }
      });
      window.idbGet(window.activePrefix() + ':' + FONT_KEY).then(v => {
        if (v && typeof v === 'string' && v.length > 2 && !store.get(FONT_KEY)) {
          store.set(FONT_KEY, v);
          applyFont();
        }
      });
    }
  } catch (e) {}
  // v3.6.x：多桌面——切换联系人后重新应用聊天美化（壁纸/气泡颜色/字号/形状按新桌面）
  document.addEventListener('contact-switched', function () {
    try { applySettings(); } catch (e) {}
  });
})();
