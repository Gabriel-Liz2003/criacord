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

export interface RoomEndpoint {
  roomCode: string;
  roomName?: string;
  password?: string;
  isHost?: boolean;
}

export interface InvitePayload {
  v: 2;
  room: string;
  roomName?: string;
  hasPassword?: boolean;
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
  | { type: 'hello'; roomName?: string }
  | { type: 'hello-ack'; roomName?: string }
  | { type: 'bye' }
  | { type: 'signal'; to: string; signalType: 'offer' | 'answer' | 'ice'; payload: SignalPayload }
  | { type: 'presence'; to?: string; speaking?: boolean; sharing?: boolean; muted?: boolean; deafened?: boolean }
  | { type: 'chat'; text: string; displayName?: string; timestamp?: number; id?: string }
  | { type: 'chat-sync'; messages: ChatMessage[] }
  | { type: 'ping'; t: number };

export interface RouterEnvelope {
  v: 2;
  from: string;
  displayName: string;
  to?: string;
  sentAt: number;
  message: WireMessage;
}

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

export interface DesktopAPI {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: Partial<AppSettings>): Promise<AppSettings>;
  copyText(text: string): Promise<void>;
  getGPUInfo(): Promise<{ featureStatus: Record<string, string>; basicInfo: unknown; supportedVideoCodecs: string[] }>;
  configurePushToTalk(enabled: boolean, key: string): Promise<{ ok: boolean; global: boolean; message: string }>;
  onPushToTalkState(callback: (pressed: boolean) => void): () => void;
  getAppVersion(): Promise<string>;
}

declare global {
  interface Window {
    criacord: DesktopAPI;
  }
}
