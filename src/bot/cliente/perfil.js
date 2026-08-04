const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData, formatarCPF, formatarCNPJ, formatarTelefone } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class PerfilService {
    
    // Buscar perfil completo
    static async getPerfil(userId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return null;
        
        const totalPedidos = db.prepare('SELECT COUNT(*) as t FROM pedidos WHERE cliente_id = ?').get(cliente.id).t;
        const ultimoPedido = db.prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY data_pedido DESC LIMIT 1').get(cliente.id);
        
        const enderecos = db.prepare('SELECT * FROM enderecos WHERE cliente_id = ?').all(cliente.id);
        const favoritos = db.prepare('SELECT COUNT(*) as t FROM favoritos WHERE cliente_id = ?').get(cliente.id).t;
        
        return {
            ...cliente,
            cpf_formatado: cliente.cpf ? formatarCPF(cliente.cpf) : null,
            cnpj_formatado: cliente.cnpj ? formatarCNPJ(cliente.cnpj) : null,
            telefone_formatado: cliente.telefone ? formatarTelefone(cliente.telefone) : null,
            totalPedidos,
            ultimoPedido,
            enderecos,
            totalFavoritos: favoritos,
            data_cadastro_formatada: formatarData(cliente.data_cadastro),
            total_gasto_formatado: formatarMoeda(cliente.total_gasto)
        };
    }
    
    // Atualizar dados pessoais
    static async atualizarDados(userId, dados) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        const campos = [];
        const valores = [];
        
        if (dados.nome) { campos.push('nome = ?'); valores.push(dados.nome.trim()); }
        if (dados.sobrenome) { campos.push('sobrenome = ?'); valores.push(dados.sobrenome.trim()); }
        if (dados.email) { campos.push('email = ?'); valores.push(dados.email.toLowerCase().trim()); }
        if (dados.sexo) { campos.push('sexo = ?'); valores.push(dados.sexo); }
        if (dados.data_nascimento) { campos.push('data_nascimento = ?'); valores.push(dados.data_nascimento); }
        
        if (campos.length === 0) return { sucesso: false, mensagem: 'Nenhum dado para atualizar.' };
        
        valores.push(userId);
        db.prepare(`UPDATE clientes SET ${campos.join(', ')} WHERE telegram_id = ?`).run(...valores);
        
        logger.info(`✏️ Perfil atualizado: ${userId}`);
        return { sucesso: true, mensagem: 'Dados atualizados com sucesso!' };
    }
    
    // Alterar senha
    static async alterarSenha(userId, senhaAtual, novaSenha) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        if (cliente.senha && cliente.senha !== senhaAtual) {
            return { sucesso: false, mensagem: 'Senha atual incorreta.' };
        }
        
        if (!novaSenha || novaSenha.length < 6) {
            return { sucesso: false, mensagem: 'Nova senha deve ter no mínimo 6 caracteres.' };
        }
        
        db.prepare('UPDATE clientes SET senha = ? WHERE telegram_id = ?').run(novaSenha, userId);
        return { sucesso: true, mensagem: 'Senha alterada com sucesso!' };
    }
    
    // Cashback e pontos
    static async getCashback(userId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT pontos_fidelidade, total_gasto FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { pontos: 0, cashback: 0 };
        
        // 1 ponto = R$ 0,05 de cashback
        const cashback = cliente.pontos_fidelidade * 0.05;
        
        return {
            pontos: cliente.pontos_fidelidade,
            cashback: formatarMoeda(cashback),
            totalGasto: formatarMoeda(cliente.total_gasto)
        };
    }
    
    // Resgatar cashback
    static async resgatarCashback(userId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT pontos_fidelidade FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        if (cliente.pontos_fidelidade < 100) {
            return { sucesso: false, mensagem: 'Mínimo 100 pontos para resgatar.' };
        }
        
        const cashback = cliente.pontos_fidelidade * 0.05;
        db.prepare('UPDATE clientes SET pontos_fidelidade = 0 WHERE telegram_id = ?').run(userId);
        
        // Cria cupom de cashback
        const codigo = 'CASH' + Date.now().toString().slice(-6);
        db.prepare('INSERT INTO cupons (codigo, tipo, valor, uso_maximo, valido_ate) VALUES (?, ?, ?, 1, ?)').run(codigo, 'fixo', cashback, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
        
        return {
            sucesso: true,
            cashback: formatarMoeda(cashback),
            cupom: codigo,
            mensagem: `Cashback de ${formatarMoeda(cashback)} resgatado! Use o cupom: ${codigo}`
        };
    }
    
    // Deletar conta
    static async deletarConta(userId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        // Verifica pedidos pendentes
        const pendentes = db.prepare("SELECT COUNT(*) as t FROM pedidos WHERE cliente_id = ? AND status NOT IN ('entregue', 'cancelado')").get(cliente.id).t;
        if (pendentes > 0) return { sucesso: false, mensagem: 'Você possui pedidos pendentes. Aguarde a conclusão.' };
        
        db.prepare('DELETE FROM favoritos WHERE cliente_id = ?').run(cliente.id);
        db.prepare('DELETE FROM carrinhos WHERE cliente_id = ?').run(cliente.id);
        db.prepare('DELETE FROM enderecos WHERE cliente_id = ?').run(cliente.id);
        db.prepare('DELETE FROM clientes WHERE id = ?').run(cliente.id);
        
        logger.info(`🗑 Conta deletada: ${userId}`);
        return { sucesso: true, mensagem: 'Conta deletada com sucesso.' };
    }
}

module.exports = PerfilService;
