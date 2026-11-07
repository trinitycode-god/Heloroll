# Nerd Lab Colecionáveis — Loja 3D estática (v2)

Site 100% estático (HTML + CSS + JS puro) pronto para GitHub Pages. Estrutura reconstruída para seguir a nova identidade visual (preto / amarelo / branco, Poppins) e o layout de referência enviado: topbar, header com busca, navegação por categorias, carrossel no banner, grade de categorias, banners promocionais, catálogo, seção de encomendas personalizadas, selos de confiança e carrinho de compras.

```
/
├── index.html
├── style.css
├── script.js
├── README.md
└── assets/
    ├── logo.png
    ├── hero-slide-1.jpg
    └── hero-slide-2.jpg
```

---

## ⚠️ Antes de publicar — leia isto

Os dois banners do carrossel (`hero-slide-1.jpg` e `hero-slide-2.jpg`) que você me mandou usam personagens de franquias como Dragon Ball, Naruto, One Piece, Harry Potter e Hollow Knight. Eu apenas encaixei as imagens que você já tinha no carrossel — não criei nem alterei esse conteúdo. Mas antes de publicar de verdade, vale se atentar a dois pontos:

1. **Direitos de imagem**: se essas artes foram geradas por IA ou não são oficialmente licenciadas, divulgá-las como parte da loja pode gerar problema com os detentores da marca (Toei, Shueisha, Warner, Team Cherry etc.), especialmente combinado com o selo "Produtos oficiais e licenciados" que está na própria imagem e na faixa de confiança do site.
2. Se seus produtos são peças autorais "inspiradas" nesses universos (não licenciadas oficialmente), pode ser mais seguro trocar esse texto para algo como **"Inspirado nos seus favoritos"** em vez de "produtos oficiais e licenciados", e usar fotos reais dos seus próprios produtos impressos no carrossel em vez da arte com os personagens.

Isso não te impede de publicar — é só um alerta para você decidir com consciência. Se quiser, eu ajusto os textos ou troco os banners por fotos reais dos seus produtos assim que você tiver.

---

## 1. Configurar a planilha do Google Sheets

Mesma lógica da primeira versão:

1. Abra sua planilha e clique em **Compartilhar** → "Qualquer pessoa com o link" → **Leitor**.
2. A primeira aba precisa ter as colunas (nesses nomes, qualquer ordem):
   ```
   ID | NOME_PRODUTO | CATEGORIA | DESCRICAO | PRECO | IMAGEM | DESTAQUE | ESTOQUE | STATUS
   ```
3. **Categoria** — use um destes valores na coluna CATEGORIA para o produto cair no filtro certo:
   ```
   Animes · Games · Colecionáveis · Chaveiros · Acessórios · Promoções
   ```
   Não existe categoria "Lançamentos" separada — todo produto com **DESTAQUE = SIM** aparece automaticamente em "Lançamentos" e sobe para o topo do catálogo.
4. Se usar outra aba além da primeira, troque `SHEET_GID` no topo do `script.js` (o número fica na URL depois de `#gid=`).

O site relê a planilha a cada carregamento de página — qualquer alteração sua aparece automaticamente pro visitante, sem precisar reenviar nada.

---

## 2. Imagens dos produtos (Google Drive)

Mesmo processo de antes:

1. Suba a imagem na pasta do Drive e compartilhe como "Qualquer pessoa com o link" → Leitor.
2. Copie o link de compartilhamento e cole exatamente assim na coluna **IMAGEM** da planilha.
3. O `script.js` converte esse link automaticamente pra uma URL de imagem exibível, com plano B se a imagem falhar.

---

## 3. Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos deste pacote (`index.html`, `style.css`, `script.js`, pasta `assets/` inteira) pra raiz do repositório.
3. **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `(root)` → **Save**.
4. Aguarde alguns minutos e acesse `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.

Sem build, sem dependência, sem configuração extra.

---

## 4. O que tem de novo nessa versão

- **Header completo**: barra de topo com benefícios + redes sociais, busca com seletor de categoria, ícone de conta e carrinho.
- **Navegação por categorias**: barra fixa abaixo do header (`Lançamentos · Animes · Games · Colecionáveis · Chaveiros · Acessórios · Promoções`) que filtra o catálogo direto.
- **Carrossel no banner** com autoplay, setas e bolinhas — troque as imagens em `assets/hero-slide-1.jpg` / `hero-slide-2.jpg` a qualquer momento (mesmo nome de arquivo, sem mexer no código).
- **Grade de categorias** e **banners promocionais** com ícones originais (sem usar personagens licenciados), clicáveis — levam direto pro catálogo já filtrado.
- **Carrinho de compras** (sem backend — guardado no `localStorage` do navegador): cada card tem um botão "+" pra adicionar ao carrinho, além do botão "Comprar" direto. O carrinho junta tudo numa mensagem só e manda pro WhatsApp de uma vez no botão "Finalizar no WhatsApp".
- **Botão "Entrar"** abre um aviso explicando que a loja não exige cadastro — é só um atalho pro WhatsApp (não é um login de verdade, já que o site não tem backend/banco de dados).
- **Seção "Encomendas personalizadas"** com ilustração própria (sem usar os personagens do banner) e CTA direto pro WhatsApp.
- Selos de confiança, footer com categorias e mesma lógica de botão flutuante do WhatsApp de antes.

---

## 5. Trocar o número de WhatsApp

No topo do `script.js`:
```js
const CONFIG = {
  ...
  WHATSAPP_NUMBER: '55DDXXXXXXXXX', // código do país + DDD + número, só dígitos
};
```
Isso atualiza automaticamente todos os botões do site (produtos, carrinho, encomendas, flutuante, footer).

---

## 6. Testar localmente antes de publicar

```bash
python3 -m http.server 8000
```
Depois abra `http://localhost:8000`. Pelo protocolo `file://` (clicando 2x no index.html) o `fetch()` da planilha pode ser bloqueado pelo navegador — no GitHub Pages isso não acontece, porque o site já roda em `https://`.
