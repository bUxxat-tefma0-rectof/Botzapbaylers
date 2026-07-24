const { sendTextMessage, sendButtonMessage } = require('../../services/whatsapp');
const User = require('../../database/models/User');
const Referral = require('../../database/models/Referral');
const { getMessage, processMessageVariables } = require('../../utils/messages');
const { getReferralButtons } = require('../../utils/buttons');
const { getSetting } = require('../../utils/settings');
const logger = require('../../utils/logger');

async function handleReferralMenu(phone, user) {
    try {
        const bonusPercentage = await getSetting('referral_bonus', '0');
        const message = processMessageVariables('referral_menu', {
            ...user,
            referral_link: `https://api.whatsapp.com/send?phone=${process.env.WHATSAPP_NUMBER}&text=${user.referral_code}`,
            referral_code: user.referral_code,
            bonus_balance: parseFloat(user.bonus_balance || 0).toFixed(2),
            total_referrals: user.total_referrals || 0,
            bonus_percentage: bonusPercentage
        });

        const buttons = getReferralButtons();
        await sendButtonMessage(phone, message, buttons);
    } catch (error) {
        logger.error('❌ Erro no menu de indicação:', error);
    }
}

async function sendReferralTextModel(phone, user) {
    try {
        const message = processMessageVariables('referral_text', {
            ...user,
            referral_link: `https://api.whatsapp.com/send?phone=${process.env.WHATSAPP_NUMBER}&text=${user.referral_code}`,
            referral_code: user.referral_code
        });
        await sendTextMessage(phone, message);
    } catch (error) {
        logger.error('❌ Erro ao enviar texto modelo:', error);
    }
}

async function processReferralCode(phone, code, user) {
    try {
        if (user.referred_by) {
            await sendTextMessage(phone, 'ℹ️ Você já foi indicado anteriormente!');
            return;
        }
        if (code === user.referral_code) {
            await sendTextMessage(phone, '❌ Você não pode se auto-indicar!');
            return;
        }

        const referrer = User.findByReferralCode(code);
        if (!referrer) {
            await sendTextMessage(phone, '❌ Código de indicação inválido!');
            return;
        }

        Referral.create(referrer.phone, phone, 0, 0);
        User.incrementReferrals(referrer.phone);

        const db = require('../../database/connection').getDatabase();
        db.prepare('UPDATE users SET referred_by = ? WHERE phone = ?').run(referrer.phone, phone);

        await sendTextMessage(phone, `✅ Indicação registrada com sucesso!`);

        const { sendTextMessage: sendMsg } = require('../../services/whatsapp');
        await sendMsg(referrer.phone, `🎉 NOVA INDICAÇÃO!\n\n${phone} se cadastrou com seu código!`);

        // Bônus de registro
        const registrationBonus = parseFloat(await getSetting('registration_bonus', '0'));
        if (registrationBonus > 0) {
            User.updateBalance(phone, registrationBonus);
            await sendTextMessage(phone, `🎁 Bônus de registro: R$ ${registrationBonus.toFixed(2)}`);
        }
    } catch (error) {
        logger.error('❌ Erro ao processar indicação:', error);
    }
}

module.exports = {
    handleReferralMenu,
    sendReferralTextModel,
    processReferralCode
};
