const { sendMessage, sendMenu } = require('../../services/telegram');
const User = require('../../database/models/User');
const Product = require('../../database/models/Product');
const Transaction = require('../../database/models/Transaction');
const { getSetting, getAllSettings, updateSetting } = require('../../utils/settings');
const { getMessage, updateMessage } = require('../../utils/messages');
const {
    getAdminDashboardButtons, getAdminConfigButtons,
    getAdminGeneralConfigButtons, getAdminAdminsButtons,
    getAdminAffiliatesButtons, getAdminUsersButtons,
    getAdminPixButtons, getAdminLoginsButtons,
    getAdminSearchButtons, getAdminActionsButtons,
    getAdminTransactionsButtons, getAdminUpdatesButtons
} = require('../../utils/buttons');
const logger = require('../../utils/logger');

const adminStates = {};

async function handleAdminMessage(bot, msg) {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const telegramId = String(msg.from.id);

    try {
        const user = User.findByTelegramId(telegramId);
        if (!user || !user.is_admin) {
            await sendMessage(chatId, '⛔ Acesso negado!');
            return;
        }

        // Comando /start ou /admin
        if (text === '/start' || text === '/admin' || text === '🏠 MENU INICIAL') {
            delete adminStates[chatId];
            await showMainMenu(chatId, user);
            return;
        }

        // Voltar
        if (text === '🔙 VOLTAR') {
            delete adminStates[chatId];
            await showMainMenu(chatId, user);
            return;
        }

        // Navegação do menu
        await handleMenuNavigation(chatId, text, telegramId);

        // Estados de input
        if (adminStates[chatId]) {
            await handleStateInput(chatId, text, telegramId);
        }

    } catch (error) {
        logger.error('❌ Erro no admin:', error);
    }
}

async function showMainMenu(chatId, user) {
    const purchasesCount = Transaction.countToday();
    const giftcardsTotal = Transaction.totalDeposits();
    const referralLink = `https://t.me/DoguinhaStoreBot?start=${user.referral_code || ''}`;
    const referralCount = user.total_referrals || 0;
    const referralPoints = user.referral_points || 0;

    const message = `🤖 *DOGUINHA STORE ADMIN*\n\n` +
        `🛒 Compras feitas: ${purchasesCount}\n` +
        `🎁 GiftCard's resgatados: ${parseFloat(giftcardsTotal).toFixed(2)}\n\n` +
        `💼 *Área Afiliados*\n` +
        `🔗 Seu link: ${referralLink}\n` +
        `👥 Afiliados: ${referralCount}\n` +
        `⭐ Pontos: ${referralPoints}\n\n` +
        `Use os botões abaixo:`;

    const buttons = [
        ['👤 PERFIL', '💰 ADICIONAR SALDO'],
        ['📞 SUPORTE', '🤖 ALUGAR BOT'],
        ['🔍 PESQUISAR SERVIÇO'],
        ['📊 DASHBOARD ADMIN']
    ];

    await sendMenu(chatId, message, buttons);
}

async function handleMenuNavigation(chatId, text, telegramId) {
    const user = User.findByTelegramId(telegramId);

    switch (text) {
        case '📊 DASHBOARD ADMIN':
            adminStates[chatId] = { menu: 'dashboard', parent: 'main' };
            await showDashboard(chatId);
            break;

        case '⚙️ CONFIGURAÇÕES':
            adminStates[chatId] = { menu: 'config', parent: 'dashboard' };
            await showConfigMenu(chatId);
            break;

        case '⚡ AÇÕES':
            adminStates[chatId] = { menu: 'actions', parent: 'dashboard' };
            await sendMenu(chatId, '⚡ *AÇÕES*\n\nEm desenvolvimento.', getAdminActionsButtons());
            break;

        case '💳 TRANSAÇÕES':
            adminStates[chatId] = { menu: 'transactions', parent: 'dashboard' };
            const lastTransactions = Transaction.findAll(10);
            let msg = '💳 *ÚLTIMAS TRANSAÇÕES:*\n\n';
            for (const t of lastTransactions) {
                msg += `🆔 ${t.id.substring(0, 8)}...\n👤 ${t.user_phone}\n💰 R$ ${parseFloat(t.amount).toFixed(2)}\n📌 ${t.type} - ${t.status}\n━━━━━━\n`;
            }
            await sendMenu(chatId, msg, getAdminTransactionsButtons());
            break;

        case '🔄 ATUALIZAÇÕES':
            await sendMenu(chatId, '🔄 *ATUALIZAÇÕES*\n\nVersão: 1.0.0\n✅ Sistema funcionando normalmente!', getAdminUpdatesButtons());
            break;

        // Configurações
        case '📝 CONFIGURAÇÕES GERAIS':
            adminStates[chatId] = { menu: 'general_config', parent: 'config' };
            await showGeneralConfig(chatId);
            break;

        case '👥 CONFIGURAR ADMINS':
            adminStates[chatId] = { menu: 'admins', parent: 'config' };
            await showAdminsConfig(chatId);
            break;

        case '🔗 CONFIGURAR AFILIADOS':
            adminStates[chatId] = { menu: 'affiliates', parent: 'config' };
            await showAffiliatesConfig(chatId);
            break;

        case '👤 CONFIGURAR USUÁRIOS':
            adminStates[chatId] = { menu: 'users', parent: 'config' };
            await showUsersConfig(chatId);
            break;

        case '💠 CONFIGURAR PIX':
            adminStates[chatId] = { menu: 'pix', parent: 'config' };
            await showPixConfig(chatId);
            break;

        case '🔐 CONFIGURAR LOGINS':
            adminStates[chatId] = { menu: 'logins', parent: 'config' };
            await showLoginsConfig(chatId);
            break;

        case '🔍 CONFIGURAR PESQUISA DE SERVIÇOS':
            adminStates[chatId] = { menu: 'search', parent: 'config' };
            await showSearchConfig(chatId);
            break;

        // Ações dos submenus
        case '📞 MUDAR SUPORTE':
            adminStates[chatId] = { action: 'change_support' };
            await sendMessage(chatId, '📞 Envie o novo link do suporte:');
            break;

        case '🔣 MUDAR SEPARADOR':
            adminStates[chatId] = { action: 'change_separator' };
            await sendMessage(chatId, '🔣 Envie o novo separador:');
            break;

        case '📋 MUDAR DESTINO LOG':
            adminStates[chatId] = { action: 'change_log_dest' };
            await sendMessage(chatId, '📋 Envie o novo destino de log:');
            break;

        case '🔄 RENOVAR PLANO':
            await sendMessage(chatId, '🔄 Função de renovar plano em desenvolvimento.');
            break;

        case '🔁 REINICIAR BOT':
            await sendMessage(chatId, '🔁 Reiniciando bot...');
            process.exit(0);
            break;

        case '🛑 MANUTENÇÃO':
            const currentMode = await getSetting('maintenance_mode', 'off');
            const newMode = currentMode === 'on' ? 'off' : 'on';
            await updateSetting('maintenance_mode', newMode);
            await sendMessage(chatId, `🛑 Manutenção: ${newMode.toUpperCase()}`);
            await showGeneralConfig(chatId);
            break;

        case '➕ ADICIONAR ADM':
            adminStates[chatId] = { action: 'add_admin' };
            await sendMessage(chatId, '➕ Envie o número do novo admin (55XXXXXXXXXXX):');
            break;

        case '➖ REMOVER ADM':
            adminStates[chatId] = { action: 'remove_admin' };
            await sendMessage(chatId, '➖ Envie o número do admin a remover:');
            break;

        case '📋 LISTA DE ADM':
            const admins = User.findAll().filter(u => u.is_admin);
            let adminMsg = '📋 *ADMINS:*\n\n';
            for (const a of admins) {
                adminMsg += `👤 ${a.phone} ${a.is_owner ? '(Dono)' : ''}\n`;
            }
            await sendMessage(chatId, adminMsg);
            break;

        case '🔄 SISTEMA DE INDICAÇÃO':
            const refSystem = await getSetting('referral_system', 'on');
            const newRef = refSystem === 'on' ? 'off' : 'on';
            await updateSetting('referral_system', newRef);
            await sendMessage(chatId, `🔄 Sistema de indicação: ${newRef.toUpperCase()}`);
            await showAffiliatesConfig(chatId);
            break;

        case '⭐ PONTOS POR RECARGA':
            adminStates[chatId] = { action: 'change_ref_points' };
            await sendMessage(chatId, '⭐ Envie a quantidade de pontos por recarga:');
            break;

        case '📊 PONTOS MINIMO PARA CONVERTER':
            adminStates[chatId] = { action: 'change_ref_min_points' };
            await sendMessage(chatId, '📊 Envie os pontos mínimos para converter:');
            break;

        case '✖️ MULTIPLICADOR PARA CONVERTER':
            adminStates[chatId] = { action: 'change_ref_multiplier' };
            await sendMessage(chatId, '✖️ Envie o multiplicador (ex: 0.01):');
            break;

        case '📢 TRANSMITIR A TODOS':
            adminStates[chatId] = { action: 'broadcast' };
            await sendMessage(chatId, '📢 Envie a mensagem que será transmitida a todos os usuários:');
            break;

        case '🔍 PESQUISAR USUÁRIO':
            adminStates[chatId] = { action: 'search_user' };
            await sendMessage(chatId, '🔍 Envie o número do usuário:');
            break;

        case '🎁 BÔNUS DE REGISTRO':
            adminStates[chatId] = { action: 'change_registration_bonus' };
            await sendMessage(chatId, '🎁 Envie o valor do bônus de registro (0 para desativar):');
            break;

        case '🔑 MUDAR TOKEN':
            adminStates[chatId] = { action: 'change_mp_token' };
            await sendMessage(chatId, '🔑 Envie o novo token do Mercado Pago:');
            break;

        case '⬇️ MUDAR DEPÓSITO MIN':
            adminStates[chatId] = { action: 'change_min_deposit' };
            await sendMessage(chatId, '⬇️ Envie o valor do depósito mínimo:');
            break;

        case '⬆️ MUDAR DEPÓSITO MAX':
            adminStates[chatId] = { action: 'change_max_deposit' };
            await sendMessage(chatId, '⬆️ Envie o valor do depósito máximo:');
            break;

        case '⏰ MUDAR TEMPO DE EXPIRAÇÃO':
            adminStates[chatId] = { action: 'change_pix_expiration' };
            await sendMessage(chatId, '⏰ Envie o tempo de expiração em minutos:');
            break;

        case '🎁 MUDAR BÔNUS':
            adminStates[chatId] = { action: 'change_pix_bonus' };
            await sendMessage(chatId, '🎁 Envie a porcentagem de bônus de depósito:');
            break;

        case '📊 MUDAR MIN PARA BÔNUS':
            adminStates[chatId] = { action: 'change_pix_bonus_min' };
            await sendMessage(chatId, '📊 Envie o valor mínimo para ganhar bônus:');
            break;

        case '➕ ADICIONAR LOGIN':
            adminStates[chatId] = { action: 'add_logins' };
            await sendMessage(chatId, '➕ Envie os logins no formato:\nNOME===VALOR===DESCRICAO===EMAIL===SENHA===DURACAO\n\nUm por linha.');
            break;

        case '➖ REMOVER LOGIN':
            adminStates[chatId] = { action: 'remove_login' };
            await sendMessage(chatId, '➖ Envie a PLATAFORMA===EMAIL para remover:');
            break;

        case '🗑️ REMOVER POR PLATAFORMA':
            adminStates[chatId] = { action: 'remove_by_platform' };
            await sendMessage(chatId, '🗑️ Envie o nome da plataforma para remover todos os logins:');
            break;

        case '📦 ESTOQUE DETALHADO':
            const stock = Product.getDetailedStock();
            let stockMsg = '📦 *ESTOQUE DETALHADO:*\n\n';
            for (const s of stock) {
                stockMsg += `📌 ${s.platform}: ${s.total_stock} logins (${s.count} únicos)\n`;
            }
            stockMsg += `\n📦 Total: ${Product.countStock()} logins`;
            await sendMessage(chatId, stockMsg);
            break;

        case '💣 ZERAR ESTOQUE':
            Product.deleteAll();
            await sendMessage(chatId, '💣 Estoque zerado com sucesso!');
            break;

        case '💰 MUDAR VALOR DO SERVIÇO':
            adminStates[chatId] = { action: 'change_service_value' };
            await sendMessage(chatId, '💰 Envie: SERVICO===VALOR');
            break;

        case '💎 MUDAR VALOR DE TODOS':
            adminStates[chatId] = { action: 'change_all_values' };
            await sendMessage(chatId, '💎 Envie o novo valor para TODOS os serviços:');
            break;

        case '🖼️ ADICIONAR IMAGEM':
            adminStates[chatId] = { action: 'add_service_image' };
            await sendMessage(chatId, '🖼️ Envie: PLATAFORMA===URL_DA_IMAGEM');
            break;

        case '🗑️ REMOVER IMAGEM':
            adminStates[chatId] = { action: 'remove_service_image' };
            await sendMessage(chatId, '🗑️ Envie o nome da plataforma para remover a imagem:');
            break;

        // Menu principal
        case '👤 PERFIL':
            await showProfile(chatId, user);
            break;

        case '💰 ADICIONAR SALDO':
            await sendMessage(chatId, '💰 Para adicionar saldo, use o bot no WhatsApp.\n\nNúmero: ' + process.env.WHATSAPP_NUMBER);
            break;

        case '📞 SUPORTE':
            const supportLink = await getSetting('support_link', '');
            await sendMessage(chatId, `📞 *SUPORTE*\n\nEntre em contato pelo link:\n👉 ${supportLink || 'Não configurado'}`);
            break;

        case '🤖 ALUGAR BOT':
            await sendMessage(chatId, '🤖 *ALUGAR BOT*\n\nQuer ter seu próprio bot?\n\nEntre em contato para saber valores e condições!');
            break;

        case '🔍 PESQUISAR SERVIÇO':
            adminStates[chatId] = { action: 'search_service_admin' };
            await sendMessage(chatId, '🔍 Envie o nome do serviço que deseja pesquisar:');
            break;
    }
}

async function handleStateInput(chatId, text, telegramId) {
    const state = adminStates[chatId];
    if (!state || !state.action) return;

    switch (state.action) {
        case 'change_support':
            await updateSetting('support_link', text);
            await sendMessage(chatId, '✅ Link do suporte atualizado!');
            break;

        case 'change_separator':
            await updateSetting('separator', text);
            await sendMessage(chatId, '✅ Separador atualizado!');
            break;

        case 'change_log_dest':
            await updateSetting('log_destination', text);
            await sendMessage(chatId, '✅ Destino de log atualizado!');
            break;

        case 'add_admin':
            const newAdmin = User.findByPhone(text);
            if (newAdmin) {
                const db = require('../../database/connection').getDatabase();
                db.prepare('UPDATE users SET is_admin = 1 WHERE phone = ?').run(text);
                await sendMessage(chatId, `✅ ${text} agora é admin!`);
            } else {
                await sendMessage(chatId, '❌ Usuário não encontrado!');
            }
            break;

        case 'remove_admin':
            const admin = User.findByPhone(text);
            if (admin && !admin.is_owner) {
                const db = require('../../database/connection').getDatabase();
                db.prepare('UPDATE users SET is_admin = 0 WHERE phone = ?').run(text);
                await sendMessage(chatId, `✅ ${text} removido dos admins!`);
            } else {
                await sendMessage(chatId, '❌ Não é possível remover o dono!');
            }
            break;

        case 'change_ref_points':
            await updateSetting('referral_points_per_recharge', text);
            await sendMessage(chatId, '✅ Pontos por recarga atualizados!');
            break;

        case 'change_ref_min_points':
            await updateSetting('referral_min_points', text);
            await sendMessage(chatId, '✅ Pontos mínimos atualizados!');
            break;

        case 'change_ref_multiplier':
            await updateSetting('referral_multiplier', text);
            await sendMessage(chatId, '✅ Multiplicador atualizado!');
            break;

        case 'change_registration_bonus':
            await updateSetting('registration_bonus', text);
            await sendMessage(chatId, '✅ Bônus de registro atualizado!');
            break;

        case 'change_mp_token':
            await updateSetting('mercadopago_token', text);
            await sendMessage(chatId, '✅ Token Mercado Pago atualizado!');
            break;

        case 'change_min_deposit':
            await updateSetting('pix_min_deposit', text);
            await sendMessage(chatId, '✅ Depósito mínimo atualizado!');
            break;

        case 'change_max_deposit':
            await updateSetting('pix_max_deposit', text);
            await sendMessage(chatId, '✅ Depósito máximo atualizado!');
            break;

        case 'change_pix_expiration':
            await updateSetting('pix_expiration', text);
            await sendMessage(chatId, '✅ Tempo de expiração atualizado!');
            break;

        case 'change_pix_bonus':
            await updateSetting('pix_bonus', text);
            await sendMessage(chatId, '✅ Bônus de depósito atualizado!');
            break;

        case 'change_pix_bonus_min':
            await updateSetting('pix_bonus_min', text);
            await sendMessage(chatId, '✅ Depósito mínimo para bônus atualizado!');
            break;

        case 'broadcast':
            const users = User.findActiveUsers();
            let sent = 0;
            for (const u of users) {
                try {
                    const { sendTextMessage } = require('../../services/whatsapp');
                    await sendTextMessage(u.phone, `📢 *COMUNICADO:*\n\n${text}`);
                    sent++;
                } catch (e) { }
            }
            await sendMessage(chatId, `📢 Transmissão concluída! Enviado para ${sent} usuários.`);
            break;

        case 'search_user':
            const foundUser = User.findByPhone(text);
            if (foundUser) {
                const msg = `👤 *USUÁRIO ENCONTRADO:*\n\n` +
                    `📞 Número: ${foundUser.phone}\n` +
                    `💰 Saldo: R$ ${parseFloat(foundUser.balance).toFixed(2)}\n` +
                    `🎁 Bônus: R$ ${parseFloat(foundUser.bonus_balance).toFixed(2)}\n` +
                    `👥 Indicados: ${foundUser.total_referrals}\n` +
                    `⭐ Pontos: ${foundUser.referral_points}\n` +
                    `🚫 Bloqueado: ${foundUser.is_blocked ? 'Sim' : 'Não'}\n\n` +
                    `Para editar saldo, use os comandos disponíveis.`;
                await sendMessage(chatId, msg);
            } else {
                await sendMessage(chatId, '❌ Usuário não encontrado!');
            }
            break;

        case 'add_logins':
            const lines = text.split('\n');
            let added = 0;
            for (const line of lines) {
                const parts = line.split('===');
                if (parts.length >= 6) {
                    Product.create(parts[0], parseFloat(parts[1]), parts[2], parts[3], parts[4], parts[5], parts[0], 1);
                    added++;
                }
            }
            await sendMessage(chatId, `✅ ${added} logins adicionados!`);
            break;

        case 'remove_login':
            const removeParts = text.split('===');
            if (removeParts.length >= 2) {
                Product.deleteByEmailPlatform(removeParts[1], removeParts[0]);
                await sendMessage(chatId, '✅ Login removido!');
            }
            break;

        case 'remove_by_platform':
            Product.deleteByPlatform(text);
            await sendMessage(chatId, `✅ Todos os logins da plataforma ${text} foram removidos!`);
            break;

        case 'change_service_value':
            const valueParts = text.split('===');
            if (valueParts.length >= 2) {
                const db = require('../../database/connection').getDatabase();
                db.prepare('UPDATE products SET value = ? WHERE platform = ?').run(valueParts[1], valueParts[0]);
                await sendMessage(chatId, '✅ Valor do serviço atualizado!');
            }
            break;

        case 'change_all_values':
            Product.updateAllValues(parseFloat(text));
            await sendMessage(chatId, '✅ Todos os valores atualizados!');
            break;

        case 'add_service_image':
            const imgParts = text.split('===');
            if (imgParts.length >= 2) {
                const db = require('../../database/connection').getDatabase();
                db.prepare('INSERT INTO service_images (platform, image_url) VALUES (?, ?)').run(imgParts[0], imgParts[1]);
                await sendMessage(chatId, '✅ Imagem adicionada!');
            }
            break;

        case 'remove_service_image':
            const db = require('../../database/connection').getDatabase();
            db.prepare('DELETE FROM service_images WHERE platform = ?').run(text);
            await sendMessage(chatId, '✅ Imagem removida!');
            break;

        case 'search_service_admin':
            const products = Product.findByPlatform(text.toUpperCase());
            if (products.length > 0) {
                let resultMsg = `🔍 *RESULTADOS PARA: ${text.toUpperCase()}*\n\n`;
                for (const p of products) {
                    resultMsg += `📌 ${p.name} - R$ ${parseFloat(p.value).toFixed(2)} - Estoque: ${p.stock}\n`;
                }
                await sendMessage(chatId, resultMsg);
            } else {
                await sendMessage(chatId, '❌ Nenhum serviço encontrado!');
            }
            break;
    }

    delete adminStates[chatId];
    setTimeout(() => {
        const user = User.findByTelegramId(telegramId);
        if (user) showMainMenu(chatId, user);
    }, 1000);
}

async function showDashboard(chatId) {
    const usersCount = User.count();
    const totalRevenue = Transaction.totalSales();
    const monthlyRevenue = Transaction.salesThisMonth();
    const todayRevenue = Transaction.depositsToday() + Transaction.salesToday();
    const totalSales = Transaction.count();
    const todaySales = Transaction.countToday();

    const message = `📊 *DASHBOARD*\n\n` +
        `👥 Users: ${usersCount}\n` +
        `💰 Receita total: R$ ${totalRevenue.toFixed(2)}\n` +
        `📅 Receita mensal: R$ ${monthlyRevenue.toFixed(2)}\n` +
        `📆 Receita de hoje: R$ ${todayRevenue.toFixed(2)}\n` +
        `🛒 Vendas total: ${totalSales}\n` +
        `🛍️ Vendas hoje: ${todaySales}\n\n` +
        `Use os botões abaixo:`;

    await sendMenu(chatId, message, getAdminDashboardButtons());
}

async function showConfigMenu(chatId) {
    await sendMenu(chatId, '⚙️ *MENU DE CONFIGURAÇÕES*\n\nEscolha uma opção:', getAdminConfigButtons());
}

async function showGeneralConfig(chatId) {
    const supportLink = await getSetting('support_link', '');
    const separator = await getSetting('separator', '===');
    const logDest = await getSetting('log_destination', '');
    const maintenance = await getSetting('maintenance_mode', 'off');

    const msg = `📝 *CONFIGURAÇÕES GERAIS*\n\n` +
        `📞 Suporte: ${supportLink || 'Não configurado'}\n` +
        `🔣 Separador: ${separator}\n` +
        `📋 Log Destino: ${logDest || 'Não configurado'}\n` +
        `🛑 Manutenção: ${maintenance.toUpperCase()}\n\n` +
        `Use os botões:`;

    await sendMenu(chatId, msg, getAdminGeneralConfigButtons());
}

async function showAdminsConfig(chatId) {
    const admins = User.findAll().filter(u => u.is_admin);
    await sendMenu(chatId, `👥 *CONFIGURAR ADMINS*\n\nAdministradores: ${admins.length}\n\nUse os botões:`, getAdminAdminsButtons());
}

async function showAffiliatesConfig(chatId) {
    const refSystem = await getSetting('referral_system', 'on');
    const pointsPerRecharge = await getSetting('referral_points_per_recharge', '10');
    const minPoints = await getSetting('referral_min_points', '500');
    const multiplier = await getSetting('referral_multiplier', '0.01');

    const msg = `🔗 *CONFIGURAR AFILIADOS*\n\n` +
        `🔄 Sistema: ${refSystem === 'on' ? '✅ ON' : '❌ OFF'}\n` +
        `⭐ Pontos por recarga: ${pointsPerRecharge}\n` +
        `📊 Pontos mínimos: ${minPoints}\n` +
        `✖️ Multiplicador: ${multiplier}\n\n` +
        `Use os botões:`;

    await sendMenu(chatId, msg, getAdminAffiliatesButtons());
}

async function showUsersConfig(chatId) {
    const registrationBonus = await getSetting('registration_bonus', '0.00');
    const msg = `👤 *CONFIGURAR USUÁRIOS*\n\n🎁 Bônus de registro: R$ ${registrationBonus}\n\nUse os botões:`;
    await sendMenu(chatId, msg, getAdminUsersButtons());
}

async function showPixConfig(chatId) {
    const token = await getSetting('mercadopago_token', '');
    const minDep = await getSetting('pix_min_deposit', '1.00');
    const maxDep = await getSetting('pix_max_deposit', '150.00');
    const expiration = await getSetting('pix_expiration', '15');
    const bonus = await getSetting('pix_bonus', '0');
    const bonusMin = await getSetting('pix_bonus_min', '0.00');

    const msg = `💠 *CONFIGURAR PIX*\n\n` +
        `🔑 Token: ${token ? token.substring(0, 15) + '...' : 'Não configurado'}\n` +
        `⬇️ Depósito mín: R$ ${minDep}\n` +
        `⬆️ Depósito máx: R$ ${maxDep}\n` +
        `⏰ Expiração: ${expiration} min\n` +
        `🎁 Bônus: ${bonus}%\n` +
        `📊 Min p/ bônus: R$ ${bonusMin}\n\n` +
        `Use os botões:`;

    await sendMenu(chatId, msg, getAdminPixButtons());
}

async function showLoginsConfig(chatId) {
    const stockCount = Product.countStock();
    const msg = `🔐 *CONFIGURAR LOGINS*\n\n📦 Logins no estoque: ${stockCount}\n\nUse os botões:`;
    await sendMenu(chatId, msg, getAdminLoginsButtons());
}

async function showSearchConfig(chatId) {
    const db = require('../../database/connection').getDatabase();
    const images = db.prepare('SELECT COUNT(*) as total FROM service_images').get().total;
    const msg = `🔍 *CONFIGURAR PESQUISA DE SERVIÇOS*\n\n🖼️ Imagens salvas: ${images}\n\nUse os botões:`;
    await sendMenu(chatId, msg, getAdminSearchButtons());
}

async function showProfile(chatId, user) {
    const purchasesCount = Transaction.countToday();
    const msg = `👤 *SEU PERFIL*\n\n` +
        `📞 Número: ${user.phone || 'N/A'}\n` +
        `💰 Saldo: R$ ${parseFloat(user.balance || 0).toFixed(2)}\n` +
        `⭐ Pontos: ${user.referral_points || 0}\n` +
        `👥 Indicados: ${user.total_referrals || 0}\n` +
        `🛒 Compras hoje: ${purchasesCount}\n` +
        `👑 Admin: ${user.is_admin ? 'Sim' : 'Não'}\n` +
        `👤 Dono: ${user.is_owner ? 'Sim' : 'Não'}`;

    await sendMenu(chatId, msg, [['🏠 MENU INICIAL']]);
}

async function handleCallbackQuery(bot, query) {
    // Para futuros botões inline
}

module.exports = {
    handleAdminMessage,
    handleCallbackQuery
};
