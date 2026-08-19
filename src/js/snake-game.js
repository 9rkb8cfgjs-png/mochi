// ===== 双人贪吃蛇（聊天更多功能 · 我 vs TA，TA 带行为池 AI）=====
// 20×20 地图 / 双蛇同时移动 / 统一碰撞结算（公平）/ TA=生存判断+目标评分+概率行为池+冷却
// 难度（速度）+ 暂停 + 全屏 + 保存/继续对局（localStorage）
(function () {
  'use strict';
  const GRID = 20;
  const INIT_LEN = 3;
  const FOOD_TARGET = 2;
  const PREFIX = (window.activePrefix && window.activePrefix()) || 'xy-home-v2';
  const KEY = PREFIX + ':snake-score';
  const SAVE_KEY = PREFIX + ':snake-saved';
  const PARTNER_KEY = PREFIX + ':lbl-partner';

  // 难度：tick 间隔(ms)按时间段 [0-30s, 30-60s, 60-90s, 90s+]
  const DIFFS = {
    easy:   { ticks: [280, 260, 240, 220] },
    normal: { ticks: [220, 200, 180, 160] },
    hard:   { ticks: [160, 140, 120, 100] }
  };

  const BEHAVIORS = {
    randomTurn:    { prob: 0.08, cd: 6000 },
    changeTarget:  { prob: 0.06, cd: 7000 },
    contestFood:   { prob: 0.20, cd: 5000 },
    giveUpContest: { prob: 0.10, cd: 5000 },
    chasePlayer:   { prob: 0.05, cd: 8000 },
    avoidPlayer:   { prob: 0.12, cd: 5000 },
    speedUp:       { prob: 0.03, cd: 10000 },
    pause:         { prob: 0.02, cd: 12000 },
    detour:        { prob: 0.07, cd: 7000 }
  };

  let panel, canvas, ctx, scoreEl, hintEl, startBtn, restartBtn, resumeBtn, resultEl, dpadEl, diffSel, pauseBtn, fsBtn;
  let state = null;
  let behavior = null;
  let loopTimer = null, countdownTimer = null;
  let touchStart = null;
  let audioCtx = null;
  let paused = false;
  let isFs = false;
  let pauseAt = 0;

  function $(id) { return document.getElementById(id); }

  function beep(freq, dur) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq; o.type = 'square'; g.gain.value = 0.04;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }
  const SFX = {
    eat: function () { beep(880, 0.07); },
    hit: function () { beep(180, 0.18); },
    win: function () { beep(660, 0.12); setTimeout(function () { beep(880, 0.14); }, 130); }
  };

  function readScore() { try { return JSON.parse(localStorage.getItem(KEY) || '{"w":0,"l":0,"d":0}'); } catch (e) { return { w: 0, l: 0, d: 0 }; } }
  function writeScore(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function renderScore() {
    if (!scoreEl) return;
    const s = readScore();
    scoreEl.textContent = '胜 ' + s.w + ' · 负 ' + s.l + ' · 平 ' + s.d;
  }

  function initEls() {
    panel = $('chat-snake-panel');
    if (!panel) return;
    canvas = $('snake-canvas');
    ctx = canvas && canvas.getContext('2d');
    scoreEl = $('snake-score');
    hintEl = $('snake-hint');
    startBtn = $('snake-start');
    restartBtn = $('snake-restart');
    resumeBtn = $('snake-resume');
    resultEl = $('snake-result');
    dpadEl = $('snake-dpad');
    diffSel = $('snake-diff');
    pauseBtn = $('snake-pause');
    fsBtn = $('snake-fs');
    if (startBtn) startBtn.addEventListener('click', function (e) { e.stopPropagation(); startGame(diffSel ? diffSel.value : 'normal'); });
    if (restartBtn) restartBtn.addEventListener('click', function (e) { e.stopPropagation(); startGame(diffSel ? diffSel.value : 'normal'); });
    if (resumeBtn) resumeBtn.addEventListener('click', function (e) { e.stopPropagation(); resumeGame(); });
    if (pauseBtn) pauseBtn.addEventListener('click', function (e) { e.stopPropagation(); togglePause(); });
    if (fsBtn) fsBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleFs(); });
    const closeBtn = $('chat-snake-close');
    if (closeBtn) closeBtn.addEventListener('click', function (e) { e.stopPropagation(); closeSnakePanel(); });
    setupInput();
    document.addEventListener('contact-switched', function () { try { closeSnakePanel(); state = null; behavior = null; } catch (e) {} });
  }

  function setupInput() {
    if (!canvas) return;
    canvas.addEventListener('touchstart', function (e) {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    canvas.addEventListener('touchend', function (e) {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) setPlayerDir(dx > 0 ? 1 : -1, 0);
      else setPlayerDir(0, dy > 0 ? 1 : -1);
    }, { passive: true });
    if (dpadEl) {
      dpadEl.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-dir]');
        if (!btn) return;
        e.stopPropagation();
        const d = btn.dataset.dir;
        if (d === 'up') setPlayerDir(0, -1);
        else if (d === 'down') setPlayerDir(0, 1);
        else if (d === 'left') setPlayerDir(-1, 0);
        else if (d === 'right') setPlayerDir(1, 0);
      });
    }
    document.addEventListener('keydown', function (e) {
      if (!panel || panel.hidden) return;
      if (!state || state.status !== 'playing') return;
      const k = e.key.toLowerCase();
      let used = true;
      if (k === 'arrowup' || k === 'w') setPlayerDir(0, -1);
      else if (k === 'arrowdown' || k === 's') setPlayerDir(0, 1);
      else if (k === 'arrowleft' || k === 'a') setPlayerDir(-1, 0);
      else if (k === 'arrowright' || k === 'd') setPlayerDir(1, 0);
      else used = false;
      if (used) e.preventDefault();
    });
  }

  function setPlayerDir(x, y) {
    if (!state || state.status !== 'playing') return;
    const p = state.player;
    if (!p.alive) return;
    if (x === -p.dir.x && y === -p.dir.y) return;
    p.nextDir = { x: x, y: y };
  }

  function newGame(diff) {
    const py = Math.floor(GRID / 2);
    const playerBody = [];
    for (let i = 0; i < INIT_LEN; i++) playerBody.push({ x: 4 - i, y: py });
    const oppBody = [];
    for (let i = 0; i < INIT_LEN; i++) oppBody.push({ x: (GRID - 5) + i, y: py });
    state = {
      diff: diff || 'normal',
      player: { body: playerBody, dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 }, alive: true, score: 0, foodCount: 0 },
      opp:    { body: oppBody,    dir: { x: -1, y: 0 }, nextDir: { x: -1, y: 0 }, alive: true, score: 0, foodCount: 0 },
      foods: [],
      status: 'idle',
      startTime: 0,
      elapsed: 0
    };
    behavior = { current: null, until: 0, stepLeft: 0, cooldowns: {}, targetFood: null, speedUp: false, speedUpUntil: 0 };
    maintainFood();
  }

  function startGame(diff) {
    if (!panel || panel.hidden) return;
    stopLoop();
    paused = false;
    if (pauseBtn) pauseBtn.textContent = '⏸';
    if (startBtn) { startBtn.hidden = true; startBtn.textContent = '开始'; }
    if (restartBtn) restartBtn.hidden = true;
    if (resumeBtn) resumeBtn.hidden = true;
    if (resultEl) { resultEl.hidden = true; resultEl.innerHTML = ''; }
    newGame(diff);
    render();
    let n = 3;
    state.status = 'countdown';
    const step = function () {
      if (!state || state.status !== 'countdown') return;
      if (n > 0) {
        if (hintEl) hintEl.textContent = '准备 · ' + n;
        n--;
        countdownTimer = setTimeout(step, 700);
      } else {
        if (hintEl) hintEl.textContent = '滑动 / 方向键控制 · 别撞墙';
        state.status = 'playing';
        state.startTime = Date.now();
        loopTimer = setTimeout(tick, currentTickInterval());
      }
    };
    step();
  }

  function currentTickInterval() {
    const t = state.elapsed;
    const ticks = (DIFFS[state.diff || 'normal'] || DIFFS.normal).ticks;
    let base;
    if (t < 30000) base = ticks[0];
    else if (t < 60000) base = ticks[1];
    else if (t < 90000) base = ticks[2];
    else base = ticks[3];
    if (behavior && behavior.speedUp) base = Math.max(60, base - 35);
    return base;
  }

  function tick() {
    if (!state || state.status !== 'playing') return;
    state.elapsed = Date.now() - state.startTime;
    applyDir(state.player);
    aiDecide();
    applyDir(state.opp);
    const r = resolveCollisions();
    if (!r.pDie) {
      state.player.body.unshift(r.pNew);
      if (r.pEat) { eatFood(r.pNew); state.player.score += 10; state.player.foodCount++; SFX.eat(); }
      else state.player.body.pop();
    } else { state.player.alive = false; SFX.hit(); }
    if (!r.oDie) {
      state.opp.body.unshift(r.oNew);
      if (r.oEat) { eatFood(r.oNew); state.opp.score += 10; state.opp.foodCount++; }
      else state.opp.body.pop();
    } else { state.opp.alive = false; }
    const ti = currentTickInterval();
    if (state.player.alive) state.player.score += ti / 1000;
    if (state.opp.alive) state.opp.score += ti / 1000;
    render();
    if (checkEnd()) return;
    loopTimer = setTimeout(tick, ti);
  }

  function applyDir(snake) {
    const nd = snake.nextDir;
    if (nd && (nd.x !== -snake.dir.x || nd.y !== -snake.dir.y)) snake.dir = nd;
  }

  function bodySet(body, dropTail) {
    const s = {};
    const end = dropTail ? body.length - 1 : body.length;
    for (let i = 0; i < end; i++) s[body[i].x + ',' + body[i].y] = true;
    return s;
  }

  function resolveCollisions() {
    const p = state.player, o = state.opp;
    const ph = p.body[0], oh = o.body[0];
    const pNew = { x: ph.x + p.dir.x, y: ph.y + p.dir.y };
    const oNew = { x: oh.x + o.dir.x, y: oh.y + o.dir.y };
    const pEat = state.foods.some(function (f) { return f.x === pNew.x && f.y === pNew.y; });
    const oEat = state.foods.some(function (f) { return f.x === oNew.x && f.y === oNew.y; });
    const pSelf = bodySet(p.body, !pEat);
    const oSelf = bodySet(o.body, !oEat);
    let pDie = false, oDie = false;
    if (pNew.x < 0 || pNew.x >= GRID || pNew.y < 0 || pNew.y >= GRID) pDie = true;
    if (oNew.x < 0 || oNew.x >= GRID || oNew.y < 0 || oNew.y >= GRID) oDie = true;
    if (!pDie && pSelf[pNew.x + ',' + pNew.y]) pDie = true;
    if (!oDie && oSelf[oNew.x + ',' + oNew.y]) oDie = true;
    if (!pDie && oSelf[pNew.x + ',' + pNew.y]) pDie = true;
    if (!oDie && pSelf[oNew.x + ',' + oNew.y]) oDie = true;
    if (pNew.x === oNew.x && pNew.y === oNew.y) { pDie = true; oDie = true; }
    return { pNew: pNew, oNew: oNew, pEat: pEat, oEat: oEat, pDie: pDie, oDie: oDie };
  }

  function spawnFood() {
    const occ = {};
    state.player.body.forEach(function (s) { occ[s.x + ',' + s.y] = true; });
    state.opp.body.forEach(function (s) { occ[s.x + ',' + s.y] = true; });
    state.foods.forEach(function (f) { occ[f.x + ',' + f.y] = true; });
    const empty = [];
    for (let x = 0; x < GRID; x++) for (let y = 0; y < GRID; y++) if (!occ[x + ',' + y]) empty.push({ x: x, y: y });
    if (!empty.length) return null;
    return empty[Math.floor(Math.random() * empty.length)];
  }
  function maintainFood() {
    while (state.foods.length < FOOD_TARGET) {
      const f = spawnFood();
      if (!f) break;
      state.foods.push(f);
    }
  }
  function eatFood(pos) {
    for (let i = state.foods.length - 1; i >= 0; i--) {
      if (state.foods[i].x === pos.x && state.foods[i].y === pos.y) { state.foods.splice(i, 1); break; }
    }
    maintainFood();
  }

  function aiDecide() {
    const o = state.opp;
    if (!o.alive) return;
    behaviorTick();
    const head = o.body[0];
    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    const pHead = state.player.body[0];
    const pNew = { x: pHead.x + state.player.dir.x, y: pHead.y + state.player.dir.y };
    const candidates = [];
    dirs.forEach(function (d) {
      if (d.x === -o.dir.x && d.y === -o.dir.y) return;
      const nx = head.x + d.x, ny = head.y + d.y;
      if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) return;
      const eat = state.foods.some(function (f) { return f.x === nx && f.y === ny; });
      for (let i = 0; i < o.body.length - (eat ? 0 : 1); i++) if (o.body[i].x === nx && o.body[i].y === ny) return;
      for (let i = 0; i < state.player.body.length - 1; i++) if (state.player.body[i].x === nx && state.player.body[i].y === ny) return;
      if (nx === pNew.x && ny === pNew.y) return;
      candidates.push(d);
    });
    if (!candidates.length) { o.nextDir = { x: o.dir.x, y: o.dir.y }; return; }
    const target = currentTarget();
    const scored = candidates.map(function (d) { return { d: d, score: scoreDirection(d, target, head) }; });
    scored.sort(function (a, b) { return b.score - a.score; });
    let chosen;
    if ((behavior.current === 'randomTurn' || behavior.current === 'detour') && scored.length >= 2) {
      chosen = scored[1].d;
    } else {
      chosen = scored[0].d;
    }
    o.nextDir = chosen;
  }

  function scoreDirection(d, target, head) {
    const nx = head.x + d.x, ny = head.y + d.y;
    let score = 0;
    if (target) {
      const dist = Math.abs(nx - target.x) + Math.abs(ny - target.y);
      const w = behavior.speedUp ? 4 : 2;
      score += (GRID * 2 - dist) * w;
    }
    score += floodFillSize(nx, ny) * 0.6;
    const o = state.opp;
    for (let i = 1; i < o.body.length; i++) {
      const s = o.body[i];
      const dd = Math.abs(nx - s.x) + Math.abs(ny - s.y);
      if (dd <= 1) score -= 8;
    }
    const pHead = state.player.body[0];
    const pd = Math.abs(nx - pHead.x) + Math.abs(ny - pHead.y);
    if (behavior.current === 'avoidPlayer') score -= (12 - pd) * 3;
    else if (behavior.current === 'chasePlayer') score += (12 - pd) * 2;
    return score;
  }

  function floodFillSize(sx, sy) {
    const blocked = {};
    state.player.body.forEach(function (s) { blocked[s.x + ',' + s.y] = true; });
    state.opp.body.forEach(function (s) { blocked[s.x + ',' + s.y] = true; });
    const visited = {};
    const q = [[sx, sy]];
    visited[sx + ',' + sy] = true;
    let count = 0;
    while (q.length && count < 50) {
      const cur = q.shift();
      count++;
      const adj = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (let i = 0; i < 4; i++) {
        const nx = cur[0] + adj[i][0], ny = cur[1] + adj[i][1], k = nx + ',' + ny;
        if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
        if (visited[k] || blocked[k]) continue;
        visited[k] = true; q.push([nx, ny]);
      }
    }
    return count;
  }

  function currentTarget() {
    const o = state.opp;
    if (behavior.current === 'chasePlayer') return state.player.body[0];
    if (behavior.current === 'pause') return null;
    const foods = state.foods;
    if (!foods.length) return null;
    if (behavior.targetFood) {
      const t = foods.find(function (f) { return f.x === behavior.targetFood.x && f.y === behavior.targetFood.y; });
      if (t) return t;
    }
    const h = o.body[0];
    let best = foods[0], bd = Infinity;
    foods.forEach(function (f) { const d = Math.abs(f.x - h.x) + Math.abs(f.y - h.y); if (d < bd) { bd = d; best = f; } });
    return best;
  }

  function behaviorTick() {
    const now = state.elapsed;
    if (behavior.current) {
      if (behavior.stepLeft > 0) behavior.stepLeft--;
      else if (behavior.until > 0 && now < behavior.until) { }
      else clearBehavior();
    }
    if (behavior.speedUp && now >= behavior.speedUpUntil) behavior.speedUp = false;
    if (!behavior.current) {
      const names = Object.keys(BEHAVIORS);
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const cfg = BEHAVIORS[name];
        if (now < (behavior.cooldowns[name] || 0)) continue;
        if (!behaviorCondition(name)) continue;
        if (Math.random() < cfg.prob) { triggerBehavior(name, now); break; }
      }
    }
  }

  function clearBehavior() { behavior.current = null; behavior.until = 0; behavior.stepLeft = 0; }

  function behaviorCondition(name) {
    const o = state.opp, p = state.player;
    const oh = o.body[0], ph = p.body[0];
    const pd = Math.abs(oh.x - ph.x) + Math.abs(oh.y - ph.y);
    if (name === 'randomTurn' || name === 'detour') return true;
    if (name === 'changeTarget') return state.foods.length >= 2;
    if (name === 'contestFood') {
      return state.foods.some(function (f) {
        const od = Math.abs(f.x - oh.x) + Math.abs(f.y - oh.y);
        const ppd = Math.abs(f.x - ph.x) + Math.abs(f.y - ph.y);
        return od <= 5 && ppd <= 5;
      });
    }
    if (name === 'giveUpContest') return behavior.targetFood != null;
    if (name === 'chasePlayer') return pd <= 8;
    if (name === 'avoidPlayer') return pd <= 4;
    if (name === 'speedUp') return true;
    if (name === 'pause') return true;
    return false;
  }

  function triggerBehavior(name, now) {
    behavior.current = name;
    behavior.cooldowns[name] = now + BEHAVIORS[name].cd;
    if (name === 'randomTurn') behavior.stepLeft = 1 + Math.floor(Math.random() * 3);
    else if (name === 'detour') behavior.stepLeft = 2 + Math.floor(Math.random() * 4);
    else if (name === 'avoidPlayer') behavior.stepLeft = 1 + Math.floor(Math.random() * 3);
    else if (name === 'chasePlayer') behavior.until = now + 2000 + Math.floor(Math.random() * 2000);
    else if (name === 'speedUp') { behavior.speedUp = true; behavior.speedUpUntil = now + 2000 + Math.floor(Math.random() * 1000); behavior.until = behavior.speedUpUntil; }
    else if (name === 'pause') behavior.until = now + 500 + Math.floor(Math.random() * 500);
    else if (name === 'changeTarget') { behavior.until = now + 8000; switchTargetFood(); }
    else if (name === 'contestFood') { behavior.until = now + 6000; setContestFood(); }
    else if (name === 'giveUpContest') { behavior.targetFood = null; behavior.until = now + 200; }
  }

  function switchTargetFood() {
    const foods = state.foods;
    if (foods.length < 2) return;
    const h = state.opp.body[0];
    let best = null, bd = Infinity;
    foods.forEach(function (f) {
      if (behavior.targetFood && f.x === behavior.targetFood.x && f.y === behavior.targetFood.y) return;
      const d = Math.abs(f.x - h.x) + Math.abs(f.y - h.y);
      if (d < bd) { bd = d; best = f; }
    });
    if (best) behavior.targetFood = best;
  }

  function setContestFood() {
    const o = state.opp, p = state.player;
    const oh = o.body[0], ph = p.body[0];
    let best = null, bestSum = Infinity;
    state.foods.forEach(function (f) {
      const od = Math.abs(f.x - oh.x) + Math.abs(f.y - oh.y);
      const ppd = Math.abs(f.x - ph.x) + Math.abs(f.y - ph.y);
      if (od <= 5 && ppd <= 5 && od + ppd < bestSum) { bestSum = od + ppd; best = f; }
    });
    if (best) behavior.targetFood = best;
  }

  function checkEnd() {
    const pa = state.player.alive, oa = state.opp.alive;
    if (!pa && !oa) { endGame('draw'); return true; }
    if (!pa) { endGame('lose'); return true; }
    if (!oa) { endGame('win'); return true; }
    return false;
  }

  function endGame(result) {
    if (!state) return;
    state.status = 'over';
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    clearSaved();
    if (result === 'win') SFX.win();
    const d = {
      result: result,
      pLen: state.player.body.length,
      oLen: state.opp.body.length,
      pFood: state.player.foodCount,
      oFood: state.opp.foodCount,
      pScore: Math.floor(state.player.score),
      oScore: Math.floor(state.opp.score),
      time: Math.floor(state.elapsed / 1000)
    };
    const s = readScore();
    if (result === 'win') s.w++; else if (result === 'lose') s.l++; else s.d++;
    writeScore(s);
    renderScore();
    showResult(d);
    if (window.sendSnakeResult) window.sendSnakeResult(d);
  }

  function showResult(d) {
    if (!resultEl) return;
    const resTxt = d.result === 'win' ? '你赢了 🎉' : d.result === 'lose' ? 'TA 赢了' : '平局';
    resultEl.innerHTML = '<div class="snake-res-title">' + resTxt + '</div>' +
      '<div class="snake-res-row"><span>🐍 你</span><span>长度 ' + d.pLen + ' · 食物 ' + d.pFood + ' · ' + d.pScore + '分</span></div>' +
      '<div class="snake-res-row"><span>🐍 TA</span><span>长度 ' + d.oLen + ' · 食物 ' + d.oFood + ' · ' + d.oScore + '分</span></div>' +
      '<div class="snake-res-time">存活 ' + d.time + ' 秒</div>';
    resultEl.hidden = false;
    if (restartBtn) restartBtn.hidden = false;
    if (hintEl) hintEl.textContent = '再来一局？';
  }

  function render() {
    if (!ctx || !state) return;
    const W = canvas.width, H = canvas.height;
    const cell = W / GRID;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f6f6f8';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(W, i * cell); ctx.stroke();
    }
    state.foods.forEach(function (f) {
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.arc(f.x * cell + cell / 2, f.y * cell + cell / 2, cell * 0.32, 0, Math.PI * 2);
      ctx.fill();
    });
    drawSnake(state.player, '#34c759', '#28a745');
    drawSnake(state.opp, '#5ac8fa', '#3a9fd6');
  }
  function drawSnake(snake, headColor, bodyColor) {
    const cell = canvas.width / GRID;
    const pad = 1.5;
    snake.body.forEach(function (s, i) {
      ctx.fillStyle = snake.alive ? (i === 0 ? headColor : bodyColor) : '#cfcfd4';
      ctx.fillRect(s.x * cell + pad, s.y * cell + pad, cell - pad * 2, cell - pad * 2);
    });
  }

  // ---- 暂停 / 继续 ----
  function togglePause() {
    if (!state) return;
    if (state.status === 'playing') {
      state.status = 'paused';
      if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
      pauseAt = Date.now();
      if (pauseBtn) pauseBtn.textContent = '▶';
      if (hintEl) hintEl.textContent = '已暂停 · 点 ▶ 继续';
    } else if (state.status === 'paused') {
      state.status = 'playing';
      state.startTime += Date.now() - pauseAt;
      if (pauseBtn) pauseBtn.textContent = '⏸';
      if (hintEl) hintEl.textContent = '滑动 / 方向键控制 · 别撞墙';
      loopTimer = setTimeout(tick, currentTickInterval());
    }
  }

  // ---- 全屏（面板占满视口，canvas 放大） ----
  function toggleFs() {
    isFs = !isFs;
    if (panel) panel.classList.toggle('snake-fs', isFs);
    if (fsBtn) fsBtn.textContent = isFs ? '⤢' : '⛶';
    if (canvas) { canvas.width = canvas.height = isFs ? 440 : 300; }
    if (canvas) ctx = canvas.getContext('2d');
    render();
  }

  // ---- 保存 / 恢复对局 ----
  function canSave(s) { return s && s.status === 'playing'; }
  function saveGame() {
    try {
      if (!canSave(state)) { localStorage.removeItem(SAVE_KEY); return; }
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) {}
  }
  function loadSaved() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.status !== 'playing') return null;
      return s;
    } catch (e) { return null; }
  }
  function clearSaved() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
  function resumeGame() {
    const s = loadSaved();
    if (!s) return false;
    state = s;
    behavior = { current: null, until: 0, stepLeft: 0, cooldowns: {}, targetFood: null, speedUp: false, speedUpUntil: 0 };
    state.status = 'playing';
    state.startTime = Date.now() - state.elapsed;
    if (startBtn) { startBtn.hidden = true; startBtn.textContent = '开始'; }
    if (restartBtn) restartBtn.hidden = true;
    if (resumeBtn) resumeBtn.hidden = true;
    if (resultEl) { resultEl.hidden = true; resultEl.innerHTML = ''; }
    if (hintEl) hintEl.textContent = '滑动 / 方向键控制 · 别撞墙';
    paused = false;
    if (pauseBtn) pauseBtn.textContent = '⏸';
    render();
    loopTimer = setTimeout(tick, currentTickInterval());
    return true;
  }

  // ---- 面板开关 ----
  function openSnakePanel() {
    if (!panel) return;
    ['poke-card', 'emoji-panel', 'chat-ask-panel', 'chat-search', 'chat-divine-panel', 'chat-decision-panel', 'chat-rps-panel', 'chat-rp-panel', 'chat-call-panel', 'chat-pong-panel'].forEach(function (id) { const el = $(id); if (el) el.hidden = true; });
    if (window.closeAvlib) window.closeAvlib();
    const mp = $('chat-more-panel'); if (mp) mp.hidden = true;
    const nameEl = $('snake-partner-name');
    if (nameEl) nameEl.textContent = (typeof localStorage !== 'undefined' && localStorage.getItem(PARTNER_KEY)) || 'TA';
    if (isFs) toggleFs();
    panel.hidden = false;
    paused = false;
    if (pauseBtn) pauseBtn.textContent = '⏸';
    renderScore();
    if (canSave(state)) {
      state.status = 'playing';
      state.startTime = Date.now() - state.elapsed;
      if (startBtn) { startBtn.hidden = true; startBtn.textContent = '开始'; }
      if (restartBtn) restartBtn.hidden = true;
      if (resumeBtn) resumeBtn.hidden = true;
      if (resultEl) { resultEl.hidden = true; resultEl.innerHTML = ''; }
      if (hintEl) hintEl.textContent = '滑动 / 方向键控制 · 别撞墙';
      render();
      loopTimer = setTimeout(tick, currentTickInterval());
      return;
    }
    const saved = loadSaved();
    if (saved) {
      resetToIdle();
      if (hintEl) hintEl.textContent = '有未完成的对局';
      if (resumeBtn) resumeBtn.hidden = false;
      if (startBtn) { startBtn.hidden = false; startBtn.textContent = '重新开始'; }
    } else {
      resetToIdle();
    }
  }
  function resetToIdle() {
    stopLoop();
    newGame(diffSel ? diffSel.value : 'normal');
    state.status = 'idle';
    if (startBtn) { startBtn.hidden = false; startBtn.textContent = '开始'; }
    if (restartBtn) restartBtn.hidden = true;
    if (resumeBtn) resumeBtn.hidden = true;
    if (resultEl) { resultEl.hidden = true; resultEl.innerHTML = ''; }
    if (hintEl) hintEl.textContent = '点开始 · 滑动控制方向';
    render();
  }
  function stopLoop() {
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    if (countdownTimer) { clearTimeout(countdownTimer); countdownTimer = null; }
  }
  function closeSnakePanel() {
    if (canSave(state)) saveGame(); else clearSaved();
    stopLoop();
    if (isFs) toggleFs();
    if (panel) panel.hidden = true;
  }

  window.openSnakePanel = openSnakePanel;
  window.closeSnakePanel = closeSnakePanel;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initEls);
  else initEls();
})();
