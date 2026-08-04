const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class ProdutosAdmin {
    
    static async listar(pagina = 1, limite = 20, filtro = {}) {
        const db = getDatabase();
        const offset = (pagina - 1) * limite;
        
        let where = 'WHERE 1=1';
        const params = [];
        
        if (filtro.categoria_id) { where += ' AND p.categoria_id = ?'; params.push(filtro.categoria_id); }
        if (filtro.disponivel !== undefined) { where += ' AND p.disponivel = ?'; params.push(filtro.disponivel); }
        if (filtro.estoque_baixo) { where += ' AND p.estoque <= 10 AND p.estoque > 0'; }
        if (filtro.sem_estoque) { where += ' AND p.estoque <= 0'; }
        if (filtro.busca) { where += ' AND (p.nome LIKE ? OR p.marca LIKE ? OR p.codigo_barras LIKE ?)'; params.push(`%${filtro.busca}%`, `%${filtro.busca}%`, `%${filtro.busca}%`); }
        
        const produtos = db.prepare(`
            SELECT p.*, c.nome as categoria_nome, c.emoji as categoria_emoji
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            ${where}
            ORDER BY p.disponivel DESC, p.nome ASC
            LIMIT ? OFFSET ?
        `).all(...params, limite, offset);
        
        const total = db.prepare(`SELECT COUNT(*) as t FROM produtos p ${where}`).get(...params).t;
        
        return { produtos, total, pagina, totalPaginas: Math.ceil(total / limite) };
    }
    
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
    
    static async editar(produtoId, dados) {
        const db = getDatabase();
        const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produtoId);
        if (!produto) return { sucesso: false, mensagem: 'Produto não encontrado.' };
        
        const campos = [];
        const valores = [];
        const permitidos = ['categoria_id', 'nome', 'marca', 'descricao', 'preco', 'preco_promocional', 'preco_clube', 'estoque', 'unidade', 'peso', 'codigo_barras', 'sku', 'foto', 'info_nutricional', 'validade', 'destaque', 'disponivel', 'ordem'];
        
        for (const campo of permitidos) {
            if (dados[campo] !== undefined) {
                campos.push(`${campo} = ?`);
                valores.push(dados[campo]);
            }
        }
        
        if (campos.length === 0) return { sucesso: false, mensagem: 'Nenhum dado para atualizar.' };
        
        valores.push(produtoId);
        db.prepare(`UPDATE produtos SET ${campos.join(', ')} WHERE id = ?`).run(...valores);
        
        return { sucesso: true, mensagem: 'Produto atualizado!' };
    }
    
    static async excluir(produtoId) {
        const db = getDatabase();
        db.prepare('DELETE FROM favoritos WHERE produto_id = ?').run(produtoId);
        db.prepare('DELETE FROM carrinhos WHERE produto_id = ?').run(produtoId);
        db.prepare('DELETE FROM produtos WHERE id = ?').run(produtoId);
        return { sucesso: true, mensagem: 'Produto excluído!' };
    }
    
    static async atualizarEstoque(produtoId, quantidade) {
        const db = getDatabase();
        db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(quantidade, produtoId);
        return { sucesso: true, mensagem: 'Estoque atualizado!' };
    }
    
    static async getEstoqueBaixo(limite = 20) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM produtos WHERE estoque <= 10 AND disponivel = 1 ORDER BY estoque ASC LIMIT ?').all(limite);
    }
}

module.exports = ProdutosAdmin;
