## FreeMD 1.0.7

专注阅读体验的 Markdown 阅读器与编辑器。自动识别文档中的**图像**、**公式**、**图表**与**章节结构**，并据此生成可点击、可联动的目录导航。

本次让 PlantUML 类图直接在阅读视图里渲染，不再需要改写成 Mermaid。

### 本次更新

- **支持 PlantUML 类图**：` ```plantuml ` / ` ```puml ` 代码块以及写在 ` ```mermaid ` 里的 `@startuml … @enduml` 会自动转写成 Mermaid classDiagram 再渲染，无需安装 Java 或连接 PlantUML 服务，完全离线
- **覆盖的写法**：`package "…" { }`（转成 namespace）、`class` / `interface` / `abstract class` / `enum` / `<<abstract>>` / `<<enumeration>>`、成员与方法的可见性（`+ - # ~`）、`{static}`、泛型（`List<String>` 显示为 `List<String>`）、继承 `<|--` / 实现 `<|..` / 依赖 `..>` / 关联 `-->` / 组合 `--*` / 聚合 `--o` / 反向 `--|>`，以及 `note top|bottom|left|right of X` 注释块
- **多行方法签名**：PlantUML 里按括号换行的参数列表会先接回一行再渲染，避免 Mermaid 解析失败
- **箭头仍然贴边**：1.0.6 的端点吸附继续生效，转写后的类图箭头落在目标类框边框上
- **不支持时明确提示**：时序图、活动图等非类图语法会提示「暂不支持这段 PlantUML」，不会静默渲染成乱图

### 下载

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `FreeMD-1.0.7-win-x64.exe` | NSIS 安装程序，可选安装目录、创建桌面快捷方式，关联 `.md` 文件 |
| Windows | `FreeMD-1.0.7-portable-x64.exe` | 免安装绿色版，双击即用 |
| Linux (x64) | `FreeMD-1.0.7-linux-x64.deb` | Debian / Ubuntu 安装包，`sudo apt install ./FreeMD-1.0.7-linux-x64.deb` |
| Linux (x64) | `FreeMD-1.0.7-linux-x64.AppImage` | 通用免安装包，`chmod +x` 后直接运行，适用于 Fedora / Arch / 其他发行版 |
| macOS (Intel) | `FreeMD-1.0.7-mac-x64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |
| macOS (Apple Silicon) | `FreeMD-1.0.7-mac-arm64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |

### Linux 安装说明

安装后直接用桌面图标或终端命令 `freemd` 启动。deb 内的 `/opt/FreeMD/chrome-sandbox` 已经是 `root:root` 且权限 4755，Ubuntu 23.10+/24.04、Debian 12 可直接启动；图标按 16–512px 多尺寸安装并刷新 hicolor 图标缓存，启动器显示 FreeMD 图标。

缺少系统依赖时：`sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0`。

AppImage 版不需要安装：下载后 `chmod +x FreeMD-1.0.7-linux-x64.AppImage` 直接运行，适合 Fedora / Arch 等非 Debian 系发行版，也可用 [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) 做桌面集成。

### 功能

- **自动识别**：章节层级（含无 `#` 标题的纯文本笔记启发式识别）、`$...$` 与 `$$...$$` 公式（KaTeX）、`mermaid` / `plantuml` 代码块图表、相对 / 绝对 / 网络 / 剪贴板图片、YAML front matter 信息卡、任务列表
- **目录导航**：章节编号压缩为 `1` / `1.1`，大纲点击跳转、正文滚动高亮当前章节、编辑区与阅读区滚动双向同步
- **阅读体验**：三档视图（仅编辑 / 分栏 / 仅阅读）、深浅双主题、图片灯箱、图表拖拽缩放与全屏、SVG 导出、代码块一键复制、文档内查找
- **编辑与文件**：CodeMirror 编辑器、格式工具栏、拖拽或粘贴图片自动存入同级 `assets/`、文件夹树浏览、最近打开记录、A4 排版 PDF 导出、单实例与 `.md` 文件关联
- **离线与安全**：所有第三方运行时资源（含 Mermaid）随包分发，不依赖 CDN；渲染层关闭 Node 集成、开启上下文隔离与沙箱，HTML 经 DOMPurify 过滤

### 已知说明

- 所有平台的产物均**未做代码签名**。Windows 首次运行可能出现 SmartScreen 提示，选择「更多信息 → 仍要运行」即可。
- macOS 首次打开若提示「无法验证开发者」，请在「访达」中右键点击 `FreeMD.app` → 打开，或执行 `xattr -cr FreeMD.app` 后再启动。
- macOS 包由 Linux 环境下的 `scripts/build-mac-zip.js` 生成（注入官方 Electron 运行时并改写 Info.plist），未使用 Apple 开发者证书签名。
- Mermaid 图表内的字体使用系统字体，中文标签在部分 Linux 发行版上需要安装中文字体（如 `fonts-noto-cjk`）才能正常显示。
- PlantUML 支持范围限于**类图**：时序图、活动图、状态图、用例图等会给出「暂不支持」的提示；类图里的 `skinparam`、颜色、构造型图标等样式指令会被忽略，布局由 Mermaid 决定。
- 类图连线的直角化只在节点旁 48px 内吸附，节点极多、层级交错的超大类图仍可能在个别位置出现连线穿插，可点击放大后阅读。

### 校验

各产物由本仓库 `main` 分支的对应 tag 构建。源码安装与二次打包见 [README](https://github.com/cypowerAI/FreeMD#本地开发)。

SHA256：

| 文件 | SHA256 |
| --- | --- |
| `FreeMD-1.0.7-win-x64.exe` | `TBD` |
| `FreeMD-1.0.7-portable-x64.exe` | `TBD` |
| `FreeMD-1.0.7-linux-x64.deb` | `TBD` |
| `FreeMD-1.0.7-linux-x64.AppImage` | `TBD` |
| `FreeMD-1.0.7-mac-x64.zip` | `TBD` |
| `FreeMD-1.0.7-mac-arm64.zip` | `TBD` |
