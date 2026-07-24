const { sendButtonMessage, sendTextMessage } = require('../../services/whatsapp');
const User = require('../../database/models/User');
const Transaction = require('../../database/models/Transaction');
const { getSetting } = require('../../utils/settings');
const { generateId } = require('../../utils/idGenerator');
const logger = require('../../utils/logger');

// ============================================
// MENU CONVERTER PONTOS
// ============================================
async function handleConvertPoints(phone, user) {
    try {
        const referralSystem = await getSetting('referral_system', 'on');
        
        if (referralSystem !== 'on') {
            await sendTextMessage(phone, '❌ Sistema de indicação está desativado no momento!');
            return;
        }

        const userPoints = user.referral_points || 0;
        const minPoints = parseInt(await getSetting('referral_min_points', '500'));
        const multiplier = parseFloat(await getSetting('referral_multiplier', '0.01'));

        if (userPoints < minPoints) {
            const message = `⭐ *CONVERTER PONTOS*\n\n` +
                `Seus pontos: ${userPoints}\n` +
                `Mínimo para converter: ${minPoints} pontos\n\n` +
                `💰 Multiplicador: ${multiplier}\n` +
                `💵 Se converter ${minPoints} pontos = R$ ${(minPoints * multiplier).toFixed(2)}\n\n` +
                `❌ Você ainda não tem pontos suficientes!\n` +
                `Continue indicando para juntar mais pontos.`;

            const buttons = [
                { id: 'referral', text: '💼 ÁREA DO ASSOCIADO' },
                { id: 'main_menu', text: '🏠 MENU INICIAL' }
            ];

            await sendButtonMessage(phone, message, buttons);
            return;
        }

        // Calcular valor
        const convertedValue = userPoints * multiplier;
        const newPoints = userPoints - userPoints; // Zera os pontos

        const message = `⭐ *CONVERTER PONTOS EM SALDO*\n\n` +
            `Seus pontos: ${userPoints}\n` +
            `Multiplicador: ${multiplier}\n` +
            `💰 Valor a receber: R$ ${convertedValue.toFixed(2)}\n\n` +
            `Após converter:\n` +
            `⭐ Pontos restantes: ${newPoints}\n` +
            `💰 Saldo atual: R$ ${parseFloat(user.balance || 0).toFixed(2)}\n` +
            `💳 Novo saldo: R$ ${(parseFloat(user.balance || 0) + convertedValue).toFixed(2)}\n\n` +
            `Deseja converter todos os seus pontos?`;

        const buttons = [
            { id: `confirm_convert_${userPoints}`, text: '✅ CONVERTER TUDO' },
            { id: 'referral', text: '❌ CANCELAR' }
        ];

        await sendButtonMessage(phone, message, buttons);

    } catch (error) {
        logger.error('❌ Erro ao converter pontos:', error);
    }
}

// ============================================
// CONFIRMAR CONVERSÃO DE PONTOS
// ============================================
async function handleConfirmConvertPoints(phone, user, pointsToConvert) {
    try {
        const userPoints = user.referral_points || 0;
        const points = parseInt(pointsToConvert);

        if (userPoints < points) {
            await sendTextMessage(phone, '❌ Pontos insuficientes!');
            return;
        }

        const multiplier = parseFloat(await getSetting('referral_multiplier', '0.01'));
        const convertedValue = points * multiplier;

        // Atualizar pontos (zerar)
        const db = require('../../database/connection').getDatabase();
        db.prepare('UPDATE users SET referral_points = 0 WHERE phone = ?').run(phone);

        // Adicionar saldo
        User.updateBalance(phone, convertedValue);

        // Registrar transação
        const transactionId = generateId();
        Transaction.create(transactionId, phone, 'deposit', convertedValue, null, null, null, null);
        Transaction.updateStatus(transactionId, 'approved');

        const updatedUser = User.findByPhone(phone);

        const successMessage = `✅ *PONTOS CONVERTIDOS!*\n\n` +
            `⭐ Pontos convertidos: ${points}\n` +
            `💰 Valor creditado: R$ ${convertedValue.toFixed(2)}\n` +
            `💳 Saldo atual: R$ ${parseFloat(updatedUser.balance).toFixed(2)}\n` +
            `⭐ Pontos restantes: ${updatedUser.referral_points || 0}\n\n` +
            `Continue indicando para ganhar mais pontos! 🎉`;

        await sendTextMessage(phone, successMessage);

        logger.info(`✅ Pontos convertidos: ${phone} - ${points} pontos = R$ ${convertedValue.toFixed(2)}`);

    } catch (error) {
        logger.error('❌ Erro ao confirmar conversão:', error);
        await sendTextMessage(phone, '❌ Erro ao converter pontos!');
    }
}

// ============================================
// VERIFICAR PONTOS
// ============================================
async function handleCheckPoints(phone, user) {
    try {
        const userPoints = user.referral_points || 0;
        const minPoints = parseInt(await getSetting('referral_min_points', '500'));
        const multiplier = parseFloat(await getSetting('referral_multiplier', '0.01'));

        const message = `⭐ *SEUS PONTOS*\n\n` +
            `Pontos atuais: ${userPoints}\n` +
            `Mínimo para converter: ${minPoints}\n` +
            `Multiplicador: ${multiplier}\n` +
            `Valor se converter: R$ ${(userPoints * multiplier).toFixed(2)}\n\n` +
            `📊 *COMO GANHAR PONTOS:*\n` +
            `👥 Cada indicado que fizer recarga = +${await getSetting('referral_points_per_recharge', '10')} pontos\n` +
            `💰 Pontos viram saldo real!\n\n` +
            `${userPoints >= minPoints ? '✅ Você já pode converter!' : `❌ Faltam ${minPoints - userPoints} pontos para converter`}`;

        const buttons = [
            { id: 'convert_points', text: '💰 CONVERTER EM SALDO' },
            { id: 'referral', text: '💼 ÁREA DO ASSOCIADO' },
            { id: 'main_menu', text: '🏠 MENU INICIAL' }
        ];

        await sendButtonMessage(phone, message, buttons);

    } catch (error) {
        logger.error('❌ Erro ao verificar pontos:', error);
    }
}

module.exports = {
    handleConvertPoints,
    handleConfirmConvertPoints,
    handleCheckPoints
};
