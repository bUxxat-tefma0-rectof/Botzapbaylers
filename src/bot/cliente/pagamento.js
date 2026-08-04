const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');
const pagamentoService = require('../../services/pagamento');
const logger = require('../../utils/logger');

class PagamentoClienteService {
    
    // Gerar PIX para pedido existente
    static async gerarPixPedido(pedidoId) {
        const db = getDatabase();
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
        if (!pedido) return { sucesso: false, mensagem: 'Pedido não encontrado.' };
        
        const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(pedidoId);
        const descricao = itens.map(i => `${i.quantidade}x ${i.produto_nome}`).join(', ').substring(0, 100);
        
        const resultado = await pagamentoService.gerarPix(pedido.total, descricao, pedido.numero);
        
        if (resultado.sucesso) {
            db.prepare('UPDATE pedidos SET pagamento_id = ?, pagamento_qrcode = ? WHERE id = ?').run(resultado.payment_id, resultado.copia_cola, pedidoId);
        }
        
        return resultado;
    }
    
    // Verificar pagamento
    static async verificarPagamento(pedidoId) {
        const db = getDatabase();
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
        if (!pedido || !pedido.pagamento_id) return { aprovado: false, status: 'sem_pagamento' };
        
        const resultado = await pagamentoService.verificarPagamento(pedido.pagamento_id);
        
        if (resultado.aprovado && pedido.pagamento_status !== 'approved') {
            db.prepare('UPDATE pedidos SET status = ?, pagamento_status = ? WHERE id = ?').run('confirmado', 'approved', pedidoId);
            
            // Adiciona ao total gasto do cliente
            db.prepare('UPDATE clientes SET total_gasto = total_gasto + ? WHERE id = ?').run(pedido.total, pedido.cliente_id);
            
            // Adiciona pontos de fidelidade
            const pontos = Math.floor(pedido.total);
            db.prepare('UPDATE clientes SET pontos_fidelidade = pontos_fidelidade + ? WHERE id = ?').run(pontos, pedido.cliente_id);
            
            logger.info(`✅ Pagamento aprovado: Pedido ${pedido.numero}`);
        }
        
        return resultado;
    }
    
    // Cancelar pedido
    static async cancelarPedido(userId, pedidoId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ? AND cliente_id = ?').get(pedidoId, cliente.id);
        if (!pedido) return { sucesso: false, mensagem: 'Pedido não encontrado.' };
        
        if (['entregue', 'cancelado'].includes(pedido.status)) {
            return { sucesso: false, mensagem: 'Pedido não pode ser cancelado.' };
        }
        
        // Devolve estoque
        const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(pedidoId);
        for (const item of itens) {
            const produto = db.prepare('SELECT id FROM produtos WHERE nome = ?').get(item.produto_nome);
            if (produto) {
                db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(item.quantidade, produto.id);
            }
        }
        
        db.prepare('UPDATE pedidos SET status = ? WHERE id = ?').run('cancelado', pedidoId);
        
        logger.info(`❌ Pedido ${pedido.numero} cancelado`);
        return { sucesso: true, mensagem: 'Pedido cancelado.' };
    }
    
    // Status do pedido em tempo real
    static async getStatusPedido(pedidoId) {
        const db = getDatabase();
        const pedido = db.prepare(`
            SELECT numero, status, pagamento_status, total, data_pedido, 
                   tipo_entrega, comentario
            FROM pedidos WHERE id = ?
        `).get(pedidoId);
        
        if (!pedido) return null;
        
        const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(pedidoId);
        
        const statusFluxo = ['recebido', 'confirmado', 'separando', 'embalando', 'entrega', 'entregue'];
        const statusAtual = statusFluxo.indexOf(pedido.status);
        
        return {
            ...pedido,
            itens,
            progresso: statusFluxo.map((s, i) => ({
                status: s,
                concluido: i <= statusAtual,
                atual: i === statusAtual
            }))
        };
    }
    
    // Reembolsar PIX (admin)
    static async reembolsarPix(pedidoId) {
        const db = getDatabase();
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
        if (!pedido) return { sucesso: false, mensagem: 'Pedido não encontrado.' };
        if (pedido.pagamento_status !== 'approved') return { sucesso: false, mensagem: 'Pagamento não foi aprovado.' };
        
        try {
            const { MercadoPagoConfig, Payment } = require('mercadopago');
            const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
            const payment = new Payment(client);
            
            await payment.refund({ id: pedido.pagamento_id });
            
            db.prepare('UPDATE pedidos SET status = ?, pagamento_status = ? WHERE id = ?').run('reembolsado', 'refunded', pedidoId);
            
            logger.info(`💰 Reembolso: Pedido ${pedido.numero}`);
            return { sucesso: true, mensagem: 'Reembolso realizado!' };
        } catch (error) {
            logger.error('Erro reembolso: ' + error.message);
            return { sucesso: false, mensagem: 'Erro ao processar reembolso.' };
        }
    }
}

module.exports = PagamentoClienteService;
