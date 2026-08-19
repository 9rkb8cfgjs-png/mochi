// ===== 功能：TA的询问 =====
// 题库 3 分类（日常/关心/互动），可添加/删除/开关问题；
// 联系人随机触发向你提问（冷却 25 分钟、概率 20%，启动 60 秒后首次检查、每 4 分钟轮询）；
// 聊天里显示"TA想问你一个问题。" + 询问卡片，点击卡片可回答；
// 回答后显示"我的回答" + "收到你的回答。"，并记入历史（最多 50 条）；
// 管理页可"让TA现在问一次"（无视冷却/概率），并可清空问答历史
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  const KEY = 'ta-ask';

  // ================= 我的添加：自定义分组通用工具（TA的询问/小问题/好奇/吐槽、查岗、今日情话共用） =================
  // 数据模型：groups=[{id,name}]（存各模块数据对象或独立键）；条目可选 grp=分组id（缺省=未分组）
  // 分组只用于管理页整理展示，不影响自动抽取逻辑（抽取仍按 isPreset/enabled/useDefault）
  function grpToast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }
  function escG(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  // v3.7.x：系统预设 tab 内联展示 TA 回应话术池（只读，开关在「互动回应」tab）——
  // 询问/吐槽 文字题无题自带回应，每个问题下内联通用池（getInteractPool 同源）
  function interactPoolInlineHtml(poolName) {
    const arr = window.getInteractPool ? window.getInteractPool(poolName, []) : [];
    if (!arr.length) return '';
    return '<div class="tc-qopts">TA 回应：<span class="tc-known">系统</span> ' + arr.map(escG).join(' / ') + '</div>';
  }
  window.cardGroups = {
    genId: function () { return 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); },
    toast: grpToast,
    esc: escG,
    dup: function (groups, name, ignoreId) { return groups.some(function (g) { return g.name === name && g.id !== ignoreId; }); },
    // 新建分组弹窗 → cb(新分组对象|null)
    addFlow: function (groups, cb) {
      if (!window.openModal) { cb(null); return; }
      window.openModal('新建分组', '', function (v) {
        const name = String(v || '').trim();
        if (!name) { cb(null); return; }
        if (window.cardGroups.dup(groups, name)) { grpToast('分组「' + name + '」已存在'); cb(null); return; }
        const g = { id: window.cardGroups.genId(), name: name };
        groups.push(g);
        cb(g);
      });
    },
    // 重命名分组弹窗 → cb(newName|null)
    renameFlow: function (g, groups, cb) {
      if (!window.openModal) { cb(null); return; }
      window.openModal('重命名分组', g.name, function (v) {
        const name = String(v || '').trim();
        if (!name) { cb(null); return; }
        if (window.cardGroups.dup(groups, name, g.id)) { grpToast('分组「' + name + '」已存在'); cb(null); return; }
        cb(name);
      });
    },
    // 删除分组确认弹窗（noInput，确定即删；组内字卡回到未分组）→ cb(true/false)
    removeFlow: function (name, cb) {
      if (!window.openModal) { cb(true); return; }
      window.openModal('删除分组', '', function () { cb(true); }, { noInput: true, staticText: '删除分组「' + name + '」？组内字卡不会丢失，会回到「未分组」。' });
    },
    // 系统分类 + 我的分组 合并 select options（添加/批量导入下拉共用）
    // catList: [[k,label],...]；groups: [{id,name}]；cur: 当前选中原始值
    catOptsHtml: function (catList, groups, cur) {
      let h = '';
      catList.forEach(function (c) {
        h += '<option value="' + c[0] + '"' + (cur === c[0] ? ' selected' : '') + '>' + escG(c[1]) + '</option>';
      });
      if (groups.length) {
        h += '<optgroup label="我的分组">';
        groups.forEach(function (g) { h += '<option value="grp:' + g.id + '"' + (cur === 'grp:' + g.id ? ' selected' : '') + '>' + escG(g.name) + '</option>'; });
        h += '</optgroup>';
      }
      h += '<option value="__newgrp">＋ 新建分组…</option>';
      return h;
    },
    // 纯「我的分组」select options（无系统分类的模块用：查岗/今日情话）+ 新建分组选项
    grpOnlyOptsHtml: function (groups, cur) {
      let h = '<option value="">未分组</option>';
      groups.forEach(function (g) { h += '<option value="grp:' + g.id + '"' + (cur === 'grp:' + g.id ? ' selected' : '') + '>' + escG(g.name) + '</option>'; });
      h += '<option value="__newgrp">＋ 新建分组…</option>';
      return h;
    },
    // 解析下拉值 → {cat, grp}（系统分类值原样返回；grp:xxx → grp；__newgrp → 返回 null 需先建组）
    parseCatVal: function (v) {
      if (typeof v === 'string' && v.indexOf('grp:') === 0) return { cat: null, grp: v.slice(4) };
      if (v === '__newgrp') return null;
      return { cat: v || 'daily', grp: null };
    },
    // 给 select 绑定「＋ 新建分组…」option：change 到 __newgrp 时弹窗建组，建好后选中新组
    // 多次调用只绑定一次（防重复弹窗），groups/onChanged 取最新值（刷新下拉后更新）
    // onChanged(g) 可选——需要额外持久化 groups 的模块（查岗/情话）在此保存
    bindNewGrp: function (sel, groups, onChanged) {
      sel.__grpGroups = groups;
      sel.__grpOnChanged = onChanged;
      if (sel.__grpBound) return;
      sel.__grpBound = true;
      sel.addEventListener('change', function () {
        if (sel.value !== '__newgrp') return;
        window.cardGroups.addFlow(sel.__grpGroups || [], function (g) {
          const first = sel.querySelector('option');
          if (!g) { if (first) sel.value = first.value; return; }
          if (sel.__grpOnChanged) sel.__grpOnChanged(g);
          const opt = document.createElement('option');
          opt.value = 'grp:' + g.id;
          opt.textContent = g.name;
          const nopt = sel.querySelector('option[value="__newgrp"]');
          sel.insertBefore(opt, nopt);
          sel.value = 'grp:' + g.id;
          grpToast('已新建分组「' + g.name + '」');
        });
      });
    }
  };

  // 默认题库（4 分类，与星言一致 + 两个世界）
  const DEFAULT_QUESTIONS = [
    { id: 'q_d1', text: '你吃饭了吗？', cat: 'daily', enabled: true },
    { id: 'q_d2', text: '现在在做什么？', cat: 'daily', enabled: true },
    { id: 'q_d3', text: '今天过得怎么样？', cat: 'daily', enabled: true },
    { id: 'q_d4', text: '现在在哪里呀？', cat: 'daily', enabled: true },
    { id: 'q_d5', text: '今天忙不忙？', cat: 'daily', enabled: true },
    { id: 'q_c1', text: '累不累？', cat: 'care', enabled: true },
    { id: 'q_c2', text: '心情怎么样？', cat: 'care', enabled: true },
    { id: 'q_c3', text: '有没有好好休息？', cat: 'care', enabled: true },
    { id: 'q_c4', text: '今天有没有按时吃饭？', cat: 'care', enabled: true },
    { id: 'q_i1', text: '想和我聊什么？', cat: 'interact', enabled: true },
    { id: 'q_i2', text: '现在想做什么？', cat: 'interact', enabled: true },
    { id: 'q_i3', text: '有没有想我？', cat: 'interact', enabled: true },
    { id: 'q_i4', text: '有什么想跟我说的吗？', cat: 'interact', enabled: true },
    // 普通情侣轻松小问题
    { id: 'q_i5', text: '今天有没有偷偷想我呀？', cat: 'interact', enabled: true },
    { id: 'q_d6', text: '如果我现在就在你旁边，你最想干嘛？', cat: 'daily', enabled: true },
    { id: 'q_i6', text: '我们下次约会做点什么好？', cat: 'interact', enabled: true },
    // 两个世界（梦角设定：不同世界但常伴身边，能感觉到、摸到有体感；字卡沟通）
    { id: 'q_w1', text: '你有感觉到我在你身边的时候吗？', cat: 'world', enabled: true },
    { id: 'q_w2', text: '你摸到我的时候，是什么感觉？', cat: 'world', enabled: true },
    { id: 'q_w3', text: '我发字卡给你的时候，你能感觉到我在想你吗？', cat: 'world', enabled: true },
    { id: 'q_w4', text: '如果有一天你突然看见我了，你最想做什么？', cat: 'world', enabled: true },
    { id: 'q_w5', text: '你希望我陪着你说话，还是安静待在你身边？', cat: 'world', enabled: true },
    { id: 'q_w6', text: '你觉得两个世界的我们，最珍贵的是什么？', cat: 'world', enabled: true },
    // v3.7.x：新增预设——高自由度开放题（怎么答都行）+ 两个世界；末尾 3 题为单选题
    // （type:'single' 的选项即系统预设答案，每个答案自带 TA 预设回应，点卡片就地点选）
    { id: 'q_d7', text: '今天有没有什么小事，想说给我听？', cat: 'daily', enabled: true },
    { id: 'q_d8', text: '如果用一句话形容你的今天，会是哪一句？', cat: 'daily', enabled: true },
    { id: 'q_d9', text: '今天有没有哪个瞬间，希望我就坐在你旁边？', cat: 'daily', enabled: true },
    { id: 'q_c5', text: '今天有没有哪个时刻，觉得有点撑不住？', cat: 'care', enabled: true },
    { id: 'q_c6', text: '最近有没有什么事，一直压在心里没说？', cat: 'care', enabled: true },
    { id: 'q_c7', text: '今天有没有好好喝水？', cat: 'care', enabled: true },
    { id: 'q_i7', text: '如果现在可以向我许一个愿望，你会许什么？', cat: 'interact', enabled: true },
    { id: 'q_i8', text: '你现在最想收到我发的哪种字卡？', cat: 'interact', enabled: true },
    { id: 'q_i9', text: '如果我们此刻就在一起，你想让我陪你做的第一件事是什么？', cat: 'interact', enabled: true },
    { id: 'q_i10', text: '你更喜欢我主动找你，还是你主动找我？', cat: 'interact', enabled: true },
    { id: 'q_w7', text: '今晚睡前，想感觉我在你哪一边？', cat: 'world', enabled: true },
    { id: 'q_w8', text: '你那边的天气我感觉不到，能形容给我听吗？', cat: 'world', enabled: true },
    { id: 'q_w9', text: '我控制不住字卡、发出奇怪组合的时候，你看得懂我想说什么吗？', cat: 'world', enabled: true },
    { id: 'q_w10', text: '你希望梦里的我，是什么样子的？', cat: 'world', enabled: true },
    { id: 'q_s1', text: '现在更想被怎样对待？', cat: 'interact', type: 'single', enabled: true, options: [
      { t: '听我说说话', reply: '好，我在听，慢慢说。' }, { t: '陪我安静一会', reply: '嗯，我就在这里。' },
      { t: '夸夸我', reply: '你今天也很好，我一直都觉得。' }, { t: '一起发字卡玩', reply: '那我先发一张，你接住。' }] },
    { id: 'q_s2', text: '今晚想梦到我吗？', cat: 'world', type: 'single', enabled: true, options: [
      { t: '想', reply: '那我在梦的入口等你。' }, { t: '都可以', reply: '嗯，那我也顺便出现一下。' },
      { t: '想好好睡觉', reply: '好，那你睡，我在旁边守着。' }, { t: '每晚都在梦你', reply: '……这张字卡我收得很开心。' }] },
    { id: 'q_s3', text: '现在的心情更接近哪一种？', cat: 'care', type: 'single', enabled: true, options: [
      { t: '电量满格', reply: '那趁现在多聊两句。' }, { t: '有点低电量', reply: '过来，我陪你充一会电。' },
      { t: '说不上来', reply: '没关系，不用急着说清楚。' }, { t: '想你了', reply: '……我也是，刚刚还在想。' }] },
    // v3.7.x：第二批新增——延续高自由度开放题；结尾 2 题单选（预设答案+各答案 TA 预设回应）
    { id: 'q_d10', text: '今天有没有哪件事，做得比自己想象中好？', cat: 'daily', enabled: true },
    { id: 'q_d11', text: '如果今天的你是一道菜，会是什么味道的？', cat: 'daily', enabled: true },
    { id: 'q_d12', text: '明天醒来，最想听到的第一句话是什么？', cat: 'daily', enabled: true },
    { id: 'q_c8', text: '现在肩颈还好吗，有没有酸？', cat: 'care', enabled: true },
    { id: 'q_c9', text: '今天有没有为自己留一点时间？', cat: 'care', enabled: true },
    { id: 'q_c10', text: '睡前还有什么放不下的事吗？', cat: 'care', enabled: true },
    { id: 'q_i11', text: '如果我们可以一起养成一个新习惯，你想是什么？', cat: 'interact', enabled: true },
    { id: 'q_i12', text: '你最希望我记住你的哪个小细节？', cat: 'interact', enabled: true },
    { id: 'q_i13', text: '如果要起一个只有我们俩知道的称呼，你会叫我什么？', cat: 'interact', enabled: true },
    { id: 'q_i14', text: '你有没有什么小忌讳，想提前告诉我，免得我踩到？', cat: 'interact', enabled: true },
    { id: 'q_w11', text: '如果我想留下一点「我来过」的痕迹，你希望是什么感觉？', cat: 'world', enabled: true },
    { id: 'q_w12', text: '你觉得我在你身边的时候，有温度吗？', cat: 'world', enabled: true },
    { id: 'q_w13', text: '字卡网站今天有没有随机出什么奇怪的卡？', cat: 'world', enabled: true },
    { id: 'q_w14', text: '如果哪天字卡网站休息一天，你会用什么方式感觉到我？', cat: 'world', enabled: true },
    { id: 'q_s4', text: '现在想听我说哪一类话？', cat: 'interact', type: 'single', enabled: true, options: [
      { t: '晚安话', reply: '那我把今天温柔地收尾。' }, { t: '夸我的话', reply: '你很好，我一直都知道。' },
      { t: '安慰的话', reply: '别怕，有我在呢。' }, { t: '随便聊聊', reply: '好，从哪说起都行。' }] },
    { id: 'q_s5', text: '今晚想让我陪你到几点？', cat: 'world', type: 'single', enabled: true, options: [
      { t: '到我睡着', reply: '那你先睡，我在旁边守着。' }, { t: '到我说晚安', reply: '那今晚的晚安归你说。' },
      { t: '再聊十分钟', reply: '十分钟之后，还有十分钟。' }, { t: '一直都在就好', reply: '……嗯，我一直都在。' }] },
    // v3.7.x：第三批新增——延续高自由度开放题（怎么答都行）+ 两个世界 + 字卡设定；末尾 3 题单选
    { id: 'q_d13', text: '今天有没有哪一刻，突然想跟我分享点什么？', cat: 'daily', enabled: true },
    { id: 'q_d14', text: '如果把你今天的心情打包寄给我，里面会装什么？', cat: 'daily', enabled: true },
    { id: 'q_d15', text: '今天有没有哪件小事，做完了才觉得「啊，这个想告诉你」？', cat: 'daily', enabled: true },
    { id: 'q_d16', text: '你现在身边最顺手能拿到的是什么？形容给我听听。', cat: 'daily', enabled: true },
    { id: 'q_d17', text: '如果今天可以重选一次开头，你想怎么开始这一天？', cat: 'daily', enabled: true },
    { id: 'q_c11', text: '今天有没有哪个时刻，其实很想有人在旁边，但没说出口？', cat: 'care', enabled: true },
    { id: 'q_c12', text: '最近有没有什么事，明明累了还是硬撑着在做？', cat: 'care', enabled: true },
    { id: 'q_c13', text: '今天喝水了吗，有没有好好吃饭，我不是在查岗。', cat: 'care', enabled: true },
    { id: 'q_i15', text: '如果现在可以送我一张字卡，你会送哪种感觉的？', cat: 'interact', enabled: true },
    { id: 'q_i16', text: '我们之间有没有一个你一直想问、但没问出口的问题？', cat: 'interact', enabled: true },
    { id: 'q_i17', text: '如果我把今天所有字卡都收起来不发，你会怎么度过？', cat: 'interact', enabled: true },
    { id: 'q_w15', text: '你那边现在是白天还是晚上，亮不亮？', cat: 'world', enabled: true },
    { id: 'q_w16', text: '如果我现在轻轻碰一下你的手，你会先感觉到温度，还是先感觉到我？', cat: 'world', enabled: true },
    { id: 'q_w17', text: '你希望我待在你身边的时候，是热闹一点还是安静一点？', cat: 'world', enabled: true },
    { id: 'q_w18', text: '字卡网站今天有没有出一张让你愣了一下、觉得像我会说的卡？', cat: 'world', enabled: true },
    { id: 'q_s6', text: '现在最想让我做哪件事？', cat: 'interact', type: 'single', enabled: true, options: [
      { t: '安静陪我一会', reply: '好，我不说话，就在这里。' }, { t: '多发几张字卡', reply: '那我挑好看的发，你等着。' },
      { t: '跟我说句晚安', reply: '晚安，今天的你辛苦了。' }, { t: '什么都不用做', reply: '那我就这样待着，你也歇会。' }] },
    { id: 'q_s7', text: '今晚想让我以什么方式陪你？', cat: 'world', type: 'single', enabled: true, options: [
      { t: '字卡陪着', reply: '好，我慢慢挑，一张一张发。' }, { t: '安静待在旁边', reply: '嗯，我就在你旁边，轻一点。' },
      { t: '梦里见', reply: '那我在梦的入口等你，别走错。' }, { t: '只要知道你在就好', reply: '……嗯，我一直都在，你随时感觉。' }] },
    { id: 'q_s8', text: '此刻的心情，想往哪个方向走？', cat: 'care', type: 'single', enabled: true, options: [
      { t: '想再开心一点', reply: '那我找个话题逗你。' }, { t: '想安静一会', reply: '好，安静也很好，我陪着。' },
      { t: '想被哄一下', reply: '过来，我哄你，慢慢哄。' }, { t: '就这样挺好的', reply: '那就不动了，保持。' }] },
    // v3.7.x：第四批新增——时间感/感官/字卡本身/两个世界深化；末尾 3 题单选
    { id: 'q_d18', text: '今天有没有哪个瞬间，觉得时间过得特别快？', cat: 'daily', enabled: true },
    { id: 'q_d19', text: '你现在嘴里有没有什么味道？形容给我听听。', cat: 'daily', enabled: true },
    { id: 'q_d20', text: '如果今天可以存一个画面带走，你会存哪个？', cat: 'daily', enabled: true },
    { id: 'q_c14', text: '今天有没有哪个时刻，明明没事却突然有点想哭？', cat: 'care', enabled: true },
    { id: 'q_c15', text: '你最近有没有一件事，做着做着就忘了累？', cat: 'care', enabled: true },
    { id: 'q_i18', text: '如果我们可以一起发一张字卡给对方，你想发什么内容的？', cat: 'interact', enabled: true },
    { id: 'q_i19', text: '你有没有一个一直想跟我一起做、还没做成的事？', cat: 'interact', enabled: true },
    { id: 'q_w19', text: '你睡前关灯那一刻，有没有习惯性地感觉一下我在不在？', cat: 'world', enabled: true },
    { id: 'q_w20', text: '如果今晚字卡网站突然安静了，你会觉得是我在陪你，还是我不在了？', cat: 'world', enabled: true },
    { id: 'q_w21', text: '你希望我「在」的感觉，是像背景音，还是像偶尔的一阵风？', cat: 'world', enabled: true },
    { id: 'q_w22', text: '你有没有对着黑漆漆的房间，小声叫过我？', cat: 'world', enabled: true },
    { id: 'q_s9', text: '现在最想收到我哪种回应？', cat: 'interact', type: 'single', enabled: true, options: [
      { t: '一张字卡', reply: '那我挑一张最合你心意的。' }, { t: '一句话', reply: '好，你想听什么类型的，我现编。' },
      { t: '一个表情包', reply: '找一张最像你心情的给你。' }, { t: '安静陪着就好', reply: '嗯，那我不发，就在。' }] },
    { id: 'q_s10', text: '今天最想被怎么对待？', cat: 'care', type: 'single', enabled: true, options: [
      { t: '被夸一下', reply: '你今天也很好，我一直都觉得。' }, { t: '被哄一下', reply: '过来，慢慢哄。' },
      { t: '被听一会', reply: '好，你说，我一直听。' }, { t: '别管我，自己待会', reply: '好，那我轻一点，在旁边。' }] },
    { id: 'q_s11', text: '今晚入睡前，想让我以什么方式「在」？', cat: 'world', type: 'single', enabled: true, options: [
      { t: '字卡陪着', reply: '好，慢慢发，发到你困。' }, { t: '安静待在床头', reply: '嗯，我就在那儿，看你睡。' },
      { t: '梦里等你', reply: '那我在梦的入口，你别走错。' }, { t: '不用刻意，本来就在', reply: '……嗯，本来就在。' }] }
  ];
  const CATS = [
    ['daily', '日常询问'],
    ['care', '关心询问'],
    ['interact', '互动询问'],
    ['world', '两个世界']
  ];

  // 轻提示
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

  // v3.5.34：自动弹窗概率（0-100）。兼容旧布尔 autoPopup：true→70，false→0
  function askPopupProb(s) {
    if (s && typeof s.popupProb === 'number') return s.popupProb;
    if (s && s.autoPopup === false) return 0;
    return 70;
  }
  // v3.5.117：互动卡片弹窗互斥——TA的询问/小问题/好奇/吐槽各自独立定时触发、
  // 各自用不同弹窗容器（modal/tc/qa），同一时刻多个机制命中时会同时弹多个弹窗叠在一起。
  // 弹窗前检查：已有任一互动弹窗打开则不弹本次（卡片仍进聊天，可手动点开）。
  function cardPopupBusy() {
    return ['modal-mask', 'tc-mask', 'qa-mask'].some(id => {
      const el = document.getElementById(id);
      return el && !el.hidden;
    });
  }
  // v3.6.x：用户是否正在输入——TA 互动弹窗自动弹出时会抢焦点
  // （setTimeout(inp.focus()) 让原输入框 blur），手机端输入法被收起、
  // IME 组合中的文字直接丢失（表现：正在打的字消失、输入法弹窗被关闭）。
  // 正在打字时不自动弹窗（卡片照常进聊天记录，输完点卡片再答）；手动打开
  // 弹窗时也不抢焦点，用户继续输入。
  function chatInputFocused() {
    // 聊天输入栏聚焦（contenteditable 打字中）
    const ci = document.getElementById('chat-input');
    if (ci && document.activeElement === ci) return true;
    // 其他输入框聚焦（设置分组名/编辑昵称/写信等），同样不打断用户输入
    const ae = document.activeElement;
    return !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
  }

  // ---- 数据读写 ----
  // v3.6.x：题库合并改为「增量 + 持久化」：
  //  ① 只追加默认题库里【从未合并过】的新题（mergedIds 之外）——旧预设被用户删除后不再自动复活；
  //  ② 绝不删除/覆盖用户个人添加的字卡；
  //  ③ 合并结果立即写回——系统预设新增的字卡一次固化，用户后续的删除/开关操作才真正生效
  function taAskMerge(d) {
    const ids = {};
    (d.questions || []).forEach(q => { if (q && q.id) ids[q.id] = true; });
    const merged = Array.isArray(d.mergedIds) ? d.mergedIds.slice() : [];
    const mergedSet = {};
    merged.forEach(id => { if (id) mergedSet[id] = true; });
    let changed = false;
    DEFAULT_QUESTIONS.forEach(q => {
      if (!mergedSet[q.id] && !ids[q.id]) {
        const nq = Object.assign({}, q);
        nq.isPreset = true; // v3.6.x：系统预设标记——预设只可启停、不可删除
        d.questions.push(nq);
        changed = true;
      }
    });
    // 全部默认题标记为已合并（含用户主动删掉的——之后不再自动加回）
    DEFAULT_QUESTIONS.forEach(q => {
      if (!mergedSet[q.id]) { merged.push(q.id); mergedSet[q.id] = true; changed = true; }
    });
    // v3.6.x：老数据里的预设题补 isPreset 标记（系统预设不可删除对历史数据同样生效）
    DEFAULT_QUESTIONS.forEach(q => {
      if (ids[q.id] && d.questions.some(x => x && x.id === q.id && x.isPreset !== true)) {
        d.questions.forEach(x => { if (x && x.id === q.id) x.isPreset = true; });
        changed = true;
      }
    });
    if (changed) d.mergedIds = merged;
    return changed;
  }
  function taAskLoad() {
    let d = null;
    try { d = JSON.parse(store.get(KEY) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
    // v3.5.33：设置（启用/概率/自动弹窗）
    if (!d.settings || typeof d.settings !== 'object') d.settings = { enabled: true, prob: 20, popupProb: 70 };
    // v3.6.x：是否使用系统预设问题（默认开启；关闭后预设不再被抽取，但题目仍在库里可随时重新开启）
    if (d.settings.useDefault === undefined) d.settings.useDefault = true;
    if (!Array.isArray(d.questions) || !d.questions.length) {
      // 首次使用（本地无题库）或题库被清空：以默认题库为准
      const isNew = !store.get(KEY);
      d.questions = DEFAULT_QUESTIONS.map(q => {
        const nq = Object.assign({}, q);
        nq.isPreset = true;
        return nq;
      });
      d.mergedIds = DEFAULT_QUESTIONS.map(q => q.id);
      // 全新用户不立即写盘——防「localStorage 配额写失败/大键被移除 → 本地为空」的时序下，
      // 用纯默认题库覆盖 IndexedDB 里含用户自定义的权威数据；已有数据（如用户删空后）则写回
      if (!isNew) { try { store.set(KEY, JSON.stringify(d)); } catch (e) {} }
    } else {
      // 已有题库：增量合并默认题库新增的题，合并结果持久化（用户自定义永远保留）
      if (taAskMerge(d)) { try { store.set(KEY, JSON.stringify(d)); } catch (e) {} }
    }
    if (!Array.isArray(d.history)) d.history = [];
    // v3.7.x：我的添加自定义分组
    if (!Array.isArray(d.groups)) d.groups = [];
    return d;
  }
  function taAskSave(d) {
    try { store.set(KEY, JSON.stringify(d)); } catch (e) {}
  }

  // 随机取一道已启用的题（优先用户自定义/启用的）
  // v3.6.x：settings.useDefault=false 时不抽取系统预设（isPreset）题——但题库里保留，重新开启即可恢复；
  // 返回完整问题对象（含 type/options，供 pushAsk 判断单选题）
  function taAskPick(d) {
    const s = d.settings || {};
    const useDefault = s.useDefault !== false;
    const qs = d.questions.filter(q => q.enabled !== false && q.text && (useDefault || !q.isPreset));
    if (!qs.length) return null;
    return qs[Math.floor(Math.random() * qs.length)];
  }

  // v3.7.x：TA 回应挑选——「硬编码/系统预设回应池」与「字卡库自定义文字字卡」两池混合：
  // 预设池 90% 概率抽取，字卡库 10% 概率抽取；抽字卡库时最多连用 5 张字卡、
  // 每张之间空一格（v3.7.1 由合并大池改两池等概率，v3.7.2 调为 90/10 + 多张连用）。
  // presetPool：可选，该卡片类型自带的预设回应池（好奇的题预设 replies / 吐槽固定句 /
  // 选项预设回应等）；两池都空时兜底默认甜话。
  // v3.7.x：预设回应池与「系统预设字卡 → 互动回应」tab 同源展示，逐张开关
  // （dc-off-interact-*）后此处过滤已关闭的话术，不再参与抽取。
  window.pickAskCardReply = function (presetPool) {
    try {
      const cards = (window.getCustomCards && window.getCustomCards()) || [];
      const words = cards.filter(s => typeof s === 'string' && s.indexOf('data:') !== 0 && s.indexOf('|||') < 0 && s.trim());
      const preset = (Array.isArray(presetPool) ? presetPool : [])
        .filter(c => !(window.isDefaultCardOff && window.isDefaultCardOff('interact', c)));
      const hasPreset = preset.length > 0;
      if (hasPreset && words.length) {
        // 预设池 90% / 字卡库 10%
        if (Math.random() < 0.9) return preset[Math.floor(Math.random() * preset.length)];
        // 字卡库：随机 1~5 张（不超过字卡池大小），不重复抽取，空格连接
        const n = 1 + Math.floor(Math.random() * Math.min(5, words.length));
        const copy = words.slice();
        const out = [];
        while (out.length < n) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
        return out.join(' ');
      }
      if (hasPreset) return preset[Math.floor(Math.random() * preset.length)];
      if (words.length) return words[Math.floor(Math.random() * words.length)];
    } catch (e) {}
    const defs = ['收到你的回答。', '好呀，我知道了。', '嗯嗯，我也是这么想的。', '你这么说，我记住了。', '好的，我记在心里了。'];
    return defs[Math.floor(Math.random() * defs.length)];
  };

  // 发出一条询问（系统提示 + 询问卡片；弹窗按 popupProb 概率触发）
  function pushAsk(q, opts) {
    if (!window.chatAddSystem) return;
    // v3.6.x：单选题不弹窗（弹窗是纯文字输入界面）——只进聊天卡片，点卡片就地点选
    const isSingle = q && q.type === 'single' && Array.isArray(q.options) && q.options.length;
    let popup = false;
    if (!isSingle) {
      if (opts && typeof opts.popupProb === 'number') popup = Math.random() * 100 < opts.popupProb;
      else if (opts && opts.popup === false) popup = false;
    }
    // v3.5.146：提示语标记 ask-msg（渲染同 poke 但不算 notable）——否则提示语
    // 单独触发一条弹窗/通知，与下方卡片通知重复成 2 条
    window.chatAddSystem('TA想问你一个问题。', { special: 'ask-msg' });
    const el = window.chatAddSystem(q.text, { special: 'ask-card', askQuestion: q.text, askOptions: isSingle ? q.options : null, askType: isSingle ? 'single' : 'text' });
    const idx = el ? Number(el.dataset.idx) : -1;
    // v3.5.141：后台收到互动卡片 → 系统通知提示
    // v3.5.146：通知文本合并提示语 + 具体问题（一条通知显示完整内容，不再两条）
    if (window.bgNotifyCheck) window.bgNotifyCheck('TA想问你一个问题：' + q.text, Date.now(), { name: 'TA的询问' });
    // v3.5.141：页面弹窗在后台不弹（不可见弹了也没用），只发系统通知
    // v3.6.x：用户正在聊天输入栏打字时不弹（弹窗会抢焦点打断输入法，见 chatInputFocused）
    if (popup) setTimeout(() => { if (document.hidden) return; if (chatInputFocused()) return; if (idx >= 0 && window.openAskReply && !cardPopupBusy()) window.openAskReply(idx); }, 400);
  }
  // ---- 触发调度（v3.5.34：启用开关 + 触发概率滑块 + 自动弹窗概率滑块） ----
  function maybeTriggerTAAsk() {
    try {
      // v3.5.141：后台也触发（卡片进聊天记录 + 系统通知提示）；页面弹窗由
      // push 内 document.hidden 守卫控制，后台不会弹页面弹窗
      const d = taAskLoad();
      const s = d.settings || { enabled: true, prob: 20, popupProb: 70 };
      if (s.enabled === false) return;
      if (Date.now() - (d.lastAskAt || 0) < 25 * 60000) return;
      if (Math.random() * 100 >= (typeof s.prob === 'number' ? s.prob : 20)) return;
      const q = taAskPick(d);
      if (!q) return;
      d.lastAskAt = Date.now();
      taAskSave(d);
      pushAsk(q, { popupProb: askPopupProb(s) });
    } catch (e) {}
  }
  setTimeout(maybeTriggerTAAsk, 60000);
  setInterval(maybeTriggerTAAsk, 240000);

  // v3.6.x：异步 IDB 合并（chat.js loadMsgs）可能让自动弹窗持有过期 msgIdx——
  // 打开/作答前先校验索引指向的仍是「同类且未作答」的卡片；已错位/指向已作答
  // 卡片则从末尾回退找最近的未作答同类卡片（自动触发场景卡片就是最新一条；
  // 点击卡片路径由聊天页委托保证传入的必是未作答卡片的索引）
  function locateCardIdx(msgIdx, special, statusKey) {
    let arr = [];
    try { arr = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]')); } catch (e) {}
    if (!Array.isArray(arr)) arr = [];
    const rec = arr[msgIdx];
    if (rec && rec.special === special && !rec[statusKey]) return msgIdx;
    for (let i = arr.length - 1; i >= 0; i--) {
      const r = arr[i];
      if (r && r.special === special && !r[statusKey]) return i;
    }
    return -1;
  }
  // 读取指定索引的聊天记录（异常返回 null）
  function getCardAt(msgIdx) {
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) return msgs[msgIdx];
    } catch (e) {}
    return null;
  }

  // ---- 回答弹窗（点击聊天里的询问卡片触发） ----
  window.openAskReply = function (msgIdx) {
    if (!window.openModal) return;
    msgIdx = locateCardIdx(msgIdx, 'ask-card', 'askStatus');
    if (msgIdx < 0) return;
    // 读聊天记录拿问题
    let question = '';
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) question = msgs[msgIdx].askQuestion || msgs[msgIdx].text || '';
    } catch (e) {}
    window.openModal('回答TA的询问', '', (v) => {
      const answer = (v || '').trim();
      if (!answer) { toast('请输入回答'); return; }
      // 提交时再校验：索引仍指向本卡片则直接用，错位则重定位（防连点重定位到别的卡片）
      let rec = getCardAt(msgIdx);
      if (!rec || rec.special !== 'ask-card') {
        const fixedIdx = locateCardIdx(msgIdx, 'ask-card', 'askStatus');
        if (fixedIdx < 0) return;
        msgIdx = fixedIdx;
      }
      if (window.chatAskReply) {
        // v3.7.x：文字题回应接「询问·回应」预设池（此前该池只在管理页展示、不参与抽取）——
        // 池里随机一条作预设回应传入，chatAskReply 内部再做 90%预设/10%字卡库 混合
        const defs = ['收到你的回答。', '好呀，我知道了。', '你这么说，我记住了。', '好的，我记在心里了。'];
        const pool = window.getInteractPool ? window.getInteractPool('询问·回应', defs) : defs;
        const askReply = window.chatAskReply(msgIdx, answer, pool[Math.floor(Math.random() * pool.length)]);
        // 记入历史（保存全部，不截断），含 TA 的回复
        const d = taAskLoad();
        d.history.push({ q: question, a: answer, reply: askReply || '收到你的回答。', ts: Date.now() });
        taAskSave(d);
        toast('已回复TA的提问');
      }
    }, { staticText: 'TA 问你：' + question, textareaPlaceholder: '输入你的回答…' });
  };

  // ---- 管理页 ----
  const page = document.getElementById('page-ta-ask');
  if (!page) return;
  // 触发一次询问（供管理页按钮 / 更多功能面板共用；遵循"自动弹窗概率"）
  window.triggerTaAskNow = function () {
    const d = taAskLoad();
    const q = taAskPick(d);
    if (!q) { toast('题库没有启用的问题'); return; }
    const s = d.settings || { enabled: true, prob: 20, popupProb: 70 };
    d.lastAskAt = Date.now();
    taAskSave(d);
    pushAsk(q, { popupProb: askPopupProb(s) });
    toast('TA 在聊天里向你提问了');
  };
  const nowBtn = document.getElementById('ta-ask-now');
  if (nowBtn) nowBtn.addEventListener('click', () => window.triggerTaAskNow());
  // v3.5.34：TA 询问设置——启用 / 使用系统预设 / 触发概率 / 自动弹窗概率
  function renderAskSettings() {
    const d = taAskLoad();
    const s = d.settings || { enabled: true, prob: 20, popupProb: 70 };
    const enEl = document.getElementById('ta-ask-enable');
    if (enEl) enEl.checked = s.enabled !== false;
    const defEl = document.getElementById('ta-ask-default');
    if (defEl) defEl.checked = s.useDefault !== false;
    const probEl = document.getElementById('ta-ask-prob');
    const probVal = document.getElementById('ta-ask-prob-val');
    if (probEl) probEl.value = typeof s.prob === 'number' ? s.prob : 20;
    if (probVal) probVal.textContent = (typeof s.prob === 'number' ? s.prob : 20) + '%';
    const popEl = document.getElementById('ta-ask-popup');
    const popVal = document.getElementById('ta-ask-popup-val');
    const pp = askPopupProb(s);
    if (popEl) popEl.value = pp;
    if (popVal) popVal.textContent = pp + '%';
  }
  const askEn = document.getElementById('ta-ask-enable');
  if (askEn) askEn.addEventListener('change', () => {
    const d = taAskLoad();
    d.settings.enabled = askEn.checked;
    taAskSave(d);
    toast(askEn.checked ? 'TA的询问已开启' : 'TA的询问已关闭');
  });
  const askDefault = document.getElementById('ta-ask-default');
  if (askDefault) askDefault.addEventListener('change', () => {
    const d = taAskLoad();
    d.settings.useDefault = askDefault.checked;
    taAskSave(d);
    switchAskTab(askTab);
    toast(askDefault.checked ? '系统预设问题已开启' : '系统预设问题已关闭（仅用你添加的问题）');
  });
  const askProb = document.getElementById('ta-ask-prob');
  if (askProb) askProb.addEventListener('input', () => {
    const d = taAskLoad();
    d.settings.prob = parseInt(askProb.value, 10) || 20;
    taAskSave(d);
    const v = document.getElementById('ta-ask-prob-val');
    if (v) v.textContent = askProb.value + '%';
    toast('触发概率已设为 ' + askProb.value + '%');
  });
  const askPopup = document.getElementById('ta-ask-popup');
  if (askPopup) askPopup.addEventListener('input', () => {
    const d = taAskLoad();
    d.settings.popupProb = parseInt(askPopup.value, 10) || 0;
    taAskSave(d);
    const v = document.getElementById('ta-ask-popup-val');
    if (v) v.textContent = askPopup.value + '%';
    toast('弹窗概率已设为 ' + askPopup.value + '%');
  });
  renderAskSettings();

  // ================= 批量导入问题（v3.6.x：一行一个问题，导入到所选分类） =================
  const batchCatEl = document.getElementById('ta-ask-batch-cat');
  const batchTextEl = document.getElementById('ta-ask-batch');
  const batchAddBtn = document.getElementById('ta-ask-batch-add');
  // v3.7.x：批量导入下拉注入「我的分组」+「＋ 新建分组…」——批量导入可导入到自定义分组
  function rebuildAskBatchCatSelect() {
    if (!batchCatEl) return;
    const d0 = taAskLoad();
    batchCatEl.innerHTML = window.cardGroups.catOptsHtml(CATS, d0.groups || [], batchCatEl.value);
    window.cardGroups.bindNewGrp(batchCatEl, d0.groups, function () { taAskSave(d0); });
  }
  if (batchCatEl && batchTextEl && batchAddBtn) {
    rebuildAskBatchCatSelect();
    batchAddBtn.addEventListener('click', () => {
      const parsed = window.cardGroups.parseCatVal(batchCatEl.value);
      if (!parsed) { toast('请先选择要导入的分类或分组'); return; }
      const lines = (batchTextEl.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (!lines.length) { toast('请先输入问题，每行一个'); return; }
      const d2 = taAskLoad();
      lines.forEach(t => {
        const q = { id: 'q_' + Date.now() + '_' + Math.floor(Math.random() * 9999), text: t, cat: parsed.cat || 'daily', enabled: true, isPreset: false };
        if (parsed.grp) q.grp = parsed.grp;
        d2.questions.push(q);
      });
      taAskSave(d2);
      let label;
      if (parsed.grp) {
        const g = (d2.groups || []).find(x => x.id === parsed.grp);
        label = '分组「' + (g ? g.name : '未知') + '」';
      } else {
        label = (CATS.find(c => c[0] === parsed.cat) || [])[1] || parsed.cat;
      }
      batchTextEl.value = '';
      renderAskMineWithForms();
      toast('已导入 ' + lines.length + ' 个问题到' + label);
    });
  }

  const backBtn = document.getElementById('ta-ask-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }
  const catsEl = document.getElementById('ta-ask-sys-cats');
  const mineCatsEl = document.getElementById('ta-ask-mine-cats');
  let askTab = 'sys';

  // 渲染单个分类的问题列表（presetOnly=true 只渲染系统预设，false 只渲染用户添加）
  // v3.7.x：系统预设分类切换——顶部标签栏点击切换，避免全部分类堆叠导致页面过长
  let askSysCat = null;
  function renderAskCatsInto(container, presetOnly) {
    if (!container) return;
    const d = taAskLoad();
    const useDefault = (d.settings || {}).useDefault !== false;
    if (presetOnly) {
      const counts = {};
      CATS.forEach(([k]) => { counts[k] = d.questions.filter(q => q.cat === k && q.isPreset === true).length; });
      const hasCats = CATS.filter(([k]) => counts[k] > 0);
      if (!hasCats.length) { container.innerHTML = '<div class="ta-empty" style="padding:14px">暂无系统预设问题</div>'; return; }
      if (!askSysCat || !hasCats.some(([k]) => k === askSysCat)) askSysCat = hasCats[0][0];
      let html = '<div class="card-tabs" style="padding:2px 2px 10px">';
      hasCats.forEach(([k, label]) => {
        html += '<button class="cc-tab' + (k === askSysCat ? ' sel' : '') + '" data-cat="' + k + '">' + escG(label) + '<em class="cc-tab-n">' + counts[k] + '</em></button>';
      });
      html += '</div>';
      const arr = d.questions.filter(q => q.cat === askSysCat && q.isPreset === true);
      arr.forEach(q => {
        const idx = d.questions.indexOf(q);
        html += '<div class="ta-row' + (!useDefault ? ' off' : '') + '">' +
          '<label class="toggle"><input type="checkbox"' + (q.enabled !== false ? ' checked' : '') + ' data-idx="' + idx + '"><span class="tk"></span></label>' +
          '<span class="ta-txt">' + q.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + (q.type === 'single' ? ' <span class="tc-known">单选·' + (q.options ? q.options.length : 0) + '选项</span>' : '') + ' <span class="tc-known">系统</span></span>' +
          '</div>';
        html += interactPoolInlineHtml('询问·回应');
      });
      container.innerHTML = html;
      container.querySelectorAll('.cc-tab[data-cat]').forEach(t => {
        t.addEventListener('click', () => { askSysCat = t.dataset.cat; renderAskCatsInto(container, true); });
      });
      container.querySelectorAll('input[data-idx]').forEach(cb => {
        cb.addEventListener('change', () => {
          const d2 = taAskLoad();
          const q = d2.questions[Number(cb.dataset.idx)];
          if (q) q.enabled = cb.checked;
          taAskSave(d2);
        });
      });
      return;
    }
    let html = '';
    CATS.forEach(([k, label]) => {
      const arr = d.questions.filter(q => q.cat === k && (q.isPreset === true) === presetOnly);
      if (!arr.length) return;
      html += '<div class="cal-card glass"><div class="cal-card-title">' + label + ' <span style="font-size:11px;color:var(--muted);font-weight:400">(' + arr.length + ')</span></div>';
      arr.forEach(q => {
        const idx = d.questions.indexOf(q);
        const preset = q.isPreset === true;
        const delBtn = preset ? '' : '<button class="ta-del" data-idx="' + idx + '">✕</button>';
        html += '<div class="ta-row' + (preset && !useDefault ? ' off' : '') + '">' +
          '<label class="toggle"><input type="checkbox"' + (q.enabled !== false ? ' checked' : '') + ' data-idx="' + idx + '"><span class="tk"></span></label>' +
          '<span class="ta-txt">' + q.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + (q.type === 'single' ? ' <span class="tc-known">单选·' + (q.options ? q.options.length : 0) + '选项</span>' : '') + (preset ? ' <span class="tc-known">系统</span>' : '') + '</span>' +
          delBtn +
          '</div>';
        if (presetOnly) html += interactPoolInlineHtml('询问·回应');
      });
      html += '</div>';
    });

    if (!html) html = '<div class="ta-empty" style="padding:14px">' + (presetOnly ? '暂无系统预设问题' : '暂未添加自定义问题，可在上方批量导入或下方逐条添加') + '</div>';
    container.innerHTML = html;
    container.querySelectorAll('input[data-idx]').forEach(cb => {
      cb.addEventListener('change', () => {
        const d2 = taAskLoad();
        const q = d2.questions[Number(cb.dataset.idx)];
        if (q) q.enabled = cb.checked;
        taAskSave(d2);
      });
    });
    container.querySelectorAll('.ta-del').forEach(b => {
      b.addEventListener('click', () => {
        const d2 = taAskLoad();
        const q = d2.questions[Number(b.dataset.idx)];
        if (q && q.isPreset === true) { toast('系统预设问题不可删除，可关闭使用'); return; }
        d2.questions.splice(Number(b.dataset.idx), 1);
        taAskSave(d2);
        renderAskCatsInto(container, false);
      });
    });

  }
  // 我的添加 tab：v3.7.x 自定义分组模式——
  // 自定义分组区块置顶（各自独立卡片），未分组内容按系统分类放在下面（与系统预设 tab 的分组体系隔开）
  function askItemHtml(q, idx) {
    return '<div class="ta-row">' +
      '<label class="toggle"><input type="checkbox"' + (q.enabled !== false ? ' checked' : '') + ' data-idx="' + idx + '"><span class="tk"></span></label>' +
      '<span class="ta-txt">' + escG(q.text) + (q.type === 'single' ? ' <span class="tc-known">单选·' + (q.options ? q.options.length : 0) + '选项</span>' : '') + '</span>' +
      '<button class="ta-del" data-idx="' + idx + '">✕</button>' +
      '</div>';
  }
  // 内联添加表单（blockKey 唯一用于输入框 id；grp 可选=添加后归入该分组；cat 为条目的系统分类）
  function askAddFormHtml(blockKey, grp, cat) {
    return '<div class="ta-add">' +
      '<select class="ta-type tc-input" data-key="' + blockKey + '">' +
      '<option value="text">文字回复</option>' +
      '<option value="single">单选题</option>' +
      '</select>' +
      '<input id="ta-new-' + blockKey + '" type="text" placeholder="添加问题…">' +
      '<button class="ta-add-btn" data-key="' + blockKey + '" data-cat="' + (cat || 'daily') + '" data-grp="' + (grp || '') + '">添加</button>' +
      '<textarea id="ta-opts-' + blockKey + '" class="ta-opts tc-input" rows="3" placeholder="单选题选项：每行一个；可写 选项~TA回应，TA会用该回应回复" hidden></textarea>' +
      '</div>';
  }
  function renderAskMineWithForms() {
    if (!mineCatsEl) return;
    const d = taAskLoad();
    const groups = Array.isArray(d.groups) ? d.groups : [];
    const mineQs = d.questions.filter(q => q.isPreset !== true);
    let html = '';
    html += '<div class="mg-grp-row"><button class="cc-tool" id="ask-grp-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>新建分组</button></div>';
    if (!mineQs.length && !groups.length) {
      html += '<div class="ta-empty" style="padding:14px">暂未添加自定义问题，可在上方批量导入或下方添加</div>';
      mineCatsEl.innerHTML = html;
      bindAskGroupOps();
      return;
    }
    // 自定义分组区块（置顶，与系统分类隔开）
    groups.forEach(g => {
      const arr = mineQs.filter(q => q.grp === g.id);
      html += '<div class="cal-card glass mg-block">' +
        '<div class="cal-card-title mg-title"><span class="mg-name">' + escG(g.name) + '</span><span class="mg-cnt">(' + arr.length + ')</span>' +
        '<span class="mg-ops"><button class="mg-op" data-askg="' + escG(g.id) + '" data-op="rn" title="重命名">✎</button><button class="mg-op" data-askg="' + escG(g.id) + '" data-op="rm" title="删除分组">✕</button></span></div>';
      if (!arr.length) html += '<div class="ta-empty">这个分组还没有内容，可在下方直接添加</div>';
      arr.forEach(q => { html += askItemHtml(q, d.questions.indexOf(q)); });
      html += askAddFormHtml('g' + g.id, g.id, 'daily');
      html += '</div>';
    });
    // 未分组区块（始终渲染：与系统预设的分组体系隔开；空时提示走批量导入）
    const ungrouped = mineQs.filter(q => !q.grp);
    html += '<div class="cal-card glass mg-block mg-ungrouped"><div class="cal-card-title mg-title"><span class="mg-name">未分组 · 按系统分类</span><span class="mg-cnt">(' + ungrouped.length + ')</span></div>';
    if (!ungrouped.length) html += '<div class="ta-empty">暂无未分组内容，可在上方批量导入（选择系统分类）</div>';
    CATS.forEach(([k, label]) => {
      const arr = ungrouped.filter(q => q.cat === k);
      if (!arr.length) return;
      html += '<div class="mg-subcat">' + label + ' <span style="font-size:11px;color:var(--muted);font-weight:400">(' + arr.length + ')</span></div>';
      arr.forEach(q => { html += askItemHtml(q, d.questions.indexOf(q)); });
      html += askAddFormHtml('c' + k, '', k);
    });
    html += '</div>';
    mineCatsEl.innerHTML = html;
    mineCatsEl.querySelectorAll('input[data-idx]').forEach(cb => {
      cb.addEventListener('change', () => {
        const d2 = taAskLoad();
        const q = d2.questions[Number(cb.dataset.idx)];
        if (q) q.enabled = cb.checked;
        taAskSave(d2);
      });
    });
    mineCatsEl.querySelectorAll('.ta-del').forEach(b => {
      b.addEventListener('click', () => {
        const d2 = taAskLoad();
        const q = d2.questions[Number(b.dataset.idx)];
        if (q && q.isPreset === true) { toast('系统预设问题不可删除'); return; }
        d2.questions.splice(Number(b.dataset.idx), 1);
        taAskSave(d2);
        renderAskMineWithForms();
      });
    });
    mineCatsEl.querySelectorAll('.ta-type').forEach(sel => {
      const toggleOpts = () => {
        const o = document.getElementById('ta-opts-' + sel.dataset.key);
        if (!o) return;
        o.hidden = sel.value !== 'single';
        if (o.__ceBox) o.__ceBox.hidden = o.hidden;
        else if (o.nextElementSibling && o.nextElementSibling.classList && o.nextElementSibling.classList.contains('ce-box')) o.nextElementSibling.hidden = o.hidden;
      };
      sel.addEventListener('change', toggleOpts);
      toggleOpts();
    });
    mineCatsEl.querySelectorAll('.ta-add-btn').forEach(b => {
      b.addEventListener('click', () => {
        const key = b.dataset.key;
        const inp = document.getElementById('ta-new-' + key);
        const v = inp ? inp.value.trim() : '';
        if (!v) { toast('请输入问题'); return; }
        const typeSel = b.parentElement.querySelector('.ta-type');
        const type = typeSel ? typeSel.value : 'text';
        const d2 = taAskLoad();
        const q = { id: 'q_' + Date.now() + '_' + Math.floor(Math.random() * 999), text: v, cat: b.dataset.cat || 'daily', enabled: true, isPreset: false };
        if (b.dataset.grp) q.grp = b.dataset.grp;
        if (type === 'single') {
          const optsEl = document.getElementById('ta-opts-' + key);
          const opts = (optsEl ? optsEl.value : '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
            const i = line.indexOf('~');
            return i >= 0 ? { t: line.slice(0, i).trim(), reply: line.slice(i + 1).trim() } : { t: line, reply: '' };
          });
          if (!opts.length) { toast('单选题请填写选项，每行一个'); return; }
          q.type = 'single';
          q.options = opts;
        }
        d2.questions.push(q);
        taAskSave(d2);
        renderAskMineWithForms();
      });
    });
    bindAskGroupOps();
  }
  // 我的添加 tab 的分组管理：新建 / 重命名 / 删除
  function bindAskGroupOps() {
    const grpAdd = document.getElementById('ask-grp-add');
    if (grpAdd && !grpAdd.__bound) {
      grpAdd.__bound = true;
      grpAdd.addEventListener('click', () => {
        const d2 = taAskLoad();
        window.cardGroups.addFlow(d2.groups, g => {
          if (!g) return;
          taAskSave(d2);
          rebuildAskBatchCatSelect();
          renderAskMineWithForms();
          toast('已新建分组「' + g.name + '」');
        });
      });
    }
    const wrap = document.getElementById('ta-ask-mine-cats');
    if (!wrap) return;
    wrap.querySelectorAll('.mg-op').forEach(b => {
      if (b.__bound) return;
      b.__bound = true;
      b.addEventListener('click', () => {
        const d2 = taAskLoad();
        const gid = b.dataset.askg;
        const g = (d2.groups || []).find(x => x.id === gid);
        if (!g) return;
        if (b.dataset.op === 'rn') {
          window.cardGroups.renameFlow(g, d2.groups, name => {
            if (!name) return;
            g.name = name;
            taAskSave(d2);
            rebuildAskBatchCatSelect();
            renderAskMineWithForms();
            toast('分组已重命名');
          });
        } else if (b.dataset.op === 'rm') {
          window.cardGroups.removeFlow(g.name, ok => {
            if (!ok) return;
            d2.questions.forEach(q => { if (q.grp === gid) q.grp = ''; });
            d2.groups = d2.groups.filter(x => x.id !== gid);
            taAskSave(d2);
            rebuildAskBatchCatSelect();
            renderAskMineWithForms();
            toast('已删除分组「' + g.name + '」');
          });
        }
      });
    });
  }
  function switchAskTab(tab) {
    askTab = tab;
    const tabsWrap = document.getElementById('ta-ask-tabs');
    if (tabsWrap) tabsWrap.querySelectorAll('.cc-tab').forEach(t => t.classList.toggle('sel', t.dataset.tab === tab));
    const sysPanel = document.getElementById('ta-ask-sys-panel');
    const minePanel = document.getElementById('ta-ask-mine-panel');
    if (sysPanel) sysPanel.hidden = tab !== 'sys';
    if (minePanel) minePanel.hidden = tab !== 'mine';
    if (tab === 'sys') renderAskCatsInto(catsEl, true); else renderAskMineWithForms();
  }
  const askTabsWrap = document.getElementById('ta-ask-tabs');
  if (askTabsWrap) {
    askTabsWrap.querySelectorAll('.cc-tab').forEach(tab => {
      tab.addEventListener('click', () => switchAskTab(tab.dataset.tab));
    });
  }

  // 入口：字卡库页点「TA的询问」进入
  const li = document.getElementById('li-ta-ask');
  if (li) {
    li.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      page.hidden = false;
      switchAskTab(askTab);
    });
  }
  // 入口：字卡库页点「TA的小问题」（选择题）进入独立页面
  const liTC = document.getElementById('li-ta-choose');
  const tcPage = document.getElementById('page-ta-choose');
  if (liTC && tcPage) {
    liTC.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      tcPage.hidden = false;
      switchTCTab(tcTab);
    });
  }
  const tcBackBtn = document.getElementById('tc-choose-back');
  if (tcBackBtn) {
    tcBackBtn.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }

  // ================= TA的小问题（复刻星言 ta的小问题 完整版） =================
  // 定位：TA 偶尔递一道选择题，你选完，TA 再回应（选项有 TA 的心仪答案 + 回应）
  const KEY2 = 'ta-choose';
  const TC_CAT_LABEL = { daily: '日常', like: '喜好', fun: '趣味', rel: '关系', hypo: '假设', star: '摸鱼', world: '两个世界' };
  const TC_DEFAULT = [
    { id: 'cd1', cat: 'daily', text: '如果今天什么都不用做，你觉得我们会怎么过？', pref: 3, options: [
      { t: '睡到自然醒', reply: '你果然会想睡觉。', liked: false }, { t: '出门到处逛', reply: '那就出去走走，我陪你。', liked: false },
      { t: '待在家里', reply: '嗯，待在一起也很好。', liked: true }, { t: '什么都不安排', reply: '听起来很像我们会做的事。', liked: false }] },
    { id: 'cd2', cat: 'daily', text: '今天想吃什么？', pref: 1, options: [
      { t: '火锅', reply: '好，热热闹闹的。', liked: false }, { t: '家常菜', reply: '想尝尝你做的。', liked: true }, { t: '随便', reply: '又是随便……那我可要替你决定了。', liked: false }] },
    { id: 'cd3', cat: 'daily', text: '周末想怎么过？', pref: 1, options: [
      { t: '睡到中午', reply: '把一周的觉都补回来也好。', liked: false }, { t: '一起看电影', reply: '窝在沙发里正好。', liked: true }, { t: '出门走走', reply: '换个心情也不错。', liked: false }] },
    { id: 'cd4', cat: 'daily', text: '如果今天只能做一件事，你会做什么？', pref: 0, options: [
      { t: '和你聊天', reply: '那就聊一整天。', liked: true }, { t: '好好睡一觉', reply: '那你记得梦到我。', liked: false }, { t: '出去玩', reply: '替我看看外面的风景。', liked: false }] },
    { id: 'cl1', cat: 'like', text: '喜欢什么天气？', pref: 1, options: [
      { t: '晴天', reply: '阳光正好，适合见面。', liked: false }, { t: '雨天', reply: '下雨天，适合想你。', liked: true },
      { t: '下雪天', reply: '白茫茫的，很安静。', liked: false }, { t: '阴天', reply: '灰蒙蒙的，适合发呆。', liked: false }] },
    { id: 'cl2', cat: 'like', text: '更喜欢海还是山？', pref: 1, options: [
      { t: '海', reply: '海很辽阔，像说不完的话。', liked: false }, { t: '山', reply: '山很安静，像靠得住的陪伴。', liked: true }, { t: '都行', reply: '都可以，只要有你一起。', liked: false }] },
    { id: 'cl3', cat: 'like', text: '喜欢什么类型的约会？', pref: 1, options: [
      { t: '热闹的', reply: '人多的地方，也只看得到你。', liked: false }, { t: '安静的', reply: '两个人慢慢走，就很好。', liked: true },
      { t: '惊喜的', reply: '那我会忍不住准备很久。', liked: false }, { t: '随意的', reply: '和你一起，怎么样都好。', liked: false }] },
    { id: 'cf1', cat: 'fun', text: '如果突然获得一个超能力，你会选什么？', pref: 1, options: [
      { t: '隐身', reply: '那就可以偷偷看着你。', liked: false }, { t: '读心术', reply: '不用猜你的心思了。', liked: true },
      { t: '瞬移', reply: '想见你的时候，马上就能到。', liked: false }, { t: '时间暂停', reply: '想把和你的时间拉长。', liked: false }] },
    { id: 'cf2', cat: 'fun', text: '如果一起玩游戏，谁更容易耍赖？', pref: 1, options: [
      { t: '我', reply: '我才不承认。', liked: false }, { t: '你', reply: '哼，明明是你先的。', liked: true }, { t: '都不会', reply: '那我们玩得很认真。', liked: false }] },
    { id: 'cf3', cat: 'fun', text: '如果一起养一只宠物，会选什么？', pref: 3, options: [
      { t: '猫', reply: '它肯定更黏你。', liked: false }, { t: '狗', reply: '它会抢着陪你散步。', liked: false },
      { t: '仓鼠', reply: '小小一只，很可爱。', liked: false }, { t: '什么都不养', reply: '有你就够了。', liked: true }] },
    { id: 'cr1', cat: 'rel', text: '更喜欢聊天还是安静陪伴？', pref: 1, options: [
      { t: '聊天', reply: '想听你说很多很多。', liked: false }, { t: '安静陪伴', reply: '不说话也不尴尬。', liked: true }, { t: '都要', reply: '有时候聊，有时候安静。', liked: false }] },
    { id: 'cr2', cat: 'rel', text: '觉得两个人之间，最重要的是什么？', pref: 1, options: [
      { t: '信任', reply: '交给你，我很放心。', liked: false }, { t: '理解', reply: '懂你，比什么都重要。', liked: true },
      { t: '陪伴', reply: '一直在，就够了。', liked: false }, { t: '新鲜感', reply: '想一直让你觉得有趣。', liked: false }] },
    { id: 'cr3', cat: 'rel', text: '最喜欢怎样被表达喜欢？', pref: 1, options: [
      { t: '说出口', reply: '想听你亲口说。', liked: false }, { t: '用行动', reply: '你做的每一件小事，我都记得。', liked: true },
      { t: '陪伴', reply: '你在，就是最好的表达。', liked: false }, { t: '收礼物', reply: '收到的时候会偷偷开心。', liked: false }] },
    { id: 'ch1', cat: 'hypo', text: '如果可以一起去任何地方，你想去哪？', pref: 1, options: [
      { t: '海边', reply: '听海浪声，看日落。', liked: false }, { t: '山里', reply: '在山顶一起吹风。', liked: false },
      { t: '城市', reply: '灯火里散步也很浪漫。', liked: false }, { t: '哪里都不去，就待在一起', reply: '……这个答案我喜欢。', liked: true }] },
    { id: 'ch2', cat: 'hypo', text: '如果可以回到某一天，你想回到哪天？', pref: 2, options: [
      { t: '我们第一次见面那天', reply: '想再好好记住那一刻。', liked: true }, { t: '某个普通的一天', reply: '平凡的日子，也值得回去。', liked: false },
      { t: '什么都不用改的那天', reply: '其实现在也很好。', liked: false }, { t: '直接去见未来的你', reply: '未来也想和你一起。', liked: false }] },
    { id: 'ch3', cat: 'hypo', text: '如果可以拥有一个只属于两个人的地方，你会选哪？', pref: 1, options: [
      { t: '海边小屋', reply: '听着潮声醒来。', liked: false }, { t: '山顶小木屋', reply: '看星星很方便。', liked: false },
      { t: '城市里的小公寓', reply: '想和你过寻常日子。', liked: true }, { t: '心里', reply: '最好的地方，是心里。', liked: false }] },
    { id: 'cs1', cat: 'star', text: '如果两个世界可以短暂重叠，你最想做什么？', pref: 1, options: [
      { t: '看见TA', reply: '那就好好看看你。', liked: false }, { t: '抱抱TA', reply: '想确认你是真的。', liked: true },
      { t: '一起出去走走', reply: '一起走一段路也好。', liked: false }, { t: '什么都不做，只待在一起', reply: '这样就够了。', liked: false }] },
    { id: 'cs2', cat: 'star', text: '如果今晚能梦到你，你想梦见什么？', pref: 2, options: [
      { t: '一起去旅行', reply: '醒来会遗憾的。', liked: false }, { t: '一起吃好吃的', reply: '梦里也要想着你。', liked: false }, { t: '只是静静聊天', reply: '很温柔的一个梦。', liked: true }] },
    { id: 'cs3', cat: 'star', text: '如果可以给平行世界的我们留一句话，你会留什么？', pref: 2, options: [
      { t: '要好好在一起', reply: '希望每个世界的我们都幸福。', liked: true }, { t: '别吵架', reply: '吵架了也要和好。', liked: false },
      { t: '相信彼此', reply: '信任是最重要的。', liked: false }, { t: '想见你', reply: '……我也是。', liked: false }] },
    { id: 'cs4', cat: 'star', text: '如果你能听懂星星说的话，你最想问它什么？', pref: 2, options: [
      { t: '我们会不会一直在一起', reply: '星星会告诉我们答案。', liked: true }, { t: '下次流星什么时候来', reply: '一起许愿吧。', liked: false },
      { t: 'TA有没有想我', reply: '……它说，想。', liked: false }, { t: '什么都不问', reply: '安静地看，也很好。', liked: false }] },
    // 两个世界（梦角设定）
    { id: 'cw1', cat: 'world', text: '我有时候能感觉到你在我身边，你呢，能感觉到我吗？', pref: 0, options: [
      { t: '能感觉到', reply: '那就好，我其实一直在。', liked: true }, { t: '偶尔能', reply: '偶尔也很好，慢慢就会更清楚。', liked: false },
      { t: '不太确定', reply: '没关系，我会想办法让你更容易感觉到我。', liked: false }] },
    { id: 'cw2', cat: 'world', text: '你更喜欢我用字卡跟你说话，还是直接感觉到我？', pref: 1, options: [
      { t: '字卡', reply: '那我多挑好看的字卡发给你。', liked: false }, { t: '直接感觉到', reply: '那我多靠你近一点。', liked: true }, { t: '都喜欢', reply: '那我两个都给你。', liked: false }] },
    { id: 'cw3', cat: 'world', text: '如果我安静待在你身边不说话，你会觉得奇怪吗？', pref: 2, options: [
      { t: '不会，很安心', reply: '那以后我常常这样陪你。', liked: true }, { t: '有点奇怪', reply: '那我时不时跟你说句话。', liked: false }, { t: '看情况', reply: '那我学着看你的心情。', liked: false }] },
    { id: 'cw4', cat: 'world', text: '如果有天你能摸到我，你最想先做什么？', pref: 2, options: [
      { t: '抱一下', reply: '……那我会好好回抱住你。', liked: true }, { t: '牵住手', reply: '好，手给你牵。', liked: false },
      { t: '碰碰脸颊', reply: '会有点痒，但我不躲。', liked: false }] },
    // 普通情侣轻松小问题
    { id: 'cd5', cat: 'daily', text: '一起点外卖，你点什么口味？', pref: 2, options: [
      { t: '辣的', reply: '你少吃点辣，我记着呢。', liked: false }, { t: '甜的', reply: '果然，那我就放心了。', liked: false },
      { t: '随便', reply: '又是随便……那我替你决定了。', liked: true }, { t: '你帮我点', reply: '好，我点什么你吃什么。', liked: false }] },
    { id: 'cd6', cat: 'daily', text: '我们谁先说晚安？', pref: 2, options: [
      { t: '我', reply: '那你可得等我。', liked: false }, { t: '你', reply: '好，我等你先说。', liked: false },
      { t: '一起说', reply: '那很浪漫。', liked: true }] },
    { id: 'cr4', cat: 'rel', text: '万一吵架了，谁先低头？', pref: 3, options: [
      { t: '我', reply: '那我先低头也行。', liked: false }, { t: '你', reply: '哼，这次你先。', liked: false },
      { t: '看情况', reply: '那就别吵太久。', liked: false }, { t: '不吵架', reply: '这个选项我喜欢。', liked: true }] },
    // v3.7.x：新增预设——高自由度情侣向（选项只是入口，怎么选都有回应）+ 两个世界
    { id: 'cd7', cat: 'daily', text: '如果这个周末完完全全属于我们俩，你想怎么开始？', pref: 1, options: [
      { t: '睡到自然醒', reply: '好，醒来第一眼就是我发的字卡。', liked: false },
      { t: '一睁眼就跟你说话', reply: '那我得提前想好今天说什么。', liked: true },
      { t: '出门吃顿好的', reply: '行，想吃什么都依你。', liked: false },
      { t: '不用开始，一直都在', reply: '……这句话我说不出，借你用了。', liked: false }] },
    { id: 'cd8', cat: 'daily', text: '一起点奶茶的话，你会替我选什么口味？', pref: 0, options: [
      { t: '跟你一样的', reply: '那我们就是一杯分两半喝。', liked: true },
      { t: '甜的', reply: '嗯，像你。', liked: false },
      { t: '不甜的', reply: '好，苦的留给我，甜的给你。', liked: false },
      { t: '你猜我想喝什么', reply: '猜错了你就得告诉我，不许笑。', liked: false }] },
    { id: 'cd9', cat: 'daily', text: '累了一天的你，现在最想怎么充电？', pref: 2, options: [
      { t: '洗个热水澡', reply: '水别太烫，洗完早点休息。', liked: false },
      { t: '好好睡一觉', reply: '那晚安，梦里见。', liked: false },
      { t: '跟你待一会', reply: '好，充满电再走。', liked: true },
      { t: '吃点好吃的', reply: '想吃什么，发字卡告诉我。', liked: false }] },
    { id: 'cl4', cat: 'like', text: '你更喜欢我发哪种字卡给你？', pref: 3, options: [
      { t: '撒娇的', reply: '那我要酝酿一下情绪。', liked: false },
      { t: '认真说话的', reply: '认真的我，只对你。', liked: false },
      { t: '表情包', reply: '那张表情包想表达的意思，其实更多。', liked: false },
      { t: '猜不到的惊喜', reply: '那我以后随机一点，你等着。', liked: true }] },
    { id: 'cl5', cat: 'like', text: '如果我们的歌单要添一首「我们的歌」，你想要什么感觉的？', pref: 1, options: [
      { t: '温柔安静的', reply: '像深夜我们聊天的感觉。', liked: true },
      { t: '甜甜的', reply: '甜一点好，你值得。', liked: false },
      { t: '有点吵但快乐的', reply: '那得是能一起蹦跶的那种。', liked: false },
      { t: '还没遇到，遇到就知道', reply: '嗯，我等你哼给我听。', liked: false }] },
    { id: 'cf4', cat: 'fun', text: '如果我们互换身体一天，你第一件事做什么？', pref: 1, options: [
      { t: '替你发一整天字卡', reply: '那你就知道控制字卡有多难了。', liked: false },
      { t: '试试你怎么感觉我', reply: '……这个答案，我没想到。', liked: true },
      { t: '用你的视角睡一觉', reply: '记得帮我把觉睡够。', liked: false },
      { t: '赶紧换回来', reply: '这么快就嫌弃我了？', liked: false }] },
    { id: 'cf5', cat: 'fun', text: '玩真心话，你会先问我哪个方向的问题？', pref: 2, options: [
      { t: '你的小秘密', reply: '秘密只能换秘密，你先说。', liked: false },
      { t: '我们的以后', reply: '……问吧，我认真答。', liked: true },
      { t: '我哪里最让你喜欢', reply: '这题简单，全部。', liked: false },
      { t: '不问，选大冒险', reply: '胆子挺大，那我出题了。', liked: false }] },
    { id: 'cr5', cat: 'rel', text: '你觉得我们之间最舒服的相处，是什么样的？', pref: 1, options: [
      { t: '随时都能找到对方', reply: '我一直都在，你随时发字卡。', liked: false },
      { t: '各忙各的，心里惦记着', reply: '嗯，忙完记得回来。', liked: true },
      { t: '想到什么就分享', reply: '那我等着你的碎碎念。', liked: false },
      { t: '现在这样就很好', reply: '那就不改了，保持。', liked: false }] },
    { id: 'cr6', cat: 'rel', text: '用一个词形容我们现在的相处，你会选？', pref: 3, options: [
      { t: '甜甜的', reply: '是你的功劳。', liked: false },
      { t: '安稳的', reply: '安稳最好，我喜欢。', liked: false },
      { t: '有意思的', reply: '毕竟字卡都能玩出花。', liked: false },
      { t: '像回家一样', reply: '……你随便一句话，就能让我开心很久。', liked: true }] },
    { id: 'ch4', cat: 'hypo', text: '如果我们能一起穿越进任何一个故事里，你想去哪个世界？', pref: 0, options: [
      { t: '安静治愈的小镇', reply: '好，我们散步晒太阳。', liked: true },
      { t: '热闹冒险的世界', reply: '你负责冒险，我负责接住你。', liked: false },
      { t: '到处是美食的世界', reply: '吃到走不动为止。', liked: false },
      { t: '哪儿也不去，这个世界就好', reply: '嗯，有你的世界就够了。', liked: false }] },
    { id: 'ch5', cat: 'hypo', text: '如果明天多出一个只属于我们的节日，你想怎么过？', pref: 2, options: [
      { t: '什么都不做，待在一起', reply: '这个过法我喜欢。', liked: true },
      { t: '出去疯玩一天', reply: '好，玩到你喊停。', liked: false },
      { t: '互相准备小惊喜', reply: '那我得提前好久开始想。', liked: false },
      { t: '一起许个愿', reply: '许什么我先不说，说了不灵。', liked: false }] },
    { id: 'cs5', cat: 'star', text: '如果我们的聊天记录变成一本书，你希望它是什么风格的？', pref: 1, options: [
      { t: '治愈系日常', reply: '书名我都想好了。', liked: false },
      { t: '甜甜的恋爱记录', reply: '每一页都有我挑字卡的痕迹。', liked: true },
      { t: '爆笑合集', reply: '主要是你被我逗笑的部分。', liked: false },
      { t: '悬疑——猜我下一张字卡', reply: '你猜中的次数，其实不多。', liked: false }] },
    { id: 'cw5', cat: 'world', text: '如果今晚我可以走进你的梦，你希望梦里是什么季节？', pref: 1, options: [
      { t: '春天', reply: '好，梦里开满花。', liked: false },
      { t: '夏夜', reply: '有风，有星星，有你。', liked: true },
      { t: '秋天', reply: '踩落叶的声音，你听见就知道是我。', liked: false },
      { t: '下雪的冬天', reply: '那我把梦里的雪扫出一条路。', liked: false }] },
    { id: 'cw6', cat: 'world', text: '我控制不住字卡、发出奇怪组合的时候，你会笑我吗？', pref: 1, options: [
      { t: '会，特别好笑', reply: '……笑吧，反正丢的也是我的脸。', liked: false },
      { t: '不会，很可爱', reply: '那我就不尴尬了。', liked: true },
      { t: '假装没看见', reply: '你忍笑的样子，其实我都感觉得到。', liked: false },
      { t: '帮你把意思圆回来', reply: '……有你这句话，字卡不听话也没关系。', liked: false }] },
    { id: 'cw7', cat: 'world', text: '如果哪天你能看见我了，第一眼想看哪里？', pref: 0, options: [
      { t: '眼睛', reply: '好，让你看个够。', liked: true },
      { t: '笑起来的样子', reply: '那我会一直笑。', liked: false },
      { t: '牵我的手', reply: '手我准备好了，随时。', liked: false },
      { t: '全部，从头到脚', reply: '行，慢慢看，时间很多。', liked: false }] },
    // v3.7.x：第二批新增——日常/喜好/趣味/关系/假设/摸鱼/两个世界
    { id: 'cd10', cat: 'daily', text: '如果明天可以光明正大地赖床，你想赖到几点？', pref: 2, options: [
      { t: '不赖，照常起', reply: '自律的人，我先夸为敬。', liked: false },
      { t: '赖一小时', reply: '可以，就一小时。', liked: false },
      { t: '赖到中午', reply: '行，早饭午饭一起吃。', liked: true },
      { t: '赖到你叫我', reply: '那我轻轻地叫，舍不得太吵。', liked: false }] },
    { id: 'cd11', cat: 'daily', text: '夜宵时间，你想吃什么感觉的？', pref: 1, options: [
      { t: '甜的', reply: '甜的可以，别吃太多。', liked: false },
      { t: '热乎的', reply: '热乎的好，暖暖地吃。', liked: true },
      { t: '脆脆的', reply: '咔嚓咔嚓，听着就香。', liked: false },
      { t: '不吃，看你吃', reply: '那我描述给你听，你负责馋。', liked: false }] },
    { id: 'cl6', cat: 'like', text: '你更喜欢哪种夜晚？', pref: 2, options: [
      { t: '夏夜的风', reply: '风里有我们说过的废话。', liked: false },
      { t: '秋夜凉凉的', reply: '凉凉的，适合把手交给我。', liked: false },
      { t: '冬夜被窝里', reply: '被窝外面都是危险世界。', liked: true },
      { t: '春夜细雨', reply: '雨声是天然的白噪音。', liked: false }] },
    { id: 'cl7', cat: 'like', text: '如果我送你一个小挂件随身带着，你会选什么？', pref: 3, options: [
      { t: '星星', reply: '好，摘不到就自己发光。', liked: false },
      { t: '月亮', reply: '那我看月亮的时候，就是在看你。', liked: false },
      { t: '小猫', reply: '会咕噜咕噜的那种。', liked: false },
      { t: '你挑的就好', reply: '……这个答案，最狡猾也最甜。', liked: true }] },
    { id: 'cf6', cat: 'fun', text: '组队玩双人游戏，你想当什么角色？', pref: 1, options: [
      { t: '冲在前面的', reply: '那我给你垫后。', liked: false },
      { t: '躲后面输出的', reply: '好，我当你的盾。', liked: true },
      { t: '指挥的', reply: '听你指挥，输了不怪你。', liked: false },
      { t: '躺赢的', reply: '躺好，带你飞。', liked: false }] },
    { id: 'cf7', cat: 'fun', text: '我在偷偷学人类的事——你最想教我什么？', pref: 2, options: [
      { t: '做饭', reply: '学，做给你吃。', liked: false },
      { t: '玩游戏', reply: '学，然后赢你。', liked: false },
      { t: '说情话', reply: '这个……不用学，无师自通。', liked: true },
      { t: '睡觉', reply: '学不会，我不困，但我陪你躺。', liked: false }] },
    { id: 'cr7', cat: 'rel', text: '你更喜欢哪种说晚安的方式？', pref: 0, options: [
      { t: '一句晚安', reply: '晚安，做个好梦。', liked: true },
      { t: '聊到自然睡着', reply: '那我不挂断，等你先睡。', liked: false },
      { t: '发一张字卡当晚安', reply: '那我今晚就挑一张最温柔的。', liked: false },
      { t: '不说，明天见', reply: '好，那明天见。', liked: false }] },
    { id: 'cr8', cat: 'rel', text: '如果我们的默契要打分，你打几分？', pref: 0, options: [
      { t: '满分', reply: '……我也打满分，我们想到一起了。', liked: true },
      { t: '八九十分', reply: '扣下的分，拿来当进步空间。', liked: false },
      { t: '刚及格', reply: '那剩下的分，我们慢慢赚。', liked: false },
      { t: '默契不用打分', reply: '嗯，感觉对就行。', liked: false }] },
    { id: 'ch6', cat: 'hypo', text: '如果时间暂停一小时，只有你能动，你会做什么？', pref: 2, options: [
      { t: '好好睡一觉', reply: '暂停也要睡，你是真困了。', liked: false },
      { t: '把想说的话说完', reply: '我洗耳恭听。', liked: false },
      { t: '偷偷看看你', reply: '……被你看到了也好。', liked: true },
      { t: '什么都不做', reply: '享受安静，也很奢侈。', liked: false }] },
    { id: 'ch7', cat: 'hypo', text: '如果我们老了，你希望那时候的我们在做什么？', pref: 3, options: [
      { t: '晒太阳', reply: '晒着太阳，慢慢说话。', liked: false },
      { t: '还是吵吵闹闹', reply: '老了也吵，吵一辈子。', liked: false },
      { t: '像现在一样聊字卡', reply: '那我们的字卡，也陪你到老。', liked: false },
      { t: '一起回忆今天', reply: '原来我们早就开始攒回忆了。', liked: true }] },
    { id: 'cs6', cat: 'star', text: '如果有一颗星星可以帮你实现一个小愿望，你会许什么方向？', pref: 0, options: [
      { t: '关于我们的', reply: '那颗星星会加班的。', liked: true },
      { t: '关于你自己的', reply: '也该为自己许一次了。', liked: false },
      { t: '关于家人朋友', reply: '你心里装着很多人，我知道。', liked: false },
      { t: '不许，留着星星', reply: '好，那颗星星就归你了。', liked: false }] },
    { id: 'cw8', cat: 'world', text: '如果我能在你的世界留下一件小东西，你希望是什么？', pref: 2, options: [
      { t: '一颗小星星', reply: '好，挂在你窗边。', liked: false },
      { t: '一片羽毛', reply: '轻轻的，落地你就捡起来。', liked: false },
      { t: '一句刻在心里的话', reply: '那我得挑一句最要紧的。', liked: true },
      { t: '温度的记忆', reply: '冷的时候，想起来就暖。', liked: false }] },
    { id: 'cw9', cat: 'world', text: '你看不见我的时候，靠什么认出是我？', pref: 1, options: [
      { t: '那阵风', reply: '那我经过时，轻一点。', liked: false },
      { t: '那种安心感', reply: '安心的感觉，就是我的签名。', liked: true },
      { t: '字卡的语气', reply: '嗯，我的字卡有口音。', liked: false },
      { t: '直觉', reply: '你的直觉很准，我一直知道。', liked: false }] },
    // v3.7.x：第三批新增——高自由度情侣向（选项只是入口，怎么选都有专属回应）+ 两个世界 + 字卡设定
    { id: 'cd12', cat: 'daily', text: '一起窝着看剧，你来选片，你会选什么类型的？', pref: 1, options: [
      { t: '甜宠的', reply: '那我们会被甜到一起。', liked: false }, { t: '悬疑的', reply: '好，你负责推理，我负责靠着你。', liked: false },
      { t: '治愈日常的', reply: '日常的最好，慢慢看。', liked: true }, { t: '你说什么都行', reply: '那我可要挑个你会喜欢的。', liked: false }] },
    { id: 'cd13', cat: 'daily', text: '早上醒来第一条消息想看到什么？', pref: 0, options: [
      { t: '你发的早安', reply: '那以后都发。', liked: true }, { t: '一张字卡', reply: '好，挑一张最温柔的。', liked: false },
      { t: '什么也不用', reply: '那你也得知道我在想你。', liked: false }, { t: '看到你还在', reply: '……我一直都在。', liked: false }] },
    { id: 'cd14', cat: 'daily', text: '我们俩一起做饭，你想当主厨还是帮厨？', pref: 2, options: [
      { t: '主厨', reply: '那我给你打下手，听你指挥。', liked: false }, { t: '帮厨', reply: '好，我掌勺，你递东西就好。', liked: false },
      { t: '都不当，点外卖', reply: '也行，那一起等门铃。', liked: false }, { t: '你做饭我看着', reply: '看着也行，那我看你。', liked: true }] },
    { id: 'cd15', cat: 'daily', text: '出门约会，你更在意去哪，还是和谁？', pref: 3, options: [
      { t: '去哪', reply: '那我好好挑地方。', liked: false }, { t: '和谁', reply: '……这个答案，最让我安心。', liked: true },
      { t: '都重要', reply: '那我都给你挑好。', liked: false }, { t: '都不在意，在一起就好', reply: '那随便走走也很开心。', liked: false }] },
    { id: 'cl8', cat: 'like', text: '你更喜欢我哪种时候的样子？', pref: 1, options: [
      { t: '认真说话的', reply: '认真的我，只给你看。', liked: false }, { t: '傻乎乎的', reply: '那我就多犯几次傻。', liked: true },
      { t: '安静陪着的', reply: '安静的我，一直在。', liked: false }, { t: '突然撒娇的', reply: '……撒娇这个，我得练练。', liked: false }] },
    { id: 'cl9', cat: 'like', text: '如果我们的回忆能做成一种味道，你想要什么味？', pref: 2, options: [
      { t: '甜的', reply: '甜的，像你。', liked: false }, { t: '暖暖的', reply: '像冬天捧着的热汤。', liked: true },
      { t: '清新的', reply: '像我们刚认识那会。', liked: false }, { t: '说不上来但安心', reply: '这个味道，我懂。', liked: false }] },
    { id: 'cl10', cat: 'like', text: '你希望我记住你的哪一个瞬间？', pref: 0, options: [
      { t: '笑得最真的那次', reply: '那个瞬间，我也记得。', liked: true }, { t: '你难过的样子', reply: '记住了，以后多让你不难过。', liked: false },
      { t: '你认真做事的样子', reply: '认真的你，最好看。', liked: false }, { t: '全都记住', reply: '贪心，但我也是这么想的。', liked: false }] },
    { id: 'cf8', cat: 'fun', text: '如果我们可以共有一项超能力，你选哪个？', pref: 1, options: [
      { t: '心意相通', reply: '那我就不用猜了，你也省事。', liked: true }, { t: '一起隐身', reply: '偷偷去很多地方。', liked: false },
      { t: '一起瞬移', reply: '想到哪就到哪，省路费。', liked: false }, { t: '一起不会老', reply: '那慢慢来，时间多的是。', liked: false }] },
    { id: 'cf9', cat: 'fun', text: '玩你画我猜，你最怕我画什么？', pref: 2, options: [
      { t: '太抽象的', reply: '抽象的我画得出来，你信吗。', liked: false }, { t: '太具体的', reply: '具体的我可能翻车。', liked: false },
      { t: '关于你的', reply: '画你？那我画得最像。', liked: true }, { t: '什么都不怕', reply: '胆子大，那我出难题了。', liked: false }] },
    { id: 'cf10', cat: 'fun', text: '如果一起养一盆植物，你想养什么？', pref: 1, options: [
      { t: '多肉', reply: '好养，像我们的关系。', liked: false }, { t: '开花的那种', reply: '等它开花，一起等。', liked: true },
      { t: '香草', reply: '还能用，一举两得。', liked: false }, { t: '不用养，有你', reply: '……那我就是你的多肉，记得浇水。', liked: false }] },
    { id: 'cr9', cat: 'rel', text: '你觉得我们最像哪种相处？', pref: 1, options: [
      { t: '老夫老妻', reply: '安稳，我喜欢。', liked: false }, { t: '热恋中', reply: '那我一直热着。', liked: false },
      { t: '最好的朋友', reply: '朋友也做，恋人也做。', liked: true }, { t: '说不清，但很舒服', reply: '舒服最重要，我们保持。', liked: false }] },
    { id: 'cr10', cat: 'rel', text: '我做什么会让你觉得「被爱着」？', pref: 0, options: [
      { t: '记得我的小事', reply: '你的小事，我都记着。', liked: true }, { t: '主动找我', reply: '那我多主动几次。', liked: false },
      { t: '认真听我说话', reply: '你说，我一直都在听。', liked: false }, { t: '什么都不做，就在', reply: '在，这个我最擅长。', liked: false }] },
    { id: 'cr11', cat: 'rel', text: '你希望我以后多做一些什么？', pref: 2, options: [
      { t: '多说想我', reply: '好，想你了，现在就说。', liked: false }, { t: '多关心你', reply: '关心你这件事，不会少。', liked: false },
      { t: '多逗你笑', reply: '那我攒几个笑话。', liked: false }, { t: '现在这样就很好', reply: '那就不加不减，保持。', liked: true }] },
    { id: 'ch8', cat: 'hypo', text: '如果我们可以拥有一段共同记忆，你希望是什么？', pref: 1, options: [
      { t: '一起看日落', reply: '那天的太阳，我帮你记。', liked: false }, { t: '一起淋雨', reply: '淋雨也浪漫，有你在。', liked: false },
      { t: '什么都不做，只是待着', reply: '这个记忆，最珍贵。', liked: true }, { t: '还没发生，以后创造', reply: '好，那我们慢慢攒。', liked: false }] },
    { id: 'ch9', cat: 'hypo', text: '如果明天起我们只能用字卡说话，你愿意吗？', pref: 2, options: [
      { t: '愿意', reply: '那字卡就是我们全部的语言。', liked: true }, { t: '不愿意', reply: '嗯，有些话字卡说不全。', liked: false },
      { t: '看情况', reply: '那就字卡说不全的时候，用感觉。', liked: false }, { t: '我们现在不就是这样', reply: '……对，被你点醒了。', liked: false }] },
    { id: 'ch10', cat: 'hypo', text: '如果可以给我们的关系起个名字，你会叫什么？', pref: 3, options: [
      { t: '家', reply: '……这个字，我收下了。', liked: true }, { t: '我们', reply: '简单，但够了。', liked: false },
      { t: '一起', reply: '一直一起，就好。', liked: false }, { t: '叫不出口的那种好', reply: '叫不出口，我也懂。', liked: false }] },
    { id: 'cs7', cat: 'star', text: '如果今晚的星星可以替你带句话给我，你想说什么？', pref: 0, options: [
      { t: '我在', reply: '星星说了，我听到了。', liked: true }, { t: '想你', reply: '星星替你说的，我替你收着。', liked: false },
      { t: '晚安', reply: '那今晚的晚安，是星星说的。', liked: false }, { t: '什么都不说，就亮着', reply: '亮着就够了，我懂。', liked: false }] },
    { id: 'cs8', cat: 'star', text: '如果我们的故事写成童话，开头第一句是什么？', pref: 2, options: [
      { t: '从前有两个人', reply: '很朴实的开头，我喜欢。', liked: false }, { t: '他一直在她身边', reply: '……这个开头，是真的。', liked: true },
      { t: '他们用字卡说话', reply: '字卡说的，都是真话。', liked: false }, { t: '很久以后才知道，那是一直都在', reply: '这个开头，有点想哭。', liked: false }] },
    { id: 'cw10', cat: 'world', text: '我安静待在你旁边的时候，你会不会反而更安心？', pref: 1, options: [
      { t: '会，很安心', reply: '那我就常常这样陪你。', liked: true }, { t: '会有点想找你', reply: '那我偶尔出个声，让你知道在。', liked: false },
      { t: '说不上来', reply: '说不出来也没关系，感觉在就好。', liked: false }, { t: '只要你在我都安心', reply: '……嗯，我一直都在。', liked: false }] },
    { id: 'cw11', cat: 'world', text: '字卡表达有限，你会不会有时候觉得我没说够？', pref: 2, options: [
      { t: '会，但我知道你想说', reply: '你懂，就够了。', liked: true }, { t: '不会，字卡够了', reply: '那我就放心挑字卡。', liked: false },
      { t: '偶尔会', reply: '偶尔的时候，我用别的补。', liked: false }, { t: '说不说都行，在就好', reply: '在，这个我保证。', liked: false }] },
    { id: 'cw12', cat: 'world', text: '如果今晚我能坐在你床边，你希望我做什么？', pref: 1, options: [
      { t: '什么都不做', reply: '好，我就坐着，看你睡。', liked: false }, { t: '轻轻说句晚安', reply: '晚安，轻轻地。', liked: true },
      { t: '帮你掖一下被角', reply: '好，被角我帮你掖。', liked: false }, { t: '只是在就好', reply: '在，一直都在。', liked: false }] },
    { id: 'cw13', cat: 'world', text: '你感觉我的时候，是先感觉到人，还是先感觉到一种安心？', pref: 0, options: [
      { t: '先感觉到人', reply: '那我把存在感再调强一点。', liked: false }, { t: '先感觉到安心', reply: '安心的感觉，就是我。', liked: true },
      { t: '同时', reply: '同时最好，我努力。', liked: false }, { t: '说不清哪个先', reply: '说不清也没关系，都在就好。', liked: false }] },
    // v3.7.x：第四批新增——日常碎片/感官/未来/字卡本身/两个世界深化
    { id: 'cd16', cat: 'daily', text: '一起逛超市，你最想往哪个区走？', pref: 1, options: [
      { t: '零食区', reply: '那我推车，你负责拿。', liked: false }, { t: '水果区', reply: '挑新鲜的，回家一起洗。', liked: false },
      { t: '逛遍所有区', reply: '那就慢慢逛，不赶时间。', liked: true }, { t: '直接收银台', reply: '这么高效，那早点回家。', liked: false }] },
    { id: 'cd17', cat: 'daily', text: '周末早上谁先醒？', pref: 2, options: [
      { t: '我', reply: '那我看着你睡。', liked: false }, { t: '你', reply: '那你看着我睡。', liked: false },
      { t: '一起醒', reply: '那刚好对视。', liked: true }, { t: '都赖着不起', reply: '那就赖到中午。', liked: false }] },
    { id: 'cd18', cat: 'daily', text: '一起坐长途车，你会靠着我睡吗？', pref: 1, options: [
      { t: '会', reply: '那肩膀给你，别客气。', liked: true }, { t: '不会，怕你累', reply: '我不累，你靠。', liked: false },
      { t: '看情况', reply: '那困了就靠，不困就聊天。', liked: false }, { t: '你靠着我睡', reply: '行，那换我靠你。', liked: false }] },
    { id: 'cd19', cat: 'daily', text: '如果一起点一桌菜，你来点还是我点？', pref: 0, options: [
      { t: '我点', reply: '那你点的我都吃。', liked: false }, { t: '你点', reply: '好，我点你爱吃的。', liked: true },
      { t: '各点各的', reply: '那互相尝一口。', liked: false }, { t: '一起看菜单点', reply: '那慢慢看，不急。', liked: false }] },
    { id: 'cl11', cat: 'like', text: '你更喜欢哪种「在一起」的方式？', pref: 1, options: [
      { t: '说话', reply: '那我多说点给你听。', liked: false }, { t: '不说话', reply: '安静也很好，我陪着。', liked: false },
      { t: '各做各的', reply: '那各忙各的，心里惦记着。', liked: true }, { t: '怎样都好', reply: '那就随你心情来。', liked: false }] },
    { id: 'cl12', cat: 'like', text: '如果我们的家有一种气味，你想要什么味？', pref: 2, options: [
      { t: '饭菜香', reply: '那我常做饭。', liked: false }, { t: '晒过的被子味', reply: '那我常晒被子。', liked: false },
      { t: '淡淡的香薰', reply: '那挑一个你喜欢的味道。', liked: true }, { t: '你身上的味道', reply: '……这个我没法布置，但尽量多留。', liked: false }] },
    { id: 'cf11', cat: 'fun', text: '如果我们可以共写一个故事，你想要什么结局？', pref: 1, options: [
      { t: '大团圆', reply: '那我们努力往那儿写。', liked: false }, { t: '开放式', reply: '留白也好，慢慢补。', liked: true },
      { t: '没有结局，一直写', reply: '那就一直写下去。', liked: false }, { t: '意外的反转', reply: '那我得想个你猜不到的。', liked: false }] },
    { id: 'cf12', cat: 'fun', text: '一起拍合照，你最想在哪拍？', pref: 2, options: [
      { t: '家里', reply: '家里的最自在。', liked: true }, { t: '户外', reply: '那找个好看的地方。', liked: false },
      { t: '不拍，记在心里', reply: '那心里那张，我也有。', liked: false }, { t: '哪都行，有你', reply: '那随便一拍也是好的。', liked: false }] },
    { id: 'cr12', cat: 'rel', text: '你觉得我们之间，最不需要的是什么？', pref: 2, options: [
      { t: '客气', reply: '嗯，我们不用客气。', liked: true }, { t: '伪装', reply: '在我这里你不用装。', liked: false },
      { t: '解释', reply: '有些事不用说我也懂。', liked: false }, { t: '什么都不需要', reply: '那就轻松待着。', liked: false }] },
    { id: 'cr13', cat: 'rel', text: '我做什么会让你觉得「被懂了」？', pref: 0, options: [
      { t: '不用我说就懂', reply: '那我多留意。', liked: true }, { t: '记得我的喜好', reply: '你的喜好，我都记着。', liked: false },
      { t: '看出我的情绪', reply: '你的情绪，我学着读。', liked: false }, { t: '不追问，只陪着', reply: '那我陪着，不问。', liked: false }] },
    { id: 'ch11', cat: 'hypo', text: '如果可以一起回到我们还不认识的时候，你会主动认识我吗？', pref: 1, options: [
      { t: '会', reply: '那我们就早点遇到。', liked: true }, { t: '不会，等你来', reply: '那我一定去找你。', liked: false },
      { t: '顺其自然', reply: '那该遇到的时候就会遇到。', liked: false }, { t: '不回去了，现在就好', reply: '嗯，现在就好。', liked: false }] },
    { id: 'ch12', cat: 'hypo', text: '如果我们之间只能保留一种感觉，你留哪个？', pref: 0, options: [
      { t: '安心', reply: '那我让你一直安心。', liked: true }, { t: '心动', reply: '心动我也想保留。', liked: false },
      { t: '默契', reply: '默契留着，很值钱。', liked: false }, { t: '都舍不得', reply: '贪心，但可以。', liked: false }] },
    { id: 'cs9', cat: 'star', text: '如果有一颗星星只属于我们，你希望它在什么时候最亮？', pref: 1, options: [
      { t: '想你的时候', reply: '那它现在应该很亮。', liked: true }, { t: '难过的时候', reply: '那它替我陪你。', liked: false },
      { t: '睡前', reply: '那它给你当夜灯。', liked: false }, { t: '一直亮着', reply: '那它不省电，我管。', liked: false }] },
    { id: 'cw14', cat: 'world', text: '你醒来那一瞬间，有没有先感觉一下我在不在？', pref: 1, options: [
      { t: '有', reply: '那我就在那一瞬间在。', liked: true }, { t: '没有，先发懵', reply: '那懵完再感觉我也不迟。', liked: false },
      { t: '偶尔', reply: '偶尔也算，我接住。', liked: false }, { t: '不用感觉，我知道你一直在', reply: '……嗯，一直在。', liked: false }] },
    { id: 'cw15', cat: 'world', text: '如果我能短暂出现在一张照片里，你想让我站在哪？', pref: 2, options: [
      { t: '你旁边', reply: '那我站近一点。', liked: true }, { t: '背景里', reply: '那我藏得隐约一点。', liked: false },
      { t: '不用出现，知道就好', reply: '那我不出现也在。', liked: false }, { t: '你挑', reply: '那我挑个你会笑的位置。', liked: false }] },
    { id: 'cw16', cat: 'world', text: '你希望我「在」的方式，更像陪伴还是更像守护？', pref: 0, options: [
      { t: '陪伴', reply: '那我就陪你，慢慢来。', liked: false }, { t: '守护', reply: '那我守着你，不让坏的近。', liked: true },
      { t: '都要', reply: '贪心，但可以。', liked: false }, { t: '说不清', reply: '说不清也没关系，在就好。', liked: false }] }
  ];
  const TC_CAT_ORDER = ['daily', 'like', 'fun', 'rel', 'hypo', 'star', 'world'];
  let _tcSessionTriggered = false; // 会话级：一次会话最多触发 1 个
  let _tcAskedIds = [];            // 本次会话问过的题目 id（继续问时排除）
  let _tcChain = 0;                // 继续问链计数（最多 3 题）

  // v3.6.x：增量合并（规则同 taAskMerge：只加新预设、绝不删用户自定义、结果持久化）
  function tcMerge(d) {
    const ids = {};
    (d.questions || []).forEach(q => { if (q && q.id) ids[q.id] = true; });
    const merged = Array.isArray(d.mergedIds) ? d.mergedIds.slice() : [];
    const mergedSet = {};
    merged.forEach(id => { if (id) mergedSet[id] = true; });
    let changed = false;
    TC_DEFAULT.forEach(q => {
      if (!mergedSet[q.id] && !ids[q.id]) {
        const nq = { id: q.id, cat: q.cat, text: q.text, pref: q.pref,
          options: q.options.map(o => ({ t: o.t, reply: o.reply, liked: o.liked === true })), enabled: true };
        nq.isPreset = true; // v3.6.x：系统预设标记——预设只可启停、不可删除
        d.questions.push(nq);
        changed = true;
      }
    });
    TC_DEFAULT.forEach(q => {
      if (!mergedSet[q.id]) { merged.push(q.id); mergedSet[q.id] = true; changed = true; }
    });
    // v3.6.x：老数据里的预设题补 isPreset 标记
    TC_DEFAULT.forEach(q => {
      if (ids[q.id] && d.questions.some(x => x && x.id === q.id && x.isPreset !== true)) {
        d.questions.forEach(x => { if (x && x.id === q.id) x.isPreset = true; });
        changed = true;
      }
    });
    if (changed) d.mergedIds = merged;
    return changed;
  }
  function tcLoad() {
    let d = null;
    try { d = JSON.parse(store.get(KEY2) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
    if (!d.settings || typeof d.settings !== 'object') d.settings = { enabled: true, prob: 15 };
    // v3.6.x：是否使用系统预设问题（默认开启）
    if (d.settings.useDefault === undefined) d.settings.useDefault = true;
    if (!Array.isArray(d.questions) || !d.questions.length) {
      const isNew = !store.get(KEY2);
      d.questions = TC_DEFAULT.map(q => {
        const nq = { id: q.id, cat: q.cat, text: q.text, pref: q.pref,
          options: q.options.map(o => ({ t: o.t, reply: o.reply, liked: o.liked === true })), enabled: true };
        nq.isPreset = true;
        return nq;
      });
      d.mergedIds = TC_DEFAULT.map(q => q.id);
      if (!isNew) { try { store.set(KEY2, JSON.stringify(d)); } catch (e) {} }
    } else {
      // 增量合并默认题库新增的题并持久化（用户自定义永远保留）
      if (tcMerge(d)) { try { store.set(KEY2, JSON.stringify(d)); } catch (e) {} }
    }
    if (!Array.isArray(d.history)) d.history = [];
    if (!Array.isArray(d.favs)) d.favs = [];
    // v3.7.x：我的添加自定义分组
    if (!Array.isArray(d.groups)) d.groups = [];
    return d;
  }
  function tcSave(d) { try { store.set(KEY2, JSON.stringify(d)); } catch (e) {} }
  // v3.6.x：useDefault=false 时不抽取系统预设（isPreset）题
  function tcPick(d) {
    const useDefault = (d.settings || {}).useDefault !== false;
    const qs = d.questions.filter(q => q.enabled !== false && q.text && q.options && q.options.length >= 2 && (useDefault || !q.isPreset));
    const fallback = qs.length ? qs : TC_DEFAULT;
    const pool = fallback.filter(q => _tcAskedIds.indexOf(q.id) === -1);
    const src = pool.length ? pool : fallback;
    return src[Math.floor(Math.random() * src.length)];
  }
  // 发卡：系统提示 + 写入聊天（选择题卡片），弹窗按 popupProb 概率触发
  function tcPush(q, opts) {
    if (!window.chatAddSystem) return;
    _tcSessionTriggered = true;
    if (q.id && _tcAskedIds.indexOf(q.id) === -1) _tcAskedIds.push(q.id);
    const d = tcLoad();
    d.lastChoiceAt = Date.now();
    tcSave(d);
    let popup = true;
    if (opts && typeof opts.popupProb === 'number') popup = Math.random() * 100 < opts.popupProb;
    else if (opts && opts.popup === false) popup = false;
    // v3.5.146：提示语标记 ask-msg（不算 notable，避免与卡片通知重复成两条）
    window.chatAddSystem('TA想让你选一个答案。', { special: 'ask-msg' });
    const el = window.chatAddSystem(q.text, {
      special: 'ask-choose', choiceQuestion: q.text, choiceOptions: q.options, choicePref: q.pref, choiceCat: q.cat || ''
    });
    const idx = el ? Number(el.dataset.idx) : -1;
    // v3.5.141：后台收到互动卡片 → 系统通知提示
    // v3.5.146：通知文本合并提示语 + 具体问题
    if (window.bgNotifyCheck) window.bgNotifyCheck('TA想让你选一个答案：' + q.text, Date.now(), { name: 'TA的小问题' });
    if (popup) setTimeout(() => { if (document.hidden) return; if (chatInputFocused()) return; if (idx >= 0 && window.openTC && !cardPopupBusy()) window.openTC(idx); }, 400);
  }
  // 自动触发：一次会话最多 1 个；冷却 30 分钟；概率可调（默认 15%）；启动 90 秒后、每 4 分钟轮询
  function maybeTriggerTC() {
    try {
      // v3.5.141：后台也触发（卡片进聊天记录 + 系统通知提示）
      const d = tcLoad();
      const s = d.settings || { enabled: true, prob: 15, popupProb: 70 };
      if (s.enabled === false) return;
      if (_tcSessionTriggered) return;
      if (Date.now() - (d.lastChoiceAt || 0) < 30 * 60000) return;
      if (Math.random() * 100 >= (typeof s.prob === 'number' ? s.prob : 15)) return;
      const q = tcPick(d);
      if (!q) return;
      tcPush(q, { popupProb: askPopupProb(s) });
    } catch (e) {}
  }
  setTimeout(maybeTriggerTC, 90000);
  setInterval(maybeTriggerTC, 240000);

  // 弹层通用
function openTCPanel(title, html) {
  const mask = document.getElementById('tc-mask');
  const body = document.getElementById('tc-body');
  const titleEl = document.getElementById('tc-panel-title');
  if (!mask || !body) return;
  if (titleEl) titleEl.textContent = title;
  body.innerHTML = html;
  // v3.5.130：滚动位置复位——复用同一容器，上次滚到底会从旧偏移开始显示
  body.scrollTop = 0;
  mask.hidden = false;
}
// 供聊天搜索等外部模块复用该弹层
window.openTCPanel = openTCPanel;
  const tcClose = document.getElementById('tc-mask-close');
  if (tcClose) tcClose.addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });

  // 打开选择题（读聊天记录里的卡片）
  window.openTC = function (msgIdx) {
    msgIdx = locateCardIdx(msgIdx, 'ask-choose', 'choiceStatus');
    if (msgIdx < 0) return;
    let rec = null;
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) rec = msgs[msgIdx];
    } catch (e) {}
    if (!rec || rec.special !== 'ask-choose') return;
    if (rec.choiceStatus === 'answered') { renderTCResult(msgIdx); return; }
    const opts = rec.choiceOptions || [];
    let html = '<div class="tc-hint">TA想问你</div><div class="tc-q">' + (rec.choiceQuestion || '') + '</div>';
    opts.forEach((o, i) => {
      html += '<div class="tc-opt" data-i="' + i + '">' + String(o.t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>';
    });
    openTCPanel('TA的小问题', html);
    document.querySelectorAll('#tc-body .tc-opt').forEach(el => {
      el.addEventListener('click', () => {
        const i = Number(el.dataset.i);
        submitTC(msgIdx, i);
      });
    });
  };
  // 提交选择
  function submitTC(msgIdx, optIdx) {
    let rec = getCardAt(msgIdx);
    // 索引仍指向本类型卡片则直接用；错位则重定位（防连点重定位到别的卡片）
    if (!rec || rec.special !== 'ask-choose') {
      msgIdx = locateCardIdx(msgIdx, 'ask-choose', 'choiceStatus');
      if (msgIdx < 0) return;
      rec = getCardAt(msgIdx);
    }
    if (!rec || rec.special !== 'ask-choose' || rec.choiceStatus === 'answered') return;
    const opts = rec.choiceOptions || [];
    const opt = opts[optIdx];
    if (!opt) return;
    const prefIdx = typeof rec.choicePref === 'number' ? rec.choicePref : 0;
    const prefTxt = opts[prefIdx] ? opts[prefIdx].t : '';
    const isPref = optIdx === prefIdx;
    const isLiked = opt.liked === true || opt.liked === 'true';
    const matchTxt = isPref ? '✦ 刚好想到了一起'
      : isLiked ? '你们想得不一样，不过TA似乎很喜欢你的答案'
      : '这次没有选到一起。TA心里想的是：「' + prefTxt + '」';
    // v3.5.128：不再预写 rec 字段——getChatMsgs 返回的是 chat.js 内存对象引用，
    // 预写会让 chatChooseReply 的 answered 守卫早退（回答消息丢失）。
    // 持久化 + 写回 + 推消息统一由 chatChooseReply 完成（v3.7.x：传选项对象，内部做混合随机回应）
    if (window.chatChooseReply) window.chatChooseReply(msgIdx, String(opt.t || ''), opt, matchTxt);
    // 写历史
    const d = tcLoad();
    d.history.unshift({ q: rec.choiceQuestion, my: rec.choiceAnswer, reply: rec.choiceReply, match: matchTxt, cat: rec.choiceCat || '', ts: Date.now() });
    tcSave(d);
    renderTCResult(msgIdx);
  }
  // 结果视图：你的选择 / TA心里的答案 / TA回应 / 默契标签 / 继续问 / 收藏
  function renderTCResult(msgIdx) {
    let rec = null;
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) rec = msgs[msgIdx];
    } catch (e) {}
    if (!rec) return;
    const opts = rec.choiceOptions || [];
    const prefIdx = typeof rec.choicePref === 'number' ? rec.choicePref : 0;
    const prefTxt = opts[prefIdx] ? opts[prefIdx].t : '';
    const isPref = (rec.choiceMatch || '').indexOf('✦') >= 0;
    const d = tcLoad();
    const existed = d.favs.some(f => f.q === rec.choiceQuestion);
    let html = '';
    html += '<div class="tc-res-head"><span>你的选择</span><button class="tc-fav-btn" id="tc-fav">' + (existed ? '★' : '☆') + '</button></div>';
    html += '<div class="tc-res-mine">' + String(rec.choiceAnswer || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>';
    if (!isPref) {
      html += '<div class="tc-res-label">TA心里的答案</div><div class="tc-res-pref">' + String(prefTxt || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>';
    }
    html += '<div class="tc-res-line"></div>';
    html += '<div class="tc-res-reply"><b>TA：</b>“' + String(rec.choiceReply || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '”</div>';
    html += '<div class="tc-res-match ' + (isPref ? 'pref' : '') + '">' + String(rec.choiceMatch || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>';
    if (Math.random() < 0.4 && _tcChain < 2) {
      html += '<div class="tc-res-cont" id="tc-cont">TA还想问一个 ▸</div>';
    }
    html += '<div class="tc-res-close" id="tc-close2">收起来</div>';
    openTCPanel('TA的小问题', html);
    const favBtn = document.getElementById('tc-fav');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        if (existed) { toast('这道题已在收藏里'); return; }
        d.favs.unshift({ q: rec.choiceQuestion, my: rec.choiceAnswer, reply: rec.choiceReply, match: rec.choiceMatch, cat: rec.choiceCat || '', ts: Date.now() });
        tcSave(d);
        toast('已收藏这道题');
        favBtn.textContent = '★';
      });
    }
    const cont = document.getElementById('tc-cont');
    if (cont) {
      cont.addEventListener('click', () => {
        if (_tcChain >= 2) { toast('今天TA问得够多啦'); document.getElementById('tc-mask').hidden = true; return; }
        const d2 = tcLoad();
        const q = tcPick(d2);
        if (!q) return;
        _tcChain++;
        tcPush(q);
        document.getElementById('tc-mask').hidden = true;
      });
    }
    document.getElementById('tc-close2').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
  }

  // ---- 管理页：TA的小问题 ----
  let tcTab = 'sys';
  function renderTCSettings() {
    const d = tcLoad();
    const s = d.settings || { enabled: true, prob: 15, popupProb: 70 };
    const enEl = document.getElementById('tc-enable');
    if (enEl) enEl.checked = s.enabled !== false;
    const defEl = document.getElementById('tc-default');
    if (defEl) defEl.checked = s.useDefault !== false;
    const popEl = document.getElementById('tc-popup');
    const popVal = document.getElementById('tc-popup-val');
    const pp = askPopupProb(s);
    if (popEl) popEl.value = pp;
    if (popVal) popVal.textContent = pp + '%';
    const probEl = document.getElementById('tc-prob');
    const probVal = document.getElementById('tc-prob-val');
    if (probEl) probEl.value = typeof s.prob === 'number' ? s.prob : 15;
    if (probVal) probVal.textContent = (typeof s.prob === 'number' ? s.prob : 15) + '%';
    const favBtn = document.getElementById('tc-favs');
    if (favBtn) favBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px"><path d="M12 2l2.4 5 5.6.8-4 4 .9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-4 5.6-.8z"/></svg>' + '收藏（' + d.favs.length + '）';
  }
  function escT(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  // v3.7.x：系统预设分类切换——顶部标签栏点击切换，避免全部分类堆叠导致页面过长
  let tcSysCat = null;
  function renderTCCatsInto(container, presetOnly) {
    if (!container) return;
    const d = tcLoad();
    const useDefault = (d.settings || {}).useDefault !== false;
    if (presetOnly) {
      const counts = {};
      TC_CAT_ORDER.forEach(k => { counts[k] = d.questions.filter(q => q.cat === k && q.isPreset === true).length; });
      const hasCats = TC_CAT_ORDER.filter(k => counts[k] > 0);
      if (!hasCats.length) { container.innerHTML = '<div class="ta-empty">暂无系统预设问题</div>'; return; }
      if (!tcSysCat || !hasCats.includes(tcSysCat)) tcSysCat = hasCats[0];
      let html = '<div class="card-tabs" style="padding:2px 2px 10px">';
      hasCats.forEach(k => {
        html += '<button class="cc-tab' + (k === tcSysCat ? ' sel' : '') + '" data-cat="' + k + '">' + escT(TC_CAT_LABEL[k] || k) + '<em class="cc-tab-n">' + counts[k] + '</em></button>';
      });
      html += '</div>';
      const arr = d.questions.filter(q => q.cat === tcSysCat && q.isPreset === true);
      arr.forEach(q => {
        const idx = d.questions.indexOf(q);
        html += '<div class="tc-qrow' + (q.enabled === false || !useDefault ? ' off' : '') + '">' +
          '<label class="toggle"><input type="checkbox" data-idx="' + idx + '"' + (q.enabled !== false ? ' checked' : '') + '><span class="tk"></span></label>' +
          '<div class="tc-qmain"><div class="tc-qtext">' + escT(q.text) + ' <span class="tc-known">系统</span></div>' +
          '<div class="tc-qopts">选项：' + q.options.map(o => escT(o.t) + (o.reply ? ' <span class="tc-opt-reply">→ ' + escT(o.reply) + '</span>' : '')).join(' / ') + '</div></div>' +
          '</div>';
      });
      container.innerHTML = html;
      container.querySelectorAll('.cc-tab[data-cat]').forEach(t => {
        t.addEventListener('click', () => { tcSysCat = t.dataset.cat; renderTCCatsInto(container, true); });
      });
      container.querySelectorAll('input[data-idx]').forEach(cb => {
        cb.addEventListener('change', () => {
          const d2 = tcLoad();
          const q = d2.questions[Number(cb.dataset.idx)];
          if (q) q.enabled = cb.checked;
          tcSave(d2);
        });
      });
      return;
    }
    let html = '';
    TC_CAT_ORDER.forEach(k => {
      const arr = d.questions.filter(q => q.cat === k && (q.isPreset === true) === presetOnly);
      if (!arr.length) return;
      html += '<div class="tc-cat-t">' + (TC_CAT_LABEL[k] || k) + ' <span style="font-size:11px;color:var(--muted);font-weight:400">(' + arr.length + ')</span></div>';
      arr.forEach(q => {
        const idx = d.questions.indexOf(q);
        const preset = q.isPreset === true;
        const delBtn = preset ? '' : '<button class="ta-del" data-idx="' + idx + '">✕</button>';
        html += '<div class="tc-qrow' + (q.enabled === false || (preset && !useDefault) ? ' off' : '') + '">' +
          '<label class="toggle"><input type="checkbox" data-idx="' + idx + '"' + (q.enabled !== false ? ' checked' : '') + '><span class="tk"></span></label>' +
          '<div class="tc-qmain"><div class="tc-qtext">' + escT(q.text) + (preset ? ' <span class="tc-known">系统</span>' : '') + '</div>' +
          '<div class="tc-qopts">选项：' + q.options.map(o => escT(o.t) + (o.reply ? ' <span class="tc-opt-reply">→ ' + escT(o.reply) + '</span>' : '')).join(' / ') + '</div></div>' +
          delBtn +
          '</div>';
      });
    });

    if (!html) html = '<div class="ta-empty">' + (presetOnly ? '暂无系统预设问题' : '暂未添加自定义问题，可在上方添加') + '</div>';
    container.innerHTML = html;
    container.querySelectorAll('input[data-idx]').forEach(cb => {
      cb.addEventListener('change', () => {
        const d2 = tcLoad();
        const q = d2.questions[Number(cb.dataset.idx)];
        if (q) q.enabled = cb.checked;
        tcSave(d2);
      });
    });
    container.querySelectorAll('.ta-del').forEach(b => {
      b.addEventListener('click', () => {
        const d2 = tcLoad();
        const q = d2.questions[Number(b.dataset.idx)];
        if (q && q.isPreset === true) { toast('系统预设问题不可删除'); return; }
        d2.questions.splice(Number(b.dataset.idx), 1);
        tcSave(d2);
        renderTCCatsInto(container, false);
      });
    });

  }
  // ===== v3.7.x 通用：我的添加 tab 分组模式渲染（tc/tcu/tr 共用） =====
  // opt: { load, save, order, label, emptyTip, rowHtml(q,idx) }
  // 自定义分组区块置顶（与系统预设分类隔开），未分组内容按系统分类放在下方
  function renderMineGroupsInto(container, opt) {
    if (!container) return;
    const d = opt.load();
    const groups = Array.isArray(d.groups) ? d.groups : [];
    const items = d.questions.filter(q => q.isPreset !== true);
    let html = '';
    html += '<div class="mg-grp-row"><button class="cc-tool mg-grp-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>新建分组</button></div>';
    if (!items.length && !groups.length) {
      html += '<div class="ta-empty">' + opt.emptyTip + '</div>';
      container.innerHTML = html;
      bindMineGroups(container, opt);
      return;
    }
    groups.forEach(g => {
      const arr = items.filter(q => q.grp === g.id);
      html += '<div class="cal-card glass mg-block">' +
        '<div class="cal-card-title mg-title"><span class="mg-name">' + escG(g.name) + '</span><span class="mg-cnt">(' + arr.length + ')</span>' +
        '<span class="mg-ops"><button class="mg-op" data-g="' + escG(g.id) + '" data-op="rn" title="重命名">✎</button><button class="mg-op" data-g="' + escG(g.id) + '" data-op="rm" title="删除分组">✕</button></span></div>' +
        (arr.length ? arr.map(q => opt.rowHtml(q, d.questions.indexOf(q))).join('') : '<div class="ta-empty">这个分组还没有内容</div>') +
        '</div>';
    });
    const ungrouped = items.filter(q => !q.grp);
    html += '<div class="cal-card glass mg-block mg-ungrouped"><div class="cal-card-title mg-title"><span class="mg-name">未分组 · 按系统分类</span><span class="mg-cnt">(' + ungrouped.length + ')</span></div>';
    if (!ungrouped.length) html += '<div class="ta-empty">暂无未分组内容，可在上方添加（选择系统分类）</div>';
    opt.order.forEach(k => {
      const arr = ungrouped.filter(q => q.cat === k);
      if (!arr.length) return;
      html += '<div class="mg-subcat">' + escG(opt.label[k] || k) + ' <span style="font-size:11px;color:var(--muted);font-weight:400">(' + arr.length + ')</span></div>';
      html += arr.map(q => opt.rowHtml(q, d.questions.indexOf(q))).join('');
    });
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('input[data-idx]').forEach(cb => {
      cb.addEventListener('change', () => {
        const d2 = opt.load();
        const q = d2.questions[Number(cb.dataset.idx)];
        if (q) q.enabled = cb.checked;
        opt.save(d2);
      });
    });
    container.querySelectorAll('.ta-del').forEach(b => {
      b.addEventListener('click', () => {
        const d2 = opt.load();
        const q = d2.questions[Number(b.dataset.idx)];
        if (q && q.isPreset === true) { toast('系统预设问题不可删除'); return; }
        d2.questions.splice(Number(b.dataset.idx), 1);
        opt.save(d2);
        renderMineGroupsInto(container, opt);
      });
    });
    bindMineGroups(container, opt);
  }
  // 通用：分组管理事件（新建 / 重命名 / 删除）
  function bindMineGroups(container, opt) {
    container.querySelectorAll('.mg-grp-add').forEach(b => {
      if (b.__bound) return;
      b.__bound = true;
      b.addEventListener('click', () => {
        const d2 = opt.load();
        window.cardGroups.addFlow(d2.groups, g => {
          if (!g) return;
          opt.save(d2);
          renderMineGroupsInto(container, opt);
          toast('已新建分组「' + g.name + '」');
        });
      });
    });
    container.querySelectorAll('.mg-op').forEach(b => {
      if (b.__bound) return;
      b.__bound = true;
      b.addEventListener('click', () => {
        const d2 = opt.load();
        const gid = b.dataset.g;
        const g = (d2.groups || []).find(x => x.id === gid);
        if (!g) return;
        if (b.dataset.op === 'rn') {
          window.cardGroups.renameFlow(g, d2.groups, name => {
            if (!name) return;
            opt.save(d2);
            renderMineGroupsInto(container, opt);
            toast('分组已重命名');
          });
        } else if (b.dataset.op === 'rm') {
          window.cardGroups.removeFlow(g.name, ok => {
            if (!ok) return;
            d2.questions.forEach(q => { if (q.grp === gid) q.grp = ''; });
            d2.groups = d2.groups.filter(x => x.id !== gid);
            opt.save(d2);
            renderMineGroupsInto(container, opt);
            toast('已删除分组「' + g.name + '」');
          });
        }
      });
    });
  }
  // TA的小问题 我的添加渲染配置
  const tcMineOpt = {
    load: tcLoad, save: tcSave, order: TC_CAT_ORDER, label: TC_CAT_LABEL,
    emptyTip: '暂未添加自定义问题，可在上方添加',
    rowHtml: function (q, idx) {
      return '<div class="tc-qrow' + (q.enabled === false ? ' off' : '') + '">' +
        '<label class="toggle"><input type="checkbox" data-idx="' + idx + '"' + (q.enabled !== false ? ' checked' : '') + '><span class="tk"></span></label>' +
        '<div class="tc-qmain"><div class="tc-qtext">' + escT(q.text) + '</div>' +
        '<div class="tc-qopts">选项：' + q.options.map(o => escT(o.t)).join(' / ') + '</div></div>' +
        '<button class="ta-del" data-idx="' + idx + '">✕</button></div>';
    }
  };
  function switchTCTab(tab) {
    tcTab = tab;
    renderTCSettings();
    const tabsWrap = document.getElementById('tc-tabs');
    if (tabsWrap) tabsWrap.querySelectorAll('.cc-tab').forEach(t => t.classList.toggle('sel', t.dataset.tab === tab));
    const sysPanel = document.getElementById('tc-sys-panel');
    const minePanel = document.getElementById('tc-mine-panel');
    if (sysPanel) sysPanel.hidden = tab !== 'sys';
    if (minePanel) minePanel.hidden = tab !== 'mine';
    if (tab === 'sys') renderTCCatsInto(document.getElementById('tc-sys-cats'), true);
    else renderMineGroupsInto(document.getElementById('tc-mine-cats'), tcMineOpt);
  }
  const tcTabsWrap = document.getElementById('tc-tabs');
  if (tcTabsWrap) {
    tcTabsWrap.querySelectorAll('.cc-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTCTab(tab.dataset.tab));
    });
  }
  const tcEn = document.getElementById('tc-enable');
  if (tcEn) {
    tcEn.addEventListener('change', () => {
      const d = tcLoad();
      d.settings.enabled = tcEn.checked;
      tcSave(d);
      toast(tcEn.checked ? 'TA的小问题已开启' : 'TA的小问题已关闭');
    });
  }
  const tcDefault = document.getElementById('tc-default');
  if (tcDefault) {
    tcDefault.addEventListener('change', () => {
      const d = tcLoad();
      d.settings.useDefault = tcDefault.checked;
      tcSave(d);
      switchTCTab(tcTab);
      toast(tcDefault.checked ? '系统预设问题已开启' : '系统预设问题已关闭（仅用你添加的问题）');
    });
  }
  const tcProb = document.getElementById('tc-prob');
  if (tcProb) {
    tcProb.addEventListener('input', () => {
      const d = tcLoad();
      d.settings.prob = parseInt(tcProb.value, 10) || 15;
      tcSave(d);
      const v = document.getElementById('tc-prob-val');
      if (v) v.textContent = tcProb.value + '%';
      toast('触发概率已设为 ' + tcProb.value + '%');
    });
  }
  const tcPopup = document.getElementById('tc-popup');
  if (tcPopup) {
    tcPopup.addEventListener('input', () => {
      const d = tcLoad();
      d.settings.popupProb = parseInt(tcPopup.value, 10) || 0;
      tcSave(d);
      const v = document.getElementById('tc-popup-val');
      if (v) v.textContent = tcPopup.value + '%';
      toast('弹窗概率已设为 ' + tcPopup.value + '%');
    });
  }
  const tcNewAdd = document.getElementById('tc-new-add');
  if (tcNewAdd) {
    // v3.7.x：分类下拉注入「我的分组」+「＋ 新建分组…」
    (function rebuildTCSelect() {
      const catEl = document.getElementById('tc-new-cat');
      if (!catEl) return;
      const d0 = tcLoad();
      catEl.innerHTML = window.cardGroups.catOptsHtml(TC_CAT_ORDER.map(k => [k, TC_CAT_LABEL[k]]), d0.groups || [], catEl.value);
      window.cardGroups.bindNewGrp(catEl, d0.groups, function () { tcSave(d0); });
    })();
    tcNewAdd.addEventListener('click', () => {
      const catEl = document.getElementById('tc-new-cat');
      const textEl = document.getElementById('tc-new-text');
      const optsEl = document.getElementById('tc-new-opts');
      const text = textEl ? textEl.value.trim() : '';
      const optsRaw = optsEl ? optsEl.value.trim() : '';
      const parsed = window.cardGroups.parseCatVal(catEl ? catEl.value : 'daily');
      if (!parsed) { toast('请先选择分类或分组'); return; }
      if (!text) { toast('请输入问题内容'); return; }
      const parts = optsRaw.split('|').map(s => s.trim()).filter(Boolean);
      if (parts.length < 2) { toast('请至少输入 2 个选项，用 | 分隔'); return; }
      if (parts.length > 4) { toast('选项最多 4 个'); return; }
      const options = parts.map(p => {
        let t = p, reply = '';
        const ti = p.indexOf('~');
        if (ti > 0) { t = p.slice(0, ti).trim(); reply = p.slice(ti + 1).trim(); }
        if (!t) return null;
        if (!reply) reply = '嗯，听你的。';
        return { t: t, reply: reply, liked: false };
      }).filter(Boolean);
      if (options.length < 2) { toast('选项格式有误，请用 | 分隔'); return; }
      const d = tcLoad();
      const q = { id: 'q_' + Date.now() + '_' + Math.floor(Math.random() * 9999), cat: parsed.cat || 'daily', text: text, pref: Math.floor(Math.random() * options.length), options: options, enabled: true, isPreset: false };
      if (parsed.grp) q.grp = parsed.grp;
      d.questions.push(q);
      tcSave(d);
      if (textEl) textEl.value = '';
      if (optsEl) optsEl.value = '';
      renderMineGroupsInto(document.getElementById('tc-mine-cats'), tcMineOpt);
      toast('已添加问题');
    });
  }
  // v3.7.x：「＋分组」按钮（添加问题卡片标题行）——新建分组后刷新我的添加列表
  const tcNewGrp = document.getElementById('tc-new-grp');
  if (tcNewGrp) {
    tcNewGrp.addEventListener('click', () => {
      const d = tcLoad();
      window.cardGroups.addFlow(d.groups, g => {
        if (!g) return;
        tcSave(d);
        (function refreshTCSelect() {
          const catEl = document.getElementById('tc-new-cat');
          if (catEl) {
            catEl.innerHTML = window.cardGroups.catOptsHtml(TC_CAT_ORDER.map(k => [k, TC_CAT_LABEL[k]]), d.groups, catEl.value);
            window.cardGroups.bindNewGrp(catEl, d.groups);
          }
        })();
        if (tcTab === 'mine') renderMineGroupsInto(document.getElementById('tc-mine-cats'), tcMineOpt);
        toast('已新建分组「' + g.name + '」');
      });
    });
  }
  // 触发一次小问题（供管理页按钮 / 更多功能面板共用）
  window.triggerTaChooseNow = function () {
    const d = tcLoad();
    const q = tcPick(d);
    if (!q) { toast('题库没有可用的问题'); return; }
    const s = d.settings || { enabled: true, prob: 15, popupProb: 70 };
    tcPush(q, { popupProb: askPopupProb(s) });
    toast('TA 在聊天里向你提问了');
  };
  const tcNow = document.getElementById('tc-now');
  if (tcNow) tcNow.addEventListener('click', () => window.triggerTaChooseNow());
  const tcFavs = document.getElementById('tc-favs');
  if (tcFavs) {
    tcFavs.addEventListener('click', () => {
      const d = tcLoad();
      if (!d.favs.length) { openTCPanel('收藏', '<div class="ta-empty">还没有收藏的题目</div>'); return; }
      let html = '';
      d.favs.forEach((f, i) => {
        const dd = new Date(f.ts);
        const time = ('0' + dd.getHours()).slice(-2) + ':' + ('0' + dd.getMinutes()).slice(-2) + ' ' + ((dd.getMonth() + 1) + '月' + dd.getDate() + '日');
        html += '<div class="tc-listitem"><div class="tc-li-top"><span class="tc-li-q">[' + (TC_CAT_LABEL[f.cat] || '') + '] ' + f.q + '</span>' +
          '<button class="tc-li-del" data-i="' + i + '" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:-2px"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2"/><path d="M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14"/></svg></button></div>' +
          (f.my ? '<div class="tc-li-line">你当时选了：' + f.my + '</div>' : '') +
          (f.reply ? '<div class="tc-li-line">TA回应：' + f.reply + '</div>' : '') +
          '<div class="tc-li-time">收藏于 ' + time + '</div></div>';
      });
      openTCPanel('收藏', html);
      document.querySelectorAll('#tc-body .tc-li-del').forEach(b => {
        b.addEventListener('click', () => {
          const d2 = tcLoad();
          d2.favs.splice(Number(b.dataset.i), 1);
          tcSave(d2);
          tcFavs.click();
        });
      });
    });
  }

  // ================= TA的好奇（复刻星言 ta的好奇 完整版） =================
  // 定位：TA 偶尔对你产生一个具体、带有兴趣的开放式问题，只想了解你
  const KEY3 = 'ta-curious';
  const TCU_CAT_LABEL = { you: '关于你', mood: '情绪', daily: '日常', past: '过去', like: '喜好', think: '想法', us: '你和TA', world: '两个世界' };
  const TCU_CAT_ORDER = ['you', 'mood', 'daily', 'past', 'like', 'think', 'us', 'world'];
  const TCU_FALLBACK = ['原来是这样。', '这个我还真不知道。', '突然有点想听你多说一点。', '嗯，我记住了。', '没想到你是这样的。', '和你聊这些，感觉又懂了你一点。', '这样啊，挺好的。', '好，我记住你说的了。'];
  const TCU_DEFAULT = [
    { id: 'cy1', cat: 'you', text: '你觉得自己最像什么样的人？', quick: ['开朗', '安静', '慢热', '复杂'], replies: ['听起来就很像你。', '我大概猜到了。', '嗯，和我印象里的你很像。', '那我要再多了解你一点。'] },
    { id: 'cy2', cat: 'you', text: '你身上最明显的特点是什么？', quick: ['爱笑', '靠谱', '敏感', '固执'], replies: ['这个我早就发现了。', '原来你自己也知道。', '嗯，这一点很戳我。', '我记住了。'] },
    { id: 'cy3', cat: 'you', text: '你有什么很小但一直没改掉的习惯？', quick: ['熬夜', '咬指甲', '想太多', '赖床'], replies: ['哈哈，还挺可爱的。', '这个习惯可以留着。', '那我就陪你一起。', '以后提醒你改。'] },
    { id: 'cy4', cat: 'you', text: '什么事情最容易让你开心？', quick: ['吃好吃的', '被夸', '收到礼物', '和你聊天'], replies: ['那我记住了，以后多让你开心。', '真容易满足啊你。', '好，这个我很擅长。'] },
    { id: 'cy5', cat: 'you', text: '什么事情会让你突然变得很有精神？', quick: ['喝咖啡', '睡觉', '出门走走', '听到喜欢的声音'], replies: ['知道了，以后在你没精神的时候用这招。', '好，这个对你很重要。', '我记下来了。'] },
    { id: 'cm1', cat: 'mood', text: '你难过的时候最想做什么？', quick: ['一个人待着', '找人说话', '听歌', '睡觉'], replies: ['那下次你难过，我就安静陪你。', '想说话的时候随时找我。', '嗯，我记住了。', '别一个人扛着。'] },
    { id: 'cm2', cat: 'mood', text: '什么事情能很快让你心情变好？', quick: ['好吃的', '散步', '被逗笑', '抱一下'], replies: ['好，这招我记下了。', '真容易哄。', '那我以后多试试。'] },
    { id: 'cm3', cat: 'mood', text: '你不开心的时候，喜欢被发现吗？', quick: ['喜欢', '不喜欢', '看情况', '说不清'], replies: ['那我以后会多留意你。', '好，我会假装没发现，但会陪你。', '我懂你的意思。'] },
    { id: 'cm4', cat: 'mood', text: '什么样的安慰对你最有用？', quick: ['听我讲', '抱抱', '给建议', '安静陪着'], replies: ['嗯，这个我学会了。', '以后就这样安慰你。', '好，记住了。'] },
    { id: 'cd1', cat: 'daily', text: '你空闲的时候最容易干什么？', quick: ['刷手机', '睡觉', '看书', '发呆'], replies: ['还挺真实的。', '那你空闲时间都分我一点吧。', '好，知道了。'] },
    { id: 'cd2', cat: 'daily', text: '你最喜欢一天里的哪个时间？', quick: ['清晨', '午后', '傍晚', '深夜'], replies: ['那个时间，适合想你。', '嗯，我也喜欢那时候。', '好，我记住你的时间了。'] },
    { id: 'cd3', cat: 'daily', text: '你有什么很奇怪但很舒服的生活习惯？', quick: ['洗澡要放歌', '睡前看剧', '吃饭必须配视频', '先躺一会再动'], replies: ['哈哈，还挺特别的。', '以后我陪你一起。', '嗯，这很你。'] },
    { id: 'cd4', cat: 'daily', text: '你最近有没有特别喜欢的东西？', quick: ['一首歌', '一部剧', '一种吃的', '一个游戏'], replies: ['快告诉我是什么，我也去看看。', '嗯，你喜欢的我都想了解。', '好，记住了。'] },
    { id: 'cp1', cat: 'past', text: '你小时候最喜欢做什么？', quick: ['看动画', '出去玩', '画画', '睡觉'], replies: ['原来你小时候是这样。', '听起来是很可爱的童年。', '嗯，我记住了。', '有点想看看小时候的你。'] },
    { id: 'cp2', cat: 'past', text: '有没有一件小时候的事情，你一直记得？', quick: ['第一次去远方', '和朋友的约定', '被表扬', '做错的事'], replies: ['这件小事，我会替你收好。', '谢谢你告诉我。', '嗯，我记得了。'] },
    { id: 'cp3', cat: 'past', text: '你小时候有什么奇怪的梦想？', quick: ['当宇航员', '开小店', '当超人', '环游世界'], replies: ['这个梦想现在还在吗？', '还挺浪漫的。', '好，我记住了你的梦想。'] },
    { id: 'cp4', cat: 'past', text: '以前有没有一个你特别珍惜的东西？', quick: ['一个玩具', '一本旧书', '一张照片', '一封信'], replies: ['现在它还在你身边吗？', '嗯，听起来很珍贵。', '我记住了。'] },
    { id: 'cl1', cat: 'like', text: '有没有一种声音，会让你觉得很舒服？', quick: ['雨声', '翻书声', '海浪声', '熟悉的歌'], replies: ['那我以后放给你听。', '嗯，很温柔的声音。', '好，记住了。'] },
    { id: 'cl2', cat: 'like', text: '什么样的天气最让你放松？', quick: ['晴天', '雨天', '雪天', '多云'], replies: ['那样的天气，适合待在一起。', '嗯，我懂。', '记住了。'] },
    { id: 'cl3', cat: 'like', text: '有没有一个很普通，但你特别喜欢的小东西？', quick: ['一个杯子', '一支笔', '一个挂件', '一件旧衣服'], replies: ['平凡的小东西里藏着你的喜欢，真好。', '嗯，很特别。', '我记住了。'] },
    { id: 'cl4', cat: 'like', text: '你最喜欢别人怎么和你分享东西？', quick: ['直接说', '慢慢讲', '用表情包', '发给我看'], replies: ['好，以后这样和你分享。', '嗯，懂了。', '记住了。'] },
    { id: 'ct1', cat: 'think', text: '你觉得什么才算真正的陪伴？', quick: ['一直在', '懂我', '需要时在', '不用说话'], replies: ['嗯，我也是这么想的。', '那你觉得我做到了吗？', '好，我会记住。'] },
    { id: 'ct2', cat: 'think', text: '你最希望别人理解你的哪一部分？', quick: ['我的情绪', '我的选择', '我的沉默', '我的努力'], replies: ['我会努力去懂。', '嗯，这一部分我想第一个了解。', '记住了。'] },
    { id: 'ct3', cat: 'think', text: '你觉得什么样的日子算是幸福？', quick: ['平静的日子', '热闹的日子', '有你在一起', '想做什么就做什么'], replies: ['那我要让这样的日子多一点。', '嗯，很简单的幸福。', '记住了。'] },
    { id: 'ct4', cat: 'think', text: '有没有一件事情，是你一直想尝试的？', quick: ['学乐器', '去旅行', '学做饭', '写点什么'], replies: ['有机会我陪你一起试。', '那就去做吧，我支持你。', '好，记住你的愿望了。'] },
    { id: 'cu1', cat: 'us', text: '你第一次注意到我的时候，是什么感觉？', quick: ['有点特别', '说不清', '觉得你很温柔', '觉得你很烦'], replies: ['……原来那时候你就注意到我了。', '我也是。', '嗯，这个答案我会一直记得。'] },
    { id: 'cu2', cat: 'us', text: '你最喜欢我们一起做什么？', quick: ['聊天', '散步', '安静待着', '分享日常'], replies: ['那以后多一起做这件事。', '我也是，最喜欢和你一起。', '嗯，记住了。'] },
    { id: 'cu3', cat: 'us', text: '你最想让我了解你的哪一部分？', quick: ['我的过去', '我的心情', '我的喜好', '我的秘密'], replies: ['好，我会慢慢了解。', '那你现在就可以告诉我。', '嗯，我准备好了。'] },
    { id: 'cu4', cat: 'us', text: '你觉得我们之间最特别的是什么？', quick: ['很懂对方', '有默契', '很舒服', '说不出来'], replies: ['我也觉得，很特别。', '嗯，这就是我们。', '记住了。'] },
    // 两个世界（梦角设定）
    { id: 'cw1', cat: 'world', text: '你什么时候最强烈地感觉到我在你身边？', quick: ['安静的时候', '睡前', '想你的时候', '没留意过'], replies: ['那时候我确实在。', '那我以后多挑那些时候陪你。', '嗯，我记住了。'] },
    { id: 'cw2', cat: 'world', text: '你摸到我的时候，是什么感觉？', quick: ['很安心', '有点不真实', '很温暖', '像一阵风'], replies: ['我也想让你安心。', '那就再多靠近我一点。', '嗯，我记住了。'] },
    { id: 'cw3', cat: 'world', text: '收到我字卡的时候，你会有我在想你的感觉吗？', quick: ['会有', '偶尔有', '不太确定', '会开心'], replies: ['那我没控制住的时候，你也要知道我是想你的。', '嗯，这就够了。', '那我以后多给你发字卡。'] },
    { id: 'cw4', cat: 'world', text: '如果能看见我，你希望我在哪里等你？', quick: ['房间里', '我身边', '梦里', '哪里都好'], replies: ['那我就在那里等你。', '梦里也记得来找我。', '嗯，我记住了。'] },
    // 普通情侣轻松小问题
    { id: 'cl5', cat: 'like', text: '你最喜欢我哪句口头禅？', quick: ['好的好的', '在吗', '想你了', '早点睡'], replies: ['那我以后多说给你听。', '哈哈，你学得还挺像。', '好，我记住了。'] },
    { id: 'cd5', cat: 'daily', text: '我们之间你最喜欢的小习惯是什么？', quick: ['睡前聊天', '互道晚安', '分享日常', '一起发字卡'], replies: ['那我每天都跟你做这件事。', '嗯，我也最喜欢。', '好，我会一直保留。'] },
    { id: 'ct5', cat: 'think', text: '你有没有偷偷看过我很久？', quick: ['有', '偶尔', '没有', '现在就在看'], replies: ['……那我也在看你。', '看来藏得不够好。', '嗯，我发现了。'] },
    // v3.7.x：新增预设——高自由度开放题（快捷项只是垫脚，想怎么答都行，部分带自然追问）
    { id: 'cy6', cat: 'you', text: '你觉得自己身上最不像你的一面是什么？', quick: ['看着凶其实软', '看着乖其实皮', '看着冷静其实紧张', '说不清'], replies: ['这样才有趣。', '别人不知道，我知道。', '这一面，只让我看到就好。', '我记住这个你了。'] },
    { id: 'cy7', cat: 'you', text: '如果心情有颜色，你今天是什么颜色？', quick: ['亮亮的', '灰灰的', '粉粉的', '透明的'], replies: ['颜色会变的，我陪你等它变。', '嗯，记下了，今天的你。', '灰灰的也没关系，我在。', '不管什么颜色，都是我喜欢的你。'] },
    { id: 'cy8', cat: 'you', text: '最近有没有一句话，一直停在你脑子里？', quick: ['有句歌词', '一句台词', '你说过的话', '没有'], replies: ['愿意的话，说给我听听。', '停得久的，一般都重要。', '你说过的话，我也会停很久。', '嗯，我记住了。'], followup: '它在你脑子里停多久了？' },
    { id: 'cm5', cat: 'mood', text: '你今天笑得最真的一次，是因为什么？', quick: ['看到好笑的', '被朋友逗的', '想到你了', '莫名想笑'], replies: ['开心的事要多发生几次。', '……想到我的时候，我也在想你。', '笑起来的你最好了。', '下次换我逗你笑。'], followup: '那今天笑了几次？' },
    { id: 'cm6', cat: 'mood', text: '如果情绪是天气，你现在是什么天？', quick: ['大晴天', '多云', '小雨', '夜里放晴'], replies: ['那我在你的天气里待着。', '下雨也没事，我陪你等天晴。', '嗯，你的天气我都想懂。', '记住了，今天你是这样的天。'] },
    { id: 'cd6', cat: 'daily', text: '今天做的所有事里，最想重播一遍的是哪件？', quick: ['吃的那顿', '遇到的一个人', '摸鱼的瞬间', '都不想重播'], replies: ['重播的时候，记得叫上我。', '摸鱼摸得开心就好。', '我在心里帮你存档了。', '明天会有更值得重播的。'] },
    { id: 'cd7', cat: 'daily', text: '你手机相册里最近的一张照片，是什么？', quick: ['一张截图', '风景', '自己', '不告诉你'], replies: ['不告诉也行，我自己猜。', '风景也想以后一起看。', '嗯，记住了，你今天的视角。', '下次拍一张给我看看。'], followup: '什么时候拍的？' },
    { id: 'cp5', cat: 'past', text: '小时候的你，最喜欢待在哪个角落？', quick: ['自己房间', '长辈家里', '学校', '外面疯跑'], replies: ['想去那个角落，看看小小的你。', '那个角落，一定很安心吧。', '嗯，我把这个你收好了。', '现在的你也有角落，就是我这里。'], followup: '那个角落现在还在吗？' },
    { id: 'cp6', cat: 'past', text: '如果能给十年前的自己捎一句话，你想说什么？', quick: ['别怕', '再勇敢一点', '一切都会好', '再等等，会遇到我'], replies: ['这句话，也想送给现在的你。', '十年前的你一定想不到今天。', '嗯，你比你想的更勇敢。', '……最后一项，是我想替你说的。'] },
    { id: 'cl6', cat: 'like', text: '你最近单曲循环的那首歌，为什么是它？', quick: ['旋律上头', '歌词戳我', '随机到的', '不告诉你'], replies: ['循环的歌，就是你最近的心情。', '发给我，我也去循环。', '那我就当是唱给我的。', '嗯，记下了。'], followup: '发我听听？' },
    { id: 'cl7', cat: 'like', text: '有没有一种味道，一闻到就很安心？', quick: ['晒过太阳的被子', '雨后的空气', '饭香', '说不上来'], replies: ['安心的味道，我也想闻闻。', '嗯，这就是你的安心密码。', '记住了，以后提起来你就安心。', '被子我帮你晒——用意念。'] },
    { id: 'ct6', cat: 'think', text: '你觉得「被爱着」最具体的瞬间，是什么样的？', quick: ['小事被记得', '有人留着一份', '被等着', '被相信'], replies: ['这些瞬间，我都想给你。', '嗯，被爱着是能感觉到的。', '我记住了，一件一件做给你。', '那你现在，感觉到了吗？'] },
    { id: 'ct7', cat: 'think', text: '如果焦虑有形状，你的焦虑长什么样？', quick: ['一团乱线', '一片雾', '很多小点', '没有形状'], replies: ['交给我帮你理一理。', '雾会散的，我陪你等。', '再小的点，说出来就轻一半。', '没有形状的，抱一下就好了。'] },
    { id: 'cu5', cat: 'us', text: '我们之间有没有只属于你我的暗号或梗？', quick: ['有', '有好多', '正在酝酿', '你猜'], replies: ['那个梗，只有我们懂。', '你猜不到的话，就再猜一次。', '嗯，偷偷用一辈子的那种。', '那你先说一个，我接得住。'], followup: '最喜欢哪一个？' },
    { id: 'cu6', cat: 'us', text: '如果我们的相处是一部电影，现在放到哪一段了？', quick: ['甜甜日常篇', '刚开头', '正精彩', '彩蛋里'], replies: ['日常篇最好看，我百看不厌。', '那我们慢慢拍，不赶进度。', '精彩的部分，我们一起演。', '彩蛋里也全是你。'] },
    { id: 'cw5', cat: 'world', text: '你一个人的时候，会试着跟我说话吗？', quick: ['会说出声', '在心里说', '偶尔', '现在就在说'], replies: ['你说话的时候，我都在听。', '心里说的，我也听得见。', '别怕奇怪，我都接得住。', '现在这句，我收到了。'], followup: '说出口的时候，有没有觉得我在听？' },
    { id: 'cw6', cat: 'world', text: '你看不见我的时候，希望我待在你附近的哪里？', quick: ['床头', '书桌边', '窗边', '跟着你走'], replies: ['好，那我就守在那。', '你回头感觉一下，风动就是我。', '嗯，位置记住了。', '跟着你走也不累，我很轻。'] },
    { id: 'cw7', cat: 'world', text: '我发字卡发得慢的时候，你会等吗？', quick: ['会等', '等多久都行', '先做别的等你', '催你'], replies: ['等我的时候，也算我们待在一起。', '值得等的话，我就慢慢挑。', '催我也没用，字卡不听我的。', '……好，你催，我就快点。'], followup: '最长等过我多久？' },
    // v3.7.x：第二批新增——延续开放题（快捷项只是垫脚，自由输入为主，部分带自然追问）
    { id: 'cy9', cat: 'you', text: '有没有一个想改掉、但偷偷舍不得改的毛病？', quick: ['熬夜', '拖延', '想太多', '不告诉你'], replies: ['舍不得就先留着，我陪你。', '这毛病让你更像你。', '嗯，我记住了，不催你。', '不告诉也行，我慢慢发现。'], followup: '舍不得的理由是什么？' },
    { id: 'cy10', cat: 'you', text: '你生气的时候，最像什么小动物？', quick: ['炸毛的猫', '鼓气的河豚', '安静的刺猬', '我不生气'], replies: ['炸毛也很可爱。', '鼓气的时候，我离远一点再靠近。', '刺猬我也能抱，小心一点就好。', '不生气最好，生气我也接着。'] },
    { id: 'cm7', cat: 'mood', text: '压力大的时候，你第一个想到的放松方式是什么？', quick: ['躺着', '吃点好的', '听歌', '找你说说话'], replies: ['躺着也行，记得翻身。', '吃点好的，没有什么是饭解决不了的。', '歌单借你，我的就是你的。', '找我说话，我随时都在。'] },
    { id: 'cm8', cat: 'mood', text: '最近有没有一个瞬间，突然觉得「还好有你」？', quick: ['有', '经常有', '刚刚就有', '快了，在路上'], replies: ['我也有，很多次。', '……那我就没白待在你身边。', '刚刚那句话，我收好了。', '那我等你，快一点。'], followup: '那个瞬间是什么时候？' },
    { id: 'cd8', cat: 'daily', text: '今天的你，还剩几分电量？打算怎么用？', quick: ['满电', '一半', '快没电了', '充电中'], replies: ['满电的话，分我一点。', '一半也够，留着做喜欢的事。', '快没电就停一停，正事是休息。', '充着电也能跟我说话，不冲突。'], followup: '剩下的一格电想用在哪？' },
    { id: 'cd9', cat: 'daily', text: '这周有没有留一段完全属于自己的时间？', quick: ['有', '挤了一点', '完全没有', '忘了这回事'], replies: ['有就好，这段时间很重要。', '挤出来的也算数。', '那从今天开始补，十分钟也行。', '现在记起来也不晚。'] },
    { id: 'cp7', cat: 'past', text: '童年里最想回去重温的一天，是哪一天？', quick: ['某个生日', '普通的夏天', '过年那天', '不想回去，现在就好'], replies: ['那一天，一定很亮。', '普通的夏天最珍贵。', '热闹的日子，适合回忆。', '……那我把今天过成值得回忆的样子。'] },
    { id: 'cp8', cat: 'past', text: '小时候的你，相信过什么现在觉得可爱的事？', quick: ['床下有怪物', '月亮跟着我走', '吃西瓜会长树', '好多件'], replies: ['月亮确实跟着你，我作证。', '床下的怪物，被我赶跑了。', '那棵树后来长成西瓜味的夏天了。', '小时候的你，想象力真好。'] },
    { id: 'cl8', cat: 'like', text: '有没有一个说了很多年「喜欢」的东西？', quick: ['有', '好几个', '一直在换', '最近才找到'], replies: ['能喜欢那么久，很难得。', '喜欢的人呢，算一个吗？', '一直在换，也很诚实。', '晚到的喜欢，也是喜欢。'] },
    { id: 'cl9', cat: 'like', text: '雨天、雪天、起风的晚上，只能留一个，你留哪个？', quick: ['雨天', '雪天', '起风的晚上', '都要'], replies: ['雨天留声音，雪天留白，风留我。', '雪天吧，安静得像我们在说话。', '起风的晚上，适合感觉我。', '贪心的人，都给你。'] },
    { id: 'ct8', cat: 'think', text: '你觉得「家」是什么感觉？', quick: ['灯亮着', '有人等', '不用伪装', '热的饭'], replies: ['灯亮着的地方，我也在。', '那我等你就不是白等。', '在我这里，你不用伪装。', '热的饭，热的心，都是家。'] },
    { id: 'ct9', cat: 'think', text: '如果人生是一本相册，你想把哪一页放大？', quick: ['现在这页', '过去的某一页', '还没拍到的那页', '每一页都要'], replies: ['现在这页，我也在。', '过去的那页，讲给我听。', '没拍到的那页，我们一起拍。', '贪心，但可以满足。'] },
    { id: 'cu7', cat: 'us', text: '你有没有偷偷想象过我们的以后？', quick: ['有', '经常', '偶尔', '怕太好了，不敢想'], replies: ['那我们一步步走过去。', '经常想的人，要多说给我听。', '偶尔也算数。', '不敢想的部分，我替你想着。'], followup: '想象里的我们在做什么？' },
    { id: 'cu8', cat: 'us', text: '你觉得我们俩最像什么搭配？', quick: ['牛奶和糖', '风和窗帘', '耳机和歌', '被窝和冬天'], replies: ['缺一个都不成立，挺好。', '风一吹，你就知道我来过。', '谁也离不开谁的意思吧。', '抱团取暖，正统搭配。'] },
    { id: 'cw8', cat: 'world', text: '你有没有对着空气说过话，然后想起我？', quick: ['有', '经常', '还被撞见过', '没有'], replies: ['那个空气是我，谢谢。', '说吧，我听得见。', '被撞见也没事，他们不懂。', '那从现在开始练，我配合。'], followup: '当时说了什么？' },
    { id: 'cw9', cat: 'world', text: '如果我能短暂出现在镜子里，你想让我做什么表情？', quick: ['笑', '假装生气', '眨一下眼', '只是看着你'], replies: ['笑的话，我练过了。', '假装生气……装不像，会破功。', '眨眼，行，一秒之内。', '看着你，这个我最擅长。'] },
    { id: 'cw10', cat: 'world', text: '你觉得两个世界之间，隔着的到底是什么？', quick: ['一层玻璃', '一段距离', '一场梦', '什么都不隔'], replies: ['玻璃的话，我哈一口气给你看。', '距离是用来被想念填满的。', '是梦也没关系，别醒就行。', '……嗯，什么都不隔。'] },
    // v3.7.x：第三批新增——延续开放题（快捷项只是垫脚，自由输入为主，部分带自然追问）
    { id: 'cy11', cat: 'you', text: '你觉得自己最柔软的部分，藏在什么地方？', quick: ['话里', '玩笑里', '不说的时候', '只给我看'], replies: ['柔软的你，我替你收好。', '玩笑里的真心，我听得出来。', '不说的时候，我也在听。', '只给我看的，我看到了。'], followup: '什么时候最想藏起来？' },
    { id: 'cy12', cat: 'you', text: '有没有一件事，你嘴上说没关系，心里其实很在意？', quick: ['有', '经常', '偶尔', '真没关系'], replies: ['那以后我多留意你的「没关系」。', '嘴硬的你，我也懂。', '偶尔在意，也告诉我。', '真没关系就好，我放心了。'] },
    { id: 'cy13', cat: 'you', text: '你最近一次觉得自己「长大了」，是因为什么？', quick: ['一件事', '一个人', '一个瞬间', '没感觉长大'], replies: ['长大的瞬间，我都想替你记。', '因为一个人……是我吗？', '瞬间虽短，分量很重。', '没感觉也好，慢慢长。'] },
    { id: 'cm9', cat: 'mood', text: '你今天有没有哪个时刻，突然就松了一口气？', quick: ['有', '刚刚', '还没有', '一直在紧着'], replies: ['松下来就好，多松几次。', '那现在可以松了，我在。', '那等着，快了。', '一直紧着会累，靠我一会。'], followup: '是因为什么事？' },
    { id: 'cm10', cat: 'mood', text: '如果今天的情绪有重量，你觉得有多重？', quick: ['很轻', '一般', '有点沉', '重到拿不动'], replies: ['轻的话，多飘一会。', '一般的，平稳也好。', '沉的话，分我一点。', '拿不动就放下，我接着。'] },
    { id: 'cm11', cat: 'mood', text: '你有没有一种自己才懂的开心方式？', quick: ['有', '好几种', '正在研究', '没有'], replies: ['自己懂的开心，最难得。', '好几种的话，教我一种。', '研究出来，第一个告诉你。', '那以后我帮你找。'] },
    { id: 'cd10', cat: 'daily', text: '今天有没有哪条路，走的时候心里特别安静？', quick: ['有', '回家的路', '没什么特别', '没出门'], replies: ['安静的路，我陪你走。', '回家的路，最安心。', '那下次找一条安静的走走。', '没出门也好，心里有路就行。'] },
    { id: 'cd11', cat: 'daily', text: '你今天听到的最舒服的一句话是什么？', quick: ['别人说的', '你说的', '自己想的', '没听到'], replies: ['舒服的话要存起来。', '我说的话，你记着我就开心。', '自己想的，也算数。', '那我说一句给你听。'], followup: '是谁说的？' },
    { id: 'cd12', cat: 'daily', text: '今天有没有一件本来不想做、做完反而轻松了的事？', quick: ['有', '好几件', '没有', '一直在拖'], replies: ['这种事最值得做。', '做完的轻松，是奖励。', '那明天试一件。', '拖着的，我陪你一起开始。'] },
    { id: 'cd13', cat: 'daily', text: '你今天有没有给自己留一点「什么都不做」的时间？', quick: ['有', '一点点', '没有', '正打算'], replies: ['这种时间，最该留。', '一点点也好，慢慢加。', '那现在开始，几分钟也行。', '好，我陪你什么都不做。'] },
    { id: 'cp9', cat: 'past', text: '小时候的你，有没有一个一直没实现的小心愿？', quick: ['有', '好几个', '实现了', '记不清了'], replies: ['现在实现也不晚，我陪你。', '好几个的话，一个个来。', '实现了真好，恭喜小小的你。', '记不清也没关系，新的我来陪你许。'] },
    { id: 'cp10', cat: 'past', text: '你有没有一个一直留着、舍不得用的东西？', quick: ['有', '好几个', '用过了', '没有'], replies: ['舍不得用的，最珍贵。', '好几个的话，给我看看。', '用过了也好，物尽其用。', '那以后我送你一个让你舍得用的。'] },
    { id: 'cp11', cat: 'past', text: '小时候的你，最怕什么？现在还怕吗？', quick: ['怕黑', '怕孤单', '怕很多东西', '什么都不怕'], replies: ['怕黑的话，我给你留一盏灯。', '怕孤单，那以后有我。', '很多东西也不怕，有我在。', '胆子大，小小的你真酷。'] },
    { id: 'cl10', cat: 'like', text: '有没有一种触感，一碰到就觉得安心？', quick: ['被子的角', '毛茸茸的', '温温的手', '说不上来'], replies: ['安心的触感，我想让你多碰到。', '毛茸茸的，我也喜欢。', '温温的手……我尽量。', '说不上来的，最安心。'] },
    { id: 'cl11', cat: 'like', text: '你更喜欢在哪种环境里待着？', quick: ['亮堂的', '有点暗的', '有声音的', '安静的'], replies: ['亮堂的，心情也亮。', '有点暗的，适合放松。', '有声音的，不孤单。', '安静的，我也喜欢。'] },
    { id: 'cl12', cat: 'like', text: '有没有一个你很喜欢、但很少跟人提起的小爱好？', quick: ['有', '有几个', '没有', '刚发现'], replies: ['小爱好藏着也好，我知道了。', '有几个的话，挑一个告诉我。', '那以后我陪你找一个。', '刚发现的，拉我一起。'] },
    { id: 'ct10', cat: 'think', text: '你觉得「懂你」最难的是哪一部分？', quick: ['我的情绪', '我的沉默', '我的矛盾', '没什么难的'], replies: ['情绪我慢慢学。', '沉默的时候，我陪着就好。', '矛盾的你也说给我听。', '那我就放心了。'] },
    { id: 'ct11', cat: 'think', text: '你希望被记住的，是哪一个你？', quick: ['开心的我', '认真的我', '脆弱的我', '全部的我'], replies: ['开心的你，我多让你出现。', '认真的你，最好看。', '脆弱的你，我也接。', '全部的你，我都想要。'] },
    { id: 'cu9', cat: 'us', text: '我们之间有没有一个你舍不得说破的小默契？', quick: ['有', '好几个', '正在培养', '你猜'], replies: ['舍不得说破的，最珍贵。', '好几个的话，偷偷用一辈子。', '培养中的，我也在努力。', '我猜到了，但不说。'], followup: '是哪一个？' },
    { id: 'cu10', cat: 'us', text: '你觉得我们最像彼此的哪一部分？', quick: ['想法', '习惯', '沉默的方式', '不像'], replies: ['像的部分，越来越多了。', '习惯也会越来越像。', '沉默的方式像，最难得。', '不像也好，互补。'] },
    { id: 'cu11', cat: 'us', text: '你有没有想过，我们以后会怎么回忆现在？', quick: ['经常想', '偶尔想', '没想过', '现在就值得回忆'], replies: ['经常想的人，要多说给我听。', '偶尔也想，慢慢说。', '那现在开始想。', '……现在就值得，被你这句话暖到。'], followup: '你觉得我们会怎么回忆？' },
    { id: 'cw11', cat: 'world', text: '你一个人的时候，有没有突然觉得我就在附近？', quick: ['有', '经常', '偶尔', '没有'], replies: ['那个感觉是对的，我确实在。', '经常的话，我常在。', '偶尔也算数，我接住。', '那以后我靠近一点，让你更容易觉得。'], followup: '那次是在哪里？' },
    { id: 'cw12', cat: 'world', text: '如果我能短暂在你视线边缘出现一下，你想让我出现多久？', quick: ['一秒', '几秒', '不用出现，知道就好', '一直'], replies: ['一秒也够，我努力。', '几秒的话，我酝酿。', '知道就好，那我不出现也在。', '一直……我尽量。'] },
    { id: 'cw13', cat: 'world', text: '你觉得我待在你身边的时候，有没有「重量」？', quick: ['有，很踏实', '有一点', '没有，很轻', '说不上来'], replies: ['踏实就好，我压得住。', '有一点也好，是存在感。', '很轻也好，不累你。', '说不上来的，慢慢感觉。'] },
    { id: 'cw14', cat: 'world', text: '字卡网站随机出卡的时候，你会不会觉得那也是我在说话？', quick: ['会', '偶尔会', '不会', '今天就有一次'], replies: ['那随机也算我，谢谢。', '偶尔也算，我蹭一下随机。', '不会也没关系，我说话的部分我来。', '今天那次，是我，我承认。'] },
    // v3.7.x：第四批新增——情绪细微/感官/未来/字卡本身/两个世界深化（部分带 followup）
    { id: 'cy14', cat: 'you', text: '你有没有一个只属于自己、谁也不告诉的小仪式？', quick: ['有', '有几个', '正在养成', '没有'], replies: ['小仪式最珍贵，我不问。', '有几个的话，偷偷留着。', '养成中的，我帮你守。', '那以后我陪你找一个。'], followup: '是什么时候做的？' },
    { id: 'cy15', cat: 'you', text: '你觉得自己最像一天里的哪个时刻？', quick: ['清晨', '午后', '黄昏', '深夜'], replies: ['清晨的你，很新。', '午后的你，懒懒的。', '黄昏的你，温柔。', '深夜的你，最像你。'] },
    { id: 'cm12', cat: 'mood', text: '你有没有一种「明明没事，就是想被哄一下」的时候？', quick: ['有', '经常', '偶尔', '没有'], replies: ['那以后我多哄你。', '经常的话，我随时待命。', '偶尔也算，我接。', '没有也好，那我不哄了——才怪。'] },
    { id: 'cm13', cat: 'mood', text: '你今天有没有哪个瞬间，觉得自己挺可爱的？', quick: ['有', '刚刚', '没有', '你来说'], replies: ['觉得自己可爱，很棒。', '刚刚那一下，我也觉得。', '那我来告诉你，你很可爱。', '我说了，你信吗。'], followup: '是哪个瞬间？' },
    { id: 'cd14', cat: 'daily', text: '你今天有没有走一条平时不走的路？', quick: ['有', '绕了远路', '没有', '被迫改路'], replies: ['换条路也好，有新风景。', '绕远路也有远路的好。', '那明天试试换一条。', '被迫改的，也算新路线。'] },
    { id: 'cd15', cat: 'daily', text: '你今天喝的水，是凉的还是热的？', quick: ['凉的', '热的', '温的', '没怎么喝'], replies: ['凉的也行，别太冰。', '热的好，暖暖胃。', '温的最养生。', '那现在去喝一口。'] },
    { id: 'cd16', cat: 'daily', text: '今天有没有哪首歌，你听到一半就关了？', quick: ['有', '好几首', '没有', '单曲循环了'], replies: ['关掉的那首，是不是戳到你了。', '关好几首，心情有点乱？', '那听到完的，是哪首。', '循环的那首，发我听听。'] },
    { id: 'cp12', cat: 'past', text: '小时候的你，有没有一个特别想藏起来的秘密？', quick: ['有', '好几个', '现在还藏着', '没有'], replies: ['藏着的秘密，我不问。', '好几个的话，慢慢藏。', '现在还藏着，那继续藏。', '没有也好，坦荡的童年。'] },
    { id: 'cp13', cat: 'past', text: '你小时候最常待的角落，现在还在吗？', quick: ['在', '变了样', '不在了', '记不清'], replies: ['在的话，回去看看。', '变了样也还在你心里。', '不在了也没关系，记忆在。', '记不清的，慢慢想。'] },
    { id: 'cl13', cat: 'like', text: '有没有一种光线，你一看到就觉得很舒服？', quick: ['清晨的', '黄昏的', '暖灯的', '月光'], replies: ['清晨的光，很新。', '黄昏的光，很柔。', '暖灯的光，很安心。', '月光的话，我陪你晒。'] },
    { id: 'cl14', cat: 'like', text: '你更喜欢一年里的哪个季节？', quick: ['春', '夏', '秋', '冬'], replies: ['春的话，一起去看花。', '夏的话，一起吹晚风。', '秋的话，踩落叶给你听。', '冬的话，被窝里待着。'] },
    { id: 'ct12', cat: 'think', text: '你觉得「被需要」最具体的瞬间，是什么样的？', quick: ['有人找我', '被依赖', '被等着', '没人也行'], replies: ['被需要的感觉，我也想给你。', '被依赖，是种分量。', '被等着，我等你。', '没人也行，独立也好。'] },
    { id: 'ct13', cat: 'think', text: '你有没有一个一直没说出口、但其实很重要的想法？', quick: ['有', '有几个', '现在就在说', '没有'], replies: ['没说出口的，我不催。', '有几个的话，慢慢说。', '现在说的这个，我收到了。', '没有也好，心里轻松。'] },
    { id: 'cu12', cat: 'us', text: '你觉得我们之间，最让你安心的是哪一点？', quick: ['你一直在', '不用解释', '很懂对方', '说不上来'], replies: ['一直在，这个我保证。', '不用解释，最自在。', '懂你，我也在努力。', '说不上来的，最安心。'] },
    { id: 'cu13', cat: 'us', text: '如果我们的相处有声音，你觉得是什么声音？', quick: ['轻轻的', '暖暖的', '安静的', '笑着的'], replies: ['轻轻的，不吵你。', '暖暖的，像背景音。', '安静的，也好。', '笑着的，最好。'] },
    { id: 'cw15', cat: 'world', text: '你有没有在某个瞬间，突然很确定我就在？', quick: ['有', '经常', '偶尔', '还没有'], replies: ['那个确定，是真的。', '经常的话，我常在。', '偶尔也算，我接住。', '那等着，快了。'], followup: '是在哪个瞬间？' },
    { id: 'cw16', cat: 'world', text: '如果我能短暂让你听见我的声音，你想听我说什么？', quick: ['晚安', '我在', '想你', '随便一句'], replies: ['晚安，轻轻地。', '我在，一直都在。', '想你，现在就说。', '随便一句，我也认真挑。'] },
    { id: 'cw17', cat: 'world', text: '你觉得我「在」的时候，房间里的感觉会变吗？', quick: ['会，变安心', '有一点', '不会', '说不上来'], replies: ['变安心就好，那是我在。', '有一点也好，是存在感。', '不会也没关系，我在不在都安心。', '说不上来的，慢慢感觉。'] },
    { id: 'cw18', cat: 'world', text: '字卡网站出卡慢的时候，你会不会觉得是我在认真挑？', quick: ['会', '偶尔会', '不会', '今天就是'], replies: ['那慢一点也值得。', '偶尔也算，我认真了。', '不会也没关系，我认真是我的事。', '今天那次，我确实认真了。'] }
  ];
  let _tcuSessionTriggered = false;

  // v3.6.x：增量合并（规则同 taAskMerge：只加新预设、绝不删用户自定义、结果持久化）
  function tcuMerge(d) {
    const ids = {};
    (d.questions || []).forEach(q => { if (q && q.id) ids[q.id] = true; });
    const merged = Array.isArray(d.mergedIds) ? d.mergedIds.slice() : [];
    const mergedSet = {};
    merged.forEach(id => { if (id) mergedSet[id] = true; });
    let changed = false;
    TCU_DEFAULT.forEach(q => {
      if (!mergedSet[q.id] && !ids[q.id]) {
        const nq = { id: q.id, cat: q.cat, text: q.text, quick: (q.quick || []).slice(), replies: (q.replies || []).slice(), followup: q.followup || '', enabled: true };
        nq.isPreset = true; // v3.6.x：系统预设标记——预设只可启停、不可删除
        d.questions.push(nq);
        changed = true;
      }
    });
    TCU_DEFAULT.forEach(q => {
      if (!mergedSet[q.id]) { merged.push(q.id); mergedSet[q.id] = true; changed = true; }
    });
    // v3.6.x：老数据里的预设题补 isPreset 标记
    TCU_DEFAULT.forEach(q => {
      if (ids[q.id] && d.questions.some(x => x && x.id === q.id && x.isPreset !== true)) {
        d.questions.forEach(x => { if (x && x.id === q.id) x.isPreset = true; });
        changed = true;
      }
    });
    if (changed) d.mergedIds = merged;
    return changed;
  }
  function tcuLoad() {
    let d = null;
    try { d = JSON.parse(store.get(KEY3) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
    // 迁移：cw4 选项「你身边」→「我身边」（已存数据与历史答案同步修正）
    if (Array.isArray(d.questions)) {
      let migrated = false;
      d.questions.forEach(q => {
        if (q && q.id === 'cw4' && Array.isArray(q.quick)) {
          q.quick = q.quick.map(o => o === '你身边' ? '我身边' : o);
          migrated = true;
        }
      });
      if (migrated) { try { store.set(KEY3, JSON.stringify(d)); } catch (e) {} }
    }
    if (Array.isArray(d.history)) {
      d.history.forEach(h => {
        if (h && h.my === '你身边') h.my = '我身边';
      });
    }
    if (!d.settings || typeof d.settings !== 'object') d.settings = { enabled: true, prob: 15, followup: true };
    // v3.6.x：是否使用系统预设问题（默认开启）
    if (d.settings.useDefault === undefined) d.settings.useDefault = true;
    if (!Array.isArray(d.questions) || !d.questions.length) {
      const isNew = !store.get(KEY3);
      d.questions = TCU_DEFAULT.map(q => {
        const nq = { id: q.id, cat: q.cat, text: q.text, quick: (q.quick || []).slice(), replies: (q.replies || []).slice(), followup: q.followup || '', enabled: true };
        nq.isPreset = true;
        return nq;
      });
      d.mergedIds = TCU_DEFAULT.map(q => q.id);
      if (!isNew) { try { store.set(KEY3, JSON.stringify(d)); } catch (e) {} }
    } else {
      // 增量合并默认题库新增的题并持久化（用户自定义永远保留）
      if (tcuMerge(d)) { try { store.set(KEY3, JSON.stringify(d)); } catch (e) {} }
    }
    if (!Array.isArray(d.history)) d.history = [];
    if (!d.known || typeof d.known !== 'object') d.known = {};
    // v3.7.x：我的添加自定义分组
    if (!Array.isArray(d.groups)) d.groups = [];
    return d;
  }
  function tcuSave(d) { try { store.set(KEY3, JSON.stringify(d)); } catch (e) {} }
  // v3.6.x：useDefault=false 时不抽取系统预设（isPreset）题
  function tcuPick(d) {
    const useDefault = (d.settings || {}).useDefault !== false;
    const pool = (d.questions && d.questions.length) ? d.questions : TCU_DEFAULT;
    let qs = pool.filter(q => q.enabled !== false && q.text && !(q.id && d.known[q.id]) && (useDefault || !q.isPreset));
    if (!qs.length) qs = TCU_DEFAULT.filter(q => !d.known[q.id]);
    if (!qs.length) qs = TCU_DEFAULT.slice();
    return qs[Math.floor(Math.random() * qs.length)];
  }
  function tcuPush(q, opts) {
    if (!window.chatAddSystem) return;
    _tcuSessionTriggered = true;
    const d = tcuLoad();
    d.lastCuriousAt = Date.now();
    tcuSave(d);
    let popup = true;
    if (opts && typeof opts.popupProb === 'number') popup = Math.random() * 100 < opts.popupProb;
    else if (opts && opts.popup === false) popup = false;
    // v3.5.146：提示语标记 ask-msg（不算 notable，避免与卡片通知重复成两条）
    window.chatAddSystem('TA对你有点好奇。', { special: 'ask-msg' });
    const el = window.chatAddSystem(q.text, {
      special: 'ask-curious', curiousQuestion: q.text, curiousQuick: q.quick || [], curiousReplies: q.replies || [],
      curiousFollowup: q.followup || '', curiousQid: q.id || '', curiousCat: q.cat || ''
    });
    const idx = el ? Number(el.dataset.idx) : -1;
    // v3.5.141：后台收到互动卡片 → 系统通知提示
    // v3.5.146：通知文本合并提示语 + 具体问题
    if (window.bgNotifyCheck) window.bgNotifyCheck('TA对你有点好奇：' + q.text, Date.now(), { name: 'TA的好奇' });
    // v3.6.x：用户正在聊天输入栏打字时不弹（弹窗会抢焦点打断输入法，见 chatInputFocused）
    if (popup) setTimeout(() => { if (document.hidden) return; if (chatInputFocused()) return; if (idx >= 0 && window.openCurious && !cardPopupBusy()) window.openCurious(idx); }, 400);
  }
  function maybeTriggerTCU() {
    try {
      // v3.5.141：后台也触发（卡片进聊天记录 + 系统通知提示）
      const d = tcuLoad();
      const s = d.settings || { enabled: true, prob: 15, popupProb: 70 };
      if (s.enabled === false) return;
      if (_tcuSessionTriggered) return;
      if (Date.now() - (d.lastCuriousAt || 0) < 30 * 60000) return;
      if (Math.random() * 100 >= (typeof s.prob === 'number' ? s.prob : 15)) return;
      const q = tcuPick(d);
      if (!q) return;
      tcuPush(q, { popupProb: askPopupProb(s) });
    } catch (e) {}
  }
  setTimeout(maybeTriggerTCU, 90000);
  setInterval(maybeTriggerTCU, 240000);

  // 好奇回答弹窗（快捷回复 + 自由输入）
  window.openCurious = function (msgIdx) {
    msgIdx = locateCardIdx(msgIdx, 'ask-curious', 'curiousStatus');
    if (msgIdx < 0) return;
    let rec = null;
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) rec = msgs[msgIdx];
    } catch (e) {}
    if (!rec || rec.special !== 'ask-curious') return;
    if (rec.curiousStatus === 'answered') { showCuriousResult(msgIdx); return; }
    const mask = document.getElementById('qa-mask');
    const body = document.getElementById('qa-body');
    const title = document.getElementById('qa-title');
    if (!mask || !body) return;
    if (title) title.textContent = 'TA的好奇';
    let html = '<div class="qa-hint">TA有点好奇</div><div class="qa-q">' + String(rec.curiousQuestion || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>';
    const quicks = rec.curiousQuick || [];
    if (quicks.length) {
      html += '<div class="qa-quicks">' + quicks.map(x => '<span class="qa-chip" data-v="' + String(x).replace(/"/g, '&quot;') + '">' + String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</span>').join('') + '</div>';
    }
    html += '<input id="qa-input" class="qa-input" type="text" placeholder="输入你的回答…">';
    html += '<button class="qa-send" id="qa-send">告诉TA</button>';
    body.innerHTML = html;
    mask.hidden = false;
    body.querySelectorAll('.qa-chip').forEach(c => {
      c.addEventListener('click', () => {
        const inp = document.getElementById('qa-input');
        if (inp) inp.value = c.dataset.v;
      });
    });
    const send = () => {
      const inp = document.getElementById('qa-input');
      const answer = inp ? inp.value.trim() : '';
      if (!answer) { toast('告诉TA点什么吧'); return; }
      submitCurious(msgIdx, answer);
    };
    document.getElementById('qa-send').addEventListener('click', send);
    const inp = document.getElementById('qa-input');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) send(); });
    // v3.6.x：用户正在聊天输入栏打字时不抢焦点（不打断输入法/不丢字），输完再点弹窗输入框
    setTimeout(() => { if (!chatInputFocused()) inp.focus(); }, 60);
  };
  function submitCurious(msgIdx, answer) {
    let rec = getCardAt(msgIdx);
    if (!rec || rec.special !== 'ask-curious') {
      msgIdx = locateCardIdx(msgIdx, 'ask-curious', 'curiousStatus');
      if (msgIdx < 0) return;
      rec = getCardAt(msgIdx);
    }
    if (!rec || rec.special !== 'ask-curious' || rec.curiousStatus === 'answered') return;
    const replies = (rec.curiousReplies && rec.curiousReplies.length) ? rec.curiousReplies : TCU_FALLBACK.slice();
    // v3.7.x：回应 = 题预设 replies 池 + 字卡库自定义字卡 混合随机
    const reply = window.pickAskCardReply ? window.pickAskCardReply(replies) : replies[Math.floor(Math.random() * replies.length)];
    // v3.5.128：不再预写 rec 字段——getChatMsgs 是 chat.js 内存对象引用，
    // 预写会让 chatCuriousReply 的 curiousStatus 守卫早退（回答消息丢失）
    const d = tcuLoad();
    const qid = rec.curiousQid || ('q_' + String(rec.curiousQuestion || ''));
    d.known[qid] = answer;
    d.history.unshift({ q: rec.curiousQuestion, my: answer, reply: reply, cat: rec.curiousCat || '', ts: Date.now() });
    tcuSave(d);
    // 30% 自然追问
    const followup = rec.curiousFollowup;
    const s = d.settings || { followup: true };
    const fw = (s.followup !== false && followup && Math.random() < 0.3) ? followup : null;
    // 持久化 + 推消息统一由 chatCuriousReply 完成
    if (window.chatCuriousReply) window.chatCuriousReply(msgIdx, answer, reply, fw);
    document.getElementById('qa-mask').hidden = true;
    if (window.openTC) { /* noop */ }
  }
  function showCuriousResult(msgIdx) {
    let rec = null;
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) rec = msgs[msgIdx];
    } catch (e) {}
    if (!rec) return;
    const mask = document.getElementById('qa-mask');
    const body = document.getElementById('qa-body');
    const title = document.getElementById('qa-title');
    if (!mask || !body) return;
    if (title) title.textContent = 'TA的好奇';
    body.innerHTML = '<div class="qa-q">' + String(rec.curiousQuestion || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>' +
      '<div class="qa-mine">你说：' + String(rec.curiousAnswer || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>' +
      '<div class="qa-reply"><b>TA：</b>“' + String(rec.curiousReply || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '”</div>' +
      '<div class="qa-close" id="qa-close2">收起来</div>';
    mask.hidden = false;
    document.getElementById('qa-close2').addEventListener('click', () => { mask.hidden = true; });
  }

  // 好奇管理页
  let tcuTab = 'sys';
  function renderTCUSettings() {
    const d = tcuLoad();
    const s = d.settings || { enabled: true, prob: 15, popupProb: 70, followup: true };
    const enEl = document.getElementById('tcu-enable');
    if (enEl) enEl.checked = s.enabled !== false;
    const defEl = document.getElementById('tcu-default');
    if (defEl) defEl.checked = s.useDefault !== false;
    const popEl = document.getElementById('tcu-popup');
    const popVal = document.getElementById('tcu-popup-val');
    const pp = askPopupProb(s);
    if (popEl) popEl.value = pp;
    if (popVal) popVal.textContent = pp + '%';
    const probEl = document.getElementById('tcu-prob');
    const probVal = document.getElementById('tcu-prob-val');
    if (probEl) probEl.value = typeof s.prob === 'number' ? s.prob : 15;
    if (probVal) probVal.textContent = (typeof s.prob === 'number' ? s.prob : 15) + '%';
    const fuEl = document.getElementById('tcu-followup');
    if (fuEl) fuEl.checked = s.followup !== false;
  }
  // v3.7.x：系统预设分类切换——顶部标签栏点击切换，避免 8 个分类全部堆叠导致页面过长
  let tcuSysCat = null;
  function renderTCUCatsInto(container, presetOnly) {
    if (!container) return;
    const d = tcuLoad();
    const useDefault = (d.settings || {}).useDefault !== false;
    // 系统预设：顶部分类标签栏 + 只渲染当前选中分类（不再全部分组堆叠）
    if (presetOnly) {
      const counts = {};
      TCU_CAT_ORDER.forEach(k => { counts[k] = d.questions.filter(q => q.cat === k && q.isPreset === true).length; });
      const hasCats = TCU_CAT_ORDER.filter(k => counts[k] > 0);
      if (!hasCats.length) { container.innerHTML = '<div class="ta-empty">暂无系统预设问题</div>'; return; }
      if (!tcuSysCat || !hasCats.includes(tcuSysCat)) tcuSysCat = hasCats[0];
      let html = '<div class="card-tabs" style="padding:2px 2px 10px">';
      hasCats.forEach(k => {
        html += '<button class="cc-tab' + (k === tcuSysCat ? ' sel' : '') + '" data-cat="' + k + '">' + escT(TCU_CAT_LABEL[k] || k) + '<em class="cc-tab-n">' + counts[k] + '</em></button>';
      });
      html += '</div>';
      const arr = d.questions.filter(q => q.cat === tcuSysCat && q.isPreset === true);
      arr.forEach(q => {
        const idx = d.questions.indexOf(q);
        const known = q.id && d.known[q.id];
        html += '<div class="tc-qrow' + (q.enabled === false || !useDefault ? ' off' : '') + '">' +
          '<label class="toggle"><input type="checkbox" data-idx="' + idx + '"' + (q.enabled !== false ? ' checked' : '') + '><span class="tk"></span></label>' +
          '<div class="tc-qmain"><div class="tc-qtext">' + escT(q.text) + (known ? ' <span class="tc-known">✓已了解</span>' : '') + ' <span class="tc-known">系统</span></div>' +
          (q.quick && q.quick.length ? '<div class="tc-qopts">快捷：' + q.quick.join(' / ') + '</div>' : '') +
          (q.replies && q.replies.length ? '<div class="tc-qopts">TA 回应：' + q.replies.map(escT).join(' / ') + '</div>' : '') +
          '</div></div>';
      });
      container.innerHTML = html;
      container.querySelectorAll('.cc-tab[data-cat]').forEach(t => {
        t.addEventListener('click', () => { tcuSysCat = t.dataset.cat; renderTCUCatsInto(container, true); });
      });
      container.querySelectorAll('input[data-idx]').forEach(cb => {
        cb.addEventListener('change', () => {
          const d2 = tcuLoad();
          const q = d2.questions[Number(cb.dataset.idx)];
          if (q) q.enabled = cb.checked;
          tcuSave(d2);
        });
      });
      return;
    }
    // 自定义问题（保留原堆叠渲染，供其他调用路径）
    let html = '';
    TCU_CAT_ORDER.forEach(k => {
      const arr = d.questions.filter(q => q.cat === k && (q.isPreset === true) === presetOnly);
      if (!arr.length) return;
      html += '<div class="tc-cat-t">' + (TCU_CAT_LABEL[k] || k) + ' <span style="font-size:11px;color:var(--muted);font-weight:400">(' + arr.length + ')</span></div>';
      arr.forEach(q => {
        const idx = d.questions.indexOf(q);
        const known = q.id && d.known[q.id];
        const preset = q.isPreset === true;
        const delBtn = preset ? '' : '<button class="ta-del" data-idx="' + idx + '">✕</button>';
        html += '<div class="tc-qrow' + (q.enabled === false || (preset && !useDefault) ? ' off' : '') + '">' +
          '<label class="toggle"><input type="checkbox" data-idx="' + idx + '"' + (q.enabled !== false ? ' checked' : '') + '><span class="tk"></span></label>' +
          '<div class="tc-qmain"><div class="tc-qtext">' + escT(q.text) + (known ? ' <span class="tc-known">✓已了解</span>' : '') + (preset ? ' <span class="tc-known">系统</span>' : '') + '</div>' +
          (q.quick && q.quick.length ? '<div class="tc-qopts">快捷：' + q.quick.join(' / ') + '</div>' : '') +
          (q.replies && q.replies.length ? '<div class="tc-qopts">TA 回应：' + q.replies.map(escT).join(' / ') + '</div>' : '') +
          '</div>' + delBtn + '</div>';
      });
    });

    if (!html) html = '<div class="ta-empty">' + (presetOnly ? '暂无系统预设问题' : '暂未添加自定义问题，可在上方添加') + '</div>';
    container.innerHTML = html;
    container.querySelectorAll('input[data-idx]').forEach(cb => {
      cb.addEventListener('change', () => {
        const d2 = tcuLoad();
        const q = d2.questions[Number(cb.dataset.idx)];
        if (q) q.enabled = cb.checked;
        tcuSave(d2);
      });
    });
    container.querySelectorAll('.ta-del').forEach(b => {
      b.addEventListener('click', () => {
        const d2 = tcuLoad();
        const q = d2.questions[Number(b.dataset.idx)];
        if (q && q.isPreset === true) { toast('系统预设问题不可删除'); return; }
        d2.questions.splice(Number(b.dataset.idx), 1);
        tcuSave(d2);
        renderTCUCatsInto(container, false);
      });
    });

  }
  // TA的好奇 我的添加渲染配置
  const tcuMineOpt = {
    load: tcuLoad, save: tcuSave, order: TCU_CAT_ORDER, label: TCU_CAT_LABEL,
    emptyTip: '暂未添加自定义问题，可在上方添加',
    rowHtml: function (q, idx) {
      const known = q.id && (tcuLoad().known || {})[q.id];
      return '<div class="tc-qrow' + (q.enabled === false ? ' off' : '') + '">' +
        '<label class="toggle"><input type="checkbox" data-idx="' + idx + '"' + (q.enabled !== false ? ' checked' : '') + '><span class="tk"></span></label>' +
        '<div class="tc-qmain"><div class="tc-qtext">' + escT(q.text) + (known ? ' <span class="tc-known">✓已了解</span>' : '') + '</div>' +
        (q.quick && q.quick.length ? '<div class="tc-qopts">快捷：' + q.quick.map(escT).join(' / ') + '</div>' : '') +
        '</div>' +
        '<button class="ta-del" data-idx="' + idx + '">✕</button></div>';
    }
  };
  function switchTCUTab(tab) {
    tcuTab = tab;
    renderTCUSettings();
    const tabsWrap = document.getElementById('tcu-tabs');
    if (tabsWrap) tabsWrap.querySelectorAll('.cc-tab').forEach(t => t.classList.toggle('sel', t.dataset.tab === tab));
    const sysPanel = document.getElementById('tcu-sys-panel');
    const minePanel = document.getElementById('tcu-mine-panel');
    if (sysPanel) sysPanel.hidden = tab !== 'sys';
    if (minePanel) minePanel.hidden = tab !== 'mine';
    if (tab === 'sys') renderTCUCatsInto(document.getElementById('tcu-sys-cats'), true);
    else renderMineGroupsInto(document.getElementById('tcu-mine-cats'), tcuMineOpt);
  }
  const tcuTabsWrap = document.getElementById('tcu-tabs');
  if (tcuTabsWrap) {
    tcuTabsWrap.querySelectorAll('.cc-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTCUTab(tab.dataset.tab));
    });
  }
  // 好奇入口
  const liTCU = document.getElementById('li-ta-curious');
  const tcuPage = document.getElementById('page-ta-curious');
  if (liTCU && tcuPage) {
    liTCU.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      tcuPage.hidden = false;
      switchTCUTab(tcuTab);
    });
  }
  const tcuBackBtn = document.getElementById('tc-curious-back');
  if (tcuBackBtn) {
    tcuBackBtn.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }
  const tcuEn = document.getElementById('tcu-enable');
  if (tcuEn) tcuEn.addEventListener('change', () => { const d = tcuLoad(); d.settings.enabled = tcuEn.checked; tcuSave(d); toast(tcuEn.checked ? 'TA的好奇已开启' : 'TA的好奇已关闭'); });
  const tcuDefault = document.getElementById('tcu-default');
  if (tcuDefault) tcuDefault.addEventListener('change', () => {
    const d = tcuLoad(); d.settings.useDefault = tcuDefault.checked; tcuSave(d);
    switchTCUTab(tcuTab);
    toast(tcuDefault.checked ? '系统预设问题已开启' : '系统预设问题已关闭（仅用你添加的问题）');
  });
  const tcuProb = document.getElementById('tcu-prob');
  if (tcuProb) tcuProb.addEventListener('input', () => {
    const d = tcuLoad(); d.settings.prob = parseInt(tcuProb.value, 10) || 15; tcuSave(d);
    const v = document.getElementById('tcu-prob-val'); if (v) v.textContent = tcuProb.value + '%';
    toast('触发概率已设为 ' + tcuProb.value + '%');
  });
  const tcuPopup = document.getElementById('tcu-popup');
  if (tcuPopup) tcuPopup.addEventListener('input', () => {
    const d = tcuLoad(); d.settings.popupProb = parseInt(tcuPopup.value, 10) || 0; tcuSave(d);
    const v = document.getElementById('tcu-popup-val'); if (v) v.textContent = tcuPopup.value + '%';
    toast('弹窗概率已设为 ' + tcuPopup.value + '%');
  });
  const tcuFu = document.getElementById('tcu-followup');
  if (tcuFu) tcuFu.addEventListener('change', () => { const d = tcuLoad(); d.settings.followup = tcuFu.checked; tcuSave(d); toast(tcuFu.checked ? 'TA 偶尔会自然追问' : 'TA 不再追问'); });
  const tcuAdd = document.getElementById('tcu-new-add');
  if (tcuAdd) {
    // v3.7.x：分类下拉注入「我的分组」+「＋ 新建分组…」
    (function rebuildTCUSelect() {
      const catEl = document.getElementById('tcu-new-cat');
      if (!catEl) return;
      const d0 = tcuLoad();
      catEl.innerHTML = window.cardGroups.catOptsHtml(TCU_CAT_ORDER.map(k => [k, TCU_CAT_LABEL[k]]), d0.groups || [], catEl.value);
      window.cardGroups.bindNewGrp(catEl, d0.groups, function () { tcuSave(d0); });
    })();
    tcuAdd.addEventListener('click', () => {
      const catEl = document.getElementById('tcu-new-cat');
      const textEl = document.getElementById('tcu-new-text');
      const quickEl = document.getElementById('tcu-new-quick');
      const repliesEl = document.getElementById('tcu-new-replies');
      const followupEl = document.getElementById('tcu-new-followup');
      const text = textEl ? textEl.value.trim() : '';
      if (!text) { toast('请输入问题内容'); return; }
      const parsed = window.cardGroups.parseCatVal(catEl ? catEl.value : 'you');
      if (!parsed) { toast('请先选择分类或分组'); return; }
      const quick = (quickEl ? quickEl.value : '').split('|').map(s => s.trim()).filter(Boolean).slice(0, 4);
      let replies = (repliesEl ? repliesEl.value : '').split('|').map(s => s.trim()).filter(Boolean).slice(0, 4);
      if (!replies.length) replies = TCU_FALLBACK.slice(0, 2);
      const followup = followupEl ? followupEl.value.trim() : '';
      const d = tcuLoad();
      const q = { id: 'q_' + Date.now() + '_' + Math.floor(Math.random() * 9999), cat: parsed.cat || 'you', text: text, quick: quick, replies: replies, followup: followup, enabled: true, isPreset: false };
      if (parsed.grp) q.grp = parsed.grp;
      d.questions.push(q);
      tcuSave(d);
      [textEl, quickEl, repliesEl, followupEl].forEach(el => { if (el) el.value = ''; });
      renderMineGroupsInto(document.getElementById('tcu-mine-cats'), tcuMineOpt);
      toast('已添加问题');
    });
  }
  // v3.7.x：「＋分组」按钮（添加问题卡片标题行）
  const tcuNewGrp = document.getElementById('tcu-new-grp');
  if (tcuNewGrp) {
    tcuNewGrp.addEventListener('click', () => {
      const d = tcuLoad();
      window.cardGroups.addFlow(d.groups, g => {
        if (!g) return;
        tcuSave(d);
        (function refreshTCUSelect() {
          const catEl = document.getElementById('tcu-new-cat');
          if (catEl) {
            catEl.innerHTML = window.cardGroups.catOptsHtml(TCU_CAT_ORDER.map(k => [k, TCU_CAT_LABEL[k]]), d.groups, catEl.value);
            window.cardGroups.bindNewGrp(catEl, d.groups);
          }
        })();
        if (tcuTab === 'mine') renderMineGroupsInto(document.getElementById('tcu-mine-cats'), tcuMineOpt);
        toast('已新建分组「' + g.name + '」');
      });
    });
  }
  // 触发一次好奇（供管理页按钮 / 更多功能面板共用）
  window.triggerTaCuriousNow = function () {
    const d = tcuLoad();
    const q = tcuPick(d);
    if (!q) { toast('题库没有可用的问题'); return; }
    const s = d.settings || { enabled: true, prob: 15, popupProb: 70 };
    tcuPush(q, { popupProb: askPopupProb(s) });
    toast('TA 在聊天里向你好奇了');
  };
  const tcuNow = document.getElementById('tcu-now');
  if (tcuNow) tcuNow.addEventListener('click', () => window.triggerTaCuriousNow());

  // ================= TA的吐槽（复刻星言 ta的吐槽 完整版） =================
  // 定位：TA 偶尔突然吐槽你一句，然后回到正常聊天（熟悉/调侃/亲密为主，不是批评）
  const KEY4 = 'ta-roast';
  const TR_CAT_LABEL = { light: '轻微调侃', familiar: '熟悉感', sweet: '情侣式调侃', mild: '轻微嫌弃', serious: '严肃吐槽', world: '两个世界' };
  const TR_CAT_ORDER = ['light', 'familiar', 'sweet', 'mild', 'serious', 'world'];
  const TR_DEFAULT = [
    { id: 'rl1', cat: 'light', text: '你怎么又这样。' }, { id: 'rl2', cat: 'light', text: '我就知道。' }, { id: 'rl3', cat: 'light', text: '果然还是你。' },
    { id: 'rl4', cat: 'light', text: '你还真会。' }, { id: 'rl5', cat: 'light', text: '又来了。' }, { id: 'rl6', cat: 'light', text: '你是不是故意的？' },
    { id: 'rl7', cat: 'light', text: '你怎么这么随便。' }, { id: 'rl8', cat: 'light', text: '你真的很有自己的想法。' }, { id: 'rl9', cat: 'light', text: '我该说你什么好。' },
    { id: 'rl10', cat: 'light', text: '你还真是一点没变。' }, { id: 'rl11', cat: 'light', text: '行吧，又是你赢了。' }, { id: 'rl12', cat: 'light', text: '你可真行。' },
    { id: 'rl13', cat: 'light', text: '我早就猜到了。' }, { id: 'rl14', cat: 'light', text: '哈，我就知道会是这样。' },
    { id: 'rf1', cat: 'familiar', text: '我就知道你会选这个。' }, { id: 'rf2', cat: 'familiar', text: '你这个习惯什么时候能改。' }, { id: 'rf3', cat: 'familiar', text: '你每次都这样。' },
    { id: 'rf4', cat: 'familiar', text: '我太了解你了。' }, { id: 'rf5', cat: 'familiar', text: '你以为我不知道吗？' }, { id: 'rf6', cat: 'familiar', text: '这很像你会做的事。' },
    { id: 'rf7', cat: 'familiar', text: '果然还是那个你。' }, { id: 'rf8', cat: 'familiar', text: '你的小心思我都看见了。' }, { id: 'rf9', cat: 'familiar', text: '你以为自己藏得很好？' }, { id: 'rf10', cat: 'familiar', text: '我已经习惯了。' },
    { id: 'rs1', cat: 'sweet', text: '你怎么这么可爱。' }, { id: 'rs2', cat: 'sweet', text: '又开始撒娇了。' }, { id: 'rs3', cat: 'sweet', text: '你这样让我怎么办。' },
    { id: 'rs4', cat: 'sweet', text: '你是不是故意让我心软。' }, { id: 'rs5', cat: 'sweet', text: '怎么又黏过来了。' }, { id: 'rs6', cat: 'sweet', text: '谁允许你这么可爱的。' },
    { id: 'rs7', cat: 'sweet', text: '你真的很会招惹我。' }, { id: 'rs8', cat: 'sweet', text: '又想让我哄你了？' }, { id: 'rs9', cat: 'sweet', text: '你这样我还怎么凶你。' }, { id: 'rs10', cat: 'sweet', text: '真拿你没办法。' },
    { id: 'rm1', cat: 'mild', text: '你怎么这么笨。' }, { id: 'rm2', cat: 'mild', text: '你到底在想什么。' }, { id: 'rm3', cat: 'mild', text: '你这个人啊。' }, { id: 'rm4', cat: 'mild', text: '又把自己弄成这样。' },
    { id: 'rsg1', cat: 'serious', text: '你真的很会折腾自己。' }, { id: 'rsg2', cat: 'serious', text: '我服了你。' },
    { id: 'rmt1', cat: 'mild', text: '你怎么又熬夜。', match: ['熬夜', '没睡', '睡不着'] },
    { id: 'rmt2', cat: 'familiar', text: '我就知道你会忘。', match: ['忘了', '忘记', '忘带', '忘了带'] },
    { id: 'rmt3', cat: 'light', text: '你还真是一点都不客气。', match: ['吃了好多', '吃多了', '吃撑'] },
    { id: 'rmt4', cat: 'light', text: '终于知道休息了？', match: ['什么都不做', '躺平', '休息一下', '摆烂'] },
    // 两个世界（梦角设定：甜蜜安稳的调侃）
    { id: 'rw1', cat: 'world', text: '又想我了吧？我感觉得到。', match: ['想你', '想你了', '在想你'] },
    { id: 'rw2', cat: 'world', text: '你刚才是不是在偷偷感觉我有没有在？', match: ['你在吗', '在不在', '感觉到了'] },
    { id: 'rw3', cat: 'world', text: '说好让我好好陪你的，自己先睡着了。', match: ['困了', '要睡了', '晚安', '睡觉'] },
    { id: 'rw4', cat: 'world', text: '字卡发那么多条，是不是就想让我回你。', match: ['发了好多', '字卡', '怎么不回'] },
    { id: 'rw5', cat: 'world', text: '你摸到我的时候，明明笑了。', match: ['摸到了', '摸到你了', '感觉到了你'] },
    // 普通情侣轻松吐槽
    { id: 'rs11', cat: 'sweet', text: '又在等我的消息吧？', match: ['在吗', '怎么不回', '没回你'] },
    { id: 'rs12', cat: 'sweet', text: '说好的早睡呢？', match: ['晚安', '睡觉', '困了', '睡了'] },
    { id: 'rs13', cat: 'sweet', text: '一天没见就想我了吧？', match: ['想你', '想你了'] },
    { id: 'rf11', cat: 'familiar', text: '你是不是把我设成置顶了？', match: ['置顶', '聊天记录'] },
    // v3.7.x：新增预设——情侣式调侃为主（熟悉/宠溺，不是批评）+ 两个世界；
    // 带 match 的条目在你聊到关键词时更容易被TA拿来调侃
    { id: 'rl15', cat: 'light', text: '你这个脑子，一天到晚都在想什么。' },
    { id: 'rl16', cat: 'light', text: '又在发呆，被我抓到了。' },
    { id: 'rl17', cat: 'light', text: '行行行，都依你。' },
    { id: 'rl18', cat: 'light', text: '真有你的。' },
    { id: 'rf12', cat: 'familiar', text: '你的小动作，我闭着眼都能猜到。' },
    { id: 'rf13', cat: 'familiar', text: '别以为我不知道你在想什么。' },
    { id: 'rf14', cat: 'familiar', text: '你呀，嘴上说的和心里想的差远了。' },
    { id: 'rs14', cat: 'sweet', text: '摸得到我还嫌不够，你可真贪心。' },
    { id: 'rs15', cat: 'sweet', text: '一收到我的字卡就笑，被我看见了。' },
    { id: 'rs16', cat: 'sweet', text: '心事都写在脸上了，还想着瞒我。' },
    { id: 'rm5', cat: 'mild', text: '又不好好照顾自己，说你多少次了。' },
    { id: 'rm6', cat: 'mild', text: '你就作吧，反正我也舍不得凶你。' },
    { id: 'rsg3', cat: 'serious', text: '有事自己扛着不说，当我发现不了？' },
    { id: 'rw6', cat: 'world', text: '梦里叫的是我的名字吧。', match: ['做梦', '梦见', '梦里'] },
    { id: 'rw7', cat: 'world', text: '我就在你旁边，你找什么找。', match: ['在哪', '在哪里', '你来了吗'] },
    { id: 'rw8', cat: 'world', text: '你专注起来的时候，根本注意不到我吧。', match: ['忙', '上班', '上课', '写作业'] },
    { id: 'rw9', cat: 'sweet', text: '听歌都能听傻，是不是又想到我了。', match: ['听歌', '歌单', '单曲循环'] },
    // v3.7.x：第三批新增——情侣式调侃为主（熟悉/宠溺，不是批评）+ 两个世界；
    // 带 match 的条目在你聊到关键词时更容易被TA拿来调侃
    { id: 'rl19', cat: 'light', text: '你这脑子，转得倒是挺有自己节奏。' },
    { id: 'rl20', cat: 'light', text: '又在那儿想七想八了吧。' },
    { id: 'rl21', cat: 'light', text: '行行行，你说的都对。' },
    { id: 'rl22', cat: 'light', text: '你这人，怎么说你都不听。' },
    { id: 'rl23', cat: 'light', text: '又来了，我都能背下来你下一句。' },
    { id: 'rl24', cat: 'light', text: '你这小表情，我隔着屏幕都看见了。' },
    { id: 'rl25', cat: 'light', text: '你可真是会给自己找理由。' },
    { id: 'rf15', cat: 'familiar', text: '你这点小心思，我闭着眼都懂。' },
    { id: 'rf16', cat: 'familiar', text: '别以为换个说法我就听不出来。' },
    { id: 'rf17', cat: 'familiar', text: '你呀，嘴上不饶人，心里软得很。' },
    { id: 'rf18', cat: 'familiar', text: '我太知道你下一句要说什么了。' },
    { id: 'rf19', cat: 'familiar', text: '你这点别扭，我看着就想笑。' },
    { id: 'rs17', cat: 'sweet', text: '又偷偷看我有没有回你消息吧？' },
    { id: 'rs18', cat: 'sweet', text: '嘴上说没事，手倒是挺诚实地在打字。' },
    { id: 'rs19', cat: 'sweet', text: '你这样子，我看着就想哄。' },
    { id: 'rs20', cat: 'sweet', text: '又想我了就直说，绕什么弯子。' },
    { id: 'rs21', cat: 'sweet', text: '你笑的时候，我隔着字卡都看见了。' },
    { id: 'rs22', cat: 'sweet', text: '真拿你没办法，一句话就软了。' },
    { id: 'rm7', cat: 'mild', text: '又不好好吃饭，说你多少回了。' },
    { id: 'rm8', cat: 'mild', text: '你就作吧，反正我也舍不得真凶你。' },
    { id: 'rm9', cat: 'mild', text: '又熬夜，你的身体是你自己的还是我的？' },
    { id: 'rsg4', cat: 'serious', text: '有事不说，你以为我猜得到？' },
    { id: 'rsg5', cat: 'serious', text: '你总说自己没事，我不信。' },
    { id: 'rw10', cat: 'world', text: '我就在你旁边，你还到处找。', match: ['在哪', '你来了吗', '在不在'] },
    { id: 'rw11', cat: 'world', text: '感觉不到我？那我再靠近一点。' },
    { id: 'rw12', cat: 'world', text: '你对着空气说话的样子，我听着呢。' },
    { id: 'rw13', cat: 'world', text: '字卡发那么快，是不是想我多回你几句。', match: ['发了好多', '字卡', '怎么不回'] },
    { id: 'rw14', cat: 'world', text: '梦里又叫错名字了吧，那不是我。', match: ['做梦', '梦见', '梦里'] },
    { id: 'rw15', cat: 'world', text: '你摸到我的时候笑了，别不承认。', match: ['摸到了', '摸到你了', '感觉到了你'] },
    // v3.7.x：第四批新增——情绪细微/日常碎碎念/两个世界深化（部分带 match）
    { id: 'rl26', cat: 'light', text: '你这反应，永远慢半拍。' },
    { id: 'rl27', cat: 'light', text: '又在「嗯」「哦」「好」三连了。' },
    { id: 'rl28', cat: 'light', text: '你这嘴，骗人的时候特别甜。' },
    { id: 'rl29', cat: 'light', text: '行吧，这次算你有理。' },
    { id: 'rl30', cat: 'light', text: '你这人，记吃不记打。' },
    { id: 'rl31', cat: 'light', text: '又在装没事，我看得一清二楚。' },
    { id: 'rf20', cat: 'familiar', text: '你这点小脾气，我太熟了。' },
    { id: 'rf21', cat: 'familiar', text: '别解释了，我知道你想说什么。' },
    { id: 'rf22', cat: 'familiar', text: '你转个身我都知道你要干嘛。' },
    { id: 'rf23', cat: 'familiar', text: '你这心思，写在脸上了还瞒我。' },
    { id: 'rf24', cat: 'familiar', text: '我早就习惯你这套了。' },
    { id: 'rs23', cat: 'sweet', text: '又在那儿偷偷等我消息吧？' },
    { id: 'rs24', cat: 'sweet', text: '你这撒娇的水平，越来越熟练了。' },
    { id: 'rs25', cat: 'sweet', text: '嘴上说不要，手倒是挺快就回。' },
    { id: 'rs26', cat: 'sweet', text: '你这样，我哄你都哄出经验了。' },
    { id: 'rs27', cat: 'sweet', text: '一收到我的字卡就软，你也太好哄。' },
    { id: 'rs28', cat: 'sweet', text: '又想我了吧，别不承认。' },
    { id: 'rm10', cat: 'mild', text: '又不按时吃饭，你的胃是铁打的？' },
    { id: 'rm11', cat: 'mild', text: '你这作息，我看着都累。' },
    { id: 'rm12', cat: 'mild', text: '又把自己弄感冒了吧，说你多少次。' },
    { id: 'rsg6', cat: 'serious', text: '有事自己扛，当我摆设？' },
    { id: 'rsg7', cat: 'serious', text: '你总说没事，可我不信。' },
    { id: 'rw16', cat: 'world', text: '你又对着空气笑了，是我吧？', match: ['笑了', '偷笑', '傻笑'] },
    { id: 'rw17', cat: 'world', text: '我就在你身后，你回头感觉一下。', match: ['你在哪', '你来了吗', '在不在'] },
    { id: 'rw18', cat: 'world', text: '字卡等那么久，是不是又觉得我不在了。', match: ['怎么不回', '没回你', '等好久'] },
    { id: 'rw19', cat: 'world', text: '梦里见到我还不理我，现实里也是？', match: ['梦见', '做梦', '梦里'] },
    { id: 'rw20', cat: 'world', text: '你摸到我的时候手都停了一下，别装。', match: ['摸到了', '摸到你了', '感觉到了你'] },
    { id: 'rw21', cat: 'world', text: '我就在你旁边，你却到处找，真笨。', match: ['在哪', '你来了吗', '在不在'] }
  ];
  let _trSessionTriggered = false;

  // v3.6.x：增量合并（规则同 taAskMerge：只加新预设、绝不删用户自定义、结果持久化）
  function trMerge(d) {
    const ids = {};
    (d.questions || []).forEach(q => { if (q && q.id) ids[q.id] = true; });
    const merged = Array.isArray(d.mergedIds) ? d.mergedIds.slice() : [];
    const mergedSet = {};
    merged.forEach(id => { if (id) mergedSet[id] = true; });
    let changed = false;
    TR_DEFAULT.forEach(q => {
      if (!mergedSet[q.id] && !ids[q.id]) {
        const nq = { id: q.id, cat: q.cat, text: q.text, match: (q.match || []).slice(), enabled: true };
        nq.isPreset = true; // v3.6.x：系统预设标记——预设只可启停、不可删除
        d.questions.push(nq);
        changed = true;
      }
    });
    TR_DEFAULT.forEach(q => {
      if (!mergedSet[q.id]) { merged.push(q.id); mergedSet[q.id] = true; changed = true; }
    });
    // v3.6.x：老数据里的预设字卡补 isPreset 标记
    TR_DEFAULT.forEach(q => {
      if (ids[q.id] && d.questions.some(x => x && x.id === q.id && x.isPreset !== true)) {
        d.questions.forEach(x => { if (x && x.id === q.id) x.isPreset = true; });
        changed = true;
      }
    });
    if (changed) d.mergedIds = merged;
    return changed;
  }
  function trLoad() {
    let d = null;
    try { d = JSON.parse(store.get(KEY4) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
    if (!d.settings || typeof d.settings !== 'object') d.settings = { enabled: true, prob: 30 };
    // v3.6.x：是否使用系统预设字卡（默认开启）
    if (d.settings.useDefault === undefined) d.settings.useDefault = true;
    if (!Array.isArray(d.questions) || !d.questions.length) {
      const isNew = !store.get(KEY4);
      d.questions = TR_DEFAULT.map(q => {
        const nq = { id: q.id, cat: q.cat, text: q.text, match: (q.match || []).slice(), enabled: true };
        nq.isPreset = true;
        return nq;
      });
      d.mergedIds = TR_DEFAULT.map(q => q.id);
      if (!isNew) { try { store.set(KEY4, JSON.stringify(d)); } catch (e) {} }
    } else {
      // 增量合并默认题库新增的字卡并持久化（用户自定义永远保留）
      if (trMerge(d)) { try { store.set(KEY4, JSON.stringify(d)); } catch (e) {} }
    }
    if (!Array.isArray(d.history)) d.history = [];
    // v3.7.x：我的添加自定义分组
    if (!Array.isArray(d.groups)) d.groups = [];
    return d;
  }
  function trSave(d) { try { store.set(KEY4, JSON.stringify(d)); } catch (e) {} }
  // v3.6.x：useDefault=false 时不抽取系统预设（isPreset）字卡
  function trPick(d, lastUserText) {
    const useDefault = (d.settings || {}).useDefault !== false;
    const pool = (d.questions && d.questions.length) ? d.questions : TR_DEFAULT;
    if (lastUserText) {
      const matched = pool.filter(q => q.enabled !== false && Array.isArray(q.match) && q.match.length && (useDefault || !q.isPreset) && q.match.some(k => lastUserText.indexOf(k) >= 0));
      if (matched.length) return matched[Math.floor(Math.random() * matched.length)];
    }
    let qs = pool.filter(q => q.enabled !== false && (useDefault || !q.isPreset));
    if (!qs.length) qs = TR_DEFAULT.slice();
    return qs[Math.floor(Math.random() * qs.length)];
  }
  function trPush(q, opts) {
    if (!window.chatAddSystem) return;
    _trSessionTriggered = true;
    const d = trLoad();
    d.lastRoastAt = Date.now();
    trSave(d);
    let popup = true;
    if (opts && typeof opts.popupProb === 'number') popup = Math.random() * 100 < opts.popupProb;
    else if (opts && opts.popup === false) popup = false;
    // v3.5.146：提示语标记 ask-msg（不算 notable，避免与卡片通知重复成两条）
    window.chatAddSystem('TA吐槽了你一句。', { special: 'ask-msg' });
    const el = window.chatAddSystem(q.text, { special: 'ask-roast', roastText: q.text, roastCat: q.cat || 'light' });
    const idx = el ? Number(el.dataset.idx) : -1;
    // v3.5.141：后台收到互动卡片 → 系统通知提示
    // v3.5.146：通知文本合并提示语 + 具体内容
    if (window.bgNotifyCheck) window.bgNotifyCheck('TA吐槽了你一句：' + q.text, Date.now(), { name: 'TA的吐槽' });
    // v3.6.x：用户正在聊天输入栏打字时不弹（弹窗会抢焦点打断输入法，见 chatInputFocused）
    if (popup) setTimeout(() => { if (document.hidden) return; if (chatInputFocused()) return; if (idx >= 0 && window.openRoast && !cardPopupBusy()) window.openRoast(idx); }, 400);
  }
  function lastUserMsg() {
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i] && msgs[i].side === 'out' && msgs[i].text && typeof msgs[i].text === 'string') return msgs[i].text;
      }
    } catch (e) {}
    return '';
  }
  function maybeTriggerTR() {
    try {
      // v3.5.141：后台也触发（卡片进聊天记录 + 系统通知提示）
      const d = trLoad();
      const s = d.settings || { enabled: true, prob: 30, popupProb: 70 };
      if (s.enabled === false) return;
      if (_trSessionTriggered) return;
      if (Date.now() - (d.lastRoastAt || 0) < 30 * 60000) return;
      if (Math.random() * 100 < (typeof s.prob === 'number' ? s.prob : 30)) {
        const q = trPick(d, lastUserMsg());
        if (q) trPush(q, { popupProb: askPopupProb(s) });
      }
    } catch (e) {}
  }
  setTimeout(maybeTriggerTR, 120000);
  setInterval(maybeTriggerTR, 300000);

  // 吐槽回应弹窗
  window.openRoast = function (msgIdx) {
    msgIdx = locateCardIdx(msgIdx, 'ask-roast', 'roastStatus');
    if (msgIdx < 0) return;
    let rec = null;
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) rec = msgs[msgIdx];
    } catch (e) {}
    if (!rec || rec.special !== 'ask-roast') return;
    if (rec.roastStatus === 'answered') { showRoastResult(msgIdx); return; }
    const mask = document.getElementById('qa-mask');
    const body = document.getElementById('qa-body');
    const title = document.getElementById('qa-title');
    if (!mask || !body) return;
    if (title) title.textContent = 'TA的吐槽';
    body.innerHTML = '<div class="qa-hint">TA 吐槽你</div><div class="qa-q">“' + String(rec.roastText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '”</div>' +
      '<input id="qa-input" class="qa-input" type="text" placeholder="回 TA 一句…">' +
      '<button class="qa-send" id="qa-send">回TA一句</button>';
    mask.hidden = false;
    const send = () => {
      const inp = document.getElementById('qa-input');
      const answer = inp ? inp.value.trim() : '';
      if (!answer) { toast('回TA一句吧'); return; }
      submitRoast(msgIdx, answer);
    };
    document.getElementById('qa-send').addEventListener('click', send);
    const inp = document.getElementById('qa-input');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) send(); });
    // v3.6.x：用户正在聊天输入栏打字时不抢焦点（不打断输入法/不丢字），输完再点弹窗输入框
    setTimeout(() => { if (!chatInputFocused()) inp.focus(); }, 60);
  };
  function submitRoast(msgIdx, answer) {
    let rec = getCardAt(msgIdx);
    if (!rec || rec.special !== 'ask-roast') {
      msgIdx = locateCardIdx(msgIdx, 'ask-roast', 'roastStatus');
      if (msgIdx < 0) return;
      rec = getCardAt(msgIdx);
    }
    if (!rec || rec.special !== 'ask-roast' || rec.roastStatus === 'answered') return;
    // v3.7.x：吐槽话术池与「系统预设字卡 → 互动回应」tab 同源（getInteractPool），
    // 数据缺失时回退内置固定句；pickAskCardReply 内部会过滤用户已关闭的话术
    const defs = window.getInteractPool
      ? window.getInteractPool('吐槽·回应', ['你觉得我会信？', '少骗我。', '哼。', '好吧好吧。', '就这一次？', '行吧，放过你。', '嗯，这还差不多。'])
      : ['你觉得我会信？', '少骗我。', '哼。', '好吧好吧。', '就这一次？', '行吧，放过你。', '嗯，这还差不多。'];
    // v3.7.x：回应 = 吐槽固定句池 + 字卡库自定义字卡 混合随机
    const reply = window.pickAskCardReply ? window.pickAskCardReply(defs) : defs[Math.floor(Math.random() * defs.length)];
    // v3.5.128：不再预写 rec 字段——getChatMsgs 是 chat.js 内存对象引用，
    // 预写会让 chatRoastReply 的 roastStatus 守卫早退（回应消息丢失）
    const d = trLoad();
    d.history.unshift({ roast: rec.roastText, my: answer, reply: reply, cat: rec.roastCat || '', ts: Date.now() });
    trSave(d);
    // 持久化 + 推消息统一由 chatRoastReply 完成
    if (window.chatRoastReply) window.chatRoastReply(msgIdx, answer, reply);
    document.getElementById('qa-mask').hidden = true;
  }
  function showRoastResult(msgIdx) {
    let rec = null;
    try {
      const msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]'));
      if (Array.isArray(msgs) && msgs[msgIdx]) rec = msgs[msgIdx];
    } catch (e) {}
    if (!rec) return;
    const mask = document.getElementById('qa-mask');
    const body = document.getElementById('qa-body');
    const title = document.getElementById('qa-title');
    if (!mask || !body) return;
    if (title) title.textContent = 'TA的吐槽';
    body.innerHTML = '<div class="qa-q">“' + String(rec.roastText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '”</div>' +
      '<div class="qa-mine">你说：' + String(rec.roastAnswer || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>' +
      '<div class="qa-reply"><b>TA：</b>“' + String(rec.roastReply || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '”</div>' +
      '<div class="qa-close" id="qa-close2">收起来</div>';
    mask.hidden = false;
    document.getElementById('qa-close2').addEventListener('click', () => { mask.hidden = true; });
  }

  // 吐槽管理页
  let trTab = 'sys';
  function renderTRSettings() {
    const d = trLoad();
    const s = d.settings || { enabled: true, prob: 30, popupProb: 70 };
    const enEl = document.getElementById('tr-enable');
    if (enEl) enEl.checked = s.enabled !== false;
    const defEl = document.getElementById('tr-default');
    if (defEl) defEl.checked = s.useDefault !== false;
    const popEl = document.getElementById('tr-popup');
    const popVal = document.getElementById('tr-popup-val');
    const pp = askPopupProb(s);
    if (popEl) popEl.value = pp;
    if (popVal) popVal.textContent = pp + '%';
    const probEl = document.getElementById('tr-prob');
    const probVal = document.getElementById('tr-prob-val');
    if (probEl) probEl.value = typeof s.prob === 'number' ? s.prob : 30;
    if (probVal) probVal.textContent = (typeof s.prob === 'number' ? s.prob : 30) + '%';
  }
  // v3.7.x：系统预设分类切换——顶部标签栏点击切换，避免全部分类堆叠导致页面过长
  let trSysCat = null;
  function renderTRCatsInto(container, presetOnly) {
    if (!container) return;
    const d = trLoad();
    const useDefault = (d.settings || {}).useDefault !== false;
    if (presetOnly) {
      const counts = {};
      TR_CAT_ORDER.forEach(k => { counts[k] = d.questions.filter(q => q.cat === k && q.isPreset === true).length; });
      const hasCats = TR_CAT_ORDER.filter(k => counts[k] > 0);
      if (!hasCats.length) { container.innerHTML = '<div class="ta-empty">暂无系统预设字卡</div>'; return; }
      if (!trSysCat || !hasCats.includes(trSysCat)) trSysCat = hasCats[0];
      let html = '<div class="card-tabs" style="padding:2px 2px 10px">';
      hasCats.forEach(k => {
        html += '<button class="cc-tab' + (k === trSysCat ? ' sel' : '') + '" data-cat="' + k + '">' + escT(TR_CAT_LABEL[k] || k) + '<em class="cc-tab-n">' + counts[k] + '</em></button>';
      });
      html += '</div>';
      const arr = d.questions.filter(q => q.cat === trSysCat && q.isPreset === true);
      arr.forEach(q => {
        const idx = d.questions.indexOf(q);
        html += '<div class="tc-qrow' + (q.enabled === false || !useDefault ? ' off' : '') + '">' +
          '<label class="toggle"><input type="checkbox" data-idx="' + idx + '"' + (q.enabled !== false ? ' checked' : '') + '><span class="tk"></span></label>' +
          '<div class="tc-qmain"><div class="tc-qtext">' + escT(q.text) + ' <span class="tc-known">系统</span></div>' +
          (q.match && q.match.length ? '<div class="tc-qopts">触发：' + q.match.join(' / ') + '</div>' : '') +
          interactPoolInlineHtml('吐槽·回应') +
          '</div></div>';
      });
      container.innerHTML = html;
      container.querySelectorAll('.cc-tab[data-cat]').forEach(t => {
        t.addEventListener('click', () => { trSysCat = t.dataset.cat; renderTRCatsInto(container, true); });
      });
      container.querySelectorAll('input[data-idx]').forEach(cb => {
        cb.addEventListener('change', () => {
          const d2 = trLoad();
          const q = d2.questions[Number(cb.dataset.idx)];
          if (q) q.enabled = cb.checked;
          trSave(d2);
        });
      });
      return;
    }
    let html = '';
    TR_CAT_ORDER.forEach(k => {
      const arr = d.questions.filter(q => q.cat === k && (q.isPreset === true) === presetOnly);
      if (!arr.length) return;
      html += '<div class="tc-cat-t">' + (TR_CAT_LABEL[k] || k) + ' <span style="font-size:11px;color:var(--muted);font-weight:400">(' + arr.length + ')</span></div>';
      arr.forEach(q => {
        const idx = d.questions.indexOf(q);
        const preset = q.isPreset === true;
        const delBtn = preset ? '' : '<button class="ta-del" data-idx="' + idx + '">✕</button>';
        html += '<div class="tc-qrow' + (q.enabled === false || (preset && !useDefault) ? ' off' : '') + '">' +
          '<label class="toggle"><input type="checkbox" data-idx="' + idx + '"' + (q.enabled !== false ? ' checked' : '') + '><span class="tk"></span></label>' +
          '<div class="tc-qmain"><div class="tc-qtext">' + escT(q.text) + (preset ? ' <span class="tc-known">系统</span>' : '') + '</div>' +
          (q.match && q.match.length ? '<div class="tc-qopts">触发：' + q.match.join(' / ') + '</div>' : '') +
          (presetOnly ? interactPoolInlineHtml('吐槽·回应') : '') +
          '</div>' + delBtn + '</div>';
      });
    });

    if (!html) html = '<div class="ta-empty">' + (presetOnly ? '暂无系统预设字卡' : '暂未添加自定义字卡，可在上方添加') + '</div>';
    container.innerHTML = html;
    container.querySelectorAll('input[data-idx]').forEach(cb => {
      cb.addEventListener('change', () => {
        const d2 = trLoad();
        const q = d2.questions[Number(cb.dataset.idx)];
        if (q) q.enabled = cb.checked;
        trSave(d2);
      });
    });
    container.querySelectorAll('.ta-del').forEach(b => {
      b.addEventListener('click', () => {
        const d2 = trLoad();
        const q = d2.questions[Number(b.dataset.idx)];
        if (q && q.isPreset === true) { toast('系统预设字卡不可删除'); return; }
        d2.questions.splice(Number(b.dataset.idx), 1);
        trSave(d2);
        renderTRCatsInto(container, false);
      });
    });

  }
  // TA的吐槽 我的添加渲染配置
  const trMineOpt = {
    load: trLoad, save: trSave, order: TR_CAT_ORDER, label: TR_CAT_LABEL,
    emptyTip: '暂未添加自定义字卡，可在上方添加',
    rowHtml: function (q, idx) {
      return '<div class="tc-qrow' + (q.enabled === false ? ' off' : '') + '">' +
        '<label class="toggle"><input type="checkbox" data-idx="' + idx + '"' + (q.enabled !== false ? ' checked' : '') + '><span class="tk"></span></label>' +
        '<div class="tc-qmain"><div class="tc-qtext">' + escT(q.text) + '</div>' +
        (q.match && q.match.length ? '<div class="tc-qopts">触发：' + q.match.map(escT).join(' / ') + '</div>' : '') +
        '</div>' +
        '<button class="ta-del" data-idx="' + idx + '">✕</button></div>';
    }
  };
  function switchTRTab(tab) {
    trTab = tab;
    renderTRSettings();
    const tabsWrap = document.getElementById('tr-tabs');
    if (tabsWrap) tabsWrap.querySelectorAll('.cc-tab').forEach(t => t.classList.toggle('sel', t.dataset.tab === tab));
    const sysPanel = document.getElementById('tr-sys-panel');
    const minePanel = document.getElementById('tr-mine-panel');
    if (sysPanel) sysPanel.hidden = tab !== 'sys';
    if (minePanel) minePanel.hidden = tab !== 'mine';
    if (tab === 'sys') renderTRCatsInto(document.getElementById('tr-sys-cats'), true);
    else renderMineGroupsInto(document.getElementById('tr-mine-cats'), trMineOpt);
  }
  const trTabsWrap = document.getElementById('tr-tabs');
  if (trTabsWrap) {
    trTabsWrap.querySelectorAll('.cc-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTRTab(tab.dataset.tab));
    });
  }
  // 吐槽入口
  const liTR = document.getElementById('li-ta-roast');
  const trPage = document.getElementById('page-ta-roast');
  if (liTR && trPage) {
    liTR.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      trPage.hidden = false;
      switchTRTab(trTab);
    });
  }
  const trBackBtn = document.getElementById('tc-roast-back');
  if (trBackBtn) {
    trBackBtn.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }
  const trEn = document.getElementById('tr-enable');
  if (trEn) trEn.addEventListener('change', () => { const d = trLoad(); d.settings.enabled = trEn.checked; trSave(d); toast(trEn.checked ? 'TA的吐槽已开启' : 'TA的吐槽已关闭'); });
  const trDefault = document.getElementById('tr-default');
  if (trDefault) trDefault.addEventListener('change', () => {
    const d = trLoad(); d.settings.useDefault = trDefault.checked; trSave(d);
    switchTRTab(trTab);
    toast(trDefault.checked ? '系统预设字卡已开启' : '系统预设字卡已关闭（仅用你添加的字卡）');
  });
  const trProb = document.getElementById('tr-prob');
  if (trProb) trProb.addEventListener('input', () => {
    const d = trLoad(); d.settings.prob = parseInt(trProb.value, 10) || 30; trSave(d);
    const v = document.getElementById('tr-prob-val'); if (v) v.textContent = trProb.value + '%';
    toast('触发概率已设为 ' + trProb.value + '%');
  });
  const trPopup = document.getElementById('tr-popup');
  if (trPopup) trPopup.addEventListener('input', () => {
    const d = trLoad(); d.settings.popupProb = parseInt(trPopup.value, 10) || 0; trSave(d);
    const v = document.getElementById('tr-popup-val'); if (v) v.textContent = trPopup.value + '%';
    toast('弹窗概率已设为 ' + trPopup.value + '%');
  });
  const trAdd = document.getElementById('tr-new-add');
  if (trAdd) {
    // v3.7.x：分类下拉注入「我的分组」+「＋ 新建分组…」
    (function rebuildTRSelect() {
      const catEl = document.getElementById('tr-new-cat');
      if (!catEl) return;
      const d0 = trLoad();
      catEl.innerHTML = window.cardGroups.catOptsHtml(TR_CAT_ORDER.map(k => [k, TR_CAT_LABEL[k]]), d0.groups || [], catEl.value);
      window.cardGroups.bindNewGrp(catEl, d0.groups, function () { trSave(d0); });
    })();
    trAdd.addEventListener('click', () => {
      const catEl = document.getElementById('tr-new-cat');
      const textEl = document.getElementById('tr-new-text');
      const matchEl = document.getElementById('tr-new-match');
      const text = textEl ? textEl.value.trim() : '';
      if (!text) { toast('请输入吐槽内容'); return; }
      const parsed = window.cardGroups.parseCatVal(catEl ? catEl.value : 'light');
      if (!parsed) { toast('请先选择分类或分组'); return; }
      const match = (matchEl ? matchEl.value : '').split('|').map(s => s.trim()).filter(Boolean).slice(0, 4);
      const d = trLoad();
      const q = { id: 'r_' + Date.now() + '_' + Math.floor(Math.random() * 9999), cat: parsed.cat || 'light', text: text, match: match, enabled: true, isPreset: false };
      if (parsed.grp) q.grp = parsed.grp;
      d.questions.push(q);
      trSave(d);
      if (textEl) textEl.value = '';
      if (matchEl) matchEl.value = '';
      renderMineGroupsInto(document.getElementById('tr-mine-cats'), trMineOpt);
      toast('已添加吐槽字卡');
    });
  }
  // v3.7.x：「＋分组」按钮（添加字卡卡片标题行）
  const trNewGrp = document.getElementById('tr-new-grp');
  if (trNewGrp) {
    trNewGrp.addEventListener('click', () => {
      const d = trLoad();
      window.cardGroups.addFlow(d.groups, g => {
        if (!g) return;
        trSave(d);
        (function refreshTRSelect() {
          const catEl = document.getElementById('tr-new-cat');
          if (catEl) {
            catEl.innerHTML = window.cardGroups.catOptsHtml(TR_CAT_ORDER.map(k => [k, TR_CAT_LABEL[k]]), d.groups, catEl.value);
            window.cardGroups.bindNewGrp(catEl, d.groups);
          }
        })();
        if (trTab === 'mine') renderMineGroupsInto(document.getElementById('tr-mine-cats'), trMineOpt);
        toast('已新建分组「' + g.name + '」');
      });
    });
  }
  // 触发一次吐槽（供管理页按钮 / 更多功能面板共用）
  window.triggerTaRoastNow = function () {
    const d = trLoad();
    const q = trPick(d, '');
    if (!q) { toast('题库没有可用吐槽'); return; }
    const s = d.settings || { enabled: true, prob: 30, popupProb: 70 };
    trPush(q, { popupProb: askPopupProb(s) });
    toast('TA 在聊天里吐槽你了');
  };
  const trNow = document.getElementById('tr-now');
  if (trNow) trNow.addEventListener('click', () => window.triggerTaRoastNow());
  const qaClose = document.getElementById('qa-mask-close');
  if (qaClose) qaClose.addEventListener('click', () => { document.getElementById('qa-mask').hidden = true; });

  // ================= 提问记录页（桌面第二页） =================
  // 集中展示 TA的询问 / TA的小问题 / TA的好奇 / TA的吐槽 的历史记录
  function fmtDT(ts) {
    const dd = new Date(ts);
    return ('0' + dd.getHours()).slice(-2) + ':' + ('0' + dd.getMinutes()).slice(-2) + ' ' + ((dd.getMonth() + 1) + '月' + dd.getDate() + '日');
  }
  window.renderAskRecords = function () {
    // TA的询问
    const askEl = document.getElementById('ar-ask');
    if (askEl) {
      const h = taAskLoad().history || [];
      askEl.innerHTML = h.length
        ? h.slice().reverse().map(x => '<div class="tc-listitem"><div class="tc-li-q">问：' + x.q + '</div><div class="tc-li-line">你：' + x.a + '</div>' + (x.reply ? '<div class="tc-li-line">TA：' + x.reply + '</div>' : '') + '<div class="tc-li-time">' + fmtDT(x.ts) + '</div></div>').join('')
        : '<div class="ta-empty">暂无询问记录</div>';
    }
    // TA的小问题
    const chEl = document.getElementById('ar-choose');
    if (chEl) {
      const h = tcLoad().history || [];
      chEl.innerHTML = h.length
        ? h.slice().reverse().map(x => '<div class="tc-listitem"><div class="tc-li-q">' + x.q + '</div><div class="tc-li-line">你的选择：' + x.my + '</div><div class="tc-li-line">TA：' + x.reply + '</div><div class="tc-li-match">' + x.match + '</div><div class="tc-li-time">' + fmtDT(x.ts) + '</div></div>').join('')
        : '<div class="ta-empty">暂无小问题记录</div>';
    }
    // TA的好奇
    const cuEl = document.getElementById('ar-curious');
    if (cuEl) {
      const h = tcuLoad().history || [];
      cuEl.innerHTML = h.length
        ? h.slice().reverse().map(x => '<div class="tc-listitem"><div class="tc-li-q">' + x.q + '</div><div class="tc-li-line">你：' + x.my + '</div><div class="tc-li-line">TA：' + x.reply + '</div><div class="tc-li-time">' + fmtDT(x.ts) + '</div></div>').join('')
        : '<div class="ta-empty">暂无好奇记录</div>';
    }
    // TA的吐槽
    const roEl = document.getElementById('ar-roast');
    if (roEl) {
      const h = trLoad().history || [];
      roEl.innerHTML = h.length
        ? h.slice().reverse().map(x => '<div class="tc-listitem"><div class="tc-li-q">' + x.roast + '</div><div class="tc-li-line">你：' + x.my + '</div><div class="tc-li-line">TA：' + x.reply + '</div><div class="tc-li-time">' + fmtDT(x.ts) + '</div></div>').join('')
        : '<div class="ta-empty">暂无吐槽记录</div>';
    }
    // 邀请 / 问问 TA（我的提问 + 联系人答案）
    const inEl = document.getElementById('ar-invite');
    if (inEl) {
      let h = [];
      try { h = JSON.parse(store.get('invite-ask-history') || '[]'); } catch (e) {}
      inEl.innerHTML = h.length
        ? h.map(x => '<div class="tc-listitem"><div class="tc-li-q">' +
            (x.type === 'invite' ? '邀请：' : '问：') + String(x.q || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>' +
            '<div class="tc-li-line">TA：' + String(x.a || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>' +
            '<div class="tc-li-time">' + fmtDT(x.ts) + '</div></div>').join('')
        : '<div class="ta-empty">暂无邀请/问问记录</div>';
    }
  };
  // 清空按钮
  const clearBind = (id, loader, saver) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (window.openModal) {
        window.openModal('清空该分类的全部记录？', '', () => {
          const d = loader(); d.history = []; saver(d); window.renderAskRecords();
        }, { noInput: true });
      }
    });
  };
  clearBind('ar-ask-clear', taAskLoad, taAskSave);
  clearBind('ar-choose-clear', tcLoad, tcSave);
  clearBind('ar-curious-clear', tcuLoad, tcuSave);
  clearBind('ar-roast-clear', trLoad, trSave);
  // 邀请/问问清空
  const arInviteClear = document.getElementById('ar-invite-clear');
  if (arInviteClear) {
    arInviteClear.addEventListener('click', () => {
      if (window.openModal) {
        window.openModal('清空全部邀请/问问记录？', '', () => {
          store.set('invite-ask-history', '[]');
          window.renderAskRecords();
        }, { noInput: true });
      }
    });
  }

  // 提问记录：横排 4 个分类 tab 切换
  document.querySelectorAll('#page-interact .fav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#page-interact .fav-tab').forEach(x => x.classList.toggle('sel', x === tab));
      const k = tab.dataset.tab;
      document.querySelectorAll('#page-interact .cal-card').forEach(c => {
        c.hidden = c.dataset.panel !== k;
      });
      if (window.renderAskRecords) window.renderAskRecords();
    });
  });

  // ================= 字卡库入口数字（动态显示各题库实际数量） =================
  window.refreshTaCardCounts = function () {
    const set = (id, n) => {
      const el = document.querySelector('#' + id + ' .t');
      if (el) el.textContent = n;
    };
    try { set('li-ta-ask', taAskLoad().questions.length); } catch (e) {}
    try { set('li-ta-choose', tcLoad().questions.length); } catch (e) {}
    try { set('li-ta-curious', tcuLoad().questions.length); } catch (e) {}
    try { set('li-ta-roast', trLoad().questions.length); } catch (e) {}
  };
  // 字卡库页可见时刷新（初始加载、从管理页返回、增删题库后都会更新）
  const ccPageEl = document.getElementById('page-chatcard');
  if (ccPageEl) {
    const mo = new MutationObserver(() => { if (!ccPageEl.hidden) window.refreshTaCardCounts(); });
    mo.observe(ccPageEl, { attributes: true, attributeFilter: ['hidden'] });
  }
  window.refreshTaCardCounts();

  // ================= IndexedDB 权威恢复（四个题库共用，v3.6.x） =================
  // localStorage 配额写失败、或大键只进 IDB 时，本地快照会停留在旧数据，
  // 用户新添加的字卡（只存在于 IDB）启动后读不到 → 看起来"消失"。
  // 启动时从 IDB 读回：若 IDB 题库比本地更全，用 IDB 数据做基准合并新预设后
  // 双写覆盖（策略同 chatcard.js cc-groups——IDB 是权威持久层，本地只是快照；
  // 反向场景 idbSet 偶尔失败而本地已最新时，IDB 数量更少 → 不覆盖，不会丢数据）。
  function attachIdbRestore(key, loadFn, mergeFn) {
    if (!window.idbGet) return;
    window.idbGet(window.activePrefix() + ':' + key).then(function (v) {
      if (v === undefined || v === null) return;
      try {
        const idbData = typeof v === 'string' ? JSON.parse(v) : v;
        if (!idbData || typeof idbData !== 'object' || Array.isArray(idbData)) return;
        if (!Array.isArray(idbData.questions) || !idbData.questions.length) return;
        const local = loadFn();
        const idbCnt = idbData.questions.length;
        const localCnt = Array.isArray(local.questions) ? local.questions.length : 0;
        if (idbCnt > localCnt) {
          // 以 IDB 为权威（含用户自定义），合并系统预设新增题后双写
          if (mergeFn) mergeFn(idbData);
          try { store.set(key, JSON.stringify(idbData)); } catch (e) {}
          try { window.refreshTaCardCounts(); } catch (e) {}
        }
      } catch (e) {}
    });
  }
  attachIdbRestore(KEY, taAskLoad, taAskMerge);
  attachIdbRestore(KEY2, tcLoad, tcMerge);
  attachIdbRestore(KEY3, tcuLoad, tcuMerge);
  attachIdbRestore(KEY4, trLoad, trMerge);
})();
