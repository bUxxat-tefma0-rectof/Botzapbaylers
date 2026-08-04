require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDatabase, getDatabase } = require('./database/connection');
const { startClientBot } = require('./bot/cliente/index');
const { startAdminBot } = require('./bot/admin/index');
const { iniciarWhatsApp, getQR, getStatus } = require('./services/whatsapp');
const logger = require('./utils/logger');
const { formatarMoeda, gerarNumeroPedido } = require('./utils/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

process.on('unhandledRejection', (error) => {
    logger.error('Erro: ' + (error?.message || 'Erro'));
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
    res.json({ status: 'online', sistema: '🛒 Supermercado Telegram' });
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// QR Code
app.get('/qr', (req, res) => {
    const qr = getQR();
    const status = getStatus();
    
    if (status === 'conectado') {
        return res.send(`<html><body style="font-family:Arial;text-align:center;padding:50px"><h2 style="color:#25D366">✅ WhatsApp Conectado!</h2></body></html>`);
    }
    
    if (!qr) {
        return res.send(`<html><body style="font-family:Arial;text-align:center;padding:50px"><h2>⏳ Aguardando QR Code...</h2><script>setTimeout(()=>location.reload(),3000)</script></body></html>`);
    }
    
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    
    res.send(`<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f0f2f5;margin:0}.box{background:white;padding:30px;border-radius:20px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.1)}img{border:3px solid #25D366;border-radius:15px;padding:10px;width:250px;height:250px}h2{color:#25D366}p{color:#666;margin:10px 0}</style></head><body><div class="box"><h2>📱 WhatsApp</h2><p>Escaneie o QR Code</p><img src="${qrUrl}" alt="QR Code"><p style="font-size:12px;color:#999">Atualize a página se expirar</p></div></body></html>`);
});

// API Categorias
app.get('/api/categorias', (req, res) => {
    res.json(getDatabase().prepare('SELECT * FROM categorias WHERE ativo = 1 ORDER BY ordem').all());
});

// API Produtos
app.get('/api/produtos', (req, res) => {
    const db = getDatabase();
    const { categoria_id } = req.query;
    const prods = categoria_id 
        ? db.prepare('SELECT * FROM produtos WHERE categoria_id = ? AND disponivel = 1 AND estoque > 0 ORDER BY destaque DESC LIMIT 50').all(categoria_id)
        : db.prepare('SELECT * FROM produtos WHERE disponivel = 1 AND estoque > 0 ORDER BY destaque DESC LIMIT 50').all();
    res.json({ produtos: prods });
});

app.get('/api/produtos/ofertas', (req, res) => {
    res.json({ produtos: getDatabase().prepare('SELECT * FROM produtos WHERE disponivel = 1 AND estoque > 0 AND preco_promocional IS NOT NULL ORDER BY ((preco - preco_promocional) / preco * 100) DESC LIMIT 30').all() });
});

app.get('/api/produtos/pesquisar', (req, res) => {
    const { q } = req.query;
    if (!q) return res.json({ produtos: [] });
    res.json({ produtos: getDatabase().prepare('SELECT * FROM produtos WHERE disponivel = 1 AND estoque > 0 AND (nome LIKE ? OR marca LIKE ? OR descricao LIKE ?) LIMIT 30').all(`%${q}%`, `%${q}%`, `%${q}%`) });
});

// API Carrinho
app.get('/api/carrinho', (req, res) => {
    const db = getDatabase();
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(req.query.userId);
    if (!cliente) return res.json({ itens: [] });
    res.json({ itens: db.prepare('SELECT c.*, p.nome, p.preco, p.preco_promocional, p.foto FROM carrinhos c JOIN produtos p ON c.produto_id = p.id WHERE c.cliente_id = ?').all(cliente.id) });
});

app.post('/api/carrinho/add', (req, res) => {
    const db = getDatabase();
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(req.body.userId);
    if (!cliente) return res.json({ sucesso: false });
    const existe = db.prepare('SELECT * FROM carrinhos WHERE cliente_id = ? AND produto_id = ?').get(cliente.id, req.body.produtoId);
    if (existe) db.prepare('UPDATE carrinhos SET quantidade = quantidade + ? WHERE id = ?').run(req.body.quantidade || 1, existe.id);
    else db.prepare('INSERT INTO carrinhos (cliente_id, produto_id, quantidade) VALUES (?,?,?)').run(cliente.id, req.body.produtoId, req.body.quantidade || 1);
    res.json({ sucesso: true });
});

app.post('/api/carrinho/update', (req, res) => {
    const db = getDatabase();
    if (req.body.quantidade > 0) db.prepare('UPDATE carrinhos SET quantidade = ? WHERE id = ?').run(req.body.quantidade, req.body.carrinhoId);
    else db.prepare('DELETE FROM carrinhos WHERE id = ?').run(req.body.carrinhoId);
    res.json({ sucesso: true });
});

app.post('/api/carrinho/remover', (req, res) => {
    getDatabase().prepare('DELETE FROM carrinhos WHERE id = ?').run(req.body.carrinhoId);
    res.json({ sucesso: true });
});

// API Perfil
app.get('/api/perfil', (req, res) => {
    const db = getDatabase();
    const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(req.query.userId);
    if (!cliente) return res.json({});
    const peds = db.prepare('SELECT COUNT(*) as t FROM pedidos WHERE cliente_id = ?').get(cliente.id).t;
    res.json({ ...cliente, totalPedidos: peds });
});

// API Pedidos
app.get('/api/pedidos', (req, res) => {
    const db = getDatabase();
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(req.query.userId);
    if (!cliente) return res.json({ pedidos: [] });
    res.json({ pedidos: db.prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY data_pedido DESC LIMIT 20').all(cliente.id) });
});

app.post('/api/pedidos/finalizar', async (req, res) => {
    try {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(req.body.userId);
        if (!cliente) return res.json({ sucesso: false });
        
        const itens = db.prepare('SELECT c.*, p.nome, p.preco, p.preco_promocional, p.estoque FROM carrinhos c JOIN produtos p ON c.produto_id = p.id WHERE c.cliente_id = ?').all(cliente.id);
        if (itens.length === 0) return res.json({ sucesso: false, mensagem: 'Carrinho vazio.' });
        
        let subtotal = 0;
        for (const i of itens) subtotal += (i.preco_promocional || i.preco) * i.quantidade;
        
        const total = subtotal + parseFloat(process.env.TAXA_ENTREGA_PADRAO || 8);
        const numero = gerarNumeroPedido();
        
        let pag = { sucesso: true, payment_id: `manual_${Date.now()}`, copia_cola: '', qr_code_base64: '' };
        
        if (req.body.metodoPagamento === 'pix') {
            pag = await require('./services/pagamento').gerarPix(total, itens.map(i => i.nome).join(', ').substring(0, 100), numero);
        }
        
        if (!pag.sucesso) return res.json({ sucesso: false, mensagem: 'Erro ao gerar pagamento.' });
        
        const ped = db.prepare('INSERT INTO pedidos (numero, cliente_id, status, subtotal, taxa_entrega, total, pagamento_metodo, pagamento_id, pagamento_qrcode, pagamento_status) VALUES (?,?,?,?,?,?,?,?,?,?)').run(numero, cliente.id, 'recebido', subtotal, parseFloat(process.env.TAXA_ENTREGA_PADRAO || 8), total, req.body.metodoPagamento || 'pix', pag.payment_id, pag.copia_cola, 'pendente');
        
        for (const i of itens) {
            db.prepare('INSERT INTO itens_pedido (pedido_id, produto_nome, quantidade, preco_unitario) VALUES (?,?,?,?)').run(ped.lastInsertRowid, i.nome, i.quantidade, i.preco_promocional || i.preco);
            db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(i.quantidade, i.produto_id);
        }
        
        db.prepare('DELETE FROM carrinhos WHERE cliente_id = ?').run(cliente.id);
        
        res.json({ sucesso: true, pedidoId: ped.lastInsertRowid, numero, total, pagamento: { qr_code_base64: pag.qr_code_base64 || pag.qr_code || '', copia_cola: pag.copia_cola || '', payment_id: pag.payment_id } });
    } catch (e) {
        res.json({ sucesso: false, mensagem: 'Erro interno.' });
    }
});

// Iniciar
async function main() {
    logger.info('🛒 Iniciando...');
    await initDatabase();
    logger.info('✅ Banco pronto');
    if (process.env.BOT_TOKEN_CLIENTE) { await startClientBot(); logger.info('✅ Bot Cliente online'); }
    if (process.env.BOT_TOKEN_ADMIN) { await startAdminBot(); logger.info('✅ Bot Admin online'); }
    try { await iniciarWhatsApp(); logger.info('✅ WhatsApp conectado'); } catch (e) { logger.warn('⚠️ WhatsApp: ' + e.message); }
    app.listen(PORT, () => logger.info(`🌐 Porta ${PORT} - Pronto!`));
}

main().catch(e => { logger.error('Erro fatal: ' + e.message); process.exit(1); });
