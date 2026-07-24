require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDatabase, initializeDatabase } = require('./src/database/connection');
const { startWhatsApp } = require('./src/services/whatsapp');
const { startTelegram } = require('./src/services/telegram');
const logger = require('./src/utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.json({ status: 'online', bot: 'DOGUINHA STORE', version: '1.0.0' });
});

app.post('/webhook/mercadopago', async (req, res) => {
    try {
        const { processWebhook } = require('./src/services/mercadopago');
        await processWebhook(req.body);
        res.status(200).send('OK');
    } catch (error) {
        logger.error('Erro no webhook:', error);
        res.status(500).send('Error');
    }
});

async function startServer() {
    try {
        logger.info('🔄 Conectando banco de dados...');
        await connectDatabase();
        await initializeDatabase();

        app.listen(PORT, () => logger.info(`🌐 Servidor rodando na porta ${PORT}`));

        logger.info('🤖 Iniciando WhatsApp...');
        await startWhatsApp();

        logger.info('🔧 Iniciando Telegram Admin...');
        await startTelegram();

        logger.info('✅ TUDO INICIADO COM SUCESSO!');
    } catch (error) {
        logger.error('❌ Erro ao iniciar:', error);
        process.exit(1);
    }
}

process.on('uncaughtException', (error) => logger.error('❌ Erro:', error));
process.on('unhandledRejection', (error) => logger.error('❌ Promise:', error));

startServer();
