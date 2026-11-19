#!/usr/bin/env node
'use strict';

/**
 * Builds a runnable macOS .app zip without a Mac.
 *
 * The script downloads the official Electron darwin build, injects the FreeMD
 * payload, rewrites Info.plist, and repackages the bundle as a zip. The result
 * is unsigned — users open it with right-click → Open, or `xattr -cr FreeMD.app`.
 *
 * Requires: curl, unzip, zip (Linux / macOS).
 *
 *   node scripts/build-mac-zip.js --arch x64 --arch arm64
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const APP_NAME = 'FreeMD';
const BUNDLE_ID = 'ai.cypowerai.freemd';
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;

function electronVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
  } catch {
    const declared = (pkg.devDependencies || {}).electron || '';
    return declared.replace(/^[~^]/, '');
  }
}

function parseArgs(argv) {
  const arches = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--arch' && argv[i + 1]) arches.push(argv[i + 1]);
  }
  return arches.length ? arches : ['x64', 'arm64'];
}

function run(cmd, args, options) {
  execFileSync(cmd, args, { stdio: 'inherit', ...(options || {}) });
}

function download(url, target) {
  if (fs.existsSync(target) && fs.statSync(target).size > 10 * 1024 * 1024) {
    console.log(`[mac] cached ${path.basename(target)}`);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  console.log(`[mac] downloading ${url}`);
  run('curl', ['-L', '--fail', '--retry', '4', '--retry-delay', '3', '-o', target, url]);
}

function setPlistKey(plist, key, value) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  if (pattern.test(plist)) return plist.replace(pattern, `$1${value}$2`);
  return plist.replace(/<\/dict>\s*<\/plist>/, `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>\n</plist>`);
}

function buildArch(arch, version, mirror) {
  const zipName = `electron-v${version}-darwin-${arch}.zip`;
  const cacheDir = path.join(os.homedir(), '.cache', 'freemd-electron');
  const archive = path.join(cacheDir, zipName);
  download(`${mirror}${version}/${zipName}`, archive);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `freemd-mac-${arch}-`));
  run('unzip', ['-q', archive, '-d', workDir]);

  const sourceApp = path.join(workDir, 'Electron.app');
  const targetApp = path.join(workDir, `${APP_NAME}.app`);
  if (!fs.existsSync(sourceApp)) throw new Error('Electron.app not found in the downloaded archive');
  fs.renameSync(sourceApp, targetApp);

  // Rename the executable so Activity Monitor shows the right name.
  const macOsDir = path.join(targetApp, 'Contents', 'MacOS');
  const binary = path.join(macOsDir, 'Electron');
  if (fs.existsSync(binary)) fs.renameSync(binary, path.join(macOsDir, APP_NAME));

  // Inject the application payload.
  const resourcesDir = path.join(targetApp, 'Contents', 'Resources');
  const appDir = path.join(resourcesDir, 'app');
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(appDir, 'package.json'));
  fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(appDir, 'LICENSE'));
  fs.cpSync(path.join(ROOT, 'src'), path.join(appDir, 'src'), { recursive: true });

  // Icon
  const icns = path.join(ROOT, 'build', 'icon.icns');
  if (fs.existsSync(icns)) {
    fs.copyFileSync(icns, path.join(resourcesDir, `${APP_NAME}.icns`));
    const legacyIcons = fs.readdirSync(resourcesDir).filter((name) => name.endsWith('.icns') && name !== `${APP_NAME}.icns`);
    for (const name of legacyIcons) fs.rmSync(path.join(resourcesDir, name), { force: true });
  }

  // Info.plist
  const plistPath = path.join(targetApp, 'Contents', 'Info.plist');
  let plist = fs.readFileSync(plistPath, 'utf8');
  plist = setPlistKey(plist, 'CFBundleExecutable', APP_NAME);
  plist = setPlistKey(plist, 'CFBundleName', APP_NAME);
  plist = setPlistKey(plist, 'CFBundleDisplayName', APP_NAME);
  plist = setPlistKey(plist, 'CFBundleIdentifier', BUNDLE_ID);
  plist = setPlistKey(plist, 'CFBundleShortVersionString', VERSION);
  plist = setPlistKey(plist, 'CFBundleVersion', VERSION);
  plist = setPlistKey(plist, 'CFBundleIconFile', `${APP_NAME}.icns`);
  plist = setPlistKey(plist, 'LSApplicationCategoryType', 'public.app-category.productivity');
  plist = setPlistKey(plist, 'NSHumanReadableCopyright', pkg.build.copyright || '');
  fs.writeFileSync(plistPath, plist, 'utf8');

  // Validate plist is still XML-parseable (binary plists are not supported here).
  if (!plist.trimStart().startsWith('<?xml')) {
    throw new Error('Info.plist is not XML; cannot rewrite it safely on this platform');
  }

  const outDir = path.join(ROOT, 'release');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${APP_NAME}-${VERSION}-mac-${arch}.zip`);
  fs.rmSync(outFile, { force: true });
  run('zip', ['-qry', outFile, `${APP_NAME}.app`], { cwd: workDir });

  fs.rmSync(workDir, { recursive: true, force: true });
  console.log(`[mac] ${arch} -> ${outFile} (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(1)} MB)`);
}

function main() {
  const arches = parseArgs(process.argv.slice(2));
  const version = electronVersion();
  const mirror = process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/';
  console.log(`[mac] electron ${version}, archs: ${arches.join(', ')}`);
  for (const arch of arches) buildArch(arch, version, mirror);
}

main();
