const { getDatabase } = require('../database/connection');
const logger = require('./logger');

function getMessage(key) {
    try {
        const db = getDatabase();
        const message = db.prepare('SELECT content FROM messages WHERE key = ?').get(key);
        return message ? message.content : `⚠️ Mensagem não encontrada: ${key}`;
    } catch (error) {
        logger.error(`Erro ao buscar mensagem ${key}:`, error);
        return '❌ Erro ao carregar mensagem';
    }
}

function getAllMessages() {
    try {
        const db = getDatabase();
        return db.prepare('SELECT * FROM messages ORDER BY key ASC').all();
    } catch (error) {
        logger.error('Erro ao buscar mensagens:', error);
        return [];
    }
}

function updateMessage(key, content) {
    try {
        const db = getDatabase();
        db.prepare('UPDATE messages SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(content, key);
        logger.info(`Mensagem "${key}" atualizada`);
        return true;
    } catch (error) {
        logger.error(`Erro ao atualizar mensagem ${key}:`, error);
        return false;
    }
}

function processMessageVariables(key, userData = {}) {
    let message = getMessage(key);
    if (!message) return '';

    const variables = {
        '{phone}': userData.phone || 'N/A',
        '{balance}': parseFloat(userData.balance || 0).toFixed(2),
        '{bonus_balance}': parseFloat(userData.bonus_balance || 0).toFixed(2),
        '{total_referrals}': userData.total_referrals || 0,
        '{referral_code}': userData.referral_code || '',
        '{referral_link}': userData.referral_link || '',
        '{bonus_percentage}': userData.bonus_percentage || '0.00',
        '{transaction_id}': userData.transaction_id || '',
        '{amount}': userData.amount || '0.00',
        '{expiration_date}': userData.expiration_date || '',
        '{expiration}': userData.expiration || '15',
        '{product_name}': userData.product_name || '',
        '{product_price}': userData.product_price || '0.00',
        '{user_balance}': userData.user_balance || '0.00',
        '{balance_after}': userData.balance_after || '0.00',
        '{support_link}': userData.support_link || '',
    };

    for (const [key, value] of Object.entries(variables)) {
        message = message.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    return message;
}

module.exports = {
    getMessage,
    getAllMessages,
    updateMessage,
    processMessageVariables
};
