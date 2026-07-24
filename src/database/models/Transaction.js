const { getDatabase } = require('../connection');

class Transaction {
    static create(id, userPhone, type, amount, pixCode, pixQrcode, expiresAt, productId) {
        getDatabase().prepare('INSERT INTO transactions (id, user_phone, type, amount, pix_code, pix_qrcode, expires_at, product_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, userPhone, type, amount, pixCode || null, pixQrcode || null, expiresAt || null, productId || null);
        return this.findById(id);
    }
    static findById(id) { return getDatabase().prepare('SELECT * FROM transactions WHERE id = ?').get(id); }
    static findByUser(phone) { return getDatabase().prepare('SELECT * FROM transactions WHERE user_phone = ? ORDER BY created_at DESC').all(phone); }
    static updateStatus(id, status) {
        if (status === 'approved') getDatabase().prepare('UPDATE transactions SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
        else getDatabase().prepare('UPDATE transactions SET status = ? WHERE id = ?').run(status, id);
        return this.findById(id);
    }
    static cancelExpired() { getDatabase().prepare("UPDATE transactions SET status = 'expired' WHERE status = 'pending' AND expires_at < datetime('now')").run(); }
    static count() { return getDatabase().prepare('SELECT COUNT(*) as total FROM transactions').get().total; }
    static totalSales() { return getDatabase().prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'purchase' AND status = 'approved'").get().total || 0; }
    static totalDeposits() { return getDatabase().prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'deposit' AND status = 'approved'").get().total || 0; }
    static salesToday() { return getDatabase().prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'purchase' AND status = 'approved' AND date(created_at) = date('now')").get().total || 0; }
    static depositsToday() { return getDatabase().prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'deposit' AND status = 'approved' AND date(created_at) = date('now')").get().total || 0; }
    static salesThisMonth() { return getDatabase().prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'purchase' AND status = 'approved' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')").get().total || 0; }
    static countToday() { return getDatabase().prepare("SELECT COUNT(*) as total FROM transactions WHERE type = 'purchase' AND status = 'approved' AND date(created_at) = date('now')").get().total; }
    static findAll(limit = 50) { return getDatabase().prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?').all(limit); }
}

module.exports = Transaction;
