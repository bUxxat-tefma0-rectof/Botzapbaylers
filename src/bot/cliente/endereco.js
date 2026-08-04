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
        
        const { apelido, cep, logradouro, numero, complemento, referencia, bairro, cidade, estado, principal } = dados;
        
        if (!logradouro || !numero || !bairro || !cidade || !estado) {
            return { sucesso: false, mensagem: 'Preencha todos os campos do endereço.' };
        }
        
        // Se for principal, remove principal dos outros
        if (principal) {
            db.prepare('UPDATE enderecos SET principal = 0 WHERE cliente_id = ?').run(cliente.id);
        } else {
            // Se é o primeiro endereço, define como principal
            const total = db.prepare('SELECT COUNT(*) as t FROM enderecos WHERE cliente_id = ?').get(cliente.id).t;
            if (total === 0) {
                dados.principal = 1;
            }
        }
        
        try {
            db.prepare(`INSERT INTO enderecos 
                (cliente_id, apelido, cep, logradouro, numero, complemento, referencia, bairro, cidade, estado, principal)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(
                cliente.id,
                apelido || 'Principal',
                cep ? String(cep).replace(/\D/g, '') : null,
                logradouro,
                String(numero),
                complemento || null,
                referencia || null,
                bairro,
                cidade,
                estado,
                principal ? 1 : 0
            );
            
            logger.info(`📍 Endereço salvo para cliente ${cliente.id}: ${apelido || 'Principal'}`);
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
        
        const enderecos = db.prepare('SELECT * FROM enderecos WHERE cliente_id = ? ORDER BY principal DESC, id ASC').all(cliente.id);
        
        return enderecos.map(e => ({
            ...e,
            cep_formatado: e.cep ? formatarCEP(e.cep) : null,
            endereco_completo: `${e.logradouro}, ${e.numero}${e.complemento ? ' - ' + e.complemento : ''} - ${e.bairro} - ${e.cidade}/${e.estado}`
        }));
    }
    
    // Editar endereço
    static async editarEndereco(userId, enderecoId, dados) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        const endereco = db.prepare('SELECT * FROM enderecos WHERE id = ? AND cliente_id = ?').get(enderecoId, cliente.id);
        if (!endereco) return { sucesso: false, mensagem: 'Endereço não encontrado.' };
        
        const campos = [];
        const valores = [];
        
        if (dados.apelido !== undefined) { campos.push('apelido = ?'); valores.push(dados.apelido); }
        if (dados.cep !== undefined) { campos.push('cep = ?'); valores.push(String(dados.cep).replace(/\D/g, '')); }
        if (dados.logradouro !== undefined) { campos.push('logradouro = ?'); valores.push(dados.logradouro); }
        if (dados.numero !== undefined) { campos.push('numero = ?'); valores.push(String(dados.numero)); }
        if (dados.complemento !== undefined) { campos.push('complemento = ?'); valores.push(dados.complemento); }
        if (dados.referencia !== undefined) { campos.push('referencia = ?'); valores.push(dados.referencia); }
        if (dados.bairro !== undefined) { campos.push('bairro = ?'); valores.push(dados.bairro); }
        if (dados.cidade !== undefined) { campos.push('cidade = ?'); valores.push(dados.cidade); }
        if (dados.estado !== undefined) { campos.push('estado = ?'); valores.push(dados.estado); }
        
        if (campos.length === 0) return { sucesso: false, mensagem: 'Nenhum dado para atualizar.' };
        
        valores.push(enderecoId);
        db.prepare(`UPDATE enderecos SET ${campos.join(', ')} WHERE id = ?`).run(...valores);
        
        return { sucesso: true, mensagem: 'Endereço atualizado!' };
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
        
        const endereco = db.prepare('SELECT * FROM enderecos WHERE id = ? AND cliente_id = ?').get(enderecoId, cliente.id);
        if (!endereco) return { sucesso: false, mensagem: 'Endereço não encontrado.' };
        
        db.prepare('UPDATE enderecos SET principal = 0 WHERE cliente_id = ?').run(cliente.id);
        db.prepare('UPDATE enderecos SET principal = 1 WHERE id = ?').run(enderecoId);
        
        return { sucesso: true, mensagem: 'Endereço principal atualizado!' };
    }
}

module.exports = EnderecoService;
