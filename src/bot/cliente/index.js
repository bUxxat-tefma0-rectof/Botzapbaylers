const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const AuthService = require('./auth');
const CadastroService = require('./cadastro');
const EnderecoService = require('./endereco');
const LojaService = require('./loja');
const CarrinhoService = require('./carrinho');
const CheckoutService = require('./checkout');
const PedidosService = require('./pedidos');
const PerfilService = require('./perfil');
const logger = require('../../utils/logger');
const { formatarMoeda, formatarData } = require('../../utils/helpers');

let bot = null;
const estados = new Map();

async function startClientBot() {
    bot = new TelegramBot(process.env.BOT_TOKEN_CLIENTE, { 
        polling: { interval: 300, autoStart: true, params: { timeout: 10 } } 
    });
    
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://botzapbaylers.onrender.com';
    
    // ============ /start ============
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'Cliente';
        
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        // Já cadastrado → Menu com WebApp
        if (cliente && cliente.nome && cliente.telefone_verificado) {
            estados.set(userId, { tela: 'menu' });
            
            const kb = {
                inline_keyboard: [
                    [{ text: '🛍️ ABRIR SUPERMERCADO (APP)', web_app: { url: `${BASE_URL}/app` } }],
                    [{ text: '📂 Ver Categorias', callback_data: 'menu_categorias' }],
                    [{ text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }],
                    [{ text: '🛒 Carrinho', callback_data: 'menu_carrinho' }],
                    [{ text: '📦 Meus Pedidos', callback_data: 'menu_pedidos' }],
                    [{ text: '👤 Perfil', callback_data: 'menu_perfil' }]
                ]
            };
            
            return bot.sendMessage(chatId,
                `🛒 *${process.env.NOME_MERCADO || 'Supermercado Telegram'}*\n\n` +
                `👋 Olá, *${cliente.nome.split(' ')[0]}*!\n\nClique abaixo para abrir a loja:`,
                { parse_mode: 'Markdown', reply_markup: kb }
            );
        }
        
        // Novo cadastro ou incompleto
        estados.set(userId, { tela: 'cadastro', etapa: 'inicio' });
        
        const kb = {
            inline_keyboard: [
                [{ text: '📱 INICIAR CADASTRO', callback_data: 'cad_iniciar' }],
                [{ text: '🔑 Já tenho cadastro (CPF)', callback_data: 'cad_login' }]
            ]
        };
        
        await bot.sendMessage(chatId,
            `🛒 *Bem-vindo ao ${process.env.NOME_MERCADO || 'Supermercado'}!*\n\n` +
            `👋 Olá, *${firstName}*!\n\nEscolha uma opção:`,
            { parse_mode: 'Markdown', reply_markup: kb }
        );
    });
    
    // ============ CALLBACKS ============
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;
        const msgId = query.message.message_id;
        
        bot.answerCallbackQuery(query.id);
        await routerCallback(chatId, userId, data, msgId);
    });
    
    // ============ MENSAGENS DE TEXTO ============
    bot.on('message', async (msg) => {
        if (!msg.text || msg.text.startsWith('/')) return;
        const userId = msg.from.id;
        const estado = estados.get(userId);
        if (estado && estado.aguardando) {
            await processarEntradaTexto(msg.chat.id, userId, msg.text.trim(), estado);
        }
    });
    
    logger.info('🛒 Bot Cliente configurado (Telegram)');
    return bot;
}

// ============ ROUTER ============
async function routerCallback(chatId, userId, data, msgId) {
    const estado = estados.get(userId) || { tela: 'menu' };
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://botzapbaylers.onrender.com';
    
    // CADASTRO
    if (data === 'cad_iniciar') {
        estado.tela = 'cadastro'; estado.etapa = 'nome'; estado.aguardando = 'nome';
        estados.set(userId, estado);
        return editOrSend(chatId, msgId, '📝 Digite seu *nome completo*:', null);
    }
    
    if (data === 'cad_login') {
        estado.tela = 'cadastro'; estado.etapa = 'login'; estado.aguardando = 'login_cpf';
        estados.set(userId, estado);
        return editOrSend(chatId, msgId, '🔑 Digite seu *CPF* (apenas números):', null);
    }
    
    if (data === 'cad_pular') {
        return finalizarCadastro(chatId, userId);
    }
    
    // MENU
    if (data === 'menu_principal') {
        estados.set(userId, { tela: 'menu' });
        const db = getDatabase();
        const c = db.prepare('SELECT nome FROM clientes WHERE telegram_id = ?').get(userId);
        const kb = { inline_keyboard: [
            [{ text: '🛍️ ABRIR LOJA', web_app: { url: `${BASE_URL}/app` } }],
            [{ text: '📂 Categorias', callback_data: 'menu_categorias' }],
            [{ text: '🛒 Carrinho', callback_data: 'menu_carrinho' }],
            [{ text: '📦 Pedidos', callback_data: 'menu_pedidos' }],
            [{ text: '👤 Perfil', callback_data: 'menu_perfil' }]
        ]};
        return editOrSend(chatId, msgId, `🛒 *Menu*\n\n👋 Olá, *${c?.nome?.split(' ')[0] || 'Cliente'}*!`, kb);
    }
    
    if (data === 'menu_categorias') return showCategorias(chatId, msgId);
    if (data === 'menu_pesquisar') { estado.aguardando = 'pesquisa'; estados.set(userId, estado); return editOrSend(chatId, msgId, '🔍 Digite o nome do produto:', backButton('menu_principal')); }
    if (data === 'menu_carrinho') return showCarrinho(chatId, userId, msgId);
    if (data === 'menu_pedidos') return showPedidos(chatId, userId, msgId);
    if (data === 'menu_perfil') return showPerfil(chatId, userId, msgId);
    
    // LOJA
    if (data.startsWith('cat_')) return showProdutos(chatId, data.split('_')[1], msgId);
    if (data.startsWith('prod_')) return showDetalheProduto(chatId, userId, data.split('_')[1], msgId);
    if (data.startsWith('addcarr_')) { await CarrinhoService.adicionar(userId, data.split('_')[1]); await bot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: '✅ Adicionado!', show_alert: true }); return; }
    if (data.startsWith('fav_')) { toggleFavorito(userId, data.split('_')[1]); return; }
    
    // CARRINHO
    if (data.startsWith('carr_')) return handleCarrinho(chatId, userId, data, msgId);
    if (data === 'checkout') return showCheckout(chatId, userId, msgId);
    if (data.startsWith('pag_')) return handlePagamento(chatId, userId, data, msgId);
    if (data.startsWith('ped_')) return handlePedidos(chatId, userId, data, msgId);
}

// ============ PROCESSAR TEXTO ============
async function processarEntradaTexto(chatId, userId, texto, estado) {
    const db = getDatabase();
    
    // NOME
    if (estado.aguardando === 'nome') {
        if (texto.length < 3 || texto.split(' ').filter(p => p).length < 2) {
            return bot.sendMessage(chatId, '❌ Digite nome e sobrenome.');
        }
        const [nome, ...sobrenome] = texto.split(' ');
        db.prepare('UPDATE clientes SET nome = ?, sobrenome = ? WHERE telegram_id = ?').run(nome, sobrenome.join(' '), userId);
        
        // Gera código e envia via Telegram
        const result = await AuthService.enviarCodigo(userId);
        estado.aguardando = 'codigo';
        estados.set(userId, estado);
        
        return bot.sendMessage(chatId,
            `✅ Nome salvo!\n\n` +
            `🔐 *Código de verificação:* \`${result.codigo}\`\n\n` +
            `Digite o código de 6 dígitos:`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // CÓDIGO
    if (estado.aguardando === 'codigo') {
        const result = await AuthService.verificarCodigo(userId, texto);
        if (!result.sucesso) return bot.sendMessage(chatId, `❌ ${result.mensagem}`);
        
        await bot.sendMessage(chatId, '✅ Verificado! Cadastro concluído! 🎉');
        return finalizarCadastro(chatId, userId);
    }
    
    // LOGIN CPF
    if (estado.aguardando === 'login_cpf') {
        const result = await AuthService.loginCPF(userId, texto);
        if (!result.sucesso) return bot.sendMessage(chatId, `❌ ${result.mensagem}`);
        
        estados.set(userId, { tela: 'menu' });
        await bot.sendMessage(chatId, `✅ Bem-vindo(a), *${result.cliente.nome?.split(' ')[0]}*!`, { parse_mode: 'Markdown' });
        return showMenuPrincipal(chatId, result.cliente.nome?.split(' ')[0]);
    }
    
    // PESQUISA
    if (estado.aguardando === 'pesquisa') {
        estado.aguardando = null; estados.set(userId, estado);
        const r = await LojaService.pesquisarProdutos(texto);
        if (r.produtos.length === 0) return bot.sendMessage(chatId, '🔍 Nenhum resultado.');
        const kb = { inline_keyboard: [] };
        for (const p of r.produtos.slice(0, 10)) kb.inline_keyboard.push([{ text: `${p.nome} - ${formatarMoeda(p.preco_promocional || p.preco)}`, callback_data: `prod_${p.id}` }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
        return bot.sendMessage(chatId, `🔍 *Resultados*`, { parse_mode: 'Markdown', reply_markup: kb });
    }
}

// ============ FINALIZAR CADASTRO ============
async function finalizarCadastro(chatId, userId) {
    const db = getDatabase();
    const c = db.prepare('SELECT nome FROM clientes WHERE telegram_id = ?').get(userId);
    db.prepare('UPDATE clientes SET etapa_cadastro = ? WHERE telegram_id = ?').run('completo', userId);
    estados.set(userId, { tela: 'menu' });
    await showMenuPrincipal(chatId, c?.nome?.split(' ')[0] || 'Cliente');
}

async function showMenuPrincipal(chatId, nome) {
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://botzapbaylers.onrender.com';
    const kb = { inline_keyboard: [
        [{ text: '🛍️ ABRIR LOJA', web_app: { url: `${BASE_URL}/app` } }],
        [{ text: '📂 Categorias', callback_data: 'menu_categorias' }],
        [{ text: '🛒 Carrinho', callback_data: 'menu_carrinho' }],
        [{ text: '📦 Pedidos', callback_data: 'menu_pedidos' }],
        [{ text: '👤 Perfil', callback_data: 'menu_perfil' }]
    ]};
    await editOrSend(chatId, null, `🛒 *${process.env.NOME_MERCADO || 'Supermercado'}*\n\n👋 Olá, *${nome}*!`, kb);
}

// ============ STUBS ============
async function showCategorias(chatId, msgId) {
    const cats = await LojaService.getCategorias();
    const kb = { inline_keyboard: [] };
    for (const c of cats) kb.inline_keyboard.push([{ text: `${c.emoji} ${c.nome}`, callback_data: `cat_${c.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    await editOrSend(chatId, msgId, '📂 *CATEGORIAS*', kb);
}

async function showProdutos(chatId, catId, msgId) {
    const cat = await LojaService.getCategoriaPorId(catId);
    const { produtos } = await LojaService.getProdutosPorCategoria(catId);
    const kb = { inline_keyboard: [] };
    for (const p of produtos.slice(0, 15)) kb.inline_keyboard.push([{ text: `${p.nome} - ${formatarMoeda(p.preco_promocional || p.preco)}`, callback_data: `prod_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_categorias' }]);
    await editOrSend(chatId, msgId, `${cat?.emoji || '📦'} *${cat?.nome || 'Categoria'}*`, kb);
}

async function showDetalheProduto(chatId, userId, prodId, msgId) {
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
        [{ text: '🛒 Adicionar', callback_data: `addcarr_${prodId}` }],
        [{ text: '⬅️ Voltar', callback_data: `cat_${p.categoria_id}` }]
    ]};
    
    if (p.foto) await bot.sendPhoto(chatId, p.foto, { caption: msg, parse_mode: 'Markdown', reply_markup: kb });
    else await editOrSend(chatId, msgId, msg, kb);
}

async function showCarrinho(chatId, userId, msgId) {
    const c = await CarrinhoService.listar(userId);
    if (c.itens.length === 0) return editOrSend(chatId, msgId, '🛒 Carrinho vazio!', backButton('menu_principal'));
    let msg = '🛒 *CARRINHO*\n\n';
    const kb = { inline_keyboard: [] };
    for (const i of c.itens) {
        const preco = i.preco_promocional || i.preco;
        msg += `${i.nome} x${i.quantidade} - ${formatarMoeda(preco * i.quantidade)}\n`;
        kb.inline_keyboard.push([{ text: `🗑 ${i.nome}`, callback_data: `carr_del_${i.id}` }]);
    }
    msg += `\n💰 Total: ${formatarMoeda(c.total)}`;
    kb.inline_keyboard.push([{ text: '💳 Finalizar', callback_data: 'checkout' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    await editOrSend(chatId, msgId, msg, kb);
}

async function handleCarrinho(chatId, userId, data, msgId) {
    if (data.startsWith('carr_del_')) { await CarrinhoService.remover(userId, data.split('_')[2]); return showCarrinho(chatId, userId, msgId); }
}

async function showCheckout(chatId, userId, msgId) {
    const c = await CarrinhoService.listar(userId);
    if (c.itens.length === 0) return bot.sendMessage(chatId, 'Carrinho vazio!');
    const total = c.total + parseFloat(process.env.TAXA_ENTREGA_PADRAO || 8);
    const kb = { inline_keyboard: [
        [{ text: '💳 PIX', callback_data: 'pag_pix' }],
        [{ text: '💵 Dinheiro', callback_data: 'pag_dinheiro' }],
        [{ text: '⬅️ Voltar', callback_data: 'menu_carrinho' }]
    ]};
    await editOrSend(chatId, msgId, `💳 *Finalizar Pedido*\n\n💰 Total: ${formatarMoeda(total)}`, kb);
}

async function handlePagamento(chatId, userId, data, msgId) {
    const metodo = data.replace('pag_', '');
    const r = await CheckoutService.finalizarPedido(userId, metodo);
    if (!r.sucesso) return bot.sendMessage(chatId, `❌ ${r.mensagem}`);
    
    if (r.pagamento?.qr_code_base64) {
        await bot.sendPhoto(chatId, Buffer.from(r.pagamento.qr_code_base64, 'base64'), {
            caption: `💳 *PIX*\n\n📦 ${r.numero}\n💰 ${formatarMoeda(r.total)}\n\n📋 \`${r.pagamento.copia_cola}\`\n\n⏰ 30 min`,
            parse_mode: 'Markdown'
        });
    } else {
        await bot.sendMessage(chatId, `✅ *Pedido ${r.numero} realizado!*\n💰 ${formatarMoeda(r.total)}`, { parse_mode: 'Markdown' });
    }
}

async function showPedidos(chatId, userId, msgId) {
    const { pedidos } = await PedidosService.listar(userId);
    if (pedidos.length === 0) return editOrSend(chatId, msgId, '📦 Nenhum pedido!', backButton('menu_principal'));
    const kb = { inline_keyboard: [] };
    for (const p of pedidos.slice(0, 10)) kb.inline_keyboard.push([{ text: `${p.numero} - ${formatarMoeda(p.total)}`, callback_data: `ped_ver_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    await editOrSend(chatId, msgId, '📦 *PEDIDOS*', kb);
}

async function handlePedidos(chatId, userId, data, msgId) {
    if (data.startsWith('ped_ver_')) {
        const d = await PedidosService.detalhes(userId, data.split('_')[2]);
        if (!d) return;
        let msg = `📦 *${d.numero}*\n📊 ${d.status}\n\n`;
        for (const i of d.itens) msg += `${i.quantidade}x ${i.produto_nome} - ${formatarMoeda(i.preco_unitario * i.quantidade)}\n`;
        msg += `\n💰 Total: ${formatarMoeda(d.total)}`;
        await editOrSend(chatId, msgId, msg, backButton('menu_pedidos'));
    }
}

async function showPerfil(chatId, userId, msgId) {
    const p = await PerfilService.getPerfil(userId);
    if (!p) return;
    let msg = `👤 *PERFIL*\n\n📝 ${p.nome} ${p.sobrenome||''}\n📧 ${p.email||'N/A'}\n📱 ${p.telefone||'N/A'}\n📦 Pedidos: ${p.totalPedidos}\n💰 Gasto: ${p.total_gasto_formatado}\n⭐ Pontos: ${p.pontos_fidelidade}`;
    await editOrSend(chatId, msgId, msg, backButton('menu_principal'));
}

async function toggleFavorito(userId, prodId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    const f = db.prepare('SELECT * FROM favoritos WHERE cliente_id = ? AND produto_id = ?').get(cli.id, prodId);
    if (f) db.prepare('DELETE FROM favoritos WHERE cliente_id = ? AND produto_id = ?').run(cli.id, prodId);
    else db.prepare('INSERT INTO favoritos (cliente_id, produto_id) VALUES (?, ?)').run(cli.id, prodId);
}

// ============ HELPERS ============
async function editOrSend(chatId, msgId, text, kb) {
    try {
        if (msgId) await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb });
        else await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
    } catch (e) { await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb }); }
}

function backButton(data) { return { inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: data }]] }; }
function getBot() { return bot; }

module.exports = { startClientBot, getBot };
