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
                   CASE WHEN p.preco_promocional IS NOT NULL THEN 1 ELSE 0 END as em_promocao
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
        
        // Produtos relacionados (mesma categoria)
        const relacionados = db.prepare(`
            SELECT * FROM produtos 
            WHERE categoria_id = ? AND id != ? AND disponivel = 1 AND estoque > 0
            ORDER BY RANDOM() LIMIT 8
        `).all(produto.categoria_id, produtoId);
        
        // Produtos que clientes também compraram
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
    
    // ============ PESQUISA ============
    static async pesquisarProdutos(termo, pagina = 1, limite = 30, filtros = {}) {
        const db = getDatabase();
        const offset = (pagina - 1) * limite;
        const busca = `%${termo}%`;
        
        let whereExtra = '';
        const params = [];
        
        // Filtro por categoria
        if (filtros.categoriaId) {
            whereExtra += ' AND p.categoria_id = ?';
            params.push(filtros.categoriaId);
        }
        
        // Filtro por marca
        if (filtros.marca) {
            whereExtra += ' AND p.marca LIKE ?';
            params.push(`%${filtros.marca}%`);
        }
        
        // Filtro por preço mínimo
        if (filtros.precoMin) {
            whereExtra += ' AND (CASE WHEN p.preco_promocional IS NOT NULL THEN p.preco_promocional ELSE p.preco END) >= ?';
            params.push(parseFloat(filtros.precoMin));
        }
        
        // Filtro por preço máximo
        if (filtros.precoMax) {
            whereExtra += ' AND (CASE WHEN p.preco_promocional IS NOT NULL THEN p.preco_promocional ELSE p.preco END) <= ?';
            params.push(parseFloat(filtros.precoMax));
        }
        
        // Filtro apenas promoções
        if (filtros.apenasPromocoes) {
            whereExtra += ' AND p.preco_promocional IS NOT NULL';
        }
        
        // Filtro apenas disponíveis
        if (filtros.apenasDisponiveis !== false) {
            whereExtra += ' AND p.disponivel = 1 AND p.estoque > 0';
        }
        
        // Ordenação
        let orderBy = 'ORDER BY p.destaque DESC, p.nome ASC';
        switch (filtros.ordenarPor) {
            case 'menor_preco':
                orderBy = 'ORDER BY (CASE WHEN p.preco_promocional IS NOT NULL THEN p.preco_promocional ELSE p.preco END) ASC';
                break;
            case 'maior_preco':
                orderBy = 'ORDER BY (CASE WHEN p.preco_promocional IS NOT NULL THEN p.preco_promocional ELSE p.preco END) DESC';
                break;
            case 'nome':
                orderBy = 'ORDER BY p.nome ASC';
                break;
            case 'mais_vendidos':
                orderBy = 'ORDER BY (SELECT COUNT(*) FROM itens_pedido WHERE produto_nome = p.nome) DESC';
                break;
        }
        
        const produtos = db.prepare(`
            SELECT p.*, c.nome as categoria_nome, c.emoji as categoria_emoji
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE (p.nome LIKE ? OR p.marca LIKE ? OR p.descricao LIKE ? OR p.codigo_barras LIKE ? OR p.sku LIKE ?)
            ${whereExtra}
            ${orderBy}
            LIMIT ? OFFSET ?
        `).all(busca, busca, busca, busca, busca, ...params, limite, offset);
        
        const totalParams = [busca, busca, busca, busca, busca, ...params];
        const total = db.prepare(`
            SELECT COUNT(*) as t FROM produtos p
            WHERE (p.nome LIKE ? OR p.marca LIKE ? OR p.descricao LIKE ? OR p.codigo_barras LIKE ? OR p.sku LIKE ?)
            ${whereExtra}
        `).get(...totalParams).t;
        
        return { produtos, total, pagina, totalPaginas: Math.ceil(total / limite), termo };
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
    
    // ============ PRODUTOS POR MARCA ============
    static async getProdutosPorMarca(marca, limite = 30) {
        const db = getDatabase();
        return db.prepare(`
            SELECT * FROM produtos 
            WHERE marca LIKE ? AND disponivel = 1 AND estoque > 0
            ORDER BY nome
            LIMIT ?
        `).all(`%${marca}%`, limite);
    }
    
    // ============ LISTAR MARCAS ============
    static async getMarcas() {
        const db = getDatabase();
        return db.prepare(`
            SELECT DISTINCT marca FROM produtos 
            WHERE marca IS NOT NULL AND marca != '' AND disponivel = 1
            ORDER BY marca
        `).all();
    }
    
    // ============ PRODUTOS COM ESTOQUE BAIXO ============
    static async getEstoqueBaixo(limite = 10) {
        const db = getDatabase();
        return db.prepare(`
            SELECT * FROM produtos 
            WHERE disponivel = 1 AND estoque > 0 AND estoque <= 10
            ORDER BY estoque ASC
            LIMIT ?
        `).all(limite);
    }
    
    // ============ CLUBE DE OFERTAS ============
    static async getClubeOfertas(clienteId, limite = 20) {
        const db = getDatabase();
        // Produtos com preço especial para clientes fiéis
        return db.prepare(`
            SELECT * FROM produtos 
            WHERE disponivel = 1 AND estoque > 0 AND preco_clube IS NOT NULL
            ORDER BY RANDOM()
            LIMIT ?
        `).all(limite);
    }
    
    // ============ BANNERS PROMOCIONAIS ============
    static async getBanners() {
        const db = getDatabase();
        return db.prepare(`
            SELECT p.id, p.nome, p.foto, p.preco_promocional, p.preco,
                   ((p.preco - p.preco_promocional) / p.preco * 100) as desconto_percentual
            FROM produtos p
            WHERE p.disponivel = 1 AND p.estoque > 0 AND p.foto IS NOT NULL AND p.preco_promocional IS NOT NULL
            ORDER BY desconto_percentual DESC
            LIMIT 5
        `).all();
    }
    
    // ============ INFORMAÇÕES NUTRICIONAIS ============
    static async getInfoNutricional(produtoId) {
        const db = getDatabase();
        const produto = db.prepare('SELECT info_nutricional, nome FROM produtos WHERE id = ?').get(produtoId);
        if (!produto || !produto.info_nutricional) return null;
        
        try {
            return JSON.parse(produto.info_nutricional);
        } catch (e) {
            return { texto: produto.info_nutricional };
        }
    }
    
    // ============ VERIFICAR DISPONIBILIDADE ============
    static async verificarDisponibilidade(produtoId, cep = null) {
        const db = getDatabase();
        const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produtoId);
        if (!produto) return { disponivel: false, mensagem: 'Produto não encontrado.' };
        
        if (!produto.disponivel) return { disponivel: false, mensagem: 'Produto indisponível no momento.' };
        if (produto.estoque <= 0) return { disponivel: false, mensagem: 'Produto fora de estoque.' };
        
        // Verifica se entrega na região (se tiver CEP)
        if (cep) {
            const cepLimpo = String(cep).replace(/\D/g, '');
            // Aqui poderia verificar faixa de CEP atendida
            if (cepLimpo.length === 8) {
                return { disponivel: true, estoque: produto.estoque, mensagem: 'Disponível para entrega!' };
            }
        }
        
        return { disponivel: true, estoque: produto.estoque, mensagem: `${produto.estoque} unidade(s) disponível(is)` };
    }
    
    // ============ COMPARTILHAR PRODUTO ============
    static async getLinkCompartilhamento(produtoId) {
        const db = getDatabase();
        const produto = db.prepare('SELECT nome, preco, preco_promocional FROM produtos WHERE id = ?').get(produtoId);
        if (!produto) return null;
        
        const preco = produto.preco_promocional || produto.preco;
        const texto = `🛒 ${produto.nome} - ${formatarMoeda(preco)}\n\nPeça no ${process.env.NOME_MERCADO || 'Supermercado Telegram'}!`;
        
        return {
            texto,
            url: `https://t.me/${process.env.BOT_USERNAME || 'supermercado_bot'}?start=produto_${produtoId}`
        };
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
    
    // ============ SUGESTÕES PERSONALIZADAS ============
    static async getSugestoesPersonalizadas(clienteId, limite = 10) {
        const db = getDatabase();
        
        // Baseado no histórico de compras
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
    
    // ============ AVALIAÇÕES DO PRODUTO ============
    static async getAvaliacoesProduto(produtoId) {
        const db = getDatabase();
        const produto = db.prepare('SELECT nome FROM produtos WHERE id = ?').get(produtoId);
        if (!produto) return [];
        
        return db.prepare(`
            SELECT a.nota, a.comentario, a.data, c.nome
            FROM avaliacoes a
            JOIN pedidos p ON a.pedido_id = p.id
            JOIN itens_pedido ip ON ip.pedido_id = p.id
            JOIN clientes c ON a.cliente_id = c.id
            WHERE ip.produto_nome = ?
            ORDER BY a.data DESC
            LIMIT 20
        `).all(produto.nome);
    }
    
    // ============ NOTIFICAR QUANDO DISPONÍVEL ============
    static async notificarDisponibilidade(userId, produtoId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false };
        
        db.prepare('INSERT OR IGNORE INTO alertas_disponibilidade (cliente_id, produto_id) VALUES (?, ?)').run(cliente.id, produtoId);
        return { sucesso: true, mensagem: 'Você será notificado quando o produto voltar ao estoque!' };
    }
    
    // ============ CÓDIGO DE BARRAS ============
    static async buscarPorCodigoBarras(codigo) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM produtos WHERE codigo_barras = ? AND disponivel = 1').get(codigo);
    }
}

module.exports = LojaService;
