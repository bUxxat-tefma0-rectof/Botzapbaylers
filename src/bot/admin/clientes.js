const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData, formatarCPF, formatarCNPJ, formatarTelefone } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class ClientesAdmin {
    
    static async listar(pagina = 1, limite = 20, busca = '') {
        const db = getDatabase();
        const offset = (pagina - 1) * limite;
        let where = '';
        const params = [];
        
        if (busca) {
            where = 'WHERE (nome LIKE ? OR telefone LIKE ? OR cpf LIKE ? OR email LIKE ?)';
            const termo = `%${busca}%`;
            params.push(termo, termo, termo, termo);
        }
        
        const total = db.prepare(`SELECT COUNT(*) as t FROM clientes ${where}`).get(...params).t;
        
        const clientes = db.prepare(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM pedidos WHERE cliente_id = c.id) as total_pedidos,
                   (SELECT MAX(data_pedido) FROM pedidos WHERE cliente_id = c.id) as ultimo_pedido
            FROM clientes c
            ${where}
            ORDER BY c.total_gasto DESC
            LIMIT ? OFFSET ?
        `).all(...params, limite, offset);
        
        return { clientes, total, pagina, totalPaginas: Math.ceil(total / limite) };
    }
    
    static async detalhes(clienteId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
        if (!cliente) return null;
        
        const pedidos = db.prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY data_pedido DESC LIMIT 20').all(clienteId);
        const enderecos = db.prepare('SELECT * FROM enderecos WHERE cliente_id = ?').all(clienteId);
        const totalPedidos = db.prepare('SELECT COUNT(*) as t FROM pedidos WHERE cliente_id = ?').get(clienteId).t;
        const totalGasto = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM pedidos WHERE cliente_id = ? AND pagamento_status = 'approved'").get(clienteId).t;
        const avaliacaoMedia = db.prepare('SELECT COALESCE(AVG(nota), 0) as media FROM avaliacoes WHERE cliente_id = ?').get(clienteId).media;
        
        return {
            ...cliente,
            cpf_formatado: cliente.cpf ? formatarCPF(cliente.cpf) : null,
            cnpj_formatado: cliente.cnpj ? formatarCNPJ(cliente.cnpj) : null,
            telefone_formatado: cliente.telefone ? formatarTelefone(cliente.telefone) : null,
            totalPedidos,
            totalGasto: formatarMoeda(totalGasto),
            mediaAvaliacao: avaliacaoMedia.toFixed(1),
            ultimosPedidos: pedidos,
            enderecos,
            data_cadastro_formatada: formatarData(cliente.data_cadastro)
        };
    }
    
    static async toggleBloqueio(clienteId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        const novo = cliente.bloqueado ? 0 : 1;
        db.prepare('UPDATE clientes SET bloqueado = ? WHERE id = ?').run(novo, clienteId);
        
        logger.info(`${novo ? '🚫 Bloqueado' : '✅ Desbloqueado'}: ${cliente.nome}`);
        return { sucesso: true, mensagem: novo ? 'Cliente bloqueado!' : 'Cliente desbloqueado!' };
    }
    
    static async enviarMensagem(clienteId, mensagem) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT telegram_id, nome FROM clientes WHERE id = ?').get(clienteId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        try {
            const clientBot = require('../cliente/index').getBot();
            if (clientBot) {
                await clientBot.sendMessage(cliente.telegram_id, `📢 *Mensagem do ${process.env.NOME_MERCADO || 'Supermercado'}*\n\n${mensagem}`, { parse_mode: 'Markdown' });
                return { sucesso: true, mensagem: 'Mensagem enviada!' };
            }
        } catch (e) {
            return { sucesso: false, mensagem: 'Erro ao enviar.' };
        }
    }
}

module.exports = ClientesAdmin;
