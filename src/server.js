require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDatabase } = require('./database/connection');
const { startClientBot } = require('./bot/cliente/index');
const { startAdminBot } = require('./bot/admin/index');
const { iniciarWhatsApp } = require('./services/whatsapp');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => res.json({ status: 'online', sistema: '🛒 Supermercado Telegram' }));

async function main() {
    logger.info('🛒 Iniciando Supermercado...');
    await initDatabase();
    logger.info('✅ Banco pronto');
    await startClientBot();
    logger.info('✅ Bot Cliente online');
    await startAdminBot();
    logger.info('✅ Bot Admin online');
    await iniciarWhatsApp();
    logger.info('✅ WhatsApp conectado');
    app.listen(PORT, () => logger.info(`🌐 Porta ${PORT} - Pronto!`));
}

main().catch(e => { logger.error('Erro: ' + e.message); process.exit(1); });
