const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData } = require('../../utils/helpers');
const PDFService = require('../../services/pdf');
const logger = require('../../utils/logger');

class RelatoriosAdmin {
    
    // Relatório de vendas
    static async vendas(periodo = 'mes') {
        const db = getDatabase();
        let whereData = '';
        
        switch (periodo) {
            case 'hoje':
                whereData = "AND date(p.data_pedido) = date('now')";
                break;
            case 'ontem':
                whereData = "AND date(p.data_pedido) = date('now', '-1 day')";
                break;
            case 'semana':
                whereData = "AND p.data_pedido >= date('now', '-7 days')";
                break;
            case 'mes':
                whereData = "AND strftime('%Y-%m', p.data_pedido) = strftime('%Y-%m', 'now')";
                break;
            case 'ano':
                whereData = "AND strftime('%Y', p.data_pedido) = strftime('%Y', 'now')";
                break;
        }
        
        const resumo = db.prepare(`
            SELECT 
                COUNT(*) as total_pedidos,
                COUNT(CASE WHEN p.pagamento_status = 'approved' THEN 1 END) as pedidos_pagos,
                COALESCE(SUM(CASE WHEN p.pagamento_status = 'approved' THEN p.total ELSE 0 END), 0) as faturamento,
                COALESCE(SUM(p.desconto), 0) as total_descontos,
                COALESCE(AVG(CASE WHEN p.pagamento_status = 'approved' THEN p.total END), 0) as ticket_medio
            FROM pedidos p
            WHERE 1=1 ${whereData}
        `).get();
        
        const porDia = db.prepare(`
            SELECT date(p.data_pedido) as dia, COUNT(*) as pedidos, COALESCE(SUM(p.total), 0) as faturamento
            FROM pedidos p
            WHERE 1=1 ${whereData}
            GROUP BY date(p.data_pedido)
            ORDER BY dia
        `).all();
        
        const porMetodo = db.prepare(`
            SELECT p.pagamento_metodo, COUNT(*) as total, COALESCE(SUM(p.total), 0) as valor
            FROM pedidos p
            WHERE 1=1 ${whereData}
            GROUP BY p.pagamento_metodo
        `).all();
        
        const porStatus = db.prepare(`
            SELECT p.status, COUNT(*) as total
            FROM pedidos p
            WHERE 1=1 ${whereData}
            GROUP BY p.status
        `).all();
        
        return {
            resumo: {
                totalPedidos: resumo.total_pedidos,
                pedidosPagos: resumo.pedidos_pagos,
                faturamento: formatarMoeda(resumo.faturamento),
                totalDescontos: formatarMoeda(resumo.total_descontos),
                ticketMedio: formatarMoeda(resumo.ticket_medio)
            },
            porDia,
            porMetodo,
            porStatus
        };
    }
    
    // Relatório de produtos
    static async produtos(periodo = 'mes') {
        const db = getDatabase();
        let whereData = '';
        
        switch (periodo) {
            case 'hoje':
                whereData = "AND date(p.data_pedido) = date('now')";
                break;
            case 'semana':
                whereData = "AND p.data_pedido >= date('now', '-7 days')";
                break;
            case 'mes':
                whereData = "AND strftime('%Y-%m', p.data_pedido) = strftime('%Y-%m', 'now')";
                break;
        }
        
        const maisVendidos = db.prepare(`
            SELECT ip.produto_nome, COUNT(*) as quantidade_vendas, 
                   SUM(ip.quantidade) as total_unidades, 
                   SUM(ip.preco_unitario * ip.quantidade) as receita
            FROM itens_pedido ip
            JOIN pedidos p ON ip.pedido_id = p.id
            WHERE p.pagamento_status = 'approved' ${whereData}
            GROUP BY ip.produto_nome
            ORDER BY total_unidades DESC
            LIMIT 30
        `).all();
        
        const porCategoria = db.prepare(`
            SELECT c.nome as categoria, COUNT(ip.id) as vendas, SUM(ip.preco_unitario * ip.quantidade) as receita
            FROM itens_pedido ip
            JOIN pedidos p ON ip.pedido_id = p.id
            LEFT JOIN produtos prod ON ip.produto_nome = prod.nome
            LEFT JOIN categorias c ON prod.categoria_id = c.id
            WHERE p.pagamento_status = 'approved' ${whereData}
            GROUP BY c.nome
            ORDER BY receita DESC
        `).all();
        
        const produtosCancelados = db.prepare(`
            SELECT ip.produto_nome, COUNT(*) as cancelamentos
            FROM itens_pedido ip
            JOIN pedidos p ON ip.pedido_id = p.id
            WHERE p.status = 'cancelado' ${whereData}
            GROUP BY ip.produto_nome
            ORDER BY cancelamentos DESC
            LIMIT 10
        `).all();
        
        return { maisVendidos, porCategoria, produtosCancelados };
    }
    
    // Relatório de clientes
    static async clientes() {
        const db = getDatabase();
        
        const novosPorMes = db.prepare(`
            SELECT strftime('%Y-%m', data_cadastro) as mes, COUNT(*) as total
            FROM clientes
            GROUP BY strftime('%Y-%m', data_cadastro)
            ORDER BY mes DESC
            LIMIT 12
        `).all();
        
        const porTipo = db.prepare(`
            SELECT tipo, COUNT(*) as total, COALESCE(SUM(total_gasto), 0) as faturamento
            FROM clientes
            GROUP BY tipo
        `).all();
        
        const fidelidade = db.prepare(`
            SELECT nome, pontos_fidelidade, total_gasto
            FROM clientes
            ORDER BY pontos_fidelidade DESC
            LIMIT 20
        `).all();
        
        return { novosPorMes, porTipo, fidelidade };
    }
    
    // Relatório financeiro
    static async financeiro(periodo = 'mes') {
        const db = getDatabase();
        let whereData = '';
        
        switch (periodo) {
            case 'hoje':
                whereData = "AND date(data_pedido) = date('now')";
                break;
            case 'mes':
                whereData = "AND strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now')";
                break;
        }
        
        const pix = db.prepare(`
            SELECT COALESCE(SUM(total), 0) as total FROM pedidos 
            WHERE pagamento_metodo = 'pix' AND pagamento_status = 'approved' ${whereData}
        `).get();
        
        const cartao = db.prepare(`
            SELECT COALESCE(SUM(total), 0) as total FROM pedidos 
            WHERE pagamento_metodo = 'cartao' AND pagamento_status = 'approved' ${whereData}
        `).get();
        
        const dinheiro = db.prepare(`
            SELECT COALESCE(SUM(total), 0) as total FROM pedidos 
            WHERE pagamento_metodo = 'dinheiro' AND pagamento_status = 'approved' ${whereData}
        `).get();
        
        const taxasEntrega = db.prepare(`
            SELECT COALESCE(SUM(taxa_entrega), 0) as total FROM pedidos 
            WHERE pagamento_status = 'approved' ${whereData}
        `).get();
        
        const cuponsUsados = db.prepare(`
            SELECT COUNT(*) as total, COALESCE(SUM(desconto), 0) as valor FROM pedidos 
            WHERE cupom IS NOT NULL AND pagamento_status = 'approved' ${whereData}
        `).get();
        
        return {
            metodos: {
                pix: formatarMoeda(pix.total),
                cartao: formatarMoeda(cartao.total),
                dinheiro: formatarMoeda(dinheiro.total)
            },
            taxasEntrega: formatarMoeda(taxasEntrega.total),
            cupons: { quantidade: cuponsUsados.total, valor: formatarMoeda(cuponsUsados.valor) },
            total: formatarMoeda(pix.total + cartao.total + dinheiro.total)
        };
    }
    
    // Gerar PDF do relatório
    static async gerarPDF(periodo = 'mes') {
        const db = getDatabase();
        const pedidos = db.prepare(`
            SELECT p.*, c.nome as nome_cliente
            FROM pedidos p
            LEFT JOIN clientes c ON p.cliente_id = c.id
            WHERE strftime('%Y-%m', p.data_pedido) = strftime('%Y-%m', 'now')
            ORDER BY p.data_pedido DESC
        `).all();
        
        const itens = db.prepare(`
            SELECT i.* FROM itens_pedido i
            JOIN pedidos p ON i.pedido_id = p.id
            WHERE strftime('%Y-%m', p.data_pedido) = strftime('%Y-%m', 'now')
        `).all();
        
        return await PDFService.gerarRelatorio(
            pedidos.map(p => ({ ...p, nome: p.nome_cliente })),
            itens
        );
    }
}

module.exports = RelatoriosAdmin;
