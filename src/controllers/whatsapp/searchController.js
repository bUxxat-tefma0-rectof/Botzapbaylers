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

        // Aguardar resposta
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
            await sendTextMessage(phone, `❌ Nenhum serviço encontrado para: ${platform}`);
            return;
        }

        // Buscar imagem da plataforma
        const db = require('../../database/connection').getDatabase();
        const serviceImage = db.prepare('SELECT image_url FROM service_images WHERE platform = ?').get(platform);

        let message = `🔍 *RESULTADOS PARA: ${platform}*\n\n`;

        for (const product of products) {
            if (product.stock > 0 && product.is_active) {
                message += `📌 *${product.name}*\n`;
                message += `💰 Valor: R$ ${parseFloat(product.value).toFixed(2)}\n`;
                message += `📦 Estoque: ${product.stock}\n`;
                message += `📝 ${product.description || ''}\n`;
                message += `━━━━━━━━━━━━━━\n`;
            }
        }

        // Enviar imagem se existir
        if (serviceImage && serviceImage.image_url) {
            try {
                await sendImageMessage(phone, serviceImage.image_url, message);
            } catch (e) {
                await sendTextMessage(phone, message);
            }
        } else {
            await sendTextMessage(phone, message);
        }

        // Botão de comprar ou voltar
        const buttons = getBackButton();
        await sendButtonMessage(phone, '\nDeseja voltar ao menu?', buttons);

    } catch (error) {
        logger.error('❌ Erro ao processar pesquisa:', error);
    }
}

module.exports = {
    handleSearchService,
    processSearchQuery
};
