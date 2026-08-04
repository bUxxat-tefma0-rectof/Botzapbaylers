const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class ProdutosAdmin {
    
    // Listar todos os produtos
    static async listar(pagina = 1, limite = 20) {
        const db = getDatabase();
        const offset = (pagina - 1) * limite;
        
        const produtos = db.prepare(`
            SELECT p.*, c.nome as categoria_nome, c.emoji as categoria_emoji
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            ORDER BY p.disponivel DESC, p.nome ASC
            LIMIT ? OFFSET ?
        `).all(limite, offset);
        
        const total = db.prepare('SELECT COUNT(*) as t FROM produtos').get().t;
        
        return { produtos, total, pagina, totalPaginas: Math.ceil(total / limite) };
    }
    
    // Criar produto
    static async criar(dados) {
        const db = getDatabase();
        
        const { categoria_id, nome, marca, descricao, preco, preco_promocional, preco_clube, estoque, unidade, peso, codigo_barras, sku, foto, info_nutricional, validade, destaque } = dados;
        
        if (!nome || !preco) return { sucesso: false, mensagem: 'Nome e preço são obrigatórios.' };
        
        try {
            const result = db.prepare(`INSERT INTO produtos 
                (categoria_id, nome, marca, descricao, preco, preco_promocional, preco_clube, estoque, unidade, peso, codigo_barras, sku, foto, info_nutricional, validade, destaque)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(categoria_id, nome, marca, descricao, preco, preco_promocional, preco_clube, estoque || 0, unidade || 'un', peso, codigo_barras, sku, foto, info_nutricional, validade, destaque || 0);
            
            logger.info(`📦 Produto criado: ${nome}`);
            return { sucesso: true, id: result.lastInsertRowid, mensagem: 'Produto criado!' };
        } catch (error) {
            return { sucesso: false, mensagem: 'Erro ao criar produto.' };
        }
    }
    
    // Editar produto
    static async editar(produtoId, dados) {
        const db = getDatabase();
        const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produtoId);
        if (!produto) return { sucesso: false, mensagem: 'Produto não encontrado.' };
        
        const campos = [];
        const valores = [];
        
        const permitidos = ['categoria_id', 'nome', 'marca', 'descricao', 'preco', 'preco_promocional', 'preco_clube', 'estoque', 'unidade', 'peso', 'codigo_barras', 'sku', 'foto', 'info_nutricional', 'validade', 'destaque', 'disponivel'];
        
        for (const campo of permitidos) {
            if (dados[campo] !== undefined) {
                campos.push(`${campo} = ?`);
                valores.push(dados[campo]);
            }
        }
        
        if (campos.length === 0) return { sucesso: false, mensagem: 'Nenhum dado para atualizar.' };
        
        valores.push(produtoId);
        db.prepare(`UPDATE produtos SET ${campos.join(', ')} WHERE id = ?`).run(...valores);
        
        logger.info(`✏️ Produto ${produtoId} atualizado`);
        return { sucesso: true, mensagem: 'Produto atualizado!' };
    }
    
    // Excluir produto
    static async excluir(produtoId) {
        const db = getDatabase();
        const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produtoId);
        if (!produto) return { sucesso: false, mensagem: 'Produto não encontrado.' };
        
        // Remove de favoritos e carrinhos
        db.prepare('DELETE FROM favoritos WHERE produto_id = ?').run(produtoId);
        db.prepare('DELETE FROM carrinhos WHERE produto_id = ?').run(produtoId);
        db.prepare('DELETE FROM produtos WHERE id = ?').run(produtoId);
        
        logger.info(`🗑 Produto excluído: ${produto.nome}`);
        return { sucesso: true, mensagem: 'Produto excluído!' };
    }
    
    // Atualizar estoque
    static async atualizarEstoque(produtoId, quantidade) {
        const db = getDatabase();
        db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(quantidade, produtoId);
        return { sucesso: true, mensagem: 'Estoque atualizado!' };
    }
    
    // Produtos com estoque baixo
    static async getEstoqueBaixo(limite = 10) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM produtos WHERE estoque < ? AND disponivel = 1 ORDER BY estoque ASC').all(limite);
    }
}

module.exports = ProdutosAdmin;
