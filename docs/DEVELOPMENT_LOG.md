# Development Log

## 2026-08-17 — V1 core

### O que mudou
- Estrutura Electron + React/TypeScript.
- Signaling WebSocket local e mesh WebRTC.
- Descoberta LAN/Radmin, convites e senha de sala.
- Voz, PTT, VAD, mute/deaf, devices e volume individual.
- Screen share com áudio de sistema, presets 1440p60, AV1/H.264 e bitrate configurável.
- Estatísticas de transmissão e retorno das métricas do receptor.
- Configurações persistentes, firewall, GPU status, reconexão e UI.
- Testes, documentação, CI e release Windows.

### Motivo
Atender à V1 do CriaCord com prioridade em voz, transmissão de alta qualidade e zero-config para o usuário final.

### Testes realizados neste ambiente
- Compilação isolada dos módulos shared (`invite.ts`, `constants.ts`, `types.ts`) com TypeScript: PASS.
- Round-trip de código de convite e rejeição de convite inválido: PASS.
- Cálculo de broadcast para rede Radmin `/8`: PASS (execução do JS emitido do módulo de rede).

### Testes não executados neste ambiente
- `npm install`, typecheck integral, Vitest e Electron: bloqueados porque o container não conseguiu resolver `registry.npmjs.org` por DNS.
- Build NSIS/portable: exige dependências e runner Windows.
- Dois PCs, microfone, captura real, loopback, AV1/H.264, 1080p60/1440p60 e métricas de GPU: exigem Windows/hardware real.

O workflow `.github/workflows/ci.yml` executa validação e build em Windows. A matriz manual está em `docs/TESTING.md`.
