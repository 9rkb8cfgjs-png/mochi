// ===== 功能：音乐（音乐库 / 歌单 / 听歌记录 / TA 互动 / 悬浮播放小框） =====
// 仿星言简约版【星音陪伴】：本地音频上传、网易云链接添加、批量导入、
// 歌单、听歌记录、TA 按概率请求一起听歌、歌曲结束 TA 可能接动作、悬浮小框可拖动
(function () {
  const uid = 'xy-home-v2';
  const store = window.xyStore(uid);
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }

  // ================= 数据 =================
  let library = [];          // {id,name,artist,url,source,duration,playlistId,addedAt}
  let playlists = [];        // {id,name,createdAt}
  let history = [];          // {id,trackId,trackName,triggerType,ts}
  let settings = { floatEn: true, reqProb: 5, cooldownMs: 600000 };
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
  function esc(s) { return String(s == null ? '' : s).replace(/</g, '&lt;'); }

  // ================= 存储 =================
  function saveLibrary() { saveArr('music-library', library); }
  function savePlaylists() { saveArr('music-playlists', playlists); }
  function saveHistory() { saveArr('music-history', history); }
  function saveSettings() { store.set('music-global', JSON.stringify(settings)); }
  function loadAll() {
    library = loadArr('music-library');
    playlists = loadArr('music-playlists');
    history = loadArr('music-history');
    try { settings = Object.assign({ floatEn: true, reqProb: 5, cooldownMs: 600000 }, JSON.parse(store.get('music-global') || '{}')); } catch(e) {}
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
        library.push({ id: id, neteaseId: String(s.id), name: s.name || '示例旋律-' + (i + 1), artist: s.artist || '', cover: s.cover || '', url: 'https://music.163.com/song/media/outer/url?id=' + s.id + '.mp3', source: 'url', duration: 0, playlistId: 'spl_default', addedAt: Date.now() });
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
    library.forEach(m => {
      const seedId = m ? String(m.neteaseId || '') : '';
      if (!m || !seedId || (seedId !== '2613048732' && seedId !== '27538343')) return;
      if (!m.url || m.url.indexOf('music.163.com') < 0) {
        m.url = 'https://music.163.com/song/media/outer/url?id=' + seedId + '.mp3';
        m.source = 'url';
        saveLibrary();
        // 清理可能残留的本地合成旋律数据
        try { if (window.idbDelete) window.idbDelete(uid + ':music-file:' + m.id); } catch (e) {}
      }
    });
  }

  // ================= 内置示例旋律：本地合成（无版权、不联网、永不失效） =================
  // 用 Web Audio 离线渲染一小段钢琴音色旋律，编码为 WAV dataURL 存入 IndexedDB
  function genDemoAudio(idx) {
    return new Promise((resolve) => {
      try {
        const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!AC) { resolve(''); return; }
        const sr = 22050;
        const ctx = new AC(1, sr * 14, sr);
        // 两段简单旋律（第一首小星星式上行，第二首欢快式）
        const notes = idx === 0
          ? [523,523,587,587,659,659,587,523,523,587,587,659,659,587,659,698,784,784,698,698,659,659,587]
          : [659,659,698,784,784,698,659,587,523,523,587,659,659,587,587,659,784,784,880,880,784,659,587];
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
        ctx.startRendering().then((buf) => {
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
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          resolve('data:audio/wav;base64,' + btoa(bin));
        }).catch(() => resolve(''));
      } catch (e) { resolve(''); }
    });
  }

  // ================= 网易云歌名/封面识别（多源兜底） =================
  // v3.5.117：内置已知歌曲（默认歌单这两首的元数据代理源已失效，命中直接返回，
  // 不再发起请求，避免控制台报错/加载失败）
  const KNOWN_NETEASE = {
    '27538343': { name: 'Baby', artist: 'EXO-K' },
    '2613048732': { name: 'Moonlit Dream', artist: 'DLSS / shell' }
  };
  function fetchNeteaseInfo(id, cb) {
    const known = KNOWN_NETEASE[String(id)];
    if (known) { cb({ name: known.name, artist: known.artist, pic: '' }); return; }
    const apis = [
      { url: 'https://api.injahow.cn/meting/?type=netease&id=' + id, isText: false, parse(d) {
          if (!d) return null;
          let name = d.name || d.title;
          if (!name) return null;
          let artist = d.artist;
          if (Array.isArray(artist)) artist = artist.map(a => (a && a.name) || a).join('/');
          else if (typeof artist !== 'string') artist = '';
          return { name: name, artist: artist, pic: d.pic || '' }; } },
      { url: 'https://meting.summerstack.dev/?type=netease&id=' + id, isText: false, parse(d) {
          if (!d) return null;
          let name = d.name || d.title;
          if (!name) return null;
          let artist = d.artist;
          if (Array.isArray(artist)) artist = artist.map(a => (a && a.name) || a).join('/');
          else if (typeof artist !== 'string') artist = '';
          return { name: name, artist: artist, pic: d.pic || '' }; } },
      { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://music.163.com/api/song/detail/?ids=' + id), isText: true, parse(t) {
          let d; try { d = typeof t === 'string' ? JSON.parse(t) : t; } catch(e) { return null; }
          if (d && d.songs && d.songs[0]) {
            const s = d.songs[0];
            const artist = (s.artists || []).map(a => a.name).join('/');
            return { name: s.name, artist: artist, pic: (s.album && s.album.picUrl) || '' };
          }
          return null; } },
      { url: 'https://corsproxy.io/?' + encodeURIComponent('https://music.163.com/api/song/detail/?ids=' + id), isText: true, parse(t) {
          let d; try { d = typeof t === 'string' ? JSON.parse(t) : t; } catch(e) { return null; }
          if (d && d.songs && d.songs[0]) {
            const s = d.songs[0];
            const artist = (s.artists || []).map(a => a.name).join('/');
            return { name: s.name, artist: artist, pic: (s.album && s.album.picUrl) || '' };
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

  // ================= 添加歌曲 =================
  // 本地上传（多个文件，存储到 IndexedDB）
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
    let pending = list.length;
    const oneDone = () => {
      pending--;
      if (pending <= 0) { saveLibrary(); renderPage(); toast('已上传 ' + list.length + ' 首音乐'); }
    };
    list.forEach(file => {
      if (file.size > 50 * 1024 * 1024) { toast('「' + file.name + '」超过 50MB，已跳过'); oneDone(); return; }
      const reader = new FileReader();
      reader.onload = function () {
        const dataUrl = reader.result;
        const id = 'sm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const name = file.name.replace(/\.[^.]+$/, '');
        const item = { id: id, name: name, artist: '', url: '', source: 'local', duration: 0, playlistId: 'default', addedAt: Date.now() };
        library.push(item);
        // 尝试读取时长（读不到也能播放）
        const tmp = document.createElement('audio');
        tmp.preload = 'metadata';
        tmp.onloadedmetadata = function () {
          const m = findTrack(id);
          if (m && tmp.duration) { m.duration = tmp.duration; saveLibrary(); }
          try { tmp.src = ''; tmp.load(); } catch(e) {}
          oneDone();
        };
        tmp.onerror = function () {
          try { tmp.src = ''; tmp.load(); } catch(e) {}
          oneDone();
        };
        tmp.src = dataUrl;
        if (window.idbSet) {
          window.idbSet(uid + ':music-file:' + id, dataUrl).then(() => { saveLibrary(); renderPage(); }).catch(() => {});
        } else {
          saveLibrary();
        }
      };
      reader.onerror = oneDone;
      reader.readAsDataURL(file);
    });
    toast('正在上传 ' + list.length + ' 首音乐…');
  }

  // 链接添加（网易云 ID / 直链）
  function openAddUrl() {
    if (!window.openTCPanel) return;
    window.openTCPanel('添加链接音乐', '' +
      '<div class="sm-form">' +
      '<div class="sm-fld"><label>歌曲名称</label><input class="tc-input" id="sm-url-name" placeholder="可留空，识别后自动补全"></div>' +
      '<div class="sm-fld"><label>歌手</label><input class="tc-input" id="sm-url-artist" placeholder="可留空"></div>' +
      '<div class="sm-fld"><label>网易云歌曲ID 或 音乐直链</label><input class="tc-input" id="sm-url-link" placeholder="如 2064961530"></div>' +
      '<div class="sm-fld-hint">直接填网易云歌曲数字 ID（如 2064961530）即自动导入；也可粘贴完整链接或 mp3 直链</div>' +
      '</div>' +
      '<div class="mail-actions"><button class="cc-tool" id="sm-url-cancel">取消</button><button class="cc-tool" id="sm-url-ok">确认添加</button></div>');
    document.getElementById('sm-url-cancel').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
    document.getElementById('sm-url-ok').addEventListener('click', () => {
      // v3.6.x：修复——原用 const 声明 name，第 307 行「名称留空时补全」对其重新赋值，
      // 会抛 TypeError（Assignment to constant variable），导致「链接音乐添加」整体失效
      let name = (document.getElementById('sm-url-name').value || '').trim();
      const artist = (document.getElementById('sm-url-artist').value || '').trim();
      const raw = (document.getElementById('sm-url-link').value || '').trim();
      if (!raw) { toast('请输入网易云ID或音乐链接'); return; }
      let neteaseId = '';
      if (/^\d+$/.test(raw)) neteaseId = raw;
      else {
        const idMatch = raw.match(/[?&]id=(\d+)/);
        if (idMatch) neteaseId = idMatch[1];
        else {
          const pathMatch = raw.match(/\/(\d+)(?:\.mp3)?$/);
          if (pathMatch) neteaseId = pathMatch[1];
        }
      }
      let url = raw;
      if (neteaseId) {
        url = 'https://music.163.com/song/media/outer/url?id=' + neteaseId + '.mp3';
        if (!name) name = '网易云音乐-' + neteaseId;
      }
      if (!/^(https?:\/\/|file:\/\/|data:|\/)/i.test(url)) { toast('请输入有效的ID或链接'); return; }
      const id = 'sm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      library.push({ id: id, neteaseId: neteaseId || '', name: name, artist: artist, url: url, source: 'url', duration: 0, playlistId: 'default', addedAt: Date.now() });
      saveLibrary();
      document.getElementById('tc-mask').hidden = true;
      renderPage();
      toast('链接音乐已添加');
      if (neteaseId) {
        fetchNeteaseInfo(neteaseId, info => {
          const m = findTrack(id);
          if (m && info && info.name) {
            m.name = info.name;
            if (info.artist) m.artist = info.artist;
            saveLibrary();
            renderPage();
            toast('已识别：' + info.name + (info.artist ? ' - ' + info.artist : ''));
          }
        });
      }
    });
  }

  // 批量导入（格式：歌曲名称 / 歌手 / 音乐直链URL，每首空一行）
  // v3.6.x：音乐直链URL 栏可直接填网易云数字 ID——自动拼装成网易云直链导入
  function openBatch() {
    if (!window.openTCPanel) return;
    window.openTCPanel('批量导入音乐', '' +
      '<div class="sm-fld-hint" style="margin-bottom:8px">按格式粘贴，每首歌空一行分隔。<br>「音乐直链URL」直接填网易云歌曲数字 ID 就行（如 2064961530），会自动导入：<br>歌曲名称：xxx<br>歌手：xxx<br>音乐直链URL：2064961530</div>' +
      '<textarea id="sm-batch-input" class="tc-input" rows="8" placeholder="歌曲名称：Baby&#10;歌手：EXO-K&#10;音乐直链URL：27538343&#10;&#10;歌曲名称：歌名2&#10;歌手：歌手2&#10;音乐直链URL：https://example.com/music2.mp3"></textarea>' +
      '<div class="mail-actions"><button class="cc-tool" id="sm-batch-cancel">取消</button><button class="cc-tool" id="sm-batch-ok">开始导入</button></div>');
    document.getElementById('sm-batch-cancel').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
    document.getElementById('sm-batch-ok').addEventListener('click', () => {
      const raw = (document.getElementById('sm-batch-input').value || '').trim();
      if (!raw) { toast('请输入内容'); return; }
      const blocks = raw.split(/\n\s*\n/);
      let added = 0;
      blocks.forEach(block => {
        const lines = block.split('\n').map(s => s.trim()).filter(Boolean);
        let name = '', artist = '', url = '';
        lines.forEach(line => {
          const sepMatch = line.match(/^([^:=]+?)(?:[:：＝=])\s*(.+)$/);
          if (!sepMatch) return;
          const key = sepMatch[1].replace(/\s+/g, '').toLowerCase();
          const val = sepMatch[2].trim();
          if (/^(歌曲名称|歌名|名称|name|歌曲)$/.test(key)) name = val;
          else if (/^(歌手|艺术家|艺人|artist|演唱)$/.test(key)) artist = val;
          else if (/^(音乐直链url|音乐直链|音乐链接|链接|直链|url|音乐url|link)$/.test(key)) url = val;
        });
        if (!url) return;
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
          url = 'https://music.163.com/song/media/outer/url?id=' + neteaseId + '.mp3';
          if (!name) name = '网易云音乐-' + neteaseId; // 只填数字时自动补默认名
        }
        if (!name) return;
        if (!/^(https?:\/\/|file:\/\/|data:|\/)/i.test(url)) return;
        const nid = 'sm_batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        library.push({ id: nid, neteaseId: neteaseId || '', name: name, artist: artist, url: url, source: 'url', duration: 0, playlistId: 'default', addedAt: Date.now() });
        added++;
        // v3.6.x：数字 ID 自动识别歌曲名（与「链接添加」一致，识别到后覆盖默认名）
        if (neteaseId) {
          fetchNeteaseInfo(neteaseId, info => {
            const mm = library.find(x => x.id === nid);
            if (mm && info && info.name) {
              mm.name = info.name;
              if (info.artist) mm.artist = info.artist;
              saveLibrary();
              renderPage();
            }
          });
        }
      });
      if (!added) { toast('没有识别到有效歌曲，请检查格式'); return; }
      saveLibrary();
      document.getElementById('tc-mask').hidden = true;
      renderPage();
      toast('已导入 ' + added + ' 首音乐');
    });
  }

  // ================= 歌单 =================
  function renderPlaylists() {
    const el = document.getElementById('music-pl-list');
    if (!el) return;
    const pls = playlists.slice();
    el.innerHTML = pls.map(p => {
      const count = library.filter(m => m.playlistId === p.id).length;
      return '<div class="sm-pl" data-pid="' + p.id + '">' +
        '<span class="sm-pl-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>' +
        '<div class="sm-pl-info"><div class="sm-pl-name">' + esc(p.name) + '</div><div class="sm-pl-sub">' + count + ' 首</div></div>' +
        '<button class="sm-pl-del" data-pid="' + p.id + '" title="删除歌单"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/></svg></button>' +
        '</div>';
    }).join('');
    el.querySelectorAll('.sm-pl').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.sm-pl-del')) return;
        const pid = row.dataset.pid;
        const pl = playlists.find(p => p.id === pid);
        const songs = library.filter(m => m.playlistId === pid);
        if (!pl || !window.openTCPanel) return;
        window.openTCPanel(esc(pl.name), songs.length
          ? songs.map(m => '<div class="sm-song" data-id="' + m.id + '">' +
              '<span class="sm-song-ico"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg></span>' +
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
  function renderLibrary() {
    const listEl = document.getElementById('music-lib-list');
    const emptyEl = document.getElementById('music-lib-empty');
    if (!listEl) return;
    const songs = library.filter(m => !m.playlistId || m.playlistId === 'default');
    if (emptyEl) emptyEl.hidden = songs.length > 0;
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
            '<span class="sm-song-ico"><svg viewBox="0 0 24 24" fill="currentColor">' + icon + '</svg></span>' +
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
        const ids = library.filter(m => !m.playlistId || m.playlistId === 'default').map(m => m.id);
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
                keys.filter(k => { for (const id of batchSel) if (k === uid + ':music-file:' + id) return true; return false; })
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
      ? h.map(x => '<div class="sm-his">' +
          '<span class="sm-his-ico">' + (x.mode
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>') + '</span>' +
          '<div class="sm-his-info"><div class="sm-his-name">' + (x.mode ? esc(x.triggerType || '播放模式') : esc(x.trackName || '未知歌曲')) + '</div>' +
          '<div class="sm-his-sub">' + fmtDT(x.ts) + (x.mode ? '' : (x.triggerType ? ' · ' + esc(x.triggerType) : '')) + '</div></div></div>').join('')
      : '<div class="ta-empty">还没有梦角邀请听歌记录，TA 邀请你一起听歌的记录会出现在这里</div>';
  }
  function renderPage() {
    renderLibrary();
    renderPlaylists();
    renderFavList();
    renderHistory();
    updatePlayerBar();
    syncFloatToggle();
  }

  // ================= 播放器 =================
  function teardownAudio() {
    if (audio) {
      try { audio.pause(); audio.onended = null; audio.onerror = null; audio.onloadedmetadata = null; audio.onplay = null; audio.onpause = null; audio.removeAttribute('src'); audio.load(); } catch(e) {}
      audio = null;
    }
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
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
      if (!d) { toast('播放失败：网络链接可能已失效'); demoFallbackBusy = false; return; }
      try { window.idbSet(uid + ':music-file:' + m.id, d); } catch (e) {}
      demoFallbackBusy = false;
      if (currentId !== m.id) return;
      teardownAudio();
      if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
      audio = new Audio();
      audio.src = d;
      startPlayback(m);
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
        // v3.6.x：安卓自动播放策略会拒绝非用户手势触发的 play()——不再静默吞掉，
        // 把播放图标回退为暂停态，避免「显示在播却无声」的假象
        try { syncPlayIcons(false); } catch (e) {}
      });
    }
    updatePlayerBar();
    renderLibrary();
    startProgress();
    addRecord(m.id, '');
  }
  function setupHandlers(m) {
    audio.onended = function () {
      let handled = false;
      try { handled = maybeTAAutoAction(); } catch(e) {}
      if (!handled) next();
    };
    audio.onerror = function () {
      // v3.5.112：网易云外链播放失败 → 若为内置种子歌曲，自动回退本地合成旋律；
      // 本地旋律也失败时不再递归（demoFallbackBusy 置位）
      const idx = seedIdxOf(m);
      if (idx >= 0 && !demoFallbackBusy) {
        demoFallbackBusy = true;
        toast('外链播放失败，已改用内置示例旋律');
        playDemoFor(m, idx);
        return;
      }
      toast('播放失败：网络链接可能已失效');
    };
    audio.onloadedmetadata = function () {
      const dur = audio.duration || 0;
      const el = document.getElementById('sm-pb-dur');
      if (el) el.textContent = fmtDur(dur);
      if (m && dur) { m.duration = dur; saveLibrary(); }
    };
    audio.onplay = function () { syncPlayIcons(true); };
    audio.onpause = function () { syncPlayIcons(false); };
  }
  function playTrack(id) {
    const m = findTrack(id);
    if (!m) return;
    currentId = id;
    teardownAudio();
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    if (m.source === 'local' || (!m.url && m.source !== 'url')) {
      // 本地文件：从 IndexedDB 读取 dataURL
      const key = uid + ':music-file:' + m.id;
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
        audio = new Audio();
        audio.src = v;
        startPlayback(m);
      };
      if (window.idbGet) {
        window.idbGet(key).then(v => {
          if (currentId !== m.id) return; // 已切歌
          if (v === undefined || v === null) {
            const lsV = store.get('music-file:' + m.id);
            if (lsV) { loadLocal(lsV); return; }
            // v3.5.123：刚上传（idbSet 异步未完成）就点播放的竞态——延迟重试一次
            setTimeout(() => {
              if (currentId !== m.id) return; // 已切歌
              window.idbGet(key).then(v2 => {
                if (currentId !== m.id) return; // 已切歌
                if (v2 !== undefined && v2 !== null) loadLocal(v2);
                else { toast('音乐文件加载失败，可能已被清理'); currentId = null; updatePlayerBar(); renderLibrary(); }
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
      if (!audio || !audio.duration) return;
      const cur = document.getElementById('sm-pb-cur');
      if (cur) cur.textContent = fmtDur(audio.currentTime);
      // 悬浮小框进度
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
      const p = audio.play();
      if (p && p.catch) p.catch(() => { try { syncPlayIcons(false); } catch (e) {} });
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
          if (p && p.catch) p.catch(() => { try { syncPlayIcons(false); } catch (e) {} });
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
    if (m && m.cover) {
      cover.style.backgroundImage = 'url("' + m.cover + '")';
      cover.style.backgroundSize = 'cover';
      cover.style.backgroundPosition = 'center';
      cover.classList.add('has-cover');
    } else {
      cover.style.backgroundImage = '';
      cover.style.backgroundSize = '';
      cover.style.backgroundPosition = '';
      cover.classList.remove('has-cover');
    }
    // 没有封面时异步拉取（仅网易云链接歌曲）
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
            '<span class="sm-song-ico"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg></span>' +
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
    history.push({ id: 'smh_' + Date.now(), trackId: trackId, trackName: m ? (m.name || '未知歌曲') : '未知歌曲', triggerType: triggerType, ts: Date.now() });
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
      '<div class="mail-actions"><button class="cc-tool" id="sm-e-del">删除</button><button class="cc-tool" id="sm-e-cancel">取消</button><button class="cc-tool" id="sm-e-ok">保存</button></div>');
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
              keys.filter(k => k === uid + ':music-file:' + id).forEach(k => {
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
      if (!library.length) return;
      const now = Date.now();
      if (now - cooldownAt < settings.cooldownMs) return;
      const prob = settings.reqProb || 5;
      if (Math.random() * 100 >= prob) return;
      cooldownAt = now;
      const candidates = library.slice();
      if (!candidates.length) return;
      const track = candidates[Math.floor(Math.random() * candidates.length)];
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
          reqData = null;
          // 记录：TA 邀请听歌（拒绝）
          history.push({ id: 'smh_' + Date.now(), trackId: '', trackName: '', triggerType: '拒绝了 TA 的听歌邀请《' + esc(trackName) + '》', rejected: true, ts: Date.now() });
          if (history.length > 500) history = history.slice(-500);
          saveHistory(); renderHistory();
          if (window.chatAddSystem) window.chatAddSystem('你拒绝了 ' + name + ' 的听歌邀请');
        });
        document.getElementById('sm-req-yes').addEventListener('click', () => {
          document.getElementById('tc-mask').hidden = true;
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
      '<div class="sm-set-hint">聊天过程中 TA 会按概率请求和你一起听歌；播放时右上角出现可拖动的悬浮小框</div>' +
      '<div class="mail-actions"><button class="cc-tool" id="sm-set-close">关闭</button></div>');
    document.getElementById('sm-set-close').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
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
            saveLibrary();
            renderPage();
          }
        });
      }
    });
  }
  setupFloatDrag();
  bindWidget();
  renderPage();
})();
