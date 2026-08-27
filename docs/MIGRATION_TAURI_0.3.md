# Migração CriaCord 0.3 — Electron/Radmin → Tauri/WebRTC Internet

Data: 2026-08-27

## Objetivo

Reduzir tamanho/overhead do desktop e remover a dependência de rede virtual. A migração foi feita reaproveitando a UI React, WebRTC, stats, VAD e multistream já existentes.

## Antes — 0.2.1

Desktop:

- Electron 43 + Chromium + Node embutidos;
- `electron-builder`;
- processo main + renderer/Chromium;
- helper PTT `.exe` separado.

Rede:

- servidor WebSocket hospedado no PC de quem criava a sala;
- UDP broadcast para descoberta;
- preferência por Radmin/26.x;
- convite CC1 contendo host/porta;
- regra de Firewall Windows criada por PowerShell/UAC.

Distribuição observada nas builds anteriores:

- executável portable em torno de 100 MB.

RAM idle/call e tempo real de abertura não foram medidos de forma reproduzível antes desta migração; não há números inventados para essas métricas.

## Depois — 0.3

Desktop:

- Tauri 2;
- backend Rust pequeno;
- UI React no WebView2 já fornecido pelo Windows;
- PTT global integrado ao mesmo processo Rust;
- sem Electron/Chromium/Node empacotados;
- sem helper PTT externo;
- instalação current-user.

Rede:

- códigos CC2 sem IP/porta;
- signaling WSS externo e stateless;
- WebRTC ICE com STUN;
- TURN opcional;
- sem Radmin/VPN manual;
- sem servidor doméstico;
- sem port forwarding;
- sem firewall/UAC gerenciado pelo aplicativo;
- ICE restart e signaling reconnect.

## Código reaproveitado

A migração preservou em vez de reescrever:

- componentes React;
- FocusedStreams/multistream;
- MediaElements;
- Settings UI;
- codec selection;
- `RTCRtpSender` tuning;
- `getStats()`;
- VAD;
- volume/mute/deafen;
- chat da sessão;
- perfect negotiation.

Foram substituídos apenas os limites arquiteturais ligados ao Electron/LAN.

## Medições automatizadas

O CI Windows registra:

- tamanho do `src-tauri/target/release/criacord.exe`;
- duração do `--smoke-test`;
- existência do instalador NSIS;
- teste real do relay WebSocket próprio.

O CI falha se o executável Tauri bruto ultrapassar 40 MB.

### Resultado

Preencher automaticamente/manual após a primeira build verde:

| Métrica | 0.2.1 Electron | 0.3 Tauri |
|---|---:|---:|
| Portable/executável | ~100 MB | aguardando CI |
| Instalador | ~100 MB | aguardando CI |
| Processos | múltiplos Electron/Chromium | aguardando teste físico |
| RAM idle | não medido | aguardando teste físico |
| RAM call | não medido | aguardando teste físico |
| Startup visual | não medido | aguardando teste físico |
| smoke-test CLI | n/a | aguardando CI |

## Limitações que exigem hardware/rede reais

CI não substitui dois PCs físicos. Ainda precisam ser validados:

- WebView2 `getDisplayMedia` + áudio de sistema em versões reais de Windows;
- conectividade entre duas redes residenciais diferentes;
- cenário CGNAT/NAT simétrico com TURN configurado;
- encoder de hardware efetivamente escolhido pelo runtime;
- AV1/H.264 em GPUs diferentes;
- 1440p60 sustentado;
- RAM/CPU/GPU durante call/stream;
- SmartScreen/assinatura de código.

## Segurança

O signaling não transporta mídia, porém SDP/ICE e outros metadados de sessão passam pelo serviço WSS. WebRTC protege mídia com DTLS-SRTP. Participantes podem aprender informações de rede através de ICE; portanto, CriaCord não promete anonimato.

## Rollback

A migração está isolada na branch `migration/tauri-internet-p2p` e PR #7. Enquanto não houver CI verde e teste físico suficiente, a 0.2.1 permanece recuperável pelo histórico/tag/release anterior.
