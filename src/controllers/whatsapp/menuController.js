const { sendButtonMessage, sendTextMessage, sendImageMessage } = require('../../services/whatsapp');
const User = require('../../database/models/User');
const { getMessage, processMessageVariables } = require('../../utils/messages');
const { getMainMenuButtons } = require('../../utils/buttons');
const { handlePaymentMenu } = require('./paymentController');
const { handlePremiumMenu } = require('./productController');
const { handleReferralMenu } = require('./referralController');
const { handleSupportMenu } = require('./supportController');
const { handleRentBotMenu } = require('./rentController');
const { handleSearchService, processSearchQuery } = require('./searchController');
const { handleCustomPixValue } = require('./paymentController');
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

        // Código de indicação
        if (messageText && messageText.toUpperCase().startsWith('BONUS_COD_')) {
            const { processReferralCode } = require('./referralController');
            await processReferralCode(phone, messageText, user);
            await showMainMenu(phone, user);
            return;
        }

        // Botões
        if (messageType === 'buttons_response') {
            await handleButtonClick(phone, messageText, user);
            return;
        }

        // Aguardando input
        if (messageText && !messageText.startsWith('/')) {
            const waiting = global.waitingFor || {};

            if (waiting[phone] === 'custom_pix_value') {
                delete waiting[phone];
                global.waitingFor = waiting;
                await handleCustomPixValue(phone, user, messageText);
                return;
            }

            if (waiting[phone] === 'search_service_query') {
                delete waiting[phone];
                global.waitingFor = waiting;
                await processSearchQuery(phone, user, messageText);
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
        const db = require('../../database/connection').getDatabase();
        const purchasesCount = db.prepare("SELECT COUNT(*) as total FROM transactions WHERE user_phone = ? AND type = 'purchase' AND status = 'approved'").get(phone).total;
        const giftcardsRedeemed = db.prepare("SELECT SUM(amount) as total FROM transactions WHERE user_phone = ? AND type = 'giftcard' AND status = 'approved'").get(phone).total || 0;
        const referralLink = `https://t.me/DoguinhaStoreBot?start=${user.referral_code}`;
        const referralCount = user.total_referrals || 0;
        const referralPoints = user.referral_points || 0;

        let headerMessage = `🤖 *DOGUINHA STORE BOT* 🤖\n\n`;
        headerMessage += `🛒 Compras feitas: ${purchasesCount}\n`;
        headerMessage += `🎁 GiftCard's resgatados: ${parseFloat(giftcardsRedeemed).toFixed(2)}\n\n`;
        headerMessage += `💼 *Área Afiliados*\n`;
        headerMessage += `🔗 Seu link: ${referralLink}\n`;
        headerMessage += `👥 Afiliados: ${referralCount}\n`;
        headerMessage += `⭐ Pontos: ${referralPoints}\n\n`;
        headerMessage += `ℹ️ *Seus Dados:*\n`;
        headerMessage += `├💠 Número: ${phone}\n`;
        headerMessage += `└💸 Saldo Atual: R$ ${parseFloat(user.balance || 0).toFixed(2)}`;

        const buttons = [
            { id: 'profile', text: '👤 PERFIL' },
            { id: 'add_balance', text: '💰 ADICIONAR SALDO' },
            { id: 'premium', text: '👑 ASSINATURA PREMIUM' },
            { id: 'referral', text: '💼 ÁREA DO ASSOCIADO' },
            { id: 'support', text: '📞 SUPORTE' },
            { id: 'rent_bot', text: '🤖 ALUGAR BOT' },
            { id: 'search_service', text: '🔍 PESQUISAR SERVIÇO' }
        ];

        await sendButtonMessage(phone, headerMessage, buttons);
    } catch (error) {
        logger.error('❌ Erro ao mostrar menu:', error);
    }
}

async function handleButtonClick(phone, buttonId, user) {
    switch (buttonId) {
        case 'profile':
            return await showProfile(phone, user);
        case 'add_balance':
            return await handlePaymentMenu(phone, user);
        case 'premium':
            return await handlePremiumMenu(phone, user);
        case 'referral':
            return await handleReferralMenu(phone, user);
        case 'support':
            return await handleSupportMenu(phone, user);
        case 'rent_bot':
            return await handleRentBotMenu(phone, user);
        case 'search_service':
            return await handleSearchService(phone, user);
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

async function showProfile(phone, user) {
    try {
        const db = require('../../database/connection').getDatabase();
        const purchasesCount = db.prepare("SELECT COUNT(*) as total FROM transactions WHERE user_phone = ? AND type = 'purchase' AND status = 'approved'").get(phone).total;
        const totalSpent = db.prepare("SELECT SUM(amount) as total FROM transactions WHERE user_phone = ? AND type = 'purchase' AND status = 'approved'").get(phone).total || 0;
        const totalDeposited = db.prepare("SELECT SUM(amount) as total FROM transactions WHERE user_phone = ? AND type = 'deposit' AND status = 'approved'").get(phone).total || 0;

        const profileMessage = `👤 *SEU PERFIL*\n\n` +
            `📞 Número: ${phone}\n` +
            `💰 Saldo: R$ ${parseFloat(user.balance || 0).toFixed(2)}\n` +
            `🎁 Bônus: R$ ${parseFloat(user.bonus_balance || 0).toFixed(2)}\n` +
            `⭐ Pontos: ${user.referral_points || 0}\n` +
            `👥 Indicados: ${user.total_referrals || 0}\n\n` +
            `📊 *ESTATÍSTICAS:*\n` +
            `🛒 Compras: ${purchasesCount}\n` +
            `💳 Total gasto: R$ ${parseFloat(totalSpent).toFixed(2)}\n` +
            `💰 Total depositado: R$ ${parseFloat(totalDeposited).toFixed(2)}\n` +
            `📅 Cadastro: ${user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : 'N/A'}`;

        const buttons = [
            { id: 'add_balance', text: '💰 ADICIONAR SALDO' },
            { id: 'main_menu', text: '🏠 MENU INICIAL' }
        ];

        await sendButtonMessage(phone, profileMessage, buttons);
    } catch (error) {
        logger.error('❌ Erro ao mostrar perfil:', error);
    }
}

module.exports = {
    handleMessage,
    showMainMenu
};
