# Arquitetura

## Decisão de stack

A V1 usa Electron + React/TypeScript em vez de Tauri. O motivo é o requisito Windows de captura de tela/janela e áudio de sistema com configuração zero. Electron expõe `desktopCapturer` e `setDisplayMediaRequestHandler`, enquanto o Chromium fornece WebRTC, Opus, codecs de vídeo e aceleração por hardware quando disponível.

## Processos

### Main process

Responsável por recursos privilegiados:

- criação da janela;
- enumeração de monitores/janelas;
- seleção segura da fonte de `getDisplayMedia`;
- loopback de áudio do Windows;
- servidor WebSocket local de signaling;
- descoberta UDP;
- detecção Radmin/LAN;
- persistência de configurações;
- firewall e informações de GPU;
- helper nativo Windows para PTT global enquanto o jogo está em foco.

### Renderer

Responsável por UI e mídia WebRTC:

- microfone com constraints de voz;
- mesh `RTCPeerConnection`;
- perfect negotiation para reduzir glare;
- PTT/mute/deaf/VAD;
- captura de tela;
- seleção/preferência de codec;
- limites de bitrate/fps;
- coleta de `getStats()`;
- DataChannel de controle para devolver estatísticas do receptor.

## Protocolo de signaling

Mensagens JSON pequenas:

- `auth-challenge`
- `join` (prova HMAC opcional; nunca senha em texto puro)
- `welcome`
- `peer-joined`
- `peer-left`
- `signal` (`offer`, `answer`, `ice`)
- `presence`
- `ping` / `pong`
- `error`

O servidor apenas encaminha signaling. A mídia não atravessa o servidor.

## Convite

Formato `CC1-<base64url(JSON)>` contendo versão, host, porta e código da sala. Senhas não são colocadas no convite. Em salas protegidas, cada conexão recebe nonce + salt; o cliente deriva PBKDF2-SHA-256 e envia somente uma prova HMAC-SHA-256 vinculada ao nonce.

## Descoberta

O host anuncia a sala a cada 2 s por UDP na porta 43188 para broadcasts das interfaces detectadas. O cliente expira anúncios após 7 s. Radmin recebe prioridade na escolha de endereço.

## Evolução para SFU

A UI não assume que o signaling também transporte mídia. Para uma V2 com SFU, mantenha os contratos de `Participant`, `StreamStats` e controles, substituindo a criação do mesh por um adaptador de transporte SFU.
