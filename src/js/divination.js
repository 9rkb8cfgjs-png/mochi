// ===== 功能：占卜（复刻星言完整版） =====
// 两种模式：塔罗（22 张大阿卡纳）/ 雷诺曼（40 张）
// 张数：1 / 3（过去·现在·未来）/ 7（完整牌阵）；牌面为矢量线条图标
(function () {
  const page = document.getElementById('page-divine');
  if (!page) return;

  let mode = 'tarot';
  let count = 3;
  const store = window.activeStore();

  // ---- 塔罗 22 张大阿卡纳（矢量图标 + 牌名 + 正逆位寓意 + 详细解读）----
  const TAROT = [
    { name: '愚人', icon: 'sun', pos: '新的开始，勇敢出发。', neg: '鲁莽行事，需三思。', detail: '天真无畏的开端。此刻最适合跟随直觉迈出第一步，别怕未知，路上自有风景与贵人。' },
    { name: '魔术师', icon: 'wand', pos: '掌握资源，心想事成。', neg: '空想多于行动。', detail: '你手中早已握有需要的资源与能力。把想法落到行动上，主动出击，一切皆可成。' },
    { name: '女祭司', icon: 'moon', pos: '直觉敏锐，静观其变。', neg: '忽视内心的声音。', detail: '答案不在表面，而在直觉与静默之中。慢下来倾听内心，你会知道该怎么做。' },
    { name: '皇后', icon: 'flower', pos: '丰盛滋养，温柔以待。', neg: '过度付出忽略自己。', detail: '温柔与丰盛正在靠近。好好照顾自己，也大方接纳身边的美好与爱意。' },
    { name: '皇帝', icon: 'crown', pos: '稳固掌控，责任担当。', neg: '固执己见，控制过强。', detail: '秩序与责任带来稳固。用理性掌控局面，你比想象中更有力量。' },
    { name: '教皇', icon: 'book', pos: '遵循传统，获得指引。', neg: '墨守成规，缺乏变通。', detail: '此时遵循经验与传统会更有帮助。向信任的人请教，会得到可靠的指引。' },
    { name: '恋人', icon: 'heart', pos: '选择与联结，心意相通。', neg: '摇摆不定，沟通受阻。', detail: '重要的选择与联结正在发生。诚实面对心意，彼此靠近才能走得更远。' },
    { name: '战车', icon: 'chariot', pos: '坚定前进，掌控方向。', neg: '失去方向，内耗拉扯。', detail: '方向已经明确，只管坚定向前。专注目标，别被路上的杂音分心。' },
    { name: '力量', icon: 'lion', pos: '温柔的力量，勇气在心。', neg: '缺乏自信，逞强硬撑。', detail: '真正的力量是温柔与耐心。以柔克刚，你能化解眼前的难题。' },
    { name: '隐士', icon: 'lamp', pos: '独处思考，寻找答案。', neg: '孤僻封闭，拒绝帮助。', detail: '独处的时光正是成长的养分。给自己一点安静，答案会自己浮现。' },
    { name: '命运之轮', icon: 'wheel', pos: '时来运转，顺势而行。', neg: '运势波动，随遇而安。', detail: '时机正在转动，顺势而为。抓住变化的窗口，好运悄然靠近。' },
    { name: '正义', icon: 'scales', pos: '公平公正，理性裁决。', neg: '偏见失衡，犹豫不决。', detail: '因果分明，公道自在人心。坦然面对决定，真实会被看见。' },
    { name: '倒吊人', icon: 'hanged', pos: '换个角度，暂停思考。', neg: '无谓牺牲，停滞不前。', detail: '换个角度看问题，也许困局另有出口。暂停不是放弃，是为了更好的出发。' },
    { name: '死神', icon: 'skull', pos: '结束与新生，翻篇向前。', neg: '抗拒改变，迟迟不放。', detail: '旧章已经翻过，新页正在展开。放下执念，改变会带来意想不到的礼物。' },
    { name: '节制', icon: 'cup', pos: '平衡调和，恰到好处。', neg: '失衡过度，缺乏节制。', detail: '一切讲究平衡。恰到好处的付出与等待，会让事情走向圆满。' },
    { name: '恶魔', icon: 'devil', pos: '看清执念，挣脱束缚。', neg: '深陷欲望，难以自拔。', detail: '看清什么在捆绑你。放下执念与贪求，你会发现自由其实唾手可得。' },
    { name: '高塔', icon: 'tower', pos: '突变的觉醒，打破僵局。', neg: '恐慌不安，逃避现实。', detail: '突如其来的变化带来清醒。打破旧结构，反而会开启真正的成长。' },
    { name: '星星', icon: 'star', pos: '希望之光，心愿可期。', neg: '信心受挫，暂时暗淡。', detail: '希望与心愿在远方发光。保持相信，你的愿望正在一步步靠近。' },
    { name: '月亮', icon: 'crescent', pos: '直觉与幻象，看清真相。', neg: '不安迷惘，被情绪困住。', detail: '真相藏在情绪与幻象之下。别急着下结论，看清之后再做决定。' },
    { name: '太阳', icon: 'sunny', pos: '光明坦途，喜悦丰收。', neg: '短暂的阴霾，乐观仍在。', detail: '光明坦荡，喜悦将至。大胆展示真实的自己，好运自会相迎。' },
    { name: '审判', icon: 'trumpet', pos: '觉醒重生，重要抉择。', neg: '悔恨自省，难以原谅。', detail: '觉醒的时刻到了。回望过去，原谅自己，然后带着清明重新出发。' },
    { name: '世界', icon: 'globe', pos: '圆满达成，新的循环。', neg: '功亏一篑，尚需收尾。', detail: '一段旅程圆满落幕。好好庆祝，也准备好迎接新的开始。' }
  ];
  const TAROT_ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    wand: '<path d="M12 2l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    flower: '<circle cx="12" cy="10" r="3"/><path d="M12 7V4M12 16v4M12 7a3 3 0 00-3-3M12 7a3 3 0 013-3M12 13a3 3 0 01-3 3M12 13a3 3 0 013 3"/>',
    crown: '<path d="M4 18h16M4 18l2-9 5 4 3-6 4 6 4-4 2 9"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
    heart: '<path d="M12 21s-7.5-4.7-9.3-9A5.3 5.3 0 0112 6.4a5.3 5.3 0 019.3 5.6c-1.8 4.3-9.3 9-9.3 9z"/>',
    chariot: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><path d="M5 7v6h14V7M7 13l-2 7M17 13l2 7M3 13h18"/>',
    lion: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    lamp: '<path d="M12 2l3 7-3 3-3-3z"/><path d="M12 12v8M8 20h8"/>',
    wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>',
    scales: '<path d="M12 3v18M5 21h14M8 7h8M4 11l4-2 2 6M20 11l-4-2-2 6"/>',
    hanged: '<circle cx="12" cy="5" r="2"/><path d="M12 7v10M12 17c-2 0-3-3-3-6M12 17c2 0 3-3 3-6"/>',
    skull: '<circle cx="12" cy="12" r="8"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><path d="M10 17h4"/>',
    cup: '<path d="M4 10h16v2a8 8 0 01-16 0z"/><path d="M4 10a8 8 0 0116 0"/>',
    devil: '<path d="M12 3l7 10.5a4.5 4.5 0 11-7.5 5L12 3z"/><path d="M8.5 15.5a2.5 2.5 0 002 4.5M12 9v6"/>',
    tower: '<path d="M12 2l3 10h-6zM9 12l-2 8h10l-2-8"/><path d="M12 15v3"/>',
    star: '<path d="M12 2l2.4 5 5.6.8-4 4 .9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-4 5.6-.8z"/>',
    crescent: '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/><path d="M12 8l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>',
    sunny: '<circle cx="12" cy="12" r="5"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3M3.5 3.5l2.1 2.1M18.4 18.4l2.1 2.1M3.5 20.5l2.1-2.1M18.4 5.6l2.1-2.1"/>',
    trumpet: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/><path d="M8 4c-1.5 2.5-1.5 13.5 0 16"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/>'
  };

  // ---- 雷诺曼 40 张（矢量图标 + 寓意 + 详细解读）----
  const LENO = [
    { name: '骑士', icon: 'horse', meaning: '迅速的行动与消息。', detail: '有消息正快速赶来，行动要快，机会不等人。' },
    { name: '四叶草', icon: 'clover', meaning: '小小的幸运与惊喜。', detail: '小小的幸运正在靠近，别错过手边的机会。' },
    { name: '船', icon: 'ship', meaning: '远行与旅程。', detail: '一段新的旅程或变动即将展开，走出去会有收获。' },
    { name: '房子', icon: 'house', meaning: '安稳的归属。', detail: '安稳与归属感，家和熟悉的环境给你力量。' },
    { name: '树', icon: 'tree', meaning: '成长与健康。', detail: '健康与成长，慢而稳地扎根，终会枝繁叶茂。' },
    { name: '云', icon: 'cloud', meaning: '暂时的迷雾与不确定。', detail: '眼前有些迷雾，等它散去再做决定也不迟。' },
    { name: '蛇', icon: 'snake', meaning: '潜在的考验与转折。', detail: '留意潜在的小转折，谨慎行事，别有疏漏。' },
    { name: '棺材', icon: 'coffin', meaning: '结束与新的开始。', detail: '结束即开始，清理旧物旧事，才能迎来新气象。' },
    { name: '花束', icon: 'bouquet', meaning: '美好与馈赠。', detail: '收到馈赠或美好，心情愉快，值得好好珍惜。' },
    { name: '镰刀', icon: 'scythe', meaning: '果断的切割。', detail: '果断切断消耗你的事物，干净利落反而轻松。' },
    { name: '鞭子', icon: 'whip', meaning: '反复与提醒。', detail: '反复出现的提醒，重视它，别一再绕开。' },
    { name: '鸟', icon: 'bird', meaning: '交谈与消息。', detail: '交谈与消息频繁，多沟通，信息里有答案。' },
    { name: '孩子', icon: 'child', meaning: '新生的开始。', detail: '一个全新的开始，保持天真，一切皆有可能。' },
    { name: '狐狸', icon: 'fox', meaning: '机智与谨慎。', detail: '多留个心眼，聪明应对，别轻信表面。' },
    { name: '熊', icon: 'bear', meaning: '力量与保护。', detail: '力量与守护，依靠坚定的后盾，大胆前行。' },
    { name: '星星', icon: 'star', meaning: '愿望与指引。', detail: '愿望有指引，许愿正当时，保持相信。' },
    { name: '鹤', icon: 'stork', meaning: '变化与喜讯。', detail: '好消息临近，变动带来喜讯，静候佳音。' },
    { name: '狗', icon: 'dog', meaning: '忠诚的陪伴。', detail: '忠诚与陪伴，可靠的朋友就在身边。' },
    { name: '塔', icon: 'tower', meaning: '独立与高度。', detail: '独立与高度，站得高看得远，格局打开。' },
    { name: '花园', icon: 'garden', meaning: '聚会与社交。', detail: '聚会与社交，人际往来会带来新机会。' },
    { name: '山', icon: 'mountain', meaning: '挑战与坚持。', detail: '前路有挑战，坚持就是胜利，翻过山就好。' },
    { name: '路口', icon: 'crossroad', meaning: '面临选择。', detail: '面临选择，倾听内心的声音，路在脚下。' },
    { name: '老鼠', icon: 'mouse', meaning: '细小的损耗。', detail: '细小损耗在发生，及时止损，别让小问题变大。' },
    { name: '心', icon: 'heart', meaning: '真挚的情感。', detail: '真挚的情感，感情上会有回应，大胆表达。' },
    { name: '戒指', icon: 'ring', meaning: '承诺与契约。', detail: '承诺与契约，重要关系更进一步，值得期待。' },
    { name: '信', icon: 'letter', meaning: '书面的消息。', detail: '书面消息将带来答案，留意来信与文字。' },
    { name: '书', icon: 'book', meaning: '知识或秘密。', detail: '知识或秘密，深入学习会有所得，也守好秘密。' },
    { name: '男人', icon: 'man', meaning: '一位重要的男性。', detail: '一位重要的男性将带来影响，留意他的态度。' },
    { name: '女人', icon: 'woman', meaning: '一位重要的女性。', detail: '一位重要的女性将带来影响，多听听她的看法。' },
    { name: '百合', icon: 'lily', meaning: '平静与纯净。', detail: '平静与纯净，心绪归宁，沉淀之后更清明。' },
    { name: '太阳', icon: 'sunny', meaning: '成功与光明。', detail: '成功与光明，事情终将明朗，全力以赴即可。' },
    { name: '月亮', icon: 'crescent', meaning: '直觉与情感。', detail: '直觉与情感，夜晚适合倾听内心，跟随感受。' },
    { name: '钥匙', icon: 'key', meaning: '答案与机会。', detail: '答案与机会就在手边，去开启它，别犹豫。' },
    { name: '鱼', icon: 'fish', meaning: '富足与资源。', detail: '富足与资源，财运转好，善用流动的机会。' },
    { name: '锚', icon: 'anchor', meaning: '稳定与安全。', detail: '稳定与安全，心有所系，根基牢固。' },
    { name: '十字架', icon: 'cross', meaning: '信念与考验。', detail: '信念受考验，坚持初心，熬过即是成长。' },
    { name: '灵体', icon: 'spirit', meaning: '直觉与灵感。', detail: '直觉与灵感增强，相信第六感，它会带路。' },
    { name: '香炉', icon: 'incense', meaning: '沉淀与净化。', detail: '沉淀与净化，清空杂念，轻装上阵。' },
    { name: '床', icon: 'bed', meaning: '休息与私密。', detail: '休息与私密，好好休整，睡眠也是疗愈。' },
    { name: '市场', icon: 'market', meaning: '交易与机会。', detail: '交易与机会，新的可能正在酝酿，值得一试。' }
  ];
  const LENO_ICONS = {
    horse: '<path d="M4 16l3-4 5 0 4-6 3 2-1 4 3 4M7 12l-3 2M4 18h3"/>',
    clover: '<line x1="12" y1="4" x2="12" y2="20"/><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><circle cx="12" cy="14" r="3"/>',
    ship: '<path d="M3 16h18l-3 5H6zM12 16V6M8 6h8"/>',
    house: '<path d="M4 20V9l8-6 8 6v11M9 20v-6h6v6"/>',
    tree: '<path d="M12 3l4 7h-2.5l3 6H12M12 3L8 10h2.5l-3 6H12"/><path d="M12 16v4"/>',
    cloud: '<path d="M17 19a4 4 0 000-8 5.5 5.5 0 00-11 1A3.5 3.5 0 006.5 19z"/>',
    snake: '<path d="M4 15s3-2 6 0 6 2 8 0M4 15l-1-3M20 15l1-3"/><circle cx="4" cy="19" r="1"/>',
    coffin: '<path d="M8 3h8l-1 18H9zM9 9h6"/>',
    bouquet: '<circle cx="12" cy="9" r="3"/><path d="M12 6V3M10 8l-3 1M14 8l3 1M12 12v8M8 17l2-1M16 17l-2-1"/>',
    scythe: '<path d="M4 20L14 10M14 10c4-1 6-3 6-6-3 0-5 2-6 6z"/>',
    whip: '<path d="M4 5h10M8 5l-1 14M4 9l4-4M18 5h2"/>',
    bird: '<path d="M3 14c3-5 15-5 18 0-3-1-15-1-18 0zM7 14l-2 4M17 14l2 4"/>',
    child: '<circle cx="12" cy="8" r="3"/><path d="M6 18c0-3 3-5 6-5s6 2 6 5"/>',
    fox: '<path d="M8 6l-2-2 2 3a4 4 0 016 0l2-3-2 2 1 2-1 6h-6z"/><path d="M10 15v2M14 15v2"/>',
    bear: '<circle cx="12" cy="10" r="6"/><circle cx="9" cy="8" r="1.5"/><circle cx="15" cy="8" r="1.5"/><path d="M12 14l-1 4M12 14l1 4"/>',
    star: '<path d="M12 2l2.4 5 5.6.8-4 4 .9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-4 5.6-.8z"/>',
    stork: '<path d="M12 3v18M12 6c-3 0-5 3-5 6 0 3 2 6 5 6M12 6c3 0 5 3 5 6 0 3-2 6-5 6"/><path d="M12 8v8"/>',
    dog: '<circle cx="9" cy="9" r="4"/><circle cx="15" cy="9" r="4"/><path d="M7 13l-2 8 4-3M17 13l2 8-4-3M9 13v5M15 13v5"/>',
    tower: '<path d="M9 3h6l-1 17h-4zM7 8h10"/>',
    garden: '<circle cx="8" cy="15" r="4"/><circle cx="16" cy="13" r="5"/><path d="M12 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>',
    mountain: '<path d="M3 20L10 6l4 8 3-5 4 11z"/>',
    crossroad: '<path d="M12 3v18M3 12h18"/><path d="M12 3l-3 3 3 3 3-3z"/>',
    mouse: '<path d="M6 12a6 6 0 0112 0v4H6zM9 12v-3M15 12v-3M6 16v3M18 16v3"/><circle cx="8" cy="10" r=".8"/><circle cx="16" cy="10" r=".8"/>',
    heart: '<path d="M12 21s-7.5-4.7-9.3-9A5.3 5.3 0 0112 6.4a5.3 5.3 0 019.3 5.6c-1.8 4.3-9.3 9-9.3 9z"/>',
    ring: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    letter: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 8l9 6 9-6"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
    man: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/>',
    woman: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/><path d="M12 2v2"/>',
    lily: '<path d="M12 3l-2 5 4 0zM12 8v10M10 18h4M12 12c-3 0-4 3-4 6h0c2 0 3-2 4-3 1 1 2 3 4 3h0c0-3-1-6-4-6z"/>',
    sunny: '<circle cx="12" cy="12" r="5"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3M3.5 3.5l2.1 2.1M18.4 18.4l2.1 2.1M3.5 20.5l2.1-2.1M18.4 5.6l2.1-2.1"/>',
    crescent: '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
    key: '<circle cx="7" cy="17" r="4"/><path d="M10 14L20 4M16 8l3 3"/>',
    fish: '<path d="M3 12c4-5 14-5 18 0-4 5-14 5-18 0z"/><path d="M14 12h6"/><circle cx="6" cy="12" r=".8"/>',
    anchor: '<circle cx="12" cy="4" r="2"/><path d="M12 6v14M5 12h14M8 20h8M12 6a8 8 0 01-4 6"/>',
    cross: '<path d="M12 3v18M5 12h14"/><circle cx="12" cy="12" r="8"/>',
    spirit: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    incense: '<path d="M12 3l1 3h-2zM12 6v6M9 18h6M10 21h4"/><path d="M12 12c-3 0-4 2-4 4h8c0-2-1-4-4-4z"/>',
    bed: '<path d="M3 18v-8h18v8M3 14h18M7 18v-4M17 18v-4"/><circle cx="7" cy="9" r="2"/>',
    market: '<path d="M4 5h16l-2 12H6zM9 5v3M15 5v3M6 17h12l1 3H5z"/>'
  };

  // 牌阵标签（星言 modeLabels）
  const MODE_LABELS = {
    tarot: { 1: ['运势'], 3: ['过去', '现在', '未来'] },
    lenormand: { 1: ['回复'], 3: ['回复 1', '回复 2', '回复 3'] }
  };
  // v3.5.53：牌库暴露给聊天页占卜半框复用
  window.__TAROT__ = TAROT;
  window.__LENO__ = LENO;
  window.__TAROT_ICONS__ = TAROT_ICONS;
  window.__LENO_ICONS__ = LENO_ICONS;
  window.__MODE_LABELS__ = MODE_LABELS;

  // 模式/张数切换
  const modesWrap = document.getElementById('div-modes');
  const countsWrap = document.getElementById('div-counts');
  if (modesWrap) {
    modesWrap.addEventListener('click', (e) => {
      const b = e.target.closest('.div-mode');
      if (!b) return;
      modesWrap.querySelectorAll('.div-mode').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      mode = b.dataset.mode;
      clearResult();
    });
  }
  if (countsWrap) {
    countsWrap.addEventListener('click', (e) => {
      const b = e.target.closest('.div-mode');
      if (!b) return;
      countsWrap.querySelectorAll('.div-mode').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      count = Number(b.dataset.count);
      clearResult();
    });
  }
  function clearResult() {
    const r = document.getElementById('div-result');
    if (r) r.innerHTML = '<div class="div-result-empty">点击下方按钮开始抽牌</div>';
  }

  function shuf(a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = b[i]; b[i] = b[j]; b[j] = t;
    }
    return b;
  }

  // ---- 综合解读（一句话总运势 + 问题呼应）----
  function partnerName2() {
    const n = storeName();
    return n ? n : '';
  }
  function storeName() { try { return store.get('lbl-partner') || ''; } catch (e) { return ''; } }
  function buildSummary(cards, mode, question) {
    let line = '';
    if (mode === 'tarot') {
      const revCount = cards.filter(c => c.rev).length;
      const posCount = cards.length - revCount;
      if (revCount === 0) line = '牌面全数正位，气运正盛。近期的选择与努力大多会得到回报，可以大胆前行。';
      else if (posCount === 0) line = '牌面全数逆位，眼下更需要稳住心神。放缓节奏、少做重大决定，等迷雾散去再做打算。';
      else if (posCount > revCount) line = '牌面整体偏正，虽有波折但大势向好。把握核心目标，好运正在靠近。';
      else line = '牌面正逆交织，前路有起伏。越是这种时候，越要回到自己的节奏里，稳稳走好每一步。';
    } else {
      line = cards.map(c => '「' + c.name + '」' + c.meaning).join(' ');
    }
    if (question) {
      line += '就你问的「' + question + '」：' + (mode === 'tarot'
        ? '顺着牌面的大势走，答案会在合适的时候到来。'
        : '保持开放的心态，答案往往在行动中显现。');
    }
    return line;
  }
  // ---- 占卜记录（保存全部历史；IndexedDB 权威，localStorage 快照） ----
  // v3.6.x：恢复窗口保护——IDB 权威恢复完成前不落盘，防止用空数组覆盖
  // IndexedDB 里的全部历史（历史超 200KB 只存 IDB，恢复完成前 store.get 读到
  // 空数组，直接写会丢历史）。暂存待写，恢复完成后与 IDB 合并去重再写入。
  let histReady = false;
  let histPending = null;
  function histLoad() {
    let list = [];
    try { list = JSON.parse(store.get('divine-history') || '[]'); } catch (e) { list = []; }
    // 旧版本裸键迁移（v3.5.92 前历史存无前缀键，一次性搬入适配层）
    // v3.6.x：迁移写入走 histSave（带恢复窗口保护），避免迁移期间覆盖 IDB 权威历史
    if (!Array.isArray(list) || !list.length) {
      try { list = JSON.parse(localStorage.getItem('divine-history') || '[]'); } catch (e) { list = []; }
      if (Array.isArray(list) && list.length) histSave(list);
    }
    return Array.isArray(list) ? list : [];
  }
  function histSave(list) {
    const data = JSON.stringify(list);
    if (!histReady) {
      try { histPending = Array.isArray(list) ? list.slice() : []; } catch (e) {}
      return;
    }
    try { store.set('divine-history', data); } catch (e) {}
  }
  // 恢复完成后：合并恢复窗口内暂存的抽牌记录（按 ts 去重），再落盘 + 重绘
  function flushPendingHist() {
    if (!histPending) return;
    const pending = histPending;
    histPending = null;
    if (!pending.length) return;
    const finish = (base) => {
      try { store.set('divine-history', JSON.stringify(base)); } catch (e) {}
      try { renderHistory(); } catch (e) {}
    };
    const merge = (base) => {
      const have = {};
      base.forEach(x => { if (x && x.ts !== undefined) have[x.ts] = true; });
      pending.forEach(x => { if (x && x.ts !== undefined && !have[x.ts]) { base.push(x); have[x.ts] = true; } });
      finish(base);
    };
    if (window.idbGet) {
      window.idbGet('xy-home-v2:divine-history').then(v => {
        let base = [];
        try { const p = typeof v === 'string' ? JSON.parse(v) : v; if (Array.isArray(p)) base = p; } catch (e) {}
        merge(base);
      }).catch(() => merge(histLoad()));
    } else {
      merge(histLoad());
    }
  }
  try {
    document.addEventListener('mochi-restore-done', function () {
      histReady = true;
      flushPendingHist();
    });
  } catch (e) {}
  function fmtDT(ts) {
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function renderHistory() {
    const el = document.getElementById('div-history');
    if (!el) return;
    const list = histLoad();
    el.innerHTML = list.length
      ? '<div class="div-label">占卜记录</div>' + list.map((h, i) =>
          '<div class="div-h-item" data-hi="' + i + '">' +
          '<div class="div-h-main"><div class="div-h-title">' + (h.mode === 'tarot' ? '塔罗' : '雷诺曼') + ' · ' + h.count + ' 张' +
          (h.question ? ' · 问：' + String(h.question).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '') + '</div>' +
          '<div class="div-h-sub">' + fmtDT(h.ts) + ' · ' + (Array.isArray(h.cards) ? h.cards.map(c => ((c && c.name) || '') + (c && c.rev ? '(逆)' : '')).join('、') : '') + '</div></div>' +
          '<button class="div-h-view" data-hi="' + i + '">查看</button>' +
          '<button class="div-h-del" data-hi="' + i + '">✕</button>' +
          '</div>').join('')
      : '';
    el.querySelectorAll('.div-h-view').forEach(b => b.addEventListener('click', () => {
      const h = histLoad()[parseInt(b.dataset.hi, 10)];
      if (h && Array.isArray(h.cards)) renderDrawResult(h.cards, h.mode, h.question, h.summary);
    }));
    el.querySelectorAll('.div-h-del').forEach(b => b.addEventListener('click', () => {
      const list = histLoad();
      list.splice(parseInt(b.dataset.hi, 10), 1);
      histSave(list);
      renderHistory();
    }));
  }
  // 渲染抽牌结果（灰底正方形牌面 + 动画、综合解读、发送按钮）
  function renderDrawResult(cards, m, question, summary) {
    const r = document.getElementById('div-result');
    if (!r) return;
    const icons = m === 'tarot' ? TAROT_ICONS : LENO_ICONS;
    const labels = (MODE_LABELS[m] && MODE_LABELS[m][cards.length]) || [];
    let html = '<div class="div-spread">';
    cards.forEach((c, i) => {
      html += '<div class="div-mini' + (cards.length === 1 ? ' div-mini-single' : '') + '" style="animation-delay:' + (i * 120) + 'ms">' +
        (labels[i] ? '<div class="div-mini-tag">' + labels[i] + '</div>' : '') +
        '<div class="div-card-face">' +
          '<div class="div-card-ico">' + icons[c.icon] + '</div>' +
          '<div class="div-card-name">' + (c.rev ? c.name + '（逆）' : c.name) + '</div>' +
        '</div>' +
        '<div class="div-card-meaning">' + c.meaning + '</div>' +
        '</div>';
    });
    html += '</div>';
    html += '<div class="div-summary">' + summary + '</div>';
    if (question) html += '<div class="div-question-q">问：' + String(question).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</div>';
    html += '<button class="div-send-btn" id="div-send-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-3px;margin-right:6px"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>把占卜结果发给 ' + (partnerName2() || 'TA') + '</button>';
    r.innerHTML = html;
    const sendBtn = document.getElementById('div-send-btn');
    if (sendBtn) sendBtn.addEventListener('click', () => sendToChat(m, cards, summary, question));
  }
  function sendToChat(m, cards, summary, question) {
    const modeTxt = m === 'tarot' ? '塔罗' : '雷诺曼';
    let text = '🔮 占卜 · ' + modeTxt + ' ' + cards.length + ' 张\n';
    cards.forEach((c, i) => {
      const labels = (MODE_LABELS[m] && MODE_LABELS[m][cards.length]) || [];
      text += '【' + (labels[i] || ('位置' + (i + 1))) + '】' + c.name + (c.rev ? '（逆）' : '') + '：' + c.meaning + '\n';
    });
    text += '综合：' + summary;
    if (window.chatSendMsg) { window.chatSendMsg(text); toast('已发送给 ' + (partnerName2() || 'TA')); }
    else toast('请先进入聊天页');
  }
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }

  // 抽牌
  const drawBtn = document.getElementById('div-draw');
  let drawTimer = null;
  if (drawBtn) {
    drawBtn.addEventListener('click', () => {
      const r = document.getElementById('div-result');
      if (!r) return;
      // v3.5.130：连点守卫——旧轮未完成则取消，避免重复记录/结果错乱
      if (drawTimer) clearTimeout(drawTimer);
      const question = ((document.getElementById('div-question') || {}).value || '').trim();
      // v3.5.130：快照点击时的模式/张数——900ms 内切换设置不再影响本次结果
      const snapMode = mode, snapCount = count;
      // 洗牌动画：先显示洗牌中，再翻出结果
      r.innerHTML = '<div class="div-result-empty">🔮 洗牌中…</div>';
      drawTimer = setTimeout(() => {
        drawTimer = null;
        const deck = snapMode === 'tarot' ? TAROT : LENO;
        const labels = (MODE_LABELS[snapMode] && MODE_LABELS[snapMode][snapCount]) || [];
        const cards = shuf(deck).slice(0, snapCount).map(c => {
          const out = { name: c.name, icon: c.icon, rev: false, meaning: c.meaning, detail: c.detail || '' };
          if (snapMode === 'tarot') {
            out.rev = Math.random() > 0.5;
            out.meaning = out.rev ? c.neg : c.pos;
          }
          return out;
        });
        const summary = buildSummary(cards, snapMode, question);
        renderDrawResult(cards, snapMode, question, summary);
        // 保存记录
        const list = histLoad();
        list.unshift({ ts: Date.now(), mode: snapMode, count: snapCount, question: question, cards: cards, summary: summary });
        histSave(list);
        renderHistory();
      }, 900);
    });
  }

  // 桌面【占卜】图标进入
  const divApp = document.querySelector('.app[data-app="divination"]');
  if (divApp && page) {
    divApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      page.hidden = false;
    });
  }
  const divBack = document.getElementById('div-back');
  if (divBack) {
    divBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const phonePage = document.getElementById('page-phone');
      if (phonePage) phonePage.hidden = false;
    });
  }
})();
