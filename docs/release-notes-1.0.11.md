## FreeMD 1.0.11

专注阅读体验的 Markdown 阅读器与编辑器。自动识别文档中的**图像**、**公式**、**图表**与**章节结构**，并据此生成可点击、可联动的目录导航。

本次进一步修复类图关系符号嵌入类框的问题：按每种标记（继承三角、实现三角、引用箭头、实心/空心菱形）的实际几何包围盒计算外退量，让符号完整显示在类框边缘外侧。

### 本次更新

- **类图关系符号完整落在框外**：起始端的组合实心菱形、聚合空心菱形、继承空心三角不再沿路径反方向回探进类框；结束端的箭头与三角/菱形同样按本体长度留出间隙。外退量依据标记定义的 `refX` 与包围盒宽度逐端计算，并随连线线宽缩放，边角处按连线主方向优先选边，避免符号跨到相邻边框
- **兼容离屏打印副本**：标记几何取不到时退回默认范围并降级线宽，PDF 导出副本中的类图连线同样保持间隙

### 下载

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `FreeMD-1.0.11-win-x64.exe` | NSIS 安装程序，可选安装目录、创建桌面快捷方式，关联 `.md` 文件 |
| Windows | `FreeMD-1.0.11-portable-x64.exe` | 免安装绿色版，双击即用 |
| Linux (x64) | `FreeMD-1.0.11-linux-x64.deb` | Debian / Ubuntu 安装包，`sudo apt install ./FreeMD-1.0.11-linux-x64.deb` |
| Linux (x64) | `FreeMD-1.0.11-linux-x64.AppImage` | 通用免安装包，`chmod +x` 后直接运行，适用于 Fedora / Arch / 其他发行版 |
| macOS (Intel) | `FreeMD-1.0.11-mac-x64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |
| macOS (Apple Silicon) | `FreeMD-1.0.11-mac-arm64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |

### Linux 安装说明

安装后直接用桌面图标或终端命令 `freemd` 启动。deb 内的 `/opt/FreeMD/chrome-sandbox` 已经是 `root:root` 且权限 4755，Ubuntu 23.10+/24.04、Debian 12 可直接启动；图标按 16–512px 多尺寸安装并刷新 hicolor 图标缓存，启动器显示 FreeMD 图标。

缺少系统依赖时：`sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0`。

AppImage 版不需要安装：下载后 `chmod +x FreeMD-1.0.11-linux-x64.AppImage` 直接运行，适合 Fedora / Arch 等非 Debian 系发行版，也可用 [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) 做桌面集成。

### 功能

- **自动识别**：章节层级（含无 `#` 标题的纯文本笔记启发式识别）、`$...$` 与 `$$...$$` 公式（KaTeX）、`mermaid` / `plantuml` 代码块图表、相对 / 绝对 / 网络 / 剪贴板图片、YAML front matter 信息卡、任务列表
- **目录导航**：按 Markdown 原生标题层级生成大纲树，点击跳转、正文滚动高亮当前章节，编辑区与阅读区滚动双向同步；PDF 导出同样按标题生成书签大纲
- **阅读体验**：三档视图（仅编辑 / 分栏 / 仅阅读）、深浅双主题、图片灯箱、图表拖拽缩放与全屏、SVG 导出、代码块一键复制、文档内查找
- **编辑与文件**：CodeMirror 编辑器、格式工具栏、拖拽或粘贴图片自动存入同级 `assets/`、文件夹树浏览、最近打开记录、A4 排版 PDF 导出、单实例与 `.md` 文件关联
- **离线与安全**：所有第三方运行时资源（含 Mermaid）随包分发，不依赖 CDN；渲染层关闭 Node 集成、开启上下文隔离与沙箱，HTML 经 DOMPurify 过滤

### 已知说明

- 所有平台的产物均**未做代码签名**。Windows 首次运行可能出现 SmartScreen 提示，选择「更多信息 → 仍要运行」即可。
- macOS 首次打开若提示「无法验证开发者」，请在「访达」中右键点击 `FreeMD.app` → 打开，或执行 `xattr -cr FreeMD.app` 后再启动。
- macOS 包由 Linux 环境下的 `scripts/build-mac-zip.js` 生成（注入官方 Electron 运行时并改写 Info.plist），未使用 Apple 开发者证书签名。
- Mermaid 图表内的字体使用系统字体，中文标签在部分 Linux 发行版上需要安装中文字体（如 `fonts-noto-cjk`）才能正常显示。
- PlantUML 支持范围限于**类图与时序图**：活动图、状态图、用例图、组件图等会给出「暂不支持」的提示；类图里的 `skinparam`、颜色、构造型图标等样式指令会被忽略，布局由 Mermaid 决定。

### 校验

各产物由本仓库 `main` 分支的对应 tag 构建。源码安装与二次打包见 [README](https://github.com/cypowerAI/FreeMD#本地开发)。

SHA256：

| 文件 | SHA256 |
| --- | --- |
| `FreeMD-1.0.11-win-x64.exe` | `67ea5f80388e414dc4e597dd5fd2ee88818a19bfde002f50c3fcc5db1d4201e8` |
| `FreeMD-1.0.11-portable-x64.exe` | `649197ea0bdebeb3caf4f47aa1dc53c2b1a654aef797e90565fda4b6dbba919c` |
| `FreeMD-1.0.11-linux-x64.deb` | `fa0937b9d3837d5dd2273fe0d916fa8d17f3d60956e84d48c11051ad0735f1eb` |
| `FreeMD-1.0.11-linux-x64.AppImage` | `e8ca69c6cad8a2d5b134114e7b871a32d20acb509e1413532b0dd735fc48a9e0` |
| `FreeMD-1.0.11-mac-x64.zip` | `371af43ebfabc76eae07a9017f0879db7b5a2a9a100d64827ebf1d4004752d08` |
| `FreeMD-1.0.11-mac-arm64.zip` | `c3c252a2f6d6998021a937e823b55e7fad056335bd6345872b4c1efd8d2a28c9` |
