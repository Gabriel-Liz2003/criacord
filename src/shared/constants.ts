import type { SharePreset } from './types.js';

export const SIGNALING_BASE_URL = (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.replace(/\/$/, '') || 'wss://router.metapage.io';

export const STUN_URLS = [
  'stun:stun.cloudflare.com:3478',
  'stun:stun.l.google.com:19302'
];

export const SHARE_PRESETS: SharePreset[] = [
  { label: '720p30', width: 1280, height: 720, fps: 30, bitrateMbps: 5 },
  { label: '720p60', width: 1280, height: 720, fps: 60, bitrateMbps: 8 },
  { label: '1080p30', width: 1920, height: 1080, fps: 30, bitrateMbps: 8 },
  { label: '1080p60', width: 1920, height: 1080, fps: 60, bitrateMbps: 12 },
  { label: '1440p30', width: 2560, height: 1440, fps: 30, bitrateMbps: 16 },
  { label: '1440p60', width: 2560, height: 1440, fps: 60, bitrateMbps: 24 }
];
