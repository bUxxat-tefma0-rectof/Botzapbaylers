const User = require('../database/models/User');
const Transaction = require('../database/models/Transaction');
const { generatePix, checkPaymentStatus } = require('./mercadopago');
const { sendTextMessage } = require('./whatsapp');
const { getSetting } = require('../utils/settings');
const logger = require('../utils/logger');

async function processRecharge(phone, user, amount) {
    try {
        if (amount < 1) {
            return { success: false, message: '❌ Valor mínimo: R$ 1,00' };
        }
        if (amount > 1000) {
            return { success: false, message: '❌ Valor máximo: R$ 1.000,00' };
        }

        const pixData = await generatePix(amount, `Recarga Doguinha Store - ${phone}`);
        Transaction.create(pixData.id, phone, 'deposit', amount, pixData.pix_code, pixData.qr_code_base64, pixData.expiration_date);

        return { success: true, pixData: pixData };
    } catch (error) {
        logger.error('❌ Erro ao processar recarga:', error);
        return { success: false, message: '❌ Erro ao gerar PIX!' };
    }
}

async function verifyPayment(paymentId) {
    try {
        const status = await checkPaymentStatus(paymentId);
        const transaction = Transaction.findById(paymentId);

        if (!transaction) return { success: false, message: 'Transação não encontrada' };
        if (transaction.status !== 'pending') return { success: true, alreadyProcessed: true, status: transaction.status };

        if (status.approved) {
            Transaction.updateStatus(paymentId, 'approved');
            User.updateBalance(transaction.user_phone, transaction.amount);

            const updatedUser = User.findByPhone(transaction.user_phone);
            await sendTextMessage(
                transaction.user_phone,
                `✅ *PAGAMENTO APROVADO!*\n\n💰 Valor: R$ ${parseFloat(transaction.amount).toFixed(2)}\n💳 Saldo: R$ ${parseFloat(updatedUser.balance).toFixed(2)}`
            );

            // Bônus de indicação
            if (updatedUser.referred_by) {
                const pointsPerRecharge = parseInt(await getSetting('referral_points_per_recharge', '10'));
                User.addReferralPoints(updatedUser.referred_by, pointsPerRecharge);
            }

            return { success: true, approved: true, message: 'Pagamento aprovado!' };
        }

        if (status.rejected) {
            Transaction.updateStatus(paymentId, 'cancelled');
            return { success: true, rejected: true, message: 'Pagamento rejeitado' };
        }

        return { success: true, pending: true, message: 'Aguardando pagamento' };
    } catch (error) {
        logger.error('❌ Erro ao verificar pagamento:', error);
        return { success: false, message: 'Erro ao verificar pagamento' };
    }
}

async function processPurchase(phone, user, product) {
    try {
        const userBalance = parseFloat(user.balance);
        const productPrice = parseFloat(product.value);

        if (userBalance < productPrice) {
            return { success: false, message: 'insufficient_balance' };
        }
        if (product.stock <= 0) {
            return { success: false, message: 'out_of_stock' };
        }

        User.updateBalance(phone, -productPrice);
        const Product = require('../database/models/Product');
        Product.decreaseStock(product.id);

        const { generateId } = require('../utils/idGenerator');
        const transactionId = generateId();
        Transaction.create(transactionId, phone, 'purchase', productPrice, null, null, null, product.id);
        Transaction.updateStatus(transactionId, 'approved');

        return { success: true, transactionId: transactionId, balanceAfter: parseFloat(user.balance) - productPrice };
    } catch (error) {
        logger.error('❌ Erro ao processar compra:', error);
        return { success: false, message: 'Erro ao processar compra' };
    }
}

async function cancelExpiredPayments() {
    try {
        const expired = Transaction.findExpired();
        for (const t of expired) {
            Transaction.updateStatus(t.id, 'expired');
        }
        if (expired.length > 0) {
            logger.info(`✅ ${expired.length} pagamentos expirados cancelados`);
        }
    } catch (error) {
        logger.error('❌ Erro ao cancelar expirados:', error);
    }
}

function hasEnoughBalance(phone, amount) {
    const user = User.findByPhone(phone);
    return user && parseFloat(user.balance) >= amount;
}

module.exports = {
    processRecharge,
    verifyPayment,
    processPurchase,
    cancelExpiredPayments,
    hasEnoughBalance
};
