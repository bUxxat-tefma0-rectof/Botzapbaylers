const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData } = require('../../utils/helpers');
const PDFService = require('../../services/pdf');
const logger = require('../../utils/logger');

class PedidosService {
    
    // Listar pedidos do cliente
    static async listar(userId, filtro = 'todos', pagina = 1, limite = 10) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { pedidos: [], total: 0 };
        
        let where = 'WHERE cliente_id = ?';
        const params = [cliente.id];
        
        // Filtros
        const agora = new Date();
        switch (filtro) {
            case 'hoje':
                where += " AND date(data_pedido) = date('now')";
                break;
            case 'semana':
                where += " AND data_pedido >= date('now', '-7 days')";
                break;
            case 'mes':
                where += " AND strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now')";
                break;
        }
        
        const total = db.prepare(`SELECT COUNT(*) as t FROM pedidos ${where}`).get(...params).t;
        const offset = (pagina - 1) * limite;
        
        const pedidos = db.prepare(`
            SELECT * FROM pedidos ${where} 
            ORDER BY data_pedido DESC 
            LIMIT ? OFFSET ?
        `).all(...params, limite, offset);
        
        return {
            pedidos,
            total,
            pagina,
            totalPaginas: Math.ceil(total / limite)
        };
    }
    
    // Detalhes do pedido
    static async detalhes(userId, pedidoId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return null;
        
        const pedido = db.prepare(`
            SELECT p.*, e.logradouro, e.numero, e.bairro, e.cidade, e.estado, e.cep
            FROM pedidos p
            LEFT JOIN enderecos e ON p.endereco_id = e.id
            WHERE p.id = ? AND p.cliente_id = ?
        `).get(pedidoId, cliente.id);
        
        if (!pedido) return null;
        
        const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(pedidoId);
        
        // Status com ícones
        const statusIcones = {
            'recebido': '📥',
            'confirmado': '✅',
            'separando': '📦',
            'embalando': '🎁',
            'entrega': '🛵',
            'entregue': '🏠',
            'cancelado': '❌',
            'reembolsado': '💰'
        };
        
        return {
            ...pedido,
            itens,
            statusIcone: statusIcones[pedido.status] || '📋',
            statusIcones
        };
    }
    
    // Gerar PDF do histórico
    static async gerarPDF(userId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return null;
        
        const pedidos = db.prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY data_pedido DESC').all(cliente.id);
        const itens = db.prepare(`
            SELECT i.* FROM itens_pedido i
            JOIN pedidos p ON i.pedido_id = p.id
            WHERE p.cliente_id = ?
        `).all(cliente.id);
        
        return await PDFService.gerarRelatorio(
            pedidos.map(p => ({ ...p, nome: cliente.nome })),
            itens
        );
    }
    
    // Avaliar pedido
    static async avaliar(userId, pedidoId, nota, comentario = '') {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ? AND cliente_id = ?').get(pedidoId, cliente.id);
        if (!pedido) return { sucesso: false, mensagem: 'Pedido não encontrado.' };
        if (pedido.status !== 'entregue') return { sucesso: false, mensagem: 'Só pode avaliar pedidos entregues.' };
        
        if (nota < 1 || nota > 5) return { sucesso: false, mensagem: 'Nota deve ser de 1 a 5.' };
        
        db.prepare('INSERT INTO avaliacoes (pedido_id, cliente_id, nota, comentario) VALUES (?, ?, ?, ?)').run(pedidoId, cliente.id, nota, comentario);
        
        return { sucesso: true, mensagem: 'Obrigado pela avaliação! ⭐' };
    }
    
    // Repetir pedido
    static async repetirPedido(userId, pedidoId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ? AND cliente_id = ?').get(pedidoId, cliente.id);
        if (!pedido) return { sucesso: false, mensagem: 'Pedido não encontrado.' };
        
        const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(pedidoId);
        
        // Limpa carrinho atual
        db.prepare('DELETE FROM carrinhos WHERE cliente_id = ?').run(cliente.id);
        
        // Adiciona itens ao carrinho
        let adicionados = 0;
        for (const item of itens) {
            const produto = db.prepare('SELECT id FROM produtos WHERE nome = ? AND disponivel = 1 AND estoque > 0').get(item.produto_nome);
            if (produto) {
                db.prepare('INSERT INTO carrinhos (cliente_id, produto_id, quantidade, comentario) VALUES (?, ?, ?, ?)').run(cliente.id, produto.id, item.quantidade, item.comentario);
                adicionados++;
            }
        }
        
        return {
            sucesso: true,
            adicionados,
            total: itens.length,
            mensagem: `${adicionados} de ${itens.length} itens adicionados ao carrinho!`
        };
    }
}

module.exports = PedidosService;
