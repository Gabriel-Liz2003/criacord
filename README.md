# CriaCord

CriaCord é um aplicativo Windows de comunicação privada para pequenos grupos: call de voz, chat e compartilhamento de tela/jogo com foco em baixa latência e qualidade de até **2560×1440 a 60 FPS** quando hardware e rede permitirem.

A versão 0.3 migra o desktop de Electron para **Tauri 2 + Rust + WebView2**, elimina Radmin/VPN manual e passa a conectar amigos pela internet usando **WebRTC ICE/STUN**, com **TURN opcional somente como fallback**.

> **Privacidade:** o CriaCord não grava áudio/vídeo, não possui publicidade, analytics ou telemetria por padrão. WebRTC P2P não é anonimato: peers participantes e serviços de signaling/TURN podem observar metadados de rede necessários para estabelecer a conexão.

## Uso para o usuário final

1. Abra `CriaCord.exe` ou instale pelo instalador Windows.
2. Escolha seu nome e dispositivos de áudio.
3. Clique em **Criar sala**.
4. Envie o código curto ou convite `CC2-...` aos amigos.
5. Eles clicam em **Entrar na sala** e colam o código/convite.
6. Converse, use o chat e compartilhe a tela.

O usuário final não precisa instalar Node.js, Rust ou SDK, não precisa abrir terminal, informar IP, instalar Radmin, configurar VPN, abrir portas ou executar o aplicativo como administrador.

## Rede

O signaling existe apenas para aproximar peers e trocar mensagens de negociação. Áudio e vídeo usam WebRTC.

```text
                 signaling WSS
        ┌──────────────┬──────────────┐
        │ SDP / ICE    │ SDP / ICE    │
        ▼              ▼              ▼
      Peer A  <──── WebRTC P2P ────> Peer B
        │                                  │
        └──── TURN relay somente se ──────┘
             conexão direta falhar
```

O cliente usa STUN por padrão. TURN pode ser configurado no build com `VITE_TURN_URL`, `VITE_TURN_USERNAME` e `VITE_TURN_CREDENTIAL`. Nenhuma dessas configurações é exigida do usuário final.

### Signaling padrão e signaling próprio

A build de desenvolvimento possui um endpoint WSS zero-config substituível por `VITE_SIGNALING_URL`. O repositório também inclui `signaling/`, um relay WebSocket mínimo e sem persistência para produção/self-hosting.

Para hospedar o signaling próprio:

```bash
cd signaling
npm install
PORT=8787 npm start
```

O serviço possui `GET /health` e aceita WebSocket em `/<canal-da-sala>`. Ele não processa mídia e não persiste mensagens.

Em produção, hospede esse diretório em um serviço com HTTPS/WebSocket (por exemplo Render, Railway, Fly.io ou VPS pequeno) e compile o cliente com:

```bash
VITE_SIGNALING_URL=wss://signal.seudominio.com npm run build:win
```

## Desktop leve: Tauri 2

A interface React existente foi preservada. O Electron main/preload, Chromium empacotado, helper PTT separado, descoberta Radmin e código de firewall foram removidos.

```text
┌────────────────────── CriaCord.exe ──────────────────────┐
│ Tauri 2 / Rust                                           │
│  ├─ settings locais                                      │
│  ├─ PTT global Windows via GetAsyncKeyState              │
│  └─ comandos desktop mínimos                             │
│                                                          │
│ WebView2 + React                                         │
│  ├─ UI de salas/call/chat/multistream                    │
│  ├─ getUserMedia (microfone)                             │
│  ├─ getDisplayMedia (seletor seguro do Windows)          │
│  ├─ WebRTC mesh / ICE / STUN / TURN                      │
│  ├─ Opus + AV1/H.264                                     │
│  └─ VAD, stats, adaptação e reconexão                    │
└──────────────────────────────────────────────────────────┘
```

O Tauri usa o WebView2 já presente no Windows em vez de distribuir uma cópia própria do Chromium.

## Voz e áudio

- microfone 48 kHz;
- mute e deafen;
- seleção de entrada/saída;
- volume individual por participante;
- PTT global integrado ao processo Rust, sem helper externo;
- VAD real com indicador verde também para o usuário local;
- echo cancellation e noise suppression configuráveis;
- AGC opcional;
- áudio de cada stream controlável separadamente.

O áudio do compartilhamento depende da faixa fornecida por `getDisplayMedia`/WebView2 no Windows. Se a origem escolhida não fornecer áudio de sistema, o app mostra um aviso em vez de fingir que o áudio está sendo transmitido.

## Streaming

Perfis disponíveis:

- 720p30;
- 720p60;
- 1080p30;
- 1080p60;
- 1440p30;
- 1440p60;
- personalizado.

O CriaCord prefere AV1 quando negociável e usa H.264 como alternativa. O encoder final depende das capacidades expostas pelo WebView2/Windows/driver. O sender configura bitrate/FPS via `RTCRtpSender` e reduz bitrate automaticamente quando as estatísticas indicam limitação por banda ou perda elevada.

A sessão observa estados ICE/PeerConnection, perda de track e signaling. Em `disconnected` persistente ou `failed`, tenta ICE restart automaticamente. O signaling também possui reconexão com backoff sem derrubar uma PeerConnection saudável apenas porque o WebSocket caiu.

## Multistream

Várias pessoas podem transmitir simultaneamente. A interface preserva o layout de foco introduzido na 0.2.1:

- stream principal em destaque;
- miniaturas das outras streams;
- clique para trocar o foco;
- fixação manual do foco;
- preview da própria stream;
- volume/mute por stream.

## Chat

O chat possui nome, horário, histórico da sessão, autoscroll e limite de 1000 caracteres por mensagem. O histórico não é salvo em disco. Mensagens recebidas são validadas e limitadas antes de entrar no estado da UI.

## Segurança e privacidade

- mídia WebRTC protegida por DTLS-SRTP;
- signaling por WSS quando usado pela internet;
- mídia não passa pelo signaling;
- TURN só retransmite mídia quando necessário e configurado;
- nenhuma gravação automática;
- nenhuma telemetria/analytics/tracking/ads por padrão;
- mensagens possuem limites de tamanho e validação básica;
- códigos de sala são aleatórios; sala com senha deriva um canal separado via SHA-256 da combinação sala+senha;
- nenhum IP é exibido na interface.

**Importante:** WebRTC precisa trocar ICE candidates. Portanto, outro participante da sala pode obter informações de endereço de rede necessárias à conexão; um relay TURN também vê os endpoints de transporte. O CriaCord é privado por design, mas não promete anonimato de rede.

## Desenvolvimento

Requisitos somente para desenvolvedores:

- Node.js 22+;
- Rust stable;
- toolchain Windows necessário pelo Tauri.

```bash
npm install
npm run dev
```

Validação:

```bash
npm run typecheck
npm test
cd src-tauri && cargo test
```

Build Windows:

```bash
npm run build:win
```

O GitHub Actions executa typecheck, testes JS, teste de relay do signaling, testes Rust, build do renderer, build Tauri, smoke-test do binário e publica o executável/instalador como artifact.

## Métricas da migração

A 0.2.1 Electron gerava executáveis próximos de 100 MB. O CI da 0.3 registra o tamanho real do binário Tauri e falha se o executável bruto ultrapassar 40 MB. Os números finais são registrados em `docs/MIGRATION_TAURI_0.3.md` após a build verde.

RAM em idle/call e desempenho real de 1440p60 precisam de validação em hardware Windows físico; esses valores não são inventados a partir do CI.

## Limitações conhecidas

- P2P mesh exige um upload por espectador; grupos grandes ainda se beneficiariam de um SFU.
- STUN resolve muitos NATs, mas CGNAT/NAT simétrico/rede corporativa pode exigir TURN. A build precisa possuir credenciais TURN válidas para esse fallback.
- áudio de sistema via WebView2 depende da fonte e da versão do runtime/Windows;
- 1440p60 depende da origem, codec, driver, encoder e banda de todos os envolvidos;
- assinatura de código Windows continua sendo uma etapa separada; sem certificado confiável, SmartScreen/Smart App Control pode alertar/bloquear builds novas.

Veja `docs/ARCHITECTURE.md`, `docs/PRIVACY.md`, `docs/TESTING.md` e `docs/MIGRATION_TAURI_0.3.md`.
