# dsh-550c-boot

给 DSH 加一段 **550C 开机动画**：每次启动客户端时，全屏播放 550C 片头，播完渐出，露出真正的 DSH 界面。

**完整模式**（16 秒：logo → 基站接管 → 47 节点逐点覆写 → `SYSTEM IS REWRITTEN`）：

![完整模式](https://raw.githubusercontent.com/yannicksong0106/dsh-550c-boot/main/docs/preview-full.png)

**简易模式**（4 秒 logo 书写）与**青磷光配色**：

![简易模式](https://raw.githubusercontent.com/yannicksong0106/dsh-550c-boot/main/docs/preview-simple.png)
![青配色](https://raw.githubusercontent.com/yannicksong0106/dsh-550c-boot/main/docs/preview-cyan.png)

- **简易模式**（默认）：只播开头的 550C logo 书写加载动画，约 4 秒
- **完整模式**：播完整的覆写流程 —— logo → 基站接管终端 → 47 节点逐点覆写 → `SYSTEM IS REWRITTEN`，约 15 秒
- **关闭**：不播
- 播完才渐出，**不等软件加载状态**：无论 DSH 是否早已就绪，动画都会完整播完
- 完整模式下可以**点击画面或按 Esc 跳过**
- **DSH 那张 "HARNESS / Loading plugins…" 卡片不会再露脸**：首帧由宿主半边在文档解析阶段盖上，
  见[启动时序](#启动时序与挂载策略)；桌面窗口右上角那三个原生按钮也会被收编成同一套配色
- 四套配色（琥珀 / 绿 / 青 / 白），**默认是原作者的琥珀**，一个 token 都不覆盖

模式开关在 **设置 → 通用 → 550C 开机动画**，旁边还有一个「预览」按钮可以立刻看一遍。

## 安装

```sh
dsh plugin --profile web add <本目录绝对路径>
```

或从 GitHub 安装（仓库提交了构建产物，没有 `prepare` 生命周期脚本，所以不会触发 pnpm 的 `allowBuilds` 构建授权）：

```sh
dsh plugin --profile web add github:yannicksong0106/dsh-550c-boot
```

装完**必须重启一次 DSH**：bundle 层是在启动时装配的。

> ⚠️ 升级或重装后，请在新窗口里按 **Ctrl+Shift+R** 硬刷新。DSH 的客户端 bundle 响应带
> `cache-control: max-age=31536000, immutable`，而 URL 上的 `rev` 是进程 nonce、不随内容变化，
> 普通 F5 会一直用第一次抓到的副本。

## 工程结构

```
assets/550C-source.html   原版独立页面（归档，构建的输入）
scripts/extract.mjs       从原页面提取样式表 / DOM / 脚本 → src/assets.js + src/show.js
scripts/build.mjs         把四段拼成 lib/client.js（无打包器、无构建依赖）
src/client.js             手写：遮罩层、通用设置那一行、插件导出
src/enhance.js            内容增强层：追加样式表 + 观察 stage（含桌面标题栏那两段）
lib/client.js             构建产物（浏览器半边，提交进仓库）
lib/index.js              宿主半边：往 index 注入首帧（见「启动时序」）
cordis.patch.yml          bundle 补丁：把插件挂进 profile
```

**为什么是「提取」而不是「重写」**：动画不重新实现，而是把原页面的 `<style>`、DOM 结构和
`<script>` 机械搬运过来，只做定点改写。这样移植不会和作者调好的动画效果产生偏差；原文件改了，
重跑 `npm run build` 就能同步。

定点改写清单（全部写在 `scripts/extract.mjs` 里，每条都带原因）：

| 改写 | 原因 |
|---|---|
| `html, body` / `:root` / `body::before` / `body::after` → `:host` | Shadow DOM 里这些选择器匹配不到任何东西，`:root` 那条尤其致命——调色板变量全在里面 |
| `$()` 绑定到 shadow root 的 stage | 所有查询都在遮罩内部，不能落到宿主文档上 |
| 弹窗 append 到 stage 而不是 `document.body` | 否则作用域样式表够不着它们 |
| `sleep` / `setTimeout` → 可取消版本 | 一次跳过要能解开整条 async 链，不留孤儿定时器 |
| 删掉页面级的空格键监听和自动启动 | 触发权归遮罩层，页面级监听会重复触发 |
| 删掉 `#hint`（"REFRESH TO REPLAY"） | 插件是渐出，不是提示刷新 |

**为什么用 Shadow DOM**：原页面的 CSS 里有 `.w`、`.ln`、`.dt`、`.sect` 这类极通用的类名，
放进宿主文档会污染 DSH 自己的界面。Shadow DOM 让原样式表原样生效且零泄漏。

## 内容增强层

原页面是「移植」进来的（逐字保真），内容升级单独放在 [src/enhance.js](<F:\项目\dsh-start\src\enhance.js>)：
**追加一张样式表 + 一个 MutationObserver 观察已挂载的 stage**，完全不碰生成的动画代码。所以随时可以重新
提取原文件而不丢这些改动；不想要了，把 `enhance.js` 从 `scripts/build.mjs` 的 `PARTS` 里去掉即可。

三个方向：

**终端质感**
- 字体换成 `Cascadia Mono` + **NSimSun（新宋体）**——Windows 没有中文等宽字体，但新宋体是逐字定宽的，
  这是让中英混排对齐的关键（原来中文回退到比例字体，一眼就是网页）
- 进度条从网页渐变条改成**字符单元**（`repeating-linear-gradient` 切成 4px 块）
- 日志末尾加**块光标** `▊`，每行加真实时钟戳
- 命令行/倒计时行反色（左侧色条 + 底色）

**数据自洽**
- 弹窗日志里写死的时间戳（拦截日志的 `[03:41:22]`、异常日志的 `[14:22:07]`）**按日志容器各自重映射**
  到真实时钟——每段事件日志从它弹出的那一刻开始走，相对间隔保持不变。用全局原点会把两条互不相干的
  虚构时间线拼在一起，落到十几个小时之外
- `ELAPSED T-00:01:28` → 真实经过时间（实测 `T-00:00:08`）
- `时间窗口：T-00:03:41` 这个死线 → 活的倒计时（实测 `T-00:03:35`）

**面板加深度**
- 固件注入：每行加**行号 + 加载地址**（`0218 08001B40`），面板头显示 `0x08000000 · 0012C000 B`，
  底部页脚实时显示 `WROTE 0x… / 0x0012C000`、**真的算出来的 CRC32**、以及最后 8 字节的 hex
- 集群矩阵：47 个节点各加**信号强度条**（每节点确定性生成，只有状态色会变）和固件版本 `v1.14`

**配色：默认即原作，方案可选**
原作者的**琥珀色 CRT 就是终端的样子**。我前后改了四轮配色（白+红 / 红主导 / 冷蓝 / 单色薄荷），
每一轮都比原作差——因为问题不在配色，在于我一直在"改配色"，而终端不是一套配色方案。

所以现在的结构是：**默认一个颜色都不覆盖**。纹理和面板增强改用 `--phos*` 变量，而它的默认值就是
原作自己的琥珀阶梯；原版硬编码的那些颜色被收进变量，**默认值就是原版的字面量**。默认渲染与作者
自己的逐像素一致。

配色方案是**可选的数据**，不是又一次重写——每套方案只是一个变量覆盖块，通过 host 上的
`data-scheme` 生效。设置里可切换：

| 方案 | 说明 |
|---|---|
| **琥珀**（默认） | 原作配色，不覆盖任何东西 |
| 绿 | P1 绿磷光终端 |
| 青 | 冷青磷光 |
| 白 | P4 白/灰磷光 |

「琥珀」故意没有对应的 CSS 块：选它会把 `data-scheme` 整个清掉，默认值重新接管。

## 启动时序与挂载策略

DSH 自己有一张开机卡片（`[data-dsh-boot]`，"HARNESS / Loading plugins…"），由 shell 的内核绘制，
按插件加载进度更新，**全部加载完才移除**。`shell.overlay` 这类槽位要等 shell 渲染后才存在，shell
渲染又要等所有插件加载完——也就是说：**走槽位的开机动画永远排在 DSH 那张卡片后面**。

所以遮罩**不走槽位**：在客户端半边**模块求值的那一刻**就直接命令式挂到 `document.body` 上
（见 [src/client.js](<F:\项目\dsh-start\src\client.js>) 的 `mountOverlay()`）。生命周期仍归插件所有——
`apply()` 里注册 `ctx.effect` 负责卸载。

但客户端半边仍然**太晚**。实测（CDP 在页面脚本之前预注入探针，从导航开始计时）：

| 事件 | 时刻 |
|---|---|
| DSH boot card 出现 | 67 ms |
| 本插件遮罩挂载 | 338 ms |
| DSH boot card 被移除 | 517 ms |

内核先画卡片，插件的包要先被下载并求值——**中间 271ms 是客户端插件怎么调 z-index 都盖不住的**。

### 首帧交给宿主半边

能早于 shell 的只有**被送出的那份文档**本身。DSH 正好留了这个口子：`webserver/index-inject`
收集一张 index 注入行表，Web 载体把它渲染进 index.html（**紧跟 `<head>`**，早于 shell 的 module
script），桌面载体则在 settle `__DSH_BOOT_READY__` 之前**在页面里逐行应用**同一张表（`script` 行
走 `createElement`，所以会执行）——两条路都在内核建卡片之前。

于是 [lib/index.js](<F:\项目\dsh-start\lib\index.js>) 推两行：一条 `style`，一条同步 `script`。
效果是**卡片从来没被画到屏幕上**：文档还在解析时，盖住全屏的首帧（就是动画自己的底色 `#050403`）
已经在了；遮罩挂载的同一帧移除它，两者无缝交接。

两个约定（两边注释里都写了，改一边要改另一边）：

| 约定 | 作用 |
|---|---|
| `dsh-550c-boot:mode` | 注入脚本自己读这个键：**关闭**档直接不作画，一张黑屏都不会出现 |
| `window.__dsh550cFirstFrame.end()` | 遮罩挂载后调用它退役首帧（同一任务、同一帧，无缝） |

首帧也不会赖着不走：注入脚本每 250ms 看一眼那张卡片——卡片消失（应用挂载）或卡片丢掉 spinner
（shell 自己的失败态）就自己撤；再加 12s 绝对上限。客户端挂了、别的插件把 shell 弄挂了，页面都还是
能看能点的。

## 桌面窗口的那三个按钮

Windows 上桌面壳给 Electron 的是 `titleBarStyle:'hidden'` + `titleBarOverlay`（高 40，宽约
3×46=138，`color: chromeFallbackFill()` 暗色 `#1b1b1c`，`symbolColor: #f9fafb`），也就是说
**─ □ ✕ 是浏览器进程画在网页之上的**：文档里任何 z-index 都碰不到它，插件也删不掉它（原作自己的
─ □ ✕ 在假窗口标题栏里，那是设计的一部分，与本条无关）。

插件不试图盖它，而是**收编它**：

- **让位**：`#hud-top` 按 `env(titlebar-area-width)` 预留出条带宽度，HUD 自己的 `TIME / ● REC`
  不再被压在按钮底下；普通浏览器标签页没有这个 env，预留自然塌成 0。
- **换色**：桌面 preload 会用一个隐藏探针量 `--dsw-specific-sidebar-fill`（条带底色）和
  `--dsw-alias-label-primary`（符号色），经 `dsh-desktop:windows-appearance` 交给
  `setTitleBarOverlay`，并且 `<head>` 一变就重量一次。遮罩挂载时往 `<head>` 里塞一张把这两个
  token 指向本配色（简易档是底色、完整档是 HUD 顶色，符号色是琥珀）的样式表，OS 画的那条就跟着
  变成终端自己的颜色；卸载时移除，主题自动还原。

## 已知限制

- 只在 **Web UI 加载之后**覆盖全屏，做不到早于 Electron 窗口首帧（窗口本身还会有一瞬间的空白）。
- 首帧是一块**纯色**（动画自己的底色），不是动画的第一帧画面——它只负责在插件求值前占住屏幕。
- 桌面窗口的原生按钮仍在，只是被改成同一套配色；真要去掉得改桌面壳（`titleBarOverlay` 关了就没有）。
- 每次客户端加载都会播（刷新页面也算）。想要「每个会话只播一次」需要另加去重，目前故意不做。
- 偏好存在浏览器 `localStorage`（键 `dsh-550c-boot:mode`），不是 DSH 设置文档——和已装的第三方设置行做法一致。

## 开发

```sh
npm run build              # extract + build（只重写 lib/client.js）
node --check lib/client.js
node --check lib/index.js  # 宿主半边是手写的，同样要过一遍
```

## 验证

### 首帧 / 标题栏（不需要起 GUI）

`.verify/build-harness.mjs` + `.verify/run-harness.mjs` 把**真实的 index.html**（从 app.asar 里取出
的 web-frontend dist）用 **DSH 自己的行渲染器**（`.verify/dsh-render-rows.mjs`，逐字复制自
`@deepseek-ai/dsh-host-webserver`）套上**插件自己产出的行**，再用无头 Edge 跑：

```sh
node .verify/build-harness.mjs                      # 收集行 + 渲染 harness 页
node .verify/serve.mjs 3499                         # 静态服务器（后台）
node .verify/run-harness.mjs 3499                   # 跑四组探针 + 四张截图
```

| 断言 | 结果 |
|---|---|
| 首帧早于任何插件代码（`coverApplied`） | true（控件页同页面为 false） |
| 首帧退役与遮罩挂载同一任务（`coverAfterModule`） | false（类已移除）、握手全局已消费 |
| 桌面平台下挂载配色（`data-platform=win32`） | `data-caption=windows`，`<head>` 有了换色样式表 |
| 配色随档位/方案 | 简易 `#050403`、完整 `#141008`，符号色 `#e8a020` |
| 预留规则存在、浏览器里塌成 0 | true / `padding-right: 0px` |
| 关闭档 | 不作画、不挂载、不定义握手全局 |

截图在 `.verify/shots/`：同样的页面，**有行**时是纯黑首帧，**抽掉行**时 HARNESS 卡片就在那儿。

### 真实 GUI

`scripts/verify.mjs` 用 DevTools 协议驱动真实浏览器，可以在**精确时刻**、**指定模式**下截图并读取
遮罩层的内部状态。普通 `--screenshot` 做不到：模式存在 localStorage 里，而且新 profile 的引导弹窗
挡在整个 shell 前面，不点掉它插件的槽位根本不存在。

```sh
node scripts/verify.mjs --url 'http://127.0.0.1:3080/?token=…' --mode simple --at 2600
node scripts/verify.mjs --url '…' --mode full  --at 7000
node scripts/verify.mjs --url '…' --mode off   --at 1000 --settings   # 设置行巡检
node scripts/verify.mjs --url '…' --mode full  --at 3000 --skip       # 跳过验证
```

已实测通过的项（web profile，`link:` 安装）：

| 项 | 证据 |
|---|---|
| 简易模式播放 | 2.6s 截图：logo 正在逐路径书写，红 0 已发光，`550C SYSTEM BOOT` 打字机 |
| 简易模式收尾 | 7s 时 `host: false`，屏幕顶层元素变回 DSH 输入框 |
| 完整模式播放 | 7s 时 `appInShadow: true`、63 行日志、47 节点全部 `done` |
| 完整模式收尾 | 15s 时 `host: false`，遮罩已卸载 |
| 关闭档 | `--mode off` 时 `host: false`，遮罩从不挂载 |
| 通用设置行 | `rowTitle: "550C 开机动画"`，三档 `["关闭","简易","完整"]`，当前档高亮，`预览` 按钮在 |
| Esc 跳过 | 3s 时 `hostBefore: true` → Esc 后 `hostAfterEsc: false` |

截图存在 `.verify/shots/`；README 顶部那三张对外预览在 [`docs/`](docs/)。
`.verify/` 整个目录已 gitignore —— 里面有从 app.asar 取出的 DSH 包文件，不该进仓库。

> web profile 首次启动会串联几个引导弹窗（内测声明 → API Key），它们盖在整个 shell 之上，
> 所以全新 profile 下动画会被弹窗挡住。桌面 profile 的引导已经走完，不存在这个问题。

## 发布与收录

本仓库同时准备了两条分发路径，步骤、门槛和"会被问到什么"都写在
[`docs/PUBLISHING.md`](docs/PUBLISHING.md)：

- **GitHub 直装**：`dsh plugin --profile web add github:yannicksong0106/dsh-550c-boot`
- **OMDSH Hub**（[hub.omdsh.dev](https://hub.omdsh.dev/) 插件区域）：仓库里已带
  `package.json#dshWorkshop`（`omdsh-workshop-package/v1`），投稿要走 v2 Issue + 固定 40 位 commit，
  进的是 `pending-review` 队列 —— topic 命中只是"被发现"，不等于收录，更不等于安装权限。
- **npm**（可选）：`npm publish`，市场按包名安装走这条。

## 致谢

动画与 HTML 原稿由 **Voidpoket**（[@Voidpoket](https://github.com/Voidpoket)）提供，插件工程与移植由
**Ziyang Song**（[@yannicksong0106](https://github.com/yannicksong0106)）完成。详见
[CREDITS.md](CREDITS.md)。

