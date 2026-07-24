const pino = require('pino');
const path = require('path');
const fs = require('fs');

const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        targets: [
            {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'HH:MM:ss',
                    ignore: 'pid,hostname'
                },
                level: 'info'
            },
            {
                target: 'pino/file',
                options: {
                    destination: path.join(logDir, 'bot.log'),
                    mkdir: true
                },
                level: 'info'
            }
        ]
    }
});

module.exports = logger;
