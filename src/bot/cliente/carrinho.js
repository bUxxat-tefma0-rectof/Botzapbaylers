const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class CarrinhoService {
    
    // Adicionar produto ao carrinho
    static async adicionar(userId, produtoId, quantidade = 1, comentario = '') {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        const produto = db.prepare('SELECT * FROM produtos WHERE id = ? AND disponivel = 1').get(produtoId);
        if (!produto) return { sucesso: false, mensagem: 'Produto indisponível.' };
        if (produto.estoque < quantidade) return { sucesso: false, mensagem: `Estoque insuficiente. Disponível: ${produto.estoque}` };
        
        // Verifica se já existe no carrinho
        const existe = db.prepare('SELECT * FROM carrinhos WHERE cliente_id = ? AND produto_id = ?').get(cliente.id, produtoId);
        
        if (existe) {
            db.prepare('UPDATE carrinhos SET quantidade = quantidade + ?, comentario = ? WHERE id = ?').run(quantidade, comentario || existe.comentario, existe.id);
        } else {
            db.prepare('INSERT INTO carrinhos (cliente_id, produto_id, quantidade, comentario) VALUES (?, ?, ?, ?)').run(cliente.id, produtoId, quantidade, comentario);
        }
        
        logger.info(`🛒 Produto ${produtoId} adicionado ao carrinho de ${cliente.id}`);
        return { sucesso: true, mensagem: `${produto.nome} adicionado ao carrinho!` };
    }
    
    // Remover produto do carrinho
    static async remover(userId, carrinhoId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false };
        
        db.prepare('DELETE FROM carrinhos WHERE id = ? AND cliente_id = ?').run(carrinhoId, cliente.id);
        return { sucesso: true };
    }
    
    // Atualizar quantidade
    static async atualizarQuantidade(userId, carrinhoId, quantidade) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false };
        
        if (quantidade <= 0) {
            return await this.remover(userId, carrinhoId);
        }
        
        const item = db.prepare('SELECT c.*, p.estoque, p.nome FROM carrinhos c JOIN produtos p ON c.produto_id = p.id WHERE c.id = ? AND c.cliente_id = ?').get(carrinhoId, cliente.id);
        if (!item) return { sucesso: false };
        if (quantidade > item.estoque) return { sucesso: false, mensagem: `Estoque máximo: ${item.estoque}` };
        
        db.prepare('UPDATE carrinhos SET quantidade = ? WHERE id = ?').run(quantidade, carrinhoId);
        return { sucesso: true };
    }
    
    // Adicionar comentário ao item
    static async adicionarComentario(userId, carrinhoId, comentario) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false };
        
        db.prepare('UPDATE carrinhos SET comentario = ? WHERE id = ? AND cliente_id = ?').run(comentario, carrinhoId, cliente.id);
        return { sucesso: true, mensagem: 'Comentário salvo!' };
    }
    
    // Listar itens do carrinho
    static async listar(userId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { itens: [], total: 0, quantidade: 0 };
        
        const itens = db.prepare(`
            SELECT c.*, p.nome, p.marca, p.preco, p.preco_promocional, p.foto, p.unidade, p.estoque
            FROM carrinhos c
            JOIN produtos p ON c.produto_id = p.id
            WHERE c.cliente_id = ?
        `).all(cliente.id);
        
        let total = 0;
        let quantidadeTotal = 0;
        
        for (const item of itens) {
            const preco = item.preco_promocional || item.preco;
            total += preco * item.quantidade;
            quantidadeTotal += item.quantidade;
        }
        
        return { itens, total, quantidade: quantidadeTotal };
    }
    
    // Limpar carrinho
    static async limpar(userId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false };
        
        db.prepare('DELETE FROM carrinhos WHERE cliente_id = ?').run(cliente.id);
        return { sucesso: true, mensagem: 'Carrinho limpo!' };
    }
    
    // Calcular total com entrega
    static async calcularTotal(userId, enderecoId = null) {
        const { total } = await this.listar(userId);
        const taxaEntrega = parseFloat(process.env.TAXA_ENTREGA_PADRAO || 5);
        
        return {
            subtotal: total,
            taxaEntrega: total >= parseFloat(process.env.PEDIDO_MINIMO || 30) ? taxaEntrega : taxaEntrega + 5,
            total: total + taxaEntrega,
            pedidoMinimo: parseFloat(process.env.PEDIDO_MINIMO || 30)
        };
    }
}

module.exports = CarrinhoService;
