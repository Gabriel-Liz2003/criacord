# Plano de testes

## Automatizados no CI Windows

| Teste | Cobertura |
|---|---|
| `invite.test.ts` | CC2 sem IP/porta, geração/normalização de código e rejeição de convite legado/inválido |
| `npm run typecheck` | React/shared/Tauri bridge |
| `npm test` | testes unitários TypeScript |
| `npm test --prefix signaling` | sobe relay próprio, conecta dois WebSockets e valida encaminhamento real |
| `cargo test` | backend Rust/Tauri |
| `npm run build` | bundle React/Vite |
| `npx tauri build` | executável Release + instalador NSIS Windows |
| `criacord.exe --smoke-test` | valida que o binário Release inicia e encerra corretamente |
| limite de tamanho | CI falha se o executável Tauri bruto ultrapassar 40 MB |

## Matriz manual obrigatória antes de considerar a 0.3 validada em hardware

1. Windows 10/11 limpo, sem Node/Rust/SDK instalado pelo usuário.
2. Abrir o `.exe` sem executar como administrador e sem UAC do CriaCord.
3. PC A e PC B em **redes de internet diferentes**.
4. Criar sala no PC A e copiar somente código/convite.
5. Entrar no PC B sem Radmin, IP manual ou port forwarding.
6. Confirmar candidate pair direto em cenário de NAT comum.
7. Repetir em rede/CGNAT que exija TURN, usando uma build com TURN configurado.
8. Desconectar/reconectar Wi-Fi ou trocar de rede e observar ICE restart/reconexão.
9. Derrubar signaling temporariamente durante call já estabelecida e confirmar que mídia P2P existente não cai apenas por isso.
10. Microfone do criador e convidados.
11. Mute, deaf, seleção de dispositivos e volumes individuais.
12. PTT global com jogo/janela externa em foco.
13. VAD e borda verde local/remota sem piscar excessivamente por ruído ambiente.
14. Captura de monitor e janela/app pelo seletor do WebView2.
15. Áudio de sistema do host e convidados.
16. 720p30/60, 1080p30/60, 1440p30/60.
17. AV1 quando ambos os peers suportarem.
18. H.264 como fallback.
19. Reduzir banda artificialmente e verificar adaptação de bitrate.
20. Encerrar track de screen share e confirmar remoção/recuperação limpa.
21. Duas, três e quatro streams simultâneas; foco/miniaturas/preview próprio.
22. Volume/mute separado de cada stream.
23. Chat, histórico da sessão, limite de 1000 caracteres e payload inválido.
24. Encerrar o app e confirmar ausência de processos auxiliares órfãos.

## Diagnóstico esperado

Durante desenvolvimento registrar somente eventos técnicos:

- criação/entrada/saída da sala;
- peer detectado/removido;
- estado ICE;
- estado PeerConnection;
- negotiation needed;
- ICE restart;
- signaling connect/disconnect/retry;
- início/fim/perda da track de stream;
- redução automática de bitrate.

Não registrar texto de chat, áudio ou vídeo.

## Registro 1440p60

Para cada peer registrar:

- resolução realmente recebida;
- FPS realmente recebido;
- bitrate recebido;
- RTT;
- jitter;
- packet loss;
- codec;
- frames dropped;
- CPU do transmissor;
- uso do mecanismo de Video Encode da GPU quando observável.

A versão só deve ser chamada de **1440p60 validada em hardware** quando um receptor real reportar aproximadamente 2560×1440 / 60 FPS durante teste sustentado.

## Métricas de desktop

Registrar em máquina física antes/depois:

- tamanho instalado/distribuição;
- RAM idle após estabilização;
- RAM durante call de voz;
- RAM durante 1440p60;
- quantidade de processos do CriaCord;
- tempo até a janela estar utilizável.

O CI fornece tamanho do executável e tempo do modo smoke-test. RAM/call e tempo visual real não devem ser inferidos a partir desses números.
