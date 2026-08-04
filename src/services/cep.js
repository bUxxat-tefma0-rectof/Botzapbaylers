const axios = require('axios');

async function consultarCEP(cep) {
    const limpo = String(cep).replace(/\D/g, '');
    if (limpo.length !== 8) return { sucesso: false, msg: 'CEP inválido' };
    try {
        const { data } = await axios.get(`https://viacep.com.br/ws/${limpo}/json/`);
        if (data.erro) return { sucesso: false, msg: 'CEP não encontrado' };
        return { sucesso: true, dados: data };
    } catch (e) {
        return { sucesso: false, msg: 'Erro ao consultar CEP' };
    }
}

module.exports = { consultarCEP };
