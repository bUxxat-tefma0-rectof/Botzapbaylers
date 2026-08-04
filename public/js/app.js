// ============ APP SUPERMERCADO ============
const API_BASE = '/api';
const tg = window.Telegram?.WebApp;

// Estado global
const state = {
    currentPage: 'home',
    categorias: [],
    produtos: [],
    carrinho: [],
    categoriaAtiva: null,
    produtoModal: null,
    pedidos: [],
    perfil: null,
    enderecos: [],
    metodoPagamento: 'pix',
    userId: null
};

// ============ INICIALIZAÇÃO ============
document.addEventListener('DOMContentLoaded', async () => {
    if (tg) {
        tg.expand();
        tg.ready();
        state.userId = tg.initDataUnsafe?.user?.id;
    }
    
    await Promise.all([
        loadCategorias(),
        loadProdutos(),
        loadCarrinho(),
        loadPerfil()
    ]);
    
    setupNavigation();
    setupSearch();
    showPage('home');
});

// ============ NAVEGAÇÃO ============
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            showPage(page);
        });
    });
}

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const page = document.getElementById(`page-${pageName}`);
    if (page) page.classList.add('active');
    
    const nav = document.querySelector(`[data-page="${pageName}"]`);
    if (nav) nav.classList.add('active');
    
    state.currentPage = pageName;
    
    // Carrega dados da página
    if (pageName === 'carrinho') renderCarrinho();
    if (pageName === 'pedidos') loadPedidos();
    if (pageName === 'perfil') renderPerfil();
}

// ============ API CALLS ============
async function apiGet(endpoint) {
    const resp = await fetch(`${API_BASE}${endpoint}`);
    return resp.json();
}

async function apiPost(endpoint, data) {
    const resp = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return resp.json();
}

// ============ CATEGORIAS ============
async function loadCategorias() {
    try {
        const cats = await apiGet('/categorias');
        state.categorias = cats;
        renderCategorias();
    } catch (e) {}
}

function renderCategorias() {
    const container = document.getElementById('categoriesContainer');
    if (!container) return;
    
    container.innerHTML = state.categorias.map(c => `
        <div class="category-chip ${c.id === state.categoriaAtiva ? 'active' : ''}" 
             onclick="filtrarPorCategoria(${c.id})">
            <span class="emoji">${c.emoji}</span>
            <span>${c.nome}</span>
        </div>
    `).join('');
}

function filtrarPorCategoria(catId) {
    state.categoriaAtiva = state.categoriaAtiva === catId ? null : catId;
    renderCategorias();
    loadProdutos(state.categoriaAtiva);
}

// ============ PRODUTOS ============
async function loadProdutos(catId = null) {
    try {
        let endpoint = '/produtos';
        if (catId) endpoint += `?categoria_id=${catId}`;
        
        const data = await apiGet(endpoint);
        state.produtos = data.produtos || [];
        renderProdutos();
    } catch (e) {
        state.produtos = [];
        renderProdutos();
    }
}

function renderProdutos() {
    const container = document.getElementById('productsContainer');
    if (!container) return;
    
    if (state.produtos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <div class="empty-title">Nenhum produto</div>
                <div class="empty-text">Tente outra categoria ou pesquise</div>
            </div>`;
        return;
    }
    
    container.innerHTML = state.produtos.map(p => {
        const preco = p.preco_promocional || p.preco;
        const desconto = p.preco_promocional ? Math.round((1 - p.preco_promocional / p.preco) * 100) : 0;
        
        return `
            <div class="product-card" onclick="abrirProduto(${p.id})">
                ${desconto > 0 ? `<div class="discount-badge">-${desconto}%</div>` : ''}
                <img src="${p.foto || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22140%22 height=%22140%22><rect fill=%22%23eee%22 width=%22140%22 height=%22140%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2240%22>📦</text></svg>'}" 
                     class="product-image" alt="${p.nome}">
                <div class="product-info">
                    <div class="product-name">${p.nome}</div>
                    ${p.marca ? `<div class="product-brand">${p.marca}</div>` : ''}
                    <span class="product-price">${formatarMoeda(preco)}</span>
                    ${p.preco_promocional ? `<span class="product-old-price">${formatarMoeda(p.preco)}</span>` : ''}
                </div>
                <button class="product-add-btn" onclick="event.stopPropagation(); adicionarAoCarrinho(${p.id})">
                    🛒 Adicionar
                </button>
            </div>`;
    }).join('');
}

// ============ PESQUISA ============
function setupSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    
    let timeout;
    input.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            const termo = input.value.trim();
            if (termo.length < 2) return loadProdutos(state.categoriaAtiva);
            
            try {
                const data = await apiGet(`/produtos/pesquisar?q=${encodeURIComponent(termo)}`);
                state.produtos = data.produtos || [];
                renderProdutos();
            } catch (e) {}
        }, 400);
    });
}

// ============ MODAL PRODUTO ============
function abrirProduto(id) {
    const p = state.produtos.find(pr => pr.id === id);
    if (!p) return;
    
    state.produtoModal = { ...p, quantidade: 1 };
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalProduto';
    overlay.onclick = (e) => { if (e.target === overlay) fecharModal(); };
    
    const preco = p.preco_promocional || p.preco;
    
    overlay.innerHTML = `
        <div class="modal-sheet" onclick="event.stopPropagation()">
            <div class="modal-handle"></div>
            <div class="modal-header">
                <h3 class="modal-title">${p.nome}</h3>
                <button class="modal-close" onclick="fecharModal()">✕</button>
            </div>
            <div class="modal-body">
                <img src="${p.foto || ''}" style="width:100%;height:200px;object-fit:cover;border-radius:12px;margin-bottom:15px" alt="">
                ${p.marca ? `<p style="color:#999;margin-bottom:5px">🏷 ${p.marca}</p>` : ''}
                <p style="margin-bottom:15px">${p.descricao || ''}</p>
                <h2 style="color:#27ae60;margin-bottom:5px">${formatarMoeda(preco)}</h2>
                ${p.preco_promocional ? `<p style="text-decoration:line-through;color:#999">${formatarMoeda(p.preco)}</p>` : ''}
                <p style="color:#999;margin:10px 0">📦 Estoque: ${p.estoque} ${p.unidade || 'un'}</p>
                
                <div style="display:flex;align-items:center;gap:15px;margin:20px 0">
                    <button onclick="mudarQtd(-1)" style="width:40px;height:40px;border-radius:50%;border:2px solid #27ae60;background:white;color:#27ae60;font-size:20px;cursor:pointer">➖</button>
                    <span id="qtdModal" style="font-size:20px;font-weight:bold">1</span>
                    <button onclick="mudarQtd(1)" style="width:40px;height:40px;border-radius:50%;border:2px solid #27ae60;background:white;color:#27ae60;font-size:20px;cursor:pointer">➕</button>
                </div>
                
                <button onclick="confirmarAddCarrinho()" class="btn btn-primary" style="margin-top:10px">
                    🛒 Adicionar ao Carrinho - ${formatarMoeda(preco)}
                </button>
            </div>
        </div>`;
    
    document.body.appendChild(overlay);
}

function mudarQtd(delta) {
    if (!state.produtoModal) return;
    state.produtoModal.quantidade = Math.max(1, Math.min(state.produtoModal.quantidade + delta, state.produtoModal.estoque || 99));
    document.getElementById('qtdModal').textContent = state.produtoModal.quantidade;
}

async function confirmarAddCarrinho() {
    if (!state.produtoModal) return;
    
    await apiPost('/carrinho/add', {
        userId: state.userId,
        produtoId: state.produtoModal.id,
        quantidade: state.produtoModal.quantidade
    });
    
    fecharModal();
    await loadCarrinho();
    mostrarToast('✅ Adicionado ao carrinho!', 'success');
}

function fecharModal() {
    const modal = document.getElementById('modalProduto');
    if (modal) modal.remove();
    state.produtoModal = null;
}

async function adicionarAoCarrinho(produtoId) {
    await apiPost('/carrinho/add', {
        userId: state.userId,
        produtoId,
        quantidade: 1
    });
    await loadCarrinho();
    mostrarToast('✅ Adicionado!', 'success');
}

// ============ CARRINHO ============
async function loadCarrinho() {
    if (!state.userId) return;
    try {
        const data = await apiGet(`/carrinho?userId=${state.userId}`);
        state.carrinho = data.itens || [];
        atualizarBadgeCarrinho();
    } catch (e) {}
}

function atualizarBadgeCarrinho() {
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
    if (!container) return;
    
    if (state.carrinho.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🛒</div>
                <div class="empty-title">Carrinho vazio</div>
                <div class="empty-text">Adicione produtos para começar</div>
                <button class="btn btn-primary" onclick="showPage('home')" style="margin-top:20px">Ver Produtos</button>
            </div>`;
        if (totalEl) totalEl.innerHTML = '';
        return;
    }
    
    let total = 0;
    container.innerHTML = state.carrinho.map(item => {
        const preco = item.preco_promocional || item.preco;
        total += preco * item.quantidade;
        
        return `
            <div class="cart-item">
                <img src="${item.foto || ''}" class="cart-item-img" alt="">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.nome}</div>
                    <div class="cart-item-price">${formatarMoeda(preco * item.quantidade)}</div>
                    <div class="cart-item-controls">
                        <button class="qty-btn" onclick="alterarQtdCarrinho(${item.id}, -1)">➖</button>
                        <span class="qty-value">${item.quantidade}</span>
                        <button class="qty-btn" onclick="alterarQtdCarrinho(${item.id}, 1)">➕</button>
                        <button class="cart-item-remove" onclick="removerDoCarrinho(${item.id})">🗑</button>
                    </div>
                </div>
            </div>`;
    }).join('');
    
    if (totalEl) {
        totalEl.innerHTML = `
            <div style="padding:15px;background:white;border-top:2px solid #eee;margin-top:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                    <span style="font-size:16px">Subtotal</span>
                    <span style="font-size:16px;font-weight:bold">${formatarMoeda(total)}</span>
                </div>
                <button class="btn btn-primary" onclick="showPage('checkout')">
                    💳 Finalizar Pedido - ${formatarMoeda(total)}
                </button>
            </div>`;
    }
}

async function alterarQtdCarrinho(carrinhoId, delta) {
    const item = state.carrinho.find(i => i.id === carrinhoId);
    if (!item) return;
    
    if (item.quantidade + delta <= 0) {
        await removerDoCarrinho(carrinhoId);
        return;
    }
    
    await apiPost('/carrinho/update', { carrinhoId, quantidade: item.quantidade + delta });
    await loadCarrinho();
    renderCarrinho();
}

async function removerDoCarrinho(carrinhoId) {
    await apiPost('/carrinho/remover', { carrinhoId });
    await loadCarrinho();
    renderCarrinho();
    mostrarToast('🗑 Removido do carrinho');
}

// ============ CHECKOUT ============
function renderCheckout() {
    const container = document.getElementById('checkoutContent');
    if (!container) return;
    
    const total = state.carrinho.reduce((s, i) => {
        const preco = i.preco_promocional || i.preco;
        return s + preco * i.quantidade;
    }, 0);
    
    container.innerHTML = `
        <div class="card">
            <div class="card-title">📦 Resumo do Pedido</div>
            ${state.carrinho.map(i => `
                <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px">
                    <span>${i.quantidade}x ${i.nome}</span>
                    <span>${formatarMoeda((i.preco_promocional || i.preco) * i.quantidade)}</span>
                </div>
            `).join('')}
            <hr style="margin:10px 0">
            <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold">
                <span>Total</span>
                <span style="color:#27ae60">${formatarMoeda(total)}</span>
            </div>
        </div>
        
        <div class="card">
            <div class="card-title">💳 Forma de Pagamento</div>
            ${[
                { id: 'pix', nome: 'PIX', desc: 'Pagamento instantâneo', icon: '💳' },
                { id: 'credito', nome: 'Cartão de Crédito', desc: 'Até 12x', icon: '💳' },
                { id: 'debito', nome: 'Cartão de Débito', desc: 'Débito em conta', icon: '🏧' },
                { id: 'dinheiro', nome: 'Dinheiro', desc: 'Na entrega', icon: '💵' }
            ].map(m => `
                <div class="payment-method ${state.metodoPagamento === m.id ? 'selected' : ''}" 
                     onclick="selecionarMetodoPagamento('${m.id}')">
                    <span class="method-icon">${m.icon}</span>
                    <div class="method-info">
                        <div class="method-name">${m.nome}</div>
                        <div class="method-desc">${m.desc}</div>
                    </div>
                    <div class="method-check">${state.metodoPagamento === m.id ? '✓' : ''}</div>
                </div>
            `).join('')}
        </div>
        
        <div style="padding:15px">
            <button class="btn btn-primary" onclick="finalizarPedido()">
                💳 Pagar ${formatarMoeda(total)}
            </button>
        </div>
    `;
}

function selecionarMetodoPagamento(metodo) {
    state.metodoPagamento = metodo;
    renderCheckout();
}

async function finalizarPedido() {
    if (state.carrinho.length === 0) return mostrarToast('Carrinho vazio!', 'error');
    
    mostrarToast('⏳ Processando...');
    
    try {
        const resp = await apiPost('/pedidos/finalizar', {
            userId: state.userId,
            metodoPagamento: state.metodoPagamento,
            tipoEntrega: 'entrega'
        });
        
        if (resp.sucesso) {
            state.carrinho = [];
            atualizarBadgeCarrinho();
            mostrarToast('✅ Pedido realizado!', 'success');
            
            if (state.metodoPagamento === 'pix' && resp.pagamento?.qrBuffer) {
                // Mostra QR Code PIX
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
                overlay.innerHTML = `
                    <div class="modal-sheet" onclick="event.stopPropagation()">
                        <div class="modal-handle"></div>
                        <div class="modal-body" style="text-align:center">
                            <h3>💳 PIX</h3>
                            <p style="margin:10px 0">Escaneie o QR Code</p>
                            <img src="data:image/png;base64,${resp.pagamento.qrBuffer}" style="width:250px;height:250px">
                            <p style="margin:15px 0;word-break:break-all;font-size:12px">${resp.pagamento.copia_cola || ''}</p>
                            <button class="btn btn-primary" onclick="this.parentElement.parentElement.parentElement.remove();showPage('pedidos')">✅ Já paguei</button>
                        </div>
                    </div>`;
                document.body.appendChild(overlay);
            }
            
            showPage('pedidos');
        } else {
            mostrarToast('❌ ' + (resp.mensagem || 'Erro'), 'error');
        }
    } catch (e) {
        mostrarToast('❌ Erro ao finalizar', 'error');
    }
}

// ============ PEDIDOS ============
async function loadPedidos() {
    if (!state.userId) return;
    try {
        const data = await apiGet(`/pedidos?userId=${state.userId}`);
        state.pedidos = data.pedidos || [];
        renderPedidos();
    } catch (e) {}
}

function renderPedidos() {
    const container = document.getElementById('ordersList');
    if (!container) return;
    
    if (state.pedidos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <div class="empty-title">Nenhum pedido</div>
                <div class="empty-text">Seus pedidos aparecerão aqui</div>
            </div>`;
        return;
    }
    
    container.innerHTML = state.pedidos.map(p => {
        const statusClass = {
            'recebido': 'status-pending',
            'confirmado': 'status-confirmed',
            'separando': 'status-preparing',
            'embalando': 'status-preparing',
            'entrega': 'status-delivering',
            'entregue': 'status-delivered',
            'cancelado': 'status-cancelled'
        };
        
        return `
            <div class="card" onclick="verDetalhesPedido(${p.id})" style="cursor:pointer">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                    <strong>${p.numero}</strong>
                    <span class="status-badge ${statusClass[p.status] || 'status-pending'}">${p.status}</span>
                </div>
                <div style="font-size:14px;color:#666">${p.data_pedido || ''}</div>
                <div style="font-size:18px;font-weight:bold;color:#27ae60;margin-top:5px">${formatarMoeda(p.total)}</div>
            </div>`;
    }).join('');
}

async function verDetalhesPedido(pedidoId) {
    try {
        const data = await apiGet(`/pedidos/${pedidoId}`);
        const p = data;
        
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        
        overlay.innerHTML = `
            <div class="modal-sheet" onclick="event.stopPropagation()">
                <div class="modal-handle"></div>
                <div class="modal-header">
                    <h3 class="modal-title">Pedido ${p.numero}</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                <div class="modal-body">
                    <div class="tracker">
                        ${['recebido','confirmado','separando','embalando','entrega','entregue'].map((s, i) => {
                            const statusIndex = ['recebido','confirmado','separando','embalando','entrega','entregue'].indexOf(p.status);
                            const completed = i <= statusIndex;
                            const active = i === statusIndex;
                            return `
                                <div class="tracker-step ${completed ? 'completed' : ''} ${active ? 'active' : ''}">
                                    <div class="tracker-dot">${completed ? '✓' : i+1}</div>
                                    <div class="tracker-content">
                                        <div class="tracker-label">${s.charAt(0).toUpperCase() + s.slice(1)}</div>
                                    </div>
                                </div>`;
                        }).join('')}
                    </div>
                    
                    <div style="margin-top:20px">
                        <strong>Itens:</strong>
                        ${(p.itens || []).map(i => `
                            <div style="display:flex;justify-content:space-between;padding:5px 0">
