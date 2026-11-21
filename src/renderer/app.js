'use strict';

/**
 * FreeMD renderer — application shell, editor wiring, outline navigation.
 */

(function () {
  const api = window.freemd;
  const MD = window.FreeMDMarkdown;

  const $ = (id) => document.getElementById(id);

  const els = {
    app: $('app'),
    sidebar: $('sidebar'),
    workspace: $('workspace'),
    editorPane: $('editorPane'),
    previewPane: $('previewPane'),
    divider: $('divider'),
    preview: $('preview'),
    previewScroll: $('previewScroll'),
    previewTop: document.querySelector('.preview-top'),
    docTitle: $('docTitle'),
    docPath: $('docPath'),
    dirtyFlag: $('dirtyFlag'),
    outlineList: $('outlineList'),
    outlineEmpty: $('outlineEmpty'),
    outlineSearch: $('outlineSearch'),
    fileTree: $('fileTree'),
    fileTreeEmpty: $('fileTreeEmpty'),
    recentList: $('recentList'),
    versionLabel: $('versionLabel'),
    statSections: $('statSections'),
    statImages: $('statImages'),
    statMath: $('statMath'),
    statDiagrams: $('statDiagrams'),
    statWords: $('statWords'),
    statCursor: $('statCursor'),
    findBox: $('findBox'),
    findInput: $('findInput'),
    findCount: $('findCount'),
    lightbox: $('lightbox'),
    lightboxImg: $('lightboxImg'),
    toast: $('toast'),
    hljsTheme: $('hljsTheme')
  };

  const NEW_DOC_TEMPLATE = [
    '# 未命名文档',
    '',
    '在左侧编辑，右侧即时预览。',
    '',
    '## 章节一',
    '',
    '从这里开始书写。',
    ''
  ].join('\n');

  const state = {
    filePath: null,
    docDir: '',
    savedContent: '',
    dirty: false,
    settings: {},
    outline: [],
    headingEls: [],
    activeIndex: -1,
    stats: { math: 0, mermaid: 0 },
    folderRoot: null,
    folderTree: null,
    recent: [],
    find: { open: false, query: '', hits: [], index: 0 },
    syncUntil: 0,
    renderTimer: null,
    dragging: null
  };

  let cm = null;

  /* ------------------------------------------------------------ utilities */

  function dirOf(filePath) {
    if (!filePath) return '';
    const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return index >= 0 ? filePath.slice(0, index) : '';
  }

  function baseName(filePath) {
    if (!filePath) return '';
    const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return index >= 0 ? filePath.slice(index + 1) : filePath;
  }

  function stemName(filePath) {
    const base = baseName(filePath);
    return base.replace(/\.(md|markdown|mdown|mkd|mdx|txt)$/i, '') || base;
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  let toastTimer = null;
  function toast(message, duration = 2200) {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), duration);
  }

  function applySettingsCache(patch) {
    state.settings = { ...state.settings, ...patch };
  }

  function persist(patch) {
    applySettingsCache(patch);
    api.setSettings(patch);
  }

  /* ------------------------------------------------------------- editor */

  function initEditor() {
    cm = window.CodeMirror(document.getElementById('editor'), {
      value: '',
      mode: 'gfm',
      theme: 'freemd',
      lineNumbers: true,
      lineWrapping: true,
      indentUnit: 2,
      tabSize: 2,
      styleActiveLine: false,
      matchBrackets: true,
      autoCloseBrackets: true,
      scrollbarStyle: 'native',
      viewportMargin: 12,
      extraKeys: {
        Tab: (instance) => {
          if (instance.somethingSelected()) instance.indentSelection('add');
          else instance.replaceSelection('  ', 'end');
        }
      }
    });

    cm.on('change', () => {
      if (state.pendingSet) return;
      updateDirty();
      scheduleRender();
    });

    cm.on('cursorActivity', updateCursorStatus);

    cm.on('scroll', () => {
      syncScroll(cm.getScrollerElement(), els.previewScroll);
    });

    cm.on('focus', () => document.body.classList.add('editor-focus'));
    cm.on('blur', () => document.body.classList.remove('editor-focus'));
  }

  function insertAtCursor(text) {
    const cursor = cm.getCursor();
    cm.replaceRange(text, cursor, cursor, '+freemd');
    cm.focus();
  }

  function wrapSelection(prefix, suffix, placeholder) {
    const selection = cm.getSelection() || placeholder || '';
    cm.replaceSelection(prefix + selection + suffix, 'around');
    if (!cm.getSelection().length) {
      const cursor = cm.getCursor();
      cm.setCursor({ line: cursor.line, ch: cursor.ch - suffix.length });
    }
    cm.focus();
  }

  function prefixLines(prefix) {
    const from = cm.getCursor('from');
    const to = cm.getCursor('to');
    if (from.line === to.line) {
      cm.replaceRange(prefix, { line: from.line, ch: 0 });
    } else {
      for (let line = from.line; line <= to.line; line += 1) {
        cm.replaceRange(prefix, { line, ch: 0 });
      }
    }
    cm.focus();
  }

  function handleFormat(format) {
    if (!cm) return;
    switch (format) {
      case 'h1':
        prefixLines('# ');
        break;
      case 'h2':
        prefixLines('## ');
        break;
      case 'bold':
        wrapSelection('**', '**', '加粗文本');
        break;
      case 'italic':
        wrapSelection('*', '*', '斜体文本');
        break;
      case 'code':
        wrapSelection('`', '`', '代码');
        break;
      case 'quote':
        prefixLines('> ');
        break;
      case 'list':
        prefixLines('- ');
        break;
      case 'link':
        wrapSelection('[', '](https://)', '链接文字');
        break;
      case 'image':
        wrapSelection('![', '](assets/image.png)', '图片描述');
        break;
      case 'math':
        wrapSelection('$$', '$$', 'E = mc^2');
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------- render */

  function scheduleRender() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(renderPreview, 150);
  }

  function renderPreview() {
    if (!cm) return;
    const source = cm.getValue();
    const result = MD.render(source, { docDir: state.docDir });

    els.preview.innerHTML = result.html;
    state.outline = buildOutline(result.headings);
    state.stats.math = result.stats.math;
    state.stats.mermaid = result.stats.mermaid || 0;
    state.headingEls = Array.from(els.preview.querySelectorAll('.sec-heading'));

    decoratePreview();
    void renderMermaidDiagrams();
    renderOutline();

    if (state.find.open) runFind(state.find.query, true, true);
    updateStats();
  }

  function buildOutline(headings) {
    if (!headings.length) return [];
    const baseLevel = Math.min(...headings.map((h) => h.level));
    const counters = [0, 0, 0, 0, 0, 0];
    const entries = headings.map((heading) => {
      const level = Math.max(1, heading.level - baseLevel + 1);
      counters[level - 1] += 1;
      for (let i = level; i < counters.length; i += 1) counters[i] = 0;
      const numbers = counters.slice(0, level).filter((n) => n > 0);
      return {
        ...heading,
        displayLevel: level,
        no: numbers.join('.'),
        children: 0
      };
    });
    return entries;
  }

  function renderOutline() {
    const filter = (els.outlineSearch.value || '').trim().toLowerCase();
    els.outlineList.innerHTML = '';
    const entries = state.outline.filter((item) => !filter || item.text.toLowerCase().includes(filter));

    els.outlineEmpty.hidden = entries.length > 0;
    if (!entries.length) {
      els.outlineEmpty.textContent = state.outline.length ? '没有匹配的章节' : '未识别到章节结构';
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const entry of state.outline) {
      if (filter && !entry.text.toLowerCase().includes(filter)) continue;
      const button = document.createElement('button');
      button.className = `outline-item level-${entry.displayLevel}`;
      button.style.setProperty('--indent', `${(entry.displayLevel - 1) * 12}px`);
      button.dataset.id = entry.id;
      button.title = entry.text;
      button.innerHTML =
        `<span class="outline-no">${entry.no}</span>` +
        `<span class="outline-text">${MD.escapeHtml(entry.text || '（无标题）')}</span>` +
        (entry.auto ? '<span class="outline-badge">识别</span>' : '');
      button.addEventListener('click', () => jumpToSection(entry.id));
      fragment.appendChild(button);
    }
    els.outlineList.appendChild(fragment);
    if (state.activeIndex >= 0) {
      const current = state.outline[state.activeIndex];
      if (current) setActiveOutline(current.id);
    }
  }

  function jumpToSection(id) {
    const target = els.preview.querySelector(`#${CSS.escape(id)}`);
    if (!target) return;
    const top = target.getBoundingClientRect().top - els.previewScroll.getBoundingClientRect().top + els.previewScroll.scrollTop;
    els.previewScroll.scrollTo({ top: Math.max(0, top - 20), behavior: 'smooth' });
  }

  function decoratePreview() {
    // Section numbering
    if (state.settings.showSectionNumbers !== false) {
      for (const entry of state.outline) {
        if (entry.displayLevel > 3) continue;
        const heading = els.preview.querySelector(`#${CSS.escape(entry.id)}`);
        if (!heading || heading.querySelector('.sec-no')) continue;
        const span = document.createElement('span');
        span.className = 'sec-no';
        span.textContent = entry.no;
        heading.insertBefore(span, heading.firstChild);
      }
    }

    // Code block copy buttons
    els.preview.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.code-copy')) return;
      const button = document.createElement('button');
      button.className = 'code-copy';
      button.textContent = '复制';
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const code = pre.querySelector('code');
        try {
          await navigator.clipboard.writeText(code ? code.innerText : pre.innerText);
          button.textContent = '已复制';
          setTimeout(() => (button.textContent = '复制'), 1200);
        } catch {
          toast('复制失败');
        }
      });
      pre.appendChild(button);
    });

    // Wide tables scroll horizontally inside their own container
    els.preview.querySelectorAll('table').forEach((table) => {
      const parent = table.parentElement;
      if (parent && parent.classList && parent.classList.contains('table-scroll')) return;
      const wrap = document.createElement('div');
      wrap.className = 'table-scroll';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });

    // Images: lazy loading + inline detection + lightbox
    els.preview.querySelectorAll('img').forEach((img) => {
      img.loading = 'lazy';
      img.decoding = 'async';
      const parent = img.parentElement;
      if (parent && parent.tagName === 'P' && parent.textContent.trim().length > 0) {
        img.classList.add('inline-img');
      }
      img.addEventListener('click', () => openLightbox(img.src));
      img.addEventListener('error', () => {
        img.alt = img.alt || '图片加载失败';
        img.classList.add('broken');
      });
    });

    // Task list checkboxes
    els.preview.querySelectorAll('li').forEach((li) => {
      const first = li.firstChild;
      if (!first || first.nodeType !== Node.TEXT_NODE) return;
      const match = /^\s*\[([ xX])\]\s+/.exec(first.nodeValue);
      if (!match) return;
      li.classList.add('task-item');
      if (match[1].toLowerCase() === 'x') li.classList.add('is-checked');
      first.nodeValue = first.nodeValue.replace(match[0], '');
      const box = document.createElement('span');
      box.className = 'task-box';
      li.insertBefore(box, li.firstChild);
      const rest = document.createElement('span');
      rest.className = 'task-text';
      while (li.childNodes.length > 1) rest.appendChild(li.childNodes[1]);
      li.appendChild(rest);
    });
  }

  /* -------------------------------------------------------- mermaid */

  let mermaidSeq = 0;
  let mermaidRunning = false;
  let mermaidPending = false;
  // key = 主题 + 源码，编辑时未改动的图直接复用上一轮 SVG，避免每敲一次键就重排一遍。
  const mermaidCache = new Map();

  function mermaidThemeName() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function parseHex(color) {
    const value = color.replace('#', '');
    if (value.length !== 6) return null;
    return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  }

  /** 把 accent 按给定比例混进底色，得到同一色系的浅色面。 */
  function tint(color, base, ratio) {
    const a = parseHex(color);
    const b = parseHex(base);
    if (!a || !b) return base;
    const mixed = a.map((channel, index) => Math.round(channel * ratio + b[index] * (1 - ratio)));
    return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }

  function mermaidConfig(themeOverride) {
    const dark = (themeOverride || document.documentElement.dataset.theme) === 'dark';
    const accent = cssVar('--accent', dark ? '#45cdb2' : '#0d7a6a');
    const accentInk = cssVar('--accent-ink', accent);
    const ink = cssVar('--ink', dark ? '#e5e8ec' : '#1a1b1e');
    const inkSoft = cssVar('--ink-soft', ink);
    const paper = cssVar('--paper', dark ? '#14171c' : '#fffdf9');
    const surface = cssVar('--surface', paper);
    const line = cssVar('--line', '#ddddd5');

    return {
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: getComputedStyle(document.body).fontFamily || 'sans-serif',
      themeVariables: {
        darkMode: dark,
        background: paper,
        primaryColor: tint(accent, paper, dark ? 0.16 : 0.1),
        primaryBorderColor: accent,
        primaryTextColor: ink,
        secondaryColor: tint(accent, paper, dark ? 0.1 : 0.06),
        secondaryBorderColor: accent,
        secondaryTextColor: ink,
        tertiaryColor: surface,
        tertiaryBorderColor: line,
        tertiaryTextColor: inkSoft,
        mainBkg: tint(accent, paper, dark ? 0.16 : 0.1),
        nodeBorder: accent,
        nodeTextColor: ink,
        clusterBkg: tint(accent, paper, dark ? 0.08 : 0.04),
        clusterBorder: line,
        lineColor: dark ? accent : accentInk,
        textColor: ink,
        edgeLabelBackground: paper,
        titleColor: ink,
        noteBkgColor: tint(accent, paper, dark ? 0.12 : 0.08),
        noteBorderColor: accent,
        noteTextColor: ink,
        actorBkg: tint(accent, paper, dark ? 0.16 : 0.1),
        actorBorder: accent,
        actorTextColor: ink,
        actorLineColor: accentInk,
        signalColor: accentInk,
        signalTextColor: ink,
        activationBkgColor: tint(accent, paper, dark ? 0.2 : 0.14),
        activationBorderColor: accent,
        labelBoxBkgColor: tint(accent, paper, dark ? 0.16 : 0.1),
        labelBoxBorderColor: accent,
        labelTextColor: ink,
        loopTextColor: ink,
        fontSize: '14px'
      },
      flowchart: { htmlLabels: false, curve: 'basis', useMaxWidth: true },
      sequence: { useMaxWidth: true },
      gantt: { useMaxWidth: true }
    };
  }

  function mermaidBlockOf(node) {
    return node.closest ? node.closest('.mermaid-block') : null;
  }

  /** 取亮色主题下的配置：颜色 token 挂在 :root 上，只能临时切一下再读回。 */
  function lightMermaidConfig() {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    const flip = previous === 'dark';
    if (flip) root.dataset.theme = 'light';
    const config = mermaidConfig('light');
    if (flip) root.dataset.theme = previous;
    return config;
  }

  function markMermaidError(node, source, error) {
    node.classList.add('is-error');
    const block = mermaidBlockOf(node);
    if (block) block.classList.add('is-error');
    node.dataset.rendered = 'error';
    const message = String((error && (error.str || error.message)) || '语法解析失败').split('\n')[0];
    node.innerHTML =
      `<pre class="mermaid-source"><code>${MD.escapeHtml(source)}</code></pre>` +
      `<p class="mermaid-error">图表渲染失败：${MD.escapeHtml(message)}</p>`;
  }

  /**
   * 把 .mermaid 节点里的源码交给 Mermaid 渲染成 SVG。
   * 源码保存在 dataset.src 上，切换主题时用它重新绘制。
   */
  async function renderMermaidDiagrams() {
    const nodes = Array.from(els.preview.querySelectorAll('.mermaid'));
    if (!nodes.length) return;

    const api = window.mermaid;
    if (!api) {
      nodes.forEach((node) => markMermaidError(node, node.textContent, new Error('Mermaid 资源未加载')));
      return;
    }

    if (mermaidRunning) {
      mermaidPending = true;
      return;
    }
    mermaidRunning = true;

    try {
      const themeKey = mermaidThemeName();
      api.initialize(mermaidConfig());
      for (const node of nodes) {
        if (node.dataset.rendered === '1') continue;
        const source = node.dataset.src != null ? node.dataset.src : node.textContent;
        node.dataset.src = source;
        const code = source.trim();
        if (!code) continue;
        const cacheKey = `${themeKey}\u0000${code}`;
        const cached = mermaidCache.get(cacheKey);
        if (cached) {
          node.innerHTML = cached;
          node.dataset.rendered = '1';
          node.classList.remove('is-error');
          const block = mermaidBlockOf(node);
          if (block) block.classList.remove('is-error');
          continue;
        }
        const id = `freemd-mermaid-${mermaidSeq++}`;
        try {
          const result = await api.render(id, code);
          node.innerHTML = result.svg;
          node.dataset.rendered = '1';
          node.classList.remove('is-error');
          const block = mermaidBlockOf(node);
          if (block) block.classList.remove('is-error');
          if (mermaidCache.size > 120) mermaidCache.clear();
          mermaidCache.set(cacheKey, result.svg);
        } catch (error) {
          markMermaidError(node, source, error);
        }
      }
    } finally {
      mermaidRunning = false;
      if (mermaidPending) {
        mermaidPending = false;
        void renderMermaidDiagrams();
      }
    }
  }

  function rerenderMermaid() {
    const nodes = els.preview.querySelectorAll('.mermaid');
    if (!nodes.length) return;
    nodes.forEach((node) => {
      if (!node.classList.contains('is-error') && node.dataset.src == null) return;
      if (node.dataset.src != null) node.textContent = node.dataset.src;
      delete node.dataset.rendered;
    });
    void renderMermaidDiagrams();
  }

  function updateStats() {
    const wordCount = countWords(cm ? cm.getValue() : '');
    els.statSections.innerHTML = `<em>${state.outline.length}</em> 章节`;
    els.statImages.innerHTML = `<em>${els.preview.querySelectorAll('img').length}</em> 图片`;
    els.statMath.innerHTML = `<em>${state.stats.math || 0}</em> 公式`;
    els.statDiagrams.hidden = !state.stats.mermaid;
    els.statDiagrams.innerHTML = `<em>${state.stats.mermaid || 0}</em> 图表`;
    els.statWords.innerHTML = `<em>${wordCount}</em> 字`;
  }

  function countWords(text) {
    if (!text) return 0;
    const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    const latin = text
      .replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ')
      .match(/[A-Za-z0-9][A-Za-z0-9'_-]*/g);
    return cjk + (latin ? latin.length : 0);
  }

  function updateCursorStatus() {
    if (!cm) return;
    const cursor = cm.getCursor();
    els.statCursor.textContent = `行 ${cursor.line + 1} · 列 ${cursor.ch + 1}`;
  }

  /* -------------------------------------------------------- scroll sync */

  function syncScroll(from, to) {
    if (!from || !to) return;
    if (performance.now() < state.syncUntil) return;
    state.syncUntil = performance.now() + 140;
    const fromRange = from.scrollHeight - from.clientHeight;
    const toRange = to.scrollHeight - to.clientHeight;
    if (fromRange <= 0 || toRange <= 0) return;
    const ratio = from.scrollTop / fromRange;
    to.scrollTop = ratio * toRange;
  }

  function updateActiveSection() {
    if (!state.headingEls.length) {
      if (state.activeIndex !== -1) {
        state.activeIndex = -1;
        setActiveOutline(null);
      }
      return;
    }
    const scrollerTop = els.previewScroll.getBoundingClientRect().top;
    const marker = scrollerTop + 90;
    let index = 0;
    for (let i = 0; i < state.headingEls.length; i += 1) {
      const rect = state.headingEls[i].getBoundingClientRect();
      if (rect.top <= marker) index = i;
      else break;
    }
    // The last heading can only be "active" when the reader is at the very bottom.
    if (els.previewScroll.scrollTop + els.previewScroll.clientHeight >= els.previewScroll.scrollHeight - 2) {
      index = state.headingEls.length - 1;
    }
    if (index === state.activeIndex) return;
    state.activeIndex = index;
    const entry = state.outline[index];
    setActiveOutline(entry ? entry.id : null);
  }

  function setActiveOutline(id) {
    els.outlineList.querySelectorAll('.outline-item').forEach((item) => {
      const isActive = id ? item.dataset.id === id : false;
      item.classList.toggle('is-active', isActive);
      if (isActive && item.scrollIntoView) {
        const rect = item.getBoundingClientRect();
        const parentRect = els.outlineList.getBoundingClientRect();
        if (rect.top < parentRect.top || rect.bottom > parentRect.bottom) {
          item.scrollIntoView({ block: 'nearest' });
        }
      }
    });
  }

  /* --------------------------------------------------------------- files */

  function setDocHeader() {
    const title = state.filePath ? stemName(state.filePath) : firstHeading() || '未命名';
    els.docTitle.textContent = title;
    els.docPath.textContent = state.filePath || '未保存到磁盘';
    els.docPath.title = state.filePath || '';
    api.setTitle(title);
  }

  function firstHeading() {
    if (!cm) return '';
    const match = /^#\s+([^\n]+)/m.exec(cm.getValue());
    return match ? MD.stripInlineMarkup(match[1]) : '';
  }

  function updateDirty() {
    if (!cm) return;
    const value = cm.getValue();
    const dirty = value !== state.savedContent;
    if (dirty === state.dirty) return;
    state.dirty = dirty;
    updateSaveState();
  }

  function updateSaveState() {
    const label = state.dirty ? '未保存' : state.filePath ? '已保存' : '新建文档';
    els.dirtyFlag.textContent = label;
    els.dirtyFlag.classList.toggle('is-dirty', state.dirty);
    els.dirtyFlag.classList.toggle('is-saved', !state.dirty && Boolean(state.filePath));
  }

  function applyDocument(doc) {
    state.pendingSet = true;
    state.filePath = doc.path || null;
    state.docDir = doc.dir || (doc.path ? dirOf(doc.path) : '');
    state.savedContent = doc.content || '';
    cm.setValue(doc.content || '');
    state.pendingSet = false;
    cm.clearHistory();
    cm.setCursor({ line: 0, ch: 0 });
    state.dirty = false;
    updateSaveState();
    setDocHeader();
    renderPreview();
    els.previewScroll.scrollTop = 0;
    updateCursorStatus();
    if (doc.path) {
      api.addRecent(doc.path).then((list) => {
        state.recent = list || [];
        renderRecent();
      });
      markTreeCurrent();
    } else {
      markTreeCurrent();
    }
  }

  async function confirmDiscard() {
    if (!state.dirty) return true;
    const choice = await api.confirmUnsaved(state.filePath ? stemName(state.filePath) : '未命名文档');
    if (choice === 'cancel' || !choice) return false;
    if (choice === 'save') return await saveDocument();
    return true;
  }

  async function newDocument() {
    if (!(await confirmDiscard())) return;
    applyDocument({ path: null, content: NEW_DOC_TEMPLATE, dir: '' });
    cm.focus();
  }

  async function openDocument(filePath) {
    if (!filePath) return;
    if (!(await confirmDiscard())) return;
    const res = await api.readFile(filePath);
    if (!res.ok) {
      toast(`打开失败：${res.error || '未知错误'}`);
      return;
    }
    applyDocument(res);
    toast(`已打开 ${res.name}`);
  }

  async function openViaDialog() {
    if (!(await confirmDiscard())) return;
    const doc = await api.openDialog();
    if (!doc) return;
    applyDocument(doc);
  }

  async function saveDocument(options) {
    if (!cm) return false;
    let target = state.filePath;
    if (!target || (options && options.saveAs)) {
      const suggested = `${stemName(state.filePath) || firstHeading() || 'untitled'}.md`;
      target = await api.saveDialog(suggested);
      if (!target) return false;
    }
    const content = cm.getValue();
    const res = await api.writeFile(target, content);
    if (!res.ok) {
      toast(`保存失败：${res.error}`);
      return false;
    }
    const previousDir = state.docDir;
    state.filePath = res.path;
    state.docDir = dirOf(res.path);
    state.savedContent = content;
    state.dirty = false;
    updateSaveState();
    setDocHeader();
    if (previousDir !== state.docDir) renderPreview(); // image paths may change
    api.addRecent(res.path).then((list) => {
      state.recent = list || [];
      renderRecent();
    });
    toast('已保存');
    return true;
  }

  /**
   * 打印底永远是白纸，暗色主题下直接导出会得到浅字深底的图，
   * 所以导出前在副本里按亮色主题重画一遍 Mermaid。
   */
  async function previewHtmlForPrint() {
    const dark = document.documentElement.dataset.theme === 'dark';
    const api = window.mermaid;
    if (!dark || !api) return els.preview.innerHTML;

    const srcNodes = Array.from(els.preview.querySelectorAll('.mermaid'));
    if (!srcNodes.length) return els.preview.innerHTML;

    const clone = els.preview.cloneNode(true);
    const dstNodes = Array.from(clone.querySelectorAll('.mermaid'));
    api.initialize(lightMermaidConfig());
    try {
      for (let index = 0; index < dstNodes.length; index += 1) {
        const node = srcNodes[index];
        const source = (node.dataset.src != null ? node.dataset.src : node.textContent).trim();
        if (!source) continue;
        try {
          const result = await api.render(`freemd-print-${Date.now()}-${index}`, source);
          dstNodes[index].innerHTML = result.svg;
          const block = mermaidBlockOf(dstNodes[index]);
          if (block) block.classList.remove('is-error');
        } catch (error) {
          /* 渲染失败时保留克隆里的源码回退样式 */
          console.warn('mermaid print render failed', String((error && error.message) || error));
        }
      }
    } finally {
      api.initialize(mermaidConfig());
    }
    return clone.innerHTML;
  }

  async function exportPdf() {
    const title = state.filePath ? stemName(state.filePath) : firstHeading() || 'FreeMD 文档';
    toast('正在生成 PDF…', 1400);
    const html = await previewHtmlForPrint();
    const res = await api.exportPdf({ html, title });
    if (res && res.ok) toast(`PDF 已导出：${baseName(res.path)}`);
    else if (res && res.error) toast(`导出失败：${res.error}`);
  }

  /* ----------------------------------------------------------- folder tree */

  async function openFolder() {
    const tree = await api.openFolderDialog();
    if (!tree) return;
    state.folderRoot = tree.root;
    state.folderTree = tree;
    renderTree();
    if (state.folderRoot) persist({ lastFolder: state.folderRoot });
  }

  function renderTree() {
    els.fileTree.innerHTML = '';
    els.fileTreeEmpty.hidden = Boolean(state.folderTree);
    if (!state.folderTree) return;

    const root = document.createElement('div');
    root.className = 'tree-root';
    root.textContent = state.folderTree.name || state.folderRoot;
    root.title = state.folderRoot;
    els.fileTree.appendChild(root);
    els.fileTree.appendChild(renderTreeNodes(state.folderTree.children, 0));
    markTreeCurrent();
  }

  function renderTreeNodes(nodes, depth) {
    const fragment = document.createDocumentFragment();
    for (const node of nodes || []) {
      if (node.type === 'dir') {
        const group = document.createElement('div');
        group.className = 'tree-group';
        const row = document.createElement('button');
        row.className = 'tree-row tree-dir';
        row.style.setProperty('--indent', `${depth * 12 + 4}px`);
        row.innerHTML = `<span class="tree-icon">${iconFolder()}</span><span class="tree-name">${MD.escapeHtml(
          node.name
        )}</span>`;
        const children = document.createElement('div');
        children.appendChild(renderTreeNodes(node.children, depth + 1));
        row.addEventListener('click', () => {
          children.hidden = !children.hidden;
          row.classList.toggle('is-collapsed', children.hidden);
        });
        group.appendChild(row);
        group.appendChild(children);
        fragment.appendChild(group);
      } else {
        const row = document.createElement('button');
        row.className = 'tree-row tree-file';
        row.style.setProperty('--indent', `${depth * 12 + 4}px`);
        row.dataset.path = node.path;
        row.innerHTML = `<span class="tree-icon">${iconFile()}</span><span class="tree-name">${MD.escapeHtml(
          node.name
        )}</span>`;
        row.addEventListener('click', () => openDocument(node.path));
        fragment.appendChild(row);
      }
    }
    return fragment;
  }

  function iconFolder() {
    return '<svg viewBox="0 0 16 16"><path d="M2 4.2c0-.6.5-1.1 1.1-1.1h2.7l1.3 1.5h5.3c.6 0 1.1.5 1.1 1.1v6.2c0 .6-.5 1.1-1.1 1.1H3.1c-.6 0-1.1-.5-1.1-1.1V4.2Z"/></svg>';
  }

  function iconFile() {
    return '<svg viewBox="0 0 16 16"><path d="M4 1.8h5l3.2 3.2v9.2c0 .4-.4.8-.9.8H4.9c-.5 0-.9-.4-.9-.8V2.6c0-.4.4-.8.9-.8Z"/><path d="M9 2v3.2h3"/></svg>';
  }

  function markTreeCurrent() {
    els.fileTree.querySelectorAll('.tree-file').forEach((row) => {
      row.classList.toggle('is-current', row.dataset.path === state.filePath);
    });
  }

  /* --------------------------------------------------------------- recent */

  function renderRecent() {
    els.recentList.innerHTML = '';
    if (!state.recent.length) {
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = '还没有打开过文档';
      els.recentList.appendChild(hint);
      return;
    }
    for (const item of state.recent) {
      const row = document.createElement('button');
      row.className = 'recent-row';
      row.innerHTML = `<span class="r-name">${MD.escapeHtml(item.name || baseName(item.path))}</span><span class="r-path">${MD.escapeHtml(
        item.path
      )}</span>`;
      row.title = item.path;
      row.addEventListener('click', () => openDocument(item.path));
      els.recentList.appendChild(row);
    }
  }

  /* ----------------------------------------------------------------- find */

  function openFind() {
    state.find.open = true;
    els.findBox.hidden = false;
    els.findInput.focus();
    els.findInput.select();
  }

  function closeFind() {
    state.find.open = false;
    els.findBox.hidden = true;
    clearHighlights();
    els.findCount.textContent = '0/0';
  }

  function clearHighlights() {
    els.preview.querySelectorAll('mark.find-hit').forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
    state.find.hits = [];
  }

  function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentNode;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (/^(SCRIPT|STYLE|MARK|TEXTAREA)$/.test(parent.nodeName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest && parent.closest('.code-copy')) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function runFind(query, keepIndex, silent) {
    state.find.query = query || '';
    clearHighlights();
    if (!state.find.query) {
      els.findCount.textContent = '0/0';
      return;
    }
    const regex = new RegExp(escapeRegExp(state.find.query), 'gi');
    const nodes = collectTextNodes(els.preview);
    const hits = [];

    for (const node of nodes) {
      const text = node.nodeValue;
      regex.lastIndex = 0;
      if (!regex.test(text)) continue;
      regex.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, match.index)));
        const mark = document.createElement('mark');
        mark.className = 'find-hit';
        mark.textContent = match[0];
        fragment.appendChild(mark);
        hits.push(mark);
        cursor = match.index + match[0].length;
        if (match[0].length === 0) regex.lastIndex += 1;
      }
      if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
      node.parentNode.replaceChild(fragment, node);
    }

    state.find.hits = hits;
    if (!keepIndex) state.find.index = 0;
    if (state.find.index >= hits.length) state.find.index = 0;
    updateFindState(!silent);
  }

  function updateFindState(scroll) {
    const total = state.find.hits.length;
    els.findCount.textContent = `${total ? state.find.index + 1 : 0}/${total}`;
    state.find.hits.forEach((mark, index) => mark.classList.toggle('is-current', index === state.find.index));
    if (total && scroll) {
      state.find.hits[state.find.index].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function stepFind(delta) {
    const total = state.find.hits.length;
    if (!total) return;
    state.find.index = (state.find.index + delta + total) % total;
    updateFindState(true);
  }

  /* ------------------------------------------------------------- lightbox */

  let lightboxScale = 1;

  function openLightbox(src) {
    if (!src) return;
    lightboxScale = 1;
    els.lightboxImg.style.transform = 'scale(1)';
    els.lightboxImg.src = src;
    els.lightbox.hidden = false;
  }

  function closeLightbox() {
    els.lightbox.hidden = true;
    els.lightboxImg.src = '';
  }

  /* ------------------------------------------------------------------ ui */

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    els.hljsTheme.href = theme === 'dark' ? 'vendor/hljs/github-dark.min.css' : 'vendor/hljs/github.min.css';
    persist({ theme });
    if (cm) cm.refresh();
    rerenderMermaid();
  }

  function setView(view) {
    els.workspace.dataset.view = view;
    document.querySelectorAll('#viewSwitch button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.view === view);
    });
    persist({ view });
    if (cm) setTimeout(() => cm.refresh(), 30);
  }

  function setSplitRatio(ratio) {
    const clamped = Math.min(0.78, Math.max(0.22, ratio));
    els.workspace.style.setProperty('--split', `${clamped * 100}%`);
    persist({ splitRatio: clamped });
  }

  function applyPreviewFontSize(size) {
    const value = Number(size) || 16;
    els.preview.style.fontSize = `${value}px`;
  }

  function bindUi() {
    document.querySelectorAll('.side-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.side-tab').forEach((item) => item.classList.toggle('is-active', item === tab));
        document.querySelectorAll('.side-panel').forEach((panel) => {
          panel.classList.toggle('is-active', panel.id === `panel-${tab.dataset.panel}`);
        });
      });
    });

    document.querySelectorAll('#viewSwitch button').forEach((button) => {
      button.addEventListener('click', () => setView(button.dataset.view));
    });

    document.querySelectorAll('.format-bar button').forEach((button) => {
      button.addEventListener('click', () => handleFormat(button.dataset.format));
    });

    $('saveBtn').addEventListener('click', () => saveDocument());
    $('exportBtn').addEventListener('click', exportPdf);
    $('openBtn').addEventListener('click', openViaDialog);
    $('openFolderBtn').addEventListener('click', openFolder);
    $('themeBtn').addEventListener('click', () => {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    $('clearRecentBtn').addEventListener('click', async () => {
      const list = await api.clearRecent();
      state.recent = list || [];
      renderRecent();
      toast('已清空最近记录');
    });

    els.outlineSearch.addEventListener('input', renderOutline);
    els.findInput.addEventListener('input', () => runFind(els.findInput.value, false));
    els.findInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        stepFind(event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape') {
        closeFind();
      }
    });
    $('findPrev').addEventListener('click', () => stepFind(-1));
    $('findNext').addEventListener('click', () => stepFind(1));
    $('findClose').addEventListener('click', closeFind);

    els.previewScroll.addEventListener('scroll', () => {
      syncScroll(els.previewScroll, cm.getScrollerElement());
      updateActiveSection();
    });

    els.preview.addEventListener('click', (event) => {
      const link = event.target.closest('a');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      event.preventDefault();
      if (href.startsWith('#')) {
        const id = href.slice(1);
        if (id) jumpToSection(id);
        return;
      }
      if (/^(https?:|mailto:)/i.test(href)) {
        api.openExternal(href);
        return;
      }
      if (link.dataset.external === 'true') {
        api.openExternal(href);
        return;
      }
      // Relative link — try to open it as a document next to the current file.
      if (!state.docDir) {
        toast('相对链接需要一个已保存的文档作为参照');
        return;
      }
      const resolved = MD.joinPath(state.docDir, decodeSafe(href));
      openDocument(resolved);
    });

    els.lightbox.addEventListener('click', closeLightbox);
    els.lightbox.addEventListener('wheel', (event) => {
      event.preventDefault();
      lightboxScale = Math.min(4, Math.max(0.5, lightboxScale - Math.sign(event.deltaY) * 0.12));
      els.lightboxImg.style.transform = `scale(${lightboxScale})`;
    }, { passive: false });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (!els.lightbox.hidden) closeLightbox();
        else if (state.find.open) closeFind();
      }
    });

    // Divider drag (editor / preview split)
    els.divider.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      els.divider.setPointerCapture(event.pointerId);
      els.divider.classList.add('is-dragging');
      state.dragging = 'split';
    });
    els.divider.addEventListener('pointermove', (event) => {
      if (state.dragging !== 'split') return;
      const rect = els.workspace.getBoundingClientRect();
      setSplitRatio((event.clientX - rect.left) / rect.width);
    });
    els.divider.addEventListener('pointerup', () => {
      state.dragging = null;
      els.divider.classList.remove('is-dragging');
    });

    // Sidebar resize
    document.addEventListener('pointerdown', (event) => {
      if (event.target !== els.sidebar) return;
      const rect = els.sidebar.getBoundingClientRect();
      if (event.clientX - rect.right > -6) {
        event.preventDefault();
        state.dragging = 'sidebar';
        document.body.style.cursor = 'col-resize';
      }
    });
    document.addEventListener('pointermove', (event) => {
      if (state.dragging !== 'sidebar') return;
      const width = Math.min(420, Math.max(200, event.clientX));
      document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
    });
    document.addEventListener('pointerup', () => {
      if (state.dragging === 'sidebar') {
        const width = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'), 10);
        persist({ sidebarWidth: width });
        document.body.style.cursor = '';
      }
      state.dragging = null;
    });

    // Drag & drop: documents and images
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', async (event) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files || []);
      if (!files.length) return;
      const imageFile = files.find((file) => file.type.startsWith('image/'));
      const docFile = files.find((file) => /\.(md|markdown|mdown|mkd|mdx|txt)$/i.test(file.name));
      if (imageFile) {
        await insertDroppedImage(imageFile);
      } else if (docFile) {
        const path = api.getPathForFile(docFile);
        if (path) openDocument(path);
      }
    });

    // Paste images straight from the clipboard
    document.addEventListener(
      'paste',
      async (event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find((item) => item.type.startsWith('image/'));
        if (!imageItem) return;
        event.preventDefault();
        const file = imageItem.getAsFile();
        if (!file) return;
        await insertDroppedImage(file, true);
      },
      true
    );
  }

  async function insertDroppedImage(file, isClipboard) {
    const dataUrl = await fileToDataUrl(file);
    const res = await api.savePastedImage(dataUrl, state.filePath);
    if (!res.ok) {
      toast(`图片保存失败：${res.error || '未知错误'}`);
      return;
    }
    const alt = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
    const target = state.filePath ? res.relative : String(res.absolute || '').replace(/\\/g, '/');
    insertAtCursor(`![${alt}](${target})`);
    toast(isClipboard ? '已把剪贴板中的图片保存到 assets/' : '已把图片保存到 assets/');
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function decodeSafe(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  /* --------------------------------------------------------------- boot */

  async function boot() {
    const info = await api.info();
    els.versionLabel.textContent = `v${info.version}`;

    const settings = await api.getSettings();
    state.settings = settings || {};
    state.recent = settings.recent || [];

    if (settings.sidebarWidth) {
      document.documentElement.style.setProperty('--sidebar-width', `${settings.sidebarWidth}px`);
    }
    setTheme(settings.theme === 'dark' ? 'dark' : 'light');
    setView(['editor', 'split', 'preview'].includes(settings.view) ? settings.view : 'split');
    setSplitRatio(settings.splitRatio || 0.52);
    applyPreviewFontSize(settings.previewFontSize || 16);

    initEditor();
    bindUi();
    renderRecent();
    updateSaveState();

    // 先挂好外部打开（第二次启动 / 文件关联）的监听，再载入欢迎文档
    api.onOpenPath((filePath) => openDocument(filePath));

    const welcome = await api.welcome();
    applyDocument({ path: null, content: welcome, dir: info.rendererDir || '' });
    els.docTitle.textContent = '欢迎使用 FreeMD';
    els.dirtyFlag.textContent = '示例文档';

    // 启动参数里带的文档在此领取，晚于欢迎页，不会被覆盖
    const pendingPath = await api.takeOpenPath();
    if (pendingPath) await openDocument(pendingPath);

    api.onMenuAction((action) => {
      switch (action) {
        case 'new':
          newDocument();
          break;
        case 'open':
          openViaDialog();
          break;
        case 'open-folder':
          openFolder();
          break;
        case 'save':
          saveDocument();
          break;
        case 'save-as':
          saveDocument({ saveAs: true });
          break;
        case 'export-pdf':
          exportPdf();
          break;
        case 'find':
          openFind();
          break;
        case 'view-editor':
          setView('editor');
          break;
        case 'view-split':
          setView('split');
          break;
        case 'view-preview':
          setView('preview');
          break;
        case 'toggle-theme':
          setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
          break;
        default:
          break;
      }
    });

    api.onCloseRequest(async () => {
      if (await confirmDiscard()) api.confirmClose();
    });

    if (settings.lastFolder) {
      api.readTree(settings.lastFolder).then((res) => {
        if (res && res.ok && res.children && res.children.length) {
          state.folderRoot = res.root;
          state.folderTree = res;
          renderTree();
        }
      });
    }

    setTimeout(() => cm.focus(), 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
