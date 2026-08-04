const { getDatabase } = require('../../database/connection');
const { formatarMoeda, formatarData } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class CuponsAdmin {
    
    // Listar cupons
    static async listar() {
        const db = getDatabase();
        return db.prepare('SELECT * FROM cupons ORDER BY ativo DESC, id DESC').all();
    }
    
    // Criar cupom
    static async criar(dados) {
        const db = getDatabase();
        const { codigo, tipo, valor, uso_maximo, dias_validade } = dados;
        
        if (!codigo || !valor) return { sucesso: false, mensagem: 'Código e valor são obrigatórios.' };
        
        const existe = db.prepare('SELECT * FROM cupons WHERE codigo = ?').get(codigo.toUpperCase());
        if (existe) return { sucesso: false, mensagem: 'Código já existe.' };
        
        const validade = new Date();
        validade.setDate(validade.getDate() + (parseInt(dias_validade) || 30));
        
        try {
            db.prepare('INSERT INTO cupons (codigo, tipo, valor, uso_maximo, valido_ate) VALUES (?,?,?,?,?)')
            .run(codigo.toUpperCase(), tipo || 'percentual', parseFloat(valor), parseInt(uso_maximo) || 100, validade.toISOString());
            
            logger.info(`🎟 Cupom criado: ${codigo.toUpperCase()}`);
            return { sucesso: true, mensagem: `Cupom ${codigo.toUpperCase()} criado!` };
        } catch (error) {
            return { sucesso: false, mensagem: 'Erro ao criar cupom.' };
        }
    }
    
    // Ativar/desativar
    static async toggle(cupomId) {
        const db = getDatabase();
        const cupom = db.prepare('SELECT * FROM cupons WHERE id = ?').get(cupomId);
        if (!cupom) return { sucesso: false, mensagem: 'Cupom não encontrado.' };
        
        const novo = cupom.ativo ? 0 : 1;
        db.prepare('UPDATE cupons SET ativo = ? WHERE id = ?').run(novo, cupomId);
        
        return { sucesso: true, mensagem: novo ? 'Cupom ativado!' : 'Cupom desativado!' };
    }
    
    // Excluir
    static async excluir(cupomId) {
        const db = getDatabase();
        db.prepare('DELETE FROM cupons WHERE id = ?').run(cupomId);
        return { sucesso: true, mensagem: 'Cupom excluído!' };
    }
    
    // Gerar cupons em lote
    static async gerarLote(prefixo, quantidade, tipo, valor, uso_maximo, dias_validade) {
        const db = getDatabase();
        const cupons = [];
        const validade = new Date();
        validade.setDate(validade.getDate() + (parseInt(dias_validade) || 30));
        
        for (let i = 0; i < parseInt(quantidade); i++) {
            const codigo = `${prefixo.toUpperCase()}${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
            try {
                db.prepare('INSERT INTO cupons (codigo, tipo, valor, uso_maximo, valido_ate) VALUES (?,?,?,?,?)')
                .run(codigo, tipo, parseFloat(valor), parseInt(uso_maximo) || 1, validade.toISOString());
                cupons.push(codigo);
            } catch (e) {}
        }
        
        return { sucesso: true, cupons, mensagem: `${cupons.length} cupons gerados!` };
    }
}

module.exports = CuponsAdmin;
