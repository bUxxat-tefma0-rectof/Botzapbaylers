const { sendButtonMessage } = require('../../services/whatsapp');
const { getMessage, processMessageVariables } = require('../../utils/messages');
const { getSetting } = require('../../utils/settings');
const { getBackButton } = require('../../utils/buttons');
const logger = require('../../utils/logger');

async function handleSupportMenu(phone, user) {
    try {
        const supportLink = await getSetting('support_link', 'https://t.me/suporte');
        
        const message = processMessageVariables('support_message', {
            ...user,
            support_link: supportLink
        });
        
        const buttons = getBackButton();
        await sendButtonMessage(phone, message, buttons);
        
    } catch (error) {
        logger.error('❌ Erro no menu de suporte:', error);
    }
}

module.exports = {
    handleSupportMenu
};
