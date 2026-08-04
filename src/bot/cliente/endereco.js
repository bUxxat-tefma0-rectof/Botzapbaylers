const { getDatabase } = require('../../database/connection');
const { consultarCEP } = require('../../services/cep');
const { formatarCEP } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class EnderecoService {
    
    // Buscar CEP
    static async buscarCEP(cep) {
        const resultado = await consultarCEP(cep);
        if (!resultado.sucesso) return resultado;
        
        const { logradouro, bairro, localidade, uf, complemento } = resultado.dados;
        
        return {
            sucesso: true,
            dados: {
                logradouro: logradouro || '',
                bairro: bairro || '',
                cidade: localidade || '',
                estado: uf || '',
                complemento: complemento || '',
                cep: formatarCEP(cep)
            }
        };
    }
    
    // Salvar endereço
    static async salvarEndereco(userId, dados) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        const { apelido, cep, logradouro, numero, complemento, referencia, bairro, cidade, estado } = dados;
        
        // Se for o primeiro endereço, define como principal
        const total = db.prepare('SELECT COUNT(*) as t FROM enderecos WHERE cliente_id = ?').get(cliente.id).t;
        const principal = dados.principal || (total === 0 ? 1 : 0);
        
        // Se definir como principal, remove principal dos outros
        if (principal) {
            db.prepare('UPDATE enderecos SET principal = 0 WHERE cliente_id = ?').run(cliente.id);
        }
        
        try {
            db.prepare(`INSERT INTO enderecos 
                (cliente_id, apelido, cep, logradouro, numero, complemento, referencia, bairro, cidade, estado, principal)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(cliente.id, apelido || 'Principal', cep, logradouro, numero, complemento, referencia, bairro, cidade, estado, principal);
            
            logger.info(`📍 Endereço salvo para cliente ${cliente.id}`);
            return { sucesso: true, mensagem: 'Endereço salvo com sucesso!' };
        } catch (error) {
            logger.error('Erro ao salvar endereço: ' + error.message);
            return { sucesso: false, mensagem: 'Erro ao salvar endereço.' };
        }
    }
    
    // Listar endereços
    static async listarEnderecos(userId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (!cliente) return [];
        
        return db.prepare('SELECT * FROM enderecos WHERE cliente_id = ? ORDER BY principal DESC').all(cliente.id);
    }
    
    // Deletar endereço
    static async deletarEndereco(userId, enderecoId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        const endereco = db.prepare('SELECT * FROM enderecos WHERE id = ? AND cliente_id = ?').get(enderecoId, cliente.id);
        if (!endereco) return { sucesso: false, mensagem: 'Endereço não encontrado.' };
        
        db.prepare('DELETE FROM enderecos WHERE id = ?').run(enderecoId);
        
        // Se era principal, define outro como principal
        if (endereco.principal) {
            const outro = db.prepare('SELECT id FROM enderecos WHERE cliente_id = ? LIMIT 1').get(cliente.id);
            if (outro) db.prepare('UPDATE enderecos SET principal = 1 WHERE id = ?').run(outro.id);
        }
        
        return { sucesso: true, mensagem: 'Endereço removido!' };
    }
    
    // Definir como principal
    static async definirPrincipal(userId, enderecoId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        db.prepare('UPDATE enderecos SET principal = 0 WHERE cliente_id = ?').run(cliente.id);
        db.prepare('UPDATE enderecos SET principal = 1 WHERE id = ? AND cliente_id = ?').run(enderecoId, cliente.id);
        
        return { sucesso: true, mensagem: 'Endereço principal atualizado!' };
    }
}

module.exports = EnderecoService;
