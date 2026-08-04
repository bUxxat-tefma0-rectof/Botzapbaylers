const { getDatabase } = require('../../database/connection');
const { validarCPF, validarCNPJ, formatarCPF, formatarCNPJ, formatarTelefone } = require('../../utils/helpers');
const logger = require('../../utils/logger');

class CadastroService {
    
    // ============ PESSOA FÍSICA ============
    static async cadastrarPF(userId, dados) {
        const db = getDatabase();
        const erros = [];
        
        // Nome completo
        if (!dados.nome || dados.nome.trim().length < 3) {
            erros.push('Nome é obrigatório (mínimo 3 caracteres)');
        }
        if (!dados.sobrenome || dados.sobrenome.trim().length < 2) {
            erros.push('Sobrenome é obrigatório');
        }
        const nomeCompleto = `${(dados.nome || '').trim()} ${(dados.sobrenome || '').trim()}`.trim();
        if (nomeCompleto.split(' ').filter(p => p.length > 0).length < 2) {
            erros.push('Digite nome e sobrenome completos');
        }
        
        // CPF
        if (!dados.cpf) {
            erros.push('CPF é obrigatório');
        } else {
            const cpfLimpo = String(dados.cpf).replace(/\D/g, '');
            if (!validarCPF(cpfLimpo)) {
                erros.push('CPF inválido');
            } else {
                const cpfExiste = db.prepare('SELECT id FROM clientes WHERE cpf = ? AND telegram_id != ?').get(cpfLimpo, userId);
                if (cpfExiste) erros.push('Este CPF já está cadastrado em outra conta');
            }
        }
        
        // Data de nascimento
        if (dados.data_nascimento) {
            const partes = String(dados.data_nascimento).split('/');
            if (partes.length === 3) {
                const dia = parseInt(partes[0]);
                const mes = parseInt(partes[1]);
                const ano = parseInt(partes[2]);
                const idade = new Date().getFullYear() - ano;
                if (idade < 16) erros.push('Idade mínima: 16 anos');
                if (idade > 120) erros.push('Data de nascimento inválida');
                if (dia < 1 || dia > 31 || mes < 1 || mes > 12) erros.push('Data de nascimento inválida');
            } else {
                erros.push('Formato da data: DD/MM/AAAA');
            }
        }
        
        // Telefone
        if (dados.telefone) {
            const telLimpo = String(dados.telefone).replace(/\D/g, '');
            if (telLimpo.length < 10 || telLimpo.length > 11) {
                erros.push('Telefone deve ter 10 ou 11 dígitos (com DDD)');
            }
        }
        
        // Email
        if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
            erros.push('Email inválido');
        }
        
        // Senha
        if (dados.senha && dados.senha.length < 6) {
            erros.push('Senha deve ter no mínimo 6 caracteres');
        }
        
        if (erros.length > 0) {
            return { sucesso: false, erros };
        }
        
        try {
            const cpfLimpo = String(dados.cpf).replace(/\D/g, '');
            db.prepare(`
                UPDATE clientes SET 
                    tipo = 'PF',
                    nome = ?,
                    sobrenome = ?,
                    cpf = ?,
                    data_nascimento = ?,
                    sexo = ?,
                    email = ?,
                    senha = ?,
                    etapa_cadastro = 'completo'
                WHERE telegram_id = ?
            `).run(
                dados.nome.trim(),
                dados.sobrenome.trim(),
                cpfLimpo,
                dados.data_nascimento || null,
                dados.sexo || null,
                dados.email ? dados.email.toLowerCase().trim() : null,
                dados.senha || null,
                userId
            );
            
            logger.info(`✅ Cadastro PF concluído: ${nomeCompleto} (ID: ${userId})`);
            
            return {
                sucesso: true,
                mensagem: 'Cadastro concluído com sucesso!',
                dados: {
                    nome: dados.nome.trim(),
                    sobrenome: dados.sobrenome.trim(),
                    cpf: formatarCPF(cpfLimpo),
                    tipo: 'PF'
                }
            };
        } catch (error) {
            logger.error('Erro ao cadastrar PF: ' + error.message);
            return { sucesso: false, erros: ['Erro ao salvar os dados. Tente novamente.'] };
        }
    }
    
    // ============ PESSOA JURÍDICA ============
    static async cadastrarPJ(userId, dados) {
        const db = getDatabase();
        const erros = [];
        
        // Razão Social
        if (!dados.razao_social || dados.razao_social.trim().length < 3) {
            erros.push('Razão Social é obrigatória (mínimo 3 caracteres)');
        }
        
        // Nome Fantasia
        if (!dados.nome_fantasia || dados.nome_fantasia.trim().length < 3) {
            erros.push('Nome Fantasia é obrigatório (mínimo 3 caracteres)');
        }
        
        // CNPJ
        if (!dados.cnpj) {
            erros.push('CNPJ é obrigatório');
        } else {
            const cnpjLimpo = String(dados.cnpj).replace(/\D/g, '');
            if (!validarCNPJ(cnpjLimpo)) {
                erros.push('CNPJ inválido');
            } else {
                const cnpjExiste = db.prepare('SELECT id FROM clientes WHERE cnpj = ? AND telegram_id != ?').get(cnpjLimpo, userId);
                if (cnpjExiste) erros.push('Este CNPJ já está cadastrado em outra conta');
            }
        }
        
        // Inscrição Estadual (opcional)
        if (dados.inscricao_estadual && dados.inscricao_estadual.trim().length < 8) {
            erros.push('Inscrição Estadual inválida (mínimo 8 caracteres)');
        }
        
        // Responsável
        if (!dados.responsavel || dados.responsavel.trim().length < 3) {
            erros.push('Nome do responsável é obrigatório');
        }
        
        // Telefone
        if (dados.telefone) {
            const telLimpo = String(dados.telefone).replace(/\D/g, '');
            if (telLimpo.length < 10 || telLimpo.length > 11) {
                erros.push('Telefone deve ter 10 ou 11 dígitos (com DDD)');
            }
        }
        
        // Email
        if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
            erros.push('Email inválido');
        }
        
        if (erros.length > 0) {
            return { sucesso: false, erros };
        }
        
        try {
            const cnpjLimpo = String(dados.cnpj).replace(/\D/g, '');
            db.prepare(`
                UPDATE clientes SET 
                    tipo = 'PJ',
                    razao_social = ?,
                    nome_fantasia = ?,
                    cnpj = ?,
                    inscricao_estadual = ?,
                    responsavel = ?,
                    email = ?,
                    telefone = ?,
                    etapa_cadastro = 'completo'
                WHERE telegram_id = ?
            `).run(
                dados.razao_social.trim(),
                dados.nome_fantasia.trim(),
                cnpjLimpo,
                dados.inscricao_estadual ? dados.inscricao_estadual.trim() : null,
                dados.responsavel.trim(),
                dados.email ? dados.email.toLowerCase().trim() : null,
                dados.telefone ? String(dados.telefone).replace(/\D/g, '') : null,
                userId
            );
            
            logger.info(`✅ Cadastro PJ concluído: ${dados.razao_social} (ID: ${userId})`);
            
            return {
                sucesso: true,
                mensagem: 'Cadastro PJ concluído com sucesso!',
                dados: {
                    razao_social: dados.razao_social.trim(),
                    nome_fantasia: dados.nome_fantasia.trim(),
                    cnpj: formatarCNPJ(cnpjLimpo),
                    tipo: 'PJ'
                }
            };
        } catch (error) {
            logger.error('Erro ao cadastrar PJ: ' + error.message);
            return { sucesso: false, erros: ['Erro ao salvar os dados. Tente novamente.'] };
        }
    }
    
    // ============ VALIDAR CPF EM TEMPO REAL ============
    static validarCPFEntrada(cpf) {
        const limpo = String(cpf).replace(/\D/g, '');
        if (limpo.length !== 11) return { valido: false, mensagem: 'CPF deve ter 11 dígitos' };
        if (!validarCPF(limpo)) return { valido: false, mensagem: 'CPF inválido' };
        return { valido: true, cpf: limpo, formatado: formatarCPF(limpo) };
    }
    
    // ============ VALIDAR CNPJ EM TEMPO REAL ============
    static validarCNPJEntrada(cnpj) {
        const limpo = String(cnpj).replace(/\D/g, '');
        if (limpo.length !== 14) return { valido: false, mensagem: 'CNPJ deve ter 14 dígitos' };
        if (!validarCNPJ(limpo)) return { valido: false, mensagem: 'CNPJ inválido' };
        return { valido: true, cnpj: limpo, formatado: formatarCNPJ(limpo) };
    }
    
    // ============ BUSCAR DADOS DO CLIENTE ============
    static async getDadosCliente(userId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return null;
        
        return {
            id: cliente.id,
            telegram_id: cliente.telegram_id,
            tipo: cliente.tipo,
            nome: cliente.nome,
            sobrenome: cliente.sobrenome,
            cpf: cliente.cpf ? formatarCPF(cliente.cpf) : null,
            cnpj: cliente.cnpj ? formatarCNPJ(cliente.cnpj) : null,
            razao_social: cliente.razao_social,
            nome_fantasia: cliente.nome_fantasia,
            responsavel: cliente.responsavel,
            data_nascimento: cliente.data_nascimento,
            sexo: cliente.sexo,
            telefone: cliente.telefone ? formatarTelefone(cliente.telefone) : null,
            email: cliente.email,
            total_gasto: cliente.total_gasto,
            pontos_fidelidade: cliente.pontos_fidelidade,
            bloqueado: cliente.bloqueado,
            etapa_cadastro: cliente.etapa_cadastro,
            data_cadastro: cliente.data_cadastro
        };
    }
}

module.exports = CadastroService;
