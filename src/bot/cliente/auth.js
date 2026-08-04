const { getDatabase } = require('../../database/connection');
const { enviarCodigoWhatsApp } = require('../../services/whatsapp');
const { gerarCodigo, formatarTelefone, validarCPF, validarCNPJ } = require('../../utils/helpers');
const ValidacaoService = require('../../services/validacao');
const logger = require('../../utils/logger');

class AuthService {
    
    // Envia código via WhatsApp
    static async enviarCodigo(chatId, userId, telefone) {
        const db = getDatabase();
        const telLimpo = String(telefone).replace(/\D/g, '');
        
        const validacao = ValidacaoService.validarTelefone(telefone);
        if (!validacao.valido) {
            return { sucesso: false, mensagem: validacao.msg };
        }
        
        const codigo = gerarCodigo();
        
        // Salva no banco
        const existe = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (existe) {
            db.prepare('UPDATE clientes SET telefone = ?, codigo_whatsapp = ? WHERE telegram_id = ?').run(telLimpo, codigo, userId);
        } else {
            db.prepare('INSERT INTO clientes (telegram_id, telefone, codigo_whatsapp) VALUES (?, ?, ?)').run(userId, telLimpo, codigo);
        }
        
        // Envia via WhatsApp
        try {
            await enviarCodigoWhatsApp(telLimpo, codigo);
            logger.info(`📱 Código enviado para ${telLimpo}`);
            return { sucesso: true, telefone: telLimpo, mensagem: 'Código enviado!' };
        } catch (error) {
            logger.error('Erro ao enviar WhatsApp: ' + error.message);
            return { sucesso: false, mensagem: 'Erro ao enviar código. Verifique se o WhatsApp está conectado.' };
        }
    }
    
    // Verifica código
    static async verificarCodigo(chatId, userId, codigo) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (!cliente || !cliente.codigo_whatsapp) {
            return { sucesso: false, mensagem: 'Nenhum código pendente. Use /start para recomeçar.' };
        }
        
        if (String(codigo).trim() !== cliente.codigo_whatsapp) {
            return { sucesso: false, mensagem: 'Código incorreto. Tente novamente.' };
        }
        
        // Marca como verificado
        db.prepare('UPDATE clientes SET telefone_verificado = 1, codigo_whatsapp = NULL WHERE telegram_id = ?').run(userId);
        
        logger.info(`✅ Telefone verificado: ${cliente.telefone}`);
        return { 
            sucesso: true, 
            cadastroCompleto: !!cliente.nome,
            cliente: cliente
        };
    }
    
    // Login com CPF
    static async loginCPF(chatId, userId, cpf) {
        const db = getDatabase();
        const cpfLimpo = String(cpf).replace(/\D/g, '');
        
        if (!validarCPF(cpfLimpo)) {
            return { sucesso: false, mensagem: 'CPF inválido.' };
        }
        
        const cliente = db.prepare('SELECT * FROM clientes WHERE cpf = ?').get(cpfLimpo);
        
        if (!cliente) {
            return { sucesso: false, mensagem: 'CPF não encontrado. Faça o cadastro primeiro.' };
        }
        
        if (cliente.bloqueado) {
            return { sucesso: false, mensagem: 'Sua conta está bloqueada. Entre em contato com o suporte.' };
        }
        
        // Vincula o Telegram ID
        db.prepare('UPDATE clientes SET telegram_id = ? WHERE cpf = ?').run(userId, cpfLimpo);
        
        logger.info(`🔑 Login CPF: ${cpfLimpo}`);
        return { sucesso: true, cliente };
    }
    
    // Login com CNPJ
    static async loginCNPJ(chatId, userId, cnpj) {
        const db = getDatabase();
        const cnpjLimpo = String(cnpj).replace(/\D/g, '');
        
        if (!validarCNPJ(cnpjLimpo)) {
            return { sucesso: false, mensagem: 'CNPJ inválido.' };
        }
        
        const cliente = db.prepare('SELECT * FROM clientes WHERE cnpj = ?').get(cnpjLimpo);
        
        if (!cliente) {
            return { sucesso: false, mensagem: 'CNPJ não encontrado. Faça o cadastro primeiro.' };
        }
        
        if (cliente.bloqueado) {
            return { sucesso: false, mensagem: 'Conta bloqueada.' };
        }
        
        db.prepare('UPDATE clientes SET telegram_id = ? WHERE cnpj = ?').run(userId, cnpjLimpo);
        
        logger.info(`🔑 Login CNPJ: ${cnpjLimpo}`);
        return { sucesso: true, cliente };
    }
    
    // Reenviar código
    static async reenviarCodigo(chatId, userId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (!cliente || !cliente.telefone) {
            return { sucesso: false, mensagem: 'Nenhum telefone cadastrado.' };
        }
        
        return await this.enviarCodigo(chatId, userId, cliente.telefone);
    }
}

module.exports = AuthService;
