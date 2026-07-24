const { getDatabase } = require('../connection');

class User {
    static createOrUpdate(phone, telegramId = null) {
        const db = getDatabase();
        const existing = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

        if (!existing) {
            const referralCode = `BONUS_COD_${phone}`;
            db.prepare('INSERT INTO users (phone, telegram_id, referral_code) VALUES (?, ?, ?)').run(phone, telegramId, referralCode);
            return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
        }

        if (telegramId && !existing.telegram_id) {
            db.prepare('UPDATE users SET telegram_id = ? WHERE phone = ?').run(telegramId, phone);
        }

        db.prepare('UPDATE users SET last_interaction = CURRENT_TIMESTAMP WHERE phone = ?').run(phone);
        return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    }

    static findByPhone(phone) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    }

    static findByTelegramId(telegramId) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
    }

    static findByReferralCode(code) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM users WHERE referral_code = ?').get(code);
    }

    static updateBalance(phone, amount) {
        const db = getDatabase();
        db.prepare('UPDATE users SET balance = balance + ? WHERE phone = ?').run(amount, phone);
        return this.findByPhone(phone);
    }

    static updateBonusBalance(phone, amount) {
        const db = getDatabase();
        db.prepare('UPDATE users SET bonus_balance = bonus_balance + ? WHERE phone = ?').run(amount, phone);
        return this.findByPhone(phone);
    }

    static addReferralPoints(phone, points) {
        const db = getDatabase();
        db.prepare('UPDATE users SET referral_points = referral_points + ? WHERE phone = ?').run(points, phone);
        return this.findByPhone(phone);
    }

    static incrementReferrals(phone) {
        const db = getDatabase();
        db.prepare('UPDATE users SET total_referrals = total_referrals + 1 WHERE phone = ?').run(phone);
        return this.findByPhone(phone);
    }

    static isAdmin(phone) {
        const db = getDatabase();
        const user = db.prepare('SELECT is_admin FROM users WHERE phone = ?').get(phone);
        return user ? user.is_admin === 1 : false;
    }

    static isOwner(phone) {
        const db = getDatabase();
        const user = db.prepare('SELECT is_owner FROM users WHERE phone = ?').get(phone);
        return user ? user.is_owner === 1 : false;
    }

    static isBlocked(phone) {
        const db = getDatabase();
        const user = db.prepare('SELECT is_blocked FROM users WHERE phone = ?').get(phone);
        return user ? user.is_blocked === 1 : false;
    }

    static toggleBlock(phone) {
        const db = getDatabase();
        const user = this.findByPhone(phone);
        if (user) {
            const newStatus = user.is_blocked === 1 ? 0 : 1;
            db.prepare('UPDATE users SET is_blocked = ? WHERE phone = ?').run(newStatus, phone);
        }
        return this.findByPhone(phone);
    }

    static findAll() {
        const db = getDatabase();
        return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    }

    static findActiveUsers() {
        const db = getDatabase();
        return db.prepare('SELECT * FROM users WHERE is_blocked = 0').all();
    }

    static count() {
        const db = getDatabase();
        const result = db.prepare('SELECT COUNT(*) as total FROM users').get();
        return result.total;
    }

    static totalBalance() {
        const db = getDatabase();
        const result = db.prepare('SELECT SUM(balance) as total FROM users').get();
        return result.total || 0;
    }
}

module.exports = User;
