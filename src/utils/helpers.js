function formatarMoeda(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v); }
function formatarTelefone(t) { const l = String(t).replace(/\D/g, ''); return l.length === 11 ? l.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : l.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3'); }
function formatarCPF(c) { return String(c).replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }
function formatarCNPJ(c) { return String(c).replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); }
function formatarCEP(c) { return String(c).replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2'); }
function formatarData(d) { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function gerarCodigo() { return String(Math.floor(100000 + Math.random() * 900000)); }
function gerarNumeroPedido() { return '#' + new Date().getFullYear().toString().slice(-2) + String(Math.floor(10000 + Math.random() * 90000)); }

function validarCPF(cpf) {
    const c = String(cpf).replace(/\D/g, '');
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    let s = 0; for (let i = 0; i < 9; i++) s += parseInt(c[i]) * (10 - i);
    let r = 11 - (s % 11); if (r > 9) r = 0; if (r !== parseInt(c[9])) return false;
    s = 0; for (let i = 0; i < 10; i++) s += parseInt(c[i]) * (11 - i);
    r = 11 - (s % 11); if (r > 9) r = 0; return r === parseInt(c[10]);
}

function validarCNPJ(cnpj) {
    const c = String(cnpj).replace(/\D/g, '');
    if (c.length !== 14) return false;
    let t = 12, n = c.substring(0, t), d = c.substring(t), s = 0, p = t - 7;
    for (let i = t; i >= 1; i--) { s += n[t - i] * p--; if (p < 2) p = 9; }
    let r = s % 11 < 2 ? 0 : 11 - s % 11; if (r != d[0]) return false;
    t = 13; n = c.substring(0, t); s = 0; p = t - 7;
    for (let i = t; i >= 1; i--) { s += n[t - i] * p--; if (p < 2) p = 9; }
    r = s % 11 < 2 ? 0 : 11 - s % 11; return r == d[1];
}

module.exports = { formatarMoeda, formatarTelefone, formatarCPF, formatarCNPJ, formatarCEP, formatarData, gerarCodigo, gerarNumeroPedido, validarCPF, validarCNPJ };
