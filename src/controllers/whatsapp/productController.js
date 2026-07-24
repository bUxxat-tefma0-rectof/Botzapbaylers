const { sendTextMessage, sendButtonMessage, sendPdfMessage } = require('../../services/whatsapp');
const { generateCredentialsPdf, deletePdf } = require('../../services/pdf');
const User = require('../../database/models/User');
const Product = require('../../database/models/Product');
const Transaction = require('../../database/models/Transaction');
const { getMessage, processMessageVariables } = require('../../utils/messages');
const { getProductButtons, getConfirmCancelButtons } = require('../../utils/buttons');
const { generateId } = require('../../utils/idGenerator');
const logger = require('../../utils/logger');

async function handlePremiumMenu(phone, user, page = 1) {
    try {
        const products = Product.findAllActive();
        if (products.length === 0) {
            await sendTextMessage(phone, '📭 Nenhum produto disponível no momento!');
            return;
        }

        const itemsPerPage = 5;
        const totalPages = Math.ceil(products.length / itemsPerPage);
        const start = (page - 1) * itemsPerPage;
        const pageProducts = products.slice(start, start + itemsPerPage);

        let message = processMessageVariables('premium_menu', user);
        message += '\n\n*📦 PRODUTOS DISPONÍVEIS:*\n\n';

        for (const product of pageProducts) {
            message += `📌 *${product.name}*\n`;
            message += `💰 Valor: R$ ${parseFloat(product.value).toFixed(2)}\n`;
            message += `📦 Estoque: ${product.stock} unidades\n`;
            message += `━━━━━━━━━━━━━━\n`;
        }
        message += `\n📄 Página ${page} de ${totalPages}`;

        const buttons = getProductButtons(pageProducts, page, totalPages);
        await sendButtonMessage(phone, message, buttons);
    } catch (error) {
        logger.error('❌ Erro no menu premium:', error);
    }
}

async function handleProductPurchase(phone, user, buttonId) {
    try {
        const productId = parseInt(buttonId.replace('buy_', ''));
        const product = Product.findById(productId);

        if (!product) {
            await sendTextMessage(phone, '❌ Produto não encontrado!');
            return;
        }
        if (!Product.hasStock(productId)) {
            await sendTextMessage(phone, getMessage('out_of_stock'));
            return;
        }

        const userBalance = parseFloat(user.balance);
        const productPrice = parseFloat(product.value);

        if (userBalance < productPrice) {
            await sendTextMessage(phone, getMessage('insufficient_balance'));
            return;
        }

        const balanceAfter = (userBalance - productPrice).toFixed(2);
        const confirmMessage = processMessageVariables('purchase_confirm', {
            ...user,
            product_name: product.name,
            product_price: productPrice.toFixed(2),
            user_balance: userBalance.toFixed(2),
            balance_after: balanceAfter
        });

        const buttons = getConfirmCancelButtons(productId);
        await sendButtonMessage(phone, confirmMessage, buttons);
    } catch (error) {
        logger.error('❌ Erro ao comprar produto:', error);
    }
}

async function handleConfirmPurchase(phone, user, buttonId) {
    try {
        const productId = parseInt(buttonId.replace('confirm_buy_', ''));
        const product = Product.findById(productId);

        if (!product || !Product.hasStock(productId)) {
            await sendTextMessage(phone, '❌ Produto indisponível!');
            return;
        }

        const userBalance = parseFloat(user.balance);
        const productPrice = parseFloat(product.value);

        if (userBalance < productPrice) {
            await sendTextMessage(phone, getMessage('insufficient_balance'));
            return;
        }

        // Debitar saldo
        User.updateBalance(phone, -productPrice);

        // Reduzir estoque
        Product.decreaseStock(productId);

        // Registrar transação
        const transactionId = generateId();
        Transaction.create(transactionId, phone, 'purchase', productPrice, null, null, null, productId);
        Transaction.updateStatus(transactionId, 'approved');

        // Gerar PDF
        const pdfData = await generateCredentialsPdf(product.name, product.email, product.password, product.duration, phone);

        // Enviar mensagem de sucesso
        const updatedUser = User.findByPhone(phone);
        const successMessage = processMessageVariables('purchase_success', {
            ...updatedUser,
            product_name: product.name,
            product_price: productPrice.toFixed(2),
            balance_after: parseFloat(updatedUser.balance).toFixed(2)
        });

        await sendTextMessage(phone, successMessage);
        await sendPdfMessage(phone, pdfData.filePath, `${product.name}.pdf`);

        setTimeout(() => deletePdf(pdfData.filePath), 10000);

        // Bônus de afiliado
        if (user.referred_by) {
            const referralPoints = parseInt(await require('../../utils/settings').getSetting('referral_points_per_recharge', '10'));
            User.addReferralPoints(user.referred_by, referralPoints);
        }

        logger.info(`✅ Compra: ${phone} comprou ${product.name}`);
    } catch (error) {
        logger.error('❌ Erro ao confirmar compra:', error);
        await sendTextMessage(phone, '❌ Erro ao processar compra!');
    }
}

module.exports = {
    handlePremiumMenu,
    handleProductPurchase,
    handleConfirmPurchase
};
