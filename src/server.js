// Adicionar DEPOIS das rotas existentes:

// ============ API DO WEBAPP ============

// Produtos com ofertas
app.get('/api/produtos/ofertas', (req, res) => {
    const db = getDatabase();
    const prods = db.prepare('SELECT * FROM produtos WHERE disponivel = 1 AND estoque > 0 AND preco_promocional IS NOT NULL ORDER BY ((preco - preco_promocional) / preco * 100) DESC LIMIT 30').all();
    res.json({ produtos: prods });
});

// Pesquisa de produtos
app.get('/api/produtos/pesquisar', (req, res) => {
    const db = getDatabase();
    const { q } = req.query;
    if (!q) return res.json({ produtos: [] });
    const prods = db.prepare('SELECT * FROM produtos WHERE disponivel = 1 AND estoque > 0 AND (nome LIKE ? OR marca LIKE ? OR descricao LIKE ?) LIMIT 30').all(`%${q}%`, `%${q}%`, `%${q}%`);
    res.json({ produtos: prods });
});

// Carrinho - update quantidade
app.post('/api/carrinho/update', (req, res) => {
    const db = getDatabase();
    const { carrinhoId, quantidade } = req.body;
    if (quantidade > 0) {
        db.prepare('UPDATE carrinhos SET quantidade = ? WHERE id = ?').run(quantidade, carrinhoId);
    } else {
        db.prepare('DELETE FROM carrinhos WHERE id = ?').run(carrinhoId);
    }
    res.json({ sucesso: true });
});

// Perfil
app.get('/api/perfil', (req, res) => {
    const db = getDatabase();
    const { userId } = req.query;
    const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
    if (!cliente) return res.json({});
    const totalPedidos = db.prepare('SELECT COUNT(*) as t FROM pedidos WHERE cliente_id = ?').get(cliente.id).t;
    res.json({ ...cliente, totalPedidos });
});

// Pedidos do cliente
app.get('/api/pedidos', (req, res) => {
    const db = getDatabase();
    const { userId } = req.query;
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    if (!cliente) return res.json({ pedidos: [] });
    const pedidos = db.prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY data_pedido DESC LIMIT 20').all(cliente.id);
    res.json({ pedidos });
});

// Detalhes do pedido
app.get('/api/pedidos/:id', (req, res) => {
    const db = getDatabase();
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
    if (!pedido) return res.json({});
    const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(req.params.id);
    res.json({ ...pedido, itens });
});

// Finalizar pedido (WebApp)
app.post('/api/pedidos/finalizar', async (req, res) => {
    const db = getDatabase();
    const { userId, metodoPagamento, tipoEntrega } = req.body;
    
    const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
    if (!cliente) return res.json({ sucesso: false, mensagem: 'Cliente não encontrado.' });
    
    const itensCarrinho = db.prepare('SELECT c.*, p.nome, p.preco, p.preco_promocional FROM carrinhos c JOIN produtos p ON c.produto_id = p.id WHERE c.cliente_id = ?').all(cliente.id);
    if (itensCarrinho.length === 0) return res.json({ sucesso: false, mensagem: 'Carrinho vazio.' });
    
    let total = 0;
    for (const item of itensCarrinho) {
        const preco = item.preco_promocional || item.preco;
        total += preco * item.quantidade;
    }
    
    const numeroPedido = require('./utils/helpers').gerarNumeroPedido();
    let pagamentoResult = { sucesso: true, payment_id: `manual_${Date.now()}` };
    
    if (metodoPagamento === 'pix') {
        const pagamentoService = require('./services/pagamento');
        const desc = itensCarrinho.map(i => `${i.quantidade}x ${i.nome}`).join(', ').substring(0, 100);
        pagamentoResult = await pagamentoService.gerarPix(total, desc, numeroPedido);
    }
    
    if (!pagamentoResult.sucesso) return res.json({ sucesso: false, mensagem: 'Erro ao gerar pagamento.' });
    
    try {
        const pedido = db.prepare('INSERT INTO pedidos (numero, cliente_id, tipo_entrega, status, subtotal, total, pagamento_metodo, pagamento_id, pagamento_qrcode, pagamento_status) VALUES (?,?,?,?,?,?,?,?,?,?)').run(numeroPedido, cliente.id, tipoEntrega || 'entrega', 'recebido', total, total, metodoPagamento, pagamentoResult.payment_id, pagamentoResult.copia_cola || null, 'pendente');
        
        for (const item of itensCarrinho) {
            const preco = item.preco_promocional || item.preco;
            db.prepare('INSERT INTO itens_pedido (pedido_id, produto_nome, quantidade, preco_unitario) VALUES (?,?,?,?)').run(pedido.lastInsertRowid, item.nome, item.quantidade, preco);
            db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(item.quantidade, item.produto_id);
        }
        
        db.prepare('DELETE FROM carrinhos WHERE cliente_id = ?').run(cliente.id);
        
        res.json({ sucesso: true, pedidoId: pedido.lastInsertRowid, numero: numeroPedido, total, pagamento: pagamentoResult });
    } catch (e) {
        res.json({ sucesso: false, mensagem: 'Erro ao salvar pedido.' });
    }
});

// Página do WebApp
app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
