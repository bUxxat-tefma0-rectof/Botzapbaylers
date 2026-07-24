const { sendTextMessage } = require('../services/whatsapp');
const requestLog = new Map();

async function messageRateLimiter(phone, config = {}) {
    const settings = { maxRequests: 10, windowMs: 60000, blockDuration: 300000, message: '⚠️ Muitas requisições! Aguarde.', ...config };
    const now = Date.now();
    if (isBlocked(phone, now)) { await sendTextMessage(phone, '⏳ Aguarde!'); return { allowed: false }; }
    registerRequest(phone, now, settings);
    if (isOverLimit(phone, now, settings)) { blockUser(phone, now, settings); await sendTextMessage(phone, settings.message); return { allowed: false }; }
    return { allowed: true };
}

function isBlocked(phone, now) { const d = requestLog.get(phone); return d && d.blockedUntil && now < d.blockedUntil; }
function registerRequest(phone, now, s) { const d = requestLog.get(phone) || { requests: [] }; d.requests.push(now); d.requests = d.requests.filter(t => now - t < s.windowMs); requestLog.set(phone, d); }
function isOverLimit(phone, now, s) { const d = requestLog.get(phone); return d && d.requests.length > s.maxRequests; }
function blockUser(phone, now, s) { const d = requestLog.get(phone) || { requests: [] }; d.blockedUntil = now + s.blockDuration; requestLog.set(phone, d); }
function resetLimits(phone) { requestLog.delete(phone); }

module.exports = { messageRateLimiter, resetLimits };
