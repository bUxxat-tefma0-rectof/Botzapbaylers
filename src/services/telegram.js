const TelegramBot = require('node-telegram-bot-api');
const { config } = require('../config/database');
const logger = require('../utils/logger');
const { handleAdminMessage } = require('../controllers/telegram/adminController');

let bot = null;

async function startTelegram() {
    try {
        const token = config.telegram.adminToken;
        if (!token) {
            logger.error('❌ Token do Telegram não configurado');
            return;
        }

        bot = new TelegramBot(token, { polling: true });

        bot.on('message', async (msg) => {
            try {
                await handleAdminMessage(bot, msg);
            } catch (error) {
                logger.error('❌ Erro ao processar mensagem Telegram:', error);
            }
        });

        bot.on('callback_query', async (query) => {
            try {
                const { handleCallbackQuery } = require('../controllers/telegram/adminController');
                await handleCallbackQuery(bot, query);
            } catch (error) {
                logger.error('❌ Erro no callback:', error);
            }
        });

        logger.info('✅ Telegram Admin conectado!');
        return bot;

    } catch (error) {
        logger.error('❌ Erro ao iniciar Telegram:', error);
    }
}

function getBot() {
    return bot;
}

function sendMessage(chatId, text, options = {}) {
    if (!bot) return;
    return bot.sendMessage(chatId, text, options);
}

function sendMenu(chatId, text, buttons) {
    if (!bot) return;
    return bot.sendMessage(chatId, text, {
        reply_markup: {
            keyboard: buttons,
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });
}

module.exports = {
    startTelegram,
    getBot,
    sendMessage,
    sendMenu
};
