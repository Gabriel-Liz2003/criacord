import type { SharePreset } from './types.js';

export const SIGNALING_PORT = 43187;
export const DISCOVERY_PORT = 43188;
export const DISCOVERY_MAGIC = 'CRIACORD_DISCOVERY_V1';

export const SHARE_PRESETS: SharePreset[] = [
  { label: '720p30', width: 1280, height: 720, fps: 30, bitrateMbps: 5 },
  { label: '720p60', width: 1280, height: 720, fps: 60, bitrateMbps: 8 },
  { label: '1080p30', width: 1920, height: 1080, fps: 30, bitrateMbps: 8 },
  { label: '1080p60', width: 1920, height: 1080, fps: 60, bitrateMbps: 12 },
  { label: '1440p60', width: 2560, height: 1440, fps: 60, bitrateMbps: 24 }
];
