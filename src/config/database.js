require('dotenv').config();

const config = {
    bot: {
        whatsappNumber: process.env.WHATSAPP_NUMBER || '',
        ownerNumber: process.env.OWNER_NUMBER || '',
    },
    telegram: {
        adminToken: process.env.TELEGRAM_ADMIN_TOKEN || '',
    },
    database: {
        path: process.env.DATABASE_PATH || './src/database/doguinha_store.db',
    },
    mercadopago: {
        accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
    },
    server: {
        port: parseInt(process.env.PORT) || 3000,
        externalUrl: process.env.RENDER_EXTERNAL_URL || '',
    },
    storage: {
        sessionsPath: './src/storage/sessions',
        pdfsPath: './src/storage/pdfs',
        qrcodesPath: './src/storage/qrcodes',
    }
};

function validateConfig() {
    const errors = [];
    if (!config.telegram.adminToken) errors.push('TELEGRAM_ADMIN_TOKEN não configurado');
    if (!config.bot.whatsappNumber) errors.push('WHATSAPP_NUMBER não configurado');
    if (!config.bot.ownerNumber) errors.push('OWNER_NUMBER não configurado');
    if (!config.mercadopago.accessToken) errors.push('MERCADOPAGO_ACCESS_TOKEN não configurado');
    if (errors.length > 0) { console.error('❌ ERROS DE CONFIGURAÇÃO:'); errors.forEach(e => console.error(`   - ${e}`)); }
    return errors.length === 0;
}

module.exports = { config, validateConfig };
