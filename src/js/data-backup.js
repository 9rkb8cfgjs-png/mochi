// ===== 功能：导出数据 / 导入数据 =====
// 导出：收集全部本地数据（localStorage + IndexedDB 音乐文件/字卡/查岗记录）打包为 JSON 下载
// 导入：读取备份 JSON，确认后覆盖恢复并刷新页面
// v3.5.24 修复手机端导入丢数据：
//  - 写 localStorage 前先按字节估算总大小，超出配额的大键（聊天图片/头像库等）自动删掉并计数，
//    保证昵称/设置/聊天文字记录等小键全部恢复成功（不再因超配额静默丢数据）
//  - 写入失败逐条回滚（还原被清掉的旧值），不会出现"清空后写一半"的情况
//  - IndexedDB 改为逐条顺序写入（不再用 Promise.all 一拥而上，手机内存压力大时容易失败）
//  - 兼容旧 iOS 的 <input type=file> 读取（File.text() 老版本不支持时改用 FileReader）
(function () {
  const uid = 'xy-home-v2';
  // 容量余量：给正在运行的其他功能留一点（手机 localStorage 约 5MB，桌面 10MB）
  const LS_HEADROOM = 512 * 1024;

  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2600);
  }

  // v3.5.113：导入进度缓冲——读取/解析大备份（上百 MB）与逐条写入都需要时间，
  // 用全屏遮罩 + 进度条明确显示进度，避免用户以为卡死/没反应。
  function impEl() {
    let el = document.getElementById('cc-import-progress');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cc-import-progress';
      el.className = 'cc-import-progress';
      el.innerHTML = '<div class="cc-ip-box">' +
        '<div class="cc-ip-title" id="cc-ip-title">正在导入…</div>' +
        '<div class="cc-ip-bar"><div class="cc-ip-fill" id="cc-ip-fill"></div></div>' +
        '<div class="cc-ip-sub" id="cc-ip-sub"></div></div>';
      document.body.appendChild(el);
    }
    return el;
  }
  function impShow(title, sub, pct) {
    const el = impEl();
    el.hidden = false;
    const t = document.getElementById('cc-ip-title');
    const s = document.getElementById('cc-ip-sub');
    const f = document.getElementById('cc-ip-fill');
    if (t) t.textContent = title;
    if (s) s.textContent = sub || '';
    if (f) f.style.width = (pct == null ? '' : Math.max(0, Math.min(100, pct)) + '%');
  }
  function impHide() {
    const el = document.getElementById('cc-import-progress');
    if (el) el.hidden = true;
  }

  // 估算字符串体积（UTF-8 字节，用于配额判断）
  function byteLen(s) {
    if (s == null) return 0;
    if (typeof s !== 'string') s = JSON.stringify(s);
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0xD800 || c > 0xDFFF ? 3 : 4;
    }
    return n;
  }

  // 兼容旧 iOS：读取文件文本（File.text() 不支持时退回 FileReader）
  function readFileText(file) {
    return new Promise((resolve) => {
      if (typeof file.text === 'function') {
        file.text().then(resolve).catch(() => readViaReader());
      } else readViaReader();
      function readViaReader() {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => resolve('');
        r.readAsText(file, 'utf-8');
      }
    });
  }

  // 导出：localStorage + IndexedDB
  // v3.5.97：不受任何大小限制——按 IndexedDB / localStorage 实际数据全量导出。
  //   音乐文件、图片、聊天记录全部包含；导入时大键进 IndexedDB、小键进 localStorage，完整还原。
  async function doExport() {
    const data = { version: '1.0', app: 'mochi-zika', exportTime: new Date().toISOString(), ls: {}, idb: {} };
    const add = (k, v) => {
      // 大键只进 data.idb（单镜像，导入进 IndexedDB）；小键进 data.ls
      if (byteLen(v) > 20 * 1024) data.idb[k] = v;
      else data.ls[k] = v;
    };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(uid + ':') !== 0) continue;
        add(k, localStorage.getItem(k));
      }
    } catch (e) {}
    // IndexedDB：音乐文件、字卡、聊天记录等全部权威数据
    if (window.idbGetAllKeys) {
      try {
        const keys = await window.idbGetAllKeys();
        for (const k of keys || []) {
          if (k.indexOf(uid + ':') !== 0) continue;
          if (k in data.ls || k in data.idb) continue; // 已在上面收录
          const v = await window.idbGet(k);
          if (v !== undefined && v !== null) add(k, v);
        }
      } catch (e) {}
    }
    const json = JSON.stringify(data);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mochi数据备份_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('数据已导出（' + Math.round(json.length / 1024) + ' KB，全部数据完整）');
  }

  // v3.5.101：导入前预览备份摘要——显示导出时间/键数/聊天条数/头像/摸鱼累计，
  // 避免误导入旧备份或错文件（曾出现导入的文件不是最新备份、数据缺失的情况）
  function backupSummary(data) {
    const fmtMB = (n) => (n / 1048576).toFixed(1) + ' MB';
    const cnt = (o) => (o && typeof o === 'object' ? Object.keys(o).length : 0);
    const bytesOf = (v) => (v == null ? 0 : byteLen(typeof v === 'string' ? v : JSON.stringify(v)));
    let lsB = 0, idbB = 0;
    Object.keys(data.ls || {}).forEach(k => { lsB += bytesOf(data.ls[k]); });
    Object.keys(data.idb || {}).forEach(k => { idbB += bytesOf(data.idb[k]); });
    let chatN = '无';
    try {
      const chatRaw = (data.idb && data.idb[uid + ':chat-msgs']) || (data.ls && data.ls[uid + ':chat-msgs']);
      const arr = typeof chatRaw === 'string' ? JSON.parse(chatRaw) : chatRaw;
      if (Array.isArray(arr)) chatN = arr.length + ' 条';
    } catch (e) {}
    const avMe = !!(data.ls && data.ls[uid + ':avatar-user']) || !!(data.idb && data.idb[uid + ':avatar-user']);
    const avTa = !!(data.ls && data.ls[uid + ':avatar-partner']) || !!(data.idb && data.idb[uid + ':avatar-partner']);
    const fish = (data.ls && data.ls[uid + ':fish-total']) !== undefined ? data.ls[uid + ':fish-total'] : null;
    const lines = [];
    lines.push('备份内容（请确认是对的文件）：');
    lines.push('· 导出时间：' + (data.exportTime ? String(data.exportTime).slice(0, 16).replace('T', ' ') : '未知'));
    lines.push('· 小存储 ' + cnt(data.ls) + ' 项（' + fmtMB(lsB) + '）+ 大文件 ' + cnt(data.idb) + ' 项（' + fmtMB(idbB) + '）');
    lines.push('· 聊天记录：' + chatN);
    lines.push('· 头像：我 ' + (avMe ? '✓有' : '✗无') + '，TA ' + (avTa ? '✓有' : '✗无'));
    lines.push('· 摸鱼累计：' + (fish !== null ? fish : '✗无'));
    lines.push('若这里显示「聊天记录：无/头像✗」等，说明不是最新完整备份，请勿导入。');
    return lines.join('\n');
  }

  // 导入
  async function doImport(file) {
    // 大备份读取/解析耗时较长，先亮进度遮罩
    impShow('正在读取数据文件…', '大备份（上百 MB）解析需要几秒，请稍候', null);
    let data;
    try {
      const text = await readFileText(file);
      data = JSON.parse(text || 'null');
    } catch (e) {
      impHide();
      toast('无效的数据文件');
      return;
    }
    impHide();
    if (!data || typeof data !== 'object' || !data.ls || typeof data.ls !== 'object') {
      toast('不是 mochi 导出的数据文件');
      return;
    }
    // v3.6.x：备份结构强校验——① app 标识不匹配直接拒绝（防误导其他应用的 json）；
    // ② 键前缀完全不匹配 mochi（xy-home-v2:）视为无效文件——原实现 {ls:{},idb:{}}
    // 空结构也能通过校验，配合先清空再写入，会把用户数据全清掉
    if (data.app && data.app !== 'mochi-zika') {
      toast('不是 mochi 导出的数据文件');
      return;
    }
    const hasMochiKeys =
      Object.keys(data.ls).some(k => k.indexOf(uid + ':') === 0) ||
      !!(data.idb && typeof data.idb === 'object' && Object.keys(data.idb).some(k => k.indexOf(uid + ':') === 0));
    if (!hasMochiKeys) {
      toast('备份文件里没有 mochi 数据（键前缀不匹配）');
      return;
    }
    if (!window.openModal) return;
    // v3.5.101：导入前先预览该备份的内容摘要，确认无误再覆盖
    const summary = backupSummary(data);
    window.openModal('确定导入数据？将覆盖当前所有数据，且无法恢复。', '', () => {
      doImportGo(data);
    }, { noInput: true, staticText: summary });
  }

  function doImportGo(data) {
    // v3.5.113：导入进度遮罩（读取已完成，这里开始逐条写入）
    impShow('正在导入…', '准备中', 2);

    // ---- 1. 备份当前 localStorage 的 xy-home-v2 键（导入失败可回滚） ----
    let backup = null;
    try {
      backup = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(uid + ':') === 0) backup[k] = localStorage.getItem(k);
      }
    } catch (e) { backup = null; }

    // ---- 2. 先恢复 IndexedDB（字卡 / 查岗 / 音乐文件等大件挪进 IDB，不占 localStorage 配额） ----
    // 写入前先清空 IDB：否则备份里没有的旧键会残留，刷新后被 idbRestore 回填，等于没导入
    const idbRestored = new Promise((resolve) => {
      if (!window.idbSet) { resolve(true); return; }
      const clearFirst = (window.idbClearAll && window.idbClearAll()) || Promise.resolve(true);
      clearFirst.then((cleared) => {
        // 清空失败 → 直接判失败（避免旧键残留 + 新键写入的混乱局面）
        if (cleared !== true && !data.idb) { resolve(true); return; }
        if (cleared !== true) { resolve(false); return; }
        if (!data.idb) { resolve(true); return; }
        const idbKeys = Object.keys(data.idb).filter(k => k.indexOf(uid + ':') === 0);
        if (!idbKeys.length) { resolve(true); return; }
        let p = Promise.resolve();
        let failed = 0;
        let done = 0;
        const total = idbKeys.length;
        // 逐条顺序写入，避免手机内存压力；每写完一条更新进度
        // v3.5.114：每条写完后释放 data.idb[k] 大字符串引用——手机内存有限，
        //   119MB 备份全部驻留会撑爆峰值内存导致后续写入/刷新异常
        idbKeys.forEach(k => {
          p = p.then(() => window.idbSet(k, data.idb[k])).then(ok => {
            try { delete data.idb[k]; } catch (e) {}
            done++;
            if (!ok) failed++;
            impShow('正在恢复大文件（字卡/聊天/音乐等）…', done + ' / ' + total, 5 + Math.round(done / total * 55));
          });
        });
        p.then(() => resolve(failed === 0)).catch(() => resolve(false));
      });
    });

    // ---- 3. 清空旧数据（xy-home-v2 前缀） ----
    function clearLs() {
      try {
        Object.keys(localStorage)
          .filter(k => k.indexOf(uid + ':') === 0)
          .forEach(k => localStorage.removeItem(k));
      } catch (e) {}
    }
    // 回滚：还原导入前的旧数据
    function rollback() {
      clearLs();
      if (backup) {
        try {
          Object.keys(backup).forEach(k => localStorage.setItem(k, backup[k]));
        } catch (e) {}
      }
    }

    idbRestored.then((idbOk) => {
      impShow('正在导入…', '正在写入设置与聊天记录', 62);
      // ---- 4. 写 localStorage 前先估算总字节；超配额时按体积从大到小丢弃大键 ----
      // 聊天记录双写（localStorage + IndexedDB）：导入时 IndexedDB 已恢复完整权威版
      // （含图片 dataURL），localStorage 无需再写超大聊天记录——启动时 loadMsgs 会
      // 自动从 IndexedDB 恢复。这样导入不再因聊天记录占几十 MB 而整体取消。
      const lsKeys = Object.keys(data.ls).filter(k => k.indexOf(uid + ':') === 0);
      let entries = lsKeys.map(k => ({ k: k, len: byteLen(data.ls[k]) + byteLen(k) }));
      let chatMoved = false;
      if (idbOk && data.idb && typeof data.idb === 'object' && (uid + ':chat-msgs') in data.idb) {
        const before = entries.length;
        entries = entries.filter(e => e.k !== uid + ':chat-msgs');
        chatMoved = entries.length < before;
      }
      const total = entries.reduce((s, e) => s + e.len, 0);
      // 估算当前设备配额：探测能否写入 1MB 临时键（能 → 桌面 10MB 档；不能 → 手机 5MB 档）
      let quota = 5 * 1024 * 1024;
      try {
        const probe = 'x'.repeat(1024 * 1024);
        localStorage.setItem(uid + ':__quota_probe__', probe);
        localStorage.removeItem(uid + ':__quota_probe__');
        quota = 10 * 1024 * 1024;
      } catch (e) {}
      let budget = total;
      let dropped = [];
      const sorted = entries.slice().sort((a, b) => b.len - a.len);
      for (const e of sorted) {
        if (budget + LS_HEADROOM <= quota) break;
        // 聊天记录绝不丢（v3.5.90：IDB 无 chat-msgs 时 localStorage 兜底）
        if (e.k === uid + ':chat-msgs') continue;
        budget -= e.len;
        dropped.push(e);
      }
      // v3.5.91：不再整体取消——按配额丢弃超大图片类大键，其余数据全部写入。
      // 手机 5MB 配额装不下几十 MB 图片是物理限制；跳过的大键有明确提示，
      // 设置/昵称/聊天文字/字卡文字等小键保证完整恢复。
      const skipSet = {};
      dropped.forEach(e => { skipSet[e.k] = true; });

      clearLs();
      let writeFailed = [];
      // v3.5.93：被配额跳过的超大键与写入失败的键不再丢弃——
      // 改写入 IndexedDB（配额远大于 localStorage），启动时自动从 IDB 恢复，数据不丢
      // v3.5.94：写入成功的键若 >200KB，也与运行时策略一致移进 IDB（避免占满 5MB 配额）
      const idbFalls = [];
      for (const e of entries) {
        if (skipSet[e.k]) { idbFalls.push({ k: e.k, v: data.ls[e.k] }); continue; }
        try {
          localStorage.setItem(e.k, data.ls[e.k]);
          if (e.len > 200 * 1024) {
            try { localStorage.removeItem(e.k); } catch (err2) {}
            idbFalls.push({ k: e.k, v: data.ls[e.k] });
          }
        } catch (err) {
          writeFailed.push(e.k);
          idbFalls.push({ k: e.k, v: data.ls[e.k] });
        }
      }
      // 等待 IDB 兜底写入全部完成后，再提示 + 刷新
      let fallsOk = 0;
      let p = Promise.resolve();
      idbFalls.forEach(f => {
        p = p.then(() => (window.idbSet ? window.idbSet(f.k, f.v) : Promise.resolve(false)))
          .then(ok => { if (ok) fallsOk++; });
      });
      p.then(async () => {
        impShow('正在导入…', '写入完成，正在核对数据', 95);
        const parts = [];
        if (idbOk) parts.push('音乐/字卡/查岗等大文件已恢复');
        else if (data.idb && Object.keys(data.idb).length) parts.push('⚠ IndexedDB 恢复失败，字卡/音乐/查岗等大文件可能缺失，建议重新导入');
        if (chatMoved) parts.push('聊天记录已存入 IndexedDB（不占浏览器小存储）');
        if (writeFailed.length) parts.push(writeFailed.length + ' 项写入失败（存储空间满）');
        if (idbFalls.length) {
          const mb = (idbFalls.reduce((s, f) => s + byteLen(f.v), 0) / 1048576).toFixed(1);
          parts.push('大文件 ' + idbFalls.length + ' 项（约 ' + mb + ' MB）已存入 IndexedDB，不占小存储');
        }
        if (!parts.length) parts.push('导入成功');
        // v3.5.101：导入后核对关键数据是否真的恢复（避免"提示成功但数据缺失"）
        let ok = [];
        try {
          const chatV = window.idbGet ? await window.idbGet(uid + ':chat-msgs') : null;
          try {
            const a = typeof chatV === 'string' ? JSON.parse(chatV) : chatV;
            if (Array.isArray(a)) ok.push('聊天' + a.length + '条');
          } catch (e) {}
          if (localStorage.getItem(uid + ':avatar-user')) ok.push('我的头像✓');
          if (localStorage.getItem(uid + ':fish-total') !== null) ok.push('摸鱼累计 ' + localStorage.getItem(uid + ':fish-total'));
        } catch (e) {}
        const msg = parts.join('；') + (ok.length ? '；已核对：' + ok.join('、') : '') + '，正在刷新…';
        // v3.5.114：核对失败时明确红字警告（数据确实没恢复时不要静默跳过）
        if (!ok.length) {
          impShow('⚠ 导入完成但未检测到关键数据', '聊天记录/头像/摸鱼未在存储中找到，刷新后仍缺失请重新导入完整备份', 100);
        } else {
          impShow('导入完成', msg, 100);
        }
        // v3.5.118：不再额外弹黑色 toast——结果已完整显示在白色进度面板里
        // （toast z-index 低于进度遮罩，同时弹出会被白板盖住，形成"黑色弹窗被遮挡"）
        // v3.5.117：完成页停留 3.5 秒（用户反馈缓冲时间不够、看不清结果）
        setTimeout(() => { impHide(); location.reload(); }, 3500);
      });
    });
  }

  // 入口绑定
  const exportRow = document.getElementById('row-export');
  if (exportRow) {
    exportRow.addEventListener('click', () => {
      toast('正在导出，请稍候…');
      // v3.5.134：导出前强制落盘——聊天记录有 400ms 防抖，不刷的话备份缺最后几条消息
      if (window.chatFlushSave) window.chatFlushSave();
      doExport();
    });
  }
  const importRow = document.getElementById('row-import');
  if (importRow) {
    importRow.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (f) doImport(f);
      };
      input.click();
    });
  }
})();
