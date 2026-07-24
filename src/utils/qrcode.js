const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { config } = require('../config/database');
const logger = require('./logger');

async function generateQRCodeImage(data, filename = null) {
    try {
        const qrDir = config.storage.qrcodesPath;
        if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
        const qrFilename = filename || `qrcode_${Date.now()}.png`;
        const qrPath = path.join(qrDir, qrFilename);
        await QRCode.toFile(qrPath, data, { type: 'png', width: 500, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
        return { success: true, filePath: qrPath, filename: qrFilename };
    } catch (error) { return { success: false, error: error.message }; }
}

function deleteQRCode(filePath) {
    try { if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); return true; } return false; } catch (error) { return false; }
}

module.exports = { generateQRCodeImage, deleteQRCode };
