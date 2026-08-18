import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, DiscoveredRoom, ElectronAPI } from '../shared/types.js';

const api: ElectronAPI = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', settings),
  getNetworkInfo: () => ipcRenderer.invoke('network:info'),
  listDesktopSources: () => ipcRenderer.invoke('capture:list-sources'),
  selectDesktopSource: (sourceId) => ipcRenderer.invoke('capture:select-source', sourceId),
  hostRoom: (input) => ipcRenderer.invoke('room:host', input),
  stopHosting: () => ipcRenderer.invoke('room:stop-host'),
  startDiscovery: () => ipcRenderer.invoke('discovery:start'),
  stopDiscovery: () => ipcRenderer.invoke('discovery:stop'),
  onDiscoveredRooms: (callback: (rooms: DiscoveredRoom[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, rooms: DiscoveredRoom[]) => callback(rooms);
    ipcRenderer.on('discovery:rooms', listener);
    return () => ipcRenderer.removeListener('discovery:rooms', listener);
  },
  ensureFirewallRule: () => ipcRenderer.invoke('network:ensure-firewall'),
  copyText: (text) => ipcRenderer.invoke('clipboard:copy', text),
  getGPUInfo: () => ipcRenderer.invoke('gpu:info'),
  configurePushToTalk: (enabled, key) => ipcRenderer.invoke('ptt:configure', enabled, key),
  onPushToTalkState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, pressed: boolean) => callback(pressed);
    ipcRenderer.on('ptt:state', listener);
    return () => ipcRenderer.removeListener('ptt:state', listener);
  },
  getAppVersion: () => ipcRenderer.invoke('app:version')
};

contextBridge.exposeInMainWorld('criacord', api);
