const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class PromocoesAdmin {
    
    // Listar promoções
    static async listar() {
        const db = getDatabase();
        return db.prepare(`
            SELECT pr.*, 
                   CASE WHEN pr.categoria_id IS NOT NULL THEN (SELECT nome FROM categorias WHERE id = pr.categoria_id)
                        WHEN pr.produto_id IS NOT NULL THEN (SELECT nome FROM produtos WHERE id = pr.produto_id)
                        ELSE 'Geral'
                   END as alvo_nome
            FROM promocoes pr
            ORDER BY pr.ativo DESC, pr.data_inicio DESC
        `).all();
    }
    
    // Criar promoção
    static async criar(dados) {
        const db = getDatabase();
        const { nome, tipo, valor, categoria_id, produto_id, bairro, data_inicio, data_fim, horario_inicio, horario_fim } = dados;
        
        if (!nome) return { sucesso: false, mensagem: 'Nome da promoção é obrigatório.' };
        
        try {
            db.prepare(`INSERT INTO promocoes (nome, tipo, valor, categoria_id, produto_id, bairro, data_inicio, data_fim, horario_inicio, horario_fim)
                VALUES (?,?,?,?,?,?,?,?,?,?)`)
            .run(nome, tipo, valor, categoria_id, produto_id, bairro, data_inicio, data_fim, horario_inicio, horario_fim);
            
            logger.info(`🎉 Promoção criada: ${nome}`);
            return { sucesso: true, mensagem: 'Promoção criada!' };
        } catch (error) {
            return { sucesso: false, mensagem: 'Erro ao criar promoção.' };
        }
    }
    
    // Ativar/desativar promoção
    static async toggle(promocaoId) {
        const db = getDatabase();
        const promo = db.prepare('SELECT * FROM promocoes WHERE id = ?').get(promocaoId);
        if (!promo) return { sucesso: false, mensagem: 'Promoção não encontrada.' };
        
        const novo = promo.ativo ? 0 : 1;
        db.prepare('UPDATE promocoes SET ativo = ? WHERE id = ?').run(novo, promocaoId);
        
        return { sucesso: true, mensagem: novo ? 'Promoção ativada!' : 'Promoção desativada!' };
    }
    
    // Excluir promoção
    static async excluir(promocaoId) {
        const db = getDatabase();
        db.prepare('DELETE FROM promocoes WHERE id = ?').run(promocaoId);
        return { sucesso: true, mensagem: 'Promoção excluída!' };
    }
    
    // Aplicar promoção em lote (vários produtos)
    static async aplicarEmLote(categoriaId, descontoPercentual) {
        const db = getDatabase();
        const produtos = db.prepare('SELECT * FROM produtos WHERE categoria_id = ?').all(categoriaId);
        
        let atualizados = 0;
        for (const p of produtos) {
            const novoPreco = p.preco * (1 - descontoPercentual / 100);
            db.prepare('UPDATE produtos SET preco_promocional = ? WHERE id = ?').run(novoPreco, p.id);
            atualizados++;
        }
        
        return { sucesso: true, mensagem: `${atualizados} produtos atualizados com ${descontoPercentual}% de desconto!` };
    }
    
    // Remover todas as promoções de uma categoria
    static async limparCategoria(categoriaId) {
        const db = getDatabase();
        db.prepare('UPDATE produtos SET preco_promocional = NULL WHERE categoria_id = ?').run(categoriaId);
        return { sucesso: true, mensagem: 'Promoções removidas da categoria!' };
    }
}

module.exports = PromocoesAdmin;
