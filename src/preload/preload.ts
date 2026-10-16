import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type FriedLiverApi, type MainEvent } from '../shared/ipc';

const invoke =
  <K extends keyof typeof CHANNELS>(channel: K) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(CHANNELS[channel], ...args);

const api: FriedLiverApi = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  initialFolder: invoke('initialFolder'),
  openFolder: invoke('openFolder'),
  listDir: invoke('listDir'),
  readFile: invoke('readFile'),
  writeFile: invoke('writeFile'),
  agents: invoke('agents'),
  createChat: invoke('createChat'),
  prompt: invoke('prompt'),
  cancel: invoke('cancel'),
  signIn: invoke('signIn'),
  respondPermission: invoke('respondPermission'),
  respondWrite: invoke('respondWrite'),
  respondCommand: invoke('respondCommand'),
  stopAgents: invoke('stopAgents'),
  memory: invoke('memory'),
  onEvent: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, event: MainEvent) => listener(event);
    ipcRenderer.on(CHANNELS.event, handler);
    return () => ipcRenderer.removeListener(CHANNELS.event, handler);
  },
};

contextBridge.exposeInMainWorld('friedliver', api);
