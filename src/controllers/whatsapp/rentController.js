const { sendButtonMessage, sendTextMessage } = require('../../services/whatsapp');
const { getBackButton } = require('../../utils/buttons');
const { getSetting } = require('../../utils/settings');
const logger = require('../../utils/logger');

async function handleRentBotMenu(phone, user) {
    try {
        const supportLink = await getSetting('support_link', 'https://t.me/suporte');

        const message = `🤖 *ALUGAR BOT*\n\n` +
            `Quer ter seu próprio bot igual a esse?\n\n` +
            `✅ WhatsApp + Painel Admin Telegram\n` +
            `✅ Venda de assinaturas premium\n` +
            `✅ PIX automático Mercado Pago\n` +
            `✅ Sistema de afiliados\n` +
            `✅ Estoque de logins\n` +
            `✅ Transmissão em massa\n` +
            `✅ E muito mais!\n\n` +
            `📞 Entre em contato para saber valores e condições!\n\n` +
            `💬 Chame no Telegram:\n👉 ${supportLink}`;

        const buttons = getBackButton();
        await sendButtonMessage(phone, message, buttons);
    } catch (error) {
        logger.error('❌ Erro no menu alugar bot:', error);
    }
}

module.exports = {
    handleRentBotMenu
};
