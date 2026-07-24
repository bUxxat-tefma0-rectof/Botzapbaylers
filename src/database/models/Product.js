const { getDatabase } = require('../connection');

class Product {
    static create(name, value, description, email, password, duration, platform, stock) {
        const db = getDatabase();
        const result = db.prepare(
            'INSERT INTO products (name, value, description, email, password, duration, platform, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(name, value, description || '', email || '', password || '', duration || '', platform || '', stock || 0);
        return this.findById(result.lastInsertRowid);
    }

    static findById(id) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    }

    static findAllActive() {
        const db = getDatabase();
        return db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC').all();
    }

    static findAll() {
        const db = getDatabase();
        return db.prepare('SELECT * FROM products ORDER BY name ASC').all();
    }

    static findByPlatform(platform) {
        const db = getDatabase();
        return db.prepare('SELECT * FROM products WHERE platform = ? AND is_active = 1').all(platform);
    }

    static update(id, data) {
        const db = getDatabase();
        const fields = [];
        const values = [];

        if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
        if (data.value !== undefined) { fields.push('value = ?'); values.push(data.value); }
        if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
        if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
        if (data.password !== undefined) { fields.push('password = ?'); values.push(data.password); }
        if (data.duration !== undefined) { fields.push('duration = ?'); values.push(data.duration); }
        if (data.platform !== undefined) { fields.push('platform = ?'); values.push(data.platform); }
        if (data.stock !== undefined) { fields.push('stock = ?'); values.push(data.stock); }
        if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active ? 1 : 0); }

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.findById(id);
    }

    static updateStock(id, quantity) {
        const db = getDatabase();
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(quantity, id);
        return this.findById(id);
    }

    static decreaseStock(id) {
        const db = getDatabase();
        db.prepare('UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0').run(id);
        return this.findById(id);
    }

    static updateAllValues(value) {
        const db = getDatabase();
        db.prepare('UPDATE products SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE is_active = 1').run(value);
    }

    static hasStock(id) {
        const product = this.findById(id);
        return product && product.stock > 0;
    }

    static toggleActive(id) {
        const db = getDatabase();
        const product = this.findById(id);
        if (product) {
            const newStatus = product.is_active === 1 ? 0 : 1;
            db.prepare('UPDATE products SET is_active = ? WHERE id = ?').run(newStatus, id);
        }
        return this.findById(id);
    }

    static delete(id) {
        const db = getDatabase();
        db.prepare('DELETE FROM products WHERE id = ?').run(id);
    }

    static deleteByPlatform(platform) {
        const db = getDatabase();
        db.prepare('DELETE FROM products WHERE platform = ?').run(platform);
    }

    static deleteByEmailPlatform(email, platform) {
        const db = getDatabase();
        db.prepare('DELETE FROM products WHERE email = ? AND platform = ?').run(email, platform);
    }

    static deleteAll() {
        const db = getDatabase();
        db.prepare('DELETE FROM products').run();
    }

    static countActive() {
        const db = getDatabase();
        const result = db.prepare('SELECT COUNT(*) as total FROM products WHERE is_active = 1').get();
        return result.total;
    }

    static countStock() {
        const db = getDatabase();
        const result = db.prepare('SELECT SUM(stock) as total FROM products WHERE is_active = 1').get();
        return result.total || 0;
    }

    static getDetailedStock() {
        const db = getDatabase();
        return db.prepare('SELECT platform, COUNT(*) as count, SUM(stock) as total_stock FROM products WHERE is_active = 1 GROUP BY platform').all();
    }
}

module.exports = Product;
