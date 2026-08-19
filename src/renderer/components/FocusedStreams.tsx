import { useEffect, useMemo, useRef, useState } from 'react';
import type { Participant } from '@shared/types';
import { RemoteAudio, RemoteVideo } from './MediaElements';

interface FocusedStreamsProps {
  remoteStreams: Participant[];
  localScreenStream?: MediaStream;
  localSharing: boolean;
  deafened: boolean;
  outputDeviceId?: string;
  setParticipantStreamVolume(id: string, volume: number): void;
  toggleParticipantStreamMute(id: string): void;
}

type StreamEntry =
  | { id: 'self'; kind: 'self'; name: string; stream: MediaStream }
  | { id: string; kind: 'remote'; name: string; stream: MediaStream; participant: Participant };

export function FocusedStreams({
  remoteStreams,
  localScreenStream,
  localSharing,
  deafened,
  outputDeviceId,
  setParticipantStreamVolume,
  toggleParticipantStreamMute
}: FocusedStreamsProps) {
  const entries = useMemo<StreamEntry[]>(() => {
    const list: StreamEntry[] = remoteStreams.map((participant) => ({
      id: participant.id,
      kind: 'remote',
      name: participant.displayName,
      stream: participant.screenStream!,
      participant
    }));
    if (localSharing && localScreenStream) {
      list.push({ id: 'self', kind: 'self', name: 'Sua stream', stream: localScreenStream });
    }
    return list;
  }, [localScreenStream, localSharing, remoteStreams]);

  const [focusedId, setFocusedId] = useState<string>('');
  const [pinned, setPinned] = useState(false);
  const previousIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const ids = entries.map((entry) => entry.id);
    if (ids.length === 0) {
      setFocusedId('');
      setPinned(false);
      previousIdsRef.current = [];
      return;
    }

    const focusStillExists = ids.includes(focusedId);
    const newEntry = entries.find((entry) => !previousIdsRef.current.includes(entry.id));
    if (!focusStillExists) {
      const firstRemote = entries.find((entry) => entry.kind === 'remote');
      setFocusedId((firstRemote ?? entries[0]).id);
      setPinned(false);
    } else if (!pinned && newEntry && previousIdsRef.current.length > 0) {
      setFocusedId(newEntry.id);
    }
    previousIdsRef.current = ids;
  }, [entries, focusedId, pinned]);

  const focused = entries.find((entry) => entry.id === focusedId) ?? entries[0];
  const thumbnails = entries.filter((entry) => entry.id !== focused?.id);

  if (!focused) return null;

  const focusRemote = focused.kind === 'remote' ? focused.participant : undefined;

  return <div className="focus-stream-layout">
    <section className="focus-stream-stage">
      <div className="focus-stream-video"><RemoteVideo stream={focused.stream} /></div>
      <div className="focus-stream-topbar">
        <div className="focus-stream-identity">
          <span className={focused.kind === 'self' ? 'stream-dot self' : 'stream-dot'} />
          <div><strong>{focused.kind === 'self' ? 'Você está transmitindo' : focused.name}</strong><small>{focused.kind === 'self' ? 'Preview local' : 'Transmitindo agora'}</small></div>
        </div>
        <div className="focus-stream-actions">
          <span className={focused.kind === 'self' ? 'live-badge self-badge' : 'live-badge'}>{focused.kind === 'self' ? 'SUA STREAM' : 'AO VIVO'}</span>
          <button className={`pin-stream-button ${pinned ? 'active' : ''}`} onClick={() => setPinned((value) => !value)} title={pinned ? 'Liberar foco automático' : 'Fixar esta stream no foco'}>{pinned ? '📌 Fixada' : '📍 Fixar'}</button>
        </div>
      </div>
      <div className="focus-stream-bottombar">
        {focusRemote ? <div className="focus-volume-control">
          <button className={`stream-audio-button ${focusRemote.streamMuted ? 'muted' : ''}`} onClick={() => toggleParticipantStreamMute(focusRemote.id)} title={focusRemote.streamMuted ? 'Ativar áudio desta stream' : 'Silenciar esta stream'}>{focusRemote.streamMuted ? '🔇' : '🔊'}</button>
          <input aria-label={`Volume da stream de ${focusRemote.displayName}`} type="range" min="0" max="1" step="0.05" value={focusRemote.streamVolume} onChange={(event) => setParticipantStreamVolume(focusRemote.id, Number(event.target.value))} />
          <b>{Math.round(focusRemote.streamVolume * 100)}%</b>
        </div> : <span className="local-preview-note">🔇 Preview local sem áudio para evitar eco</span>}
        {entries.length > 1 && <span className="focus-stream-counter">{entries.findIndex((entry) => entry.id === focused.id) + 1} / {entries.length}</span>}
      </div>
    </section>

    {thumbnails.length > 0 && <nav className="stream-filmstrip" aria-label="Outras transmissões">
      {thumbnails.map((entry) => {
        const remote = entry.kind === 'remote' ? entry.participant : undefined;
        return <button className="stream-thumbnail" key={entry.id} onClick={() => setFocusedId(entry.id)} title={`Ver ${entry.kind === 'self' ? 'sua stream' : entry.name}`}>
          <div className="stream-thumbnail-video"><RemoteVideo stream={entry.stream} /></div>
          <div className="stream-thumbnail-overlay"><span className={entry.kind === 'self' ? 'stream-dot self' : 'stream-dot'} /><strong>{entry.kind === 'self' ? 'Você' : entry.name}</strong>{remote?.streamMuted && <span>🔇</span>}</div>
        </button>;
      })}
    </nav>}

    {remoteStreams.map((participant) => <RemoteAudio key={`screen-audio-${participant.id}`} stream={participant.screenStream} volume={participant.streamVolume} muted={deafened || participant.streamMuted} outputDeviceId={outputDeviceId} />)}
  </div>;
}
