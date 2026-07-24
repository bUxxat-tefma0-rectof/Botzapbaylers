const { sendTextMessage } = require('../services/whatsapp');
const logger = require('../utils/logger');

async function handleMessageError(phone, error, context = '') {
    logger.error(`❌ Erro ${context}:`, error);
    const knownErrors = {
        'ECONNREFUSED': '❌ Erro de conexão!',
        'ETIMEDOUT': '❌ Tempo esgotado!',
        'insufficient_balance': '❌ Saldo insuficiente!',
        'out_of_stock': '❌ Produto esgotado!',
    };
    let msg = knownErrors[error.code] || knownErrors[error.type] || '❌ Erro inesperado! Tente novamente.';
    if (phone) await sendTextMessage(phone, msg);
}

function setupGlobalErrorHandlers() {
    process.on('uncaughtException', (e) => logger.error('❌ ERRO:', e));
    process.on('unhandledRejection', (e) => logger.error('❌ PROMISE:', e));
}

module.exports = { handleMessageError, setupGlobalErrorHandlers };
