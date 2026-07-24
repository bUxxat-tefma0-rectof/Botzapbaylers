const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const { config } = require('../config/database');
const User = require('../database/models/User');
const logger = require('../utils/logger');
const { handleMessage } = require('../controllers/whatsapp/menuController');

let sock = null;
let connectionRetries = 0;
const MAX_RETRIES = 10;

async function startWhatsApp() {
    try {
        const sessionPath = config.storage.sessionsPath;
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        logger.info(`🔄 Conectando WhatsApp (versão ${version})...`);

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: ['DOGUINHA STORE', 'Chrome', '1.0.0'],
            markOnlineOnConnect: true,
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                logger.info('✅ WhatsApp conectado!');
                connectionRetries = 0;
                const botNumber = sock.user?.id?.split(':')[0];
                logger.info(`📞 Número: ${botNumber}`);
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                    && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

                if (shouldReconnect && connectionRetries < MAX_RETRIES) {
                    connectionRetries++;
                    const delay = Math.min(1000 * Math.pow(2, connectionRetries), 30000);
                    logger.warn(`⚠️ Reconectando em ${delay / 1000}s...`);
                    setTimeout(() => startWhatsApp(), delay);
                } else if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                    logger.error('❌ Desconectado! Solicite novo pareamento.');
                    if (fs.existsSync(sessionPath)) {
                        fs.rmSync(sessionPath, { recursive: true, force: true });
                    }
                    startWhatsApp();
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m) => {
            const message = m.messages[0];
            if (message.key.fromMe) return;
            if (m.type === 'notify') return;
            try {
                await handleMessage(sock, message);
            } catch (error) {
                logger.error('❌ Erro ao processar mensagem:', error);
            }
        });

        await requestPairingCode();
        return sock;

    } catch (error) {
        logger.error('❌ Erro ao iniciar WhatsApp:', error);
        if (connectionRetries < MAX_RETRIES) {
            connectionRetries++;
            setTimeout(() => startWhatsApp(), 10000);
        }
    }
}

async function requestPairingCode() {
    try {
        const phoneNumber = config.bot.whatsappNumber;
        if (!phoneNumber) return;
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (!sock) return;

        const code = await sock.requestPairingCode(phoneNumber);
        logger.info('📱 ===========================================');
        logger.info(`📱 CÓDIGO DE PAREAMENTO: ${code}`);
        logger.info('📱 ===========================================');
        logger.info('📱 Abra WhatsApp > Aparelhos Conectados > Conectar Aparelho');
        logger.info('📱 Digite o código acima');
        logger.info('📱 ===========================================');
        return code;
    } catch (error) {
        logger.error('❌ Erro ao solicitar pareamento:', error);
        return null;
    }
}

async function sendTextMessage(phone, text) {
    try {
        if (!sock) throw new Error('WhatsApp não conectado');
        const jid = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: text });
    } catch (error) {
        logger.error(`❌ Erro ao enviar mensagem para ${phone}:`, error);
    }
}

async function sendButtonMessage(phone, text, buttons) {
    try {
        if (!sock) throw new Error('WhatsApp não conectado');
        const jid = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, {
            text: text,
            footer: '',
            buttons: buttons.map(btn => ({
                buttonId: btn.id,
                buttonText: { displayText: btn.text },
                type: 1
            })),
            headerType: 1
        });
    } catch (error) {
        await sendTextMessage(phone, text);
    }
}

async function sendImageMessage(phone, imagePathOrUrl, caption = '') {
    try {
        if (!sock) return;
        const jid = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
        const image = imagePathOrUrl.startsWith('http') ? { url: imagePathOrUrl } : fs.readFileSync(imagePathOrUrl);
        await sock.sendMessage(jid, { image: image, caption: caption });
    } catch (error) {
        logger.error(`❌ Erro ao enviar imagem:`, error);
    }
}

async function sendPdfMessage(phone, pdfPath, filename = 'documento.pdf') {
    try {
        if (!sock) return;
        const jid = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
        const document = fs.readFileSync(pdfPath);
        await sock.sendMessage(jid, { document: document, fileName: filename, mimetype: 'application/pdf' });
    } catch (error) {
        logger.error(`❌ Erro ao enviar PDF:`, error);
    }
}

function getSocket() { return sock; }
function isConnected() { return sock && sock.user; }

module.exports = {
    startWhatsApp,
    requestPairingCode,
    sendTextMessage,
    sendButtonMessage,
    sendImageMessage,
    sendPdfMessage,
    getSocket,
    isConnected
};
