const { getDatabase } = require('../../database/connection');
const { formatarMoeda } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class ConfigAdmin {
    
    // Buscar todas as configurações
    static async getTodas() {
        const db = getDatabase();
        const configs = {};
        const rows = db.prepare('SELECT * FROM configs').all();
        for (const row of rows) {
            configs[row.chave] = row.valor;
        }
        return configs;
    }
    
    // Buscar uma configuração específica
    static async get(chave) {
        const db = getDatabase();
        const config = db.prepare('SELECT * FROM configs WHERE chave = ?').get(chave);
        return config?.valor || null;
    }
    
    // Salvar configuração
    static async set(chave, valor) {
        const db = getDatabase();
        const existe = db.prepare('SELECT * FROM configs WHERE chave = ?').get(chave);
        
        if (existe) {
            db.prepare('UPDATE configs SET valor = ? WHERE chave = ?').run(String(valor), chave);
        } else {
            db.prepare('INSERT INTO configs (chave, valor) VALUES (?, ?)').run(chave, String(valor));
        }
        
        return { sucesso: true, mensagem: 'Configuração salva!' };
    }
    
    // Configurações do mercado
    static async configurarMercado(dados) {
        const { nome, logo, banner, telefone, whatsapp, email, endereco, cnpj } = dados;
        
        if (nome) await this.set('nome_mercado', nome);
        if (logo) await this.set('logo_mercado', logo);
        if (banner) await this.set('banner_mercado', banner);
        if (telefone) await this.set('telefone_mercado', telefone);
        if (whatsapp) await this.set('whatsapp_mercado', whatsapp);
        if (email) await this.set('email_mercado', email);
        if (endereco) await this.set('endereco_mercado', endereco);
        if (cnpj) await this.set('cnpj_mercado', cnpj);
        
        logger.info('⚙️ Configurações do mercado atualizadas');
        return { sucesso: true, mensagem: 'Configurações salvas!' };
    }
    
    // Configurar entregas
    static async configurarEntregas(dados) {
        const { taxa_entrega_padrao, pedido_minimo, raio_entrega, tempo_estimado } = dados;
        
        if (taxa_entrega_padrao) await this.set('taxa_entrega_padrao', taxa_entrega_padrao);
        if (pedido_minimo) await this.set('pedido_minimo', pedido_minimo);
        if (raio_entrega) await this.set('raio_entrega', raio_entrega);
        if (tempo_estimado) await this.set('tempo_estimado', tempo_estimado);
        
        return { sucesso: true, mensagem: 'Configurações de entrega salvas!' };
    }
    
    // Configurar horários de funcionamento
    static async configurarHorarios(horarios) {
        const db = getDatabase();
        
        // Limpa horários existentes
        db.prepare('DELETE FROM horarios_entrega').run();
        
        // Insere novos horários
        const insert = db.prepare('INSERT INTO horarios_entrega (dia_semana, horario, disponivel) VALUES (?, ?, ?)');
        
        for (const h of horarios) {
            insert.run(h.dia, h.horario, h.disponivel ? 1 : 0);
        }
        
        return { sucesso: true, mensagem: 'Horários atualizados!' };
    }
    
    // Listar horários
    static async getHorarios() {
        const db = getDatabase();
        return db.prepare('SELECT * FROM horarios_entrega ORDER BY dia_semana, horario').all();
    }
    
    // Configurar PIX
    static async configurarPix(dados) {
        const { chave_pix, nome_recebedor, cidade_recebedor, tempo_expiracao } = dados;
        
        if (chave_pix) await this.set('chave_pix', chave_pix);
        if (nome_recebedor) await this.set('nome_recebedor_pix', nome_recebedor);
        if (cidade_recebedor) await this.set('cidade_recebedor_pix', cidade_recebedor);
        if (tempo_expiracao) await this.set('tempo_expiracao_pix', tempo_expiracao);
        
        return { sucesso: true, mensagem: 'PIX configurado!' };
    }
    
    // Configurar mensagens automáticas
    static async configurarMensagens(dados) {
        const { bemvindo, pedido_confirmado, pedido_entrega, pedido_entregue, pedido_cancelado } = dados;
        
        if (bemvindo) await this.set('msg_bemvindo', bemvindo);
        if (pedido_confirmado) await this.set('msg_pedido_confirmado', pedido_confirmado);
        if (pedido_entrega) await this.set('msg_pedido_entrega', pedido_entrega);
        if (pedido_entregue) await this.set('msg_pedido_entregue', pedido_entregue);
        if (pedido_cancelado) await this.set('msg_pedido_cancelado', pedido_cancelado);
        
        return { sucesso: true, mensagem: 'Mensagens atualizadas!' };
    }
    
    // Backup do banco de dados
    static async backup() {
        const db = getDatabase();
        const fs = require('fs');
        const path = require('path');
        
        const backupDir = path.join(__dirname, '../../../backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        
        const data = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `backup-${data}.db`);
        
        try {
            db.backup(backupPath);
            logger.info(`💾 Backup criado: ${backupPath}`);
            return { sucesso: true, mensagem: 'Backup criado!', arquivo: backupPath };
        } catch (error) {
            return { sucesso: false, mensagem: 'Erro ao criar backup.' };
        }
    }
    
    // Restaurar backup
    static async restaurar(arquivo) {
        try {
            const db = getDatabase();
            db.close();
            
            const fs = require('fs');
            const dbPath = process.env.DATABASE_PATH || './supermercado.db';
            
            fs.copyFileSync(arquivo, dbPath);
            logger.info('🔄 Backup restaurado');
            
            return { sucesso: true, mensagem: 'Backup restaurado! Reinicie o bot.' };
        } catch (error) {
            return { sucesso: false, mensagem: 'Erro ao restaurar.' };
        }
    }
    
    // Limpar logs
    static async limparLogs() {
        const db = getDatabase();
        db.prepare('DELETE FROM logs').run();
        return { sucesso: true, mensagem: 'Logs limpos!' };
    }
    
    // Configurar tema/cores
    static async configurarTema(dados) {
        const { cor_principal, cor_secundaria, cor_fundo, cor_texto, cor_botoes } = dados;
        
        if (cor_principal) await this.set('cor_principal', cor_principal);
        if (cor_secundaria) await this.set('cor_secundaria', cor_secundaria);
        if (cor_fundo) await this.set('cor_fundo', cor_fundo);
        if (cor_texto) await this.set('cor_texto', cor_texto);
        if (cor_botoes) await this.set('cor_botoes', cor_botoes);
        
        return { sucesso: true, mensagem: 'Tema atualizado!' };
    }
}

module.exports = ConfigAdmin;
