'use strict';

/**
 * FreeMD preload — the only bridge between the sandboxed renderer and Node.
 * Every method below is explicit; nothing is exposed by default.
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron');

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('freemd', {
  platform: process.platform,

  // Resolve the on-disk path of a dropped File object (Electron >= 32).
  getPathForFile(file) {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },

  info: () => invoke('app:info'),
  welcome: () => invoke('app:welcome'),
  takeOpenPath: () => invoke('app:take-open-path'),

  getSettings: () => invoke('settings:get'),
  setSettings: (patch) => invoke('settings:set', patch),
  addRecent: (filePath) => invoke('recent:add', filePath),
  clearRecent: () => invoke('recent:clear'),

  openDialog: () => invoke('file:open-dialog'),
  readFile: (filePath) => invoke('file:read', filePath),
  writeFile: (filePath, content) => invoke('file:write', filePath, content),
  saveDialog: (suggestedName) => invoke('file:save-dialog', suggestedName),

  openFolderDialog: () => invoke('folder:open-dialog'),
  readTree: (root) => invoke('folder:tree', root),

  savePastedImage: (dataUrl, docPath) => invoke('image:save-pasted', dataUrl, docPath),

  openExternal: (url) => invoke('shell:open-external', url),
  showItemInFolder: (filePath) => invoke('shell:show-item', filePath),
  confirmUnsaved: (name) => invoke('dialog:confirm-unsaved', name),

  exportPdf: (payload) => invoke('export:pdf', payload),
  setTitle: (title) => invoke('window:set-title', title),
  confirmClose: () => invoke('window:close-confirmed'),

  onMenuAction: (callback) => subscribe('menu-action', callback),
  onOpenPath: (callback) => subscribe('open-path', callback),
  onCloseRequest: (callback) => subscribe('request-close', callback)
});
