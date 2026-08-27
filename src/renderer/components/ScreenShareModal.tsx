import { useMemo, useState } from 'react';
import { SHARE_PRESETS } from '@shared/constants';
import type { CodecPreference } from '@shared/types';

interface Props {
  codecs: string[];
  onClose: () => void;
  onStart: (options: { width: number; height: number; fps: number; bitrateMbps: number; codec: CodecPreference; audio: boolean }) => Promise<void>;
}

export function ScreenShareModal({ codecs, onClose, onStart }: Props) {
  const [preset, setPreset] = useState('1440p60');
  const [bitrate, setBitrate] = useState(24);
  const [customWidth, setCustomWidth] = useState(2560);
  const [customHeight, setCustomHeight] = useState(1440);
  const [customFps, setCustomFps] = useState(60);
  const [codec, setCodec] = useState<CodecPreference>('auto');
  const [audio, setAudio] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedPreset = useMemo(() => preset === 'custom'
    ? { label: 'Personalizado', width: customWidth, height: customHeight, fps: customFps, bitrateMbps: bitrate }
    : (SHARE_PRESETS.find((p) => p.label === preset) ?? SHARE_PRESETS[5]), [preset, customWidth, customHeight, customFps, bitrate]);

  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal share-modal">
      <div className="modal-header">
        <div><h2>Compartilhar tela</h2><p>O seletor seguro do Windows abrirá quando você clicar em transmitir.</p></div>
        <button className="icon-button" onClick={onClose}>×</button>
      </div>

      <div className="hint-box">
        <b>Sem Electron:</b> o CriaCord agora usa o seletor nativo exposto pelo WebView2. Escolha monitor, janela ou aplicativo no diálogo do Windows. Nenhum driver ou permissão de administrador é necessário.
      </div>

      <div className="share-settings">
        <label>Qualidade<select value={preset} onChange={(e) => { setPreset(e.target.value); const p = SHARE_PRESETS.find((item) => item.label === e.target.value); if (p) setBitrate(p.bitrateMbps); }}>{SHARE_PRESETS.map((p) => <option key={p.label}>{p.label}</option>)}<option value="custom">Personalizado</option></select></label>
        {preset === 'custom' && <div className="custom-resolution">
          <label>Largura<input type="number" min="640" max="7680" step="16" value={customWidth} onChange={(e) => setCustomWidth(Number(e.target.value))} /></label>
          <label>Altura<input type="number" min="360" max="4320" step="16" value={customHeight} onChange={(e) => setCustomHeight(Number(e.target.value))} /></label>
          <label>FPS<input type="number" min="15" max="120" value={customFps} onChange={(e) => setCustomFps(Number(e.target.value))} /></label>
        </div>}
        <label>Bitrate<input type="number" min="1" max="80" value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))} /><small>Mbps</small></label>
        <label>Codec<select value={codec} onChange={(e) => setCodec(e.target.value as CodecPreference)}>
          <option value="auto">Automático (AV1 → H.264)</option>
          <option value="AV1" disabled={!codecs.includes('AV1')}>AV1 {!codecs.includes('AV1') ? '(indisponível)' : ''}</option>
          <option value="H264" disabled={!codecs.includes('H264')}>H.264 {!codecs.includes('H264') ? '(indisponível)' : ''}</option>
        </select></label>
        <label className="toggle-row"><input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} /> Áudio do computador</label>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>Cancelar</button>
        <button className="primary" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try {
            await onStart({ width: selectedPreset.width, height: selectedPreset.height, fps: selectedPreset.fps, bitrateMbps: bitrate, codec, audio });
            onClose();
          } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>{busy ? 'Abrindo seletor…' : `Transmitir ${selectedPreset.label}`}</button>
      </div>
    </div>
  </div>;
}
