// ============ SUPERMERCADO WEBAPP - COMPLETO ============
const API_BASE = '/api';
const tg = window.Telegram?.WebApp;

const state = {
    currentPage: 'home',
    categorias: [],
    produtos: [],
    carrinho: [],
    pedidos: [],
    perfil: null,
    enderecos: [],
    categoriaAtiva: null,
    produtoModal: null,
    metodoPagamento: 'pix',
    userId: null
};

// ============ INICIALIZAÇÃO ============
document.addEventListener('DOMContentLoaded', async () => {
    if (tg) {
        tg.expand();
        tg.ready();
        tg.MainButton.hide();
        state.userId = tg.initDataUnsafe?.user?.id || 1;
    } else {
        state.userId = 1;
    }
    
    await loadAll();
    showPage('home');
});

async function loadAll() {
    await Promise.all([
        loadCategorias(),
        loadProdutos(),
        loadCarrinho(),
        loadPerfil()
    ]);
}

// ============ NAVEGAÇÃO ============
function showPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const page = document.getElementById(`page-${pageName}`);
    if (page) page.classList.add('active');
    
    const nav = document.querySelector(`[data-page="${pageName}"]`);
    if (nav) nav.classList.add('active');
    
    state.currentPage = pageName;
    
    // Ações específicas
    if (pageName === 'carrinho') renderCarrinho();
    if (pageName === 'pedidos') loadPedidos();
    if (pageName === 'perfil') renderPerfil();
    if (pageName === 'checkout') renderCheckout();
    if (pageName === 'ofertas') loadOfertas();
    
    // Scroll para topo
    window.scrollTo(0, 0);
}

// ============ API ============
async function apiGet(endpoint) {
    try {
        const resp = await fetch(`${API_BASE}${endpoint}`);
        return await resp.json();
    } catch (e) {
        console.error('API Error:', e);
        return {};
    }
}

async function apiPost(endpoint, data) {
    try {
        const resp = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await resp.json();
    } catch (e) {
        console.error('API Error:', e);
        return { sucesso: false };
    }
}

// ============ CATEGORIAS ============
async function loadCategorias() {
    const data = await apiGet('/categorias');
    state.categorias = Array.isArray(data) ? data : (data.categorias || []);
    renderCategorias();
}

function renderCategorias() {
    const container = document.getElementById('categoriesContainer');
    if (!container) return;
    
    container.innerHTML = state.categorias.map(c => `
        <div class="category-chip ${c.id === state.categoriaAtiva ? 'active' : ''}" 
             onclick="toggleCategoria(${c.id})">
            <span class="emoji">${c.emoji || '📦'}</span>
            <span>${c.nome}</span>
        </div>
    `).join('');
}

function toggleCategoria(catId) {
    state.categoriaAtiva = state.categoriaAtiva === catId ? null : catId;
    renderCategorias();
    loadProdutos(state.categoriaAtiva);
}

// ============ PRODUTOS ============
async function loadProdutos(catId = null, termo = null) {
    document.getElementById('loadingHome').style.display = 'block';
    
    try {
        let endpoint = '/produtos?limite=50';
        if (catId) endpoint += `&categoria_id=${catId}`;
        if (termo) endpoint = `/produtos/pesquisar?q=${encodeURIComponent(termo)}`;
        
        const data = await apiGet(endpoint);
        state.produtos = data.produtos || (Array.isArray(data) ? data : []);
        renderProdutos();
    } catch (e) {
        state.produtos = [];
        renderProdutos();
    }
    
    document.getElementById('loadingHome').style.display = 'none';
}

function renderProdutos() {
    const container = document.getElementById('productsContainer');
    if (!container) return;
    
    if (state.produtos.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Nenhum produto</div></div>`;
        return;
    }
    
    container.innerHTML = state.produtos.map(p => {
        const preco = p.preco_promocional || p.preco;
        const desconto = p.preco_promocional ? Math.round((1 - p.preco_promocional / p.preco) * 100) : 0;
        
        return `
        <div class="product-card" onclick="abrirProduto(${p.id})">
            ${desconto > 0 ? `<div class="discount-badge">-${desconto}%</div>` : ''}
            <div class="product-image" style="background:#eee;display:flex;align-items:center;justify-content:center;font-size:50px">${p.foto ? `<img src="${p.foto}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='📦'">` : '📦'}</div>
            <div class="product-info">
                <div class="product-name">${p.nome}</div>
                ${p.marca ? `<div class="product-brand">${p.marca}</div>` : ''}
                <span class="product-price">${formatarMoeda(preco)}</span>
                ${p.preco_promocional ? `<span class="product-old-price">${formatarMoeda(p.preco)}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ============ PESQUISA ============
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let timeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const termo = searchInput.value.trim();
                if (termo.length >= 2) loadProdutos(null, termo);
                else if (termo.length === 0) loadProdutos(state.categoriaAtiva);
            }, 500);
        });
    }
});

// ============ MODAL PRODUTO ============
function abrirProduto(id) {
    const p = state.produtos.find(pr => pr.id === id);
    if (!p) return;
    
    state.produtoModal = { ...p, quantidade: 1 };
    const preco = p.preco_promocional || p.preco;
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); state.produtoModal = null; };
    
    overlay.innerHTML = `
    <div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="modal-handle"></div>
        <div class="modal-header">
            <h3 class="modal-title">${p.nome}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove();state.produtoModal=null;">✕</button>
        </div>
        <div class="modal-body">
            <div style="width:100%;height:200px;background:#eee;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:60px;margin-bottom:15px">${p.foto ? `<img src="${p.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:12px" onerror="this.parentElement.innerHTML='📦'">` : '📦'}</div>
            ${p.marca ? `<p style="color:#999">🏷 ${p.marca}</p>` : ''}
            <p style="margin:10px 0">${p.descricao || ''}</p>
            <h2 style="color:#27ae60">${formatarMoeda(preco)}</h2>
            ${p.preco_promocional ? `<p style="text-decoration:line-through;color:#999">${formatarMoeda(p.preco)}</p>` : ''}
            <p style="color:#999;margin:10px 0">📦 Estoque: ${p.estoque} ${p.unidade || 'un'}</p>
            
            <div style="display:flex;align-items:center;gap:15px;margin:20px 0">
                <button onclick="mudarQtdModal(-1)" style="width:40px;height:40px;border-radius:50%;border:2px solid #27ae60;background:white;color:#27ae60;font-size:20px;cursor:pointer">➖</button>
                <span id="qtdModal" style="font-size:20px;font-weight:bold">1</span>
                <button onclick="mudarQtdModal(1)" style="width:40px;height:40px;border-radius:50%;border:2px solid #27ae60;background:white;color:#27ae60;font-size:20px;cursor:pointer">➕</button>
            </div>
            
            <button onclick="addDoModal()" class="btn btn-primary">🛒 Adicionar - ${formatarMoeda(preco)}</button>
        </div>
    </div>`;
    
    document.body.appendChild(overlay);
}

function mudarQtdModal(delta) {
    if (!state.produtoModal) return;
    state.produtoModal.quantidade = Math.max(1, Math.min(state.produtoModal.quantidade + delta, state.produtoModal.estoque || 99));
    const el = document.getElementById('qtdModal');
    if (el) el.textContent = state.produtoModal.quantidade;
}

async function addDoModal() {
    if (!state.produtoModal) return;
    await apiPost('/carrinho/add', {
        userId: state.userId,
        produtoId: state.produtoModal.id,
        quantidade: state.produtoModal.quantidade
    });
    document.querySelector('.modal-overlay')?.remove();
    state.produtoModal = null;
    await loadCarrinho();
    mostrarToast('✅ Adicionado!', 'success');
}

// ============ OFERTAS ============
async function loadOfertas() {
    const data = await apiGet('/produtos/ofertas');
    const prods = data.produtos || data || [];
    const container = document.getElementById('ofertasContainer');
    if (!container) return;
    
    container.innerHTML = prods.map(p => {
        const desconto = p.preco_promocional ? Math.round((1 - p.preco_promocional / p.preco) * 100) : 0;
        return `
        <div class="product-card" onclick="abrirProduto(${p.id})">
            ${desconto > 0 ? `<div class="discount-badge">-${desconto}%</div>` : ''}
            <div class="product-image" style="font-size:50px;display:flex;align-items:center;justify-content:center">📦</div>
            <div class="product-info">
                <div class="product-name">${p.nome}</div>
                <span class="product-price">${formatarMoeda(p.preco_promocional || p.preco)}</span>
                ${p.preco_promocional ? `<span class="product-old-price">${formatarMoeda(p.preco)}</span>` : ''}
            </div>
        </div>`;
    }).join('') || '<div class="empty-state"><div class="empty-icon">🔥</div><div class="empty-title">Nenhuma oferta</div></div>';
}

// ============ CARRINHO ============
async function loadCarrinho() {
    const data = await apiGet(`/carrinho?userId=${state.userId}`);
    state.carrinho = data.itens || [];
    atualizarBadge();
}

function atualizarBadge() {
    const badge = document.getElementById('cartBadge');
    if (badge) {
        const total = state.carrinho.reduce((s, i) => s + i.quantidade, 0);
        badge.textContent = total;
        badge.style.display = total > 0 ? 'inline' : 'none';
    }
}

function renderCarrinho() {
    const container = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    const emptyEl = document.getElementById('cartEmpty');
    
    if (!container) return;
    
    if (state.carrinho.length === 0) {
        container.innerHTML = '';
        if (totalEl) totalEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
    }
    
    if (emptyEl) emptyEl.style.display = 'none';
    
    let total = 0;
    container.innerHTML = state.carrinho.map(item => {
        const preco = item.preco_promocional || item.preco;
        total += preco * item.quantidade;
        return `
        <div class="cart-item">
            <div style="width:60px;height:60px;background:#eee;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:30px">📦</div>
            <div class="cart-item-info">
                <div class="cart-item-name">${item.nome}</div>
                <div class="cart-item-price">${formatarMoeda(preco * item.quantidade)}</div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="alterarQtd(${item.id}, -1)">➖</button>
                    <span class="qty-value">${item.quantidade}</span>
                    <button class="qty-btn" onclick="alterarQtd(${item.id}, 1)">➕</button>
                    <button class="cart-item-remove" onclick="removerItem(${item.id})">🗑</button>
                </div>
            </div>
        </div>`;
    }).join('');
    
    if (totalEl) {
        totalEl.innerHTML = `
        <div style="padding:15px;background:white;margin:10px 0;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.05)">
            <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold;margin-bottom:10px">
                <span>Total</span>
                <span style="color:#27ae60">${formatarMoeda(total)}</span>
            </div>
            <button class="btn btn-primary" onclick="showPage('checkout')">💳 Finalizar Pedido</button>
        </div>`;
    }
}

async function alterarQtd(carrinhoId, delta) {
    const item = state.carrinho.find(i => i.id === carrinhoId);
    if (!item) return;
    const nova = item.quantidade + delta;
    if (nova <= 0) return removerItem(carrinhoId);
    await apiPost('/carrinho/update', { carrinhoId, quantidade: nova });
    await loadCarrinho();
    renderCarrinho();
}

async function removerItem(carrinhoId) {
    await apiPost('/carrinho/remover', { carrinhoId });
    await loadCarrinho();
    renderCarrinho();
    mostrarToast('🗑 Removido');
}

// ============ CHECKOUT ============
function renderCheckout() {
    const container = document.getElementById('checkoutContent');
    if (!container) return;
    
    if (state.carrinho.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div><div class="empty-title">Carrinho vazio</div></div>';
        return;
    }
    
    const total = state.carrinho.reduce((s, i) => {
        const preco = i.preco_promocional || i.preco;
        return s + preco * i.quantidade;
    }, 0);
    
    container.innerHTML = `
    <div class="card">
        <div class="card-title">📦 Resumo</div>
        ${state.carrinho.map(i => `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px"><span>${i.quantidade}x ${i.nome}</span><span>${formatarMoeda((i.preco_promocional||i.preco)*i.quantidade)}</span></div>`).join('')}
        <hr>
        <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold"><span>Total</span><span style="color:#27ae60">${formatarMoeda(total)}</span></div>
    </div>
    <div class="card">
        <div class="card-title">💳 Pagamento</div>
        ${[{id:'pix',n:'PIX',i:'💳'},{id:'dinheiro',n:'Dinheiro',i:'💵'},{id:'credito',n:'Crédito',i:'💳'}].map(m => `
        <div class="payment-method ${state.metodoPagamento===m.id?'selected':''}" onclick="state.metodoPagamento='${m.id}';renderCheckout()">
            <span class="method-icon">${m.i}</span><div class="method-info"><div class="method-name">${m.n}</div></div>
            <div class="method-check">${state.metodoPagamento===m.id?'✓':''}</div>
        </div>`).join('')}
    </div>
    <div style="padding:15px">
        <button class="btn btn-primary" onclick="confirmarPedido()">💳 Pagar ${formatarMoeda(total)}</button>
    </div>`;
}

async function confirmarPedido() {
    mostrarToast('⏳ Processando...');
    const resp = await apiPost('/pedidos/finalizar', {
        userId: state.userId,
        metodoPagamento: state.metodoPagamento,
        tipoEntrega: 'entrega'
    });
    
    if (resp.sucesso) {
        state.carrinho = [];
        atualizarBadge();
        mostrarToast('✅ Pedido realizado!', 'success');
        
        if (state.metodoPagamento === 'pix' && resp.pagamento?.qr_code_base64) {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.onclick = () => overlay.remove();
            overlay.innerHTML = `<div class="modal-sheet" onclick="event.stopPropagation()"><div class="modal-handle"></div><div class="modal-body" style="text-align:center"><h3>💳 PIX</h3><p>Escaneie o QR Code</p><img src="data:image/png;base64,${resp.pagamento.qr_code_base64}" style="width:250px;height:250px"><p style="margin:15px 0;word-break:break-all;font-size:11px">${resp.pagamento.copia_cola||''}</p><button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove();showPage('pedidos')">✅ Já paguei</button></div></div>`;
            document.body.appendChild(overlay);
        }
        
        showPage('pedidos');
    } else {
        mostrarToast('❌ ' + (resp.mensagem || 'Erro'), 'error');
    }
}

// ============ PEDIDOS ============
async function loadPedidos() {
    const data = await apiGet(`/pedidos?userId=${state.userId}`);
    state.pedidos = data.pedidos || [];
    renderPedidos();
}

function renderPedidos() {
    const container = document.getElementById('ordersList');
    const emptyEl = document.getElementById('ordersEmpty');
    
    if (!container) return;
    
    if (state.pedidos.length === 0) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
    }
    
    if (emptyEl) emptyEl.style.display = 'none';
    
    const statusStyle = {recebido:'status-pending',confirmado:'status-confirmed',separando:'status-preparing',entrega:'status-delivering',entregue:'status-delivered',cancelado:'status-cancelled'};
    
    container.innerHTML = state.pedidos.map(p => `
    <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong>${p.numero}</strong>
            <span class="status-badge ${statusStyle[p.status]||'status-pending'}">${p.status}</span>
        </div>
        <div style="font-size:13px;color:#999">${p.data_pedido||''}</div>
        <div style="font-size:18px;font-weight:bold;color:#27ae60;margin-top:5px">${formatarMoeda(p.total)}</div>
    </div>`).join('');
}

// ============ PERFIL ============
async function loadPerfil() {
    const data = await apiGet(`/perfil?userId=${state.userId}`);
    state.perfil = data;
}

function renderPerfil() {
    const container = document.getElementById('profileContent');
    if (!container) return;
    
    const p = state.perfil || {};
    
    container.innerHTML = `
    <div class="card" style="text-align:center">
        <div style="font-size:60px;margin-bottom:10px">👤</div>
        <h2>${p.nome || 'Cliente'} ${p.sobrenome||''}</h2>
        <p style="color:#999">${p.email || 'N/A'}</p>
        <p style="color:#999">${p.telefone || 'N/A'}</p>
    </div>
    <div class="card">
        <div class="card-title">📊 Resumo</div>
        <div style="display:flex;justify-content:space-around;text-align:center">
            <div><div style="font-size:24px;font-weight:bold">${p.totalPedidos||0}</div><div style="font-size:12px;color:#999">Pedidos</div></div>
            <div><div style="font-size:24px;font-weight:bold;color:#27ae60">${formatarMoeda(p.total_gasto||0)}</div><div style="font-size:12px;color:#999">Total Gasto</div></div>
            <div><div style="font-size:24px;font-weight:bold">⭐</div><div style="font-size:12px;color:#999">${p.pontos_fidelidade||0} pts</div></div>
        </div>
    </div>
    <div class="list-item" onclick="showPage('pedidos')"><span class="item-icon">📦</span><div class="item-info"><div class="item-title">Meus Pedidos</div></div><span class="item-arrow">›</span></div>
    <div class="list-item" onclick="mostrarToast('Em breve!')"><span class="item-icon">📍</span><div class="item-info"><div class="item-title">Endereços</div></div><span class="item-arrow">›</span></div>
    <div class="list-item" onclick="mostrarToast('Em breve!')"><span class="item-icon">⭐</span><div class="item-info"><div class="item-title">Cashback</div></div><span class="item-arrow">›</span></div>`;
}

// ============ UTILS ============
function formatarMoeda(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function mostrarToast(msg, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}
