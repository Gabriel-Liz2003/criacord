import { useEffect, useMemo, useState } from 'react';
import { decodeInvite, encodeInvite } from '@shared/invite';
import type { AppSettings, DiscoveredRoom, HostedRoom, NetworkInfo } from '@shared/types';
import { useMediaSession } from '@renderer/hooks/useMediaSession';
import { RemoteAudio, RemoteVideo } from '@renderer/components/MediaElements';
import { ScreenShareModal } from '@renderer/components/ScreenShareModal';
import { SettingsModal } from '@renderer/components/SettingsModal';

function icon(label: string) { return <span aria-hidden="true">{label}</span>; }

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredRoom[]>([]);
  const [hosted, setHosted] = useState<HostedRoom | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [roomNameInput, setRoomNameInput] = useState('Sala da Cria');
  const [roomPassword, setRoomPassword] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [uiError, setUiError] = useState('');
  const [version, setVersion] = useState('');
  const [gpuEncode, setGpuEncode] = useState('Detectando…');
  const media = useMediaSession(settings);

  useEffect(() => {
    void Promise.all([window.criacord.getSettings(), window.criacord.getNetworkInfo(), window.criacord.getAppVersion(), window.criacord.getGPUInfo()]).then(([s, n, v, gpu]) => {
      setSettings(s); setNetwork(n); setVersion(v);
      const status = Object.entries(gpu.featureStatus).find(([key]) => /video.*encod/i.test(key))?.[1];
      setGpuEncode(status ? String(status).replaceAll('_', ' ') : 'Gerenciado pelo Chromium');
      if (!s.displayName) setShowSettings(true);
    });
    void window.criacord.startDiscovery().then(setDiscovered);
    const off = window.criacord.onDiscoveredRooms(setDiscovered);
    return () => { off(); void window.criacord.stopDiscovery(); };
  }, []);

  const sharingParticipant = useMemo(() => media.participants.find((p) => p.sharing && p.screenStream), [media.participants]);

  async function saveSettings(patch: Partial<AppSettings>) {
    const saved = await window.criacord.saveSettings(patch);
    setSettings(saved);
  }

  async function createRoom() {
    if (!settings?.displayName.trim()) { setShowSettings(true); return; }
    setUiError('');
    try {
      const room = await window.criacord.hostRoom({ roomName: roomNameInput, password: roomPassword || undefined });
      const firewall = await window.criacord.ensureFirewallRule();
      if (!firewall.ok && navigator.userAgent.includes('Windows')) setUiError(`Sala criada, mas o Firewall precisa de atenção: ${firewall.message}`);
      setHosted(room);
      setShowCreate(false);
      await media.connect({ host: '127.0.0.1', port: room.port, roomCode: room.roomCode, password: roomPassword || undefined });
    } catch (e) { setUiError(e instanceof Error ? e.message : String(e)); }
  }

  async function joinByInvite() {
    setUiError('');
    try {
      const invite = decodeInvite(inviteInput);
      setShowJoin(false);
      await media.connect({ host: invite.host, port: invite.port, roomCode: invite.room, password: joinPassword || undefined });
    } catch (e) { setUiError(e instanceof Error ? e.message : String(e)); }
  }

  async function joinDiscovered(room: DiscoveredRoom) {
    setUiError('');
    try {
      if (room.hasPassword && !joinPassword) {
        setInviteInput(encodeInvite({ v: 1, host: room.hostAddress, port: room.port, room: room.roomCode }));
        setShowJoin(true);
        return;
      }
      await media.connect({ host: room.hostAddress, port: room.port, roomCode: room.roomCode, password: joinPassword || undefined });
    } catch (e) { setUiError(e instanceof Error ? e.message : String(e)); }
  }

  async function leave() {
    media.disconnect();
    if (hosted) { await window.criacord.stopHosting(); setHosted(null); }
  }

  if (!settings || !network) return <div className="splash"><div className="logo-mark">C</div><strong>CriaCord</strong><span>Iniciando…</span></div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="logo-mark small">C</div><div><strong>CriaCord</strong><small>v{version}</small></div></div>
      <div className="sidebar-section"><span className="section-title">SALA</span>
        <button className={`channel ${media.connected ? 'active' : ''}`}>{icon('◉')} {media.roomName || 'Nenhuma sala'}</button>
      </div>
      {!media.connected && <div className="sidebar-section"><span className="section-title">NA REDE</span>
        {discovered.length === 0 ? <div className="empty-small">Nenhuma sala encontrada</div> : discovered.map((room) => <button key={`${room.hostAddress}-${room.roomCode}`} className="room-discovery" onClick={() => void joinDiscovered(room)}>
          <span><strong>{room.roomName}</strong><small>{room.hostAddress}{room.hasPassword ? ' · 🔒' : ''}</small></span><b>Entrar</b>
        </button>)}
      </div>}
      <div className="sidebar-footer">
        <div className="network-pill"><span className={network.radminDetected ? 'dot online' : 'dot'}></span><div><b>{network.radminDetected ? 'Radmin detectado' : 'Rede local'}</b><small>{network.preferred?.address ?? 'Sem IPv4'}</small></div></div>
        <button className="icon-button" title="Configurações" onClick={() => setShowSettings(true)}>⚙</button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div><h1>{media.connected ? media.roomName : 'CriaCord'}</h1><p>{media.connected ? `${media.participants.length + 1} participante(s)` : 'Voz e transmissão privada, sem gravação.'}</p></div>
        {media.connected && hosted && <button className="secondary compact" onClick={() => void window.criacord.copyText(hosted.inviteCode)}>Copiar convite</button>}
      </header>

      {(uiError || media.error) && <div className="error-banner top-error">{uiError || media.error}</div>}

      {!media.connected ? <section className="home-panel">
        <div className="hero-card"><div className="hero-badge">P2P • PRIVADO</div><h2>Converse e transmita sem complicação.</h2><p>Crie uma sala, mande o convite e pronto. O CriaCord não grava nem armazena suas chamadas ou transmissões.</p>
          <div className="hero-actions"><button className="primary large" onClick={() => setShowCreate(true)}>Criar sala</button><button className="secondary large" onClick={() => setShowJoin(true)}>Entrar com convite</button></div>
          <div className="feature-row"><span>🎙 Opus 48 kHz</span><span>🖥 Até 1440p60</span><span>🔊 Áudio do PC</span><span>🔐 WebRTC P2P</span></div>
        </div>
        <div className="status-grid">
          <div className="status-card"><small>REDE PREFERIDA</small><strong>{network.preferred?.name ?? 'Não detectada'}</strong><span>{network.preferred?.address ?? '—'}</span></div>
          <div className="status-card"><small>RADMIN VPN</small><strong>{network.radminDetected ? 'Pronto' : 'Não detectado'}</strong><span>{network.radminDetected ? 'Descoberta automática ativa' : 'Convites continuam disponíveis'}</span></div>
          <div className="status-card"><small>ENCODER / GPU</small><strong>{gpuEncode}</strong><span>AV1 → H.264 com aceleração do Chromium quando disponível</span></div>
        </div>
      </section> : <section className="call-stage">
        <div className="stage-content">
          {sharingParticipant ? <div className="stream-view"><div className="stream-header"><strong>{sharingParticipant.displayName} está transmitindo</strong><span>Ao vivo</span></div><RemoteVideo stream={sharingParticipant.screenStream} /></div> : <div className="call-placeholder"><div className="avatar huge">{settings.displayName.slice(0, 1).toUpperCase()}</div><h2>{media.sharing ? 'Você está transmitindo' : 'Chamada conectada'}</h2><p>{media.sharing ? 'A transmissão está sendo enviada diretamente aos participantes.' : 'Inicie uma transmissão de tela ou continue na chamada de voz.'}</p></div>}
          {media.sharing && <div className="stats-panel"><div className="stats-title">Qualidade entregue</div>{Object.entries(media.shareStats).length === 0 ? <small>Aguardando estatísticas dos peers…</small> : Object.entries(media.shareStats).map(([peerId, stats]) => <div className="stats-row" key={peerId}>
            <span>{media.participants.find((p) => p.id === peerId)?.displayName ?? peerId.slice(0, 6)}</span>
            <b>{stats.resolution}</b><b>{stats.fps.toFixed(0)} FPS</b><b>{stats.bitrateMbps.toFixed(1)} Mbps</b><span>{stats.rttMs.toFixed(0)} ms / {stats.jitterMs.toFixed(1)}j</span><span>{stats.packetLossPercent.toFixed(1)}% loss</span><span>{stats.codec} · drop {stats.framesDropped}</span>
          </div>)}</div>}
        </div>
        <aside className="participants-panel"><div className="participants-title">Participantes — {media.participants.length + 1}</div>
          <div className="participant self"><div className={`avatar ${!media.muted ? 'speaking-soft' : ''}`}>{settings.displayName.slice(0, 1).toUpperCase()}</div><div className="participant-info"><strong>{settings.displayName} <small>(você)</small></strong><span>{media.muted ? 'Microfone desligado' : media.sharing ? 'Transmitindo' : 'Conectado'}</span></div>{media.muted && <span>🔇</span>}</div>
          {media.participants.map((p) => <div className="participant" key={p.id}><div className={`avatar ${p.speaking ? 'speaking' : ''}`}>{p.displayName.slice(0, 1).toUpperCase()}</div><div className="participant-info"><strong>{p.displayName}</strong><span>{p.sharing ? 'Transmitindo tela' : p.speaking ? 'Falando' : 'Na chamada'}</span><input aria-label={`Volume de ${p.displayName}`} type="range" min="0" max="1" step="0.05" value={p.volume} onChange={(e) => media.setParticipantVolume(p.id, Number(e.target.value))} /></div>{p.muted && <span>🔇</span>}<RemoteAudio stream={p.micStream} volume={p.volume} muted={media.deafened} outputDeviceId={settings.outputDeviceId} />{p.screenStream && <RemoteAudio stream={p.screenStream} volume={p.volume} muted={media.deafened} outputDeviceId={settings.outputDeviceId} />}</div>)}
        </aside>
      </section>}

      {media.connected && <footer className="call-controls">
        <button className={`control-button ${media.muted ? 'danger' : ''}`} onClick={() => media.setMuted(!media.muted)}>{media.muted ? '🔇' : '🎙'}<span>{media.muted ? 'Ativar mic' : 'Microfone'}</span></button>
        <button className={`control-button ${media.deafened ? 'danger' : ''}`} onClick={media.toggleDeaf}>{media.deafened ? '🔕' : '🎧'}<span>{media.deafened ? 'Ouvir' : 'Deaf'}</span></button>
        <button className={`control-button ${media.sharing ? 'active-share' : ''}`} onClick={() => media.sharing ? void media.stopShare() : setShowShare(true)}>🖥<span>{media.sharing ? 'Parar tela' : 'Compartilhar'}</span></button>
        <button className="control-button hangup" onClick={() => void leave()}>☎<span>Sair</span></button>
      </footer>}
    </main>

    {showCreate && <div className="modal-backdrop"><div className="modal small-modal"><div className="modal-header"><div><h2>Criar sala</h2><p>O seu PC será o host local da sala.</p></div><button className="icon-button" onClick={() => setShowCreate(false)}>×</button></div>
      <label>Nome da sala<input autoFocus value={roomNameInput} onChange={(e) => setRoomNameInput(e.target.value)} /></label><label>Senha opcional<input type="password" value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} placeholder="Sem senha" /></label>
      <div className="hint-box">O CriaCord tentará usar <b>{network.preferred?.name}</b> ({network.preferred?.address}). Nenhum IP precisa ser configurado manualmente.</div>
      <div className="modal-actions"><button className="secondary" onClick={() => setShowCreate(false)}>Cancelar</button><button className="primary" onClick={() => void createRoom()}>Criar e entrar</button></div></div></div>}

    {showJoin && <div className="modal-backdrop"><div className="modal small-modal"><div className="modal-header"><div><h2>Entrar na sala</h2><p>Cole o código que seu amigo enviou.</p></div><button className="icon-button" onClick={() => setShowJoin(false)}>×</button></div>
      <label>Código de convite<textarea autoFocus value={inviteInput} onChange={(e) => setInviteInput(e.target.value)} placeholder="CC1-..." /></label><label>Senha (se houver)<input type="password" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} /></label>
      <div className="modal-actions"><button className="secondary" onClick={() => setShowJoin(false)}>Cancelar</button><button className="primary" disabled={!inviteInput.trim() || media.connecting} onClick={() => void joinByInvite()}>{media.connecting ? 'Conectando…' : 'Entrar'}</button></div></div></div>}

    {showShare && <ScreenShareModal codecs={media.supportedCodecs} onClose={() => setShowShare(false)} onStart={media.startShare} />}
    {showSettings && <SettingsModal settings={settings} onSave={saveSettings} onClose={() => settings.displayName && setShowSettings(false)} />}
  </div>;
}
