# Registro de validação — 2026-08-17

## Ambiente disponível

- Linux x64 (ambiente do agente)
- Node.js 22.16.0
- TypeScript global 5.8.3
- Sem Electron/React/ws instalados localmente
- A resolução DNS de `registry.npmjs.org` não estava disponível no ambiente, impedindo a instalação das dependências npm
- Sem Windows, GPU física compatível, Radmin VPN ou segundo PC neste ambiente

## Testes realmente executados

- Transpilação sintática isolada de **22 arquivos TypeScript/TSX/CTS**: PASS, 0 falhas.
- Round-trip do código de convite `CC1-...` e rejeição de convite inválido: PASS.
- Cálculo de broadcast IPv4 para redes 26/8, 192.168/24 e 10/16: PASS.
- Mapeamento de teclas do PTT para Virtual-Key do Windows (`KeyV`, `Space`, `F8`, `Numpad5`) e rejeição de código desconhecido: PASS.
- Compatibilidade criptográfica cliente/host de PBKDF2-SHA-256 + HMAC-SHA-256 com nonce: PASS.
- Parse de `package.json`: PASS.
- Varredura estática do diretório `src` por `MediaRecorder`, analytics, tracking, telemetria e padrões de upload de mídia: PASS (nenhuma ocorrência proibida).
- Working tree Git ao final da validação: limpa.

## Validações automatizadas preparadas, mas não executadas aqui

O workflow `.github/workflows/ci.yml` em `windows-latest` instala as dependências, executa typecheck, Vitest, bundle, compila o helper PTT nativo com MSVC, gera os executáveis Windows e executa o smoke test do binário empacotado.

Não foi possível executar essa etapa neste ambiente porque as dependências npm não puderam ser baixadas e o host não é Windows. Portanto, **não há alegação de que o `.exe` foi compilado ou executado nesta sessão**.

## Validações físicas obrigatórias restantes

Antes de chamar 0.1.0 de V1 estável/validada, executar em dois PCs Windows:

- host + cliente via Radmin/LAN;
- descoberta automática e convite;
- senha correta/incorreta;
- microfone, mute, deaf, PTT global com jogo em foco e VAD;
- monitor e janela/jogo;
- áudio do sistema sem duplicação;
- 1080p60 e 1440p60;
- AV1 quando suportado e H.264 como fallback;
- métricas do receptor, packet loss e reconexão;
- regra de Firewall/UAC;
- inicialização em máquina sem Node/Python/SDK;
- encerramento sem processos órfãos.

Para 1440p60, registrar resolução/FPS realmente recebidos, bitrate, RTT, jitter, packet loss, codec, dropped frames, CPU e Video Encode/GPU.

## Publicação GitHub

O código contém CI e workflow de Release, mas nenhum repositório `CriaCord` estava disponível na conexão GitHub desta sessão e o ambiente local não possui `gh`. Por isso nenhum push, Pull Request ou GitHub Release foi criado nesta execução. O histórico Git local preserva branches e commits de cada conjunto relevante de mudanças.
