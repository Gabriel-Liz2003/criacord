# Privacidade

O CriaCord foi desenhado para pequenos grupos privados e não monetiza dados do usuário.

## O que não existe

- gravação automática;
- `MediaRecorder` no fluxo normal de chamadas;
- armazenamento de áudio/vídeo/tela;
- analytics;
- anúncios;
- tracking;
- telemetria escondida.

## Mídia

Áudio e vídeo usam WebRTC. Quando uma conexão direta é possível, a mídia trafega entre os peers usando DTLS-SRTP. O servidor de signaling não recebe frames, áudio ou vídeo.

Quando TURN está configurado e a conexão direta não funciona, o transporte pode passar pelo relay TURN. Isso ainda usa a proteção de mídia do WebRTC, porém o operador do TURN consegue observar metadados de conexão e volume de tráfego.

## Signaling

O signaling remoto recebe/retransmite dados necessários à sessão, como:

- ID do cliente e nome exibido;
- presença;
- SDP;
- ICE candidates;
- mensagens de controle;
- chat da sessão na implementação atual.

Em produção o endpoint deve usar `wss://`. O relay próprio em `signaling/` não persiste mensagens.

## WebRTC não é anonimato

Para estabelecer uma conexão, WebRTC troca ICE candidates. Isso pode permitir que outro participante da mesma sala conheça endereços de rede públicos/locais necessários à conectividade. STUN e TURN também observam metadados de rede compatíveis com sua função.

O CriaCord não exibe esses IPs na interface, mas não promete anonimato entre participantes. Se anonimato de rede for requisito, deve-se forçar TURN por uma infraestrutura confiável e revisar o threat model.

## Persistência local

`settings.json`, no diretório de dados do aplicativo, guarda apenas preferências como nome, dispositivos e opções de áudio. Senha da sala não é persistida pelo backend Tauri.

O histórico de chat existe somente durante a sessão na memória dos participantes e não é escrito em disco pelo CriaCord.

## Logs

A aplicação registra somente diagnóstico técnico útil, por exemplo:

- entrada/saída de peers;
- estado ICE/PeerConnection;
- renegociação;
- início/fim/perda de stream;
- tentativas de reconexão;
- limitação/adaptação de bitrate.

Não deve registrar conteúdo de mensagens, áudio ou vídeo. A build Release deve manter logs mínimos.

## Push-to-talk global

No Windows, o PTT global foi integrado ao backend Rust. Durante uma chamada com PTT habilitado, uma thread consulta somente o estado da tecla configurada com `GetAsyncKeyState`.

O CriaCord não enumera texto digitado, não registra sequência de teclas, não salva histórico e não envia eventos de teclado pela rede.

## Senhas de sala

Convites `CC2` não contêm a senha. Quando há senha, o cliente deriva localmente um identificador de canal usando SHA-256 de `roomCode:password`; a senha não é incluída no envelope de signaling.

Essa técnica evita enviar a senha ao relay, mas não deve ser tratada como um sistema completo de autenticação contra atacante ativo. Para um serviço público maior, recomenda-se autenticação/token de sala no signaling próprio.

## Serviços terceiros

A build pode usar:

- servidores STUN públicos para descoberta de candidate público;
- endpoint WSS de signaling configurado no build;
- TURN configurado no build quando necessário.

Quem distribuir uma build deve documentar quais endpoints concretos foram configurados e escolher operadores confiáveis.
