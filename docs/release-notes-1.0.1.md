## FreeMD 1.0.1

专注阅读体验的 Markdown 阅读器与编辑器。自动识别文档中的**图像**、**公式**与**章节结构**，并据此生成可点击、可联动的目录导航。

### 本次更新

- **新品牌图标**：采用卡通阅读形象作为应用图标（Windows 安装包 / exe、macOS `.app`、Linux `.deb` 与窗口图标统一替换），图标为透明底，深浅色任务栏下都不会出现白框
- **Linux 启动崩溃修复**：deb 安装后 `/opt/FreeMD/chrome-sandbox` 权限由 0755 修正为 `root:root 4755`，解决 Ubuntu 23.10+/24.04、Debian 12 上 `setuid_sandbox_host.cc(163)` 导致的启动失败

### 下载

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `FreeMD-1.0.1-win-x64.exe` | NSIS 安装程序，可选安装目录、创建桌面快捷方式，关联 `.md` 文件 |
| Windows | `FreeMD-1.0.1-portable-x64.exe` | 免安装绿色版，双击即用 |
| Linux (x64) | `FreeMD-1.0.1-linux-x64.deb` | Debian / Ubuntu 安装包，`sudo apt install ./FreeMD-1.0.1-linux-x64.deb` |
| macOS (Intel) | `FreeMD-1.0.1-mac-x64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |
| macOS (Apple Silicon) | `FreeMD-1.0.1-mac-arm64.zip` | 解压后把 `FreeMD.app` 拖入「应用程序」 |

### Linux 安装说明

安装后直接用桌面图标或终端命令 `freemd` 启动。若旧版安装包启动时报 `setuid_sandbox_host.cc(163) ... /opt/FreeMD/chrome-sandbox is owned by root and has mode 4755`，执行下面一条命令即可修复（或重新下载本页安装包覆盖安装）：

```bash
sudo chown root:root /opt/FreeMD/chrome-sandbox && sudo chmod 4755 /opt/FreeMD/chrome-sandbox
```

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
- Linux 若缺少系统依赖，可执行 `sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0`。

### 校验

各产物由本仓库 `main` 分支的对应 tag 构建。源码安装与二次打包见 [README](https://github.com/cypowerAI/FreeMD#本地开发)。

### SHA256

- `FreeMD-1.0.1-win-x64.exe` — `8ab3a4eb0b3951a42bbf9ee73259d55fa4e1b1eda449979243ffab67a4bc4164`
- `FreeMD-1.0.1-portable-x64.exe` — `9d002312a953c12b8eb5b9a72eb99cb263b5f57efb43b14b2946b9e2d127aca4`
- `FreeMD-1.0.1-linux-x64.deb` — `cc08054f2bd73d03f329d3439d549ced76e0eb78ac7787b74b3ae20b006b47bf`
- `FreeMD-1.0.1-mac-x64.zip` — `cbfa16488e2ef46a08798ef87dc71f379e7393cdabc455dde59c1d7dfd07c65b`
- `FreeMD-1.0.1-mac-arm64.zip` — `7883eae6680b1908004bc2d1302c5458c9b68f98d948cd0e2c157d5885d46711`
