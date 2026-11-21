## FreeMD 1.0.5

专注阅读体验的 Markdown 阅读器与编辑器。自动识别文档中的**图像**、**公式**、**图表**与**章节结构**，并据此生成可点击、可联动的目录导航。

本次聚焦 UML / Mermaid 图表的查看与操作。

### 本次更新

- **图表查看器**：图表放大后支持按住拖拽平移，滚轮以光标为锚点缩放（0.4×–6×），双击或点「复位」回到 1:1
- **全屏查看**：灯箱内可一键进入窗口全屏（`F` 或 `F11`），全屏下继续拖拽、缩放，`Esc` 退出
- **保存为 SVG 矢量图**：图表可另存为 `.svg` 文件，放大到任意尺寸都不失真，可直接插入文档、PPT 或排版软件；文件名默认取「文档名-图表序号」
- **类图连线改直角**：Mermaid 类图（UML）的继承、依赖、关联连线由三次贝塞尔曲线改写成正交折线，转角为直角，与流程图连线风格统一；阅读视图与 PDF 导出都生效
- **快捷键**：灯箱内 `+` / `-` 缩放、`0` 复位、`F` 全屏、`Esc` 关闭
- 1.0.4 的类图等比缩放、点击放大、PlantUML 语法提示保持不变

### 下载

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `FreeMD-1.0.5-win-x64.exe` | NSIS 安装程序，可选安装目录、创建桌面快捷方式，关联 `.md` 文件 |
| Windows | `FreeMD-1.0.5-portable-x64.exe` | 免安装绿色版，双击即用 |
| Linux (x64) | `FreeMD-1.0.5-linux-x64.deb` | Debian / Ubuntu 安装包，`sudo apt install ./FreeMD-1.0.5-linux-x64.deb` |
| Linux (x64) | `FreeMD-1.0.5-linux-x64.AppImage` | 通用免安装包，`chmod +x` 后直接运行，适用于 Fedora / Arch / 其他发行版 |
| macOS (Intel) | `FreeMD-1.0.5-mac-x64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |
| macOS (Apple Silicon) | `FreeMD-1.0.5-mac-arm64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |

### Linux 安装说明

安装后直接用桌面图标或终端命令 `freemd` 启动。deb 内的 `/opt/FreeMD/chrome-sandbox` 已经是 `root:root` 且权限 4755，Ubuntu 23.10+/24.04、Debian 12 可直接启动；图标按 16–512px 多尺寸安装并刷新 hicolor 图标缓存，启动器显示 FreeMD 图标。

缺少系统依赖时：`sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0`。

AppImage 版不需要安装：下载后 `chmod +x FreeMD-1.0.5-linux-x64.AppImage` 直接运行，适合 Fedora / Arch 等非 Debian 系发行版，也可用 [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) 做桌面集成。

### 功能

- **自动识别**：章节层级（含无 `#` 标题的纯文本笔记启发式识别）、`$...$` 与 `$$...$$` 公式（KaTeX）、`mermaid` 代码块图表、相对 / 绝对 / 网络 / 剪贴板图片、YAML front matter 信息卡、任务列表
- **目录导航**：章节编号压缩为 `1` / `1.1`，大纲点击跳转、正文滚动高亮当前章节、编辑区与阅读区滚动双向同步
- **阅读体验**：三档视图（仅编辑 / 分栏 / 仅阅读）、深浅双主题、图片灯箱、图表拖拽缩放与全屏、SVG 导出、代码块一键复制、文档内查找
- **编辑与文件**：CodeMirror 编辑器、格式工具栏、拖拽或粘贴图片自动存入同级 `assets/`、文件夹树浏览、最近打开记录、A4 排版 PDF 导出、单实例与 `.md` 文件关联
- **离线与安全**：所有第三方运行时资源（含 Mermaid）随包分发，不依赖 CDN；渲染层关闭 Node 集成、开启上下文隔离与沙箱，HTML 经 DOMPurify 过滤

### 已知说明

- 所有平台的产物均**未做代码签名**。Windows 首次运行可能出现 SmartScreen 提示，选择「更多信息 → 仍要运行」即可。
- macOS 首次打开若提示「无法验证开发者」，请在「访达」中右键点击 `FreeMD.app` → 打开，或执行 `xattr -cr FreeMD.app` 后再启动。
- macOS 包由 Linux 环境下的 `scripts/build-mac-zip.sh` 生成（注入官方 Electron 运行时并改写 Info.plist），未使用 Apple 开发者证书签名。
- Mermaid 图表内的字体使用系统字体，中文标签在部分 Linux 发行版上需要安装中文字体（如 `fonts-noto-cjk`）才能正常显示。
- 只渲染 Mermaid 语法；PlantUML 需要 Java 与服务端，不在离线阅读器范围内，` ```plantuml ` 代码块按普通代码展示，写在 ` ```mermaid ` 里时会给出语法提示。
- 类图连线的直角化是按起止点重排折线，节点极多、层级交错的超大类图可能在个别位置出现连线穿插，可点击放大后阅读。

### 校验

各产物由本仓库 `main` 分支的对应 tag 构建。源码安装与二次打包见 [README](https://github.com/cypowerAI/FreeMD#本地开发)。

SHA256：

| 文件 | SHA256 |
| --- | --- |
| `FreeMD-1.0.5-win-x64.exe` | `97CC0420134435D7147A1F49E24912D340F6F73111FEE7A115F4DC17C227482F` |
| `FreeMD-1.0.5-portable-x64.exe` | `301B39613BCE20DF60A8614DAD71B4816EB9CD8BD5201EC96B24AF41866B7A12` |
| `FreeMD-1.0.5-linux-x64.deb` | `0AA05AD78AF32E84A67B83B65E3CE911C37C09ABED97327478D33FE40552FEDA` |
| `FreeMD-1.0.5-linux-x64.AppImage` | `8D1DE152F55933A0CD30F71B64349EC85372CE535B6E17918DBD9ABB456EC81D` |
| `FreeMD-1.0.5-mac-x64.zip` | `5A694AABBFD801984FE9B8B30C9E8BC6A33817D633667B332DB37313988A24DC3` |
| `FreeMD-1.0.5-mac-arm64.zip` | `FCD83945F8643A8EF63F3B623781F42F85F1CC665161679C781DA7C38B06A3EF` |
