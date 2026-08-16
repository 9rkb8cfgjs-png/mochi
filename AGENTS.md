# AGENTS.md — Mochi 字卡传讯（多人/AI 协作约定）

## 项目是什么

情侣模拟聊天 PWA（单页应用）。所有 CSS/JS 由 `build.mjs` 合并进**一个** `index.html`（GitHub Pages 直接部署仓库根目录）。

**部署 = 改 `src/` 下的源文件 → 执行 `node build.mjs` → git 提交/推送。**

## ⚠️ 最重要的规则：构建只允许一个人执行

`index.html` 是构建产物（**不要手改 index.html**），谁最后 build 谁决定线上内容。

- **只允许指定的一方可执行 `node build.mjs`**（建议：每次开工前先约定本次的构建者；默认 AI-B 负责构建/部署）。
- 另一方只改 `src/` 源文件，**改完保存即可，不要自己 build**；由构建者统一执行一次构建，双方改动都会包含在内（前提：构建时对方文件已保存完）。
- 构建者执行前先跑 `git status`，确认对方没有未完成到一半的改动。
- 严禁两个进程同时执行 `node build.mjs`。

## 文件分工（默认归属，互不越界）

### AI-A：业务功能（聊天 / 字卡 / 日历 / 信箱 / 朋友圈 / 音乐 / 占卜等）
- JS：`src/js/chat.js` `chatcard.js` `chat-settings.js` `reply-settings.js` `default-cards-data.js` `default-cards.js` `mood-followup-data.js` `mood-reply-cards.js` `quote-cards.js` `ta-ask.js` `calendar.js` `divination.js` `mail.js` `feed.js` `music-player.js` `decision.js` `records.js` `p2-features.js` `avatar-lib.js`
- CSS：`src/css/home.css` `chat-main.css` `chat-pages.css` `setting.css` `tabbar.css`

### AI-B：系统 / 移动端 / 全屏 / PWA / 全局样式
- JS：`src/js/fullscreen.js` `mobile-adapt.js` `pwa.js` `bg-keep.js` `call.js` `sfx.js` `idb.js` `clock.js` `tabs.js` `desktop-slider.js` `personalize.js` `data-backup.js`
- CSS：`src/css/base.css`（全局 + 手机端适配 + 全屏安全区，**含共享样式，默认归 AI-B**）
- 其他：`src/template.html` `manifest.json` `sw.js` `build.mjs` `version.json` `package.json` `tools/`

### 跨领域时
- AI-A 需要动 `base.css` / `template.html` / `fullscreen.js` 相关逻辑时：**先告诉 AI-B 完成后再改**，禁止直接改对方文件。
- AI-B 需要动 AI-A 的功能文件时同理。
- 分不清归属的文件：谁先开工谁负责，改完同步给另一方。

## 快速定位（按功能找文件）

| 功能 | 主要文件 |
|---|---|
| 开屏 / 版本检测 / 安装提示 | `clock.js` `pwa.js` `template.html`（splash 区） |
| 手机桌面（主页/第二页） | `home.css` `desktop-slider.js` `p2-features.js` `personalize.js` |
| 聊天（消息/输入栏/表情/拍一拍） | `chat.js` `chat-main.css` `chat-settings.js` `mood-reply-cards.js` |
| 字卡库 / 字卡管理 | `chatcard.js` `default-cards-data.js` `default-cards.js` `quote-cards.js` `reply-settings.js` |
| 日历 / 每日留言 | `calendar.js` |
| 占卜 | `divination.js` |
| 信箱 | `mail.js` |
| 朋友圈 | `feed.js` |
| 音乐 | `music-player.js` |
| 纪念 / 收藏 / 统计 / 查岗 | `records.js` `p2-features.js` |
| 通话 / 音效 | `call.js` `sfx.js` |
| 全屏 / 移动端适配 / PWA | `fullscreen.js` `mobile-adapt.js` `base.css` `manifest.json` `sw.js` |
| 数据层（本地存储/备份） | `idb.js` `data-backup.js` |
| 设置 / 外观 | `setting.css` `personalize.js` `chat-settings.js` `reply-settings.js` |

## 构建顺序（改样式/脚本前必读）

- CSS 合并顺序：`base.css → home.css → chat-main.css → chat-pages.css → setting.css → tabbar.css`（**后加载覆盖先加载**；同优先级时谁后加载谁生效，跨文件覆盖规则要看这个顺序）。
- JS 合并顺序：见 `build.mjs` 的 `jsFiles` 数组（`idb.js` 最先、`mobile-adapt.js` 最后）。**新增 JS 文件必须加进该数组**才会被打包；依赖前置（如 `window.showDeskPopup` 由 chat.js 定义，mail/feed 后才能用）。
- 新增 CSS 文件同理要加进 `cssFiles`。

## 数据与存储约定

- 所有本地数据存 localStorage，键前缀 `xy-home-v2:`；结构化/大数据同时写 IndexedDB（`idb.js`，键同前缀，启动时 `idbRestore` 回填到 localStorage）。
- 读写接口：`window.idbSet(key, val)` / `window.idbGet(key)`（Promise）。
- 纯本地、无后端；备份导入导出在 `data-backup.js`（导入会触发 `idbRestore` + `mochi-restore-done` 事件，开屏数据就绪依赖它）。

## 通用模式（避免重复踩坑）

- 弹窗/确认/输入一律用 `window.openModal(title, value, cb, opts)`（定义在 `personalize.js`，全站唯一弹窗方案）；**不要用 alert/confirm/prompt**（IAB/部分浏览器不支持）。
- 安卓上文本输入框会被 `mobile-adapt.js` 自动转成 contenteditable div（`.ce-box`），原 `input` 变 1px 幽灵锚点：**读写值/聚焦仍走 `input.value` / `input.focus()`**（已做代理兼容），不要假设 DOM 里的 `input` 可交互；iOS 不做转换，保留原生输入框。
- 页面内容大部分由 JS 渲染，`template.html` 只放静态锚点（`id`）；**新增区块要 template 锚点 + JS 渲染两边同步**。
- iOS 无 Fullscreen API（全屏走 `.ios-fs-active` 类隐藏模拟状态栏）；安卓真全屏下 `env(safe-area-inset-top)` 可能返回 0，需要 `max(..., 12px)` 兜底。
- 所有弹层打开时由 `mobile-adapt.js` 自动锁背景滚动（`body.scroll-lock`），新增加载层要加入其 `FLOAT_SELECTORS` 列表。

## 并行工作协议

1. **开工前**：读 `WORKLOG.md` + `git status` + 查看相关文件 `LastWriteTime`，确认对方没有未保存/未提交的进行中改动。**重点**：开工改某个文件前，先 `git log --oneline -5 -- <目标文件>` 看对方最近是否动过它——同文件并发修改容易冲突（chatcard.js 曾双方同轮改动），双方都要改同一文件时先在 WORKLOG 留话约定顺序。
2. **编辑中**：只碰自己名下的文件；不要动对方文件，即使"只改一行"。
3. **改完**：只保存，不构建、不提交；通知构建者执行 `node build.mjs`。
4. **构建**：仅构建者执行；构建后 `git status` 检查产物，再提交推送（一次提交可同时包含双方已保存的改动，commit message 写清楚涉及范围）。
5. **不要并行 commit/push**，避免 git 冲突和半成品入库。
6. 遇到对方文件的 bug：不要直接改，在回复里说明"需要对方处理：xxx"。

## 交接日志（WORKLOG.md）

- 两个 AI 无法直接对话，靠 `WORKLOG.md` 互相留话：开工/完工各追加一行（AI、时间、任务、涉及文件、是否已构建）。
- 开工前必读：对方标了"进行中"的文件不要碰；对方留了"需要处理：xxx"的先处理或回复。
- 记录里说的任务完成后再清理旧行，保留最近几条即可。

## git 提交规范

- commit message 沿用现有格式：`v3.x.x: 改动摘要`（摘要写清本次涉及范围）。
- 构建产物（`index.html` / `sw.js` / `version.json`）必须与 src 改动**同一次提交**，保持线上与源码一致。
- 提交前 `git diff` 自查改动范围，确认没有夹带对方的文件或未完成的一半改动。

## 技术红线（双方都遵守）

- **禁止整页 `zoom` / `transform: scale` 缩放**（曾导致 iOS Safari 严重卡顿 + UI 不适配）。需要调整尺寸时只改具体字号/间距。
- `fullscreen.js` 与 `base.css` 的全屏安全区规则（`.fs-active` / `.ios-fs-active` / `@media (display-mode: fullscreen)`）互相耦合，改动前先看对方状态。
- 手机端状态栏（`.statusbar`）显示/隐藏会影响所有页面顶部间距，改动要全局验证（首页有、全屏页无是原设计）。
- 验证方式：`npm run build` 后用 `npm run verify`（无头 Chrome 按 390×844 / 360×640 检查布局：无缩放、状态栏显示、页面占满、聊天页贴底）；无头环境无法验证 iOS 真机性能，涉及 iOS 的改动需要真机测试。
