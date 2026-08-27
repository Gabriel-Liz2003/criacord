import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AppSettings, DesktopAPI } from '@shared/types';

const api: DesktopAPI = {
  getSettings: () => invoke<AppSettings>('get_settings'),
  saveSettings: (settings) => invoke<AppSettings>('save_settings', { patch: settings }),
  copyText: async (text) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
  },
  getGPUInfo: () => invoke('get_gpu_info'),
  configurePushToTalk: (enabled, key) => invoke('configure_push_to_talk', { enabled, key }),
  onPushToTalkState: (callback) => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<boolean>('ptt-state', (event) => { if (!disposed) callback(Boolean(event.payload)); }).then((fn) => {
      if (disposed) fn(); else unlisten = fn;
    });
    return () => { disposed = true; unlisten?.(); };
  },
  getAppVersion: () => invoke<string>('app_version')
};

window.criacord = api;
