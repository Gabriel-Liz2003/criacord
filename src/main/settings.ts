import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AppSettings } from '../shared/types.js';

const defaults: AppSettings = {
  displayName: '',
  pushToTalk: false,
  pushToTalkKey: 'Space',
  voiceActivity: true,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: false,
  micBitrateKbps: 96
};

function filePath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): AppSettings {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(), 'utf8')) as Partial<AppSettings>;
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch };
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}
