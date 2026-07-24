const { getDatabase } = require('../connection');

class Referral {
    static create(referrerPhone, referredPhone, pointsEarned, bonusEarned) {
        const db = getDatabase();
        const result = db.prepare(
            'INSERT INTO referrals (referrer_phone, referred_phone, points_earned, bonus_earned) VALUES (?, ?, ?, ?)'
        ).run(referrerPhone, referredPhone, pointsEarned || 0, bonusEarned || 0);
        return this.findById(result.lastInsertRowid);
    }

    static findById(id) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM referrals WHERE id = ?').get(id);
    }

    static findByReferrer(phone) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM referrals WHERE referrer_phone = ? ORDER BY created_at DESC').all(phone);
    }

    static isAlreadyReferred(phone) {
        const db = getDatabase();
        return db.prepare('SELECT COUNT(*) as count FROM referrals WHERE referred_phone = ?').get(phone).count > 0;
    }

    static countByReferrer(phone) {
        const db = getDatabase();
        return db.prepare('SELECT COUNT(*) as total FROM referrals WHERE referrer_phone = ?').get(phone).total;
    }

    static totalBonusEarned(phone) {
        const db = getDatabase();
        return db.prepare('SELECT SUM(bonus_earned) as total FROM referrals WHERE referrer_phone = ?').get(phone).total || 0;
    }

    static totalPointsEarned(phone) {
        const db = getDatabase();
        return db.prepare('SELECT SUM(points_earned) as total FROM referrals WHERE referrer_phone = ?').get(phone).total || 0;
    }

    static findAll() {
        const db = getDatabase();
        return db.prepare('SELECT * FROM referrals ORDER BY created_at DESC').all();
    }

    static count() {
        const db = getDatabase();
        return db.prepare('SELECT COUNT(*) as total FROM referrals').get().total;
    }

    static getTopReferrers(limit = 10) {
        const db = getDatabase();
        return db.prepare(`
            SELECT referrer_phone, COUNT(*) as total_indications, SUM(points_earned) as total_points, SUM(bonus_earned) as total_bonus
            FROM referrals
            GROUP BY referrer_phone
            ORDER BY total_indications DESC
            LIMIT ?
        `).all(limit);
    }
}

module.exports = Referral;
