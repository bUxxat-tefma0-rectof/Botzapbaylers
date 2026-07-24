const User = require('../database/models/User');
const Transaction = require('../database/models/Transaction');
const { generatePix } = require('./mercadopago');
const { getSetting } = require('../utils/settings');
const logger = require('../utils/logger');

async function processRecharge(phone, user, amount) {
    try {
        if (amount < 1) return { success: false, message: '❌ Valor mínimo: R$ 1,00' };
        const pixData = await generatePix(amount, `Recarga Doguinha Store - ${phone}`);
        Transaction.create(pixData.id, phone, 'deposit', amount, pixData.pix_code, pixData.qr_code_base64, pixData.expiration_date);
        return { success: true, pixData };
    } catch (error) { logger.error('❌ Erro:', error); return { success: false, message: '❌ Erro!' }; }
}

async function processPurchase(phone, user, product) {
    try {
        const userBalance = parseFloat(user.balance);
        const productPrice = parseFloat(product.value);
        if (userBalance < productPrice) return { success: false, message: 'insufficient_balance' };
        if (product.stock <= 0) return { success: false, message: 'out_of_stock' };
        User.updateBalance(phone, -productPrice);
        const Product = require('../database/models/Product');
        Product.decreaseStock(product.id);
        const { generateId } = require('../utils/idGenerator');
        const transactionId = generateId();
        Transaction.create(transactionId, phone, 'purchase', productPrice, null, null, null, product.id);
        Transaction.updateStatus(transactionId, 'approved');
        return { success: true, balanceAfter: parseFloat(user.balance) - productPrice };
    } catch (error) { logger.error('❌ Erro:', error); return { success: false, message: 'Erro!' }; }
}

function hasEnoughBalance(phone, amount) {
    const user = User.findByPhone(phone);
    return user && parseFloat(user.balance) >= amount;
}

module.exports = { processRecharge, processPurchase, hasEnoughBalance };
