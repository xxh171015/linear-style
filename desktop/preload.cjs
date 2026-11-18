const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('replicaDesktop', {
  platform: process.platform,
  ready: () => ipcRenderer.invoke('replica:ready'),
  loadSession: () => ipcRenderer.invoke('replica:load-session'),
  saveSession: value => ipcRenderer.invoke('replica:save-session',value),
  notify: value => ipcRenderer.invoke('replica:notify',value),
  setBadge: count => ipcRenderer.invoke('replica:badge', count),
  windowAction: action => ipcRenderer.invoke('replica:window', action),
  onCommand: callback => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('replica:command', listener);
    return () => ipcRenderer.removeListener('replica:command', listener);
  },
  onCloseRequested: callback => {
    const listener = async (_event, token) => {
      try { await callback(); ipcRenderer.send('replica:close-result', token, true); }
      catch { ipcRenderer.send('replica:close-result', token, false); }
    };
    ipcRenderer.on('replica:before-close', listener);
    return () => ipcRenderer.removeListener('replica:before-close', listener);
  },
});
