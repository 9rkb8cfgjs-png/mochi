// ===== 功能：双人 Pong 小游戏（聊天页更多功能 → Pong） =====
// 玩家控制左侧挡板，TA 由 AI 控制右侧挡板，球在双方之间持续运动。
// AI = 基础预测 + 反应延迟 + 移动速度限制 + 预测误差 + 概率行为池 + 行为冷却。
// 游戏结束后写入聊天记录（special:'pong'）+ TA 随机回应（内置三组字卡池）。
// 不依赖聊天 AI；音效用 Web Audio 生成短促 beep，可静音。
(function () {
  const panel = document.getElementById('chat-pong-panel');
  if (!panel) return;
  const canvas = document.getElementById('pong-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('pong-score');
  const hintEl = document.getElementById('pong-hint');
  const overlayEl = document.getElementById('pong-overlay');
  const overlayTitleEl = document.getElementById('pong-overlay-title');
  const overlayBodyEl = document.getElementById('pong-overlay-body');
  const overlayBtnEl = document.getElementById('pong-overlay-btn');
  const diffSel = document.getElementById('pong-diff');
  const soundBtn = document.getElementById('pong-sound');
  const closeBtn = document.getElementById('pong-close');
  const partnerNameEl = document.getElementById('pong-partner-name');
  const pauseBtn = document.getElementById('pong-pause');
  const fsBtn = document.getElementById('pong-fs');
  const overlayBtn2El = document.getElementById('pong-overlay-btn2');

  // ---- 逻辑尺寸（物理计算用；Canvas 实际像素按 DPR 缩放，CSS 拉伸到容器宽度） ----
  const W = 400, H = 240;
  const PADDLE_W = 8, PADDLE_H = 72;
  const PADDLE_GAP = 14;            // 挡板距边界
  const BALL_R = 6;
  const WIN_SCORE = 5;
  const INIT_SPEED = 4;
  const SPEED_INC = 0.2;
  const MAX_SPEED = 8;
  const PLAYER_MAX_SPEED = 7;       // 玩家挡板最大速度（px/tick）
  const FPS = 60;

  // ---- 难度参数（反应延迟/移动速度/预测误差/失误率/行为概率） ----
  const DIFFS = {
    easy:   { reactDelay: [0.32, 0.5], maxSpeed: 3.2, predictErr: 20, missRate: 0.07,
              beh: { early: 0.04, slow: 0.07, drift: 0.06, shift: 0.05, miss: 0.05, risky: 0.05 } },
    normal: { reactDelay: [0.2, 0.4],  maxSpeed: 4.3, predictErr: 11, missRate: 0.04,
              beh: { early: 0.06, slow: 0.05, drift: 0.05, shift: 0.04, miss: 0.03, risky: 0.08 } },
    hard:   { reactDelay: [0.12, 0.28], maxSpeed: 5.5, predictErr: 5,  missRate: 0.02,
              beh: { early: 0.07, slow: 0.03, drift: 0.03, shift: 0.03, miss: 0.02, risky: 0.1 } }
  };

  // ---- TA 游戏结束回应字卡池（内置，不依赖聊天 AI / 用户字卡库） ----
  const POOLS = {
    player_win: ['赢了？', '再来一局。', '这次你赢。', '还要继续吗？', '你反应挺快。', '差点接住。'],
    opponent_win: ['我赢了。', '还玩吗？', '这次是我赢。', '再来。', '你差点接住。', '下一局加油。'],
    draw: ['一起撞上的。', '算平手。', '再来一次。', '平局，再来。']
  };

  // ---- 音效（Web Audio 短促 beep，静音开关默认开） ----
  let audioCtx = null, soundOn = true;
  function beep(freq, dur, vol) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq; o.type = 'square';
      g.gain.value = vol || 0.06;
      o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime;
      o.start(t); g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.06));
      o.stop(t + (dur || 0.06));
    } catch (e) {}
  }
  function sfxWall() { beep(380, 0.04, 0.04); }
  function sfxPaddle() { beep(520, 0.05, 0.06); }
  function sfxScore() { beep(300, 0.12, 0.08); }
  function sfxWin() { beep(660, 0.18, 0.09); setTimeout(() => beep(880, 0.22, 0.09), 140); }

  // ---- 游戏状态 ----
  let state = null;
  let rafId = null, lastTs = 0, acc = 0;
  let running = false;

  function newState(diff) {
    const d = DIFFS[diff] || DIFFS.normal;
    return {
      diff: diff,
      playerScore: 0, opponentScore: 0,
      ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, speed: INIT_SPEED },
      player: { y: H / 2 - PADDLE_H / 2, vy: 0, targetY: H / 2 - PADDLE_H / 2 },
      opponent: { y: H / 2 - PADDLE_H / 2, vy: 0, targetY: H / 2 - PADDLE_H / 2, reactUntil: 0, aiNextAt: 0 },
      status: 'countdown',          // countdown | rally | scored | ended
      countdown: 3, countdownAt: 0,
      scorePauseUntil: 0,
      gameTime: 0, roundStartTs: 0,
      rallyHits: 0,                 // 本回合击球次数（球速随回合递增）
      playerStreak: 0, opponentStreak: 0,
      maxPlayerStreak: 0, maxOpponentStreak: 0,
      totalRounds: 0,
      // AI 概率行为状态
      beh: {
        active: null,               // {type, until}
        cooldown: {},               // {type: ts}
        consecCatch: 0              // TA 连续接球数
      },
      // 视觉反馈
      flashPaddle: 0, flashWall: 0, flashScore: 0,
      params: d
    };
  }

  // ---- 发球：随机方向 + ±15° 上下角度 ----
  function serve(s) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const ang = (Math.random() * 30 - 15) * Math.PI / 180;   // -15°~+15°
    const sp = INIT_SPEED;
    s.ball.x = W / 2; s.ball.y = H / 2;
    s.ball.vx = Math.cos(ang) * sp * dir;
    s.ball.vy = Math.sin(ang) * sp;
    s.ball.speed = sp;
    s.rallyHits = 0;
    s.status = 'rally';
    s.roundStartTs = s.gameTime;
  }

  // ---- 球轨迹预测：从当前状态推演到 x==targetX 处的 Y（含上下边界反弹） ----
  function predictY(s, targetX) {
    const b = s.ball;
    if (b.vx === 0) return b.y;
    const dir = Math.sign(b.vx);
    if ((targetX - b.x) * dir <= 0) return b.y;   // 球不会到达
    let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
    let guard = 0;
    while ((targetX - x) * dir > 0 && guard < 64) {
      guard++;
      const dt = (targetX - x) / vx;     // 直达时间
      // 上下边界反弹推演：y + vy*dt 是否越界
      let nextY = y + vy * dt;
      if (nextY < BALL_R) {
        // 先撞上边界再继续
        const tHit = (BALL_R - y) / vy;
        x += vx * tHit; y = BALL_R; vy = -vy;
        continue;
      }
      if (nextY > H - BALL_R) {
        const tHit = (H - BALL_R - y) / vy;
        x += vx * tHit; y = H - BALL_R; vy = -vy;
        continue;
      }
      return nextY;
    }
    return y;
  }

  // ---- AI 概率行为系统 ----
  // 行为冷却：同类型行为触发后 3~6 秒内不再触发
  const BEH_COOLDOWN = [3000, 6000];
  function behCanTrigger(s, type, now) {
    const last = s.beh.cooldown[type] || 0;
    return now - last > (s._cdLen && s._cdLen[type] || 4000);
  }
  function behTrigger(s, type, now, dur) {
    s.beh.active = { type: type, until: now + dur };
    const cd = BEH_COOLDOWN[0] + Math.random() * (BEH_COOLDOWN[1] - BEH_COOLDOWN[0]);
    s.beh.cooldown[type] = now + cd;
    s._cdLen = s._cdLen || {};
    s._cdLen[type] = cd;
  }
  function behActive(s, now) {
    if (s.beh.active && s.beh.active.until <= now) s.beh.active = null;
    return s.beh.active;
  }

  // ---- TA AI 决策（每次 AI 更新调用） ----
  function opponentAI(s, now) {
    const b = s.ball, o = s.opponent, p = s.params;
    const taX = PADDLE_GAP + PADDLE_W;
    const ballToTa = b.vx < 0;   // 球正在向 TA（左）移动

    // 危险状态提高 AI 更新频率（已在调用方处理，这里专注决策）
    let targetY = o.y;           // 默认保持

    if (!ballToTa) {
      // 球远离 TA：轻微回到中心 + 小概率「提前改变站位」
      const act = behActive(s, now);
      if (act && act.type === 'shift') {
        targetY = o.targetY;     // 保持上次选的站位
      } else {
        targetY = H / 2 - PADDLE_H / 2 + (Math.random() * 20 - 10);
      }
    } else {
      // 球向 TA 移动：预测落点
      let predY = predictY(s, taX);
      const predCenter = predY - PADDLE_H / 2;

      // 概率行为判定（仅当当前无激活行为）
      const act = behActive(s, now);
      if (!act) {
        const r = Math.random();
        const beh = p.beh;
        // ① 提前移动：球较远 + 轨迹明确
        const dist = b.x - taX;
        if (dist > 180 && behCanTrigger(s, 'early', now) && r < beh.early) {
          behTrigger(s, 'early', now, 600 + Math.random() * 400);
        }
        // ② 反应慢一点
        else if (behCanTrigger(s, 'slow', now) && r < beh.slow) {
          behTrigger(s, 'slow', now, 200 + Math.random() * 200);
          o.reactUntil = now + 180 + Math.random() * 180;
        }
        // ③ 偏离预测点
        else if (behCanTrigger(s, 'drift', now) && r < beh.drift) {
          behTrigger(s, 'drift', now, 400 + Math.random() * 300);
          predY += (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 10);
        }
        // ④ 提前改变站位（球远时）
        else if (dist > 200 && behCanTrigger(s, 'shift', now) && r < beh.shift) {
          behTrigger(s, 'shift', now, 1000 + Math.random() * 1000);
          o.targetY = Math.max(0, Math.min(H - PADDLE_H, predCenter + (Math.random() * 80 - 40)));
          targetY = o.targetY;
          return;   // 本帧直接用新站位
        }
        // ⑤ 随机失误
        else if (behCanTrigger(s, 'miss', now) && r < beh.miss) {
          behTrigger(s, 'miss', now, 300);
          predY += (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 15);
        }
        // ⑥ 连续成功后的冒险
        else if (s.beh.consecCatch >= 5 && behCanTrigger(s, 'risky', now) && r < beh.risky) {
          behTrigger(s, 'risky', now, 800 + Math.random() * 600);
          // 冒险：更早移动（预测更激进）或故意偏一点
          predY += (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 8);
        }
      } else {
        // 当前有激活行为：应用持续效果
        if (act.type === 'drift' || act.type === 'miss' || act.type === 'risky') {
          // 偏离已在触发时写入 predY，这里不重复加；保持自然追踪
        }
        if (act.type === 'slow') {
          // 反应慢：延迟期间不更新目标
          if (now < o.reactUntil) { targetY = o.targetY; return; }
        }
      }

      // 基础预测误差（每次都加少量噪声）
      predY += (Math.random() * 2 - 1) * p.predictErr * 0.3;
      // 随机失误概率（独立于行为池的小概率明显误差）
      if (Math.random() < p.missRate * 0.3) predY += (Math.random() < 0.5 ? -1 : 1) * 18;

      targetY = predY - PADDLE_H / 2;
    }

    o.targetY = Math.max(0, Math.min(H - PADDLE_H, targetY));
  }

  // ---- 挡板移动（受最大速度限制） ----
  function movePaddle(paddle, targetY, maxSpeed) {
    const diff = targetY - paddle.y;
    const step = Math.max(-maxSpeed, Math.min(maxSpeed, diff));
    paddle.y += step;
    paddle.vy = step;
    paddle.y = Math.max(0, Math.min(H - PADDLE_H, paddle.y));
  }

  // ---- 球与挡板碰撞 ----
  function checkPaddle(s) {
    const b = s.ball;
    // TA 挡板（左）
    const tx = PADDLE_GAP + PADDLE_W;
    if (b.vx < 0 && b.x - BALL_R <= tx && b.x - BALL_R >= PADDLE_GAP - 4 && b.y >= s.opponent.y && b.y <= s.opponent.y + PADDLE_H) {
      b.x = tx + BALL_R;
      bouncePaddle(s, s.opponent, false);
    }
    // 玩家挡板（右）
    const px = W - PADDLE_GAP - PADDLE_W;
    if (b.vx > 0 && b.x + BALL_R >= px && b.x + BALL_R <= W - PADDLE_GAP + 4 && b.y >= s.player.y && b.y <= s.player.y + PADDLE_H) {
      b.x = px - BALL_R;
      bouncePaddle(s, s.player, true);
    }
  }

  // ---- 反弹角度：根据击球点相对挡板中心位置改变 Y 速度 ----
  function bouncePaddle(s, paddle, isPlayer) {
    const b = s.ball;
    const hit = (b.y - (paddle.y + PADDLE_H / 2)) / (PADDLE_H / 2);   // -1~1
    // 球速递增（每次碰挡板 +0.2，上限 8）
    s.rallyHits++;
    const newSpeed = Math.min(MAX_SPEED, INIT_SPEED + s.rallyHits * SPEED_INC);
    b.speed = newSpeed;
    const ang = hit * (Math.PI / 3.2);   // 最大约 56°
    b.vx = (isPlayer ? -1 : 1) * Math.cos(ang) * newSpeed;
    b.vy = Math.sin(ang) * newSpeed;
    s.flashPaddle = 1;
    sfxPaddle();
    if (!isPlayer) {
      // TA 接球成功：连续计数 + 概率行为冒险触发条件
      s.beh.consecCatch++;
    } else {
      // 玩家接球成功：重置 TA 连续计数（玩家打断连击）
      s.beh.consecCatch = 0;
    }
  }

  // ---- 一步物理更新 ----
  function step(s, now) {
    if (s.status === 'ended') return;
    s.gameTime += 1000 / FPS;

    // 倒计时
    if (s.status === 'countdown') {
      if (now >= s.countdownAt) {
        s.countdown--;
        s.countdownAt = now + 700;
        if (s.countdown <= 0) serve(s);
      }
      return;
    }
    // 得分后暂停
    if (s.status === 'scored') {
      if (now >= s.scorePauseUntil) serve(s);
      return;
    }
    if (s.status !== 'rally') return;

    // 玩家挡板：朝 targetY 移动（受最大速度限制）
    movePaddle(s.player, s.player.targetY, PLAYER_MAX_SPEED);

    // TA AI 更新频率：危险状态（球向 TA 且较近）提高频率
    const b = s.ball;
    const danger = b.vx < 0 && (b.x - PADDLE_GAP - PADDLE_W) < 220;
    const aiInterval = danger ? 50 : 110;
    if (now >= s.opponent.aiNextAt) {
      opponentAI(s, now);
      s.opponent.aiNextAt = now + aiInterval;
    }
    // TA 挡板移动（受最大速度限制 + 反应延迟由 aiInterval 体现）
    movePaddle(s.opponent, s.opponent.targetY, s.params.maxSpeed);

    // 球移动
    b.x += b.vx; b.y += b.vy;

    // 上下边界反弹
    if (b.y - BALL_R < 0) { b.y = BALL_R; b.vy = -b.vy; s.flashWall = 1; sfxWall(); }
    if (b.y + BALL_R > H) { b.y = H - BALL_R; b.vy = -b.vy; s.flashWall = 1; sfxWall(); }

    // 挡板碰撞
    checkPaddle(s);

    // 得分判定
    if (b.x - BALL_R > W) {
      // 球越过右边界 → TA 得分
      s.opponentScore++;
      s.opponentStreak++; s.playerStreak = 0;
      s.maxOpponentStreak = Math.max(s.maxOpponentStreak, s.opponentStreak);
      s.totalRounds++;
      s.beh.consecCatch = 0;
      onScore(s, now, 'opponent');
    } else if (b.x + BALL_R < 0) {
      // 球越过左边界 → 玩家得分
      s.playerScore++;
      s.playerStreak++; s.opponentStreak = 0;
      s.maxPlayerStreak = Math.max(s.maxPlayerStreak, s.playerStreak);
      s.totalRounds++;
      s.beh.consecCatch = 0;
      onScore(s, now, 'player');
    }

    // 视觉反馈衰减
    if (s.flashPaddle > 0) s.flashPaddle = Math.max(0, s.flashPaddle - 0.08);
    if (s.flashWall > 0) s.flashWall = Math.max(0, s.flashWall - 0.1);
    if (s.flashScore > 0) s.flashScore = Math.max(0, s.flashScore - 0.05);
  }

  function onScore(s, now, who) {
    sfxScore();
    s.flashScore = 1;
    if (s.playerScore >= WIN_SCORE || s.opponentScore >= WIN_SCORE) {
      endGame(s, now);
    } else {
      s.status = 'scored';
      s.scorePauseUntil = now + 900;
    }
  }

  // ---- 游戏结束 ----
  function endGame(s, now) {
    s.status = 'ended';
    clearSaved();   // 对局已结束，清除保存
    sfxWin();
    const playerWin = s.playerScore > s.opponentScore;
    const draw = s.playerScore === s.opponentScore;
    const sec = Math.round((s.gameTime - 0) / 1000);
    const fmt = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
    const title = draw ? '平局' : (playerWin ? '🏆 你赢了' : 'TA 赢了');
    const body =
      '<div class="pong-end-score">你 ' + s.playerScore + ' : ' + s.opponentScore + ' TA</div>' +
      '<div class="pong-end-stat">总回合 ' + s.totalRounds + ' · 用时 ' + fmt(sec) + '</div>' +
      '<div class="pong-end-stat">你的最高连得 ' + s.maxPlayerStreak + ' · TA 最高连得 ' + s.maxOpponentStreak + '</div>';
    showOverlay(title, body, '再玩一次');
    // 写入聊天记录 + TA 回应
    try {
      if (window.chatAddSystem) {
        window.chatAddSystem('Pong · 你 ' + s.playerScore + ' : ' + s.opponentScore + ' TA' + (draw ? ' · 平局' : playerWin ? ' · 你赢' : ' · TA赢'), { special: 'pong' });
      }
      // TA 随机回应
      const pool = draw ? POOLS.draw : (playerWin ? POOLS.player_win : POOLS.opponent_win);
      const reply = pool[Math.floor(Math.random() * pool.length)];
      setTimeout(() => {
        try {
          if (window.chatAddIn) window.chatAddIn(reply, { silent: true });
          else if (window.chatSendMsg) window.chatSendMsg(reply);
        } catch (e) {}
      }, 700);
    } catch (e) {}
  }

  // ---- 渲染 ----
  function render(s) {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    // 背景
    ctx.fillStyle = '#0f1420';
    ctx.fillRect(0, 0, W, H);
    // 中线（虚线）
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.setLineDash([]);
    // 挡板：TA 在左（橙色），玩家在右（蓝色）
    ctx.fillStyle = s.flashPaddle > 0 ? '#ffb38a' : '#e8eefc';
    ctx.fillRect(PADDLE_GAP, s.opponent.y, PADDLE_W, PADDLE_H);
    ctx.fillStyle = s.flashPaddle > 0 ? '#7fd1ff' : '#e8eefc';
    ctx.fillRect(W - PADDLE_GAP - PADDLE_W, s.player.y, PADDLE_W, PADDLE_H);
    // 球（碰墙时轻微闪烁）
    const b = s.ball;
    ctx.fillStyle = s.flashWall > 0 ? '#ffe08a' : '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
    // 倒计时 / 得分暂停提示
    ctx.restore();
  }

  function renderScore(s) {
    if (!scoreEl) return;
    const scale = s.flashScore > 0 ? 'transform:scale(' + (1 + s.flashScore * 0.3) + ')' : '';
    scoreEl.innerHTML = '<span class="pong-s-you">你 ' + s.playerScore + '</span><span class="pong-s-sep">:</span><span class="pong-s-ta">' + s.opponentScore + ' TA</span>';
    scoreEl.style.cssText = scale;
  }

  function renderHint(s, now) {
    if (!hintEl) return;
    if (s.status === 'countdown') {
      hintEl.textContent = s.countdown > 0 ? String(s.countdown) : '开始！';
    } else if (s.status === 'scored') {
      hintEl.textContent = '得分 · 重新发球…';
    } else if (s.status === 'rally') {
      hintEl.textContent = '';
    } else {
      hintEl.textContent = '';
    }
  }

  // ---- 主循环 ----
  function loop(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;
    acc += dt;
    const frame = 1000 / FPS;
    let guard = 0;
    while (acc >= frame && guard < 5) {
      step(state, ts);
      acc -= frame;
      guard++;
    }
    render(state);
    renderScore(state);
    renderHint(state, ts);
    rafId = requestAnimationFrame(loop);
  }

  // ---- Canvas 尺寸适配（DPR 清晰） ----
  function fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const box = canvas.parentElement;   // .pong-canvas-box
    if (isFs) {
      // 全屏：按视口计算 canvas 最大尺寸（保持 5:3 比例），显式设置 canvas + canvas-box
      const availW = window.innerWidth - 24;
      const availH = window.innerHeight - 170;   // head+bar+score+foot+padding
      let cw = availW;
      let ch = Math.round(cw * H / W);
      if (ch > availH) { ch = availH; cw = Math.round(ch * W / H); }
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      if (box) { box.style.width = cw + 'px'; box.style.height = ch + 'px'; }
    } else {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      canvas.style.width = '';
      canvas.style.height = (rect.width * H / W) + 'px';
      if (box) { box.style.width = ''; box.style.height = ''; }
    }
  }

  // ---- 覆盖层（开始 / 结束） ----
  function showOverlay(title, body, btn) {
    if (!overlayEl) return;
    if (overlayTitleEl) overlayTitleEl.innerHTML = title || '';
    if (overlayBodyEl) overlayBodyEl.innerHTML = body || '';
    if (overlayBtnEl) overlayBtnEl.textContent = btn || '开始';
    overlayEl.hidden = false;
  }
  function hideOverlay() { if (overlayEl) overlayEl.hidden = true; }

  // ---- 开始 / 停止 ----
  function startGame(diff) {
    state = newState(diff || 'normal');
    state.status = 'countdown';
    state.countdown = 3;
    state.countdownAt = performance.now() + 400;
    hideOverlay();
    fitCanvas();
    clearSaved();
    paused = false;
    if (pauseBtn) pauseBtn.textContent = '⏸';
    running = true;
    lastTs = 0; acc = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }
  function stopGame() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // ---- 保存 / 恢复对局（localStorage，每联系人独立） ----
  const SAVE_KEY = (window.activePrefix && window.activePrefix() || 'xy-home-v2') + ':pong-saved';
  let paused = false;
  function canSave(s) {
    // 对局已经开始（有比分或球已发）才保存；纯倒计时/已结束不保存
    return s && s.status !== 'ended' && (s.playerScore + s.opponentScore > 0 || s.status === 'rally' || s.status === 'scored');
  }
  function saveGame() {
    try {
      if (!canSave(state)) { localStorage.removeItem(SAVE_KEY); return; }
      const s = state;
      // 清除时间相对字段（恢复时重置）
      const clone = JSON.parse(JSON.stringify(s));
      clone.countdownAt = 0; clone.scorePauseUntil = 0;
      clone.opponent.aiNextAt = 0; clone.opponent.reactUntil = 0;
      clone._cdLen = null;
      localStorage.setItem(SAVE_KEY, JSON.stringify(clone));
    } catch (e) {}
  }
  function loadSaved() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.status === 'ended') return null;
      return s;
    } catch (e) { return null; }
  }
  function clearSaved() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
  function resumeGame() {
    const s = loadSaved();
    if (!s) return false;
    // 恢复：重置时间字段，强制 rally（球位置/速度都在，直接继续）
    s.status = 'rally';
    s.countdownAt = 0; s.scorePauseUntil = 0;
    s.opponent.aiNextAt = 0; s.opponent.reactUntil = 0;
    s.params = DIFFS[s.diff] || DIFFS.normal;
    state = s;
    hideOverlay();
    fitCanvas();
    paused = false;
    if (pauseBtn) pauseBtn.textContent = '⏸';
    running = true;
    lastTs = 0; acc = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    return true;
  }

  // ---- 暂停 / 继续 ----
  function togglePause() {
    if (!state || state.status === 'ended') return;
    paused = !paused;
    if (paused) {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      if (pauseBtn) pauseBtn.textContent = '▶';
      if (hintEl) hintEl.textContent = '已暂停';
    } else {
      running = true;
      lastTs = 0; acc = 0;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
      if (pauseBtn) pauseBtn.textContent = '⏸';
    }
  }

  // ---- 全屏（游戏面板占满视口，沉浸式） ----
  let isFs = false;
  function toggleFs() {
    isFs = !isFs;
    if (panel) panel.classList.toggle('pong-fs', isFs);
    if (fsBtn) fsBtn.textContent = isFs ? '⤢' : '⛶';
    // 全屏过渡后重适配 canvas
    setTimeout(() => { if (panel && !panel.hidden) fitCanvas(); }, 60);
  }

  // ---- 输入：触摸 / 鼠标拖动（左半边控制玩家挡板） ----
  function inputY(clientY) {
    if (!state || state.status === 'ended') return;
    const rect = canvas.getBoundingClientRect();
    const y = (clientY - rect.top) / rect.height * H;
    state.player.targetY = Math.max(0, Math.min(H - PADDLE_H, y - PADDLE_H / 2));
  }
  let touching = false;
  canvas.addEventListener('touchstart', (e) => {
    if (!running) return;
    touching = true;
    const t = e.touches[0];
    if (t) inputY(t.clientY);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!running || !touching) return;
    const t = e.touches[0];
    if (t) inputY(t.clientY);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', () => { touching = false; });
  canvas.addEventListener('mousedown', (e) => { if (running) { touching = true; inputY(e.clientY); } });
  canvas.addEventListener('mousemove', (e) => { if (running && touching) inputY(e.clientY); });
  window.addEventListener('mouseup', () => { touching = false; });

  // 键盘：↑↓ / WS
  const keys = {};
  document.addEventListener('keydown', (e) => {
    if (!running || !panel || panel.hidden) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w' || k === 'arrowdown' || k === 's') {
      keys[k] = true;
      e.preventDefault();
    }
  });
  document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (keys[k]) keys[k] = false;
  });
  // 键盘挡板目标持续移动（在 step 之前更新 targetY）
  setInterval(() => {
    if (!running || !state) return;
    let dy = 0;
    if (keys['arrowup'] || keys['w']) dy -= PLAYER_MAX_SPEED;
    if (keys['arrowdown'] || keys['s']) dy += PLAYER_MAX_SPEED;
    if (dy !== 0) state.player.targetY = Math.max(0, Math.min(H - PADDLE_H, state.player.targetY + dy));
  }, 1000 / FPS);

  // ---- 难度选择 / 静音 / 关闭 ----
  if (diffSel) {
    diffSel.addEventListener('change', () => {
      if (state && state.status === 'countdown') {
        // 倒计时阶段可改难度
        startGame(diffSel.value);
      }
    });
  }
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      soundOn = !soundOn;
      soundBtn.textContent = soundOn ? '🔊' : '🔇';
      soundBtn.classList.toggle('pong-sound-off', !soundOn);
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePongPanel(); });
  if (overlayBtnEl) overlayBtnEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const diff = (diffSel && diffSel.value) || 'normal';
    startGame(diff);
  });
  if (pauseBtn) pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
  if (fsBtn) fsBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFs(); });
  if (overlayBtn2El) overlayBtn2El.addEventListener('click', (e) => {
    e.stopPropagation();
    resumeGame();
  });

  // ---- 入口（供 chat.js 调用） ----
  window.openPongPanel = function () {
    if (!panel) return;
    if (partnerNameEl) {
      try { partnerNameEl.textContent = (window.activeStore && window.activeStore().get('lbl-partner')) || 'TA'; } catch (e) { partnerNameEl.textContent = 'TA'; }
    }
    if (isFs) toggleFs();   // 防上次全屏残留
    panel.hidden = false;
    fitCanvas();
    paused = false;
    if (pauseBtn) pauseBtn.textContent = '⏸';
    // 内存里还有进行中的对局（同会话关闭后重开）→ 直接继续
    if (canSave(state)) {
      state.status = 'rally';
      state.opponent.aiNextAt = 0; state.opponent.reactUntil = 0;
      hideOverlay();
      running = true; lastTs = 0; acc = 0;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
      return;
    }
    // 检查 localStorage 保存的对局（刷新页面后恢复）
    const saved = loadSaved();
    if (saved) {
      showOverlay('双人 Pong', '<div class="pong-start-tip">有未完成的对局<br>你 ' + saved.playerScore + ' : ' + saved.opponentScore + ' TA</div><div class="pong-start-ctrl">手机：左半边上下拖动<br>电脑：↑↓ 或 W S</div>', '重新开始');
      if (overlayBtn2El) overlayBtn2El.hidden = false;
    } else {
      showOverlay('双人 Pong', '<div class="pong-start-tip">你控制左侧挡板<br>先得 ' + WIN_SCORE + ' 分获胜</div><div class="pong-start-ctrl">手机：左半边上下拖动<br>电脑：↑↓ 或 W S</div>', '开始');
      if (overlayBtn2El) overlayBtn2El.hidden = true;
    }
    stopGame();
  };
  window.closePongPanel = function () {
    if (canSave(state)) saveGame();   // 保存进行中的对局
    stopGame();
    if (isFs) toggleFs();
    if (panel) panel.hidden = true;
  };
  // 切换联系人桌面时关闭（chat.js 会触发 contact-switched）
  document.addEventListener('contact-switched', () => { try { closePongPanel(); } catch (e) {} });
  // 窗口尺寸变化时重适配
  window.addEventListener('resize', () => { if (panel && !panel.hidden) fitCanvas(); });
})();