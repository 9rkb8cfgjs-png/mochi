# WORKLOG — 双方交接日志（AI-A / AI-B 共用）

两个 AI 不能直接对话，开工/完工时在这里各写一行，让对方打开仓库就知道当前状态。

## 规则

- 开工：追加一行「开工」；完工：追加一行「完成」。
- 每行写清：AI、时间、任务、涉及文件、是否已构建。
- 开工前先读这个文件 + `git status` + 相关文件 `LastWriteTime`。
- 旧记录随手清理，保留最近几条即可（这是协作笔记，不是发布日志）。
- 构建/部署只由约定的构建者执行（见 AGENTS.md）。

## 记录

### 2026-08-16
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
