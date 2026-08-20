// ===== 功能：音效设置（v3.5.60 / v3.7.x 内置音效库） =====
// 三类音效：
//  - 联系人来电铃声（sfx-ring / sfx-ring-b）
//  - 联系人发送/回复消息音效（sfx-in / sfx-in-b）
//  - 我发送/回复消息音效（sfx-out / sfx-out-b）
// v3.7.x：新增【内置音效库】——Web Audio API 实时合成，零存储占用。
//   每个联系人桌面可分别选择：静音 / 任一内置音效 / 上传自定义音频。
//   播放优先级：自定义上传（dataURL） > 内置音效（sfx-*-b）。
// v3.7.x：默认关闭——未做任何选择（缺省）或显式选「静音」（'none'）时均不播放；
//   需在音效设置页主动点选内置音效或上传自定义音频后才会生效（用户要求）。
(function () {
  const store = window.activeStore();
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2200);
  }
  const KEYS = { ring: 'sfx-ring', in: 'sfx-in', out: 'sfx-out' };
  const BKEYS = { ring: 'sfx-ring-b', in: 'sfx-in-b', out: 'sfx-out-b' };
  const NAMES = { ring: '联系人来电铃声', in: '联系人发送和回复消息', out: '我发送和回复消息' };

  // ================= 内置音效库（v3.7.x） =================
  // 全部由 Web Audio API 合成，无外部资源、不占 localStorage。
  // 常用短音：bubble 气泡 / ding 叮咚 / bird 小鸟 / drop 水滴 / piano 钢琴 / tick 轻叩
  // 来电铃声：ring-warm 温馨铃 / ring-classic 经典铃
  const PRESET_NAMES = {
    bubble: '气泡', ding: '叮咚', bird: '小鸟', drop: '水滴',
    piano: '钢琴', tick: '轻叩', 'ring-warm': '温馨铃', 'ring-classic': '经典铃'
  };
  // 每类可选的预设顺序（UI 胶囊显示顺序；'none'=静音由渲染逻辑统一加在最前）
  // v3.7.x：in/out 同为聊天消息音效，可用内置音效列表完全一致（收发同款可切换）
  const PRESET_ORDER = {
    ring: ['ring-warm', 'ring-classic'],
    in: ['bubble', 'ding', 'bird', 'drop', 'piano', 'tick'],
    out: ['bubble', 'ding', 'bird', 'drop', 'piano', 'tick']
  };
  // v3.7.x：默认关闭——不再有"缺省即播默认内置"的兜底；
  //   缺省（无键）与显式「静音」（'none'）在 sfxState/playSfx 中统一按静音处理。
  const PRESET_CONTAINERS = { ring: 'sfx-ring-presets', in: 'sfx-in-presets', out: 'sfx-out-presets' };

  // AudioContext 单例：首建 + 每次播放前 resume（iOS 自动播放策略要求）
  let _ctx = null;
  function ensureCtx() {
    try {
      if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (_ctx.state === 'suspended') { const p = _ctx.resume(); if (p && p.catch) p.catch(function () {}); }
      return _ctx;
    } catch (e) { return null; }
  }
  // Web Audio 同样受 iOS 自动播放策略约束：首次真实手势内 resume，
  // 之后定时器/后台触发的音效播放一律放行（与上方 HTMLMediaElement 解锁并行，互不干扰）
  function unlockCtx() { ensureCtx(); }
  document.addEventListener('touchstart', unlockCtx, { passive: true });
  document.addEventListener('click', unlockCtx, { passive: true });
  document.addEventListener('keydown', unlockCtx);

  function makeBuf(ctx, dur, fill) {
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.max(1, Math.ceil(sr * dur)), sr);
    fill(buf.getChannelData(0), sr);
    return buf;
  }
  // 指数扫频正弦（相位积分，无爆音）：t0 起始、f0→f1 指数过渡（k 控制速度）、amp 振幅、att 衰减速率
  function oscInto(d, sr, t0, dur, f0, f1, k, amp, att) {
    const start = Math.max(0, Math.floor(t0 * sr));
    const end = Math.min(d.length, Math.ceil((t0 + dur) * sr));
    let ph = 0;
    for (let i = start; i < end; i++) {
      const t = (i / sr) - t0;
      const f = f1 + (f0 - f1) * Math.exp(-t * k);
      ph += 2 * Math.PI * f / sr;
      d[i] += Math.sin(ph) * amp * Math.exp(-t * att);
    }
  }
  // 噪声层（起音"炸开"感）
  function noiseInto(d, sr, t0, dur, amp, att) {
    const start = Math.max(0, Math.floor(t0 * sr));
    const end = Math.min(d.length, Math.ceil((t0 + dur) * sr));
    for (let i = start; i < end; i++) {
      const t = (i / sr) - t0;
      d[i] += (Math.random() * 2 - 1) * amp * Math.exp(-t * att);
    }
  }
  // 气泡：短促"啵"——快速下滑 pop + 起音噪声，轻盈俏皮
  function synthBubble(ctx) {
    return makeBuf(ctx, 0.18, (d, sr) => {
      oscInto(d, sr, 0, 0.18, 880, 360, 14, 0.5, 26);
      noiseInto(d, sr, 0, 0.05, 0.2, 90);
    });
  }
  // 叮咚：经典消息音——G6「叮」+ C6「咚」，清脆双音
  function synthDing(ctx) {
    return makeBuf(ctx, 0.52, (d, sr) => {
      oscInto(d, sr, 0, 0.14, 1568, 1568, 0, 0.4, 26);
      oscInto(d, sr, 0, 0.14, 3136, 3136, 0, 0.09, 30);
      oscInto(d, sr, 0.2, 0.32, 1046, 1046, 0, 0.42, 13);
      oscInto(d, sr, 0.2, 0.32, 2092, 2092, 0, 0.1, 15);
    });
  }
  // 小鸟：两声上滑啾啾，可爱灵动
  function synthBird(ctx) {
    return makeBuf(ctx, 0.32, (d, sr) => {
      oscInto(d, sr, 0, 0.1, 2100, 3300, 22, 0.35, 32);
      oscInto(d, sr, 0.155, 0.13, 1700, 2600, 18, 0.3, 26);
    });
  }
  // 水滴：清脆下滑"叮"落，干净透亮
  function synthDrop(ctx) {
    return makeBuf(ctx, 0.22, (d, sr) => {
      oscInto(d, sr, 0, 0.2, 1400, 520, 16, 0.45, 20);
      oscInto(d, sr, 0, 0.15, 2800, 1600, 22, 0.1, 34);
    });
  }
  // 钢琴：E5 单音带泛音、长衰减，柔和温暖
  function synthPiano(ctx) {
    return makeBuf(ctx, 0.75, (d, sr) => {
      const f = 659.25;
      oscInto(d, sr, 0, 0.75, f, f, 0, 0.4, 6.5);
      oscInto(d, sr, 0, 0.75, f * 2, f * 2, 0, 0.13, 8);
      oscInto(d, sr, 0, 0.75, f * 3, f * 3, 0, 0.06, 10);
    });
  }
  // 轻叩：极短促柔和点击，存在感低不打扰（默认"我发送消息"音）
  function synthTick(ctx) {
    return makeBuf(ctx, 0.07, (d, sr) => {
      oscInto(d, sr, 0, 0.06, 1200, 850, 50, 0.35, 75);
      noiseInto(d, sr, 0, 0.02, 0.12, 120);
    });
  }
  // 铃声基础：音符序列合成（f 频率、d 时长、gap 该音后静音时长），循环播放时衔接自然
  function synthRingNotes(ctx, notes, dur) {
    return makeBuf(ctx, dur, (d, sr) => {
      let t0 = 0;
      notes.forEach(n => {
        oscInto(d, sr, t0, n.d, n.f, n.f, 0, 0.42, 5);
        oscInto(d, sr, t0, n.d, n.f * 2, n.f * 2, 0, 0.09, 6);
        t0 += n.d + (n.gap || 0);
      });
    });
  }
  // 温馨铃：C5→E5→G5→E5 上形琶音，温柔不刺耳（默认来电铃声）
  function synthRingWarm(ctx) {
    return synthRingNotes(ctx, [
      { f: 523.25, d: 0.45 }, { f: 659.25, d: 0.45 },
      { f: 783.99, d: 0.45 }, { f: 659.25, d: 0.75 }
    ], 2.1);
  }
  // 经典铃：双音交替 + 长间隔，更接近传统电话铃
  function synthRingClassic(ctx) {
    return synthRingNotes(ctx, [
      { f: 659.25, d: 0.35, gap: 0.12 }, { f: 659.25, d: 0.35, gap: 0.7 }
    ], 1.52);
  }
  const SYNTHS = {
    bubble: synthBubble, ding: synthDing, bird: synthBird,
    drop: synthDrop, piano: synthPiano, tick: synthTick,
    'ring-warm': synthRingWarm, 'ring-classic': synthRingClassic
  };
  // AudioBuffer 缓存：ctx 单例下复用，避免每次播放重复合成
  const _bufCache = {};
  function builtinBuffer(ctx, id) {
    if (!_bufCache[id]) {
      try { _bufCache[id] = SYNTHS[id](ctx); } catch (e) { return null; }
    }
    return _bufCache[id];
  }

  // v3.6.x：iOS Safari 自动播放策略修复——HTMLMediaElement 有声播放必须由用户手势解锁，
  // 否则定时器触发的铃声/消息音会被静默拒绝（play() 抛 NotAllowedError，被下方 catch 吞掉，
  // 表现为「开了音效却完全没声音」）。首次真实手势时播放一段静音 WAV 完成解锁，
  // 之后任意定时器播放都放行；Android/桌面 play() 直接成功，且文件本身静音、无副作用。
  (function unlockIosMedia() {
    var unlocked = false;
    function tryUnlock() {
      if (unlocked) return;
      var a = null;
      try {
        // 生成 8-bit PCM 静音 WAV（0.1s / 8000Hz，样本值 128 = 完全静音），不依赖硬编码 base64
        var sr = 8000, n = Math.round(sr * 0.1), buf = new ArrayBuffer(44 + n), v = new DataView(buf);
        var ws = function (o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        ws(0, 'RIFF'); v.setUint32(4, 36 + n, true); ws(8, 'WAVE');
        ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
        ws(36, 'data'); v.setUint32(40, n, true);
        var bytes = new Uint8Array(buf), bin = '', i;
        for (i = 0; i < n; i++) v.setUint8(44 + i, 128);
        for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        a = new Audio();
        a.src = 'data:audio/wav;base64,' + btoa(bin);
        a.volume = 0.0001;
        var p = a.play();
        if (p && p.catch) p.catch(function () { unlocked = false; });
        unlocked = true;
      } catch (e) { unlocked = false; }
    }
    document.addEventListener('touchstart', tryUnlock, { passive: true });
    document.addEventListener('click', tryUnlock, { passive: true });
    document.addEventListener('keydown', tryUnlock);
  })();

  // 播放内置音效（Web Audio）；loop=true 用于来电铃声循环（可被 stopSfx 停止）
  let ringSrc = null;
  let ringAudio = null; // 自定义上传铃声的 Audio 单例（长铃循环可停止）
  function playBuiltin(id, loop) {
    const ctx = ensureCtx();
    if (!ctx) return;
    const buf = builtinBuffer(ctx, id);
    if (!buf) return;
    let src;
    try {
      src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = !!loop;
      const g = ctx.createGain();
      g.gain.value = 0.9;
      src.connect(g);
      g.connect(ctx.destination);
      src.start();
    } catch (e) { return; }
    if (loop) {
      if (ringSrc) { try { ringSrc.stop(); } catch (e) {} }
      ringSrc = src;
    }
  }

  // 播放音效：自定义上传（dataURL）优先，其次内置音效（'none'=静音，缺省=默认内置）
  window.playSfx = function (type, opts) {
    try {
      const loop = !(opts && opts.loop === false);
      const custom = store.get(KEYS[type]);
      if (custom && typeof custom === 'string' && custom.length > 10) {
        // —— 自定义上传音频（每次新建 Audio，避免并发冲突；ring 长铃用单例可停止）——
        if (type === 'ring' && loop) {
          if (ringAudio) { try { ringAudio.pause(); } catch (e) {} }
          ringAudio = new Audio(custom);
          ringAudio.loop = true;
          ringAudio.volume = 0.9;
          ringAudio.play().catch(() => { ringAudio = null; });
        } else {
          const a = new Audio(custom);
          a.volume = 0.9;
          a.play().catch(() => {});
        }
        return;
      }
      // —— 内置音效 ——
      const bid = store.get(BKEYS[type]);
      // v3.7.x：默认关闭——缺省（无键）或显式静音（'none'）都不播放，
      //   只有用户主动选过内置音效才播。
      // v3.7.x bugfix：loop 只对来电铃声（ring）生效——chat.js 调 playSfx('in') 不带 opts
      //   时 loop 为 true，若不拦截会让短音无限循环（自定义路径一直有 type==='ring' 守卫，
      //   内置路径曾遗漏，联系人发一条消息音效一直响）
      if (bid !== 'none' && bid && SYNTHS[bid]) playBuiltin(bid, type === 'ring' && loop);
    } catch (e) {}
  };
  // 停止长音（来电铃声）：同时停自定义 Audio 与内置 BufferSource
  window.stopSfx = function (type) {
    if (type === 'ring') {
      if (ringAudio) { try { ringAudio.pause(); } catch (e) {} ringAudio = null; }
      if (ringSrc) { try { ringSrc.stop(); } catch (e) {} ringSrc = null; }
    }
  };
  // 供设置页胶囊试听内置音效（不循环）
  window.playBuiltinSfx = function (id, loop) { playBuiltin(id, loop); };

  // —— 当前音效状态：{ custom, id, label } ——
  function sfxState(type) {
    const custom = store.get(KEYS[type]);
    if (custom && typeof custom === 'string' && custom.length > 10) {
      return { custom: true, id: null, label: '自定义' };
    }
    const bid = store.get(BKEYS[type]);
    // v3.7.x：默认关闭——缺省与显式「静音」统一显示/高亮为静音
    if (bid === 'none' || !(bid && PRESET_NAMES[bid])) {
      return { custom: false, id: 'none', label: '静音' };
    }
    return { custom: false, id: bid, label: PRESET_NAMES[bid] };
  }

  // 上传音频：FileReader → dataURL（超 3MB 提示可能过大）；上传即替换内置，内置键清除
  function bindUpload(key, id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        if (f.size > 3 * 1024 * 1024) { toast('音频较大（>3MB），可能占用较多存储空间'); }
        toast('正在读取音频…');
        const reader = new FileReader();
        reader.onload = () => {
          store.set(KEYS[key], reader.result);
          store.remove(BKEYS[key]); // 切换到自定义，清掉内置选择避免胶囊高亮歧义
          updateVals();
          renderPresets(key, PRESET_CONTAINERS[key]);
          toast(NAMES[key] + '已设置为自定义音频');
        };
        reader.onerror = () => { toast('音频读取失败'); };
        reader.readAsDataURL(f);
      };
      input.click();
    });
  }
  // 试听：内置/自定义均可直接试听（不循环）
  function bindPlay(key, id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      window.playSfx(key, { loop: false });
    });
  }
  // 清除：仅移除自定义上传音频，回落到内置音效（或保持用户选的静音）
  function bindClear(key, id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      store.remove(KEYS[key]);
      updateVals();
      renderPresets(key, PRESET_CONTAINERS[key]);
      toast(NAMES[key] + '自定义音频已清除');
    });
  }
  // 状态显示
  function updateVals() {
    [['ring', 'sfx-ring-val'], ['in', 'sfx-in-val'], ['out', 'sfx-out-val']].forEach((pair) => {
      const el = document.getElementById(pair[1]);
      if (el) el.textContent = sfxState(pair[0]).label;
    });
  }
  // 预设胶囊渲染：[静音] [气泡] [叮咚] … 点击应用并试听；当前项高亮
  function renderPresets(type, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    const st = sfxState(type);
    const ids = ['none'].concat(PRESET_ORDER[type] || []);
    ids.forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sfx-preset' + ((!st.custom && st.id === id) ? ' on' : '');
      b.textContent = (id === 'none') ? '静音' : (PRESET_NAMES[id] || id);
      b.addEventListener('click', () => {
        // 选择内置/静音 → 清除自定义上传，避免播放优先级歧义
        if (store.get(KEYS[type])) store.remove(KEYS[type]);
        store.set(BKEYS[type], id);
        updateVals();
        renderPresets(type, containerId);
        if (id === 'none') toast(NAMES[type] + '音效已静音');
        else window.playSfx(type, { loop: false });
      });
      el.appendChild(b);
    });
  }
  function renderAllPresets() {
    renderPresets('ring', PRESET_CONTAINERS.ring);
    renderPresets('in', PRESET_CONTAINERS.in);
    renderPresets('out', PRESET_CONTAINERS.out);
  }

  bindUpload('ring', 'sfx-ring-upload');
  bindPlay('ring', 'sfx-ring-play');
  bindClear('ring', 'sfx-ring-clear');
  bindUpload('in', 'sfx-in-upload');
  bindPlay('in', 'sfx-in-play');
  bindClear('in', 'sfx-in-clear');
  bindUpload('out', 'sfx-out-upload');
  bindPlay('out', 'sfx-out-play');
  bindClear('out', 'sfx-out-clear');

  // v3.5.94：音效音频（dataURL）可能只存在 IndexedDB → 启动补读
  // v3.7.x：补读扩展到内置音效选择键（sfx-*-b），并统一兜底刷新界面
  try {
    if (window.idbGet) {
      ['sfx-ring', 'sfx-in', 'sfx-out', 'sfx-ring-b', 'sfx-in-b', 'sfx-out-b'].forEach(key => {
        window.idbGet(window.activePrefix() + ':' + key).then(v => {
          if (v && typeof v === 'string' && v.length > 2 && !store.get(key)) {
            store.set(key, v);
          }
          updateVals();
          renderAllPresets();
        });
      });
    }
  } catch (e) {}
  renderAllPresets();
  updateVals();

  // 切桌面：音效每桌面独立，重渲染当前桌面的选择状态
  document.addEventListener('contact-switched', () => {
    updateVals();
    renderAllPresets();
  });

  // 设置页入口：点行 → 独立音效设置页；返回回设置页
  // 事件委托绑定（document 级）：确保点击一定生效，不受其他脚本/异常影响
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#row-sfx-settings')) {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const sp = document.getElementById('page-sfx-settings');
      if (sp) sp.hidden = false;
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#sfx-back')) {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const sp = document.getElementById('page-setting');
      if (sp) sp.hidden = false;
    }
  });
})();
