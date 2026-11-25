## FreeMD 1.0.8

专注阅读体验的 Markdown 阅读器与编辑器。自动识别文档中的**图像**、**公式**、**图表**与**章节结构**，并据此生成可点击、可联动的目录导航。

本次调整章节与正文配色，并去掉正文标题前的自动编号；PDF 导出与阅读视图保持一致。

### 本次更新

- **标题不再自动编号**：阅读视图标题前不再插入自动生成的 `1` / `1.1` 序号，标题文字沿用 Markdown 源文档自带的编号；左侧大纲同样去掉自动序号，仅按标题层级缩进展示导航
- **标题配色**：阅读视图与 PDF 导出的各级标题统一为深绿 `#005940`，标题装饰线同色
- **加粗配色**：正文中 `**加粗**` 的文本渲染为红色 `#DD1435`，PDF 导出同样保留该颜色
- **PDF 配色一致**：导出的 A4 PDF 沿用阅读视图的标题与加粗颜色，不再回退成纯黑

### 下载

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `FreeMD-1.0.8-win-x64.exe` | NSIS 安装程序，可选安装目录、创建桌面快捷方式，关联 `.md` 文件 |
| Windows | `FreeMD-1.0.8-portable-x64.exe` | 免安装绿色版，双击即用 |
| Linux (x64) | `FreeMD-1.0.8-linux-x64.deb` | Debian / Ubuntu 安装包，`sudo apt install ./FreeMD-1.0.8-linux-x64.deb` |
| Linux (x64) | `FreeMD-1.0.8-linux-x64.AppImage` | 通用免安装包，`chmod +x` 后直接运行，适用于 Fedora / Arch / 其他发行版 |
| macOS (Intel) | `FreeMD-1.0.8-mac-x64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |
| macOS (Apple Silicon) | `FreeMD-1.0.8-mac-arm64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |

### Linux 安装说明

安装后直接用桌面图标或终端命令 `freemd` 启动。deb 内的 `/opt/FreeMD/chrome-sandbox` 已经是 `root:root` 且权限 4755，Ubuntu 23.10+/24.04、Debian 12 可直接启动；图标按 16–512px 多尺寸安装并刷新 hicolor 图标缓存，启动器显示 FreeMD 图标。

缺少系统依赖时：`sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0`。

AppImage 版不需要安装：下载后 `chmod +x FreeMD-1.0.8-linux-x64.AppImage` 直接运行，适合 Fedora / Arch 等非 Debian 系发行版，也可用 [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) 做桌面集成。

### 功能

- **自动识别**：章节层级（含无 `#` 标题的纯文本笔记启发式识别）、`$...$` 与 `$$...$$` 公式（KaTeX）、`mermaid` / `plantuml` 代码块图表、相对 / 绝对 / 网络 / 剪贴板图片、YAML front matter 信息卡、任务列表
- **目录导航**：按 Markdown 原生标题层级生成大纲树，点击跳转、正文滚动高亮当前章节、编辑区与阅读区滚动双向同步
- **阅读体验**：三档视图（仅编辑 / 分栏 / 仅阅读）、深浅双主题、图片灯箱、图表拖拽缩放与全屏、SVG 导出、代码块一键复制、文档内查找
- **编辑与文件**：CodeMirror 编辑器、格式工具栏、拖拽或粘贴图片自动存入同级 `assets/`、文件夹树浏览、最近打开记录、A4 排版 PDF 导出、单实例与 `.md` 文件关联
- **离线与安全**：所有第三方运行时资源（含 Mermaid）随包分发，不依赖 CDN；渲染层关闭 Node 集成、开启上下文隔离与沙箱，HTML 经 DOMPurify 过滤

### 已知说明

- 所有平台的产物均**未做代码签名**。Windows 首次运行可能出现 SmartScreen 提示，选择「更多信息 → 仍要运行」即可。
- macOS 首次打开若提示「无法验证开发者」，请在「访达」中右键点击 `FreeMD.app` → 打开，或执行 `xattr -cr FreeMD.app` 后再启动。
- macOS 包由 Linux 环境下的 `scripts/build-mac-zip.js` 生成（注入官方 Electron 运行时并改写 Info.plist），未使用 Apple 开发者证书签名。
- Mermaid 图表内的字体使用系统字体，中文标签在部分 Linux 发行版上需要安装中文字体（如 `fonts-noto-cjk`）才能正常显示。
- PlantUML 支持范围限于**类图**：时序图、活动图、状态图、用例图等会给出「暂不支持」的提示；类图里的 `skinparam`、颜色、构造型图标等样式指令会被忽略，布局由 Mermaid 决定。

### 校验

各产物由本仓库 `main` 分支的对应 tag 构建。源码安装与二次打包见 [README](https://github.com/cypowerAI/FreeMD#本地开发)。

SHA256：

| 文件 | SHA256 |
| --- | --- |
| `FreeMD-1.0.8-win-x64.exe` | `0DDD86A72B29D8B09FA83114AE5E1F5788D5E454673B798D7710F9AEDFE0E12A` |
| `FreeMD-1.0.8-portable-x64.exe` | `DE3E9666ABE32764CE566F83A3808979166A50FBC29037001D694227BCFD1259` |
| `FreeMD-1.0.8-linux-x64.deb` | `EBABF667B600E1C5214AE687F4F69D1AF03DED3CA8DCB681DEDE3D84713C4493` |
| `FreeMD-1.0.8-linux-x64.AppImage` | `C9A620132D8DA395C2B241694911E5BA912F6DEF39A7CB5693F701CC202FEB1B` |
| `FreeMD-1.0.8-mac-x64.zip` | `2CD679ACF9984477C6261C3A512B75A2D05AEC5FF65ECB602714A1B17096A54B` |
| `FreeMD-1.0.8-mac-arm64.zip` | `C389727A387902A424DAC54FA0ECFB2A5B8756D3ED95009F0BF4400BC42DBCF8` |
