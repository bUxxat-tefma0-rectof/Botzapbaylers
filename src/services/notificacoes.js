const { getDatabase } = require('../database/connection');
const logger = require('../utils/logger');

class NotificacoesService {
    
    // Enviar notificação para um cliente
    static async enviarParaCliente(userId, mensagem, tipo = 'info') {
        try {
            const clientBot = require('../bot/cliente/index').getBot();
            if (!clientBot) return { sucesso: false };
            
            const db = getDatabase();
            const cliente = db.prepare('SELECT telegram_id FROM clientes WHERE id = ?').get(userId);
            if (!cliente) return { sucesso: false };
            
            const icones = {
                'info': 'ℹ️',
                'pedido': '📦',
                'promocao': '🎉',
                'entrega': '🛵',
                'pagamento': '💳',
                'alerta': '⚠️'
            };
            
            const icone = icones[tipo] || '📢';
            
            await clientBot.sendMessage(
                cliente.telegram_id,
                `${icone} *${process.env.NOME_MERCADO || 'Supermercado'}*\n\n${mensagem}`,
                { parse_mode: 'Markdown' }
            );
            
            logger.info(`📢 Notificação enviada para cliente ${userId}: ${tipo}`);
            return { sucesso: true };
        } catch (error) {
            logger.error('Erro ao enviar notificação: ' + error.message);
            return { sucesso: false };
        }
    }
    
    // Notificar status do pedido
    static async notificarStatusPedido(pedidoId, status) {
        const db = getDatabase();
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
        if (!pedido) return;
        
        const mensagens = {
            'recebido': '📥 Seu pedido foi recebido e está sendo processado.',
            'confirmado': '✅ Pagamento confirmado! Seu pedido está sendo separado.',
            'separando': '📦 Seus produtos estão sendo separados.',
            'embalando': '🎁 Seu pedido está sendo embalado.',
            'entrega': '🛵 Seu pedido saiu para entrega! Já está a caminho.',
            'entregue': '🏠 Pedido entregue! Obrigado por comprar conosco! 🛒',
            'cancelado': '❌ Seu pedido foi cancelado. Entre em contato para mais informações.'
        };
        
        const mensagem = mensagens[status] || `Status do pedido atualizado: ${status}`;
        
        return await this.enviarParaCliente(pedido.cliente_id, mensagem, 'pedido');
    }
    
    // Notificar promoções para todos
    static async notificarPromocao(mensagem) {
        const db = getDatabase();
        const clientes = db.prepare('SELECT id FROM clientes WHERE bloqueado = 0').all();
        
        let enviados = 0;
        for (const cliente of clientes) {
            const result = await this.enviarParaCliente(cliente.id, mensagem, 'promocao');
            if (result.sucesso) enviados++;
        }
        
        return { sucesso: true, enviados, total: clientes.length };
    }
    
    // Notificar produto disponível
    static async notificarDisponibilidade(produtoId) {
        const db = getDatabase();
        const produto = db.prepare('SELECT nome FROM produtos WHERE id = ?').get(produtoId);
        if (!produto) return;
        
        const alertas = db.prepare('SELECT cliente_id FROM alertas_disponibilidade WHERE produto_id = ?').all(produtoId);
        
        for (const alerta of alertas) {
            await this.enviarParaCliente(
                alerta.cliente_id,
                `🔔 *${produto.nome}* voltou ao estoque!\n\nCorra para garantir o seu! 🛒`,
                'alerta'
            );
        }
        
        // Limpa alertas
        db.prepare('DELETE FROM alertas_disponibilidade WHERE produto_id = ?').run(produtoId);
    }
    
    // Notificar aniversariantes
    static async notificarAniversariantes() {
        const db = getDatabase();
        const hoje = new Date();
        const dia = String(hoje.getDate()).padStart(2, '0');
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        
        const aniversariantes = db.prepare("SELECT id, nome FROM clientes WHERE data_nascimento LIKE ?").all(`%/${dia}/${mes !== '00' ? '' : ''}%`);
        
        for (const cliente of aniversariantes) {
            await this.enviarParaCliente(
                cliente.id,
                `🎂 *Feliz Aniversário, ${cliente.nome?.split(' ')[0] || 'Cliente'}!*\n\n` +
                `Temos um presente especial para você:\n` +
                `🎁 Cupom: ANIVERSARIO10 - 10% de desconto\n` +
                `Válido hoje! Aproveite! 🎉`,
                'promocao'
            );
        }
    }
    
    // Notificar abandono de carrinho
    static async notificarCarrinhoAbandonado() {
        const db = getDatabase();
        // Carrinhos com mais de 1 hora sem atividade
        const carrinhos = db.prepare(`
            SELECT DISTINCT c.cliente_id 
            FROM carrinhos c 
            WHERE c.cliente_id NOT IN (
                SELECT cliente_id FROM pedidos WHERE data_pedido > datetime('now', '-1 hour')
            )
        `).all();
        
        for (const carrinho of carrinhos) {
            await this.enviarParaCliente(
                carrinho.cliente_id,
                '🛒 Você deixou produtos no carrinho!\n\nNão perca tempo, finalize sua compra agora! 🛍️',
                'alerta'
            );
        }
    }
}

module.exports = NotificacoesService;
