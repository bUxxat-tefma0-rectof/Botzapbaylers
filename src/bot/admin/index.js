const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const logger = require('../../utils/logger');
const { formatarMoeda, formatarData } = require('../../utils/helpers');
const DashboardAdmin = require('./dashboard');
const ProdutosAdmin = require('./produtos');
const PedidosAdmin = require('./pedidos');
const ClientesAdmin = require('./clientes');
const PromocoesAdmin = require('./promocoes');
const CuponsAdmin = require('./cupons');
const RelatoriosAdmin = require('./relatorios');
const ConfigAdmin = require('./config');

let adminBot = null;
const estadosAdmin = new Map();

async function startAdminBot() {
    adminBot = new TelegramBot(process.env.BOT_TOKEN_ADMIN, { polling: true });
    const adminIds = process.env.ADMIN_IDS.split(',').map(Number);
    
    adminBot.onText(/\/start/, (msg) => {
        if (!adminIds.includes(msg.from.id)) return;
        showDashboard(msg.chat.id, msg.from.id);
    });
    
    adminBot.on('callback_query', async (q) => {
        if (!adminIds.includes(q.from.id)) return;
        adminBot.answerCallbackQuery(q.id);
        await router(q.message.chat.id, q.from.id, q.data, q.message.message_id);
    });
    
    adminBot.on('message', async (msg) => {
        if (!adminIds.includes(msg.from.id)) return;
        if (!msg.text || msg.text.startsWith('/')) return;
        const est = estadosAdmin.get(msg.from.id);
        if (est && est.aguardando) await handleTextInput(msg.chat.id, msg.from.id, msg.text);
    });
    
    logger.info('👑 Bot Admin completo online');
}

async function showDashboard(chatId, userId) {
    const stats = await DashboardAdmin.getEstatisticas();
    
    const msg = `📊 *PAINEL ADMINISTRATIVO*\n\n` +
        `👥 Clientes: *${stats.clientes.total}* (${stats.clientes.ativos} ativos)\n` +
        `📦 Pedidos: *${stats.pedidos.total}* (${stats.pedidos.pendentes} pendentes)\n` +
        `🕐 Hoje: *${stats.pedidos.hoje}*\n` +
        `💰 Faturamento: *${stats.faturamento.total}*\n` +
        `📅 Mês: *${stats.faturamento.mes}*\n` +
        `🎯 Ticket Médio: *${stats.ticketMedio}*\n\n` +
        `⚠️ Estoque Baixo: *${stats.produtos.estoqueBaixo}* produtos\n\n` +
        `Selecione uma opção:`;
    
    const kb = { inline_keyboard: [
        [{ text: '📦 Produtos', callback_data: 'adm_produtos' }, { text: '📂 Categorias', callback_data: 'adm_categorias' }],
        [{ text: '📋 Pedidos', callback_data: 'adm_pedidos' }, { text: '👥 Clientes', callback_data: 'adm_clientes' }],
        [{ text: '🎉 Promoções', callback_data: 'adm_promocoes' }, { text: '🎟 Cupons', callback_data: 'adm_cupons' }],
        [{ text: '📊 Relatórios', callback_data: 'adm_relatorios' }, { text: '⚙️ Configurações', callback_data: 'adm_config' }],
        [{ text: '📢 Broadcast', callback_data: 'adm_broadcast' }, { text: '🔄 Atualizar', callback_data: 'adm_refresh' }]
    ]};
    
    await editOrSend(chatId, null, msg, kb);
}

async function router(chatId, userId, data, msgId) {
    if (data === 'adm_refresh') return showDashboard(chatId, userId);
    if (data === 'adm_voltar') return showDashboard(chatId, userId);
    
    if (data.startsWith('adm_produtos') || data.startsWith('adm_prod_')) return handleProdutos(chatId, userId, data, msgId);
    if (data.startsWith('adm_pedidos') || data.startsWith('adm_ped_')) return handlePedidos(chatId, userId, data, msgId);
    if (data.startsWith('adm_clientes') || data.startsWith('adm_cli_')) return handleClientes(chatId, userId, data, msgId);
    if (data.startsWith('adm_promocoes') || data.startsWith('adm_promo_')) return handlePromocoes(chatId, userId, data, msgId);
    if (data.startsWith('adm_cupons') || data.startsWith('adm_cupom_')) return handleCupons(chatId, userId, data, msgId);
    if (data.startsWith('adm_relatorios') || data.startsWith('adm_rel_')) return handleRelatorios(chatId, userId, data, msgId);
    if (data.startsWith('adm_config') || data.startsWith('adm_cfg_')) return handleConfig(chatId, userId, data, msgId);
    
    if (data === 'adm_broadcast') {
        estadosAdmin.set(userId, { aguardando: 'broadcast' });
        return editOrSend(chatId, msgId, '📢 Digite a mensagem para enviar a TODOS os clientes:', backButton('adm_voltar'));
    }
}

// Handlers para cada módulo
async function handleProdutos(chatId, userId, data, msgId) {
    if (data === 'adm_produtos') {
        const { produtos, total, pagina, totalPaginas } = await ProdutosAdmin.listar();
        const kb = { inline_keyboard: [] };
        for (const p of produtos) {
            kb.inline_keyboard.push([{ text: `${p.disponivel?'✅':'❌'} ${p.nome} - ${formatarMoeda(p.preco)} (Estoque: ${p.estoque})`, callback_data: `adm_prod_edit_${p.id}` }]);
        }
        kb.inline_keyboard.push([{ text: '➕ Novo Produto', callback_data: 'adm_prod_novo' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        await editOrSend(chatId, msgId, `📦 *PRODUTOS* (${total})\n\nSelecione para editar:`, kb);
    }
}

async function handlePedidos(chatId, userId, data, msgId) {
    if (data === 'adm_pedidos') {
        const { pedidos, total } = await PedidosAdmin.listar('pendentes');
        const kb = { inline_keyboard: [] };
        for (const p of pedidos) {
            kb.inline_keyboard.push([{ text: `${p.numero} - ${p.cliente_nome} - ${formatarMoeda(p.total)} - ${p.status}`, callback_data: `adm_ped_ver_${p.id}` }]);
        }
        kb.inline_keyboard.push([{ text: '📋 Todos', callback_data: 'adm_ped_todos' }, { text: '🛵 Em Entrega', callback_data: 'adm_ped_entrega' }]);
        kb.inline_keyboard.push([{ text: '✅ Entregues', callback_data: 'adm_ped_entregues' }, { text: '❌ Cancelados', callback_data: 'adm_ped_cancelados' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        await editOrSend(chatId, msgId, `📋 *PEDIDOS PENDENTES* (${total})\n\nSelecione:`, kb);
    }
}

async function handleClientes(chatId, userId, data, msgId) {
    if (data === 'adm_clientes') {
        const { clientes, total } = await ClientesAdmin.listar();
        const kb = { inline_keyboard: [] };
        for (const c of clientes) {
            kb.inline_keyboard.push([{ text: `${c.nome||'Sem nome'} - ${formatarMoeda(c.total_gasto)} (${c.total_pedidos} pedidos)`, callback_data: `adm_cli_ver_${c.id}` }]);
        }
        kb.inline_keyboard.push([{ text: '🔍 Buscar', callback_data: 'adm_cli_buscar' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        await editOrSend(chatId, msgId, `👥 *CLIENTES* (${total})\n\nSelecione:`, kb);
    }
}

async function handlePromocoes(chatId, userId, data, msgId) {
    if (data === 'adm_promocoes') {
        const promos = await PromocoesAdmin.listar();
        const kb = { inline_keyboard: [] };
        for (const p of promos) {
            kb.inline_keyboard.push([{ text: `${p.ativo?'✅':'❌'} ${p.nome} - ${p.alvo_nome}`, callback_data: `adm_promo_toggle_${p.id}` }]);
        }
        kb.inline_keyboard.push([{ text: '➕ Nova Promoção', callback_data: 'adm_promo_nova' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        await editOrSend(chatId, msgId, '🎉 *PROMOÇÕES*\n\nSelecione para ativar/desativar:', kb);
    }
}

async function handleCupons(chatId, userId, data, msgId) {
    if (data === 'adm_cupons') {
        const cupons = await CuponsAdmin.listar();
        const kb = { inline_keyboard: [] };
        for (const c of cupons) {
            kb.inline_keyboard.push([{ text: `${c.ativo?'✅':'❌'} ${c.codigo} - ${c.valor}${c.tipo==='percentual'?'%':'R$'}`, callback_data: `adm_cupom_toggle_${c.id}` }]);
        }
        kb.inline_keyboard.push([{ text: '➕ Novo Cupom', callback_data: 'adm_cupom_novo' }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
        await editOrSend(chatId, msgId, '🎟 *CUPONS*\n\nSelecione:', kb);
    }
}

async function handleRelatorios(chatId, userId, data, msgId) {
    if (data === 'adm_relatorios') {
        const stats = await DashboardAdmin.getEstatisticas();
        const kb = { inline_keyboard: [
            [{ text: '📊 Vendas', callback_data: 'adm_rel_vendas' }, { text: '📦 Produtos', callback_data: 'adm_rel_produtos' }],
            [{ text: '👥 Clientes', callback_data: 'adm_rel_clientes' }, { text: '💰 Financeiro', callback_data: 'adm_rel_financeiro' }],
            [{ text: '📄 Exportar PDF', callback_data: 'adm_rel_pdf' }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]
        ]};
        await editOrSend(chatId, msgId, `📊 *RELATÓRIOS*\n\n💰 Faturamento: ${stats.faturamento.total}\n📦 Pedidos: ${stats.pedidos.total}\n👥 Clientes: ${stats.clientes.total}`, kb);
    }
}

async function handleConfig(chatId, userId, data, msgId) {
    if (data === 'adm_config') {
        const configs = await ConfigAdmin.getTodas();
        const kb = { inline_keyboard: [
            [{ text: '🏪 Dados do Mercado', callback_data: 'adm_cfg_mercado' }],
            [{ text: '🚚 Entregas', callback_data: 'adm_cfg_entregas' }],
            [{ text: '🕐 Horários', callback_data: 'adm_cfg_horarios' }],
            [{ text: '💳 PIX', callback_data: 'adm_cfg_pix' }],
            [{ text: '💬 Mensagens', callback_data: 'adm_cfg_msgs' }],
            [{ text: '🎨 Tema', callback_data: 'adm_cfg_tema' }],
            [{ text: '💾 Backup', callback_data: 'adm_cfg_backup' }],
            [{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]
        ]};
        await editOrSend(chatId, msgId, `⚙️ *CONFIGURAÇÕES*\n\n🏪 ${configs.nome_mercado || process.env.NOME_MERCADO || 'Supermercado'}\n🚚 Taxa: ${formatarMoeda(parseFloat(configs.taxa_entrega_padrao||5))}\n💰 Mínimo: ${formatarMoeda(parseFloat(configs.pedido_minimo||30))}`, kb);
    }
}

async function handleTextInput(chatId, userId, texto) {
    const est = estadosAdmin.get(userId);
    if (!est || !est.aguardando) return;
    
    if (est.aguardando === 'broadcast') {
        const db = getDatabase();
        const clientes = db.prepare('SELECT telegram_id FROM clientes WHERE bloqueado = 0').all();
        const clientBot = require('../cliente/index').getBot();
        let enviados = 0;
        
        for (const c of clientes) {
            try {
                if (clientBot) await clientBot.sendMessage(c.telegram_id, `📢 *${process.env.NOME_MERCADO || 'Supermercado'}*\n\n${texto}`, { parse_mode: 'Markdown' });
                enviados++;
            } catch (e) {}
        }
        
        est.aguardando = null;
        estadosAdmin.set(userId, est);
        await adminBot.sendMessage(chatId, `✅ Mensagem enviada para ${enviados} clientes!`);
    }
    
    if (est.aguardando === 'novo_produto') {
        const partes = texto.split(',').map(p => p.trim());
        if (partes.length < 4) return adminBot.sendMessage(chatId, '❌ Formato: Nome, Categoria ID, Preço, Estoque, Descrição');
        
        const result = await ProdutosAdmin.criar({
            nome: partes[0], categoria_id: parseInt(partes[1]),
            preco: parseFloat(partes[2]), estoque: parseInt(partes[3]),
            descricao: partes[4] || ''
        });
        
        est.aguardando = null;
        estadosAdmin.set(userId, est);
        await adminBot.sendMessage(chatId, result.mensagem);
    }
    
    if (est.aguardando === 'novo_cupom') {
        const partes = texto.split(',').map(p => p.trim());
        if (partes.length < 4) return adminBot.sendMessage(chatId, '❌ Formato: Código, Tipo (percentual/fixo), Valor, Usos, Dias Validade');
        
        const result = await CuponsAdmin.criar({
            codigo: partes[0], tipo: partes[1], valor: parseFloat(partes[2]),
            uso_maximo: parseInt(partes[3]), dias_validade: parseInt(partes[4]) || 30
        });
        
        est.aguardando = null;
        estadosAdmin.set(userId, est);
        await adminBot.sendMessage(chatId, result.mensagem);
    }
}

function backButton(data) {
    return { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: data }]] };
}

async function editOrSend(chatId, msgId, text, kb) {
    try {
        if (msgId) await adminBot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb });
        else await adminBot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
    } catch (e) { await adminBot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb }); }
}

module.exports = { startAdminBot };
