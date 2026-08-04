const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const AuthService = require('./auth');
const CadastroService = require('./cadastro');
const EnderecoService = require('./endereco');
const LojaService = require('./loja');
const CarrinhoService = require('./carrinho');
const CheckoutService = require('./checkout');
const PagamentoClienteService = require('./pagamento');
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
    
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://seu-site.onrender.com';
    
    // ============ COMANDO /start ============
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'Cliente';
        
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        // Cliente já cadastrado e verificado → Menu com WebApp
        if (cliente && cliente.nome && cliente.telefone_verificado) {
            estados.set(userId, { tela: 'menu' });
            
            const kb = {
                inline_keyboard: [
                    [{ text: '🛍️ ABRIR SUPERMERCADO (APP)', web_app: { url: `${BASE_URL}/app` } }],
                    [{ text: '📂 Ver Categorias', callback_data: 'menu_categorias' }],
                    [{ text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }, { text: '❤️ Favoritos', callback_data: 'menu_favoritos' }],
                    [{ text: '🛒 Carrinho', callback_data: 'menu_carrinho' }],
                    [{ text: '📦 Meus Pedidos', callback_data: 'menu_pedidos' }],
                    [{ text: '👤 Perfil', callback_data: 'menu_perfil' }],
                    [{ text: '📞 Atendimento', callback_data: 'menu_atendimento' }]
                ]
            };
            
            return bot.sendMessage(chatId,
                `🛒 *${process.env.NOME_MERCADO || 'Supermercado Telegram'}*\n\n` +
                `👋 Olá, *${cliente.nome.split(' ')[0]}*!\n\n` +
                `Clique no botão abaixo para abrir a loja completa:`,
                { parse_mode: 'Markdown', reply_markup: kb }
            );
        }
        
        // Cliente em cadastro → continuar
        if (cliente && cliente.telefone && !cliente.telefone_verificado) {
            estados.set(userId, { tela: 'cadastro', etapa: 'telefone', aguardando: 'telefone' });
            return bot.sendMessage(chatId, '📱 Digite seu *telefone* com DDD para continuar:', { parse_mode: 'Markdown' });
        }
        
        if (cliente && cliente.telefone_verificado && !cliente.nome) {
            estados.set(userId, { tela: 'cadastro', etapa: 'completar_dados', aguardando: 'nome' });
            return bot.sendMessage(chatId, '📝 Digite seu *nome completo* para continuar:', { parse_mode: 'Markdown' });
        }
        
        // Novo cliente
        estados.set(userId, { tela: 'cadastro', etapa: 'boasvindas' });
        
        const kb = {
            inline_keyboard: [
                [{ text: '📱 COMEÇAR CADASTRO', callback_data: 'cad_iniciar' }],
                [{ text: '🛍️ ABRIR LOJA (APP)', web_app: { url: `${BASE_URL}/app` } }]
            ]
        };
        
        await bot.sendMessage(chatId,
            `🛒 *Bem-vindo ao ${process.env.NOME_MERCADO || 'Supermercado'}!*\n\n` +
            `👋 Olá, *${firstName}*!\n\n` +
            `📱 Cadastro rápido via *WhatsApp*\n` +
            `🛍️ Ou acesse a loja diretamente:`,
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
    
    // ============ MENSAGENS ============
    bot.on('message', async (msg) => {
        if (!msg.text || msg.text.startsWith('/')) return;
        const userId = msg.from.id;
        const estado = estados.get(userId);
        if (estado && estado.aguardando) {
            await processarEntradaTexto(msg.chat.id, userId, msg.text.trim(), estado);
        }
    });
    
    // ============ LOCALIZAÇÃO ============
    bot.on('location', async (msg) => {
        const userId = msg.from.id;
        const estado = estados.get(userId);
        if (estado && estado.aguardando === 'localizacao') {
            await processarLocalizacao(msg.chat.id, userId, msg.location);
        }
    });
    
    logger.info('🛒 Bot Cliente com WebApp configurado');
    return bot;
}

// ============ ROUTER ============
async function routerCallback(chatId, userId, data, msgId) {
    const estado = estados.get(userId) || { tela: 'menu' };
    
    // Cadastro
    if (data === 'cad_iniciar') {
        estado.tela = 'cadastro'; estado.etapa = 'telefone'; estado.aguardando = 'telefone';
        estados.set(userId, estado);
        return editOrSend(chatId, msgId, '📱 Digite seu *telefone* com DDD:\n\n📝 Ex: 44999525600', null);
    }
    
    if (data === 'cad_reenviar_codigo') {
        const r = await AuthService.reenviarCodigo(chatId, userId);
        await bot.sendMessage(chatId, r.sucesso ? `📱 Código reenviado!` : `❌ ${r.mensagem}`);
        return;
    }
    
    if (data === 'cad_tipo_pf') { estado.tipoCadastro = 'PF'; estado.aguardando = 'cpf'; estados.set(userId, estado); return editOrSend(chatId, msgId, '👤 Digite seu CPF:', null); }
    if (data === 'cad_tipo_pj') { estado.tipoCadastro = 'PJ'; estado.aguardando = 'cnpj'; estados.set(userId, estado); return editOrSend(chatId, msgId, '🏢 Digite seu CNPJ:', null); }
    if (data === 'cad_pular_email' || data === 'cad_pular_cpf') { estado.aguardando = 'cep'; estados.set(userId, estado); return editOrSend(chatId, msgId, '📍 Digite seu CEP:', null); }
    
    // Menu
    if (data === 'menu_principal') {
        const db = getDatabase();
        const c = db.prepare('SELECT nome FROM clientes WHERE telegram_id = ?').get(userId);
        estados.set(userId, { tela: 'menu' });
        const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://seu-site.onrender.com';
        const kb = { inline_keyboard: [
            [{ text: '🛍️ ABRIR LOJA COMPLETA', web_app: { url: `${BASE_URL}/app` } }],
            [{ text: '📂 Categorias', callback_data: 'menu_categorias' }],
            [{ text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }, { text: '❤️ Favoritos', callback_data: 'menu_favoritos' }],
            [{ text: '🛒 Carrinho', callback_data: 'menu_carrinho' }],
            [{ text: '📦 Pedidos', callback_data: 'menu_pedidos' }],
            [{ text: '👤 Perfil', callback_data: 'menu_perfil' }],
            [{ text: '📞 Atendimento', callback_data: 'menu_atendimento' }]
        ]};
        return editOrSend(chatId, msgId, `🛒 *${process.env.NOME_MERCADO || 'Supermercado'}*\n\n👋 Olá, *${c?.nome?.split(' ')[0] || 'Cliente'}*!`, kb);
    }
    
    if (data === 'menu_categorias') return showCategorias(chatId, msgId);
    if (data === 'menu_pesquisar') { estado.aguardando = 'pesquisa'; estados.set(userId, estado); return editOrSend(chatId, msgId, '🔍 Digite o nome do produto:', backButton('menu_principal')); }
    if (data === 'menu_carrinho') return showCarrinho(chatId, userId, msgId);
    if (data === 'menu_pedidos') return showPedidos(chatId, userId, msgId);
    if (data === 'menu_perfil') return showPerfil(chatId, userId, msgId);
    if (data === 'menu_favoritos') return showFavoritos(chatId, userId, msgId);
    if (data === 'menu_atendimento') return showAtendimento(chatId, msgId);
    
    // Loja
    if (data.startsWith('cat_')) return showProdutosPorCategoria(chatId, data.split('_')[1], msgId);
    if (data.startsWith('prod_')) return showDetalheProduto(chatId, userId, data.split('_')[1], msgId);
    if (data.startsWith('addcarr_')) return adicionarAoCarrinho(chatId, userId, data.split('_')[1]);
    if (data.startsWith('fav_')) return toggleFavorito(chatId, userId, data.split('_')[1]);
    
    // Carrinho
    if (data.startsWith('carr_')) return handleCarrinho(chatId, userId, data, msgId);
    
    // Checkout
    if (data === 'checkout_iniciar') return showCheckout(chatId, userId, msgId);
    if (data.startsWith('checkout_')) return handleCheckout(chatId, userId, data, msgId);
    
    // Pagamento
    if (data.startsWith('pag_')) return handlePagamento(chatId, userId, data, msgId);
    
    // Pedidos
    if (data.startsWith('ped_')) return handlePedidos(chatId, userId, data, msgId);
}

// ============ PROCESSAR TEXTO (CADASTRO) ============
async function processarEntradaTexto(chatId, userId, texto, estado) {
    const db = getDatabase();
    
    // Telefone
    if (estado.aguardando === 'telefone') {
        const r = await AuthService.enviarCodigo(chatId, userId, texto);
        if (!r.sucesso) return bot.sendMessage(chatId, `❌ ${r.mensagem}`);
        estado.aguardando = 'codigo'; estado.telefone = r.telefone; estados.set(userId, estado);
        return bot.sendMessage(chatId, `📱 Código enviado via WhatsApp para *${r.telefone}*\n\nDigite o código:`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '📩 Reenviar', callback_data: 'cad_reenviar_codigo' }]] } });
    }
    
    // Código
    if (estado.aguardando === 'codigo') {
        const r = await AuthService.verificarCodigo(chatId, userId, texto);
        if (!r.sucesso) return bot.sendMessage(chatId, `❌ ${r.mensagem}`);
        if (r.cadastroCompleto) {
            estados.set(userId, { tela: 'menu' });
            return menuPrincipal(chatId, r.cliente.nome?.split(' ')[0]);
        }
        estado.aguardando = 'nome'; estados.set(userId, estado);
        return bot.sendMessage(chatId, '✅ Verificado!\n\n📝 Digite seu *nome completo*:', { parse_mode: 'Markdown' });
    }
    
    // Nome
    if (estado.aguardando === 'nome') {
        if (texto.split(' ').filter(p => p).length < 2) return bot.sendMessage(chatId, '❌ Digite nome e sobrenome.');
        const [nome, ...sobrenome] = texto.split(' ');
        db.prepare('UPDATE clientes SET nome = ?, sobrenome = ? WHERE telegram_id = ?').run(nome, sobrenome.join(' '), userId);
        estado.aguardando = 'email'; estados.set(userId, estado);
        return bot.sendMessage(chatId, '✅ Nome salvo!\n\n📧 Digite seu email (ou /pular):', { parse_mode: 'Markdown' });
    }
    
    // Email
    if (estado.aguardando === 'email') {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) db.prepare('UPDATE clientes SET email = ? WHERE telegram_id = ?').run(texto.toLowerCase(), userId);
        estado.aguardando = null; estados.set(userId, estado);
        return finalizarCadastro(chatId, userId);
    }
    
    // Pesquisa
    if (estado.aguardando === 'pesquisa') {
        estado.aguardando = null; estados.set(userId, estado);
        const r = await LojaService.pesquisarProdutos(texto);
        if (r.produtos.length === 0) return bot.sendMessage(chatId, '🔍 Nenhum resultado.');
        const kb = { inline_keyboard: [] };
        for (const p of r.produtos.slice(0, 15)) kb.inline_keyboard.push([{ text: `${p.nome} - ${formatarMoeda(p.preco_promocional || p.preco)}`, callback_data: `prod_${p.id}` }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
        return bot.sendMessage(chatId, `🔍 *${r.total} resultados*`, { parse_mode: 'Markdown', reply_markup: kb });
    }
}

// ============ FINALIZAR CADASTRO ============
async function finalizarCadastro(chatId, userId) {
    const db = getDatabase();
    const c = db.prepare('SELECT nome FROM clientes WHERE telegram_id = ?').get(userId);
    db.prepare('UPDATE clientes SET etapa_cadastro = ? WHERE telegram_id = ?').run('completo', userId);
    estados.set(userId, { tela: 'menu' });
    await bot.sendMessage(chatId, `🎉 *Cadastro concluído!*\n\nBem-vindo(a), *${c.nome?.split(' ')[0]}*!`, { parse_mode: 'Markdown' });
    await menuPrincipal(chatId, c.nome?.split(' ')[0]);
}

async function menuPrincipal(chatId, nome) {
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://seu-site.onrender.com';
    const kb = { inline_keyboard: [
        [{ text: '🛍️ ABRIR LOJA COMPLETA', web_app: { url: `${BASE_URL}/app` } }],
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

async function showProdutosPorCategoria(chatId, catId, msgId) {
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
        [{ text: '❤️ Favoritar', callback_data: `fav_${prodId}` }],
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
    kb.inline_keyboard.push([{ text: '💳 Finalizar', callback_data: 'checkout_iniciar' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    await editOrSend(chatId, msgId, msg, kb);
}

async function handleCarrinho(chatId, userId, data, msgId) {
    if (data.startsWith('carr_del_')) { await CarrinhoService.remover(userId, data.split('_')[2]); return showCarrinho(chatId, userId, msgId); }
    if (data === 'carr_limpar') { await CarrinhoService.limpar(userId); return showCarrinho(chatId, userId, msgId); }
}

async function showCheckout(chatId, userId, msgId) {
    const r = await CheckoutService.iniciarCheckout(userId);
    if (!r.sucesso) return bot.sendMessage(chatId, `❌ ${r.mensagem}`);
    const kb = { inline_keyboard: [
        [{ text: '💳 PIX', callback_data: 'checkout_pix' }],
        [{ text: '💵 Dinheiro', callback_data: 'checkout_dinheiro' }],
        [{ text: '⬅️ Voltar', callback_data: 'menu_carrinho' }]
    ]};
    await editOrSend(chatId, msgId, `💳 *Finalizar*\n\n💰 Total: ${formatarMoeda(r.total)}\n\nEscolha o pagamento:`, kb);
}

async function handleCheckout(chatId, userId, data, msgId) {
    const metodo = data.replace('checkout_', '');
    const r = await CheckoutService.finalizarPedido(userId, metodo, { tipoEntrega: 'entrega' });
    if (!r.sucesso) return bot.sendMessage(chatId, `❌ ${r.mensagem}`);
    
    if (metodo === 'pix' && r.pagamento?.qrBuffer) {
        await bot.sendPhoto(chatId, r.pagamento.qrBuffer, {
            caption: `💳 *PIX*\n\n📦 ${r.numero}\n💰 ${formatarMoeda(r.total)}\n\n📋 \`${r.pagamento.copia_cola}\`\n\n⏰ 30 min`,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '🔄 Verificar', callback_data: `pag_check_${r.pedidoId}` }]] }
        });
    } else {
        await bot.sendMessage(chatId, `✅ *Pedido ${r.numero} realizado!*\n💰 ${formatarMoeda(r.total)}`, { parse_mode: 'Markdown' });
    }
}

async function handlePagamento(chatId, userId, data, msgId) {
    if (data.startsWith('pag_check_')) {
        const r = await CheckoutService.verificarPagamento(data.split('_')[2]);
        await bot.sendMessage(chatId, r.aprovado ? '✅ Pagamento aprovado!' : '⏳ Aguardando...');
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
        let msg = `📦 *${d.numero}*\n📊 ${d.status}\n💳 ${d.pagamento_status}\n\n`;
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

async function showFavoritos(chatId, userId, msgId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    const favs = db.prepare('SELECT f.*, p.nome, p.preco, p.preco_promocional FROM favoritos f JOIN produtos p ON f.produto_id = p.id WHERE f.cliente_id = ?').all(cli.id);
    if (favs.length === 0) return editOrSend(chatId, msgId, '❤️ Nenhum favorito!', backButton('menu_principal'));
    const kb = { inline_keyboard: [] };
    for (const f of favs) kb.inline_keyboard.push([{ text: `${f.nome} - ${formatarMoeda(f.preco_promocional || f.preco)}`, callback_data: `prod_${f.produto_id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    await editOrSend(chatId, msgId, '❤️ *FAVORITOS*', kb);
}

async function showAtendimento(chatId, msgId) {
    const wpp = (process.env.WHATSAPP_NUMERO || '554499525600').replace(/\D/g, '');
    await editOrSend(chatId, msgId, '📞 *ATENDIMENTO*', { inline_keyboard: [[{ text: '💬 WhatsApp', url: `https://wa.me/${wpp}` }], [{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]] });
}

async function adicionarAoCarrinho(chatId, userId, prodId) {
    const r = await CarrinhoService.adicionar(userId, prodId);
    await bot.answerCallbackQuery({ callback_query_id: `${chatId}_${Date.now()}`, text: r.mensagem, show_alert: true });
}

async function toggleFavorito(chatId, userId, prodId) {
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
