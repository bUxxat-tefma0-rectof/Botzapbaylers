const { sendButtonMessage, sendTextMessage, sendImageMessage } = require('../../services/whatsapp');
const Product = require('../../database/models/Product');
const { getBackButton } = require('../../utils/buttons');
const logger = require('../../utils/logger');

async function handleSearchService(phone, user) {
    try {
        const message = `🔍 *PESQUISAR SERVIÇO*\n\n` +
            `Digite o nome do serviço que você procura:\n\n` +
            `Ex: NETFLIX, HBO, YOUTUBE, DISNEY, etc.\n\n` +
            `O bot irá mostrar todos os serviços disponíveis com esse nome.`;

        await sendTextMessage(phone, message);

        global.waitingFor = global.waitingFor || {};
        global.waitingFor[phone] = 'search_service_query';

    } catch (error) {
        logger.error('❌ Erro ao pesquisar serviço:', error);
    }
}

async function processSearchQuery(phone, user, query) {
    try {
        const platform = query.trim().toUpperCase();
        const products = Product.findByPlatform(platform);

        if (products.length === 0) {
            const { showMainMenu } = require('./menuController');
            await sendTextMessage(phone, `❌ Nenhum serviço encontrado para: *${platform}*\n\nTente outro nome.`);
            await showMainMenu(phone, user);
            return;
        }

        const db = require('../../database/connection').getDatabase();
        const serviceImage = db.prepare('SELECT image_url FROM service_images WHERE platform = ?').get(platform);

        let message = `🔍 *RESULTADOS PARA: ${platform}*\n\n`;

        const availableProducts = products.filter(p => p.stock > 0 && p.is_active);

        for (const product of availableProducts) {
            message += `📌 *${product.name}*\n`;
            message += `💰 Valor: R$ ${parseFloat(product.value).toFixed(2)}\n`;
            message += `📦 Estoque: ${product.stock}\n`;
            if (product.description) message += `📝 ${product.description}\n`;
            message += `━━━━━━━━━━━━━━\n`;
        }

        if (availableProducts.length === 0) {
            message += `\n⚠️ Todos os serviços desta plataforma estão esgotados no momento.`;
        }

        if (serviceImage && serviceImage.image_url) {
            try {
                await sendImageMessage(phone, serviceImage.image_url, message);
            } catch (e) {
                await sendTextMessage(phone, message);
            }
        } else {
            await sendTextMessage(phone, message);
        }

        const buttons = getBackButton();
        await sendButtonMessage(phone, 'Deseja voltar ao menu principal?', buttons);

    } catch (error) {
        logger.error('❌ Erro ao processar pesquisa:', error);
        await sendTextMessage(phone, '❌ Erro ao pesquisar. Tente novamente.');
    }
}

module.exports = {
    handleSearchService,
    processSearchQuery
};
