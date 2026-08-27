# Changelog

## 0.3.0 - 2026-08-27

### Mudanças estruturais
- Desktop migrado de Electron/Chromium empacotado para Tauri 2 + Rust + WebView2.
- Removidos Electron main/preload, `electron-builder`, servidor de sala local, descoberta UDP/Radmin, configuração elevada de firewall e helper PTT `.exe` separado.
- PTT global Windows integrado ao backend Rust sem UAC.
- Configurações locais migradas para o backend Tauri.

### Rede
- Radmin, Hamachi, ZeroTier e IP manual deixam de fazer parte do fluxo da aplicação.
- Salas agora usam códigos aleatórios curtos e convites `CC2` que não contêm IP/porta.
- Adicionado signaling remoto WSS, substituível no build, usado somente para negociação/controle.
- Adicionado servidor de signaling próprio stateless em `signaling/` com teste de relay entre dois clientes.
- `RTCPeerConnection` agora usa ICE/STUN público e suporte opcional a TURN como fallback.
- Adicionados ICE restart automático em `disconnected/failed` e reconexão do signaling com backoff.

### Streaming e áudio
- Captura migrou de `desktopCapturer` do Electron para `getDisplayMedia` pelo WebView2/Windows.
- Adicionado preset 1440p30, mantendo 720p30/60, 1080p30/60 e 1440p60.
- Mantidas preferências AV1/H.264, tuning de sender, multistream, preview próprio e volume independente por stream.
- Adicionado watchdog de track de compartilhamento.
- Adicionada redução automática de bitrate quando stats indicarem limitação por banda/perda elevada.
- O app avisa quando a fonte escolhida não fornece áudio de sistema.

### Segurança e privacidade
- Mantida mídia WebRTC DTLS-SRTP.
- Signaling não transporta áudio/vídeo.
- Mensagens de signaling/chat recebem limites e validações básicas.
- Documentado explicitamente que WebRTC P2P não oferece anonimato entre peers e que ICE/STUN/TURN envolvem metadados de rede.
- Nenhuma telemetria, tracking, anúncio ou gravação automática foi adicionada.

### Build e testes
- CI Windows migrado para Node + Rust/Tauri.
- Adicionados typecheck, testes JS, teste de signaling real, `cargo test`, build Tauri, smoke-test do executável e limite automático de tamanho.
- Release workflow passa a gerar executável Tauri portátil e instalador NSIS current-user.

### Limitações em validação
- Áudio de sistema via WebView2 precisa de validação em Windows físico para diferentes fontes.
- Cenários de CGNAT/NAT simétrico exigem uma build com TURN válido configurado.
- 1440p60, escolha efetiva de encoder de hardware, RAM/CPU/GPU e duas redes residenciais diferentes continuam dependendo de testes físicos.
- Assinatura de código Windows continua separada desta migração.

## 0.2.1 - 2026-08-18

### Alterado
- Multistream redesenhado para usar uma transmissão principal em destaque em vez de uma grade com todos os vídeos do mesmo tamanho.
- As outras transmissões agora aparecem em uma faixa horizontal de miniaturas e podem ser trazidas para o foco com um clique.
- Adicionado controle para fixar a transmissão atual no foco e impedir que uma nova stream roube o destaque automaticamente.
- Quando o foco não está fixado, uma nova transmissão pode assumir o destaque automaticamente.
- A própria transmissão continua disponível como preview local, mas de forma mais discreta quando não está em foco.
- Controles de volume e mute da transmissão em foco permanecem independentes do volume do microfone do participante.
- O áudio remoto de cada stream é reproduzido apenas uma vez, independentemente de a stream estar no foco ou na faixa de miniaturas.

## 0.2.0 - 2026-08-18

### Adicionado
- Chat de texto em tempo real dentro da sala, com até 100 mensagens mantidas somente em memória enquanto o host estiver ativo.
- Grade para visualizar várias transmissões simultaneamente.
- Preview local da própria transmissão, sem reproduzir o próprio áudio para evitar eco.
- Volume e mute independentes para o áudio de cada transmissão assistida, separados do volume do microfone do participante.
- Indicador verde no avatar do próprio usuário quando o microfone detectar voz.

### Corrigido
- Separação determinística entre a faixa de áudio do microfone e a faixa de áudio da transmissão no receptor WebRTC.
- Corrigido o caso em que o áudio da stream podia ser classificado como microfone dependendo da ordem em que as tracks chegavam, afetando especialmente a transmissão do host.
- O cliente agora preserva campos de presença quando recebe atualizações parciais.
- A interface avisa explicitamente quando o Windows inicia uma captura solicitada com áudio, mas não entrega a faixa de loopback.

## 0.1.2 - 2026-08-18

### Corrigido
- Corrigido o estado de presença que fazia a transmissão desaparecer para quem assistia após alguns segundos.
- O servidor agora mantém o estado completo de cada participante e preserva `sharing`, `muted`, `deafened` e `speaking` quando recebe atualizações parciais.
- Adicionado teste de regressão reproduzindo o caso em que `sharing: true` era perdido ao chegar uma atualização posterior contendo apenas `speaking`.

## 0.1.1 - 2026-08-17

### Corrigido
- Corrigida a montagem do comando PowerShell elevado usado para criar a regra do Firewall do Windows.
- `Start-Process` e `exit $proc.ExitCode` agora são separados corretamente por `;`, evitando o erro `PositionalParameterNotFound` observado ao criar uma sala.
- Adicionado teste automatizado para impedir regressão na montagem do comando de UAC/firewall.

## 0.1.0 - 2026-08-17

### Adicionado
- Aplicativo Electron/React autossuficiente.
- Signaling local e mesh WebRTC.
- Descoberta Radmin/LAN, convites e senha por challenge-response PBKDF2/HMAC.
- Voz Opus com controles de chamada e PTT global Windows por helper nativo.
- Compartilhamento até 1440p60 com áudio de sistema.
- AV1/H.264, bitrate configurável e métricas WebRTC.
- Reconexão de signaling, firewall com UAC e mensagens de erro de microfone/rede.
- Privacidade sem gravação/telemetria, CSP e bloqueio de navegação externa.
- CI, build Windows e publicação por GitHub Release.
