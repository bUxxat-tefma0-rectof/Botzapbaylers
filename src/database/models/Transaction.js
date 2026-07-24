const { getDatabase } = require('../connection');

class Transaction {
    static create(id, userPhone, type, amount, pixCode, pixQrcode, expiresAt, productId) {
        const db = getDatabase();
        db.prepare(
            'INSERT INTO transactions (id, user_phone, type, amount, pix_code, pix_qrcode, expires_at, product_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, userPhone, type, amount, pixCode || null, pixQrcode || null, expiresAt || null, productId || null);
        return this.findById(id);
    }

    static findById(id) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    }

    static findByUser(phone) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM transactions WHERE user_phone = ? ORDER BY created_at DESC').all(phone);
    }

    static updateStatus(id, status) {
        const db = getDatabase();
        if (status === 'approved') {
            db.prepare('UPDATE transactions SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
        } else {
            db.prepare('UPDATE transactions SET status = ? WHERE id = ?').run(status, id);
        }
        return this.findById(id);
    }

    static findPending() {
        const db = getDatabase();
        return db.prepare("SELECT * FROM transactions WHERE status = 'pending'").all();
    }

    static findExpired() {
        const db = getDatabase();
        return db.prepare("SELECT * FROM transactions WHERE status = 'pending' AND expires_at < datetime('now')").all();
    }

    static cancelExpired() {
        const db = getDatabase();
        db.prepare("UPDATE transactions SET status = 'expired' WHERE status = 'pending' AND expires_at < datetime('now')").run();
    }

    static count() {
        const db = getDatabase();
        return db.prepare('SELECT COUNT(*) as total FROM transactions').get().total;
    }

    static totalSales() {
        const db = getDatabase();
        return db.prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'purchase' AND status = 'approved'").get().total || 0;
    }

    static totalDeposits() {
        const db = getDatabase();
        return db.prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'deposit' AND status = 'approved'").get().total || 0;
    }

    static salesToday() {
        const db = getDatabase();
        return db.prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'purchase' AND status = 'approved' AND date(created_at) = date('now')").get().total || 0;
    }

    static depositsToday() {
        const db = getDatabase();
        return db.prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'deposit' AND status = 'approved' AND date(created_at) = date('now')").get().total || 0;
    }

    static salesThisMonth() {
        const db = getDatabase();
        return db.prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'purchase' AND status = 'approved' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')").get().total || 0;
    }

    static countToday() {
        const db = getDatabase();
        return db.prepare("SELECT COUNT(*) as total FROM transactions WHERE type = 'purchase' AND status = 'approved' AND date(created_at) = date('now')").get().total;
    }

    static findAll(limit = 50) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?').all(limit);
    }
}

module.exports = Transaction;
