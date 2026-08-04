const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class LojaService {
    
    // ============ CATEGORIAS ============
    static async getCategorias() {
        const db = getDatabase();
        return db.prepare('SELECT * FROM categorias WHERE ativo = 1 ORDER BY ordem').all();
    }
    
    static async getCategoriaPorId(categoriaId) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM categorias WHERE id = ? AND ativo = 1').get(categoriaId);
    }
    
    // ============ PRODUTOS ============
    static async getProdutosPorCategoria(categoriaId, pagina = 1, limite = 20) {
        const db = getDatabase();
        const offset = (pagina - 1) * limite;
        
        const produtos = db.prepare(`
            SELECT p.*, 
                   CASE WHEN p.preco_promocional IS NOT NULL THEN 1 ELSE 0 END as em_promocao,
                   ROUND((p.preco - COALESCE(p.preco_promocional, p.preco)) / p.preco * 100) as desconto_percentual
            FROM produtos p
            WHERE p.categoria_id = ? AND p.disponivel = 1 AND p.estoque > 0
            ORDER BY p.destaque DESC, p.nome ASC
            LIMIT ? OFFSET ?
        `).all(categoriaId, limite, offset);
        
        const total = db.prepare('SELECT COUNT(*) as t FROM produtos WHERE categoria_id = ? AND disponivel = 1 AND estoque > 0').get(categoriaId).t;
        
        return { produtos, total, pagina, totalPaginas: Math.ceil(total / limite) };
    }
    
    static async getProduto(produtoId) {
        const db = getDatabase();
        const produto = db.prepare(`
            SELECT p.*, c.nome as categoria_nome, c.emoji as categoria_emoji
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.id = ?
        `).get(produtoId);
        
        if (!produto) return null;
        
        const relacionados = db.prepare(`
            SELECT * FROM produtos 
            WHERE categoria_id = ? AND id != ? AND disponivel = 1 AND estoque > 0
            ORDER BY RANDOM() LIMIT 8
        `).all(produto.categoria_id, produtoId);
        
        const tambemCompraram = db.prepare(`
            SELECT p.*, COUNT(ip2.id) as vezes_comprado
            FROM itens_pedido ip1
            JOIN pedidos ped1 ON ip1.pedido_id = ped1.id
            JOIN pedidos ped2 ON ped1.cliente_id = ped2.cliente_id AND ped1.id != ped2.id
            JOIN itens_pedido ip2 ON ped2.id = ip2.pedido_id
            JOIN produtos p ON ip2.produto_nome = p.nome
            WHERE ip1.produto_nome = ? AND p.id != ? AND p.disponivel = 1
            GROUP BY p.id
            ORDER BY vezes_comprado DESC
            LIMIT 5
        `).all(produto.nome, produtoId);
        
        return { ...produto, relacionados, tambemCompraram };
    }
    
    // ============ PESQUISA AVANÇADA ============
    static async pesquisarProdutos(termo, pagina = 1, limite = 30, filtros = {}) {
        const db = getDatabase();
        const offset = (pagina - 1) * limite;
        const busca = `%${termo}%`;
        
        let whereExtra = '';
        const params = [];
        
        // Filtro por categoria
        if (filtros.categoriaId) {
            whereExtra += ' AND p.categoria_id = ?';
            params.push(parseInt(filtros.categoriaId));
        }
        
        // Filtro por marca
        if (filtros.marca) {
            whereExtra += ' AND p.marca LIKE ?';
            params.push(`%${filtros.marca}%`);
        }
        
        // Filtro por preço mínimo
        if (filtros.precoMin) {
            whereExtra += ' AND COALESCE(p.preco_promocional, p.preco) >= ?';
            params.push(parseFloat(filtros.precoMin));
        }
        
        // Filtro por preço máximo
        if (filtros.precoMax) {
            whereExtra += ' AND COALESCE(p.preco_promocional, p.preco) <= ?';
            params.push(parseFloat(filtros.precoMax));
        }
        
        // Filtro apenas promoções
        if (filtros.apenasPromocoes) {
            whereExtra += ' AND p.preco_promocional IS NOT NULL';
        }
        
        // Filtro por código de barras
        if (filtros.codigoBarras) {
            whereExtra += ' AND p.codigo_barras = ?';
            params.push(filtros.codigoBarras);
        }
        
        // Filtro por SKU
        if (filtros.sku) {
            whereExtra += ' AND p.sku = ?';
            params.push(filtros.sku);
        }
        
        // Filtro por unidade (kg, un, litro, etc)
        if (filtros.unidade) {
            whereExtra += ' AND p.unidade = ?';
            params.push(filtros.unidade);
        }
        
        // Filtro por destaque
        if (filtros.apenasDestaques) {
            whereExtra += ' AND p.destaque = 1';
        }
        
        // Ordenação
        let orderBy = 'ORDER BY p.destaque DESC, p.nome ASC';
        switch (filtros.ordenarPor) {
            case 'menor_preco':
                orderBy = 'ORDER BY COALESCE(p.preco_promocional, p.preco) ASC';
                break;
            case 'maior_preco':
                orderBy = 'ORDER BY COALESCE(p.preco_promocional, p.preco) DESC';
                break;
            case 'nome_az':
                orderBy = 'ORDER BY p.nome ASC';
                break;
            case 'nome_za':
                orderBy = 'ORDER BY p.nome DESC';
                break;
            case 'mais_vendidos':
                orderBy = 'ORDER BY (SELECT COUNT(*) FROM itens_pedido WHERE produto_nome = p.nome) DESC';
                break;
            case 'maior_desconto':
                orderBy = 'ORDER BY ((p.preco - COALESCE(p.preco_promocional, p.preco)) / p.preco) DESC';
                break;
            case 'lancamentos':
                orderBy = 'ORDER BY p.data_cadastro DESC';
                break;
        }
        
        const produtos = db.prepare(`
            SELECT p.*, c.nome as categoria_nome, c.emoji as categoria_emoji
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.disponivel = 1 AND p.estoque > 0 
            AND (p.nome LIKE ? OR p.marca LIKE ? OR p.descricao LIKE ? OR p.codigo_barras LIKE ? OR p.sku LIKE ?)
            ${whereExtra}
            ${orderBy}
            LIMIT ? OFFSET ?
        `).all(busca, busca, busca, busca, busca, ...params, limite, offset);
        
        const totalParams = [busca, busca, busca, busca, busca, ...params];
        const total = db.prepare(`
            SELECT COUNT(*) as t FROM produtos p
            WHERE p.disponivel = 1 AND p.estoque > 0 
            AND (p.nome LIKE ? OR p.marca LIKE ? OR p.descricao LIKE ? OR p.codigo_barras LIKE ? OR p.sku LIKE ?)
            ${whereExtra}
        `).get(...totalParams).t;
        
        // Sugestões de busca
        let sugestoes = [];
        if (produtos.length === 0 && termo.length >= 3) {
            sugestoes = db.prepare(`
                SELECT DISTINCT nome FROM produtos 
                WHERE disponivel = 1 AND nome LIKE ? 
                LIMIT 5
            `).all(`%${termo.substring(0, Math.floor(termo.length/2))}%`).map(r => r.nome);
        }
        
        return {
            produtos,
            total,
            pagina,
            totalPaginas: Math.ceil(total / limite),
            termo,
            sugestoes,
            filtrosAplicados: filtros
        };
    }
    
    // ============ MARCAS DISPONÍVEIS ============
    static async getMarcas() {
        const db = getDatabase();
        return db.prepare(`
            SELECT DISTINCT marca FROM produtos 
            WHERE marca IS NOT NULL AND marca != '' AND disponivel = 1
            ORDER BY marca
        `).all();
    }
    
    // ============ FAIXAS DE PREÇO ============
    static async getFaixasPreco() {
        const db = getDatabase();
        const min = db.prepare('SELECT MIN(COALESCE(preco_promocional, preco)) as v FROM produtos WHERE disponivel = 1').get().v || 0;
        const max = db.prepare('SELECT MAX(COALESCE(preco_promocional, preco)) as v FROM produtos WHERE disponivel = 1').get().v || 1000;
        
        const faixas = [];
        const step = Math.ceil((max - min) / 5);
        for (let i = 0; i < 5; i++) {
            faixas.push({
                min: min + (i * step),
                max: min + ((i + 1) * step),
                label: `${formatarMoeda(min + (i * step))} - ${formatarMoeda(min + ((i + 1) * step))}`
            });
        }
        
        return faixas;
    }
    
    // ============ PRODUTOS EM DESTAQUE ============
    static async getDestaques(limite = 15) {
        const db = getDatabase();
        return db.prepare(`
            SELECT * FROM produtos 
            WHERE disponivel = 1 AND estoque > 0 
            AND (destaque = 1 OR preco_promocional IS NOT NULL)
            ORDER BY RANDOM() LIMIT ?
        `).all(limite);
    }
    
    // ============ MAIS VENDIDOS ============
    static async getMaisVendidos(limite = 20) {
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
    
    // ============ OFERTAS DO DIA ============
    static async getOfertasDoDia(limite = 20) {
        const db = getDatabase();
        return db.prepare(`
            SELECT * FROM produtos 
            WHERE disponivel = 1 AND estoque > 0 AND preco_promocional IS NOT NULL
            ORDER BY ((preco - preco_promocional) / preco * 100) DESC
            LIMIT ?
        `).all(limite);
    }
    
    // ============ SUGESTÕES PERSONALIZADAS ============
    static async getSugestoesPersonalizadas(clienteId, limite = 10) {
        const db = getDatabase();
        
        const categoriasCompradas = db.prepare(`
            SELECT DISTINCT p.categoria_id
            FROM itens_pedido ip
            JOIN pedidos ped ON ip.pedido_id = ped.id
            JOIN produtos p ON ip.produto_nome = p.nome
            WHERE ped.cliente_id = ?
            LIMIT 5
        `).all(clienteId);
        
        if (categoriasCompradas.length === 0) {
            return await this.getMaisVendidos(limite);
        }
        
        const catIds = categoriasCompradas.map(c => c.categoria_id);
        const placeholders = catIds.map(() => '?').join(',');
        
        return db.prepare(`
            SELECT * FROM produtos 
            WHERE categoria_id IN (${placeholders}) AND disponivel = 1 AND estoque > 0
            ORDER BY RANDOM()
            LIMIT ?
        `).all(...catIds, limite);
    }
    
    // ============ COMPARTILHAR PRODUTO ============
    static async getLinkCompartilhamento(produtoId) {
        const db = getDatabase();
        const produto = db.prepare('SELECT nome, preco, preco_promocional FROM produtos WHERE id = ?').get(produtoId);
        if (!produto) return null;
        
        const preco = produto.preco_promocional || produto.preco;
        return {
            texto: `🛒 ${produto.nome} - ${formatarMoeda(preco)}\n\nCompre no ${process.env.NOME_MERCADO || 'Supermercado'}!`,
            url: `https://t.me/seubot?start=produto_${produtoId}`
        };
    }
    
    // ============ BUSCAR POR CÓDIGO DE BARRAS ============
    static async buscarPorCodigoBarras(codigo) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM produtos WHERE codigo_barras = ? AND disponivel = 1').get(codigo);
    }
    
    // ============ HISTÓRICO DE PREÇOS ============
    static async getHistoricoPrecos(produtoId) {
        const db = getDatabase();
        return db.prepare(`
            SELECT ip.preco_unitario, p.data_pedido
            FROM itens_pedido ip
            JOIN pedidos p ON ip.pedido_id = p.id
            WHERE ip.produto_nome = (SELECT nome FROM produtos WHERE id = ?)
            ORDER BY p.data_pedido DESC
            LIMIT 10
        `).all(produtoId);
    }
}

module.exports = LojaService;
