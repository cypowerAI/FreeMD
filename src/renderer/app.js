'use strict';

/**
 * FreeMD renderer — application shell, editor wiring, outline navigation.
 */

(function () {
  const api = window.freemd;
  const MD = window.FreeMDMarkdown;

  const $ = (id) => document.getElementById(id);

  /** UML 标识符：去掉空白与特殊符号，转成 Mermaid 可用的节点名。 */
  const umlIdent = (name) =>
    String(name || '').trim().replace(/[^\w\u4e00-\u9fa5]/g, '_').replace(/^_+|_+$/g, '') || 'Entity';

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
    lightboxStage: $('lightboxStage'),
    lightboxZoom: $('lightboxZoom'),
    lightboxBar: $('lightboxBar'),
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

  // 全选只作用于当前文档：编辑器选中文档源码，阅读视图选中正文，
  // 不把左侧导航、大纲、工具栏等界面文字纳入选区。
  function selectAllContent() {
    const view = els.workspace.dataset.view;
    const focusInPreview = document.activeElement && els.previewPane.contains(document.activeElement);
    if (view === 'preview' || (focusInPreview && view !== 'editor')) {
      const range = document.createRange();
      range.selectNodeContents(els.preview);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    if (!cm) return;
    const last = cm.lastLine();
    cm.setSelection({ line: 0, ch: 0 }, { line: last, ch: cm.getLine(last).length });
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
    return headings.map((heading) => ({
      ...heading,
      displayLevel: Math.max(1, heading.level - baseLevel + 1),
      children: 0
    }));
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
      flowchart: { htmlLabels: false, curve: 'stepBefore', useMaxWidth: true },
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

  /**
   * 类图节点多、天然很宽，按容器宽度等比缩到可读尺寸，细节靠点击放大查看，
   * 避免出现宽到必须横向拖动、只能看到一角的排版。
   */
  function openDiagramLightbox(block) {
    const svg = block.querySelector('svg');
    if (!svg) return;
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const markup = new XMLSerializer().serializeToString(clone);
    const blocks = Array.from(document.querySelectorAll('.mermaid-block'));
    const index = blocks.indexOf(block) + 1;
    const docName = state.filePath ? baseName(state.filePath).replace(/\.(md|markdown|txt)$/i, '') : 'diagram';
    const name = `${docName || 'diagram'}-${index || 1}`;
    openLightbox(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`, { diagram: true, svg: markup, name });
  }

  /**
   * 类图的节点矩形（SVG 用户坐标）。节点组可能带 translate 甚至缩放，
   * 直接拿 getBoundingClientRect 再经 CTM 逆变换换回 SVG 坐标最稳妥。
   */
  function classNodeRects(svg) {
    const rects = [];
    const inverse = svg.getScreenCTM() ? svg.getScreenCTM().inverse() : null;
    svg.querySelectorAll('.node').forEach((node) => {
      if (!inverse) {
        // 打印用的副本还没挂到文档上，拿不到 CTM，退回 bbox + translate
        const box = node.getBBox();
        if (!box.width || !box.height) return;
        const matrix = node.transform.baseVal.consolidate();
        rects.push({
          x: box.x + (matrix ? matrix.matrix.e : 0),
          y: box.y + (matrix ? matrix.matrix.f : 0),
          w: box.width,
          h: box.height
        });
        return;
      }
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const a = new DOMPoint(box.left, box.top).matrixTransform(inverse);
      const b = new DOMPoint(box.right, box.bottom).matrixTransform(inverse);
      rects.push({
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(b.x - a.x),
        h: Math.abs(b.y - a.y)
      });
    });
    return rects;
  }

  /**
   * 读取连线某一端标记（marker）朝所属类框一侧延伸的本体长度（SVG 用户单位）。
   * 起始端标记本体沿路径反方向回探，结束端标记沿路径方向探出；只把朝框的
   * 这段算进外退量，标记本体就能完整落在间隙里，不会压进或穿进类框。
   */
  function markerBoxExtent(svg, path, which) {
    const attr = which === 'start' ? path.getAttribute('marker-start') : path.getAttribute('marker-end');
    if (!attr) return 0;
    const id = attr.replace(/^url\(#/, '').replace(/\)$/, '');
    let marker = null;
    try {
      marker = svg.querySelector(`#${CSS.escape(id)}`);
    } catch {
      marker = svg.querySelector(`#${id}`);
    }
    if (!marker) return 0;
    const refX = parseFloat(marker.getAttribute('refX')) || 0;
    const shape = marker.querySelector('path, polygon');
    let x0 = 0;
    let x1 = 18;
    if (shape) {
      try {
        const box = shape.getBBox();
        x0 = box.x;
        x1 = box.x + box.width;
      } catch {
        // 离屏副本拿不到包围盒时退回标记默认几何范围
      }
    }
    let sw = 1;
    try {
      sw = parseFloat(getComputedStyle(path).strokeWidth) || 1;
    } catch {
      sw = 1;
    }
    const extent = which === 'start' ? refX - x0 : x1 - refX;
    return Math.max(0, extent) * sw;
  }

  /**
   * 把端点吸附到最近类框的边框上，并返回该点是从哪一侧贴上去的
   * （top/bottom → 竖直进入，left/right → 水平进入）。端点再沿该侧法线
   * 向外退「标记本体朝框方向的长度 + 少量衬距」：箭头、空心/实心菱形、
   * 继承三角都完整落在间隙外侧，不会压到或穿进类框边框。
   * prefer 用于边角处按连线主方向优先选边，避免标记跨到相邻边框里。
   */
  function nearestBorderPoint(rects, point, extent = 0, prefer = null) {
    let best = null;
    let bestDistance = Infinity;
    for (const rect of rects) {
      const cx = Math.min(Math.max(point[0], rect.x), rect.x + rect.w);
      const cy = Math.min(Math.max(point[1], rect.y), rect.y + rect.h);
      const distance = Math.hypot(point[0] - cx, point[1] - cy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = rect;
      }
    }
    if (!best || bestDistance > 48) return { point, side: null };
    const gap = extent + 2;
    const bx = best.x;
    const by = best.y;
    const br = best.x + best.w;
    const bb = best.y + best.h;
    const cx = Math.min(Math.max(point[0], bx), br);
    const cy = Math.min(Math.max(point[1], by), bb);
    const candidates = [
      { side: 'y', orient: 'top', point: [cx, by], d: Math.abs(point[1] - by) },
      { side: 'y', orient: 'bottom', point: [cx, bb], d: Math.abs(bb - point[1]) },
      { side: 'x', orient: 'left', point: [bx, cy], d: Math.abs(point[0] - bx) },
      { side: 'x', orient: 'right', point: [br, cy], d: Math.abs(br - point[0]) }
    ];
    let picked = candidates[0];
    for (const candidate of candidates) {
      if (prefer && candidate.side === prefer && picked.side !== prefer) {
        if (candidate.d <= picked.d + 12) picked = candidate;
      } else if (candidate.d < picked.d) {
        picked = candidate;
      }
    }
    const p = [...picked.point];
    if (picked.orient === 'top') p[1] -= gap;
    else if (picked.orient === 'bottom') p[1] += gap;
    else if (picked.orient === 'left') p[0] -= gap;
    else p[0] += gap;
    return { point: p, side: picked.side };
  }

  /**
   * 类图连线由 dagre 输出为三次贝塞尔曲线，这里改写成正交折线（直角转角），
   * 两端先吸附到类框边框，再按贴边方向选折线走法，保证箭头落在对应的类
   * （实体）上而不是悬在框外。
   */
  function orthogonalizeClassEdges(svg) {
    if (!svg || svg.getAttribute('aria-roledescription') !== 'classDiagram') return;
    const rects = classNodeRects(svg);
    svg.querySelectorAll('.edgePaths path').forEach((path) => {
      const d = path.getAttribute('d') || '';
      const pairs = d.match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g);
      if (!pairs || pairs.length < 2) return;
      const start = pairs[0].split(',').map(Number);
      const end = pairs[pairs.length - 1].split(',').map(Number);
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      if (Math.hypot(dx, dy) < 16) return;
      const fallbackSide = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
      const prefer = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      const startExtent = markerBoxExtent(svg, path, 'start');
      const endExtent = markerBoxExtent(svg, path, 'end');
      const snappedStart = nearestBorderPoint(rects, start, startExtent, prefer);
      const snappedEnd = nearestBorderPoint(rects, end, endExtent, prefer);
      const startSide = snappedStart.side || fallbackSide;
      const endSide = snappedEnd.side || fallbackSide;
      const from = snappedStart.point;
      const to = snappedEnd.point;
      const points = [from];
      if (startSide === 'y' && endSide === 'y') {
        const midY = (from[1] + to[1]) / 2;
        points.push([from[0], midY], [to[0], midY], to);
      } else if (startSide === 'x' && endSide === 'x') {
        const midX = (from[0] + to[0]) / 2;
        points.push([midX, from[1]], [midX, to[1]], to);
      } else if (startSide === 'y') {
        points.push([from[0], to[1]], to);
      } else {
        points.push([to[0], from[1]], to);
      }
      const unique = points.filter(
        (point, index) => index === 0 || Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) > 0.5
      );
      path.setAttribute('d', unique.map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0]},${point[1]}`).join(''));
    });
  }

  /**
   * 时序图后处理：Mermaid 默认在生命线两端都画参与者框/小人，这里去掉底部
   * 重复的一组（矩形、文本、actor-man），只保留顶部，结构更贴近参考图。
   */
  function tidySequenceActors(svg) {
    if (!svg || svg.getAttribute('aria-roledescription') !== 'sequence') return;
    svg.querySelectorAll('rect.actor-bottom').forEach((rect) => rect.remove());
    svg.querySelectorAll('.actor-man.actor-bottom').forEach((group) => group.remove());
    const texts = [...svg.querySelectorAll('text.actor')];
    const ys = texts.map((t) => Number(t.getAttribute('y'))).filter(Number.isFinite);
    if (ys.length < 2) return;
    const minY = Math.min(...ys);
    texts.forEach((text) => {
      if (Number(text.getAttribute('y')) - minY > 50) text.remove();
    });
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
   * 把 PlantUML 类图转写成 Mermaid classDiagram。
   * 只覆盖项目文档里实际用到的写法：package/class/interface/abstract/enum、
   * 成员与方法、继承/实现/依赖/关联/组合/聚合、note；其它图种返回 null，
   * 由调用方给出「暂不支持」的提示。
   */
  function plantUmlToMermaid(source) {
    const lines = String(source).split(/\r?\n/);
    const out = [];
    const notes = [];
    const stack = [];
    let note = null;
    let pendingMember = null;
    const unsupported = /^(actor|participant|boundary|control|collections|database|queue|sequence|state|activity|usecase|component|artifact|node|folder|frame|cloud|storage|autonumber|activate|deactivate|alt|else|opt|loop|par|break|critical|group|end\b|skinparam\s+\w+\s+\{)/i;

    const relation = (line) => {
      const match = line.match(/^([A-Za-z_]\w*)\s*(?:"([^"]*)")?\s*(<\|--|<\|\.\.|--\|>|\.\.\|>|<--\*|<--o|<--|<\.\.|\*--|o--|--\*|--o|-->|--|\.\.>|\.\.)\s*(?:"([^"]*)")?\s*([A-Za-z_]\w*)(?:\s*:\s*(.*))?$/);
      if (!match) return null;
      let [, left, leftMult, token, rightMult, right, label = ''] = match;
      let mLeft = left;
      let mRight = right;
      let mLeftMult = leftMult;
      let mRightMult = rightMult;
      let arrow;
      switch (token) {
        case '<|--':
          arrow = '<|--';
          break;
        case '<|..':
          arrow = '..|>';
          mLeft = right; mRight = left; mLeftMult = rightMult; mRightMult = leftMult;
          break;
        case '--|>':
          arrow = '<|--';
          mLeft = right; mRight = left; mLeftMult = rightMult; mRightMult = leftMult;
          break;
        case '..|>':
          arrow = '..|>';
          mLeft = right; mRight = left; mLeftMult = rightMult; mRightMult = leftMult;
          break;
        case '<--*':
          arrow = '*--';
          mLeft = right; mRight = left; mLeftMult = rightMult; mRightMult = leftMult;
          break;
        case '<--o':
          arrow = 'o--';
          mLeft = right; mRight = left; mLeftMult = rightMult; mRightMult = leftMult;
          break;
        case '<--':
          arrow = '-->';
          mLeft = right; mRight = left; mLeftMult = rightMult; mRightMult = leftMult;
          break;
        case '<..':
          arrow = '..>';
          mLeft = right; mRight = left; mLeftMult = rightMult; mRightMult = leftMult;
          break;
        case '--*':
          arrow = '*--';
          mLeft = right; mRight = left; mLeftMult = rightMult; mRightMult = leftMult;
          break;
        case '--o':
          arrow = 'o--';
          mLeft = right; mRight = left; mLeftMult = rightMult; mRightMult = leftMult;
          break;
        default:
          arrow = token;
      }
      const mult = (value) => (value && value.trim() ? `"${value.trim()}"` : '');
      const text = label.replace(/\s*>\s*$/, '').replace(/"/g, '').trim();
      const tail = text ? ` : ${text}` : '';
      return `${mLeft}${mult(mLeftMult) ? ` ${mult(mLeftMult)}` : ''} ${arrow} ${mult(mRightMult) ? `${mult(mRightMult)} ` : ''}${mRight}${tail}`;
    };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^@startuml\b/i.test(line) || /^@enduml\b/i.test(line)) continue;
      if (line.startsWith("'")) continue;
      if (/^(skinparam|hide|show|title|caption|header|footer|scale|left to right direction)\b/i.test(line)) continue;
      if (!note && unsupported.test(line)) return null;

      if (note) {
        if (/^end\s*note$/i.test(line)) {
          notes.push(note);
          note = null;
        } else {
          note.lines.push(line);
        }
        continue;
      }

      const noteStart = line.match(/^note\s+(?:(top|bottom|left|right)\s+of\s+)?([A-Za-z_]\w*)\s*$/i);
      if (noteStart) {
        note = { target: noteStart[2], lines: [] };
        continue;
      }
      if (/^note\s+"/i.test(line)) return null;

      const pkg = line.match(/^package\s+"([^"]+)"\s*\{?$/i);
      if (pkg) {
        out.push(`namespace ${umlIdent(pkg[1])} {`);
        stack.push('package');
        continue;
      }

      const decl = line.match(/^(abstract\s+)?(class|interface|enum|struct)\s+([A-Za-z_]\w*)(?:\s+as\s+[A-Za-z_]\w*)?\s*(\{)?$/i);
      if (decl) {
        const [, isAbstract, kind, name, brace] = decl;
        const stereotype = kind.toLowerCase() === 'interface'
          ? '<<interface>>'
          : kind.toLowerCase() === 'enum'
            ? '<<enumeration>>'
            : isAbstract
              ? '<<abstract>>'
              : '';
        if (!brace) {
          // 声明不带类体：有构造型就写成标注块，否则单行声明
          if (stereotype) out.push(`class ${name} {`, `    ${stereotype}`, '}');
          else out.push(`class ${name}`);
          continue;
        }
        out.push(`class ${name} {`);
        if (stereotype) out.push(`    ${stereotype}`);
        stack.push({ kind: 'class', name, openIndex: out.length - (stereotype ? 2 : 1) });
        continue;
      }

      if (line === '}') {
        const top = stack.pop();
        if (top && top.kind === 'class' && out.length === top.openIndex + 1) {
          // 空类体：Mermaid 不接受空的 class 块，收成单行声明
          out[top.openIndex] = `class ${top.name}`;
        } else {
          out.push('}');
        }
        continue;
      }

      const relationLine = stack.length === 0 ? relation(line) : null;

      if (stack[stack.length - 1]?.kind === 'class') {
        // 构造型声明（<<enumeration>> 等）原样保留，别当成成员做转义
        if (/^<<[^<>]+>>$/.test(line)) {
          out.push(`    ${line}`);
          continue;
        }
        // 类体：成员/方法，跨行签名按括号配对收拢
        let member = pendingMember ? `${pendingMember} ${line}` : line;
        const balance = (member.match(/\(/g) || []).length - (member.match(/\)/g) || []).length;
        if (balance > 0) {
          pendingMember = member;
          continue;
        }
        pendingMember = null;
        member = member
          .replace(/\{static\}\s*/gi, '')
          .replace(/<<(abstract|enumeration|interface)>>/gi, (m) => m.toLowerCase())
          .replace(/\)\s*:\s*/g, ') ')
          .replace(/<([^<>]*)>/g, '~$1~')
          .replace(/\s+/g, ' ')
          .trim();
        if (member) out.push(`    ${member}`);
        continue;
      }

      if (relationLine) {
        out.push(relationLine);
        continue;
      }

      // 类外还有没识别的内容（说明文字、构造型声明等），直接忽略
    }
    if (note) notes.push(note);

    if (!out.some((line) => /^class\b|^namespace\b/.test(line))) return null;

    for (const item of notes) {
      const text = item.lines.join('<br/>').replace(/"/g, '&quot;');
      if (text) out.push(`note for ${item.target} "${text}"`);
    }
    return ['classDiagram', ...out].join('\n');
  }

  /**
   * 把 PlantUML 时序图转写成 Mermaid sequenceDiagram。
   * 覆盖常用写法：参与者/执行者、实线/虚线/交叉箭头、返回、note、
   * alt/opt/loop/par/break、activate/deactivate；无法识别的结构返回 null。
   */
  function plantUmlSequenceToMermaid(source) {
    const lines = String(source).split(/\r?\n/);
    const participants = new Map(); // key -> 显示名
    const items = [];
    let note = null;
    let saw = false;

    const addParticipant = (raw, display) => {
      const key = umlIdent(raw);
      if (!participants.has(key)) participants.set(key, display || key);
      return key;
    };

    const skip = /^(@startuml|@enduml|skinparam|hide\b|show\b|title\b|caption\b|header\b|footer\b|autonumber\b|left to right direction|scale\b|'|\/\*|\*\/)/i;

    const arrowMap = {
      '->>': '->>',
      '-->>': '-->>',
      '->': '->>',
      '-->': '-->>',
      '-x': '-x',
      '--x': '--x',
      '<-': '->>',
      '<--': '-->>',
      '<-x': '-x',
      '..>': '-->>'
    };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || skip.test(line)) continue;

      if (note) {
        if (/^end\s*note$/i.test(line)) {
          items.push({ type: 'note', pos: note.pos, target: note.target, lines: note.lines });
          note = null;
        } else {
          note.lines.push(line.replace(/^"|"$/g, ''));
        }
        continue;
      }

      // 参与者声明：兼容 `participant A`、`participant A as "Label"`、`participant "Label" as A`
      const decl = line.match(/^(actor|participant|boundary|control|entity|database|queue|collections)\s+(?:"([^"]+)"|([A-Za-z_]\w*))(?:\s+as\s+(?:"([^"]+)"|([A-Za-z_]\w*)))?$/i);
      if (decl) {
        saw = true;
        const [, ptype, quoted1, plain1, quoted2, plain2] = decl;
        let key;
        let display;
        if (quoted1) {
          display = quoted1;
          key = plain2 || umlIdent(quoted1);
        } else {
          key = plain1;
          display = quoted2 || plain2 || plain1;
        }
        const finalKey = addParticipant(key, display);
        items.push({ type: 'declare', ptype: ptype.toLowerCase(), key: finalKey, display });
        continue;
      }

      // 单行 note（带冒号）优先于多行 note
      const noteInline = line.match(/^note\s+(over|left of|right of)\s+([^:]+):\s*(.*)$/i);
      if (noteInline) {
        items.push({
          type: 'note',
          pos: noteInline[1].toLowerCase(),
          target: noteInline[2].trim(),
          lines: [noteInline[3].replace(/^"|"$/g, '')]
        });
        continue;
      }
      const noteMulti = line.match(/^note\s+(over|left of|right of)\s+(.+?)\s*$/i);
      if (noteMulti) {
        note = { pos: noteMulti[1].toLowerCase(), target: noteMulti[2].trim(), lines: [] };
        continue;
      }

      // 组合片段
      const block = line.match(/^(alt|else|opt|loop|par|break|group|and)\b(?:\s*(?:\[([^\]]*)\]|(.*)))?$/i);
      if (block) {
        const word = block[1].toLowerCase();
        if (word === 'group') return null;
        const label = (block[2] || block[3] || '').trim();
        items.push({ type: 'block', word, label });
        continue;
      }

      if (/^end\b/i.test(line)) {
        items.push({ type: 'end' });
        continue;
      }

      const activ = line.match(/^(activate|deactivate)\s+([A-Za-z_]\w*)$/i);
      if (activ) {
        saw = true;
        const key = addParticipant(activ[2]);
        items.push({ type: activ[1].toLowerCase(), key });
        continue;
      }

      if (/^return\b/i.test(line)) continue;

      // 消息箭头
      const msg = line.match(/^([A-Za-z_]\w*)\s*(-->>|--x|->>|->|-->|-x|<-x|<--|<-|\.\.>)\s*([A-Za-z_]\w*)(?:\s*:\s*(.*))?$/i);
      if (msg) {
        saw = true;
        let [, from, token, to, label = ''] = msg;
        const arrow = arrowMap[token];
        if (!arrow) return null;
        if (/^</.test(token)) { const t = from; from = to; to = t; }
        const f = addParticipant(from);
        const t = addParticipant(to);
        items.push({ type: 'msg', from: f, arrow, to: t, label: label.trim() });
        continue;
      }

      // 其它图种关键字：判定为不支持，避免误转
      if (/^(state\s+diagram|usecase|actor\s+\"|component|artifact|node\b|folder|cloud|storage|interface\s+\"|rectangle|agent|stack|queue\s+\"|database\s+\"|boundary\s+\"|control\s+\"|entity\s+\")/i.test(line)) return null;
    }

    if (!saw) return null;

    const out = ['sequenceDiagram'];
    const declared = new Set();
    const pushDeclare = (key, display, kind) => {
      if (declared.has(key)) return;
      declared.add(key);
      const kw = kind === 'actor' ? 'actor' : 'participant';
      const label = String(display || key).replace(/^"|"$/g, '');
      out.push(label !== key ? `${kw} ${key} as ${label}` : `${kw} ${key}`);
    };
    for (const item of items) {
      if (item.type === 'declare') pushDeclare(item.key, participants.get(item.key) || item.key, item.ptype);
    }
    for (const [key, display] of participants) pushDeclare(key, display, 'participant');

    let indent = 0;
    const render = (item) => {
      const pad = '    '.repeat(indent);
      switch (item.type) {
        case 'declare':
          return null;
        case 'msg': {
          const label = item.label ? `: ${item.label.replace(/"/g, '&quot;')}` : '';
          return `${pad}${item.from}${item.arrow}${item.to}${label}`;
        }
        case 'note': {
          const text = item.lines.join('<br/>').replace(/"/g, '&quot;');
          const pos = item.pos === 'left of' ? 'left of' : item.pos === 'right of' ? 'right of' : 'over';
          const target = item.target.split(/\s*,\s*/).map((n) => umlIdent(n)).join(', ');
          return `${pad}Note ${pos} ${target}: ${text}`;
        }
        case 'block': {
          if (item.word === 'else' || item.word === 'and') {
            indent = Math.max(0, indent - 1);
            const line = `${'    '.repeat(indent)}${item.word}${item.label ? ` ${item.label}` : ''}`;
            indent += 1;
            return line;
          }
          const line = `${pad}${item.word}${item.label ? ` ${item.label}` : ''}`;
          indent += 1;
          return line;
        }
        case 'end':
          indent = Math.max(0, indent - 1);
          return `${'    '.repeat(indent)}end`;
        case 'activate':
          return `${pad}activate ${item.key}`;
        case 'deactivate':
          return `${pad}deactivate ${item.key}`;
        default:
          return null;
      }
    };
    for (const item of items) {
      const line = render(item);
      if (line) out.push(line);
    }
    return out.join('\n');
  }

  function isPlantUmlSource(code) {
    return /^@startuml|^@enduml|^\s*skinparam\b|^\s*package\s+"|^\s*(actor|participant|boundary|control|entity)\s+/i.test(code);
  }

  /** 返回用于 Mermaid 渲染的源码；PlantUML 会先尝试转写，失败返回 null。 */
  function mermaidSourceFor(source) {
    const code = String(source).trim();
    if (!isPlantUmlSource(code)) return { code, converted: false };
    const converted = plantUmlToMermaid(code) || plantUmlSequenceToMermaid(code);
    return { code: converted, converted: true };
  }


  /**
   * 把 .mermaid 节点里的源码交给 Mermaid 渲染成 SVG。
   * 源码保存在 dataset.src 上，切换主题时用它重新绘制。
   * PlantUML 类图会先转写成 Mermaid，再走同一条渲染路径。
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
        const block = mermaidBlockOf(node);
        const rawCode = source.trim();
        if (!rawCode) continue;
        const code = block && block.dataset.diagram === 'plantuml' && !isPlantUmlSource(rawCode)
          ? `@startuml\n${rawCode}\n@enduml`
          : rawCode;
        const prepared = mermaidSourceFor(code);
        if (!prepared.code) {
          markMermaidError(
            node,
            source,
            new Error('暂不支持这段 PlantUML：类图、时序图已可离线转写，活动图/状态图等其它图种请改写成 Mermaid 语法')
          );
          continue;
        }
        const cacheKey = `${themeKey}\u0000${prepared.code}`;
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
          const result = await api.render(id, prepared.code);
          node.innerHTML = result.svg;
          orthogonalizeClassEdges(node.querySelector('svg'));
          tidySequenceActors(node.querySelector('svg'));
          node.dataset.rendered = '1';
          node.classList.remove('is-error');
          const block = mermaidBlockOf(node);
          if (block) block.classList.remove('is-error');
          if (mermaidCache.size > 120) mermaidCache.clear();
          mermaidCache.set(cacheKey, node.innerHTML);
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
        const srcBlock = mermaidBlockOf(node);
        const code = srcBlock && srcBlock.dataset.diagram === 'plantuml' && !isPlantUmlSource(source)
          ? `@startuml\n${source}\n@enduml`
          : source;
        const prepared = mermaidSourceFor(code);
        if (!prepared.code) continue;
        try {
          const result = await api.render(`freemd-print-${Date.now()}-${index}`, prepared.code);
          dstNodes[index].innerHTML = result.svg;
          orthogonalizeClassEdges(dstNodes[index].querySelector('svg'));
          tidySequenceActors(dstNodes[index].querySelector('svg'));
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

  const viewer = { scale: 1, x: 0, y: 0, diagram: false, svg: '', name: 'diagram', dragging: false, moved: false };

  function applyLightboxTransform(animate) {
    els.lightboxImg.style.transition = animate ? '' : 'none';
    els.lightboxImg.style.transform = `translate3d(${viewer.x}px, ${viewer.y}px, 0) scale(${viewer.scale})`;
    if (els.lightboxZoom) els.lightboxZoom.textContent = `${Math.round(viewer.scale * 100)}%`;
  }

  function resetLightbox() {
    viewer.scale = 1;
    viewer.x = 0;
    viewer.y = 0;
    applyLightboxTransform(true);
  }

  /** 以光标为锚点缩放：光标下的那一点在缩放前后保持不动。 */
  function zoomLightbox(factor, clientX, clientY) {
    const next = Math.min(6, Math.max(0.4, viewer.scale * factor));
    if (next === viewer.scale) return;
    const rect = els.lightboxStage.getBoundingClientRect();
    const cx = (clientX == null ? rect.left + rect.width / 2 : clientX) - (rect.left + rect.width / 2);
    const cy = (clientY == null ? rect.top + rect.height / 2 : clientY) - (rect.top + rect.height / 2);
    const ratio = next / viewer.scale;
    viewer.x = cx - (cx - viewer.x) * ratio;
    viewer.y = cy - (cy - viewer.y) * ratio;
    viewer.scale = next;
    applyLightboxTransform(false);
  }

  function openLightbox(src, options) {
    if (!src) return;
    viewer.diagram = Boolean(options && options.diagram);
    viewer.svg = (options && options.svg) || '';
    viewer.name = (options && options.name) || 'diagram';
    viewer.scale = 1;
    viewer.x = 0;
    viewer.y = 0;
    // 图表是透明底 SVG，按当前主题给一块纸面底色，免得落在深色遮罩上看不清
    els.lightboxImg.style.background = viewer.diagram ? cssVar('--paper', '#fffdf9') : '';
    els.lightboxImg.style.padding = viewer.diagram ? '18px' : '';
    const saveButton = els.lightboxBar && els.lightboxBar.querySelector('[data-action="save"]');
    if (saveButton) saveButton.classList.toggle('is-hidden', !viewer.diagram);
    els.lightboxImg.src = src;
    els.lightbox.hidden = false;
    applyLightboxTransform(true);
  }

  function closeLightbox() {
    if (document.fullscreenElement === els.lightbox && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    els.lightbox.hidden = true;
    els.lightboxImg.src = '';
    els.lightboxImg.style.background = '';
    els.lightboxImg.style.padding = '';
    els.lightboxImg.style.transform = '';
    resetLightbox();
  }

  function toggleLightboxFullscreen() {
    if (!els.lightbox.hidden && document.fullscreenEnabled) {
      if (document.fullscreenElement === els.lightbox) document.exitFullscreen().catch(() => {});
      else els.lightbox.requestFullscreen().catch(() => toast('当前窗口不允许全屏'));
    }
  }

  async function saveDiagramSvg() {
    if (!viewer.svg) return;
    const saved = await api.saveSvg(viewer.name, viewer.svg);
    if (saved && saved.ok) toast(`已保存：${saved.path}`);
    else if (saved && saved.error) toast(`保存失败：${saved.error}`);
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
      const diagram = event.target.closest('.mermaid-block');
      if (diagram && diagram.querySelector('svg')) {
        openDiagramLightbox(diagram);
        return;
      }
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

    // 灯箱：图内拖拽平移、滚轮以光标为锚点缩放、双击复位
    els.lightboxStage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      viewer.dragging = true;
      viewer.moved = false;
      viewer.startX = event.clientX;
      viewer.startY = event.clientY;
      viewer.originX = viewer.x;
      viewer.originY = viewer.y;
      els.lightboxStage.classList.add('is-dragging');
      els.lightboxStage.setPointerCapture(event.pointerId);
    });
    els.lightboxStage.addEventListener('pointermove', (event) => {
      if (!viewer.dragging) return;
      const dx = event.clientX - viewer.startX;
      const dy = event.clientY - viewer.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) viewer.moved = true;
      viewer.x = viewer.originX + dx;
      viewer.y = viewer.originY + dy;
      applyLightboxTransform(false);
    });
    const endDrag = (event) => {
      if (!viewer.dragging) return;
      viewer.dragging = false;
      els.lightboxStage.classList.remove('is-dragging');
      if (els.lightboxStage.hasPointerCapture(event.pointerId)) {
        els.lightboxStage.releasePointerCapture(event.pointerId);
      }
    };
    els.lightboxStage.addEventListener('pointerup', endDrag);
    els.lightboxStage.addEventListener('pointercancel', endDrag);
    els.lightboxStage.addEventListener('click', (event) => {
      if (viewer.moved) return;
      if (event.target === els.lightboxStage) closeLightbox();
    });
    els.lightboxStage.addEventListener('dblclick', (event) => {
      event.preventDefault();
      resetLightbox();
    });
    els.lightboxStage.addEventListener('wheel', (event) => {
      event.preventDefault();
      zoomLightbox(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
    }, { passive: false });
    els.lightboxBar.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      event.stopPropagation();
      const action = button.dataset.action;
      if (action === 'zoom-in') zoomLightbox(1.25);
      else if (action === 'zoom-out') zoomLightbox(1 / 1.25);
      else if (action === 'reset') resetLightbox();
      else if (action === 'fullscreen') toggleLightboxFullscreen();
      else if (action === 'save') void saveDiagramSvg();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (!els.lightbox.hidden) closeLightbox();
        else if (state.find.open) closeFind();
        return;
      }
      if (els.lightbox.hidden) return;
      if (event.key === '+' || event.key === '=') zoomLightbox(1.25);
      else if (event.key === '-') zoomLightbox(1 / 1.25);
      else if (event.key === '0') resetLightbox();
      else if (event.key === 'f' || event.key === 'F') toggleLightboxFullscreen();
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
    setTheme(settings.theme === 'light' ? 'light' : 'dark');
    setView(['editor', 'split', 'preview'].includes(settings.view) ? settings.view : 'preview');
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
        case 'select-all':
          selectAllContent();
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
