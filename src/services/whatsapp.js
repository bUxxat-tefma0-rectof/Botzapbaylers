const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const { config } = require('../config/database');
const logger = require('../utils/logger');
const { handleMessage } = require('../controllers/whatsapp/menuController');

let sock = null;
let connectionRetries = 0;
const MAX_RETRIES = 10;

async function startWhatsApp() {
    try {
        const sessionPath = config.storage.sessionsPath;
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        logger.info(`🔄 Conectando WhatsApp...`);

        sock = makeWASocket({
            version, auth: state, printQRInTerminal: false,
            browser: ['DOGUINHA STORE', 'Chrome', '1.0.0'],
            markOnlineOnConnect: true, syncFullHistory: false,
            connectTimeoutMs: 60000, defaultQueryTimeoutMs: 60000,
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                logger.info('✅ WhatsApp conectado!');
                connectionRetries = 0;
            }
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom) && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect && connectionRetries < MAX_RETRIES) {
                    connectionRetries++;
                    setTimeout(() => startWhatsApp(), Math.min(1000 * Math.pow(2, connectionRetries), 30000));
                } else if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
                    startWhatsApp();
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m) => {
            const message = m.messages[0];
            if (message.key.fromMe) return;
            if (m.type === 'notify') return;
            try { await handleMessage(sock, message); } catch (error) { logger.error('❌ Erro:', error); }
        });

        await requestPairingCode();
        return sock;
    } catch (error) {
        logger.error('❌ Erro ao iniciar WhatsApp:', error);
        if (connectionRetries < MAX_RETRIES) { connectionRetries++; setTimeout(() => startWhatsApp(), 10000); }
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
        logger.info('📱 WhatsApp > Aparelhos Conectados > Conectar Aparelho');
        logger.info('📱 ===========================================');
        return code;
    } catch (error) { logger.error('❌ Erro:', error); return null; }
}

async function sendTextMessage(phone, text) {
    try {
        if (!sock) return;
        const jid = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text });
    } catch (error) { logger.error('❌ Erro:', error); }
}

async function sendButtonMessage(phone, text, buttons) {
    try {
        if (!sock) return;
        const jid = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, {
            text, footer: '',
            buttons: buttons.map(btn => ({ buttonId: btn.id, buttonText: { displayText: btn.text }, type: 1 })),
            headerType: 1
        });
    } catch (error) { await sendTextMessage(phone, text); }
}

async function sendImageMessage(phone, imagePathOrUrl, caption = '') {
    try {
        if (!sock) return;
        const jid = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
        const image = imagePathOrUrl.startsWith('http') ? { url: imagePathOrUrl } : fs.readFileSync(imagePathOrUrl);
        await sock.sendMessage(jid, { image, caption });
    } catch (error) { logger.error('❌ Erro:', error); }
}

async function sendPdfMessage(phone, pdfPath, filename = 'documento.pdf') {
    try {
        if (!sock) return;
        const jid = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, { document: fs.readFileSync(pdfPath), fileName: filename, mimetype: 'application/pdf' });
    } catch (error) { logger.error('❌ Erro:', error); }
}

function getSocket() { return sock; }
function isConnected() { return sock && sock.user; }

module.exports = { startWhatsApp, requestPairingCode, sendTextMessage, sendButtonMessage, sendImageMessage, sendPdfMessage, getSocket, isConnected };
