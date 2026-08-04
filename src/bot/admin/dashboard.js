const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class DashboardAdmin {
    
    static async getEstatisticas() {
        const db = getDatabase();
        
        const totalClientes = db.prepare('SELECT COUNT(*) as t FROM clientes').get().t;
        const clientesAtivos = db.prepare("SELECT COUNT(*) as t FROM clientes WHERE data_cadastro >= date('now', '-30 days')").get().t;
        const clientesBloqueados = db.prepare('SELECT COUNT(*) as t FROM clientes WHERE bloqueado = 1').get().t;
        
        const totalPedidos = db.prepare('SELECT COUNT(*) as t FROM pedidos').get().t;
        const pedidosHoje = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE date(data_pedido) = date('now')").get().t;
        const pedidosMes = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now')").get().t;
        const pedidosPendentes = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE status IN ('recebido', 'confirmado', 'separando', 'embalando')").get().t;
        const pedidosEntrega = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE status = 'entrega'").get().t;
        const pedidosEntregues = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE status = 'entregue'").get().t;
        const pedidosCancelados = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE status = 'cancelado'").get().t;
        
        const faturamentoTotal = db.prepare("SELECT COALESCE(SUM(total), 0) as t FROM pedidos WHERE pagamento_status = 'approved'").get().t;
        const faturamentoHoje = db.prepare("SELECT COALESCE(SUM(total), 0) as t FROM pedidos WHERE pagamento_status = 'approved' AND date(data_pedido) = date('now')").get().t;
        const faturamentoMes = db.prepare("SELECT COALESCE(SUM(total), 0) as t FROM pedidos WHERE pagamento_status = 'approved' AND strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now')").get().t;
        const faturamentoOntem = db.prepare("SELECT COALESCE(SUM(total), 0) as t FROM pedidos WHERE pagamento_status = 'approved' AND date(data_pedido) = date('now', '-1 day')").get().t;
        
        const ticketMedio = totalPedidos > 0 ? faturamentoTotal / totalPedidos : 0;
        
        const totalProdutos = db.prepare('SELECT COUNT(*) as t FROM produtos WHERE disponivel = 1').get().t;
        const produtosEstoqueBaixo = db.prepare('SELECT COUNT(*) as t FROM produtos WHERE estoque < 10 AND disponivel = 1').get().t;
        const produtosSemEstoque = db.prepare('SELECT COUNT(*) as t FROM produtos WHERE estoque <= 0 AND disponivel = 1').get().t;
        
        const totalCupons = db.prepare('SELECT COUNT(*) as t FROM cupons WHERE ativo = 1').get().t;
        const totalPromocoes = db.prepare('SELECT COUNT(*) as t FROM promocoes WHERE ativo = 1').get().t;
        const totalEntregadores = db.prepare('SELECT COUNT(*) as t FROM entregadores WHERE ativo = 1').get().t;
        
        const avaliacaoMedia = db.prepare('SELECT COALESCE(AVG(nota), 0) as media FROM avaliacoes').get().media;
        const totalAvaliacoes = db.prepare('SELECT COUNT(*) as t FROM avaliacoes').get().t;
        
        return {
            clientes: { total: totalClientes, ativos: clientesAtivos, bloqueados: clientesBloqueados },
            pedidos: { total: totalPedidos, hoje: pedidosHoje, mes: pedidosMes, pendentes: pedidosPendentes, emEntrega: pedidosEntrega, entregues: pedidosEntregues, cancelados: pedidosCancelados },
            faturamento: { total: formatarMoeda(faturamentoTotal), hoje: formatarMoeda(faturamentoHoje), ontem: formatarMoeda(faturamentoOntem), mes: formatarMoeda(faturamentoMes) },
            ticketMedio: formatarMoeda(ticketMedio),
            produtos: { total: totalProdutos, estoqueBaixo: produtosEstoqueBaixo, semEstoque: produtosSemEstoque },
            marketing: { cupons: totalCupons, promocoes: totalPromocoes },
            entregadores: totalEntregadores,
            avaliacoes: { media: avaliacaoMedia.toFixed(1), total: totalAvaliacoes }
        };
    }
    
    static async getGraficoVendas(periodo = 'semana') {
        const db = getDatabase();
        let query;
        
        switch (periodo) {
            case 'hoje':
                query = "SELECT strftime('%H', data_pedido) as label, COUNT(*) as total, COALESCE(SUM(total), 0) as valor FROM pedidos WHERE pagamento_status = 'approved' AND date(data_pedido) = date('now') GROUP BY strftime('%H', data_pedido) ORDER BY label";
                break;
            case 'semana':
                query = "SELECT strftime('%w', data_pedido) as label, COUNT(*) as total, COALESCE(SUM(total), 0) as valor FROM pedidos WHERE pagamento_status = 'approved' AND data_pedido >= date('now', '-7 days') GROUP BY strftime('%w', data_pedido) ORDER BY label";
                break;
            case 'mes':
                query = "SELECT strftime('%d', data_pedido) as label, COUNT(*) as total, COALESCE(SUM(total), 0) as valor FROM pedidos WHERE pagamento_status = 'approved' AND strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now') GROUP BY strftime('%d', data_pedido) ORDER BY label";
                break;
            case 'ano':
                query = "SELECT strftime('%m', data_pedido) as label, COUNT(*) as total, COALESCE(SUM(total), 0) as valor FROM pedidos WHERE pagamento_status = 'approved' AND strftime('%Y', data_pedido) = strftime('%Y', 'now') GROUP BY strftime('%m', data_pedido) ORDER BY label";
                break;
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
            SELECT nome, telefone, total_gasto, pontos_fidelidade,
                   (SELECT COUNT(*) FROM pedidos WHERE cliente_id = c.id) as total_pedidos
            FROM clientes c
            ORDER BY total_gasto DESC
            LIMIT ?
        `).all(limite);
    }
    
    static async getResumoRapido() {
        const db = getDatabase();
        
        const pedidosPendentes = db.prepare("SELECT * FROM pedidos WHERE status IN ('recebido', 'confirmado') AND pagamento_status = 'approved' ORDER BY data_pedido ASC LIMIT 5").all();
        const produtosAcabando = db.prepare('SELECT * FROM produtos WHERE estoque <= 5 AND estoque > 0 AND disponivel = 1 ORDER BY estoque ASC LIMIT 5').all();
        const ultimosPedidos = db.prepare('SELECT p.*, c.nome FROM pedidos p JOIN clientes c ON p.cliente_id = c.id ORDER BY p.data_pedido DESC LIMIT 5').all();
        
        return { pedidosPendentes, produtosAcabando, ultimosPedidos };
    }
}

module.exports = DashboardAdmin;
