const { sendTextMessage } = require('../services/whatsapp');
const logger = require('../utils/logger');

const requestLog = new Map();

const DEFAULT_CONFIG = {
    maxRequests: 10,
    windowMs: 60000,
    blockDuration: 300000,
    message: '⚠️ Muitas requisições! Aguarde um momento.'
};

async function messageRateLimiter(phone, config = {}) {
    try {
        const settings = { ...DEFAULT_CONFIG, ...config };
        const now = Date.now();

        if (isBlocked(phone, now)) {
            const remaining = getBlockTimeRemaining(phone, now);
            await sendTextMessage(phone, `⏳ Aguarde ${remaining} segundos!`);
            return { allowed: false };
        }

        registerRequest(phone, now, settings);

        if (isOverLimit(phone, now, settings)) {
            blockUser(phone, now, settings);
            await sendTextMessage(phone, settings.message);
            return { allowed: false };
        }

        return { allowed: true };
    } catch (error) {
        return { allowed: true };
    }
}

function isBlocked(phone, now) {
    const data = requestLog.get(phone);
    return data && data.blockedUntil && now < data.blockedUntil;
}

function getBlockTimeRemaining(phone, now) {
    const data = requestLog.get(phone);
    return data ? Math.ceil((data.blockedUntil - now) / 1000) : 0;
}

function registerRequest(phone, now, settings) {
    const data = requestLog.get(phone) || { requests: [] };
    data.requests.push(now);
    data.requests = data.requests.filter(t => now - t < settings.windowMs);
    requestLog.set(phone, data);
}

function isOverLimit(phone, now, settings) {
    const data = requestLog.get(phone);
    return data && data.requests.length > settings.maxRequests;
}

function blockUser(phone, now, settings) {
    const data = requestLog.get(phone) || { requests: [] };
    data.blockedUntil = now + settings.blockDuration;
    requestLog.set(phone, data);
}

function resetLimits(phone) {
    requestLog.delete(phone);
}

module.exports = {
    messageRateLimiter,
    resetLimits
};
