# IPTVReader

Aplicativo IPTV **estático** para GitHub Pages, feito em Vite + TypeScript. Suporta listas **M3U** por arquivo ou URL, API **Xtream Codes**, streams diretos (HLS, DASH, MP4, WebM, MPEG-TS/FLV quando suportados), categorias, pesquisa, favoritos, séries e importação de **XMLTV**.

> O IPTVReader **não fornece canais, credenciais ou assinaturas**. Use apenas fontes que você tem autorização para acessar.

## Acessar

Depois de ativar GitHub Pages, o endereço previsto é: **https://azidales.github.io/IPTVReader/**.

## Começar

```bash
npm install
npm run dev
```

Abra o endereço indicado pelo Vite. Para validar:

```bash
npm test
npm run build
npm run preview
```

## Publicar no GitHub Pages

1. Abra **Settings → Pages** no repositório.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. O workflow `.github/workflows/deploy.yml` faz os testes, compila o Vite e publica a pasta `dist` quando houver push na `main` (ou execução manual).
4. Confira a aba **Actions** para o estado real do deploy. O `base` do Vite é `/IPTVReader/`.

## Limitações técnicas do GitHub Pages

- **HTTPS/mixed content:** feeds HTTP normalmente são bloqueados quando o aplicativo usa HTTPS.
- **CORS:** baixar playlists remotas, XMLTV e consultar a API Xtream exige permissão CORS do provedor.
- **Codecs:** MP4, HLS, DASH e MPEG-TS dependem dos codecs e APIs disponíveis no navegador.
- **Sem proxy:** o Pages não executa backend; protocolos RTSP, RTMP e UDP precisam de gateways externos legítimos.
- **Xtream:** credenciais e canais recebidos pela API são mantidos **apenas na memória da aba**, não persistidos no IndexedDB. URLs carregadas via Xtream contêm as credenciais exigidas pelo próprio protocolo; não compartilhe logs nem links.
- **Armazenamento local:** fontes M3U e links diretos, inclusive tokens eventualmente embutidos em URLs, são salvos no **IndexedDB deste navegador**, não em servidor do IPTVReader. Remova a fonte e limpe dados do site se usar computador compartilhado.
- **EPG:** importe um XMLTV local durante cada sessão. O código cruza `tvg-id` com `programme channel`.
- **Xtream séries:** selecione uma série e depois um episódio retornado pelo provedor.
- **Listas grandes:** a listagem usa lotes de 120; o parse é local e arquivos têm limite de 25 MB.

## Arquitetura

- `src/core/m3u.ts` — parser com metadados e URLs relativas;
- `src/core/xtream.ts` — autenticação, catálogo e episódios Xtream;
- `src/core/epg.ts` — leitura de XMLTV;
- `src/core/storage.ts` — persistência de fontes sem credenciais Xtream e favoritos;
- `src/player/manager.ts` — seleção de engine e cleanup;
- `src/main.ts` — UI, eventos e fluxo de navegação;
- `src/styles/main.css` — layout responsivo.

Dependências de reprodução são carregadas **sob demanda** via importações dinâmicas.

## Roadmap

- Melhorias na atualização de fontes remotas (agendamento e URL opcional).
- EPG em Web Worker para XMLTV extensos.
- Paginação/virtualização para catálogos enormes e melhoria de acessibilidade no teclado/TV.
- Provedor de gateway opcional para formatos incompatíveis, sem ultrapassar autenticação, DRM ou direitos de acesso.

---

## IPTVReader Desktop — Windows (versão experimental 0.2.0)

A versão Windows usa **Electron + mpv**. O catálogo é processado pelo Node.js localmente, evitando as limitações de CORS/Mixed Content do GitHub Pages. O aplicativo não inclui vídeos nem playlists de terceiros.

### Baixar o instalador

1. Acesse [GitHub Actions → Windows Desktop Build](https://github.com/Azidales/IPTVReader/actions/workflows/desktop-windows.yml).
2. Abra a **última execução concluída com sucesso**, baixe o artefato `IPTVReader-Windows-x64` e extraia o ZIP.
3. Execute o instalador (`Setup.exe`) ou a versão portátil (`.exe`). Como não há certificado de assinatura de código, o SmartScreen pode solicitar confirmação antes de executar.
4. Instale o [mpv para Windows](https://mpv.io/installation/) separadamente, ou coloque `mpv.exe` no PATH. Se não for detectado, use **Selecionar mpv.exe** na interface.
5. Em **Importar M3U**, selecione o arquivo da sua playlist. O primeiro processamento pode levar alguns segundos para centenas de milhares de itens. Depois selecione um canal.

A janela de vídeo abre no mpv, em tela cheia. **Alt+Tab** retorna ao catálogo do IPTVReader; **F** alterna a tela cheia do mpv. O navegador não é necessário para reproduzir os streams.

### Desenvolver localmente

```bash
npm install
npm run test:desktop
npm run desktop:dev
```

O `desktop:dev` compila o frontend desktop com Vite e abre o Electron. Para criar instalador/portátil (no Windows):

```bash
npm run build:desktop
npx electron-builder --win --publish never
```

### Arquitetura e limitações

- `desktop/catalog.cjs`: importação progressiva de M3U (até 1 GB), índice local, consultas por categoria, pesquisa e paginação sem enviar 300 mil itens de uma vez ao renderer.
- `desktop/main.cjs`: janela segura do Electron, leitura de arquivo local e requisições M3U remotas pelo processo principal.
- `desktop/mpv.cjs`: reprodução de links via mpv usando **IPC local** e sem expor o endereço de vídeo na linha de comando.
- `desktop/preload.cjs`: API restrita para a interface, sem `nodeIntegration`.
- `src/desktop.ts`: interface de TV/desktop com favoritos, pesquisa e seleção de canais, filmes e episódios.

**Avisos:** o mpv **não é incluído** nos instaladores desta versão. Streaming HTTP transporta credenciais e dados sem criptografia; a playlist importada também é salva localmente no perfil do aplicativo e pode conter links com credenciais em texto claro. Proteja o PC e use apenas fontes autorizadas. Não envie suas playlists para repositórios públicos. A ausência de DRM/codec compatível pode impedir a reprodução de alguns itens. Os episódios são apresentados individualmente conforme vêm na M3U (a organização em temporadas é futura). A página web original continua independente e não recebe essas permissões locais.
