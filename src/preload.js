const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('dump', {
  getPage: call('page:get'),
  savePage: call('page:save'),
  counts: call('days:counts'),
  recent: call('days:recent'),
  addPaths: call('add:paths'),
  addBuffer: call('add:buffer'),
  openFile: call('file:open'),
  revealFile: call('file:reveal'),
  openUrl: call('url:open'),
  fetchTitle: call('url:title'),
  search: call('search'),
  getSettings: call('settings:get'),
  setSettings: call('settings:set'),
  chooseVault: call('vault:choose'),
  openVault: call('vault:open'),
  pickFiles: call('pick:files'),
  hide: call('window:hide'),
  flushed: () => ipcRenderer.send('flushed'),
  pathFor: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  on: (channel, fn) => {
    const allowed = ['go-today', 'vault:changed', 'open-settings', 'flush'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_e, ...args) => fn(...args));
  },
});
