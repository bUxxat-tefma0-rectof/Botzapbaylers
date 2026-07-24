const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { config } = require('../config/database');
const logger = require('../utils/logger');

async function generateCredentialsPdf(productName, email, password, duration, userPhone) {
    try {
        const pdfDir = config.storage.pdfsPath;
        if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
        const filename = `${productName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
        const filePath = path.join(pdfDir, filename);
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        doc.pipe(fs.createWriteStream(filePath));

        doc.fontSize(24).font('Helvetica-Bold').fillColor('#4CAF50').text('DOGUINHA STORE', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(14).fillColor('#333333').text('CREDENCIAIS DE ACESSO', { align: 'center' });
        doc.moveDown(1);
        doc.strokeColor('#4CAF50').lineWidth(2).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(1);
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000').text('PRODUTO', { align: 'center' });
        doc.fontSize(16).font('Helvetica').fillColor('#2196F3').text(productName, { align: 'center' });
        doc.moveDown(2);
        doc.rect(50, doc.y, 495, 200).fillAndStroke('#F5F5F5', '#CCCCCC');
        doc.moveDown(1);
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000').text('DADOS DE ACESSO:', 70, doc.y + 10);
        doc.moveDown(1);
        doc.fontSize(12).font('Helvetica').fillColor('#333333').text(`Email: ${email}`, 70, doc.y + 5);
        doc.fontSize(12).text(`Senha: ${password}`, 70, doc.y + 5);
        doc.fontSize(12).text(`Duração: ${duration}`, 70, doc.y + 5);
        doc.moveDown(3);
        doc.strokeColor('#4CAF50').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.fontSize(10).fillColor('#999999').text('© Doguinha Store', { align: 'center' });
        doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, { align: 'center' });
        doc.text(`Cliente: ${userPhone}`, { align: 'center' });
        doc.end();
        await new Promise(resolve => doc.on('end', resolve));
        logger.info(`✅ PDF gerado: ${filename}`);
        return { filename, filePath };
    } catch (error) { logger.error('❌ Erro:', error); throw error; }
}

function deletePdf(filePath) {
    try { if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); } } catch (error) { logger.error('❌ Erro:', error); }
}

module.exports = { generateCredentialsPdf, deletePdf };
