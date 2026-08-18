# Privacidade

O CriaCord foi desenhado para grupos privados.

## O que não existe

- gravação automática;
- `MediaRecorder` no fluxo de chamadas;
- upload de tela, áudio ou vídeo;
- analytics;
- ads;
- tracking;
- telemetria escondida.

## O que trafega

O servidor de signaling local recebe apenas metadados necessários para formar a sala e negociar WebRTC: nome, ID efêmero/persistente do cliente, presença, SDP e ICE. A mídia usa conexão WebRTC entre peers.

## Persistência local

`settings.json` guarda apenas preferências de uso, como nome, dispositivos e opções de áudio. Senhas de sala não são salvas.

## Logs

A V1 não mantém log persistente por padrão. Mensagens de erro técnico podem aparecer no console de desenvolvimento, sem conteúdo de mídia.

## Push-to-talk global

No Windows, o PTT global usa um helper nativo local que consulta somente o estado da tecla escolhida para PTT. Ele não enumera texto digitado, não registra outras teclas, não grava histórico e não envia dados para a rede. O helper só é iniciado durante uma chamada quando PTT está habilitado.

## Senhas de sala

A senha não é enviada em texto puro no signaling. O host envia um nonce aleatório e salt; o cliente deriva um verificador via PBKDF2-SHA-256 e responde com HMAC-SHA-256. O nonce é novo por conexão, reduzindo risco de replay. A senha permanece apenas em memória durante a tentativa de conexão/hospedagem e não é escrita nos logs.
