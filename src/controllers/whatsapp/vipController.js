const { sendButtonMessage, sendTextMessage } = require('../../services/whatsapp');
const User = require('../../database/models/User');
const { getSetting } = require('../../utils/settings');
const logger = require('../../utils/logger');

// ============================================
// MENU VIP
// ============================================
async function handleVipMenu(phone, user) {
    try {
        const db = require('../../database/connection').getDatabase();

        // Criar tabela de vips se não existir
        db.run(`CREATE TABLE IF NOT EXISTS vips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_phone TEXT UNIQUE,
            is_vip BOOLEAN DEFAULT 0,
            plan_type TEXT DEFAULT 'mensal',
            price DECIMAL(10,2) DEFAULT 0,
            start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            expiration_date DATETIME,
            is_active BOOLEAN DEFAULT 1
        )`);

        const vip = db.prepare('SELECT * FROM vips WHERE user_phone = ? AND is_active = 1').get(phone);

        let message = `👑 *ÁREA VIP*\n\n`;

        if (vip) {
            const expirationDate = new Date(vip.expiration_date);
            const now = new Date();
            const daysLeft = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));

            message += `✅ *VOCÊ É VIP!*\n\n`;
            message += `📅 Plano: ${vip.plan_type}\n`;
            message += `💰 Valor: R$ ${parseFloat(vip.price).toFixed(2)}\n`;
            message += `⏰ Vencimento: ${expirationDate.toLocaleDateString('pt-BR')}\n`;
            message += `📆 Dias restantes: ${daysLeft}\n\n`;
            message += `*Benefícios VIP:*\n`;
            message += `✅ Desconto em assinaturas\n`;
            message += `✅ Acesso antecipado\n`;
            message += `✅ Suporte prioritário\n`;
            message += `✅ Bônus em recargas\n`;
        } else {
            message += `🌟 *SEJA VIP!*\n\n`;
            message += `Tenha acesso a benefícios exclusivos:\n\n`;
            message += `✅ Desconto em assinaturas\n`;
            message += `✅ Acesso antecipado\n`;
            message += `✅ Suporte prioritário\n`;
            message += `✅ Bônus em recargas\n\n`;
            message += `Escolha seu plano:`;
        }

        const buttons = [];

        if (vip) {
            buttons.push({ id: 'vip_info', text: '📊 Meu Plano' });
            buttons.push({ id: 'vip_renew', text: '🔄 Renovar VIP' });
        } else {
            buttons.push({ id: 'vip_monthly', text: '📅 Plano Mensal - R$ 19,90' });
            buttons.push({ id: 'vip_quarterly', text: '📅 Plano Trimestral - R$ 49,90' });
            buttons.push({ id: 'vip_yearly', text: '📅 Plano Anual - R$ 149,90' });
        }

        buttons.push({ id: 'main_menu', text: '🏠 Menu Inicial' });

        await sendButtonMessage(phone, message, buttons);

    } catch (error) {
        logger.error('❌ Erro no menu VIP:', error);
    }
}

// ============================================
// COMPRAR PLANO VIP
// ============================================
async function handleVipPurchase(phone, user, planType) {
    try {
        let price = 0;
        let duration = '';

        switch (planType) {
            case 'vip_monthly':
                price = 19.90;
                duration = 'mensal';
                break;
            case 'vip_quarterly':
                price = 49.90;
                duration = 'trimestral';
                break;
            case 'vip_yearly':
                price = 149.90;
                duration = 'anual';
                break;
            default:
                return;
        }

        const userBalance = parseFloat(user.balance);

        if (userBalance < price) {
            await sendTextMessage(phone, `❌ Saldo insuficiente!\n\n💰 Seu saldo: R$ ${userBalance.toFixed(2)}\n💳 Necessário: R$ ${price.toFixed(2)}\n\nFaça uma recarga primeiro.`);
            return;
        }

        // Confirmar
        const confirmMessage = `👑 *CONFIRMAR PLANO VIP*\n\n` +
            `📅 Plano: ${duration}\n` +
            `💰 Valor: R$ ${price.toFixed(2)}\n` +
            `💳 Seu saldo: R$ ${userBalance.toFixed(2)}\n` +
            `💸 Saldo após: R$ ${(userBalance - price).toFixed(2)}\n\n` +
            `Deseja confirmar?`;

        const buttons = [
            { id: `confirm_vip_${planType}`, text: '✅ Confirmar' },
            { id: 'main_menu', text: '❌ Cancelar' }
        ];

        await sendButtonMessage(phone, confirmMessage, buttons);

    } catch (error) {
        logger.error('❌ Erro ao comprar VIP:', error);
    }
}

// ============================================
// CONFIRMAR COMPRA VIP
// ============================================
async function handleConfirmVip(phone, user, planType) {
    try {
        let price = 0;
        let durationDays = 0;
        let durationName = '';

        switch (planType) {
            case 'vip_monthly':
                price = 19.90;
                durationDays = 30;
                durationName = 'Mensal';
                break;
            case 'vip_quarterly':
                price = 49.90;
                durationDays = 90;
                durationName = 'Trimestral';
                break;
            case 'vip_yearly':
                price = 149.90;
                durationDays = 365;
                durationName = 'Anual';
                break;
            default:
                return;
        }

        const userBalance = parseFloat(user.balance);
        if (userBalance < price) {
            await sendTextMessage(phone, '❌ Saldo insuficiente!');
            return;
        }

        // Debitar saldo
        User.updateBalance(phone, -price);

        // Ativar VIP
        const db = require('../../database/connection').getDatabase();
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + durationDays);

        const existingVip = db.prepare('SELECT * FROM vips WHERE user_phone = ?').get(phone);

        if (existingVip) {
            // Se já tem VIP, estender
            const currentExpiration = new Date(existingVip.expiration_date);
            if (currentExpiration > new Date()) {
                expirationDate.setDate(currentExpiration.getDate() + durationDays);
            }
            db.prepare('UPDATE vips SET plan_type = ?, price = ?, expiration_date = ?, is_active = 1 WHERE user_phone = ?').run(durationName, price, expirationDate.toISOString(), phone);
        } else {
            db.prepare('INSERT INTO vips (user_phone, is_vip, plan_type, price, expiration_date) VALUES (?, 1, ?, ?, ?)').run(phone, durationName, price, expirationDate.toISOString());
        }

        // Registrar transação
        const Transaction = require('../../database/models/Transaction');
        const { generateId } = require('../../utils/idGenerator');
        const transactionId = generateId();
        Transaction.create(transactionId, phone, 'vip_purchase', price, null, null, null, null);
        Transaction.updateStatus(transactionId, 'approved');

        const updatedUser = User.findByPhone(phone);

        const successMessage = `✅ *VIP ATIVADO!*\n\n` +
            `👑 Plano: ${durationName}\n` +
            `💰 Valor: R$ ${price.toFixed(2)}\n` +
            `📅 Vencimento: ${expirationDate.toLocaleDateString('pt-BR')}\n` +
            `💳 Saldo: R$ ${parseFloat(updatedUser.balance).toFixed(2)}\n\n` +
            `Aproveite seus benefícios VIP! 🎉`;

        await sendTextMessage(phone, successMessage);

        logger.info(`✅ VIP ativado: ${phone} - ${durationName}`);

    } catch (error) {
        logger.error('❌ Erro ao confirmar VIP:', error);
        await sendTextMessage(phone, '❌ Erro ao ativar VIP!');
    }
}

// ============================================
// VERIFICAR SE USUÁRIO É VIP
// ============================================
function isVip(phone) {
    try {
        const db = require('../../database/connection').getDatabase();
        db.run(`CREATE TABLE IF NOT EXISTS vips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_phone TEXT UNIQUE,
            is_vip BOOLEAN DEFAULT 0,
            plan_type TEXT DEFAULT 'mensal',
            price DECIMAL(10,2) DEFAULT 0,
            start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            expiration_date DATETIME,
            is_active BOOLEAN DEFAULT 1
        )`);

        const vip = db.prepare('SELECT * FROM vips WHERE user_phone = ? AND is_active = 1').get(phone);
        if (!vip) return false;

        const now = new Date();
        const expiration = new Date(vip.expiration_date);
        return now < expiration;
    } catch (error) {
        return false;
    }
}

module.exports = {
    handleVipMenu,
    handleVipPurchase,
    handleConfirmVip,
    isVip
};
