const { getDatabase } = require('../../database/connection');
const ValidacaoService = require('../../services/validacao');
const { formatarCPF, formatarCNPJ, validarCPF, validarCNPJ } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class CadastroService {
    
    // Cadastro Pessoa Física
    static async cadastrarPF(chatId, userId, dados) {
        const db = getDatabase();
        const erros = [];
        
        // Validações
        const nomeVal = ValidacaoService.validarNome(dados.nome);
        if (!nomeVal.valido) erros.push(nomeVal.msg);
        
        if (!dados.sobrenome || dados.sobrenome.trim().length < 2) {
            erros.push('Sobrenome é obrigatório (mínimo 2 caracteres)');
        }
        
        const cpfVal = ValidacaoService.validarCPF(dados.cpf);
        if (!cpfVal.valido) erros.push(cpfVal.msg);
        
        // Verifica CPF duplicado
        const cpfExiste = db.prepare('SELECT id FROM clientes WHERE cpf = ? AND telegram_id != ?').get(cpfVal.cpf, userId);
        if (cpfExiste) erros.push('CPF já cadastrado por outro usuário.');
        
        if (dados.data_nascimento) {
            const partes = dados.data_nascimento.split('/');
            if (partes.length === 3) {
                const dia = parseInt(partes[0]), mes = parseInt(partes[1]), ano = parseInt(partes[2]);
                const idade = new Date().getFullYear() - ano;
                if (idade < 16) erros.push('Idade mínima: 16 anos.');
                if (idade > 120) erros.push('Data de nascimento inválida.');
            }
        }
        
        if (dados.email) {
            const emailVal = ValidacaoService.validarEmail(dados.email);
            if (!emailVal.valido) erros.push(emailVal.msg);
        }
        
        if (dados.senha) {
            const senhaVal = ValidacaoService.validarSenha(dados.senha);
            if (!senhaVal.valido) erros.push(senhaVal.msg);
        }
        
        if (erros.length > 0) {
            return { sucesso: false, erros };
        }
        
        // Salva no banco
        try {
            db.prepare(`UPDATE clientes SET 
                tipo = 'PF', nome = ?, sobrenome = ?, cpf = ?, 
                data_nascimento = ?, sexo = ?, email = ?, senha = ?
                WHERE telegram_id = ?`)
            .run(
                nomeVal.nome, dados.sobrenome.trim(), cpfVal.cpf,
                dados.data_nascimento || null, dados.sexo || null,
                dados.email || null, dados.senha || null,
                userId
            );
            
            logger.info(`✅ Cadastro PF: ${nomeVal.nome} ${dados.sobrenome}`);
            return { sucesso: true, mensagem: 'Cadastro concluído com sucesso!' };
        } catch (error) {
            logger.error('Erro ao cadastrar PF: ' + error.message);
            return { sucesso: false, erros: ['Erro ao salvar. Tente novamente.'] };
        }
    }
    
    // Cadastro Pessoa Jurídica
    static async cadastrarPJ(chatId, userId, dados) {
        const db = getDatabase();
        const erros = [];
        
        if (!dados.razao_social || dados.razao_social.trim().length < 3) {
            erros.push('Razão social é obrigatória (mínimo 3 caracteres)');
        }
        
        if (!dados.nome_fantasia || dados.nome_fantasia.trim().length < 3) {
            erros.push('Nome fantasia é obrigatório (mínimo 3 caracteres)');
        }
        
        const cnpjVal = ValidacaoService.validarCNPJ(dados.cnpj);
        if (!cnpjVal.valido) erros.push(cnpjVal.msg);
        
        // Verifica CNPJ duplicado
        const cnpjExiste = db.prepare('SELECT id FROM clientes WHERE cnpj = ? AND telegram_id != ?').get(cnpjVal.cnpj, userId);
        if (cnpjExiste) erros.push('CNPJ já cadastrado por outro usuário.');
        
        if (!dados.responsavel || dados.responsavel.trim().length < 3) {
            erros.push('Nome do responsável é obrigatório (mínimo 3 caracteres)');
        }
        
        if (dados.email) {
            const emailVal = ValidacaoService.validarEmail(dados.email);
            if (!emailVal.valido) erros.push(emailVal.msg);
        }
        
        if (erros.length > 0) {
            return { sucesso: false, erros };
        }
        
        try {
            db.prepare(`UPDATE clientes SET 
                tipo = 'PJ', razao_social = ?, nome_fantasia = ?, cnpj = ?,
                inscricao_estadual = ?, responsavel = ?, email = ?, telefone = ?
                WHERE telegram_id = ?`)
            .run(
                dados.razao_social.trim(), dados.nome_fantasia.trim(), cnpjVal.cnpj,
                dados.inscricao_estadual || null, dados.responsavel.trim(),
                dados.email || null, dados.telefone || null,
                userId
            );
            
            logger.info(`✅ Cadastro PJ: ${dados.razao_social}`);
            return { sucesso: true, mensagem: 'Cadastro PJ concluído com sucesso!' };
        } catch (error) {
            logger.error('Erro ao cadastrar PJ: ' + error.message);
            return { sucesso: false, erros: ['Erro ao salvar. Tente novamente.'] };
        }
    }
    
    // Validar CPF em tempo real
    static validarCPF(cpf) {
        const limpo = String(cpf).replace(/\D/g, '');
        if (!validarCPF(limpo)) return { valido: false, mensagem: 'CPF inválido' };
        return { valido: true, cpf: limpo, formatado: formatarCPF(limpo) };
    }
    
    // Validar CNPJ em tempo real
    static validarCNPJ(cnpj) {
        const limpo = String(cnpj).replace(/\D/g, '');
        if (!validarCNPJ(limpo)) return { valido: false, mensagem: 'CNPJ inválido' };
        return { valido: true, cnpj: limpo, formatado: formatarCNPJ(limpo) };
    }
}

module.exports = CadastroService;
