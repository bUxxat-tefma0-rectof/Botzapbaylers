const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

let db = null;

function getDatabase() {
    if (!db) {
        const dbPath = process.env.DATABASE_PATH || './supermercado.db';
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
}

async function initDatabase() {
    const db = getDatabase();
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id BIGINT UNIQUE NOT NULL,
            tipo TEXT DEFAULT 'PF',
            nome TEXT,
            sobrenome TEXT,
            cpf TEXT UNIQUE,
            cnpj TEXT UNIQUE,
            razao_social TEXT,
            nome_fantasia TEXT,
            inscricao_estadual TEXT,
            responsavel TEXT,
            data_nascimento TEXT,
            sexo TEXT,
            telefone TEXT,
            email TEXT,
            senha TEXT,
            telefone_verificado INTEGER DEFAULT 0,
            codigo_whatsapp TEXT,
            bloqueado INTEGER DEFAULT 0,
            total_gasto REAL DEFAULT 0,
            data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS enderecos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER NOT NULL,
            apelido TEXT DEFAULT 'Principal',
            cep TEXT, logradouro TEXT, numero TEXT, complemento TEXT,
            referencia TEXT, bairro TEXT, cidade TEXT, estado TEXT,
            latitude REAL, longitude REAL, principal INTEGER DEFAULT 0,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        );
        
        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL, emoji TEXT DEFAULT '📦',
            ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
        );
        
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            categoria_id INTEGER, codigo_barras TEXT, sku TEXT,
            nome TEXT NOT NULL, marca TEXT, descricao TEXT,
            info_nutricional TEXT, peso TEXT, unidade TEXT DEFAULT 'un',
            validade TEXT, preco REAL NOT NULL,
            preco_promocional REAL, preco_clube REAL,
            estoque INTEGER DEFAULT 0, foto TEXT, galeria TEXT,
            destaque INTEGER DEFAULT 0, disponivel INTEGER DEFAULT 1,
            ordem INTEGER DEFAULT 0,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id)
        );
        
        CREATE TABLE IF NOT EXISTS carrinhos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER NOT NULL, produto_id INTEGER,
            quantidade INTEGER DEFAULT 1, comentario TEXT,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id),
            FOREIGN KEY (produto_id) REFERENCES produtos(id)
        );
        
        CREATE TABLE IF NOT EXISTS favoritos (
            cliente_id INTEGER, produto_id INTEGER,
            PRIMARY KEY (cliente_id, produto_id)
        );
        
        CREATE TABLE IF NOT EXISTS pedidos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT UNIQUE NOT NULL, cliente_id INTEGER NOT NULL,
            endereco_id INTEGER, tipo_entrega TEXT DEFAULT 'entrega',
            status TEXT DEFAULT 'recebido',
            subtotal REAL, taxa_entrega REAL DEFAULT 0,
            desconto REAL DEFAULT 0, total REAL,
            cupom TEXT, comentario TEXT,
            pagamento_metodo TEXT, pagamento_id TEXT,
            pagamento_status TEXT DEFAULT 'pendente',
            pagamento_qrcode TEXT,
            data_pedido DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        );
        
        CREATE TABLE IF NOT EXISTS itens_pedido (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pedido_id INTEGER, produto_nome TEXT, marca TEXT,
            quantidade INTEGER DEFAULT 1, preco_unitario REAL,
            comentario TEXT,
            FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
        );
        
        CREATE TABLE IF NOT EXISTS cupons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT UNIQUE NOT NULL, tipo TEXT DEFAULT 'percentual',
            valor REAL NOT NULL, uso_maximo INTEGER DEFAULT 100,
            uso_atual INTEGER DEFAULT 0, valido_ate DATETIME, ativo INTEGER DEFAULT 1
        );
        
        CREATE TABLE IF NOT EXISTS promocoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL, tipo TEXT, valor REAL,
            categoria_id INTEGER, produto_id INTEGER,
            bairro TEXT, ativo INTEGER DEFAULT 1
        );
        
        CREATE TABLE IF NOT EXISTS horarios_entrega (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dia_semana INTEGER, horario TEXT, disponivel INTEGER DEFAULT 1
        );
        
        CREATE TABLE IF NOT EXISTS configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chave TEXT UNIQUE NOT NULL, valor TEXT
        );
    `);
    
    const cats = db.prepare('SELECT COUNT(*) as t FROM categorias').get();
    if (cats.t === 0) {
        const insertCat = db.prepare("INSERT INTO categorias (nome, emoji, ordem) VALUES (?,?,?)");
        insertCat.run('Alimentos', '🍎', 1);
        insertCat.run('Bebidas', '🥤', 2);
        insertCat.run('Limpeza', '🧹', 3);
        insertCat.run('Higiene', '🧼', 4);
        insertCat.run('Açougue', '🥩', 5);
        insertCat.run('Hortifruti', '🥬', 6);
        insertCat.run('Padaria', '🍞', 7);
        insertCat.run('Laticínios', '🧀', 8);
        insertCat.run('Congelados', '❄️', 9);
    }
    
    logger.info('✅ Tabelas criadas');
}

module.exports = { getDatabase, initDatabase };
