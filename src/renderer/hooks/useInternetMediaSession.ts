import { useCallback, useEffect, useRef, useState } from 'react';
import { SIGNALING_BASE_URL, STUN_URLS } from '@shared/constants';
import type { AppSettings, ChatMessage, CodecPreference, Participant, RoomEndpoint, RouterEnvelope, StreamStats, WireMessage } from '@shared/types';
import { getSupportedVideoCodecs, preferVideoCodec, readOutboundVideoStats, tuneSender } from '@renderer/lib/media';

interface ShareOptions { width: number; height: number; fps: number; bitrateMbps: number; codec: CodecPreference; audio: boolean }
interface PeerRuntime {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  control?: RTCDataChannel;
  screenSender?: RTCRtpSender;
  screenAudioSender?: RTCRtpSender;
  remoteMicStream?: MediaStream;
  remoteScreenStream?: MediaStream;
  sample?: { bytes: number; at: number };
  recvSample?: { bytes: number; at: number };
  videoBitrate?: number;
  disconnectedTimer?: number;
}

function clientId(): string {
  const stored = localStorage.getItem('criacord.clientId');
  if (stored) return stored;
  const id = crypto.randomUUID().replace(/-/g, '');
  localStorage.setItem('criacord.clientId', id);
  return id;
}

function participantDefaults(peer: { id: string; displayName: string }): Participant {
  return { ...peer, speaking: false, muted: false, deafened: false, sharing: false, volume: 1, streamVolume: 1, streamMuted: false };
}

function addUniqueTrack(stream: MediaStream | undefined, track: MediaStreamTrack): MediaStream {
  const target = stream ?? new MediaStream();
  if (!target.getTracks().some((item) => item.id === track.id)) target.addTrack(track);
  return target;
}

async function roomChannel(endpoint: RoomEndpoint): Promise<string> {
  const base = endpoint.roomCode.toLowerCase();
  if (!endpoint.password) return `criacord-${base}`;
  const bytes = new TextEncoder().encode(`${endpoint.roomCode}:${endpoint.password}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const suffix = Array.from(digest.slice(0, 8), (v) => v.toString(16).padStart(2, '0')).join('');
  return `criacord-${base}-${suffix}`;
}

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: STUN_URLS }];
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;
  if (turnUrl && turnUsername && turnCredential) servers.push({ urls: turnUrl.split(',').map((v) => v.trim()).filter(Boolean), username: turnUsername, credential: turnCredential });
  return servers;
}

function mergeChat(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    if (!message?.id || typeof message.text !== 'string' || message.text.length > 1000) continue;
    map.set(message.id, { ...message, text: message.text.slice(0, 1000), displayName: String(message.displayName ?? 'Peer').slice(0, 80) });
  }
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-100);
}

export function useInternetMediaSession(settings: AppSettings | null) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [selfSpeaking, setSelfSpeaking] = useState(false);
  const [selfId, setSelfId] = useState('');
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | undefined>();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [shareStats, setShareStats] = useState<Record<string, StreamStats>>({});
  const [supportedCodecs] = useState(() => getSupportedVideoCodecs());

  const wsRef = useRef<WebSocket>();
  const selfIdRef = useRef('');
  const peersRef = useRef(new Map<string, PeerRuntime>());
  const micStreamRef = useRef<MediaStream>();
  const screenStreamRef = useRef<MediaStream>();
  const endpointRef = useRef<RoomEndpoint>();
  const pttPressedRef = useRef(false);
  const mutedRef = useRef(false);
  const statsTimerRef = useRef<number>();
  const vadTimerRef = useRef<number>();
  const heartbeatTimerRef = useRef<number>();
  const reconnectTimerRef = useRef<number>();
  const reconnectAttemptsRef = useRef(0);
  const manualDisconnectRef = useRef(false);
  const shareOptionsRef = useRef<ShareOptions>();
  const chatRef = useRef<ChatMessage[]>([]);

  useEffect(() => { chatRef.current = chatMessages; }, [chatMessages]);

  const patchParticipant = useCallback((id: string, patch: Partial<Participant>) => {
    setParticipants((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const sendEnvelope = useCallback((message: WireMessage, to?: string) => {
    const ws = wsRef.current;
    if (!settings || !selfIdRef.current || ws?.readyState !== WebSocket.OPEN) return false;
    const envelope: RouterEnvelope = { v: 2, from: selfIdRef.current, displayName: settings.displayName.slice(0, 80), to, sentAt: Date.now(), message };
    const serialized = JSON.stringify(envelope);
    if (serialized.length > 180_000) return false;
    ws.send(serialized);
    return true;
  }, [settings]);

  const configureMicEnabled = useCallback(() => {
    const enabled = !mutedRef.current && (!settings?.pushToTalk || pttPressedRef.current);
    for (const track of micStreamRef.current?.getAudioTracks() ?? []) track.enabled = enabled;
  }, [settings?.pushToTalk]);

  const getMic = useCallback(async () => {
    if (micStreamRef.current) return micStreamRef.current;
    if (!settings) throw new Error('Configurações não carregadas.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: settings.inputDeviceId ? { exact: settings.inputDeviceId } : undefined,
        sampleRate: 48000, channelCount: 1,
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl
      }, video: false });
      micStreamRef.current = stream;
      configureMicEnabled();
      return stream;
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : '';
      if (name === 'NotAllowedError') throw new Error('Acesso ao microfone bloqueado. Permita o CriaCord nas configurações de privacidade do Windows.');
      if (name === 'NotFoundError') throw new Error('Nenhum microfone foi encontrado.');
      throw new Error(`Não foi possível iniciar o microfone: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }, [configureMicEnabled, settings]);

  const attachControl = useCallback((peerId: string, channel: RTCDataChannel) => {
    const runtime = peersRef.current.get(peerId);
    if (runtime) runtime.control = channel;
    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as { type?: string; stats?: StreamStats };
        if (msg.type === 'receiver-screen-stats' && msg.stats) setShareStats((prev) => ({ ...prev, [peerId]: { ...msg.stats!, rttMs: prev[peerId]?.rttMs || msg.stats!.rttMs } }));
      } catch { /* malformed peer frame */ }
    };
  }, []);

  const sendSignal = useCallback((peerId: string, signalType: 'offer' | 'answer' | 'ice', payload: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
    sendEnvelope({ type: 'signal', to: peerId, signalType, payload }, peerId);
  }, [sendEnvelope]);

  const createPeer = useCallback(async (peerId: string) => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;
    const mic = await getMic();
    const runtime: PeerRuntime = {
      pc: new RTCPeerConnection({ iceServers: iceServers(), bundlePolicy: 'max-bundle', iceCandidatePoolSize: 4 }),
      polite: selfIdRef.current.localeCompare(peerId) > 0,
      makingOffer: false, ignoreOffer: false, isSettingRemoteAnswerPending: false
    };
    const { pc } = runtime;
    peersRef.current.set(peerId, runtime);

    for (const track of mic.getTracks()) {
      const sender = pc.addTrack(track, mic);
      if (track.kind === 'audio') void tuneSender(sender, (settings?.micBitrateKbps ?? 96) * 1000);
    }
    if (screenStreamRef.current) {
      for (const track of screenStreamRef.current.getTracks()) {
        const sender = pc.addTrack(track, screenStreamRef.current);
        if (track.kind === 'video') {
          runtime.screenSender = sender;
          const opts = shareOptionsRef.current;
          runtime.videoBitrate = opts ? opts.bitrateMbps * 1_000_000 : undefined;
          const transceiver = pc.getTransceivers().find((t) => t.sender === sender);
          if (transceiver && opts) preferVideoCodec(transceiver, opts.codec);
          if (opts) void tuneSender(sender, runtime.videoBitrate!, opts.fps);
        } else {
          runtime.screenAudioSender = sender;
          void tuneSender(sender, 160_000);
        }
      }
    }

    pc.onicecandidate = ({ candidate }) => { if (candidate) sendSignal(peerId, 'ice', candidate.toJSON()); };
    pc.oniceconnectionstatechange = () => {
      console.info('[ICE]', peerId, pc.iceConnectionState);
      if (runtime.disconnectedTimer) window.clearTimeout(runtime.disconnectedTimer);
      if (pc.iceConnectionState === 'disconnected') {
        runtime.disconnectedTimer = window.setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') { console.info('[ICE] restart after disconnect', peerId); pc.restartIce(); }
        }, 4000);
      } else if (pc.iceConnectionState === 'failed') {
        console.warn('[ICE] failed, restarting', peerId); pc.restartIce();
      }
    };
    pc.onconnectionstatechange = () => {
      console.info('[PeerConnection]', peerId, pc.connectionState);
      if (pc.connectionState === 'failed') pc.restartIce();
    };
    pc.ondatachannel = (event) => attachControl(peerId, event.channel);
    attachControl(peerId, pc.createDataChannel('criacord-control', { ordered: false, maxRetransmits: 0 }));

    pc.ontrack = (event) => {
      let role: 'mic' | 'screen';
      if (event.track.kind === 'video') role = 'screen';
      else {
        const audioTransceivers = pc.getTransceivers().filter((t) => t.receiver.track.kind === 'audio');
        const audioIndex = audioTransceivers.indexOf(event.transceiver);
        role = audioIndex > 0 || event.streams.some((s) => s.getVideoTracks().length > 0) ? 'screen' : 'mic';
      }
      if (role === 'screen') {
        runtime.remoteScreenStream = addUniqueTrack(runtime.remoteScreenStream, event.track);
        patchParticipant(peerId, { screenStream: runtime.remoteScreenStream, sharing: true });
      } else {
        runtime.remoteMicStream = addUniqueTrack(runtime.remoteMicStream, event.track);
        patchParticipant(peerId, { micStream: runtime.remoteMicStream });
      }
      event.track.onended = () => {
        console.info('[Track ended]', peerId, role, event.track.kind);
        if (role === 'screen') {
          runtime.remoteScreenStream?.removeTrack(event.track);
          if (event.track.kind === 'video' || !runtime.remoteScreenStream?.getVideoTracks().length) {
            runtime.remoteScreenStream = undefined;
            patchParticipant(peerId, { screenStream: undefined, sharing: false });
          }
        } else {
          runtime.remoteMicStream?.removeTrack(event.track);
          patchParticipant(peerId, { micStream: runtime.remoteMicStream?.getAudioTracks().length ? runtime.remoteMicStream : undefined });
        }
      };
    };

    pc.onnegotiationneeded = async () => {
      console.info('[Negotiation]', peerId, 'needed');
      try {
        runtime.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) sendSignal(peerId, 'offer', pc.localDescription.toJSON());
      } catch (cause) { console.error('[Negotiation]', cause); }
      finally { runtime.makingOffer = false; }
    };
    return runtime;
  }, [attachControl, getMic, patchParticipant, sendSignal, settings?.micBitrateKbps]);

  const handleSignal = useCallback(async (from: string, msg: Extract<WireMessage, { type: 'signal' }>) => {
    const runtime = await createPeer(from);
    const { pc } = runtime;
    try {
      if (msg.signalType === 'ice') {
        try { await pc.addIceCandidate(msg.payload as RTCIceCandidateInit); }
        catch (cause) { if (!runtime.ignoreOffer) throw cause; }
        return;
      }
      const description = msg.payload as RTCSessionDescriptionInit;
      const readyForOffer = !runtime.makingOffer && (pc.signalingState === 'stable' || runtime.isSettingRemoteAnswerPending);
      const collision = description.type === 'offer' && !readyForOffer;
      runtime.ignoreOffer = !runtime.polite && collision;
      if (runtime.ignoreOffer) return;
      runtime.isSettingRemoteAnswerPending = description.type === 'answer';
      await pc.setRemoteDescription(description);
      runtime.isSettingRemoteAnswerPending = false;
      if (description.type === 'offer') {
        await pc.setLocalDescription();
        if (pc.localDescription) sendSignal(from, 'answer', pc.localDescription.toJSON());
      }
    } catch (cause) {
      console.error('[Signal]', cause);
      setError('Falha ao negociar a conexão P2P com um participante. Tentando recuperar automaticamente.');
      pc.restartIce();
    }
  }, [createPeer, sendSignal]);

  const removePeer = useCallback((peerId: string) => {
    const runtime = peersRef.current.get(peerId);
    if (runtime?.disconnectedTimer) window.clearTimeout(runtime.disconnectedTimer);
    runtime?.pc.close();
    peersRef.current.delete(peerId);
    setParticipants((prev) => prev.filter((p) => p.id !== peerId));
    setShareStats((prev) => { const next = { ...prev }; delete next[peerId]; return next; });
  }, []);

  const handleEnvelope = useCallback(async (raw: string) => {
    let envelope: RouterEnvelope;
    try { envelope = JSON.parse(raw) as RouterEnvelope; } catch { return; }
    if (!envelope || envelope.v !== 2 || !envelope.from || envelope.from === selfIdRef.current) return;
    if (envelope.to && envelope.to !== selfIdRef.current) return;
    if (typeof envelope.displayName !== 'string' || envelope.displayName.length > 80 || Date.now() - Number(envelope.sentAt) > 120_000) return;
    const msg = envelope.message;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

    if (msg.type === 'hello' || msg.type === 'hello-ack') {
      setParticipants((prev) => prev.some((p) => p.id === envelope.from) ? prev : [...prev, participantDefaults({ id: envelope.from, displayName: envelope.displayName })]);
      if (msg.roomName) setRoomName((prev) => prev || msg.roomName!.slice(0, 80));
      await createPeer(envelope.from);
      if (msg.type === 'hello') {
        sendEnvelope({ type: 'hello-ack', roomName: endpointRef.current?.roomName }, envelope.from);
        if (chatRef.current.length) sendEnvelope({ type: 'chat-sync', messages: chatRef.current.slice(-100) }, envelope.from);
      }
    } else if (msg.type === 'bye') removePeer(envelope.from);
    else if (msg.type === 'signal') await handleSignal(envelope.from, msg);
    else if (msg.type === 'presence') {
      const patch: Partial<Participant> = {};
      if (typeof msg.speaking === 'boolean') patch.speaking = msg.speaking;
      if (typeof msg.sharing === 'boolean') patch.sharing = msg.sharing;
      if (typeof msg.muted === 'boolean') patch.muted = msg.muted;
      if (typeof msg.deafened === 'boolean') patch.deafened = msg.deafened;
      patchParticipant(envelope.from, patch);
    } else if (msg.type === 'chat') {
      const text = String(msg.text ?? '').trim().slice(0, 1000);
      if (!text) return;
      const item: ChatMessage = { id: msg.id || `${envelope.from}-${msg.timestamp || envelope.sentAt}`, from: envelope.from, displayName: envelope.displayName, text, timestamp: Number(msg.timestamp || envelope.sentAt) };
      setChatMessages((prev) => mergeChat(prev, [item]));
    } else if (msg.type === 'chat-sync') setChatMessages((prev) => mergeChat(prev, msg.messages.slice(0, 100)));
  }, [createPeer, handleSignal, patchParticipant, removePeer, sendEnvelope]);

  const openSignaling = useCallback(async (endpoint: RoomEndpoint, reconnecting = false) => {
    const channel = await roomChannel(endpoint);
    const url = `${SIGNALING_BASE_URL}/${encodeURIComponent(channel)}`;
    console.info('[Signaling]', reconnecting ? 'reconnect' : 'connect', url.replace(channel, '<room>'));
    const ws = new WebSocket(url);
    wsRef.current = ws;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Timeout ao conectar ao signaling.')), 10_000);
      ws.onopen = () => { window.clearTimeout(timer); resolve(); };
      ws.onerror = () => { window.clearTimeout(timer); reject(new Error('Não foi possível conectar ao serviço de signaling.')); };
    });
    ws.onmessage = (event) => { if (typeof event.data === 'string') void handleEnvelope(event.data); };
    ws.onclose = () => {
      if (manualDisconnectRef.current) return;
      reconnectAttemptsRef.current += 1;
      const delay = Math.min(10_000, 500 * 2 ** Math.min(5, reconnectAttemptsRef.current));
      console.warn('[Signaling] disconnected, retry in', delay);
      reconnectTimerRef.current = window.setTimeout(() => {
        const current = endpointRef.current;
        if (current) void openSignaling(current, true).then(() => {
          reconnectAttemptsRef.current = 0;
          sendEnvelope({ type: 'hello', roomName: current.roomName });
        }).catch(() => undefined);
      }, delay);
    };
    return ws;
  }, [handleEnvelope, sendEnvelope]);

  const connect = useCallback(async (endpoint: RoomEndpoint) => {
    if (!settings?.displayName.trim()) throw new Error('Escolha um nome antes de entrar na sala.');
    manualDisconnectRef.current = false;
    endpointRef.current = endpoint;
    selfIdRef.current = clientId();
    setSelfId(selfIdRef.current);
    setRoomName(endpoint.roomName || `Sala ${endpoint.roomCode}`);
    setConnecting(true); setError(null);
    await getMic();
    try {
      await openSignaling(endpoint);
      setConnected(true); setConnecting(false); reconnectAttemptsRef.current = 0;
      console.info('[Room] joined', endpoint.roomCode);
      sendEnvelope({ type: 'hello', roomName: endpoint.roomName });
      if (heartbeatTimerRef.current) window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = window.setInterval(() => sendEnvelope({ type: 'ping', t: Date.now() }), 10_000);
    } catch (cause) {
      setConnecting(false); setError(cause instanceof Error ? cause.message : String(cause)); throw cause;
    }
  }, [getMic, openSignaling, sendEnvelope, settings?.displayName]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    sendEnvelope({ type: 'bye' });
    if (statsTimerRef.current) window.clearInterval(statsTimerRef.current);
    if (vadTimerRef.current) window.clearInterval(vadTimerRef.current);
    if (heartbeatTimerRef.current) window.clearInterval(heartbeatTimerRef.current);
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    wsRef.current?.close(); wsRef.current = undefined;
    for (const runtime of peersRef.current.values()) runtime.pc.close();
    peersRef.current.clear();
    micStreamRef.current?.getTracks().forEach((track) => track.stop()); micStreamRef.current = undefined;
    screenStreamRef.current?.getTracks().forEach((track) => track.stop()); screenStreamRef.current = undefined;
    endpointRef.current = undefined; selfIdRef.current = '';
    setParticipants([]); setConnected(false); setConnecting(false); setSharing(false); setSelfSpeaking(false); setSelfId(''); setLocalScreenStream(undefined); setChatMessages([]); setShareStats({}); setRoomName('');
    console.info('[Room] disconnected');
  }, [sendEnvelope]);

  const setMuted = useCallback((value: boolean) => {
    mutedRef.current = value; setMutedState(value);
    if (value) { setSelfSpeaking(false); sendEnvelope({ type: 'presence', speaking: false }); }
    configureMicEnabled(); sendEnvelope({ type: 'presence', muted: value });
  }, [configureMicEnabled, sendEnvelope]);

  const toggleDeaf = useCallback(() => setDeafened((prev) => { const next = !prev; sendEnvelope({ type: 'presence', deafened: next }); return next; }), [sendEnvelope]);
  const setParticipantVolume = useCallback((id: string, volume: number) => patchParticipant(id, { volume }), [patchParticipant]);
  const setParticipantStreamVolume = useCallback((id: string, streamVolume: number) => patchParticipant(id, { streamVolume }), [patchParticipant]);
  const toggleParticipantStreamMute = useCallback((id: string) => setParticipants((prev) => prev.map((p) => p.id === id ? { ...p, streamMuted: !p.streamMuted } : p)), []);

  const sendChat = useCallback((text: string) => {
    const clean = text.trim().slice(0, 1000); if (!clean || !settings) return;
    const message: ChatMessage = { id: crypto.randomUUID(), from: selfIdRef.current, displayName: settings.displayName.slice(0, 80), text: clean, timestamp: Date.now() };
    setChatMessages((prev) => mergeChat(prev, [message]));
    sendEnvelope({ type: 'chat', text: clean, id: message.id, timestamp: message.timestamp, displayName: message.displayName });
  }, [sendEnvelope, settings]);

  const stopShare = useCallback(async () => {
    const stream = screenStreamRef.current; screenStreamRef.current = undefined;
    stream?.getTracks().forEach((track) => track.stop());
    for (const runtime of peersRef.current.values()) {
      if (runtime.screenSender) { try { runtime.pc.removeTrack(runtime.screenSender); } catch {} runtime.screenSender = undefined; }
      if (runtime.screenAudioSender) { try { runtime.pc.removeTrack(runtime.screenAudioSender); } catch {} runtime.screenAudioSender = undefined; }
    }
    setSharing(false); setLocalScreenStream(undefined); shareOptionsRef.current = undefined; setShareStats({}); sendEnvelope({ type: 'presence', sharing: false });
    console.info('[Stream] stopped');
  }, [sendEnvelope]);

  const startShare = useCallback(async (options: ShareOptions) => {
    await stopShare(); setError(null);
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: options.width }, height: { ideal: options.height }, frameRate: { ideal: options.fps, max: options.fps } }, audio: options.audio });
    const video = stream.getVideoTracks()[0]; if (!video) throw new Error('A captura de vídeo não foi iniciada.');
    try { await video.applyConstraints({ width: options.width, height: options.height, frameRate: options.fps }); } catch {}
    video.contentHint = 'detail'; video.onended = () => void stopShare();
    const systemAudio = stream.getAudioTracks()[0];
    if (systemAudio) { try { await systemAudio.applyConstraints({ sampleRate: 48000, channelCount: 2 }); } catch {} }
    else if (options.audio) setError('A captura começou sem áudio do sistema. O WebView2/Windows não forneceu loopback para essa fonte; tente compartilhar a tela inteira ou outra janela.');
    screenStreamRef.current = stream; setLocalScreenStream(stream); shareOptionsRef.current = options;
    for (const runtime of peersRef.current.values()) {
      const sender = runtime.pc.addTrack(video, stream); runtime.screenSender = sender; runtime.videoBitrate = options.bitrateMbps * 1_000_000;
      const transceiver = runtime.pc.getTransceivers().find((t) => t.sender === sender); if (transceiver) preferVideoCodec(transceiver, options.codec);
      await tuneSender(sender, runtime.videoBitrate, options.fps);
      if (systemAudio) { runtime.screenAudioSender = runtime.pc.addTrack(systemAudio, stream); await tuneSender(runtime.screenAudioSender, 160_000); }
    }
    setSharing(true); sendEnvelope({ type: 'presence', sharing: true }); console.info('[Stream] started', options.width, options.height, options.fps);
  }, [sendEnvelope, stopShare]);

  useEffect(() => {
    if (!connected) return;
    statsTimerRef.current = window.setInterval(async () => {
      if (sharing && screenStreamRef.current?.getVideoTracks()[0]?.readyState !== 'live') { console.warn('[Stream] local track lost'); void stopShare(); return; }
      for (const [peerId, runtime] of peersRef.current) {
        if (sharing && runtime.screenSender) {
          try {
            const result = await readOutboundVideoStats(runtime.pc, runtime.screenSender, runtime.sample); runtime.sample = result.sample;
            setShareStats((prev) => ({ ...prev, [peerId]: result.stats }));
            if (result.stats.qualityLimitationReason === 'bandwidth' || result.stats.packetLossPercent >= 8) {
              runtime.videoBitrate = Math.max(2_000_000, Math.floor((runtime.videoBitrate ?? 8_000_000) * 0.8));
              await tuneSender(runtime.screenSender, runtime.videoBitrate, shareOptionsRef.current?.fps ?? 30);
              setError(`Conexão instável com ${participants.find((p) => p.id === peerId)?.displayName ?? 'peer'}; bitrate reduzido automaticamente para ${(runtime.videoBitrate / 1_000_000).toFixed(1)} Mbps.`);
            }
          } catch { /* transient renegotiation */ }
        }
        if (runtime.control?.readyState === 'open') {
          try {
            const report = await runtime.pc.getStats(); let inbound: any; let codec: any;
            for (const stat of report.values()) if (stat.type === 'inbound-rtp' && stat.kind === 'video' && !stat.isRemote) inbound = stat;
            if (inbound) {
              if (inbound.codecId) codec = report.get(inbound.codecId);
              const now = performance.now(); const bytes = Number(inbound.bytesReceived ?? 0); const elapsed = runtime.recvSample ? Math.max(1, now - runtime.recvSample.at) : 1000;
              const bitrate = runtime.recvSample ? ((bytes - runtime.recvSample.bytes) * 8) / elapsed / 1000 : 0; runtime.recvSample = { bytes, at: now };
              const packets = Number(inbound.packetsReceived ?? 0); const lost = Math.max(0, Number(inbound.packetsLost ?? 0)); const total = packets + lost;
              const stats: StreamStats = { resolution: `${inbound.frameWidth ?? 0}×${inbound.frameHeight ?? 0}`, fps: Number(inbound.framesPerSecond ?? 0), bitrateMbps: Math.max(0, bitrate), rttMs: 0, jitterMs: Number(inbound.jitter ?? 0) * 1000, packetLossPercent: total ? lost / total * 100 : 0, codec: String(codec?.mimeType?.split('/')[1] ?? '—'), framesDropped: Number(inbound.framesDropped ?? 0), framesSent: Number(inbound.framesDecoded ?? inbound.framesReceived ?? 0), timestamp: Date.now() };
              runtime.control.send(JSON.stringify({ type: 'receiver-screen-stats', stats }));
            }
          } catch {}
        }
      }
    }, 1000);
    return () => { if (statsTimerRef.current) window.clearInterval(statsTimerRef.current); };
  }, [connected, participants, sharing, stopShare]);

  useEffect(() => {
    if (!connected || !micStreamRef.current) { setSelfSpeaking(false); return; }
    const ctx = new AudioContext(); const analyser = ctx.createAnalyser(); analyser.fftSize = 512; const source = ctx.createMediaStreamSource(micStreamRef.current); source.connect(analyser); const data = new Uint8Array(analyser.fftSize); let last = false;
    vadTimerRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(data); let sum = 0; for (const value of data) { const n = (value - 128) / 128; sum += n * n; }
      const rms = Math.sqrt(sum / data.length); const enabled = micStreamRef.current?.getAudioTracks().some((t) => t.enabled && t.readyState === 'live') ?? false; const speakingNow = rms > 0.035 && !mutedRef.current && enabled;
      if (speakingNow !== last) { last = speakingNow; setSelfSpeaking(speakingNow); if (settings?.voiceActivity !== false) sendEnvelope({ type: 'presence', speaking: speakingNow }); }
    }, 150);
    return () => { if (vadTimerRef.current) window.clearInterval(vadTimerRef.current); source.disconnect(); void ctx.close(); };
  }, [connected, sendEnvelope, settings?.voiceActivity]);

  useEffect(() => {
    if (!settings) return;
    const off = window.criacord.onPushToTalkState((pressed) => { pttPressedRef.current = pressed; configureMicEnabled(); });
    void window.criacord.configurePushToTalk(settings.pushToTalk && connected, settings.pushToTalkKey);
    return () => { off(); pttPressedRef.current = false; void window.criacord.configurePushToTalk(false, settings.pushToTalkKey); };
  }, [configureMicEnabled, connected, settings]);

  useEffect(() => () => disconnect(), [disconnect]);

  return { participants, connected, connecting, roomName, error, muted, deafened, sharing, selfSpeaking, selfId, localScreenStream, chatMessages, shareStats, supportedCodecs, connect, disconnect, setMuted, toggleDeaf, startShare, stopShare, setParticipantVolume, setParticipantStreamVolume, toggleParticipantStreamMute, sendChat };
}
