const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const logger = require('../../utils/logger');
const { formatarMoeda } = require('../../utils/helpers');

let adminBot = null;

async function startAdminBot() {
    adminBot = new TelegramBot(process.env.BOT_TOKEN_ADMIN, { polling: true });
    const adminIds = process.env.ADMIN_IDS.split(',').map(Number);
    
    adminBot.onText(/\/start/, (msg) => {
        if (!adminIds.includes(msg.from.id)) return;
        showDashboard(msg.chat.id);
    });
    
    adminBot.on('callback_query', async (q) => {
        if (!adminIds.includes(q.from.id)) return;
        adminBot.answerCallbackQuery(q.id);
        await router(q.message.chat.id, q.from.id, q.data, q.message.message_id);
    });
    
    logger.info('👑 Bot Admin online');
}

async function showDashboard(chatId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT COUNT(*) as t FROM clientes').get().t;
    const ped = db.prepare('SELECT COUNT(*) as t FROM pedidos').get().t;
    const fat = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM pedidos WHERE pagamento_status='approved'").get().t;
    
    await adminBot.sendMessage(chatId,
        `📊 *PAINEL ADMIN*\n\n👥 Clientes: ${cli}\n📦 Pedidos: ${ped}\n💰 Faturamento: ${formatarMoeda(fat)}`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
            [{ text: '📦 Produtos', callback_data: 'adm_produtos' }, { text: '📋 Pedidos', callback_data: 'adm_pedidos' }],
            [{ text: '👥 Clientes', callback_data: 'adm_clientes' }, { text: '🎟 Cupons', callback_data: 'adm_cupons' }],
            [{ text: '📊 Relatórios', callback_data: 'adm_relatorios' }, { text: '⚙️ Config', callback_data: 'adm_config' }]
        ]}}
    );
}

async function router(chatId, userId, data, msgId) {
    if (data === 'adm_produtos') return showProdutosAdmin(chatId, msgId);
    if (data === 'adm_pedidos') return showPedidosAdmin(chatId, msgId);
    if (data === 'adm_clientes') return showClientesAdmin(chatId, msgId);
    if (data === 'adm_voltar') return showDashboard(chatId);
}

async function showProdutosAdmin(chatId, msgId) {
    const db = getDatabase();
    const prods = db.prepare('SELECT p.*, c.nome as cn FROM produtos p LEFT JOIN categorias c ON p.categoria_id=c.id ORDER BY p.nome').all();
    const kb = { inline_keyboard: [] };
    for (const p of prods) kb.inline_keyboard.push([{ text: `${p.disponivel?'✅':'❌'} ${p.nome} - ${formatarMoeda(p.preco)}`, callback_data: `adm_prod_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, '📦 *PRODUTOS*', kb);
}

async function showPedidosAdmin(chatId, msgId) {
    const db = getDatabase();
    const peds = db.prepare('SELECT p.*, c.nome FROM pedidos p JOIN clientes c ON p.cliente_id=c.id ORDER BY p.data_pedido DESC LIMIT 20').all();
    const kb = { inline_keyboard: [] };
    for (const p of peds) kb.inline_keyboard.push([{ text: `${p.numero} - ${p.nome} - ${formatarMoeda(p.total)}`, callback_data: `adm_ped_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, '📋 *PEDIDOS*', kb);
}

async function showClientesAdmin(chatId, msgId) {
    const db = getDatabase();
    const clis = db.prepare('SELECT * FROM clientes ORDER BY total_gasto DESC LIMIT 30').all();
    const kb = { inline_keyboard: [] };
    for (const c of clis) kb.inline_keyboard.push([{ text: `${c.nome||'Sem nome'} - ${formatarMoeda(c.total_gasto)}`, callback_data: `adm_cli_${c.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, '👥 *CLIENTES*', kb);
}

async function editOrSend(chatId, msgId, text, kb) {
    try {
        if (msgId) await adminBot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb });
        else await adminBot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
    } catch (e) { await adminBot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb }); }
}

module.exports = { startAdminBot };
