// ===== 功能：聊天设置 =====
// 聊天壁纸、双方气泡颜色/文字颜色、字体大小、气泡框大小（localStorage 持久化）
(function () {
  const uid = 'xy-home-v2';
  const store = window.xyStore(uid);
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
    // 聊天头像形状（circle 圆形 / square 方形）
    const avShape = store.get('cs-av-shape') || 'circle';
    root.style.setProperty('--msg-av-radius', avShape === 'square' ? '10px' : '50%');
    set('cs-av-shape-val', avShape === 'square' ? '方形' : '圆形');
    // 聊天壁纸：铺满整个聊天页
    const bg = store.get('cs-bg');
    if (bg && chatPage) {
      chatPage.style.backgroundImage = 'url("' + bg + '")';
      chatPage.style.backgroundSize = 'cover';
      chatPage.style.backgroundPosition = 'center';
    } else if (chatPage) {
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
          // 压缩
          const img = new Image();
          img.onload = () => {
            try {
              const c = document.createElement('canvas');
              const scale = Math.min(1, 900 / Math.max(img.width, img.height));
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
        '<input class="tc-input" id="cs-pad-input" value="' + cur + '"></div>' +
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
        v = v.replace(/(\d+(?:\.\d+)?)(?!px)\b/g, '$1px');
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

  // v3.5.93：聊天壁纸/上传字体等大键可能只存在 IndexedDB（导入兜底写入/大键只进 IDB）——
  // 启动时从 IDB 补读后重新应用
  try {
    if (window.idbGet) {
      window.idbGet(uid + ':cs-bg').then(v => {
        if (v && typeof v === 'string' && v.length > 2 && !store.get('cs-bg')) {
          store.set('cs-bg', v);
          applySettings();
        }
      });
      window.idbGet(uid + ':' + FONT_KEY).then(v => {
        if (v && typeof v === 'string' && v.length > 2 && !store.get(FONT_KEY)) {
          store.set(FONT_KEY, v);
          applyFont();
        }
      });
    }
  } catch (e) {}
})();
