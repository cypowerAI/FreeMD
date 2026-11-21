'use strict';

/**
 * FreeMD markdown pipeline.
 *
 * Wraps markdown-it with:
 *   - KaTeX math ($...$ inline, $$...$$ block)
 *   - highlight.js code fences
 *   - section recognition (heading ids + outline metadata)
 *   - front-matter parsing
 *   - automatic chapter detection for plain-text documents
 *   - relative image path resolution against the document location
 *   - DOMPurify sanitising (raw HTML stays supported, scripts do not)
 */

(function () {
  const markdownit = window.markdownit;
  const katex = window.katex;
  const hljs = window.hljs;
  const DOMPurify = window.DOMPurify;

  if (!markdownit) {
    throw new Error('markdown-it failed to load');
  }

  /* ----------------------------------------------------------- utilities */

  function highlightCode(code, lang, fallbackEscape) {
    if (lang && hljs && hljs.getLanguage) {
      try {
        const out = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        return `<pre class="hljs"><code class="language-${lang}">${out}</code></pre>`;
      } catch {
        /* fall through */
      }
    }
    return `<pre class="hljs"><code>${fallbackEscape(code)}</code></pre>`;
  }

  /* ------------------------------------------------------------- math */

  function isValidDelim(state, pos) {
    const max = state.posMax;
    const prev = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
    const next = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1;
    const isBlank = (code) => code === 0x20 || code === 0x09 || code === 0x0a || code === -1;

    return {
      // "$ text" is never an opening delimiter; "$5" is treated as currency.
      canOpen: !isBlank(next) && next !== 0x24 && !(next >= 0x30 && next <= 0x39),
      // "text $" is never a closing delimiter.
      canClose: !isBlank(prev) && prev !== 0x24
    };
  }

  function mathInline(state, silent) {
    if (state.src[state.pos] !== '$') return false;
    let start = state.pos;
    let pos = start + 1;
    const max = state.posMax;

    if (!isValidDelim(state, start).canOpen) return false;

    let found = -1;
    while (pos < max) {
      const ch = state.src[pos];
      if (ch === '\\') {
        pos += 2;
        continue;
      }
      if (ch === '\n') return false;
      if (ch === '$' && isValidDelim(state, pos).canClose) {
        found = pos;
        break;
      }
      pos += 1;
    }
    if (found < 0) return false;
    if (!silent) {
      const token = state.push('math_inline', 'math', 0);
      token.markup = '$';
      token.content = state.src.slice(start + 1, found);
      if (state.env) state.env.mathCount = (state.env.mathCount || 0) + 1;
    }
    state.pos = found + 1;
    return true;
  }

  function mathBlock(state, startLine, endLine, silent) {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (state.src.slice(start, start + 2) !== '$$') return false;
    if (silent) return true;

    let nextLine = startLine;
    let autoClosed = false;
    let firstLine = state.src.slice(start + 2, max);
    let lastLine = '';

    if (firstLine.trim().slice(-2) === '$$') {
      firstLine = firstLine.trim().slice(0, -2);
      autoClosed = true;
    }

    const collected = [];
    if (!autoClosed && firstLine.trim()) collected.push(firstLine);

    for (nextLine = startLine + 1; !autoClosed && nextLine < endLine; nextLine++) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      lastLine = state.src.slice(lineStart, lineEnd);
      if (lastLine.trim().slice(-2) === '$$') {
        autoClosed = true;
        const trimmed = lastLine.trim();
        if (trimmed.length > 2) collected.push(trimmed.slice(0, -2));
        break;
      }
      collected.push(state.src.slice(lineStart, lineEnd));
    }

    state.line = nextLine + (autoClosed ? 1 : 0);

    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.markup = '$$';
    token.content = collected.join('\n').trim();
    if (state.env) state.env.mathCount = (state.env.mathCount || 0) + 1;
    return true;
  }

  function mathPlugin(md) {
    md.inline.ruler.after('escape', 'math_inline', mathInline);
    md.block.ruler.after('blockquote', 'math_block', mathBlock, {
      alt: ['paragraph', 'reference', 'blockquote', 'list']
    });
    md.renderer.rules.math_inline = (tokens, idx) => renderMath(tokens[idx].content, false);
    md.renderer.rules.math_block = (tokens, idx) => {
      const body = renderMath(tokens[idx].content, true);
      return `<div class="math-block">${body}</div>\n`;
    };
  }

  function renderMath(tex, displayMode) {
    try {
      return katex.renderToString(tex, {
        displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
        output: 'html'
      });
    } catch {
      return `<code class="math-error">${escapeHtml(tex)}</code>`;
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ----------------------------------------------------------- headings */

  function headingRule(md) {
    md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const inline = tokens[idx + 1];
      const raw = inline && inline.type === 'inline' ? inline.content : '';
      const text = stripInlineMarkup(raw);
      const level = parseInt(token.tag.slice(1), 10) || 1;
      const line = token.map ? token.map[0] : -1;
      if (env && env.headings) {
        const entry = {
          level,
          text,
          id: `sec-${env.headings.length + 1}`,
          line,
          auto: Boolean(env.autoLines && env.autoLines.has(line))
        };
        env.headings.push(entry);
        return `<${token.tag} id="${entry.id}" class="sec-heading level-${level}" data-line="${line}">`;
      }
      return self.renderToken(tokens, idx, options);
    };
  }

  function stripInlineMarkup(text) {
    return String(text || '')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/[*_~]/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ------------------------------------------------------- front matter */

  function parseFrontMatter(source) {
    const normalized = source.replace(/\r\n/g, '\n');
    const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized);
    if (!match) return { data: null, body: normalized };
    const data = {};
    for (const line of match[1].split('\n')) {
      const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
      if (!kv) continue;
      let value = kv[2].trim();
      if (/^\[.*\]$/.test(value)) {
        value = value
          .slice(1, -1)
          .split(',')
          .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      } else {
        value = value.replace(/^['"]|['"]$/g, '');
      }
      data[kv[1]] = value;
    }
    return { data, body: normalized.slice(match[0].length) };
  }

  /* --------------------------------------------- automatic chapter scan */

  const CHAPTER_PATTERNS = [
    /^第[0-9零〇一二三四五六七八九十百千两]{1,8}[章篇卷部编季]\s*[^\n]{0,40}$/,
    /^第[0-9零〇一二三四五六七八九十百千两]{1,8}节\s*[^\n]{0,40}$/,
    /^[0-9]{1,2}(\.[0-9]{1,2}){0,2}\s+[^\s.。][^\n]{0,40}$/,
    /^[一二三四五六七八九十]{1,3}、\s*[^\n]{1,40}$/
  ];

  /**
   * Turns plain-text chapter lines into real headings when a document has
   * (almost) no markdown headings. Returns the rewritten source plus the set of
   * line numbers that were promoted, so the outline can flag them.
   */
  function detectSections(source) {
    const lines = source.split('\n');
    const existing = lines.filter((line) => /^#{1,6}\s+\S/.test(line)).length;
    if (existing >= 2) return { source, autoLines: new Set(), count: 0 };

    let inFence = false;
    const candidates = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      if (/^#{1,6}\s/.test(line)) continue;
      const trimmed = line.trim();
      if (!trimmed || trimmed.length > 48) continue;
      if (CHAPTER_PATTERNS.some((re) => re.test(trimmed)) && !/[。；，,;]$/.test(trimmed)) {
        candidates.push(i);
      }
    }
    if (candidates.length < 3) return { source, autoLines: new Set(), count: 0 };

    const autoLines = new Set();
    const rewritten = lines.slice();
    for (const index of candidates) {
      rewritten[index] = `## ${lines[index].trim()}`;
      autoLines.add(index);
    }
    return { source: rewritten.join('\n'), autoLines, count: candidates.length };
  }

  /* -------------------------------------------------------- image paths */

  function decodeUriSafe(str) {
    try {
      return decodeURIComponent(str);
    } catch {
      return str;
    }
  }

  function isExternalSource(src) {
    return /^(?:[a-z]+:)?\/\//i.test(src) || /^(data|blob|file|http|https|mailto):/i.test(src) || src.startsWith('#');
  }

  function joinPath(baseDir, rel) {
    if (!baseDir) return rel;
    const cleaned = rel.replace(/\\/g, '/');
    if (cleaned.startsWith('/')) return cleaned; // absolute posix path
    if (/^[a-zA-Z]:\//.test(cleaned)) return cleaned; // absolute windows path
    const base = baseDir.replace(/\\/g, '/').replace(/\/+$/, '');
    const segments = base.split('/');
    for (const part of cleaned.split('/')) {
      if (part === '.' || part === '') continue;
      if (part === '..') segments.pop();
      else segments.push(part);
    }
    return segments.join('/');
  }

  function toFileUrl(absolutePath) {
    const normalized = absolutePath.replace(/\\/g, '/');
    const prefix = normalized.startsWith('/') ? '' : '/'; // windows drive paths need a leading slash
    return `file://${prefix}${encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
  }

  function resolveImageSources(html, docDir) {
    return html.replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/gi, (full, before, src, after) => {
      if (isExternalSource(src)) return full;
      const decoded = decodeUriSafe(src);
      const resolved = joinPath(docDir, decoded);
      return `${before}${toFileUrl(resolved)}${after}`;
    });
  }

  /* ------------------------------------------------------------ pipeline */

  const md = markdownit({
    html: true,
    linkify: true,
    typographer: false,
    breaks: false,
    highlight: (code, lang) => highlightCode(code, lang, escapeHtml)
  });

  mathPlugin(md);
  headingRule(md);

  /* ---------------------------------------------------------- mermaid */

  // 围栏代码块若标注为 mermaid，就交给渲染层生成图表；生成失败时回退成源码块。
  // 原始源码放在 .mermaid 节点的文本里，渲染前由 app.js 存进 dataset，供主题切换重绘。
  const defaultFence =
    md.renderer.rules.fence ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || '').trim();
    const lang = info.split(/\s+/)[0].toLowerCase();
    // 围栏标注 mermaid / plantuml / puml 都进图表渲染流程：PlantUML 类图在 app.js 里转写。
    const plantuml = lang === 'plantuml' || lang === 'puml';
    if (lang === 'mermaid' || plantuml) {
      if (env) env.mermaidCount = (env.mermaidCount || 0) + 1;
      return (
        '<div class="mermaid-block" data-freemd="mermaid"' +
        `${plantuml ? ' data-diagram="plantuml"' : ''}>` +
        `<div class="mermaid">${escapeHtml(token.content)}</div>` +
        '</div>\n'
      );
    }
    return defaultFence(tokens, idx, options, env, self);
  };

  // Open external links in a new context; the main process intercepts them.
  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet('href') || '';
    if (/^https?:/i.test(href)) {
      tokens[idx].attrSet('rel', 'noopener noreferrer');
      tokens[idx].attrSet('data-external', 'true');
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  const SANITIZE_OPTIONS = {
    ADD_ATTR: ['target', 'rel', 'data-external', 'data-line', 'data-language'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|file|data|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'srcset'],
    KEEP_CONTENT: true
  };

  function buildMetaCard(frontMatter) {
    if (!frontMatter) return '';
    const keys = ['title', 'subtitle', 'author', 'date', 'updated', 'tags', 'category'];
    const rows = [];
    for (const key of keys) {
      const value = frontMatter[key];
      if (!value || (Array.isArray(value) && !value.length)) continue;
      const label = {
        title: '标题',
        subtitle: '副标题',
        author: '作者',
        date: '日期',
        updated: '更新',
        tags: '标签',
        category: '分类'
      }[key];
      const rendered = Array.isArray(value)
        ? value.map((tag) => `<span class="meta-tag">${escapeHtml(tag)}</span>`).join('')
        : escapeHtml(value);
      rows.push(`<div class="meta-row"><span class="meta-key">${label}</span><span class="meta-value">${rendered}</span></div>`);
    }
    if (!rows.length) return '';
    return `<div class="doc-meta" data-freemd="meta">${rows.join('')}</div>`;
  }

  function render(source, options) {
    const opts = options || {};
    const fm = parseFrontMatter(source || '');
    const detected = detectSections(fm.body);

    const env = { headings: [], mathCount: 0, mermaidCount: 0, autoLines: detected.autoLines, images: 0 };
    let html = md.render(detected.source, env);
    html = resolveImageSources(html, opts.docDir || '');

    const meta = buildMetaCard(fm.data);
    const clean = DOMPurify.sanitize(meta + html, SANITIZE_OPTIONS);

    return {
      html: clean,
      headings: env.headings,
      frontMatter: fm.data,
      stats: {
        math: env.mathCount,
        mermaid: env.mermaidCount,
        autoSections: detected.count,
        headings: env.headings.length
      }
    };
  }

  window.FreeMDMarkdown = { render, escapeHtml, stripInlineMarkup, toFileUrl, joinPath };
})();
