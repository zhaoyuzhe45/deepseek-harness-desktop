const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  minimizeStartup: () => ipcRenderer.invoke('startup:minimize'),
  closeStartup: () => ipcRenderer.invoke('startup:close'),
  getCloseBehavior: () => ipcRenderer.invoke('settings:get-close-behavior'),
  setCloseBehavior: (value) => ipcRenderer.invoke('settings:set-close-behavior', value),
  retryService: () => ipcRenderer.invoke('service:retry')
});
