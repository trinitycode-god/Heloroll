# Arigato — Biblioteca Pessoal de Streaming de Animes

Arigato transforma uma pasta local do seu computador (ex: `D:\Animes`) em uma
vitrine de streaming completa, rodando 100% no navegador — sem backend, sem
banco de dados em servidor, sem Node.js e sem Electron. É um site estático
feito para ser hospedado gratuitamente no **GitHub Pages**.

## Índice
1. [Como funciona](#como-funciona)
2. [Estrutura do projeto](#estrutura-do-projeto)
3. [Como subir para o GitHub](#como-subir-para-o-github)
4. [Como ativar o GitHub Pages](#como-ativar-o-github-pages)
5. [Como conectar sua pasta de animes](#como-conectar-sua-pasta-de-animes)
6. [Limitações de segurança do navegador](#limitações-de-segurança-do-navegador)
7. [Compatibilidade](#compatibilidade)
8. [Roadmap / próximos passos](#roadmap)

---

## Como funciona

O Arigato usa a **File System Access API**, um recurso nativo do Chrome e do
Edge que permite que um site, com sua autorização explícita, leia arquivos de
uma pasta do seu computador — sem enviar nada para nenhum servidor. Tudo
acontece localmente:

- A leitura da pasta e dos vídeos acontece no seu navegador.
- As capas e sinopses vêm de uma API pública gratuita ([Jikan API](https://jikan.moe/), um wrapper do MyAnimeList) e ficam guardadas em cache no seu navegador (IndexedDB).
- O progresso dos episódios, favoritos e a biblioteca ficam salvos apenas no seu navegador (IndexedDB/localStorage) — **nada é enviado para nenhum servidor**.

Estrutura de pastas esperada:

```
D:\Animes
├── Naruto
│   ├── Temporada 01
│   │   ├── Episódio 01.mp4
│   │   ├── Episódio 02.mp4
│   │   └── Episódio 03.mp4
├── One Piece
│   ├── Episódio 01.mkv
│   └── Episódio 02.mkv
├── Solo Leveling
│   └── Episódio 01.mp4
```

- **Cada pasta dentro da raiz é um anime.**
- Se o anime tiver subpastas de temporada (ex: `Temporada 01`, `Season 2`, `S3`), elas são detectadas automaticamente.
- Se os episódios estiverem soltos direto na pasta do anime (como "One Piece" no exemplo), o Arigato cria uma "Temporada 01" automaticamente.
- Os episódios são ordenados numericamente (Episódio 2 vem antes de Episódio 10, mesmo em ordem alfabética de texto).

## Estrutura do projeto

```
/index.html              → shell da aplicação (SPA)
/css
  style.css              → design system completo (cores, componentes, telas)
/js
  database.js            → camada de persistência (IndexedDB)
  filesystem.js          → File System Access API, varredura e ordenação
  anime-api.js           → busca de capas/sinopses (Jikan API) + cache
  library.js             → construção das telas (início, biblioteca, detalhe...)
  player.js              → player de vídeo integrado
  app.js                 → roteamento e orquestração geral
/assets
  /icons                 → ícones do PWA
  /images                → capa padrão
manifest.json             → manifesto do PWA
service-worker.js         → cache do "app shell" para instalação como PWA
README.md
```

Nenhum arquivo concentra todo o código — cada módulo JS tem uma
responsabilidade única, facilitando manutenção e futuras expansões (como um
app auxiliar para abrir vídeos externamente, mencionado no roadmap).

## Como subir para o GitHub

1. Crie um repositório novo no GitHub (pode ser público ou privado — GitHub Pages funciona em ambos, mas privado exige plano pago para Pages).
2. Na pasta do projeto, no terminal:

```bash
git init
git add .
git commit -m "Primeira versão do Arigato"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

## Como ativar o GitHub Pages

1. No GitHub, entre no repositório criado.
2. Vá em **Settings → Pages** (barra lateral esquerda).
3. Em **Build and deployment**, selecione **Source: Deploy from a branch**.
4. Em **Branch**, escolha `main` e a pasta `/ (root)`, depois clique em **Save**.
5. Aguarde alguns minutos. O GitHub mostrará o link do site, algo como:
   `https://SEU_USUARIO.github.io/SEU_REPOSITORIO/`
6. Abra esse link em **Google Chrome ou Microsoft Edge**.

> Sempre que você fizer `git push` de novas alterações para a branch `main`, o GitHub Pages atualiza o site automaticamente em alguns minutos.

## Como conectar sua pasta de animes

1. Abra o site publicado no Chrome ou Edge.
2. Clique em **"Selecionar pasta dos meus Animes"**.
3. O navegador vai abrir o seletor de pastas do sistema operacional — escolha a pasta raiz (ex: `D:\Animes`).
4. O navegador vai pedir uma confirmação de permissão de leitura — aceite.
5. O Arigato vai ler todas as subpastas, identificar os animes, temporadas e episódios, e montar sua biblioteca automaticamente, buscando capas e sinopses.
6. Nas próximas visitas, o site tenta reconectar automaticamente à mesma pasta. Se o navegador exigir uma nova confirmação (comportamento normal de segurança), aparecerá um botão **"Reconectar pasta anterior"** na tela inicial.

Para atualizar a biblioteca depois de adicionar novos animes/episódios à
pasta, use o botão **"Atualizar Biblioteca"** no topo do site, ou aguarde a
revarredura automática periódica (a cada 5 minutos, enquanto a aba estiver
aberta e a permissão continuar concedida).

## Limitações de segurança do navegador

Por ser um site estático hospedado no GitHub Pages (sem servidor próprio),
existem limitações impostas pelos navegadores que fazem parte do
funcionamento esperado do projeto, não bugs:

- **A permissão de acesso à pasta não é permanente.** Por segurança, o navegador pode pedir para você confirmar o acesso novamente em novas sessões. Isso é comportamento padrão da File System Access API, não uma falha do Arigato.
- **Não é possível monitorar a pasta em tempo real de forma contínua.** O navegador não avisa o site quando um arquivo é adicionado — por isso o Arigato usa varredura sob demanda (botão "Atualizar Biblioteca") e varredura automática periódica enquanto a aba está aberta.
- **Arquivos MKV, HEVC/H.265 e alguns outros codecs podem não reproduzir diretamente no `<video>` do navegador.** Isso depende do suporte de codec de cada navegador/sistema operacional, não do Arigato. Quando um episódio tem extensão que pode não funcionar nativamente, o player exibe um aviso.
- **O site não abre vídeos no aplicativo padrão do Windows (VLC, Windows Media Player etc).** Sites não têm essa permissão por padrão. O player integrado ao próprio Arigato é a forma principal de reprodução. O código já está organizado (veja `js/player.js`) para, futuramente, permitir a criação de uma extensão de navegador ou um pequeno aplicativo auxiliar local que abra o arquivo externamente, caso você queira evoluir o projeto nessa direção.
- **Limpar os dados do navegador (cache/cookies/dados de site) apaga a biblioteca salva localmente** — biblioteca, progresso, favoritos e cache de capas/sinopses ficam no IndexedDB do navegador. Isso não afeta seus arquivos de vídeo, apenas o que o Arigato lembra sobre eles.

## Compatibilidade

| Navegador | Selecionar pasta local | Observação |
|---|---|---|
| Google Chrome (Windows/Mac/Linux) | ✅ | Recomendado |
| Microsoft Edge (Windows/Mac/Linux) | ✅ | Recomendado |
| Firefox | ❌ | Não implementa a File System Access API |
| Safari | ❌ | Não implementa a File System Access API |

Se o site detectar um navegador incompatível, ele mostra um aviso explicando
a limitação em vez de travar silenciosamente.

## Roadmap

O MVP entregue já inclui:

- [x] Seleção da pasta local e restauração de permissão
- [x] Leitura recursiva de animes/temporadas/episódios com ordenação natural
- [x] Biblioteca visual (início, todos os animes, busca instantânea)
- [x] Busca automática de capas/sinopses (Jikan API) com cache local e fallback manual
- [x] Player integrado com continuar de onde parou, próximo/anterior episódio
- [x] Atualização da biblioteca por revarredura manual e automática
- [x] Favoritos e histórico de "Continuar Assistindo"
- [x] PWA instalável (manifest + service worker)

Próximas ideias de evolução:

- Edição manual de capa/sinopse/nome diretamente pela interface (a função `saveManualOverride` em `js/anime-api.js` já existe como base).
- Extensão de navegador ou app auxiliar local para reprodução externa (VLC etc).
- Suporte a legendas externas (.srt/.vtt) via `<track>`.
- Virtualização da grade para bibliotecas com milhares de episódios.
