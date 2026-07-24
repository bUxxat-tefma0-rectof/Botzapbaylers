function validatePhone(phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!/^55\d{10,11}$/.test(cleanPhone)) return { valid: false, message: '❌ Número inválido!', cleanPhone: null };
    return { valid: true, message: '', cleanPhone };
}

function validateAmount(value) {
    const amount = parseFloat(String(value).replace(/[^\d.,]/g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return { valid: false, message: '❌ Valor inválido!', amount: null };
    if (amount > 10000) return { valid: false, message: '❌ Valor máximo: R$ 10.000,00', amount: null };
    return { valid: true, message: '', amount };
}

function validatePrice(price) {
    const result = validateAmount(price);
    if (!result.valid) return result;
    return { valid: true, message: '', price: parseFloat(result.amount.toFixed(2)) };
}

function validateStock(stock) {
    const stockNumber = parseInt(stock);
    if (isNaN(stockNumber) || stockNumber < 0) return { valid: false, message: '❌ Estoque inválido!', stock: null };
    return { valid: true, message: '', stock: stockNumber };
}

module.exports = { validatePhone, validateAmount, validatePrice, validateStock };
