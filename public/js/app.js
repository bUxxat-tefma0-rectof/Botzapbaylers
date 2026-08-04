// ============ SUPERMERCADO WEBAPP - 7 TELAS ============
const API = '/api';
const tg = window.Telegram?.WebApp;

const state = {
    page: 'home',
    history: [],
    categorias: [],
    produtos: [],
    carrinho: [],
    pedidos: [],
    perfil: null,
    enderecos: [],
    categoriaAtiva: null,
    metodoPagamento: 'pix',
    userId: tg?.initDataUnsafe?.user?.id || 1
};

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
    if (tg) { tg.expand(); tg.ready(); tg.MainButton.hide(); }
    await Promise.all([loadCategorias(), loadProdutos(), loadCarrinho(), loadPerfil(), loadEnderecos()]);
    showPage('home');
});

// ============ NAVEGAÇÃO ============
function showPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const page = document.getElementById(`page-${pageName}`);
    if (page) page.classList.add('active');
    
    const nav = document.querySelector(`[data-page="${pageName}"]`);
    if (nav) nav.classList.add('active');
    
    if (state.page !== pageName && state.page !== 'home') {
        state.history.push(state.page);
    }
    state.page = pageName;
    
    if (pageName === 'carrinho') renderCarrinho();
    if (pageName === 'pedidos') loadPedidos();
    if (pageName === 'perfil') renderPerfil();
    if (pageName === 'checkout') renderCheckout();
    if (pageName === 'ofertas') loadOfertas();
    if (pageName === 'enderecos') renderEnderecos();
    
    window.scrollTo(0, 0);
}

function goBack() {
    if (state.history.length > 0) {
        showPage(state.history.pop());
    } else {
        showPage('home');
    }
}

// ============ API ============
async function apiGet(endpoint) {
    try { const r = await fetch(`${API}${endpoint}`); return await r.json(); }
    catch (e) { return {}; }
}

async function apiPost(endpoint, data) {
    try {
        const r = await fetch(`${API}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await r.json();
    } catch (e) { return { sucesso: false }; }
}

// ============ CATEGORIAS ============
async function loadCategorias() {
    const data = await apiGet('/categorias');
    state.categorias = Array.isArray(data) ? data : [];
    renderCategorias();
}

function renderCategorias() {
    const c = document.getElementById('categoriesContainer');
    if (!c) return;
    c.innerHTML = state.categorias.map(cat => `
        <div class="category-chip ${cat.id === state.categoriaAtiva ? 'active' : ''}" onclick="toggleCategoria(${cat.id})">
            <span class="emoji">${cat.emoji}</span><span>${cat.nome}</span>
        </div>`).join('');
}

function toggleCategoria(id) {
    state.categoriaAtiva = state.categoriaAtiva === id ? null : id;
    renderCategorias();
    loadProdutos(state.categoriaAtiva);
}

// ============ PRODUTOS ============
async function loadProdutos(catId = null, termo = null) {
    let url = '/produtos?limite=50';
    if (catId) url += `&categoria_id=${catId}`;
    if (termo) url = `/produtos/pesquisar?q=${encodeURIComponent(termo)}`;
    
    const data = await apiGet(url);
    state.produtos = data.produtos || [];
    renderProdutos();
}

function renderProdutos() {
    const c = document.getElementById('productsContainer');
    if (!c || state.produtos.length === 0) {
        if (c) c.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Nenhum produto</div></div>';
        return;
    }
    
    c.innerHTML = state.produtos.map(p => {
        const preco = p.preco_promocional || p.preco;
        const desc = p.preco_promocional ? Math.round((1 - p.preco_promocional / p.preco) * 100) : 0;
        return `<div class="product-card" onclick="abrirProduto(${p.id})">
            ${desc > 0 ? `<div class="discount-badge">-${desc}%</div>` : ''}
            <div class="product-image" style="font-size:50px;display:flex;align-items:center;justify-content:center;background:#eee">${p.foto ? `<img src="${p.foto}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='📦'">` : '📦'}</div>
            <div class="product-info">
                <div class="product-name">${p.nome}</div>
                ${p.marca ? `<div class="product-brand">${p.marca}</div>` : ''}
                <span class="product-price">${fmt(preco)}</span>
                ${p.preco_promocional ? `<span class="product-old-price">${fmt(p.preco)}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ============ PESQUISA ============
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('searchInput');
    if (input) {
        let t;
        input.addEventListener('input', () => {
            clearTimeout(t);
            t = setTimeout(() => {
                const v = input.value.trim();
                if (v.length >= 2) loadProdutos(null, v);
                else if (v.length === 0) loadProdutos(state.categoriaAtiva);
            }, 500);
        });
    }
});

// ============ MODAL PRODUTO ============
function abrirProduto(id) {
    const p = state.produtos.find(pr => pr.id === id);
    if (!p) return;
    
    const preco = p.preco_promocional || p.preco;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    
    overlay.innerHTML = `<div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="modal-handle"></div>
        <div class="modal-header"><h3>${p.nome}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
        <div class="modal-body">
            <div style="width:100%;height:200px;background:#eee;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:60px;margin-bottom:15px">📦</div>
            ${p.marca ? `<p style="color:#999">🏷 ${p.marca}</p>` : ''}
            <p>${p.descricao || ''}</p>
            <h2 style="color:#27ae60">${fmt(preco)}</h2>
            ${p.preco_promocional ? `<p style="text-decoration:line-through;color:#999">${fmt(p.preco)}</p>` : ''}
            <p style="color:#999">📦 Estoque: ${p.estoque} ${p.unidade || 'un'}</p>
            <div style="display:flex;align-items:center;gap:15px;margin:20px 0">
                <button onclick="this.parentElement.querySelector('span').textContent = Math.max(1, parseInt(this.parentElement.querySelector('span').textContent) - 1)" style="width:40px;height:40px;border-radius:50%;border:2px solid #27ae60;background:white;color:#27ae60;font-size:20px">➖</button>
                <span style="font-size:20px;font-weight:bold">1</span>
                <button onclick="this.parentElement.querySelector('span').textContent = parseInt(this.parentElement.querySelector('span').textContent) + 1" style="width:40px;height:40px;border-radius:50%;border:2px solid #27ae60;background:white;color:#27ae60;font-size:20px">➕</button>
            </div>
            <button class="btn btn-primary" onclick="addCarrinho(${p.id}, parseInt(this.parentElement.querySelector('span').textContent)); this.closest('.modal-overlay').remove()">🛒 Adicionar - ${fmt(preco)}</button>
        </div>
    </div>`;
    
    document.body.appendChild(overlay);
}

// ============ CARRINHO ============
async function loadCarrinho() {
    const data = await apiGet(`/carrinho?userId=${state.userId}`);
    state.carrinho = data.itens || [];
    const badge = document.getElementById('cartBadge');
    if (badge) {
        const t = state.carrinho.reduce((s, i) => s + i.quantidade, 0);
        badge.textContent = t;
        badge.style.display = t > 0 ? 'inline' : 'none';
    }
}

async function addCarrinho(prodId, qtd = 1) {
    await apiPost('/carrinho/add', { userId: state.userId, produtoId: prodId, quantidade: qtd });
    await loadCarrinho();
    toast('✅ Adicionado!');
}

function renderCarrinho() {
    const items = document.getElementById('cartItems');
    const total = document.getElementById('cartTotal');
    const empty = document.getElementById('cartEmpty');
    
    if (state.carrinho.length === 0) {
        if (items) items.innerHTML = '';
        if (total) total.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';
    
    let tot = 0;
    if (items) items.innerHTML = state.carrinho.map(i => {
        const p = i.preco_promocional || i.preco;
        tot += p * i.quantidade;
        return `<div class="cart-item">
            <div style="width:60px;height:60px;background:#eee;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:30px">📦</div>
            <div class="cart-item-info">
                <div class="cart-item-name">${i.nome}</div>
                <div class="cart-item-price">${fmt(p * i.quantidade)}</div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="updateQtd(${i.id}, ${i.quantidade - 1})">➖</button>
                    <span class="qty-value">${i.quantidade}</span>
                    <button class="qty-btn" onclick="updateQtd(${i.id}, ${i.quantidade + 1})">➕</button>
                    <button class="cart-item-remove" onclick="removeItem(${i.id})">🗑</button>
                </div>
            </div>
        </div>`;
    }).join('');
    
    if (total) total.innerHTML = `<div style="padding:15px;background:white;margin:10px 0;border-radius:12px">
        <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold;margin-bottom:10px">
            <span>Total</span><span style="color:#27ae60">${fmt(tot)}</span>
        </div>
        <button class="btn btn-primary" onclick="showPage('checkout')">💳 Finalizar Pedido</button>
    </div>`;
}

async function updateQtd(id, qtd) {
    if (qtd <= 0) return removeItem(id);
    await apiPost('/carrinho/update', { carrinhoId: id, quantidade: qtd });
    await loadCarrinho();
    renderCarrinho();
}

async function removeItem(id) {
    await apiPost('/carrinho/remover', { carrinhoId: id });
    await loadCarrinho();
    renderCarrinho();
}

// ============ CHECKOUT ============
function renderCheckout() {
    const c = document.getElementById('checkoutContent');
    if (!c) return;
    if (state.carrinho.length === 0) {
        c.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div><div class="empty-title">Carrinho vazio</div></div>';
        return;
    }
    
    const tot = state.carrinho.reduce((s, i) => s + (i.preco_promocional || i.preco) * i.quantidade, 0);
    
    c.innerHTML = `<div class="card"><div class="card-title">📦 Resumo</div>
        ${state.carrinho.map(i => `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px"><span>${i.quantidade}x ${i.nome}</span><span>${fmt((i.preco_promocional||i.preco)*i.quantidade)}</span></div>`).join('')}
        <hr><div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold"><span>Total</span><span style="color:#27ae60">${fmt(tot)}</span></div>
    </div>
    <div class="card"><div class="card-title">📍 Endereço</div>
        ${state.enderecos.length > 0 ? state.enderecos.map(e => `<div class="payment-method ${e.principal ? 'selected' : ''}" onclick="state.enderecoSelecionado=${e.id};renderCheckout()">
            <span>📍</span><div class="method-info"><div class="method-name">${e.apelido || 'Principal'}</div><div class="method-desc">${e.logradouro}, ${e.numero} - ${e.bairro}</div></div>
            <div class="method-check">${e.principal ? '✓' : ''}</div>
        </div>`).join('') : '<p style="color:#999">Nenhum endereço cadastrado</p>'}
        <button class="btn btn-outline" onclick="showPage('enderecos')" style="margin-top:10px">➕ Adicionar Endereço</button>
    </div>
    <div class="card"><div class="card-title">💳 Pagamento</div>
        ${[{id:'pix',n:'PIX',i:'💳'},{id:'dinheiro',n:'Dinheiro',i:'💵'},{id:'credito',n:'Crédito',i:'💳'}].map(m => `
        <div class="payment-method ${state.metodoPagamento===m.id?'selected':''}" onclick="state.metodoPagamento='${m.id}';renderCheckout()">
            <span class="method-icon">${m.i}</span><div class="method-info"><div class="method-name">${m.n}</div></div>
            <div class="method-check">${state.metodoPagamento===m.id?'✓':''}</div>
        </div>`).join('')}
    </div>
    <div style="padding:15px"><button class="btn btn-primary" onclick="finalizar()">💳 Pagar ${fmt(tot)}</button></div>`;
}

async function finalizar() {
    toast('⏳ Processando...');
    const r = await apiPost('/pedidos/finalizar', {
        userId: state.userId,
        metodoPagamento: state.metodoPagamento,
        tipoEntrega: 'entrega',
        enderecoId: state.enderecoSelecionado
    });
    
    if (r.sucesso) {
        state.carrinho = [];
        await loadCarrinho();
        toast('✅ Pedido realizado!', 'success');
        
        if (r.pagamento?.qr_code_base64) {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.onclick = () => overlay.remove();
            overlay.innerHTML = `<div class="modal-sheet" onclick="event.stopPropagation()"><div class="modal-handle"></div><div class="modal-body" style="text-align:center"><h3>💳 PIX</h3><img src="data:image/png;base64,${r.pagamento.qr_code_base64}" style="width:250px;height:250px"><p style="margin:15px 0;word-break:break-all;font-size:11px">${r.pagamento.copia_cola||''}</p><button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove();showPage('pedidos')">✅ Já paguei</button></div></div>`;
            document.body.appendChild(overlay);
        }
        showPage('pedidos');
    } else {
        toast('❌ ' + (r.mensagem || 'Erro'), 'error');
    }
}

// ============ PEDIDOS ============
async function loadPedidos() {
    const data = await apiGet(`/pedidos?userId=${state.userId}`);
    state.pedidos = data.pedidos || [];
    renderPedidos();
}

function renderPedidos() {
    const c = document.getElementById('ordersList');
    const e = document.getElementById('ordersEmpty');
    if (!c) return;
    
    if (state.pedidos.length === 0) { if (e) e.style.display = 'block'; c.innerHTML = ''; return; }
    if (e) e.style.display = 'none';
    
    const st = {recebido:'status-pending',confirmado:'status-confirmed',separando:'status-preparing',entrega:'status-delivering',entregue:'status-delivered',cancelado:'status-cancelled'};
    
    c.innerHTML = state.pedidos.map(p => `
        <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>${p.numero}</strong><span class="status-badge ${st[p.status]||'status-pending'}">${p.status}</span></div><div style="font-size:13px;color:#999">${p.data_pedido||''}</div><div style="font-size:18px;font-weight:bold;color:#27ae60;margin-top:5px">${fmt(p.total)}</div></div>
    `).join('');
}

// ============ PERFIL ============
async function loadPerfil() {
    const data = await apiGet(`/perfil?userId=${state.userId}`);
    state.perfil = data;
}

function renderPerfil() {
    const c = document.getElementById('profileContent');
    if (!c) return;
    const p = state.perfil || {};
    
    c.innerHTML = `<div class="card" style="text-align:center"><div style="font-size:60px">👤</div><h2>${p.nome||'Cliente'} ${p.sobrenome||''}</h2><p style="color:#999">${p.email||'N/A'}</p></div>
    <div class="card"><div class="card-title">📊 Resumo</div><div style="display:flex;justify-content:space-around;text-align:center"><div><div style="font-size:24px;font-weight:bold">${p.totalPedidos||0}</div><div style="font-size:12px;color:#999">Pedidos</div></div><div><div style="font-size:24px;font-weight:bold;color:#27ae60">${fmt(p.total_gasto||0)}</div><div style="font-size:12px;color:#999">Total</div></div><div><div style="font-size:24px;font-weight:bold">⭐</div><div style="font-size:12px;color:#999">${p.pontos_fidelidade||0} pts</div></div></div></div>
    <div class="list-item" onclick="showPage('pedidos')"><span class="item-icon">📦</span><div class="item-info"><div class="item-title">Meus Pedidos</div></div><span class="item-arrow">›</span></div>
    <div class="list-item" onclick="showPage('enderecos')"><span class="item-icon">📍</span><div class="item-info"><div class="item-title">Meus Endereços</div></div><span class="item-arrow">›</span></div>
    <div class="list-item" onclick="showPage('ofertas')"><span class="item-icon">🔥</span><div class="item-info"><div class="item-title">Ofertas</div></div><span class="item-arrow">›</span></div>`;
}

// ============ ENDEREÇOS ============
async function loadEnderecos() {
    const data = await apiGet(`/enderecos?userId=${state.userId}`);
    state.enderecos = data || [];
}

function renderEnderecos() {
    const c = document.getElementById('enderecosContent');
    if (!c) return;
    
    c.innerHTML = state.enderecos.map(e => `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <strong>${e.apelido || 'Principal'} ${e.principal ? '⭐' : ''}</strong>
                <button onclick="deletarEndereco(${e.id})" style="background:none;border:none;font-size:18px">🗑</button>
            </div>
            <p style="margin-top:5px;font-size:14px">${e.logradouro}, ${e.numero}${e.complemento ? ' - ' + e.complemento : ''}</p>
            <p style="font-size:13px;color:#999">${e.bairro} - ${e.cidade}/${e.estado}</p>
            ${!e.principal ? `<button class="btn btn-outline" style="margin-top:8px;padding:8px" onclick="definirPrincipal(${e.id})">⭐ Definir como Principal</button>` : ''}
        </div>
    `).join('') + `
    <div style="padding:15px">
        <button class="btn btn-primary" onclick="showNovoEndereco()">➕ Novo Endereço</button>
    </div>`;
}

function showNovoEndereco() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    
    overlay.innerHTML = `<div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="modal-handle"></div>
        <div class="modal-header"><h3>📍 Novo Endereço</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
        <div class="modal-body">
            <div class="form-group"><label>CEP</label><input id="novoCep" class="form-input" placeholder="87700000" onblur="buscarCepNovo()"></div>
            <div class="form-group"><label>Rua</label><input id="novoRua" class="form-input" placeholder="Rua"></div>
            <div class="form-group"><label>Número</label><input id="novoNum" class="form-input" placeholder="100"></div>
            <div class="form-group"><label>Bairro</label><input id="novoBairro" class="form-input" placeholder="Bairro"></div>
            <div class="form-group"><label>Cidade</label><input id="novoCidade" class="form-input" placeholder="Cidade"></div>
            <div class="form-group"><label>Estado</label><input id="novoEstado" class="form-input" placeholder="PR"></div>
            <div class="form-group"><label>Apelido</label><input id="novoApelido" class="form-input" placeholder="Casa, Trabalho..."></div>
            <button class="btn btn-primary" onclick="salvarEndereco()">💾 Salvar</button>
        </div>
    </div>`;
    
    document.body.appendChild(overlay);
}

async function buscarCepNovo() {
    const cep = document.getElementById('novoCep').value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    const data = await apiGet(`/cep/${cep}`);
    if (data.sucesso) {
        document.getElementById('novoRua').value = data.dados.logradouro || '';
        document.getElementById('novoBairro').value = data.dados.bairro || '';
        document.getElementById('novoCidade').value = data.dados.cidade || '';
        document.getElementById('novoEstado').value = data.dados.estado || '';
    }
}

async function salvarEndereco() {
    const dados = {
        userId: state.userId,
        cep: document.getElementById('novoCep').value,
        logradouro: document.getElementById('novoRua').value,
        numero: document.getElementById('novoNum').value,
        bairro: document.getElementById('novoBairro').value,
        cidade: document.getElementById('novoCidade').value,
        estado: document.getElementById('novoEstado').value,
        apelido: document.getElementById('novoApelido').value || 'Principal'
    };
    
    const r = await apiPost('/enderecos/salvar', dados);
    if (r.sucesso) {
        document.querySelector('.modal-overlay')?.remove();
        await loadEnderecos();
        renderEnderecos();
        toast('✅ Endereço salvo!');
    } else {
        toast('❌ ' + (r.mensagem || 'Erro'));
    }
}

async function deletarEndereco(id) {
    if (!confirm('Remover este endereço?')) return;
    await apiPost('/enderecos/deletar', { userId: state.userId, enderecoId: id });
    await loadEnderecos();
    renderEnderecos();
}

async function definirPrincipal(id) {
    await apiPost('/enderecos/principal', { userId: state.userId, enderecoId: id });
    await loadEnderecos();
    renderEnderecos();
    toast('✅ Endereço principal atualizado!');
}

// ============ OFERTAS ============
async function loadOfertas() {
    const data = await apiGet('/produtos/ofertas');
    const prods = data.produtos || [];
    const c = document.getElementById('ofertasContainer');
    if (c) c.innerHTML = prods.map(p => {
        const desc = p.preco_promocional ? Math.round((1 - p.preco_promocional / p.preco) * 100) : 0;
        return `<div class="product-card" onclick="abrirProduto(${p.id})">
            ${desc > 0 ? `<div class="discount-badge">-${desc}%</div>` : ''}
            <div class="product-image" style="font-size:50px;display:flex;align-items:center;justify-content:center;background:#eee">📦</div>
            <div class="product-info"><div class="product-name">${p.nome}</div><span class="product-price">${fmt(p.preco_promocional||p.preco)}</span>${p.preco_promocional ? `<span class="product-old-price">${fmt(p.preco)}</span>` : ''}</div>
        </div>`;
    }).join('') || '<div class="empty-state"><div class="empty-icon">🔥</div><div class="empty-title">Nenhuma oferta</div></div>';
}

// ============ UTILS ============
function fmt(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0); }
function toast(msg, type = '') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}
