function validatePhone(phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    const pattern = /^55\d{10,11}$/;

    if (!pattern.test(cleanPhone)) {
        return { valid: false, message: '❌ Número inválido! Formato: 55XXXXXXXXXXX', cleanPhone: null };
    }

    return { valid: true, message: '', cleanPhone: cleanPhone };
}

function validateAmount(value) {
    let cleanValue = String(value).replace(/[^\d.,]/g, '').replace(',', '.');
    const amount = parseFloat(cleanValue);

    if (isNaN(amount) || amount <= 0) {
        return { valid: false, message: '❌ Valor inválido!', amount: null };
    }

    if (amount > 10000) {
        return { valid: false, message: '❌ Valor máximo: R$ 10.000,00', amount: null };
    }

    return { valid: true, message: '', amount: amount };
}

function validateProductName(name) {
    const cleanName = name.trim();
    if (cleanName.length < 1 || cleanName.length > 100) {
        return { valid: false, message: '❌ Nome inválido! (1-100 caracteres)' };
    }
    return { valid: true, message: '', name: cleanName };
}

function validatePrice(price) {
    const result = validateAmount(price);
    if (!result.valid) return result;
    return { valid: true, message: '', price: parseFloat(result.amount.toFixed(2)) };
}

function validateStock(stock) {
    const stockNumber = parseInt(stock);
    if (isNaN(stockNumber) || stockNumber < 0) {
        return { valid: false, message: '❌ Estoque inválido!', stock: null };
    }
    return { valid: true, message: '', stock: stockNumber };
}

function validateReferralCode(code) {
    const cleanCode = code.trim().toUpperCase();
    const pattern = /^BONUS_COD_\d{10,15}$/;
    if (!pattern.test(cleanCode)) {
        return { valid: false, message: '❌ Código inválido!', code: null };
    }
    return { valid: true, message: '', code: cleanCode };
}

function validateMessage(text) {
    const cleanText = text.trim();
    if (cleanText.length < 1 || cleanText.length > 4000) {
        return { valid: false, message: '❌ Mensagem inválida! (1-4000 caracteres)' };
    }
    return { valid: true, message: '', text: cleanText };
}

function validatePercentage(value) {
    const percentage = parseFloat(value);
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
        return { valid: false, message: '❌ Porcentagem inválida! (0-100)' };
    }
    return { valid: true, message: '', percentage: percentage };
}

module.exports = {
    validatePhone,
    validateAmount,
    validateProductName,
    validatePrice,
    validateStock,
    validateReferralCode,
    validateMessage,
    validatePercentage
};
