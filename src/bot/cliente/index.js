const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const AuthService = require('./auth');
const LojaService = require('./loja');
const CarrinhoService = require('./carrinho');
const CheckoutService = require('./checkout');
const PedidosService = require('./pedidos');
const PerfilService = require('./perfil');
const logger = require('../../utils/logger');
const { formatarMoeda } = require('../../utils/helpers');

let bot = null;
const estados = new Map();
const ultimaMensagem = new Map();

async function startClientBot() {
    bot = new TelegramBot(process.env.BOT_TOKEN_CLIENTE, { polling: { interval: 300, autoStart: true } });
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://botzapbaylers.onrender.com';
    
    // /start
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (cliente && cliente.nome && cliente.telefone_verificado) {
            estados.set(userId, { tela: 'menu' });
            return menuPrincipal(chatId, cliente.nome.split(' ')[0]);
        }
        
        estados.set(userId, { tela: 'cadastro', aguardando: 'nome' });
        await editarMsg(chatId, '📝 *CADASTRO*\n\nDigite seu *nome completo*:\n_(Nome e sobrenome)_');
    });
    
    // Callbacks
    bot.on('callback_query', async (q) => {
        bot.answerCallbackQuery(q.id);
        const userId = q.from.id;
        const data = q.data;
        const msgId = q.message.message_id;
        ultimaMensagem.set(userId, msgId);
        await router(q.message.chat.id, userId, data, msgId);
    });
    
    // Mensagens de texto
    bot.on('message', async (msg) => {
        if (!msg.text || msg.text.startsWith('/')) return;
        const userId = msg.from.id;
        const estado = estados.get(userId);
        if (estado && estado.aguardando) {
            await processarTexto(msg.chat.id, userId, msg.text.trim(), estado);
        }
    });
    
    logger.info('🤖 Bot Cliente organizado');
    return bot;
}

// ============ ROUTER ============
async function router(chatId, userId, data, msgId) {
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://botzapbaylers.onrender.com';
    
    if (data === 'menu_principal') { estados.set(userId, { tela: 'menu' }); const db = getDatabase(); const c = db.prepare('SELECT nome FROM clientes WHERE telegram_id=?').get(userId); return menuPrincipal(chatId, c?.nome?.split(' ')[0]); }
    if (data === 'menu_categorias') return showCategorias(chatId, msgId);
    if (data === 'menu_carrinho') return showCarrinho(chatId, userId, msgId);
    if (data === 'menu_pedidos') return showPedidos(chatId, userId, msgId);
    if (data === 'menu_perfil') return showPerfil(chatId, userId, msgId);
    
    if (data.startsWith('cat_')) return showProdutos(chatId, data.split('_')[1], msgId);
    if (data.startsWith('prod_')) return showProduto(chatId, userId, data.split('_')[1], msgId);
    if (data.startsWith('addcarr_')) { await CarrinhoService.adicionar(userId, data.split('_')[1]); await bot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: '✅ Adicionado!', show_alert: true }); return; }
    if (data.startsWith('carr_del_')) { await CarrinhoService.remover(userId, data.split('_')[2]); return showCarrinho(chatId, userId, msgId); }
    if (data === 'checkout_pix') return checkout(chatId, userId, msgId, 'pix');
    if (data === 'checkout_dinheiro') return checkout(chatId, userId, msgId, 'dinheiro');
}

// ============ MENU PRINCIPAL ============
async function menuPrincipal(chatId, nome) {
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://botzapbaylers.onrender.com';
    const kb = { inline_keyboard: [
        [{ text: '🛍️ ABRIR LOJA COMPLETA', web_app: { url: `${BASE_URL}/app` } }],
        [{ text: '📂 Categorias', callback_data: 'menu_categorias' }],
        [{ text: '🛒 Carrinho', callback_data: 'menu_carrinho' }],
        [{ text: '📦 Meus Pedidos', callback_data: 'menu_pedidos' }],
        [{ text: '👤 Perfil', callback_data: 'menu_perfil' }]
    ]};
    await editarMsg(chatId, `🛒 *${process.env.NOME_MERCADO || 'Supermercado'}*\n\n👋 Olá, *${nome}*!\n\nEscolha:`, kb);
}

// ============ PROCESSAR TEXTO (CADASTRO) ============
async function processarTexto(chatId, userId, texto, estado) {
    const db = getDatabase();
    
    if (estado.aguardando === 'nome') {
        if (texto.length < 3 || texto.split(' ').filter(p => p).length < 2) {
            return bot.sendMessage(chatId, '❌ Digite *nome e sobrenome*.');
        }
        const [nome, ...sobrenome] = texto.split(' ');
        const sobrenomeStr = sobrenome.join(' ');
        
        const existe = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (existe) {
            db.prepare('UPDATE clientes SET nome=?, sobrenome=?, etapa_cadastro=? WHERE telegram_id=?').run(nome, sobrenomeStr, 'verificar', userId);
        } else {
            db.prepare('INSERT INTO clientes (telegram_id, nome, sobrenome, etapa_cadastro) VALUES (?,?,?,?)').run(userId, nome, sobrenomeStr, 'verificar');
        }
        
        const codigo = await AuthService.enviarCodigo(userId);
        estado.aguardando = 'codigo';
        estados.set(userId, estado);
        
        await bot.sendMessage(chatId, `✅ Nome: *${nome} ${sobrenomeStr}*\n\n🔐 Código: \`${codigo.codigo}\`\n\n_Digite o código:_`, { parse_mode: 'Markdown' });
        return;
    }
    
    if (estado.aguardando === 'codigo') {
        const result = await AuthService.verificarCodigo(userId, texto);
        if (!result.sucesso) return bot.sendMessage(chatId, `❌ ${result.mensagem}`);
        
        db.prepare('UPDATE clientes SET etapa_cadastro=? WHERE telegram_id=?').run('completo', userId);
        estados.set(userId, { tela: 'menu' });
        
        const cliente = db.prepare('SELECT nome FROM clientes WHERE telegram_id=?').get(userId);
        await bot.sendMessage(chatId, `🎉 *Cadastro concluído!*\n\nBem-vindo(a), *${cliente.nome?.split(' ')[0]}*!`, { parse_mode: 'Markdown' });
        return menuPrincipal(chatId, cliente.nome?.split(' ')[0]);
    }
}

// ============ LOJA ============
async function showCategorias(chatId, msgId) {
    const cats = await LojaService.getCategorias();
    const kb = { inline_keyboard: [] };
    for (const c of cats) kb.inline_keyboard.push([{ text: `${c.emoji} ${c.nome}`, callback_data: `cat_${c.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    await editarMsg(chatId, '📂 *CATEGORIAS*\n\nEscolha:', kb);
}

async function showProdutos(chatId, catId, msgId) {
    const cat = await LojaService.getCategoriaPorId(catId);
    const { produtos } = await LojaService.getProdutosPorCategoria(catId);
    const kb = { inline_keyboard: [] };
    for (const p of produtos.slice(0, 12)) kb.inline_keyboard.push([{ text: `${p.nome} - ${formatarMoeda(p.preco_promocional || p.preco)}`, callback_data: `prod_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_categorias' }]);
    await editarMsg(chatId, `${cat?.emoji || '📦'} *${cat?.nome || 'Categoria'}*\n\n${produtos.length} produtos:`, kb);
}

async function showProduto(chatId, userId, prodId, msgId) {
    const p = await LojaService.getProduto(prodId);
    if (!p) return;
    const preco = p.preco_promocional || p.preco;
    let msg = `📦 *${p.nome}*\n\n`;
    if (p.marca) msg += `🏷 ${p.marca}\n`;
    if (p.descricao) msg += `📝 ${p.descricao}\n`;
    msg += `\n💰 *${formatarMoeda(preco)}*`;
    if (p.preco_promocional) msg += `\n🔥 De: ~~${formatarMoeda(p.preco)}~~`;
    msg += `\n📦 Estoque: ${p.estoque}`;
    
    const kb = { inline_keyboard: [
        [{ text: '🛒 Adicionar ao Carrinho', callback_data: `addcarr_${prodId}` }],
        [{ text: '⬅️ Voltar', callback_data: `cat_${p.categoria_id}` }]
    ]};
    
    if (p.foto) await bot.sendPhoto(chatId, p.foto, { caption: msg, parse_mode: 'Markdown', reply_markup: kb });
    else await editarMsg(chatId, msg, kb);
}

// ============ CARRINHO ============
async function showCarrinho(chatId, userId, msgId) {
    const c = await CarrinhoService.listar(userId);
    if (c.itens.length === 0) return editarMsg(chatId, '🛒 *Carrinho Vazio*', { inline_keyboard: [[{ text: '📂 Ver Produtos', callback_data: 'menu_categorias' }], [{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]] });
    
    let msg = '🛒 *SEU CARRINHO*\n\n';
    const kb = { inline_keyboard: [] };
    for (const i of c.itens) {
        const preco = i.preco_promocional || i.preco;
        msg += `📦 ${i.nome} x${i.quantidade}\n   💰 ${formatarMoeda(preco * i.quantidade)}\n\n`;
        kb.inline_keyboard.push([{ text: `🗑 Remover - ${i.nome}`, callback_data: `carr_del_${i.id}` }]);
    }
    
    const total = c.total + parseFloat(process.env.TAXA_ENTREGA_PADRAO || 8);
    msg += `🚚 Entrega: ${formatarMoeda(parseFloat(process.env.TAXA_ENTREGA_PADRAO || 8))}\n💰 *Total: ${formatarMoeda(total)}*`;
    
    kb.inline_keyboard.push([{ text: '💳 PIX', callback_data: 'checkout_pix' }, { text: '💵 Dinheiro', callback_data: 'checkout_dinheiro' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    
    await editarMsg(chatId, msg, kb);
}

// ============ CHECKOUT ============
async function checkout(chatId, userId, msgId, metodo) {
    await bot.sendMessage(chatId, '⏳ Processando...');
    const r = await CheckoutService.finalizarPedido(userId, metodo);
    
    if (!r.sucesso) return bot.sendMessage(chatId, `❌ ${r.mensagem}`);
    
    if (r.pagamento?.qr_code_base64) {
        await bot.sendPhoto(chatId, Buffer.from(r.pagamento.qr_code_base64, 'base64'), {
            caption: `💳 *PIX*\n\n📦 ${r.numero}\n💰 ${formatarMoeda(r.total)}\n\n📋 \`${r.pagamento.copia_cola || ''}\`\n\n⏰ 30 minutos`,
            parse_mode: 'Markdown'
        });
    } else {
        await bot.sendMessage(chatId, `✅ *Pedido ${r.numero} realizado!*\n💰 ${formatarMoeda(r.total)}`, { parse_mode: 'Markdown' });
    }
    
    await showCarrinho(chatId, userId, msgId);
}

// ============ PEDIDOS ============
async function showPedidos(chatId, userId, msgId) {
    const { pedidos } = await PedidosService.listar(userId);
    if (pedidos.length === 0) return editarMsg(chatId, '📦 *Nenhum pedido*', { inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]] });
    
    let msg = '📦 *MEUS PEDIDOS*\n\n';
    const kb = { inline_keyboard: [] };
    const se = { recebido:'📥', confirmado:'✅', separando:'📦', embalando:'🎁', entrega:'🛵', entregue:'🏠', cancelado:'❌' };
    for (const p of pedidos.slice(0, 10)) {
        msg += `${se[p.status] || '📋'} ${p.numero} - ${formatarMoeda(p.total)}\n`;
    }
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    await editarMsg(chatId, msg, kb);
}

// ============ PERFIL ============
async function showPerfil(chatId, userId, msgId) {
    const p = await PerfilService.getPerfil(userId);
    if (!p) return editarMsg(chatId, '❌ Perfil não encontrado.', { inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]] });
    
    let msg = `👤 *MEU PERFIL*\n\n📝 ${p.nome} ${p.sobrenome||''}\n📧 ${p.email||'N/A'}\n📱 ${p.telefone||'N/A'}\n📦 Pedidos: ${p.totalPedidos}\n💰 Gasto: ${p.total_gasto_formatado}\n⭐ Pontos: ${p.pontos_fidelidade}`;
    await editarMsg(chatId, msg, { inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]] });
}

// ============ HELPERS ============
async function editarMsg(chatId, text, kb = null) {
    const msgId = ultimaMensagem.get(chatId);
    try {
        if (msgId) {
            await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb });
        } else {
            const sent = await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
            ultimaMensagem.set(chatId, sent.message_id);
        }
    } catch (e) {
        const sent = await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
        ultimaMensagem.set(chatId, sent.message_id);
    }
}

function getBot() { return bot; }

module.exports = { startClientBot, getBot };
