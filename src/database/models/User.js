const { getDatabase } = require('../connection');

class User {
    static createOrUpdate(phone, telegramId = null) {
        const db = getDatabase();
        const existing = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
        if (!existing) {
            db.prepare('INSERT INTO users (phone, telegram_id, referral_code) VALUES (?, ?, ?)').run(phone, telegramId, `BONUS_COD_${phone}`);
            return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
        }
        if (telegramId && !existing.telegram_id) db.prepare('UPDATE users SET telegram_id = ? WHERE phone = ?').run(telegramId, phone);
        db.prepare('UPDATE users SET last_interaction = CURRENT_TIMESTAMP WHERE phone = ?').run(phone);
        return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    }
    static findByPhone(phone) { return getDatabase().prepare('SELECT * FROM users WHERE phone = ?').get(phone); }
    static findByTelegramId(id) { return getDatabase().prepare('SELECT * FROM users WHERE telegram_id = ?').get(id); }
    static findByReferralCode(code) { return getDatabase().prepare('SELECT * FROM users WHERE referral_code = ?').get(code); }
    static updateBalance(phone, amount) { getDatabase().prepare('UPDATE users SET balance = balance + ? WHERE phone = ?').run(amount, phone); return this.findByPhone(phone); }
    static updateBonusBalance(phone, amount) { getDatabase().prepare('UPDATE users SET bonus_balance = bonus_balance + ? WHERE phone = ?').run(amount, phone); return this.findByPhone(phone); }
    static addReferralPoints(phone, points) { getDatabase().prepare('UPDATE users SET referral_points = referral_points + ? WHERE phone = ?').run(points, phone); return this.findByPhone(phone); }
    static incrementReferrals(phone) { getDatabase().prepare('UPDATE users SET total_referrals = total_referrals + 1 WHERE phone = ?').run(phone); return this.findByPhone(phone); }
    static isAdmin(phone) { const u = this.findByPhone(phone); return u ? u.is_admin === 1 : false; }
    static isOwner(phone) { const u = this.findByPhone(phone); return u ? u.is_owner === 1 : false; }
    static isBlocked(phone) { const u = this.findByPhone(phone); return u ? u.is_blocked === 1 : false; }
    static toggleBlock(phone) { const u = this.findByPhone(phone); if (u) getDatabase().prepare('UPDATE users SET is_blocked = ? WHERE phone = ?').run(u.is_blocked ? 0 : 1, phone); return this.findByPhone(phone); }
    static findAll() { return getDatabase().prepare('SELECT * FROM users ORDER BY created_at DESC').all(); }
    static findActiveUsers() { return getDatabase().prepare('SELECT * FROM users WHERE is_blocked = 0').all(); }
    static count() { return getDatabase().prepare('SELECT COUNT(*) as total FROM users').get().total; }
    static totalBalance() { return getDatabase().prepare('SELECT SUM(balance) as total FROM users').get().total || 0; }
}

module.exports = User;
