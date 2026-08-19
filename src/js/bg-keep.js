// ===== 功能：后台保活 + 后台通知（仿星言简约版） =====
// 后台保活：播放静音音频（1Hz 正弦波，音量 0.0001）保持页面定时器活跃，
//           并请求屏幕常亮（wakeLock），防止浏览器后台休眠导致消息/回复停止；
//           首次交互时恢复 AudioContext（浏览器自动播放策略要求）。
// 后台通知：开启后，页面不在前台时收到 TA 的新消息会弹出浏览器通知。
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
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

      // v3.5.155：媒体会话标记——Chrome 安卓把「有活跃媒体会话 + 音频输出」的页面
      // 视为"正在播放媒体"，后台几乎不冻结（Youtube 网页版后台持续播放即此原理）。
      // 保活开启后在通知栏显示一个媒体条「mochi 后台保活」，既让用户看到保活在跑，
      // 又大幅提升后台定时器存活率 → 后台消息/通知到达率。比纯静音音频 + wakeLock
      // 强很多；停用保活时清除（stopKeepAlive）
      try {
        if ('mediaSession' in navigator && navigator.mediaSession && window.MediaMetadata) {
          navigator.mediaSession.metadata = new window.MediaMetadata({
            title: 'Mochi 后台保活',
            artist: 'mochi',
            album: '后台消息提醒运行中'
          });
          // 控制条按钮做空响应，避免点按报错
          try {
            navigator.mediaSession.setActionHandler('play', function () {});
            navigator.mediaSession.setActionHandler('pause', function () {});
          } catch (e) {}
        }
      } catch (e) {}

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
          showSysNotification('后台保活已启动', { body: '正在播放静音音频以保持后台活跃，请勿关闭此页面' }).then(function (ok) {
            toast(ok
              ? '后台保活已启动 · 通知栏应弹出提示条，若没有请到系统设置→通知→Chrome→允许通知'
              : '后台保活已启动（通知发送未受理，请检查系统通知权限）');
          });
        }
      }
    } catch (e) {}
  }
  function stopKeepAlive(showToast) {
    try { if (keepAudio) { keepAudio.osc.stop(); keepAudio.ctx.close(); } } catch (e) {}
    // v3.5.155：清除媒体会话标记（通知栏媒体条消失）
    try {
      if ('mediaSession' in navigator && navigator.mediaSession) {
        navigator.mediaSession.metadata = null;
        try { navigator.mediaSession.setActionHandler('play', null); } catch (e) {}
        try { navigator.mediaSession.setActionHandler('pause', null); } catch (e) {}
      }
    } catch (e) {}
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
  // v3.5.151：系统通知左侧图标用「带 mochi 字母的完整图标」（icon-512.png，
  // 与手机桌面快捷方式图标一致）。之前用 icon-192.png（纯心形小图标），
  // 用户看到的左侧是"爱心"而非带字母的 mochi 图标
  const NOTIFY_ICON = (function () {
    try { return new URL('./icon-512.png', location.href).href; } catch (e) { return ''; }
  })();
  // v3.5.135：统一走 Service Worker 显示通知——Chrome Android 规范：页面在后台（隐藏）
  //   时，页面脚本直接 new Notification() 会被静默抑制（通知不弹也不报错），
  //   标准做法是 navigator.serviceWorker.ready → reg.showNotification()（SW 独立于页面，
  //   隐藏时允许显示）。此辅助函数统一封装：优先 SW，失败回退页面 Notification。
  //   返回 Promise<boolean>：true=已提交显示（能否真正显示仍由系统通知权限决定）
  function showSysNotification(title, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      try {
        if (!('Notification' in window) || Notification.permission !== 'granted') { resolve(false); return; }
        if ('serviceWorker' in navigator && navigator.serviceWorker) {
          // v3.5.137：urgency:'high' 让通知以「高紧迫度」发送——Chrome 安卓上
          // 高紧迫度通知更可能以悬浮（head-up）形式显示在屏幕上方，而不是只进
          // 下拉通知栏；配合系统「横幅通知」权限即为微信式顶部弹窗
          const swOpts = Object.assign({}, opts);
          if (!swOpts.urgency) swOpts.urgency = 'high';
          // v3.5.139：调用方未指定图标时默认用 mochi 图标（避免黑色圆圈占位）
          if (!swOpts.icon && NOTIFY_ICON) swOpts.icon = NOTIFY_ICON;
          navigator.serviceWorker.ready.then(function (reg) {
            reg.showNotification(title, swOpts).then(function () { resolve(true); }, function () {
              // v3.5.142：逐级降级重发——带 image（图片缩略图）失败 → 去 image 重发；
              // 仍失败且带 icon → 再去 icon 重发；保证文字通知不因图片/图标异常整条丢失
              const tryNoImage = function () {
                if (swOpts.image) {
                  const noImg = Object.assign({}, swOpts);
                  delete noImg.image;
                  reg.showNotification(title, noImg).then(function () { resolve(true); }, function () {
                    if (swOpts.icon) {
                      const noIcon = Object.assign({}, swOpts);
                      delete noIcon.icon;
                      reg.showNotification(title, noIcon).then(function () { resolve(true); }, function () { resolve(false); });
                    } else {
                      resolve(false);
                    }
                  });
                } else if (swOpts.icon) {
                  const noIcon = Object.assign({}, swOpts);
                  delete noIcon.icon;
                  reg.showNotification(title, noIcon).then(function () { resolve(true); }, function () { resolve(false); });
                } else {
                  resolve(false);
                }
              };
              tryNoImage();
            });
          }).catch(function () {
            // SW 不可用回退页面路径：去掉 image 与 icon（页面 Notification 对
            // dataURL 图片/图标不稳定，带上会导致整条通知失败，v3.5.118 教训）
            const noMedia = Object.assign({}, opts);
            delete noMedia.image;
            delete noMedia.icon;
            try { new Notification(title, noMedia); resolve(true); } catch (e) { resolve(false); }
          });
        } else {
          const noMedia = Object.assign({}, opts);
          delete noMedia.image;
          delete noMedia.icon;
          try { new Notification(title, noMedia); resolve(true); } catch (e) { resolve(false); }
        }
      } catch (e) { resolve(false); }
    });
  }
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
          showSysNotification('通知已开启', { body: '后台消息提醒将正常弹窗' });
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
      // v3.5.144：聊天消息后台弹窗诊断——后台收不到聊天消息 ≠ 通知问题，
      // 多数是「后台根本没产生聊天消息」：主动发送按间隔+概率随机触发，且需页面存活
      try {
        const rc = (window.replyCfg && window.replyCfg()) || {};
        const asEn = rc['as-en'] === undefined ? 1 : rc['as-en'];
        if (asEn === 1) {
          const p = Number(rc['as-prob']) > 0 ? rc['as-prob'] : 30;
          const mn = Math.min(30, Number(rc['as-min']) || 5);
          const mx = Math.min(180, Number(rc['as-max']) || 10);
          env.push('✓ 主动发送：开启（每 ' + mn + '~' + mx + ' 分钟掷一次 · 概率 ' + p + '%）');
          if (rc['dnd-en'] === 1) env.push('  免打扰开启中（发送大幅减弱，最长 3 小时一次）');
        } else {
          env.push('✗ 主动发送：关闭（TA 不会主动发聊天消息 → 后台无聊天通知）');
        }
        env.push('  提示：TA 聊天消息按间隔随机产生，后台需保活让定时器存活才到点触发');
      } catch (e) {}
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        toast('环境检查：\n' + env.join('\n'));
        return;
      }
      // 环境 OK：真发一条测试通知（走 SW showNotification，页面隐藏也能显示）
      try {
        const name = store.get('lbl-partner') || 'TA';
        showSysNotification('后台通知测试', { body: '来自 ' + name + ' · 如果能看到这条，后台通知就通了' }).then(function (ok) {
          if (ok) {
            env.push('✓ 测试通知已发送（Service Worker）');
            // 红米/小米：系统级通知可能拦截（API 不报错但通知不显示）
            if (/miui|xiaomi|redmi|hyperos/i.test(navigator.userAgent) || /android/i.test(navigator.userAgent)) {
              env.push('悬浮开关：系统设置→通知管理→Chrome→通知类别/横幅通知→打开「在屏幕上方显示」');
            }
          } else {
            env.push('✗ 通知发送未受理（权限或系统通知被禁）');
          }
          toast('测试结果：\n' + env.join('\n'));
        });
      } catch (e) {
        toast('发送失败：\n' + env.join('\n'));
      }
    }
  }

  // v3.5.132：从后台回到前台时做一次状态检查——通知开但保活被关 / 权限被回收
  //   都是静默失效（页面照常运行、通知就是不弹），回到前台时主动提示一次
  // v3.5.137：回到前台时补弹应用内横幅——后台期间收到的消息系统通知已进通知栏，
  //   但页面切回前台时应用内顶部横幅（desk-msg）不会自动出现；这里根据未读数
  //   在屏幕上方补一条横幅（点击默认进聊天），实现「切回即见新消息」的体验
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    const saved = store.get('bg-notify');
    if (saved === '1') {
      const keep = document.getElementById('bg-keepalive');
      const keepOn = keep ? keep.checked : store.get('bg-keepalive') === '1';
      if (!keepOn) {
        toast('提醒：后台保活已关闭，后台消息到不了，通知不会弹（设置里开启）');
      }
    }
    // 补弹应用内横幅 + 汇总系统通知：有未读新消息且不在聊天页。
    // v3.5.154：回前台瞬间发一条汇总系统通知「你不在的时候收到 N 条新消息」——
    // 后台冻结导致消息/通知没能实时到达，回前台时一次告知，避免堆积消息陆续补发的混乱。
    // 30 秒内不重复发（防止反复切出切入刷屏）
    try {
      const chatPage = document.getElementById('page-chat');
      const inChat = chatPage && !chatPage.hidden;
      const unread = parseInt(store.get('chat-unread'), 10) || 0;
      const name = store.get('lbl-partner') || 'TA';
      if (!inChat && unread > 0 && window.showDeskPopup) {
        window.showDeskPopup({ name: name, text: '你不在的时候收到 ' + unread + ' 条新消息' });
        const now = Date.now();
        if (saved === '1' && 'Notification' in window && Notification.permission === 'granted' &&
            (!lastResumeNotifyAt || now - lastResumeNotifyAt > 30000)) {
          lastResumeNotifyAt = now;
          showSysNotification(name, { body: '你不在的时候收到 ' + unread + ' 条新消息' });
        }
      }
    } catch (e) {}
  });
  let lastResumeNotifyAt = 0; // v3.5.154：回前台汇总通知去重

  // 供 chat.js（showDeskPopup 联动）/ 信箱 / 朋友圈调用：TA 相关新事件且页面不在
  // 前台时弹系统通知。第三参 extra：name 通知标题（信箱/朋友圈/机制名，默认 TA 昵称）、
  // img 图片 dataURL（通知 image 字段显示缩略图）；头像 + 昵称 + 时间（精确到秒）+ 内容
  window.bgNotifyCheck = function (text, ts, extra) {
    if (!notifyEnabled) return;
    if (document.visibilityState === 'visible') return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    extra = extra || {};
    const name = extra.name || store.get('lbl-partner') || 'TA';
    let t = '';
    if (ts) {
      const d = new Date(ts);
      // v3.5.138：时间精确到秒（原只有 时:分）
      t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
    }
    // v3.5.142：正文防乱码——任何混入的 dataURL（图片/表情包/语音）都替换为占位文案，
    // 图片本体由 image 字段单独显示缩略图
    // v3.6.x：正则从 data:image/ 扩展到任意 data:MIME/（覆盖 data:audio/ 等），
    // 并清除语音「名|||dataURL」里 ||| 之后的音频 dataURL，避免 base64 乱码
    const body = String(text || '收到一条新消息')
      .replace(/data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '[附件]')
      .replace(/\|\|\|.*$/, '');
    const opts = { body: (t ? t + '  ' : '') + (body && body.length > 40 ? body.slice(0, 40) + '…' : body) };
    // v3.5.148：通知左侧图标固定用 mochi 应用图标（NOTIFY_ICON = icon-192.png，
    // showSysNotification 内部兜底）。之前把联系人头像（dataURL）塞进 icon——
    // 安卓 Chrome 对 dataURL 图标支持不稳定，失败降级后通知左侧会回退成浏览器
    // 默认图标（Chrome 图标）；头像改为不带（通知缩略图 image 字段保留）
    // v3.5.150：右侧大图（image）——消息自带图片优先（聊天图片/表情包），
    // 消息没带图时用联系人头像（代表"TA 发来的"，通知右侧始终有内容）；
    // 左侧图标仍为 mochi（icon=NOTIFY_ICON，v3.5.148），两者不冲突
    // v3.5.151：头像（256px 压缩图，dataURL 通常 <50KB）不做压缩直接设 image，
    // 压缩是异步的，之前头像也走压缩路径时可能因时序没显示成右侧头像
    let rightImg = '';
    if (extra.img && (extra.img.indexOf('data:') === 0 || /^https?:\/\//i.test(extra.img))) rightImg = extra.img;
    else {
      const avatar = store.get('avatar-partner') || '';
      if (avatar && (avatar.indexOf('data:') === 0 || /^https?:\/\//i.test(avatar))) rightImg = avatar;
    }
    // v3.5.152：dataURL → blob URL 再设 image——安卓 Chrome 对通知 image 字段的
    // dataURL 支持不稳定（经常不渲染），blob URL 是 http(s) 形式，Chrome 可靠渲染。
    // 右侧头像/消息图片都走这条路径；失败则不带图发送，文字通知不丢
    const sendNotify = function (img) {
      if (img) opts.image = img;
      showSysNotification(name, opts);
    };
    if (rightImg) {
      if (rightImg.indexOf('data:') === 0) {
        try {
          fetch(rightImg).then(function (r) { return r.blob(); }).then(function (b) {
            try { sendNotify(URL.createObjectURL(b)); } catch (e) { sendNotify(''); }
          }).catch(function () { sendNotify(''); });
        } catch (e) { sendNotify(''); }
      } else {
        sendNotify(rightImg);
      }
    } else {
      sendNotify('');
    }
  };
  // v3.5.147：通知缩略图压缩——canvas 把图片 dataURL 压到最长边 96px JPEG。
  // 压缩失败返回空串（调用方不带图发送，保证文字通知不丢）
  function compressNotifyImg(dataUrl, cb) {
    try {
      const img = new Image();
      img.onload = function () {
        try {
          const maxSide = 96;
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          cb(c.toDataURL('image/jpeg', 0.72));
        } catch (e) { cb(''); }
      };
      img.onerror = function () { cb(''); };
      img.src = dataUrl;
    } catch (e) { cb(''); }
  }
})();
