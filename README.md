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
