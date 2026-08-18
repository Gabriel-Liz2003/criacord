# CriaCord

Aplicativo Windows privado para pequenos grupos, focado em **voz de alta qualidade** e **transmissão de tela/jogo em até 2560×1440 a 60 FPS**, sem servidor público e sem gravação de conteúdo.

> **Privacidade:** o CriaCord não grava nem armazena suas chamadas ou transmissões. Não há analytics, publicidade ou telemetria escondida.

## V1 implementada no código (validação Windows/hardware pendente)

- Salas P2P com nome, senha opcional, lista de participantes e estado de fala/transmissão.
- Host/signaling embutido no próprio aplicativo; nenhum backend precisa ser iniciado manualmente.
- Detecção de adaptadores IPv4 e preferência automática por Radmin VPN/endereços `26.x`.
- Descoberta automática de salas por UDP broadcast em LAN/VPN e convite `CC1-...` como fallback.
- Voz via WebRTC/Opus, 48 kHz, mute, deaf, push-to-talk global no Windows (helper nativo), VAD, escolha de entrada/saída e volume individual.
- Echo cancellation e noise suppression configuráveis; AGC é opcional e vem desligado.
- Compartilhamento de monitor ou janela/aplicativo com presets 720p30, 720p60, 1080p30, 1080p60 e 1440p60.
- Bitrate manual, incluindo valores acima de 40 Mbps se a rede/hardware suportarem.
- Áudio de sistema separado do microfone usando o loopback de captura do Electron/Chromium no Windows.
- Preferência de codec AV1 → H.264, respeitando os codecs negociados entre os peers.
- Aceleração de vídeo do Chromium habilitada por padrão; GPU/feature status é consultado pelo app.
- Estatísticas por peer: resolução, FPS, bitrate, RTT, jitter, packet loss, codec, frames enviados/decodificados e frames dropped. O receptor devolve suas métricas ao transmissor por DataChannel.
- Reconexão automática do signaling com backoff.
- Instalador NSIS e `.exe` portátil via `electron-builder`.
- GitHub Actions para validar, testar, gerar executáveis Windows e publicar releases por tag.

## Uso para o usuário final

1. Baixe `CriaCord-<versão>-x64.exe` ou `CriaCord-Portable-<versão>-x64.exe` em **GitHub Releases**.
2. Abra o programa.
3. Escolha seu nome e, se quiser, microfone/saída.
4. Crie uma sala ou entre por descoberta/código de convite.
5. Autorize o Firewall do Windows quando solicitado.
6. Converse e compartilhe sua tela.

O usuário final **não precisa instalar Node.js, Python, SDK, runtime ou executar terminal**. Electron e todas as dependências ficam dentro do pacote.

## Arquitetura

```text
┌────────────────────── CriaCord.exe ──────────────────────┐
│ Electron Main                                            │
│  ├─ RoomServer (WebSocket signaling local)               │
│  ├─ DiscoveryService (UDP broadcast LAN/Radmin)          │
│  ├─ desktopCapturer + Windows loopback audio             │
│  ├─ Firewall / Network / GPU detection                   │
│  ├─ Helper nativo de PTT global (somente tecla escolhida)│
│  └─ Settings persistentes                                │
│                         IPC                              │
│ React Renderer                                           │
│  ├─ UI de salas/chamada                                  │
│  ├─ getUserMedia (microfone)                             │
│  ├─ getDisplayMedia (tela/janela + áudio do Windows)     │
│  └─ WebRTC mesh + Opus + AV1/H.264 + DataChannel stats   │
└──────────────────────────────────────────────────────────┘
                 │ DTLS-SRTP/WebRTC P2P
          ┌──────┴───────┬──────────────┐
        Peer B         Peer C          Peer D
```

A V1 usa mesh P2P. A camada de signaling e a sessão de mídia ficam separadas para permitir uma futura troca por SFU sem reescrever a UI inteira.

## Desenvolvimento

Requisitos **somente para quem desenvolve**:

```bash
npm install
npm run dev
```

Validação:

```bash
npm run typecheck
npm test
npm run build
```

Build Windows:

```bash
npm run build:win
```

Saída em `release/`.

## GitHub / branches

Use uma branch por mudança relevante, por exemplo:

- `feature/voice-chat`
- `feature/screen-share`
- `fix/audio-capture`

Cada PR deve registrar o que mudou, motivo, data e testes executados. O template em `.github/pull_request_template.md` já cobra esses dados.

## Releases

Criar uma tag dispara o workflow de release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

O GitHub Actions compila em `windows-latest` e o `electron-builder` publica os `.exe` na Release.

## Segurança e privacidade

- Mídia de chamada é transportada pelo WebRTC (DTLS-SRTP).
- Signaling da V1 fica na rede privada/LAN e não carrega áudio/vídeo; contém somente metadados e SDP/ICE necessários à conexão.
- Senha de sala usa PBKDF2-SHA-256 + desafio HMAC-SHA-256 com nonce por conexão; a senha não trafega em texto puro e o verificador não é persistido.
- Nenhum áudio, vídeo ou frame é salvo em disco.
- Não há analytics, tracking ou upload de conteúdo.
- A aplicação desativa a ocultação de IP local por mDNS porque a V1 depende de conectividade direta em LAN/Radmin; use somente redes privadas confiáveis.

## Limitações conhecidas da V1

- O áudio compartilhado no Windows é o **loopback do sistema**. Captura de áudio isolada por processo/jogo não é garantida pela API utilizada.
- P2P mesh faz o transmissor enviar um fluxo por espectador. Para grupos maiores, a evolução natural é um SFU.
- 1440p60 depende de monitor/origem, encoder da GPU, codec negociado e banda disponível de cada peer; o app mostra as métricas recebidas para deixar claro quando a meta não está sendo atingida.
- Assinatura de código Windows não está configurada; sem certificado, o SmartScreen pode exibir aviso no primeiro uso.
- A publicação dos binários depende de executar os workflows em um repositório GitHub; este pacote fonte sozinho não é uma Release.

Veja também `docs/ARCHITECTURE.md`, `docs/TESTING.md` e `docs/PRIVACY.md`.
