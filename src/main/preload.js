const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => { console.log('preload: openFile called'); return ipcRenderer.invoke('dialog:openFile'); },
  saveFile: (data) => ipcRenderer.invoke('dialog:saveFile', data),
  exportPDF: (html) => ipcRenderer.invoke('export:pdf', html),
  saveHTML: (html) => ipcRenderer.invoke('dialog:saveHTML', html),
  on: (channel, cb) => {
    const listener = (e, ...args) => cb(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  getLang: () => ipcRenderer.invoke('config:getLang'),
  setLang: (lang) => ipcRenderer.invoke('config:setLang', lang),
  // Simple event for future extensions
});
