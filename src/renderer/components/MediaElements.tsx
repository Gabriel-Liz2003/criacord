import { useEffect, useRef } from 'react';

export function RemoteAudio({ stream, volume, muted, outputDeviceId }: { stream?: MediaStream; volume: number; muted: boolean; outputDeviceId?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.volume = Math.max(0, Math.min(1, volume));
    el.muted = muted;
    void el.play().catch(() => undefined);
    const sink = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (outputDeviceId && sink.setSinkId) void sink.setSinkId(outputDeviceId).catch(() => undefined);
  }, [stream, volume, muted, outputDeviceId]);
  return <audio ref={ref} autoPlay />;
}

export function RemoteVideo({ stream }: { stream?: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!ref.current || !stream) return;
    ref.current.srcObject = stream;
    void ref.current.play().catch(() => undefined);
  }, [stream]);
  if (!stream) return null;
  return <video ref={ref} className="remote-video" autoPlay playsInline muted />;
}
