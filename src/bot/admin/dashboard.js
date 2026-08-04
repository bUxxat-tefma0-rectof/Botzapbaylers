const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class DashboardAdmin {
    
    static async getEstatisticas() {
        const db = getDatabase();
        
        const totalClientes = db.prepare('SELECT COUNT(*) as t FROM clientes').get().t;
        const clientesAtivos = db.prepare("SELECT COUNT(*) as t FROM clientes WHERE data_cadastro >= date('now', '-30 days')").get().t;
        const totalPedidos = db.prepare('SELECT COUNT(*) as t FROM pedidos').get().t;
        const pedidosHoje = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE date(data_pedido) = date('now')").get().t;
        const pedidosMes = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now')").get().t;
        
        const faturamentoTotal = db.prepare("SELECT COALESCE(SUM(total), 0) as t FROM pedidos WHERE pagamento_status = 'approved'").get().t;
        const faturamentoHoje = db.prepare("SELECT COALESCE(SUM(total), 0) as t FROM pedidos WHERE pagamento_status = 'approved' AND date(data_pedido) = date('now')").get().t;
        const faturamentoMes = db.prepare("SELECT COALESCE(SUM(total), 0) as t FROM pedidos WHERE pagamento_status = 'approved' AND strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now')").get().t;
        
        const ticketMedio = totalPedidos > 0 ? faturamentoTotal / totalPedidos : 0;
        
        const pedidosPendentes = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE status IN ('recebido', 'confirmado', 'separando', 'embalando')").get().t;
        const pedidosEntrega = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE status = 'entrega'").get().t;
        
        const totalProdutos = db.prepare('SELECT COUNT(*) as t FROM produtos WHERE disponivel = 1').get().t;
        const produtosEstoqueBaixo = db.prepare('SELECT COUNT(*) as t FROM produtos WHERE estoque < 10 AND disponivel = 1').get().t;
        
        const totalCupons = db.prepare('SELECT COUNT(*) as t FROM cupons WHERE ativo = 1').get().t;
        const totalPromocoes = db.prepare('SELECT COUNT(*) as t FROM promocoes WHERE ativo = 1').get().t;
        
        return {
            clientes: { total: totalClientes, ativos: clientesAtivos },
            pedidos: { total: totalPedidos, hoje: pedidosHoje, mes: pedidosMes, pendentes: pedidosPendentes, emEntrega: pedidosEntrega },
            faturamento: { total: formatarMoeda(faturamentoTotal), hoje: formatarMoeda(faturamentoHoje), mes: formatarMoeda(faturamentoMes) },
            ticketMedio: formatarMoeda(ticketMedio),
            produtos: { total: totalProdutos, estoqueBaixo: produtosEstoqueBaixo },
            marketing: { cupons: totalCupons, promocoes: totalPromocoes }
        };
    }
    
    static async getGraficoVendas(periodo = 'semana') {
        const db = getDatabase();
        let query;
        
        switch (periodo) {
            case 'hoje':
                query = "SELECT strftime('%H', data_pedido) as label, COUNT(*) as total, COALESCE(SUM(total), 0) as valor FROM pedidos WHERE pagamento_status = 'approved' AND date(data_pedido) = date('now') GROUP BY strftime('%H', data_pedido) ORDER BY label";
                break;
            case 'mes':
                query = "SELECT strftime('%d', data_pedido) as label, COUNT(*) as total, COALESCE(SUM(total), 0) as valor FROM pedidos WHERE pagamento_status = 'approved' AND strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now') GROUP BY strftime('%d', data_pedido) ORDER BY label";
                break;
            default:
                query = "SELECT strftime('%w', data_pedido) as label, COUNT(*) as total, COALESCE(SUM(total), 0) as valor FROM pedidos WHERE pagamento_status = 'approved' AND data_pedido >= date('now', '-7 days') GROUP BY strftime('%w', data_pedido) ORDER BY label";
        }
        
        return db.prepare(query).all();
    }
    
    static async getProdutosMaisVendidos(limite = 10) {
        const db = getDatabase();
        return db.prepare(`
            SELECT produto_nome, COUNT(*) as quantidade, SUM(preco_unitario * quantidade) as receita
            FROM itens_pedido
            GROUP BY produto_nome
            ORDER BY quantidade DESC
            LIMIT ?
        `).all(limite);
    }
    
    static async getClientesTop(limite = 10) {
        const db = getDatabase();
        return db.prepare(`
            SELECT nome, telefone, total_gasto, 
                   (SELECT COUNT(*) FROM pedidos WHERE cliente_id = c.id) as total_pedidos
            FROM clientes c
            ORDER BY total_gasto DESC
            LIMIT ?
        `).all(limite);
    }
}

module.exports = DashboardAdmin;
