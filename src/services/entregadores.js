const { getDatabase } = require('../database/connection');
const logger = require('../utils/logger');

class EntregadoresService {
    
    // Cadastrar entregador
    static async cadastrar(dados) {
        const db = getDatabase();
        const { nome, telefone, veiculo, placa, ativo } = dados;
        
        if (!nome || !telefone) return { sucesso: false, mensagem: 'Nome e telefone são obrigatórios.' };
        
        try {
            const result = db.prepare('INSERT INTO entregadores (nome, telefone, veiculo, placa, ativo) VALUES (?,?,?,?,?)').run(nome, String(telefone).replace(/\D/g,''), veiculo || 'Moto', placa || null, ativo !== undefined ? ativo : 1);
            
            logger.info(`🛵 Entregador cadastrado: ${nome}`);
            return { sucesso: true, id: result.lastInsertRowid, mensagem: 'Entregador cadastrado!' };
        } catch (error) {
            return { sucesso: false, mensagem: 'Erro ao cadastrar.' };
        }
    }
    
    // Listar entregadores
    static async listar() {
        const db = getDatabase();
        return db.prepare('SELECT * FROM entregadores ORDER BY ativo DESC, nome').all();
    }
    
    // Atribuir entrega
    static async atribuirEntrega(pedidoId, entregadorId) {
        const db = getDatabase();
        
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
        if (!pedido) return { sucesso: false, mensagem: 'Pedido não encontrado.' };
        
        const entregador = db.prepare('SELECT * FROM entregadores WHERE id = ? AND ativo = 1').get(entregadorId);
        if (!entregador) return { sucesso: false, mensagem: 'Entregador não encontrado.' };
        
        db.prepare('UPDATE pedidos SET entregador_id = ?, status = ? WHERE id = ?').run(entregadorId, 'entrega', pedidoId);
        
        logger.info(`🛵 Pedido ${pedido.numero} atribuído para ${entregador.nome}`);
        return { sucesso: true, mensagem: `Entrega atribuída para ${entregador.nome}!` };
    }
    
    // Finalizar entrega
    static async finalizarEntrega(pedidoId) {
        const db = getDatabase();
        
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
        if (!pedido) return { sucesso: false, mensagem: 'Pedido não encontrado.' };
        
        db.prepare('UPDATE pedidos SET status = ?, data_entrega = datetime("now") WHERE id = ?').run('entregue', pedidoId);
        
        logger.info(`✅ Pedido ${pedido.numero} entregue`);
        return { sucesso: true, mensagem: 'Entrega finalizada!' };
    }
    
    // Entregas do dia para um entregador
    static async getEntregasDoDia(entregadorId) {
        const db = getDatabase();
        return db.prepare(`
            SELECT p.*, c.nome as cliente_nome, e.logradouro, e.numero, e.bairro, e.cidade
            FROM pedidos p
            JOIN clientes c ON p.cliente_id = c.id
            LEFT JOIN enderecos e ON p.endereco_id = e.id
            WHERE p.entregador_id = ? AND date(p.data_pedido) = date('now')
            ORDER BY p.data_pedido
        `).all(entregadorId);
    }
    
    // Ativar/Desativar entregador
    static async toggleEntregador(entregadorId) {
        const db = getDatabase();
        const e = db.prepare('SELECT * FROM entregadores WHERE id = ?').get(entregadorId);
        if (!e) return { sucesso: false, mensagem: 'Entregador não encontrado.' };
        
        db.prepare('UPDATE entregadores SET ativo = ? WHERE id = ?').run(e.ativo ? 0 : 1, entregadorId);
        return { sucesso: true, mensagem: e.ativo ? 'Entregador desativado!' : 'Entregador ativado!' };
    }
}

module.exports = EntregadoresService;
