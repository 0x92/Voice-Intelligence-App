const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("voice", {
  transcribe: (payload) => ipcRenderer.invoke("voice:transcribe", payload),
  enrich: (payload) => ipcRenderer.invoke("voice:enrich", payload),
  onToggleRecord: (handler) => ipcRenderer.on("voice:toggle-record", handler),
  setRecordingState: (payload) => ipcRenderer.send("voice:recording-state", payload),
});
