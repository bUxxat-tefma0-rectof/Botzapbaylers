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

        if (text === '/start' || text === '/admin' || text === '🏠 MENU INICIAL') {
            delete adminStates[chatId];
            await showMainMenu(chatId, user);
            return;
        }

        if (text === '🔙 VOLTAR') {
            delete adminStates[chatId];
            await showMainMenu(chatId, user);
            return;
        }

        await handleMenuNavigation(chatId, text, telegramId);
        if (adminStates[chatId]) await handleStateInput(chatId, text, telegramId);

    } catch (error) {
        logger.error('❌ Erro no admin:', error);
    }
}

async function showMainMenu(chatId, user) {
    const purchasesCount = Transaction.countToday();
    const db = require('../../database/connection').getDatabase();

    db.run(`CREATE TABLE IF NOT EXISTS vips (id INTEGER PRIMARY KEY AUTOINCREMENT, user_phone TEXT UNIQUE, is_vip BOOLEAN DEFAULT 0, plan_type TEXT DEFAULT 'mensal', price DECIMAL(10,2) DEFAULT 0, start_date DATETIME DEFAULT CURRENT_TIMESTAMP, expiration_date DATETIME, is_active BOOLEAN DEFAULT 1)`);
    db.run(`CREATE TABLE IF NOT EXISTS giftcards (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, amount DECIMAL(10,2) NOT NULL, buyer_phone TEXT, redeemer_phone TEXT, is_redeemed BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, redeemed_at DATETIME)`);

    const vip = db.prepare('SELECT * FROM vips WHERE user_phone = ? AND is_active = 1').get(user.phone);
    let vipStatus = '❌ Não';
    if (vip) {
        const now = new Date();
        const expiration = new Date(vip.expiration_date);
        if (now < expiration) {
            const daysLeft = Math.ceil((expiration - now) / (1000 * 60 * 60 * 24));
            vipStatus = `✅ Sim (${daysLeft} dias)`;
        } else {
            vipStatus = '⚠️ Expirado';
        }
    }

    const totalGiftCards = db.prepare('SELECT COUNT(*) as total FROM giftcards').get().total;
    const totalGiftCardsValue = db.prepare('SELECT SUM(amount) as total FROM giftcards').get().total || 0;
    const pixMode = await getSetting('pix_mode', 'automatico');
    const referralLink = `https://t.me/DoguinhaStoreBot?start=${user.referral_code || ''}`;
    const referralCount = user.total_referrals || 0;
    const referralPoints = user.referral_points || 0;

    const message = `🤖 *DOGUINHA STORE ADMIN*\n\n` +
        `🛒 Compras hoje: ${purchasesCount}\n` +
        `🎁 GiftCards: ${totalGiftCards} (R$ ${parseFloat(totalGiftCardsValue).toFixed(2)})\n` +
        `👑 VIP: ${vipStatus}\n` +
        `💠 PIX: ${pixMode === 'manual' ? '🔴 Manual' : '🟢 Automático'}\n\n` +
        `💼 *Afiliados*\n` +
        `🔗 Link: ${referralLink}\n` +
        `👥 Afiliados: ${referralCount}\n` +
        `⭐ Pontos: ${referralPoints}\n\n` +
        `Use os botões:`;

    const buttons = [
        ['👤 PERFIL', '💰 EDITAR SALDO'],
        ['🎁 GIFT CARDS', '👑 VIP'],
        ['🚫 BLOQ/DESBLOQ', '📊 DASHBOARD ADMIN'],
        ['📞 SUPORTE', '🤖 ALUGAR BOT'],
        ['🔍 PESQUISAR SERVIÇO']
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
        case '🎁 GIFT CARDS':
            await showGiftCardsMenu(chatId);
            break;
        case '🎁 CRIAR GIFT CARD':
            adminStates[chatId] = { action: 'create_giftcard' };
            await sendMessage(chatId, '🎁 Envie o valor do Gift Card:');
            break;
        case '📋 LISTAR GIFT CARDS':
            await showGiftCardsList(chatId);
            break;
        case '👑 VIP':
            await showVipAdminMenu(chatId, user);
            break;
        case '👑 ATIVAR VIP USUÁRIO':
            adminStates[chatId] = { action: 'admin_activate_vip' };
            await sendMessage(chatId, '👑 Envie o número do usuário:');
            break;
        case '👑 REMOVER VIP USUÁRIO':
            adminStates[chatId] = { action: 'admin_remove_vip' };
            await sendMessage(chatId, '👑 Envie o número do usuário:');
            break;
        case '📋 LISTAR VIPS':
            await showVipsList(chatId);
            break;
        case '💰 EDITAR SALDO':
            adminStates[chatId] = { action: 'edit_user_balance' };
            await sendMessage(chatId, '💰 Envie: NUMERO===VALOR\n\nEx: 554498691568===100');
            break;
        case '🚫 BLOQ/DESBLOQ':
            await sendMenu(chatId, '🚫 *BLOQUEAR/DESBLOQUEAR*\n\nEscolha:', [
                ['🚫 BLOQUEAR USUÁRIO'],
                ['✅ DESBLOQUEAR USUÁRIO'],
                ['🔙 VOLTAR']
            ]);
            break;
        case '🚫 BLOQUEAR USUÁRIO':
            adminStates[chatId] = { action: 'block_user' };
            await sendMessage(chatId, '🚫 Envie o número para bloquear:');
            break;
        case '✅ DESBLOQUEAR USUÁRIO':
            adminStates[chatId] = { action: 'unblock_user' };
            await sendMessage(chatId, '✅ Envie o número para desbloquear:');
            break;
        // PIX Manual/Automático
        case '🔄 PIX MANUAL':
            await updateSetting('pix_mode', 'manual');
            await sendMessage(chatId, '✅ Modo PIX MANUAL ativado!\n\nConfigure a chave PIX abaixo.');
            adminStates[chatId] = { action: 'change_pix_manual_key' };
            await sendMessage(chatId, '🔑 Envie a chave PIX manual:');
            break;
        case '🤖 PIX AUTOMÁTICO':
            await updateSetting('pix_mode', 'automatico');
            await sendMessage(chatId, '✅ Modo PIX AUTOMÁTICO ativado!');
            break;
        case '🔑 MUDAR CHAVE PIX MANUAL':
            adminStates[chatId] = { action: 'change_pix_manual_key' };
            await sendMessage(chatId, '🔑 Envie a nova chave PIX:');
            break;
        case '👤 MUDAR NOME TITULAR PIX':
            adminStates[chatId] = { action: 'change_pix_manual_name' };
            await sendMessage(chatId, '👤 Envie o nome do titular:');
            break;
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
        case '🛑 MANUTENÇÃO':
            const currentMode = await getSetting('maintenance_mode', 'off');
            const newMode = currentMode === 'on' ? 'off' : 'on';
            await updateSetting('maintenance_mode', newMode);
            await sendMessage(chatId, `🛑 Manutenção: ${newMode.toUpperCase()}`);
            await showGeneralConfig(chatId);
            break;
        case '➕ ADICIONAR ADM':
            adminStates[chatId] = { action: 'add_admin' };
            await sendMessage(chatId, '➕ Envie o número (55XXXXXXXXXXX):');
            break;
        case '➖ REMOVER ADM':
            adminStates[chatId] = { action: 'remove_admin' };
            await sendMessage(chatId, '➖ Envie o número:');
            break;
        case '📋 LISTA DE ADM':
            const admins = User.findAll().filter(u => u.is_admin);
            let adminMsg = '📋 *ADMINS:*\n\n';
            for (const a of admins) adminMsg += `👤 ${a.phone} ${a.is_owner ? '(Dono)' : ''}\n`;
            await sendMessage(chatId, adminMsg);
            break;
        case '🔄 SISTEMA DE INDICAÇÃO':
            const refSystem = await getSetting('referral_system', 'on');
            const newRef = refSystem === 'on' ? 'off' : 'on';
            await updateSetting('referral_system', newRef);
            await sendMessage(chatId, `🔄 Indicação: ${newRef.toUpperCase()}`);
            await showAffiliatesConfig(chatId);
            break;
        case '⭐ PONTOS POR RECARGA':
            adminStates[chatId] = { action: 'change_ref_points' };
            await sendMessage(chatId, '⭐ Envie os pontos por recarga:');
            break;
        case '📊 PONTOS MINIMO PARA CONVERTER':
            adminStates[chatId] = { action: 'change_ref_min_points' };
            await sendMessage(chatId, '📊 Envie os pontos mínimos:');
            break;
        case '✖️ MULTIPLICADOR PARA CONVERTER':
            adminStates[chatId] = { action: 'change_ref_multiplier' };
            await sendMessage(chatId, '✖️ Envie o multiplicador:');
            break;
        case '📢 TRANSMITIR A TODOS':
            adminStates[chatId] = { action: 'broadcast' };
            await sendMessage(chatId, '📢 Envie a mensagem:');
            break;
        case '🔍 PESQUISAR USUÁRIO':
            adminStates[chatId] = { action: 'search_user' };
            await sendMessage(chatId, '🔍 Envie o número:');
            break;
        case '🎁 BÔNUS DE REGISTRO':
            adminStates[chatId] = { action: 'change_registration_bonus' };
            await sendMessage(chatId, '🎁 Envie o valor:');
            break;
        case '🔑 MUDAR TOKEN':
            adminStates[chatId] = { action: 'change_mp_token' };
            await sendMessage(chatId, '🔑 Envie o token:');
            break;
        case '⬇️ MUDAR DEPÓSITO MIN':
            adminStates[chatId] = { action: 'change_min_deposit' };
            await sendMessage(chatId, '⬇️ Envie o valor mínimo:');
            break;
        case '⬆️ MUDAR DEPÓSITO MAX':
            adminStates[chatId] = { action: 'change_max_deposit' };
            await sendMessage(chatId, '⬆️ Envie o valor máximo:');
            break;
        case '⏰ MUDAR TEMPO DE EXPIRAÇÃO':
            adminStates[chatId] = { action: 'change_pix_expiration' };
            await sendMessage(chatId, '⏰ Envie o tempo em minutos:');
            break;
        case '🎁 MUDAR BÔNUS':
            adminStates[chatId] = { action: 'change_pix_bonus' };
            await sendMessage(chatId, '🎁 Envie a % de bônus:');
            break;
        case '📊 MUDAR MIN PARA BÔNUS':
            adminStates[chatId] = { action: 'change_pix_bonus_min' };
            await sendMessage(chatId, '📊 Envie o valor mínimo:');
            break;
        case '➕ ADICIONAR LOGIN':
            adminStates[chatId] = { action: 'add_logins' };
            await sendMessage(chatId, '➕ Envie: NOME===VALOR===DESCRICAO===EMAIL===SENHA===DURACAO');
            break;
        case '➖ REMOVER LOGIN':
            adminStates[chatId] = { action: 'remove_login' };
            await sendMessage(chatId, '➖ Envie: PLATAFORMA===EMAIL');
            break;
        case '🗑️ REMOVER POR PLATAFORMA':
            adminStates[chatId] = { action: 'remove_by_platform' };
            await sendMessage(chatId, '🗑️ Envie o nome da plataforma:');
            break;
        case '📦 ESTOQUE DETALHADO':
            const stock = Product.getDetailedStock();
            let stockMsg = '📦 *ESTOQUE:*\n\n';
            for (const s of stock) stockMsg += `📌 ${s.platform}: ${s.total_stock} logins\n`;
            stockMsg += `\n📦 Total: ${Product.countStock()} logins`;
            await sendMessage(chatId, stockMsg);
            break;
        case '💣 ZERAR ESTOQUE':
            Product.deleteAll();
            await sendMessage(chatId, '💣 Estoque zerado!');
            break;
        case '💰 MUDAR VALOR DO SERVIÇO':
            adminStates[chatId] = { action: 'change_service_value' };
            await sendMessage(chatId, '💰 Envie: SERVICO===VALOR');
            break;
        case '💎 MUDAR VALOR DE TODOS':
            adminStates[chatId] = { action: 'change_all_values' };
            await sendMessage(chatId, '💎 Envie o novo valor:');
            break;
        case '🖼️ ADICIONAR IMAGEM':
            adminStates[chatId] = { action: 'add_service_image' };
            await sendMessage(chatId, '🖼️ Envie: PLATAFORMA===URL');
            break;
        case '🗑️ REMOVER IMAGEM':
            adminStates[chatId] = { action: 'remove_service_image' };
            await sendMessage(chatId, '🗑️ Envie o nome da plataforma:');
            break;
        case '👤 PERFIL':
            await showProfile(chatId, user);
            break;
        case '📞 SUPORTE':
            const supportLink = await getSetting('support_link', '');
            await sendMessage(chatId, `📞 Suporte: ${supportLink || 'Não configurado'}`);
            break;
        case '🤖 ALUGAR BOT':
            await sendMessage(chatId, '🤖 Quer seu próprio bot? Entre em contato!');
            break;
        case '🔍 PESQUISAR SERVIÇO':
            adminStates[chatId] = { action: 'search_service_admin' };
            await sendMessage(chatId, '🔍 Envie o nome do serviço:');
            break;
    }
}

async function handleStateInput(chatId, text, telegramId) {
    const state = adminStates[chatId];
    if (!state || !state.action) return;

    switch (state.action) {
        case 'change_support': await updateSetting('support_link', text); await sendMessage(chatId, '✅ Suporte atualizado!'); break;
        case 'change_separator': await updateSetting('separator', text); await sendMessage(chatId, '✅ Separador atualizado!'); break;
        case 'change_log_dest': await updateSetting('log_destination', text); await sendMessage(chatId, '✅ Log destino atualizado!'); break;
        case 'add_admin':
            const newAdmin = User.findByPhone(text);
            if (newAdmin) { const db = require('../../database/connection').getDatabase(); db.prepare('UPDATE users SET is_admin = 1 WHERE phone = ?').run(text); await sendMessage(chatId, `✅ ${text} agora é admin!`); }
            else await sendMessage(chatId, '❌ Usuário não encontrado!');
            break;
        case 'remove_admin':
            const admin = User.findByPhone(text);
            if (admin && !admin.is_owner) { const db = require('../../database/connection').getDatabase(); db.prepare('UPDATE users SET is_admin = 0 WHERE phone = ?').run(text); await sendMessage(chatId, `✅ ${text} removido!`); }
            else await sendMessage(chatId, '❌ Não é possível remover!');
            break;
        case 'edit_user_balance':
            const editParts = text.split('===');
            if (editParts.length >= 2) {
                const editPhone = editParts[0].trim();
                const editAmount = parseFloat(editParts[1].replace(',', '.'));
                const editUser = User.findByPhone(editPhone);
                if (editUser && !isNaN(editAmount)) { User.updateBalance(editPhone, editAmount); const updated = User.findByPhone(editPhone); await sendMessage(chatId, `✅ Saldo atualizado!\n💰 Saldo: R$ ${parseFloat(updated.balance).toFixed(2)}`); }
                else await sendMessage(chatId, '❌ Usuário não encontrado ou valor inválido!');
            } else await sendMessage(chatId, '❌ Formato inválido! Use: NUMERO===VALOR');
            break;
        case 'block_user':
            const blockUser = User.findByPhone(text.trim());
            if (blockUser) { const dbBlock = require('../../database/connection').getDatabase(); dbBlock.prepare('UPDATE users SET is_blocked = 1 WHERE phone = ?').run(text.trim()); try { const { sendTextMessage } = require('../../services/whatsapp'); await sendTextMessage(text.trim(), '⛔ Você foi bloqueado!'); } catch (e) {} await sendMessage(chatId, `✅ ${text.trim()} bloqueado!`); }
            else await sendMessage(chatId, '❌ Usuário não encontrado!');
            break;
        case 'unblock_user':
            const unblockUser = User.findByPhone(text.trim());
            if (unblockUser) { const dbUnblock = require('../../database/connection').getDatabase(); dbUnblock.prepare('UPDATE users SET is_blocked = 0 WHERE phone = ?').run(text.trim()); try { const { sendTextMessage } = require('../../services/whatsapp'); await sendTextMessage(text.trim(), '✅ Você foi desbloqueado!'); } catch (e) {} await sendMessage(chatId, `✅ ${text.trim()} desbloqueado!`); }
            else await sendMessage(chatId, '❌ Usuário não encontrado!');
            break;
        case 'change_pix_manual_key': await updateSetting('pix_manual_key', text); await sendMessage(chatId, '✅ Chave PIX manual atualizada!'); break;
        case 'change_pix_manual_name': await updateSetting('pix_manual_name', text); await sendMessage(chatId, '✅ Nome do titular atualizado!'); break;
        case 'change_ref_points': await updateSetting('referral_points_per_recharge', text); await sendMessage(chatId, '✅ Pontos atualizados!'); break;
        case 'change_ref_min_points': await updateSetting('referral_min_points', text); await sendMessage(chatId, '✅ Pontos mínimos atualizados!'); break;
        case 'change_ref_multiplier': await updateSetting('referral_multiplier', text); await sendMessage(chatId, '✅ Multiplicador atualizado!'); break;
        case 'change_registration_bonus': await updateSetting('registration_bonus', text); await sendMessage(chatId, '✅ Bônus atualizado!'); break;
        case 'change_mp_token': await updateSetting('mercadopago_token', text); await sendMessage(chatId, '✅ Token atualizado!'); break;
        case 'change_min_deposit': await updateSetting('pix_min_deposit', text); await sendMessage(chatId, '✅ Depósito mín atualizado!'); break;
        case 'change_max_deposit': await updateSetting('pix_max_deposit', text); await sendMessage(chatId, '✅ Depósito máx atualizado!'); break;
        case 'change_pix_expiration': await updateSetting('pix_expiration', text); await sendMessage(chatId, '✅ Expiração atualizada!'); break;
        case 'change_pix_bonus': await updateSetting('pix_bonus', text); await sendMessage(chatId, '✅ Bônus atualizado!'); break;
        case 'change_pix_bonus_min': await updateSetting('pix_bonus_min', text); await sendMessage(chatId, '✅ Mínimo bônus atualizado!'); break;
        case 'broadcast':
            const users = User.findActiveUsers();
            let sent = 0;
            for (const u of users) { try { const { sendTextMessage } = require('../../services/whatsapp'); await sendTextMessage(u.phone, `📢 *COMUNICADO:*\n\n${text}`); sent++; } catch (e) {} }
            await sendMessage(chatId, `📢 Enviado para ${sent} usuários!`);
            break;
        case 'search_user':
            const foundUser = User.findByPhone(text);
            if (foundUser) { const msg = `👤 *USUÁRIO*\n\n📞 ${foundUser.phone}\n💰 Saldo: R$ ${parseFloat(foundUser.balance).toFixed(2)}\n⭐ Pontos: ${foundUser.referral_points}\n👥 Indicados: ${foundUser.total_referrals}\n🚫 Bloqueado: ${foundUser.is_blocked ? 'Sim' : 'Não'}`; await sendMessage(chatId, msg); }
            else await sendMessage(chatId, '❌ Não encontrado!');
            break;
        case 'add_logins':
            const lines = text.split('\n'); let added = 0;
            for (const line of lines) { const parts = line.split('==='); if (parts.length >= 6) { Product.create(parts[0], parseFloat(parts[1]), parts[2], parts[3], parts[4], parts[5], parts[0], 1); added++; } }
            await sendMessage(chatId, `✅ ${added} logins adicionados!`);
            break;
        case 'remove_login': const removeParts = text.split('==='); if (removeParts.length >= 2) { Product.deleteByEmailPlatform(removeParts[1], removeParts[0]); await sendMessage(chatId, '✅ Login removido!'); } break;
        case 'remove_by_platform': Product.deleteByPlatform(text); await sendMessage(chatId, `✅ Plataforma ${text} removida!`); break;
        case 'change_service_value': const valueParts = text.split('==='); if (valueParts.length >= 2) { const db = require('../../database/connection').getDatabase(); db.prepare('UPDATE products SET value = ? WHERE platform = ?').run(valueParts[1], valueParts[0]); await sendMessage(chatId, '✅ Valor atualizado!'); } break;
        case 'change_all_values': Product.updateAllValues(parseFloat(text)); await sendMessage(chatId, '✅ Todos valores atualizados!'); break;
        case 'add_service_image': const imgParts = text.split('==='); if (imgParts.length >= 2) { const db = require('../../database/connection').getDatabase(); db.prepare('INSERT INTO service_images (platform, image_url) VALUES (?, ?)').run(imgParts[0], imgParts[1]); await sendMessage(chatId, '✅ Imagem adicionada!'); } break;
        case 'remove_service_image': const dbImg = require('../../database/connection').getDatabase(); dbImg.prepare('DELETE FROM service_images WHERE platform = ?').run(text); await sendMessage(chatId, '✅ Imagem removida!'); break;
        case 'search_service_admin': const products = Product.findByPlatform(text.toUpperCase()); if (products.length > 0) { let resultMsg = `🔍 *${text.toUpperCase()}*\n\n`; for (const p of products) resultMsg += `📌 ${p.name} - R$ ${parseFloat(p.value).toFixed(2)} - Estoque: ${p.stock}\n`; await sendMessage(chatId, resultMsg); } else await sendMessage(chatId, '❌ Nenhum serviço encontrado!'); break;
        case 'create_giftcard': const giftAmount = parseFloat(text); if (isNaN(giftAmount) || giftAmount <= 0) { await sendMessage(chatId, '❌ Valor inválido!'); } else { const giftCode = `GIFT-ADM-${Date.now().toString(36).toUpperCase()}`; const dbGift = require('../../database/connection').getDatabase(); dbGift.run(`CREATE TABLE IF NOT EXISTS giftcards (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, amount DECIMAL(10,2) NOT NULL, buyer_phone TEXT, redeemer_phone TEXT, is_redeemed BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, redeemed_at DATETIME)`); dbGift.prepare('INSERT INTO giftcards (code, amount, buyer_phone) VALUES (?, ?, ?)').run(giftCode, giftAmount, 'ADMIN'); await sendMessage(chatId, `✅ Gift Card criado!\n\n🎁 Código: *${giftCode}*\n💰 Valor: R$ ${giftAmount.toFixed(2)}`); } break;
        case 'admin_activate_vip': const vipUser = User.findByPhone(text); if (vipUser) { const dbVip = require('../../database/connection').getDatabase(); dbVip.run(`CREATE TABLE IF NOT EXISTS vips (id INTEGER PRIMARY KEY AUTOINCREMENT, user_phone TEXT UNIQUE, is_vip BOOLEAN DEFAULT 0, plan_type TEXT DEFAULT 'mensal', price DECIMAL(10,2) DEFAULT 0, start_date DATETIME DEFAULT CURRENT_TIMESTAMP, expiration_date DATETIME, is_active BOOLEAN DEFAULT 1)`); const expDate = new Date(); expDate.setDate(expDate.getDate() + 30); const existingVip = dbVip.prepare('SELECT * FROM vips WHERE user_phone = ?').get(text); if (existingVip) dbVip.prepare('UPDATE vips SET is_vip = 1, is_active = 1, expiration_date = ? WHERE user_phone = ?').run(expDate.toISOString(), text); else dbVip.prepare('INSERT INTO vips (user_phone, is_vip, plan_type, price, expiration_date) VALUES (?, 1, ?, 0, ?)').run(text, 'Admin', expDate.toISOString()); await sendMessage(chatId, `✅ VIP ativado para ${text}!`); } else await sendMessage(chatId, '❌ Usuário não encontrado!'); break;
        case 'admin_remove_vip': const dbVipRem = require('../../database/connection').getDatabase(); dbVipRem.run(`CREATE TABLE IF NOT EXISTS vips (id INTEGER PRIMARY KEY AUTOINCREMENT, user_phone TEXT UNIQUE, is_vip BOOLEAN DEFAULT 0, plan_type TEXT DEFAULT 'mensal', price DECIMAL(10,2) DEFAULT 0, start_date DATETIME DEFAULT CURRENT_TIMESTAMP, expiration_date DATETIME, is_active BOOLEAN DEFAULT 1)`); dbVipRem.prepare('UPDATE vips SET is_active = 0 WHERE user_phone = ?').run(text); await sendMessage(chatId, `✅ VIP removido de ${text}!`); break;
    }

    delete adminStates[chatId];
    setTimeout(() => { const user = User.findByTelegramId(telegramId); if (user) showMainMenu(chatId, user); }, 1000);
}

async function showDashboard(chatId) {
    const usersCount = User.count();
    const totalRevenue = Transaction.totalSales();
    const monthlyRevenue = Transaction.salesThisMonth();
    const todayRevenue = Transaction.depositsToday() + Transaction.salesToday();
    const totalSales = Transaction.count();
    const todaySales = Transaction.countToday();
    const message = `📊 *DASHBOARD*\n\n👥 Users: ${usersCount}\n💰 Receita total: R$ ${totalRevenue.toFixed(2)}\n📅 Receita mensal: R$ ${monthlyRevenue.toFixed(2)}\n📆 Receita hoje: R$ ${todayRevenue.toFixed(2)}\n🛒 Vendas total: ${totalSales}\n🛍️ Vendas hoje: ${todaySales}\n\nUse os botões:`;
    await sendMenu(chatId, message, getAdminDashboardButtons());
}

async function showConfigMenu(chatId) { await sendMenu(chatId, '⚙️ *CONFIGURAÇÕES*\n\nEscolha:', getAdminConfigButtons()); }

async function showGeneralConfig(chatId) {
    const supportLink = await getSetting('support_link', '');
    const separator = await getSetting('separator', '===');
    const logDest = await getSetting('log_destination', '');
    const maintenance = await getSetting('maintenance_mode', 'off');
    const msg = `📝 *CONFIGURAÇÕES GERAIS*\n\n📞 Suporte: ${supportLink || 'Não configurado'}\n🔣 Separador: ${separator}\n📋 Log: ${logDest || 'Não configurado'}\n🛑 Manutenção: ${maintenance.toUpperCase()}\n\nUse os botões:`;
    await sendMenu(chatId, msg, getAdminGeneralConfigButtons());
}

async function showAdminsConfig(chatId) { const admins = User.findAll().filter(u => u.is_admin); await sendMenu(chatId, `👥 *ADMINS*\n\nTotal: ${admins.length}\n\nUse os botões:`, getAdminAdminsButtons()); }

async function showAffiliatesConfig(chatId) {
    const refSystem = await getSetting('referral_system', 'on');
    const points = await getSetting('referral_points_per_recharge', '10');
    const minPoints = await getSetting('referral_min_points', '500');
    const multiplier = await getSetting('referral_multiplier', '0.01');
    const msg = `🔗 *AFILIADOS*\n\n🔄 Sistema: ${refSystem === 'on' ? '✅ ON' : '❌ OFF'}\n⭐ Pontos/recarga: ${points}\n📊 Mínimo: ${minPoints}\n✖️ Multiplicador: ${multiplier}\n\nUse os botões:`;
    await sendMenu(chatId, msg, getAdminAffiliatesButtons());
}

async function showUsersConfig(chatId) { const bonus = await getSetting('registration_bonus', '0.00'); await sendMenu(chatId, `👤 *USUÁRIOS*\n\n🎁 Bônus registro: R$ ${bonus}\n\nUse os botões:`, getAdminUsersButtons()); }

async function showPixConfig(chatId) {
    const pixMode = await getSetting('pix_mode', 'automatico');
    const token = await getSetting('mercadopago_token', '');
    const manualKey = await getSetting('pix_manual_key', '');
    const manualName = await getSetting('pix_manual_name', '');
    const minDep = await getSetting('pix_min_deposit', '1.00');
    const maxDep = await getSetting('pix_max_deposit', '150.00');
    const expiration = await getSetting('pix_expiration', '15');
    const bonus = await getSetting('pix_bonus', '0');
    const bonusMin = await getSetting('pix_bonus_min', '0.00');
    const msg = `💠 *PIX*\n\nModo: ${pixMode === 'manual' ? '🔴 MANUAL' : '🟢 AUTOMÁTICO'}\n🔑 Token: ${token ? token.substring(0, 15) + '...' : 'Não configurado'}\n🔑 Chave Manual: ${manualKey || 'Não configurada'}\n👤 Titular: ${manualName || 'Não configurado'}\n⬇️ Mín: R$ ${minDep}\n⬆️ Máx: R$ ${maxDep}\n⏰ Expiração: ${expiration} min\n🎁 Bônus: ${bonus}%\n📊 Min bônus: R$ ${bonusMin}\n\nUse os botões:`;
    await sendMenu(chatId, msg, getAdminPixButtons());
}

async function showLoginsConfig(chatId) { const count = Product.countStock(); await sendMenu(chatId, `🔐 *LOGINS*\n\n📦 Estoque: ${count}\n\nUse os botões:`, getAdminLoginsButtons()); }

async function showSearchConfig(chatId) { const db = require('../../database/connection').getDatabase(); const images = db.prepare('SELECT COUNT(*) as total FROM service_images').get().total; await sendMenu(chatId, `🔍 *PESQUISA*\n\n🖼️ Imagens: ${images}\n\nUse os botões:`, getAdminSearchButtons()); }

async function showGiftCardsMenu(chatId) {
    const db = require('../../database/connection').getDatabase();
    db.run(`CREATE TABLE IF NOT EXISTS giftcards (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, amount DECIMAL(10,2) NOT NULL, buyer_phone TEXT, redeemer_phone TEXT, is_redeemed BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, redeemed_at DATETIME)`);
    const total = db.prepare('SELECT COUNT(*) as total FROM giftcards').get().total;
    const totalValue = db.prepare('SELECT SUM(amount) as total FROM giftcards').get().total || 0;
    await sendMenu(chatId, `🎁 *GIFT CARDS*\n\n📦 Total: ${total}\n💰 Valor total: R$ ${parseFloat(totalValue).toFixed(2)}\n\nUse os botões:`, [['🎁 CRIAR GIFT CARD'], ['📋 LISTAR GIFT CARDS'], ['🔙 VOLTAR']]);
}

async function showGiftCardsList(chatId) { const db = require('../../database/connection').getDatabase(); const giftcards = db.prepare('SELECT * FROM giftcards ORDER BY created_at DESC LIMIT 20').all(); let msg = '📋 *GIFT CARDS*\n\n'; for (const g of giftcards) msg += `🎁 ${g.code}\n💰 R$ ${parseFloat(g.amount).toFixed(2)}\n📌 ${g.is_redeemed ? '✅ Resgatado' : '⏳ Pendente'}\n━━━━━━\n`; await sendMessage(chatId, msg); }

async function showVipAdminMenu(chatId, user) { const db = require('../../database/connection').getDatabase(); db.run(`CREATE TABLE IF NOT EXISTS vips (id INTEGER PRIMARY KEY AUTOINCREMENT, user_phone TEXT UNIQUE, is_vip BOOLEAN DEFAULT 0, plan_type TEXT DEFAULT 'mensal', price DECIMAL(10,2) DEFAULT 0, start_date DATETIME DEFAULT CURRENT_TIMESTAMP, expiration_date DATETIME, is_active BOOLEAN DEFAULT 1)`); const totalVips = db.prepare('SELECT COUNT(*) as total FROM vips WHERE is_active = 1').get().total; await sendMenu(chatId, `👑 *VIP ADMIN*\n\n👥 Vips ativos: ${totalVips}\n\nUse os botões:`, [['👑 ATIVAR VIP USUÁRIO'], ['👑 REMOVER VIP USUÁRIO'], ['📋 LISTAR VIPS'], ['🔙 VOLTAR']]); }

async function showVipsList(chatId) { const db = require('../../database/connection').getDatabase(); const vips = db.prepare('SELECT * FROM vips WHERE is_active = 1').all(); let msg = '📋 *VIPS ATIVOS*\n\n'; for (const v of vips) msg += `👤 ${v.user_phone}\n📅 Venc: ${new Date(v.expiration_date).toLocaleDateString('pt-BR')}\n💰 R$ ${parseFloat(v.price).toFixed(2)}\n━━━━━━\n`; await sendMessage(chatId, msg); }

async function showProfile(chatId, user) { const msg = `👤 *PERFIL*\n\n📞 ${user.phone || 'N/A'}\n💰 Saldo: R$ ${parseFloat(user.balance || 0).toFixed(2)}\n⭐ Pontos: ${user.referral_points || 0}\n👥 Indicados: ${user.total_referrals || 0}\n👑 Admin: ${user.is_admin ? 'Sim' : 'Não'}\n🚫 Bloqueado: ${user.is_blocked ? 'Sim' : 'Não'}`; await sendMenu(chatId, msg, [['🏠 MENU INICIAL']]); }

async function handleCallbackQuery(bot, query) {}

module.exports = { handleAdminMessage, handleCallbackQuery };
