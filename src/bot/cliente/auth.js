const { getDatabase } = require('../../database/connection');
const { gerarCodigo } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class AuthService {
    
    // Gera e salva código de verificação
    static async enviarCodigo(userId) {
        const db = getDatabase();
        const codigo = gerarCodigo();
        
        const existe = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (existe) {
            db.prepare('UPDATE clientes SET codigo_whatsapp = ?, etapa_cadastro = ? WHERE telegram_id = ?')
                .run(codigo, 'verificar', userId);
        } else {
            db.prepare('INSERT INTO clientes (telegram_id, codigo_whatsapp, etapa_cadastro) VALUES (?, ?, ?)')
                .run(userId, codigo, 'verificar');
        }
        
        logger.info(`🔐 Código gerado para ${userId}: ${codigo}`);
        return { sucesso: true, codigo };
    }
    
    // Verifica código
    static async verificarCodigo(userId, codigo) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (!cliente || !cliente.codigo_whatsapp) {
            return { sucesso: false, mensagem: 'Nenhum código pendente. Use /start para recomeçar.' };
        }
        
        if (String(codigo).trim() !== cliente.codigo_whatsapp) {
            return { sucesso: false, mensagem: 'Código incorreto. Tente novamente.' };
        }
        
        db.prepare('UPDATE clientes SET telefone_verificado = 1, codigo_whatsapp = NULL WHERE telegram_id = ?')
            .run(userId);
        
        logger.info(`✅ Código verificado para ${userId}`);
        
        return { 
            sucesso: true, 
            cadastroCompleto: !!(cliente.nome && cliente.sobrenome),
            cliente 
        };
    }
    
    // Reenviar código
    static async reenviarCodigo(userId) {
        return await this.enviarCodigo(userId);
    }
    
    // Login com CPF
    static async loginCPF(userId, cpf) {
        const db = getDatabase();
        const cpfLimpo = String(cpf).replace(/\D/g, '');
        const { validarCPF } = require('../../utils/helpers');
        
        if (!validarCPF(cpfLimpo)) {
            return { sucesso: false, mensagem: 'CPF inválido.' };
        }
        
        const cliente = db.prepare('SELECT * FROM clientes WHERE cpf = ?').get(cpfLimpo);
        if (!cliente) {
            return { sucesso: false, mensagem: 'CPF não encontrado.' };
        }
        if (cliente.bloqueado) {
            return { sucesso: false, mensagem: 'Conta bloqueada.' };
        }
        
        // Vincula o Telegram ID
        db.prepare('UPDATE clientes SET telegram_id = ? WHERE id = ?').run(userId, cliente.id);
        
        return { sucesso: true, cliente };
    }
}

module.exports = AuthService;
