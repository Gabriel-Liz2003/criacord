import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, ChatMessage, CodecPreference, Participant, StreamStats, WireMessage } from '@shared/types';
import { getSupportedVideoCodecs, preferVideoCodec, readOutboundVideoStats, tuneSender } from '@renderer/lib/media';
import { createPasswordProof } from '@renderer/lib/auth';

interface Endpoint { host: string; port: number; roomCode: string; password?: string }
interface ShareOptions { sourceId: string; width: number; height: number; fps: number; bitrateMbps: number; codec: CodecPreference; audio: boolean }
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
}

function clientId(): string {
  const stored = localStorage.getItem('criacord.clientId');
  if (stored) return stored;
  const id = crypto.randomUUID().replace(/-/g, '');
  localStorage.setItem('criacord.clientId', id);
  return id;
}

function participantDefaults(peer: { id: string; displayName: string }): Participant {
  return {
    ...peer,
    speaking: false,
    muted: false,
    deafened: false,
    sharing: false,
    volume: 1,
    streamVolume: 1,
    streamMuted: false
  };
}

function addUniqueTrack(stream: MediaStream | undefined, track: MediaStreamTrack): MediaStream {
  const target = stream ?? new MediaStream();
  if (!target.getTracks().some((item) => item.id === track.id)) target.addTrack(track);
  return target;
}

export function useMediaSession(settings: AppSettings | null) {
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
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | undefined>(undefined);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [shareStats, setShareStats] = useState<Record<string, StreamStats>>({});
  const [supportedCodecs] = useState(() => getSupportedVideoCodecs());

  const wsRef = useRef<WebSocket | undefined>(undefined);
  const selfIdRef = useRef('');
  const peersRef = useRef(new Map<string, PeerRuntime>());
  const micStreamRef = useRef<MediaStream | undefined>(undefined);
  const screenStreamRef = useRef<MediaStream | undefined>(undefined);
  const endpointRef = useRef<Endpoint | undefined>(undefined);
  const pttPressedRef = useRef(false);
  const mutedRef = useRef(false);
  const statsTimerRef = useRef<number | undefined>(undefined);
  const vadTimerRef = useRef<number | undefined>(undefined);
  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const manualDisconnectRef = useRef(false);
  const connectImplRef = useRef<((endpoint: Endpoint, reconnecting?: boolean) => Promise<void>) | undefined>(undefined);
  const shareOptionsRef = useRef<ShareOptions | undefined>(undefined);

  const send = useCallback((message: WireMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  const patchParticipant = useCallback((id: string, patch: Partial<Participant>) => {
    setParticipants((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const configureMicEnabled = useCallback(() => {
    const settingsNow = settings;
    const enabled = !mutedRef.current && (!settingsNow?.pushToTalk || pttPressedRef.current);
    for (const track of micStreamRef.current?.getAudioTracks() ?? []) track.enabled = enabled;
  }, [settings]);

  const getMic = useCallback(async () => {
    if (micStreamRef.current) return micStreamRef.current;
    if (!settings) throw new Error('Configurações não carregadas.');
    const audio: MediaTrackConstraints = {
      deviceId: settings.inputDeviceId ? { exact: settings.inputDeviceId } : undefined,
      sampleRate: 48000,
      channelCount: 1,
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl
    };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : '';
      if (name === 'NotAllowedError') throw new Error('Acesso ao microfone foi bloqueado. Permita o CriaCord nas configurações de privacidade do Windows.');
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') throw new Error('Nenhum microfone foi encontrado. Conecte um microfone ou escolha outro dispositivo nas configurações.');
      throw new Error(`Não foi possível iniciar o microfone: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    micStreamRef.current = stream;
    configureMicEnabled();
    return stream;
  }, [settings, configureMicEnabled]);

  const attachControl = useCallback((peerId: string, channel: RTCDataChannel) => {
    const runtime = peersRef.current.get(peerId);
    if (runtime) runtime.control = channel;
    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; stats?: StreamStats };
        if (msg.type === 'receiver-screen-stats' && msg.stats) {
          setShareStats((prev) => {
            const local = prev[peerId];
            return { ...prev, [peerId]: { ...msg.stats!, rttMs: local?.rttMs || msg.stats!.rttMs, encoderImplementation: local?.encoderImplementation, qualityLimitationReason: local?.qualityLimitationReason } };
          });
        }
      } catch { /* ignore malformed control frames */ }
    };
  }, []);

  const createPeer = useCallback(async (peerId: string) => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;
    const mic = await getMic();
    const ownId = selfIdRef.current;
    const runtime: PeerRuntime = {
      pc: new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' }),
      polite: ownId.localeCompare(peerId) > 0,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false
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
          const transceiver = pc.getTransceivers().find((t) => t.sender === sender);
          if (transceiver && opts) preferVideoCodec(transceiver, opts.codec);
          if (opts) void tuneSender(sender, opts.bitrateMbps * 1_000_000, opts.fps);
        } else {
          runtime.screenAudioSender = sender;
          void tuneSender(sender, 160_000);
        }
      }
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) send({ type: 'signal', to: peerId, signalType: 'ice', payload: candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
    };
    pc.ondatachannel = (e) => attachControl(peerId, e.channel);
    const control = pc.createDataChannel('criacord-control', { ordered: false, maxRetransmits: 0 });
    attachControl(peerId, control);

    pc.ontrack = (event) => {
      let role: 'mic' | 'screen';
      if (event.track.kind === 'video') {
        role = 'screen';
      } else {
        const audioTransceivers = pc.getTransceivers().filter((transceiver) => transceiver.receiver.track.kind === 'audio');
        const audioIndex = audioTransceivers.indexOf(event.transceiver);
        const incomingStreamHasVideo = event.streams.some((stream) => stream.getVideoTracks().length > 0);
        role = audioIndex > 0 || incomingStreamHasVideo ? 'screen' : 'mic';
      }

      if (role === 'screen') {
        runtime.remoteScreenStream = addUniqueTrack(runtime.remoteScreenStream, event.track);
        patchParticipant(peerId, { screenStream: runtime.remoteScreenStream, sharing: true });
      } else {
        runtime.remoteMicStream = addUniqueTrack(runtime.remoteMicStream, event.track);
        patchParticipant(peerId, { micStream: runtime.remoteMicStream });
      }

      event.track.onended = () => {
        if (role === 'screen') {
          runtime.remoteScreenStream?.removeTrack(event.track);
          if (event.track.kind === 'video' || !(runtime.remoteScreenStream?.getVideoTracks().length)) {
            runtime.remoteScreenStream = undefined;
            patchParticipant(peerId, { screenStream: undefined, sharing: false });
          } else {
            patchParticipant(peerId, { screenStream: runtime.remoteScreenStream });
          }
        } else {
          runtime.remoteMicStream?.removeTrack(event.track);
          patchParticipant(peerId, { micStream: runtime.remoteMicStream?.getAudioTracks().length ? runtime.remoteMicStream : undefined });
        }
      };
    };

    pc.onnegotiationneeded = async () => {
      try {
        runtime.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) send({ type: 'signal', to: peerId, signalType: 'offer', payload: pc.localDescription.toJSON() });
      } catch (cause) { console.error('negotiation', cause); }
      finally { runtime.makingOffer = false; }
    };
    return runtime;
  }, [attachControl, getMic, patchParticipant, send, settings?.micBitrateKbps]);

  const handleSignal = useCallback(async (msg: Extract<WireMessage, { type: 'signal' }>) => {
    if (!msg.from) return;
    const runtime = await createPeer(msg.from);
    const { pc } = runtime;
    try {
      if (msg.signalType === 'ice') {
        try { await pc.addIceCandidate(msg.payload as RTCIceCandidateInit); }
        catch (cause) { if (!runtime.ignoreOffer) throw cause; }
        return;
      }
      const description = msg.payload as RTCSessionDescriptionInit;
      const readyForOffer = !runtime.makingOffer && (pc.signalingState === 'stable' || runtime.isSettingRemoteAnswerPending);
      const offerCollision = description.type === 'offer' && !readyForOffer;
      runtime.ignoreOffer = !runtime.polite && offerCollision;
      if (runtime.ignoreOffer) return;
      runtime.isSettingRemoteAnswerPending = description.type === 'answer';
      await pc.setRemoteDescription(description);
      runtime.isSettingRemoteAnswerPending = false;
      if (description.type === 'offer') {
        await pc.setLocalDescription();
        if (pc.localDescription) send({ type: 'signal', to: msg.from, signalType: 'answer', payload: pc.localDescription.toJSON() });
      }
    } catch (cause) {
      console.error('signal error', cause);
      setError('Falha ao negociar a conexão P2P com um participante.');
    }
  }, [createPeer, send]);

  const disconnect = useCallback((resetReconnect = true) => {
    if (statsTimerRef.current) window.clearInterval(statsTimerRef.current);
    if (vadTimerRef.current) window.clearInterval(vadTimerRef.current);
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    manualDisconnectRef.current = resetReconnect;
    statsTimerRef.current = undefined;
    vadTimerRef.current = undefined;
    wsRef.current?.close();
    wsRef.current = undefined;
    for (const runtime of peersRef.current.values()) runtime.pc.close();
    peersRef.current.clear();
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = undefined;
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = undefined;
    selfIdRef.current = '';
    endpointRef.current = undefined;
    if (resetReconnect) reconnectAttemptsRef.current = 0;
    setParticipants([]);
    setConnected(false);
    setConnecting(false);
    setSharing(false);
    setSelfSpeaking(false);
    setSelfId('');
    setLocalScreenStream(undefined);
    setChatMessages([]);
    shareOptionsRef.current = undefined;
    setShareStats({});
    setRoomName('');
  }, []);

  const connect = useCallback(async (endpoint: Endpoint, reconnecting = false) => {
    if (!settings?.displayName.trim()) throw new Error('Escolha um nome antes de entrar na sala.');
    disconnect(!reconnecting);
    manualDisconnectRef.current = false;
    endpointRef.current = endpoint;
    setConnecting(true);
    setError(null);
    await getMic();
    const ws = new WebSocket(`ws://${endpoint.host}:${endpoint.port}`);
    wsRef.current = ws;
    const timeout = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        setError('Não foi possível alcançar a sala. Verifique Radmin/VPN e Firewall.');
        setConnecting(false);
      }
    }, 8_000);

    ws.onopen = () => {
      window.clearTimeout(timeout);
    };
    ws.onerror = () => setError('Erro de rede ao conectar na sala.');
    ws.onclose = () => {
      setConnected(false);
      if (manualDisconnectRef.current) { setConnecting(false); return; }
      const ep = endpointRef.current;
      if (!ep || reconnectAttemptsRef.current >= 5) {
        setError('Conexão com o host foi perdida. Não foi possível reconectar automaticamente.');
        setConnecting(false);
        return;
      }
      reconnectAttemptsRef.current += 1;
      const delay = Math.min(5000, 750 * 2 ** (reconnectAttemptsRef.current - 1));
      setConnecting(true);
      setError(`Conexão perdida. Reconectando (${reconnectAttemptsRef.current}/5)…`);
      reconnectTimerRef.current = window.setTimeout(() => { void connectImplRef.current?.(ep, true); }, delay);
    };
    ws.onmessage = async (event) => {
      let msg: WireMessage;
      try { msg = JSON.parse(event.data) as WireMessage; } catch { return; }
      if (msg.type === 'auth-challenge') {
        let passwordProof: string | undefined;
        if (msg.required) {
          if (!msg.salt) { setError('O host enviou um desafio de senha inválido.'); ws.close(); return; }
          try { passwordProof = await createPasswordProof(endpoint.password ?? '', msg.salt, msg.nonce, msg.iterations); }
          catch { setError('Não foi possível validar a senha da sala.'); ws.close(); return; }
        }
        send({ type: 'join', roomCode: endpoint.roomCode, displayName: settings.displayName, clientId: clientId(), passwordProof });
        return;
      }
      if (msg.type === 'error') {
        manualDisconnectRef.current = true;
        setError(msg.message);
        setConnecting(false);
        ws.close();
        return;
      }
      if (msg.type === 'welcome') {
        selfIdRef.current = msg.selfId;
        setSelfId(msg.selfId);
        setRoomName(msg.roomName);
        setParticipants(msg.peers.map(participantDefaults));
        setChatMessages(msg.chatHistory ?? []);
        setConnected(true);
        setConnecting(false);
        reconnectAttemptsRef.current = 0;
        for (const peer of msg.peers) await createPeer(peer.id);
      } else if (msg.type === 'peer-joined') {
        setParticipants((prev) => prev.some((p) => p.id === msg.peer.id) ? prev : [...prev, participantDefaults(msg.peer)]);
        await createPeer(msg.peer.id);
      } else if (msg.type === 'peer-left') {
        peersRef.current.get(msg.peerId)?.pc.close();
        peersRef.current.delete(msg.peerId);
        setParticipants((prev) => prev.filter((p) => p.id !== msg.peerId));
        setShareStats((prev) => { const next = { ...prev }; delete next[msg.peerId]; return next; });
      } else if (msg.type === 'signal') {
        await handleSignal(msg);
      } else if (msg.type === 'presence' && msg.from) {
        const patch: Partial<Participant> = {};
        if (typeof msg.speaking === 'boolean') patch.speaking = msg.speaking;
        if (typeof msg.sharing === 'boolean') patch.sharing = msg.sharing;
        if (typeof msg.muted === 'boolean') patch.muted = msg.muted;
        if (typeof msg.deafened === 'boolean') patch.deafened = msg.deafened;
        patchParticipant(msg.from, patch);
      } else if (msg.type === 'chat' && msg.from && msg.displayName && msg.id && typeof msg.timestamp === 'number') {
        const chat: ChatMessage = {
          id: msg.id,
          from: msg.from,
          displayName: msg.displayName,
          text: msg.text,
          timestamp: msg.timestamp
        };
        setChatMessages((prev) => [...prev.slice(-99), chat]);
      }
    };
  }, [createPeer, disconnect, getMic, handleSignal, patchParticipant, send, settings]);

  connectImplRef.current = connect;

  const setMuted = useCallback((value: boolean) => {
    mutedRef.current = value;
    setMutedState(value);
    if (value) {
      setSelfSpeaking(false);
      send({ type: 'presence', speaking: false });
    }
    configureMicEnabled();
    send({ type: 'presence', muted: value });
  }, [configureMicEnabled, send]);

  const toggleDeaf = useCallback(() => {
    setDeafened((prev) => {
      const next = !prev;
      send({ type: 'presence', deafened: next });
      return next;
    });
  }, [send]);

  const setParticipantVolume = useCallback((id: string, volume: number) => patchParticipant(id, { volume }), [patchParticipant]);
  const setParticipantStreamVolume = useCallback((id: string, streamVolume: number) => patchParticipant(id, { streamVolume }), [patchParticipant]);
  const toggleParticipantStreamMute = useCallback((id: string) => {
    setParticipants((prev) => prev.map((participant) => participant.id === id ? { ...participant, streamMuted: !participant.streamMuted } : participant));
  }, []);

  const sendChat = useCallback((text: string) => {
    const clean = text.trim().slice(0, 1000);
    if (clean) send({ type: 'chat', text: clean });
  }, [send]);

  const stopShare = useCallback(async () => {
    const stream = screenStreamRef.current;
    screenStreamRef.current = undefined;
    stream?.getTracks().forEach((track) => track.stop());
    for (const runtime of peersRef.current.values()) {
      if (runtime.screenSender) {
        try { runtime.pc.removeTrack(runtime.screenSender); } catch { /* noop */ }
        runtime.screenSender = undefined;
      }
      if (runtime.screenAudioSender) {
        try { runtime.pc.removeTrack(runtime.screenAudioSender); } catch { /* noop */ }
        runtime.screenAudioSender = undefined;
      }
    }
    await window.criacord.selectDesktopSource(null);
    setSharing(false);
    setLocalScreenStream(undefined);
    shareOptionsRef.current = undefined;
    setShareStats({});
    send({ type: 'presence', sharing: false });
  }, [send]);

  const startShare = useCallback(async (options: ShareOptions) => {
    await stopShare();
    setError(null);
    await window.criacord.selectDesktopSource(options.sourceId);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: options.width, max: options.width },
          height: { ideal: options.height, max: options.height },
          frameRate: { ideal: options.fps, max: options.fps }
        },
        audio: options.audio
      });
    } catch (cause) {
      await window.criacord.selectDesktopSource(null);
      throw cause;
    }
    const video = stream.getVideoTracks()[0];
    if (!video) throw new Error('A captura de vídeo não foi iniciada.');
    try { await video.applyConstraints({ width: options.width, height: options.height, frameRate: options.fps }); } catch { /* source can impose its native size */ }
    video.contentHint = 'detail';
    video.onended = () => void stopShare();
    const systemAudio = stream.getAudioTracks()[0];
    if (systemAudio) {
      try { await systemAudio.applyConstraints({ sampleRate: 48000, channelCount: 2 }); } catch { /* loopback device decides final format */ }
    } else if (options.audio) {
      setError('A transmissão iniciou sem áudio do computador. O Windows não entregou a faixa de loopback; tente selecionar outra fonte ou reiniciar a transmissão.');
    }
    screenStreamRef.current = stream;
    setLocalScreenStream(stream);
    shareOptionsRef.current = options;

    for (const runtime of peersRef.current.values()) {
      const sender = runtime.pc.addTrack(video, stream);
      runtime.screenSender = sender;
      const transceiver = runtime.pc.getTransceivers().find((t) => t.sender === sender);
      if (transceiver) preferVideoCodec(transceiver, options.codec);
      await tuneSender(sender, options.bitrateMbps * 1_000_000, options.fps);
      if (systemAudio) {
        runtime.screenAudioSender = runtime.pc.addTrack(systemAudio, stream);
        await tuneSender(runtime.screenAudioSender, 160_000);
      }
    }
    setSharing(true);
    send({ type: 'presence', sharing: true });
  }, [send, stopShare]);

  useEffect(() => {
    if (!connected) return;
    statsTimerRef.current = window.setInterval(async () => {
      for (const [peerId, runtime] of peersRef.current) {
        if (sharing && runtime.screenSender) {
          try {
            const result = await readOutboundVideoStats(runtime.pc, runtime.screenSender, runtime.sample);
            runtime.sample = result.sample;
            setShareStats((prev) => ({ ...prev, [peerId]: result.stats }));
            if (result.stats.qualityLimitationReason === 'bandwidth' || result.stats.packetLossPercent >= 8) {
              setError('A rede não está sustentando a qualidade escolhida. Reduza o bitrate/resolução ou verifique a conexão Radmin/LAN.');
            }
          } catch { /* transient during renegotiation */ }
        }
        if (runtime.control?.readyState === 'open') {
          try {
            const report = await runtime.pc.getStats();
            let inbound: any; let codec: any;
            for (const stat of report.values()) if (stat.type === 'inbound-rtp' && stat.kind === 'video' && !stat.isRemote) inbound = stat;
            if (inbound) {
              if (inbound.codecId) codec = report.get(inbound.codecId);
              const now = performance.now();
              const bytes = Number(inbound.bytesReceived ?? 0);
              const elapsed = runtime.recvSample ? Math.max(1, now - runtime.recvSample.at) : 1000;
              const bitrate = runtime.recvSample ? ((bytes - runtime.recvSample.bytes) * 8) / elapsed / 1000 : 0;
              runtime.recvSample = { bytes, at: now };
              const packets = Number(inbound.packetsReceived ?? 0);
              const lost = Math.max(0, Number(inbound.packetsLost ?? 0));
              const total = packets + lost;
              const stats: StreamStats = {
                resolution: `${inbound.frameWidth ?? 0}×${inbound.frameHeight ?? 0}`,
                fps: Number(inbound.framesPerSecond ?? 0),
                bitrateMbps: Math.max(0, bitrate),
                rttMs: 0,
                jitterMs: Number(inbound.jitter ?? 0) * 1000,
                packetLossPercent: total ? (lost / total) * 100 : 0,
                codec: String(codec?.mimeType?.split('/')[1] ?? '—'),
                framesDropped: Number(inbound.framesDropped ?? 0),
                framesSent: Number(inbound.framesDecoded ?? inbound.framesReceived ?? 0),
                timestamp: Date.now()
              };
              runtime.control.send(JSON.stringify({ type: 'receiver-screen-stats', stats }));
            }
          } catch { /* peer may be closing */ }
        }
      }
    }, 1000);
    return () => { if (statsTimerRef.current) window.clearInterval(statsTimerRef.current); };
  }, [connected, sharing]);

  useEffect(() => {
    if (!connected || !micStreamRef.current) {
      setSelfSpeaking(false);
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const source = ctx.createMediaStreamSource(micStreamRef.current);
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let lastSpeaking = false;
    vadTimerRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) { const normalized = (value - 128) / 128; sum += normalized * normalized; }
      const rms = Math.sqrt(sum / data.length);
      const micEnabled = micStreamRef.current?.getAudioTracks().some((track) => track.enabled && track.readyState === 'live') ?? false;
      const speakingNow = rms > 0.035 && !mutedRef.current && micEnabled;
      if (speakingNow !== lastSpeaking) {
        lastSpeaking = speakingNow;
        setSelfSpeaking(speakingNow);
        if (settings?.voiceActivity !== false) send({ type: 'presence', speaking: speakingNow });
      }
    }, 150);
    return () => {
      if (vadTimerRef.current) window.clearInterval(vadTimerRef.current);
      setSelfSpeaking(false);
      source.disconnect();
      void ctx.close();
    };
  }, [connected, send, settings?.voiceActivity]);

  useEffect(() => {
    if (!settings) return;
    const off = window.criacord.onPushToTalkState((pressed) => {
      pttPressedRef.current = pressed;
      configureMicEnabled();
    });
    void window.criacord.configurePushToTalk(settings.pushToTalk && connected, settings.pushToTalkKey);
    return () => {
      off();
      pttPressedRef.current = false;
      void window.criacord.configurePushToTalk(false, settings.pushToTalkKey);
    };
  }, [configureMicEnabled, connected, settings?.pushToTalk, settings?.pushToTalkKey]);

  useEffect(() => {
    if (!settings?.pushToTalk) { pttPressedRef.current = false; configureMicEnabled(); return; }
    const down = (e: KeyboardEvent) => {
      if (e.code !== settings.pushToTalkKey || e.repeat) return;
      pttPressedRef.current = true;
      configureMicEnabled();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== settings.pushToTalkKey) return;
      pttPressedRef.current = false;
      configureMicEnabled();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [configureMicEnabled, settings?.pushToTalk, settings?.pushToTalkKey]);

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    participants, connected, connecting, roomName, error, muted, deafened, sharing, selfSpeaking, selfId,
    localScreenStream, chatMessages, shareStats, supportedCodecs,
    connect, disconnect, setMuted, toggleDeaf, startShare, stopShare, setParticipantVolume,
    setParticipantStreamVolume, toggleParticipantStreamMute, sendChat
  };
}
