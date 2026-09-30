const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jarvisDesktop", {
  saveServer: (url) => ipcRenderer.invoke("jarvis-save-server", url),
});
