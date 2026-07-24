const { getDatabase } = require('../connection');

class Referral {
    static create(referrerPhone, referredPhone, pointsEarned, bonusEarned) {
        const r = getDatabase().prepare('INSERT INTO referrals (referrer_phone, referred_phone, points_earned, bonus_earned) VALUES (?, ?, ?, ?)').run(referrerPhone, referredPhone, pointsEarned || 0, bonusEarned || 0);
        return this.findById(r.lastInsertRowid);
    }
    static findById(id) { return getDatabase().prepare('SELECT * FROM referrals WHERE id = ?').get(id); }
    static findByReferrer(phone) { return getDatabase().prepare('SELECT * FROM referrals WHERE referrer_phone = ? ORDER BY created_at DESC').all(phone); }
    static isAlreadyReferred(phone) { return getDatabase().prepare('SELECT COUNT(*) as count FROM referrals WHERE referred_phone = ?').get(phone).count > 0; }
    static countByReferrer(phone) { return getDatabase().prepare('SELECT COUNT(*) as total FROM referrals WHERE referrer_phone = ?').get(phone).total; }
    static totalBonusEarned(phone) { return getDatabase().prepare('SELECT SUM(bonus_earned) as total FROM referrals WHERE referrer_phone = ?').get(phone).total || 0; }
    static totalPointsEarned(phone) { return getDatabase().prepare('SELECT SUM(points_earned) as total FROM referrals WHERE referrer_phone = ?').get(phone).total || 0; }
    static count() { return getDatabase().prepare('SELECT COUNT(*) as total FROM referrals').get().total; }
}

module.exports = Referral;
