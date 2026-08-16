// ===== 功能：后台保活 + 后台通知（仿星言简约版） =====
// 后台保活：播放静音音频（1Hz 正弦波，音量 0.0001）保持页面定时器活跃，
//           并请求屏幕常亮（wakeLock），防止浏览器后台休眠导致消息/回复停止；
//           首次交互时恢复 AudioContext（浏览器自动播放策略要求）。
// 后台通知：开启后，页面不在前台时收到 TA 的新消息会弹出浏览器通知。
(function () {
  const uid = 'xy-home-v2';
  const store = window.xyStore(uid);
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

  // ================= 后台保活 =================
  let keepAudio = null;
  let keepInterval = null;
  let keepEnabled = false;
  let wakeSentinel = null; // v3.5.131：模块级，供 stopKeepAlive 释放

  function startKeepAlive(showToast) {
    if (keepAudio) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 1;      // 1Hz，人耳基本听不见
      gain.gain.value = 0.0001;     // 近零音量
      osc.start();
      keepAudio = { ctx: ctx, osc: osc, gain: gain };

      // 用户首次交互时恢复 AudioContext（浏览器自动播放策略要求）
      if (ctx.state === 'suspended') {
        const resumeOnInteraction = function () {
          if (keepAudio && keepAudio.ctx && keepAudio.ctx.state === 'suspended') {
            keepAudio.ctx.resume().catch(function () {});
          }
        };
        document.addEventListener('click', resumeOnInteraction, { once: true });
        document.addEventListener('touchstart', resumeOnInteraction, { once: true });
        document.addEventListener('keydown', resumeOnInteraction, { once: true });
      }
      // 每 5 秒尝试恢复（防止休眠导致 AudioContext 挂起）
      keepInterval = setInterval(function () {
        if (keepAudio && keepAudio.ctx && keepAudio.ctx.state === 'suspended') {
          keepAudio.ctx.resume().catch(function () {});
        }
      }, 5000);

      // 屏幕常亮（wakeLock），释放后自动重试
      // v3.5.131：wakeSentinel 提升为模块级——stopKeepAlive 需要释放它（原闭包变量
      // 关闭保活后屏幕仍常亮，用户以为关了实际没关）
      const requestWakeLock = function () {
        if (navigator.wakeLock && document.visibilityState === 'visible') {
          navigator.wakeLock.request('screen').then(function (sentinel) {
            wakeSentinel = sentinel;
            if (wakeSentinel) {
              wakeSentinel.addEventListener('release', function () {
                setTimeout(function () { if (keepEnabled) requestWakeLock(); }, 1000);
              });
            }
          }).catch(function () {});
        }
      };
      requestWakeLock();
      // v3.5.132：visibilitychange 监听移到模块顶层注册一次（在 startKeepAlive 内
      // 每次开关都会累积一个监听器 + 一个旧 wakeLock 永不释放）

      if (showToast) {
        // v3.5.133：保活开启时通知发送结果做成可感知诊断——
        // 系统通知能不能显示由浏览器+系统决定，API 不报错但可能被系统拦截；
        // 分情况提示用户卡在哪一环，避免"开了保活但通知栏永远没消息"的静默失效
        if (!('Notification' in window)) {
          toast('后台保活已启动（注意：本环境不支持系统通知，需 HTTPS 访问）');
        } else if (Notification.permission !== 'granted') {
          toast('后台保活已启动（通知未授权：去设置→后台通知→开启并允许权限）');
        } else {
          try {
            new Notification('后台保活已启动', { body: '正在播放静音音频以保持后台活跃，请勿关闭此页面' });
            toast('后台保活已启动 · 通知栏应弹出提示条，若没有请到系统设置→通知→Chrome→允许通知');
          } catch (e) {
            toast('后台保活已启动（通知发送异常，请检查系统通知权限）');
          }
        }
      }
    } catch (e) {}
  }
  function stopKeepAlive(showToast) {
    try { if (keepAudio) { keepAudio.osc.stop(); keepAudio.ctx.close(); } } catch (e) {}
    // v3.5.131：释放屏幕常亮（原实现从不 release——关闭保活后屏幕持续不熄）
    try { if (wakeSentinel) { wakeSentinel.release(); } } catch (e) {}
    wakeSentinel = null;
    clearInterval(keepInterval);
    keepAudio = null;
    keepInterval = null;
    if (showToast) toast('后台保活已关闭');
  }
  // v3.5.132：模块顶层注册一次（防反复开关保活累积监听器）
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && keepEnabled) {
      try {
        if (navigator.wakeLock) {
          navigator.wakeLock.request('screen').then(function (sentinel) {
            wakeSentinel = sentinel;
            if (wakeSentinel) {
              wakeSentinel.addEventListener('release', function () {
                setTimeout(function () { if (keepEnabled) requestWakeLockTop(); }, 1000);
              });
            }
          }).catch(function () {});
        }
      } catch (e) {}
    }
  });
  function requestWakeLockTop() {
    try {
      if (navigator.wakeLock && document.visibilityState === 'visible' && keepEnabled) {
        navigator.wakeLock.request('screen').then(function (sentinel) {
          wakeSentinel = sentinel;
        }).catch(function () {});
      }
    } catch (e) {}
  }
  const kaBtn = document.getElementById('bg-keepalive');
  function syncKeepUI() { if (kaBtn) kaBtn.checked = keepEnabled; }
  if (kaBtn) {
    kaBtn.addEventListener('change', function () {
      keepEnabled = kaBtn.checked;
      store.set('bg-keepalive', keepEnabled ? '1' : '0');
      if (keepEnabled) startKeepAlive(true);
      else stopKeepAlive(true);
    });
  }
  (function () {
    const saved = store.get('bg-keepalive');
    keepEnabled = saved === null ? false : saved === '1';
    syncKeepUI();
    if (keepEnabled) startKeepAlive(false);
  })();

  // ================= 后台通知 =================
  let notifyEnabled = false;
  // v3.5.114：请求权限（支持成功/失败回调）——失败时开关要弹回关闭，
  //   否则 iOS 不支持 / 权限被拒时开关显示"开"但实际无效，误导用户
  function requestNotifyPermission(cb, failCb) {
    if (!('Notification' in window)) {
      // iOS Safari 网页版不支持 Notification API（装到主屏幕的 PWA 也不支持本地通知）
      toast('iPhone 网页版不支持系统通知\n请安装到主屏幕后由系统接管');
      if (failCb) failCb();
      return;
    }
    if (Notification.permission === 'granted') { if (cb) cb(); return; }
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(function (p) {
        if (p === 'granted') { if (cb) cb(); }
        else {
          toast('未获得通知权限，后台消息无法弹窗');
          if (failCb) failCb();
        }
      }).catch(function () { if (failCb) failCb(); });
    } else {
      toast('通知权限被拒绝，请在浏览器设置中允许通知');
      if (failCb) failCb();
    }
  }
  const nbBtn = document.getElementById('bg-notify');
  function syncNotifyUI() { if (nbBtn) nbBtn.checked = notifyEnabled; }
  if (nbBtn) {
    nbBtn.addEventListener('change', function () {
      if (nbBtn.checked) {
        requestNotifyPermission(function () {
          notifyEnabled = true;
          store.set('bg-notify', '1');
          syncNotifyUI();
          try { new Notification('通知已开启', { body: '后台消息提醒将正常弹窗' }); } catch (e) {}
          // v3.5.132：开启通知时自动联动开启后台保活——后台消息要"到达"必须
          //   页面定时器在后台仍运行（静音音频保活）；否则开关开了但页面休眠，
          //   消息根本不产生，通知永远不会弹（旧版只 toast 提醒，用户容易漏开）
          setTimeout(function () {
            const keep = document.getElementById('bg-keepalive');
            const keepOn = keep ? keep.checked : store.get('bg-keepalive') === '1';
            if (!keepOn) {
              if (keep) keep.checked = true;
              keepEnabled = true;
              store.set('bg-keepalive', '1');
              startKeepAlive(false);
              syncKeepUI();
              toast('已自动开启后台保活（后台消息必需）');
            }
            if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
              toast('提醒：需 HTTPS 访问，浏览器才允许通知');
            }
          }, 400);
        }, function () {
          // 失败：弹回开关
          notifyEnabled = false;
          store.set('bg-notify', '0');
          syncNotifyUI();
        });
      } else {
        notifyEnabled = false;
        store.set('bg-notify', '0');
        syncNotifyUI();
      }
    });
  }
  (function () {
    const saved = store.get('bg-notify');
    // v3.5.131：恢复时校验权限——浏览器/系统回收权限后开关仍显示"开"但通知静默失效
    notifyEnabled = saved === '1' && 'Notification' in window && Notification.permission === 'granted';
    if (saved === '1' && !notifyEnabled) {
      try { store.set('bg-notify', '0'); } catch (e) {}
      toast('通知权限已被回收，已自动关闭通知');
    }
    syncNotifyUI();
  })();
  // v3.5.115：后台通知「测试」按钮——点一下发条测试通知 + 环境诊断，
  //   安卓 Chrome 上通知不生效时一键定位卡在哪一环（HTTPS/权限/后台保活）
  // v3.5.116：增强诊断——权限未授权时主动请求；发送后追加系统级通知检查提示
  //   （红米/小米 HyperOS：站点权限通过后，系统设置里 Chrome 的通知仍可能被关，
  //   此时 API 不报错但通知不显示，需提示用户去系统设置检查）
  const testBtn = document.getElementById('bg-notify-test');
  if (testBtn) {
    testBtn.addEventListener('click', function () {
      const env = [];
      if (!('Notification' in window)) {
        env.push('✗ 当前浏览器不支持 Notification API');
        env.push('原因：安卓 Chrome 必须 HTTPS 访问才有通知');
        env.push('当前：' + location.protocol + '//' + location.host);
        env.push('解决：用 https:// 部署访问（GitHub Pages 即是 HTTPS）');
        toast('环境检查：\n' + env.join('\n'));
        return;
      }
      if (Notification.permission === 'default') {
        // 未授权：主动请求一次再继续
        Notification.requestPermission().then(function (p) {
          if (p === 'granted') runTest(env);
          else {
            env.push('✗ 通知权限：拒绝了授权请求');
            env.push('解决：地址栏左侧图标 → 网站设置 → 通知 → 允许');
            toast('环境检查：\n' + env.join('\n'));
          }
        }).catch(function () {
          toast('环境检查：\n✗ 请求通知权限失败');
        });
        return;
      }
      runTest(env);
    });
    function runTest(env) {
      // v3.5.118：诊断首行显示当前版本——先核对手机上是否最新部署，
      //   旧版（如后台保活前）诊断结果会误导
      try {
        const verEl = document.querySelector('.ver');
        if (verEl) env.push('当前版本：' + (verEl.textContent || '').trim());
      } catch (e) {}
      if (Notification.permission === 'granted') env.push('✓ 通知权限：已允许');
      else env.push('✗ 通知权限：被拒绝（去浏览器站点设置开启）');
      const keep = document.getElementById('bg-keepalive');
      const keepOn = keep ? keep.checked : store.get('bg-keepalive') === '1';
      env.push(keepOn ? '✓ 后台保活：已开启' : '✗ 后台保活：未开启（TA 消息后台到不了，通知不会弹）');
      const isHttps = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      env.push(isHttps ? '✓ 访问协议：HTTPS 或本地' : '✗ 访问协议：' + location.protocol + '//（安卓 Chrome 需 HTTPS 才弹通知，GitHub Pages 部署后即是 HTTPS）');
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        toast('环境检查：\n' + env.join('\n'));
        return;
      }
      // 环境 OK：真发一条测试通知
      try {
        const name = store.get('lbl-partner') || 'TA';
        const n = new Notification('后台通知测试', { body: '来自 ' + name + ' · 如果能看到这条，后台通知就通了' });
        setTimeout(function () { try { n.close(); } catch (e) {} }, 5000);
        env.push('✓ 测试通知已发送');
        // 红米/小米：系统级通知可能拦截（API 不报错但通知不显示）
        if (/miui|xiaomi|redmi|hyperos/i.test(navigator.userAgent) || /android/i.test(navigator.userAgent)) {
          env.push('提示：若没看到通知 → 系统设置 → 通知与控制中心 → 通知管理 → Chrome → 允许通知');
        }
        toast('测试结果：\n' + env.join('\n'));
      } catch (e) {
        toast('发送失败：\n' + env.join('\n'));
      }
    }
  }

  // v3.5.132：从后台回到前台时做一次状态检查——通知开但保活被关 / 权限被回收
  //   都是静默失效（页面照常运行、通知就是不弹），回到前台时主动提示一次
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    const saved = store.get('bg-notify');
    if (saved !== '1') return;
    const keep = document.getElementById('bg-keepalive');
    const keepOn = keep ? keep.checked : store.get('bg-keepalive') === '1';
    if (!keepOn) {
      toast('提醒：后台保活已关闭，后台消息到不了，通知不会弹（设置里开启）');
    }
  });

  // 供 chat.js 调用：收到 TA 新消息且页面不在前台时弹浏览器通知
  // 通知显示：联系人头像 + 昵称 + 消息发送时间 + 内容
  window.bgNotifyCheck = function (text, ts) {
    if (!notifyEnabled) return;
    if (document.visibilityState === 'visible') return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const name = store.get('lbl-partner') || 'TA';
      let t = '';
      if (ts) {
        const d = new Date(ts);
        t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }
      const body = text && text.length > 40 ? text.slice(0, 40) + '…' : (text || '收到一条新消息');
      const opts = { body: (t ? t + '  ' : '') + body };
      // v3.5.118：通知图标只在使用 http(s) URL 时附带——头像存的是 dataURL，
      //   Android Chrome 对 dataURL 图标支持不稳定，会导致整个 new Notification
      //   抛异常被吞掉、通知不弹。去掉图标后通知 100% 稳定弹出。
      const avatar = store.get('avatar-partner') || '';
      if (avatar && /^https?:\/\//i.test(avatar)) opts.icon = avatar;
      const n = new Notification(name, opts);
      setTimeout(function () { try { n.close(); } catch (e) {} }, 6000);
    } catch (e) {}
  };
})();
