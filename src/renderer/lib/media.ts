import type { CodecPreference, StreamStats } from '@shared/types';

export function getSupportedVideoCodecs(): string[] {
  const caps = RTCRtpSender.getCapabilities?.('video');
  if (!caps) return [];
  return [...new Set(caps.codecs.map((c) => c.mimeType.split('/')[1]?.toUpperCase()).filter(Boolean))];
}

export function preferVideoCodec(transceiver: RTCRtpTransceiver, preference: CodecPreference): string {
  const caps = RTCRtpSender.getCapabilities?.('video');
  if (!caps?.codecs.length || !transceiver.setCodecPreferences) return 'auto';
  const available = caps.codecs;
  const target = preference === 'auto'
    ? (available.find((c) => /video\/AV1/i.test(c.mimeType)) ?? available.find((c) => /video\/H264/i.test(c.mimeType)))
    : available.find((c) => c.mimeType.toUpperCase() === `VIDEO/${preference}`);
  if (!target) return 'auto';
  const same = available.filter((c) => c.mimeType === target.mimeType);
  const rest = available.filter((c) => c.mimeType !== target.mimeType);
  transceiver.setCodecPreferences([...same, ...rest]);
  return target.mimeType.split('/')[1]?.toUpperCase() ?? 'auto';
}

export async function tuneSender(sender: RTCRtpSender, maxBitrateBps: number, maxFramerate?: number): Promise<void> {
  const params = sender.getParameters();
  if (!params.encodings?.length) params.encodings = [{}];
  params.encodings[0].maxBitrate = Math.max(64_000, Math.floor(maxBitrateBps));
  if (maxFramerate) params.encodings[0].maxFramerate = maxFramerate;
  try { await sender.setParameters(params); } catch { /* browser may reject before negotiation */ }
}

export async function readOutboundVideoStats(pc: RTCPeerConnection, sender: RTCRtpSender, previous?: { bytes: number; at: number }): Promise<{ stats: StreamStats; sample: { bytes: number; at: number } }> {
  const report = await pc.getStats(sender.track ?? null);
  let outbound: any;
  let remoteInbound: any;
  let codec: any;
  for (const stat of report.values()) {
    if (stat.type === 'outbound-rtp' && stat.kind === 'video' && !stat.isRemote) outbound = stat;
    if (stat.type === 'remote-inbound-rtp' && stat.kind === 'video') remoteInbound = stat;
  }
  if (outbound?.codecId) codec = report.get(outbound.codecId);
  const now = performance.now();
  const bytes = Number(outbound?.bytesSent ?? 0);
  const elapsed = previous ? Math.max(1, now - previous.at) : 1000;
  const bitrateMbps = previous ? ((bytes - previous.bytes) * 8) / elapsed / 1000 : 0;
  const trackSettings = sender.track?.getSettings();
  const stats: StreamStats = {
    resolution: `${outbound?.frameWidth ?? trackSettings?.width ?? 0}×${outbound?.frameHeight ?? trackSettings?.height ?? 0}`,
    fps: Number(outbound?.framesPerSecond ?? trackSettings?.frameRate ?? 0),
    bitrateMbps: Math.max(0, bitrateMbps),
    rttMs: Number(remoteInbound?.roundTripTime ?? 0) * 1000,
    jitterMs: Number(remoteInbound?.jitter ?? 0) * 1000,
    packetLossPercent: Number(remoteInbound?.fractionLost ?? 0) * 100,
    codec: String(codec?.mimeType?.split('/')[1] ?? '—'),
    framesDropped: Number(outbound?.framesDropped ?? 0),
    framesSent: Number(outbound?.framesSent ?? outbound?.framesEncoded ?? 0),
    encoderImplementation: outbound?.encoderImplementation,
    qualityLimitationReason: outbound?.qualityLimitationReason,
    timestamp: Date.now()
  };
  return { stats, sample: { bytes, at: now } };
}
