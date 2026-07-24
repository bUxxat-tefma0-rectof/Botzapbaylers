const { sendButtonMessage, sendTextMessage } = require('../../services/whatsapp');
const Transaction = require('../../database/models/Transaction');
const Product = require('../../database/models/Product');
const { getBackButton } = require('../../utils/buttons');
const logger = require('../../utils/logger');

async function handleHistoryMenu(phone, user) {
    try {
        const transactions = Transaction.findByUser(phone);
        
        if (transactions.length === 0) {
            await sendTextMessage(phone, '📭 *NENHUMA COMPRA ENCONTRADA!*\n\nVocê ainda não fez nenhuma compra.');
            return;
        }

        let message = `📋 *HISTÓRICO DE COMPRAS*\n\n`;
        message += `Total de transações: ${transactions.length}\n`;
        message += `━━━━━━━━━━━━━━━━\n\n`;

        // Mostrar últimas 5
        const recent = transactions.slice(0, 5);
        
        for (const t of recent) {
            let emoji = '';
            let typeText = '';
            
            switch (t.type) {
                case 'purchase':
                    emoji = '🛒';
                    typeText = 'Compra';
                    break;
                case 'deposit':
                    emoji = '💰';
                    typeText = 'Recarga';
                    break;
                case 'giftcard':
                    emoji = '🎁';
                    typeText = 'Gift Card';
                    break;
                case 'giftcard_purchase':
                    emoji = '🎁';
                    typeText = 'Compra Gift Card';
                    break;
                case 'vip_purchase':
                    emoji = '👑';
                    typeText = 'VIP';
                    break;
                default:
                    emoji = '📌';
                    typeText = t.type;
            }

            let statusEmoji = '';
            switch (t.status) {
                case 'approved': statusEmoji = '✅'; break;
                case 'pending': statusEmoji = '⏳'; break;
                case 'cancelled': statusEmoji = '❌'; break;
                case 'expired': statusEmoji = '⏰'; break;
                default: statusEmoji = '📌';
            }

            message += `${emoji} *${typeText}* ${statusEmoji}\n`;
            message += `💰 Valor: R$ ${parseFloat(t.amount).toFixed(2)}\n`;
            message += `📅 Data: ${new Date(t.created_at).toLocaleDateString('pt-BR')}\n`;
            message += `🕐 Hora: ${new Date(t.created_at).toLocaleTimeString('pt-BR')}\n`;
            
            if (t.product_id) {
                const product = Product.findById(t.product_id);
                if (product) {
                    message += `📦 Produto: ${product.name}\n`;
                }
            }
            
            message += `🆔 ID: ${t.id.substring(0, 12)}...\n`;
            message += `━━━━━━━━━━━━━━━━\n`;
        }

        if (transactions.length > 5) {
            message += `\n📄 Mostrando as 5 mais recentes de ${transactions.length} transações.`;
        }

        const buttons = [
            { id: 'history_full', text: '📋 VER TODAS' },
            { id: 'main_menu', text: '🏠 MENU INICIAL' }
        ];

        await sendButtonMessage(phone, message, buttons);

    } catch (error) {
        logger.error('❌ Erro ao mostrar histórico:', error);
    }
}

async function handleFullHistory(phone, user) {
    try {
        const transactions = Transaction.findByUser(phone);
        
        if (transactions.length === 0) {
            await sendTextMessage(phone, '📭 Nenhuma transação encontrada!');
            return;
        }

        // Dividir em mensagens menores (máximo 10 por mensagem)
        const chunkSize = 10;
        const chunks = [];
        
        for (let i = 0; i < transactions.length; i += chunkSize) {
            chunks.push(transactions.slice(i, i + chunkSize));
        }

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            let message = '';
            
            if (i === 0) {
                message = `📋 *HISTÓRICO COMPLETO*\n`;
                message += `Total: ${transactions.length} transações\n`;
                message += `━━━━━━━━━━━━━━━━\n\n`;
            } else {
                message = `📋 *CONTINUAÇÃO...*\n\n`;
            }

            for (const t of chunk) {
                let typeText = t.type === 'purchase' ? '🛒 Compra' : 
                               t.type === 'deposit' ? '💰 Recarga' : 
                               t.type === 'giftcard' ? '🎁 Gift Card' :
                               t.type === 'vip_purchase' ? '👑 VIP' : '📌 ' + t.type;
                
                let statusText = t.status === 'approved' ? '✅' : 
                                 t.status === 'pending' ? '⏳' : 
                                 t.status === 'cancelled' ? '❌' : '⏰';

                message += `${typeText} ${statusText} | R$ ${parseFloat(t.amount).toFixed(2)} | ${new Date(t.created_at).toLocaleDateString('pt-BR')}\n`;
            }

            await sendTextMessage(phone, message);
            
            // Pequeno delay entre mensagens
            if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const buttons = getBackButton();
        await sendButtonMessage(phone, '\nVoltar ao menu?', buttons);

    } catch (error) {
        logger.error('❌ Erro ao mostrar histórico completo:', error);
    }
}

module.exports = {
    handleHistoryMenu,
    handleFullHistory
};
