// ============================================
// DOGUINHA STORE - CONEXÃO BANCO DE DADOS
// ============================================

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { config } = require('../config/database');
const logger = require('../utils/logger');

let db = null;

// ============================================
// CONECTAR AO BANCO DE DADOS
// ============================================
async function connectDatabase() {
    try {
        const dbDir = path.dirname(config.database.path);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        db = new Database(config.database.path, {
            verbose: null
        });

        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        db.pragma('busy_timeout = 5000');

        logger.info('✅ Banco de dados conectado');
        return db;

    } catch (error) {
        logger.error('❌ Erro ao conectar banco:', error);
        throw error;
    }
}

// ============================================
// INICIALIZAR TABELAS
// ============================================
async function initializeDatabase() {
    try {
        if (!db) throw new Error('Banco não conectado');

        // Tabela: users
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT UNIQUE,
                telegram_id TEXT UNIQUE,
                balance DECIMAL(10,2) DEFAULT 0.00,
                is_admin BOOLEAN DEFAULT 0,
                is_owner BOOLEAN DEFAULT 0,
                is_blocked BOOLEAN DEFAULT 0,
                referral_code TEXT UNIQUE,
                referred_by TEXT,
                total_referrals INTEGER DEFAULT 0,
                referral_points INTEGER DEFAULT 0,
                bonus_balance DECIMAL(10,2) DEFAULT 0.00,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela: products (logins)
        db.exec(`
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                value DECIMAL(10,2) NOT NULL,
                description TEXT,
                email TEXT,
                password TEXT,
                duration TEXT,
                platform TEXT,
                stock INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela: transactions
        db.exec(`
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                user_phone TEXT,
                user_telegram TEXT,
                type TEXT NOT NULL CHECK(type IN ('deposit', 'purchase')),
                amount DECIMAL(10,2) NOT NULL,
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'cancelled', 'expired')),
                pix_code TEXT,
                pix_qrcode TEXT,
                expires_at DATETIME,
                product_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                paid_at DATETIME
            )
        `);

        // Tabela: referrals
        db.exec(`
            CREATE TABLE IF NOT EXISTS referrals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrer_phone TEXT,
                referred_phone TEXT,
                points_earned INTEGER DEFAULT 0,
                bonus_earned DECIMAL(10,2) DEFAULT 0.00,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela: messages (editáveis)
        db.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                content TEXT NOT NULL,
                type TEXT DEFAULT 'text',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela: settings (configurações editáveis)
        db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT NOT NULL,
                type TEXT DEFAULT 'string',
                description TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela: service_images (pesquisa de serviços)
        db.exec(`
            CREATE TABLE IF NOT EXISTS service_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                image_url TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Inserir dono
        const ownerPhone = config.bot.ownerNumber;
        if (ownerPhone) {
            const owner = db.prepare('SELECT * FROM users WHERE phone = ?').get(ownerPhone);
            if (!owner) {
                db.prepare(`INSERT INTO users (phone, is_admin, is_owner, referral_code) VALUES (?, 1, 1, ?)`)
                    .run(ownerPhone, `BONUS_COD_${ownerPhone}`);
                logger.info('✅ Dono criado automaticamente');
            } else {
                db.prepare('UPDATE users SET is_admin = 1, is_owner = 1 WHERE phone = ?').run(ownerPhone);
            }
        }

        // Inserir configurações padrão
        insertDefaultSettings();
        insertDefaultMessages();

        logger.info('✅ Tabelas inicializadas com sucesso');

    } catch (error) {
        logger.error('❌ Erro ao inicializar tabelas:', error);
        throw error;
    }
}

// ============================================
// CONFIGURAÇÕES PADRÃO
// ============================================
function insertDefaultSettings() {
    const defaults = [
        { key: 'support_link', value: '', type: 'string', description: 'Link do suporte' },
        { key: 'separator', value: '===', type: 'string', description: 'Separador de dados' },
        { key: 'log_destination', value: '', type: 'string', description: 'Destino dos logs' },
        { key: 'maintenance_mode', value: 'off', type: 'string', description: 'Modo manutenção' },
        { key: 'referral_system', value: 'on', type: 'string', description: 'Sistema de indicação' },
        { key: 'referral_points_per_recharge', value: '10', type: 'integer', description: 'Pontos por recarga' },
        { key: 'referral_min_points', value: '500', type: 'integer', description: 'Pontos mínimos para converter' },
        { key: 'referral_multiplier', value: '0.01', type: 'decimal', description: 'Multiplicador de pontos' },
        { key: 'registration_bonus', value: '0.00', type: 'decimal', description: 'Bônus de registro' },
        { key: 'pix_min_deposit', value: '1.00', type: 'decimal', description: 'Depósito mínimo PIX' },
        { key: 'pix_max_deposit', value: '150.00', type: 'decimal', description: 'Depósito máximo PIX' },
        { key: 'pix_expiration', value: '15', type: 'integer', description: 'Expiração PIX (minutos)' },
        { key: 'pix_bonus', value: '0', type: 'integer', description: 'Bônus de depósito (%)' },
        { key: 'pix_bonus_min', value: '0.00', type: 'decimal', description: 'Depósito mínimo para bônus' },
    ];

    const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value, type, description) VALUES (?, ?, ?, ?)');
    for (const s of defaults) {
        insert.run(s.key, s.value, s.type, s.description);
    }
}

// ============================================
// MENSAGENS PADRÃO
// ============================================
function insertDefaultMessages() {
    const defaults = [
        {
            key: 'welcome',
            content: '🤖 *DOGUINHA STORE BOT* 🤖\n\n' +
                     '🥇 Nosso bot permite que você encontre diversos produtos e serviços.\n\n' +
                     'ℹ️ Seus Dados:\n' +
                     '├💠 Número: {phone}\n' +
                     '└💸 Saldo Atual: R$ {balance}'
        },
        {
            key: 'add_balance_menu',
            content: '💸 *MENU DE OPÇÕES DE PIX* 💸\n\nEscolha um dos valores ou digite outro valor.'
        },
        {
            key: 'premium_menu',
            content: '🥇 Somos a solução para o mercado digital.\n\n' +
                     '🏦 Carteira:\n' +
                     '├💠 Número: {phone}\n' +
                     '└💰 Saldo Atual: R$ {balance}'
        },
        {
            key: 'insufficient_balance',
            content: '*❌ Saldo Insuficiente!*\n\nFaça uma recarga e tente novamente! 💰'
        },
        {
            key: 'generating_pix',
            content: '*⏳ Gerando PIX...*\n\nAguarde um momento! 💰'
        },
        {
            key: 'pix_qrcode',
            content: '*💰 ADICIONAR SALDO COM PIX 💠*\n\n' +
                     '⚠️ Escaneie o QR Code ou use o código PIX abaixo.\n\n' +
                     'O PIX expira em *{expiration} minutos*.\n\n' +
                     '*🆔 ID:* {transaction_id}\n' +
                     '*💰 Valor:* R$ {amount}\n' +
                     '*📅 Vencimento:* {expiration_date}'
        },
        {
            key: 'referral_menu',
            content: '💼 *ÁREA DO ASSOCIADO* 💼\n\n' +
                     '🔗 SEU LINK: {referral_link}\n' +
                     '🆔 CÓDIGO: {referral_code}\n\n' +
                     '💰 Bônus: R$ {bonus_balance}\n' +
                     '👥 Indicados: {total_referrals}\n' +
                     '📈 Ganho: {bonus_percentage}%'
        },
        {
            key: 'referral_text',
            content: '🎬 *BORA TER ACESSO AOS MELHORES STREAMINGS!* 🎬\n\n' +
                     '✅ Netflix | HBO Max | Disney+ | E MAIS!\n\n' +
                     '👉 {referral_link}\n' +
                     '🔹 {referral_code}'
        },
        {
            key: 'support_message',
            content: '👤 *SUPORTE OFICIAL* 👤\n\n' +
                     '⚠️ Entre em contato pelo Telegram:\n' +
                     '👉 {support_link}'
        },
        {
            key: 'purchase_confirm',
            content: '*🛍️ CONFIRMAR COMPRA*\n\n' +
                     '*Produto:* {product_name}\n' +
                     '*Valor:* R$ {product_price}\n' +
                     '*Seu Saldo:* R$ {user_balance}\n' +
                     '*Saldo Após:* R$ {balance_after}\n\n' +
                     'Deseja confirmar?'
        },
        {
            key: 'purchase_success',
            content: '*✅ COMPRA REALIZADA!*\n\n' +
                     '*Produto:* {product_name}\n' +
                     '*Valor:* R$ {product_price}\n' +
                     '*Saldo Restante:* R$ {balance_after}'
        },
        {
            key: 'out_of_stock',
            content: '*❌ Produto Esgotado!*\n\nTente novamente mais tarde.'
        },
    ];

    const insert = db.prepare('INSERT OR IGNORE INTO messages (key, content) VALUES (?, ?)');
    for (const m of defaults) {
        insert.run(m.key, m.content);
    }
}

// ============================================
// OBTER INSTÂNCIA DO BANCO
// ============================================
function getDatabase() {
    if (!db) throw new Error('Banco de dados não inicializado');
    return db;
}

// ============================================
// FECHAR BANCO
// ============================================
function closeDatabase() {
    if (db) {
        db.close();
        logger.info('🔒 Banco de dados fechado');
    }
}

module.exports = {
    connectDatabase,
    initializeDatabase,
    getDatabase,
    closeDatabase
};
