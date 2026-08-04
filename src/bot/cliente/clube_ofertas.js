const { getDatabase } = require('../database/connection');
const { formatarMoeda } = require('../utils/helpers');
const logger = require('../utils/logger');

class ClubeOfertasService {
    
    // Verificar se cliente é membro do clube
    static async isMembro(userId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT pontos_fidelidade, total_gasto FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return false;
        
        // Membro se tiver mais de 500 pontos ou gasto acima de R$ 200
        return cliente.pontos_fidelidade >= 500 || cliente.total_gasto >= 200;
    }
    
    // Produtos com preço de clube
    static async getProdutosClube(userId) {
        const db = getDatabase();
        const isMembro = await this.isMembro(userId);
        
        const produtos = db.prepare(`
            SELECT * FROM produtos 
            WHERE disponivel = 1 AND estoque > 0 AND preco_clube IS NOT NULL
            ORDER BY ((preco - preco_clube) / preco * 100) DESC
            LIMIT 50
        `).all();
        
        return produtos.map(p => ({
            ...p,
            preco_normal: p.preco,
            preco_membro: p.preco_clube,
            desconto_percentual: Math.round((1 - p.preco_clube / p.preco) * 100),
            economia: p.preco - p.preco_clube,
            isMembro
        }));
    }
    
    // Assinar clube
    static async assinarClube(userId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT pontos_fidelidade FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        if (cliente.pontos_fidelidade >= 500) {
            db.prepare('UPDATE clientes SET pontos_fidelidade = pontos_fidelidade - 500 WHERE telegram_id = ?').run(userId);
            return { sucesso: true, mensagem: 'Clube ativado! 500 pontos utilizados.' };
        }
        
        return { sucesso: false, mensagem: 'Você precisa de 500 pontos para assinar o clube.' };
    }
    
    // Benefícios do clube
    static async getBeneficios() {
        return [
            { icone: '💰', titulo: 'Preços Exclusivos', descricao: 'Descontos de até 30% em produtos selecionados' },
            { icone: '🚚', titulo: 'Frete Grátis', descricao: 'Em compras acima de R$ 100' },
            { icone: '⭐', titulo: 'Pontos em Dobro', descricao: 'Ganhe 2x pontos a cada compra' },
            { icone: '🎁', titulo: 'Ofertas Antecipadas', descricao: 'Acesso 24h antes das promoções' },
            { icone: '🔔', titulo: 'Notificações', descricao: 'Alertas de produtos em oferta' },
            { icone: '💎', titulo: 'Cashback', descricao: '5% de cashback em todas as compras' }
        ];
    }
    
    // Cashback do clube
    static async calcularCashback(userId, valorCompra) {
        const isMembro = await this.isMembro(userId);
        if (!isMembro) return 0;
        return valorCompra * 0.05; // 5% de cashback
    }
}

module.exports = ClubeOfertasService;
