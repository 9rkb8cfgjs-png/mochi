// ===== 功能：音效设置（v3.5.60） =====
// 本地上传音频，设置三类音效：
//  - 联系人来电铃声（sfx-ring）
//  - 联系人发送/回复消息音效（sfx-in）
//  - 我发送消息音效（sfx-out）
// 未设置的音效不播放；设置后对应事件自动播放
(function () {
  const uid = 'xy-home-v2';
  const store = window.xyStore(uid);
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2200);
  }
  const KEYS = { ring: 'sfx-ring', in: 'sfx-in', out: 'sfx-out' };
  const NAMES = { ring: '联系人来电铃声', in: '联系人发送和回复消息', out: '我发送消息' };

  // 播放音效（每次新建 Audio，避免并发冲突；无设置不播）
  // v3.5.127：ring 用单例保存引用——来电铃声长，通话结束必须能停止
  let ringAudio = null;
  window.stopSfx = function (type) {
    if (type === 'ring' && ringAudio) {
      try { ringAudio.pause(); ringAudio = null; } catch (e) { ringAudio = null; }
    }
  };
  // v3.5.129：playSfx(type, opts)——opts.loop=false 时试听用（设置页点试听不该无限循环）
  window.playSfx = function (type, opts) {
    try {
      const data = store.get(KEYS[type]);
      if (!data) return;
      const loop = !(opts && opts.loop === false);
      if (type === 'ring' && loop) {
        if (ringAudio) { try { ringAudio.pause(); } catch (e) {} }
        ringAudio = new Audio(data);
        ringAudio.loop = true;
        ringAudio.volume = 0.9;
        ringAudio.play().catch(() => { ringAudio = null; });
      } else {
        const a = new Audio(data);
        a.volume = 0.9;
        a.play().catch(() => {});
      }
    } catch (e) {}
  };

  // 上传音频：FileReader → dataURL（超 3MB 提示可能过大）
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
          updateVals();
          toast(NAMES[key] + '音效已设置');
        };
        reader.onerror = () => { toast('音频读取失败'); };
        reader.readAsDataURL(f);
      };
      input.click();
    });
  }
  // 试听
  function bindPlay(key, id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!store.get(KEYS[key])) { toast('请先上传' + NAMES[key] + '音效'); return; }
      // v3.5.129：试听不循环（铃声 loop 会永远响下去没有停止入口）
      window.playSfx(key, { loop: false });
    });
  }
  // 清除
  function bindClear(key, id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      store.remove(KEYS[key]);
      updateVals();
      toast(NAMES[key] + '音效已清除');
    });
  }
  // 状态显示
  function updateVals() {
    [['ring', 'sfx-ring-val'], ['in', 'sfx-in-val'], ['out', 'sfx-out-val']].forEach(([key, valId]) => {
      const el = document.getElementById(valId);
      if (el) el.textContent = store.get(KEYS[key]) ? '已设置' : '未设置';
    });
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
  // v3.5.99：补读完成后无条件刷新一次标签——idbRestore 可能已先把音效回填进
  //   localStorage，此时 store.get 有值、走不到旧分支里的 updateVals，导致
  //   界面一直显示「未设置」但试听正常。updateVals 幂等，这里统一兜底。
  // v3.6.x：修复——这段补读原本被错位写进「上传音频」的 reader.onload 回调里，
  //   只在用户上传音效时才执行（还会多跑 3 次多余 idbGet），页面加载时从不运行，
  //   刷新后音效页一直显示「未设置」；移回模块顶层随加载执行
  try {
    if (window.idbGet) {
      ['sfx-ring', 'sfx-in', 'sfx-out'].forEach(key => {
        window.idbGet(uid + ':' + key).then(v => {
          if (v && typeof v === 'string' && v.length > 2 && !store.get(key)) {
            store.set(key, v);
          }
          updateVals();
        });
      });
    }
  } catch (e) {}
  updateVals();

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
