const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class LojaService {
    
    // Buscar categorias
    static async getCategorias() {
        const db = getDatabase();
        return db.prepare('SELECT * FROM categorias WHERE ativo = 1 ORDER BY ordem').all();
    }
    
    // Buscar produtos por categoria
    static async getProdutosPorCategoria(categoriaId, pagina = 1, limite = 10) {
        const db = getDatabase();
        const offset = (pagina - 1) * limite;
        
        const produtos = db.prepare(`
            SELECT * FROM produtos 
            WHERE categoria_id = ? AND disponivel = 1 AND estoque > 0
            ORDER BY destaque DESC, ordem ASC
            LIMIT ? OFFSET ?
        `).all(categoriaId, limite, offset);
        
        const total = db.prepare('SELECT COUNT(*) as t FROM produtos WHERE categoria_id = ? AND disponivel = 1 AND estoque > 0').get(categoriaId).t;
        
        return {
            produtos,
            pagina,
            totalPaginas: Math.ceil(total / limite),
            total
        };
    }
    
    // Buscar produto por ID
    static async getProduto(produtoId) {
        const db = getDatabase();
        const produto = db.prepare(`
            SELECT p.*, c.nome as categoria_nome, c.emoji as categoria_emoji
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.id = ?
        `).get(produtoId);
        
        if (!produto) return null;
        
        // Busca produtos relacionados (mesma categoria)
        const relacionados = db.prepare(`
            SELECT * FROM produtos 
            WHERE categoria_id = ? AND id != ? AND disponivel = 1 AND estoque > 0
            ORDER BY RANDOM() LIMIT 5
        `).all(produto.categoria_id, produtoId);
        
        return { ...produto, relacionados };
    }
    
    // Pesquisar produtos
    static async pesquisarProdutos(termo, pagina = 1, limite = 20) {
        const db = getDatabase();
        const offset = (pagina - 1) * limite;
        const busca = `%${termo}%`;
        
        const produtos = db.prepare(`
            SELECT p.*, c.nome as categoria_nome, c.emoji as categoria_emoji
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.disponivel = 1 AND p.estoque > 0 
            AND (p.nome LIKE ? OR p.marca LIKE ? OR p.descricao LIKE ? OR p.codigo_barras LIKE ? OR p.sku LIKE ?)
            ORDER BY p.destaque DESC
            LIMIT ? OFFSET ?
        `).all(busca, busca, busca, busca, busca, limite, offset);
        
        const total = db.prepare(`
            SELECT COUNT(*) as t FROM produtos 
            WHERE disponivel = 1 AND estoque > 0 
            AND (nome LIKE ? OR marca LIKE ? OR descricao LIKE ? OR codigo_barras LIKE ? OR sku LIKE ?)
        `).get(busca, busca, busca, busca, busca).t;
        
        return {
            produtos,
            pagina,
            totalPaginas: Math.ceil(total / limite),
            total,
            termo
        };
    }
    
    // Produtos em destaque (promoções)
    static async getDestaques() {
        const db = getDatabase();
        return db.prepare(`
            SELECT * FROM produtos 
            WHERE disponivel = 1 AND estoque > 0 AND (destaque = 1 OR preco_promocional IS NOT NULL)
            ORDER BY RANDOM() LIMIT 10
        `).all();
    }
    
    // Produtos em alta (mais vendidos)
    static async getMaisVendidos(limite = 10) {
        const db = getDatabase();
        return db.prepare(`
            SELECT p.*, COUNT(ip.id) as total_vendas
            FROM produtos p
            LEFT JOIN itens_pedido ip ON ip.produto_nome = p.nome
            WHERE p.disponivel = 1 AND p.estoque > 0
            GROUP BY p.id
            ORDER BY total_vendas DESC
            LIMIT ?
        `).all(limite);
    }
    
    // Filtrar por preço
    static async filtrarPorPreco(categoriaId, ordem = 'ASC') {
        const db = getDatabase();
        const direcao = ordem === 'DESC' ? 'DESC' : 'ASC';
        
        return db.prepare(`
            SELECT * FROM produtos 
            WHERE categoria_id = ? AND disponivel = 1 AND estoque > 0
            ORDER BY 
                CASE WHEN preco_promocional IS NOT NULL THEN preco_promocional ELSE preco END ${direcao}
            LIMIT 50
        `).all(categoriaId);
    }
    
    // Filtrar por marca
    static async filtrarPorMarca(marca) {
        const db = getDatabase();
        return db.prepare(`
            SELECT * FROM produtos 
            WHERE marca LIKE ? AND disponivel = 1 AND estoque > 0
            ORDER BY nome
            LIMIT 50
        `).all(`%${marca}%`);
    }
    
    // Listar marcas disponíveis
    static async getMarcas() {
        const db = getDatabase();
        return db.prepare(`
            SELECT DISTINCT marca FROM produtos 
            WHERE marca IS NOT NULL AND marca != '' AND disponivel = 1
            ORDER BY marca
        `).all();
    }
}

module.exports = LojaService;
