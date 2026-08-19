# Changelog

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
