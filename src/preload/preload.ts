import { contextBridge, ipcRenderer } from 'electron';
import { EVENT_CHANNEL, METHODS, channel, type FriedLiverApi, type MainEvent } from '../shared/ipc';

const methods = Object.fromEntries(
  METHODS.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke(channel(method), ...args)]),
);

const api = {
  ...methods,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  platform: process.platform,
  onEvent: (listener: (event: MainEvent) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, event: MainEvent) => listener(event);
    ipcRenderer.on(EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, handler);
  },
} as unknown as FriedLiverApi;

contextBridge.exposeInMainWorld('friedliver', api);
