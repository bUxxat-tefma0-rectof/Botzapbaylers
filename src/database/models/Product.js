const { getDatabase } = require('../connection');

class Product {
    static create(name, value, description, email, password, duration, platform, stock) {
        const r = getDatabase().prepare('INSERT INTO products (name, value, description, email, password, duration, platform, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(name, value, description || '', email || '', password || '', duration || '', platform || '', stock || 0);
        return this.findById(r.lastInsertRowid);
    }
    static findById(id) { return getDatabase().prepare('SELECT * FROM products WHERE id = ?').get(id); }
    static findAllActive() { return getDatabase().prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC').all(); }
    static findAll() { return getDatabase().prepare('SELECT * FROM products ORDER BY name ASC').all(); }
    static findByPlatform(platform) { return getDatabase().prepare('SELECT * FROM products WHERE platform = ? AND is_active = 1').all(platform); }
    static updateStock(id, qty) { getDatabase().prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(qty, id); return this.findById(id); }
    static decreaseStock(id) { getDatabase().prepare('UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0').run(id); return this.findById(id); }
    static updateAllValues(value) { getDatabase().prepare('UPDATE products SET value = ? WHERE is_active = 1').run(value); }
    static hasStock(id) { const p = this.findById(id); return p && p.stock > 0; }
    static delete(id) { getDatabase().prepare('DELETE FROM products WHERE id = ?').run(id); }
    static deleteByPlatform(platform) { getDatabase().prepare('DELETE FROM products WHERE platform = ?').run(platform); }
    static deleteByEmailPlatform(email, platform) { getDatabase().prepare('DELETE FROM products WHERE email = ? AND platform = ?').run(email, platform); }
    static deleteAll() { getDatabase().prepare('DELETE FROM products').run(); }
    static countActive() { return getDatabase().prepare('SELECT COUNT(*) as total FROM products WHERE is_active = 1').get().total; }
    static countStock() { return getDatabase().prepare('SELECT SUM(stock) as total FROM products WHERE is_active = 1').get().total || 0; }
    static getDetailedStock() { return getDatabase().prepare('SELECT platform, COUNT(*) as count, SUM(stock) as total_stock FROM products WHERE is_active = 1 GROUP BY platform').all(); }
}

module.exports = Product;
