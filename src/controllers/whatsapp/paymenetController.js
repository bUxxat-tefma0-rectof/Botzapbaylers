const { sendTextMessage, sendButtonMessage, sendImageMessage } = require('../../services/whatsapp');
const { generatePix, generateQrCodeImage } = require('../../services/mercadopago');
const User = require('../../database/models/User');
const Transaction = require('../../database/models/Transaction');
const { getMessage, processMessageVariables } = require('../../utils/messages');
const { getPaymentButtons } = require('../../utils/buttons');
const { getSetting } = require('../../utils/settings');
const { formatDateTime } = require('../../utils/dateUtils');
const logger = require('../../utils/logger');

async function handlePaymentMenu(phone, user, selectedValue = null) {
    try {
        if (selectedValue) {
            let amount = 0;
            switch (selectedValue) {
                case 'pix_5': amount = 5.00; break;
                case 'pix_8': amount = 8.00; break;
                case 'pix_20': amount = 20.00; break;
                case 'pix_custom':
                    await sendTextMessage(phone, '💵 *DIGITE O VALOR DESEJADO:*\n\nEnvie o valor em reais (ex: 50)');
                    global.waitingFor = global.waitingFor || {};
                    global.waitingFor[phone] = 'custom_pix_value';
                    return;
                default:
                    await showPaymentMenu(phone, user);
                    return;
            }
            if (amount > 0) {
                await processPixPayment(phone, user, amount);
            }
        } else {
            await showPaymentMenu(phone, user);
        }
    } catch (error) {
        logger.error('❌ Erro no menu de pagamento:', error);
    }
}

async function showPaymentMenu(phone, user) {
    const message = getMessage('add_balance_menu');
    const buttons = await getPaymentButtons();
    await sendButtonMessage(phone, message, buttons);
}

async function handleCustomPixValue(phone, user, value) {
    try {
        const amount = parseFloat(value.replace(',', '.'));
        if (isNaN(amount) || amount <= 0) {
            await sendTextMessage(phone, '❌ Valor inválido! Digite um valor válido.');
            return;
        }
        const minDeposit = parseFloat(await getSetting('pix_min_deposit', '1.00'));
        const maxDeposit = parseFloat(await getSetting('pix_max_deposit', '150.00'));
        if (amount < minDeposit) {
            await sendTextMessage(phone, `❌ Valor mínimo: R$ ${minDeposit.toFixed(2)}`);
            return;
        }
        if (amount > maxDeposit) {
            await sendTextMessage(phone, `❌ Valor máximo: R$ ${maxDeposit.toFixed(2)}`);
            return;
        }
        await processPixPayment(phone, user, amount);
    } catch (error) {
        logger.error('❌ Erro ao processar valor personalizado:', error);
    }
}

async function processPixPayment(phone, user, amount) {
    try {
        await sendTextMessage(phone, getMessage('generating_pix'));

        const pixData = await generatePix(amount);
        const qrImagePath = await generateQrCodeImage(pixData.qr_code_base64);

        Transaction.create(
            pixData.id, phone, 'deposit', amount,
            pixData.pix_code, pixData.qr_code_base64, pixData.expiration_date
        );

        const pixMessage = processMessageVariables('pix_qrcode', {
            ...user,
            transaction_id: pixData.id,
            amount: parseFloat(amount).toFixed(2),
            expiration_date: formatDateTime(pixData.expiration_date),
            expiration: await getSetting('pix_expiration', '15')
        });

        await sendImageMessage(phone, qrImagePath, pixMessage);
        await sendTextMessage(phone, `*🔑 CÓDIGO PIX:*\n\n\`\`\`${pixData.pix_code}\`\`\`\n\n⚠️ Expira em ${await getSetting('pix_expiration', '15')} minutos.`);

        logger.info(`✅ PIX gerado para ${phone}: R$ ${amount}`);
    } catch (error) {
        logger.error('❌ Erro ao processar PIX:', error);
        await sendTextMessage(phone, '❌ Erro ao gerar PIX! Tente novamente.');
    }
}

module.exports = {
    handlePaymentMenu,
    handleCustomPixValue,
    showPaymentMenu
};
