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

// ============ ROTAS WEB ============
app.get('/', (req, res) => {
    res.json({ status: 'online', sistema: '🛒 Supermercado Telegram' });
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ============ QR CODE (COM BOTÃO MANUAL) ============
app.get('/qr', (req, res) => {
    const qr = getQR();
    const status = getStatus();
    
    if (status === 'conectado') {
        return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f2f5;margin:0}.box{background:white;padding:40px;border-radius:20px;text-align:center}h2{color:#25D366}</style></head><body><div class="box"><h2>✅ WhatsApp Conectado!</h2><p>Pronto para enviar códigos.</p></div></body></html>`);
    }
    
    if (!qr) {
        return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f2f5;margin:0}.box{background:white;padding:40px;border-radius:20px;text-align:center}.loader{width:50px;height:50px;border:5px solid #f3f3f3;border-top:5px solid #25D366;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style></head><body><div class="box"><h2>⏳ Gerando QR Code...</h2><div class="loader"></div></div></body></html>`);
    }
    
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f0f2f5;padding:20px;margin:0}.box{background:white;padding:30px;border-radius:20px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.1);max-width:400px;width:100%}h2{color:#25D366;margin-bottom:5px;font-size:22px}.sub{color:#666;margin-bottom:20px;font-size:14px}.qrcode{border:3px solid #25D366;border-radius:15px;padding:15px;width:280px;height:280px;max-width:80vw;max-height:80vw}.inst{background:#fff9e6;padding:15px;border-radius:10px;margin-top:20px;text-align:left;font-size:13px}.inst strong{color:#856404}.inst ol{margin:8px 0 0 20px;color:#856404}.inst li{margin:5px 0}.btn{display:inline-block;margin-top:15px;padding:12px 25px;background:#25D366;color:white;border:none;border-radius:25px;font-size:16px;cursor:pointer;font-weight:bold}</style></head><body><div class="box"><h2>📱 WhatsApp</h2><p class="sub">Escaneie o QR Code</p><img src="${qrUrl}" class="qrcode" alt="QR Code"><div class="inst"><strong>📋 Como escanear:</strong><ol><li>Abra o WhatsApp</li><li>Aparelhos Conectados</li><li>Escanear QR Code</li></ol></div><button class="btn" onclick="location.reload()">🔄 Atualizar QR Code</button></div></body></html>`);
});

// ============ API CATEGORIAS ============
app.get('/api/categorias', (req, res) => {
    const db = getDatabase();
    res.json(db.prepare('SELECT * FROM categorias WHERE ativo = 1 ORDER BY ordem').all());
});

// ============ API PRODUTOS ============
app.get('/api/produtos', (req, res) => {
    const db = getDatabase();
    const { categoria_id } = req.query;
    const prods = categoria_id 
        ? db.prepare('SELECT * FROM produtos WHERE categoria_id = ? AND disponivel = 1 AND estoque > 0 ORDER BY destaque DESC LIMIT 50').all(categoria_id)
        : db.prepare('SELECT * FROM produtos WHERE disponivel = 1 AND estoque > 0 ORDER BY destaque DESC LIMIT 50').all();
    res.json({ produtos: prods });
});

app.get('/api/produtos/ofertas', (req, res) => {
    const db = getDatabase();
    res.json({ produtos: db.prepare('SELECT * FROM produtos WHERE disponivel = 1 AND estoque > 0 AND preco_promocional IS NOT NULL ORDER BY ((preco - preco_promocional) / preco * 100) DESC LIMIT 30').all() });
});

app.get('/api/produtos/pesquisar', (req, res) => {
    const db = getDatabase();
    const { q } = req.query;
    if (!q) return res.json({ produtos: [] });
    res.json({ produtos: db.prepare('SELECT * FROM produtos WHERE disponivel = 1 AND estoque > 0 AND (nome LIKE ? OR marca LIKE ? OR descricao LIKE ?) LIMIT 30').all(`%${q}%`, `%${q}%`, `%${q}%`) });
});

// ============ API CARRINHO ============
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

// ============ API PERFIL ============
app.get('/api/perfil', (req, res) => {
    const db = getDatabase();
    const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(req.query.userId);
    if (!cliente) return res.json({});
    const peds = db.prepare('SELECT COUNT(*) as t FROM pedidos WHERE cliente_id = ?').get(cliente.id).t;
    res.json({ ...cliente, totalPedidos: peds });
});

// ============ API PEDIDOS ============
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
        if (!cliente) return res.json({ sucesso: false, mensagem: 'Cliente não encontrado.' });
        
        const itens = db.prepare('SELECT c.*, p.nome, p.preco, p.preco_promocional, p.estoque FROM carrinhos c JOIN produtos p ON c.produto_id = p.id WHERE c.cliente_id = ?').all(cliente.id);
        if (itens.length === 0) return res.json({ sucesso: false, mensagem: 'Carrinho vazio.' });
        
        let subtotal = 0;
        for (const i of itens) subtotal += (i.preco_promocional || i.preco) * i.quantidade;
        
        const taxa = parseFloat(process.env.TAXA_ENTREGA_PADRAO || 8);
        const total = subtotal + taxa;
        const numero = gerarNumeroPedido();
        
        let pag = { sucesso: true, payment_id: `manual_${Date.now()}`, copia_cola: '', qr_code_base64: '' };
        
        if (req.body.metodoPagamento === 'pix') {
            const serv = require('./services/pagamento');
            pag = await serv.gerarPix(total, itens.map(i => i.nome).join(', ').substring(0, 100), numero);
        }
        
        if (!pag.sucesso) return res.json({ sucesso: false, mensagem: 'Erro ao gerar pagamento.' });
        
        const ped = db.prepare('INSERT INTO pedidos (numero, cliente_id, status, subtotal, taxa_entrega, total, pagamento_metodo, pagamento_id, pagamento_qrcode, pagamento_status) VALUES (?,?,?,?,?,?,?,?,?,?)').run(numero, cliente.id, 'recebido', subtotal, taxa, total, req.body.metodoPagamento || 'pix', pag.payment_id, pag.copia_cola, 'pendente');
        
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

// ============ INICIAR ============
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
