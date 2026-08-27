# Arquitetura

## Decisão de stack

A partir da 0.3, o CriaCord usa **Tauri 2 + Rust + React/TypeScript + WebView2** no Windows. A UI e a maior parte da lógica WebRTC existente foram preservadas; os elementos específicos do Electron foram substituídos por comandos Rust mínimos.

A migração evita empacotar Chromium/Node com o aplicativo e remove o servidor doméstico, descoberta Radmin/LAN, firewall elevado e helper PTT externo.

## Camadas

### Tauri / Rust

Responsável apenas pelo que precisa de integração desktop:

- janela nativa;
- persistência de `settings.json` no diretório de dados do app;
- PTT global no Windows via `GetAsyncKeyState`;
- versão do app e metadados desktop;
- empacotamento NSIS/current-user.

Não hospeda sala, não abre porta de entrada, não altera firewall e não solicita UAC no fluxo normal.

### WebView2 / React

Responsável por:

- UI de sala/call/chat/multistream;
- microfone (`getUserMedia`);
- seletor de compartilhamento (`getDisplayMedia`);
- WebRTC mesh;
- ICE/STUN/TURN;
- perfect negotiation;
- VAD/mute/deafen/PTT;
- preferência AV1/H.264;
- bitrate/FPS e adaptação;
- `getStats()` e diagnóstico;
- preview e volumes individuais de streams.

## Conectividade

### Signaling

O signaling é um relay WebSocket externo e mínimo. Ele não precisa conhecer topologia de mídia nem transportar áudio/vídeo.

Envelope:

```ts
interface RouterEnvelope {
  v: 2;
  from: string;
  displayName: string;
  to?: string;
  sentAt: number;
  message: WireMessage;
}
```

Mensagens usadas:

- `hello` / `hello-ack`: descoberta de peers no canal da sala;
- `signal`: offer/answer/ICE direcionados;
- `presence`: speaking/sharing/mute/deafen;
- `chat` / `chat-sync`: chat da sessão;
- `bye`;
- `ping`.

O repositório fornece `signaling/server.mjs`, que simplesmente retransmite bytes aos outros sockets do mesmo canal. Não existe persistência.

### ICE/STUN/TURN

Cada `RTCPeerConnection` recebe servidores STUN. O navegador coleta candidates e tenta caminho UDP direto.

Quando configurado no build, TURN é adicionado como segundo caminho:

```text
A <──────────── UDP / WebRTC direto ────────────> B
 \                                                /
  └────────────── TURN somente fallback ─────────┘
```

Configuração de build:

- `VITE_TURN_URL`
- `VITE_TURN_USERNAME`
- `VITE_TURN_CREDENTIAL`

O usuário final não configura nada disso.

### Recuperação

- `iceConnectionState=disconnected` por alguns segundos -> `restartIce()`;
- `iceConnectionState=failed` -> `restartIce()` imediato;
- `connectionState=failed` -> tentativa de ICE restart;
- signaling WSS reconecta com backoff sem destruir automaticamente PeerConnections já saudáveis;
- fim inesperado da track de compartilhamento remove a stream da UI;
- track local perdida encerra o compartilhamento de forma limpa;
- perda/limitação de banda reduz bitrate do sender gradualmente.

## Salas e convites

A 0.3 usa códigos aleatórios de 12 caracteres e convite `CC2-<base64url(JSON)>`. O convite não carrega IP nem porta.

Sala sem senha usa canal derivado do código. Sala com senha deriva um sufixo SHA-256 de `roomCode:password`, de forma que uma senha errada leva a outro canal em vez de expor a senha ao signaling.

Isso não substitui autenticação forte para cenários hostis; o projeto é direcionado a pequenos grupos de amigos. Para exposição pública, recomenda-se adicionar autenticação/token de sala no signaling próprio.

## Mídia

### Voz

O microfone é capturado uma vez e adicionado a cada PeerConnection. A identificação remota mantém streams separadas para microfone e compartilhamento. VAD usa análise RMS local e envia apenas estado speaking, nunca amostras de áudio para o signaling.

### Tela e áudio de sistema

`getDisplayMedia` abre o seletor de captura fornecido pelo WebView2/Windows. O CriaCord solicita vídeo na resolução/FPS desejados e áudio de sistema quando habilitado. Se o runtime não fornecer uma track de áudio, o app informa explicitamente a limitação.

### Codecs e bitrate

- preferência: AV1 quando suportado e negociável;
- fallback: H.264;
- `RTCRtpSender.setParameters` define teto de bitrate/FPS;
- stats por peer permitem reduzir bitrate quando a rede não sustenta o perfil solicitado.

A aceleração concreta depende do WebView2, driver e GPU. O CriaCord não afirma AMF/NVENC/QSV ativo sem confirmação de stats/runtime.

## Multistream

O transporte continua mesh: cada transmissor envia uma track de tela para cada peer. A UI possui foco principal, filmstrip, preview próprio e volume independente por stream.

Para grupos maiores, a evolução recomendada continua sendo um SFU. A separação entre UI, signaling e transporte de mídia permite trocar o mesh posteriormente sem reescrever toda a interface.

## Segurança

- WebRTC usa DTLS-SRTP;
- signaling deve usar WSS em produção;
- mensagens são limitadas e validadas antes de serem aplicadas;
- conteúdo de mídia não é persistido;
- nenhum serviço de analytics/telemetria é incluído por padrão;
- PTT global consulta apenas o estado da tecla configurada.

WebRTC não fornece anonimato entre peers. ICE candidates e serviços TURN podem revelar informações de rede necessárias ao transporte. Veja `PRIVACY.md`.
