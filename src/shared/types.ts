export type CodecPreference = 'auto' | 'AV1' | 'H264';

export interface AppSettings {
  displayName: string;
  inputDeviceId?: string;
  outputDeviceId?: string;
  pushToTalk: boolean;
  pushToTalkKey: string;
  voiceActivity: boolean;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  micBitrateKbps: number;
}

export interface NetworkInterfaceInfo {
  name: string;
  address: string;
  netmask: string;
  cidr?: string;
  isRadmin: boolean;
  score: number;
}

export interface NetworkInfo {
  interfaces: NetworkInterfaceInfo[];
  preferred?: NetworkInterfaceInfo;
  radminDetected: boolean;
}

export interface DesktopSourceInfo {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  appIconDataUrl?: string;
  kind: 'screen' | 'window';
}

export interface HostedRoom {
  roomCode: string;
  roomName: string;
  inviteCode: string;
  hostAddress: string;
  port: number;
  hasPassword: boolean;
}

export interface DiscoveredRoom {
  roomCode: string;
  roomName: string;
  hostAddress: string;
  port: number;
  hasPassword: boolean;
  lastSeen: number;
}

export interface InvitePayload {
  v: 1;
  host: string;
  port: number;
  room: string;
}

export interface ChatMessage {
  id: string;
  from: string;
  displayName: string;
  text: string;
  timestamp: number;
}

export type SignalPayload = RTCSessionDescriptionInit | RTCIceCandidateInit;

export type WireMessage =
  | { type: 'auth-challenge'; required: boolean; salt?: string; nonce: string; iterations: number }
  | { type: 'join'; roomCode: string; displayName: string; clientId: string; passwordProof?: string }
  | { type: 'welcome'; selfId: string; roomName: string; peers: Array<{ id: string; displayName: string }>; chatHistory?: ChatMessage[] }
  | { type: 'peer-joined'; peer: { id: string; displayName: string } }
  | { type: 'peer-left'; peerId: string }
  | { type: 'signal'; from?: string; to: string; signalType: 'offer' | 'answer' | 'ice'; payload: SignalPayload }
  | { type: 'presence'; from?: string; to?: string; speaking?: boolean; sharing?: boolean; muted?: boolean; deafened?: boolean }
  | { type: 'chat'; text: string; from?: string; displayName?: string; timestamp?: number; id?: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'ping'; t: number }
  | { type: 'pong'; t: number };

export interface Participant {
  id: string;
  displayName: string;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
  sharing: boolean;
  volume: number;
  streamVolume: number;
  streamMuted: boolean;
  micStream?: MediaStream;
  screenStream?: MediaStream;
}

export interface SharePreset {
  label: string;
  width: number;
  height: number;
  fps: number;
  bitrateMbps: number;
}

export interface StreamStats {
  resolution: string;
  fps: number;
  bitrateMbps: number;
  rttMs: number;
  jitterMs: number;
  packetLossPercent: number;
  codec: string;
  framesDropped: number;
  framesSent: number;
  encoderImplementation?: string;
  qualityLimitationReason?: string;
  timestamp: number;
}

export interface ElectronAPI {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: Partial<AppSettings>): Promise<AppSettings>;
  getNetworkInfo(): Promise<NetworkInfo>;
  listDesktopSources(): Promise<DesktopSourceInfo[]>;
  selectDesktopSource(sourceId: string | null): Promise<void>;
  hostRoom(input: { roomName: string; password?: string }): Promise<HostedRoom>;
  stopHosting(): Promise<void>;
  startDiscovery(): Promise<DiscoveredRoom[]>;
  stopDiscovery(): Promise<void>;
  onDiscoveredRooms(callback: (rooms: DiscoveredRoom[]) => void): () => void;
  ensureFirewallRule(): Promise<{ ok: boolean; message: string }>;
  copyText(text: string): Promise<void>;
  getGPUInfo(): Promise<{ featureStatus: Record<string, string>; basicInfo: unknown; supportedVideoCodecs: string[] }>;
  configurePushToTalk(enabled: boolean, key: string): Promise<{ ok: boolean; global: boolean; message: string }>;
  onPushToTalkState(callback: (pressed: boolean) => void): () => void;
  getAppVersion(): Promise<string>;
}

declare global {
  interface Window {
    criacord: ElectronAPI;
  }
}
