const { sendButtonMessage, sendTextMessage } = require('../../services/whatsapp');
const User = require('../../database/models/User');
const { getMessage, processMessageVariables } = require('../../utils/messages');
const { getMainMenuButtons } = require('../../utils/buttons');
const { handlePaymentMenu } = require('./paymentController');
const { handlePremiumMenu } = require('./productController');
const { handleReferralMenu } = require('./referralController');
const { handleSupportMenu } = require('./supportController');
const logger = require('../../utils/logger');

async function handleMessage(sock, message) {
    try {
        const phone = message.key.remoteJid.replace('@s.whatsapp.net', '');
        const messageText = getMessageText(message);
        const messageType = getMessageType(message);

        if (message.key.remoteJid.includes('@g.us')) return;

        const user = User.createOrUpdate(phone);

        if (User.isBlocked(phone)) {
            await sendTextMessage(phone, '⛔ Você está bloqueado!');
            return;
        }

        if (messageText && messageText.toUpperCase().startsWith('BONUS_COD_')) {
            const { processReferralCode } = require('./referralController');
            await processReferralCode(phone, messageText, user);
            await showMainMenu(phone, user);
            return;
        }

        if (messageType === 'buttons_response') {
            await handleButtonClick(phone, messageText, user);
            return;
        }

        if (messageText && !messageText.startsWith('/')) {
            // Verificar se está aguardando valor PIX
            const { handleCustomPixValue } = require('./paymentController');
            const waiting = global.waitingFor || {};
            if (waiting[phone] === 'custom_pix_value') {
                delete waiting[phone];
                await handleCustomPixValue(phone, user, messageText);
                return;
            }
            await showMainMenu(phone, user);
        }

    } catch (error) {
        logger.error('❌ Erro ao processar mensagem:', error);
    }
}

function getMessageType(message) {
    if (message.message?.buttonsResponseMessage) return 'buttons_response';
    if (message.message?.conversation) return 'text';
    if (message.message?.extendedTextMessage) return 'text';
    return 'unknown';
}

function getMessageText(message) {
    if (message.message?.conversation) return message.message.conversation;
    if (message.message?.extendedTextMessage?.text) return message.message.extendedTextMessage.text;
    if (message.message?.buttonsResponseMessage?.selectedButtonId) {
        return message.message.buttonsResponseMessage.selectedButtonId;
    }
    return null;
}

async function showMainMenu(phone, user) {
    try {
        const message = processMessageVariables('welcome', user);
        const buttons = getMainMenuButtons();
        await sendButtonMessage(phone, message, buttons);
    } catch (error) {
        logger.error('❌ Erro ao mostrar menu:', error);
    }
}

async function handleButtonClick(phone, buttonId, user) {
    switch (buttonId) {
        case 'add_balance':
            return await handlePaymentMenu(phone, user);
        case 'premium':
            return await handlePremiumMenu(phone, user);
        case 'referral':
            return await handleReferralMenu(phone, user);
        case 'support':
            return await handleSupportMenu(phone, user);
        case 'main_menu':
            return await showMainMenu(phone, user);
        case 'text_model':
            const { sendReferralTextModel } = require('./referralController');
            return await sendReferralTextModel(phone, user);
        default:
            if (buttonId.startsWith('pix_')) {
                return await handlePaymentMenu(phone, user, buttonId);
            }
            if (buttonId.startsWith('buy_')) {
                const { handleProductPurchase } = require('./productController');
                return await handleProductPurchase(phone, user, buttonId);
            }
            if (buttonId.startsWith('confirm_buy_')) {
                const { handleConfirmPurchase } = require('./productController');
                return await handleConfirmPurchase(phone, user, buttonId);
            }
            if (buttonId.startsWith('premium_page_')) {
                const page = parseInt(buttonId.replace('premium_page_', ''));
                return await handlePremiumMenu(phone, user, page);
            }
            await showMainMenu(phone, user);
    }
}

module.exports = {
    handleMessage,
    showMainMenu
};
