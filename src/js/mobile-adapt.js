// ===== 功能：手机端适配（v3.5.105，安卓 / iOS） =====
// CSS 已处理：输入框字号 16px 防 iOS 聚焦缩放、safe-area 底部留白、overscroll 防回弹
// 这里补 JS 层：iOS 手势/双击缩放兜底 + 文本输入框 contenteditable 化（防 Chrome 自动填充条）
//              + 输入法适配（v3.6.x 最小干预，不再锁 .phone 高度）+ 弹层滚动穿透锁
(function () {
  // 只在真实手机窄屏启用（桌面模拟器外壳不受影响）
  // v3.5.137：900px——Moto G100 等 2400px 物理屏 / DPR 2.75-3 的 CSS 视口约 800-873px，
  // 原 768px 上限会误判为桌面（显示 390px 小手机框 + 两侧灰底）
  let isMobile = false;
  try { isMobile = window.matchMedia && window.matchMedia('(max-width: 900px)').matches; } catch (e) {}
  if (!isMobile) return;

  // v3.6.x：iOS 检测——iOS Safari 上不启用 contenteditable 转换器（见下方 ceConvert 说明）
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

  // iOS Safari：禁止双指/捏合手势缩放（配合 viewport 锁定，双保险）
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  // 禁止双击放大页面（双击选中文本不在此列，长按选词不受影响）
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });

  // v3.5.128：contenteditable 输入框转换器（手机端统一启用）——
  // Chrome 移动端对 <input>/<textarea> 聚焦必弹「自动填充」条（该版本无视
  // autocomplete=off / readonly / 关闭浏览器设置），聊天输入框已验证
  // contenteditable 方案可彻底规避。这里把站点所有文本输入框统一转换：
  // 原 input 退场为数据锚点（ghost），显示/输入由 contenteditable div 接管，
  // 通过 JS 定义 value/focus/blur/事件 实现与原代码全兼容，零改动其他模块。
  // v3.6.x：iOS Safari 不启用转换——该方案本为安卓 Chrome 的「自动填充条」而生，
  // iOS 上无此问题；而 contenteditable 在 iOS Safari 上已知会引发：聚焦键盘不弹、
  // :empty::before 占位符异常、派发 focus 干扰原生输入（页面卡住、无法输入文字）。
  // iOS 保留原生 input/textarea（聚焦弹键盘正常）。聊天输入框是模板原生
  // contenteditable div，不受此转换器影响，iOS Safari 原生支持 contenteditable。
  var ceInited = false;
  function initCeAll() {
    // 全量扫描可重复执行（ceConvert 内 dataset.ceDone 保证幂等），
    // 供 MutationObserver 处理动态新增的输入框（弹层/半框）
    // v3.5.133：补 input:not([type])——未写 type 的 input 默认 text 但不匹配 [type="text"]，
    // 漏转换的输入框（聊天搜索/字体名等）仍会弹 Chrome 自动填充条
    var list = document.querySelectorAll('input:not([type]), input[type="text"], input[type="search"], input[type="number"], textarea');
    list.forEach(ceConvert);
    ceInited = true;
  }
  function ceConvert(inp) {
    if (!inp || inp.dataset.ceDone || inp.readOnly) return;
    var t = inp.type;
    if (inp.type === 'checkbox' || t === 'range' || t === 'file' || t === 'color' || t === 'hidden') return;
    inp.dataset.ceDone = '1';
    // 退场为幽灵锚点（占位1px不可见，保留 id 供现有代码 getElementById）
    inp.classList.add('ce-ghost');
    inp.setAttribute('aria-hidden', 'true');
    // 创建接管输入的 contenteditable div（插到 input 后面）
    var box = document.createElement('div');
    // 继承原输入框样式类（边框/背景/圆角等视觉不变）+ ce-box 基础排版
    box.className = 'ce-box ' + (inp.className || '');
    box.setAttribute('contenteditable', 'true');
    box.setAttribute('spellcheck', 'false');
    box.dataset.for = inp.id || '';
    var ph = inp.getAttribute('placeholder') || '';
    if (ph) box.setAttribute('data-ph', ph);
    // 高度：textarea 按行数估算，input 用原高度/默认
    if (inp.tagName === 'TEXTAREA') {
      var rows = parseInt(inp.getAttribute('rows'), 10) || 3;
      box.style.minHeight = Math.max(48, Math.round(rows * 1.5 * 16)) + 'px';
      box.style.resize = 'none';
    } else {
      box.style.minHeight = '24px';
    }
    box.style.display = 'block';
    box.style.boxSizing = 'border-box';
    // v3.5.133：复制原 inline style（margin 等元素选择器样式转换后丢失——
    // 如 #div-chat-question 的 margin:8px 0）；跳过 box 已设置的关键属性
    if (inp.getAttribute('style')) {
      var skip = ['display', 'min-height', 'box-sizing'];
      try {
        var st = inp.style;
        for (var si = 0; si < st.length; si++) {
          var pn = st[si];
          if (skip.indexOf(pn) >= 0) continue;
          var pv = st.getPropertyValue(pn);
          if (pv) box.style.setProperty(pn, pv);
        }
      } catch (e) {}
    }
    // v3.6.x：hidden 同步——原 input/textarea 可能被业务逻辑按需隐藏
    // （如通用弹层单行模式隐藏 textarea、编辑弹窗切输入/多行），contenteditable
    // box 必须跟随隐藏，否则会多出一个可见的占位框（昵称弹窗出现"多行内容"）。
    // 用内联 display 控制（hidden 属性会被 box.style.display='block' 覆盖，不生效）
    function syncCeHidden() {
      box.style.display = inp.hidden ? 'none' : 'block';
    }
    syncCeHidden();
    try {
      var hmo = new MutationObserver(syncCeHidden);
      hmo.observe(inp, { attributes: true, attributeFilter: ['hidden'] });
    } catch (e) {}
    // maxlength 支持（contenteditable 不原生生效，手动截断）
    // v3.5.131：动态读取——maxLength 可能是弹窗打开后才设置的（openModal 设 input.maxLength），
    // 转换时固化会得到 0（安卓上昵称/备忘长度限制失效）
    var isMulti = inp.tagName === 'TEXTAREA';
    box.addEventListener('input', function () {
      var maxLen = parseInt(inp.getAttribute('maxlength'), 10) || inp.maxLength || 0;
      if (maxLen > 0 && box.textContent.length > maxLen) {
        // v3.5.133：按码点截断——UTF-16 slice 会切开 emoji 代理对产生乱码入库
        box.textContent = Array.from(box.textContent).slice(0, maxLen).join('');
        // 光标移到末尾
        try {
          var r = document.createRange();
          r.selectNodeContents(box);
          r.collapse(false);
          var s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        } catch (e) {}
      }
    });
    // v3.5.133：输入法组合结束补截一次（组合中被跳过的超长内容）
    box.addEventListener('compositionend', function () {
      var maxLen = parseInt(inp.getAttribute('maxlength'), 10) || inp.maxLength || 0;
      if (maxLen > 0 && box.textContent.length > maxLen) {
        box.textContent = Array.from(box.textContent).slice(0, maxLen).join('');
        try {
          var r = document.createRange();
          r.selectNodeContents(box);
          r.collapse(false);
          var s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        } catch (e) {}
      }
    });
    // 单行输入框：Enter 不插入换行（原 input 行为一致）
    if (!isMulti) {
      box.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') e.preventDefault();
      });
    }
    // 注入数据锚点：input 的 value 读写、focus/blur、事件转发都由 box 代理
    inp.__ceBox = box;
    box.__ceInp = inp;
    // v3.5.128：box 必须插入 DOM（插到 input 前，ghost 只占 1px 不可见）——
    // 此前漏了插入，input 变 ghost 后用户看不到也输不了输入框
    try { inp.parentNode.insertBefore(box, inp); } catch (e) {}
    // 兼容原代码：input.value / input.focus / input.blur / input.addEventListener
    Object.defineProperty(inp, 'value', {
      get: function () {
        // v3.6.x：多行输入框（textarea）必须用 innerText——contenteditable 里按 Enter
        // 产生的是块级 <div> 结构，textContent 不保留换行（返回「选项1选项2」），
        // 依赖换行分割的业务（帮我决定选项、批量输入等按行读取）会拿到 1 行 → 误报
        // 「至少需要 2 个选项」。innerText 会把 div/br 还原为 \n，与原生 textarea 一致。
        // v3.5.135：邮件媒体标记（隐藏 span.mail-media-mark 存 sticker:/image: 文本）
        // display:none 时 innerText 读不到——按 DOM 顺序重组保证图片与文字顺序一致；
        // 仅对含标记的 box 生效（其他输入框保持原 innerText/textContent 逻辑不变）
        try {
          if (box.querySelector('span.mail-media-mark')) {
            let out = '';
            box.childNodes.forEach(function (n) {
              if (n.nodeType === 3) { out += n.textContent; return; }
              if (n.nodeType === 1) {
                if (n.classList && n.classList.contains('mail-media-mark')) out += (out ? ' ' : '') + n.textContent;
                else if (n.tagName === 'IMG' && n.src && n.src.indexOf('data:image') === 0) {
                  // v3.5.136：img 的标记 span 被用户退格删掉时，从 src 重建标记——
                  // 否则该图片在保存时丢失（数据丢失风险）
                  out += (out ? ' ' : '') + 'image:' + n.src;
                }
                else if (n.tagName === 'DIV' || n.tagName === 'BR') out += '\n';
              }
            });
            return out;
          }
        } catch (e) {}
        if (isMulti) {
          try { return (box.innerText || box.textContent || ''); } catch (e) {}
        }
        return box.textContent || '';
      },
      set: function (v) {
        const s = (v == null ? '' : String(v));
        if (isMulti) {
          // 编辑回填多行内容时同样保留换行（innerText 支持设置含换行的文本）
          try { box.innerText = s; return; } catch (e) {}
        }
        box.textContent = s;
      },
      configurable: true
    });
    Object.defineProperty(inp, 'placeholder', {
      get: function () { return box.getAttribute('data-ph') || ''; },
      set: function (v) { if (v) box.setAttribute('data-ph', v); else box.removeAttribute('data-ph'); },
      configurable: true
    });
    var origFocus = inp.focus, origBlur = inp.blur;
    inp.focus = function () { try { box.focus(); } catch (e) {} };
    inp.blur = function () { try { box.blur(); } catch (e) {} };
    // 事件转发：input/change/keydown/keyup/click 从 box 代理到 inp
    //（keydown 需复制 key/keyCode/isComposing——原代码用它判断 Enter/中文输入）
    // v3.5.133：cancelable:true——业务 e.preventDefault()（如 feed 评论 Enter）才能生效
    ['input', 'change', 'keydown', 'keyup', 'click', 'compositionstart', 'compositionend'].forEach(function (ev) {
      box.addEventListener(ev, function (e) {
        var clone = new Event(ev, { bubbles: true, cancelable: true });
        if (e.data !== undefined) clone.data = e.data;
        if (ev === 'keydown' || ev === 'keyup') {
          clone.key = e.key; clone.keyCode = e.keyCode; clone.isComposing = e.isComposing;
        }
        if (ev === 'input' && e.inputType !== undefined) clone.inputType = e.inputType;
        try { inp.dispatchEvent(clone); } catch (err) {}
      });
    });
    // 触摸/点击聚焦：contenteditable 天然可聚焦，无需额外处理
    box.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
    // focus/blur 不冒泡，单独转发到 inp（原代码可能监听 inp 的 blur/focus）
    box.addEventListener('focus', function () { try { inp.dispatchEvent(new Event('focus', { bubbles: true })); } catch (e) {} });
    box.addEventListener('blur', function () { try { inp.dispatchEvent(new Event('blur', { bubbles: true })); } catch (e) {} });
    // 初始文本：input 若已有 value（如编辑回填），同步进 box
    // v3.5.130：textarea 的 value 是 JS 属性（无 value attribute）——getAttribute 取不到，
    // 导致打开面板后回显为空、点"应用"即清空内容；回退读 .value
    var initV = inp.getAttribute('value');
    if (initV === null && inp.value !== undefined) initV = inp.value;
    if (initV) box.textContent = initV;
  }
  // 启动转换：页面现有文本输入框 + 动态创建（MutationObserver 兜底）
  // v3.6.x：仅非 iOS 启用（iOS Safari 保留原生输入框，见上方说明）
  try { if (!isIOS) initCeAll(); } catch (e) {}
  try {
    if (!isIOS) {
      var ceMo = new MutationObserver(function () { initCeAll(); });
      ceMo.observe(document.body, { childList: true, subtree: true });
    }
  } catch (e) {}

  // v3.5.128：readonly 起手方案已删除——它会被本转换器完全替代：
  // 文本输入框已统一变为 contenteditable div（Chrome 不对其弹自动填充条），
  // 原 input 退场为幽灵锚点不可交互，readonly 不再有任何作用且会干扰动态转换。

  // v3.6.x：输入法（IME）弹出适配改为「最小干预」——
  // 此前用 visualViewport 把 .phone 锁定成 position:fixed + 键盘高度 + --ime-h 补偿，
  // 在部分安卓机上实测引发：输入法弹窗被截断、页面持续闪屏、输入法弹不出来。
  // 根因：聚焦时 window.scrollTo(0,0) 与浏览器原生滚动打架，地址栏显隐使 visualViewport
  // 高度抖动被误判为「键盘弹出」→ 反复锁高/解锁形成闪烁死循环；锁高又把 .phone 压成
  // 错误高度，键盘像被「截断」。通话中来电 blur + --ime-h 补偿与之叠加更明显。
  // 现在不锁 .phone、不写 --ime-h、不加 ime-open：
  //   · viewport meta 已带 interactive-widget=resizes-content——安卓 Chrome/Edge 会把
  //     布局视口收缩到键盘上方，.phone 的 100dvh 随之重算，输入栏天然停靠键盘上方；
  //   · 其余浏览器由系统原生把聚焦输入框滚到键盘上方，无需 JS 干预。
  // 这里只保留一个轻量兜底：聚焦后把输入框所在的滚动容器（聊天消息区等）滚到可见，
  // 不滚 window、不重复执行——仅给个别浏览器原生滚动不到位时补位。
  function isTextEl(el) {
    return el && ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      ? (el.type !== 'checkbox' && el.type !== 'range' && el.type !== 'file' && el.type !== 'color' && !el.readOnly)
      : el.isContentEditable === true);
  }
  var nudgeTimer = null;
  function nudgeInputVisible() {
    var active = document.activeElement;
    if (!isTextEl(active) || !active.getBoundingClientRect) return;
    var r = active.getBoundingClientRect();
    try {
      var scroller = active.closest('.chat-body, .card-list, .gs-scroll, .tc-body, .mem-scroll, .cal-scroll, .div-scroll, .fav-list, .mail-list, .qa-body, .modal, .chat-ask-body, .poke-card-scroll, .chat-decision-body');
      if (!scroller) return;
      var sr = scroller.getBoundingClientRect();
      if (r.bottom > sr.bottom - 8) {
        scroller.scrollTop = Math.max(0, scroller.scrollTop + (r.bottom - sr.bottom) + 16);
      }
    } catch (e) {}
  }
  // 聚焦兜底：单次延迟补位（输入法弹出有时间差），不重复触发
  document.addEventListener('focusin', function () {
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(nudgeInputVisible, 300);
  });
  // 输入法收起（失焦）无需任何处理：.phone 高度从未被 JS 改动

  // ================= iOS 专用：键盘（IME）弹出适配（v3.6.x） =================
  // iOS Safari 键盘是 overlay 模式——弹出时【不收缩布局视口】，.phone 的 100dvh
  // 不会重算，输入栏会被键盘盖住，看起来像"键盘没弹/无法输入"（安卓 Chrome/Edge
  // 靠 viewport 的 interactive-widget=resizes-content 自动收缩，无需此处理）。
  // 这里仅对 iOS 启用 visualViewport 锁高：键盘弹出时把 .phone 固定到可视高度，
  // 输入栏天然停靠键盘上方；收起时恢复。安卓不受影响（isIOS 分支）。
  // .chat-body 的 translateZ(0)（防安卓白屏）在 iOS 上也会引发滚动异常——
  // 一并在此用内联 transform:none 豁免（JS 判断 iOS 比 CSS @supports 可靠）。
  if (isIOS) {
    try {
      var _phone = document.querySelector('.phone');
      var _cb = document.getElementById('chat-body');
      if (_cb) _cb.style.transform = 'none'; // iOS 豁免合成层，避免滚动卡顿
      var _vv = window.visualViewport;
      var _kbActive = false;
      var _noKbH = _vv ? _vv.height : window.innerHeight;
      function syncIosKb() {
        if (!_vv || !_phone) return;
        var _focused = isTextEl(document.activeElement);
        var _h = _vv.height;
        // 无键盘时跟随可视高度更新基准（地址栏显隐变化不误判）
        if (!_kbActive && _h > _noKbH) _noKbH = _h;
        var _open = _focused && _h < _noKbH - 60;
        if (_open && !_kbActive) {
          _kbActive = true;
          _phone.style.position = 'fixed';
          _phone.style.top = '0';
          _phone.style.left = '0';
          _phone.style.right = '0';
          _phone.style.margin = '0';
        }
        if (_kbActive) {
          _phone.style.height = _h + 'px';
        }
        if (!_open && _kbActive) {
          _kbActive = false;
          _phone.style.height = '';
          _phone.style.position = '';
          _phone.style.top = '';
          _phone.style.left = '';
          _phone.style.right = '';
          _phone.style.margin = '';
        }
      }
      if (_vv) {
        _vv.addEventListener('resize', syncIosKb);
        _vv.addEventListener('scroll', syncIosKb);
      }
      document.addEventListener('focusin', function () {
        setTimeout(syncIosKb, 250);
        setTimeout(syncIosKb, 450);
      });
      document.addEventListener('focusout', function () {
        setTimeout(function () { if (_kbActive && _vv && window.innerHeight - _vv.height <= 80) syncIosKb(); }, 400);
      });
    } catch (e) {}
  }

  // v3.5.107：滚动穿透锁——全屏/半屏浮层打开时禁止背景滚动（手机端典型问题：
  // 在弹层里滑动，背景页面跟着滚；安卓/iOS 都常见）
  // v3.5.116：补上更多功能面板/搜索/帮我决定/占卜/头像互动/查岗半框；
  // 管理分组弹层（.mg-mask）是动态创建的，用类选择器 + body 观察兜底
  // v3.5.123：补 #modal-mask（通用弹窗）/ #msg-actions（气泡操作菜单）
  const FLOAT_SELECTORS = ['#tc-mask', '#call-mask', '#feed-notice-panel', '#poke-card', '#emoji-panel', '#chat-ask-panel', '#qa-mask', '#desk-msg', '#chat-more-panel', '#chat-search', '#chat-decision-panel', '#chat-divine-panel', '#avlib-card', '#ck-panel', '.mg-mask', '#modal-mask', '#msg-actions'];
  let locked = false;
  function applyLock() {
    const anyOpen = FLOAT_SELECTORS.some(function (sel) {
      try {
        const el = document.querySelector(sel);
        return el && !el.hidden;
      } catch (e) { return false; }
    });
    if (anyOpen && !locked) {
      document.body.classList.add('scroll-lock');
      locked = true;
    } else if (!anyOpen && locked) {
      document.body.classList.remove('scroll-lock');
      locked = false;
    }
  }
  try {
    const mo = new MutationObserver(applyLock);
    FLOAT_SELECTORS.forEach(function (sel) {
      try {
        const el = document.querySelector(sel);
        if (el) mo.observe(el, { attributes: true, attributeFilter: ['hidden'] });
      } catch (e) {}
    });
    // 动态创建的 .mg-mask（管理分组弹层）：插入 body 时补观察 hidden + 立即应用锁
    const bodyMo = new MutationObserver(function (muts) {
      let changed = false;
      muts.forEach(function (m) {
        if (!m.addedNodes) return;
        m.addedNodes.forEach(function (n) {
          if (n && n.nodeType === 1 && n.classList && n.classList.contains('mg-mask')) {
            try { mo.observe(n, { attributes: true, attributeFilter: ['hidden'] }); } catch (e) {}
            changed = true;
          }
        });
      });
      if (changed) applyLock();
    });
    bodyMo.observe(document.body, { childList: true });
  } catch (e) {}
  applyLock();
  // v3.6.x：滚动锁触摸兜底——极端情况下浮层已关闭但锁未解除（iOS Safari 上会
  // 表现为整个页面无法滚动/点击无响应、像"卡死"）。每次触摸时复查一次：
  // 若实际没有任何浮层打开就立即解锁，避免锁残留。
  document.addEventListener('touchstart', function () {
    try { applyLock(); } catch (e) {}
  }, { passive: true });
})();
