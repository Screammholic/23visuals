const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
   minimize: () => ipcRenderer.invoke('window:minimize'),
   maximize: () => ipcRenderer.invoke('window:maximize'),
   close: () => ipcRenderer.invoke('window:close'),

   getSettings: () => ipcRenderer.invoke('settings:get'),
   saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
   config: () => ipcRenderer.invoke('launcher:config'),

   version: () => ipcRenderer.invoke('launcher:version'),
   play: () => ipcRenderer.invoke('launcher:play'),
   mods: () => ipcRenderer.invoke('launcher:mods'),

   openFolder: () => ipcRenderer.invoke('launcher:openFolder'),
   openLogs: () => ipcRenderer.invoke('launcher:logs'),
   openDiscord: () => ipcRenderer.invoke('launcher:discord'),
   chooseFolder: () => ipcRenderer.invoke('launcher:chooseFolder'),

   onProgress: (callback) => ipcRenderer.on('launcher:progress', (_event, data) => callback(data)),
   onStatus: (callback) => ipcRenderer.on('launcher:status', (_event, data) => callback(data)),
   onLog: (callback) => ipcRenderer.on('game:log', (_event, line) => callback(line))
});