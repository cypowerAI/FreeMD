## FreeMD 1.0.2

专注阅读体验的 Markdown 阅读器与编辑器。自动识别文档中的**图像**、**公式**与**章节结构**，并据此生成可点击、可联动的目录导航。

### 本次更新

- **阅读视图排版**：切到「阅读」视图时，正文文字列占阅读区域的 75%，两侧留白居中；分栏视图保持原有版心宽度，窄窗口自动放宽到 92%
- **宽内容就地滚动**：表格、代码块超出正文列宽度时，在各自区域内出现横向滚动条，不再挤压或撑宽正文；公式块原有的横向滚动一并保留
- **表格配色分层**：表头使用强调色底 + 强调色文字，数据行单双行交替配色，悬停高亮加深，深浅主题各配一套
- **修复启动打开文档被覆盖**：通过命令行参数或文件关联打开 `.md` 时，文档会被「欢迎使用 FreeMD」示例页覆盖；现在启动参数中的文档在欢迎页之后打开
- **导出 PDF 适配**：打印样式下表格恢复自动换行、代码恢复折行，长内容不会被页面截断

### 下载

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `FreeMD-1.0.2-win-x64.exe` | NSIS 安装程序，可选安装目录、创建桌面快捷方式，关联 `.md` 文件 |
| Windows | `FreeMD-1.0.2-portable-x64.exe` | 免安装绿色版，双击即用 |
| Linux (x64) | `FreeMD-1.0.2-linux-x64.deb` | Debian / Ubuntu 安装包，`sudo apt install ./FreeMD-1.0.2-linux-x64.deb` |
| macOS (Intel) | `FreeMD-1.0.2-mac-x64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |
| macOS (Apple Silicon) | `FreeMD-1.0.2-mac-arm64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |

### Linux 安装说明

安装后直接用桌面图标或终端命令 `freemd` 启动。deb 内的 `/opt/FreeMD/chrome-sandbox` 已经是 `root:root` 且权限 4755，Ubuntu 23.10+/24.04、Debian 12 可直接启动。

缺少系统依赖时：`sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0`。

### 功能

- **自动识别**：章节层级（含无 `#` 标题的纯文本笔记启发式识别）、`$...$` 与 `$$...$$` 公式（KaTeX）、相对 / 绝对 / 网络 / 剪贴板图片、YAML front matter 信息卡、任务列表
- **目录导航**：章节编号压缩为 `1` / `1.1`，大纲点击跳转、正文滚动高亮当前章节、编辑区与阅读区滚动双向同步
- **阅读体验**：三档视图（仅编辑 / 分栏 / 仅阅读）、深浅双主题、图片灯箱、代码块一键复制、文档内查找
- **编辑与文件**：CodeMirror 编辑器、格式工具栏、拖拽或粘贴图片自动存入同级 `assets/`、文件夹树浏览、最近打开记录、A4 排版 PDF 导出、单实例与 `.md` 文件关联
- **离线与安全**：所有第三方运行时资源随包分发，不依赖 CDN；渲染层关闭 Node 集成、开启上下文隔离与沙箱，HTML 经 DOMPurify 过滤

### 已知说明

- 所有平台的产物均**未做代码签名**。Windows 首次运行可能出现 SmartScreen 提示，选择「更多信息 → 仍要运行」即可。
- macOS 首次打开若提示「无法验证开发者」，请在「访达」中右键点击 `FreeMD.app` → 打开，或执行 `xattr -cr FreeMD.app` 后再启动。
- macOS 包由 Linux 环境下的 `scripts/build-mac-zip.js` 生成（注入官方 Electron 运行时并改写 Info.plist），未使用 Apple 开发者证书签名。

### 校验

各产物由本仓库 `main` 分支的对应 tag 构建。源码安装与二次打包见 [README](https://github.com/cypowerAI/FreeMD#本地开发)。
