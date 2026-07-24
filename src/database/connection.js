const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { config } = require('../config/database');
const logger = require('../utils/logger');

let db = null;

async function connectDatabase() {
    try {
        const dbDir = path.dirname(config.database.path);
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
        db = new Database(config.database.path);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        db.pragma('busy_timeout = 5000');
        logger.info('✅ Banco de dados conectado');
        return db;
    } catch (error) { logger.error('❌ Erro ao conectar banco:', error); throw error; }
}

async function initializeDatabase() {
    if (!db) throw new Error('Banco não conectado');

    db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE, telegram_id TEXT UNIQUE, balance DECIMAL(10,2) DEFAULT 0.00, is_admin BOOLEAN DEFAULT 0, is_owner BOOLEAN DEFAULT 0, is_blocked BOOLEAN DEFAULT 0, referral_code TEXT UNIQUE, referred_by TEXT, total_referrals INTEGER DEFAULT 0, referral_points INTEGER DEFAULT 0, bonus_balance DECIMAL(10,2) DEFAULT 0.00, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    db.exec(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, value DECIMAL(10,2) NOT NULL, description TEXT, email TEXT, password TEXT, duration TEXT, platform TEXT, stock INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    db.exec(`CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, user_phone TEXT, type TEXT NOT NULL, amount DECIMAL(10,2) NOT NULL, status TEXT DEFAULT 'pending', pix_code TEXT, pix_qrcode TEXT, expires_at DATETIME, product_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, paid_at DATETIME)`);

    db.exec(`CREATE TABLE IF NOT EXISTS referrals (id INTEGER PRIMARY KEY AUTOINCREMENT, referrer_phone TEXT, referred_phone TEXT, points_earned INTEGER DEFAULT 0, bonus_earned DECIMAL(10,2) DEFAULT 0.00, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    db.exec(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, content TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    db.exec(`CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, value TEXT NOT NULL, description TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    db.exec(`CREATE TABLE IF NOT EXISTS service_images (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, image_url TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    db.exec(`CREATE TABLE IF NOT EXISTS giftcards (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, amount DECIMAL(10,2) NOT NULL, buyer_phone TEXT, redeemer_phone TEXT, is_redeemed BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, redeemed_at DATETIME)`);

    db.exec(`CREATE TABLE IF NOT EXISTS vips (id INTEGER PRIMARY KEY AUTOINCREMENT, user_phone TEXT UNIQUE, is_vip BOOLEAN DEFAULT 0, plan_type TEXT DEFAULT 'mensal', price DECIMAL(10,2) DEFAULT 0, start_date DATETIME DEFAULT CURRENT_TIMESTAMP, expiration_date DATETIME, is_active BOOLEAN DEFAULT 1)`);

    const ownerPhone = config.bot.ownerNumber;
    if (ownerPhone) {
        const owner = db.prepare('SELECT * FROM users WHERE phone = ?').get(ownerPhone);
        if (!owner) db.prepare('INSERT INTO users (phone, is_admin, is_owner, referral_code) VALUES (?, 1, 1, ?)').run(ownerPhone, `BONUS_COD_${ownerPhone}`);
        else db.prepare('UPDATE users SET is_admin = 1, is_owner = 1 WHERE phone = ?').run(ownerPhone);
    }

    insertDefaultSettings();
    insertDefaultMessages();
    logger.info('✅ Tabelas inicializadas com sucesso');
}

function insertDefaultSettings() {
    const defaults = [
        ['support_link', '', 'Link do suporte'],
        ['separator', '===', 'Separador'],
        ['maintenance_mode', 'off', 'Manutenção'],
        ['referral_system', 'on', 'Sistema indicação'],
        ['referral_points_per_recharge', '10', 'Pontos por recarga'],
        ['referral_min_points', '500', 'Min pontos'],
        ['referral_multiplier', '0.01', 'Multiplicador'],
        ['registration_bonus', '0.00', 'Bônus registro'],
        ['pix_min_deposit', '1.00', 'Depósito mín'],
        ['pix_max_deposit', '150.00', 'Depósito máx'],
        ['pix_expiration', '15', 'Expiração PIX'],
        ['pix_bonus', '0', 'Bônus depósito'],
        ['pix_bonus_min', '0.00', 'Min para bônus'],
        ['pix_mode', 'automatico', 'Modo PIX'],
        ['pix_manual_key', '', 'Chave PIX manual'],
        ['pix_manual_name', 'DOGUINHA STORE', 'Titular PIX'],
    ];
    const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)');
    for (const s of defaults) insert.run(s[0], s[1], s[2]);
}

function insertDefaultMessages() {
    const defaults = [
        ['welcome', '🤖 *DOGUINHA STORE BOT* 🤖\n\n🥇 Nosso bot permite que você encontre diversos produtos e serviços.\n\nℹ️ Seus Dados:\n├💠 Número: {phone}\n└💸 Saldo Atual: R$ {balance}'],
        ['add_balance_menu', '💸 *MENU DE OPÇÕES DE PIX* 💸\n\nEscolha um dos valores ou digite outro valor.'],
        ['insufficient_balance', '*❌ Saldo Insuficiente!*\n\nFaça uma recarga e tente novamente! 💰'],
        ['generating_pix', '*⏳ Gerando PIX...*\n\nAguarde um momento! 💰'],
        ['pix_qrcode', '*💰 ADICIONAR SALDO COM PIX 💠*\n\n⚠️ Escaneie o QR Code ou use o código PIX.\n\nO PIX expira em *{expiration} minutos*.\n\n*🆔 ID:* {transaction_id}\n*💰 Valor:* R$ {amount}\n*📅 Vencimento:* {expiration_date}'],
        ['premium_menu', '🥇 Somos a solução para o mercado digital.\n\n🏦 Carteira:\n├💠 Número: {phone}\n└💰 Saldo Atual: R$ {balance}'],
        ['referral_menu', '💼 *ÁREA DO ASSOCIADO* 💼\n\n🔗 SEU LINK: {referral_link}\n🆔 CÓDIGO: {referral_code}\n\n💰 Bônus: R$ {bonus_balance}\n👥 Indicados: {total_referrals}\n📈 Ganho: {bonus_percentage}%'],
        ['referral_text', '🎬 *BORA TER ACESSO AOS MELHORES STREAMINGS!* 🎬\n\n✅ Netflix | HBO Max | Disney+ | E MAIS!\n\n👉 {referral_link}\n🔹 {referral_code}'],
        ['support_message', '👤 *SUPORTE OFICIAL* 👤\n\n⚠️ Entre em contato pelo Telegram:\n👉 {support_link}'],
        ['purchase_confirm', '*🛍️ CONFIRMAR COMPRA*\n\n*Produto:* {product_name}\n*Valor:* R$ {product_price}\n*Seu Saldo:* R$ {user_balance}\n*Saldo Após:* R$ {balance_after}\n\nDeseja confirmar?'],
        ['purchase_success', '*✅ COMPRA REALIZADA!*\n\n*Produto:* {product_name}\n*Valor:* R$ {product_price}\n*Saldo Restante:* R$ {balance_after}'],
        ['out_of_stock', '*❌ Produto Esgotado!*\n\nTente novamente mais tarde.'],
    ];
    const insert = db.prepare('INSERT OR IGNORE INTO messages (key, content) VALUES (?, ?)');
    for (const m of defaults) insert.run(m[0], m[1]);
}

function getDatabase() { if (!db) throw new Error('Banco não inicializado'); return db; }
function closeDatabase() { if (db) { db.close(); logger.info('🔒 Banco fechado'); } }

module.exports = { connectDatabase, initializeDatabase, getDatabase, closeDatabase };
