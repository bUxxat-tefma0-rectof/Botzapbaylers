const { sendButtonMessage, sendTextMessage, sendImageMessage } = require('../../services/whatsapp');
const User = require('../../database/models/User');
const Transaction = require('../../database/models/Transaction');
const { generatePix, generateQrCodeImage } = require('../../services/mercadopago');
const { getMessage, processMessageVariables } = require('../../utils/messages');
const { getSetting } = require('../../utils/settings');
const { formatDateTime } = require('../../utils/dateUtils');
const { generateId } = require('../../utils/idGenerator');
const logger = require('../../utils/logger');

// ============================================
// MENU DE GIFT CARDS
// ============================================
async function handleGiftCardMenu(phone, user) {
    try {
        const message = `🎁 *GIFT CARDS*\n\n` +
            `Presenteie alguém com saldo no bot!\n\n` +
            `Escolha o valor do Gift Card:\n\n` +
            `O Gift Card gera um código que a pessoa pode resgatar por saldo.`;

        const buttons = [
            { id: 'giftcard_10', text: '🎁 R$ 10,00' },
            { id: 'giftcard_25', text: '🎁 R$ 25,00' },
            { id: 'giftcard_50', text: '🎁 R$ 50,00' },
            { id: 'giftcard_custom', text: '✍️ Outro Valor' },
            { id: 'main_menu', text: '🏠 Menu Inicial' }
        ];

        await sendButtonMessage(phone, message, buttons);
    } catch (error) {
        logger.error('❌ Erro no menu gift card:', error);
    }
}

// ============================================
// PROCESSAR COMPRA DE GIFT CARD
// ============================================
async function handleGiftCardPurchase(phone, user, buttonId) {
    try {
        let amount = 0;

        switch (buttonId) {
            case 'giftcard_10': amount = 10.00; break;
            case 'giftcard_25': amount = 25.00; break;
            case 'giftcard_50': amount = 50.00; break;
            case 'giftcard_custom':
                await sendTextMessage(phone, '💵 *DIGITE O VALOR DO GIFT CARD:*\n\nEnvie o valor em reais (ex: 100)');
                global.waitingFor = global.waitingFor || {};
                global.waitingFor[phone] = 'giftcard_custom_value';
                return;
            default:
                return;
        }

        if (amount > 0) {
            await processGiftCardPayment(phone, user, amount);
        }

    } catch (error) {
        logger.error('❌ Erro ao comprar gift card:', error);
    }
}

// ============================================
// PROCESSAR VALOR PERSONALIZADO GIFT CARD
// ============================================
async function handleCustomGiftCardValue(phone, user, value) {
    try {
        const amount = parseFloat(value.replace(',', '.'));

        if (isNaN(amount) || amount <= 0) {
            await sendTextMessage(phone, '❌ Valor inválido! Digite um valor válido.');
            return;
        }

        if (amount < 5) {
            await sendTextMessage(phone, '❌ Valor mínimo: R$ 5,00');
            return;
        }

        await processGiftCardPayment(phone, user, amount);

    } catch (error) {
        logger.error('❌ Erro ao processar valor gift card:', error);
    }
}

// ============================================
// PROCESSAR PAGAMENTO DO GIFT CARD
// ============================================
async function processGiftCardPayment(phone, user, amount) {
    try {
        // Verificar saldo
        const userBalance = parseFloat(user.balance);
        if (userBalance < amount) {
            await sendTextMessage(phone, '❌ Saldo insuficiente! Faça uma recarga primeiro.');
            return;
        }

        // Confirmar compra
        const confirmMessage = `🎁 *CONFIRMAR GIFT CARD*\n\n` +
            `💰 Valor: R$ ${amount.toFixed(2)}\n` +
            `💳 Seu saldo: R$ ${userBalance.toFixed(2)}\n` +
            `💸 Saldo após: R$ ${(userBalance - amount).toFixed(2)}\n\n` +
            `Deseja confirmar a compra do Gift Card?`;

        const buttons = [
            { id: `confirm_giftcard_${amount}`, text: '✅ Confirmar' },
            { id: 'main_menu', text: '❌ Cancelar' }
        ];

        await sendButtonMessage(phone, confirmMessage, buttons);

    } catch (error) {
        logger.error('❌ Erro ao processar pagamento gift card:', error);
    }
}

// ============================================
// CONFIRMAR GIFT CARD
// ============================================
async function handleConfirmGiftCard(phone, user, amount) {
    try {
        const userBalance = parseFloat(user.balance);

        if (userBalance < amount) {
            await sendTextMessage(phone, '❌ Saldo insuficiente!');
            return;
        }

        // Debitar saldo
        User.updateBalance(phone, -amount);

        // Gerar código do gift card
        const giftCode = `GIFT-${generateId().substring(0, 8).toUpperCase()}`;

        // Salvar no banco
        const db = require('../../database/connection').getDatabase();
        db.prepare('INSERT INTO transactions (id, user_phone, type, amount, status) VALUES (?, ?, ?, ?, ?)').run(
            giftCode, phone, 'giftcard_purchase', amount, 'approved'
        );

        // Criar gift card
        db.run(`
            CREATE TABLE IF NOT EXISTS giftcards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                buyer_phone TEXT,
                redeemer_phone TEXT,
                is_redeemed BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                redeemed_at DATETIME
            )
        `);

        db.prepare('INSERT INTO giftcards (code, amount, buyer_phone) VALUES (?, ?, ?)').run(giftCode, amount, phone);

        // Mensagem de sucesso
        const updatedUser = User.findByPhone(phone);
        const successMessage = `✅ *GIFT CARD COMPRADO!*\n\n` +
            `🎁 Código: *${giftCode}*\n` +
            `💰 Valor: R$ ${amount.toFixed(2)}\n` +
            `💳 Seu saldo: R$ ${parseFloat(updatedUser.balance).toFixed(2)}\n\n` +
            `📤 *Envie este código para a pessoa presenteada!*\n\n` +
            `Para resgatar, a pessoa deve enviar o código aqui no bot.\n\n` +
            `⚠️ Guarde este código! Ele não será mostrado novamente.`;

        await sendTextMessage(phone, successMessage);

        logger.info(`✅ Gift Card criado: ${giftCode} - R$ ${amount}`);

    } catch (error) {
        logger.error('❌ Erro ao confirmar gift card:', error);
        await sendTextMessage(phone, '❌ Erro ao processar gift card!');
    }
}

// ============================================
// RESGATAR GIFT CARD
// ============================================
async function handleRedeemGiftCard(phone, user, code) {
    try {
        const db = require('../../database/connection').getDatabase();

        // Verificar se tabela existe
        db.run(`CREATE TABLE IF NOT EXISTS giftcards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            buyer_phone TEXT,
            redeemer_phone TEXT,
            is_redeemed BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            redeemed_at DATETIME
        )`);

        const giftcard = db.prepare('SELECT * FROM giftcards WHERE code = ?').get(code.trim().toUpperCase());

        if (!giftcard) {
            await sendTextMessage(phone, '❌ Gift Card não encontrado! Verifique o código.');
            return;
        }

        if (giftcard.is_redeemed) {
            await sendTextMessage(phone, '❌ Este Gift Card já foi resgatado!');
            return;
        }

        // Não pode resgatar o próprio gift card
        if (giftcard.buyer_phone === phone) {
            await sendTextMessage(phone, '❌ Você não pode resgatar seu próprio Gift Card!');
            return;
        }

        // Resgatar
        db.prepare('UPDATE giftcards SET is_redeemed = 1, redeemer_phone = ?, redeemed_at = CURRENT_TIMESTAMP WHERE code = ?').run(phone, giftcard.code);

        // Creditar saldo
        User.updateBalance(phone, giftcard.amount);

        // Registrar transação
        const transactionId = generateId();
        Transaction.create(transactionId, phone, 'giftcard', giftcard.amount, null, null, null, null);
        Transaction.updateStatus(transactionId, 'approved');

        const updatedUser = User.findByPhone(phone);

        const successMessage = `🎉 *GIFT CARD RESGATADO!*\n\n` +
            `🎁 Código: ${giftcard.code}\n` +
            `💰 Valor: R$ ${parseFloat(giftcard.amount).toFixed(2)}\n` +
            `💳 Seu saldo: R$ ${parseFloat(updatedUser.balance).toFixed(2)}\n\n` +
            `Aproveite seu saldo! 🎊`;

        await sendTextMessage(phone, successMessage);

        // Notificar comprador
        if (giftcard.buyer_phone) {
            const { sendTextMessage: sendMsg } = require('../../services/whatsapp');
            await sendMsg(giftcard.buyer_phone, `🎁 *SEU GIFT CARD FOI RESGATADO!*\n\nCódigo: ${giftcard.code}\nValor: R$ ${parseFloat(giftcard.amount).toFixed(2)}\nResgatado por: ${phone}`);
        }

        logger.info(`✅ Gift Card resgatado: ${giftcard.code} por ${phone}`);

    } catch (error) {
        logger.error('❌ Erro ao resgatar gift card:', error);
        await sendTextMessage(phone, '❌ Erro ao resgatar gift card!');
    }
}

// ============================================
// LISTAR MEUS GIFT CARDS
// ============================================
async function handleMyGiftCards(phone, user) {
    try {
        const db = require('../../database/connection').getDatabase();

        db.run(`CREATE TABLE IF NOT EXISTS giftcards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            buyer_phone TEXT,
            redeemer_phone TEXT,
            is_redeemed BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            redeemed_at DATETIME
        )`);

        const purchased = db.prepare('SELECT * FROM giftcards WHERE buyer_phone = ? ORDER BY created_at DESC').all(phone);
        const redeemed = db.prepare('SELECT * FROM giftcards WHERE redeemer_phone = ? ORDER BY redeemed_at DESC').all(phone);

        let message = `🎁 *MEUS GIFT CARDS*\n\n`;

        if (purchased.length > 0) {
            message += `📤 *COMPRADOS:*\n`;
            for (const g of purchased) {
                message += `🎁 ${g.code} - R$ ${parseFloat(g.amount).toFixed(2)} - ${g.is_redeemed ? '✅ Resgatado' : '⏳ Pendente'}\n`;
            }
            message += '\n';
        }

        if (redeemed.length > 0) {
            message += `📥 *RESGATADOS:*\n`;
            for (const g of redeemed) {
                message += `🎁 ${g.code} - R$ ${parseFloat(g.amount).toFixed(2)}\n`;
            }
        }

        if (purchased.length === 0 && redeemed.length === 0) {
            message += `Você ainda não tem Gift Cards.\n\nCompre um para presentear alguém!`;
        }

        const buttons = [
            { id: 'giftcard_menu', text: '🎁 Comprar Gift Card' },
            { id: 'main_menu', text: '🏠 Menu Inicial' }
        ];

        await sendButtonMessage(phone, message, buttons);

    } catch (error) {
        logger.error('❌ Erro ao listar gift cards:', error);
    }
}

module.exports = {
    handleGiftCardMenu,
    handleGiftCardPurchase,
    handleCustomGiftCardValue,
    handleConfirmGiftCard,
    handleRedeemGiftCard,
    handleMyGiftCards
};
