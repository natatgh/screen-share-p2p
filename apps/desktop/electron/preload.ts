import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("lumenDesktop", {
  listSources: () => ipcRenderer.invoke("sources:list"),
  selectSource: (id: string) => ipcRenderer.invoke("sources:select", id),
  startAppAudio: () => ipcRenderer.invoke("audio:start"),
  stopAppAudio: () => ipcRenderer.invoke("audio:stop"),
  onAudioChunk: (callback: (data: Uint8Array) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: Uint8Array) => callback(new Uint8Array(data));
    ipcRenderer.on("audio:chunk", listener);
    return () => ipcRenderer.removeListener("audio:chunk", listener);
  },
  onAudioError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("audio:error", listener);
    return () => ipcRenderer.removeListener("audio:error", listener);
  },
  onUpdate: (callback: (status: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: string) => callback(status);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  getVersion: () => ipcRenderer.invoke("app:version"),
  openReleases: () => ipcRenderer.invoke("app:releases"),
});
