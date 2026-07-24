const User = require('../database/models/User');
const { sendTextMessage } = require('../services/whatsapp');
const logger = require('../utils/logger');

async function requireAdmin(phone) {
    try {
        const isAdmin = User.isAdmin(phone);
        if (!isAdmin) {
            await sendTextMessage(phone, '⛔ Acesso negado!');
            return false;
        }
        return true;
    } catch (error) {
        logger.error('❌ Erro na autenticação:', error);
        return false;
    }
}

async function requireUser(phone) {
    try {
        const user = User.findByPhone(phone);
        if (!user) {
            User.createOrUpdate(phone);
            return User.findByPhone(phone);
        }
        return user;
    } catch (error) {
        logger.error('❌ Erro ao verificar usuário:', error);
        return null;
    }
}

async function requireNotBlocked(phone) {
    try {
        const isBlocked = User.isBlocked(phone);
        if (isBlocked) {
            await sendTextMessage(phone, '⛔ Você está bloqueado!');
            return false;
        }
        return true;
    } catch (error) {
        logger.error('❌ Erro ao verificar bloqueio:', error);
        return false;
    }
}

module.exports = {
    requireAdmin,
    requireUser,
    requireNotBlocked
};
