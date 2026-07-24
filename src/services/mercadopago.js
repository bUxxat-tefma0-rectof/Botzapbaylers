const { MercadoPagoConfig, Payment } = require('mercadopago');
const { config } = require('../config/database');
const { getSetting } = require('../utils/settings');
const { addMinutes, formatDateTime } = require('../utils/dateUtils');
const logger = require('../utils/logger');

const client = new MercadoPagoConfig({ accessToken: config.mercadopago.accessToken });
const payment = new Payment(client);

async function generatePix(amount, description = 'Recarga Doguinha Store') {
    try {
        // Verificar modo PIX
        const pixMode = await getSetting('pix_mode', 'automatico');

        if (pixMode === 'manual') {
            // PIX MANUAL - Retorna chave fixa
            const pixKey = await getSetting('pix_manual_key', '');
            const holderName = await getSetting('pix_manual_name', 'DOGUINHA STORE');
            
            return {
                id: `MANUAL-${Date.now()}`,
                qr_code: pixKey,
                qr_code_base64: '',
                pix_code: pixKey,
                amount: amount,
                status: 'pending',
                expiration_date: addMinutes(parseInt(await getSetting('pix_expiration', '15'))),
                created_at: new Date(),
                is_manual: true,
                holder_name: holderName
            };
        }

        // PIX AUTOMÁTICO - Mercado Pago
        const expirationMinutes = parseInt(await getSetting('pix_expiration', '15'));
        const expirationDate = addMinutes(expirationMinutes);

        const body = {
            transaction_amount: parseFloat(amount),
            description: description,
            payment_method_id: 'pix',
            payer: {
                email: 'cliente@doguinhastore.com',
                first_name: 'Cliente',
                last_name: 'Doguinha Store'
            },
            date_of_expiration: expirationDate.toISOString()
        };

        const response = await payment.create({ body });

        return {
            id: response.id.toString(),
            qr_code: response.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
            pix_code: response.point_of_interaction.transaction_data.qr_code,
            amount: amount,
            status: response.status,
            expiration_date: expirationDate,
            created_at: new Date(),
            is_manual: false
        };
    } catch (error) {
        logger.error('❌ Erro ao gerar PIX:', error);
        throw error;
    }
}

async function checkPaymentStatus(paymentId) {
    try {
        // Se for manual, não verifica
        if (paymentId.startsWith('MANUAL-')) {
            return {
                id: paymentId,
                status: 'pending',
                approved: false,
                rejected: false,
                pending: true,
                expired: false,
                is_manual: true
            };
        }

        const response = await payment.get({ id: paymentId });
        return {
            id: response.id.toString(),
            status: response.status,
            approved: response.status === 'approved',
            rejected: response.status === 'rejected',
            pending: response.status === 'pending',
            expired: response.status === 'cancelled',
            is_manual: false
        };
    } catch (error) {
        logger.error('❌ Erro ao verificar status:', error);
        throw error;
    }
}

async function processWebhook(body) {
    try {
        if (body.type === 'payment') {
            const paymentId = body.data.id;
            
            // Ignorar pagamentos manuais
            if (paymentId.startsWith('MANUAL-')) return;
            
            logger.info(`🔄 Webhook recebido: ${paymentId}`);
            const status = await checkPaymentStatus(paymentId);
            if (status.approved) {
                await handleApprovedPayment(paymentId);
            }
            return status;
        }
    } catch (error) {
        logger.error('❌ Erro no webhook:', error);
    }
}

async function generateQrCodeImage(qrCodeBase64) {
    try {
        if (!qrCodeBase64) return null;
        
        const QRCode = require('qrcode');
        const fs = require('fs');
        const path = require('path');
        const qrDir = config.storage.qrcodesPath;
        if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
        const qrImagePath = path.join(qrDir, `pix_${Date.now()}.png`);
        await QRCode.toFile(qrImagePath, qrCodeBase64, { type: 'png', width: 400, margin: 2 });
        return qrImagePath;
    } catch (error) {
        logger.error('❌ Erro ao gerar QR Code:', error);
        return null;
    }
}

async function handleApprovedPayment(paymentId) {
    const Transaction = require('../database/models/Transaction');
    const User = require('../database/models/User');
    const { sendTextMessage } = require('./whatsapp');

    try {
        const transaction = Transaction.findById(paymentId);
        if (!transaction || transaction.status !== 'pending') return;

        Transaction.updateStatus(paymentId, 'approved');
        User.updateBalance(transaction.user_phone, transaction.amount);
        const user = User.findByPhone(transaction.user_phone);

        await sendTextMessage(
            transaction.user_phone,
            `✅ *PAGAMENTO APROVADO!*\n\n💰 Valor: R$ ${parseFloat(transaction.amount).toFixed(2)}\n💳 Saldo: R$ ${parseFloat(user.balance).toFixed(2)}`
        );

        logger.info(`✅ Pagamento ${paymentId} aprovado`);
    } catch (error) {
        logger.error('❌ Erro ao processar pagamento:', error);
    }
}

module.exports = {
    generatePix,
    checkPaymentStatus,
    processWebhook,
    generateQrCodeImage,
    handleApprovedPayment
};
