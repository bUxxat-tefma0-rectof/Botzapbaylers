const { validarCPF, validarCNPJ } = require('../utils/helpers');

class ValidacaoService {
    static validarNome(nome) {
        if (!nome || nome.trim().length < 3) return { valido: false, msg: 'Nome muito curto' };
        if (nome.trim().split(' ').length < 2) return { valido: false, msg: 'Digite nome e sobrenome' };
        return { valido: true, nome: nome.trim() };
    }
    
    static validarCPF(cpf) {
        if (!validarCPF(cpf)) return { valido: false, msg: 'CPF inválido' };
        return { valido: true, cpf: String(cpf).replace(/\D/g, '') };
    }
    
    static validarCNPJ(cnpj) {
        if (!validarCNPJ(cnpj)) return { valido: false, msg: 'CNPJ inválido' };
        return { valido: true, cnpj: String(cnpj).replace(/\D/g, '') };
    }
    
    static validarTelefone(tel) {
        const l = String(tel).replace(/\D/g, '');
        if (l.length < 10 || l.length > 11) return { valido: false, msg: 'Telefone inválido' };
        return { valido: true, telefone: l };
    }
    
    static validarEmail(email) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { valido: false, msg: 'Email inválido' };
        return { valido: true, email: email.toLowerCase() };
    }
    
    static validarSenha(s) { return { valido: s && s.length >= 6, msg: s && s.length >= 6 ? '' : 'Senha mínima: 6 caracteres' }; }
}

module.exports = ValidacaoService;
