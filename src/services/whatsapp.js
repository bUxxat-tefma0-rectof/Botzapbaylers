const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const logger = require('../utils/logger');

let sock = null;
let qrCodeString = null;
let connectionStatus = 'desconectado';

async function iniciarWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Supermercado Bot', 'Chrome', '1.0.0']
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // SALVA o QR Code quando ele aparece
        if (qr) {
            qrCodeString = qr;
            connectionStatus = 'qr_pendente';
            console.log('📱 QR Code gerado! Acesse /qr para escanear');
        }
        
        if (connection === 'open') {
            connectionStatus = 'conectado';
            qrCodeString = null;
            console.log('✅ WhatsApp conectado!');
        }
        
        if (connection === 'close') {
            connectionStatus = 'desconectado';
            qrCodeString = null;
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                : true;
            
            if (shouldReconnect) {
                console.log('🔄 Reconectando WhatsApp...');
                setTimeout(() => iniciarWhatsApp(), 5000);
            } else {
                console.log('❌ Sessão expirada. Apague a pasta auth_info_baileys e reinicie.');
            }
        }
    });
    
    return sock;
}

async function enviarCodigoWhatsApp(numero, codigo) {
    if (!sock || connectionStatus !== 'conectado') {
        throw new Error('WhatsApp não está conectado');
    }
    
    try {
        const numeroFormatado = '55' + numero.replace(/\D/g, '') + '@s.whatsapp.net';
        const mensagem = `🛒 *${process.env.NOME_MERCADO || 'Supermercado'}*\n\n` +
                        `🔐 Seu código de verificação: *${codigo}*\n\n` +
                        `⚠️ Não compartilhe com ninguém!\n⏰ Válido por 10 minutos`;
        
        await sock.sendMessage(numeroFormatado, { text: mensagem });
        logger.info(`📱 Código ${codigo} enviado para ${numero}`);
        return true;
    } catch (error) {
        logger.error('Erro WhatsApp: ' + error.message);
        throw new Error('Não foi possível enviar o código');
    }
}

function getQR() {
    return qrCodeString;
}

function getStatus() {
    return connectionStatus;
}

function getSock() {
    return sock;
}

module.exports = { iniciarWhatsApp, enviarCodigoWhatsApp, getQR, getStatus, getSock };
