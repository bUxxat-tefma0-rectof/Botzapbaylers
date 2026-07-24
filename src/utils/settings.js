const { getDatabase } = require('../database/connection');
const logger = require('./logger');

function getSetting(key, defaultValue = '') {
    try {
        const db = getDatabase();
        const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return setting ? setting.value : defaultValue;
    } catch (error) {
        logger.error(`Erro ao buscar configuração ${key}:`, error);
        return defaultValue;
    }
}

function getAllSettings() {
    try {
        const db = getDatabase();
        return db.prepare('SELECT * FROM settings ORDER BY key ASC').all();
    } catch (error) {
        logger.error('Erro ao buscar configurações:', error);
        return [];
    }
}

function updateSetting(key, value) {
    try {
        const db = getDatabase();
        db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(value, key);
        logger.info(`Configuração "${key}" atualizada para: ${value}`);
        return true;
    } catch (error) {
        logger.error(`Erro ao atualizar configuração ${key}:`, error);
        return false;
    }
}

function getSettingAsNumber(key, defaultValue = 0) {
    const value = getSetting(key, String(defaultValue));
    return parseFloat(value);
}

function getSettingAsBoolean(key, defaultValue = false) {
    const value = getSetting(key, String(defaultValue));
    return value === 'true' || value === '1' || value === 'on';
}

module.exports = {
    getSetting,
    getAllSettings,
    updateSetting,
    getSettingAsNumber,
    getSettingAsBoolean
};
