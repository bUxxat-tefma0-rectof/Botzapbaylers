const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const logger = require('../utils/logger');

let sock = null;
let qrCode = null;

async function iniciarWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { qrCode = qr; console.log('📱 QR Code gerado!'); }
        if (connection === 'open') { qrCode = null; console.log('✅ WhatsApp conectado!'); }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            if (shouldReconnect) setTimeout(() => iniciarWhatsApp(), 5000);
        }
    });
    
    return sock;
}

async function enviarCodigoWhatsApp(numero, codigo) {
    if (!sock) throw new Error('WhatsApp não conectado');
    
    try {
        const numeroFormatado = '55' + numero.replace(/\D/g, '') + '@s.whatsapp.net';
        const mensagem = `🛒 *Supermercado Telegram*\n\n🔐 Seu código de verificação: *${codigo}*\n\n⚠️ Não compartilhe com ninguém!\n⏰ Válido por 10 minutos`;
        
        await sock.sendMessage(numeroFormatado, { text: mensagem });
        logger.info(`📱 Código ${codigo} enviado para ${numero}`);
        return true;
    } catch (error) {
        logger.error('Erro WhatsApp: ' + error.message);
        throw new Error('Não foi possível enviar o código');
    }
}

function getQR() { return qrCode; }
function getSock() { return sock; }

module.exports = { iniciarWhatsApp, enviarCodigoWhatsApp, getQR, getSock };
