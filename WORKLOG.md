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
