// ===== 功能：音乐（音乐库 / 歌单 / 听歌记录 / TA 互动 / 悬浮播放小框） =====
// 仿星言简约版【星音陪伴】：本地音频上传、网易云链接添加、批量导入、
// 歌单、听歌记录、TA 按概率请求一起听歌、歌曲结束 TA 可能接动作、悬浮小框可拖动
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    // v3.6.x：内联 opacity 双保险——QQ浏览器 X5 内核下 CSS 动画兜底
    //（#cc-toast.show 的 ccToastAutoHide）可能不执行，且主线程被大文件读写
    // 阻塞时 2s 的 setTimeout 隐藏回调会被严重延迟；内联样式优先级最高，
    // 动画与 JS 定时器任一生效都能自动消失，互不依赖
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.className = 'cc-toast';
      t.style.opacity = '0';
    }, 2000);
  }

  // ================= 数据 =================
  let library = [];          // {id,name,artist,url,source,duration,playlistId,addedAt}
  let playlists = [];        // {id,name,createdAt}
  let history = [];          // {id,trackId,trackName,triggerType,ts}
  let settings = { floatEn: true, reqProb: 5, cooldownMs: 600000, widgetCoverMode: 'song' };
  let currentId = null;
  let mode = 'list';         // list / shuffle / single
  let audio = null;
  let progressTimer = null;
  let floatClosed = false;   // 悬浮小框手动收起
  let taActive = false;      // TA 请求过一起听歌后置 true，歌曲结束 TA 可能接动作
  let cooldownAt = 0;        // TA 音乐请求冷却时间戳
  let reqData = null;        // 待确认的 TA 请求 {trackId}
  let curTab = 'lib';

  function loadArr(k) { try { const v = JSON.parse(store.get(k) || 'null'); return Array.isArray(v) ? v : []; } catch(e){ return []; } }
  function saveArr(k, a) { store.set(k, JSON.stringify(a)); }
  function partnerName() { return store.get('lbl-partner') || 'TA'; }
  function findTrack(id) { return library.find(m => m.id === id) || null; }
  function fmtDur(sec) {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }
  function fmtDT(ts) {
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  // v3.6.x：完整 HTML 转义（只转 < 可被 `&lt;…&gt;` 实体绕过注入）
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  // ================= 自定义歌曲封面 =================
  // 封面存在时渲染圆形/圆角缩略图（背景图），否则渲染音符图标
  function songIcoHtml(m, icon) {
    if (m && m.cover) {
      return '<span class="sm-song-ico has-cov" style="background-image:url(\'' + esc(m.cover) + '\')"></span>';
    }
    return '<span class="sm-song-ico"><svg viewBox="0 0 24 24" fill="currentColor">' + (icon || '<path d="M8 5.5v13l11-6.5z"/>') + '</svg></span>';
  }
  // 封面图片压缩到最长边 512px JPEG（几十 KB，不撑爆存储；画布失败回退原图 dataURL）
  function compressCover(file, cb) {
    let url = null;
    try { url = URL.createObjectURL(file); } catch (e) {}
    if (!url) {
      const r = new FileReader();
      r.onload = () => cb(r.result);
      r.onerror = () => cb('');
      try { r.readAsDataURL(file); } catch (e) { cb(''); }
      return;
    }
    const img = new Image();
    img.onload = function () {
      try { URL.revokeObjectURL(url); } catch (e) {}
      let w = img.width, h = img.height;
      if (!w || !h) { cb(''); return; }
      const k = Math.min(1, 512 / Math.max(w, h));
      w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) { cb(''); return; }
      try { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h); } catch (e) { cb(''); return; }
      try { cb(c.toDataURL('image/jpeg', 0.82)); } catch (e) { cb(''); }
    };
    img.onerror = function () { try { URL.revokeObjectURL(url); } catch (e) {} cb(''); };
    img.src = url;
  }

  // ================= 存储 =================
  function saveLibrary() { saveArr('music-library', library); }
  function savePlaylists() { saveArr('music-playlists', playlists); }
  function saveHistory() { saveArr('music-history', history); }
  function saveSettings() { store.set('music-global', JSON.stringify(settings)); }
  function loadAll() {
    library = loadArr('music-library');
    playlists = loadArr('music-playlists');
    history = loadArr('music-history');
    try { settings = Object.assign({ floatEn: true, reqProb: 5, cooldownMs: 600000, widgetCoverMode: 'song' }, JSON.parse(store.get('music-global') || '{}')); } catch(e) {}
    // 旧字段兼容：url 歌曲标记 source
    library.forEach(m => { if (!m.source) m.source = m.url ? 'url' : 'local'; });
    // 首次运行：内置默认歌单
    if (!playlists.length && !store.get('music-default-done')) {
      playlists.push({ id: 'spl_default', name: '默认歌单', createdAt: Date.now() });
      store.set('music-default-done', '1');
    }
    if (!playlists.some(p => p.id === 'spl_default')) {
      playlists.unshift({ id: 'spl_default', name: '默认歌单', createdAt: Date.now() });
    }
    // 首次运行：往默认歌单里放 2 首内置示例歌（使用网易云官方外链——现已恢复可用，
    // 302 跳转真实 CDN mp3 无需自定义请求头，浏览器可直接播放完整歌曲）
    if (!library.length && !store.get('music-seed-done')) {
      const seeds = [
        { id: 2613048732, name: 'Moonlit Dream', artist: 'DLSS · shell（月光梦）', cover: 'https://p2.music.126.net/cXuoNwFzgFoQF7bGvC2mIQ==/109951169832660411.jpg' },
        { id: 27538343, name: 'Baby', artist: 'EXO-K', cover: '' }
      ];
      const ids = [];
      seeds.forEach((s, i) => {
        const id = 'sm_seed_' + Date.now() + '_' + i;
        ids.push(id);
        library.push({ id: id, neteaseId: String(s.id), name: s.name || '示例旋律-' + (i + 1), artist: s.artist || '', cover: s.cover || '', url: neteaseMetingUrl(s.id), source: 'url', duration: 0, playlistId: 'spl_default', addedAt: Date.now() });
      });
      store.set('music-seed-done', '1');
      saveLibrary();
      // 异步识别歌名（失败则保留已知/默认名）
      seeds.forEach((s, i) => {
        fetchNeteaseInfo(String(s.id), (info) => {
          const m = library.find(x => x.id === ids[i]);
          if (m && info && info.name) {
            m.name = info.name;
            if (info.artist) m.artist = info.artist;
            if (info.duration && !m.duration) m.duration = info.duration;
            saveLibrary();
            renderPage();
          }
        });
      });
    }
    // v3.5.112：网易云外链已恢复可用（302 → 真实 CDN mp3，无需请求头）。
    // 旧版本曾把种子歌曲强制替换成本地 14 秒旋律并清空 url——检测这类旧数据，
    // 自动恢复网易云外链（source:'url'），让默认歌曲回到完整版；
    // 本地旋律仅在外链播放失败时兜底（见 setupHandlers / playTrack）。
    // v3.6.x：种子歌 url 直接用 meting API（api.injahow.cn/meting 302 → https CDN），
    // 不经 music.163.com/song/media/outer/url（302 → http CDN，HTTPS 页面下被
    // 混合内容拦截）。旧数据/备份恢复后自动规范成 meting URL，不管数据怎么来的
    // v3.7.x：加强自愈——
    // ① 检测所有 url 含 outer/url 旧格式的歌（不只种子歌），替换成 meting URL
    //    （旧版导入的歌也可能是 outer/url，HTTPS 下全被混合内容拦截）
    // ② 种子歌额外强制 source='url'，避免旧数据 source='local' 导致 playTrack
    //    走本地路径（IDB 无数据 → 兜底内置旋律，用户听不到原曲）
    library.forEach(m => {
      if (!m || !m.neteaseId) return;
      const seedId = String(m.neteaseId);
      const isSeed = (seedId === '2613048732' || seedId === '27538343');
      const target = neteaseMetingUrl(seedId);
      const hasOldOuterUrl = m.url && /music\.163\.com\/song\/media\/outer\/url/i.test(m.url);
      if (hasOldOuterUrl || (isSeed && (m.url !== target || m.source !== 'url'))) {
        m.url = target;
        m.source = 'url';
        saveLibrary();
        if (isSeed) { try { if (window.idbDelete) window.idbDelete(window.activePrefix() + ':music-file:' + m.id); } catch (e) {} }
      }
    });
    // v3.6.x：种子歌自愈——若 2 首内置示例歌在本地丢失（清除数据/备份恢复后
    // music-seed-done 已置位不再补种、或记录损坏），重新补回默认歌单，
    // 保证「默认歌单」始终有歌可播
    {
      const SEED_DEFS = [
        { id: 2613048732, name: 'Moonlit Dream', artist: 'DLSS · shell（月光梦）', cover: 'https://p2.music.126.net/cXuoNwFzgFoQF7bGvC2mIQ==/109951169832660411.jpg' },
        { id: 27538343, name: 'Baby', artist: 'EXO-K', cover: '' }
      ];
      let healed = false;
      SEED_DEFS.forEach((s, i) => {
        const has = library.some(m => m && String(m.neteaseId || '') === String(s.id));
        if (has) return;
        const id = 'sm_seed_' + Date.now() + '_' + i + '_h';
        library.push({ id: id, neteaseId: String(s.id), name: s.name, artist: s.artist, cover: s.cover || '', url: neteaseMetingUrl(s.id), source: 'url', duration: 0, playlistId: 'spl_default', addedAt: Date.now() });
        healed = true;
      });
      if (healed) saveLibrary();
    }
  }

  // ================= 内置示例旋律：本地合成（无版权、不联网、永不失效） =================
  // 主路径用 Web Audio 离线渲染一小段钢琴音色旋律（22050Hz），编码为 WAV dataURL；
  // v3.6.x：任何失败路径（OfflineAudioContext 不可用/渲染失败/btoa 异常）都降级到
  //   genDemoWavJS 纯 JS 生成——保证默认歌单外链失败时兜底旋律一定可播，不再出现
  //   「已改用内置示例旋律」后仍提示「播放失败」。
  // 两段旋律（第一首小星星式上行，第二首欢快式）
  const DEMO_NOTES = [
    [523,523,587,587,659,659,587,523,523,587,587,659,659,587,659,698,784,784,698,698,659,659,587],
    [659,659,698,784,784,698,659,587,523,523,587,659,659,587,587,659,784,784,880,880,784,659,587]
  ];
  // 纯 JS 合成：正弦波 + 包络 → 16bit WAV dataURL（不依赖 WebAudio / btoa 大串分段安全）
  function genDemoWavJS(idx) {
    try {
      const sr = 8000, dur = 0.42;
      const notes = DEMO_NOTES[idx === 0 ? 0 : 1] || DEMO_NOTES[0];
      const total = sr * 14;
      const pcm = new Int16Array(total);
      let t = 0;
      notes.forEach((f) => {
        const nStart = Math.floor(t * sr);
        const nEnd = Math.min(Math.floor((t + dur) * sr), total);
        for (let i = nStart; i < nEnd; i++) {
          const tt = (i / sr) - t;
          // 20ms 起音 + 指数衰减包络
          const env = Math.min(1, tt / 0.02) * Math.pow(0.001, Math.max(0, tt - 0.02) / (dur - 0.02));
          pcm[i] = Math.max(-1, Math.min(1, Math.sin(2 * Math.PI * f * tt) * env * 0.5)) * 32767;
        }
        t += dur * 0.9;
      });
      const n = total;
      const wav = new DataView(new ArrayBuffer(44 + n * 2));
      const ws = (o, s) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
      ws(0, 'RIFF'); wav.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE');
      ws(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
      wav.setUint32(24, sr, true); wav.setUint32(28, sr * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true);
      ws(36, 'data'); wav.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) wav.setInt16(44 + i * 2, pcm[i], true);
      const bytes = new Uint8Array(wav.buffer);
      let bin = '';
      // 分块拼接：String.fromCharCode.apply 有参数上限，8KB 块安全
      for (let i = 0; i < bytes.length; i += 8192) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      }
      return 'data:audio/wav;base64,' + btoa(bin);
    } catch (e) { return ''; }
  }
  function genDemoAudio(idx) {
    return new Promise((resolve) => {
      // v3.6.x：OfflineAudioContext 不可用 → 直接纯 JS 合成，兜底必播
      const fallback = () => { try { resolve(genDemoWavJS(idx) || ''); } catch (e) { resolve(''); } };
      try {
        const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!AC) { fallback(); return; }
        const sr = 22050;
        const ctx = new AC(1, sr * 14, sr);
        const notes = DEMO_NOTES[idx === 0 ? 0 : 1] || DEMO_NOTES[0];
        let t = ctx.currentTime;
        const dur = 0.42;
        notes.forEach((f) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = f;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.5, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + dur);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + dur + 0.05);
          t += dur * 0.9;
        });
        // v3.6.x：startRendering 兼容——老 WebKit/低端安卓内核返回 undefined（不返回
        // Promise），直接 .then 会抛错导致合成失败、种子歌"不能播放"；先设 oncomplete
        // 回调再调用（Promise 内核同样走 then），事件不会丢。渲染/btoa 任何异常都降级。
        let cbDone = false;
        const finishRender = (buf) => {
          if (cbDone) return; cbDone = true;
          try {
            const ch = buf.getChannelData(0);
            const n = ch.length;
            const wav = new DataView(new ArrayBuffer(44 + n * 2));
            const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
            writeStr(0, 'RIFF'); wav.setUint32(4, 36 + n * 2, true); writeStr(8, 'WAVE');
            writeStr(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
            wav.setUint32(24, sr, true); wav.setUint32(28, sr * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true);
            writeStr(36, 'data'); wav.setUint32(40, n * 2, true);
            for (let i = 0; i < n; i++) wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, ch[i])) * 32767, true);
            const bytes = new Uint8Array(wav.buffer);
            let bin = '';
            for (let i = 0; i < bytes.length; i += 8192) {
              bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
            }
            resolve('data:audio/wav;base64,' + btoa(bin));
          } catch (e) { fallback(); }
        };
        try {
          const hasPromise = typeof ctx.startRendering === 'function' && ctx.startRendering.length === 0 && 'Promise' in window;
          if (hasPromise) {
            const rp = ctx.startRendering();
            if (rp && typeof rp.then === 'function') rp.then(finishRender).catch(fallback);
            else { ctx.oncomplete = (ev) => { try { finishRender(ev.renderedBuffer); } catch (e) { fallback(); } }; }
          } else {
            ctx.oncomplete = (ev) => { try { finishRender(ev.renderedBuffer); } catch (e) { fallback(); } };
            ctx.startRendering();
          }
        } catch (e) { fallback(); }
      } catch (e) { fallback(); }
    });
  }

  // ================= 网易云歌名/封面识别（多源兜底） =================
  // v3.5.117：内置已知歌曲（默认歌单这两首的元数据代理源已失效，命中直接返回，
  // 不再发起请求，避免控制台报错/加载失败）
  const KNOWN_NETEASE = {
    '27538343': { name: 'Baby', artist: 'EXO-K' },
    '2613048732': { name: 'Moonlit Dream', artist: 'DLSS / shell' }
  };
  // v3.6.x：解析网易云歌曲页面 HTML <title> 提取歌名/歌手
  // 页面标题格式："歌曲名 - 歌手名 - 单曲 - 网易云音乐" 或 "歌曲名 - 歌手名 - 网易云音乐"
  function parseNeteasePageTitle(html) {
    if (!html || typeof html !== 'string') return null;
    let m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return null;
    let title = m[1].trim().replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
    // v3.9.x：歌曲页 <meta property="music:duration" content="秒数"> 提取时长（零额外请求）
    let duration = 0;
    const dm = html.match(/property=["']music:duration["'][^>]*content=["'](\d+)["']/i) || html.match(/content=["'](\d+)["'][^>]*property=["']music:duration["']/i);
    if (dm) duration = parseInt(dm[1], 10) || 0;
    // 去掉末尾 " - 单曲 - 网易云音乐" 或 " - 网易云音乐"
    title = title.replace(/\s*[-－]\s*单曲\s*[-－]\s*网易云音乐\s*$/i, '');
    title = title.replace(/\s*[-－]\s*网易云音乐\s*$/i, '');
    // 剩余格式："歌曲名 - 歌手名"
    const parts = title.split(/\s*[-－]\s*/);
    if (parts.length >= 2) {
      return { name: parts[0].trim(), artist: parts.slice(1).join(' - ').trim(), pic: '', duration: duration };
    }
    if (parts.length === 1 && parts[0]) {
      return { name: parts[0].trim(), artist: '', pic: '', duration: duration };
    }
    return null;
  }
  function fetchNeteaseInfo(id, cb) {
    const known = KNOWN_NETEASE[String(id)];
    if (known) { cb({ name: known.name, artist: known.artist, pic: '' }); return; }
    // v3.6.x：原 type=netease 不是有效 meting 类型（返回空），网易云 API 需 Cookie
    // 返回 400——4 个 API 全失效。改用网易云歌曲页面 HTML <title> 解析歌名/歌手
    //（页面标题格式："歌曲名 - 歌手名 - 单曲 - 网易云音乐"），多 CORS 代理兜底
    const songPageUrl = 'https://music.163.com/song?id=' + id;
    const apis = [
      // 1-2：CORS 代理抓歌曲页面 HTML，解析 <title>
      { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(songPageUrl), isText: true, parse(t) {
          return parseNeteasePageTitle(t); } },
      { url: 'https://corsproxy.io/?url=' + encodeURIComponent(songPageUrl), isText: true, parse(t) {
          return parseNeteasePageTitle(t); } },
      // 3-4：原网易云 API 直链（需 Cookie，多数返回 400，仅作兜底）
      { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://music.163.com/api/song/detail/?ids=' + id), isText: true, parse(t) {
          let d; try { d = typeof t === 'string' ? JSON.parse(t) : t; } catch(e) { return null; }
          if (d && d.songs && d.songs[0]) {
            const s = d.songs[0];
            const artist = (s.artists || []).map(a => a.name).join('/');
            return { name: s.name, artist: artist, pic: (s.album && s.album.picUrl) || '', duration: s.dt ? Math.round(s.dt / 1000) : 0 };
          }
          return null; } },
      { url: 'https://corsproxy.io/?url=' + encodeURIComponent('https://music.163.com/api/song/detail/?ids=' + id), isText: true, parse(t) {
          let d; try { d = typeof t === 'string' ? JSON.parse(t) : t; } catch(e) { return null; }
          if (d && d.songs && d.songs[0]) {
            const s = d.songs[0];
            const artist = (s.artists || []).map(a => a.name).join('/');
            return { name: s.name, artist: artist, pic: (s.album && s.album.picUrl) || '', duration: s.dt ? Math.round(s.dt / 1000) : 0 };
          }
          return null; } }
    ];
    let idx = 0;
    function tryNext() {
      if (idx >= apis.length) { cb(null); return; }
      const api = apis[idx++];
      let controller;
      try { controller = new AbortController(); } catch(e) { controller = null; }
      const timer = setTimeout(() => { try { controller && controller.abort(); } catch(e){} }, 8000);
      fetch(api.url, controller ? { signal: controller.signal } : undefined)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return api.isText ? r.text() : r.json(); })
        .then(data => {
          clearTimeout(timer);
          try {
            const res = api.parse(data);
            if (res && res.name) cb(res); else tryNext();
          } catch (e) { tryNext(); }
        })
        .catch(() => { clearTimeout(timer); tryNext(); });
    }
    tryNext();
  }

  // ================= 网易云歌单导入 =================
  // v3.8.x：直接导入网易云歌单（粘贴歌单分享链接 / 链接添加里填歌单 ID）。
  // 主源：meting API type=playlist（api.injahow.cn，与播放 type=url 同源同域，
  // 大陆直连、无 CORS 问题，最多返回约 200 首）；兜底：网易云官方 v6 歌单详情
  // API（无 Cookie 可用，含全部曲目）经多个 CORS 代理转发（代理可用性随环境变化，
  // 与 fetchNeteaseInfo 同思路，留作未来恢复能力）。
  // 识别歌单链接：music.163.com/playlist?id=xxx / y.music.163.com/m/playlist?id=xxx / #/playlist?id=xxx
  function extractPlaylistId(line) {
    if (!line || typeof line !== 'string') return '';
    if (/\.mp3/i.test(line)) return '';
    const m = line.match(/playlist[\/?#]*(?:id=)?(\d+)/i);
    return m ? m[1] : '';
  }
  function fetchNeteasePlaylist(id, cb) {
    const apiUrl = 'https://music.163.com/api/v6/playlist/detail?id=' + encodeURIComponent(String(id)) + '&n=1000&s=8';
    const sources = [
      // 主源：meting 歌单接口（与播放同源，稳定可用，约 200 首上限）
      { url: 'https://api.injahow.cn/meting/?type=playlist&id=' + encodeURIComponent(String(id)), parse(txt) {
          let j; try { j = JSON.parse(txt); } catch (e) { return null; }
          if (!Array.isArray(j) || !j.length) return null;
          return j.map(t => {
            const mid = (t.url || '').match(/type=url&id=(\d+)/);
            return {
              neteaseId: mid ? mid[1] : '',
              name: t.name || '',
              artist: t.artist || '',
              cover: String(t.pic || '').replace(/^http:\/\//i, 'https://'),
              url: mid ? neteaseMetingUrl(mid[1]) : (t.url || ''),
              duration: 0
            };
          }).filter(t => t.url);
        } },
      // v3.9.x：备用 meting 镜像（i-meto，独立域名——手机浏览器拦截/主源不可达时兜底；
      // 字段名 title/author，url 里的 id 提取方式与主源一致）
      { url: 'https://api.i-meto.com/meting/api?server=netease&type=playlist&id=' + encodeURIComponent(String(id)), parse(txt) {
          let j; try { j = JSON.parse(txt); } catch (e) { return null; }
          if (!Array.isArray(j) || !j.length) return null;
          return j.map(t => {
            const mid = (t.url || '').match(/type=url&id=(\d+)/);
            return {
              neteaseId: mid ? mid[1] : '',
              name: t.title || t.name || '',
              artist: t.author || t.artist || '',
              cover: String(t.pic || '').replace(/^http:\/\//i, 'https://'),
              url: mid ? neteaseMetingUrl(mid[1]) : (t.url || ''),
              duration: 0
            };
          }).filter(t => t.url);
        } },
      // 兜底：网易云官方 v6 歌单详情 API（无 Cookie 返回全部曲目）经 CORS 代理
      { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(apiUrl), parse(txt) {
          let j; try { j = JSON.parse(txt); } catch (e) { return null; }
          const pl = j && j.playlist;
          if (!pl || !Array.isArray(pl.tracks) || !pl.tracks.length) return null;
          return pl.tracks.map(s => ({
            neteaseId: String(s.id || ''),
            name: s.name || '',
            artist: ((s.ar || []).map(a => a.name).filter(Boolean).join('/')),
            cover: String((s.al && s.al.picUrl) || '').replace(/^http:\/\//i, 'https://'),
            url: s.id ? neteaseMetingUrl(s.id) : '',
            duration: s.dt ? Math.round(s.dt / 1000) : 0
          })).filter(t => t.url);
        } },
      { url: 'https://corsproxy.io/?url=' + encodeURIComponent(apiUrl), parse(txt) {
          let j; try { j = JSON.parse(txt); } catch (e) { return null; }
          const pl = j && j.playlist;
          if (!pl || !Array.isArray(pl.tracks) || !pl.tracks.length) return null;
          return pl.tracks.map(s => ({
            neteaseId: String(s.id || ''),
            name: s.name || '',
            artist: ((s.ar || []).map(a => a.name).filter(Boolean).join('/')),
            cover: String((s.al && s.al.picUrl) || '').replace(/^http:\/\//i, 'https://'),
            url: s.id ? neteaseMetingUrl(s.id) : '',
            duration: s.dt ? Math.round(s.dt / 1000) : 0
          })).filter(t => t.url);
        } },
      { url: 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(apiUrl), parse(txt) {
          let j; try { j = JSON.parse(txt); } catch (e) { return null; }
          const pl = j && j.playlist;
          if (!pl || !Array.isArray(pl.tracks) || !pl.tracks.length) return null;
          return pl.tracks.map(s => ({
            neteaseId: String(s.id || ''),
            name: s.name || '',
            artist: ((s.ar || []).map(a => a.name).filter(Boolean).join('/')),
            cover: String((s.al && s.al.picUrl) || '').replace(/^http:\/\//i, 'https://'),
            url: s.id ? neteaseMetingUrl(s.id) : '',
            duration: s.dt ? Math.round(s.dt / 1000) : 0
          })).filter(t => t.url);
        } }
    ];
    let idx = 0;
    function tryNext() {
      if (idx >= sources.length) { cb(null); return; }
      const src = sources[idx++];
      let controller;
      try { controller = new AbortController(); } catch (e) { controller = null; }
      const timer = setTimeout(() => { try { controller && controller.abort(); } catch (e) {} }, 7000);
      fetch(src.url, controller ? { signal: controller.signal } : undefined)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(txt => {
          clearTimeout(timer);
          try {
            const res = src.parse(txt);
            if (res && res.length) cb(res); else tryNext();
          } catch (e) { tryNext(); }
        })
        .catch(() => { clearTimeout(timer); tryNext(); });
    }
    tryNext();
  }
  // 导入单个歌单：去重（网易云 ID 已存在则跳过），只入内存，由调用方统一 saveLibrary
  function importNeteasePlaylist(id, done, targetPl) {
    fetchNeteasePlaylist(id, function (tracks) {
      if (!tracks || !tracks.length) { done({ ok: false }); return; }
      let added = 0, skipped = 0;
      const now = Date.now();
      const addedIds = [];
      const plId = targetPl || 'default';
      tracks.forEach((t, i) => {
        if (t.neteaseId && library.some(m => m.neteaseId === t.neteaseId)) { skipped++; return; }
        const nid = 'sm_pl_' + now + '_' + i + '_' + Math.random().toString(36).substr(2, 4);
        library.push({ id: nid, neteaseId: t.neteaseId, name: t.name || '网易云音乐-' + (t.neteaseId || i), artist: t.artist || '', cover: t.cover || '', url: t.url, source: 'url', duration: t.duration || 0, playlistId: plId, addedAt: now });
        addedIds.push(nid);
        added++;
      });
      done({ ok: true, added: added, skipped: skipped });
      // v3.9.x：导入后一次性补时长（meting 不带 duration）——v6 全量快路径 + 音频探测兜底
      if (addedIds.length) enrichImportedDurations(id, addedIds);
    });
  }
  // 歌单导入后的时长补全：先试官方 v6 歌单详情（含每曲 dt，经 CORS 代理，代理可用则
  // 一次全量补齐并刷新列表）；代理全挂则对剩余歌曲逐个 <audio> 探测（见 enqueueDurProbe）
  function enrichImportedDurations(id, trackIds) {
    const missing = trackIds.map(findTrack).filter(m => m && m.neteaseId && !m.duration);
    if (!missing.length) return;
    fetchV6Durations(id, function (durMap) {
      if (durMap && Object.keys(durMap).length) {
        let any = false;
        missing.forEach(m => { if (durMap[m.neteaseId] && !m.duration) { m.duration = durMap[m.neteaseId]; any = true; } });
        if (any) { saveLibrary(); renderPage(); }
      }
      missing.forEach(m => { if (!m.duration) enqueueDurProbe(m); });
    });
  }
  // ================= 网易云歌曲时长补全（一次性加载） =================
  // v3.9.x：meting 系歌单接口不带时长，旧逻辑只有播放到那首歌时 loadedmetadata 才补，
  // 列表一直显示 00:00。这里用 <audio preload=metadata> 探测时长（与播放同源的 meting
  // URL，大陆直连、无需 CORS 代理、手机浏览器同样可用），并发 4 条后台跑，逐条写回
  // 并刷新界面，实现「导入后一次性把时长加载出来」；探测失败（如 VIP 歌）保持 00:00。
  function fetchV6Durations(id, cb) {
    const apiUrl = 'https://music.163.com/api/v6/playlist/detail?id=' + encodeURIComponent(String(id)) + '&n=1000&s=8';
    const prox = [
      'https://api.allorigins.win/raw?url=',
      'https://corsproxy.io/?url=',
      'https://api.codetabs.com/v1/proxy?quest='
    ];
    const out = {};
    let settled = false;
    const finish = () => { if (settled) return; settled = true; cb(out); };
    prox.forEach(p => {
      let controller;
      try { controller = new AbortController(); } catch (e) { controller = null; }
      const timer = setTimeout(() => { try { controller && controller.abort(); } catch (e) {} }, 6000);
      fetch(p + encodeURIComponent(apiUrl), controller ? { signal: controller.signal } : undefined)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(txt => {
          clearTimeout(timer);
          try {
            const j = JSON.parse(txt);
            const pl = j && j.playlist;
            if (pl && Array.isArray(pl.tracks) && pl.tracks.length) {
              pl.tracks.forEach(s => { if (s && s.id && s.dt) out[String(s.id)] = Math.round(s.dt / 1000); });
              finish();
            }
          } catch (e) {}
        })
        .catch(() => { clearTimeout(timer); });
    });
    // 兜底：最多等 7s（代理全挂时快速收尾，交给音频探测）
    setTimeout(finish, 7000);
  }
  function updateDurUI(id, dur) {
    if (!dur) return;
    const txt = fmtDur(dur);
    document.querySelectorAll('#music-lib-list .sm-song, #tc-body .sm-song').forEach(row => {
      if (row.dataset.id === id) {
        const el = row.querySelector('.sm-song-dur');
        if (el) el.textContent = txt;
      }
    });
  }
  let durProbeRunning = false;
  const durProbeQueue = [];
  const DUR_PROBE_CONCURRENCY = 4;
  function enqueueDurProbe(m) {
    if (!m || !m.neteaseId || m.duration > 0) return;
    if (durProbeQueue.some(x => x.id === m.id)) return;
    durProbeQueue.push(m);
    if (durProbeQueue.length <= DUR_PROBE_CONCURRENCY) runDurProbe();
  }
  function runDurProbe() {
    if (durProbeRunning) return;
    durProbeRunning = true;
    const next = () => {
      if (!durProbeQueue.length) { durProbeRunning = false; return; }
      const m = durProbeQueue.shift();
      probeOneDuration(m, next);
    };
    for (let i = 0; i < DUR_PROBE_CONCURRENCY; i++) next();
  }
  function probeOneDuration(m, done) {
    let tmp = null;
    let finished = false;
    const timer = setTimeout(() => finish(0), 12000);
    function finish(dur) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { if (tmp) { tmp.onerror = null; tmp.onloadedmetadata = null; tmp.removeAttribute('src'); tmp.load(); } } catch (e) {}
      if (dur > 0) {
        const mm = findTrack(m.id);
        if (mm && !mm.duration) {
          mm.duration = dur;
          saveLibrary();
          updateDurUI(m.id, dur);
        }
      }
      done();
    }
    try {
      tmp = new Audio();
      // v3.9.x：与播放同设 no-referrer——网易云 CDN 防盗链带 Referer 返回 403，
      // 探测不设则 onerror → duration 永远补不上（歌单导入后全显示 00:00）
      try { tmp.referrerPolicy = 'no-referrer'; } catch (e) {}
      tmp.preload = 'metadata';
      tmp.onloadedmetadata = function () { finish(tmp.duration || 0); };
      tmp.onerror = function () { finish(0); };
      tmp.src = neteaseMetingUrl(m.neteaseId);
    } catch (e) { finish(0); }
  }
  function probeAllMissingDurations() {
    library.forEach(m => { if (m && m.neteaseId && !m.duration) enqueueDurProbe(m); });
  }
  // 串行导入多个歌单（避免并发刷爆网络）
  function importPlaylistIds(ids, cb, targetPl) {
    let total = 0, plOk = 0, plFail = 0, skipped = 0;
    const next = (i) => {
      if (i >= ids.length) { cb({ total: total, plOk: plOk, plFail: plFail, skipped: skipped }); return; }
      importNeteasePlaylist(ids[i], (res) => {
        if (res.ok) { plOk++; total += res.added; skipped += res.skipped; }
        else plFail++;
        next(i + 1);
      }, targetPl);
    };
    next(0);
  }

  // 本地上传（多个文件，存储到 IndexedDB）
  // v3.6.x：改存 Blob（不再存 base64 dataURL 字符串）——夸克等浏览器对
  // `<audio src="data:...">`（尤其大段 base64）播放失效，Blob + 对象 URL 是标准播放方案
  // ================= 添加歌曲 =================
  // 本地上传（多个文件，存储到 IndexedDB）
  // v3.6.x：改存 Blob（不再存 base64 dataURL 字符串）——夸克等浏览器对
  // `<audio src="data:...">`（尤其大段 base64）播放失效，Blob + 对象 URL 是标准播放方案
  function triggerUpload() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'audio/*,.mp3,.m4a,.aac,.ogg,.wav,.flac';
    inp.multiple = true;
    inp.onchange = function () { if (this.files && this.files.length) uploadFiles(this.files); };
    inp.click();
  }
  function uploadFiles(files) {
    const list = Array.from(files);
    if (!list.length) return;
    toast('正在上传 ' + list.length + ' 首音乐…');
    // v3.6.x：改为逐个文件串行处理——原来 N 个文件并行 FileReader.readAsArrayBuffer
    //（每个都把整段音频读进内存）+ 并行 idbSet 写 Blob，多首几十 MB 音乐同时进行时
    // 内存峰值 N 倍、GC 频繁，主线程被长阻塞（用户反馈 iQOO/QQ浏览器：添加音乐后
    // 页面卡顿、「已上传」弹窗一直不消失——2s 隐藏定时器被阻塞延迟）。
    // 串行后主线程不再长阻塞；每文件 3s 时长读取超时兜底——个别格式/内核不触发
    // loadedmetadata/error 时（原逻辑 pending 永远 >0）也不会卡住队列，
    // 最后一个文件完成时必然弹出「已上传 N 首音乐」替换掉「正在上传…」提示。
    // v3.6.x：Via/OPPO 等老内核 IndexedDB 不支持 Blob 结构化克隆——存 Blob 会静默失败，
    // 列表里有歌但播放时读不到音频。写入失败自动回退存 dataURL 字符串（老内核 100% 支持，
    // 播放路径 dataUrlToBlob 会转回 Blob 播）。readAsArrayBuffer 失败同样回退 readAsDataURL。
    let idx = 0;
    const done = () => { saveLibrary(); renderPage(); toast('已上传 ' + list.length + ' 首音乐（点歌曲右侧 ⋯ 可设置封面）'); };
    const readFile = (file, cb, failCb) => {
      const r1 = new FileReader();
      r1.onload = () => { if (r1.result instanceof ArrayBuffer) cb(r1.result, true); else cb(r1.result, false); };
      r1.onerror = () => {
        // ArrayBuffer 读取失败 → 回退 DataURL（最老内核也支持）
        const r2 = new FileReader();
        r2.onload = () => cb(r2.result, false);
        r2.onerror = failCb;
        try { r2.readAsDataURL(file); } catch (e) { failCb(); }
      };
      try { r1.readAsArrayBuffer(file); } catch (e) { failCb(); }
    };
    const storePayload = (id, file, buf) => {
      // 优先 Blob（紧凑）；ArrayBuffer 成功 → Blob；否则原样（dataURL 字符串）
      const payload = buf instanceof ArrayBuffer ? new Blob([buf], { type: file.type || 'audio/mpeg' }) : buf;
      const key = window.activePrefix() + ':music-file:' + id;
      const toDataUrl = (cb) => {
        const fr = new FileReader();
        fr.onload = () => cb(fr.result);
        fr.onerror = () => cb(null);
        const src = payload instanceof Blob ? payload : new Blob([buf], { type: file.type || 'audio/mpeg' });
        try { fr.readAsDataURL(src); } catch (e) { cb(null); }
      };
      // localStorage 最终兜底：直接写（绕过 xyStore 大键只进 IDB 的限制）；
      // 播放读取路径（store.get('music-file:'+id)）会查 localStorage，数据不丢。
      // 超 5MB 配额时写失败 → 明确提示，用户知道原因而不是无声失败
      const saveToLocal = (dv) => {
        if (!dv) { saveLibrary(); return; }
        try {
          localStorage.setItem(key, dv);
        } catch (e) {
          try { toast('存储空间不足，部分音乐可能无法播放'); } catch (e2) {}
        }
        saveLibrary();
      };
      // dataURL 字符串 → 先试 IDB，失败再落 localStorage
      const saveStrFallback = (dv) => {
        if (!dv) { saveLibrary(); return; }
        if (window.idbSet) {
          window.idbSet(key, dv).then(ok2 => { if (ok2) saveLibrary(); else saveToLocal(dv); }).catch(() => saveToLocal(dv));
        } else {
          saveToLocal(dv);
        }
      };
      // v3.6.x：IDB 完全不可用（file:// 本地打开、部分国产浏览器）→ 直接 dataURL 存 localStorage
      if (!window.indexedDB || !window.idbSet) {
        toDataUrl(saveToLocal);
        return;
      }
      window.idbSet(key, payload).then(ok => {
        if (ok) { saveLibrary(); return; }
        // Blob 写入失败（老内核不支持 Blob 克隆）→ 转 dataURL 字符串重存
        toDataUrl(saveStrFallback);
      }).catch(() => {
        toDataUrl(saveStrFallback);
      });
    };
    const next = function () {
      if (idx >= list.length) { done(); return; }
      const file = list[idx++];
      if (file.size > 50 * 1024 * 1024) { toast('「' + file.name + '」超过 50MB，已跳过'); next(); return; }
      readFile(file, function (buf) {
        const id = 'sm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const name = file.name.replace(/\.[^.]+$/, '');
        const item = { id: id, name: name, artist: '', url: '', source: 'local', duration: 0, playlistId: 'default', addedAt: Date.now() };
        library.push(item);
        const payload = buf instanceof ArrayBuffer ? new Blob([buf], { type: file.type || 'audio/mpeg' }) : buf;
        // 尝试读取时长（读不到也能播放；3s 超时兜底，不阻塞队列）
        const tmp = document.createElement('audio');
        tmp.preload = 'metadata';
        let tmpUrl = null;
        let metaTimer = null;
        let settled = false;
        const cleanupTmp = () => {
          try { if (tmpUrl) URL.revokeObjectURL(tmpUrl); } catch(e) {}
          try { tmp.src = ''; tmp.load(); } catch(e) {}
        };
        const finishMeta = () => {
          if (settled) return;
          settled = true;
          if (metaTimer) clearTimeout(metaTimer);
          cleanupTmp();
          next();
        };
        tmp.onloadedmetadata = function () {
          const m = findTrack(id);
          if (m && tmp.duration) { m.duration = tmp.duration; }
          finishMeta();
        };
        tmp.onerror = finishMeta;
        metaTimer = setTimeout(finishMeta, 3000);
        if (payload instanceof Blob) {
          tmpUrl = URL.createObjectURL(payload);
          tmp.src = tmpUrl;
        } else {
          tmp.src = payload;
        }
        // 存储（异步写 IDB，不阻塞队列；Blob 失败自动回退字符串）
        storePayload(id, file, buf);
      }, function () { next(); });
    };
    next();
  }

  // 链接添加（网易云 ID / 直链）
  // v3.6.x：输入值读取兜底——部分国产浏览器（Via 等）对 contenteditable 转换器
  // （mobile-adapt.js 的 ce-box）的 input.value 代理支持不完整，读出来是空，
  // 表现为「输入了内容却提示请输入/添加失败」。这里优先走代理，读空时直接
  // 从 ce-box 取 innerText/textContent 兜底。
  function readCeInput(id) {
    const el = document.getElementById(id);
    if (!el) return '';
    try {
      const v = el.value;
      if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
    } catch (e) {}
    try {
      const box = el.__ceBox || (el.parentNode && el.parentNode.querySelector('.ce-box[data-for="' + (el.id || '') + '"]'));
      if (box) {
        const t = (box.innerText !== undefined ? box.innerText : box.textContent) || '';
        if (t.trim()) return t.trim();
      }
    } catch (e) {}
    return '';
  }
  // 生成"导入到歌单"下拉选项：我的音乐库 + 已有歌单 + 新建
  function targetPlOptions() {
    return '<option value="default">我的音乐库</option>' +
      playlists.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('') +
      '<option value="__new__">＋ 新建歌单…</option>';
  }
  // 解析目标歌单：选"新建"时弹窗输入歌单名，创建后回调新歌单 id；否则直接回调选中 id
  function resolveTargetPlaylist(cb) {
    const sel = document.getElementById('sm-target-pl');
    if (!sel) { cb('default'); return; }
    const pid = sel.value;
    if (pid === '__new__') {
      if (!window.openModal) { cb('default'); return; }
      window.openModal('新建歌单', '', (name) => {
        name = (name || '').trim();
        if (!name) { toast('请输入歌单名称'); return; }
        const newId = 'spl_' + Date.now();
        playlists.push({ id: newId, name: name, createdAt: Date.now() });
        savePlaylists();
        cb(newId);
      });
    } else {
      cb(pid);
    }
  }
  function openAddUrl() {
    if (!window.openTCPanel) return;
    window.openTCPanel('添加链接音乐', '' +
      '<div class="sm-form">' +
      '<div class="sm-fld"><label>歌曲名称</label><input class="tc-input" id="sm-url-name" placeholder="可留空，识别后自动补全"></div>' +
      '<div class="sm-fld"><label>歌手</label><input class="tc-input" id="sm-url-artist" placeholder="可留空"></div>' +
      '<div class="sm-fld"><label>网易云歌曲ID 或 音乐直链</label><textarea class="tc-input" id="sm-url-link" rows="3" placeholder="如 2064961530&#10;每行一个，支持批量"></textarea></div>' +
      '<div class="sm-fld"><label>导入到歌单</label><select class="tc-input" id="sm-target-pl">' + targetPlOptions() + '</select></div>' +
      '<div class="sm-fld-hint">直接填网易云歌曲数字 ID（如 2064961530）即自动导入；也可粘贴完整链接或 mp3 直链。支持批量：每行一个 ID 或链接；批量时歌曲名/歌手自动识别，可不填。<br>粘贴歌单分享链接（music.163.com/playlist?id=xxx 或 #/playlist?id=xxx）自动导入整个歌单。<br><span style="opacity:.75">⚠ 链接上传的 VIP/付费歌曲无法播放（仅免费歌曲可播）；歌单导入受网络环境影响，失败可稍后重试</span></div>' +
      '</div>' +
      '<div class="mail-actions"><button class="cc-tool" id="sm-url-cancel">取消</button><button class="cc-tool" id="sm-url-ok">确认添加</button></div>');
    document.getElementById('sm-url-cancel').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
    document.getElementById('sm-url-ok').addEventListener('click', () => {
      // v3.6.x：修复——原用 const 声明 name，第 307 行「名称留空时补全」对其重新赋值，
      // 会抛 TypeError（Assignment to constant variable），导致「链接音乐添加」整体失效
      let name = readCeInput('sm-url-name');
      const artist = readCeInput('sm-url-artist');
      const raw = readCeInput('sm-url-link');
      if (!raw) { toast('请输入网易云ID或音乐链接'); return; }
      resolveTargetPlaylist((targetPl) => {
        // v3.8.x：支持批量——一次粘贴多行，每行一个网易云 ID / 音乐链接，逐条导入；
        // 多行时忽略「歌曲名称/歌手」输入（每首自动识别歌名/歌手）
        const lines = raw.split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
        if (!lines.length) { toast('请输入网易云ID或音乐链接'); return; }
        const isBatch = lines.length > 1;
        // v3.8.x：歌单分享链接自动识别——含 playlist?id= 的行走整歌单导入，其余行照常导入
        const playlistIds = [];
        const trackLines = [];
        lines.forEach(ln => {
          const plId = extractPlaylistId(ln);
          if (plId) { if (playlistIds.indexOf(plId) < 0) playlistIds.push(plId); }
          else trackLines.push(ln);
        });
        // 普通 ID/链接行导入（单首或批量；歌单行混排时复用）
        const addLinkLines = (lins, batchMode) => {
          let added = 0;
          lins.forEach((ln, li) => {
            let neteaseId = '';
            if (/^\d+$/.test(ln)) neteaseId = ln;
            else {
              const idMatch = ln.match(/[?&]id=(\d+)/);
              if (idMatch) neteaseId = idMatch[1];
              else {
                const pathMatch = ln.match(/\/(\d+)(?:\.mp3)?$/);
                if (pathMatch) neteaseId = pathMatch[1];
              }
            }
            let url = ln;
            let nm = batchMode ? '' : name;
            if (neteaseId) {
              url = neteaseMetingUrl(neteaseId);
              if (!nm) nm = '网易云音乐-' + neteaseId;
            }
            if (!/^(https?:\/\/|file:\/\/|data:|\/)/i.test(url)) return;
            const id = 'sm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '_' + li;
            const item = { id: id, neteaseId: neteaseId || '', name: nm, artist: batchMode ? '' : artist, url: url, source: 'url', duration: 0, playlistId: targetPl || 'default', addedAt: Date.now() };
            library.push(item);
            added++;
            if (neteaseId) {
              // v3.9.x：后台探测时长（识别歌名失败也不影响，时长单独补）
              enqueueDurProbe(item);
              fetchNeteaseInfo(neteaseId, info => {
                const m = findTrack(id);
                if (m && info && info.name) {
                  m.name = info.name;
                  if (info.artist) m.artist = info.artist;
                  if (info.duration && !m.duration) { m.duration = info.duration; updateDurUI(m.id, m.duration); }
                  saveLibrary();
                  renderPage();
                  if (!batchMode) toast('已识别：' + info.name + (info.artist ? ' - ' + info.artist : ''));
                }
              });
            }
          });
          if (!added) return;
          saveLibrary();
          document.getElementById('tc-mask').hidden = true;
          renderPage();
          if (!playlistIds.length) toast(batchMode ? '已批量添加 ' + added + ' 首链接音乐' : '链接音乐已添加');
        };
        if (playlistIds.length) {
          toast('正在导入 ' + playlistIds.length + ' 个歌单…');
          importPlaylistIds(playlistIds, (res) => {
            if (trackLines.length) addLinkLines(trackLines, isBatch);
            else { saveLibrary(); document.getElementById('tc-mask').hidden = true; renderPage(); }
            let msg = res.total
              ? '已导入 ' + res.plOk + ' 个歌单 / ' + res.total + ' 首' + (res.skipped ? '（跳过已有 ' + res.skipped + ' 首）' : '')
              : '歌单导入失败';
            if (res.plFail) msg += res.total ? '；' + res.plFail + ' 个失败（可能私密/已失效/被浏览器拦截）' : '：可能为私密歌单、已失效或被浏览器拦截，可稍后重试';
            toast(msg);
          }, targetPl);
          return;
        }
        addLinkLines(lines, isBatch);
      });
    });
  }

  // 批量导入（格式：歌曲名称 / 歌手 / 音乐直链URL，每首空一行）
  // v3.6.x：音乐直链URL 栏可直接填网易云数字 ID——自动拼装成网易云直链导入
  function openBatch() {
    if (!window.openTCPanel) return;
    window.openTCPanel('批量导入音乐', '' +
      '<div class="sm-fld-hint" style="margin-bottom:8px"><b>支持 3 种导入方式：</b><br>① <b>网易云歌单</b>：直接粘贴歌单分享链接（music.163.com/playlist?id=xxx 或 #/playlist?id=xxx），自动导入整个歌单；<br>② <b>网易云单曲</b>：每行一个歌曲数字 ID（如 2064961530）或歌曲链接，自动识别歌名；<br>③ <b>本地/直链</b>：按「歌曲名称 / 歌手 / 音乐直链URL」格式粘贴，每首歌空一行分隔。<br><br><span style="opacity:.75">⚠ 链接上传的 VIP/付费歌曲无法播放（仅免费歌曲可播）；歌单导入受网络环境影响（部分手机浏览器可能拦截），失败可稍后重试</span></div>' +
      '<textarea id="sm-batch-input" class="tc-input" rows="8" placeholder="网易云歌单链接：https://music.163.com/playlist?id=3778678&#10;网易云单曲ID：27538343&#10;&#10;歌曲名称：Baby&#10;歌手：EXO-K&#10;音乐直链URL：https://example.com/music2.mp3"></textarea>' +
      '<div class="sm-fld"><label>导入到歌单</label><select class="tc-input" id="sm-target-pl">' + targetPlOptions() + '</select></div>' +
      '<div class="mail-actions"><button class="cc-tool" id="sm-batch-cancel">取消</button><button class="cc-tool" id="sm-batch-ok">开始导入</button></div>');
    document.getElementById('sm-batch-cancel').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
    document.getElementById('sm-batch-ok').addEventListener('click', () => {
      const raw = readCeInput('sm-batch-input');
      if (!raw) { toast('请输入内容'); return; }
      resolveTargetPlaylist((targetPl) => {
        // v3.8.x：无标签纯链接模式——整段没有「名称：xxx」式标签时，按每行一个
        // 网易云 ID / 音乐链接导入（标签行以 歌曲名称：/name: 开头，链接含 :// 不算标签）
        const rawLines = raw.split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
        // v3.8.x：歌单分享链接识别（含 playlist?id= 的行单独走歌单导入）
        const plIds = [];
        rawLines.forEach(l => { const pid = extractPlaylistId(l); if (pid && plIds.indexOf(pid) < 0) plIds.push(pid); });
        const isLabelLine = (l) => {
          if (/^https?:\/\//i.test(l) || /^\/\//.test(l)) return false;
          return /^[^:=：＝/]+?[:：＝=]\s*\S+/.test(l);
        };
        const hasLabels = rawLines.some(isLabelLine);
        const units = hasLabels
          ? raw.split(/\n\s*\n/).map(b => ({ lines: b.split('\n').map(s => s.trim()).filter(Boolean), plain: false }))
          : rawLines.filter(l => !extractPlaylistId(l)).map(l => ({ lines: [l], plain: true }));
        let added = 0;
        units.forEach((unit, ui) => {
          let name = '', artist = '', url = '';
          if (unit.plain) {
            url = unit.lines[0];
          } else {
            unit.lines.forEach(line => {
              const sepMatch = line.match(/^([^:=]+?)(?:[:：＝=])\s*(.+)$/);
              if (!sepMatch) return;
              const key = sepMatch[1].replace(/\s+/g, '').toLowerCase();
              const val = sepMatch[2].trim();
              if (/^(歌曲名称|歌名|名称|name|歌曲)$/.test(key)) name = val;
              else if (/^(歌手|艺术家|艺人|artist|演唱)$/.test(key)) artist = val;
              else if (/^(音乐直链url|音乐直链|音乐链接|链接|直链|url|音乐url|link)$/.test(key)) url = val;
            });
          }
          if (!url) return;
          if (extractPlaylistId(url)) return; // 歌单链接单独走歌单导入，不当作单曲
          // v3.6.x：URL 栏支持纯数字网易云 ID / 完整网易云链接 / 任意 mp3 直链——
          // 统一提取数字 ID 并规范化成网易云直链（与「链接添加」一致）
          let neteaseId = '';
          if (/^\d+$/.test(url)) {
            neteaseId = url;
          } else {
            const idMatch = url.match(/[?&]id=(\d+)/);
            const pathMatch = url.match(/\/(\d+)(?:\.mp3)?$/);
            if (idMatch) neteaseId = idMatch[1];
            else if (pathMatch) neteaseId = pathMatch[1];
          }
          if (neteaseId) {
            url = neteaseMetingUrl(neteaseId);
            if (!name) name = '网易云音乐-' + neteaseId; // 只填数字时自动补默认名
          }
          if (!name) {
            // 纯链接模式且非网易云 ID：取链接文件名当歌名，取不到给默认名
            const fn = (url.match(/\/([^/?#]+?)(?:\.[^/.?#]+)?$/) || [])[1];
            name = fn || '链接音乐';
          }
          if (!/^(https?:\/\/|file:\/\/|data:|\/)/i.test(url)) return;
          const nid = 'sm_batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '_' + ui;
          const item = { id: nid, neteaseId: neteaseId || '', name: name, artist: artist, url: url, source: 'url', duration: 0, playlistId: targetPl || 'default', addedAt: Date.now() };
          library.push(item);
          added++;
          // v3.6.x：数字 ID 自动识别歌曲名（与「链接添加」一致，识别到后覆盖默认名）
          if (neteaseId) {
            // v3.9.x：后台探测时长
            enqueueDurProbe(item);
            fetchNeteaseInfo(neteaseId, info => {
              const mm = library.find(x => x.id === nid);
              if (mm && info && info.name) {
                mm.name = info.name;
                if (info.artist) mm.artist = info.artist;
                if (info.duration && !mm.duration) { mm.duration = info.duration; updateDurUI(mm.id, mm.duration); }
                saveLibrary();
                renderPage();
              }
            });
          }
        });
        if (!added && !plIds.length) { toast('没有识别到有效歌曲，请检查格式'); return; }
        // v3.8.x：含歌单链接 → 歌单与单曲都导入后统一提示
        if (plIds.length) {
          toast('正在导入 ' + plIds.length + ' 个歌单…');
          importPlaylistIds(plIds, (res) => {
            saveLibrary();
            document.getElementById('tc-mask').hidden = true;
            renderPage();
            let msg = (added ? '已导入 ' + added + ' 首音乐 + ' : '已导入 ');
            msg += res.total ? res.plOk + ' 个歌单 / ' + res.total + ' 首' : '0 首歌单（可能私密/已失效/被浏览器拦截，可稍后重试）';
            if (res.skipped) msg += '（跳过已有 ' + res.skipped + ' 首）';
            if (res.plFail && res.total) msg += '；' + res.plFail + ' 个歌单失败（可能私密/已失效/被拦截）';
            toast(msg);
          }, targetPl);
          return;
        }
        saveLibrary();
        document.getElementById('tc-mask').hidden = true;
        renderPage();
        toast('已导入 ' + added + ' 首音乐');
      });
    });
  }

  // ================= 歌单 =================
  function renderPlaylists() {
    const el = document.getElementById('music-pl-list');
    if (!el) return;
    const pls = playlists.slice();
    // "我的音乐库"虚拟项（playlistId='default' 的未归类歌曲池），置顶显示，点击可打开查看
    const libCount = library.filter(m => !m.playlistId || m.playlistId === 'default').length;
    const libItem = '<div class="sm-pl sm-pl-lib" data-pid="default">' +
      '<span class="sm-pl-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>' +
      '<div class="sm-pl-info"><div class="sm-pl-name">我的音乐库</div><div class="sm-pl-sub">' + libCount + ' 首</div></div>' +
      '</div>';
    el.innerHTML = libItem + pls.map(p => {
      const count = library.filter(m => m.playlistId === p.id).length;
      const icoCls = p.cover ? 'sm-pl-ico has-cov' : 'sm-pl-ico';
      const icoStyle = p.cover ? ' style="background-image:url(\'' + esc(p.cover) + '\')"' : '';
      const icoInner = p.cover ? '' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
      return '<div class="sm-pl" data-pid="' + p.id + '">' +
        '<span class="' + icoCls + '"' + icoStyle + '>' + icoInner + '</span>' +
        '<div class="sm-pl-info"><div class="sm-pl-name">' + esc(p.name) + '</div><div class="sm-pl-sub">' + count + ' 首</div></div>' +
        '<button class="sm-pl-edit" data-pid="' + p.id + '" title="编辑歌单"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
        '<button class="sm-pl-del" data-pid="' + p.id + '" title="删除歌单"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/></svg></button>' +
        '</div>';
    }).join('');
    el.querySelectorAll('.sm-pl').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.sm-pl-del') || e.target.closest('.sm-pl-edit')) return;
        const pid = row.dataset.pid;
        let pl, songs;
        if (pid === 'default') {
          pl = { name: '我的音乐库' };
          songs = library.filter(m => !m.playlistId || m.playlistId === 'default');
        } else {
          pl = playlists.find(p => p.id === pid);
          songs = library.filter(m => m.playlistId === pid);
        }
        if (!pl || !window.openTCPanel) return;
        window.openTCPanel(esc(pl.name), songs.length
          ? songs.map(m => '<div class="sm-song" data-id="' + m.id + '">' +
              songIcoHtml(m) +
              '<div class="sm-song-info"><div class="sm-song-name">' + esc(m.name || '未知歌曲') + '</div>' +
              '<div class="sm-song-sub">' + esc(m.artist || '未知歌手') + '</div></div>' +
              '<span class="sm-song-dur">' + fmtDur(m.duration) + '</span></div>').join('')
          : '<div class="ta-empty">这个歌单还没有歌曲</div>');
        document.querySelectorAll('#tc-body .sm-song').forEach(s => {
          s.addEventListener('click', () => playTrack(s.dataset.id));
        });
      });
    });
    el.querySelectorAll('.sm-pl-del').forEach(b => {
      b.addEventListener('click', () => {
        const pid = b.dataset.pid;
        const pl = playlists.find(p => p.id === pid);
        if (!pl) return;
        if (pl.id === 'spl_default') { toast('默认歌单不能删除'); return; }
        if (window.openModal) {
          window.openModal('删除歌单「' + pl.name + '」？歌单里的歌曲不会删除', '', () => {
            library.forEach(m => { if (m.playlistId === pid) m.playlistId = 'default'; });
            playlists = playlists.filter(p => p.id !== pid);
            saveLibrary(); savePlaylists(); renderPage();
          }, { noInput: true });
        }
      });
    });
    el.querySelectorAll('.sm-pl-edit').forEach(b => {
      b.addEventListener('click', (e) => { e.stopPropagation(); openPlaylistEditor(b.dataset.pid); });
    });
  }
  // ================= 歌单编辑（封面/重命名/删除） =================
  function openPlaylistEditor(pid) {
    const pl = playlists.find(p => p.id === pid);
    if (!pl || !window.openTCPanel) return;
    const isDefault = pl.id === 'spl_default';
    window.openTCPanel('编辑歌单', '' +
      '<div class="sm-fld"><label>歌单名称</label><input class="tc-input" id="sm-pe-name" value="' + String(pl.name || '').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"></div>' +
      '<div class="sm-fld"><label>歌单封面</label>' +
      '<div class="sm-cov-row">' +
      '<div class="sm-cov-prev' + (pl.cover ? ' has-cov' : '') + '" id="sm-pe-cov-prev"' + (pl.cover ? ' style="background-image:url(\'' + esc(pl.cover) + '\')"' : '') + ' title="点击上传封面"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg></div>' +
      '<div class="sm-cov-actions"><button class="cc-tool sm-cov-btn" id="sm-pe-cov-up">上传封面</button><button class="cc-tool sm-cov-btn" id="sm-pe-cov-clear"' + (pl.cover ? '' : ' hidden') + '>清除封面</button></div>' +
      '</div></div>' +
      '<div class="sm-set-hint">设置封面后，可在「音乐设置」切换桌面小组件显示歌单封面或歌曲封面</div>' +
      '<div class="mail-actions">' + (isDefault ? '' : '<button class="cc-tool" id="sm-pe-del">删除歌单</button>') + '<button class="cc-tool" id="sm-pe-cancel">取消</button><button class="cc-tool" id="sm-pe-ok">保存</button></div>');
    const covPrev = document.getElementById('sm-pe-cov-prev');
    const covUp = document.getElementById('sm-pe-cov-up');
    const covClear = document.getElementById('sm-pe-cov-clear');
    const covInput = document.createElement('input');
    covInput.type = 'file'; covInput.accept = 'image/*'; covInput.style.display = 'none';
    document.body.appendChild(covInput);
    covInput.onchange = function () {
      const f = covInput.files && covInput.files[0];
      covInput.value = '';
      if (!f) return;
      compressCover(f, function (dv) {
        if (!dv) { toast('封面读取失败，请换一张图片'); return; }
        pl.cover = dv;
        savePlaylists(); renderPage();
        covPrev.classList.add('has-cov');
        covPrev.style.backgroundImage = 'url(\'' + dv + '\')';
        covClear.hidden = false;
        const cur = findTrack(currentId);
        if (cur && cur.playlistId === pid && settings.widgetCoverMode === 'playlist') setWidgetCover(cur);
        toast('歌单封面已设置');
      });
    };
    const pickCover = () => { try { covInput.click(); } catch (e) {} };
    if (covUp) covUp.addEventListener('click', pickCover);
    if (covPrev) covPrev.addEventListener('click', pickCover);
    if (covClear) covClear.addEventListener('click', () => {
      pl.cover = '';
      savePlaylists(); renderPage();
      covPrev.classList.remove('has-cov');
      covPrev.style.backgroundImage = '';
      covClear.hidden = true;
      const cur = findTrack(currentId);
      if (cur && cur.playlistId === pid && settings.widgetCoverMode === 'playlist') setWidgetCover(cur);
      toast('已清除歌单封面');
    });
    document.getElementById('sm-pe-cancel').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
    document.getElementById('sm-pe-ok').addEventListener('click', () => {
      const name = (document.getElementById('sm-pe-name').value || '').trim();
      if (name) pl.name = name;
      savePlaylists();
      document.getElementById('tc-mask').hidden = true;
      renderPage();
      toast('已保存');
    });
    const delBtn = document.getElementById('sm-pe-del');
    if (delBtn) delBtn.addEventListener('click', () => {
      if (!window.openModal) return;
      window.openModal('删除歌单「' + pl.name + '」？歌单里的歌曲不会删除', '', () => {
        library.forEach(m => { if (m.playlistId === pid) m.playlistId = 'default'; });
        playlists = playlists.filter(p => p.id !== pid);
        saveLibrary(); savePlaylists(); renderPage();
        document.getElementById('tc-mask').hidden = true;
      }, { noInput: true });
    });
  }
  const plCreate = document.getElementById('music-pl-create');
  if (plCreate) {
    plCreate.addEventListener('click', () => {
      if (!window.openTCPanel) return;
      window.openTCPanel('新建歌单', '' +
        '<div class="sm-fld"><label>歌单名称</label><input class="tc-input" id="sm-pl-name" placeholder="歌单名称"></div>' +
        '<div class="mail-actions"><button class="cc-tool" id="sm-pl-cancel">取消</button><button class="cc-tool" id="sm-pl-ok">创建</button></div>');
      document.getElementById('sm-pl-cancel').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
      document.getElementById('sm-pl-ok').addEventListener('click', () => {
        const name = (document.getElementById('sm-pl-name').value || '').trim();
        if (!name) { toast('请输入歌单名称'); return; }
        playlists.push({ id: 'spl_' + Date.now(), name: name, createdAt: Date.now() });
        savePlaylists();
        document.getElementById('tc-mask').hidden = true;
        renderPage();
        toast('歌单已创建');
      });
    });
  }

  // ================= 渲染 =================
  // 批量管理模式：勾选多首 → 删除 / 加入歌单
  let musicBatch = false;
  const batchSel = new Set();
  // v3.9.x：我的音乐库分类筛选——'all' 全部 / 'default' 未分类 / 具体歌单 id
  let libFilter = 'all';
  function libSongsFor(filter) {
    if (filter === 'default') return library.filter(m => !m.playlistId || m.playlistId === 'default');
    if (filter && filter !== 'all') return library.filter(m => m.playlistId === filter);
    return library.slice();
  }
  function renderLibrary() {
    const listEl = document.getElementById('music-lib-list');
    const emptyEl = document.getElementById('music-lib-empty');
    if (!listEl) return;
    const songs = libSongsFor(libFilter);
    if (emptyEl) {
      emptyEl.hidden = songs.length > 0;
      if (!songs.length) {
        emptyEl.textContent = libFilter === 'all'
          ? '还没有音乐，上传本地音乐，建立属于你们的声音陪伴空间'
          : (libFilter === 'default' ? '还没有未分类的音乐' : '这个歌单还没有歌曲');
      }
    }
    listEl.innerHTML = songs.length
      ? songs.map(m => {
          const active = m.id === currentId;
          const icon = active && audio && !audio.paused
            ? '<path d="M7 5.5h3.5v13H7zM13.5 5.5H17v13h-3.5z"/>'
            : '<path d="M8 5.5v13l11-6.5z"/>';
          const badge = m.source === 'local'
            ? '<span class="sm-src sm-src-local">本地</span>'
            : '<span class="sm-src">网络</span>';
          const checked = musicBatch && batchSel.has(m.id) ? ' sel' : '';
          const chk = musicBatch ? '<span class="sm-batch-chk"></span>' : '';
          return '<div class="sm-song' + (active ? ' active' : '') + checked + '" data-id="' + m.id + '">' +
            chk +
            songIcoHtml(m, icon) +
            '<div class="sm-song-info"><div class="sm-song-name">' + esc(m.name || '未知歌曲') + '</div>' +
            '<div class="sm-song-sub">' + esc(m.artist || '未知歌手') + ' · ' + badge + '</div></div>' +
            '<span class="sm-song-dur">' + fmtDur(m.duration) + '</span>' +
            '<button class="sm-song-more" data-id="' + m.id + '" title="管理"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>' +
            '</div>';
        }).join('')
      : '';
    listEl.querySelectorAll('.sm-song').forEach(row => {
      row.addEventListener('click', (e) => {
        if (musicBatch) {
          const id = row.dataset.id;
          if (batchSel.has(id)) batchSel.delete(id); else batchSel.add(id);
          row.classList.toggle('sel', batchSel.has(id));
          updateBatchCount();
          return;
        }
        if (e.target.closest('.sm-song-more')) return;
        playTrack(row.dataset.id);
      });
    });
    listEl.querySelectorAll('.sm-song-more').forEach(b => {
      b.addEventListener('click', () => openSongMenu(b.dataset.id));
    });
  }
  // v3.9.x：我的音乐库分类筛选条——全部音乐 / 未分类音乐（无未分类歌曲时不显示）/ 各歌单
  function renderLibFilter() {
    const wrap = document.getElementById('music-lib-filter');
    if (!wrap) return;
    const unclassified = library.filter(m => !m.playlistId || m.playlistId === 'default');
    // 当前筛选分组已不存在（未分类被删光 / 歌单被删）→ 自动回退「全部音乐」
    if (libFilter === 'default' && !unclassified.length) libFilter = 'all';
    if (libFilter !== 'all' && libFilter !== 'default' && !playlists.some(p => p.id === libFilter)) libFilter = 'all';
    wrap.hidden = !library.length;
    const chip = (key, name, count) =>
      '<button class="mlf-chip' + (libFilter === key ? ' sel' : '') + '" data-mlf="' + key + '">' +
      '<span class="mlf-name">' + name + '</span><span class="mlf-cnt">' + count + '</span></button>';
    let html = chip('all', '全部音乐', library.length);
    if (unclassified.length) html += chip('default', '未分类音乐', unclassified.length);
    html += playlists.map(p => chip(p.id, esc(p.name), library.filter(m => m.playlistId === p.id).length)).join('');
    wrap.innerHTML = html;
    wrap.querySelectorAll('.mlf-chip').forEach(b => {
      b.addEventListener('click', () => {
        if (libFilter === b.dataset.mlf) return;
        libFilter = b.dataset.mlf;
        if (musicBatch) batchSel.clear();
        renderLibFilter();
        renderLibrary();
        updateBatchCount();
      });
    });
  }
  // 批量管理：进入/退出
  function enterBatch() {
    musicBatch = true;
    batchSel.clear();
    renderLibrary();
    if (!document.getElementById('music-batch-bar')) {
      const bar = document.createElement('div');
      bar.id = 'music-batch-bar';
      bar.className = 'music-batch-bar';
      bar.innerHTML =
        '<span class="music-batch-count" id="music-batch-count">已选 0 首</span>' +
        '<button class="music-batch-btn" id="mb-all">全选</button>' +
        '<button class="music-batch-btn" id="mb-to-pl">加入歌单</button>' +
        '<button class="music-batch-btn music-batch-del" id="mb-del">删除</button>' +
        '<button class="music-batch-btn" id="mb-exit">退出</button>';
      document.body.appendChild(bar);
      bar.querySelector('#mb-all').addEventListener('click', () => {
        const ids = libSongsFor(libFilter).map(m => m.id);
        if (batchSel.size === ids.length && ids.length) batchSel.clear();
        else ids.forEach(id => batchSel.add(id));
        renderLibrary();
        updateBatchCount();
      });
      bar.querySelector('#mb-del').addEventListener('click', () => {
        if (!batchSel.size) { toast('请先勾选歌曲'); return; }
        if (window.openModal) {
          window.openModal('删除选中的 ' + batchSel.size + ' 首音乐？', '', () => {
              library = library.filter(m => !batchSel.has(m.id));
            if (window.idbGetAllKeys) {
              window.idbGetAllKeys().then(keys => {
                // v3.5.123：全等匹配（前缀匹配在 id 互为前缀时会误删）
                keys.filter(k => { for (const id of batchSel) if (k === window.activePrefix() + ':music-file:' + id) return true; return false; })
                  .forEach(k => { if (window.idbDelete) window.idbDelete(k); });
              });
            }
            if (batchSel.has(currentId)) { teardownAudio(); currentId = null; }
            batchSel.clear();
            saveLibrary();
            renderPage();
            updateBatchCount();
            toast('已删除');
          }, { noInput: true });
        }
      });
      bar.querySelector('#mb-to-pl').addEventListener('click', () => {
        if (!batchSel.size) { toast('请先勾选歌曲'); return; }
        if (!window.openTCPanel) return;
        window.openTCPanel('加入歌单', '<div class="sm-fld"><label>选择歌单</label><select class="tc-input" id="mb-pl-select">' +
          playlists.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('') + '</select></div>' +
          '<div class="mail-actions"><button class="cc-tool" id="mb-pl-cancel">取消</button><button class="cc-tool" id="mb-pl-ok">加入</button></div>');
        document.getElementById('mb-pl-cancel').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
        document.getElementById('mb-pl-ok').addEventListener('click', () => {
          const pid = document.getElementById('mb-pl-select').value;
          library.forEach(m => { if (batchSel.has(m.id)) m.playlistId = pid; });
          saveLibrary();
          document.getElementById('tc-mask').hidden = true;
          batchSel.clear();
          renderPage();
          updateBatchCount();
          toast('已加入歌单');
        });
      });
      bar.querySelector('#mb-exit').addEventListener('click', exitBatch);
    }
    document.getElementById('music-batch-bar').hidden = false;
    // v3.5.138：批量条盖住底部播放条（播放/暂停/切歌不可操作）——批量期间隐藏播放条
    const pb = document.getElementById('sm-player-bar');
    if (pb) pb.hidden = true;
    updateBatchCount();
  }
  function exitBatch() {
    musicBatch = false;
    batchSel.clear();
    const bar = document.getElementById('music-batch-bar');
    if (bar) bar.hidden = true;
    // v3.5.138：退出批量恢复播放条（仅当有歌在播/有 currentId 时；无歌保持隐藏）
    const pb = document.getElementById('sm-player-bar');
    if (pb) pb.hidden = !(currentId && audio);
    renderLibrary();
  }
  function updateBatchCount() {
    const el = document.getElementById('music-batch-count');
    if (el) el.textContent = '已选 ' + batchSel.size + ' 首';
  }
  function renderHistory() {
    const el = document.getElementById('music-his-list');
    if (!el) return;
    const h = history.slice().reverse();
    el.innerHTML = h.length
      ? h.map(x => {
          // v3.9.x：听歌记录显示歌曲封面——优先取记录里冗余存的 cover，
          // 没有（旧记录/歌曲删了）再按 trackId 回查当前音乐库；都拿不到保留原图标
          const t = (!x.mode && x.trackId) ? findTrack(x.trackId) : null;
          const cov = (!x.mode && (x.cover || (t && t.cover))) || '';
          const ico = cov
            ? '<span class="sm-his-ico has-cov" style="background-image:url(\'' + esc(cov) + '\')"></span>'
            : '<span class="sm-his-ico">' + (x.mode
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>') + '</span>';
          return '<div class="sm-his">' + ico +
            '<div class="sm-his-info"><div class="sm-his-name">' + (x.mode ? esc(x.triggerType || '播放模式') : esc(x.trackName || '未知歌曲')) + '</div>' +
            '<div class="sm-his-sub">' + fmtDT(x.ts) + (x.mode ? '' : (x.triggerType ? ' · ' + esc(x.triggerType) : '')) + '</div></div></div>';
        }).join('')
      : '<div class="ta-empty">还没有梦角邀请听歌记录，TA 邀请你一起听歌的记录会出现在这里</div>';
  }
  function renderPage() {
    renderLibFilter();
    renderLibrary();
    renderPlaylists();
    renderFavList();
    renderHistory();
    updatePlayerBar();
    syncFloatToggle();
  }

  // ================= 播放器 =================
  // v3.6.x：本地音频播放——blob: URL 和 dataURL 双路径互为兜底。
  // 夸克等浏览器对 `<audio src="data:...">`（大段 base64）播放失效，blob: 必走；
  // 永恒浏览器（安卓 WebView）相反，对 blob: URL 音频静默失败（play() Promise 挂起、
  // onplay 不触发、无声无提示），dataURL 直接作为 src 才能播。
  // 策略：Blob 优先 blob:，dataURL 字符串优先 dataURL；4 秒无 onplay/无进度 →
  // teardown 切另一种 src 重试。两种都失败 → toast 提示。
  let curObjectUrl = null;
  function revokeObjectUrl() {
    if (curObjectUrl) { try { URL.revokeObjectURL(curObjectUrl); } catch (e) {} curObjectUrl = null; }
  }
  // dataURL 字符串 → Blob：优先 fetch（原生异步解码，不阻塞主线程），失败回退手动 base64 解码
  function dataUrlToBlob(dataUrl) {
    const manual = () => new Promise((resolve, reject) => {
      try {
        const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
        if (!m) { reject(new Error('bad data url')); return; }
        const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        resolve(new Blob([bytes], { type: m[1] || 'audio/mpeg' }));
      } catch (e) { reject(e); }
    });
    if (typeof fetch === 'function') {
      return fetch(dataUrl).then(r => r.blob()).catch(() => manual());
    }
    return manual();
  }
  // Blob → dataURL 字符串（FileReader，异步；用于 blob: 失败后切 dataURL 重试）
  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result || '');
      fr.onerror = () => resolve('');
      try { fr.readAsDataURL(blob); } catch (e) { resolve(''); }
    });
  }
  // 用本地值（Blob 或 dataURL 字符串）建音频并播放
  function playLocal(m, v) {
    if (currentId !== m.id) return;
    let failoverUsed = false; // 防止 blob:↔dataURL 之间无限切换
    // 用指定 src 建 audio 并启动播放，4 秒无 onplay/无进度 → 切另一种 src
    function startWithSrc(src, isBlob) {
      if (currentId !== m.id) return;
      if (isBlob) { revokeObjectUrl(); curObjectUrl = src; }
      audio = new Audio();
      audio.src = src;
      startPlayback(m);
      let wd = setTimeout(() => {
        wd = null;
        if (currentId !== m.id || !audio) return; // 已切歌/已 teardown
        if (audio.currentTime > 0) return; // 已在播，blob:/dataURL 成功
        if (failoverUsed) { // 两种 src 都失败
          toast('播放失败：浏览器无法加载音频');
          try { audio.pause(); } catch (e) {}
          try { syncPlayIcons(false); } catch (e) {}
          return;
        }
        failoverUsed = true;
        teardownAudio();
        if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
        if (isBlob) {
          // blob: 失败 → 切 dataURL 直接作为 src（永恒浏览器走这条）
          const dataUrlP = (v instanceof Blob) ? blobToDataUrl(v) : Promise.resolve(v);
          dataUrlP.then(dataUrl => {
            if (currentId !== m.id) return;
            if (!dataUrl) { toast('播放失败：浏览器无法加载音频'); currentId = null; updatePlayerBar(); renderLibrary(); return; }
            startWithSrc(dataUrl, false);
          });
        } else {
          // dataURL 失败 → 切 blob: URL（夸克浏览器走这条）
          const blobP = (v instanceof Blob) ? Promise.resolve(v) : dataUrlToBlob(v);
          blobP.then(blob => {
            if (currentId !== m.id) return;
            try { startWithSrc(URL.createObjectURL(blob), true); } catch (e) { toast('播放失败：浏览器无法加载音频'); }
          }).catch(() => { toast('播放失败：浏览器无法加载音频'); currentId = null; updatePlayerBar(); renderLibrary(); });
        }
      }, 4000);
      // onplay 取消 watchdog（正常出声，无需切 src）
      if (audio) audio.addEventListener('play', () => { if (wd) { clearTimeout(wd); wd = null; } }, { once: true });
    }
    // 先试：Blob → blob: URL；dataURL 字符串 → dataURL 直接作为 src
    if (v instanceof Blob) {
      try { startWithSrc(URL.createObjectURL(v), true); } catch (e) { toast('播放失败：浏览器无法加载音频'); }
    } else {
      startWithSrc(v, false);
    }
  }
  function teardownAudio() {
    if (audio) {
      try { audio.pause(); audio.onended = null; audio.onerror = null; audio.onloadedmetadata = null; audio.onplay = null; audio.onpause = null; audio.removeAttribute('src'); audio.load(); } catch(e) {}
      audio = null;
    }
    revokeObjectUrl();
    playRejected = false;
    endedHandled = false;
    disarmAutoResume();
    clearStallGuard();
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    // v3.9.x：真正停止（非切歌）后让 bg-keep 恢复"后台保活"媒体会话条；
    // 切歌时 currentId 已指向新歌，此处不触发
    setTimeout(function () {
      if (!audio && !currentId) {
        try { if (navigator.mediaSession) navigator.mediaSession.playbackState = 'none'; } catch (e) {}
        try { document.dispatchEvent(new Event('music-media-release')); } catch (e) {}
      }
    }, 0);
  }
  // v3.5.112：内置种子歌曲判定与本地旋律兜底（共享：外链播放失败 / 本地数据缺失时使用）
  function seedIdxOf(m) {
    const seedId = m ? String(m.neteaseId || '') : '';
    if (seedId === '2613048732') return 0;
    if (seedId === '27538343') return 1;
    return -1;
  }
  let demoFallbackBusy = false; // 防止外链失败 → demo 失败 → 再走 demo 的递归
  // 现场合成内置示例旋律并直接播放（不改歌曲数据，外链/本地数据都保留）
  function playDemoFor(m, seedIdx) {
    genDemoAudio(seedIdx).then(d => {
      if (!d) { toast('播放失败：网络链接可能已失效，或该歌曲为VIP付费歌曲'); demoFallbackBusy = false; return; }
      try { window.idbSet(window.activePrefix() + ':music-file:' + m.id, d); } catch (e) {}
      demoFallbackBusy = false;
      if (currentId !== m.id) return;
      teardownAudio();
      if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
      playLocal(m, d);
    });
  }
  // 播放启动（audio 已设 src 后调用）
  function startPlayback(m) {
    if (!audio) return;
    audio.preload = 'auto';
    setupHandlers(m);
    const p = audio.play();
    if (p && p.catch) {
      p.catch(() => {
        // v3.6.x：移动端自动播放策略——本地文件是「异步从 IDB/Blob 读回后再 play()」，
        // 用户点击的手势上下文已丢失，play() 被浏览器拒绝（NotAllowedError）。
        // muted 静音解锁（Chromium/国产 WebView 的 autoplay 策略对静音媒体放行）：
        // 静音 play() → 成功后再恢复音量。这比「提示用户再点一下屏幕」在
        // Via/OPPO 自带等国产浏览器上更可靠（实测其手势续播仍被拒）。
        playRejected = true;
        try { audio.muted = true; } catch (e) {}
        const p2 = audio.play();
        if (p2 && p2.then) {
          p2.then(() => {
            if (audio) audio.muted = false; // 静音解锁成功 → 恢复出声
            playRejected = false;
            clearStallGuard();
            disarmAutoResume();
            try { syncPlayIcons(true); } catch (e) {}
          }).catch(() => {
            // muted 也被拒（极端策略/设置关闭自动播放）→ 明确提示 + 手势续播兜底
            toast('点击播放被浏览器拦截，请再点一下屏幕继续播放');
            armAutoResume();
          });
        } else {
          toast('点击播放被浏览器拦截，请再点一下屏幕继续播放');
          armAutoResume();
        }
      });
    }
    armStallGuard(m);
    updatePlayerBar();
    renderLibrary();
    startProgress();
    addRecord(m.id, '');
    updateMediaSession(true);
  }
  // v3.6.x：自动播放被拒后的手势恢复——移动端 play() 被拒（异步链丢手势）后，
  // 挂一次性手势监听，用户下一次触摸/点击（任意位置）时 audio.play()，
  // 此时处于真实用户手势内，浏览器必放行；恢复成功后自动移除监听。
  let autoResumeArmed = false;
  function armAutoResume() {
    if (autoResumeArmed) return;
    autoResumeArmed = true;
    const retry = function () {
      disarmAutoResume();
      if (!audio || !currentId || !audio.paused) return;
      try { if (audio) audio.muted = false; } catch (e) {}
      const p2 = audio.play();
      if (p2 && p2.catch) p2.catch(function () { armAutoResume(); });
    };
    document.addEventListener('pointerdown', retry, true);
    document.addEventListener('touchend', retry, true);
    document.addEventListener('click', retry, true);
    document._mochiAutoResume = retry;
  }
  function disarmAutoResume() {
    autoResumeArmed = false;
    const retry = document._mochiAutoResume;
    if (!retry) return;
    document._mochiAutoResume = null;
    document.removeEventListener('pointerdown', retry, true);
    document.removeEventListener('touchend', retry, true);
    document.removeEventListener('click', retry, true);
  }
  // v3.6.x：播放停滞守卫——外链被拦截/302 跳转挂起时 audio 不触发 error 也不出声
  //（图标转但永远无声，Edge 等浏览器实测）。启动 12 秒后 currentTime 仍为 0：
  // 种子歌自动切内置示例旋律，其余歌曲提示并停止；有进度/暂停/切歌/播放事件都会取消守卫。
  // play() 被自动播放策略拒绝（playRejected）不算停滞——走 armAutoResume 等用户手势，
  // 不在这里误判成「外链失败」切兜底。
  let stallTimer = null;
  let playRejected = false;
  function clearStallGuard() {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
  }
  function armStallGuard(m) {
    clearStallGuard();
    if (!m || (m.source !== 'url' && !m.url)) return;
    stallTimer = setTimeout(function () {
      stallTimer = null;
      try {
        if (!audio || currentId !== m.id) return;
        if (audio.currentTime > 0) return;
        if (playRejected) return; // 等手势恢复播放，不误判外链失败
        if (audio.paused) return; // 用户主动暂停，不兜底
        // v3.6.x：关键修复——「还在加载」不算停滞。Edge 移动端加载网易云外链
        // （outer/url 302 → CDN）可能需 10~30 秒缓冲，原 12 秒定时器到点时
        // currentTime 仍为 0，会把「正在缓冲的完整歌曲」误判为失败切到内置旋律。
        // readyState>0（有元数据）/ buffered 有数据 / networkState=LOADING → 重新计时再等。
        try {
          if (audio.readyState > 0 || (audio.buffered && audio.buffered.length > 0) || audio.networkState === 2) {
            armStallGuard(m);
            return;
          }
        } catch (e) {}
        // 确认无加载活动（真挂起/被拦）：网易云歌曲先拉 https 直链重播
        if (m && m.neteaseId && !httpsRetrying) {
          if (retryWithHttpsUrl(m)) return;
        }
        const idx = seedIdxOf(m);
        if (idx >= 0 && !demoFallbackBusy) {
          demoFallbackBusy = true;
          toast('外链播放失败，已改用内置示例旋律');
          playDemoFor(m, idx);
        } else if (idx < 0) {
          toast('播放失败：网络链接可能已失效，或该歌曲为VIP付费歌曲');
          try { audio.pause(); } catch (e) {}
          try { syncPlayIcons(false); } catch (e) {}
        }
      } catch (e) {}
    }, 12000);
  }
  // v3.6.x：外链失败 → 用 meting API 的 https 302 重播。
  // 根因：outer/url 302 到 http CDN，HTTPS 部署（GitHub Pages）下被浏览器按混合内容
  // 拦截（所有手机外链全失败、只能播内置旋律）。Meting-API（api.injahow.cn，大陆可直连）
  // 的 ?type=url&id=xxx 会 302 到 https://m*.music.126.net 直链——audio.src 直接指向
  // meting URL 即可，浏览器自动跟随 302，全程 https 无混合内容。已实测两首种子歌
  // 完整返回（5.3MB / 9.6MB，连续多次稳定）。若 meting 不可用则回退内置旋律。
  function neteaseMetingUrl(id) {
    return 'https://api.injahow.cn/meting/?type=url&id=' + encodeURIComponent(String(id));
  }
  // v3.6.x：解析 meting URL 的 302 跳转，拿到最终 CDN 直链 URL，把 http: 修正为 https:
  // 避免混合内容拦截。
  // v3.9.x：改用 fetch（response.url 跟随重定向后的最终 URL）——iOS Safari 上
  // XHR 的 responseURL 对跨域 302 不返回最终 URL（只返回原始请求 URL），导致
  // retryWithHttpsUrl 拿不到 CDN 直链、回退到 meting URL 重试无意义。fetch 的
  // response.url 在所有现代浏览器（含 iOS Safari 15.4+）都正确返回最终 URL。
  // fetch 收到响应头即 resolve，立即 abort body 不下载音频。
  function resolveNeteaseDirectUrl(m, cb) {
    try {
      let controller;
      try { controller = new AbortController(); } catch (e) { controller = null; }
      const timer = setTimeout(() => { try { controller && controller.abort(); } catch (e) {} }, 8000);
      fetch(neteaseMetingUrl(m.neteaseId), controller ? { signal: controller.signal } : undefined)
        .then(function (r) {
          clearTimeout(timer);
          var finalUrl = (r.url || '').replace(/^http:/i, 'https:');
          try { controller && controller.abort(); } catch (e) {}
          try { r.body && r.body.cancel && r.body.cancel(); } catch (e) {}
          cb(finalUrl || null);
        })
        .catch(function () { clearTimeout(timer); cb(null); });
    } catch (e) { cb(null); }
  }
  let httpsRetrying = false;
  // v3.9.x：网易云官方外链——meting API 不可达时的备用播放方案。
  // https://music.163.com/song/media/outer/url?id=xxx 302 → CDN mp3
  // <audio> 标签不走 CORS，可直接设 src 播放（fetch 因 302 无 CORS 头会失败）。
  // 注意：302 目标是 http CDN，HTTPS 页面下可能被混合内容拦截——作为 meting 不可达时的最后兜底。
  function neteaseOuterUrl(id) {
    return 'https://music.163.com/song/media/outer/url?id=' + encodeURIComponent(String(id));
  }
  function retryWithHttpsUrl(m) {
    // v3.6.x：每首歌最多重试一次（_httpsRetried 内存标记）——防止 meting 直链也失败时
    // onerror/停滞守卫反复触发 → 无限拉取
    if (httpsRetrying || !m || !m.neteaseId || m._httpsRetried) return false;
    m._httpsRetried = true;
    httpsRetrying = true;
    toast('正在获取完整版直链…');
    try {
      if (audio) { audio.onerror = null; audio.onended = null; audio.onloadedmetadata = null; }
    } catch (e) {}
    teardownAudio();
    // v3.6.x：先解析 meting URL 的 302 拿最终 CDN 直链，修正 http→https，
    // 再用直链播放（而非直接用 meting URL——和 m.url 相同的重试无意义）
    // v3.9.x：meting API 不可达（直链为空）时，用网易云官方外链作为备用
    // 播放源（<audio> 不走 CORS，能请求官方外链；302 到 CDN mp3 直接播放）
    resolveNeteaseDirectUrl(m, function (directUrl) {
      if (directUrl) {
        httpsRetrying = false;
        if (currentId !== m.id) { demoFallbackOrError(m); return; }
        audio = new Audio();
        try { audio.referrerPolicy = 'no-referrer'; } catch (e) {}
        audio.src = directUrl;
        startPlayback(m);
        return;
      }
      // meting API 失败 → 尝试网易云官方外链（<audio> 直接跟随 302 播放）
      httpsRetrying = false;
      if (currentId !== m.id) { demoFallbackOrError(m); return; }
      audio = new Audio();
      try { audio.referrerPolicy = 'no-referrer'; } catch (e) {}
      audio.src = neteaseOuterUrl(m.neteaseId);
      startPlayback(m);
    });
    return true;
  }

  function demoFallbackOrError(m) {
    const idx = seedIdxOf(m);
    if (idx >= 0 && !demoFallbackBusy) {
      demoFallbackBusy = true;
      toast('外链播放失败，已改用内置示例旋律');
      playDemoFor(m, idx);
      return;
    }
    if (idx >= 0) return; // 兜底合成/播放进行中，静默等待结果
    toast('播放失败：网络链接可能已失效，或该歌曲为VIP付费歌曲');
  }
  // v3.9.x：onended 兜底——网易云 meting 外链某些流不触发 ended 事件（duration=Infinity
  // 或 chunked 流无 Content-Length），导致自动下一首/循环/随机全失效，只能手动切歌。
  // endedHandled 去重：ended 事件与 startProgress 的 checkAutoEnd 任一先到都只处理一次。
  let endedHandled = false;
  function handleEnded() {
    if (endedHandled) return;
    endedHandled = true;
    revokeObjectUrl();
    let handled = false;
    try { handled = maybeTAAutoAction(); } catch(e) {}
    if (!handled) next();
  }
  function checkAutoEnd() {
    if (!audio || endedHandled || audio.paused) return;
    if (audio.ended) { handleEnded(); return; }
    const d = audio.duration;
    if (!d || !isFinite(d)) {
      // 流式音频（duration=Infinity）：用 buffered 末尾兜底
      try {
        if (audio.buffered && audio.buffered.length > 0) {
          const end = audio.buffered.end(audio.buffered.length - 1);
          if (end > 1 && audio.currentTime >= end - 0.3) handleEnded();
        }
      } catch (e) {}
      return;
    }
    if (audio.currentTime > 0 && audio.currentTime >= d - 0.15) handleEnded();
  }
  // v3.9.x：MediaSession——通知栏/锁屏媒体控制条。播放时覆盖 bg-keep 的"后台保活"条，
  // 让用户在通知栏直接切歌/暂停；停止后 dispatch music-media-release 让 bg-keep 恢复
  function updateMediaSession(playing) {
    try {
      if (!('mediaSession' in navigator) || !navigator.mediaSession) return;
      const m = findTrack(currentId);
      if (!m) return;
      if (window.MediaMetadata) {
        const artwork = m.cover ? [{ src: m.cover, sizes: '512x512', type: 'image/jpeg' }] : [];
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: m.name || '未知歌曲',
          artist: m.artist || '未知歌手',
          album: 'Mochi 音乐',
          artwork: artwork
        });
      }
      try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch (e) {}
      try {
        navigator.mediaSession.setActionHandler('play', function () { try { toggle(); } catch (e) {} });
        navigator.mediaSession.setActionHandler('pause', function () { try { toggle(); } catch (e) {} });
        navigator.mediaSession.setActionHandler('nexttrack', function () { try { next(); } catch (e) {} });
        navigator.mediaSession.setActionHandler('previoustrack', function () { try { prev(); } catch (e) {} });
      } catch (e) {}
      try { window.__musicPlaying = playing; } catch (e) {}
    } catch (e) {}
  }
  function setupHandlers(m) {
    audio.onended = function () { handleEnded(); };
    audio.onerror = function () {
      // v3.5.112：网易云外链播放失败 → 若为内置种子歌曲，自动回退本地合成旋律；
      // 本地旋律也失败时不再递归（demoFallbackBusy 置位）
      // v3.6.x：onerror 可能被触发多次（不同错误码）——先尝试 https 直链重播，
      // 已重试/重试失败才走内置旋律兜底；兜底进行中后续 error 静默
      if (m && m.neteaseId && !httpsRetrying) {
        if (retryWithHttpsUrl(m)) return;
      }
      if (httpsRetrying) return; // 正在拉直链，等结果
      demoFallbackOrError(m);
    };
    audio.onloadedmetadata = function () {
      const dur = audio.duration || 0;
      const el = document.getElementById('sm-pb-dur');
      if (el) el.textContent = fmtDur(dur);
      if (m && dur) { m.duration = dur; saveLibrary(); updateDurUI(m.id, dur); }
      // v3.6.x：play() 曾被拒绝（自动播放策略/音频未就绪）→ 元数据就绪后补播一次，
      // 同样走 muted 静音解锁（直接 play 非手势仍会被拒）
      if (playRejected && currentId === m.id) {
        playRejected = false;
        try { audio.muted = true; } catch (e) {}
        const p2 = audio.play();
        if (p2 && p2.then) {
          p2.then(() => { if (audio) audio.muted = false; }).catch(() => {
            playRejected = true;
            try { syncPlayIcons(false); } catch (e) {}
            armAutoResume();
          });
        } else { armAutoResume(); }
      }
    };
    audio.onplay = function () { playRejected = false; clearStallGuard(); disarmAutoResume(); syncPlayIcons(true); try { if (navigator.mediaSession) navigator.mediaSession.playbackState = 'playing'; } catch (e) {} try { window.__musicPlaying = true; } catch (e) {} };
    audio.onpause = function () { syncPlayIcons(false); try { if (navigator.mediaSession) navigator.mediaSession.playbackState = 'paused'; } catch (e) {} try { window.__musicPlaying = false; } catch (e) {} };
  }
  function playTrack(id) {
    const m = findTrack(id);
    if (!m) return;
    // v3.6.x：重置 https 重试标记——_httpsRetried 在 retryWithHttpsUrl 里设 true 后
    // 永不重置，导致后续每次播放都先尝试失败的原始 URL 被混合内容拦截，
    // catch 不区分错误类型当"自动播放拦截"处理 → toast"被浏览器拦截"。
    // 每次新播放重置，允许重新尝试 meting URL
    if (m) m._httpsRetried = false;
    currentId = id;
    teardownAudio();
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    if (m.source === 'local' || (!m.url && m.source !== 'url')) {
      // 本地文件：从 IndexedDB 读取 Blob（新版）或 dataURL 字符串（旧版数据）
      const key = window.activePrefix() + ':music-file:' + m.id;
      const loadLocal = (v) => {
        // v3.5.129：守卫——异步加载期间用户已切到别的歌（currentId 变了）→ 丢弃本次结果，
        // 否则旧歌的 audio 会继续创建播放，出现两首歌同时响
        if (currentId !== m.id) return;
        if (!v) {
          // v3.5.107：内置示例旋律兜底——IDB 数据缺失/写入未完成时现场重新合成
          const idx = seedIdxOf(m);
          if (idx >= 0) {
            playDemoFor(m, idx);
            return;
          }
          toast('音乐文件加载失败，可能已被清理'); currentId = null; updatePlayerBar(); renderLibrary(); return;
        }
        // v3.6.x：统一转 Blob + 对象 URL 播放（兼容旧 dataURL 字符串 / 新 Blob 存储）
        playLocal(m, v);
      };
      if (window.idbGet) {
        window.idbGet(key).then(v => {
          if (currentId !== m.id) return; // 已切歌
          if (v === undefined || v === null) {
            const lsV = store.get('music-file:' + m.id);
            if (lsV) { loadLocal(lsV); return; }
            // v3.6.x：旧数据前缀兼容——联系人数据隔离改造前，本地歌存在
            // 「xy-home-v2:music-file:<id>」（旧 uid 前缀，无 :default）；新代码
            // 用 activePrefix 读不到 → 回退旧前缀，旧上传的本地歌仍能播
            const legacyKey = 'xy-home-v2:music-file:' + m.id;
            const legacyFallback = (v2) => {
              if (currentId !== m.id) return;
              if (v2 !== undefined && v2 !== null && v2 !== '') loadLocal(v2);
              else failLocal();
            };
            const failLocal = () => { toast('音乐文件加载失败，可能已被清理'); currentId = null; updatePlayerBar(); renderLibrary(); };
            const oldLs = localStorage.getItem(legacyKey);
            if (oldLs) { legacyFallback(oldLs); return; }
            if (window.activePrefix() !== 'xy-home-v2') {
              window.idbGet(legacyKey).then(legacyFallback).catch(() => legacyFallback(null));
              return;
            }
            // v3.5.123：刚上传（idbSet 异步未完成）就点播放的竞态——延迟重试一次
            setTimeout(() => {
              if (currentId !== m.id) return; // 已切歌
              window.idbGet(key).then(v2 => {
                if (currentId !== m.id) return; // 已切歌
                if (v2 !== undefined && v2 !== null) loadLocal(v2);
                else failLocal();
              });
            }, 600);
          } else loadLocal(v);
        });
      } else {
        loadLocal(store.get('music-file:' + m.id));
      }
      return;
    }
    audio = new Audio();
    // v3.5.118：网易云外链防盗链（带 Referer 时返回 403 无法播放）——
    // 设置 referrerPolicy=no-referrer 让请求不带 Referer，原曲可直接播放
    try { audio.referrerPolicy = 'no-referrer'; } catch (e) {}
    audio.src = m.url;
    startPlayback(m);
  }
  function startProgress() {
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      if (!audio) return;
      checkAutoEnd();
      if (!audio.duration) return;
      if (audio.currentTime > 0) clearStallGuard();
      const cur = document.getElementById('sm-pb-cur');
      if (cur) cur.textContent = fmtDur(audio.currentTime);
      const fill = document.getElementById('sm-f-fill');
      if (fill) fill.style.width = Math.min(100, audio.currentTime / audio.duration * 100) + '%';
    }, 500);
  }
  function toggle() {
    if (!audio || !currentId) {
      const songs = library.filter(m => !m.playlistId || m.playlistId === 'default');
      if (songs.length) { playTrack(songs[0].id); return; }
      toast('音乐库还没有歌曲');
      return;
    }
    if (audio.paused) {
      // v3.6.x：按钮点击本身是用户手势，正常可播；个别浏览器仍拒 → muted 静音解锁
      const p = audio.play();
      if (p && p.catch) p.catch(() => {
        playRejected = true;
        try { audio.muted = true; } catch (e) {}
        const p2 = audio.play();
        if (p2 && p2.then) {
          p2.then(() => { if (audio) audio.muted = false; playRejected = false; try { syncPlayIcons(true); } catch (e) {} })
            .catch(() => {
              try { syncPlayIcons(false); } catch (e) {}
              toast('点击播放被浏览器拦截，请再点一下屏幕继续播放');
              armAutoResume();
            });
        } else { armAutoResume(); }
      });
    }
    else audio.pause();
  }
  // v3.5.129：来电联动——暂停音乐 + 隐藏悬浮小框（否则铃声和音乐同时响、
  // 悬浮小框 z-index 9999 会盖在通话面板上遮挡接听按钮）；通话结束恢复
  let callHoldPlaying = false;
  window.musicHoldForCall = function (hold) {
    try {
      const el = document.getElementById('sm-float');
      if (hold) {
        callHoldPlaying = !!(audio && !audio.paused);
        if (audio && !audio.paused) audio.pause();
        if (el) { el.dataset.callHold = el.hidden ? '1' : '0'; el.hidden = true; }
      } else {
        if (callHoldPlaying && audio && currentId) {
          const p = audio.play();
          if (p && p.catch) p.catch(() => {
            // v3.6.x：通话结束恢复也是非手势播放，被拒时 muted 静音解锁
            playRejected = true;
            try { audio.muted = true; } catch (e) {}
            const p2 = audio.play();
            if (p2 && p2.then) {
              p2.then(() => { if (audio) audio.muted = false; playRejected = false; try { syncPlayIcons(true); } catch (e) {} })
                .catch(() => { try { if (audio) audio.muted = false; } catch (e) {} try { syncPlayIcons(false); } catch (e) {} armAutoResume(); try { toast('点一下屏幕即可恢复音乐播放'); } catch (e) {} });
            } else { armAutoResume(); }
          });
        }
        callHoldPlaying = false;
        if (el && el.dataset.callHold === '0') { el.hidden = false; delete el.dataset.callHold; }
        else if (el) delete el.dataset.callHold;
      }
    } catch (e) {}
  };
  function playableList() {
    // 当前歌曲所在歌单优先，否则默认列表
    const m = findTrack(currentId);
    let list = library.filter(x => x.playlistId === (m ? m.playlistId : 'default'));
    if (!list.length) list = library.slice();
    return list;
  }
  function next() {
    const list = playableList();
    if (!list.length) return;
    let idx = list.findIndex(x => x.id === currentId);
    let nid;
    if (mode === 'single') nid = currentId;
    else if (mode === 'shuffle') nid = list[Math.floor(Math.random() * list.length)].id;
    else {
      idx = idx < 0 ? -1 : idx;
      nid = list[(idx + 1) % list.length].id;
    }
    playTrack(nid);
  }
  function prev() {
    const list = playableList();
    if (!list.length) return;
    const idx = list.findIndex(x => x.id === currentId);
    // v3.6.x：当前歌不在可播列表（idx=-1）时取最后一首，而不是 (idx-1+len)%len=len-2 的倒数第二首
    if (idx < 0) { playTrack(list[list.length - 1].id); return; }
    playTrack(list[(idx - 1 + list.length) % list.length].id);
  }
  function cycleMode() {
    const order = ['list', 'shuffle', 'single'];
    mode = order[(order.indexOf(mode) + 1) % order.length];
    const label = { list: '顺序播放', shuffle: '随机播放', single: '单曲循环' }[mode];
    toast(label);
    updateModeIcon();
    saveSettings();
  }
  function updateModeIcon() {
    const paths = {
      list: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
      shuffle: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
      single: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M9.5 8.5h5"/>'
    };
    document.querySelectorAll('#sm-mode-ico').forEach(el => { el.innerHTML = paths[mode] || paths.list; });
  }
  function syncPlayIcons(playing) {
    const playPath = playing
      ? '<path d="M7 5.5h3.5v13H7zM13.5 5.5H17v13h-3.5z"/>'
      : '<path d="M8 5.5v13l11-6.5z"/>';
    ['sm-play-ico', 'sm-f-play-ico'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = playPath;
    });
    // 桌面小部件
    const wi = document.getElementById('mw-play-ico');
    if (wi) wi.innerHTML = playing
      ? '<path d="M7 5.5h3.5v13H7zM13.5 5.5H17v13h-3.5z"/>'
      : '<path d="M8 5.5v13l11-6.5z"/>';
    const bars = document.getElementById('mw-bars');
    if (bars) bars.classList.toggle('playing', playing);
  }
  function updatePlayerBar() {
    const bar = document.getElementById('sm-player-bar');
    const m = findTrack(currentId);
    if (!bar) return;
    bar.hidden = !m;
    if (!m) return;
    document.getElementById('sm-pb-name').textContent = m.name || '未知歌曲';
    document.getElementById('sm-pb-artist').textContent = m.artist || '';
    document.getElementById('sm-pb-dur').textContent = fmtDur(m.duration);
    document.getElementById('sm-pb-cur').textContent = '00:00';
    syncPlayIcons(audio && !audio.paused);
    updateModeIcon();
    // 桌面小部件同步
    const wSong = document.getElementById('mw-song');
    const wArtist = document.getElementById('mw-artist');
    if (wSong) wSong.textContent = m.name || '未知歌曲';
    if (wArtist) wArtist.textContent = m.artist || '';
    setWidgetCover(m);
    renderFloat();
  }

  // ================= 桌面小部件封面（网易云专辑图） =================
  function setWidgetCover(m) {
    const cover = document.getElementById('mw-cover');
    if (!cover) return;
    // 决定显示哪张封面：模式为 playlist 时优先显示当前歌曲所在歌单的封面，无则回退歌曲封面
    let coverUrl = '';
    if (m) {
      if (settings.widgetCoverMode === 'playlist') {
        const pl = playlists.find(p => p.id === m.playlistId);
        if (pl && pl.cover) coverUrl = pl.cover;
        else if (m.cover) coverUrl = m.cover;
      } else if (m.cover) {
        coverUrl = m.cover;
      }
    }
    if (coverUrl) {
      cover.style.backgroundImage = 'url("' + coverUrl + '")';
      cover.style.backgroundSize = 'cover';
      cover.style.backgroundPosition = 'center';
      cover.classList.add('has-cover');
    } else {
      cover.style.backgroundImage = '';
      cover.style.backgroundSize = '';
      cover.style.backgroundPosition = '';
      cover.classList.remove('has-cover');
    }
    // 没有歌曲封面时异步拉取（仅网易云链接歌曲）；拉到后刷新（若模式为 playlist 且歌单有封面，刷新后仍显示歌单封面）
    if (m && m.neteaseId && !m.cover) {
      fetchNeteaseInfo(String(m.neteaseId), (info) => {
        const mm = findTrack(m.id);
        if (mm && info && info.pic) {
          mm.cover = info.pic;
          saveLibrary();
          setWidgetCover(mm);
          renderPage();
        }
      });
    }
  }

  // ================= 悬浮小框 =================
  function isFloatOn() { return settings.floatEn && !floatClosed && currentId && audio; }
  function renderFloat() {
    const el = document.getElementById('sm-float');
    if (!el) return;
    const m = findTrack(currentId);
    el.hidden = !(settings.floatEn && !floatClosed && currentId && audio && m);
    if (!m) return;
    document.getElementById('sm-f-name').textContent = (m.name || '未知歌曲') + (m.artist ? ' · ' + m.artist : '');
    syncPlayIcons(audio && !audio.paused);
    syncHeartIcons();
  }
  // v3.7.x：聊天设置「音乐悬浮小窗」开关钩子——读写同一 floatEn 状态（music-global，
  // 每桌面独立）。chat-settings.js 加载早于本文件，运行时调用；与音乐页 #music-float-en、
  // 音乐设置 #sm-set-float 完全同源（复用 saveSettings/syncFloatToggle/renderFloat 流程）。
  window.musicFloatGet = function () { return !!settings.floatEn; };
  window.musicFloatSet = function (en) {
    settings.floatEn = !!en;
    floatClosed = false;
    saveSettings();
    syncFloatToggle();
    renderFloat();
  };
  // ================= 收藏（我的收藏：桌面部件/悬浮小框/音乐页列表 共用） =================
  function favIds() {
    try { return JSON.parse(store.get('music-favs') || '[]'); } catch (e) { return []; }
  }
  function saveFavIds(list) { store.set('music-favs', JSON.stringify(list)); }
  function isFav(id) { return favIds().indexOf(id) >= 0; }
  function toggleFav(id) {
    const list = favIds();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.unshift(id);
    saveFavIds(list);
    syncHeartIcons();
    renderFavList();
    return i < 0;
  }
  // 同步所有爱心（桌面部件 / 悬浮小框 / 音乐页底部播放栏）
  function syncHeartIcons() {
    const m = findTrack(currentId);
    const liked = m ? isFav(m.id) : false;
    const hb = document.getElementById('mw-heart');
    if (hb) hb.classList.toggle('liked', liked);
    const fh = document.getElementById('sm-f-heart');
    if (fh) fh.classList.toggle('liked', liked);
    const pb = document.getElementById('sm-pb-heart');
    if (pb) pb.classList.toggle('liked', liked);
  }
  // 我的收藏列表
  function renderFavList() {
    const el = document.getElementById('music-fav-list');
    if (!el) return;
    const ids = favIds();
    const songs = ids.map(id => findTrack(id)).filter(Boolean);
    el.innerHTML = songs.length
      ? songs.map(m => {
          const active = m.id === currentId;
          return '<div class="sm-song' + (active ? ' active' : '') + '" data-id="' + m.id + '">' +
            songIcoHtml(m) +
            '<div class="sm-song-info"><div class="sm-song-name">' + esc(m.name || '未知歌曲') + '</div>' +
            '<div class="sm-song-sub">' + esc(m.artist || '未知歌手') + '</div></div>' +
            '<button class="sm-song-more" data-id="' + m.id + '" title="取消收藏"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0112 7.1a4.9 4.9 0 017.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/></svg></button>' +
            '</div>';
        }).join('')
      : '<div class="ta-empty">还没有收藏歌曲，播放时点击爱心收藏</div>';
    el.querySelectorAll('.sm-song').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.sm-song-more')) return;
        playTrack(row.dataset.id);
      });
    });
    el.querySelectorAll('.sm-song-more').forEach(b => {
      b.addEventListener('click', () => {
        toggleFav(b.dataset.id);
        toast('已取消收藏');
      });
    });
  }
  function syncFloatToggle() {
    const cb = document.getElementById('music-float-en');
    if (cb) cb.checked = settings.floatEn;
  }
  function setupFloatDrag() {
    const el = document.getElementById('sm-float');
    if (!el) return;
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect();
      ox = r.left; oy = r.top;
      document.body.style.cursor = 'move';
      const onMove = (ev) => {
        if (!dragging) return;
        ev.preventDefault();
        let x = ox + (ev.clientX - sx), y = oy + (ev.clientY - sy);
        x = Math.max(4, Math.min(window.innerWidth - el.offsetWidth - 4, x));
        y = Math.max(4, Math.min(window.innerHeight - el.offsetHeight - 4, y));
        el.style.left = x + 'px';
        el.style.top = y + 'px';
      };
      const onUp = () => {
        dragging = false;
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        store.set('music-float-pos', JSON.stringify({ left: el.style.left, top: el.style.top }));
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    // 触屏拖动
    el.addEventListener('touchstart', (e) => {
      if (e.target.closest('button')) return;
      const t = e.touches[0];
      dragging = true;
      sx = t.clientX; sy = t.clientY;
      const r = el.getBoundingClientRect();
      ox = r.left; oy = r.top;
      const onMove = (ev) => {
        if (!dragging) return;
        ev.preventDefault();
        const t2 = ev.touches[0];
        let x = ox + (t2.clientX - sx), y = oy + (t2.clientY - sy);
        x = Math.max(4, Math.min(window.innerWidth - el.offsetWidth - 4, x));
        y = Math.max(4, Math.min(window.innerHeight - el.offsetHeight - 4, y));
        el.style.left = x + 'px';
        el.style.top = y + 'px';
      };
      const onUp = () => {
        dragging = false;
        el.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        store.set('music-float-pos', JSON.stringify({ left: el.style.left, top: el.style.top }));
      };
      el.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }, { passive: true });
    // 恢复上次位置
    try {
      const pos = JSON.parse(store.get('music-float-pos') || 'null');
      if (pos && pos.left && pos.top) { el.style.left = pos.left; el.style.top = pos.top; }
    } catch(e) {}
  }

  // ================= 梦角邀请听歌记录 =================
  // 记录：TA 邀请一起听歌（接受/拒绝）、TA 切歌/随机挑歌、TA 换播放模式
  function addRecord(trackId, triggerType) {
    const m = findTrack(trackId);
    // v3.9.x：冗余存 cover——历史记录独立显示封面，歌曲之后被删/换封面不影响已产生的记录
    history.push({ id: 'smh_' + Date.now(), trackId: trackId, trackName: m ? (m.name || '未知歌曲') : '未知歌曲', cover: m ? (m.cover || '') : '', triggerType: triggerType, ts: Date.now() });
    if (history.length > 500) history = history.slice(-500);
    saveHistory();
    renderHistory();
  }
  // TA 换播放模式记录
  function addModeRecord(modeLabel) {
    history.push({ id: 'smh_' + Date.now(), trackId: '', trackName: '', triggerType: 'TA 把播放模式换成' + modeLabel, mode: true, ts: Date.now() });
    if (history.length > 500) history = history.slice(-500);
    saveHistory();
    renderHistory();
  }

  // ================= 音乐管理（编辑/删除） =================
  function openSongMenu(id) {
    const m = findTrack(id);
    if (!m) return;
    if (!window.openTCPanel) return;
    const plOpts = playlists.map(p => '<option value="' + p.id + '"' + (m.playlistId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
    window.openTCPanel('管理音乐', '' +
      // v3.6.x：回填值做属性级转义——歌名/歌手含 " 会提前闭合 value 属性破坏表单（esc 只转义 <）
      '<div class="sm-fld"><label>歌曲名称</label><input class="tc-input" id="sm-e-name" value="' + String(m.name || '').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"></div>' +
      '<div class="sm-fld"><label>歌手</label><input class="tc-input" id="sm-e-artist" value="' + String(m.artist || '').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"></div>' +
      '<div class="sm-fld"><label>所属歌单</label><select class="tc-input" id="sm-e-pl"><option value="default">我的音乐库</option>' + plOpts + '</select></div>' +
      '<div class="sm-fld"><label>歌曲封面</label>' +
      '<div class="sm-cov-row">' +
      '<div class="sm-cov-prev' + (m.cover ? ' has-cov' : '') + '" id="sm-e-cov-prev"' + (m.cover ? ' style="background-image:url(\'' + esc(m.cover) + '\')"' : '') + ' title="点击上传封面"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg></div>' +
      '<div class="sm-cov-actions"><button class="cc-tool sm-cov-btn" id="sm-e-cov-up">上传封面</button><button class="cc-tool sm-cov-btn" id="sm-e-cov-clear"' + (m.cover ? '' : ' hidden') + '>清除封面</button></div>' +
      '</div></div>' +
      '<div class="mail-actions"><button class="cc-tool" id="sm-e-del">删除</button><button class="cc-tool" id="sm-e-cancel">取消</button><button class="cc-tool" id="sm-e-ok">保存</button></div>');
    // 自定义封面：上传（压缩到 512px 存 dataURL）/ 清除，保存到 m.cover（桌面部件/列表同步显示）
    const covPrev = document.getElementById('sm-e-cov-prev');
    const covUp = document.getElementById('sm-e-cov-up');
    const covClear = document.getElementById('sm-e-cov-clear');
    const covInput = document.createElement('input');
    covInput.type = 'file';
    covInput.accept = 'image/*';
    covInput.style.display = 'none';
    document.body.appendChild(covInput);
    covInput.onchange = function () {
      const f = covInput.files && covInput.files[0];
      covInput.value = '';
      if (!f) return;
      compressCover(f, function (dv) {
        if (!dv) { toast('封面读取失败，请换一张图片'); return; }
        m.cover = dv;
        saveLibrary();
        renderPage();
        covPrev.classList.add('has-cov');
        covPrev.style.backgroundImage = 'url(\'' + dv + '\')';
        covClear.hidden = false;
        toast('封面已设置');
      });
    };
    const pickCover = () => { try { covInput.click(); } catch (e) {} };
    if (covUp) covUp.addEventListener('click', pickCover);
    if (covPrev) covPrev.addEventListener('click', pickCover);
    if (covClear) covClear.addEventListener('click', () => {
      m.cover = '';
      saveLibrary();
      renderPage();
      covPrev.classList.remove('has-cov');
      covPrev.style.backgroundImage = '';
      covClear.hidden = true;
      toast('已清除封面');
    });
    document.getElementById('sm-e-cancel').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
    document.getElementById('sm-e-ok').addEventListener('click', () => {
      m.name = (document.getElementById('sm-e-name').value || '').trim() || m.name;
      m.artist = (document.getElementById('sm-e-artist').value || '').trim();
      m.playlistId = document.getElementById('sm-e-pl').value;
      saveLibrary();
      document.getElementById('tc-mask').hidden = true;
      renderPage();
      toast('已保存');
    });
    document.getElementById('sm-e-del').addEventListener('click', () => {
      if (window.openModal) {
        window.openModal('删除这首音乐？', '', () => {
          library = library.filter(x => x.id !== id);
          if (window.idbGetAllKeys) {
            window.idbGetAllKeys().then(keys => {
              // v3.5.123：全等匹配（前缀匹配在 id 互为前缀时会误删）
              keys.filter(k => k === window.activePrefix() + ':music-file:' + id).forEach(k => {
                if (window.idbDelete) window.idbDelete(k);
              });
            });
          }
          if (currentId === id) { teardownAudio(); currentId = null; }
          saveLibrary();
          document.getElementById('tc-mask').hidden = true;
          renderPage();
          toast('已删除');
        }, { noInput: true });
      }
    });
  }

  // ================= TA 互动：请求一起听歌 =================
  // 聊天回复完成后由 chat.js 调用（延后 2 秒，仿星言）
  window.maybeMusicRequest = function () {
    try {
      const prob = (typeof settings.reqProb === 'number' ? settings.reqProb : 5);
      console.log('[music-req] called', { libLen: library.length, cooldownAt: cooldownAt, cooldownMs: settings.cooldownMs, reqProb: settings.reqProb, prob: prob, now: Date.now() });
      if (!library.length) { console.log('[music-req] return: library empty'); return; }
      const now = Date.now();
      if (now - cooldownAt < settings.cooldownMs) { console.log('[music-req] return: cooldown', { remain: settings.cooldownMs - (now - cooldownAt) }); return; }
      if (Math.random() * 100 >= prob) { console.log('[music-req] return: prob miss', { prob: prob }); return; }
      console.log('[music-req] TRIGGER');
      cooldownAt = now;
      const candidates = library.slice();
      if (!candidates.length) return;
      const track = candidates[Math.floor(Math.random() * candidates.length)];
      // 多桌面：弹窗期间切换联系人后点按钮会把接受/拒绝写到新桌面 → 捕获 cid 校验
      const myCid = window.__activeCid || 'default';
      reqData = { trackId: track.id };
      taActive = true;
      const name = partnerName();
      const trackName = track.name || '未知歌曲';
      const artist = track.artist ? ' - ' + track.artist : '';
      if (window.chatAddSystem) window.chatAddSystem(name + ' 想和你一起听《' + trackName + '》' + artist);
      if (window.openTCPanel) {
        window.openTCPanel('音乐', '' +
          '<div class="sm-req">' +
          '<div class="sm-req-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>' +
          '<div class="sm-req-hint">' + name + ' 想和你一起听：</div>' +
          '<div class="sm-req-name">《' + esc(trackName) + '》</div>' +
          '</div>' +
          '<div class="mail-actions"><button class="cc-tool" id="sm-req-no">稍后</button><button class="cc-tool" id="sm-req-yes">一起听</button></div>');
        document.getElementById('sm-req-no').addEventListener('click', () => {
          document.getElementById('tc-mask').hidden = true;
          if ((window.__activeCid || 'default') !== myCid) { reqData = null; return; }
          reqData = null;
          // 记录：TA 邀请听歌（拒绝）
          history.push({ id: 'smh_' + Date.now(), trackId: '', trackName: '', triggerType: '拒绝了 TA 的听歌邀请《' + esc(trackName) + '》', rejected: true, ts: Date.now() });
          if (history.length > 500) history = history.slice(-500);
          saveHistory(); renderHistory();
          if (window.chatAddSystem) window.chatAddSystem('你拒绝了 ' + name + ' 的听歌邀请');
        });
        document.getElementById('sm-req-yes').addEventListener('click', () => {
          document.getElementById('tc-mask').hidden = true;
          if ((window.__activeCid || 'default') !== myCid) { reqData = null; return; }
          if (!reqData) return;
          playTrack(reqData.trackId);
          addRecord(reqData.trackId, '接受了 TA 的听歌邀请');
          if (window.chatAddSystem) window.chatAddSystem('你接受了 ' + name + ' 的听歌邀请，一起听《' + (track.name || '未知歌曲') + '》');
          reqData = null;
          toast('开始播放');
        });
      }
    } catch (e) {}
  };
  // 歌曲结束：TA 可能接动作（切歌/随机/换模式）
  function maybeTAAutoAction() {
    if (!taActive || !currentId) return false;
    // v3.6.x：记录结束的这首歌——延迟抢播回调必须校验 currentId 仍是它，
    // 否则只要播放器还活跃（currentId 恒非 null），用户 300ms 内手动切歌也会被 TA 抢播覆盖
    const endedId = currentId;
    // 加权：继续 70 / 下一首 15 / 随机 10 / 换模式 5
    const r = Math.random() * 100;
    const name = partnerName();
    if (r < 70) {
      // 继续（正常切下一首）
      return false;
    }
    if (r < 85) {
      const list = playableList();
      if (list.length > 1) {
        const others = list.filter(x => x.id !== currentId);
        const t = others[Math.floor(Math.random() * others.length)];
        if (window.chatAddSystem) window.chatAddSystem(name + ' 切到了下一首《' + (t.name || '未知歌曲') + '》');
        addRecord(t.id, 'TA 切到了下一首');
        // v3.5.129：延迟回调校验 currentId——期间用户手动切了歌就不再抢播
        setTimeout(() => { if (currentId === endedId) playTrack(t.id); }, 300);
        return true;
      }
      return false;
    }
    if (r < 95) {
      const list = playableList();
      if (list.length > 1) {
        const t = list[Math.floor(Math.random() * list.length)];
        if (window.chatAddSystem) window.chatAddSystem(name + ' 随机挑了一首《' + (t.name || '未知歌曲') + '》');
        addRecord(t.id, 'TA 随机挑了一首');
        setTimeout(() => { if (currentId === endedId) playTrack(t.id); }, 300);
        return true;
      }
      return false;
    }
    cycleMode();
    const modeLabel = { list: '顺序播放', shuffle: '随机播放', single: '单曲循环' }[mode];
    if (window.chatAddSystem) window.chatAddSystem(name + ' 把播放模式换成了' + modeLabel);
    addModeRecord(modeLabel);
    return false;
  }

  // ================= 星音设置 =================
  // v3.6.x：音乐本地缓存统计与清理——音频文件本体存 IndexedDB（music-file:<id>），
  // 这里按 IDB 键名统计占用、提供一键清理（删本地音频 + 移出歌单，外链/种子歌保留）
  function MUSIC_FILE_PREFIX() { return window.activePrefix() + ':music-file:'; }
  // 统计本地音频缓存字节数（分批读，读完即弃，内存峰值=单批；失败返回 -1）
  function calcStorageBytes() {
    if (!window.idbGetAllKeys) return Promise.resolve(-1);
    return window.idbGetAllKeys().then(keys => {
      const fileKeys = keys.filter(k => k.indexOf(MUSIC_FILE_PREFIX()) === 0);
      if (!fileKeys.length) return 0;
      const BATCH = 20;
      function readBatch(i) {
        if (i >= fileKeys.length) return Promise.resolve(0);
        return window.idbGetMany(fileKeys.slice(i, i + BATCH)).then(map => {
          let total = 0;
          fileKeys.slice(i, i + BATCH).forEach(k => {
            const v = map[k];
            // v3.6.x：新版存 Blob（v.size 即真实字节）；旧版存 base64 字符串（字符数 ×0.75 ≈ 真实字节）
            if (v instanceof Blob) total += v.size;
            else if (typeof v === 'string') total += v.length * 0.75;
          });
          return readBatch(i + BATCH).then(sub => total + sub);
        });
      }
      return readBatch(0);
    }).catch(() => -1);
  }
  function fmtStorageMB(bytes) {
    if (bytes < 0) return '计算失败';
    if (!bytes) return '0 MB';
    // v3.6.x：bytes 已是真实字节（Blob 原大小 / base64 已换算），直接除 1024²
    const mb = bytes / 1048576;
    return (mb < 0.01 ? '0.01' : mb.toFixed(1)) + ' MB';
  }
  function refreshStorageUse() {
    const el = document.getElementById('sm-storage-use');
    if (!el) return;
    el.textContent = '计算中…';
    calcStorageBytes().then(b => { const e = document.getElementById('sm-storage-use'); if (e) e.textContent = fmtStorageMB(b); });
  }
  // 一键清理：删 music-file:<id> 音频文件；非种子歌曲从歌单移除（外链/种子歌保留）
  function clearLocalAudioCache() {
    if (!window.idbGetAllKeys || !window.idbDelete) { toast('当前环境不支持清理'); return; }
    window.idbGetAllKeys().then(keys => {
      const fileKeys = keys.filter(k => k.indexOf(MUSIC_FILE_PREFIX()) === 0);
      if (!fileKeys.length) { toast('没有本地音频缓存'); refreshStorageUse(); return; }
      const delIds = [];       // 要移除的歌曲 id（非种子，音频删了歌也播不了）
      const cacheOnly = [];    // 种子歌的本地旋律缓存键（可再生成，只删缓存不动歌）
      fileKeys.forEach(k => {
        const id = k.slice(MUSIC_FILE_PREFIX().length);
        const m = library.find(x => x.id === id);
        if (m && seedIdxOf(m) >= 0) cacheOnly.push(k);
        else delIds.push(id);
      });
      window.openModal('将删除 ' + fileKeys.length + ' 个本地音频文件，并从歌单移除 ' + delIds.length + ' 首本地歌曲（外链歌曲不受影响）。确定清理？', '', () => {
        let p = Promise.resolve(true);
        fileKeys.forEach(k => { p = p.then(() => window.idbDelete(k)); });
        p.then(() => {
          if (delIds.length) {
            library = library.filter(m => !delIds.includes(m.id));
            if (currentId && delIds.includes(currentId)) { teardownAudio(); currentId = null; }
            saveLibrary();
          }
          if (audio) updatePlayerBar();
          renderFloat();
          refreshStorageUse();
          toast('已清理本地音频缓存');
        });
      }, { noInput: true });
    });
  }
  function openSettings() {
    if (!window.openTCPanel) return;
    const cooldownOpts = [
      { v: '0', label: '无冷却' },
      { v: '300000', label: '5 分钟' },
      { v: '600000', label: '10 分钟' }
    ].map(o => '<option value="' + o.v + '"' + (String(settings.cooldownMs) === o.v ? ' selected' : '') + '>' + o.label + '</option>').join('');
    window.openTCPanel('音乐设置', '' +
      '<div class="sm-set-row"><span>悬浮播放小框</span><label class="toggle"><input type="checkbox" id="sm-set-float"' + (settings.floatEn ? ' checked' : '') + '><span class="tk"></span></label></div>' +
      '<div class="gs-row"><span>音乐请求触发概率</span><div class="stepper" id="sm-set-prob" data-min="0" data-max="30" data-step="5"><button class="stp-min">−</button><input class="stp-val" id="sm-set-prob-val" readonly><button class="stp-max">+</button></div></div>' +
      '<div class="gs-row"><span>请求冷却时间</span><select class="tc-input" id="sm-set-cool" style="width:110px">' + cooldownOpts + '</select></div>' +
      '<div class="gs-row"><span>桌面小组件封面</span><select class="tc-input" id="sm-set-wcov" style="width:120px"><option value="song"' + (settings.widgetCoverMode !== 'playlist' ? ' selected' : '') + '>歌曲封面</option><option value="playlist"' + (settings.widgetCoverMode === 'playlist' ? ' selected' : '') + '>歌单封面</option></select></div>' +
      '<div class="sm-set-hint">聊天过程中 TA 会按概率请求和你一起听歌；播放时右上角出现可拖动的悬浮小框</div>' +
      '<div class="sm-set-row"><span>本地音频缓存</span><span id="sm-storage-use" style="color:var(--muted);font-size:12px">计算中…</span></div>' +
      '<div class="mail-actions"><button class="cc-tool" id="sm-diag-req">诊断邀请</button><button class="cc-tool" id="sm-clear-cache">清理本地音频缓存</button><button class="cc-tool" id="sm-set-close">关闭</button></div>');
    document.getElementById('sm-set-close').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
    const diagBtn = document.getElementById('sm-diag-req');
    if (diagBtn) diagBtn.addEventListener('click', function () {
      const remain = Math.max(0, settings.cooldownMs - (Date.now() - cooldownAt));
      const lines = [
        '歌库: ' + library.length + ' 首',
        'maybeMusicRequest: ' + (typeof window.maybeMusicRequest),
        'reqProb: ' + settings.reqProb + ' → 实际 ' + (typeof settings.reqProb === 'number' ? settings.reqProb : 5) + '%',
        'cooldownMs: ' + settings.cooldownMs,
        '冷却剩余: ' + Math.ceil(remain / 1000) + ' s',
        'openTCPanel: ' + (typeof window.openTCPanel),
        'chatAddSystem: ' + (typeof window.chatAddSystem)
      ];
      window.openTCPanel('音乐邀请诊断', '<div class="sm-set-hint">' + lines.join('<br>') + '</div><div class="mail-actions"><button class="cc-tool" id="sm-diag-force">强制触发一次</button><button class="cc-tool" id="sm-diag-close">关闭</button></div>');
      document.getElementById('sm-diag-close').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
      document.getElementById('sm-diag-force').addEventListener('click', () => {
        document.getElementById('tc-mask').hidden = true;
        if (!library.length) { toast('library 为空，无法触发'); return; }
        const track = library[Math.floor(Math.random() * library.length)];
        reqData = { trackId: track.id };
        taActive = true;
        const name = partnerName();
        const trackName = track.name || '未知歌曲';
        const artist = track.artist ? ' - ' + track.artist : '';
        if (window.chatAddSystem) window.chatAddSystem(name + ' 想和你一起听《' + trackName + '》' + artist);
        if (window.openTCPanel) {
          window.openTCPanel('音乐', '<div class="sm-req"><div class="sm-req-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><div class="sm-req-hint">' + name + ' 想和你一起听：</div><div class="sm-req-name">《' + esc(trackName) + '》</div></div><div class="mail-actions"><button class="cc-tool" id="sm-req-no">稍后</button><button class="cc-tool" id="sm-req-yes">一起听</button></div>');
        }
      });
    });
    const clearBtn = document.getElementById('sm-clear-cache');
    if (clearBtn) clearBtn.addEventListener('click', clearLocalAudioCache);
    refreshStorageUse();
    const probVal = document.getElementById('sm-set-prob-val');
    if (probVal) probVal.value = settings.reqProb;
    const st = document.getElementById('sm-set-prob');
    if (st) {
      st.querySelector('.stp-min').addEventListener('click', () => {
        const cur = parseInt(probVal.value, 10) || 0;
        const nv = Math.max(0, cur - 5);
        probVal.value = nv; settings.reqProb = nv; saveSettings();
      });
      st.querySelector('.stp-max').addEventListener('click', () => {
        const cur = parseInt(probVal.value, 10) || 0;
        const nv = Math.min(30, cur + 5);
        probVal.value = nv; settings.reqProb = nv; saveSettings();
      });
    }
    const cool = document.getElementById('sm-set-cool');
    if (cool) cool.addEventListener('change', () => { settings.cooldownMs = Number(cool.value); saveSettings(); });
    const floatCb = document.getElementById('sm-set-float');
    if (floatCb) floatCb.addEventListener('change', () => { settings.floatEn = floatCb.checked; saveSettings(); syncFloatToggle(); renderFloat(); });
    const wcov = document.getElementById('sm-set-wcov');
    if (wcov) wcov.addEventListener('change', () => {
      settings.widgetCoverMode = wcov.value;
      saveSettings();
      const m = findTrack(currentId);
      if (m) setWidgetCover(m);
    });
  }

  // ================= 桌面小部件联动 =================
  function bindWidget() {
    const playBtn = document.getElementById('mw-play');
    const prevBtn = document.getElementById('mw-prev');
    const nextBtn = document.getElementById('mw-next');
    const heartBtn = document.getElementById('mw-heart');
    const bar = document.getElementById('mw-bar');
    const fill = document.getElementById('mw-fill');
    const knob = document.getElementById('mw-knob');
    const curEl = document.getElementById('mw-cur');
    const durEl = document.getElementById('mw-dur');
    if (playBtn) playBtn.addEventListener('click', toggle);
    if (prevBtn) prevBtn.addEventListener('click', prev);
    if (nextBtn) nextBtn.addEventListener('click', next);
    if (heartBtn) {
      heartBtn.addEventListener('click', () => {
        const m = findTrack(currentId);
        if (!m) { toast('请先播放一首歌'); return; }
        const liked = toggleFav(m.id);
        toast(liked ? '已收藏' : '已取消收藏');
      });
      syncHeartIcons();
    }
    // 悬浮小框收藏按钮
    const fHeart = document.getElementById('sm-f-heart');
    if (fHeart) {
      fHeart.addEventListener('click', () => {
        const m = findTrack(currentId);
        if (!m) { toast('请先播放一首歌'); return; }
        const liked = toggleFav(m.id);
        toast(liked ? '已收藏' : '已取消收藏');
      });
    }
    // 音乐页底部播放栏收藏按钮（v3.5.64）
    const pbHeart = document.getElementById('sm-pb-heart');
    if (pbHeart) {
      pbHeart.addEventListener('click', () => {
        const m = findTrack(currentId);
        if (!m) { toast('请先播放一首歌'); return; }
        const liked = toggleFav(m.id);
        toast(liked ? '已收藏' : '已取消收藏');
      });
      syncHeartIcons();
    }
    // 桌面进度条
    if (bar) {
      bar.addEventListener('click', (e) => {
        if (!audio || !audio.duration) return;
        const r = bar.getBoundingClientRect();
        audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
      });
    }
    if (fill && curEl && durEl && knob) {
      const iv = setInterval(() => {
        if (!audio || !audio.duration) return;
        const pct = audio.currentTime / audio.duration * 100;
        fill.style.width = pct + '%';
        knob.style.left = pct + '%';
        curEl.textContent = fmtDur(audio.currentTime);
        durEl.textContent = fmtDur(audio.duration);
      }, 500);
      window._mwProgressTimer = iv;
    }
    // 初始状态
    const wSong = document.getElementById('mw-song');
    if (wSong && !currentId) wSong.textContent = '未在播放';
    const wArtist = document.getElementById('mw-artist');
    if (wArtist && !currentId) wArtist.textContent = '音乐';
  }

  // ================= 页面入口 =================
  const musicApp = document.querySelector('.app[data-app="music"]');
  const musicPage = document.getElementById('page-music');
  if (musicApp && musicPage) {
    musicApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      musicPage.hidden = false;
      renderPage();
      // v3.9.x：打开音乐页时补探测缺失时长（覆盖本版本之前导入、时长还是 00:00 的旧歌曲）
      probeAllMissingDurations();
    });
  }
  const musicBack = document.getElementById('music-back');
  if (musicBack) {
    musicBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-phone');
      if (home) home.hidden = false;
    });
  }
  // tab 切换
  document.querySelectorAll('#page-music .fav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      curTab = tab.dataset.mtab;
      document.querySelectorAll('#page-music .fav-tab').forEach(x => x.classList.toggle('sel', x === tab));
      document.querySelectorAll('#page-music .cal-card').forEach(c => { c.hidden = c.dataset.mpanel !== curTab; });
      if (curTab === 'pl') renderPlaylists();
      if (curTab === 'fav') renderFavList();
      if (curTab === 'his') renderHistory();
    });
  });
  // 按钮
  const upBtn = document.getElementById('music-upload');
  if (upBtn) upBtn.addEventListener('click', triggerUpload);
  const urlBtn = document.getElementById('music-add-url');
  if (urlBtn) urlBtn.addEventListener('click', openAddUrl);
  const batchBtn = document.getElementById('music-batch');
  if (batchBtn) batchBtn.addEventListener('click', openBatch);
  const batchMgmt = document.getElementById('music-batch-manage');
  if (batchMgmt) batchMgmt.addEventListener('click', () => { if (musicBatch) exitBatch(); else enterBatch(); });
  const setBtn = document.getElementById('music-set');
  if (setBtn) setBtn.addEventListener('click', openSettings);
  // 播放器控制
  const playBtn = document.getElementById('sm-play');
  if (playBtn) playBtn.addEventListener('click', toggle);
  const modeBtn = document.getElementById('sm-mode');
  if (modeBtn) modeBtn.addEventListener('click', cycleMode);
  const prevBtn = document.getElementById('sm-prev');
  if (prevBtn) prevBtn.addEventListener('click', prev);
  const nextBtn = document.getElementById('sm-next');
  if (nextBtn) nextBtn.addEventListener('click', next);
  // 悬浮小框控制
  const fPlay = document.getElementById('sm-f-play');
  if (fPlay) fPlay.addEventListener('click', toggle);
  const fPrev = document.getElementById('sm-f-prev');
  if (fPrev) fPrev.addEventListener('click', prev);
  const fNext = document.getElementById('sm-f-next');
  if (fNext) fNext.addEventListener('click', next);
  const fToggle = document.getElementById('music-float-en');
  if (fToggle) {
    fToggle.addEventListener('change', () => {
      settings.floatEn = fToggle.checked;
      floatClosed = false;
      saveSettings();
      renderFloat();
    });
  }

  // ================= 初始化 =================
  // v3.9.x：loadAll 必须在 IndexedDB 回填完成后执行——music-library 可能是大键
  //（导入大量网易云歌单后 JSON >200KB）只进 IDB 不进 localStorage；若 loadAll 先于
  // idbRestore 执行，读到空会触发种子自愈并 saveLibrary 覆盖 IDB，导入的歌单刷新
  // 后永久丢失。故推迟到数据就绪（__mochiDataReady / mochi-restore-done）后再加载。
  function bootMusic() {
    loadAll();
    // 迁移：默认歌单里旧版占位名（网易云音乐-xxxx）→ 已知歌名/封面，其余异步识别；
    // 删除默认歌单第四首（28815250），第三首（2064961530）保留并异步识别歌名
    {
      const known = { 2613048732: { name: 'Moonlit Dream', artist: 'DLSS · shell（月光梦）', cover: 'https://p2.music.126.net/cXuoNwFzgFoQF7bGvC2mIQ==/109951169832660411.jpg' }, 27538343: { name: 'Baby', artist: 'EXO-K', cover: '' } };
      let changed = false;
      const before = library.length;
      library = library.filter(m => !(m.playlistId === 'spl_default' && (m.neteaseId === '28815250' || m.neteaseId === '2064961530')));
      if (library.length !== before) changed = true;
      library.forEach(m => {
        if (m.playlistId === 'spl_default' && m.neteaseId) {
          const k = known[m.neteaseId];
          if (k && (!m.name || m.name.indexOf('网易云音乐-') === 0)) {
            m.name = k.name; m.artist = k.artist; changed = true;
          }
          if (k && k.cover && !m.cover) { m.cover = k.cover; changed = true; }
        }
      });
      if (changed) saveLibrary();
      // 仍为占位名的默认歌单歌曲：异步识别
      library.forEach(m => {
        if (m.playlistId === 'spl_default' && m.neteaseId && m.name && m.name.indexOf('网易云音乐-') === 0) {
          fetchNeteaseInfo(String(m.neteaseId), (info) => {
            const mm = findTrack(m.id);
            if (mm && info && info.name) {
              mm.name = info.name;
              if (info.artist) mm.artist = info.artist;
              if (info.duration && !mm.duration) mm.duration = info.duration;
              saveLibrary();
              renderPage();
            }
          });
        }
      });
    }
    renderPage();
    // v3.9.x：对缺时长的网易云歌补探测——已导入的旧歌单 duration=0 已存库，
    // 仅修 referrerPolicy 不重新导入不会补；启动时后台探测，修后能成功并刷新 UI
    probeAllMissingDurations();
  }
  setupFloatDrag();
  bindWidget();
  if (window.__mochiDataReady) {
    bootMusic();
  } else {
    document.addEventListener('mochi-restore-done', function h() {
      document.removeEventListener('mochi-restore-done', h);
      bootMusic();
    });
  }

  // v3.6.x：多桌面——切换联系人后重新加载歌单/播放列表/历史（store 动态绑定，
  // loadAll 会读新桌面的 music-* 键），并停止正在播放的旧桌面歌曲（防止串桌面继续放）
  document.addEventListener('contact-switched', function () {
    try {
      if (audio) { try { audio.pause(); } catch (e) {} audio = null; }
      currentId = null;
      // 多桌面：TA 互动状态是模块级，残留会让新桌面误以为 TA 在一起听/冷却中/有待确认请求
      taActive = false;
      cooldownAt = 0;
      reqData = null;
      libFilter = 'all';
      loadAll();
      try { renderPage(); } catch (e) {}
      try { renderFloat(); } catch (e) {}
    } catch (e) {}
  });
})();
