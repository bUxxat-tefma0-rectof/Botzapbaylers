const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class PedidosAdmin {
    
    // Listar pedidos
    static async listar(filtro = 'todos', pagina = 1, limite = 20) {
        const db = getDatabase();
        let where = '';
        const params = [];
        
        switch (filtro) {
            case 'pendentes':
                where = "WHERE status IN ('recebido', 'confirmado', 'separando', 'embalando')";
                break;
            case 'entrega':
                where = "WHERE status = 'entrega'";
                break;
            case 'entregues':
                where = "WHERE status = 'entregue'";
                break;
            case 'cancelados':
                where = "WHERE status IN ('cancelado', 'reembolsado')";
                break;
            case 'hoje':
                where = "WHERE date(data_pedido) = date('now')";
                break;
        }
        
        const total = db.prepare(`SELECT COUNT(*) as t FROM pedidos ${where}`).get(...params).t;
        const offset = (pagina - 1) * limite;
        
        const pedidos = db.prepare(`
            SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone,
                   e.logradouro, e.numero, e.bairro, e.cidade
            FROM pedidos p
            JOIN clientes c ON p.cliente_id = c.id
            LEFT JOIN enderecos e ON p.endereco_id = e.id
            ${where}
            ORDER BY p.data_pedido DESC
            LIMIT ? OFFSET ?
        `).all(...params, limite, offset);
        
        return { pedidos, total, pagina, totalPaginas: Math.ceil(total / limite) };
    }
    
    // Detalhes do pedido
    static async detalhes(pedidoId) {
        const db = getDatabase();
        const pedido = db.prepare(`
            SELECT p.*, c.nome, c.telefone, c.cpf, c.email,
                   e.logradouro, e.numero, e.complemento, e.referencia, e.bairro, e.cidade, e.estado, e.cep
            FROM pedidos p
            JOIN clientes c ON p.cliente_id = c.id
            LEFT JOIN enderecos e ON p.endereco_id = e.id
            WHERE p.id = ?
        `).get(pedidoId);
        
        if (!pedido) return null;
        
        const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(pedidoId);
        
        return { ...pedido, itens };
    }
    
    // Alterar status
    static async alterarStatus(pedidoId, novoStatus) {
        const db = getDatabase();
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
        if (!pedido) return { sucesso: false, mensagem: 'Pedido não encontrado.' };
        
        const statusValidos = ['recebido', 'confirmado', 'separando', 'embalando', 'entrega', 'entregue', 'cancelado', 'reembolsado'];
        if (!statusValidos.includes(novoStatus)) return { sucesso: false, mensagem: 'Status inválido.' };
        
        db.prepare('UPDATE pedidos SET status = ? WHERE id = ?').run(novoStatus, pedidoId);
        
        // Notificar cliente via Telegram
        try {
            const cliente = db.prepare('SELECT telegram_id FROM clientes WHERE id = ?').get(pedido.cliente_id);
            if (cliente) {
                const clientBot = require('../cliente/index').getBot();
                const mensagens = {
                    'confirmado': '✅ Seu pagamento foi aprovado! O pedido está sendo separado.',
                    'separando': '📦 Seu pedido está sendo separado!',
                    'embalando': '🎁 Seu pedido está sendo embalado!',
                    'entrega': '🛵 Seu pedido saiu para entrega!',
                    'entregue': '🏠 Pedido entregue! Bom apetite! 🛒',
                    'cancelado': '❌ Seu pedido foi cancelado.'
                };
                if (mensagens[novoStatus] && clientBot) {
                    await clientBot.sendMessage(cliente.telegram_id, mensagens[novoStatus]);
                }
            }
        } catch (e) {}
        
        logger.info(`📋 Pedido ${pedido.numero}: ${novoStatus}`);
        return { sucesso: true, mensagem: `Status atualizado para: ${novoStatus}` };
    }
    
    // Imprimir pedido (gerar texto formatado)
    static async imprimir(pedidoId) {
        const detalhes = await this.detalhes(pedidoId);
        if (!detalhes) return null;
        
        let texto = `🛒 *${process.env.NOME_MERCADO || 'Supermercado'}*\n\n`;
        texto += `📦 Pedido: ${detalhes.numero}\n`;
        texto += `📅 Data: ${formatarData(detalhes.data_pedido)}\n`;
        texto += `👤 Cliente: ${detalhes.nome}\n`;
        texto += `📱 Tel: ${detalhes.telefone || 'N/A'}\n`;
        if (detalhes.logradouro) texto += `📍 ${detalhes.logradouro}, ${detalhes.numero} - ${detalhes.bairro}\n`;
        texto += `\n📋 *ITENS:*\n`;
        
        for (const item of detalhes.itens) {
            texto += `\n${item.quantidade}x ${item.produto_nome}\n`;
            texto += `   💰 ${formatarMoeda(item.preco_unitario * item.quantidade)}`;
            if (item.comentario) texto += `\n   📝 ${item.comentario}`;
            texto += '\n';
        }
        
        texto += `\n💰 Total: *${formatarMoeda(detalhes.total)}*\n`;
        texto += `💳 Pagamento: ${detalhes.pagamento_metodo?.toUpperCase()}\n`;
        texto += `📊 Status: ${detalhes.status}`;
        
        return texto;
    }
}

module.exports = PedidosAdmin;
