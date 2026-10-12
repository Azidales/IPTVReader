# IPTVReader 0.3.1-test.2

Pré-versão para Windows x64.

## Ajuste visual do test.2

Corrige a ordem de camadas do modal de importação: textos e elementos da área do player agora ficam atrás do diálogo. A superfície nativa do mpv continua sendo ocultada enquanto o modal está aberto. O mpv continua sendo instalado/selecionado separadamente.

## Correção

A versão 0.3.0 usava uma BrowserWindow como host de `--wid`. O mpv criava seu HWND filho, mas a superfície do Electron podia cobrir a apresentação nativa. Um host BaseWindow também produziu tela preta no teste real. Agora o host é uma janela Win32 STATIC, pertencente à janela principal, sem compositor Chromium. O vídeo permanece na área do player, acompanha a janela e não cria entrada própria na barra de tarefas.

O HWND é enviado como uint32 sem sinal. O host recebe tamanho e visibilidade antes de iniciar o mpv; os limites são enviados explicitamente antes de cada reprodução. As coordenadas DIP são convertidas em pixels nativos pelo Electron. A saída usa D3D11 com apresentação por blit, sem flip-model. Tela cheia é controlada pelo aplicativo. Parar, minimizar e abrir o diálogo ocultam o vídeo; alterações posteriores de tamanho não mostram novamente um player parado.

O formato do catálogo, diretório de dados, favoritos e configurações existentes permanecem compatíveis. Importação e reprodução HTTP continuam diretas. Os testes usaram exclusivamente uma playlist sintética de localhost, sem credenciais ou dados pessoais.

## Validação

- 7 testes desktop: catálogo, persistência, HWND, inicialização e ciclo de visibilidade do host.
- 7 testes do parser M3U; configuração do Vitest corrigida para não recolher testes node:test.
- TypeScript e compilação da interface desktop.
- Windows local, Electron 44.7.0, mpv git accb7b2821: vídeo sintético H.264 640x360 e áudio AAC mono por HTTP. IPC confirmou vídeo, áudio e saída D3D11 configurada. Duas capturas reais da tela mostraram frames diferentes dentro da área do aplicativo.
- Teste real de pausa/retomada, mudo, ocultar/mostrar diálogo, minimizar/restaurar, tela cheia, mover, redimensionar e parar.
- Instalador e executável portátil compilados pelo workflow Windows Desktop Build. Consulte a execução vinculada ao commit para o resultado final.

Limites: a validação visual cobre o computador local e o vídeo sintético; playlists privadas, todas as GPUs, HDR e configurações com vários monitores/DPI diferentes não foram validadas. Esta é uma versão de testes.

## Repetir o teste real

Crie um MP4 sintético com vídeo em movimento e pelo menos 45 segundos. Não use arquivos ou playlists privados.

```powershell
npm ci
npm run test:desktop
npm test
npm run build:desktop
$env:MPV_PATH = 'C:\caminho\mpv.exe'
$env:VIDEO_FIXTURE = 'C:\caminho\video-sintetico.mp4'
$env:IPTV_TEST_OUTPUT = 'C:\caminho\resultados-de-teste'
& .\node_modules\electron\dist\electron.exe .\scripts\native-smoke.cjs
```

O teste usa um diretório de dados novo e uma porta HTTP aleatória de localhost. Captura somente a região do aplicativo, verifica diversidade de cores e mudança de frames e grava `smoke-ready.json` após os testes. As capturas ainda devem ser inspecionadas visualmente. O teste coloca o aplicativo temporariamente em primeiro plano; execute numa sessão Windows desbloqueada, com a janela inteiramente visível em um monitor de pelo menos 1490x940 DIP. Ele não roda como teste visual headless no GitHub Actions.
