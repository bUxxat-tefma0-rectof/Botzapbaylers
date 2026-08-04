// ============ API DO WEBAPP ============

// Categorias
app.get('/api/categorias', (req, res) => {
    const db = getDatabase();
    const cats = db.prepare('SELECT * FROM categorias WHERE ativo = 1 ORDER BY ordem').all();
    res.json(cats);
});

// Produtos
app.get('/api/produtos', (req, res) => {
    const db = getDatabase();
    const { categoria_id, q, limite } = req.query;
    let produtos;
    
    if (q) {
        produtos = db.prepare('SELECT * FROM produtos WHERE disponivel = 1 AND estoque > 0 AND nome LIKE ? LIMIT ?').all(`%${q}%`, parseInt(limite) || 50);
    } else if (categoria_id) {
        produtos = db.prepare('SELECT * FROM produtos WHERE categoria_id = ? AND disponivel = 1 AND estoque > 0 LIMIT ?').all(categoria_id, parseInt(limite) || 50);
    } else {
        produtos = db.prepare('SELECT * FROM produtos WHERE disponivel = 1 AND estoque > 0 ORDER BY destaque DESC LIMIT 50').all();
    }
    
    res.json({ produtos });
});

// Produto por ID
app.get('/api/produtos/:id', (req, res) => {
    const db = getDatabase();
    const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
    res.json(p || { error: 'Não encontrado' });
});

// Carrinho
app.get('/api/carrinho', (req, res) => {
    const db = getDatabase();
    const { userId } = req.query;
    const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    if (!cliente) return res.json({ itens: [] });
    
    const itens = db.prepare('SELECT c.*, p.nome, p.preco, p.preco_promocional, p.foto FROM carrinhos c JOIN produtos p ON c.produto_id = p.id WHERE c.cliente_id = ?').all(cliente.id);
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
    res.json({ sucesso: true });
});

app.post('/api/carrinho/remover', (req, res) => {
    const db = getDatabase();
    db.prepare('DELETE FROM carrinhos WHERE id = ?').run(req.body.carrinhoId);
    res.json({ sucesso: true });
});

// Página do WebApp
app.get('/loja', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'loja.html'));
});
