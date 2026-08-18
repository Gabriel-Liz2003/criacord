# Plano de testes

## Automatizados

| Teste | Cobertura |
|---|---|
| `invite.test.ts` | encode/decode e rejeição de convite inválido |
| `network.test.ts` | cálculo de broadcast LAN/Radmin |
| `roomServer.test.ts` | challenge-response de senha, rejeição de senha inválida, dois clientes e relay de signaling |
| `pttKey.test.ts` | mapeamento das teclas PTT para virtual keys do Windows |
| `npm run typecheck` | renderer, shared, main e preload |
| `npm run build` | bundle React + compilação Electron |
| CI Windows | gera instalador NSIS e portátil |

## Matriz manual obrigatória antes de considerar a V1 estável

1. Windows 11 limpo sem Node/Python/SDK.
2. Instalar/abrir o `.exe`.
3. Criar sala no PC A.
4. Entrar pelo PC B usando Radmin e descoberta automática.
5. Repetir usando código de convite.
6. Testar senha correta/incorreta.
7. Microfone, mute, deaf e volume individual.
8. Push-to-talk com CriaCord focado e **com um jogo/janela externa em foco** (PTT global).
9. Voice activity.
10. Captura de monitor.
11. Captura de janela/jogo.
12. Áudio de sistema, verificando que não há áudio duplicado/eco por reprodução dupla.
13. 1080p60.
14. 1440p60.
15. AV1 em par de máquinas compatíveis.
16. Fallback H.264 em peer sem AV1.
17. Derrubar signaling por alguns segundos e validar reconexão.
18. Encerrar host e clientes sem processos órfãos.
19. Repetir com firewall inicialmente bloqueando a aplicação.

## Registro 1440p60

Para cada peer registrar no PR/release:

- resolução realmente recebida;
- FPS realmente recebido;
- bitrate recebido;
- RTT;
- jitter;
- packet loss;
- codec;
- frames dropped;
- CPU do transmissor;
- uso de Video Encode/GPU no Gerenciador de Tarefas.

A V1 só deve ser chamada de "1440p60 validada" quando um receptor reportar 2560×1440 e aproximadamente 60 FPS em hardware/rede compatíveis.
