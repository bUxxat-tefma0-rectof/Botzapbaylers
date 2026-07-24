const User = require('../database/models/User');
const { sendTextMessage } = require('../services/whatsapp');
const logger = require('../utils/logger');

async function requireAdmin(phone) {
    const isAdmin = User.isAdmin(phone);
    if (!isAdmin) { await sendTextMessage(phone, '⛔ Acesso negado!'); return false; }
    return true;
}

async function requireUser(phone) {
    let user = User.findByPhone(phone);
    if (!user) { User.createOrUpdate(phone); user = User.findByPhone(phone); }
    return user;
}

async function requireNotBlocked(phone) {
    if (User.isBlocked(phone)) { await sendTextMessage(phone, '⛔ Você está bloqueado!'); return false; }
    return true;
}

module.exports = { requireAdmin, requireUser, requireNotBlocked };
