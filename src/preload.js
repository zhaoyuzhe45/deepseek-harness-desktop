const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getCloseBehavior: () => ipcRenderer.invoke('settings:get-close-behavior'),
  setCloseBehavior: (value) => ipcRenderer.invoke('settings:set-close-behavior', value),
  retryService: () => ipcRenderer.invoke('service:retry')
});
