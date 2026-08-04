const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class PedidosAdmin {
    
    static async listar(filtro = 'todos', pagina = 1, limite = 20) {
        const db = getDatabase();
        let where = '';
        const params = [];
        
        switch (filtro) {
            case 'pendentes': where = "WHERE status IN ('recebido', 'confirmado', 'separando', 'embalando')"; break;
            case 'entrega': where = "WHERE status = 'entrega'"; break;
            case 'entregues': where = "WHERE status = 'entregue'"; break;
            case 'cancelados': where = "WHERE status IN ('cancelado', 'reembolsado')"; break;
            case 'hoje': where = "WHERE date(data_pedido) = date('now')"; break;
        }
        
        const total = db.prepare(`SELECT COUNT(*) as t FROM pedidos ${where}`).get(...params).t;
        const offset = (pagina - 1) * limite;
        
        const pedidos = db.prepare(`
            SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone,
                   e.logradouro, e.numero, e.bairro, e.cidade,
                   ent.nome as entregador_nome
            FROM pedidos p
            JOIN clientes c ON p.cliente_id = c.id
            LEFT JOIN enderecos e ON p.endereco_id = e.id
            LEFT JOIN entregadores ent ON p.entregador_id = ent.id
            ${where}
            ORDER BY p.data_pedido DESC
            LIMIT ? OFFSET ?
        `).all(...params, limite, offset);
        
        return { pedidos, total, pagina, totalPaginas: Math.ceil(total / limite) };
    }
    
    static async detalhes(pedidoId) {
        const db = getDatabase();
        const pedido = db.prepare(`
            SELECT p.*, c.nome, c.telefone, c.cpf, c.email,
                   e.logradouro, e.numero, e.complemento, e.referencia, e.bairro, e.cidade, e.estado, e.cep,
                   ent.nome as entregador_nome, ent.telefone as entregador_telefone, ent.veiculo
            FROM pedidos p
            JOIN clientes c ON p.cliente_id = c.id
            LEFT JOIN enderecos e ON p.endereco_id = e.id
            LEFT JOIN entregadores ent ON p.entregador_id = ent.id
            WHERE p.id = ?
        `).get(pedidoId);
        
        if (!pedido) return null;
        
        const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(pedidoId);
        
        return { ...pedido, itens };
    }
    
    static async alterarStatus(pedidoId, novoStatus) {
        const db = getDatabase();
        const statusValidos = ['recebido', 'confirmado', 'separando', 'embalando', 'entrega', 'entregue', 'cancelado', 'reembolsado'];
        if (!statusValidos.includes(novoStatus)) return { sucesso: false, mensagem: 'Status inválido.' };
        
        if (novoStatus === 'entregue') {
            db.prepare('UPDATE pedidos SET status = ?, data_entrega = datetime("now") WHERE id = ?').run(novoStatus, pedidoId);
        } else {
            db.prepare('UPDATE pedidos SET status = ? WHERE id = ?').run(novoStatus, pedidoId);
        }
        
        return { sucesso: true, mensagem: `Status: ${novoStatus}` };
    }
    
    static async imprimir(pedidoId) {
        const detalhes = await this.detalhes(pedidoId);
        if (!detalhes) return null;
        
        let texto = `🛒 *${process.env.NOME_MERCADO || 'Supermercado'}*\n\n`;
        texto += `📦 Pedido: ${detalhes.numero}\n`;
        texto += `📅 Data: ${formatarData(detalhes.data_pedido)}\n`;
        texto += `👤 Cliente: ${detalhes.nome}\n`;
        texto += `📱 Tel: ${detalhes.telefone || 'N/A'}\n`;
        if (detalhes.logradouro) texto += `📍 ${detalhes.logradouro}, ${detalhes.numero} - ${detalhes.bairro}\n`;
        if (detalhes.entregador_nome) texto += `🛵 Entregador: ${detalhes.entregador_nome}\n`;
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
