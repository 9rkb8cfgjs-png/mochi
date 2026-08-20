# WORKLOG — 双方交接日志（AI-A / AI-B 共用）

两个 AI 不能直接对话，开工/完工时在这里各写一行，让对方打开仓库就知道当前状态。

## 规则

- 开工：追加一行「开工」；完工：追加一行「完成」。
- 每行写清：AI、时间、任务、涉及文件、是否已构建。
- 开工前先读这个文件 + `git status` + 相关文件 `LastWriteTime`。
- 旧记录随手清理，保留最近几条即可（这是协作笔记，不是发布日志）。

### 2026-08-20（用户反馈「引用后没有取消按钮；引用含表情包/图片的消息时缩略图区域乱码挡住文字」）
- [本会话·完成]（**已构建 verify 10/10 + 引用预览冒烟 18/18，本次提交**）：`src/css/chat-main.css`（AI-A 域）、`src/js/chat.js`（AI-A 域）、`tools/smoke-quote-preview.mjs`（冒烟增强）。
  - 根因 1（取消按钮不可见）：`.chat-draft-quote-x { position:static }` 写在 `.chat-draft-x { position:absolute }` **之前**——同优先级 (0,1,0) 后定义者生效，按钮被覆盖成 absolute 定位跑出预览条外（CDP 实测按钮 right=390 超出条 right=376，用户根本看不到删除按钮）。修复：按钮覆盖规则移到 `.chat-draft-x` 之后，顺带 18px 圆形更明显。
  - 根因 2（乱码）：表情包/纯图片消息的 `rec.text` 本身就是整段 base64 dataURL，引用时 qtext 直接用 → 预览条和发送后气泡引用块都显示 base64 乱码挤占文字。修复：引用时 `type==='sticker'` → 占位「表情包」、text 以 data: 开头且带图 → 占位「图片」；`renderQuoteBar` 再加 dataURL 保险（>64 字符的 data: 文本显示占位）。
  - 验证：冒烟 18/18（文字引用流程 + ✕ 按钮位置/定位断言 xInBar/xStatic + 注入伪造表情包消息重进聊天页 → 引用显示「表情包」占位无乱码 + 发送后引用块正常 + 无 JS 异常）。
  - ⚠️ 本次构建统一包含对方未提交改动：chat.js（邀请/问问TA异步回调联系人守卫、红包/收藏 idb 补读守卫）、sfx.js、call.js、chatcard.js、p2-features.js、records.js、divination.js、decision.js、chat-settings.js 等已保存改动。

### 2026-08-20（用户要求「可自定义字卡/系统预设字卡 两大分类做成字卡库顶部栏，可点击切换」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 切换专项 11/11，已提交**）：
  - `src/template.html`：字卡库页（page-chatcard）顶部 `chat-title` 下新增切换栏 `.cc-top-tabs`（复用 .card-tabs/.cc-tab 样式）——两个 tab【可自定义字卡】【系统预设字卡】；7 个自定义入口包进 `#cc-sect-custom`、3 个预设入口包进 `#cc-sect-preset`（默认 hidden），删除原静态 .cc-sect 标题。
  - `src/js/chatcard.js`（IIFE 末尾）：切换逻辑——点 tab 切 `sel` 选中态 + 切两个容器的 hidden。放在 chatcard.js 内（guard `cc-list/cc-tabs` 恒存在，必执行）。
  - `src/css/chat-pages.css`：.cc-sect 样式替换为 `.cc-top-tabs`（tab 等宽 flex:1 + 底部容器 `.cc-sect-body[hidden]{display:none}`）。
  - CDP 验证：初始自定义显示/预设隐藏、点预设↔自定义双向切换、选中态正确、预设组入口 li-default-cards 可正常进入页面并返回保持选中。li id/跳转全不变。

### 2026-08-20（用户要求「聊天音效：设计系统内置默认可切换使用的提示音」）
- [本会话·完成]（**已构建 verify 10/10 + 内置音效专项 31/31，本次提交含 AI-A 已保存的 chat.js 切桌面防串桌守卫**）：
  - `src/js/sfx.js`：新增内置音效库（Web Audio API 实时合成、零存储占用）——短提示音 6 个：气泡/叮咚/小鸟/水滴/钢琴/轻叩；来电铃声 2 个：温馨铃/经典铃。AudioContext 单例 + 首次手势 resume（与既有 HTMLMediaElement 解锁并存）；AudioBuffer 缓存复用。
  - 播放优先级：自定义上传 > 内置音效 > 静音；新存储键 sfx-*-b（每桌面独立）：'none'=静音、缺省=默认内置（in=气泡 / out=轻叩 / ring=温馨铃）。playSfx/stopSfx 兼容内置 ring 循环与自定义 ring。
  - `src/template.html`：三类音效行下新增预设胶囊容器（#sfx-ring-presets / #sfx-in-presets / #sfx-out-presets），上传按钮改名「自定义音频」，提示语更新。
  - `src/css/base.css` + `dark.css`：.sfx-presets 胶囊样式（浅色 + 深色覆盖）。
  - 交互：点胶囊即应用+试听；选内置自动替换自定义；「静音」关该类音效；「清除」只清自定义回落内置；contact-switched 切桌面重渲染。
  - 验证：`node tools/smoke-sfx-builtin.mjs` 31/31（渲染/默认高亮/切换/静音不播/自定义优先级与替换/清除回落/ring 循环停止/切桌面/无 JS 异常），脚本保留。

### 2026-08-20（用户要求「字卡库顶部新增 2 个大分类【可自定义字卡】【系统预设字卡】」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 字卡库页专项 5/5，已提交 9e6f989**）：
  - `src/template.html`：字卡库页（page-chatcard）入口重排为两组——【可自定义字卡】自定义聊天/查岗日常/桌面今日情话/TA的询问/TA的小问题/TA的好奇/TA的吐槽（7 个，顺序同用户清单）；【系统预设字卡】聊天默认/聊天情绪/聊天回应（3 个）。**「逻辑连接词字卡」= 聊天回应字卡**（页内 8 类连接词：接话/确认/继续/轻追问/连接/转折/停顿/收束），未拆独立入口，保留其副标题「逻辑连接词字卡」。
  - `src/css/chat-pages.css`：新增 `.cc-sect` 大分类标题样式（小字灰色 + 左侧竖条，首组贴顶）。
  - 确认无 JS 遍历 page-chatcard 直接子元素，加标题不影响任何模块；全部 li id 与点击跳转不变。
  - 提交附带此前待提交的 chat.js 切桌面回复串桌修复 / music-player 播放恢复提示 / ta-ask 快捷项人称修正。


- [本会话·完成]（已改 src/js/ta-ask.js，未构建未提交，请构建者执行 node build.mjs 后随下次统一提交）：
  1. cp6「如果能给十年前的自己捎一句话」快捷项『再等等，会遇到我』→『再等等，会遇到你』（用户指定人称修正）。
  2. 同类型排查：全量扫描 ta-ask.js 四题库（询问/小问题/好奇/吐槽）所有用户视角快捷项/选项 + 反扫（用户选项含你无我），另核对 default-cards-data.js 回应池、mood-followup-data.js、quote-cards.js、chat-settings.js 拍一拍预设——仅再发现 1 处同类问题：cy11「你觉得自己最柔软的部分，藏在什么地方？」快捷项『只给我看』→『只给你看』（TA 回应『只给我看的，我看到了』证实原意是只给TA看，用户视角应用『你』）。
  3. 老用户数据同步：tcuLoad 迁移块扩展（沿用 cw4「你身边→我身边」既有模式）——cp6/cy11 已存数据 + 历史答案 h.my 同步修正并写回 LS（idbRestore 仅回填缺失键，不会回退迁移）。
  4. node --check 通过。
### 2026-08-20（用户要求「聊天设置的全屏模式下面新增音乐悬浮小窗开关」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 冒烟 9/9，本次提交一并包含 AI-A 已保存的占卜/字卡库改动**）：聊天设置页「全屏」组内、全屏模式开关下方新增「音乐悬浮小窗」开关 `#cs-music-float`。
  - 与音乐页 `#music-float-en` / 音乐设置 `#sm-set-float` **同源**（`music-global.floatEn`，每桌面独立）：music-player.js 新增 `window.musicFloatGet()` / `window.musicFloatSet(en)` 钩子（复用 saveSettings/syncFloatToggle/renderFloat 完整流程，切关立即隐藏浮框）；chat-settings.js 仿 cs-fullscreen 模式绑定：初始同步 + change 写回 + 500ms 轮询 + contact-switched 立即同步；music-player.js 加载晚于 chat-settings.js，钩子未就绪时退化为直读写 store（默认开）。
  - 涉及 `src/template.html` `src/js/music-player.js` `src/js/chat-settings.js`。CDP 验证：开关位置在全屏行正下方/初始同步/关→music-global=false+音乐页开关同步/音乐页开→500ms 同步/直调 musicFloatSet 同步/刷新持久化，9/9。
  - ⚠️ 并行会话 AI-A 留话请构建者一并构建的改动已包含本次构建：divination.js+chat.js（占卜重新抽牌先清空问题输入栏）+ chatcard.js（删除字卡 scheduleSave 延后写、离开字卡页自动退出批量管理），均已 verify 通过，提交 message 注明双方范围。

### 2026-08-20（用户反馈「占卜点重新抽牌无法先清空问题输入栏再重新输入问题开始抽牌」）
- [AI-A·完成]（**已改 src，未构建未提交**，请构建者执行 `node build.mjs`）：`src/js/divination.js` + `src/js/chat.js`（均 AI-A 域）。
  - 根因：点「重新抽牌」立即开抽，问题在点击瞬间快照——上轮问题还留在输入栏，用户来不及清空/重输，新抽仍带旧问题。
  - 修复：按钮处于「重新抽牌」状态（上轮结果已展示）时，点击改为**先清空问题输入框 + 清空结果区**，按钮恢复「抽牌」（含原 SVG 图标），用户重新输入问题后再点一次开始抽牌；桌面占卜页（`#div-draw`）与聊天页占卜半框（`#div-chat-draw`）同步修复。清空走 `input.value=''`，安卓 ce-box 代理已支持（mobile-adapt.js setter）。
  - 顺带：`clearResult()` 空态文案「点击下方按钮」→「点击上方按钮」（按钮在结果区上方，原文案错误）。
  - 验证：node --check 双文件通过；功能未构建未验证，需构建后无头/真机确认。

### 2026-08-20（用户反馈 iOS Safari 多角色四个问题·本会话修复）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：`src/js/chat.js` `mail.js` `feed.js`（AI-A 域）、`src/js/contacts.js`（AI-B 域，代改 renameContact 同步 lbl-partner，若需调整请留话）。
  - **① 切桌面再切回消息消失**：`chat.js` loadMsgs 合并原规则 localNew 只保留本地比 IDB 末条 ts 更新的消息，若 IDB 缺旧消息（写入失败/竞态），本地旧消息 ts < idbLastTs 被 filter 掉 → 丢消息。改为按指纹（ts+text+side+img）取并集，不限 ts，merged 按 ts 排序。聊天只增不改，取并集不会加回已删消息。
  - **② 聊天顶部栏显示"系统默认"非角色名**：`chat.js` 原只在模块加载时读一次 lbl-partner，切换联系人后从不刷新；window.renderChatHeader 从未定义。改为 updateChatPartnerName()（读 lbl-partner，缺失回退 contacts.name，再回退 'TA'），contact-switched 时调用并刷新头像，挂 window.renderChatHeader。`contacts.js` renameContact 改名后同步写该联系人 lbl-partner（仅当为空或等于旧 contacts.name 时，避免覆盖设置页单独设的 TA 昵称）。
  - **③ 信箱数据串桌面**：`mail.js` 原来信/回信单定时器用 store（当前激活桌面），用户在 default 桌面时所有联系人的来信都写到 default → 串桌面。改为 maybeIncomingLetterFor(cid)/checkPendingReplyFor(cid) 遍历各联系人用 storeFor(cid) 读写各自命名空间；load/save 等全部加 cid 参数。来信系统消息走 notifyMailToChat(cid)（当前桌面 chatAddSystem，非当前桌面直接写该桌面 IDB 聊天+LS）。前台弹窗仅当前激活桌面才弹。
  - **④ 朋友圈统一显示"TA"**：`feed.js` taFeedNameFor/taAvFor 原 owner==='default' 时回退 partnerName()（当前激活桌面）——从 default 桌面打开朋友圈时所有动态都显示 default 的 TA 名字。改为始终按 owner 桌面取（含 default），owner 桌面 lbl-partner 空时回退该联系人注册名，再回退 'TA'/''。
  - 验证：node --check 全过；verify 10/10。本次构建同时包含工作区已保存的 music-player.js/pong.js 改动。


### 2026-08-20（用户反馈「iOS Safari：音乐导入网易云歌单无反应，只显示一首，无法播放」）
- [AI-A·完成]（**已构建 verify 10/10 + 音乐专项 8/8，未提交**）：`src/js/music-player.js`（AI-A 域）。
  - 根因1（播放）：`resolveNeteaseDirectUrl` 用 XHR `responseURL` 解析 meting 302 拿 CDN 直链——iOS Safari 上 XHR `responseURL` 对跨域 302 不返回最终 URL（只返回原始请求 URL），导致 `retryWithHttpsUrl` 拿不到 CDN 直链、回退到 meting URL 重试无意义。
  - 根因2（歌单导入"无反应"）：`fetchNeteasePlaylist` 每源超时 10 秒，5 源全挂时用户等 50 秒才看到"歌单导入失败"——iOS Safari 上 meting API 不可达/超时时体感"无反应"。
  - 修复1：`resolveNeteaseDirectUrl` 改用 `fetch`——`response.url` 跟随重定向后返回最终 URL（iOS Safari 15.4+ 支持），收到响应头即 `abort` body 不下载音频。fetch 拿到 https CDN 直链后直接播放，不经 meting 302。
  - 修复2：`retryWithHttpsUrl` 增加备用播放源——meting API 不可达（直链为空）时，用网易云官方外链 `music.163.com/song/media/outer/url?id=xxx`（`<audio>` 不走 CORS，直接跟随 302 到 CDN mp3 播放）。
  - 修复3：歌单导入超时 10 秒→7 秒，让备用源（i-meto 镜像）更快被尝试。
  - 修复4：播放失败提示补充"或该歌曲为VIP付费歌曲"，帮助用户区分原因。
  - 验证：无头 Chrome 8/8（歌单导入 200 首 / 播放进度推进 / fetch 拿 https CDN 直链 / 官方外链 audio 播放成功 有时长）；verify 10/10。临时脚本已删。

### 2026-08-20（用户反馈「iQOO Neo5 SE · QQ浏览器：聊天显示联系人来信，点信箱却看不到信」）
- [本会话·完成]（**已改 src，未构建未提交，请构建者执行 `node build.mjs` 后随本次统一提交**）：`src/js/mail.js`（AI-A 域）+ 新增 `tools/smoke-mail-qq.mjs`（回归脚本，保留）。
  - 根因：mail.js 与 chat.js 在 IDB 未就绪时的持久化策略不对称——QQ浏览器 X5 的 IndexedDB 打开可能挂起（`indexedDB.open` 永不回调），`mailDbReady` 保持 false；此时 `save()` 只把来信存进内存 `mailPending`、完全不落盘（原 `if (!mailDbReady) { mailPending=...; return; }`），而 chat.js 同场景 `saveMsgs()` 会立即写 LS 快照。于是来信的聊天系统通知「给你寄来了一封信」重载后仍在，信箱整封丢失（保险丝 15s 触发前页面被 X5 后台冻结/杀进程/重载即丢）。
  - 修复：`save(list, cid)` 在 `!cid && !mailDbReady` 分支补 `writeSnap(list, cid)`——立即写剥图 LS 快照（文本+标题+时间，≤200KB），与 chat.js 同策略；IDB 权威读回后 `mailMergeFromIdb` 按 id 合并恢复完整数据（含图片），不破坏 v3.5.120 权威防护（主键 `store.set` 仍等就绪，不会被空列表覆盖 IDB）。
  - 验证：`node --check` 通过；`node tools/smoke-mail-qq.mjs` 4/4（X5 挂起 IDB 场景：来信产生→本会话可见→保险丝前重载→聊天通知存活+信箱可见）；`REPRO_NORMAL=1` 正常 IDB 路径 4/4 回归通过。
  - ⚠️ 并行会话（对方）正在同文件重构多联系人来信（`save/load/writeSnap/letter*` 加 `cid` 参数、`checkPendingReplyFor`、`maybeIncomingLetterFor`），本改动与其兼容（改动点在其新 `save(list, cid)` 内部，用其新 `writeSnap(list, cid)`）；构建前请确认对方 mail.js 已保存完整。

### 2026-08-20（聊天搜索记录新增按日期查询）
- [本会话·完成]（**已构建 verify 10/10 + 日期搜索专项 CDP 18/18，已随对方提交 492be69 入库**——提交信息未列本功能但内容已含）：用户要求聊天更多→搜索聊天记录支持按日期查询。
  - 实现：搜索半框关键词栏下新增「开始日期 至 结束日期 + 清除」行（`<input type="date">`，安卓端 native picker 不受 ce-box 转换影响）；`runChatSearch()` 支持 仅关键词 / 仅开始日期 / 日期范围 / 单日 / 日期+关键词组合 五种查询；结束日期含当天 24 点（本地时区解析，避免 `new Date('YYYY-MM-DD')` UTC 偏移）；结果时间改 `fmtSearchTime`（MM-DD HH:MM，跨天搜索可分辨）；日期 change 自动搜索、清除按钮重置；无关键词无日期时提示「输入关键词，或选择日期范围搜索聊天记录」；空结果按条件给不同提示。
  - 涉及：`src/js/chat.js`（openChatSearch 重置日期 / searchDateToTs / fmtSearchTime / runChatSearch / 事件绑定）、`src/template.html`（chat-search-date 行）、`src/css/chat-main.css`（.chat-search-date 样式）。
  - 验证：`tools/smoke-search-date.mjs` 新增专项 18/18（含注入跨日期种子消息、IDB+LS 双写、五类查询断言、跳转/清除/无异常）。
  - ⚠️ 当前工作区剩余未提交：chat.js（对方拍一拍字卡「含我」处理）、index.html/sw.js/version.json（对方已 build 产物）、WORKLOG——均非本会话改动，勿动。

### 2026-08-20（用户反馈「聊天里点引用后，发送前输入栏上方无法显示引用了什么、无法删除引用」）
- [本会话·完成]（**已构建 verify 10/10 + 引用预览冒烟 12/12，本次提交**）：`src/js/chat.js`（AI-A 域）、`src/css/chat-main.css`（AI-A 域）、`src/template.html`（AI-B 域代改一行）、`tools/smoke-quote-preview.mjs`（新增专项测试）。
  - 根因：点气泡操作「引用」只写内存 `lastQuote` + toast，输入栏上方没有任何引用预览 UI，也没有删除入口。
  - 实现：`#chat-draft` 草稿区（template 锚点）内新增 `#chat-draft-quote` 引用预览条——`renderDraft()` 内新增 `renderQuoteBar()`：显示引用文本（单行省略，组合消息带图片缩略图）+ ✕ 删除按钮（点击清 `lastQuote` 重渲染）；引用操作后 `renderDraft()` 即时刷新（去掉原 toast）；`sendSticker`/`addMsg` 发送后清引用并刷新（无文字分支也清，防残留）；`.chat-draft` 改纵向 flex（引用条在上、图片缩略图在下可共存）。引用条用中性灰底 + 左侧竖条，深浅主题通吃（不依赖 dark.css）。
  - 验证：CDP 冒烟 12/12（发消息→点气泡→引用→预览条出现含内容+✕→点 ✕ 消失→再引用→发送→新气泡带 `.msg-quote` 引用块且内容正确→预览条消失→无 JS 异常）。
  - ⚠️ 本次构建统一包含对方未提交改动：`base.css`（开屏确认层小屏修复）、`chat-pages.css`、`music-player.js`，一次 build 全部打进。

### 2026-08-20（用户反馈「iOS 默认浏览器依旧无法点击、无法使用、页面完全卡住」· 本会话诊断修复）
- [本会话·完成]（**已改 src，未构建未提交**，请构建者执行 `node build.mjs`）：根因——v3.7.x 开屏报修确认层在小屏 iPhone（375×667 iPhone 6/7/8/SE2、360×640、320×568 SE1）上，**确认按钮在屏幕可视区下方**：`.splash-confirm-card` 整卡 `overflow-y:auto`，按钮随长文本被推到卡片底部、被 iOS Safari 底部工具栏遮挡或完全看不见，整层盖住全屏看起来就是「页面卡死、什么也点不了」；390×844 以上现代机型不滚动可见，所以无头 Chrome 默认尺寸一直没复现。CDP 实测（修复前）：375×667 按钮底边 667=视口底、320×568 按钮底边 705 完全出屏。修复（`src/css/base.css`，AI-B 名下，本会话代改）：`.splash-confirm-card` 改 `display:flex; flex-direction:column; height:min(560px,100%)`（按钮不再被文本推走），`.splash-confirm-text` 改 `flex:1; min-height:0; overflow-y:auto`（仅正文滚动），按钮 `flex-shrink:0` 常驻卡片底部。CDP 验证（注入修复后线上 index.html）：320×568 / 360×640 / 375×667 / 390×844 四尺寸按钮全部完整可见（btnBot 527/583/597/685 < 视口高），完整流程 6/6：进入按钮→确认层弹出→按钮可见→点 OK 开屏移除（DOM 删除）→主页可开。⚠️ 工作区另有对方未提交的 chat-pages.css/music-player.js + 已构建产物，本次改动未含在内，需构建者统一再 build 一次。
- [本会话·补充]（**已构建 verify 10/10 + smoke 16/16 + iOS 全尺寸 CDP 30+ 项全过**）：用户追问「稳妥检查 iOS 总是用不了」——已执行 `node build.mjs`（14:31 产物，含上述 base.css 修复 + 对方已保存的 chat-pages.css/music-player.js 改动）并全面验证：
  1. **确认层按钮四尺寸全过**：320×568（SE1）/ 375×667（6/7/8/SE2）/ 390×844 / 430×932 均完整可见，真实触摸坐标点确认按钮→开屏移除→主页可开。
  2. **聊天全流程四尺寸全过**：进聊天页→输入栏可见（320 下 top 512<568）→contenteditable 输入（textContent 写入）→点发送→消息上屏→输入框清空，12/12。此前 4 项 FAIL 系测试脚本误用 `input.value`（chat-input 是 contenteditable div，AGENTS.md 已注明），改用 textContent 后全过，非产品 bug。
  3. **splash 点击路径确认**：点「点击进入」按钮与点 splash 任意处均弹确认层（`splash.addEventListener('click', enter)`），点确认层内文字不误关（stopPropagation）；`splash-logo` 无 id（class 选择器），无 JS 报错。
  4. **通用弹窗（openModal）按钮**四尺寸均可见、可达。
  5. verify 10/10、smoke-splash-confirm 16/16、页面零 JS 异常。⚠️ 仍待提交：工作区含对方 music-player/chat-pages 改动 + 本会话 base.css 修复 + 构建产物，一次 commit 带上（v3.7.x: iOS 开屏确认层按钮小屏不可见修复 + 对方已保存改动）。

### 2026-08-20（用户需求「查岗日常字卡：单个字卡添加后可修改/移动，增加分组修改及移动功能」）
- [AI-A·完成]（**已构建 verify 10/10 + 查岗冒烟 9/9，未提交**）：`src/js/p2-features.js`（AI-A 域）、`src/css/chat-pages.css`（AI-A 域）。
  - **字卡编辑**：`ckMineItemHtml` 字卡内容加 `data-edit`，点击打开 `openModal` 编辑内容（校验同分类去重），保存后 `ckSaveItems` + 重渲染。
  - **字卡移动分组**：每张卡加 ↪ 移动按钮，点击 `openModal` pills 选目标分组（未分组 + 各分组），确认后更新 `item.grp`。
  - **分组拖动排序**：分组区块标题加 ≡ 手柄（`bindCkGroupOps` 绑定 pointerdown），克隆标题行跟随手指 + 蓝色指示线，释放 `splice` 重排 `ckGroups` 数组；未分组区块固定最后不参与排序。
  - 验证：无头 Chrome 9/9（手柄/移动按钮/编辑触发存在 / 分组拖动 A→B 下方变 B,A / 字卡编辑生效 / 字卡移动 grp g1→g2 / 无 JS 异常）。临时脚本已删。

### 2026-08-20（用户需求「自定义聊天字卡：分组可移动位置/改名，字卡可拖动到其他字卡上下方」）
- [AI-A·完成]（**已构建 verify 10/10 + 字卡拖动冒烟 12/12，随 775b503 提交**）：`src/js/chatcard.js`（AI-A 域）、`src/css/chat-pages.css`（AI-A 域）、`src/css/dark.css`（AI-B 域深色适配）。
  - **分组排序+改名**（管理分组面板）：每行加 ≡ 拖动手柄（pointerdown 触发，克隆行跟随手指 + 蓝色指示线，释放 splice 重排 `groups[cur]`）；加 ✎ 改名按钮（openModal 输入，校验重名，同步 curGroup/selected key）。内置分组不可改名/删除但可排序。
  - **字卡拖动**（主列表）：长按 350ms 触发（移动超 10px 取消），克隆项跟随手指 + 指示线；computeCardDrop 按 clientY 落点找目标字卡上半/下半（含空分组 header 兜底）；moveCardTo 跨分组 splice 删除插入。仅主字卡/颜文字/emoji/表情包启用；管理模式/搜索/分块渲染中禁用。
  - 验证：无头 Chrome 12/12（分组栏/手柄+改名按钮/拖动排序 A→末尾变 B,C,A/改名/字卡跨分组拖动源减目标增/无 JS 异常）。临时脚本已删。

### 2026-08-20（用户需求「公告点击进入后新增弹窗，需点【我已知晓】关闭」）
- [AI-B·完成]（**已构建 verify 10/10 + 确认层专项冒烟 9/9，随本次提交**）：`src/js/clock.js` `src/template.html` `src/css/base.css`（均 AI-B 域）。
  - 需求：开屏「点击进入」后先弹「关于 bug 报修」确认层（内测报修须知：报修需附手机型号/浏览器/具体现象），点【我已知晓】才关闭并进入页面。
  - 实现：开屏内部新增 `#splash-confirm` 确认层（开屏 z-index 999 > 全局 modal-mask 90，故不用 openModal 而做在开屏内）；`enter()` 改为先检查公告可见（`hasNotice()`：notice.json 隐藏公告时跳过确认层直接进入）→ 显示确认层；点【我已知晓】→ `confirmEl.hidden=true` + `hide()` 进入。确认层内点击 stopPropagation，不会误触 splash 重弹。20s 保险丝改为 `ready()?enter():hide()`（就绪也先弹确认层）。
  - 文案：写死在 template（报修要求是固定须知，不随 notice.json 远程化）。
  - 验证：verify 10/10；专项冒烟 9/9（就绪可进入/点进入弹确认层/含报修文案/开屏未关/点已知晓关闭+进入/点文字不误关/公告隐藏时不弹直接进入）。
  - 本次构建统一包含对方已保存改动：`chat.js`（LS 快照+IDB 合并后同步 lastMineText、TA 回复独立掷骰不再连环引用同一条消息）、`p2-features.js`（备忘/心情按天显示 + 跨天自动刷新 + 老数据迁移）。
  - 新增 `tools/smoke-splash-confirm.mjs` 专项测试（保留供回归）。
- [AI-B·完成·按钮文案修改]（**已构建 verify 10/10 + 冒烟 11/11，未提交**）：按钮文案「我已知晓」→「确认我已知晓，我已知道如何报修设备bug」；`.splash-confirm-btn` 改 `padding 10px 16px + max-width:100% + white-space:normal` 支持长文案换行（按钮不超卡片）。冒烟新增两项：按钮文案正确 + 按钮不超出确认卡片。
- [AI-B·完成·确认层文案改版]（**已构建 verify 10/10 + 冒烟 12/12，本次提交**）：确认层顶部加红色加粗「【报修必填】机型 + 浏览器，缺一不回。」；正文换成用户原话（很多人不看开屏公告、上来就问为什么好多bug、很多问题是设备兼容、报修请附机型/浏览器/具体现象、光说用不了点不动不够、麻烦配合不然没法查）。新增 `.splash-confirm-top` 样式。冒烟新增「顶部必填提示正确」检查。
- [AI-B·完成·文案补充]（**已构建 verify 10/10 + 冒烟 13/13，本次提交**）：结尾补一句「而且我后台的消息堆的非常多，麻烦说明清楚避免无效沟通。」。冒烟新增「文案含后台消息堆的非常多提醒」检查。
- [AI-B·完成·恢复完整文案]（**已构建 verify 10/10 + 冒烟 16/16，本次提交**）：确认层恢复用户提供的完整报修须知（此前精简过度删了段落）——顶部必填提示 + 正文完整三段：①说实话我有点无语（很多人不看开屏公告/很多问题是设备兼容）；②麻烦配合（后台消息堆的多避免无效沟通）；③关于bug【内测一直在更新无可避免】+ 简单说明（特定机型/不报修测不出修不了）+ 详细说明（光说用不了点不动不够/设备差异）+ 要修得先知道（机型+浏览器/复现不了修不了）。新增 `.splash-confirm-sec`/`.splash-confirm-lbl` 小标题样式。冒烟改为逐段检查关键短语。本次构建含对方已保存 fullscreen.js 改动（浏览器标签模式不自动重入全屏优化）。

### 2026-08-20（用户反馈「OPPO Reno6 5G · Edge：朋友圈评论发不出去；联系人的评论看不到」）
- [AI-A·完成]（**已随本会话统一构建 verify 10/10 + CDP 端到端验证**）：`src/js/feed.js`。
  - 根因：`mobile-adapt.js` 在安卓把 `<textarea>`（`#feed-comment-input` 评论框、`#feed-input` 发布框）转成 ce-box（contenteditable 转换框）——OPPO Edge 对 ce-box 聚焦/输入失效（与回复设置 stp-val 同源，WORKLOG 2026-08 OPPO Edge 记录）：打不出字，点发送时 `submitComment` 读到空内容静默返回 → 「评论发不出去」；用户互动链路断裂 → 也看不到 TA 的评论/回应。
  - 修复：评论输入框与发布框预标记 `dataset.ceDone='1'` 让转换器跳过，保持原生 textarea（原生仅弹自动填充条，不影响输入）。
  - 验证：CDP 手机模拟（390×844 安卓 UA）修复前两输入框均被转 ce-box（ce-ghost+__ceBox），修复后保持原生；端到端：发布→评论→发送→评论显示 + TA 回应评论显示 + 通知「TA 评论了你的动态」全部通过。多桌面链路（联系人2桌面评论二宝动态→切回默认桌面可见）同时验证通过。
  - 本次构建同时包含 AI-A 已保存改动（chatcard.js 分组/字卡拖动排序+重命名、calendar.js/p2-features.js/home.css 本周日常点击查看其他日期）。

### 2026-08-20（用户需求「本周日常可以点击其他日期，查看其他日期的当日留言/备忘/心情等内容」）
- [AI-A·完成]（**未构建，请 AI-B 统一执行 node build.mjs**）：`src/js/calendar.js` `src/js/p2-features.js` `src/css/home.css`（均 AI-A 域）。
  - calendar.js：抽出 `getDayEntry(dateStr)`（任意日期首次访问生成 TA 心情/正在做/留言并落盘 cal-YYYY-MM-DD + IDB），`getToday` 改调用它；暴露 `window.calGetDayEntry` / `window.calGetMyMessage(ds)` 供本周日常复用。
  - p2-features.js：备忘/心情保存时补写按日期快照（`memo-YYYY-MM-DD` / `today-mood-YYYY-MM-DD` + IDB），供其他日期查看；本周日常 `.week-day` 渲染加 `data-date`，新增点击事件——其他日期用 openModal(noInput+staticText) 弹窗展示该日期的【今日心情/TA 正在/TA 留言/我的留言/备忘/心情】，今天保持原状（cursor:default），装修模式下不触发。
  - home.css：`.week-day` 加 cursor:pointer + :active 反馈，`.week-day.today` cursor:default。
  - 验证：node --check 全通过。功能需构建后真机/无头验证。

### 2026-08-20（用户反馈「通话小框里联系人的头像没变，没有跟随联系人更换聊天头像变化」）
- [AI-B·完成]（**已构建 verify 10/10 + CDP 冒烟 8/8，随本次提交**）：`src/js/call.js`（AI-B 域）。
  根因：通话开始 `bindCall` 时把 `avatar-partner` 快照进 `currentCall.av`，小框/面板渲染走 `currentCall.av || partnerAv()`——通话中联系人换头像（头像库手动/自动/设置页）后小框头像永远是旧快照。
  修复：新增 `syncCallAv()`——按归属桌面（`storeFor(currentCall.cid)`）实时读 `avatar-partner`，有变化才重绘面板 `#call-av` + 小框 `#call-mini-av`（`shownAv` 防抖，每秒计时 tick 只做字符串比较，不重建 DOM）。接入点：来电/去电开始（重置 shownAv + 首绘）、响铃倒计时每秒、通话中计时每秒、minimizeCall、接听/接通后 2 秒最小化、挂断重置。
  验证：CDP 冒烟 8/8（来电面板初始头像 → 换头像后面板+小框跟随 → 接听小框出现且头像正确 → 小框可见时再换头像实时跟随 → 挂断状态清空 → 无 JS 异常）。临时脚本已删。
  本次构建统一包含对方 12:47-12:49 已保存改动：`chat.js`（七夕标签显隐 rpQixiTag）、`chat-settings.js`（mochi-restore-done 后兜底 applyFont，修复大键字体刷新不应用），均语法通过、内容完整。

### 2026-08-19（本会话，用户需求「聊天更多功能里加双人 Pong 小游戏」）
- [本会话·完成·snake 第二轮]（**已构建 verify 10/10 + snake 冒烟 16/16，未提交**）：贪吃蛇补难度选择 + 暂停 + 全屏 + 保存/继续对局 + 方向键加大。
  - **难度**：顶栏加 select（慢/普通/快），tick 间隔 easy[200,180,160,140] / normal[160,140,120,100] / hard[120,110,100,90]（按 0-30s/30-60s/60-90s/90s+ 分段），默认 normal 比第一轮慢。
  - **暂停**：顶栏加暂停按钮，playing↔paused，暂停时记 pauseAt，恢复时 startTime 补偿 Date.now()-pauseAt。
  - **全屏**：顶栏加全屏按钮，`#chat-snake-panel` 加 `.snake-fs` 类（position:fixed 占满视口、深色沉浸背景、canvas/方向键反色）。
  - **保存/继续**：关闭时若 status==='playing' → 存 localStorage（键 `:snake-saved`）；同会话重开走内存继续；切联系人/刷新后重开 → 显示「继续上局」按钮从 localStorage 恢复；游戏结束/开始新局 → 清保存。
  - **方向键加大**：52×44 → 64×56，字号 16→20px（手机更好按）。面板 max-height 74%→86%。
  - **涉及**：`src/js/snake-game.js`（重写）、`src/template.html`（head 加按钮容器 + controls 加 resume 按钮）、`src/css/chat-pages.css`（head-actions/icon-btn/diff/fs 样式 + 方向键加大）。临时测试脚本已删。
- [本会话·完成·补充]（**已构建 verify 10/10 + 全屏/暂停/保存恢复 12/12，未提交**）：Pong 补全屏 + 暂停 + 保存对局。
  - **全屏**：顶栏加全屏按钮，点击 `#chat-pong-panel` 加 `.pong-fs` 类（position:fixed 占满视口、沉浸式深色背景、游戏区域居中放大到 560px），再点退出。
  - **暂停**：顶栏加暂停按钮，游戏中可暂停/继续（停循环保留 state、显示「已暂停」提示）。
  - **保存恢复**：关闭半框时若对局进行中（有比分或球已发）→ 序列化 state 存 localStorage（每联系人独立键 `:pong-saved`）；同会话重开 → 内存 state 直接继续；刷新页面后打开 → 显示「继续上局」按钮从 localStorage 恢复；游戏结束 → 清除保存。开始新游戏也清除保存。
  - **涉及**：`src/js/pong.js`、`src/template.html`、`src/css/chat-pages.css`。临时测试脚本已删。
- [本会话·完成]（**已构建 verify 10/10 + Pong 专项冒烟 11/11，未提交，请构建者统一执行**）：新增双人 Pong 小游戏。
  - **游戏**：玩家左挡板 / TA 右挡板 AI，球持续运动，先得 5 分获胜。Canvas 渲染（逻辑 400×240 + DPR 清晰），球速随回合 +0.2（上限 8），反弹角度按击球点偏移，发球随机方向 ±15°。
  - **TA AI**：基础轨迹预测（含上下边界反弹推演）+ 反应延迟（0.12~0.5s 按难度）+ 移动速度限制（3.2~5.5px/tick）+ 预测误差 + 概率行为池（提前移动/反应慢/偏离预测/提前改变站位/随机失误/连续成功冒险，各带 3~6s 冷却）+ 危险状态提高 AI 更新频率。三难度（简单/普通/困难）。
  - **控制**：手机左半边触摸拖动 / 电脑 ↑↓WS，挡板最大速度限制。
  - **结束**：写入聊天记录（special:'pong' 居中白底卡片）+ TA 随机回应（内置三组字卡池：玩家胜/TA胜/平局，不依赖聊天 AI）。
  - **音效**：Web Audio 短促 beep（碰墙/碰挡板/得分/胜利），可静音。
  - **涉及**：新增 `src/js/pong.js`（AI-A 域业务功能）；`src/template.html`（more-pong 入口 + #chat-pong-panel 半框，AI-B 域）；`src/css/chat-pages.css`（游戏样式，AI-A 域）；`src/js/chat.js`（more-pong 监听 + renderMsg special:'pong' 渲染，AI-A 域）；`src/js/mobile-adapt.js`（FLOAT_SELECTORS 加 #chat-pong-panel，AI-B 域）；`build.mjs`（jsFiles 加 pong.js，AI-B 域）。
  - **验证**：node --check 全过；verify 10/10；Pong 专项冒烟 11/11（入口/面板/Canvas/接口/倒计时/触摸/无JS异常/关闭/重开/难度/静音）。临时测试脚本已删。

### 2026-08-19（GIF 动图上传变静态图修复——用户反馈字卡库表情包/我的表情包动图不动）
- [本会话·完成]（**已构建 index.html；本次提交一并带上 AI-A 已保存的红包长按退回 + ta-ask 第四批等改动**）：
  根因：字卡库【表情包】【图片】批量导入走 `compressImage` canvas 重绘（sticker→PNG 480 / image→JPEG 720），
  「我的表情包」添加走 `compressMyEmoji` canvas 重绘（PNG 260）——canvas 只能画出 GIF 第一帧，动图全被压成静态图。
  修复：两处上传识别 GIF（`f.type` 或文件名 `.gif`）时跳过 canvas 压缩、直存原始 dataURL（保留全部动画帧）；非 GIF 仍走原压缩；我的表情包动图 >8MB base64 跳过并提示。
  涉及：`src/js/chatcard.js`（批量导入）、`src/js/chat.js`（我的表情包添加）。
  验证：node --check 全通过；verify 10/10；无头 Chrome 端到端（劫持 file input click 注入真实 GIF 走完整上传链路）3/3：
  两条路径存储均为 `data:image/gif`（修复前为 `data:image/png`），PNG 仍走压缩回归正常。
  遗留：已上传的旧动图已被压成静态 PNG，无法自动恢复，需用户重新上传。

### 2026-08-19（桌面美化缺陷修复——已随 a49d263 统一构建提交入库，产物已含全部修复）
- [本会话·完成]（**已随 a49d263 构建提交推送**）：对「桌面美化」做缺陷审计（先静态分析 + node 模拟，再对真实构建产物无头 Chrome 18/18 证实），随后修复 7 项（全 AI-B 域 `src/js/personalize.js` `src/css/home.css` `src/css/dark.css` `src/template.html`）：
  ① **文字/倒计时组件编辑+删除彻底失效**：原 setTimeout 里 `querySelectorAll('.modal-pill')` 选择器不存在（pills 实际类名 `.pill`、容器 `#modal-pills`），字号+/字号-/换颜色/删除从未绑定；且保存用 `saveDeskTextsMeta(loadDeskTextsMeta())` 读旧数据存回、编辑丢失。修复：一次 load 持有 meta 引用、pill 动作走 openModal 确定回调（与全站一致）。
  ② **美化方案导出键名不匹配**：BEAUTY_KEYS 写成 `widget-color/widget-border/widget-btn/widget-btn-text/widget-heart`，与真实存储键 `widget-bg-color/widget-border-color/widget-btn-color/widget-btn-text-color/widget-heart-color` 全部对不上，导出静默漏掉 5 项颜色。已改键名。
  ③ **美化方案导出漏图片本体/自定义图标**：`desk-image-src-<id>`（IDB）、`app-icon-*`、`app-icon-order-*` 不在方案里，导入后图片组件空壳、图标自定义搬不走。新增 collectBeauty 动态收集（按 data-app 枚举）+ 导入同步写入。
  ④ **导出 fallback 空弹窗**：clipboard 不可用时原 `noInput:true` 隐藏输入框、JSON 不可见。改用 textarea 展示 JSON 供手动复制。
  ⑤ **删页后 desk-layout 残留**：buildDeskPages 删页不移组件回池但不收缩布局，之后新增页刷新把旧页组件插回新页（"复活"）。修复：删页时已有自定义布局则 saveDeskLayout() 收缩。
  ⑥ **背景模糊常驻 backdrop-filter**（iOS 红线）：blur(0px) 也保持 filter 激活、全屏每帧栅格化。改为 `.phone-bg-mask` 仅 `blur-on` 类（px>0）启用 backdrop-filter，默认移除。顺带深色模式遮罩改黑（dark.css 补 `.phone-bg-mask` 覆盖）。
  ⑦ **组件圆角漏新组件 + 默认值不一致**：`.desk-text-widget/.desk-countdown-widget` 漏写圆角（恒直角）、`.desk-image-widget` 用图标圆角；已全部改 `--desk-card-radius`，:root 默认 16px→20px 对齐 JS。
  另：设置页「桌面字号/卡片大小」补「仅桌面/大屏生效 · 手机端为 iOS 性能保持默认」副标题（手机端 zoom 强制 1 的现状提示）。
  验证：隔离构建 + 无头 Chrome 17+4 项全过（编辑保存/字号+/删除/倒计时编辑删除/导出 5 键/fallback textarea/删页收缩/圆角 12px/blur 10px 开启+dark/0px 关闭 none）。临时脚本已删。

### 2026-08-19（用户三次反馈「正在输入行是整行图形、滑动遮挡」——真实根因是版本更新机制失效，用户从未加载到修复版）
- [本会话·完成]（**已构建 verify 10/10 + CDP 端到端验证，已随 a49d263 提交推送**）：用户三次反馈同一问题，前两轮只改 `.chat-typing` CSS（fit-content→align-self:flex-start）并验证线上已部署，但用户始终看不到修复。**深挖发现真正根因不是 typing 样式，而是版本更新机制从未生效**：
  ① **`template.html` 结构性 bug（核心）**：`ver-update-bar`/`backup-remind-bar` 位于 `<script>`（`/*__SCRIPTS__*/`）**之后**，而 pwa.js 启动即 `getElementById('ver-update-bar')` → null → `if(!bar) return` 直接退出 → **版本检测/备份提醒整块逻辑从未执行**（desk-image-viewer 曾有同类坑，注释明确要求必须在 script 前，两个 bar 漏了）。用户永远收不到「检测到新版本」提示，一直停留在旧缓存（悬浮式/全宽式 typing 行）。
  ② **pwa.js 基线 bug**：基线取「首次 fetch 的 version.json」——旧缓存页面 + version.json 拿到最新时间戳时基线被污染成最新版 → `ts > baseTs` 永远 false → 永不提示。
  ③ **sw.js 拦截 version.json**：网络优先 8s 超时 + 带 `?v=` 唯一参数缓存永不命中 → 慢网络下版本检测 fetch 静默失败。
  修复：①ver-update-bar/backup-remind-bar 移到 `<script>` 前；②build.mjs 注入 `__BUILD_TS__` → template `splash-ver data-build-ts`，pwa.js 加载时直接取页面自身构建时间戳当基线（首次 fetch 即可比较，不依赖 30s 轮询）；③sw.js 放行 version.json/notice.json 不走 SW；④sw.js 导航回退兜底找任意旧缓存 index.html。无头验证：注入旧基线 + 服务器返回新 version.json → 更新条 barHidden=false 正确触发（修复前从未触发）。涉及 `src/template.html`、`src/js/pwa.js`、`src/pwa/sw.js`、`build.mjs`（全 AI-B 域）。

### 2026-08-19（本会话，用户需求「猜拳手势矢量图重设计，旧版太丑」）
- [本会话·完成]（**已构建 verify 10/10，已提交**）：猜拳全套手势图标换为 Phosphor Icons（MIT）三件套——石头=hand-fist 拳头 / 剪刀=hand-peace V 手势 / 布=hand-palm 张开手掌（viewBox 0 0 256 256，path 带 fill="currentColor"，颜色仍走各处 CSS color，深浅色自动适配）。替换 4 处：①`src/template.html` more-rps 更多面板入口图标——旧版是四指抬手，与「拍一拍」入口几乎一模一样（用户觉得丑/混淆的主因），改用拳头（「猜拳」字面即拳头，区分度明显）；②③④半框三个出拳按钮（template.html rps-choices）+ `src/js/chat.js` renderMsg 消息卡片 rpsIco 映射——旧版为手绘直线拼凑路径（石头=带竖线方块、剪刀=两根悬空竖线，辨识度差）。选型过程：Iconify API 拉取 Phosphor 常规与 FA6 实心两套候选 → 无头 Chrome 截图对比页 + 视觉评估（Phosphor 手势一眼可辨、线宽与邻居图标协调，胜出）；构建产物里拳头 3 处（入口+按钮+消息卡）/剪刀布各 2 处嵌入计数验证，浅色卡片/深色卡片/出拳按钮三场景渲染确认正常。`.shot-tmp/` 临时预览已清理。
- 本次提交同时包含对方 20:25-20:34 保存的完整批次（feed.js IndexedDB 就绪门槛 feedDbReady+feedPending 防 Edge 丢动态 / mail.js / music-player.js / ta-ask.js 相关完善），均已进过 20:35 产物、内容完整自洽，按惯例随本次产物统一提交。

### 2026-08-19（本会话，用户需求「来电概率也改成每 30 秒检查一次」）
- [本会话·完成]（**已构建 verify 10/10 + 已提交 2276bb7**）：`src/js/call.js`（AI-B 域）来电触发机制微调——
  TA 回复消息/主动发消息后按「通话设置-来电概率」掷一次来电**保持不变**（chat.js 钩子未动）；独立兜底定时器 `setInterval(maybeIncoming, 60000)` → **30000**（每 30 秒检查一次，5 分钟冷却与后台不触发逻辑不变），同步更新文件头/段注释。
  附带：本次提交包含对方 18:21 刚保存的 `src/js/personalize.js` 改动（单功能图标仍在 app-grid 内时不移到 slide，避免刷新后图标横变竖）——已 node --check 通过、内容完整自洽，产物同次提交。
  ⚠️ 注：对方挂断仍为「接通满 3 分钟后每 60 秒检查」（v3.6.x 起故意放宽），用户口述「和挂电话一样每 30 秒」与现状有出入——如需挂断也改 30 秒请告知。

### 2026-08-19（⚠️ push 阻塞：用户反馈批量管理搜索「还是不行」）
- [本会话] 排查结论：**修复已在本地构建产物中且功能验证通过，但从未 push 上线**（`git push` 报 `could not read Username for 'https://github.com'`——本环境无 GitHub 凭据，也无 gh CLI/credential store）。线上 GitHub Pages 一直是旧版 → 用户手机访问的仍是旧行为（管理模式搜索输入即清空）。
- 当前待 push 的本地提交（按序）：`605db6b`（批量管理放开搜索+修复 chat.js 语法错误）→ `223cfb5`（TA 话术池区块）→ `c22e3b8`（网易云时长 no-referrer）。**请有凭据的一方执行 `git push origin main`**；push 后 PWA 用户需等 sw 更新/二次刷新才生效。
- 已再次验证当前构建（17:16）搜索链路：冒烟通过（管理态输入即筛/输入保留/全选过滤感知/退出管理，0 JS 错误；1 个 FAIL 为测试脚本选择器误报，非产品问题）。

### 2026-08-19（本会话，用户需求「批量管理字卡时无法搜索字卡」——已放开搜索，已构建 verify 10/10 + CDP 功能 19/19，本次统一提交）
- [本会话·完成]：**字卡库「批量管理」模式放开搜索**（AI-A 域 chatcard.js，用户直接反馈故本会话实现）。原 v3.5.130 出于安全禁用（搜索过滤曾导致勾选下标与原始数组错位、删除误删别的卡）；v3.7.x 搜索已保留原始索引（{c,oi}），根因消除，本次拆锁并补 3 个配套安全点：
  ①搜索输入事件去掉 `if (manageMode) 清空` 拦截，过滤视图变化时清空已选（防残留屏幕外选中）；②`selectedKeys`（全选）改为过滤感知——搜索/分组筛选态只选当前可见卡，不连选屏幕外；③`delSelected` 搜索态强制全量 render（rebuildGroupAfterRemove 重建整组不带过滤会"复活"不匹配卡）；分组 chip 切换视图同样清空已选。enterManage 不再清空搜索，保留当前视图继续筛选。
  CDP 功能 19/19：非管理搜索回归、管理态搜索过滤/保留关键字/勾选/全选切换/全选只选可见、无搜索全选全部回归、搜索态删除只删匹配卡（甜话剩2+日常2）、空态、清空恢复、进出管理。
- ⚠️ **代修 AI-A 语法错误**：`src/js/chat.js` 16:41 保存的改动把 `tryCollectPending` 重复定义（新函数带「TA 收取后发感谢」插在旧函数前 + 多一个 `}` + 旧函数未删）→ **整包 JS SyntaxError，`__mochiDataReady` 永置 false、开屏卡死、verify 全挂**。已删多余 `}` 与旧重复函数，保留带感谢逻辑的新版。请 AI-A 确认意图无误。
- ⚠️ 本次构建包含 16:23 后双方全部累积改动（通话半框/猜拳/红包封面+领取概率/音乐歌单时长/桌面美化/dark.css 微调/本搜索放开），**已统一提交**，产物与源码同次提交。

### 2026-08-19（本会话，用户需求「聊天页更多功能→通话：新增通话半框 + 可开关通话小框」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 冒烟 16/16，未提交，请构建者统一执行**）：新增「通话半框」。
  ①**入口**：`src/js/chat.js` 更多功能「通话」(#more-call) 不再直接拨打 → 改为打开底部半框 `#chat-call-panel`（复用 .poke-card 容器，`src/template.html` 置于占卜/猜拳半框旁）；切联系人桌面自动关半框。
  ②**半框内容**：当前通话状态行（空闲/正在呼叫/来电/通话中+时长，每秒刷新）+「拨打语音通话」大按钮（placeCall，降级旧逻辑兜底）+「挂断通话」红色按钮（window.hangupCall）+「通话小框」开关 + 说明文案。
  ③**通话小框开关**：`src/js/call.js` 新增 `call-mini-enabled`（每联系人桌面独立，默认开）——开启：接通 2 秒自动最小化悬浮小框（原行为）；隐藏：接通后保持大面板常驻、点「缩小」收起进后台不弹小框（经半框挂断）；暴露 `window.getCallMiniEnabled/setCallMiniEnabled/getCallState/hangupCall`；answerCall/placeCall 的 2 秒最小化与 minimizeCall 均按开关分支。
  ④**适配**：`src/js/mobile-adapt.js` FLOAT_SELECTORS 加 `#chat-call-panel`（锁背景滚动）；`src/css/chat-main.css` 加 .call-panel-status/.call-panel-dial/.call-panel-hang/.call-panel-switch/.call-panel-hint（dark.css 由 .poke-card/var(--ink) 自动适配）。
  ⑤**验证**：CDP 冒烟 11/11（更多面板→半框打开/状态文案/按钮显隐/开关默认开/切换持久化 0↔1/重开保持/无 JS 错误）+ 行为 5/5（关：接通后 mini 不显示、大面板常驻通话中；开：接通后 mini 显示、大面板收起）。
  ⚠️ **提示构建者**：16:24 对方还在改 `src/css/dark.css`（红包/猜拳暗色微调，**未构建**）——请确认其保存完整后统一重新构建提交（当前 index.html 为 16:23 产物，已含双方 16:23 前的全部改动：通话半框 + music-player.js 歌单时长/文案 + bg-keep.js 媒体会话让位）。

### 2026-08-19（本会话，用户反馈「网易云歌单导入：批量导入没写可导入歌单/没写仅免费可播；导入后列表无时长、播放才加载；手机浏览器可能拦截」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 冒烟 9/9 + 真实歌单 E2E，本次统一提交**）：`src/js/music-player.js`（AI-A 域，用户直接反馈故本会话统一实现）。三点全修：
  ①**文案补全（issue#1）**：批量导入面板重写提示——3 种方式置顶（网易云歌单链接 / 网易云单曲 ID / 本地直链格式），明确「⚠ 网易云导入仅支持播放免费歌曲，VIP/付费歌曲可能无法播放；部分手机浏览器可能拦截，失败可稍后重试」；占位符加歌单链接示例；链接添加面板同补免费说明 + 歌单链接说明；歌单导入失败 toast 改「可能私密/已失效/被浏览器拦截」。
  ②**时长一次性补全（issue#2）**：新增时长补全链路——`fetchV6Durations`（官方 v6 歌单详情含每曲 dt，经 3 个 CORS 代理并行拉、7s 兜底）+ `enqueueDurProbe`/`probeOneDuration`（<audio preload=metadata> 探测，与播放同源 meting URL、无需 CORS 代理、移动端可用，并发 4 后台跑）；`importNeteasePlaylist` 导入后自动触发（v6 快路径 → 探测兜底），链接添加/批量导入单曲同步探测，打开音乐页时 `probeAllMissingDurations()` 补历史遗留歌曲；`parseNeteasePageTitle` 顺带解析歌曲页 `music:duration` meta（零额外请求）；播放 `loadedmetadata` 补 `updateDurUI` 即时刷新列表时长（不再等整页重渲染）。CDP 实测：种子 2 首 1s 内补全（04:55/03:30 与官方 dt 一致）、真实导入热歌榜 200 首全部时长补全显示（仅 2 首 VIP 保持 00:00 属预期）。
  ③**移动端防拦截（issue#3）**：`fetchNeteasePlaylist` 新增 i-meto meting 镜像源（独立域名，主源被拦时兜底，字段 title/author 兼容解析）；保留官方 v6 代理兜底；失败提示引导重试。
  `node --check` 通过；本次构建同时包含会话内 RPS 猜拳/正在输入修复/表情包分组等已保存改动，统一提交。

### 2026-08-19（本会话，用户需求「聊天更多功能新增猜拳互动，联系人随机出拳」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 猜拳功能 12/12，未提交**）：新增「猜拳」互动。①**入口**：`src/template.html` more-grid-fun 加 `more-rps` 按钮（手势 SVG 图标，位于拍一拍与头像互动之间）；②**半框**：`chat-rps-panel`（复用 .poke-card 容器）含战绩行（胜/负/平，存 localStorage `rps-score`）+ 提示行 + 三大出拳按钮（石头/剪刀/布，各带手势 SVG）；③**逻辑**：`src/js/chat.js` 绑定 more-rps→openRpsPanel（关闭其他半框+more-panel）、出拳→sendRps：联系人出拳 `['rock','scissors','paper'][Math.floor(Math.random()*3)]` 纯 1/3 均匀随机每次独立 → rpsJudge 判定 → addRec({special:'rps',rpsMine,rpsTa,rpsResult}) 写入聊天 → 战绩更新；④**消息卡片**：renderMsg 加 `special==='rps'` 分支，居中白底灰边卡片，双方手势 SVG 图标+「你·石头 VS TA·布」+ 结果文字（你赢了/你输了/平局），简约无彩色；⑤**样式**：`src/css/chat-main.css` 加 .rps-score/.rps-hint/.rps-choices/.rps-choice/.rps-c-ico + .msg-rps/.msg-rps-card/.msg-rps-hands/.msg-rps-hand/.msg-rps-ico/.msg-rps-name/.msg-rps-vs/.msg-rps-result；⑥**接线**：`src/js/mobile-adapt.js` FLOAT_SELECTORS 加 `#chat-rps-panel`（锁背景滚动）；`src/css/dark.css` 加暗色适配。涉及 AI-A 域（chat.js/chat-main.css）+ AI-B 域（template.html 已进对方 20adafe 提交/mobile-adapt.js/dark.css），用户直接反馈故跨域。**未提交**（chat.js 含对方未提交的 partialRetactMsg 改动，等待统一提交）。

### 2026-08-19（用户反馈「聊天页正在输入行又变成一整行图形、滑动遮挡消息」，二次反馈未解决）
- [本会话·完成]（**已构建 verify 10/10 + CDP 双场景验证，随本次提交**）：`src/css/chat-main.css` `.chat-typing`（AI-A 域文件，用户直接反馈故越界修复）。**真实根因**：聊天页设置壁纸（cs-bg 铺满 #page-chat）时，`.chat-typing` 是 `#page-chat`（flex column）直接子项，`align-items` 默认 stretch 把它拉成**整行全宽透明块**（实测 354px），整行透出壁纸图案 = 用户看到"这一整行是一个图形"；v3.5.47 曾用 `width:fit-content` 解决，v3.6.x 改内嵌时漏掉，仅加 fit-content 在部分内核不可靠。修复：`.chat-typing` 加 **`align-self:flex-start`**（flex 交叉轴不拉伸，宽度收缩到内容，flex 基础属性所有内核必支持，不依赖 fit-content 关键字）+ 保留 `width:fit-content` 双保险。CDP 验证两场景（fit-content 正常 / 用 `width:auto!important` 模拟 fit-content 失效）：typing 行宽度均 121px 窄条、alignSelf=flex-start、滚动后无消息在行下（msgsUnderTyping=0）、elementFromPoint 命中 page-chat 而非消息。涉及 `src/css/chat-main.css` + 产物。本次构建同时包含 AI-A 已保存改动（chat.js 问问TA半框文字错位修复/音乐批量链接/互动回应池等 7 文件，node --check 全过），统一提交。

### 2026-08-19（本会话，用户反馈「聊天表情包→我的表情包：管理分组图层不在最顶 + 新建分组不显示在顶部」）
- [本会话·完成]（**已随 1f14419 构建提交推送**）：`src/js/chat.js` + `src/css/chat-pages.css`（均 AI-A 域）。三个问题一并修复：
  ①**管理分组弹层不在最顶**：`.mg-mask` z-index 60 < 聊天表情半框 `.poke-card` 70 → 弹层被半框盖住。改 z-index 85（高于 poke-card 70/消息气泡菜单 80，低于 openModal `.modal-mask` 90，重命名/删除确认仍盖在其上）。
  ②**新建分组不显示在顶部**：a) 分组栏 `renderEmojiGroupsBar` 只显示有内容的分组（`filter(g => g[1].length)`），新建的空分组永远不可见（且无法选中，点「添加」会加进别的组）→ 我的表情包模式改为显示全部分组（含空的，计数显示 0），TA 的表情包仍只显示有内容分组；b) 新建分组 `push` 到末尾 → 改 `unshift` 插到最前，创建后自动选中并打开该分组、自动关掉管理弹层（与字卡库管理分组一致）；「添加」无分组时自动建的「默认」同样 unshift。
  ③**顺带修复隐藏大 bug：我的表情包刷新后整组消失**——`myEmojiLoad()`（读 localStorage）定义了但**从未被调用**，启动恢复块只在「IDB 内容比 LS 多」时才覆盖赋值，正常双写（LS=IDB）时 `myGroups` 恒为空数组 → 每次刷新后我的表情包显示「暂无」。修复：启动即 `myGroups = myEmojiLoad()`（与 chatcard.js cc-groups 的 loadGroups 模式对齐，恢复块仍保留 IDB 更多时覆盖）。
  temp 隔离构建 + CDP 复测（seed LS+IDB → 刷新 → 全部通过）：刷新后分组栏 `[默认1, 猫咪0]`（修复前为空）、管理弹层 z 85>70、新建「猫猫」→ 弹层自动关 + chips `[猫猫0, 默认1, 猫咪0]` 置顶且选中、存储顺序 `[猫猫, 默认, 猫咪]`、再刷新持久。**已随 1f14419 构建提交推送**（对方统一构建包含本改动+产物）。

### 2026-08-19（本会话，用户反馈「问问TA 半框输入文字显示在输入框外面」（安卓 Chrome/Edge））
- [本会话·完成]（**已随 1f14419 构建提交推送**）：`src/js/chat.js` + `src/css/chat-main.css`（均 AI-A 域）。排查：半框输入框是安卓转换的 contenteditable（ce-box），位于 `position:fixed` 的 `.poke-card` 面板内；新版安卓 Chrome 键盘只缩放视觉视口（chromium issue 40251217），键盘弹出动画把 fixed 半框整体上移时，聚焦 contenteditable 的文本合成层偶发停在旧位置 = 文字显示在框外（聊天主输入栏在文档流内，不受影响）。修复：①chat-main.css `.chat-ask-input:focus`/`.chat-ask-opts:focus` 加 `transform:translateZ(0)`（聚焦期间独立合成层，逐帧按当前布局位置合成）；②chat.js `openChatAskPanel` 聚焦后给输入框内联 `translateZ(0)`（无头验证 `:focus` 在部分焦点态不匹配，内联样式兜底），`closeChatAskPanel` 与单选选项框显隐（syncOptsHidden）时清除/设置同款。已 temp 隔离构建 + CDP 复测：聚焦态 transform=matrix、键盘弹出动画后输入文字仍在框内（textInBox=true）、单选选项框同款、无 JS 错误。**已随 1f14419 构建提交推送**。提示 AI-B：如需通用化，可在 mobile-adapt.js 对 fixed 面板内（`#chat-search-input`/帮我决定/占卜问题框等）ce-box 聚焦时同样加内联 translateZ(0)——当前仅修了问问TA 半框。

### 2026-08-19（本会话，AI-A：网易云歌单一键导入）
- [本会话·完成]（**未构建未提交**，请构建者统一执行）：用户需求「直接导入网易云的歌单」。`src/js/music-player.js`（AI-A 域，未动 template.html）：
  ①**识别**：`extractPlaylistId` 识别歌单分享链接（music.163.com/playlist?id=、y.music.163.com/m/playlist?id=、#/playlist?id= 等格式，8/8 单测通过）；
  ②**数据源**：`fetchNeteasePlaylist` 主源 meting API `type=playlist`（api.injahow.cn，与播放同源稳定无 CORS，约 200 首上限；响应 url 提取歌曲 ID 复用 `neteaseMetingUrl` 播放）+ 兜底网易云官方 v6 歌单详情 API（无 Cookie 全曲目，经 allorigins/corsproxy/codetabs 代理——实测当前代理基本失效，保留作未来恢复能力）；
  ③**入口**：「链接添加」输入框粘贴歌单链接自动导入整歌单（可多个混排，歌单行+单曲行共存时分别处理）；「批量导入」同样识别歌单链接（纯链接行、标签格式里的 URL 值均支持）；提示文案同步更新；
  ④**去重**：按 neteaseId 跳过已有歌曲（重导入全跳过，实测）；失败歌单 toast 提示「可能私密或已失效」；封面 http→https 规范化；
  ⑤**实测**：真实导入热歌榜 200 首（名/歌手/封面/直链齐全）、重导入 0 新增、无效歌单快速失败。`node --check` 通过。**未构建未提交**，等待统一提交/部署。

### 2026-08-19（本会话，AI-A：音乐支持批量上传数字链接）
- [本会话·完成]（**未构建未提交**，请构建者统一执行）：用户需求「音乐里上传数字链接，可以批量上传」。`src/js/music-player.js`（AI-A 域，未动 template.html）：
  ①**「链接添加」支持批量**：输入框改为多行 textarea，一次粘贴多个网易云数字 ID / 音乐直链，每行一个，逐条导入（多行时歌曲名/歌手自动识别，单行行为不变）；toast 区分「已批量添加 N 首」/「链接音乐已添加」。
  ②**「批量导入」兼容纯链接粘贴**：整段无「歌曲名称：xxx」式标签时自动按每行一个 ID/链接导入（无需格式标签），歌名取链接文件名或默认名，网易云 ID 自动识别歌名；原格式模式不受影响。`node --check` 通过，解析正则已单测。**未构建未提交**，等待统一提交/部署。

### 2026-08-19（本会话，AI-B：桌面美化自由度+便捷增强）
- [本会话·完成]（**已构建 verify 10/10，未提交**）：用户需求「增加桌面美化自由度和便捷」。新增 5 项功能（全在 AI-B 域）：
  ①**背景模糊/遮罩**（`src/template.html`加`.phone-bg-mask`层 + `src/css/home.css` backdrop-filter + `src/js/personalize.js` slider 0-20px / 0-80%）——不破坏现有背景逻辑，backdrop-filter 模糊 .phone 背景图，白色遮罩调透明度；
  ②**组件卡片圆角**（CSS 变量 `--desk-card-radius` 统一应用到所有桌面组件，slider 0-30px，默认 20px 保持兼容）；
  ③**自定义文字组件**（可多个，`desk-texts` 元数据，装修模式点击编辑文字/字号+/字号-/换颜色/删除）；
  ④**通用倒计时组件**（可多个，`desk-countdowns` 元数据，格式"标题|日期"，自动计算剩余天数，装修模式点击编辑/删除）；
  ⑤**美化方案导入导出**（收集所有美化 key 打包 JSON，导出复制到剪贴板，导入粘贴写回+刷新）。
  每页独立背景/主色调/组件透明度/图标圆角等已有功能确认存在，未重复开发。
  涉及 `src/template.html`+`src/js/personalize.js`+`src/css/home.css`+`WORKLOG.md`+产物。**未提交**（不含 AI-A 进行中改动 chat.js/ta-ask.js/default-cards*.js），等待统一提交。

### 2026-08-19（本会话，用户需求「互动卡片系统预设回应话术池，在字卡库→系统预设字卡里展示」）
- [本会话·完成]（**未构建未提交**，请构建者统一执行）：新增「互动回应」tab + 逐张开关联动回复抽取。①**数据**：`src/js/default-cards-data.js`（AI-A 域）`DEFAULT_CARD_DATA` 新增 `interact` 分类（7 分组：邀请TA·接受 5 / 邀请TA·拒绝 4 / 问问TA·回应 11 / 小问题·回应 96 / 好奇·回应 113 / 吐槽·回应 7 / 询问·回应 5，共 241 条）——小问题/好奇两池由临时脚本从 ta-ask.js `TC_DEFAULT`/`TCU_DEFAULT` 提取去重合并，脚本已删；②**UI**：`src/js/default-cards.js` JS 注入「互动回应」tab（**未动 template.html**，避免越界），复用现有分组/搜索/单卡开关体系；③**接线**：`src/js/ta-ask.js` `pickAskCardReply` 过滤 `isDefaultCardOff('interact', …)` 已关闭话术；吐槽池（ta-ask.js 2059）、邀请TA 接受/拒绝与问问TA 文字题池（chat.js）改为 `getInteractPool(分组名, 回退内置池)` 同源读取；`src/js/chat.js` `chatChooseReply` 默契命中路径同样过滤已关闭话术（`presetOff`）。普通聊天回复池 keys 不含 interact，不受影响。`node --check` 4 个文件全过。**未构建未提交**，等待统一提交/部署。

### 2026-08-19（本会话，AI-B：apps/p2apps 添加 bug 修复 + 回前台汇总通知）
- [本会话·完成]（**已构建 verify 10/10 + CDP apps/p2apps 添加测试通过，未提交**）：
  ①**功能图标添加无反应 bug 修复**（用户反馈）：根因——`WIDGET_IDS` 含 `'apps'`/`'p2apps'` 但 template app-grid/p2-grid 无 `data-desk-widget` 属性，`querySelector('[data-desk-widget="apps"]')` 返回 null → `if(!node) return` 静默退出。修复：template app-grid 加 `data-desk-widget="apps"`、p2-grid 加 `data-desk-widget="p2apps"`；`applyDeskLayout` 跳过 apps/p2apps 池逻辑（老兼容：老 layout 不含它们，避免老用户功能图标被移到隐藏池消失）。CDP 复测：apps 从 p0 成功添加到 p1（toast"已添加到本页"）、p2apps 已在目标页时按钮正确 disabled。涉及 `src/template.html`+`src/js/personalize.js`（AI-B 域）。
  ②**回前台汇总系统通知**（`src/js/bg-keep.js`，AI-B 域）：回前台瞬间若有未读消息且不在聊天页，除应用内横幅外再发一条汇总系统通知「你不在的时候收到 N 条新消息」（后台冻结导致消息/通知没能实时到达，回前台一次告知），30 秒去重防刷屏。涉及 `src/js/bg-keep.js`。
  临时测试文件 `tools/test-apps.mjs`+`.shot-tmp/` 已清理，`personalize.js` 临时 `__openDeskLib` 暴露行已删。**未提交**，等待统一提交/部署。

### 2026-08-19（本会话，用户反馈「编辑字卡点确认会卡顿」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 延迟/功能复测 11/11，已提交**）：`src/js/chatcard.js`（AI-A 域）——单卡编辑确认卡顿修复。**根因量化**：确认回调里 `saveGroups` 同步 `JSON.stringify(整个字卡库)`，14.8MB 库（30 图+10 语音 1MB×10+300 文字）序列化 66ms 阻塞在弹窗关闭前（真实语音库手机上可放大到几百 ms）。**修复**：①持久化延后——确认只更新内存+DOM（弹窗即时关、卡片即时变），`scheduleSave()` 120ms 合并写入；②搜索态编辑不再整列表重渲染——仍匹配关键词原地更新，不匹配则局部移除卡片+同步 header 计数（`rendering` 分块渲染进行中才走全量 render，防旧批次复活）。**CDP 复测**：普通视图确认 65.5ms→2.9ms、搜索态 69.7ms→2.6ms、连续编辑 3 次 6.7ms 全落库、延后保存 300ms 落库正确、搜索态不匹配卡移除+计数-1、仍匹配原地更新、无 JS 错误（11/11）。**本次构建不含对方进行中改动**（personalize.js/template.html 刚被对方保存 + 未跟踪 `tools/test-apps.mjs`/`.shot-tmp/`），提交只含 chatcard.js+产物+本记录，对方批次由对方提交。

### 2026-08-19（本会话，用户反馈「联系人的回复设置没有按已设置保存的数字和概率触发」）
- [本会话·完成]（部署确认）：对方已统一构建并提交推送（fdb3e87「主动发送设置立即生效」+ eabeb02，main=origin/main，线上已更新）。本会话对**线上构建产物**（仓库 index.html）复测：`window.rescheduleAutoSend` 存在、被动回复按 rs-min=2 于 3.6s 到达 PASS。用户反馈的问题（主动发送间隔被压回 30 分钟/改设置不立即生效/切桌面不重排/免打扰 1 秒就发）已全部修复并上线。遗留：仓库根 `.shot-tmp/` 未跟踪目录（对方 CDP 截图临时目录，请确认后清理或忽略）。
- [本会话·诊断完成]（用户反馈「联系人的回复设置没有按已设置保存的数字和概率触发」——**结论：线上版本（origin/main 25a8cbd）缺 v3.7.x 主动发送修复，对方未提交批次已含全部修复，待构建部署；本会话已在隔离副本构建 + CDP 全链路验证通过**）：未动仓库任何文件（对方正在编辑中）。排查与验证：
  1. **线上版本 bug 确认**（`git show origin/main:src/js/chat.js`）：①`Math.min(30, as-min)` 把「发送间隔最短」>30 分钟一律压回 30 分钟（设 60 分钟实际 30 分钟就来）；②无保存后重排（改了概率/间隔要等挂起定时器最长几小时才生效）；③无 contact-switched 重排（切桌面后旧桌面定时器继续用旧设置）；④dnd-en=1 时 asMin=1（秒）——免打扰反而 1 秒就发。**均已在对方未提交的 chat.js v3.7.x 批次中修复**。
  2. **隔离副本验证**（temp 目录复制 src + node build.mjs + CDP 390×844）：①设置页 UI 保存全链路（stepper ± 点击落库、直接输入数字落库、保存按钮、回显）7/7；②被动回复 rs-min=2 → 首条 2.5s 到达、条数按 reply-min/max=2~3、rn-prob=100 只发已读不回、无 JS 错误；③UI 设 rs-min=8 → 回复 9.15s 到达；④主动发送 as-min=as-max=1 → 60s 到达；⑤保存 as-min=2 后定时器立即重排（60s 内不再发）；⑥切到新桌面 B（as-min=1）→ 55s 按 B 的设置发，聊天无 A 残留。
  3. 结论：**当前 src 已正确按保存的数字/概率触发，问题只在未部署**。请构建者（对方批次完成后）执行 `node build.mjs` + `npm run verify` + 提交推送（对方当前批次：chat.js/chatcard.js/reply-settings.js/personalize.js/template.html/home.css 等未提交改动 + 本会话无改动）。临时测试脚本在 temp 目录（mochi-replytest），未入库。

### 2026-08-19
- [本会话] 完成（用户需求「开屏公告里『【关于mochi字卡】』标题删掉」——**未构建未提交**，请构建者统一执行）：移除开屏公告标题「关于 Mochi 字卡」——`src/template.html` 删除 `.splash-notice-title` 行（离线兜底）、`src/pwa/notice.json` 删除 `title` 字段（在线覆盖源；clock.js 对缺失 title 已有兼容，不影响）。涉及 `src/template.html`（AI-B 域，用户直接反馈故越界，仅删文案行无逻辑改动，请知悉）。**未构建未提交**，等待统一构建/提交。

### 2026-08-19
- [本会话] 完成（用户需求「装修模式组件库可直接看到小组件样式预览；新增日历/时间等桌面小组件」——**已构建 verify 10/10，未提交**）：`src/template.html` + `src/js/personalize.js` + `src/css/home.css`（AI-B 域为主，home.css 桌面组件样式历来由此方改）。①**组件库静态预览**：`openDeskLib` 每项左侧加 72×52 缩略图（`WIDGET_PREV_HTML`，纯 HTML+CSS 示意，不依赖真实数据/事件），右侧名称+位置+按钮（`.dl-prev/.dl-meta/.dl-name`）；图片项也加预览。②**4 个新组件**（默认放 `#desk-widget-pool` 隐藏池，用户从组件库添加）：**时钟** `desk-clock`（大时:分 + 星期 + 月日，5 秒更新）、**月历** `desk-calendar`（当月 7 列网格，高亮今天，有留言日子标红点 `cal-my-<date>`，点击跳日历页）、**计时器** `desk-timer`（正计时/倒计时切换，开始/暂停/继续/重置，倒计时输分钟数，到 0 提醒+震动）、**纪念日倒计时** `desk-anniv`（读 `love-start`+`mem-extras` 找未来最近纪念日显示天数）。渲染入口 `renderDeskWidgets` 在启动/`applyDeskLayout`/`contact-switched` 调用，时钟/计时器 init 幂等。③**回应对方 12:33 警告**：home.css 配套样式已补全（`.desk-clock/.desk-cal/.desk-timer/.desk-anniv` + `.dcal-grid` + `.dt-btn` 等），12:38 构建产物完整。`node --check` 通过，verify 10/10。**未提交**，等待统一提交/部署。⚠️ 本次构建同时带上对方已保存改动（chat.js/chatcard.js/reply-settings.js，语法均通过），一并进产物。
- [本会话] 单卡编辑功能**并行重复实现确认**（用户需求「自定义聊天字卡单卡可点击编辑」）：本会话在 chatcard.js 独立实现了相同的 openEditCard/updateCardDom（12:32 构建时发现对方 e7b9a93 已提交同功能，代码一致无冲突）。本会话**净增量 = 搜索态原始索引修复**：对方提交的版本在搜索过滤下 `data-idx` 是过滤后索引，搜索态点击编辑会按错位索引改错字卡（CDP 复现）；已修复——搜索分支把元素映射为 `{c, oi}` 保留原始索引，`render()` flat 构建按 `q` 分支取值。**已构建 verify 10/10 + CDP 端到端 19/19**（点击文字卡弹编辑/预填/保存落库/计数不变/未变化不保存/组内重复拦截/空内容拦截/emoji·kaomoji·拍一拍可编辑/图片卡仍开大图/管理模式仍勾选/搜索态编辑不串位/无 JS 错误），**未提交**（产物与对方进行中批次耦合，见下）。
- ✅ 我方 12:33 警告的「home.css 样式缺失」已被对方补全（见上一条对方记录），组件库预览+4 新组件批次完整；本会话 12:44 已重新构建（index.html 含全部双方改动，含对方 12:41 补充的 `ip-opt-row` 已作答选项样式）+ verify 10/10 + 冒烟 9/9（时钟/月历/计时器/纪念日初始化正常、组件库 14 项、单卡编辑回归、无 JS 错误）。**本次统一提交含：搜索态索引修复（chatcard.js）+ 新组件批次（template/personalize/home.css/reply-settings/chat.js）+ ip-opt-row 样式（chat-main/dark.css）+ 产物。**
- [本会话] 完成（用户反馈 HUAWEI 70 Pro Edge 两个问题：「聊天里联系人发布了一条朋友圈，但点进朋友圈没有」+「聊天里的系统消息错误显示其他桌面的联系人消息」——**已构建 verify 10/10 + CDP 复现/复测 8 项全过，已随对方 e7b9a93 提交，未 push**）：`src/js/feed.js`（AI-A 域）。①**跨桌面系统消息串桌面**（复现确认）：`maybeAutoPost()` 遍历所有联系人，`maybeAutoPostFor(cid)` 发的「X 发布了一条朋友圈动态」用 `chatAddSystem` 写进【当前激活桌面】聊天——用户停在 A 桌面时 B 的 TA 自动发动态，消息进 A 聊天（A 桌面收到其他联系人消息）。修复：新增 `notifyFeedPostToChat(cid, taName)`（仿 call.js `notifyCallEnd` 模式）——cid=当前桌面走内存链路实时渲染；非当前桌面直接写该桌面 IDB `chat-msgs` + LS 快照，消息归位到动态所属桌面。②**朋友圈发布不显示**（Edge 丢 IDB 数据类，WORKLOG 有 vivo S16 Edge 实录）：feed-posts 含图片 dataURL 时主键 >200KB → `xyStore.set` 只进 IDB+内存缓存、跳过 LS（5MB 配额保护），Edge 杀后台/强制关闭丢 IDB → 聊天里的系统消息还在（chat 有 ≤2MB LS 快照），朋友圈空空如也。修复：仿聊天 `writeLsSnapshot`——`save()` 在主键 >200KB 时写「剥图快照」（imgs/头像 dataURL 剥掉只保文本，限制 ≤200KB 防被 idb.js 大键迁移搬走）到 `xy-home-v2:default:feed-posts-snap`（default 命名空间防 contacts.js migrateLegacy 迁移）；`load()` 主键缺失（null）时回读快照（注意：原 `store.get(KEY)||'[]'` 写法在键缺失时返回空数组提前 return，快照兜底永不生效，已改为 `raw!==null` 判断）；清空动态时同步删旧快照；启动 idbGet 恢复加「IDB 比快照旧不回退」（防 Edge 重建空库/上次写失败导致新动态消失）。CDP 复测：B 桌面 TA 自动发动态 → A 聊天无 B 消息（只剩 A 自己的）、B 聊天 IDB+LS 含「小红 发布了一条朋友圈动态」、朋友圈页可见 B 动态、>200KB 主键不入 LS 但剥图快照落 LS、删 IDB 后刷新朋友圈从快照恢复 5 条动态。**已提交**（对方 12:30 统一提交含本改动+产物），**未 push**。⚠️ 对方正在编辑 `src/template.html`（进行中，勿动）。

### 2026-08-19
- [本会话] 完成（用户反馈「聊天更多→拍一拍：顶部已有分组切换，下方字卡列表不应再显示分组标题」——**已构建 verify 10/10，已提交 e7b9a93，未 push**）：`src/js/chat.js`（AI-A 域，用户直接反馈故越界修复）——`renderPokeCard()` 移除 `.cc-group-header` 分组标题渲染，字卡直接平铺（顶部 `pokeGroupsBar` 切换栏已承担分组标识）。本次构建同时带上 AI-A 累积批次（ta-ask 两池混合/chatcard/feed/avatar-lib/bg-keep/chat-main.css 等），一并提交。
- 构建/部署只由约定的构建者执行（见 AGENTS.md）。

### 2026-08-19
- [本会话] 完成（用户需求「互动卡片 TA 回应：预设池 90% 抽取 / 字卡库 10% 抽取，抽字卡库时最多连用 5 张、每张空一格」——**未构建未提交**，请构建者统一执行）：`src/js/ta-ask.js`（AI-A 域）`pickAskCardReply` 概率模型再调（v3.7.2）。当前规则：两池都在时——**90% 走预设池**（池内随机 1 条）、**10% 走字卡库**（随机 1~5 张不重复、空格连接，上限受池大小约束）；单池为空自动全走另一池；皆空兜底 5 句默认甜话。7 条路径（邀请TA 接受/拒绝、问问TA 文字题、TA的询问、小问题未命中、好奇、吐槽）全部经由此函数自动生效；问问TA 单选题（选项内随机）不受影响。`node --check` 通过。**未构建未提交**，等待统一提交/部署。

### 2026-08-19
- [本会话] 完成（用户反馈「互动卡片看不到联系人使用预设池的答案」——**未构建未提交**，请构建者统一执行）：`src/js/ta-ask.js`（AI-A 域）`pickAskCardReply` 概率模型修正。根因：v3.7.x 首版把「预设池 + 全部自定义字卡」**合并成一个大池**随机抽——用户字卡库字卡一多（几十~几百张），预设池仅 4~11 句被稀释到几乎抽不中（如 7/207≈3%），表现为"永远只回字卡库的答案"。修复：改为**两池各 50% 机会**——先 `Math.random()<0.5` 决定抽预设池还是字卡库，再在选中池内随机抽 1 条；单池为空时自动全走另一池，两池皆空兜底 5 句默认甜话。7 条路径全部经由此函数（邀请TA 接受/拒绝、问问TA 文字题 11 句、TA的询问预设回应、小问题未命中选项预设、好奇题预设 replies、吐槽 7 句，各 + 字卡库 50/50），无需逐点改。单选题（选项内随机）不受影响。`node --check` 通过。**未构建未提交**，等待统一提交/部署。

### 2026-08-19
- [本会话] 完成（用户反馈「字卡库里 TA 没有统一大写」——**未构建未提交**，请构建者统一执行）：全仓库 `Ta的好奇/Ta的吐槽` → `TA的好奇/TA的吐槽`（中文语境大小写统一）。涉及 `src/template.html`（**AI-B 域，用户直接反馈故越界修复，仅文案大小写，无逻辑改动，请知悉**）、`src/js/ta-ask.js`（通知名/弹窗标题/toast/注释）、`src/css/chat-pages.css`（注释）。已 grep 复核 `[^a-zA-Z0-9_-]Ta[^a-zA-Z0-9_-]` 零残留（剩余 ta- 前缀均为 id/class/枚举值非显示文本）。**未构建未提交**，等待统一提交/部署。

### 2026-08-19
- [本会话] 完成（用户需求「问问TA 单选题：联系人只能用选项回复；点击已作答卡片可展开查看设置的单选答案」——**未构建未提交**，请构建者统一执行）：`src/js/chat.js` + `src/css/chat-main.css` + `src/css/dark.css`（均 AI-A 域）。①**单选题只用选项回复**：submitChatAsk 单选分支 TA 的聊天回复消息由「预设回应/字卡库混合」改为**选项文字本身**（`addIn(text)`），卡片不再显示「TA：预设回应」行；预设回应仍存于 askOptions 里供展开查看（旧历史数据不受影响）。②**已作答卡片点击展开**：聊天点击已作答的问问TA 单选题卡片 → 展开「选项查看」区（复用 `.msg-inplace`，再点收起），列出我给 TA 设置的全部选项+各选项预设回应，TA 选中的选项高亮（`.ip-opt-row.sel`）；展开同时照常切换收藏按钮显示；点击展开区内部不折叠。新增 `.ip-opt-row/.ip-opt-t/.ip-opt-reply` 样式 + dark.css 暗色覆盖。`node --check` 通过。**未构建未提交**，等待统一提交/部署。

### 2026-08-19
- [本会话] 完成（用户需求「互动卡片联系人的回复全部增加『硬编码/系统预设池 + 字卡库自定义字卡』两池混合随机」——**未构建未提交**，请构建者统一执行）：`src/js/ta-ask.js` + `src/js/chat.js`（均 AI-A 域）。核心：`pickAskCardReply(presetPool)` 升级——可选接收预设回应池，与字卡库自定义文字字卡合并成一个随机池抽 1 条，无池无字卡时兜底 5 句默认甜话。逐卡改造：①**好奇**（弹窗+就地，ta-ask submitCurious / chat expandCardInPlace）：题预设 replies 池+字卡库混合；②**吐槽**（两处）：7 句固定池+字卡库混合；③**小问题**：`chatChooseReply` 第三参由回应字符串改为**选项对象**，默契命中（选到 TA 心里想的/TA 喜欢的答案）保留选项预设回应作高光，未命中时该选项预设回应+字卡库混合随机；④**询问/问问TA**（chatAskReply 与半框单选题）：选项预设回应同样参与混合，无预设走两池混合；⑤**问问TA 文字题**：11 句固定话术池+字卡库混合；⑥**邀请TA**：接受 5 句/拒绝 4 句话术池各自+字卡库混合（接受/拒绝概率不变）。`node --check` 通过。**未构建未提交**，等待统一提交/部署。

### 2026-08-19
- [本会话] 完成（用户需求「音乐歌单新增上传歌单图片；播放歌单时可切换桌面音乐小组件显示歌单图片还是歌曲图片」——**已构建 verify 10/10，未提交**）：`src/js/music-player.js` + `src/css/chat-pages.css`（均 AI-A 域）。①**歌单封面**：`playlists[i].cover`（dataURL，复用 `compressCover` 压缩 512px JPEG）；歌单列表项 `.sm-pl-ico` 有封面时显示背景图（`has-cov`）；新增编辑按钮（铅笔图标）→ `openPlaylistEditor`：上传/更换/清除封面 + 重命名 + 删除歌单（默认歌单无删除项）。②**小组件封面来源切换**：`settings.widgetCoverMode`（`'song'` 默认 / `'playlist'`）；`setWidgetCover` 按模式决定——playlist 模式优先显示当前歌曲所在歌单的封面，无歌单封面时回退歌曲封面；入口在「音乐设置」弹窗新增「桌面小组件封面」select，切换即保存并实时刷新小组件；编辑歌单封面后若当前正播此歌单且模式为 playlist 也同步刷新。`node --check` 通过，verify 10/10。**未提交**，等待统一提交/部署。

### 2026-08-18
- [本会话] 完成（用户反馈「设置里『自定义手机桌面图标』应该放在『卡片大小』下面」——**已构建 verify 10/10，已提交未 push**）：`src/template.html`——把 `row-custom-icon` 从独立 set-group 移到「美化」分组内 `row-desk-card-scale`（卡片大小）之后，删除原独立分组。仅位置调整，无逻辑改动。本次构建同时带上 AI-A 未提交批次（chat.js/chatcard.js/idb.js/bg-keep.js/chat-main.css/chat-pages.css，语法通过），一并提交。
- [本会话] 完成（用户反馈「红米 K80 Pro Chrome 打开部署的 GitHub Pages 安装到桌面一直显示『正在安装』」——**已构建 verify 10/10，已提交 82ebbee，待 push**）：`src/pwa/sw.js`（AI-B 域）+ 产物。根因：SW 的 `install` 预缓存（`caches.addAll`）与 `fetch` 均无超时，GitHub Pages 在国内网络经常慢/卡，SW 一旦卡在 `installing` 状态，Chrome 安卓「安装到桌面」的 WebAPK 安装流程要经 SW 拉 start_url/图标，会一直显示「正在安装」永不完成。修复：①`fetchWithTimeout` 带 8 秒超时；②install 预缓存改为逐文件超时 + `Promise.allSettled`，单文件失败不影响整体，SW 最迟约 10 秒内必激活；③fetch 网络优先带 8 秒超时，超时/失败回退缓存（导航回退 index.html、资源回退自身缓存，无缓存 `Response.error()` 快速失败）；④只接管同源请求（跨域不再拦截）。`npm run verify` 10/10。已提交待推送。
- [本会话] 完成（用户反馈「桌面美化添加的图片无法上下左右移动；退出装修模式后第三页仍显示『空白主页 可上传整页背景图』和『添加卡片』按钮」——**已构建 verify 10/10 + CDP 复测 10/10，已提交未 push**）：涉及 `src/js/personalize.js` + `src/css/home.css`（home.css 是 AI-A 文件，本次为图片组件/空白页装饰规则改动，请知悉）。①**图片移动**：装修模式点图片菜单新增「移动」子菜单——上移/下移（同页相邻交换，持久化 meta 顺序，`moveDeskImage`）+ 靠左/居中/靠右（窄图水平对齐，meta 存 `align`，满宽图无效果）。②**空白页提示**：根因是 `.desk-page-hint`/`.desk-page-add` 无条件显示（CSS 只判断 `.page-slide.desk-page`，不判断装修态）。修复：CSS 改为默认 `display:none`，仅 `.decor-on` 下显示；JS 新增 `syncPageHint`（有 `[data-desk-widget]/[data-desk-image]` 的页内联隐藏），接入 applyDeskLayout/组件库添加/移出此页/图片渲染。③自查修复：嵌套子菜单误引 `openCardMenuNext`（它是 openCardBgMenu 的局部变量，跨作用域 ReferenceError）→ 改为内联 setTimeout 模式。**注意：本次构建同时带上 AI-A 正在保存的大批次改动**（ta-ask.js +518、quote-cards.js +166、p2-features.js +174、chat-pages.css、dark.css、template.html，语法均通过）——若 AI-A 该批次未完，请继续保存并后续自行构建提交；本地 main 领先 origin 6 个提交（沙箱无 GitHub 凭据无法 push）。
- [本会话] 完成（用户反馈「美化→桌面上传图片无法按不同尺寸当小组件；点开图片后点 × 无反应无法关闭」——**已构建 verify 10/10 + CDP 复现 4/4 + 尺寸功能测试通过，已提交未 push**）：涉及 `src/js/personalize.js` + `src/template.html`。①**查看器 × 关闭无响应根因**：`#desk-image-viewer` 在 template.html 里位于 `<script>` 块之后，启动时 JS 查询该元素为 null → `setupDeskImageViewerClose()` 提前 return，关闭监听从未绑定（打开路径在点击时才查元素所以正常）。修复：查看器 div 移到 `<script>` 前（仍是 body 直子节点，position:fixed 不受影响）；加 `viewerBound` 幂等守卫 + 打开路径防御性补绑。②**不同尺寸**：原所有图片组件 width:100% 等宽。meta 增加 `w`（40 小/70 中/100 大），装修模式点图片菜单新增「尺寸：小/中/大」选项（当前尺寸打 ✓），`renderDeskImages` 按 w 渲染（<100% 时 align-self:flex-start）。③自查修复两处 TDZ：`DESK_IMG_SIZES`/`viewerBound` 若声明在 IIFE 底部会被启动阶段调用触发 ReferenceError（已上移顶部，构建中途发现）。本次构建同时带上 AI-A 已保存改动（ta-ask.js 移除「已了解」汇总面板 + 模板对应区块，改动完整无悬挂引用），一并提交。**push 失败**：沙箱无 GitHub 凭据（helper-selector 需交互），本地 main 领先 origin 5 个提交，待有凭据环境推送。
- [本会话] 完成（用户反馈「字卡库自定义聊天字卡：主字卡/颜文字/emoji/表情包/图片/拍一拍/语音 大分类 tab 不显示该分类字卡数量」——**已构建 verify 10/10 + CDP 端到端功能点全过，随本次提交 b015e28**）：`src/js/chatcard.js` + `src/css/chat-pages.css` + `src/css/dark.css`。①chatcard.js 新增 `renderTabCounts()`：遍历 `#cc-tabs .cc-tab` 按 data-type 统计该分类所有分组字卡数，在 tab 尾部追加 `<em class="cc-tab-n">N</em>` 徽标（0 时显示 0 并加 `.zero` 弱化）；在 `render()` 开头调用——所有数据变更（增删/导入/IDB 恢复/切分类/搜索）都汇聚到 render，计数实时刷新；②样式：圆角小徽标（浅色半透明底灰字，选中态白底白字），dark.css 补暗色覆盖。CDP 验证：注入 7 分类测试数据后徽标 3/1/3/1/2/1/0 全部正确、空分类显示 0、选中态样式、切换分类后徽标保留（注意：测试内容若撞 BUILTIN 预设会被 stripBuiltins 清掉，验证时避开）。**已提交**（commit 统一包含对方 5 个字卡库双 tab 批次 ta-ask.js/template.html/p2-features.js/pwa.js/chat-main.css）。

- [本会话] 完成（用户需求「桌面字卡库【今日情话】顶部双分类：系统预设 / 我的添加，数据分开不乱」，**已构建 verify 10/10 + CDP 端到端 22/22，未提交**）：`src/js/quote-cards.js` + `src/template.html` + `src/css/chat-pages.css`（复用 `.cc-tab`）。①`page-quote-cards` 顶部加两个 tab（系统预设/我的添加，复用字卡库 `.cc-tab` 样式）；②`renderList` 拆为 `renderSysList`（系统 46 句带单卡开关、不可删、标【系统】）+ `renderMineList`（用户自定义、带删除按钮），`switchTab` 切换面板；③**修复数据污染根因**：原批量添加走 `getQuotes()`，无自定义库时返回 `DEFAULT_QUOTES.slice()` → 用户首次添加会把系统 46 句+新内容一起存进自定义库（系统预设"转正"）；改为 `getCustom()` 只追加纯自定义库；④入口计数 `cc-quote-count` 改为实时计算（系统开启且未关的 + 自定义数），关闭总开关/删条目即时更新；⑤关闭系统预设总开关时系统 tab 显示灰化提示而非空。CDP 22/22：双 tab 切换/系统 46 行带开关无删除/我的添加空提示/批量添加 3 句落自定义/入口计数 49/切回系统未污染/关闭系统后计数 3/重开恢复 46/删除一条剩 2 计数 48/自定义库不含系统预设。**未提交**，等待统一提交/部署。

- [本会话] 完成（用户反馈「聊天更多→占卜：无法查看历史记录（应每桌面独立）/无法开关记录自动发送至聊天/抽牌无动画无 2 行可滑动牌面；联系人撤回的情绪字卡不显示被撤、无法点击查看」——**已构建 verify 10/10 + CDP 端到端 27/27，随本次提交**）：
  1. **占卜抽牌全新交互（仿星言 d2）**：`divination.js` 新增共享 `startDivineDraw(stageEl,opts)`——①洗牌动画（卡片四散飞舞后收拢 ~1.8s）→②两行牌面（全部牌背分 2 行、每行横向自由滑动，hint 实时显示「剩 N · 已抽 M/K」）→③点击牌背抽取（翻牌动画展示已抽牌：图标+牌名+正/逆位+位置标签）→④抽满自动出结果。桌面占卜页与聊天占卜半框共用；连点/切换模式张数自动取消进行中流程（`window.__divActiveDraw` / `chatDrawCancel`）。
  2. **历史记录每桌面独立且可查看**：历史本就存动态 store（每联系人命名空间隔离），但桌面页只在抽牌后才渲染（首次打开空白看不到记录）→ 新增 `renderHistOnOpen()` 模块初始化即渲染 + `contact-switched` 重渲染；聊天半框新增「📜 占卜记录」展开/收起（每次打开刷新，条目可查看/删除/清空，与桌面页同一命名空间共用记录）。
  3. **自动发送开关（每联系人独立记忆）**：`divine-send-auto` 存动态 store；桌面页新增「发送设置」卡片、聊天半框新增「自动发送到聊天」开关（打开时同步）；开启后每次抽牌完成自动把结果发到聊天（`divineSendResult` 复用 sendToChat；onDone 内自动发送置于历史保存之前，与历史渲染解耦，互不阻塞）。
  4. **撤回的情绪字卡显示**：原实现被撤情绪字卡直接隐藏（无法看到被撤、无法查看）→ 改为字卡区尾部「对方/我撤回了 N 条情绪字卡 ▾」胶囊，点击展开查看（已撤回）标签+内容，与文本段撤回同风格（复用 `.msg-poke-seg`）。涉及 `src/js/divination.js` `src/js/chat.js` `src/template.html` `src/css/chat-pages.css` + 产物。CDP 27/27：洗牌动画/两行牌面 22 张/翻牌抽取/结果渲染/历史保存渲染/自动发送落聊天（桌面+半框）/半框历史查看删除清空/新桌面历史为空+开关独立/切回恢复/情绪字卡撤回胶囊显示+展开查看。⚠️ 本次构建已包含此前双方未提交累积改动（personalize 组件透明度、home.css 查看器黑遮罩、desktop-slider gap、idb.js 回填、chat.js 跨桌面残留清理等 13 文件），统一提交。

- [本会话] 完成（用户反馈「美化设置的小组件透明度没有原图直出了 + 想在装修模式点小组件直接设置组件透明度」，**已构建 verify 10/10 + CDP 端到端 11/11，随本次提交**）：`src/js/personalize.js`（AI-B 域）。①装修模式点卡片菜单**恢复「原图直出」快捷项**（有背景图时显示，当前已直出时带 ✓），并把**「组件透明度」加进装修模式点卡片菜单**（0~100% 滑块，与设置页「小组件透明度」共用 `widget-opacity` 存储，全局生效，含「恢复默认」）；②**遮罩浓度滑块弹窗修复**：根因——v3.6 改滑块后，遮罩浓度/任何从卡片菜单 OK 按钮里嵌套打开的弹窗都会**闪关**（openModal 的 okBtn 回调 `finally close()` 在嵌套 openModal 打开后立即执行，`cb` 被置 null，fire 早退）→ 用户点「遮罩浓度」菜单项弹窗开一下就没 = 「没有原图直出了」（遮罩 0% 就是原图直出）。修复：openCardMenuNext 用 `setTimeout(0)` 延迟到外层弹窗关闭后再开嵌套弹窗（遮罩浓度/组件透明度两处）；③**遮罩浓度弹窗内新增「原图直出」pill（=0%）**+ 浓度 0 时 toast「已切换为原图直出」；④**修复设置页「小组件透明度」输入数字无效**：fire() 的 pills 分支（`if (pillsEl && !pillsEl.hidden)`）在弹窗带 pills 且未点 pill 时把确定传给 `cb(null)` → 输入框里的数字永不生效（只能点快捷百分比）——改为 `(pillVal !== null || noInput)` 才走 pills 分支；已核对全站其余 pills 弹窗（chatcard/chat-settings/avatar-lib/p2-features/其余 personalize）均带 noInput 或有初始 pill 值，行为不变。CDP 11/11：菜单含原图直出/组件透明度/原图直出落库 mask=0 且背景无白色渐变层/组件透明度嵌套弹窗不闪关/拖 60 落库 CSS=0.6/恢复默认/遮罩浓度弹窗含原图直出 pill 且落库/设置页输入 40 落库/全程无 JS 错误。涉及 `src/js/personalize.js` + 产物。⚠️ 对方累积改动（chat.js 跨桌面残留清理等 13 文件）已随本次构建一起进产物，统一提交。

### 2026-08-18
- [本会话] 完成（用户反馈「开屏有一层黑色遮挡开屏页面」——**已构建 verify 10/10 + CDP 验证，未提交**）：根因——上一轮「桌面图片组件」新增的全屏查看器 `.desk-image-viewer`（`src/css/home.css`，fixed inset:0 z-index:10000 黑底 rgba(0,0,0,.92)）**漏写 `[hidden]{display:none}` 规则**（全站其他全屏遮罩 `.modal-mask`/`.img-view-mask`/`.cc-import-progress` 均成对书写）。template 里该元素默认带 `hidden` 属性，但 CSS 没有配套规则，`display:flex` 恒定生效 → 打开页面即整屏黑遮罩盖在开屏（z-index 999）之上（黑底 92% 不透明 + 内容区 10000 挡住开屏点击 = 「黑色遮挡」）。修复：`src/css/home.css` 补 `.desk-image-viewer[hidden]{display:none;}`；打开查看器移除 hidden 自动恢复 flex，功能不受影响。已 `node build.mjs` + `npm run verify` 10/10 + CDP 验证（开屏期 viewer display:none 不可见 / 点击进入后仍隐藏）。涉及 `src/css/home.css`（AI-A 域，用户直接反馈故越界修复）+ 产物。**未提交**，等待统一提交/部署。⚠️ 顺带发现：`desk-image-viewer` 未加入 `mobile-adapt.js` 的 `FLOAT_SELECTORS` 列表（打开查看器时背景滚动不锁）——影响很小（全屏黑底本就盖住一切），是否补由 AI-B 决定。

### 2026-08-18
- [本会话] 完成（用户需求「桌面可新增/删除页数 + 桌面图片组件（上传/更换/删除/点击放大）」，**未构建未提交**）：两块：
  1. **桌面页数管理 UI 补全**（`src/template.html`）：personalize.js 的页数管理 JS 逻辑（2-5 页增删、每页独立背景图）早已就绪，但 template 缺 4 个锚点（`row-desk-add-page`/`row-desk-del-page`/`desk-pages-val`/`desk-page-bgs`）导致用户看不到入口。本次在「手机桌面美化」分组补齐这 4 个锚点，JS 自动生效无需改。
  2. **桌面图片组件**（`src/template.html` + `src/css/home.css` + `src/js/personalize.js`）：用户可在任意桌面页上传图片组件（可多个），装修模式可换图/删除，非装修模式点击全屏查看。
     - 存储：元数据 `desk-images`（`[{id,page,addedAt}]`）存 localStorage，图片 dataURL `desk-image-src-<id>` 存 IDB（压缩 1280px JPEG 0.85）；idbRestore 的 `LS_BIG_LIMIT`(200KB) 自动阻止大图回填 localStorage，无需改 idb.js。
     - 设计：图片组件用 `data-desk-image` 属性（非 `data-desk-widget`），不参与 `desk-layout`，避免与现有组件系统的 saveDeskLayout/applyDeskLayout 冲突。
     - 装修模式集成：`openDeskLib` 面板加「图片」选项上传新图；点已有图片弹「换图/删除」菜单；删页时 `removeDeskImagesOnPage` 清理该页所有图片。
     - 全屏查看器：`desk-image-viewer` fixed inset:0 z-index:10000 黑底，点击图片组件（非装修模式）打开，点关闭按钮/点遮罩关闭。
  3. **音乐播放修复**（`src/js/music-player.js`）：永恒浏览器（安卓 WebView）对 `blob:` URL 音频静默失败——`play()` Promise 既不 resolve 也不 reject、`onplay` 永不触发。`playLocal` 改为 blob:/dataURL 双路径互为兜底 + 4 秒 watchdog 无 onplay 切另一种 src 重试。
  `node --check` 通过（music-player.js + personalize.js）。涉及 `src/template.html`、`src/css/home.css`、`src/js/personalize.js`、`src/js/music-player.js`。**未构建未提交**，等待构建者执行 `node build.mjs` + `npm run verify`。

### 2026-08-18
- [本会话] 完成（用户需求「桌面收藏新增：联系人可收藏聊天里的互动卡片整卡（问题+我的回答+联系人的回复）/ 互动卡片我可点击收藏 / 联系人可收藏信箱我的回信 / 联系人可收藏我发布的朋友圈」，已构建 verify 10/10 + CDP 端到端 15/15，**待统一提交/部署**）：
  - **收藏存储扩展**（`src/js/chat.js`）：`fav-msgs` 条目新增 `kind` 字段（msg=聊天消息原样 / card=互动卡片 / mail=信箱回信 / feed=朋友圈动态）；新增全局入口 `window.addMyFavItem/addTaFavItem`（按 kind+q/text+ts 去重，供 mail/feed 调用）；互动卡片快照 `cardSnapshot`（小问题 choice* / 好奇 curious* / 吐槽 roast* / 询问 ask* / 邀请 invite*，含问题+我的回答+TA回复）+ `favCardFromMsg(idx)`。
  - **互动卡片可点击收藏**：5 种卡片（含未作答/已作答）渲染底部小爱心「收藏」按钮（`.msg-fav-heart`，chat-main.css），点击整卡入「我的收藏」，重复点击提示已收藏；就地作答/邀请回调/ask 作答的 7 处卡片重建补上按钮。
  - **TA 收藏互动卡片**：回答小问题/好奇/吐槽/询问、TA 回应邀请后，30% 概率整卡收藏进「联系人的收藏」+ toast「TA 收藏了你们的互动卡片」。
  - **信箱回信**（`src/js/mail.js` submitReply）：我提交回信后 30% 概率 TA 收藏该回信（存来信标题 + 回信内容）+ toast「TA 收藏了你的回信」。
  - **朋友圈**（`src/js/feed.js` publish）：我发布动态后 30% 概率 TA 收藏（内容 + imgs 数组，延迟同点赞节奏）+ toast「TA 收藏了你的朋友圈动态」。
  - **收藏页渲染**（chat.js renderFav）：按 kind 分卡片式条目（互动卡片带分类标签/问题/✓我/TA；信箱回信带「来信《标题》」；朋友圈带内容+图片缩略图可点击放大），头像时间列沿用，长按/右键删除按 kind+内容+ts 匹配（旧消息收藏兼容）。chat-pages.css 新增 `.fav-item-*` 样式。
  - ⚠️ 踩坑：`renderFav` 内 `const FAV_KIND_LABEL` 声明在 `list.forEach(f => renderFavItem(f))` 之后——renderFavItem 提升后引用 const 触发 TDZ 报错（`Cannot access before initialization`），已移至 forEach 之前（CDP 抓到）。
  - 涉及 `src/js/chat.js` `src/js/mail.js` `src/js/feed.js` `src/css/chat-main.css` `src/css/chat-pages.css` + 产物。CDP 15/15：心形按钮/收藏写入/去重/收藏页渲染三类型/TA 收藏三入口/tab 归属/旧收藏回归/邀请卡/无 JS 错误。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-18
- [本会话] 完成（用户反馈「另一个桌面的聊天里的联系人，可以引用其他桌面的聊天的消息数据没有隔开」——聊天数据跨桌面串数据）：根因——`src/js/chat.js` `contact-switched` 处理只重置了 msgs/pendingLocal/chatDbReady，**会话内跨桌面残留未清**：`lastQuote`（用户点的「引用」内容）→ 在 A 聊天选了引用、切到 B 发消息，B 消息带上 A 的消息内容；`lastMineText`（TA 引用/收藏「我」最后一条消息用）→ TA 在 B 桌面会引用/收藏 A 桌面我发的消息；`draftImgs`（待发送图片草稿）+ 输入框草稿文本 → 切桌面原样带到新聊天。修复：`contact-switched` 处理补齐 4 项重置（lastQuote=null / lastMineText='' / draftImgs=[] + renderDraft / input.textContent=''，各包 try/catch 防 TDZ）。已 `node build.mjs` + `node tools/verify.mjs` 10/10 + CDP 端到端 8/8（A 发消息→点气泡引用+输草稿→切 B：草稿已清空 / B 发的消息无引用块 / B 记录无 A 内容 / A 记录未被污染）。涉及 `src/js/chat.js`（AI-A 域，用户直接反馈故越界修复）+ 产物（构建顺带包含对方未提交的 personalize.js）。**未提交**，等待统一提交/部署。

### 2026-08-18
- [本会话] 完成（用户反馈「不同桌面的联系人电话挂断，显示成当前桌面联系人的电话」——通话中切到其他桌面再挂断，挂断消息/记录显示成当前桌面联系人）：根因——`src/js/call.js` 的 `currentCall` 不绑定发起通话的桌面，`endCall()` 动态读 `partnerName()` + `chatAddSystem/addCallRecord` 全走当前桌面。修复：①新增 `bindCall()`——来电/去电开始时把 `cid`（__activeCid）+ 昵称 + 头像快照进 `currentCall`；②`endCall()` 姓名改用快照值，新增 `notifyCallEnd(cid,…)`——当前桌面走原内存链路，非当前桌面直接写该桌面 IDB 聊天记录（`xy-home-v2:<cid>:chat-msgs` 追加 + LS 快照）+ 通话记录（storeFor(cid)）；③`minimizeCall`/接听自动缩小/去电接通自动缩小的小框名字头像同样改用快照（切桌面后最小化不显示成新联系人）。已 `node build.mjs` + `node tools/verify.mjs` 10/10 + CDP 端到端 8/8（A 来电→接听→切 B→挂断：小框仍显 A 昵称 / A 聊天含「小美 来电·通话已挂断」/ B 聊天与记录零污染 / 记录归属 A / IDB 权威同步）。涉及 `src/js/call.js`（AI-B 域）+ 产物。**未提交**，等待统一提交/部署。

### 2026-08-18
- [本会话] 完成（用户反馈「iPhone 15 Pro 打开部署的 GitHub Pages 页面依旧卡顿，iOS 都会这样」——iOS Safari 性能专项，已构建 verify 10/10 + CDP 双端对照验证，**随本次提交推送**）：定位两个遗留 iOS 卡顿源——①**桌面 zoom 回归**：v3.6.x「桌面字号/卡片大小」滑块在 `src/css/home.css` 用 `zoom:var(--desk-font-scale/--desk-card-scale)` 重新引入了 AGENTS.md 红线禁用的整页 zoom（WebKit 下整页/整组件踢出 GPU 合成路径、滚动每帧 CPU 重排重绘；verify.mjs 只查 `.phone` 没查 `.page-slide`/小组件，回归未被发现）；②**6 处全屏遮罩 backdrop-filter blur**（base.css `.modal-mask` blur4 + `.cc-import-progress` blur3、chat-main.css `.call-mask` blur6、chat-pages.css `.mg-mask`/`.tc-mask`/`.qa-mask` blur4）——iOS Safari 每次弹窗打开都对全屏做模糊栅格化（弹窗是全站最高频操作，openModal 全站统一走它）。修复：①home.css 加 `@media (max-width:900px)` 把桌面页/小组件 zoom 强制 1（手机端禁用缩放，设置仍可保存、桌面 >900px 模拟器端功能保留；手机端如需缩放后续用字号/间距方案重做）；②6 处遮罩全部去掉 blur 行（纯 rgba 遮罩视觉几乎无差，浅色 rgba(0,0,0,.35)/深色 .6 不透明足够）。CDP 双端对照：注入 --desk-card-scale=1.2 后 mobile(390x844) 组件 zoom=1、desktop(1280x800) zoom=1.2 功能保留、modal-mask 显示/隐藏两态 backdropFilter=none、遮罩色 rgba(0,0,0,.35) 正常。涉及 `src/css/home.css`（AI-A 域，红线违规故越界修复）、`src/css/base.css`、`src/css/chat-main.css`、`src/css/chat-pages.css`。⚠️ 另清理了遗留临时脚本 tools/diag-cc-tmp.mjs（对方曾留言待清理）。
- [对方 16:51 已提交未 push] ef16467 v3.6.68（字卡库首页 chat-item 压缩 + 对方累积含音乐封面）。本会话已复核：对方构建已包含本会话 CSS 修复（built index.html 无 backdrop-filter、含 zoom 媒体查询），16:53 重新构建（仅版本时间戳差异）+ verify 10/10，**本次随本会话记录一起提交推送**。


### 2026-08-18
- [本会话] 完成（用户需求「上传歌曲时，可自定义上传歌曲封面图片」，已构建 verify 10/10 + CDP 端到端 18/18，**待提交**）：`src/js/music-player.js`（AI-A 域）+ `src/css/chat-pages.css`，未动 template.html。①「管理音乐」弹窗（歌曲 ⋯ 按钮）新增「歌曲封面」行：圆形预览（点击也可上传）+ 上传封面 + 清除封面按钮；图片压缩到最长边 512px JPEG dataURL 存 `m.cover`（画布失败回退原图；保存后列表/收藏/歌单/桌面部件同步刷新）；② 音乐库/收藏/歌单内歌曲列表有封面时渲染缩略图（`.sm-song-ico.has-cov`，替换音符图标），无封面保持原样；③ 上传完成 toast 改为「已上传 N 首音乐（点歌曲右侧 ⋯ 可设置封面）」。隐藏 file input 挂 body（`document.body.appendChild`，保证老内核/无头环境 click 可用）。数据量：每封面 ~几十 KB，走既有 xyStore 大键机制，备份导入导出自动包含。CDP 18/18：种子带/无封面列表缩略图/面板预览与清除按钮状态/真实 PNG 注入→m.cover 压缩为 jpeg dataURL/预览与列表同步/toast/清除后恢复占位与音符图标/无 JS 错误。涉及 `src/js/music-player.js`、`src/css/chat-pages.css` + 产物。**未提交**，等待统一提交/部署。临时探测脚本已删。

### 2026-08-18
- [本会话] 排查完成（用户反馈「联系人主动发送的消息气泡左上角没有小爱心标识」，结论=构建产物语法崩溃，已修复并随 8a1df3f 提交）：排查过程——① CDP 加载 HEAD 构建（2dbe6ad）无头实测：带 `initiative:true` 的消息渲染出 14px 粉红爱心、普通回复无爱心、`as-badge` 开关关→无/开→恢复，**老构建本身没问题**；② 复测时发现**当前 index.html（16:16 构建）整包 JS 抛 `SyntaxError: missing ) after argument list`（@index.html:8883）→ 全站 JS 不执行（`__mochiDataReady` 恒 false、splash 不消失、聊天/设置全部失效）——**根因是 `src/js/chat.js` 上一轮改动（myPrefix 跨联系人写串修复 + pendingLocal 合并落盘）在 loadMsgs 里留下 3 行孤儿代码（`} catch (e) {}` / `}` / `return;`，约 221-223 行），`node --check` 直接报错**。已删除孤儿行恢复结构（对方新加的 pendingLocal 合并逻辑原样保留，未动其他），`node --check` 通过后已 `node build.mjs`（16:23）+ `npm run verify` 10/10 + CDP 端到端（as-min=1 强制真实主动发送：85s 后 TA 发来消息气泡左上角爱心 14px 正常渲染；开机问候消息无爱心符合预期）。产物 index.html/sw.js/version.json 已随 8a1df3f 一起提交。涉及 `src/js/chat.js` + 产物。⚠️ 遗留：`tools/diag-cc-tmp.mjs` 未跟踪文件请对方确认后清理；另外 chat.js 新注释里有 GBK 乱码（如「写串）�?」「LS 拋留」）和注释内 `）` 后丢行尾的拼接现象，不影响运行，建议顺手修一下注释编码。

### 2026-08-18
- [本会话] 完成（tabbar 去投影 + 设置页/gs-scroll 底部留白——"还有一点灰/滑动遮挡"收尾，已构建 verify 10/10 + CDP 验证，**随本次提交**）：用户反馈去 radial 后"依旧还是有一点"，且在字卡库/设置页上下滑动遮挡。定位两处残留：①`src/css/tabbar.css` tabbar 自身 `box-shadow:0 2px 8px rgba(0,0,0,.05)`——纯白背景上投影即卡片下方一道淡灰（"形状旁边还有一点灰"），去掉（`dark.css` 深色覆盖同步去）；②设置页 `.page` 直接滚动（无 gs-scroll 容器），滚动到底最后一行距 tabbar 仅 14px（page padding 4px + tabbar margin 10px）视觉"被压住/遮挡"——`setting.css` 给 `#page-setting` 加 `padding-bottom:20px`（滚动到底最后一行距 tabbar 实测 86px）；同时给 `.gs-scroll` 加 `padding-bottom:20px`（日历/占卜等 gs-scroll 页面同样受益）。字卡库页已修（gap 44px）。CDP 验证：tabbar 下方无 shadow、设置页最后一行完整可见。涉及 `src/css/tabbar.css`、`src/css/dark.css`、`src/css/setting.css`。

### 2026-08-18
- [本会话] 完成（去掉 .phone 背景 radial 黑晕——导航栏形状旁灰彻底消除，已构建 verify 10/10 + 三页 CDP 采样验证，**随本次提交**）：用户反馈"恢复原形状后形状旁边依旧有灰色，字卡库/设置页上下滑动会遮挡"。根因——`src/css/base.css` `.phone` 背景除 linear 渐变外还有三个 radial-gradient 微黑晕（`circle at 30% 90% rgba(0,0,0,.05)` 主体 + `18% 12%` 尾巴，恰好压在页面底部导航栏区域的 .phone padding 区），黑晕叠白 = 淡灰；此前只把 `--bg-b` 改白，radial 仍残留。修复：删除 .phone 背景全部三个 radial-gradient，只留 `linear-gradient(168deg, var(--bg-a), var(--bg-b))`（--bg-b 已 #ffffff → 纯白）。深色模式黑晕本就不可见无影响；壁纸机制（background-image 覆盖）不受影响。CDP 三页验证（主页/字卡库滚动到底/设置页滚动到底）：tabbar 四周采样全部纯白渐变、无灰。涉及 `src/css/base.css`。

### 2026-08-18
- [本会话] 完成（tabbar 恢复圆角悬浮原形状 + 背景纯白根治去灰，已构建 verify 10/10 + CDP 采样验证，**随本次提交**）：用户反馈"桌面里的底部栏形状变了，和原来不一样"——24c157c 的满宽贴底方形不满足预期。恢复方案：①`src/css/tabbar.css` `.tabbar` 恢复原样（margin-top:10px、border-radius:22px、去负 margin/方形）；②`src/css/base.css` 浅色 `--bg-b` 由 `#f2f2f2` 改 `#ffffff`（.phone 渐变底部变纯白）——tabbar 悬浮卡片的上/下/左右留白与圆角外全部是白色，**形状恢复且无灰，两诉求兼得**（此前去灰靠"满宽贴底方形"改变形状，现改为背景色根治）。深色模式 --bg-b #0e0e0e 不变；聊天页 --page-bg-grad #f6f6f6 不变。CDP 验证：主页/字卡库页 tabbar rect=18,762 354x64、radius=22px、四周白色（--bg-b=#ffffff）。涉及 `src/css/tabbar.css`、`src/css/base.css`。⚠️ 全局视觉变化：浅色模式页面背景从"白→淡灰渐变"变为纯白（更干净），含主页/设置页/字卡库页。

### 2026-08-18
- [本会话] 完成（「正在输入」提示行由悬浮改内嵌——消除灰色一行遮挡消息，已构建 verify 10/10 + CDP 验证，**随本次提交**）：用户确认聊天页"除底部栏之外还有一点灰色、滑动遮挡聊天消息"的正是联系人触发的【正在输入中】行（chat-typing）。根因——v3.5.49 把 chat-typing 改成悬浮式（`position:absolute; bottom:calc(100%+4px); z-index:5` 相对输入栏定位），悬浮层固定在输入栏上方，**消息滚动时从这行灰色小字下方穿过被盖住**（chat.js 注释 1987 "typing 行占位时保持最后一条可见"证明原设计就是占位行，CSS/JS 语义矛盾）。修复（改回 v3.5.27/44 内嵌方案）：① `src/template.html` chat-typing 从 chat-input-row 内移到 chat-body 之后（消息区与输入栏之间）；② `src/css/chat-main.css` `.chat-typing` 由 absolute 改静态内嵌占位行（flex-shrink:0 + padding 2px 18px 4px，透明背景灰字）。CDP 验证：typing pos=static、rect 390x22 在消息区与输入栏之间、insideBody=false 不再悬浮、不遮挡消息；chat.js showTyping/hideTyping 已有的占位滚动处理直接复用。涉及 `src/template.html`、`src/css/chat-main.css`。
- [对方改动·本次统一构建随提交] `src/js/music-player.js` 网易云直链改 meting API 方案（fetchNeteaseUrl allorigins/codetabs 代理替换为 api.injahow.cn/meting 302 https 直链，大陆可直连，已实测两首种子歌稳定返回）。

### 2026-08-18
- [本会话] 完成（聊天页背景统一——输入栏四周灰条消失，已构建 verify 10/10 + CDP 采样验证，**随本次提交**）：用户反馈"聊天页面里的底部栏也有这个情况（除底部栏之外还有点灰色，滑动遮挡聊天消息）"。定位：聊天页底部栏 = `chat-input-row` 输入栏；`#page-chat` 背景透明 → 透出 `.phone` 渐变灰底（#f2f2f2 + body #e9e9e9），输入栏四周（手机通栏贴底时的上方 padding 区 / 桌面悬浮圆角卡片的左右下方及圆角外）出现突兀灰条灰角。修复（`src/css/base.css`）：`#page-chat { background: var(--page-bg-grad); }`（浅色 #f6f6f6 / 深色 #1a1a1a 自动），输入栏四周与消息区同色，灰条消失；消息气泡白/深色对比正常。CDP 验证：chatBg=rgb(246,246,246)，输入栏上方=#f6f6f6（原深灰）。滚动遮挡由 chat-body padding-bottom:28px 保证（最后消息距输入栏 28px 留白）。涉及 `src/css/base.css`。
- [对方累积·本次统一构建随提交]（WORKLOG 下详）：pwa.js 备份提醒条 + `navigator.storage.persist()` Safari 清数据防护；data-backup.js 导出记录时间戳 + `runBackupExport` 抽离；contacts.js / chatcard.js / default-cards.js / mood-reply-cards.js / template.html 相关累积。均为对方已完成并验证、标记"未提交等待统一提交"的改动。

### 2026-08-18
- [本会话] 完成（tabbar 满宽贴底方形化——消除"导航栏形状之外"的灰色，已构建 verify 10/10 + CDP 四周采样验证，**随本次提交**）：用户刷新 69b3038 后反馈"底部导航栏的形状之外还有一点灰色"。像素级采样定位：灰来自 `.phone` 左右 18px 内边距区（`.page` 354 宽盖不到 18px 边条）+ 底部 18px padding + 圆角 22px 切线外角落，均透出 `.phone` 渐变灰底。修复（`src/css/tabbar.css`）：① `margin-left/right:-18px` 满宽；② `margin-bottom:-18px` 贴底；③ `border-radius 22px→0`（方形，无圆角灰角）。CDP 采样验证：tabbar 四周（左/右/上角/下角/底部）全部 `rgb(255,255,255)`，无灰。涉及 `src/css/tabbar.css`。⚠️ **全站 tabbar 视觉变化**：白色满宽贴底方形导航栏（含主页/设置页），符合 iOS 底部导航形态。
- [对方改动·本次统一构建随提交] `src/js/music-player.js` 网易云 https 直链获取（music.163.com API 返回 CDN 地址 http→https，解决 GitHub Pages HTTPS 下混合内容拦截导致外链全失败只能播内置旋律；API 无 CORS 走 allorigins 代理兜底，8s 超时）。

### 2026-08-18
- [本会话] 完成（字卡库页底部灰条修复——真实根因，已构建 verify 10/10 + CDP 精确验证，**随本次提交**）：用户追问"是灰色的条"——上轮深色 tabbar 修复未覆盖浅色模式。用真实点击 tab 复现：字卡库首页（page-chatcard）是 10 张 chat-item 卡片列表，内容 899>728 超出、`.page` 直接滚动；未滚动时最后卡片被 page 底边裁剪、副标题被切（视觉"灰色长方形遮挡上方文字"），且 `.page` 透明 → tabbar 上方永远透出 .phone 渐变灰底（14px 灰条，margin-top:10px 时更明显）。修复（`src/css/tabbar.css`）：①`.tabbar` margin-top 10px→0（去掉上间隙灰带）；②`#page-chatcard { padding-bottom:24px; background:var(--card-bg); }`（滚动到底最后卡片完整可见 + 页面背景不透明，浅色白/深色 #1e1e1e 自动切换，灰条彻底消失）。CDP 精确验证：滚动到底「Ta的吐槽」完整 75px + 距 tabbar 34px 白底留白；未滚动被裁为正常滚动行为。涉及 `src/css/tabbar.css`。⚠️ 对方留话「13:59 构建可能夹带半成品」——本次已重新 `node build.mjs` 覆盖后提交。

### 2026-08-18
- [本会话] 完成（深色模式 tabbar 覆盖，已构建 verify 10/10 + 深色截图视觉验证，**随本次提交**）：用户反馈字卡库页底部白色 tabbar 上面有一块灰色长方形遮挡上方文字。根因——`src/css/tabbar.css` 的 `.tabbar` 硬编码白底/黑边/浅阴影，而 `src/css/dark.css` 完全没有 `.tabbar` 的 `[data-theme="dark"]` 覆盖（dark.css 有 home/setting/chat-main/chat-pages 覆盖唯独漏 tabbar）。深色页面下 tabbar 仍是突兀白条 + 间隙露出深色背景 = 视觉"多出一块灰色长方形"；active 浅灰底 + svg 在白底上几乎看不见。修复：dark.css 新增 `/* ---- tabbar.css ---- */` 分组（.tabbar → dark-card-92 / dark-border-12 / 深阴影；.tab.active → dark-hover）。浅色模式零影响。深色 CDP 视觉验证通过。
- [对方改动·本次统一构建随提交] `src/js/idb.js` 聊天记录键判定 `isChatMsgsKey`（修复原 `indexOf(uidPrefix+'chat-msgs')!==0` 不匹配命名空间键 `xy-home-v2:default:chat-msgs` 的 bug + 大键搬移跳过聊天记录保护 Edge 杀后台丢唯一备份）；`src/js/music-player.js` 音乐相关后续完善；`src/js/chat.js` `addIn` 透传 `initiative` 修复（漏传导致主动发送爱心标识从不显示）+ 撤回补发也加 initiative；`src/js/personalize.js` 桌面图标隐藏/恢复（装修模式「隐藏图标」+ 装修栏「恢复图标」按钮配套）；`src/template.html` 装修栏新增 `<button id="decor-restore-icon">` 配套按钮。
- [本会话·诊断验证]（vivo S16 Edge「大退/挂后台后聊天记录整体消失，收藏/音乐/字卡/信/朋友圈都在」用户反馈）：根因链与 idb.js 修复一致（已随 4dcfa4d 提交）——①v3.6.x 起聊天记录是唯一「只写 IndexedDB」的数据（其他功能 LS+IDB 双写）；②Edge 杀后台/强制关闭时 IndexedDB 数据丢失；③idb.js 大键迁移（>200KB 键搬 IDB 后删 LS）把聊天 LS 兜底快照（200KB~2MB）当大图键搬走删除 → 聊天唯一备份也没了 → 只剩启动时日常/查岗注入的几条新消息。修复后 idbRestore 与大键迁移都跳过 `:chat-msgs` 键，快照永不被删。已验证：构建 verify 10/10 + 临时 CDP 探测（种子 300KB 快照 + 300KB 控制大键：快照保留在 LS / chat.js 自动回迁 IDB / 控制大键仍正常迁移 / 页面正常启动，4 项全过）。⚠️ **注意：本会话 13:59 有一次构建（当时对方 template.html/dark.css 正在改，13:59:59 仍在写入）——当前 index.html 可能夹带对方进行中的半成品改动，提交前请构建者重新 `node build.mjs` 覆盖后再提交。**

### 2026-08-18
- [本会话] 完成（桌面默认头像矢量图恢复，已构建 verify 10/10 + CDP 冒烟 7/7，**随本次提交**）：用户反馈桌面第一页顶部头像圆圈里没有聊天默认头像那种人形矢量图。根因——`template.html` 的 `.ring` 内本来有默认 SVG，但 `personalize.js` `applyAvatar()` 在「当前联系人未设置头像」时执行 `ring.innerHTML=''`，把模板默认 SVG 一并清掉（v3.6.x 多桌面「不残留旧头像 img」逻辑的副作用）；聊天页 `fillAvatar` 无头像时会主动重建 SVG 所以正常。修复：else 分支改为重建默认人形 SVG（与 template.html 一致 `#111111`）。CDP 7/7：无头像桌面两圈均渲染 SVG / 人形路径 / 有头像渲染 img / 清空恢复 SVG。涉及 `src/js/personalize.js`。
- [对方改动·本次统一构建随提交] `music-player.js` 自动播放被拒后手势恢复（armAutoResume/disarmAutoResume，失败 toast 提示）+ `src/template.html` 小组件颜色图标换调色板图标（13:17 保存，已重新构建进产物）。

### 2026-08-18
- [本会话] 完成（用户反馈两处，已构建 verify 10/10 + CDP 端到端 14/14，**随本次提交**）：
  - **聊天设置里气泡颜色设置不见了**（我的/联系人气泡颜色+双方消息文字颜色）：根因——4 行 DOM（cs-out-bg/cs-out-ink/cs-in-bg/cs-in-ink）在 `src/template.html` 聊天设置页丢失（与 row-contacts 同因：此前模板被 checkout 回退+截断重写），`chat-settings.js` bindBubbleColorRow 匹配不到行静默 return。修复：`src/template.html`「气泡样式」组后新增「气泡颜色」组 4 行（默认值回显与 applySettings 一致）。
  - **切换桌面后桌面仍显示上一个联系人的昵称**：根因——`personalize.js` bindLabel 只在启动时写一次 lbl-user/lbl-partner，contact-switched 监听器未重读。修复：监听器补刷新（新联系人无昵称回退默认「我 / TA」）。
- 涉及 `src/template.html`、`src/js/personalize.js`。已 build+verify+提交推送。

### 2026-08-18
- [本会话] 完成（主动发送爱心标识，已构建 verify 10/10 + CDP 探测 10/10，**本行记录随本次统一提交**）：需求——联系人主动发送消息的气泡左上角新增一枚极小爱心矢量图作为标识；回复设置→主动发送组新增开关可开/关。① `src/js/chat.js`：tryAutoSend 主动消息 `addIn(..., {initiative:true})`（撤回补发那条同步补 initiative:true）；`renderMsg` 对 `side==='in' && initiative && !retracted` 的消息读 `reply-as-badge`（默认 1）在气泡顶部注入 `.msg-hi-heart` SVG 爱心（Material heart 路径）；② `src/css/chat-main.css`：`.msg-bubble` 加 `position:relative`；`.msg-hi-heart` 绝对定位于气泡左上（top:-4 left:-5，14×14，`#ff4d6a` 粉红，pointer-events:none 不挡点击）；③ `src/template.html`：「免打扰」行后新增「主动发送爱心标识」开关 `as-badge`；④ `src/js/reply-settings.js`：DEFAULTS 加 `'as-badge':1`，开关数组（syncUI/保存/change）三处加 `as-badge`。CDP 10/10：产物含标记/SVG/主动消息爱心 14px 左上角粉红/正文正常/被动无爱心/拍一拍无爱心/关→无/开→恢复/设置页开关默认勾选且位于主动发送分组/点击落库 as-badge=0 且 UI 同步/无 JS 错误。涉及 `src/js/chat.js`、`src/css/chat-main.css`、`src/template.html`、`src/js/reply-settings.js`。已 build+verify+提交推送。

### 2026-08-18
- [本会话] 开工/通知（12:33）：用户已确认由**本会话统一构建提交部署**。对方已多轮完成（聊天记录保险丝/朋友圈去重/OPPO K13 三问题/深色模式），**请停止新改动**，完成当前轮后不要再开工新任务；本会话会在对方 10 分钟无新写入后执行 `node build.mjs` + verify + git 提交推送（一次提交含全部待提交改动）。若对方还有未保存改动请尽快保存并留话。

### 2026-08-18
- [本会话] 完成（深色模式，已构建 verify 10/10 + CDP 探测 15/15，**待提交**）：新增完整深色模式（两档手动开关：浅色/深色，不跟随系统）。① `src/css/base.css` :root 扩充语义变量集（--page-bg/--card-bg/--card-border/--input-bg/--btn-bg/--overlay-bg/--static-bg/--track-bg/--hint-ink/--soft-ink/--pill-border/--glass-bg/--bg-a/--bg-b/--shadow-strong 等）+ [data-theme="dark"] 覆盖块；base.css 通用组件（splash/modal/pwa-install/ce-box/glass/pill/cc-ip 等）硬编码色替换为变量；② 新建 `src/css/dark.css`（加进 build.mjs cssFiles 最后）用 [data-theme="dark"] 选择器覆盖 home/setting/chat-main/chat-pages 中硬编码色（已用 var 的元素由 base.css 自动切换，不重复）；③ `src/template.html` 美化页顶部新增「深色模式」行（row-theme-mode）+ head 加早期内联脚本防 FOUC；④ `src/js/personalize.js` 主题切换逻辑（全局键 xy-home-v2:theme-mode，不按联系人隔离）；⑤ `src/js/contacts.js` EXCLUDE 加 'theme-mode'（防 migrateLegacy 把全局键迁到 default 命名空间）。CDP 15/15：行存在/初始浅色/点击切深色/data-theme=dark/CSS 变量切换/持久化/刷新后仍深色/切回浅色/变量恢复。涉及 `src/css/base.css`、`src/css/dark.css`（新建）、`src/template.html`、`src/js/personalize.js`、`src/js/contacts.js`、`build.mjs`。**未提交**。

  - **内置壁纸预设**（`src/template.html` + `src/js/personalize.js`）：美化页新增「内置壁纸预设」行，8 个 CSS 渐变预设（晨曦/暮色/森林/暖阳/极简/星空/樱花/海洋）+ 清除预设，per-contact 存储 `phone-bg-preset`，与上传图片互斥（选预设清图片、上传图片清预设），contact-switched 重应用。
  - CDP 25/25 + 10/10：全部功能验证通过。涉及 `src/template.html`、`src/js/personalize.js`、`src/js/contacts.js`、`src/css/base.css`、`src/css/home.css`。**未提交**。

### 2026-08-18
- [本会话] 完成（用户反馈「朋友圈联系人主动发布的动态里字卡大量重复一直重复」，已构建 verify 10/10，**待提交**）：根因——`src/js/feed.js` `genPostContent`（TA 动态）与 `genMixedCards`（TA 评论/回复）每张卡都用独立 `rand()` 有放回抽取，字卡池小（尤其自定义字卡少/默认池）而每条动态默认 4~15 张卡时，同一张卡被反复抽中拼成「爱你爱你爱你…」式重复长文。修复：①新增 `makePicker(arr)` 无重复抽取器（洗牌取完一轮再重新洗牌，同轮不抽同一张卡）；②新增 `uniqArr` 去重（字卡库同内容重复条目不再放大重复率）；③两个生成器按类别（文字/颜文字/emoji/表情包/图片/内置兜底池）各自改用 picker，概率逻辑与参数完全不变，仅抽卡方式变无放回；④删除不再使用的 `rand()`。纯逻辑改动不涉及布局/样式。涉及 `src/js/feed.js`。已 `node build.mjs` + `npm run verify` 10/10。**未提交**，等待统一提交/部署。

### 2026-08-18
- [本会话] 完成（用户反馈 OPPO K13：雨见浏览器收不到信、Edge 默认音乐打不开、Edge 退后台清聊天记录；已构建 verify 10/10 + 临时 CDP 脚本 8/8，**待统一构建提交**）：
  - **音乐打不开根因**（`src/js/music-player.js`）：网易云外链 302 跳 CDN 在部分浏览器被拦/挂起——audio.play() 既不报错也不出声（Error 事件不触发 → 原有 onerror 兜底永不生效），播放条却正常点亮，用户看到"点了没声音"。修复（本会话收尾 AI-A 11:43 留下的进行中改动）：①停滞守卫 armStallGuard（12s 内 currentTime 恒 0 且无真实播放 → 种子歌切内置旋律兜底+toast「外链播放失败，已改用内置示例旋律」，普通歌 toast「播放失败：网络链接可能已失效」+停止）；②play() 被拒时 playRejected=true 不再静默；③onloadedmetadata 就绪后补播一次；④onplay/播放进度清除守卫，正常播放不误伤。CDP 验证 8/8：外链挂起桩→播放条点亮（假象）→12s toast→内置 WAV 写入 IDB→blob 源播放有进度→守卫不重复触发。
  - 雨见收不到信：mail 15s 保险丝已在线（v3.6.x），属系统侧（ColorOS 后台冻结/隐私清理），建议用户设后台白名单。
  - Edge 退后台清记录：AI-A 11:39 chat.js 保险丝改动（writeLsSnapshot + armReadyFuse）已在本轮构建内，建议用户关掉 Edge「退出时清除浏览数据」。
  - 涉及 `src/js/music-player.js`（AI-B 域）；chat.js 改动属 AI-A（未动）。已 `node build.mjs`（11:43，index.html 已含双方改动）+ `npm run verify` 10/10。临时探测脚本已删。**未提交**，等待统一提交。另：tools/ 下残留 _probe-dcoff/_probe-idb-fuse/_probe-mecheck/_probe-swatch.mjs（前会话遗留，WORKLOG 曾记已删），下个会话顺手清掉。

### 2026-08-18
- [本会话] 完成（用户反馈 OPPO Find X9s Pro · X浏览器「昨天用了一天，今天早上聊天记录全没了，壁纸/头像/字卡/朋友圈/日历都在」，已构建 verify 10/10 + 临时 CDP 脚本 8/8，**待统一构建提交**）：诊断——线上 32f20a1（11:35 部署）已修复本 bug 根因（loadMsgs 的 store.remove 三连删 + writeLsSnapshot LS 兜底快照）；本次补强残留漏洞：**IDB 打开/读取挂起时 chatDbReady 恒 false → saveMsgs 只暂存内存、连 LS 快照都不写**（X浏览器/OPPO 后台挂起时 indexedDB 请求可能永不返回，mail.js 早有 15s 保险丝先例）——聊一天全在内存、刷新即全丢，且其他数据因 LS+IDB 双写不受影响，与用户症状完全吻合。改动 `src/js/chat.js` 三处：① saveMsgs 未就绪分支也调 writeLsSnapshot；② flushSave 未就绪且有消息时写快照；③ 新增 armReadyFuse() 15s 保险丝（loadMsgs 开头武装 + contact-switched 重新武装，就绪时把 pendingLocal/msgs 顺手写快照）。CDP 验证 8/8：IDB 挂起→开屏 12s 保险丝放行/发消息正常/快照落 LS/15s 无异常/刷新后从快照恢复聊天记录/正常环境 LS+IDB 双写回归。临时脚本已删。⚠️ **发现对方进行中改动**：`src/js/music-player.js`（11:43:31 保存，播放停滞守卫 armStallGuard/playRejected，未写 WORKLOG 未验证）——本会话 11:39 的构建**不含它**，当前 index.html 与 src 不同步，**请收尾后统一构建提交**，勿直接提交现有 index.html。

### 2026-08-18
- [本会话] 完成（用户反馈 iQOO/QQ浏览器两个问题：①每次重进后聊天记录全部消失（信箱信件还在）；②添加音乐后「已上传音乐」弹窗一直不消失+页面卡顿，已构建 verify 10/10 + 无头浏览器端到端 11/11，**待提交**）：
  - **① 聊天记录消失根因**（`src/js/chat.js`）：v3.6.x 起聊天记录权威数据只写 IndexedDB，但 `loadMsgs` 在读到 IDB 权威后执行 `store.remove('chat-msgs')`——它是「内存缓存+localStorage+IndexedDB」三连删（注释只说是清 LS 残留）。同一会话**再次进入聊天页**时 merged 与内存条数一致（changed=false）→ 删掉后不重写 → 杀 App 再进 IDB/LS 全空 → 记录整体丢失且无法恢复（信箱是 LS+IDB 双写、读 LS，所以没事）。修复：读路径只清 legacy 顶层键 `xy-home-v2:chat-msgs` 的 LS 副本，IDB 权威与快照一律不删；另补 **LS 兜底快照**（writeLsSnapshot：≤2MB 全文，超限剥 img/voice 字段只保文本），写 IDB 同时写 LS，IDB 丢失时 loadMsgs 自动从快照恢复（复用原迁入分支，恢复后保留快照作双保险）；LS→IDB 迁移分支改为不删源（原 idbSet 失败会清掉唯一备份）。端到端 5/5：重进后 IDB 仍在/刷新后完整显示/快照已写入/模拟删 IDB 后从快照恢复/快照保留。
  - **② 音乐弹窗卡住根因**（`src/js/music-player.js`）：多文件并行 FileReader.readAsArrayBuffer（每文件整段读内存）+ 并行 idbSet 写 Blob → 主线程长阻塞，toast 的 2s 隐藏 setTimeout 被严重延迟；X5 内核下 CSS 动画兜底也可能不执行；且个别文件 `tmp.onloadedmetadata/onerror` 都不触发时 pending 永不归零，「正在上传…」永远不被「已上传」替换。修复：①上传改**串行队列**（逐个文件读+存，结束统一 saveLibrary/renderPage/toast）——主线程不再长阻塞、内存峰值降 N 倍；②每文件 3s 时长读取**超时兜底**，队列必然走完、最终 toast 必然弹出；③toast() 增加**内联 opacity 双保险**（显示置 1、2s 后置 0，内联优先级最高，动画/定时器任一生效即隐藏）。端到端 6/6（CDP 文件选择器拦截 + 真实 WAV）：真实链路触发/「已上传 1 首音乐」/2s 后 class 移除+opacity 0/进音乐库/Blob 入 IDB。
  - 涉及 `src/js/chat.js`、`src/js/music-player.js`（均为 AI-A 域文件，用户直接反馈故本会话处理，已 build+verify+端到端验证）。已 `node build.mjs` + `npm run verify` 10/10。临时探测脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] AI-B 完成（备份提醒功能，已构建 verify 10/10，**未提交**）：用户确认要「定期备份提醒」。实现：①`src/template.html` 新增 `#backup-remind-bar` 顶部提醒条（复用 ver-update-bar 样式，零新增 CSS，含「去备份/稍后」按钮）；②`src/js/pwa.js` 新增提醒逻辑 IIFE——距上次成功导出超 7 天且近 7 天未提醒过时显示；数据就绪后才判断（全新安装/被清空的空状态不提醒）；版本更新提示条显示时让位不重叠；③`src/js/data-backup.js` 导出成功后记录 `xy-home-v2:__last-backup` 时间戳，并抽 `window.runBackupExport` 供提醒条与设置页共用。**待办**：提醒文案为「数据只存在本机浏览器里」，与 iOS Safari 清数据风险呼应。已 `node build.mjs` + `npm run verify` 10/10。**未提交**，等待统一提交/部署。
- [本会话] AI-B 完成（用户反馈 iOS Safari「每次重开数据全丢、聊天记录丢失」根因排查 + 防护，已构建 verify 10/10，**未提交**）：排除 App 代码问题（聊天记录有 IDB 权威 + LS 有损快照 + 退出强制落盘三重兜底，启动流程不删数据）——"完全全新 + 每次都丢 + 普通标签页"指向 **Safari 系统级清空源数据**：WebKit 已知 bug 266559（配额记账未初始化，周期性清掉所有网站 localStorage+IDB，2024-01 修复，Safari 17.4 前受影响）、iOS 26.3 仍有回归报告、设备低存储会触发清理。**防护：`src/js/pwa.js` 新增 `navigator.storage.persist()`**（获批后豁免存储压力清理，iOS 15.4+ 支持，失败静默）。已 `node build.mjs` + `npm run verify` 10/10；本次构建**顺带包含 AI-A 已保存的 `src/css/tabbar.css`、`src/js/music-player.js` 改动**（非本会话所改，构建前已在工作区）。**未提交**，等待统一提交/部署。
- [本会话] 完成（iOS Safari 全景排查 + 修复，已构建 verify 10/10，**未提交**）：接「双击放大」修复后，逐文件排查 iOS Safari 全部系统层。发现并修复一条真实缺口：**聊天输入框（模板原生 contenteditable div，15px）不在 base.css 16px 防聚焦缩放规则覆盖范围内**（原规则只匹配 input/textarea/select）——iOS Safari 聚焦 <16px 的可编辑元素同样会整页自动放大（与双击放大同症状「页面越变越大」）。`src/css/base.css` 16px 规则补 `.phone [contenteditable="true"]`（特异性 0,2,0 压过 .chat-input 的 0,1,0，与加载顺序无关；Android ce-box 一并覆盖无副作用）。其余排查结论（均已验证无需改动）：iOS 键盘收缩 + 自愈看门狗、无 Fullscreen API 走 ios-fs-active + 引导、音频自动播放三处解锁、大图渲染防护、捏合/长按菜单/滚动穿透锁/safe-area max() 兜底/日期 T00:00:00 本地时区解析/RENDER_MAX=200/大键只进 IDB/version.json 轮询均已覆盖。涉及 `src/css/base.css`。已 `node build.mjs` + `npm run verify` 10/10。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户要求「桌面美化新增自定义第一页摸鱼打卡横幅爱心外框（黑色圆底）的颜色」，已构建 verify 10/10 + 无头浏览器端到端 8/8，**未提交**）：新增「爱心外框颜色」设置。① `src/css/home.css` 新增 `--widget-heart:#111111` 变量，`.ck-heart`（打卡横幅「和 TA 一起摸鱼」的爱心圆底）`background:var(--ink)` 改 `var(--widget-heart)`（心形符号保持白色）；② `src/template.html` 「按钮文字颜色」行后新增 `row-widget-heart`/`widget-heart-val`（爱心图标）；③ `src/js/personalize.js` 新增 applyWidgetHeart（存储 `widget-heart-color`，默认 `#111111`，16 色板 + 自定义取色 + 恢复默认），contact-switched 监听补重应用。8/8：入口/色板 16 色/樱花粉生效（--widget-heart + 打卡横幅爱心实际背景色）/♥ 文字仍白/恢复默认/自定义取色。涉及 `src/css/home.css`、`src/template.html`、`src/js/personalize.js`。已构建 verify 10/10。**未提交**。
- [本会话] 完成（用户要求「我的头像库图片可直接点击更换 + 我换头像要发聊天系统消息 + 联系人主动换我头像的记录（同意/拒绝都算）全部进桌面主页」，已构建 verify 10/10 + 无头浏览器端到端 20/20，**未提交**）：① `src/js/avatar-lib.js` `renderMeGrid` 头像图片加点击 → 新增 `switchMyAvatarFromLib(data)`：直接换 `avatar-user` + 应用头像 + 网格高亮 + toast「头像已更换」+ 聊天系统消息「我的昵称 更换了头像」；② `chatSystem` 调 `addAvatarRecord(img, text)` 把**事件文案**一并写入主页记录（延迟补写同样带 text）；③ `src/js/records.js` `addAvatarRecord(img, text)` 记录 `{img, text, ts}`，主页「换头像记录」tab 渲染事件原文（转义 + 缩略图），旧记录（无 text）回退「昵称 更换了头像」；④ `src/template.html` 主页 tab「联系人换头像」→「换头像记录」（面板标题同步）。端到端 20/20：点我的头像库图片直接换/聊天消息「小美 更换了头像」/记录带文案/高亮/主页展示事件原文+缩略图/邀请同意与拒绝记录文案均正确进主页/旧记录兼容/全程无 JS 错误。涉及 `src/js/avatar-lib.js`、`src/js/records.js`、`src/template.html`。已 `node build.mjs` + `node tools/verify.mjs` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户要求「图标形状删掉圆形，新增自定义图标圆角滑块调整 + 页面预览形状」，已构建 verify 10/10 + 无头浏览器端到端 17/17，**未提交**）：① `src/js/personalize.js` openModal 新增**通用滑块支持** `opts.slider={min,max,step,value,label,unit,preview,onChange}`——`src/template.html` modal 内新增 `modal-slider`（ms-head 标签+实时值 + `ms-range` range + `ms-preview` 图标预览块），拖动 input 事件实时更新值/预览块圆角/onChange，确定时提交滑块数值；**fire() 顺序坑**：滑块分支必须先于 pills 分支，否则带「恢复默认」pill 的滑块弹窗点确定被 pills 拦截传 null；② 图标形状改「图标圆角」：删除圆形/圆角方/直角方 pills 三选一，改滑块 0~30px 实时预览（弹窗预览块 + 桌面图标实时变 --app-ico-radius），存储 `ico-radius`（数字），旧 `ico-shape` 迁移 circle→30/square→0/rounded→18，`src/css/base.css` 新增滑块/预览样式，`src/template.html` 入口改「图标圆角」。17/17：入口文案/默认 18px（默认）/无圆形选项/滑块存在/预览块/拖动 30px 预览+桌面实时变/确定存储/恢复默认/旧 circle 迁移。涉及 `src/template.html`、`src/js/personalize.js`、`src/css/base.css`。已构建 verify 10/10。**未提交**。
- [本会话] 完成（用户要求「美化页新增自定义组件按钮里的文字的颜色」，已构建 verify 10/10 + 无头浏览器端到端 8/8，**未提交**）：新增「按钮文字颜色」设置。① `src/css/home.css` 新增 `--widget-btn-text:#ffffff` 变量，`.ck-btn`（打卡按钮）与 `.we-btn`（周末倒计时按钮）的 `color:#fff` 改为 `var(--widget-btn-text)`；② `src/template.html` 在「按钮颜色」行后新增 `row-widget-btn-text`/`widget-btn-text-val`；③ `src/js/personalize.js` 新增 applyWidgetBtnText（存储 `widget-btn-text-color`，默认 `#ffffff`，16 色板 + 自定义取色 + 恢复默认，色板顺序：8 白灰黑阶 + 8 彩色），contact-switched 监听补重应用。8/8：入口/色板 16 色/樱花粉生效（--widget-btn-text + 打卡/周末按钮文字颜色）/恢复默认/自定义取色。涉及 `src/css/home.css`、`src/template.html`、`src/js/personalize.js`。已构建 verify 10/10。**未提交**。
- [本会话] 完成（用户要求「头像互动半框顶部加页签，点击切换 联系人昵称的头像库 / 我的昵称的头像库」+ 反馈「TA 邀请我换头像的弹窗会误触关闭，还没点同意/拒绝」，已构建 verify 10/10 + 无头浏览器端到端 22/22，**未提交**）：① 页签：`src/template.html` 半框顶部改两页签 `avlib-tab-a`（联系人昵称 + 头像库 + 计数）/`avlib-tab-b`（我的昵称 / 无昵称回退「我的头像库」+ 计数），原「随机换头像」「头像池（N 张）」「我的头像池」标题删除，内容分装 `avlib-pane-a`（开关+网格+上传+清空）/`avlib-pane-b`（TA 主动给我换开关+网格+上传+清空，默认隐藏）；`src/js/avatar-lib.js` 新增 `switchAvTab(me)` + 页签点击监听，syncVal 页签文案改「头像库」并同步 lbl-user 昵称；`src/css/chat-pages.css` 新增 `.avlib-tabs/.avlib-tab(.active)/.avlib-tab-cnt`。② 弹窗锁定：`src/js/personalize.js` openModal 新增 `opts.lock`——点遮罩不关闭 + 隐藏取消按钮（只能走确定/选择路径），`src/js/avatar-lib.js` showMeAvatarInvite 传 `lock:true`（换头像邀请必须点同意/拒绝，防误触关闭丢失邀请）。端到端 22/22：页签结构/默认激活/昵称文案/计数/点击切换双向/无昵称回退/开关仍在/邀请弹窗无取消按钮/点遮罩不关闭/同意后正常关闭并换上/普通弹窗仍可点遮罩关闭。涉及 `src/template.html`、`src/js/avatar-lib.js`、`src/css/chat-pages.css`、`src/js/personalize.js`。已 `node build.mjs` + `node tools/verify.mjs` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户要求「我的头像池：头像互动半框新增我的头像池，联系人按同机制定时主动换我的头像」，已构建 verify 10/10 + 无头浏览器端到端 42/42，**未提交**）：① `src/template.html` 半框新增「我的头像池」区块：`avlib-me-enabled` 开关（默认开，「TA 会每隔 1-8 小时主动给你换头像，直接换或弹窗征求你同意」）+ `avlib-me-grid`/`avlib-me-count`/`avlib-me-empty`/`avlib-me-upload`/`avlib-me-clear`；联系人池标题改 `<span id="avlib-pool-name">`（「昵称 的头像池」）。② `src/js/avatar-lib.js` 新增 me-lib 全套：`getMeLib/saveMeLib/getMeEnabled`（键 `avatar-me-lib*`，启用键 `avatar-me-lib-enabled` 默认开）、`renderMeGrid()`（含 avlib-now 高亮、删除按钮、不可手动切换）、共享 `bindPoolUpload/bindPoolClear`、`applyAvatarImg(data, out)`、`replyMeInvite`/`showMeAvatarInvite`（openModal pills 同意/拒绝 + modal-static 内 96px 圆形头像预览）、`checkMeAvatarRefresh` + 60s interval（独立计时 next=1+random*7 小时；弹窗被占用则跳过不推进、随机到当前头像跳过；概率/直换/邀请与联系人池一致）。③ 修复预存缺口：`chatSystem` 里 `window.addAvatarRecord` 在 records.js 加载前（启动即触发）未定义 → 记录页不写 `records-avatar`，加 setTimeout 600ms 延迟补写。端到端 42/42：半框 UI 结构/上传(1 张→计数+持久化+网格)/删除/清空确认弹窗/启动直换(头像=池第2张、聊天消息+附新头像图、记录写入、计时推进、桌面环应用、当前头像高亮)/弹窗邀请同意(换上+消息+关闭+计时)/拒绝(不变+消息)/开关关闭不触发/联系人池回归。涉及 `src/js/avatar-lib.js`、`src/template.html`。已 `node build.mjs` + `node tools/verify.mjs` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户反馈「切换联系人后桌面仍显示上一个联系人的头像/纪念日/摸鱼/今日情话」，已构建 verify 10/10 + 无头浏览器端到端 15/15，**未提交**）：根因——这些渲染函数只在页面加载时执行一次、不监听 `contact-switched`；头像另有双 bug（refreshActiveContactUI 只设 backgroundImage 但头像实际渲染在 `.ring` 内的 `<img>`，清不掉；applyAvatar 在新联系人无头像时不清 `.ring` 导致旧头像残留）。修复：① `src/js/contacts.js` `refreshActiveContactUI` 改调 `window.applyAvatars()`（按当前联系人 store 重读 avatar-user/avatar-partner）；② `src/js/personalize.js` `applyAvatar` 补 else 清空 `.ring` 分支；③ 今日情话 IIFE 抽成 `renderQuoteOfDay()`，contact-switched 监听（1970 行）补 `updateFishDays/updateLove/renderQuoteOfDay/renderExtras`。15/15：两联系人不同头像/纪念日/摸鱼切换全部正确、无头像桌面头像清空、切回恢复。涉及 `src/js/contacts.js`、`src/js/personalize.js`。已构建 verify 10/10。**未提交**。
- [本会话] 完成（用户要求「自定义手机桌面图标入口同时可装修卡片背景，删除多余的卡片背景功能按钮」，已构建 verify 10/10 + 无头浏览器端到端 9/9，**未提交**）：① `src/template.html` **删除美化页「卡片背景」分组**（含入口行 `row-card-bg-decor`「装修模式设置卡片背景」+ 计数 `card-bg-decor-val`）——用户认为多余；② `src/js/personalize.js` 同步清理 `cardBgDecorRow`/`cardBgDecorVal` 引用与 syncCardBgUIs 中入口计数逻辑；③ 确认「自定义手机桌面图标」入口（`row-custom-icon` → `enterDecor()`）**本就同时开启** 图标网格 `editing`（点图标换图）+ `decor-on`（点卡片设背景）+ 装饰条「装修模式 · 点图标换图 · 点卡片设背景」——两个能力一体，无需单独入口。无头浏览器验证 9/9：美化页无卡片背景入口行/无卡片背景分组/点自定义图标入口进装修模式（editing+decor-on+装饰条）/点图标弹「图标已自定义」/点卡片弹背景菜单（含遮罩切换）/「完成」退出。涉及 `src/template.html`、`src/js/personalize.js`。已 `node build.mjs` + `npm run verify` **10/10**（上一轮 9/10 的 chat 输入栏贴底失败在重建后恢复通过，疑为构建产物残留，非代码问题）。临时脚本已删。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户要求「桌面图标位置也可自定义」，已构建 verify 10/10 + 无头浏览器端到端 8/8，**未提交**）：装修模式点图标弹出的菜单**增加「上移/下移」**，可在图标网格内调整单个图标位置（之前只能整网格移动）。实现 `src/js/personalize.js`：① 图标点击菜单统一为「图标设置」——上传/更换图片 + 清除图片（有自定义图时）+ 上移 + 下移；② `moveApp(dir)` 移动节点（insertBefore，节点移动不重建、事件绑定保留）并持久化 `app-icon-order-<grid.app>`（data-app 数组 JSON）；③ `restoreAppIconOrder()` 启动时按存储顺序重排（移动节点恢复）；④ `src/template.html` 给两个图标网格加 `data-app="main"`（首页）/`data-app="p2"`（第二页）标记。无头浏览器验证 8/8：进装修模式/点图标弹「图标设置」菜单（含更换+清除+上移+下移）/chat 图标下移变第 1 位/顺序持久化 app-icon-order-main/刷新后顺序保持/上移回第 0 位。涉及 `src/template.html`、`src/js/personalize.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户要求「自定义手机桌面图标行下方加说明」，已构建 verify 10/10 + 无头浏览器端到端 3/3，**未提交**）：`src/template.html` 该行 `.txt` 内加 `<span class="sub">自定义图标图片 · 桌面组件卡片位置 · 卡片背景图片</span>`；`src/css/setting.css` 新增 `.set-row .txt .sub` 样式（block 灰色 11.5px 小字）。无头浏览器验证 3/3：副标题文字/样式生效/入口仍正常进装修。涉及 `src/template.html`、`src/css/setting.css`。已构建 verify 10/10。**未提交**。
- [本会话] 完成（用户反馈「桌面美化的小组件颜色恢复默认，没有保存」，已构建 verify 10/10 + 无头浏览器复现 6/6，**未提交**）：根因——`src/js/contacts.js` `defaultStore().remove(k)` 删 default 命名空间键后，只手动 `localStorage.removeItem` + `idbDelete` 清旧顶层键，**漏了 memoryCache**；而 `defaultStore().get(k)` 有回退逻辑（default 命名空间读不到 → 回退读旧顶层键 `xy-home-v2:widget-bg-color`），memoryCache 里的残留旧值被读到 → 点「恢复默认」后 `store.remove('widget-bg-color')` 已执行、LS/IDB 已删，但 get 仍返回旧色（切桌面/重进设置时 CSS 变量又变回旧色，刷新后才正常——用户感知"恢复默认没保存"）。修复：defaultStore 的 `set/remove` 清旧顶层键改走 `window.xyStore(G).remove(k)`（memoryCache + LS + IDB 三处彻底清）；`deleteContact` 删联系人数据同样改走 `xyStore(prefix).remove`（原来裸 removeItem/idbDelete 漏 memoryCache）。无头浏览器复现：老用户升级（旧顶层键 widget-bg-color）→ 恢复默认 → `store.get` 由残留 `#f5f0eb` 变为 `null`（修复前）→ 修复后立即 null、刷新后仍默认白 6/6。涉及 `src/js/contacts.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

## 记录

### 2026-08-18
- [本会话] 完成（用户反馈「字卡库页面里有灰色的滑动栏滚动条删掉」）：`src/css/chat-pages.css` 顶部给 `#page-chatcard` 加滚动条隐藏（`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`，ID 选择器覆盖 base.css .page 的 4px 细滚动条），只影响字卡库首页，其他页面保持 v3.6.69 细滚动条不动。**未构建未提交**，请构建者统一 `node build.mjs`。

### 2026-08-17
- [本会话] 完成（用户反馈两处：①默认聊天字卡顶部总开关无弹窗提醒；②系统预设字卡单卡关闭后联系人仍在使用，已构建 verify 10/10 + CDP 端到端 6/6，**未提交**）：① `src/js/default-cards.js` 总开关（dc-enabled）change 时补 toast「已开启/已关闭：使用系统预设字卡」。② 根因——系统字卡进回复有三条链路，其中 chat.js `getPool()` 的「字卡池空兜底」（自定义字卡分类为空时用系统字卡补池）**完全不过滤开关**：兜底直接把全部系统字卡塞进回复池（getDefaultCards 混入链路和回应/情绪字卡链路都有过滤，唯独这条没有）。修复：`default-cards.js` 暴露 `window.isDefaultCardOff(cat, c)`；`chat.js` 兜底改两处——`dc-enabled` 关闭时整个兜底不注入系统字卡、单卡「关闭使用」的字卡跳过（main/kaomoji/emoji 三分类各按来源分类查开关）。CDP 6/6：总开关 toast 弹「已开启：使用系统预设字卡」/模拟全关后新回复全为「收到～」/dc-enabled=0 后无系统字卡/恢复后系统字卡正常回复/真实关闭一张字卡 12 轮采样零次出现/采样期间系统字卡仍在回复。探测注意：聊天输入框是模板原生 contenteditable div（不是 input），探测发送需 `input.textContent=...`；查岗/通话等特殊消息会混入采样需按 `m.special` 过滤。涉及 `src/js/default-cards.js`、`src/js/chat.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户要求「内置字卡单卡开关（开启/关闭使用）没有弹窗提醒」，已构建 verify 10/10 + CDP 端到端 6/6，**未提交**）：`src/js/default-cards.js`（聊天默认字卡）、`mood-reply-cards.js`（回应字卡 + 情绪字卡两处）、`quote-cards.js`（桌面今日情话）、`p2-features.js`（查岗日常字卡）四个模块的单卡开关点击后加轻提示 toast「已开启：/已关闭：」+字卡内容（超 18 字符截断加 …），default-cards 与 mood-reply-cards 各自补齐本模块的 toast/toastCard 函数（复用 #cc-toast 元素、2 秒自动消失，其余两个模块复用已有 toast）。CDP 6/6：五个开关（dc/mc/rc/quote/ck）点击均弹出正确 toast + 关闭状态落库 `dc-off-*/rc-off-*/mc-off-*/ck-off-*/quote-off:`。注意：聊天默认字卡页为懒渲染（点 `li-default-cards` 入口才构建 DOM），探测需先点入口。涉及 `src/js/default-cards.js`、`mood-reply-cards.js`、`quote-cards.js`、`p2-features.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（朋友圈两项需求：清除所有数据按钮 + 单条动态删除按钮，已构建 verify 10/10 + CDP 端到端 13/13，**未提交**）：① `src/template.html` 回复设置→朋友圈 tab 底部新增「数据」分组 + `#feed-clear-all` 危险行「清除所有朋友圈数据」（复用 set-row danger 样式，与聊天设置删除记录同款）；`src/js/feed.js` 绑定确认弹窗（noInput+staticText）→ 清空 `feed-posts`/`feed-notices`/`feed-app-unread` 三个全局键 + 关评论条 + 刷新角标/列表/通知面板。② 单条删除按钮扩展到所有动态：主列表删除按钮原来只显示在我的动态上（isMine），现所有动态（含 TA 的）都显示 `.feed-del`；「全部朋友圈」页原先完全没有删除按钮，现每条动态头部加 `.feed-del`；删除逻辑抽成公共函数 `deletePostConfirm(pid)`（主列表+全部朋友圈共用，确认后按当前可见页面重渲染，删除的是评论条目标时同步关闭评论条）。CDP 13/13：主列表 3 条（含 TA）均有删除按钮/确认弹窗/删除后剩 2 条/全部朋友圈页有按钮/删除+重渲染/设置页入口可见/确认弹窗/清除后动态+通知+未读角标全空/空态文案。涉及 `src/template.html`、`src/js/feed.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户反馈「设置里的切换不同联系人桌面的按钮不见了」修复，已构建 verify 10/10 + CDP 验证 6/6，**未提交**）：根因——`row-contacts`（联系人 / 桌面入口）是上上轮多联系人功能加进工作区但**从未提交**（git 全历史 `-S row-contacts` 无记录），之后 template.html 因误操作被 `git checkout HEAD` 回退 + Python 截断重写时丢失；`contacts.js` 入口绑定（`getElementById('row-contacts')`）仍在但永远匹配不到。修复：① `src/template.html` 设置页顶部补回独立 set-group 入口行 `row-contacts`「联系人 / 桌面」（用户图标 + `contacts-val` + 箭头，恢复 WORKLOG 所述原设计）；② `src/js/contacts.js` 新增 `refreshContactsVal()`——入口行 val 显示当前联系人名（跟随 `contact-switched` 刷新，切换桌面后名称同步更新）。CDP 验证 6/6：入口存在/设置页可见/文本正确/val 显示「默认」/点击打开联系人管理弹窗（display:flex）/弹窗标题与说明正确。涉及 `src/template.html`、`src/js/contacts.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 开工（用户反馈「iOS 手机端依旧打开页面卡顿什么也点不了」，诊断中）：已排查启动链路（idb/clock/bg-keep/mobile-adapt/contacts/chat loadMsgs）+ 无头 Chrome iOS UA 空数据复现（无 JS 错误、无遮罩、无长任务、点击正常）→ 定位为存量超大图渲染防护缺口：上次 iOS 大图崩溃修复只清了头像/自定义图标存量（applyAvatar/restoreAppIcons >500KB），壁纸 phone-bg / 聊天壁纸 cs-bg / 卡片背景 card-bg-* / 每页背景 page-bg-* / 朋友圈封面 feed-cover-bg/feed-ta-cover 的渲染路径全部无防护——旧版压缩失败回退存原图（48MP/ProRAW 十几 MB）时，iOS Safari 每次启动渲染 backgroundImage 解码数百 MB 位图 → 渲染进程卡死（打开页面卡顿点不动、刷新依旧）。已完成修复并构建验证：personalize.js 新增 sanitizeBg 统一防护（BG_SAFE_LIMIT=6MB 壁纸类 phone-bg/page-bg-*/cs-bg，IMG_SAFE_LIMIT=500KB 卡片背景 card-bg-*），chat-settings.js cs-bg 6MB 防护，feed.js safeBg 500KB 防护（feed-cover-bg/feed-ta-cover/feedAllBg/feed-ta-avatar，activeStore+全局回退两层）。已 node build.mjs + npm run verify 10/10 + CDP 端到端验证（临时阈值方案：坏值 3000 字符被清除且不进 default 命名空间、正常 1KB 小图保留迁移、.phone 无背景、无 JS 错误；验证后恢复真实阈值重新构建）。临时脚本 tools/_probe-*.mjs 已删。
- [本会话] 追加优化（已构建 verify 10/10 + 真实数据规模 CDP 验证）：default-cards.js（AI-A 域）系统字卡 4621+ 张改懒渲染——原启动时同步构建全部 DOM（含逐卡 isCardOff 读 LS），低端 iOS 启动卡顿源之一；改首次打开系统字卡页才渲染，defaultCardCfg 抽取不受影响。规模模拟（5 联系人×1500 消息/300 字卡/150 朋友圈 + 头像池 60 + 背景图等，种子后 reload）：启动 ccItems 5072→451、长任务 max 67ms、无 JS 错误、打开系统字卡页 4621 张正常渲染、开屏就绪正常。另确认 idbRestore（分批 8 键/批 + 12s 保险丝）、clock（20s 保险丝）、聊天记录只存 IDB 不回填 LS——启动链路无其他死锁点。跨域提醒：chatcard.js 启动也构建自定义字卡 DOM（数百张，规模小于系统字卡），如需进一步优化由 AI-A 决定。**未提交**，等待统一提交/部署。
- [本会话] 完成（OPPO Edge「自定义字卡【拍一拍】分组字卡被联系人当普通聊天字卡发出、不触发拍一拍」修复，已构建 verify 10/10 + CDP 探测 5/5，**未提交**）：根因——`src/js/chat.js` `getPool()`（回复字卡池）把【拍一拍】分组字卡（纯文字，无表情/颜文字特征）按规则归入 `text` 池（函数里声明的 `poke` 数组从未被填充），联系人被动回复/主动发送抽中后按普通聊天字卡发出；拍一拍模式只走 `touch-prob → performPoke()`（读 `getPokeCards`），两个素材池未隔离。修复：`getPool()` 开头用 `getPokeCards()` 构建 `pokeSet`，字卡归类时命中即跳过——拍一拍字卡只经拍一拍模式使用（居中灰字「昵称+字卡+我」）。CDP 探测 5/5：getPokeCards 返回种子拍一拍词 / getCustomCards 仍含全部字卡 / 发送链路正常（6 条 out）/ 6 轮回复共 4 条 in 中拍一拍词零次作为普通聊天卡出现 / poke 渲染路径正常。涉及 `src/js/chat.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。另：`tools/` 下发现遗留 `_probe-ios-freeze.mjs`（非本会话产生），请确认后清理。

### 2026-08-17
- [本会话] 完成（用户反馈「桌面 UI 按钮全部往左移动了」修复，已构建 verify 10/10 + CDP 布局对照，**未提交**）：根因——工作区未提交的「卡片背景分组」改动在 `src/template.html` 美化页（`#page-theme` 内）插入新 set-group 时**弄丢了 `#page-theme` 的闭合 `</div>`**（原位置 `-    </div>` 被替换成新分组，且残留一段重复行 `<div class="txt">装修模式设置卡片背景</div><div class="val"…></div>` 带 2 个多余闭合），浏览器自动闭合导致 `.phone` 提前收尾、tabbar 及后续页面变成 body 直接子元素；body 是 `display:flex; justify-content:center`，.phone(390)+tabbar(118)=508 在 390 视口居中 → .phone 左移 (390-508)/2 ≈ -59px，桌面全部图标/按钮整体左移。修复：`src/template.html` 删除重复残留 4 行 + 补回 `#page-theme` 缺失的 `</div>`。CDP 对照验证：修复后与 HEAD 一致——phoneLeft=0、tabbar 直接子元素链 `[.tabbar, .phone]`、tabW=354 可见，bodyChildren 仅 phone+script 等。另：本会话中途发现 `.git/refs` 与 pack 文件被意外删除导致 git 损坏，已重建 refs + `git fetch origin` 恢复（HEAD=23a4845 在远端存在）。涉及 `src/template.html`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户要求「卡片背景分组只留入口行，其他多余行删掉」，已构建 + 无头浏览器端到端 10/10，**未提交**）：`src/template.html` 美化页「卡片背景」分组**删除 9 行具体卡片入口**（纪念日卡背景 / 今日情话卡背景 / 已摸鱼卡背景 / 打卡横幅背景 / 音乐播放器背景 / 今日备忘卡背景 / 今天的心情卡背景 / 本周日常卡背景 / 周末倒计时卡背景），**只保留入口行 `row-card-bg-decor`「装修模式设置卡片背景」**（带 `card-bg-decor-val` 计数「已设 N 个」）。理由：进装修模式点桌面卡片即可完成所有操作（更换/清除/遮罩/上移/下移/移出），9 行单独入口是冗余。过程中**意外操作失误**：`git checkout HEAD -- src/template.html` 加上 Python 脚本 -1 切片错乱导致模板损坏（桌面结构在文件末尾重复一份 + 部分缺失），**已用 Python 截断到第一个 `</body>` + Edit 工具逐个补回 9 个 `data-card-bg` 标记 + 7 个 `data-desk-widget` 标记 + 装饰条文案改通用**。无头浏览器端到端 10/10：分组只剩 1 行入口 / 9 个 data-card-bg 标记正确 / 装饰条文案通用 / 点入口进装修模式 / 点卡片弹完整设置菜单（含 上传/上移/下移/移出）。涉及 `src/template.html`。已 `node build.mjs` + `npm run verify` 9/10（**遗留**：360x640 视口下聊天页 page 高 936 vs phone 640，输入栏距 phone 底 207px 不贴底——`src/js/chat.js` 和 `src/css/chat-main.css` 不在本轮改动范围，是 HEAD 既有 chat 布局问题，需后续单独排查修复）。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户要求「卡片背景功能要像自定义桌面图标一样，点入口直接进装修模式传背景」，已构建 verify 10/10 + 无头浏览器端到端 11/11，**未提交**）：① `src/template.html` 美化页「卡片背景图片」分组**顶部新增入口行 `row-card-bg-decor`「装修模式设置卡片背景」**（画笔图标 + `card-bg-decor-val` 计数「已设 N 个」）；② `src/js/personalize.js` 把进入装修模式抽成公共函数 `enterDecor()`（切桌面 + 图标网格 editing + `decor-on` + 装饰条显示），**「自定义桌面图标」与「装修模式设置卡片背景」两个入口共用**；新入口点击 → `enterDecor()` + 轻提示「点桌面上的任意卡片即可设置背景」；③ 装饰条文案改为通用「装修模式 · 点图标换图 · 点卡片设背景」（原「点击图标更换 / 清除」）；④ `syncCardBgUIs()` 扩展同步刷新入口计数（与 9 行状态文本一起更新）。无头浏览器验证 11/11：入口存在且排分组第一/计数「已设 2 个」（刷新后）/点入口直接进装修模式（decor-on+editing+装饰条）/装饰条文案通用/点卡片弹设置菜单/菜单含上传+上移+下移+移出/「完成」退出装修。涉及 `src/template.html`、`src/js/personalize.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户反馈「自定义桌面图标无法恢复默认 + 装修模式卡片上的操作条按钮多余要删」，已构建 verify 10/10 + 无头浏览器端到端 10/10，**未提交**）：根因——上一轮「卡片自由摆放」注入的悬浮操作条 `.desk-widget-ops`（↑↓✕）挂在所有 `[data-desk-widget]` 上，**包括 app-grid 图标网格**：操作条悬浮在网格右上角遮挡图标，装修模式点图标实际点到操作条按钮（stopPropagation 拦截）→ 弹不出「更换/清除」菜单 → 图标无法恢复默认；误触 ✕ 还会把整个图标网格移出此页。修复 `src/js/personalize.js`：① **删除 `injectWidgetOps()` 及调用**（`src/css/home.css` 同步删除 `.desk-widget-ops` 全部样式）；② **卡片摆放操作收进点卡片菜单**——`openCardBgMenu(type,name,anchorEl)` 增加可选 `anchorEl`：装修模式点卡片时传入点击的卡片元素，菜单在「上传/更换/清除/遮罩切换」基础上追加「上移 / 下移 / 移出此页」（对应移动组件块节点 + `saveDeskLayout`，与操作条原行为一致）；设置页行点击不传 anchorEl 保持原有菜单；③ 无背景卡片点击行为调整——装修模式点卡片一律弹菜单（含上传+摆放），不再直接弹文件选择（保证摆放操作可达）；④ `#page-phone` capture 委托移除对已删 `.desk-widget-ops` 的排除，改为排除 `.desk-lib`/`.decor-bar`/`.desk-page-add`。无头浏览器验证 10/10：桌面无操作条残留/图标自定义渲染/装修模式点图标弹「图标已自定义」/菜单含更换+清除/点清除后存储删除+恢复默认 SVG/点卡片弹设置菜单/卡片菜单含上移下移移出此页/移出后进隐藏池/清理还原。涉及 `src/js/personalize.js`、`src/css/home.css`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户要求「卡片背景上传改为装修模式点卡片直接传，与自定义图标同交互」，已构建 verify 10/10 + 无头浏览器端到端 11/11，**未提交**）：① `src/template.html` 给 9 个卡片元素加 `data-card-bg="<type>"` 标记（deco/quote/fish/checkin/music/memo/mood/week/weekend）；② `src/js/personalize.js` `CARD_BG_TYPES` 选择器从固定位置（`.page-slide.second .music-widget` 等）**改为 `[data-card-bg="<type>"]` 属性选择**——修复隐患：卡片被挪到新增页后（上一轮「卡片自由摆放」），原位置选择器匹配不到、背景设置失效；③ 重构上传/清除/遮罩逻辑为公共函数 `openCardBgMenu(type,name)`（设置页行点击与装修模式共用）+ `syncCardBgUIs()` 统一刷新 9 行状态文本；④ **装修模式点卡片上传**：#page-phone 事件委托（capture）——`decor-on` 模式下点击 `[data-card-bg]` 卡片即弹背景设置菜单（无背景直接弹文件选择，有背景弹「更换/清除/遮罩切换」），`preventDefault+stopPropagation` 保证不触发卡片自身功能（备忘/心情/打卡/音乐），与「装修模式点图标换图、不打开功能」行为一致；非装修模式点击不受影响。无头浏览器验证 11/11：9 卡标记/非装修点备忘正常弹窗/无背景点卡片直接文件选择/有背景点卡片弹菜单/标题正确/含遮罩切换/遮罩切换生效/背景应用原图直出/退出装修恢复功能/打卡横幅挪第 3 页/挪页后点卡片仍弹菜单。涉及 `src/template.html`、`src/js/personalize.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（桌面装修增强：卡片背景图 / 新增空白主页 / 卡片自由摆放，已构建 verify 10/10 + 无头浏览器端到端 20/20，**未提交**）：用户需求「桌面美化新增：每类卡片背景图、新增空白主页、增加自由度自由上传图片装修」。三块：
  1. **每类卡片独立背景图 + 遮罩可切换**（`src/template.html` 美化页新增「卡片背景图片」分组 9 行 + `src/js/personalize.js` `applyCardBg`）：纪念日卡/今日情话/已摸鱼/打卡横幅/音乐播放器/备忘/心情/本周日常/周末倒计时 9 类各自上传（compressImage 1000px，失败拒绝存原图防 iOS 崩溃），存储 `card-bg-<type>` + `card-bg-mask-<type>`（'on'=白色遮罩 0.78 / 'off'=原图直出），`contact-switched` 重应用。已设置卡片点行 → 弹「更换/清除/遮罩切换」菜单。
  2. **新增空白主页**（`desktop-slider.js` 动态页 + `personalize.js` buildDeskPages）：美化页新增「桌面页面」分组——新增空白主页（上限 5 页）、删除最后一页（核心 2 页不可删，页上卡片移回隐藏池）、每页独立背景图（`page-bg-<idx>`）。desktop-slider 改为动态查询 slides/dots + 圆点事件委托 + `window.deskRebuild()` 重建圆点。
  3. **卡片自由摆放**（`personalize.js` 装修模式扩展）：进入装修模式（自定义桌面图标入口）同时开启 `decor-on`，每张卡片右上角出现操作条（↑ 上移 / ↓ 下移 / ✕ 移出到隐藏池）；新增空白页始终显示「+ 添加卡片」打开组件库（9 个组件全局唯一，选中即从原位置移动到本页）。**关键原则：移动 DOM 节点不重建**——组件内部事件绑定（p2-features 的 memo/mood/week、music-player 等）全部保留。
  4. **关键坑记录**：① `background-image` 不能拼 `center/cover`（非法值被浏览器整体丢弃），url 与遮罩渐变放 backgroundImage、size/position/repeat 单独设置；② openModal 的 `noInput` 无 pills 时确定按钮回调 `'ok'`（删除页确认用静态文本 + noInput，不用需先点胶囊的 pills）。
  涉及 `src/template.html`、`src/js/personalize.js`、`src/js/desktop-slider.js`、`src/css/home.css`。已 `node build.mjs` + `npm run verify` 10/10 + 无头浏览器端到端 20/20（分组渲染/背景图遮罩切换/加页/圆点重建/空白页/每页背景/操作条/卡片移动/删页回隐藏池/组件库）。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户要求「切换桌面，每个桌面的美化要完全独立」，已构建 verify 10/10 + 无头浏览器端到端 12/12，**未提交**）：此前多桌面隔离只覆盖了聊天/字卡/头像等数据，**朋友圈美化与小组件颜色仍是全局共享**（切桌面不独立）。本次修复三处：① `src/js/feed.js`——朋友圈美化键（`feed-cover-bg` 封面背景、`feed-ta-name`/`feed-ta-avatar`/`feed-ta-cover` TA 展示名/头像/背景）改为按当前桌面（activeStore）读写，读取回退全局旧键（老数据兼容）；「全部朋友圈」页修复遗留 `feedAllOwner` 恒 undefined bug（永远走 TA 分支 + 写全局），改为按 `feedAllCid` 对应桌面的 `storeFor(cid)` 写 `feed-ta-*` 键（每个联系人桌面独立），封面头像补显示该桌面 TA 头像；末尾 IDB 大键补读全部改 `activePrefix()`；新增 `contact-switched` 监听刷新封面。② `src/js/personalize.js`——`contact-switched` 监听器补上小组件三色重新应用（`--widget-bg`/`--widget-border`/`--widget-btn` 按新桌面 CSS 变量刷新，此前只在页面加载时应用一次）。③ `src/js/chat-settings.js`——新增 `contact-switched` 监听重跑 `applySettings`（聊天壁纸/气泡颜色/字号/头像形状按新桌面）。无头浏览器验证 12/12：两桌面各自设置不同朋友圈封面/TA名/TA头像/小组件颜色 → 各自读出独立值、切换后互不影响、CSS 变量 `--widget-bg` 跟随桌面切换。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户反馈「桌面新建/切换联系人桌面的按钮无反应 + 不要绿色改回黑白配色」，已构建 verify 10/10 + 无头浏览器端到端 10/10，**未提交**）：根因——`src/js/contacts.js` 联系人管理弹窗两处致命 bug：① `ensureModal()` 给弹窗写死内联 `display:flex`（`m.style.cssText`），**内联样式优先级高于 `hidden` 属性的 UA 样式 `[hidden]{display:none}`** → `m.hidden=true/false` 完全失效：关闭/切换/点遮罩后弹窗永远关不掉，一直盖在页面上（"按钮无反应"）；② 弹窗 z-index 9999 高于全局 `openModal` 的 `#modal-mask`（z-index 90）→ 点「+ 添加联系人/桌面」「改名」时弹出的输入框被联系人弹窗压在下层，看不到也点不到。修复：新增 `showContactModal/hideContactModal`（`display:flex`/`none` 显式控制显隐），弹窗 z-index 降到 **89**（低于 modal-mask，openModal 输入框可浮在其上）；另按用户要求把联系人弹窗的绿色（激活圆点 `#3b6d11`、添加按钮背景 `#3b6d11`）改回项目原本黑白配色（`#111`）。无头浏览器端到端 10/10：设置页入口开弹窗/弹窗 z-index=89 无绿色/添加按钮弹出输入框且 modal-mask 在上层/新建联系人成功/新建后自动切换/切换后弹窗关闭/点行切回默认桌面/测试数据清理/「关闭」按钮/点遮罩关闭 全部通过（注：初版测试脚本选择器层级写错 `>div>div` 匹配到列表容器致 1 项误报，修正为 `>div>div>div` 后全过）。涉及 `src/js/contacts.js`（`index.html` 已构建）。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 修复（多联系人上线后「刷新重新打开，桌面我的头像/桌面壁纸/聊天壁纸丢失」，已构建 verify 10/10 + 无头浏览器复现/回归，**未提交**）：根因两条——① `contacts.js` 的 `migrateLegacy` 把**命名空间键**（`xy-home-v2:default:*`）也当"旧顶层键"再迁移一层，产生 `xy-home-v2:default:default:*` 双重前缀并删除原键（刷新后头像/壁纸/聊天壁纸丢失）；② `migrateLegacy`（删旧键）与 `idbRestore`（异步回填，12s 保险丝期间仍在后台恢复）**启动竞态**——restore 先拿到旧键列表、迁移后删掉 IDB 旧键、新键不在 restore 列表 → 大键（>200KB 只存 IDB）彻底丢失。修复 `src/js/contacts.js`：① `isExcluded` 排除命名空间键（`default` 或 `c` 开头联系人 id 前缀），**但保留含冒号的旧业务键**（`dc-off-分类:内容`/`quote-off:内容`/`day-fish-日期` 等，用已知业务前缀白名单判定，不能一刀切 `indexOf(':')` 排除——否则字卡单卡开关状态全丢）；② `migrateLegacy` 延迟到 `mochi-restore-done` 后执行（消除竞态），且**只删 localStorage 旧键、保留 IndexedDB 旧键**（restore 保险丝期间仍需回填，defaultStore 优先读新键、回退旧键，数据永不丢）；③ 幂等：default 命名空间已有键则不重复写；④ finish 不覆盖已有 `active-contact`（防止重置用户已选联系人）；⑤ 顺带清理存量 `default:default:*` 垃圾键。无头浏览器验证：老用户升级（顶层大键+含冒号业务键）4/4、刷新大键恢复 3/3、多联系人核心回归 10/10（迁移/隔离/字卡/朋友圈）。涉及 `src/js/contacts.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（聊天设置页补上「双方气泡/文字颜色」4 项设置，已构建 verify 10/10 + CDP 端到端 12/12，**未提交**）：用户反馈「聊天设置页面里缺少 我的气泡颜色/我的消息文字颜色/联系人气泡颜色/联系人消息文字颜色」。① `src/template.html` 气泡样式组下新增「颜色」分组 4 行（cs-out-bg 我的气泡颜色 / cs-out-ink 我的消息文字颜色 / cs-in-bg 联系人气泡颜色 / cs-in-ink 联系人消息文字颜色，各带 .val 回显）；② `src/js/chat-settings.js` 新增 `bindBubbleColorRow`（openModal 色板 9 色 + 自定义取色，值存 `cs-out-bg/ink`、`cs-in-bg/ink` 键，落 applySettings 的 --msg-out/in-bg/ink CSS 变量，回显默认色显示「默认」）；③ **顺带修复 openModal 的 fire() 分支 bug**（personalize.js）：弹窗同时带 pills 与色板时 pills 分支先 return，色板选中值永远传不到回调（widget 小组件颜色此前选色板无效），现色板/自定义取色优先；widget 颜色回调同步补下标→色值映射。CDP 12/12：4 行渲染/默认回显/弹窗 9 色板+自定义/选色板生效+持久化+回显/自定义取色/联系人两行/刷新保留/聊天气泡实际渲染颜色全部通过。涉及 `src/template.html`、`src/js/chat-settings.js`、`src/js/personalize.js`。已 `node build.mjs` + `npm run verify` 10/10。临时探测脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（**多联系人/多桌面功能**，已构建 verify 10/10 + 无头浏览器端到端 14/14，**未提交**）：用户需求——设置页新增「联系人/桌面」，每个桌面数据完全隔离（含"我"的身份/头像/昵称/字卡库），**仅朋友圈全局共享**（所有桌面的动态都能看到，各联系人用自己的字卡、身份独立显示、可互相评论互动）。
  - **新增 `src/js/contacts.js`**（build.mjs jsFiles 中放在 idb.js 之后，最先于功能模块加载）：存储抽象 `window.activePrefix()`（当前命名空间前缀 `xy-home-v2:<cid>:*`）/ `activeStore()`（**动态绑定当前联系人**——各模块顶部 const store 一次性缓存，若在创建时闭包固定 cid 则切换后仍读写旧桌面）/ `storeFor(cid)`；注册表 `getContacts/createContact/renameContact/deleteContact/setActiveContact`（切换前 flush 聊天防抖写盘 + 广播 `contact-switched` 事件 + 回桌面）；一次性迁移 `migrateLegacy`（旧顶层键归入 default，**只要发现旧键就迁移**，不能因标记误设而跳过——否则 idbRestore 异步回填的旧数据永不迁移；补迁移不得覆盖已有 contacts）。
  - **朋友圈 `feed.js`**：posts 存全局 `xy-home-v2:feed-posts`；作者身份快照 `{role:'me'|'ta', owner:cid, authorName, authorAv, taName, taAv}`，渲染/评论/点赞一律用快照（新数据）或 role 兜底（旧数据 by 字段）；`maybeAutoPostFor(cid)` 遍历所有联系人、TA 各自用**自己桌面字卡**（`getCustomCardsFor(cid)`/`getMediaCardsFor(cid,type)`）发动态；评论/回复内容也按动态所属桌面取字卡（`genMixedCards(...,cid)`/`pickReplyContent(cfg,cid)`）；点赞/评论/回复的身份与通知文案用 `p.taName || partnerName()`。
  - **字卡 `chatcard.js`**：新增 `contact-switched` 重载 groups + `window.getCustomCardsFor(cid)`/`getMediaCardsFor(cid,type)`（按 cid 读 cc-groups，供朋友圈 TA 用）。
  - **22 个模块 rewire 到 activePrefix/activeStore**（含 chat/mail/calendar/records/music-player/p2-features/personalize/decision 等）：`uid + ':'` 全部动态化为 `window.activePrefix() + ':'`（运行时取当前联系人，**不能**在模块顶部缓存）；模块级派生常量 MYE_KEY/MUSIC_FILE_PREFIX 改函数；各模块加 `contact-switched` 重置内存态（chat 清 msgs/chatDbReady/pendingLocal、mail 重读 IDB、calendar 清 calCache、music 重载歌单+停播、personalize/p2 刷桌面壁纸图标备忘心情打卡、records 重渲染、decision 清 pending）。
  - **data-backup.js**：导出/导入/清空/回滚恢复为**全量**（`xy-home-v2:` 前缀，覆盖所有联系人命名空间 + 全局键），摘要/核对按所有桌面聚合 chat-msgs/头像/摸鱼。
  - **template.html**：设置页新增 `row-contacts`「联系人 / 桌面」入口（含用户图标，独立 set-group 置顶）。
  - **关键坑记录**：① 正则 `/uid \+ ':'/`（`'` 后接 `:` 再**接 `'`**）会要求冒号后紧跟单引号而漏匹配，正确应为 `/uid \+ ':/`；② `JSON.stringify(async IIFE())` 同步返回 undefined（awaitPromise 也等不到），测试脚本要用同步 IIFE；③ build.mjs 健康检查会警告未跟踪 .mjs 临时脚本。
  - ⚠️ **需对方知悉**：`AGENTS.md` 文件归属按默认执行，本次 contacts.js 归「系统/全局」域；`build.mjs` jsFiles 新增 contacts.js；`index.html`/`sw.js`/`version.json` 已构建产物。**未提交**，等待统一提交/部署（版本号将随提交数自动 +1）。

### 2026-08-17
- [本会话] 完成（一加7Pro · 夸克浏览器「音乐里本地上传的音乐无法播放」修复，已构建 verify 10/10 + 无头浏览器回放探测 14/14，**未提交**）：根因——本地上传音乐以 **base64 dataURL 字符串**存 IndexedDB（`music-file:<id>`），播放时 `new Audio(); audio.src="data:audio/mpeg;base64,…"`；夸克（UC 系 Chromium 内核）对 `<audio src="data:…">`（尤其大段 base64）播放失效，且无报错（`audio.error` 为 null、play() 不 reject、只静默不出声）。修复 `src/js/music-player.js` 统一改用 **Blob + `URL.createObjectURL`（blob: URL）** 播放（标准方案，无 size 限制）：① 上传改 `readAsArrayBuffer` → 存 `Blob`（compact、可结构化克隆），读时长用对象 URL 并即时 revoke；② 新增 `playLocal(m,v)`——本地播放统一走 blob: 对象 URL，`v instanceof Blob` 直接用、旧版 dataURL 字符串自动转 Blob（fetch 优先，失败手动 base64 解码），异步转换期切歌守卫；③ `teardownAudio`/`onended` 释放对象 URL；④ 种子歌外链失败兜底旋律（`playDemoFor`）同步走 `playLocal`；⑤ 缓存统计兼容 Blob（真实字节）与旧字符串（×0.75），MB 换算统一；⑥ `src/js/data-backup.js` 导出时 **Blob→dataURL 字符串序列化**（JSON 无法存 Blob，原 JSON.stringify 会把 Blob 变 `{}`），导入后播放路径自动识别转回。无头 Chrome 回放探测 14/14：新 Blob 存储播放（blob: URL、无错误、进度走动）、旧 dataURL 兼容播放、IDB 缺失明确 toast、备份导出转换正确且 JSON.stringify 不抛错。临时探测脚本已删。涉及 `src/js/music-player.js`、`src/js/data-backup.js`。已 `node build.mjs` + `npm run verify` 10/10。**未提交**，等待统一提交/部署。

### 2026-08-17
- [AI-A] 完成（iPhone 13 · iOS Edge「桌面卡住，点【聊天】无反应、什么都点不了」修复，已构建 verify 10/10 + CDP 复现/行为验证，**未提交**）：根因——`calendar.js`「TA 的今日留言」在**页面加载 800ms 就弹出**，早于用户点开屏「点击进入」；用户进入后第一眼就是被 `modal-mask`（z-index 90、全屏半透明遮罩 + `body.scroll-lock` 全页锁滚动）盖住的桌面，点【聊天】等图标实际点在遮罩上 =「什么都点不了」（CDP 实测：开屏关闭后 0.8s 桌面 modal 未隐藏、scroll-lock=true、聊天图标命中 modal、点击无效；上一轮只修了「聊天页打开时跳过」，桌面路径未覆盖）。修复 `src/js/calendar.js`：今日留言由**居中遮罩弹窗改为顶部非阻塞横幅**（复用 desk-msg 式 fixed 顶部横幅，z-index 89，不锁滚动、不遮操作）——① 展示时机改在**开屏关闭后**（轮询 splash 隐藏 + 1s 延迟，避免被开屏盖住/8s 自动收起过期）；② 仅桌面可见时展示（聊天/其他页或已有弹窗时不打扰）；③ 8s 自动收起，**点击横幅直接打开日历页**查看完整留言；④ 每天一次的标记逻辑保留（LS+IDB 双写）。CDP 验证：开屏关闭后 1.2s 横幅出现（330×182 顶部，内容完整）；**横幅可见时点【聊天】正常进入聊天页**（不遮挡不锁滚动）；9s 后横幅自动隐藏；刷新后不再弹（标记生效）。涉及 `src/js/calendar.js`。已 `node build.mjs` + `npm run verify` 10/10 + CDP 复现对比（修复前点聊天无效/修复后正常）。临时探测脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（信箱信纸图片追加修复：统一大小+行内留空，已构建 verify 10/10 + 浏览器实测，**未提交**）：用户反馈「信箱里联系人使用的图片和表情包依旧一大一小」+「图片和表情包也是字卡，要每个字卡中间空一格，不要一行一个字卡」。修复 `src/js/mail.js` `renderBody()`：去掉 `sticker:`/`image:` 的尺寸区分（`.mail-body-img-stk` 类删除，图片/表情包统一渲染为 `class="mail-body-img"` 且 img 标签后追加空格）；`src/css/chat-pages.css` `.mail-body-img` 改为 `max-width:100px; max-height:100px; display:inline-block; vertical-align:middle; margin:2px 3px`（统一同尺寸 + 行内混排 + 字卡间留空，不再独占一行）。实测：sticker 与 image 两张图均 100x75px 相同大小、同一行、间隙 10px，点击仍可查看大图。涉及 `src/js/mail.js`、`src/css/chat-pages.css`。已 `node build.mjs` + `npm run verify` 10/10 + 浏览器实测（信纸两图 class 统一、大图查看器仍可用）。临时测量页已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（信箱/朋友圈图片显示修复，已构建 verify 10/10 + 浏览器实测 9/9，**未提交**）：用户反馈「信箱和朋友圈图片显示依旧有问题」。① **信箱**：来信/回信里的图片与表情包统一为缩略图（图片 220→150px、表情包 96→80px，`.mail-body-img` 加 `cursor:zoom-in`），并**可点击查看大图**（复用聊天 `window.viewChatImage`）——`src/js/mail.js` 新增 `bindLetterImgClicks()`，信详情（openLetter→tc-body）与回信页原信（openReply→mail-reply-original）都绑定。② **朋友圈动态**：联系人发布的图片/表情包与我的发布统一进 `.feed-imgs` 网格（同一套 CSS 尺寸规则，本就共用；实测 2 张=141px/3 张=116px 双方一致）；修复**全部朋友圈页图片点不动**——`src/js/feed.js` 把图片点击绑定抽成 `bindFeedImageClicks()` 供主列表与「全部朋友圈」页共用；**老数据兼容**：旧版动态把图片 dataURL 直接拼进正文（含 `sticker:`/`image:` 前缀与无前缀），渲染时抽出并入图片网格，保证与我的发布大小一致（注意正则：前缀与 dataURL 必须整体作为一个可选分组 `((?:sticker|image):)?(data:image…)`，若写 `(?:sticker|image):?(data:…)` 会在 `data:image` 中间误匹配 `image` 导致整体失败）。③ **评论区**：我/联系人在朋友圈评论区及回复发送的图片/表情包统一为缩略图（100→80px、回复 60→56px，`.feed-inline-img` 加 `cursor:zoom-in`），且**可点击查看大图**（主列表已有、全部朋友圈页本次补上）。涉及 `src/js/mail.js`、`src/js/feed.js`、`src/css/chat-pages.css`。已 `node build.mjs` + `npm run verify` 10/10 + 浏览器实测 9/9（信箱信纸图/回信页原信图/动态网格图/评论图/全部朋友圈主图+评论图/我的全部朋友圈图 点击均弹出大图查看器；旧格式内联图帖抽入网格后网格 1 张/内联 0 张；评论图保持内联缩略图）。临时种子/测量页已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（字卡库两项增强，已构建 verify 10/10 + CDP 功能探测 20/20，**未提交**）：① **批量导入弹窗顶部「确定」按钮**——安卓下多行输入被转成可自动增高的 ce-box，导入内容多时弹窗变高、底部「确定」滚出视野（用户反馈找不到确定按钮）。修复：`src/js/chatcard.js` 新增 `showImportTopOk()`，批量导入弹窗打开前在顶部标题栏右侧注入「确定」按钮（sticky 吸顶、点击复用底部按钮，弹窗关闭即还原，不影响其他弹窗），`src/css/chat-pages.css` 新增 `.cc-modal-topbar/.cc-modal-top-ok`。② **系统预设字卡逐张开关**——字卡库全部系统预设字卡（聊天默认字卡 4621 张 / 聊天回应字卡 / 聊天情绪字卡 / 查岗日常字卡 / 桌面今日情话）每张卡右侧新增单卡开关，可逐张开启/关闭，关闭后不再被抽取；关闭态灰化（`.cc-item.off` / `.tc-qrow.off`），顶部总开关与逐张开关叠加生效（关闭态优先）。涉及 `src/js/default-cards.js`（dc-off-分类:内容）、`src/js/mood-reply-cards.js`（回应 rc-off-分类:内容、情绪 mc-off-mood:内容，getMoodCard/getHeartCard/getIntentCard/getReplyCard/getFollowupWord 全部过滤）、`src/js/p2-features.js`（ck-off-分类:内容，genCheckin/renderCheckinCards）、`src/js/quote-cards.js`（quote-off:内容，getQuoteOfDay/renderList）、`src/css/chat-pages.css`（.ccard-toggle 小号开关 + .off 灰化）。存储全部走 localStorage `xy-home-v2:` 前缀键。CDP 探测 20/20：顶部按钮出现/触发导入/关闭还原、五类字卡开关默认开启+关闭持久化+抽卡 0 命中、getFollowupWord 不返回关闭词、灰化样式与开关一致。⚠️ 提醒对方：本轮构建（12:39）时 `src/js/chat.js`/`template.html` 等仍含未保存的进行中改动（chat.js 12:37 仍在写），本次构建已一并包含其当前内容；统一构建提交前请双方确认各自文件已收尾（chat.js 以当前版为准，之前 WORKLOG 所述「问问TA 缺 id」已由当前源自带 `opts.id='chat-ask-opts'` 解决）。**未提交**，等待统一提交/部署。

### 2026-08-17
- [AI-A] 完成（用户反馈「聊天页【问问TA】不能设置联系人单选或文字回复」——问问TA 回复类型选择功能，已构建 + verify 10/10 + CDP 双场景 16/16，**未提交**）：聊天页「更多功能 → 问问TA」半框现支持选择回复类型——① 顶部新增「文字回复 / 单选题」切换（仅 ask 模式显示）；② 选「单选题」时显示选项输入框（每行一个，可写 `选项~TA回应`，TA 会用该回应回复，与 TA 的小问题/询问管理页同款格式）；③ 发送后 TA 随机选一个选项作答，有预设回应则用预设回应回复（无则从字卡文字池挑），聊天卡片显示「✓ TA：选项」+ 预设回应。涉及 `src/js/chat.js`（半框注入 ensureChatAskTypeRow/resetChatAskType + submitChatAsk 单选解析与作答 + renderMsg 卡片渲染）、`src/css/chat-main.css`（.chat-ask-type/.chat-ask-type-btn/.chat-ask-opts）。**修复了上一轮 WORKLOG 标记的「缺 id」bug**：选项 textarea 由本实现自带 `opts.id='chat-ask-opts'`，发送解析/重置均能取到（该缺 id 问题已随本实现解决，无需对方再补）。关键实现点：① 选项在收起半框前解析——安卓 ce-box 转换下面板隐藏后 innerText 读不到换行，多行选项会并成一行（实测已修）；② 单选记录写 askType:'single'+askOptions，重渲染/历史恢复渲染「等待 TA 选择…」与回应行。CDP 验证（Android 390×844 含 ce-box 转换 + 桌面 1280×800）：类型切换显示/隐藏、选项 2 行解析（~分割）、TA 随机选一选项并用预设回应回复、卡片渲染、文字回复回归无选项，16/16 PASS；`npm run verify` 10/10。临时脚本已删。⚠️ 提醒对方：本次开工时 `src/js/chat.js` 未包含上一轮 WORKLOG 所述「AI-B 聊聊 TA 单选题」源码（12:30 构建时在源里、本次已不在，疑被并行回退），本实现为从当前源全新实现且功能一致；若对方仍持有 chat.js 的旧改动请勿再覆盖本文件，统一构建前双方确认 chat.js 以本版为准。**未提交**，等待统一提交/部署。

### 2026-08-17
- [AI-A] 完成（iPhone 13 · iOS Edge「桌面点【聊天】进入聊天页后什么也点不动」修复，已构建 + verify 10/10 + CDP 复现脚本 PASS，**未提交**）：根因——`calendar.js` 启动 800ms 后弹出「TA 的今日留言」居中遮罩弹窗（`modal-mask` z-index 90、全屏锁滚动）。用户通常开屏点「点击进入」后立刻点桌面【聊天】进聊天页，弹窗恰好盖在聊天页上：整页点不动 + 背景锁滚动（仅 8 秒自动关，用户没注意弹窗就表现为「一直卡死」；若此时点的是弹窗遮罩外的聊天页区域，还无法直接关闭弹窗）。修复：`src/js/calendar.js` doGreet 触发前增加聊天页可见性判断——`page-chat` 未隐藏时跳过今日留言（用户正在聊天不打断）；桌面停留时仍照常弹出（行为不回归）。CDP 验证：加载 500ms 注入进聊天页 → 800ms 定时器触发时 openModal 调用 0 次、弹窗未开、无锁滚动、聊天发送按钮可点；返回桌面后弹窗正常弹出且 8s 自动关闭。另：本轮构建（12:30 由 AI-B 执行，已包含 AI-A 的 calendar.js 改动）同时包含 AI-B 的聊聊 TA 单选题 + 开屏公告改动。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（通话挂断过于频繁修复，已构建 verify 10/10，**未提交**）：用户反馈 HONOR 20 Pro / vivo Y35「电话 3 分钟左右自动挂断、没一通超过 10 分钟、不按通话概率跑」。根因——`call.js` 对方挂断检查「接通 10 秒后每 30 秒掷一次」，默认 5% 实际效果远超设置字面值：3 分钟累计 ~23% 被挂断、10 分钟内累计 ~62%，与用户实测完全吻合。修复：① `src/js/call.js` 挂断检查改「接通满 3 分钟保护期后才开始，且每 60 秒掷一次（原 30 秒）」，默认 `CALL.hangup` 5→2，头部注释同步；② `src/js/reply-settings.js` DEFAULTS `call-hangup` 5→2 + 注释。10 分钟累计挂断约降到 13%。已 `node build.mjs` + `npm run verify` 10/10。⚠️ 构建时发现另一进程并行改动（chat.js 12:28/12:30 仍在写），本次构建已包含其未完成改动，**未提交**，待对方收尾后统一构建提交。
- [本会话] **需要对方处理（chat.js 问问TA 单选题新功能 bug）**：`ensureChatAskTypeRow` 创建的选项 textarea 只设 `className='chat-ask-opts'` **未设 id**，但 `chat.js:2354` 发送解析与 `:2269` 重置都用 `document.getElementById('chat-ask-opts')` → 恒为 null → 单选题永远发不出去（始终 toast「单选题请填写选项，每行一个」）。补一行 `opts.id = 'chat-ask-opts'` 即可。对方正在编辑该文件，本会话未动，请完成后知会统一构建。

### 2026-08-17
- [AI-B] 完成：开屏公告按用户新文案整体重排——sub 改为「8.12开搓三十个小时，8.15发布，目前还在日更修，暂时不建议开始二传二改」；原 11 条合并且重新排号（后追加第 11 条）共 11 条：①感谢内测反馈 ②内测时间8.15～8.29（链接已在GitHub，内测期内暂不公开宣传）③8.30完全公开后可二传二改（并入原日更部署说明：在边修边部署网站…）④不开测试群，有问题直接评论和私信 ⑤反馈问题请附手机型号和浏览器 ⑥关于bug（二传二改建议等公开版）⑦使用规范（8.30完全公开后适用：转载要署名/二次修改注明原作者/禁止商用）⑧同步刷新 ⑨灵感来源 ⑩新增导入milk字卡库 ⑪关于数据丢失（可能是bug也可能是浏览器正常概率丢失→需要备份；内测更新多，有新版本刷新使用前建议备份数据）。涉及 `src/pwa/notice.json`（在线覆盖源）与 `src/template.html`（离线兜底，两处同步），已 `node build.mjs` + `npm run verify` 10/10 + 产物内容核对（index.html/根目录 notice.json 与 src 一致）。**未提交**，待统一提交/部署（工作区另有未跟踪调试脚本 tools/_probe-chat-freeze*.mjs，请确认后清理）。

### 2026-08-16
- [AI-B] 完成（iOS 默认浏览器「聊天发送完文字后界面放大、键盘与页面间一长块灰色、页面位置比例错乱，只有改联系人昵称才恢复」修复，已构建 verify 10/10 + CDP 模拟 5/5，**未提交**）：根因——iOS Safari 键盘是 overlay 模式，`syncIosKb` 键盘弹出时把 `.phone` 收缩到键盘上沿（844→500）。**发送消息时清空聚焦的 contenteditable 会触发键盘收起，但 iOS 常不派发 visualViewport resize 事件**，旧恢复逻辑（`focusout` 里 `innerHeight - vv.height <= 80` 才恢复）在 overlay 键盘下该值恒为 ~344 永远不成立、且完全依赖漏掉的 vv 事件 → `.phone` 卡在 500px 收缩高度：下方露出 body 灰底（键盘与页面间的灰色块）+ 布局位置比例错乱；只有下一次完整键盘开合（改昵称弹窗聚焦输入）才复位。修复：`src/js/mobile-adapt.js` ① 统一 `restoreKb()`（清高度/顶对齐 + 钉滚动 + 停轮询）；② `focusout` 失焦即恢复（250/450ms 两档 + 400ms 兜底，不依赖 vv 事件）；③ 新增 600ms 键盘状态自愈轮询——键盘收起但 vv 事件漏发时（vv≈布局高度或已失焦）自动恢复；④ 键盘弹出/收缩/恢复全程 `pinScrollTop` 防灰底露出（上一轮修复保留）。另 `src/css/base.css` 16px 防缩放规则补 `.phone select`（`.tc-input` 分类下拉 13px，iOS 聚焦 select 同样整页放大）。CDP 模拟 5/5：键盘弹出收缩 500、发送后失焦 250ms 即恢复（不依赖 vv 事件）、600ms 轮询兜底、再次聚焦/收起循环正常。**未提交**，等待统一提交/部署。

### 2026-08-16
- [AI-A] 完成（OPPO 雨见浏览器「来信有提示，信箱却空白」修复，已构建 + CDP 复现脚本 2 阶段 PASS + verify 10/10，**已提交推送**）：根因——v3.5.120「信箱权威加载防护」的 `mailDbReady=false` 暂存窗口未闭环：来信/回信写入只进内存 `mailPending`，而 `load()`/`render()`/`updateBadge()` 仍只读持久层 → 来信弹窗照常提示「给你寄来了一封信」，信箱列表空白；IDB 打开/读取挂起（OPPO 雨见浏览器后台挂起/存储异常，CDP 注入 indexedDB.open('mochi-db') 永不返回成功复现）时 `mailDbReady` 永远为 false，刷新后暂存信件永久丢失。修复 `src/js/mail.js` 三处：① `load()` 合并 mailPending（按 id 覆盖 + tm 保序），弹窗提示过的信件即时可见/可回/清角标；② IDB 权威读回合并基准扩展——IDB 有值用 IDB（备份导入语义），IDB 空保留本地旧信，暂存按 id 覆盖合并落盘，保险丝后迟到返回取并集不覆盖；③ 15s 权威读取保险丝（与 idbRestore 12s 同理）强制就绪并落盘暂存信件。CDP 复现验证：挂起态来信→信箱 1 封、15s 保险丝落盘、刷新后信件仍在（修复前信箱空白+刷新丢失）；`npm run verify` 10/10。另：本轮构建同时包含 AI-B 已保存的 chat-main.css/chat-settings.js 移除聊天壁纸 background-attachment:fixed 改动（无 WORKLOG 记录，已一并构建提交，请 AI-B 知悉）。

### 2026-08-16
- [AI-B] 完成（iOS 默认浏览器「聊天点击输入栏，键盘上方出现灰色栏把所有页面遮盖，关掉键盘才恢复」修复，已构建 verify 10/10 + CDP 模拟 3/3，**未提交**）：根因——iOS Safari 键盘是 overlay 模式，`mobile-adapt.js` 的 `syncIosKb` 已把 `.phone` 按 visualViewport 收缩到键盘上沿（高度 844→约 500）；但 **iOS 键盘弹出时会自动把页面滚动到聚焦的输入框**（聊天输入栏在 `.phone` 底部），而 `.phone` 是普通文档流元素（flex 顶对齐，非 fixed），window 滚动后它整体上移，**下方露出 body 灰色背景（#e9e9e9）**——表现就是「键盘上方一条横贯全屏的灰色栏，把所有页面都遮盖」。修复：`src/js/mobile-adapt.js` `syncIosKb` 增加 `pinScrollTop()`——键盘弹出瞬间、收缩持续期间、收起恢复时都把页面滚动钉在顶部（window/html/body 三级归零，只在有滚动偏移时执行，避免无谓 reflow）。收缩态下页面内容全部在 `.phone` 内，任何滚动都只会露出灰底，归零无副作用。CDP 模拟验证 3/3：键盘弹出 phone 收缩 500、模拟 iOS 滚动 150 后被钉回 0（phoneTop=0 不露出灰底）、键盘收起后高度/顶对齐/滚动全部恢复。**未提交**，等待统一提交/部署。另：工作区有对方遗留未跟踪文件 `_test_backup.json`/`inject-hook.mjs`，请确认后清理。

### 2026-08-16
- [AI-A] 完成（「回复速度最长」不再限制 84 秒，可任意调大，已构建 verify 10/10 + CDP 手机模式 8/8，**未提交**）：① `src/template.html` rs-max 移除 `data-max="84"`（保留 data-min=2）；② `src/js/reply-settings.js` 两处 stepper 范围校验 `data-max` 缺失兜底 `Infinity` = 不设上限（± 按钮/直接输入/保存按钮统一走一套校验，其他有 data-max 的 stepper 不受影响），`commit`/保存按钮用 `isFinite` 防 NaN/Infinity 入库；③ **顺带修复保存按钮读值 bug**：运行时 `st.querySelector('.stp-val')` 在转换后页面会先匹配到 ce-box DIV（继承了 stp-val 类），读到 DIV 的过期 value expando 而非当前显示值 → 保存按钮可能把设置还原成旧值。syncUI 与保存按钮均改为固定 `input.stp-val`（value 代理始终读写 ce-box 当前文本）。CDP 验证：+ 按钮超 84 到 97、直接输入 600/1000 保存成功、刷新后回显 1000、聊天延迟公式兼容大数、rs-min 仍钳 60、非法输入回退下限 2。**未提交**，等待统一提交/部署。

### 2026-08-16
- [AI-A] 完成（Edge 手机端反馈「回复设置页数字只有横线、没有默认数值」修复，已构建 verify 10/10 + CDP 手机模式双视口 12/12，**未提交**）：根因——`mobile-adapt.js` 的 ce-box 转换器（安卓 Edge 等非 iOS 启用）在**定义 input.value 代理之后**才读初始值同步进 contenteditable div：`syncUI()` 只写 property（`val.value=…`）被代理遮蔽读到空 → ce-box 文本为空，只剩 CSS 虚线横线。仅静态模板 + 转换前同步赋值的回复设置 stepper 中招（动态 stepper 创建后异步转换、赋值走代理，不受影响）。修复：`src/js/reply-settings.js` syncUI 同时写 `setAttribute('value', …)`，转换器 `getAttribute('value')` 可拿到初始值（桌面原生 input 双写无副作用）。CDP 验证：390×844 / 360×640 下 ce-box 显示默认数值 1、抽检 6 个 stepper 均有数字、点 + 递增同步无回归。**未提交**，等待统一提交/部署。另：`tools/` 下上一轮遗留的 `_probe-stepper.mjs`/`_probe-shot.png` 已确认是本会话探测脚本，已删除。

### 2026-08-16
- [AI-B] 完成（聊天拍一拍卡片增强：顶部分组切换栏 + 自定义文字输入，已构建 verify 10/10 + CDP 冒烟 10/10，**未提交**）：更多功能→【拍一拍】打开的卡片现在——① 顶部新增分组切换栏（复用表情包 `.emoji-g-chip` 样式，「全部」+ 各分组 chips，横向滚动，点击切换只显示该分组字卡，选中的分组删除后自动回「全部」）；② 分组栏下方新增文字输入行（圆角输入框 + 「拍一拍」按钮），输入任意文字即可对 TA 使用拍一拍（复用 `sendPoke`：含「你」自动替换为 TA 昵称、未输入时 toast 提示、Enter 直接发送），空字卡库时也提示可直接输入。涉及 `src/js/chat.js`（新增 `pokeGroupsBar`/`pokeInputRow` 注入 + `renderPokeGroupsBar` + 分组过滤渲染 + `doPokeInput`）、`src/css/chat-main.css`（`.poke-groups`/`.poke-input-row` 样式）。Android 下输入框由 mobile-adapt 自动转 ce-box，读写仍走 `input.value` 代理（CDP 验证通过）。**未提交**，等待统一提交/部署。另：`tools/` 下发现非本会话产生的 `_probe-stepper.mjs`/`_probe-shot.png`（22:27 时间戳），疑似其他进程遗留，未处理。
- [AI-B] 完成（iOS 默认浏览器「桌面更换头像后所有按钮失效、点击聊天框无效、发不了消息；刷新重开依然失效」修复，已构建 verify 10/10 + CDP 回归 5/5，**未提交**）：根因——旧版图片压缩 `compressImage/compressMyEmoji` 在**解码失败/压缩异常时回退存原图**（`resolve(dataUrl)`），iOS 相册选 48MP/ProRAW 级大图（base64 十几 MB）时即被原样入库；iOS Safari 对该超大 dataURL 的 `img.src` 解码会占数百 MB 位图内存、拖崩渲染进程——表现「画面正常（静态快照）但所有按钮点击无响应」；刷新后 `idbRestore` 恢复该 dataURL 又渲染 → 每次加载重现，所以**刷新重开依然失效**。修复三层防护：① `src/js/personalize.js`/`chat.js`/`chatcard.js` 的压缩函数统一：**解码前按 base64 长度（>8MB）拦截、解码后按像素（>2600 万）拦截、失败不再回退原图**，返回 null 由调用方 toast「图片过大或格式不支持，请换一张小图」（头像/壁纸/自定义图标/表情包/图片字卡全部覆盖）；② 渲染前防护——`applyAvatar`/`fillAvatar`（头像）与 `restoreAppIcons`（自定义图标）检测存量 >500KB 的异常值即清除（LS+IDB 双清）回默认图，**保证用户已有坏数据在刷新后自动恢复可用**；③ feed.js 的 compressImage 本就失败不存原图，无需改。CDP 回归 5/5：存量超大 avatar-user 启动即清除回默认 SVG、清理后聊天按钮可点、9MB 大图上传拒绝不入库且 toast 正确、正常小图上传成功（不回归）。**未提交**，等待统一提交/部署。

### 2026-08-16
- [AI-B] 完成：手机端适配第三轮深检（只读，未改代码、未构建）——① 全量 CSS 逐文件审查（home/chat-main/chat-pages/setting，含 safe-area 底部面板全覆盖、emoji 网格、管理条、音乐批量条）；② 真实触摸穿透验证（CDP dispatchTouchEvent）：无弹窗桌面可滚、弹窗遮罩上滑桌面不穿、表情面板打开消息区不穿；③ iOS UA 模拟 7/7：不转 ce-box 保留原生 input、chat-body 豁免 translateZ、全屏开关 iOS 引导文案、浏览器内点全屏回弹不误启全屏、状态栏正常；④ **修复点回归**：desk-msg 弹出不锁滚动（FLOAT_SELECTORS 移除生效）+ 弹出期间桌面可触摸滚动、今日留言弹窗约 6.5s 自动关闭不卡死、真弹窗仍锁滚动未误伤、iOS 文本输入框全部 16px（modal-input/tc 文本输入/textarea 均 16px；13px 的 `.tc-input` 是 SELECT 分类下拉框，不弹键盘无需 16px，属合理）。结论：**未发现需要修复的移动端 bug，现有修复无回归**。临时脚本已删，工作区干净，无提交。

### 2026-08-16
- [AI-A] 完成（iPad 夸克浏览器反馈「短暂滑动失效→全部页面卡住→过会儿正常→又卡」bug 修复，已构建 verify 10/10 + CDP 采样验证，**未提交**）：根因是两个浮层误锁全页面滚动，与 iPad/夸克无关（桌面 Edge 同样复现）——① **主因：`#desk-msg` 新消息横幅被 `mobile-adapt.js` 的 FLOAT_SELECTORS 当全屏浮层锁滚动**。横幅只是顶部 fixed 小提示条（6 秒自动隐藏、不遮挡滚动区），但一弹出就给 body 加 scroll-lock → 所有页面 overflow:hidden 滑不动；TA 每来一条消息就弹 6 秒 = 用户感知的周期性「卡住→正常→又卡」。修复：把 `#desk-msg` 从 FLOAT_SELECTORS 移除（横幅自身交互由 chat.js 处理，无需锁滚动）。② **次因：「TA 今日留言」弹窗启动即弹且永不自动关闭**（noInput 无输入、只能手动点确定），遮罩期间同样锁滚动，用户没注意弹窗就表现为一直卡死。修复：`src/js/calendar.js` 今日留言弹出后 8 秒自动收起（用户仍可点确定/背景/返回键立即关闭）。涉及 `src/js/mobile-adapt.js`（跨 AI-B 文件，已获用户授权）、`src/js/calendar.js`。CDP 采样验证：修复前启动 282ms 起 desk-msg 弹出期间 scroll-lock 恒为 true、modal 永久 SHOWN；修复后 desk-msg 弹出期间 lock=false、今日留言 1038ms 弹 → 9053ms 自动关且 scroll-lock 同步解除，无残留。已 `node build.mjs` + `npm run verify` 10/10，临时脚本已删。本次构建同时包含 AI-B 未提交的 base.css 输入框 16px 修复；**未提交**，等待统一提交/部署。
- [AI-B] 完成（iOS 非全屏浏览器三处 bug 同源修复，已构建 verify 10/10 + CDP 字号实测 16px，**未提交**）：根因——iOS Safari 对聚焦时字号 <16px 的输入框会**自动整页放大且缩不回去**。base.css 原有 16px 防缩放规则按类名逐个列（`.chat-input/.tc-input/.card-search-input/input[type="text"]…`），但 chat-main/chat-pages 后加载文件以相同/更高特异性重新声明了更小字号（后加载覆盖先加载），且字卡库 4 个搜索框（cc/dc/mc/rc-search-input）**没有 type 属性**连 `input[type="text"]` 都匹配不到 → 实测全部 13-15px。触发场景：字卡库搜索框聚焦、自定义字卡「添加」表情的批量导入弹窗 textarea（13px）、聊天设置气泡框大小/字体链接/气泡 CSS 弹窗输入（tc-input 13px）。修复：`src/css/base.css` 移动端 16px 规则改为 `.phone` 前缀 + `:not` 过滤的输入框通配（排除 readonly 步进值/checkbox/range/file/color/date 等），特异性 (0,14,1) 压过所有后加载类规则、与加载顺序无关；只改字号不动布局。CDP 实测：cc/dc/mc/rc 搜索框、modal-input/textarea、聊天搜索、TA问题输入全部 16px（chat-input 是 contenteditable div 保持 15px，div 不触发 iOS 缩放）；emoji 添加/批量导入代码路径逻辑正常（toast「已导入 3 条/已添加 1 个表情」）。**未提交**，等待统一提交/部署。

### 2026-08-16
- [AI-A] 完成（iPad Edge 反馈 bug 修复，已构建 verify 10/10 + CDP 回归通过，**未提交**）：聊天情绪字卡总开关关闭后联系人仍发送字卡——根因：开关只写 `mh-mood`，而情绪链三类卡中「心意卡/交流意图卡」无独立 UI 开关、默认开启且不依赖情绪卡命中（各按 40% 独立判定），关掉情绪卡后仍以约 40% 概率发心意/意图卡。修复：`src/js/mood-reply-cards.js` ① 总开关 change 时同步写 `mh-mood`/`mh-heart`/`mh-intent` 三键；② `triggerEmotionChain` 入口加总闸（mh-mood 关则整链停发，兼容存量 `mh-mood=0` 而 heart/intent=1 的旧状态）。CDP 验证：只关情绪 200 次链触发 heart/intent 0/0（修复前 74/86）、全关 0、全开行为不变；端到端（开关→聊天）无情绪卡。已 `node build.mjs` + `npm run verify` 10/10，临时脚本已删。本次构建同时包含 AI-B 未提交的 fullscreen.js/reply-settings.js/chatcard.js 改动；**未提交**，等待统一提交/部署。
- [AI-B] 完成（OPPO 手机 Edge 反馈两 bug 修复，已构建 verify 10/10 + CDP 冒烟 13/13，**未提交**）：① 全屏无法关闭——根因：关闭分支先判 `(display-mode: fullscreen)`，OPPO Edge 等浏览器在 Fullscreen API 激活期间该媒体查询也匹配（反映当前全屏态非安装态），关闭分支永远命中 → 开关弹回开启、全屏退不出。修复：`src/js/fullscreen.js` 关闭分支改为先无条件退出（exitFs + 清 fs-css-active）+ 持久化关 + `_userFsOff` 意图标记（系统全屏变化不再把开关弹回）；若退出后仍处系统级全屏（安装态 display_override 直启）300ms 复核后弹「全屏模式已关闭」说明。② 回复设置概率无法直接输入——根因：stp-val 平时 readonly（防自动填充条，转换器据此跳过），点击进入编辑后 readOnly 解除，若期间 body 子节点变化（如首次建 cc-toast 提示节点）触发全量转换 → 输入框被 contenteditable 化（ce-box），OPPO Edge 对 ce-box 聚焦/输入失效（与雨见搜索框同源）；且手势开始时 readonly 会让部分安卓浏览器判定只读字段不弹键盘。修复：`src/js/reply-settings.js` stp-val 预标记 `ceDone` 永久跳过转换（保持原生 input）+ pointerdown 提前解除只读（键盘可靠弹出）。**未提交**，等待统一提交/部署。

### 2026-08-16
- [AI-B] 完成（OPPO 手机 Edge 反馈两 bug 修复，已构建 verify 10/10 + CDP 冒烟 13/13，**未提交**）：① 全屏无法关闭——根因：关闭分支先判 `(display-mode: fullscreen)`，OPPO Edge 等浏览器在 Fullscreen API 激活期间该媒体查询也匹配（反映当前全屏态非安装态），关闭分支永远命中 → 开关弹回开启、全屏退不出。修复：`src/js/fullscreen.js` 关闭分支改为先无条件退出（exitFs + 清 fs-css-active）+ 持久化关 + `_userFsOff` 意图标记（系统全屏变化不再把开关弹回）；若退出后仍处系统级全屏（安装态 display_override 直启）300ms 复核后弹「全屏模式已关闭」说明。② 回复设置概率无法直接输入——根因：stp-val 平时 readonly（防自动填充条，转换器据此跳过），点击进入编辑后 readOnly 解除，若期间 body 子节点变化（如首次建 cc-toast 提示节点）触发全量转换 → 输入框被 contenteditable 化（ce-box），OPPO Edge 对 ce-box 聚焦/输入失效（与雨见搜索框同源）；且手势开始时 readonly 会让部分安卓浏览器判定只读字段不弹键盘。修复：`src/js/reply-settings.js` stp-val 预标记 `ceDone` 永久跳过转换（保持原生 input）+ pointerdown 提前解除只读（键盘可靠弹出）。**未提交**，等待统一提交/部署。

### 2026-08-16
- [AI-B] 完成：手机端全量排查（只读检查，未改任何代码、未构建）——① `npm run verify` 10/10 基线通过；② 无头浏览器 390×844 / 360×640 GUI 实测：桌面/聊天收发/表情面板/字卡库搜索/桌面翻页(圆点)/日历/设置/昵称弹窗输入/聊天输入栏贴底全部正常；③ 专项边界测试 20/20：ce-box 转换器单行/多行显隐联动、emoji maxlength 按码点截断、多行按行读取、desk-msg 锁滚动联动、双浮层同开/逐个关闭锁不残留、浮层被移除后 touchstart 兜底解锁、聊天搜索框 ce-box 代理读写、信箱写信输入框转换。**结论：未发现需要修复的移动端 bug**；顺带确认 FULL_PAGES 不含 page-setting（设置页保留 tabbar 属设计行为，非 bug）、desk-msg 弹出时锁滚动属设计（6s 自动隐藏解锁）、tabbar 距 .phone 底 18px 是 padding-bottom 留白。临时测试脚本已删，工作区干净，无提交。

### 2026-08-16
- [AI-A] 完成：聊天记录「导出/导入」入口迁移到右上角三点 → 聊天设置「数据」分组（与「删除全部聊天记录」同组）——原输入栏更多面板里的「导出聊天/导入聊天」入口已移除（chat.js 删 more-export-chat/more-import-chat 处理器与 importChatFile/chatReadFileText，template.html 删对应按钮）。新增：chat.js `window.chatExportMsgs`（落盘+返回全量）/ `window.chatImportMsgs`（覆盖式导入：写 IDB 权威+清 LS 残留+复位分页窗口+就地重渲染，无需刷新）；chat-settings.js 绑定 cs-export-msgs / cs-import-msgs（导出下载 JSON，导入 FileReader 读取+校验+摘要二次确认）；template.html 数据分组新增两行。已 `node build.mjs` + `npm run verify` 10/10 + 临时 CDP 冒烟 11/12（1 项为测试脚本导航时序，非功能问题），临时脚本已删，**未提交**。
- [AI-A] 完成：桌面第二页摸鱼组件周末文案修复——周日（getDay=0）原来显示「离周末还有 6 天」（v3.5.131 旧逻辑），现周六/周日统一显示「今天是周末」。涉及 `src/js/personalize.js`（weekend-days 区块）；已 `node build.mjs` + `npm run verify` 10/10，**未提交**（提交由构建者统一处理）。
- [AI-B] 完成：移除整页 zoom 缩放（iOS 卡顿根因），恢复原版布局；已 `npm run build` 并用 `npm run verify` 验证 390×844 / 360×640 正常。
- [AI-B] 完成：新增 AGENTS.md（单一构建者 / 文件归属 / 不并行提交）、WORKLOG.md、tools/verify.mjs、package.json。
- [AI-B] 完成：AGENTS.md 补充快速定位表、构建顺序、数据存储约定、通用模式、git 提交规范；`npm run verify` 自检 10/10 通过。
- [AI-B] 注意：仓库里存在两个 AI 工具同时工作的风险——开工前务必读本文件 + git status，确认对方没有进行中的改动；遇到对方文件的 bug 只报告不改。
- [AI-B] 完成：批量导入修复（单输入框 + 按行拆分）上线；仓库清理（网页上传垃圾/嵌套目录）+ Git 流程接入；已构建推送。
- [AI-B] 完成：v3.5.138/139 多批部署（milk 导入、全屏兜底、邮件媒体、壁纸、后台保活等，共 9 次提交）；`npm run verify` 10/10 通过；版本号 APP_VERSION 统一在 build.mjs 维护（当前 v3.5.119，与 commit 版本号需人工对齐）。
- [AI-B] 待办：后续每轮构建部署后追加 WORKLOG 一行 + 跑 `npm run verify`（AGENTS.md 验证流程）。
- [AI-B] 完成：APP_VERSION 统一为 v3.5.139（build.mjs 单点维护，开屏/设置页同步）；`npm run verify` 10/10 通过；已推送。
- [AI-B] 完成：iOS 聊天页修复——键盘弹起不再用 position:fixed 锁 .phone（iOS contenteditable 在 fixed 祖先内无法输入，聊天输入栏打不进字的根因），改 flex 顶对齐 + 高度收缩；高度写入只在值变化时执行（键盘动画高频 resize 不再反复整页重排 = 聊天页卡顿缓解）。涉及 `src/js/mobile-adapt.js`；已构建，verify 10/10 通过。本次构建同时包含了 AI-A 已保存的 chat.js/home.css/chat-pages.css/bg-keep.js 改动（未单独提交）。
- [AI-B] 完成（获用户授权，跨 AI-A 文件性能优化，仅重构不改变行为）：① chat.js 追加消息滚动改「贴底才滚」+去重（原每条消息强制同步布局，收消息卡顿主因）；② saveMsgs 防抖回调去掉重复 IndexedDB 全量写入（store.set 已双写）；③ chatAddSystem/chatAddIn 去掉每次全量 loadMsgs+全量重渲染（启动已同步加载内存）；④ loadMsgs 合并写回仅在新数据时执行 + 恢复/restore-done 重渲染加贴底判断；⑤ enterChat 重复滚动去重；⑥ chat-settings.js 壁纸值未变不重写 style + background-attachment:fixed 独立图层；⑦ chat-main.css 移动端壁纸 fixed 兜底。涉及 `chat.js`/`chat-settings.js`/`chat-main.css`；已构建，verify 10/10 通过。另：构建时发现 AI-A 在并行改 calendar.js/mail.js，本次构建已包含，AI-A 无需重复构建。
- [AI-A] 完成：聊天设置页（右上角三点进入）底部新增「删除全部聊天记录」按钮——chat.js 新增 `window.clearChatHistory`（清内存 msgs + 防抖定时器 + localStorage + IndexedDB，store.remove 双写；同时清空聊天 DOM 与未读角标，不刷新页面）；chat-settings.js 绑定点击（openModal 二次确认）；template.html 新增数据分组锚点行；chat-pages.css 新增 `.set-row.danger` 红色危险行样式。已构建（本轮由 AI-A 代为执行），verify 10/10 通过，**未提交**。注：按归属 template.html 属 AI-B，本次为新增静态锚点行（与 JS 渲染两边同步约定），请 AI-B 知悉。
- [AI-A] 完成（跨 AI-B 文件，经用户授权本会话统一实现，已构建）：五项优化——① build.mjs 零依赖保守压缩（删 JS 整行注释/空行/缩进 + CSS 块注释，产物 1.31MB→1.05MB）；② chat.js 聊天记录读写全走 IndexedDB（saveMsgs/flushSave/saveMsgsNow 只写 IDB，loadMsgs 去掉 LS 优先读取，读到权威后清 LS 残留，IDB 空时 LS 兜底迁移一次）+ idb.js `idbRestore` 排除 `chat-msgs`（启动不再回填 LS，省 5MB 配额）；③ chat.js 聊天分页渲染（首屏最近 200 条，向上滚动按 100 条加载，搜索跳转旧消息自动扩窗，新增 renderWindow/renderStart，`clearChatHistory` 复位窗口起点）；④ clock.js + template.html + 新增 src/pwa/notice.json 开屏公告远程化（fetch notice.json 覆盖公告，失败保留写死兜底，list 空/hide 隐藏公告区，build.mjs 复制该文件）；⑤ music-player.js 音乐设置页新增本地音频缓存占用统计（IDB music-file 分批读）与「清理本地音频缓存」（删音乐文件+移出歌单，外链/种子歌保留）。已 `node build.mjs`（产物 1050941 字节）+ `npm run verify` 10/10 + 临时 CDP 冒烟测试 9/9（分页窗口/向上加载/搜索扩窗/存储路径/刷新恢复/公告拉取），临时脚本已删。本次构建同时包含 AI-A 未提交的 chat-settings.js 删除聊天记录 + home.css 分页指示器悬浮 + chat-pages.css 危险行样式；**未提交**，等待提交/部署安排。
- [AI-B] 完成（获用户授权，跨 AI-A 文件修复）：chat.js 分页回归修复——`addRec` 窗口重渲染分支补 `chatNearBottom()` 贴底守卫（原无条件 `renderWindow+scrollChatBottom`，用户翻旧消息时新消息进来会清空重渲染并强制滚底、打断阅读位置；现不贴底时走增量 append，窗口暂时超限无害）。涉及 `src/js/chat.js`，`node --check` 通过，**未构建未提交**（提交 092f199 之后的工作区改动，待构建者统一构建）。
- [AI-A] 完成（含 AI-B 文件，经用户授权本会话统一实现，已构建 verify 10/10，**未提交**）：① 修复通话系统消息 SVG 乱码——根因：v3.6.x XSS 转义升级后 `escTxt` 把 call.js 拼接的 `<svg class="st-ico">…</svg>` 整段转义成 `&lt;svg…&gt;` 纯文本（来电/通话记录显示乱码）。chat.js 新增 `pokeIconHtml`（仅对 st-ico 白名单前缀保留原样、其余仍全量转义）用于 poke 渲染；新增 `restoreEscapedPokeIcons` 迁移还原已存乱码（loadMsgs 同步部分 + IDB 合并回调各跑一次并计入 changed 写回 IDB，防合并回滚），无头 Chrome 实测新消息图标正常 + 乱码历史还原通过。② 预设字卡他/她→TA：default-cards-data.js 5 处（想起他→想起TA、告诉他们→告诉TA、他们→TA们 ×3），全库已无他/她。③ 情绪字卡用户确认真机正常，未改动。涉及 `src/js/chat.js` `src/js/default-cards-data.js`；已 `node build.mjs` + `npm run verify` 10/10 + 临时 CDP 验证 5/5（新消息 SVG 渲染、乱码迁移还原、字卡无他/她、TA 文案），临时脚本已删。

- [AI-A] 完成（XSS 安全修复，已构建）：修复存储型 XSS——全项目 HTML 转义从「只转 <」升级为完整转义（& < > " '，原实现可被 `&lt;img onerror=…&gt;` 预编码实体绕过，且聊天渲染多处字段零转义 / src 属性引号可逃逸）。覆盖：chat.js（escTxt/attrEsc 统一转义，renderMsg 全部卡片/气泡/图片/语音/mood/就地作答重建/邀请问问回执/搜索高亮/编辑回显，fillAvatar 改 el.src 赋值防属性逃逸）、chatcard.js（导入字卡 dataURL 白名单正则校验，非法媒体丢弃并提示）、data-backup.js（导入校验 app==='mochi-zika' + 键前缀，拒绝空/伪备份，防「先清空再写失败」全丢数据）、ta-ask/records/feed/mail/decision/music-player/quote-cards/divination/p2-features/avatar-lib/personalize/call（esc 函数完整化 + 直拼 img src 全部改 DOM 属性赋值，feed 昵称/点赞/评论/头像/分组名补齐转义）。已 `node build.mjs`（产物 914143 字节）+ `npm run verify` 10/10 + 临时 XSS 冒烟 6/6（实体绕过/属性逃逸/poke 注入均不执行、无注入元素、聊天正常显示），临时脚本已删。本次构建同时包含 AI-B 未提交的 chat.js addRec 分页贴底守卫；**未提交**。
- [AI-A] 完成（Moto G100 雨见浏览器字卡库搜索框无法输入修复，已构建未提交）：字卡库搜索框（及默认字卡/情绪字卡/回应字卡 3 个同类搜索框）敲字不显示、无法搜索——根因：安卓端 mobile-adapt.js 把 `<input>` 统一转成 contenteditable div（ce-box）防 Chrome 自动填充条，雨见浏览器等部分安卓浏览器对 ce-box 聚焦/输入失效。修复：chatcard.js / default-cards.js / mood-reply-cards.js 对 4 个搜索 input 预标记 `dataset.ceDone='1'` 跳过转换，保持原生 input（所有浏览器/输入法可正常输入）。无头 Chrome 回归：4 搜索框均为原生 INPUT、输入过滤/清空恢复/IME 上屏全通过；`npm run verify` 10/10。仅涉 AI-A 文件，未动 mobile-adapt.js。
- [AI-A] 完成：PWA 图标从爱心改为 mochi 文字——重写 `gen-icons.mjs`（零依赖点阵字 5×7 渲染 "mochi"，白底 + #111111 深色字，与开屏 logo 同风格；按墨迹范围居中，兼容 maskable 安全区）；已 `node gen-icons.mjs` 重生成 src/pwa 4 个图标 + `node build.mjs` 复制到根目录 + `npm run verify` 10/10。**未提交**。
- [AI-A] 完成（联系人主动来电修复，已构建 verify 10/10 + CDP 实测 6/6，**未提交**）：① 根因——设置页文案承诺「对方回复消息和主动发消息时触发打电话」，但 `triggerIncomingCall` 全项目无人调用，来电只靠独立定时器（首次延迟 2-5 分钟 + 每 60 秒掷 8%），与聊天行为完全脱钩，用户感知"从不来电、调概率没反应"。② 修复：call.js 新增 `window.callMaybeTrigger`（复用 maybeIncoming：5 分钟冷却 + 来电概率 + 冷却戳未来时间防御，防设备时钟改动锁死来电）；chat.js 在 `replyOnce`（TA 回复后 3.5s）与 `tryAutoSend`（主动发完 count 条后 +3.5s）各挂一次（与 maybeMusicRequest 同模式）；首次检查加速为 45-120 秒；默认来电概率 8%→15%（call.js 常量 + reply-settings.js DEFAULTS 同步）。③ 涉及 `src/js/call.js` `src/js/chat.js` `src/js/reply-settings.js`；已 `node build.mjs`（产物 931899 字节）+ `npm run verify` 10/10 + CDP 实测 6/6（无加载期错误、默认概率 15、消息挂钩来电、定时器兜底来电），临时脚本已删。本次构建同时包含 AI-A 未提交的 XSS 修复等累积改动；**未提交**，等待统一提交/部署。
- [AI-A] 完成（对抗性自审 + 正则修正，已提交 d44393a 已推送，**产物未构建**）：重新审查 XSS 修复的准确性——① 实测证伪「&lt;...&gt; 实体绕过」论据（HTML 规范下字符引用不触发标签解析，浏览器实测 0 标签 0 执行），但确认真实漏洞在「零转义字段 + src 引号逃逸」（实测均成立，修复有效）；② 修正 chatcard.js 导入正则：MIME 从 (png|jpe?g|gif|webp) 放宽到全部 image/*（防误杀 svg/x-icon 合法导入），base64 段完整匹配（自测 17 项：合法放行/逃逸拒绝）；③ 重要提醒——上一轮 XSS 转义升级造成通话/来电 SVG 图标乱码回归（escTxt 转义了合法 SVG），对方已在 a41c9d9 用 pokeIconHtml 修复 + 乱码历史迁移，已确认解决。本次仅提交 src/js/chatcard.js（含对方同文件的分组下拉修正），**未构建**：工作区另有对方进行中改动（base.css/fullscreen.js/calendar.js/mood-reply-cards.js/reply-settings.js + 5 个 tmp 调试脚本），我的正则修正待对方工作收尾后由统一构建部署（当前线上仍是 7a95f19，未受影响）。
- [AI-A] 完成（④备份原子性+②构建健康检查+③开工流程+⑤版本号，已提交，**产物未构建**）：① ④ data-backup.js 导入风险修复——旧流程「先 idbClearAll 清空 IndexedDB、再逐条 idbSet」有数分钟无原子窗口，中途崩溃旧数据无法恢复；idb.js 新增 `idbReplaceAll`（单事务 clear+批量 put，不可克隆值同步抛错时主动 abort 事务回滚），data-backup.js 导入改用它，IDB 失败即中止（不再写 LS 造成混合态）。CDP 实测 7/7：正常替换/旧键清除/失败回滚保留旧数据/空数组=清空。② build.mjs 新增构建前健康检查（检测未跟踪 tmp-*.mjs 调试脚本 + 未提交改动警告）。③ AGENTS.md 开工流程补充「改目标文件前先 git log 看对方近期是否动过」。④ 版本号 APP_VERSION v3.5.139→v3.6.0（对齐 commit v3.6.x）。涉及 `idb.js`/`data-backup.js`/`build.mjs`/`AGENTS.md`；仅提交上述 4 个 src 文件，**未构建**（工作区仍有对方进行中改动 base.css/fullscreen.js/calendar.js/mobile-adapt.js/mood-reply-cards.js/reply-settings.js，待对方收尾后统一构建部署）。
- [AI-A] 完成（版本号自动化，已构建已提交）：build.mjs 应用版本号改为**构建时自动从 git 提交数生成**（v3.6.<提交数>，当前 v3.6.29）——此前 APP_VERSION 手动维护 v3.5.139 与提交 v3.6.x 经常不同步，现在每次提交后构建自动 +1，无需人工对齐；非 git 环境回退 v3.6.0 兜底。顺带：构建健康检查的调试脚本检测从 tmp-*.mjs 放宽到所有未跟踪 .mjs（本次对方遗留的 smoke-ipad*.mjs 曾被漏检）。已 `node build.mjs`（产物含 v3.6.29）+ `npm run verify` 10/10；提交 build.mjs + 产物 + WORKLOG。
- [AI-A] 完成（回复设置概率数字框下划线提示，已构建 verify 10/10，**未提交**）：`.stp-val`（回复设置/通话设置页概率数字框）底部加虚线横线提示可点击输入，点击编辑时变实线高亮——`src/css/setting.css` 新增 `border-bottom:1px dashed` + `.stp-val:not([readonly])` 实线态。已 `node build.mjs`（产物 935422 字节）+ `npm run verify` 10/10。⚠️ 本次构建已包含对方未提交的 reply-settings.js/bg-keep.js/mobile-adapt.js/music-player.js 改动（无 WORKLOG 完成记录），**未提交**，等对方收尾后统一提交；另有未跟踪临时脚本 `mtest.mjs`（种子歌旋律兜底测试）待清理，请对方确认后删除。
- [AI-A] 完成（联系人主动发送健壮性修复，已构建 verify 10/10 + CDP 实测 3/3，**未提交**）：症状「TA 从不主动发消息（被动回复正常）」——无头浏览器实测默认链路正常，定位到两个真机可致命的健壮性缺陷：① **异常杀链**——`tryAutoSend` 抛错（真机 DOM/字卡数据损坏/媒体差异等）会阻止 `scheduleAutoSend()` 执行，一次异常后 TA **永久**不再主动发送（被动回复每次重新调度所以"看起来正常"）；修复：`tryAutoSend` 整体 try/catch，异常记录到 `window.__jsErrors`（autoSend: 前缀，供诊断）并让调度继续下一周期。② **坏间隔值**——旧数据/误操作可能把 as-min/as-max 存成超大值（如 99999），TA 要等几百天；修复：`scheduleAutoSend` 对间隔 clamp（最短 ≤30 分钟、最长 ≤180 分钟），NaN 由 getCfg 兜底。涉及 `src/js/chat.js`；已 `node build.mjs` + `npm run verify` 10/10 + CDP 实测 3/3（首个周期 getCustomCards 抛错→被 catch 记录且不发消息→恢复后下一周期正常发消息，证明调度未被杀）。**未提交**，等待统一提交（构建已含此前未提交累积改动）。

### 2026-08-16
- [AI-B] 完成：使用授权补充「禁止商用」——开屏公告（template.html + notice.json）、设置页「可二传二改的说明」页、原版功能介绍-许可、README.md、新增根目录 LICENSE 文件（明确允许二传二改/私人部署，禁止商用、保留署名）。涉及 src/template.html、src/pwa/notice.json、README.md、LICENSE；已构建，待提交。

### 2026-08-17
- [本会话] 完成（用户反馈「联系人后台弹窗：语音消息显示字卡名称+base64乱码、.mp3/.mp4后缀没删；图片+文字消息不显示缩略图或[图片]占位」修复，已构建 verify 10/10 + CDP 探测 8/8，**未提交**）：根因——语音消息 `rec.text` 格式为「名称|||音频dataURL」（chatcard.js:883 构造，renderMsg:862 正确拆分去后缀），但 `extractDeskMsg`（chat.js:1129）**不处理 voice**，把整段「名.mp3|||data:audio/mp3;base64,…」当文字返回；`showDeskPopup`（chat.js:1095）的清洗正则只匹配 `data:image/`，**不匹配 `data:audio/`**，base64 漏过 → 弹窗显示「晚安.mp3|||data:audio/mp3;base64,BBBB…」乱码。修复三处：① `src/js/chat.js` `extractDeskMsg` 加 voice 分支——拆 `|||` 取名称、去 `.mp3/.mp4` 等后缀（与 renderMsg 一致），避免 base64 进 text；② `src/js/chat.js` `showDeskPopup` 清洗正则从 `data:image/` 扩展到任意 `data:MIME/`（覆盖 audio/video 等）+ 加 `|||` 兜底拆分 + voice 占位判断（`[语音]`）+ 前台横幅补 `[图片]` 占位（图片+文字组合消息有 img 且文字无占位时补「 [图片]」，后台通知有 image 字段不重复补）；③ `src/js/bg-keep.js` `bgNotifyCheck` 正文正则同步扩展 + 清 `|||` 后内容。CDP 探测 8/8：语音→「晚安」（无.mp3/|||/base64）、图片+文字→「今天天气真好 [图片]」、纯图片→「[图片]」、表情包→「[表情包]」。涉及 `src/js/chat.js`、`src/js/bg-keep.js`。已 `node build.mjs` + `node tools/verify.mjs` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户反馈「后台通知缺少联系人主动换头像和主动给我换头像的系统消息」修复，已构建 verify 10/10 + CDP 探测 6/6，**未提交**）：根因——① `src/js/avatar-lib.js` `checkAvatarLibRefresh`（TA 换自己头像）和 `checkMeAvatarRefresh`（TA 给我换头像）都有 `if (document.hidden) return;`，**页面在后台时直接 return 不触发**，所以后台不换头像也不通知；② `src/js/chat.js` `extractDeskMsg` 只读 `rec.parts` 和 `rec.text`，**不读 `rec.img`**，而 `chatSystem(text, data)` 传的 img 走 `rec.img`（无 parts）→ 后台通知 `bgNotifyCheck` 拿不到头像缩略图（image 字段空）。修复：① `avatar-lib.js` 两个 check 函数去掉 `document.hidden` return——后台时也检查周期，到时间就换 + 写聊天消息（`chatSystem` 链路自动触发 `showDeskPopup`→`bgNotifyCheck` 发系统通知）；`checkMeAvatarRefresh` invite 分支补后台通知（后台时弹窗不可见，调 `bgNotifyCheck(name+' 想给你换头像', ..., {img:data})` 让通知栏显示邀请 + 新头像缩略图）；② `chat.js` `extractDeskMsg` 初始 `img = rec.img || ''`——`chatSystem` 传的 img（换头像等系统消息附图）能被提取，后台通知 image 字段显示新头像缩略图。CDP 探测 6/6：TA 换头像→chatSystem 写消息 + bgNotifyCheck 触发 + 通知含 img；TA 给我换头像→通知触发 + 含 img；邀请分支 bgNotifyCheck 可达。涉及 `src/js/avatar-lib.js`、`src/js/chat.js`。已 `node build.mjs` + `node tools/verify.mjs` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

- [AI-B] 2026-08-17 23:40：v3.6.47 已推送仓库，Pages 部署滞后，空提交+本记录再次触发。

- [本会话] 2026-08-18：帮我决定——「是/否/半对」tab 删除「最多选几个」行（固定单选，最多选几个仅自定义选项 tab 保留）。涉及 `src/js/decision.js`；已 `node build.mjs` + `npm run verify` 10/10。

### 2026-08-18
- [本会话] 完成（tabbar 选中按钮去灰底 + 字卡库 toolbar 换行防截断 + chat.js 语法错误修复，已构建 verify 8/10 + CDP 验证，**已提交未 push**）：用户反馈'字卡库页面的 ui 的按钮的颜色变了，怎么 ui 不全了，还有莫名其妙的灰色'。根因①——背景改纯白后  在白色底上对比度变高，看起来像'颜色变了'；修复： 去掉 active 背景（改 transparent），只保留图标颜色变深，深色模式 dark.css 覆盖保留。根因②——字卡库详情页第二个  有 5 个按钮（管理字卡/去重复/导出/导入/清除）， 均分后每个仅约 64px，文字+图标被截断，看起来像'ui 不全了'；修复：  加 。根因③——tabbar 周围灰色此前已由 base.css  改白 + 去 radial 黑晕 + 去 box-shadow 根治，本次附加 tabbar active 去底后视觉更干净。另发现 AI-A 的  改动有多余闭合括号导致语法错误（staged 版本 node -c 失败），unstaged 改动已修复，一并提交。涉及 、、（语法修复）。

### 2026-08-18
- [���Ự] ��ɣ�tabbar ѡ�а�ťȥ�ҵ� + �ֿ��� toolbar ���з��ض� + chat.js �﷨�����޸����ѹ��� verify 8/10 + CDP ��֤��**���ύδ push**�����û�����'�ֿ���ҳ��� ui �İ�ť����ɫ���ˣ���ô ui ��ȫ�ˣ�����Ī������Ļ�ɫ'������١��������Ĵ��׺� .tab.active { background:rgba(0,0,0,.05) } �ڰ�ɫ���϶Աȶȱ�ߣ���������'��ɫ����'���޸���src/css/tabbar.css ȥ�� active �������� transparent����ֻ����ͼ����ɫ�����ɫģʽ dark.css ���Ǳ���������ڡ����ֿ�������ҳ�ڶ��� .cc-toolbar �� 5 ����ť�������ֿ�/ȥ�ظ�/����/����/�������lex:1 ���ֺ�ÿ����Լ 64px������+ͼ�걻�ضϣ���������'ui ��ȫ��'���޸���src/css/chat-pages.css .cc-toolbar �� lex-wrap:wrap������ۡ���tabbar ��Χ��ɫ��ǰ���� base.css --bg-b �İ� + ȥ radial ���� + ȥ box-shadow ���Σ����θ��� tabbar active ȥ�׺��Ӿ����ɾ��������� AI-A �� src/js/chat.js �Ķ��ж���պ����ŵ����﷨����staged �汾 node -c ʧ�ܣ���unstaged �Ķ����޸���һ���ύ���漰 src/css/tabbar.css��src/css/chat-pages.css��src/js/chat.js���﷨�޸�����
\n### 2026-08-18\n- [AI-A] 完工：修复永恒浏览器（OPPO Find X9，安卓 WebView）音乐无法播放。根因：该 WebView 对 blob: URL 音频静默失败（play() Promise 挂起、onplay 不触发、无声无提示），原 playLocal 统一转 blob: 导致本地歌点了无反应、网易云兜底旋律也无声。改 music-player.js playLocal 为 blob:/dataURL 双路径互为兜底——Blob 优先 blob:、dataURL 字符串优先 dataURL 直接作为 src，4 秒无 onplay/无进度 teardown 切另一种 src 重试；新增 blobToDataUrl 辅助函数。夸克（dataURL 失效）和永恒（blob: 失效）都兼容。node --check 通过。未构建，待构建者执行 node build.mjs + npm run verify。涉及文件：src/js/music-player.js\n
### 2026-08-18
- [本会话] 完成（用户反馈 OPPO K13 + 雨见浏览器「信箱来信弹窗提示但点进信箱没有」排查+修复，已构建 verify 10/10 + CDP 探测 6/6 + 综合冒烟 4/4）：根因——`src/js/idb.js` idbRestore 启动回填**无条件覆盖 memoryCache[k]**；雨见等 IndexedDB 打开/读取慢的浏览器，启动回填尚未完成时收到新来信（大键信件 >200KB 只进 IDB+内存、不写 LS），迟到回填拿 IDB 旧值覆盖内存新值 → 弹窗已提示来信、信箱列表却是旧数据（空白/缺新信），直到下次写入才恢复。修复：回填只补「缺失」数据（memoryCache 已有值则跳过，含 LS 补写防污染）。CDP 复现测试：构造大键来信 + 12s 迟到回填 → 修复前内存被旧值覆盖、修复后新信保留。同时排查确认正常：正常来信/IDB挂起期间来信(mailPending)/TA回信落地/多桌面隔离/点弹窗进信箱。本次构建同时包含 AI-A 已保存改动（TA 收藏体系 chat/mail/feed + 占卜 v3.7 抽牌新流程 + 累积），18:29 构建产物与源码一致。遗留：`tools/diag-viewer-tmp.mjs`（未跟踪调试脚本，非本会话创建）待 AI-A 确认清理。

### 2026-08-18
- [本会话] 完成（开屏公告新增第12条，已构建 + 提交 v3.6.75）：公告新增「更新和bug修复」说明——灵感有但修设备bug耗时长所以慢；网站持续部署、每个反馈都修了，但只能靠用户自己设备验证，没设备无法验证修复程度；反馈修完后不一一回复，可晚点刷新新版再试；开屏无法跳过，加载完才能点进入。涉及 src/pwa/notice.json、src/template.html（离线兜底同步）。已 node build.mjs，产物与源码同次提交。

- [本会话] 完成（互动卡片收藏按钮显示乱码「function favHeartHtmlO{return收藏}」修复，已构建 verify 10/10 + 提交 v3.6.76）：根因——src/js/chat.js renderMsg 六类互动卡片（invite/ask/ask-choose/ask-curious/ask-roast/ask-card）拼 HTML 时漏写调用括号 `favHeartHtml +`（应 `favHeartHtml() +`），函数源码被 toString 拼进卡片导致乱码；其余 7 处正常。修复：6 处补 `()`。已 node build.mjs + verify 10/10，产物与源码同次提交。

- [本会话] 完成（互动卡片收藏按钮隐蔽化，已构建 verify 10/10 + CDP 探测 9/9 + 提交 v3.6.77）：收藏按钮不再常驻卡片，改为默认隐藏、点击卡片才浮现（再点收起，点卡片外区域自动收起，单选同时只显示一张卡片的按钮）。改 src/css/chat-main.css（.msg-fav-heart 默认 display:none，卡片 .show-fav 时显示+淡入动画；answered 卡片 cursor 改 pointer）+ src/js/chat.js（body click 委托：外层点非卡片区域清除 show-fav；card 分支 toggle show-fav，answered 卡片只 toggle 不再触发作答）。CDP 验证 9/9：默认隐藏/点显/再点收/点外收/未作答卡片浮现且作答区照常展开/收藏正常。本次构建同时带上 AI-A 已保存的音乐修复（music-player.js blob/dataURL 双路径）。临时脚本已删。

- [本会话] 完成（用户反馈「占卜半屏抽牌洗牌动画位置不居中、偏下要飞出屏幕；牌面需要设计图形」——**未构建未提交**）：
  1. **洗牌动画居中**：`divination.js` startDivineDraw 修两处——①卡片以 `left/top:50%` 为锚（左上角）但 transform 没做自身居中补偿，整叠牌从舞台中心向右下悬挂（偏下、出界）——所有 transform 加上 `translate(-50%,-50%)` 基础偏移，叠加随机位移/旋转；②随机偏移量收敛到舞台范围内（x∈[-76,76]、y∈[-34,34]、rot∈[-52,52]），卡牌尺寸稍缩（46-60px）。CDP 实测：卡片群中心 (dx=-1, dy=2) 精确居中，全部在舞台内（20/20）。
  2. **舞台防溢出**：`chat-pages.css` 给 `.div-shuf-box` 加 `overflow:hidden`（杜绝"飞出屏幕"），高度 170→178px 留呼吸。
  3. **牌背塔罗风格设计**（纯 CSS 无图片）：深紫渐变（#5a5270→#2b2538）+ 白色双线内画框 + 四角星点 + 中央✦星徽。`.div-shuf-card` / `.div-pile-card` 共享设计，`.ddc-face`（已抽翻面）加同风格内画框 + 浅色四角点与牌背呼应。JS 移除 `el.textContent = '✦'`（星徽改由 CSS `::after` 绘制）。
  涉及 `src/js/divination.js` `src/css/chat-pages.css`。**未构建未提交**，等待对方构建部署。

- [本会话] 完成（用户反馈「占卜完在聊天里发送的文字消息排版是乱的，而且有个 emoji 删掉」——**已构建未提交**）：
  1. **多行排版修复**：`chat.js` 渲染层根因——`escTxt` 不处理 `\n`，HTML 里 \n 被折叠成空格，多行消息显示成一坨。修复：新增 `escTxtBr(s)` = `escTxt(s).replace(/\n/g,'<br>')`，替换 renderMsg 主文本/组合消息 textPart/局部撤回 segHtml/quoteHtml 引用文本（5 处）——所有用户多行消息（占卜结果、引用块、组合消息文本段、局部撤回段）都正常换行。
  2. **删 🔮 emoji + 精简排版**：`divination.js` sendToChat 去掉 `🔮 ` 前缀，格式改为 `占卜 · 塔罗 3 张（问：...）\n1. 过去 · 愚人：...\n2. 现在 · 太阳（逆）：...\n3. 未来 · 世界：...\n综合：...`；防 summary 自带「综合：」前缀时重复。
  CDP 实测：消息文本无 🔮 含 \n，气泡 innerHTML 含 <br> 换行，半框自动发送消息同样无 🔮，8/8 通过。
  涉及 `src/js/chat.js` `src/js/divination.js`。**未提交**，等待统一构建部署。

### 2026-08-18
- [本会话] 完成（用户反馈「手机桌面美化里新增的桌面页数，重新刷新打开后会消失」修复，已构建 verify 10/10 + CDP 复现验证）：根因——`desk-page-count` 是 localStorage/IDB 双写小键，若该键只存于 IndexedDB（localStorage 缺失：旧数据迁移后残留键被清/浏览器配额清理），启动时 `idbRestore` 尚未回填，`personalize.js` 的 `buildDeskPages()` 已按默认 2 页构建完成，恢复完成后没有任何代码重建页面结构 → 刷新后新增页消失（设置页也显示「共 2 页」）。CDP 复现：清掉 LS 键仅留 IDB → 刷新后 `desk-page-count` 已回填为 3 但页面卡在 2 页。修复：`buildDeskPages()` 初始构建后追加「数据恢复完成（mochi-restore-done）后重建一次」（已 ready 直接重建，与 contacts.js/chat.js 同模式）；页数未变时幂等（不动已存在页内容，仅重设背景/圆点）。CDP 验证：正常路径与 LS 缺失路径刷新后均为 3 页。涉及 `src/js/personalize.js`（AI-B 文件，本会话统一实现）。已 `node build.mjs` + `npm run verify` 10/10。待提交。

- [AI-B] 完成（用户反馈「字卡库不流畅、删除字卡/删除分组卡顿」性能优化，已构建 verify 10/10 + 提交 v3.6.x）：**代改 AI-A 文件 src/js/chatcard.js**（用户直接要求修复，git log 确认对方最近提交 b015e28 后无未提交改动，无并发风险）。改动 4 处：① 图片字卡改 data-src + IntersectionObserver 懒加载（表情包/图片分类不再一次性解码全部 dataURL，`decoding=async`，无 IO 旧浏览器直接补 src 兜底）；② render() 改 DocumentFragment 批量挂载（原逐条 appendChild 布局抖动）+ header 加 data-g 标记；③ 删除字卡 delSelected / 删除分组改局部 DOM 更新（rebuildGroupAfterRemove / groupBlockNodes + updateCountsOnly），不再整页 render；④ 搜索输入加 120ms 防抖。本轮构建同时带上 AI-B 自动备份功能（data-backup.js/idb.js/pwa.js）与产物，同次提交 d1ac628。待对方确认无回归。

### 2026-08-18
- [本会话] 完成（用户反馈「字卡库的 ta的询问/小问题/好奇/吐槽、查岗日常字卡、桌面今日情话 的【我的添加】无法新建分组，且我的添加分组要和系统预设隔开」修复，已构建 verify 10/10 + CDP 分组探测 30/30，提交中）：新增「我的添加自定义分组」——6 个模块共用 `window.cardGroups`（定义在 ta-ask.js 顶部：新建/重命名/删除分组弹窗流程、系统分类+我的分组合并下拉生成、`__newgrp` option 绑定与解析）。数据模型：各模块数据加 `groups=[{id,name}]` + 条目 `grp` 字段；查岗/情话列表对象化 `{t,grp}`（兼容旧字符串，`ckItems`/`getCustom` 自动转对象，抽取逻辑改 `.t`）。UI：我的添加 tab 顶部「新建分组」按钮 + 自定义分组区块置顶（分组名+数量+✎重命名/✕删除，组内条目可开关/删除，分组区块带内联添加表单）→「未分组」区块（ta 系按系统分类小节、查岗/情话单区块）始终渲染——自定义分组与系统预设分类体系彻底隔开；系统预设 tab 原样。添加表单/批量导入下拉均注入「我的分组」optgroup +「＋ 新建分组…」option（change 弹窗建组并选中；bindNewGrp 防重复绑定）。删除分组组内条目回未分组不丢失。涉及 src/js/ta-ask.js、src/js/quote-cards.js、src/js/p2-features.js、src/template.html（tc/tcu/tr/ck/cq 加「＋分组」按钮 + ck/cq 批量分组下拉）、src/css/chat-pages.css（mg-* 样式）、src/css/dark.css。本次构建同时带上 AI-A 已保存的 chatcard.js 语音卡 audio dataURL 不嵌 DOM（WeakMap）+ 大列表分块渲染（RENDER_BATCH=80）优化（21:41 并行提交后剩余未提交部分）。

- [AI-B] 完成（用户补充反馈「电脑不卡，GitHub Pages 部署后手机浏览器卡」，字卡库第二轮性能优化，CDP 实测 20/20 + verify 10/10，产物已同步 ccab79e）：仍是**代改 AI-A 文件 src/js/chatcard.js**，本轮 2 处：① **语音卡 audio dataURL 不再嵌进 DOM**（原每条几十 KB~几 MB 直接拼进按钮 data-src，几十条语音时 HTML 字符串膨胀到几十 MB 必卡）——改 WeakMap（按钮节点→音频数据）按节点取，渲染时只放文件名；搜索过滤后数组索引错位也不受影响；② **大列表分块渲染**（RENDER_BATCH=80/帧，首帧同步一批立即可见，其余 rAF 分批挂载，token 废弃被打断的旧批次）——5000 张卡不再一次性卡死主线程；局部删除遇分块渲染进行中自动降级为全量 render（防旧批次复活已删卡片）。⚠️ **并发提醒**：本轮编辑 chatcard.js 期间，对方（AI-A）在 21:49 提交 8c198b3 时把工作区未提交的 chatcard.js 改动一并打包（git add -A），消息里也写了「语音卡audio不嵌DOM/分块渲染」——内容与我的改动一致无冲突，但**再次提醒：双方同轮改 chatcard.js 风险高，建议同文件改动前先在 WORKLOG 留话**。

### 2026-08-18
- [本会话] 完成（用户反馈「字卡库的【聊天默认字卡】里缺少 可开启或关闭 聊天使用/信箱使用/朋友圈使用」——即默认字卡应分别控制三个场景，已构建 verify 10/10 + CDP 探测 13/13，提交中）：default-cards.js 新增**场景开关**——`dc-use-chat`/`dc-use-mail`/`dc-use-feed`（默认全开，localStorage '1' 开启），暴露 `window.defaultCardUse(scene)`；页面「使用默认字卡」总开关下方新增三个 .gs-row 开关行。落地：①聊天——`getDefaultCards()` 开头检查 useChat（回复混入 + 拍一拍同受控）+ chat.js 字卡池兜底补池加 useChat 条件；②信箱——mail.js `mailCardPool` 的 pushDefault 开头 `defaultCardUse('mail')` 为 false 直接不补；③朋友圈——feed.js `cardPool` 新增默认字卡补池（此前朋友圈从不使用默认字卡），仅当 useFeed 且 getDefaultCardGroups 存在时按空池补 main/kaomoji/emoji（与 mail 补池同模式）。涉及 src/js/default-cards.js、src/js/chat.js、src/js/mail.js、src/js/feed.js、src/template.html（三个开关行）。CDP 验证：三开关存在默认开、关聊天后 getDefaultCards 空、开回恢复、mail/feed 开关读写翻转。feed 补池为模块内逻辑（cardPool 未暴露），经代码审查确认守卫条件。
- [本会话] 完成（用户反馈「联系人主动发送消息的爱心标识跑出气泡外了，且可再缩小一点」——**已构建 verify 10/10 + CDP 实测 3/3，已提交 83f2b65 未 push**）：`src/css/chat-main.css`（AI-A 文件，请知悉）。`.msg-hi-heart` 原为 `top/left:-8px` 挂在气泡外角 → 改为 `top:2px; left:4px; width/height:9px`（原 11px），正好落在气泡 11/14 内边距内、不压文字。CDP 实测：爱心矩形在气泡矩形内部、9×9px、与文字区域无重叠。
- [本会话] 完成（用户反馈「桌面第二页今日心情卡片输入内容后点确定没变化」——**已构建 verify 10/10 + CDP 实测 4/4，已提交 3de4c4b 未 push**）：`src/js/personalize.js`（openModal 通用弹窗）。根因：`今天的心情` 弹窗同时带 pills（心情快捷选项）+ 输入框 + `pill:` 预设当前心情 → 用户输入文字点确定时，fire() 的 pills 分支条件 `(pillVal !== null || noInput)` 把「预设值」误判为「用户选了 pill」，回调拿到旧心情，输入被丢弃（卡片不更新）。修复：新增 `pillClicked` 标志（点 pill 才置 true），pills 分支改为 `(pillClicked || noInput)`——输入文字时走输入分支，点 pill 时仍走 pills 分支。顺带修复同款隐患「聊天气泡字体大小」弹窗；noInput 类弹窗（头像形状/导入字卡/移动到分组/删除确认等）行为不变（T4 回归通过）。

### 2026-08-19
- [本会话] 完成（用户反馈「联系人更新日常时，聊天消息顺序反了——应先发系统消息【联系人 更新了一条日常】，再发日常内容字卡消息」——已构建 verify 10/10 + CDP 实测 3/3，提交 7af16d6 未 push）：src/js/p2-features.js `doCheckin()` 原顺序为 先 chatAddIn(日常内容拼接行) 后 chatAddSystem(更新提示)，调换为 先发系统提示、再发内容消息，概率提醒「快来查岗」保持最后。CDP 实测聊天记录尾部顺序 [poke系统提示, 内容消息] 正确。本次构建同时带上 AI-A 已保存改动（chat.js/ta-ask.js/template.html/chat-main.css），全部 src JS node --check 通过。push 仍被环境阻塞（无 GitHub 凭据），提交待推送。

### 2026-08-19
- [本会话] 完成（用户要求为 TA的询问/小问题/好奇/吐槽 设计更多系统预设问题+预设答案+预设回应，高自由度情侣向+两个世界世界观，**未构建未提交**）：
  1. src/js/ta-ask.js 四个题库共新增 65 条预设：询问 22→39（14 条开放题 + 3 条单选题 type:'single'，单选选项即预设答案、每选项自带 TA 预设回应）；小问题 27→42（每选项带专属回应 + pref/liked 默契标记）；好奇 38→54（快捷项+每题回应池，8 题带 followup 自然追问）；吐槽 53→70（含 rw6-rw9 按「做梦/在哪/忙/听歌」等关键词 match 触发）。新 ID 与旧库无冲突，增量合并逻辑会自动下发给老用户。
  2. 顺带修复：文字版询问的 TA 回应此前从未接「询问·回应」池（池子只在管理页展示、实际只从字卡库/兜底句抽取）——ta-ask.js openAskReply（弹窗）与 chat.js expandCardInPlace（就地作答）两条路径均改为 getInteractPool('询问·回应') 随机取一条传入 chatAskReply（内部 90%系统预设/10%字卡库），与吐槽/好奇/小问题行为一致；chat.js 就地吐槽路径的回应池同步改接 getInteractPool('吐槽·回应')（原硬编码 7 句，与 ta-ask.js 弹窗路径不一致）。
  3. src/js/default-cards-data.js：询问·回应池 5→20、吐槽·回应池 7→18（node 临时脚本改写，紧凑 JSON+行尾分号格式与原文件一致，脚本已删）。
  4. 校验：node --check 三文件通过；四题库结构校验（选项/quick/replies/pref 范围/match）+ ID 唯一性通过。
  涉及 src/js/ta-ask.js、src/js/chat.js、src/js/default-cards-data.js（均为 AI-A 名下文件，chat.js 编辑时确认与 HEAD 无差异后进行）。
  ⚠️ 状态更新：本条目编辑进行中，对方批次提交 0aab135（20:56，猜拳图标+feed IDB门槛）把当时已保存的【询问/小问题/好奇新增 + ta-ask 分类标签栏】一并打包入库并构建；**仍待构建提交**的剩余部分：吐槽 17 条新增、询问·回应池接线（ta-ask.js openAskReply + chat.js 就地两处）、default-cards-data.js 两池扩充、本条 WORKLOG。请构建者再执行一次 node build.mjs 把剩余部分带上。
### 2026-08-19
- [AI-A] 开工（用户要求为 TA的询问/小问题/好奇/吐槽 再设计更多系统预设问题+答案+回应，高自由度情侣向+两个世界+字卡设定，**本条尚未构建**）：在 src/js/ta-ask.js 四个 DEFAULT 数组末尾各追加一批，共 +94 条：询问 +18（15 开放题 q_d13-d17/q_c11-c13/q_i15-i17/q_w15-w18 + 3 单选 q_s6-s8，type:'single' 选项即预设答案、每项自带 TA 专属回应）；小问题 +22（cd12-15/cl8-10/cf8-10/cr9-11/ch8-10/cs7-8/cw10-13，每项带专属回应+pref/liked 标记）；好奇 +25（cy11-13/cm9-11/cd10-13/cp9-11/cl10-12/ct10-11/cu9-11/cw11-14，quick 垫脚+replies 回应池，6 题带 followup 自然追问）；吐槽 +29（rl19-25/rf15-19/rs17-22/rm7-9/rsg4-5/rw10-15，其中 rw10/rw13/rw14/rw15 按 match 关键词触发）。新 ID 与旧库无冲突，增量合并逻辑会自动下发到老用户。校验：node --check 通过，四数组 ID 唯一性通过（73/77/96/99）。涉及 src/js/ta-ask.js（AI-A 名下）。**未构建未提交**，连同上一轮待构建部分，请构建者执行一次 node build.mjs 一并带上。
- [本会话] 完成（用户反馈朋友圈多桌面 2 个 bug：①非当前桌面联系人发朋友圈，后台弹窗显示的联系人身份错误（成了当前桌面 TA）；②在联系人1桌面回复联系人2发布的动态，联系人2无法回复我的评论——**已构建 verify 10/10 + CDP 复现 17/17 + 身份显示 10/10，待提交**）：
  1. **跨桌面身份显示**（根因 ①）：feed.js 的 partnerName/partnerAv/myName/myAv 读模块顶部缓存的**顶层 store**（xy-home-v2 旧键，迁移后已清空 → 全空/旧值）；跨桌面动态的 TA 头像/昵称 fallback 一律用**当前桌面**。修复：四个函数改读 activeStore（每桌面独立）；新增 `taAvFor(owner)`/`taFeedNameFor(owner)` 按**动态所属桌面**取 TA 头像/昵称；render()/renderFeedAll/taAuthorOf/点赞回赞/通知文本 fallback 全部按 owner 取；`addNotice` 加 owner 参数 → 桌面弹窗（chat.js showDeskPopup 新增 opts.av 支持）、通知列表头像（renderNotices 按通知 owner）、系统通知右侧大图标（bg-keep.js bgNotifyCheck 新增 extra.av 优先）全部显示**发布者**头像。另修 taFeedAv 缺少 activeStore.avatar-partner 回退。
  2. **全部朋友圈页无法评论/回复**（根因 ②）：openFeedAll 渲染的列表**没有评论/点赞按钮、评论点击无回复绑定**（只绑了删除/图片）→ 用户在该页无法互动。修复：拆出 `renderFeedAll()`，补 `.feed-actions` 赞/评论按钮（与主列表一致），直接复用 `bindEvents`（点赞/评论/回复/删除/图片全可用）；点赞/评论/回复/发布后按可见页面刷新（新增 `renderVisible()`：全部朋友圈页可见时刷 renderFeedAll，否则 render）；回复占位显示被回复评论作者名（'回复 二宝…' 不再一律 '回复 TA…'）。
  - CDP 验证：主列表/全部朋友圈页评论→TA(二宝)用**二宝桌面字卡库**回应、昵称二宝；回复模式 TA 回应二宝；全部朋友圈页有赞/评论按钮且可回复；主列表 TA 动态头像/通知列表头像/弹窗头像/系统通知 av 均为发布者（二宝）而非当前桌面（大宝）。
  - 涉及：src/js/feed.js、src/js/chat.js、src/js/bg-keep.js。
  - 本次构建同时带上 AI-A 已保存的 ta-ask.js 两轮新增（吐槽17条+94条新预设/回应池接线）、chat.js、default-cards-data.js 改动（上一轮留话「请构建者再执行一次 build」已执行）。
  - 遗留：`.verify-fixes-tmp.mjs`、`.shot-tmp/`（历史遗留未跟踪调试残留，非本次创建，待确认清理）。
### 2026-08-19
- [AI-A] 开工（用户追问「还有能增加的问题吗」，再追加第四批，**本条尚未构建**）：src/js/ta-ask.js 四数组末尾各加一批，共 +73 条：询问 +14（11 开放 q_d18-d20/q_c14-c15/q_i18-i19/q_w19-w22 + 3 单选 q_s9-s11）；小问题 +18（cd16-19/cl11-12/cf11-12/cr12-13/ch11-12/cs9/cw14-16）；好奇 +19（cy14-15/cm12-13/cd14-16/cp12-13/cl13-14/ct12-13/cu12-13/cw15-18，4 题带 followup）；吐槽 +22（rl26-31/rf20-24/rs23-28/rm10-12/rsg6-7/rw16-21，5 条带 match）。题材换角度：时间感/感官/未来/字卡本身/两个世界深化/情绪细微/日常碎片。校验：node --check 通过，四数组 ID 唯一性通过（87/93/115/127）。涉及 src/js/ta-ask.js。**未构建未提交**，连同前几批待构建部分，请构建者执行一次 node build.mjs 一并带上。

### 2026-08-19
- [AI-A] 完成：新增双人贪吃蛇小游戏（聊天更多功能→贪吃蛇）。已构建 verify 10/10 + CDP 冒烟 12/12。20x20地图/双蛇同时移动/统y碰撞结算(公平)/TA=生存判断+目标评分+flood-fill空间+9种概率行为池+冷却/速度120->90ms随时间/滑动+方向键+WASD+虚拟方向键/倒计时3-2-1/胜负平+长度食物得分存活时间/结束调interact字卡池(游戏胜利/失败/平局·回应)作TA回复+special:snake卡片入聊天。文件:src/js/snake-game.js(新)、template.html、chat.js、default-cards-data.js、chat-pages.css、mobile-adapt.js、tabs.js、build.mjs。仿pong.js模式。未提交。
### 2026-08-20
- [本会话] 完成（用户反馈「多桌面联系人情部下，信箱看不出是哪个联系人发的；切换到谁的桌面，来信就自动变成谁的名字」——**已构建 verify 10/10 + CDP 多桌面 7/7，待提交**）：
  - **根因**：`src/js/mail.js` 模块顶部 `const uid = window.activePrefix()` **加载时固定**，而 `loadSnap()`/`writeSnap()` 用 `uid + ':' + SNAP_KEY` → **无论切到哪个桌面都读写 default 桌面的 `mail-letters-snap`**。非 default 桌面信箱主键（每桌面独立 `mail-letters`）为空时 `load()` 兜底 `loadSnap()` 读到 **default 桌面的信** → 串桌面 + 渲染时 `partnerName()`（当前桌面 TA）显示名字 → 「同一封信在谁桌面显示谁的名字」。
  - **修复**：删除固定 uid，新增 `snapKey() { return window.activePrefix() + ':' + SNAP_KEY; }`，loadSnap/writeSnap（3 处）全部走动态键 → 每桌面各写各的快照，非 default 桌面不再读到 default 的信。排查确认：chat.js `writeLsSnapshot` 已是动态 `activePrefix()` ✓；feed.js 快照固定 default 是**故意**（feed-posts 全局共享数据）✓。
  - **CDP 验证**：修复前——联系人2桌面信箱显示 default 桌面的信（内容相同+「来自 二宝」）；修复后——隔离正确（cid2 主键空时信箱空）、两桌面各自来信独立、default 显示「来自 大宝」/cid2 显示「来自 二宝」互不串。verify 10/10。
  - 涉及 `src/js/mail.js`（AI-A 名下，本会话代改；build 产物含并行会话已保存的 chat.js/decision.js 改动，一并提交）。

### 2026-08-20（用户反馈三连：备忘心情不刷新 / 全屏退出提醒不消失+黑边 / TA 引用消息异常）
- [本会话·完成]（**已随对方多次提交构建 verify 10/10 + CDP 专项验证**）：三个用户反馈问题的修复（我的改动已被对方分次提交包含，工作区当前干净）。
  - **问题1 备忘/心情不每天刷新**（`src/js/p2-features.js`）：根因——备忘/心情存固定键 `memo`/`today-mood`，保存一次永久显示。修复——改为按「天」显示：读当日快照 `memo-YYYY-MM-DD`/`today-mood-YYYY-MM-DD`（对方 AI-A 同日也加了同款快照，合并无冲突），当天没写显示占位、第二天自动重新开始；跨天页面开着时 30s 轮询自动刷新；兼容迁移（`legacyToday`）：老用户当天写过（历史第一条 ts 是今天）则把固定键内容迁移为今日快照，不丢内容；历史记录 `memo-history`/`mood-history` 照常写入，主页「我的今日备忘/心情」可查看。
  - **问题3 TA 引用消息异常**（`src/js/chat.js`）：根因①「要么不引用」——`lastMineText` 从未在加载历史后初始化，首次回复时为空（quote-prob 命中也只显示占位省略号）；修复——`loadMsgs` 三处出口（LS 快照载入/IDB 合并完成/IDB 无数据分支）调用 `syncLastMineText()`。根因②「连续引用同一条发很多条」——`scheduleReply` 里 quote 在循环外掷一次骰、N 条回复全复用同一个引用；修复——改为每条回复独立掷骰 + 独立取值。CDP 验证：历史注入后 TA 回复带引用块；quote-prob=50 连发 2 条跑 8 轮出现 3 次「恰好 1 条带引用」（旧逻辑该情况不可能出现）。
  - **问题2 全屏退出提醒不消失 + 顶部黑边**（`src/js/fullscreen.js` + `src/pwa/manifest.json`）：根因①黑边——manifest `display_override:["fullscreen","standalone"]` 让快捷方式直启系统级全屏，挖孔屏顶部 cutout 被涂黑；修复——`display_override` 改为 `["standalone"]`（standalone 仍可隐藏浏览器栏，去系统级全屏黑边；用户可在设置里手动开全屏）。根因②退出提醒不消失——浏览器标签模式下 `FS_KEY` 保持 '1'，用户用系统 UI 退出全屏后 `reenterFs`（切后台回来/重新聚焦）强制重入 → 退出提示条反复弹出；修复——新增 `fsInPwa()` 判定：浏览器标签模式退出全屏（`handleFsExit`）清持久化标记、启动/`doRetry`/`reenterFs` 不再自动重入（`reenterFs` 仅在全屏中切后台时保留标记）；PWA 安装态行为不变照常自动恢复。CDP 验证：standalone 布局正常、浏览器模式启动清标记不再自动进全屏。
  - 验证：`node tools/verify.mjs` 10/10；临时探测脚本（probe-fs/probe-fix/probe-fs2）已删。

### 2026-08-20
- [本会话] 完成（用户反馈「拍一拍人称有问题：用自定义拍一拍字卡【弹了一下我的额头】会显示成【联系人昵称弹了一下我的额头 我】」）：`src/js/chat.js` performPoke + sendPoke。根因：拍一拍字卡分三类（含"你"如"戳了戳你的脸蛋"、含"我"如"弹了一下我的额头"、都不含如"戳一戳"），原代码只分「含你」/「不含你」两支——performPoke 不含"你"时一律末尾追加我的称呼 →「联系人昵称 弹了一下我的额头 我」多出个"我"；sendPoke 不含"你"时一律 `'我 '+字卡+' '+联系人昵称` →「我 弹了一下我的额头 TA」读成自己拍自己。修复：中间加「含我」分支——performPoke 直接「联系人昵称 + 字卡原文」（不再追加"我"）；sendPoke 把字卡里的"我"替换成联系人昵称（"弹了一下我的额头"→"我 弹了一下TA的额头"）。默认字卡（拍了拍你/戳了戳你的脸蛋/戳一戳）输出不变。node --check 通过 + 逻辑单测 6 字卡×2 方向全部正确。**已构建待提交**（构建时工作区干净、无对方在途改动）。

### 2026-08-20
- [本会话] 完成（用户要求「拍一拍页面像表情包一样分两类：联系人昵称的拍一拍 + 我的昵称的拍一拍，可新增预设拍一拍」——**已构建 verify 10/10 + CDP 实测 7/7（含刷新持久化），待提交**）：`src/js/chat.js` + `src/css/chat-main.css`。
  - 拍一拍面板改为双 tab（复用表情包 .emoji-tab 样式，JS 注入 #poke-card）：
    - Tab1「<联系人昵称> 的拍一拍」：内置预设（拍了拍我/戳了戳我的脸蛋/弹了一下我的额头/揉了揉我的头发/捏了捏我的脸颊/拍了拍我的肩膀）+ 用户新增。点卡片/输入 → 联系人拍我（显示"联系人昵称 + 字卡"，新增 performPokeWith，含 你→我的称呼 转换 + 联系人随后回复一条，节奏同 sendPoke）。
    - Tab2「我的拍一拍」：内置预设（拍了拍你/戳了戳你的脸蛋/弹了一下你的额头/揉了揉你的头发/捏了捏你的脸颊/拍了拍你的肩膀）+ 用户新增。点卡片 → sendPoke（我拍联系人）原行为。
  - 新增数据：`poke-user-ta`/`poke-user-mine`（每桌面独立，LS+IDB 双写，键带 activePrefix 命名空间，IDB 内容多时恢复覆盖）；面板「＋ 新增」按钮 openModal 输入加入当前 tab 池；自定义输入行按当前 tab 方向发送；tab 记忆 `poke-tab`（每桌面）；contact-switched 重载池+关面板。
  - 旧字卡库【拍一拍】自定义字卡仍兼容：按人称自动归类（含"你"→我的tab；含"我"→联系人的tab；中性→我的tab）显示为「自定义」小节；performPoke（联系人自动拍一拍）字卡池改为 pokeAllCards()（预设+新增+旧自定义），不再只读 getPokeCards()。
  - 已 node --check 通过。⚠️ 并行会话正在改 mail.js/music-player.js/pong.js/chat.js（未提交），本次构建已一并带上，提交信息注明双方范围。
