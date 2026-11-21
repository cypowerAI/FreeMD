## FreeMD 1.0.3

专注阅读体验的 Markdown 阅读器与编辑器。自动识别文档中的**图像**、**公式**、**图表**与**章节结构**，并据此生成可点击、可联动的目录导航。

### 本次更新

- **Mermaid 图表渲染**：以 `mermaid` 作为代码块语言标记，流程图、时序图、类图（UML）、状态图、ER 图、甘特图、饼图等在阅读视图中渲染成矢量图，不再是纯文本代码
- **配色跟随主题**：图表节点、连线、分组框的颜色由界面主题 token 派生，浅色与深色主题各有一套配色，切换主题时已渲染的图表会原地重绘
- **直角折线连线**：流程图连线采用正交折线（`curve: stepBefore`），分支走向以直角转角呈现，不再使用曲线弧度
- **导出 PDF 保留图表**：导出的 PDF 里图表同样以矢量形式呈现；深色主题下导出时会按浅色配色重绘，保证打印到白纸上仍然清晰可读
- **语法错误平滑降级**：Mermaid 语法写错时不中断整篇渲染，出错位置退回显示原始源码并给出「图表渲染失败：Parse error…」提示，其余内容照常渲染
- **图表计数**：状态栏新增「N 图表」，与章节、图片、公式、字数统计并列
- **增量渲染**：同一份文档重复排版时按「主题 + 源码」复用已生成的 SVG，编辑时只有改动过的图表会重新绘制
- **内置示例文档**：随包的《FreeMD 使用指南》新增图表章节，直接展示流程图与时序图效果

### 下载

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `FreeMD-1.0.3-win-x64.exe` | NSIS 安装程序，可选安装目录、创建桌面快捷方式，关联 `.md` 文件 |
| Windows | `FreeMD-1.0.3-portable-x64.exe` | 免安装绿色版，双击即用 |
| Linux (x64) | `FreeMD-1.0.3-linux-x64.deb` | Debian / Ubuntu 安装包，`sudo apt install ./FreeMD-1.0.3-linux-x64.deb` |
| Linux (x64) | `FreeMD-1.0.3-linux-x64.AppImage` | 通用免安装包，`chmod +x` 后直接运行，适用于 Fedora / Arch / 其他发行版 |
| macOS (Intel) | `FreeMD-1.0.3-mac-x64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |
| macOS (Apple Silicon) | `FreeMD-1.0.3-mac-arm64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |

### Linux 安装说明

安装后直接用桌面图标或终端命令 `freemd` 启动。deb 内的 `/opt/FreeMD/chrome-sandbox` 已经是 `root:root` 且权限 4755，Ubuntu 23.10+/24.04、Debian 12 可直接启动；图标按 16–512px 多尺寸安装并刷新 hicolor 图标缓存，启动器显示 FreeMD 图标。

缺少系统依赖时：`sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0`。

AppImage 版不需要安装：下载后 `chmod +x FreeMD-1.0.3-linux-x64.AppImage` 直接运行，适合 Fedora / Arch 等非 Debian 系发行版，也可用 [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) 做桌面集成。

### 功能

- **自动识别**：章节层级（含无 `#` 标题的纯文本笔记启发式识别）、`$...$` 与 `$$...$$` 公式（KaTeX）、`mermaid` 代码块图表、相对 / 绝对 / 网络 / 剪贴板图片、YAML front matter 信息卡、任务列表
- **目录导航**：章节编号压缩为 `1` / `1.1`，大纲点击跳转、正文滚动高亮当前章节、编辑区与阅读区滚动双向同步
- **阅读体验**：三档视图（仅编辑 / 分栏 / 仅阅读）、深浅双主题、图片灯箱、代码块一键复制、文档内查找
- **编辑与文件**：CodeMirror 编辑器、格式工具栏、拖拽或粘贴图片自动存入同级 `assets/`、文件夹树浏览、最近打开记录、A4 排版 PDF 导出、单实例与 `.md` 文件关联
- **离线与安全**：所有第三方运行时资源（含 Mermaid）随包分发，不依赖 CDN；渲染层关闭 Node 集成、开启上下文隔离与沙箱，HTML 经 DOMPurify 过滤

### 已知说明

- 所有平台的产物均**未做代码签名**。Windows 首次运行可能出现 SmartScreen 提示，选择「更多信息 → 仍要运行」即可。
- macOS 首次打开若提示「无法验证开发者」，请在「访达」中右键点击 `FreeMD.app` → 打开，或执行 `xattr -cr FreeMD.app` 后再启动。
- macOS 包由 Linux 环境下的 `scripts/build-mac-zip.js` 生成（注入官方 Electron 运行时并改写 Info.plist），未使用 Apple 开发者证书签名。
- Mermaid 图表内的字体使用系统字体，中文标签在部分 Linux 发行版上需要安装中文字体（如 `fonts-noto-cjk`）才能正常显示。

### 校验

各产物由本仓库 `main` 分支的对应 tag 构建。源码安装与二次打包见 [README](https://github.com/cypowerAI/FreeMD#本地开发)。

SHA256：

| 文件 | SHA256 |
| --- | --- |
| `FreeMD-1.0.3-win-x64.exe` | `BC0D904BAE76ABEC35120A1A66DBD0FB509EFC01A8CEC06BDFBBEBB449EE035C` |
| `FreeMD-1.0.3-portable-x64.exe` | `F46241350F84B9C4AA0A5164012D9143DE03BB7BAEAAF83FFB5282B5504C170F` |
| `FreeMD-1.0.3-linux-x64.deb` | `29F1E721FC113E7F82853C9B987F5F38CE62764803000232615EAAB44C652934` |
| `FreeMD-1.0.3-linux-x64.AppImage` | `A77849359A70540F3A260A274BA81EB3F5F3794D63E835989116755002D89C96` |
| `FreeMD-1.0.3-mac-x64.zip` | `30728D6A523C3D3C5B081CA60400AC8FD69D18BEC0AEDFD5D63360FD752A34E0` |
| `FreeMD-1.0.3-mac-arm64.zip` | `143D9DE9D9ACF52995954B13B7E40147B234A191D8C862B6C5C2B31C01EAA1F2` |
