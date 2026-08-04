const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const logger = require('../utils/logger');

let sock = null;
let qrCodeString = null;
let connectionStatus = 'desconectado';

async function iniciarWhatsApp() {
    // LIMPA SESSÃO SE A ENV ESTIVER ATIVA
    if (process.env.LIMPAR_SESSAO === 'true') {
        if (fs.existsSync('auth_info_baileys')) {
            fs.rmSync('auth_info_baileys', { recursive: true, force: true });
            console.log('🗑 Sessão antiga removida!');
        }
    }
    
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
                console.log('🔄 Reconectando...');
                setTimeout(() => iniciarWhatsApp(), 5000);
            }
        }
    });
    
    return sock;
}

async function enviarCodigoWhatsApp(numero, codigo) {
    if (!sock || connectionStatus !== 'conectado') throw new Error('WhatsApp não está conectado');
    
    const numeroFormatado = '55' + numero.replace(/\D/g, '') + '@s.whatsapp.net';
    const mensagem = `🛒 *${process.env.NOME_MERCADO || 'Supermercado'}*\n\n🔐 Código: *${codigo}*\n\n⚠️ Não compartilhe!\n⏰ Válido por 10 minutos`;
    
    await sock.sendMessage(numeroFormatado, { text: mensagem });
    return true;
}

function getQR() { return qrCodeString; }
function getStatus() { return connectionStatus; }

module.exports = { iniciarWhatsApp, enviarCodigoWhatsApp, getQR, getStatus };
