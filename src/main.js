'use strict';

/**
 * FreeMD — Electron main process.
 *
 * Responsibilities: window lifecycle, native menus, dialogs, filesystem access,
 * folder trees, PDF export and persisted settings. The renderer never touches
 * Node APIs directly; everything flows through the whitelisted preload bridge.
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const APP_NAME = 'FreeMD';
const IS_MAC = process.platform === 'darwin';

const MD_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mdx', '.txt'];

const DEFAULT_SETTINGS = {
  theme: 'light',
  view: 'split',
  recent: [],
  lastFile: null,
  previewFontSize: 16,
  showSectionNumbers: true,
  splitRatio: 0.52,
  sidebarWidth: 262,
  bounds: null
};

let mainWindow = null;
let forceClose = false;
let settings = null;
let settingsFile = null;
let pendingOpenPath = null;

/* ------------------------------------------------------------------ settings */

function ensureSettings() {
  if (!settingsFile) settingsFile = path.join(app.getPath('userData'), 'settings.json');
  if (!settings) {
    settings = { ...DEFAULT_SETTINGS };
    try {
      const raw = fs.readFileSync(settingsFile, 'utf8');
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      /* first run — defaults are fine */
    }
  }
  return settings;
}

function persistSettings(patch) {
  ensureSettings();
  if (patch && typeof patch === 'object') settings = { ...settings, ...patch };
  try {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('[settings] write failed:', err.message);
  }
  return settings;
}

/* ---------------------------------------------------------------- window */

function restoreBounds() {
  const saved = ensureSettings().bounds;
  if (!saved || typeof saved.width !== 'number') return { width: 1360, height: 880 };
  // Guard against a monitor that no longer exists.
  const visible = require('electron').screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return (
      saved.x >= a.x - 40 &&
      saved.y >= a.y - 40 &&
      saved.x + saved.width <= a.x + a.width + 80 &&
      saved.y + saved.height <= a.y + a.height + 80
    );
  });
  if (!visible) return { width: saved.width, height: saved.height };
  return { width: saved.width, height: saved.height, x: saved.x, y: saved.y };
}

function createWindow() {
  const bounds = restoreBounds();
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: APP_NAME,
    backgroundColor: ensureSettings().theme === 'dark' ? '#12141a' : '#f6f5f2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Headless capture hook used for documentation screenshots and smoke tests.
  if (process.env.FREEMD_CAPTURE) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 2) console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (process.env.FREEMD_EVAL) {
            const result = await mainWindow.webContents.executeJavaScript(process.env.FREEMD_EVAL, true);
            console.log('[eval]', JSON.stringify(result));
          }
          if (process.env.FREEMD_CAPTURE_SCROLL) {
            await mainWindow.webContents.executeJavaScript(
              `(() => { const s = document.getElementById('previewScroll'); if (s) s.scrollTop = ${Number(
                process.env.FREEMD_CAPTURE_SCROLL
              )}; return true; })()`,
              true
            );
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
          const image = await mainWindow.webContents.capturePage();
          fs.writeFileSync(process.env.FREEMD_CAPTURE, image.toPNG());
          console.log('[capture] saved', process.env.FREEMD_CAPTURE);
        } catch (err) {
          console.error('[capture] failed', err);
        }
        app.quit();
      }, Number(process.env.FREEMD_CAPTURE_DELAY || 5000));
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (pendingOpenPath) {
      mainWindow.webContents.send('open-path', pendingOpenPath);
      pendingOpenPath = null;
    }
  });

  const persistBounds = () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized() || mainWindow.isMaximized()) return;
    persistSettings({ bounds: mainWindow.getBounds() });
  };
  mainWindow.on('resize', debounce(persistBounds, 400));
  mainWindow.on('move', debounce(persistBounds, 400));

  mainWindow.on('close', (event) => {
    if (forceClose) return;
    event.preventDefault();
    mainWindow.webContents.send('request-close');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // External links must never replace the app surface.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      openExternal(url);
    }
  });

  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function openExternal(url) {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) shell.openExternal(url);
  } catch {
    /* ignore malformed urls */
  }
}

/* ------------------------------------------------------------------- menu */

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function buildMenu() {
  const isDev = process.argv.includes('--dev');
  const template = [
    ...(IS_MAC
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: 'about', label: '关于 FreeMD' },
              { type: 'separator' },
              { role: 'services', label: '服务' },
              { type: 'separator' },
              { role: 'hide', label: '隐藏 FreeMD' },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '显示全部' },
              { type: 'separator' },
              { role: 'quit', label: '退出 FreeMD' }
            ]
          }
        ]
      : []),
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: () => send('menu-action', 'new') },
        { label: '打开文件…', accelerator: 'CmdOrCtrl+O', click: () => send('menu-action', 'open') },
        { label: '打开文件夹…', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('menu-action', 'open-folder') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => send('menu-action', 'save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('menu-action', 'save-as') },
        { type: 'separator' },
        { label: '导出 PDF…', accelerator: 'CmdOrCtrl+P', click: () => send('menu-action', 'export-pdf') },
        { type: 'separator' },
        IS_MAC ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        { label: '查找', accelerator: 'CmdOrCtrl+F', click: () => send('menu-action', 'find') }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '仅编辑', accelerator: 'CmdOrCtrl+1', click: () => send('menu-action', 'view-editor') },
        { label: '分栏', accelerator: 'CmdOrCtrl+2', click: () => send('menu-action', 'view-split') },
        { label: '仅阅读', accelerator: 'CmdOrCtrl+3', click: () => send('menu-action', 'view-preview') },
        { type: 'separator' },
        { label: '切换主题', accelerator: 'CmdOrCtrl+Shift+L', click: () => send('menu-action', 'toggle-theme') },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        ...(isDev ? [{ role: 'toggleDevTools', label: '开发者工具' }] : [])
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '项目主页',
          click: () => openExternal('https://github.com/cypowerAI/FreeMD')
        },
        {
          label: 'Markdown 语法参考',
          click: () => openExternal('https://commonmark.org/help/')
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* -------------------------------------------------------------- filesystem */

function normalizeReadPath(input) {
  if (typeof input !== 'string' || !input) throw new Error('无效的文件路径');
  const resolved = path.resolve(input);
  return resolved;
}

async function readDocument(filePath) {
  const abs = normalizeReadPath(filePath);
  const [stat, content] = await Promise.all([fsp.stat(abs), fsp.readFile(abs, 'utf8')]);
  if (stat.isDirectory()) throw new Error('这是一个文件夹');
  return { path: abs, dir: path.dirname(abs), name: path.basename(abs), content, mtimeMs: stat.mtimeMs };
}

async function buildTree(root, depth = 0, budget = { files: 0 }) {
  if (depth > 6 || budget.files > 3000) return [];
  let entries;
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes = [];
  const dirs = entries.filter((e) => e.isDirectory() && !/^\.|^node_modules$/.test(e.name));
  const files = entries.filter((e) => e.isFile() && MD_EXTENSIONS.includes(path.extname(e.name).toLowerCase()));
  dirs.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  files.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  for (const d of dirs) {
    const children = await buildTree(path.join(root, d.name), depth + 1, budget);
    if (children.length) {
      nodes.push({ type: 'dir', name: d.name, path: path.join(root, d.name), children });
    }
  }
  for (const f of files) {
    budget.files += 1;
    if (budget.files > 3000) break;
    nodes.push({ type: 'file', name: f.name, path: path.join(root, f.name) });
  }
  return nodes;
}

/* ------------------------------------------------------------- pdf export */

function readCss(relPath) {
  try {
    return fs.readFileSync(path.join(__dirname, 'renderer', relPath), 'utf8');
  } catch {
    return '';
  }
}

async function exportPdf(payload) {
  const { html, title } = payload || {};
  const suggested = (title || 'document').replace(/[\\/:*?"<>|]+/g, '-');

  // FREEMD_PDF_OUT bypasses the save dialog so the export path can be smoke-tested.
  let filePath = process.env.FREEMD_PDF_OUT || null;
  if (!filePath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出 PDF',
      defaultPath: path.join(app.getPath('documents'), `${suggested}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false };
    filePath = result.filePath;
  }

  const vendorDir = path.join(__dirname, 'renderer', 'vendor');
  const katexCss = readCss('vendor/katex/katex.min.css').replace(
    /url\(fonts\//g,
    `url(${pathToFileURL(path.join(vendorDir, 'katex', 'fonts')).href}/`
  );
  const hljsCss = readCss('vendor/hljs/github.min.css');
  const printCss = readCss('print.css');

  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
    suggested
  )}</title><style>${katexCss}\n${hljsCss}\n${printCss}</style></head><body><article class="markdown-body">${
    html || ''
  }</article></body></html>`;

  const tmpFile = path.join(os.tmpdir(), `freemd-print-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, doc, 'utf8');

  const printer = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false, javascript: true, sandbox: true }
  });
  try {
    await printer.loadFile(tmpFile);
    await printer.webContents.executeJavaScript(
      `Promise.all([
         document.fonts ? document.fonts.ready : Promise.resolve(),
         ...Array.from(document.images).map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; }))
       ]).then(() => true)`,
      true
    );
    const pdf = await printer.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.6, bottom: 0.6, left: 0.65, right: 0.65 },
      preferCSSPageSize: false
    });
    await fsp.writeFile(filePath, pdf);
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    if (!printer.isDestroyed()) printer.destroy();
    fsp.unlink(tmpFile).catch(() => {});
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------------------- ipc */

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    name: APP_NAME,
    platform: process.platform,
    rendererDir: path.join(__dirname, 'renderer'),
    vendorDir: pathToFileURL(path.join(__dirname, 'renderer', 'vendor')).href
  }));

  ipcMain.handle('app:welcome', async () => {
    try {
      return await fsp.readFile(path.join(__dirname, 'renderer', 'welcome.md'), 'utf8');
    } catch {
      return '# FreeMD\n\n欢迎使用 FreeMD。\n';
    }
  });

  ipcMain.handle('settings:get', () => ensureSettings());

  ipcMain.handle('settings:set', (_e, patch) => persistSettings(patch));

  ipcMain.handle('recent:add', (_e, filePath) => {
    ensureSettings();
    const list = settings.recent.filter((item) => item.path !== filePath);
    list.unshift({ path: filePath, name: path.basename(filePath), at: Date.now() });
    const trimmed = list.slice(0, settings.maxRecent || 12);
    return persistSettings({ recent: trimmed, lastFile: filePath }).recent;
  });

  ipcMain.handle('recent:clear', () => persistSettings({ recent: [] }).recent);

  ipcMain.handle('file:open-dialog', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '打开 Markdown 文件',
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'] },
        { name: '纯文本', extensions: ['txt'] },
        { name: '全部文件', extensions: ['*'] }
      ]
    });
    if (res.canceled || !res.filePaths.length) return null;
    return readDocument(res.filePaths[0]);
  });

  ipcMain.handle('file:read', async (_e, filePath) => {
    try {
      return { ok: true, ...(await readDocument(filePath)) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('file:write', async (_e, filePath, content) => {
    try {
      const abs = normalizeReadPath(filePath);
      await fsp.writeFile(abs, content, 'utf8');
      const stat = await fsp.stat(abs);
      return { ok: true, path: abs, mtimeMs: stat.mtimeMs };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('file:save-dialog', async (_e, suggestedName) => {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: '另存为',
      defaultPath: path.join(app.getPath('documents'), suggestedName || 'untitled.md'),
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: '纯文本', extensions: ['txt'] }
      ]
    });
    if (res.canceled || !res.filePath) return null;
    return res.filePath;
  });

  ipcMain.handle('folder:open-dialog', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '打开文件夹',
      properties: ['openDirectory']
    });
    if (res.canceled || !res.filePaths.length) return null;
    const root = res.filePaths[0];
    const children = await buildTree(root);
    return { root, name: path.basename(root) || root, children };
  });

  ipcMain.handle('folder:tree', async (_e, root) => {
    try {
      return { ok: true, root, name: path.basename(root), children: await buildTree(root) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('image:save-pasted', async (_e, dataUrl, docPath) => {
    try {
      const match = /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i.exec(dataUrl || '');
      if (!match) return { ok: false, error: '不支持的图片格式' };
      const ext = match[1].toLowerCase().replace('jpeg', 'jpg');
      const baseDir = docPath ? path.dirname(docPath) : app.getPath('pictures');
      const assetDir = path.join(baseDir, 'assets');
      await fsp.mkdir(assetDir, { recursive: true });
      const name = `image-${Date.now()}.${ext}`;
      await fsp.writeFile(path.join(assetDir, name), Buffer.from(match[2], 'base64'));
      return { ok: true, relative: `assets/${name}`, absolute: path.join(assetDir, name) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('shell:open-external', (_e, url) => openExternal(url));

  ipcMain.handle('shell:show-item', (_e, filePath) => {
    if (typeof filePath === 'string' && filePath) shell.showItemInFolder(filePath);
  });

  ipcMain.handle('dialog:confirm-unsaved', async (_e, name) => {
    const res = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['保存', '不保存', '取消'],
      defaultId: 0,
      cancelId: 2,
      title: '未保存的修改',
      message: `「${name || '未命名文档'}」有未保存的修改`,
      detail: '是否在继续之前保存这些修改？'
    });
    return ['save', 'discard', 'cancel'][res.response];
  });

  ipcMain.handle('export:pdf', async (_e, payload) => exportPdf(payload));

  ipcMain.handle('window:close-confirmed', () => {
    forceClose = true;
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('window:set-title', (_e, title) => {
    if (mainWindow) mainWindow.setTitle(title ? `${title} — ${APP_NAME}` : APP_NAME);
  });
}

/* ------------------------------------------------------------- app startup */

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const fileArg = argv.find((arg) => MD_EXTENSIONS.includes(path.extname(arg).toLowerCase()));
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (fileArg) send('open-path', path.resolve(fileArg));
    }
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow) send('open-path', filePath);
    else pendingOpenPath = filePath;
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('ai.cypowerai.freemd');
    ensureSettings();
    registerIpc();
    buildMenu();
    createWindow();

    const fileArg = process.argv.find((arg) => {
      if (process.argv.indexOf(arg) <= 1 && process.platform === 'darwin') return false;
      return MD_EXTENSIONS.includes(path.extname(arg || '').toLowerCase());
    });
    if (fileArg) pendingOpenPath = path.resolve(fileArg);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!IS_MAC) app.quit();
  });

  app.on('before-quit', () => {
    forceClose = true;
  });
}
