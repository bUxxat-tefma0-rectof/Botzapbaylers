const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { config } = require('../config/database');
const logger = require('./logger');

async function generateQRCodeImage(data, filename = null) {
    try {
        const qrDir = config.storage.qrcodesPath;
        if (!fs.existsSync(qrDir)) {
            fs.mkdirSync(qrDir, { recursive: true });
        }

        const qrFilename = filename || `qrcode_${Date.now()}.png`;
        const qrPath = path.join(qrDir, qrFilename);

        await QRCode.toFile(qrPath, data, {
            type: 'png',
            width: 500,
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' }
        });

        logger.info(`✅ QR Code gerado: ${qrFilename}`);
        return { success: true, filePath: qrPath, filename: qrFilename };

    } catch (error) {
        logger.error('❌ Erro ao gerar QR Code:', error);
        return { success: false, error: error.message };
    }
}

function deleteQRCode(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    } catch (error) {
        logger.error('❌ Erro ao deletar QR Code:', error);
        return false;
    }
}

function cleanOldQRCodes(maxAgeMinutes = 60) {
    try {
        const qrDir = config.storage.qrcodesPath;
        if (!fs.existsSync(qrDir)) return 0;

        const files = fs.readdirSync(qrDir);
        const now = Date.now();
        let deletedCount = 0;

        for (const file of files) {
            if (file === '.gitkeep') continue;
            const filePath = path.join(qrDir, file);
            const stats = fs.statSync(filePath);
            const ageMinutes = (now - stats.mtimeMs) / (1000 * 60);

            if (ageMinutes > maxAgeMinutes) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            logger.info(`🗑️ ${deletedCount} QR Codes antigos deletados`);
        }

        return deletedCount;
    } catch (error) {
        logger.error('❌ Erro ao limpar QR Codes:', error);
        return 0;
    }
}

module.exports = {
    generateQRCodeImage,
    deleteQRCode,
    cleanOldQRCodes
};
