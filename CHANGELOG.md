# 更新日志

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本号用 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.1] - 2026-09-29

### 修复

- **macOS：片头播放期间窗口拖不动**。官方基础样式表把每个 body 直接子元素都算成
  `-webkit-app-region: no-drag`，铺满视口的遮罩会把整扇窗口从 macOS 可拖拽区域里减掉，
  双击缩放也失效。现在宿主元素带 `data-dsh-boot-splash`（`dsh-web-all` 全家桶豁免的标记之一），
  并自带一条 `-webkit-app-region: initial !important` 覆盖没装全家桶的纯 DSH。
  点击 / `Esc` 跳过不受影响。

### 文档

- README 重排为「是什么 / 装 / 怎么用 / 配色 / 兼容与限制 / 文档索引」，工程细节拆进 `docs/`：
  `ARCHITECTURE.md`、`ENHANCEMENTS.md`、`DESKTOP-CHROME.md`、`VERIFICATION.md`。
- 新增 `docs/PLAN-macos-and-update-check.md`：macOS 适配待办与设置里「检查更新」的方案评估。
- 新增 README 顶部实时徽章（Stars / Downloads / 最近提交 / 许可 / topic / 访客）。

## [0.1.0] - 2026-09-28

### 新增

- 550C 开机片头：简易档约 4 秒、完整档约 16 秒，点击画面或 `Esc` 跳过，播完渐出。
- 首帧由宿主半边经 `webserver/index-inject` 在文档解析阶段注入 —— DSH 自己的
  `HARNESS / Loading plugins…` 卡片不会露脸；卡片消失或进入失败态时首帧自行退役，另有 12s 上限。
- 通用设置里的设置行：三档（关闭 / 简易 / 完整）、四套配色（琥珀 / 绿 / 青 / 白）与「预览」按钮。
- 桌面窗口右上角原生按钮的收编：`#hud-top` 按 `env(titlebar-area-width)` 让位，
  条带底色与符号色跟随当前配色（走 `dsh-desktop:windows-appearance`）。
- 内容增强层：等宽字体栈、字符单元进度条、块光标与真实时钟戳、固件注入页脚（行号 / 地址 / CRC32）、
  集群节点信号条。

[0.1.1]: https://github.com/yannicksong0106/dsh-550c-boot/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/yannicksong0106/dsh-550c-boot/releases/tag/v0.1.0
