/**
 * Copies the third-party runtime assets required by the renderer into
 * src/renderer/vendor so the packaged app is fully offline capable.
 *
 * Run automatically after `npm install` (postinstall) or manually via `npm run vendor`.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NODE = path.join(ROOT, 'node_modules');
const OUT = path.join(ROOT, 'src', 'renderer', 'vendor');

const COPY = [
  // markdown-it
  ['markdown-it/dist/markdown-it.min.js', 'markdown-it/markdown-it.min.js'],
  // DOMPurify
  ['dompurify/dist/purify.min.js', 'dompurify/purify.min.js'],
  // KaTeX (js + css + woff2 fonts only)
  ['katex/dist/katex.min.js', 'katex/katex.min.js'],
  ['katex/dist/katex.min.css', 'katex/katex.min.css'],
  // highlight.js (prebuilt browser bundle)
  ['@highlightjs/cdn-assets/highlight.min.js', 'hljs/highlight.min.js'],
  ['@highlightjs/cdn-assets/styles/github.min.css', 'hljs/github.min.css'],
  ['@highlightjs/cdn-assets/styles/github-dark.min.css', 'hljs/github-dark.min.css'],
  // Mermaid (diagrams: flowchart / sequence / class / state / ER / gantt ...)
  ['mermaid/dist/mermaid.min.js', 'mermaid/mermaid.min.js'],
  // CodeMirror 5
  ['codemirror/lib/codemirror.js', 'codemirror/codemirror.js'],
  ['codemirror/lib/codemirror.css', 'codemirror/codemirror.css'],
  ['codemirror/mode/markdown/markdown.js', 'codemirror/markdown.js'],
  ['codemirror/addon/mode/overlay.js', 'codemirror/overlay.js'],
  ['codemirror/mode/gfm/gfm.js', 'codemirror/gfm.js'],
  ['codemirror/mode/xml/xml.js', 'codemirror/xml.js'],
  ['codemirror/mode/javascript/javascript.js', 'codemirror/javascript.js'],
  ['codemirror/mode/css/css.js', 'codemirror/css.js'],
  ['codemirror/addon/edit/matchbrackets.js', 'codemirror/matchbrackets.js'],
  ['codemirror/addon/edit/closebrackets.js', 'codemirror/closebrackets.js'],
  ['codemirror/addon/selection/active-line.js', 'codemirror/active-line.js']
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function copyKatexFonts() {
  const from = path.join(NODE, 'katex', 'dist', 'fonts');
  const to = path.join(OUT, 'katex', 'fonts');
  if (!fs.existsSync(from)) return 0;
  ensureDir(to);
  let count = 0;
  for (const name of fs.readdirSync(from)) {
    if (!/\.woff2$/.test(name)) continue;
    copyFile(path.join(from, name), path.join(to, name));
    count += 1;
  }
  return count;
}

function main() {
  if (!fs.existsSync(NODE)) {
    console.error('[vendor] node_modules missing — run `npm install` first.');
    process.exit(1);
  }
  ensureDir(OUT);
  let copied = 0;
  for (const [from, to] of COPY) {
    const src = path.join(NODE, from);
    if (!fs.existsSync(src)) {
      console.warn('[vendor] missing:', from);
      continue;
    }
    copyFile(src, path.join(OUT, to));
    copied += 1;
  }
  const fonts = copyKatexFonts();
  console.log(`[vendor] copied ${copied} files and ${fonts} katex fonts -> ${OUT}`);
}

main();
