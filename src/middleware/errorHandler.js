const { sendTextMessage } = require('../services/whatsapp');
const logger = require('../utils/logger');

async function handleMessageError(phone, error, context = '') {
    try {
        logger.error(`❌ Erro ${context}:`, error);

        const knownErrors = {
            'ECONNREFUSED': '❌ Erro de conexão! Tente novamente.',
            'ETIMEDOUT': '❌ Tempo esgotado! Tente novamente.',
            'insufficient_balance': '❌ Saldo insuficiente! Faça uma recarga.',
            'out_of_stock': '❌ Produto esgotado!',
            'product_not_found': '❌ Produto não encontrado!',
            'payment_expired': '⏰ Pagamento expirado! Gere um novo PIX.',
        };

        let errorMessage = knownErrors[error.code] || knownErrors[error.type];

        if (!errorMessage) {
            const errorStr = String(error.message || error).toLowerCase();
            if (errorStr.includes('timeout')) {
                errorMessage = knownErrors['ETIMEDOUT'];
            } else if (errorStr.includes('connection')) {
                errorMessage = knownErrors['ECONNREFUSED'];
            } else {
                errorMessage = '❌ Erro inesperado! Tente novamente mais tarde.';
            }
        }

        if (phone) {
            await sendTextMessage(phone, errorMessage);
        }

        if (isCriticalError(error)) {
            await notifyAdmin(error, context);
        }

    } catch (e) {
        logger.error('❌ Erro no handler:', e);
    }
}

async function handleDatabaseError(phone, error) {
    logger.error('❌ Erro no banco de dados:', error);
    if (phone) {
        await sendTextMessage(phone, '❌ Erro no banco de dados! Tente novamente.');
    }
}

async function handlePaymentError(phone, error) {
    logger.error('❌ Erro no pagamento:', error);
    if (phone) {
        await sendTextMessage(phone, '❌ Erro no pagamento! Tente novamente.');
    }
}

function isCriticalError(error) {
    const critical = ['ERR_ASSERTION', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError'];
    return critical.includes(error.name) || critical.includes(error.code);
}

async function notifyAdmin(error, context) {
    try {
        const adminNumber = process.env.OWNER_NUMBER;
        if (!adminNumber) return;

        const errorMsg = `🚨 *ERRO CRÍTICO*\n\n📋 ${context}\n❌ ${error.name}\n💬 ${error.message}\n⏰ ${new Date().toLocaleString('pt-BR')}`;

        await sendTextMessage(adminNumber, errorMsg);
    } catch (e) {
        logger.error('❌ Erro ao notificar admin:', e);
    }
}

function setupGlobalErrorHandlers() {
    process.on('uncaughtException', (error) => {
        logger.error('❌ ERRO NÃO CAPTURADO:', error);
    });

    process.on('unhandledRejection', (reason) => {
        logger.error('❌ PROMISE REJEITADA:', reason);
    });

    logger.info('✅ Handlers de erro configurados');
}

module.exports = {
    handleMessageError,
    handleDatabaseError,
    handlePaymentError,
    setupGlobalErrorHandlers
};
