const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData, formatarCPF, formatarCNPJ, formatarTelefone } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class ClientesAdmin {
    
    // Listar clientes
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
    
    // Detalhes do cliente
    static async detalhes(clienteId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
        if (!cliente) return null;
        
        const pedidos = db.prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY data_pedido DESC LIMIT 20').all(clienteId);
        const enderecos = db.prepare('SELECT * FROM enderecos WHERE cliente_id = ?').all(clienteId);
        const favoritos = db.prepare('SELECT COUNT(*) as t FROM favoritos WHERE cliente_id = ?').get(clienteId).t;
        const avaliacoes = db.prepare('SELECT AVG(nota) as media, COUNT(*) as t FROM avaliacoes WHERE cliente_id = ?').get(clienteId);
        
        const totalPedidos = db.prepare('SELECT COUNT(*) as t FROM pedidos WHERE cliente_id = ?').get(clienteId).t;
        const totalGasto = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM pedidos WHERE cliente_id = ? AND pagamento_status = 'approved'").get(clienteId).t;
        
        return {
            ...cliente,
            cpf_formatado: cliente.cpf ? formatarCPF(cliente.cpf) : null,
            cnpj_formatado: cliente.cnpj ? formatarCNPJ(cliente.cnpj) : null,
            telefone_formatado: cliente.telefone ? formatarTelefone(cliente.telefone) : null,
            totalPedidos,
            totalGasto: formatarMoeda(totalGasto),
            pontos: cliente.pontos_fidelidade,
            ultimosPedidos: pedidos,
            enderecos,
            totalFavoritos: favoritos,
            mediaAvaliacao: avaliacoes?.media?.toFixed(1) || 'N/A',
            data_cadastro_formatada: formatarData(cliente.data_cadastro)
        };
    }
    
    // Bloquear/desbloquear cliente
    static async toggleBloqueio(clienteId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        const novo = cliente.bloqueado ? 0 : 1;
        db.prepare('UPDATE clientes SET bloqueado = ? WHERE id = ?').run(novo, clienteId);
        
        logger.info(`${novo ? '🚫 Bloqueado' : '✅ Desbloqueado'}: ${cliente.nome}`);
        return { sucesso: true, mensagem: novo ? 'Cliente bloqueado!' : 'Cliente desbloqueado!' };
    }
    
    // Adicionar créditos/pontos
    static async adicionarPontos(clienteId, pontos) {
        const db = getDatabase();
        db.prepare('UPDATE clientes SET pontos_fidelidade = pontos_fidelidade + ? WHERE id = ?').run(pontos, clienteId);
        return { sucesso: true, mensagem: `${pontos} pontos adicionados!` };
    }
    
    // Histórico completo do cliente
    static async historicoCompleto(clienteId) {
        const db = getDatabase();
        const pedidos = db.prepare(`
            SELECT p.*, COUNT(ip.id) as total_itens
            FROM pedidos p
            LEFT JOIN itens_pedido ip ON p.id = ip.pedido_id
            WHERE p.cliente_id = ?
            GROUP BY p.id
            ORDER BY p.data_pedido DESC
        `).all(clienteId);
        
        const produtosMaisComprados = db.prepare(`
            SELECT ip.produto_nome, COUNT(*) as vezes, SUM(ip.quantidade) as total_qtd, SUM(ip.preco_unitario * ip.quantidade) as total_gasto
            FROM itens_pedido ip
            JOIN pedidos p ON ip.pedido_id = p.id
            WHERE p.cliente_id = ?
            GROUP BY ip.produto_nome
            ORDER BY vezes DESC
            LIMIT 20
        `).all(clienteId);
        
        const gastosPorMes = db.prepare(`
            SELECT strftime('%Y-%m', data_pedido) as mes, COUNT(*) as pedidos, SUM(total) as valor
            FROM pedidos
            WHERE cliente_id = ? AND pagamento_status = 'approved'
            GROUP BY strftime('%Y-%m', data_pedido)
            ORDER BY mes DESC
            LIMIT 12
        `).all(clienteId);
        
        return { pedidos, produtosMaisComprados, gastosPorMes };
    }
    
    // Enviar mensagem para cliente
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
            return { sucesso: false, mensagem: 'Erro ao enviar mensagem.' };
        }
    }
    
    // Exportar lista de clientes
    static async exportar() {
        const db = getDatabase();
        return db.prepare(`
            SELECT nome, sobrenome, cpf, cnpj, telefone, email, total_gasto, pontos_fidelidade, data_cadastro
            FROM clientes
            ORDER BY total_gasto DESC
        `).all();
    }
}

module.exports = ClientesAdmin;
