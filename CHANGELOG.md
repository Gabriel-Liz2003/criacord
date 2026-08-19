# Changelog

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
