require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDatabase, getDatabase } = require('./database/connection');
const { startClientBot } = require('./bot/cliente/index');
const { startAdminBot } = require('./bot/admin/index');
const { iniciarWhatsApp } = require('./services/whatsapp');
const logger = require('./utils/logger');
const { formatarMoeda, gerarNumeroPedido } = require('./utils/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

process.on('unhandledRejection', (error) => {
    logger.error('Erro não tratado: ' + (error?.message || 'Erro'));
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============ ROTAS WEB ============
app.get('/', (req, res) => {
    res.json({ status: 'online', sistema: '🛒 Supermercado Telegram', timestamp: new Date().toISOString() });
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ============ API CATEGORIAS ============
app.get('/api/categorias', (req, res) => {
    const db = getDatabase();
    const cats = db.prepare('SELECT * FROM categorias WHERE ativo = 1 ORDER BY ordem').all();
    res.json(cats);
});

// ============ API PRODUTOS ============
app.get('/api/produtos', (req, res) => {
    const db = getDatabase();
    const { categoria_id, limite } = req.query;
    let prods;
    if (categoria_id) {
        prods = db.prepare('SELECT * FROM produtos WHERE categoria_id = ? AND disponivel = 1 AND estoque > 0 ORDER BY destaque DESC LIMIT ?').all(categoria_id, parseInt(limite) || 50);
    } else {
        prods = db.prepare('SELECT * FROM produtos WHERE disponivel = 1 AND estoque > 0 ORDER BY destaque DESC LIMIT ?').all(parseInt(limite) || 50);
    }
    res.json({ produtos: prods });
});

app.get('/api/produtos/ofertas', (req, res) => {
    const db = getDatabase();
    const prods = db.prepare('SELECT * FROM produtos WHERE disponivel = 1 AND estoque > 0 AND preco_promocional IS NOT NULL ORDER BY ((preco - preco_promocional) / preco * 100) DESC LIMIT 30').all();
    res.json({ produtos: prods });
});

app.get('/api/produtos/pesquisar', (req, res) => {
    const db = getDatabase();
    const { q } = req.query;
    if (!q) return res.json({ produtos: [] });
    const prods = db.prepare('SELECT * FROM produtos WHERE disponivel = 1 AND estoque > 0 AND (nome LIKE ? OR marca LIKE ? OR descricao LIKE ?) LIMIT 30').all(`%${q}%`, `%${q}%`, `%${q}%`);
    res.json({ produtos: prods });
});

app.get('/api/produtos/:id', (req, res) => {
    const db = getDatabase();
    const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
    res.json(p || {});
});

// ============ API CARRINHO ============
app.get('/api/carrinho', (req, res) => {
    const db = getDatabase();
    const { userId } = req.query;
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    if (!cliente) return res.json({ itens: [] });
    const itens = db.prepare('SELECT c.*, p.nome, p.preco, p.preco_promocional, p.foto, p.marca FROM carrinhos c JOIN produtos p ON c.produto_id = p.id WHERE c.cliente_id = ?').all(cliente.id);
    res.json({ itens });
});

app.post('/api/carrinho/add', (req, res) => {
    const db = getDatabase();
    const { userId, produtoId, quantidade } = req.body;
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    if (!cliente) return res.json({ sucesso: false });
    
    const existe = db.prepare('SELECT * FROM carrinhos WHERE cliente_id = ? AND produto_id = ?').get(cliente.id, produtoId);
    if (existe) {
        db.prepare('UPDATE carrinhos SET quantidade = quantidade + ? WHERE id = ?').run(quantidade || 1, existe.id);
    } else {
        db.prepare('INSERT INTO carrinhos (cliente_id, produto_id, quantidade) VALUES (?,?,?)').run(cliente.id, produtoId, quantidade || 1);
    }
    res.json({ sucesso: true, mensagem: 'Adicionado!' });
});

app.post('/api/carrinho/update', (req, res) => {
    const db = getDatabase();
    const { carrinhoId, quantidade } = req.body;
    if (quantidade > 0) db.prepare('UPDATE carrinhos SET quantidade = ? WHERE id = ?').run(quantidade, carrinhoId);
    else db.prepare('DELETE FROM carrinhos WHERE id = ?').run(carrinhoId);
    res.json({ sucesso: true });
});

app.post('/api/carrinho/remover', (req, res) => {
    const db = getDatabase();
    db.prepare('DELETE FROM carrinhos WHERE id = ?').run(req.body.carrinhoId);
    res.json({ sucesso: true });
});

// ============ API PERFIL ============
app.get('/api/perfil', (req, res) => {
    const db = getDatabase();
    const { userId } = req.query;
    const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
    if (!cliente) return res.json({});
    const totalPedidos = db.prepare('SELECT COUNT(*) as t FROM pedidos WHERE cliente_id = ?').get(cliente.id).t;
    res.json({ ...cliente, totalPedidos });
});

// ============ API ENDEREÇOS ============
app.get('/api/enderecos', (req, res) => {
    const db = getDatabase();
    const { userId } = req.query;
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    if (!cliente) return res.json([]);
    const enderecos = db.prepare('SELECT * FROM enderecos WHERE cliente_id = ? ORDER BY principal DESC').all(cliente.id);
    res.json(enderecos);
});

app.post('/api/enderecos/salvar', (req, res) => {
    const db = getDatabase();
    const { userId, cep, logradouro, numero, complemento, referencia, bairro, cidade, estado, apelido } = req.body;
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    if (!cliente) return res.json({ sucesso: false, mensagem: 'Cliente não encontrado' });
    
    const total = db.prepare('SELECT COUNT(*) as t FROM enderecos WHERE cliente_id = ?').get(cliente.id).t;
    const principal = total === 0 ? 1 : 0;
    
    db.prepare('INSERT INTO enderecos (cliente_id, apelido, cep, logradouro, numero, complemento, referencia, bairro, cidade, estado, principal) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(cliente.id, apelido || 'Principal', cep, logradouro, numero, complemento, referencia, bairro, cidade, estado, principal);
    res.json({ sucesso: true, mensagem: 'Endereço salvo!' });
});

app.post('/api/enderecos/deletar', (req, res) => {
    const db = getDatabase();
    const { userId, enderecoId } = req.body;
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    if (!cliente) return res.json({ sucesso: false });
    db.prepare('DELETE FROM enderecos WHERE id = ? AND cliente_id = ?').run(enderecoId, cliente.id);
    res.json({ sucesso: true });
});

app.post('/api/enderecos/principal', (req, res) => {
    const db = getDatabase();
    const { userId, enderecoId } = req.body;
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    if (!cliente) return res.json({ sucesso: false });
    db.prepare('UPDATE enderecos SET principal = 0 WHERE cliente_id = ?').run(cliente.id);
    db.prepare('UPDATE enderecos SET principal = 1 WHERE id = ?').run(enderecoId);
    res.json({ sucesso: true });
});

// ============ API CEP ============
app.get('/api/cep/:cep', async (req, res) => {
    const { consultarCEP } = require('./services/cep');
    const resultado = await consultarCEP(req.params.cep);
    res.json(resultado);
});

// ============ API PEDIDOS ============
app.get('/api/pedidos', (req, res) => {
    const db = getDatabase();
    const { userId } = req.query;
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    if (!cliente) return res.json({ pedidos: [] });
    const pedidos = db.prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY data_pedido DESC LIMIT 20').all(cliente.id);
    res.json({ pedidos });
});

app.get('/api/pedidos/:id', (req, res) => {
    const db = getDatabase();
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
    if (!pedido) return res.json({});
    const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(req.params.id);
    res.json({ ...pedido, itens });
});

app.post('/api/pedidos/finalizar', async (req, res) => {
    try {
        const db = getDatabase();
        const { userId, metodoPagamento, tipoEntrega, enderecoId, cupom, comentario } = req.body;
        
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return res.json({ sucesso: false, mensagem: 'Cliente não encontrado.' });
        
        const itensCarrinho = db.prepare('SELECT c.*, p.nome, p.preco, p.preco_promocional, p.estoque FROM carrinhos c JOIN produtos p ON c.produto_id = p.id WHERE c.cliente_id = ?').all(cliente.id);
        if (itensCarrinho.length === 0) return res.json({ sucesso: false, mensagem: 'Carrinho vazio.' });
        
        for (const item of itensCarrinho) {
            if (item.estoque < item.quantidade) return res.json({ sucesso: false, mensagem: `Estoque insuficiente: ${item.nome}` });
        }
        
        let subtotal = 0;
        for (const item of itensCarrinho) subtotal += (item.preco_promocional || item.preco) * item.quantidade;
        
        const taxaEntrega = parseFloat(process.env.TAXA_ENTREGA_PADRAO || 8);
        let desconto = 0;
        
        if (cupom) {
            const cupomData = db.prepare('SELECT * FROM cupons WHERE codigo = ? AND ativo = 1').get(cupom.toUpperCase());
            if (cupomData && cupomData.uso_atual < cupomData.uso_maximo) {
                desconto = cupomData.tipo === 'percentual' ? subtotal * (cupomData.valor / 100) : cupomData.valor;
                db.prepare('UPDATE cupons SET uso_atual = uso_atual + 1 WHERE id = ?').run(cupomData.id);
            }
        }
        
        const total = subtotal + taxaEntrega - desconto;
        const numeroPedido = gerarNumeroPedido();
        
        let pagamentoResult = { sucesso: true, payment_id: `manual_${Date.now()}`, copia_cola: '', qr_code_base64: '' };
        
        if (metodoPagamento === 'pix') {
            const pagamentoService = require('./services/pagamento');
            const desc = itensCarrinho.map(i => `${i.quantidade}x ${i.nome}`).join(', ').substring(0, 100);
            pagamentoResult = await pagamentoService.gerarPix(total, desc, numeroPedido);
        }
        
        if (!pagamentoResult.sucesso) return res.json({ sucesso: false, mensagem: pagamentoResult.mensagem || 'Erro ao gerar pagamento.' });
        
        const pedido = db.prepare('INSERT INTO pedidos (numero, cliente_id, endereco_id, tipo_entrega, status, subtotal, taxa_entrega, desconto, total, cupom, comentario, pagamento_metodo, pagamento_id, pagamento_qrcode, pagamento_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(numeroPedido, cliente.id, enderecoId || null, tipoEntrega || 'entrega', 'recebido', subtotal, taxaEntrega, desconto, total, cupom || null, comentario || null, metodoPagamento, pagamentoResult.payment_id, pagamentoResult.copia_cola || null, 'pendente');
        
        for (const item of itensCarrinho) {
            const preco = item.preco_promocional || item.preco;
            db.prepare('INSERT INTO itens_pedido (pedido_id, produto_nome, marca, quantidade, preco_unitario, comentario) VALUES (?,?,?,?,?,?)').run(pedido.lastInsertRowid, item.nome, item.marca || null, item.quantidade, preco, item.comentario || null);
            db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(item.quantidade, item.produto_id);
        }
        
        db.prepare('DELETE FROM carrinhos WHERE cliente_id = ?').run(cliente.id);
        
        logger.info(`📦 Pedido ${numeroPedido} - ${metodoPagamento} - R$ ${total}`);
        
        res.json({ sucesso: true, pedidoId: pedido.lastInsertRowid, numero: numeroPedido, total, pagamento: { qr_code_base64: pagamentoResult.qr_code_base64 || pagamentoResult.qr_code || '', copia_cola: pagamentoResult.copia_cola || '', payment_id: pagamentoResult.payment_id } });
        
    } catch (error) {
        logger.error('Erro ao finalizar pedido: ' + error.message);
        res.json({ sucesso: false, mensagem: 'Erro interno.' });
    }
});

// ============ API AGENDAMENTO ============
app.get('/api/horarios-entrega', async (req, res) => {
    const AgendamentoService = require('./services/agendamento');
    const horarios = await AgendamentoService.getHorariosSemana();
    res.json(horarios);
});

// ============ INICIAR ============
async function main() {
    logger.info('🛒 Iniciando Supermercado Telegram...');
    
    await initDatabase();
    logger.info('✅ Banco de dados pronto');
    
    if (process.env.BOT_TOKEN_CLIENTE) {
        await startClientBot();
        logger.info('✅ Bot Cliente online');
    }
    
    if (process.env.BOT_TOKEN_ADMIN) {
        await startAdminBot();
        logger.info('✅ Bot Admin online');
    }
    
    try {
        await iniciarWhatsApp();
        logger.info('✅ WhatsApp conectado');
    } catch (e) {
        logger.warn('⚠️ WhatsApp não conectado: ' + e.message);
    }
    
    app.listen(PORT, () => {
        logger.info(`🌐 Servidor na porta ${PORT}`);
        logger.info(`🛍️ WebApp: http://localhost:${PORT}/app`);
        logger.info('🛒 Supermercado Telegram pronto!');
    });
}

main().catch(error => {
    logger.error('Erro fatal: ' + error.message);
    process.exit(1);
});
