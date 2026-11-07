# H H Parfum — Loja Virtual

Site 100% estático (HTML + CSS + JS puro), pronto para GitHub Pages. Catálogo de perfumes carregado de uma planilha do Google Sheets; carrinho e favoritos guardados no navegador; pedido finalizado pelo WhatsApp.

```
/
├── index.html
├── style.css
├── script.js
└── assets/
    ├── logo.png              (emblema H H Parfum, dourado)
    └── hero-hh-perfume.jpg   (arte do banner)
```

## 1. Planilha (Google Sheets)

1. **Compartilhar** → "Qualquer pessoa com o link" → **Leitor**.
2. A primeira aba precisa ter estas colunas (qualquer ordem):
   ```
   ID | NOME_PRODUTO | CATEGORIA | DESCRICAO | PRECO | IMAGEM | DESTAQUE | ESTOQUE | STATUS
   ```
3. Colunas opcionais, mostradas na página do produto quando preenchidas:
   ```
   MARCA | VOLUME | CONCENTRACAO | NOTAS
   ```
4. **CATEGORIA** deve conter uma destas palavras para o produto cair no filtro certo:
   ```
   Importados · Masculinos · Femininos · Unissex · Kits e Presentes · Promoções
   ```
   Todo produto com **DESTAQUE = SIM** aparece em "Lançamentos" / "Mais Vendidos" e sobe para o topo.
5. Se usar outra aba, troque `SHEET_GID` no topo do `script.js`.

## 2. Imagens dos produtos (Google Drive)

Suba a imagem, compartilhe como "Qualquer pessoa com o link" e cole o link na coluna **IMAGEM**. O `script.js` converte para uma URL exibível.

## 3. WhatsApp

No topo do `script.js`:
```js
const CONFIG = { ..., WHATSAPP_NUMBER: '55DDXXXXXXXXX' };
```
Atualiza todos os botões do site.

## 4. Publicar no GitHub Pages

Envie `index.html`, `style.css`, `script.js` e a pasta `assets/` para a raiz do repositório → **Settings → Pages** → Deploy from a branch → `main` / `(root)`.

## 5. Testar localmente

```bash
python3 -m http.server 8000
```
Abra `http://localhost:8000` (por `file://` o navegador pode bloquear a leitura da planilha).
