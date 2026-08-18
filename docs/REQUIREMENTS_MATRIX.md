# Matriz de requisitos da V1

Esta matriz liga os requisitos do prompt original ao que existe no código. “Implementado” significa que o caminho de código existe; itens dependentes de Windows, GPU, rede real ou dois computadores só podem ser marcados como validados depois de execução nesse ambiente.

| Requisito | Implementação | Estado de validação |
|---|---|---|
| Aplicativo autossuficiente / sem Node, Python ou SDK no usuário final | Electron + `electron-builder`; targets NSIS e Portable | Implementado; build Windows real pendente |
| Primeira abertura simples e preferências persistidas | `App.tsx`, `SettingsModal.tsx`, `settings.ts` | Implementado |
| Detectar Radmin/LAN e IPv4 automaticamente | `network.ts` | Implementado; Radmin físico pendente |
| Descoberta automática de salas/hosts | UDP broadcast em `roomServer.ts` | Implementado; dois PCs pendente |
| Convite sem digitar IP | `invite.ts` + UI de sala | Implementado; round-trip local validado |
| Sala, nome, senha opcional, participantes | `roomServer.ts`, `App.tsx` | Implementado |
| Senha não persistida em texto puro | PBKDF2-SHA-256 em memória + HMAC com nonce por conexão; senha não trafega em texto puro | Implementado |
| Voz 48 kHz / Opus | WebRTC + constraints em `media.ts` / `useMediaSession.ts` | Implementado; qualidade real pendente |
| Mute, deaf, PTT, VAD e indicador de fala | `useMediaSession.ts`, `App.tsx`; helper nativo `ptt-helper.cpp` para PTT fora de foco | Implementado; PTT global Windows pendente de validação física |
| Seleção de microfone e saída | Settings + `setSinkId` quando suportado | Implementado; hardware pendente |
| Volume individual | `MediaElements.tsx` / estado de participantes | Implementado |
| EC, NS e AGC configuráveis | constraints de `getUserMedia` | Implementado |
| Monitor, janela e aplicativo/jogo | Electron `desktopCapturer` + modal de fontes | Implementado; Windows pendente |
| Presets 720p30/60, 1080p30/60, 1440p60 e custom | `ScreenShareModal.tsx` | Implementado |
| Bitrate manual de vídeo até modo extremo | sender encodings / UI | Implementado; comportamento real pendente |
| 2560×1440 60 FPS | constraints 2560×1440@60 + stats | Selecionável/implementado; entrega real pendente |
| Métricas reais: resolução, FPS, bitrate, RTT, jitter, loss, codec, drops | `RTCRtpSender/Receiver.getStats`; stats retornadas por DataChannel | Implementado; sessão real pendente |
| AV1 preferencial, H.264 fallback | `setCodecPreferences` com capacidades WebRTC | Implementado; GPUs/peers reais pendentes |
| Encoder por hardware quando disponível | Chromium/WebRTC com aceleração de mídia; métricas incluem implementação do encoder | Implementado pela stack; GPU real pendente |
| Áudio do Windows/jogo separado do microfone | Electron loopback + stream de display separado | Implementado; Windows pendente |
| Áudio compartilhado estéreo/48 kHz e sem EC/NS/AGC do mic | constraints e sender separado | Implementado; Windows pendente |
| Sem gravação, upload, analytics, tracking ou anúncios | Não há MediaRecorder/telemetria; CSP bloqueia conteúdo externo; política em `docs/PRIVACY.md` | Implementado; inspeção estática local |
| P2P privado e arquitetura evolutiva para SFU | mesh WebRTC + signaling isolado; arquitetura documentada | Implementado |
| Reconexão | signaling WebSocket com backoff e reconstrução de peers | Implementado; perda real de rede pendente |
| Firewall com UAC e erro compreensível | `ensureFirewallRule` em `network.ts`; microfone possui mensagens de permissão/dispositivo; alerta de limitação de banda | Implementado; Windows/UAC pendente |
| Fallback de porta do host | portas sequenciais a partir da padrão | Implementado |
| UI própria e simples | React/CSS + identidade visual própria | Implementado |
| Sem servidor iniciado manualmente | signaling/descoberta sobem e encerram com o app host | Implementado |
| GitHub Actions para validação Windows | `.github/workflows/ci.yml` | Implementado; execução depende de repositório remoto |
| GitHub Release com `.exe` | `.github/workflows/release.yml` + electron-builder | Implementado; publicação depende de repo/tag |
| Branches e commits rastreáveis | histórico Git local com branches `feature/*` e `fix/*` | Validado localmente |
| Testes unitários de convite/rede/sala/PTT | `tests/*.test.ts` | Convite/rede/PTT validados em runtime isolado; suíte Vitest completa pendente por dependências |
| Smoke test do app | flag `--smoke-test` e job Windows | Implementado; Electron Windows pendente |
| Testes reais em dois PCs e 1440p60 | checklist em `docs/TESTING.md` | Pendente de hardware/rede Windows reais |

## Critério de conclusão

O projeto contém a implementação necessária para a V1 e automação para produzir os binários, mas **não deve ser chamado de V1 validada/final** até que o workflow Windows compile com sucesso e o checklist de dois PCs confirme voz, áudio de sistema, reconexão, 1080p60 e 1440p60 com métricas reais. Essa distinção é intencional para não transformar “código implementado” em “teste que não aconteceu”.
