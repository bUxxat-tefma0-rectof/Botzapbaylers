const { connectDatabase, initializeDatabase, closeDatabase } = require('../connection');
const logger = require('../../utils/logger');

async function runMigration() {
    try {
        logger.info('🔄 Iniciando migração...');
        await connectDatabase();
        await initializeDatabase();
        logger.info('✅ Migração concluída!');
        closeDatabase();
        process.exit(0);
    } catch (error) {
        logger.error('❌ Erro na migração:', error);
        process.exit(1);
    }
}

runMigration();
