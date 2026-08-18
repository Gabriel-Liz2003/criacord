import { useEffect, useState } from 'react';
import type { AppSettings } from '@shared/types';

interface DeviceLists { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }

export function SettingsModal({ settings, onSave, onClose }: { settings: AppSettings; onSave: (patch: Partial<AppSettings>) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(settings);
  const [devices, setDevices] = useState<DeviceLists>({ inputs: [], outputs: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
      s.getTracks().forEach((t) => t.stop());
      return navigator.mediaDevices.enumerateDevices();
    }).then((all) => setDevices({ inputs: all.filter((d) => d.kind === 'audioinput'), outputs: all.filter((d) => d.kind === 'audiooutput') }));
  }, []);

  return <div className="modal-backdrop"><div className="modal settings-modal">
    <div className="modal-header"><div><h2>Configurações</h2><p>Áudio e comportamento da chamada.</p></div><button className="icon-button" onClick={onClose}>×</button></div>
    <div className="form-grid">
      <label>Nome<input value={draft.displayName} maxLength={40} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} /></label>
      <label>Microfone<select value={draft.inputDeviceId ?? ''} onChange={(e) => setDraft({ ...draft, inputDeviceId: e.target.value || undefined })}><option value="">Padrão do Windows</option>{devices.inputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microfone'}</option>)}</select></label>
      <label>Saída<select value={draft.outputDeviceId ?? ''} onChange={(e) => setDraft({ ...draft, outputDeviceId: e.target.value || undefined })}><option value="">Padrão do Windows</option>{devices.outputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Saída'}</option>)}</select></label>
      <label>Bitrate do microfone<input type="number" min="64" max="128" step="8" value={draft.micBitrateKbps} onChange={(e) => setDraft({ ...draft, micBitrateKbps: Number(e.target.value) })} /><small>64–128 kbps</small></label>
      <label className="toggle-row"><input type="checkbox" checked={draft.pushToTalk} onChange={(e) => setDraft({ ...draft, pushToTalk: e.target.checked })} /> Push-to-talk</label>
      <label>Tecla PTT<input value={draft.pushToTalkKey} onKeyDown={(e) => { e.preventDefault(); setDraft({ ...draft, pushToTalkKey: e.code }); }} readOnly /></label>
      <label className="toggle-row"><input type="checkbox" checked={draft.voiceActivity} onChange={(e) => setDraft({ ...draft, voiceActivity: e.target.checked })} /> Detecção de voz</label>
      <label className="toggle-row"><input type="checkbox" checked={draft.echoCancellation} onChange={(e) => setDraft({ ...draft, echoCancellation: e.target.checked })} /> Echo cancellation</label>
      <label className="toggle-row"><input type="checkbox" checked={draft.noiseSuppression} onChange={(e) => setDraft({ ...draft, noiseSuppression: e.target.checked })} /> Noise suppression</label>
      <label className="toggle-row"><input type="checkbox" checked={draft.autoGainControl} onChange={(e) => setDraft({ ...draft, autoGainControl: e.target.checked })} /> Automatic gain control</label>
    </div>
    <div className="modal-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy || !draft.displayName.trim()} onClick={async () => { setBusy(true); await onSave(draft); setBusy(false); onClose(); }}>Salvar</button></div>
  </div></div>;
}
