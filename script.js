/* =========================================================
   H H Parfum — script.js
   Loja 100% estática. Catálogo carregado de uma planilha
   pública do Google Sheets (convertida para CSV) e imagens
   servidas a partir de uma pasta pública do Google Drive.
   Carrinho guardado em localStorage (sem backend/banco).
   ========================================================= */

/* ---------------------------------------------------------
   1) CONFIGURAÇÃO
   --------------------------------------------------------- */
const CONFIG = {
  SHEET_ID: '1Cx63e7xOVnNJjTV_JCnW8Xqe18MfdpvxI3AuRwU7DAI',
  SHEET_GID: '0',
  WHATSAPP_NUMBER: '5521978721561',
};

const CSV_URL =
  `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/export?format=csv&gid=${CONFIG.SHEET_GID}`;

const CART_STORAGE_KEY = 'hhparfum_cart_v1';

/* ---------------------------------------------------------
   2) UTILITÁRIOS
   --------------------------------------------------------- */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { field += char; }
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\r') { /* ignore */ }
      else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += char;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function csvToProducts(rows) {
  const header = rows[0].map(h => h.trim().toUpperCase());
  return rows.slice(1).map(cols => {
    const obj = {};
    header.forEach((key, i) => { obj[key] = (cols[i] || '').trim(); });
    return obj;
  });
}

function driveImageUrl(rawUrl) {
  if (!rawUrl) return '';
  const url = rawUrl.trim();
  let match = url.match(/\/d\/([a-zA-Z0-9_-]{15,})/);
  if (!match) match = url.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}=w800`;
  return url;
}

function driveImageFallback(rawUrl) {
  const match = (rawUrl && rawUrl.match(/\/d\/([a-zA-Z0-9_-]{15,})/)) || (rawUrl && rawUrl.match(/[?&]id=([a-zA-Z0-9_-]{15,})/));
  if (match) return `https://drive.google.com/uc?export=view&id=${match[1]}`;
  return PLACEHOLDER_IMG;
}

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
    <rect width="600" height="600" fill="#232323"/>
    <text x="50%" y="50%" fill="#6b6b6b" font-family="sans-serif" font-size="20"
      text-anchor="middle" dominant-baseline="middle">imagem indisponível</text>
  </svg>`);

function formatBRL(value) {
  const n = parseFloat(String(value).replace(/[^\d,.-]/g, '').replace(',', '.'));
  if (isNaN(n)) return value || '';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parsePrice(value) {
  const n = parseFloat(String(value).replace(/[^\d,.-]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function buildWhatsappLink(number, message) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function normalize(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/* ---------------------------------------------------------
   2b) FAVORITOS (localStorage — sem backend)
   --------------------------------------------------------- */
const FAV_STORAGE_KEY = 'hhparfum_favs_v1';

function loadFavs() {
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveFavs() {
  try { localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(FAVORITES)); } catch { /* ignore */ }
}
function isFav(key) { return FAVORITES.includes(key); }
function toggleFav(key) {
  const i = FAVORITES.indexOf(key);
  if (i >= 0) FAVORITES.splice(i, 1);
  else FAVORITES.push(key);
  saveFavs();
  updateFavCount();
  return isFav(key);
}
function updateFavCount() {
  const badge = document.getElementById('favCount');
  if (!badge) return;
  badge.textContent = FAVORITES.length;
  badge.hidden = FAVORITES.length === 0;
}

/* ---------------------------------------------------------
   2c) BUSCA TOLERANTE A ERROS DE DIGITAÇÃO (fuzzy match leve)
   --------------------------------------------------------- */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// tolerância cresce com o tamanho da palavra: termos curtos exigem digitação quase exata
function fuzzyIncludes(haystackNorm, queryToken) {
  if (!queryToken) return true;
  if (haystackNorm.includes(queryToken)) return true;
  const maxDist = queryToken.length <= 4 ? 1 : queryToken.length <= 8 ? 2 : 3;
  const words = haystackNorm.split(/[^a-z0-9]+/).filter(Boolean);
  return words.some(w => levenshtein(w, queryToken) <= maxDist);
}

function matchesQuery(p, searchNorm) {
  if (!searchNorm) return true;
  const haystack = normalize(`${p.NOME_PRODUTO} ${p.DESCRICAO} ${p.CATEGORIA}`);
  const tokens = searchNorm.split(/\s+/).filter(Boolean);
  return tokens.every(tok => fuzzyIncludes(haystack, tok));
}

/* ---------------------------------------------------------
   3) ESTADO
   --------------------------------------------------------- */
let ALL_PRODUCTS = [];
let currentFilter = 'todos';
let currentSearch = '';
let CART = loadCart();
let FAVORITES = loadFavs();

/* ---------------------------------------------------------
   4) RENDERIZAÇÃO DOS CARDS
   --------------------------------------------------------- */
const grid = document.getElementById('productGrid');
const template = document.getElementById('cardTemplate');
const statusEl = document.getElementById('catalogStatus');
const emptyEl = document.getElementById('emptyState');

function statusIsActive(status) {
  const s = normalize(status);
  if (!s) return true;
  return !['inativo', 'pausado', 'oculto', 'desativado'].includes(s);
}

function productKey(p) {
  return (p.ID && p.ID.trim()) || normalize(p.NOME_PRODUTO);
}

function renderProducts(list) {
  grid.innerHTML = '';

  if (!list.length) {
    emptyEl.textContent = currentFilter === 'favoritos'
      ? 'Você ainda não favoritou nenhum perfume. Clique no ♡ dos produtos pra salvar aqui.'
      : 'Nenhum perfume encontrado com esse filtro. Tenta outro termo ou categoria.';
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  const frag = document.createDocumentFragment();

  list.forEach(p => {
    const node = template.content.cloneNode(true);
    const key = productKey(p);
    node.querySelector('.card').dataset.key = key;

    const img = node.querySelector('.card-img');
    const skeleton = node.querySelector('.skeleton');
    const primarySrc = driveImageUrl(p.IMAGEM);
    const fallbackSrc = driveImageFallback(p.IMAGEM);

    img.alt = p.NOME_PRODUTO || 'Produto H H Parfum';
    img.src = primarySrc || PLACEHOLDER_IMG;
    img.addEventListener('load', () => { img.classList.add('loaded'); skeleton.style.display = 'none'; });
    img.addEventListener('error', () => {
      if (img.dataset.step === 'fallback') { img.src = PLACEHOLDER_IMG; img.dataset.step = 'placeholder'; }
      else if (img.dataset.step !== 'placeholder') { img.dataset.step = 'fallback'; img.src = fallbackSrc; }
    });

    node.querySelector('.card-cat').textContent = p.CATEGORIA || '';
    node.querySelector('.card-name-btn').textContent = p.NOME_PRODUTO || 'Produto';
    node.querySelector('.card-desc').textContent = p.DESCRICAO || '';
    node.querySelector('.card-price').textContent = formatBRL(p.PRECO);

    const featuredBadge = node.querySelector('.card-badge-featured');
    if (normalize(p.DESTAQUE) !== 'sim') featuredBadge.hidden = true;

    const stockBadge = node.querySelector('.card-badge-stock');
    const estoque = parseInt(String(p.ESTOQUE).replace(/\D/g, ''), 10);
    if (!isNaN(estoque)) {
      if (estoque <= 0) stockBadge.textContent = 'Sob consulta';
      else if (estoque <= 3) stockBadge.textContent = `Últimas ${estoque} un.`;
      else stockBadge.hidden = true;
    } else {
      stockBadge.hidden = true;
    }

    const buyBtn = node.querySelector('.card-buy');
    const msg = `Olá, tenho interesse no produto ${p.NOME_PRODUTO} da H H Parfum.`;
    buyBtn.href = buildWhatsappLink(CONFIG.WHATSAPP_NUMBER, msg);

    const addBtn = node.querySelector('.card-add');
    addBtn.addEventListener('click', () => {
      addToCart(p, primarySrc, 1);
      addBtn.classList.add('added');
      showToast(`${p.NOME_PRODUTO || 'Produto'} adicionado ao carrinho`);
      setTimeout(() => addBtn.classList.remove('added'), 900);
    });

    const favBtn = node.querySelector('.card-fav');
    favBtn.classList.toggle('active', isFav(key));
    favBtn.setAttribute('aria-pressed', String(isFav(key)));
    favBtn.addEventListener('click', () => {
      const active = toggleFav(key);
      favBtn.classList.toggle('active', active);
      favBtn.setAttribute('aria-pressed', String(active));
      if (currentFilter === 'favoritos' && !active) applyFilters();
    });

    node.querySelectorAll('.card-open').forEach(el => {
      el.addEventListener('click', () => openProductView(p));
    });

    frag.appendChild(node);
  });

  grid.appendChild(frag);
  observeReveal();
}

function applyFilters() {
  const filtered = ALL_PRODUCTS.filter(p => {
    if (!statusIsActive(p.STATUS)) return false;

    let matchesFilter;
    if (currentFilter === 'todos') matchesFilter = true;
    else if (currentFilter === 'favoritos') matchesFilter = isFav(productKey(p));
    else if (currentFilter === 'lançamentos' || currentFilter === 'lancamentos') {
      matchesFilter = normalize(p.DESTAQUE) === 'sim' || normalize(p.CATEGORIA).includes('lancamento');
    } else {
      matchesFilter = normalize(p.CATEGORIA).includes(normalize(currentFilter));
    }

    return matchesFilter && matchesQuery(p, currentSearch);
  });

  filtered.sort((a, b) => (normalize(b.DESTAQUE) === 'sim') - (normalize(a.DESTAQUE) === 'sim'));

  renderProducts(filtered);
}

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === filter));
  const select = document.getElementById('categorySelect');
  if (select && filter !== 'favoritos') select.value = filter;
  applyFilters();
}

/* ---------------------------------------------------------
   5) BUSCA, FILTROS E ATALHOS DE CATEGORIA
   --------------------------------------------------------- */
function setupSearchAndFilters() {
  const searchInput = document.getElementById('searchInput');
  const categorySelect = document.getElementById('categorySelect');
  const searchBtn = document.getElementById('searchBtn');

  function runSearch() {
    currentSearch = normalize(searchInput.value.trim());
    setFilter(categorySelect.value);
    document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
  }

  searchBtn.addEventListener('click', runSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });

  document.getElementById('searchInputMirror'); // no-op guard

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => setFilter(chip.dataset.filter));
  });

  // qualquer elemento com data-filter (categorias, promo band, footer, nav) filtra o catálogo
  document.querySelectorAll('[data-filter]:not(.chip)').forEach(el => {
    el.addEventListener('click', (e) => {
      const filter = el.dataset.filter;
      if (!filter) return;
      e.preventDefault();
      setFilter(filter);
      document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
      document.getElementById('mainNav').classList.remove('open');
    });
  });

  document.querySelectorAll('#mainNav a').forEach(link => {
    link.addEventListener('click', () => {
      document.getElementById('mainNav').classList.remove('open');
    });
  });

  // busca ao vivo também
  searchInput.addEventListener('input', () => {
    currentSearch = normalize(searchInput.value.trim());
    applyFilters();
  });
}

/* ---------------------------------------------------------
   6) CARREGAMENTO DA PLANILHA
   --------------------------------------------------------- */
async function loadProducts() {
  try {
    const sep = CSV_URL.includes('?') ? '&' : '?';
    const bust = `${sep}_=${Date.now()}`;
    const res = await fetch(CSV_URL + bust);
    if (!res.ok) throw new Error('Falha ao buscar a planilha (' + res.status + ')');

    const text = await res.text();
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('Planilha vazia');

    ALL_PRODUCTS = csvToProducts(rows);
    statusEl.hidden = true;
    applyFilters();
    openProductFromHash();
  } catch (err) {
    console.error(err);
    statusEl.classList.add('error');
    statusEl.innerHTML =
      'Não foi possível carregar o catálogo agora. Verifique se a planilha está compartilhada como "Qualquer pessoa com o link".';
  }
}

/* ---------------------------------------------------------
   7) CARRINHO (localStorage — sem backend)
   --------------------------------------------------------- */
function loadCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCart() {
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(CART)); } catch { /* ignore */ }
}

function addToCart(p, imgSrc, qty) {
  qty = qty || 1;
  const key = productKey(p);
  if (CART[key]) {
    CART[key].qty += qty;
  } else {
    CART[key] = {
      name: p.NOME_PRODUTO || 'Produto',
      price: parsePrice(p.PRECO),
      img: imgSrc || PLACEHOLDER_IMG,
      qty: qty,
    };
  }
  saveCart();
  renderCart();
  openCart();
}

function changeQty(key, delta) {
  if (!CART[key]) return;
  CART[key].qty += delta;
  if (CART[key].qty <= 0) delete CART[key];
  saveCart();
  renderCart();
}

function removeFromCart(key) {
  delete CART[key];
  saveCart();
  renderCart();
}

function cartCount() {
  return Object.values(CART).reduce((sum, item) => sum + item.qty, 0);
}

function cartSubtotal() {
  return Object.values(CART).reduce((sum, item) => sum + item.qty * item.price, 0);
}

function renderCart() {
  const itemsEl = document.getElementById('cartItems');
  const emptyMsg = document.getElementById('cartEmptyMsg');
  const footer = document.getElementById('cartFooter');
  const countBadge = document.getElementById('cartCount');

  const keys = Object.keys(CART);
  const count = cartCount();

  countBadge.textContent = count;
  countBadge.hidden = count === 0;

  itemsEl.innerHTML = '';

  if (!keys.length) {
    emptyMsg.hidden = false;
    footer.hidden = true;
    return;
  }
  emptyMsg.hidden = true;
  footer.hidden = false;

  keys.forEach(key => {
    const item = CART[key];
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <img src="${item.img}" alt="${item.name}">
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <span class="cart-item-price">${formatBRL(item.price)}</span>
        <div class="cart-item-qty">
          <button type="button" data-action="dec">−</button>
          <span>${item.qty}</span>
          <button type="button" data-action="inc">+</button>
        </div>
        <button type="button" class="cart-item-remove">remover</button>
      </div>
    `;
    row.querySelector('[data-action="inc"]').addEventListener('click', () => changeQty(key, 1));
    row.querySelector('[data-action="dec"]').addEventListener('click', () => changeQty(key, -1));
    row.querySelector('.cart-item-remove').addEventListener('click', () => removeFromCart(key));
    itemsEl.appendChild(row);
  });

  document.getElementById('cartSubtotal').textContent = formatBRL(cartSubtotal());

  const lines = keys.map(key => {
    const item = CART[key];
    return `• ${item.qty}x ${item.name} — ${formatBRL(item.price)}`;
  });

  const nameField = document.getElementById('cartName');
  const addressField = document.getElementById('cartAddress');
  const nome = nameField ? nameField.value.trim() : '';
  const bairro = addressField ? addressField.value.trim() : '';
  const clienteLines = [
    nome ? `Nome: ${nome}` : null,
    bairro ? `Bairro/cidade: ${bairro}` : null,
  ].filter(Boolean);

  const msg =
    `Olá! Quero fechar esse pedido na H H Parfum:\n\n${lines.join('\n')}\n\nSubtotal: ${formatBRL(cartSubtotal())}` +
    (clienteLines.length ? `\n\n${clienteLines.join('\n')}` : '');
  document.getElementById('cartCheckout').href = buildWhatsappLink(CONFIG.WHATSAPP_NUMBER, msg);
}

function openCart() {
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('cartOverlay').classList.add('open');
}
function closeCart() {
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
}

function setupCart() {
  renderCart();
  document.getElementById('cartBtn').addEventListener('click', openCart);
  document.getElementById('cartClose').addEventListener('click', closeCart);
  document.getElementById('cartOverlay').addEventListener('click', closeCart);
  ['cartName', 'cartAddress'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderCart);
  });
}

/* ---------------------------------------------------------
   8) MODAL "ENTRAR"
   --------------------------------------------------------- */
function setupAccountModal() {
  const modal = document.getElementById('accountModal');
  const overlay = document.getElementById('accountOverlay');

  function open() { modal.classList.add('open'); overlay.classList.add('open'); }
  function close() { modal.classList.remove('open'); overlay.classList.remove('open'); }

  document.getElementById('accountBtn').addEventListener('click', open);
  document.getElementById('accountClose').addEventListener('click', close);
  overlay.addEventListener('click', close);
}

/* ---------------------------------------------------------
   8b) TOASTS
   --------------------------------------------------------- */
function showToast(message) {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

/* ---------------------------------------------------------
   8c) MICROINTERAÇÕES — reveal on scroll
   --------------------------------------------------------- */
let revealObserver;
function observeReveal() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in-view'));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
  }
  document.querySelectorAll('.reveal:not(.in-view)').forEach(el => revealObserver.observe(el));
}

/* ---------------------------------------------------------
   8d) PÁGINA DO PRODUTO (overlay com URL própria via hash)
   --------------------------------------------------------- */
let currentProduct = null;
let currentProductQty = 1;

function getGalleryImages(p) {
  const urls = [p.IMAGEM, p.IMAGEM2, p.IMAGEM3, p.IMAGEM4].filter(Boolean);
  if (!urls.length) return [PLACEHOLDER_IMG];
  return urls.map(u => driveImageUrl(u) || PLACEHOLDER_IMG);
}

// Colunas extras (MARCA, VOLUME, CONCENTRACAO, NOTAS) são opcionais na planilha —
// se a coluna não existir ou estiver vazia, a linha correspondente simplesmente não aparece.
function renderProductSpecs(p) {
  const dl = document.getElementById('productSpecs');
  dl.innerHTML = '';
  const rows = [
    ['Marca', p.MARCA],
    ['Volume', p.VOLUME],
    ['Concentração', p.CONCENTRACAO],
    ['Notas olfativas', p.NOTAS],
  ];
  rows.forEach(([label, value]) => {
    if (!value) return;
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    dl.appendChild(dt); dl.appendChild(dd);
  });
}

function renderBreadcrumb(p) {
  const nav = document.getElementById('productBreadcrumb');
  const catFilter = p.CATEGORIA ? normalize(p.CATEGORIA) : 'todos';
  nav.innerHTML = `
    <a href="#top">Início</a><span>/</span>
    <a href="#catalogo" id="breadcrumbCat">${p.CATEGORIA || 'Catálogo'}</a><span>/</span>
    <span aria-current="page">${p.NOME_PRODUTO || ''}</span>
  `;
  nav.querySelector('#breadcrumbCat').addEventListener('click', (e) => {
    e.preventDefault();
    closeProductView();
    setFilter(catFilter);
    document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
  });
}

function injectProductSchema(p) {
  let script = document.getElementById('productSchemaTag');
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'productSchemaTag';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.NOME_PRODUTO || '',
    description: p.DESCRICAO || '',
    image: driveImageUrl(p.IMAGEM) || PLACEHOLDER_IMG,
    category: p.CATEGORIA || '',
    offers: {
      '@type': 'Offer',
      priceCurrency: 'BRL',
      price: parsePrice(p.PRECO).toFixed(2),
      availability: 'https://schema.org/PreOrder',
    },
  });
}

function renderRelated(p) {
  const wrap = document.getElementById('productRelated');
  const relGrid = document.getElementById('productRelatedGrid');
  const key = productKey(p);
  const related = ALL_PRODUCTS.filter(x =>
    statusIsActive(x.STATUS) &&
    productKey(x) !== key &&
    normalize(x.CATEGORIA) === normalize(p.CATEGORIA)
  ).slice(0, 4);

  relGrid.innerHTML = '';
  if (!related.length) { wrap.hidden = true; return; }
  wrap.hidden = false;

  related.forEach(rp => {
    const src = driveImageUrl(rp.IMAGEM) || PLACEHOLDER_IMG;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'related-card';
    card.innerHTML = `
      <img src="${src}" alt="${rp.NOME_PRODUTO || ''}" loading="lazy">
      <span class="related-name">${rp.NOME_PRODUTO || ''}</span>
      <span class="related-price">${formatBRL(rp.PRECO)}</span>
    `;
    card.addEventListener('click', () => openProductView(rp));
    relGrid.appendChild(card);
  });
}

function syncCardFavState(key, active) {
  document.querySelectorAll('.card').forEach(card => {
    if (card.dataset.key === key) {
      const fb = card.querySelector('.card-fav');
      if (fb) { fb.classList.toggle('active', active); fb.setAttribute('aria-pressed', String(active)); }
    }
  });
}

function openProductView(p) {
  currentProduct = p;
  currentProductQty = 1;

  const key = productKey(p);
  const images = getGalleryImages(p);

  const mainImg = document.getElementById('productMainImg');
  mainImg.src = images[0];
  mainImg.alt = p.NOME_PRODUTO || '';

  const thumbs = document.getElementById('productThumbs');
  thumbs.innerHTML = '';
  if (images.length > 1) {
    images.forEach((src, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'product-thumb' + (i === 0 ? ' active' : '');
      b.innerHTML = `<img src="${src}" alt="">`;
      b.addEventListener('click', () => {
        mainImg.src = src;
        thumbs.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
        b.classList.add('active');
      });
      thumbs.appendChild(b);
    });
  }

  document.getElementById('productCat').textContent = p.CATEGORIA || '';
  document.getElementById('productName').textContent = p.NOME_PRODUTO || 'Produto';
  document.getElementById('productPrice').textContent = formatBRL(p.PRECO);
  document.getElementById('productDesc').textContent = p.DESCRICAO || '';
  document.getElementById('productQty').textContent = '1';

  const favBtn = document.getElementById('productFavBtn');
  favBtn.classList.toggle('active', isFav(key));
  favBtn.setAttribute('aria-pressed', String(isFav(key)));

  const waMsg = `Olá, tenho interesse no produto ${p.NOME_PRODUTO} da H H Parfum.`;
  document.getElementById('productWhatsapp').href = buildWhatsappLink(CONFIG.WHATSAPP_NUMBER, waMsg);

  renderProductSpecs(p);
  renderBreadcrumb(p);
  renderRelated(p);
  injectProductSchema(p);

  document.getElementById('productView').classList.add('open');
  document.getElementById('productView').setAttribute('aria-hidden', 'false');
  document.getElementById('productOverlay').classList.add('open');
  document.body.classList.add('no-scroll');
  observeReveal();

  if (!location.hash.startsWith('#produto/')) {
    history.pushState({ product: key }, '', `#produto/${encodeURIComponent(key)}`);
  }
}

function closeProductView() {
  const view = document.getElementById('productView');
  if (!view.classList.contains('open')) return;
  view.classList.remove('open');
  view.setAttribute('aria-hidden', 'true');
  document.getElementById('productOverlay').classList.remove('open');
  document.body.classList.remove('no-scroll');
  if (location.hash.startsWith('#produto/')) history.back();
}

function setupProductView() {
  document.getElementById('productViewClose').addEventListener('click', closeProductView);
  document.getElementById('productOverlay').addEventListener('click', closeProductView);

  document.getElementById('productQtyDec').addEventListener('click', () => {
    currentProductQty = Math.max(1, currentProductQty - 1);
    document.getElementById('productQty').textContent = currentProductQty;
  });
  document.getElementById('productQtyInc').addEventListener('click', () => {
    currentProductQty += 1;
    document.getElementById('productQty').textContent = currentProductQty;
  });
  document.getElementById('productAddCart').addEventListener('click', () => {
    if (!currentProduct) return;
    const img = document.getElementById('productMainImg').src;
    addToCart(currentProduct, img, currentProductQty);
    showToast(`${currentProduct.NOME_PRODUTO || 'Produto'} adicionado ao carrinho`);
  });
  document.getElementById('productFavBtn').addEventListener('click', () => {
    if (!currentProduct) return;
    const key = productKey(currentProduct);
    const active = toggleFav(key);
    const btn = document.getElementById('productFavBtn');
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
    syncCardFavState(key, active);
    if (currentFilter === 'favoritos' && !active) applyFilters();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeProductView();
    closeCart();
  });

  window.addEventListener('popstate', () => {
    if (!location.hash.startsWith('#produto/')) closeProductView();
  });
}

function openProductFromHash() {
  const match = location.hash.match(/^#produto\/(.+)$/);
  if (!match) return;
  const key = decodeURIComponent(match[1]);
  const found = ALL_PRODUCTS.find(pr => productKey(pr) === key);
  if (found) openProductView(found);
}

/* ---------------------------------------------------------
   9) CARROSSEL DO HERO
   --------------------------------------------------------- */
function setupHeroCarousel() {
  const track = document.getElementById('heroTrack');
  const slides = track.children.length;
  const dotsWrap = document.getElementById('heroDots');
  let index = 0;
  let timer;

  for (let i = 0; i < slides; i++) {
    const dot = document.createElement('button');
    if (i === 0) dot.classList.add('active');
    dot.addEventListener('click', () => goTo(i));
    dotsWrap.appendChild(dot);
  }

  function goTo(i) {
    index = (i + slides) % slides;
    track.style.transform = `translateX(-${index * 100}%)`;
    [...dotsWrap.children].forEach((d, di) => d.classList.toggle('active', di === index));
    restart();
  }

  function restart() {
    clearInterval(timer);
    timer = setInterval(() => goTo(index + 1), 5500);
  }

  document.getElementById('heroPrev').addEventListener('click', () => goTo(index - 1));
  document.getElementById('heroNext').addEventListener('click', () => goTo(index + 1));

  const carousel = document.getElementById('heroCarousel');
  carousel.addEventListener('mouseenter', () => clearInterval(timer));
  carousel.addEventListener('mouseleave', restart);

  if (slides > 1) restart();
}

/* ---------------------------------------------------------
   10) LINKS DE WHATSAPP GERAIS + UI DIVERSA
   --------------------------------------------------------- */
function setupWhatsappLinks() {
  const generalMsg = 'Olá, tenho interesse nos produtos da H H Parfum.';
  const link = buildWhatsappLink(CONFIG.WHATSAPP_NUMBER, generalMsg);

  ['footerWhatsapp', 'floatWhatsapp', 'promoWhatsapp', 'accountWhatsapp'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.href = link;
  });
}

function setupNav() {
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');
  toggle.addEventListener('click', () => nav.classList.toggle('open'));
}

function setupYear() {
  document.getElementById('year').textContent = new Date().getFullYear();
}

/* ---------------------------------------------------------
   11) INIT
   --------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  setupWhatsappLinks();
  setupNav();
  setupYear();
  setupSearchAndFilters();
  setupCart();
  setupAccountModal();
  setupHeroCarousel();
  setupProductView();
  updateFavCount();
  observeReveal();
  loadProducts();
});
