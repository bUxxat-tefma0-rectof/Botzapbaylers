const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('../../database/connection');
const logger = require('../../utils/logger');
const { formatarMoeda } = require('../../utils/helpers');

let bot = null;
const estados = new Map();

async function startClientBot() {
    bot = new TelegramBot(process.env.BOT_TOKEN_CLIENTE, { polling: { interval: 300, autoStart: true } });
    
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (cliente && cliente.telefone_verificado) {
            estados.set(userId, { tela: 'menu' });
            return showMenu(chatId, cliente.nome || 'Cliente');
        }
        
        estados.set(userId, { tela: 'auth' });
        await bot.sendMessage(chatId,
            `🛒 *Bem-vindo ao ${process.env.NOME_MERCADO || 'Supermercado'}!*\n\n` +
            `Para continuar, digite seu *telefone* com DDD:\n\n` +
            `📱 Exemplo: 44999525600`,
            { parse_mode: 'Markdown' }
        );
    });
    
    bot.on('callback_query', async (q) => {
        bot.answerCallbackQuery(q.id);
        await router(q.message.chat.id, q.from.id, q.data, q.message.message_id);
    });
    
    bot.on('message', async (msg) => {
        if (!msg.text || msg.text.startsWith('/')) return;
        const est = estados.get(msg.from.id);
        if (est && est.aguardando) await handleText(msg.chat.id, msg.from.id, msg.text);
    });
    
    logger.info('🛒 Bot Cliente online');
    return bot;
}

async function showMenu(chatId, nome) {
    const kb = { inline_keyboard: [
        [{ text: '🛒 Ver Produtos', callback_data: 'menu_categorias' }],
        [{ text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }, { text: '❤️ Favoritos', callback_data: 'menu_favoritos' }],
        [{ text: '🛒 Carrinho', callback_data: 'menu_carrinho' }, { text: '📦 Pedidos', callback_data: 'menu_pedidos' }],
        [{ text: '👤 Perfil', callback_data: 'menu_perfil' }, { text: '🎟 Cupons', callback_data: 'menu_cupons' }]
    ]};
    await editOrSend(chatId, null, `🛒 *${process.env.NOME_MERCADO || 'Supermercado'}*\n\n👋 Olá, *${nome}*!`, kb);
}

async function router(chatId, userId, data, msgId) {
    if (data === 'menu_categorias') return showCategorias(chatId, msgId);
    if (data === 'menu_carrinho') return showCarrinho(chatId, userId, msgId);
    if (data === 'menu_pedidos') return showPedidos(chatId, userId, msgId);
    if (data === 'menu_perfil') return showPerfil(chatId, userId, msgId);
    if (data === 'menu_favoritos') return showFavoritos(chatId, userId, msgId);
    if (data.startsWith('cat_')) return showProdutos(chatId, data.split('_')[1], msgId);
    if (data.startsWith('prod_')) return showProduto(chatId, userId, data.split('_')[1], msgId);
    if (data.startsWith('addcarr_')) return addCarrinho(chatId, userId, data.split('_')[1], msgId);
    if (data.startsWith('fav_')) return toggleFavorito(chatId, userId, data.split('_')[1], msgId);
    if (data.startsWith('carr_')) return handleCarrinho(chatId, userId, data, msgId);
    if (data === 'checkout') return iniciarCheckout(chatId, userId, msgId);
    if (data.startsWith('pag_')) return processarPagamento(chatId, userId, data, msgId);
}

async function handleText(chatId, userId, texto) {
    const est = estados.get(userId);
    const db = getDatabase();
    
    if (est.tela === 'auth') {
        const tel = texto.replace(/\D/g, '');
        if (tel.length < 10) return bot.sendMessage(chatId, '❌ Telefone inválido. Digite com DDD.');
        
        const codigo = require('../../utils/helpers').gerarCodigo();
        
        // Salva no banco
        const existe = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (existe) {
            db.prepare('UPDATE clientes SET telefone=?, codigo_whatsapp=? WHERE telegram_id=?').run(tel, codigo, userId);
        } else {
            db.prepare('INSERT INTO clientes (telegram_id, telefone, codigo_whatsapp) VALUES (?,?,?)').run(userId, tel, codigo);
        }
        
        // Envia código via WhatsApp
        try {
            const { enviarCodigoWhatsApp } = require('../../services/whatsapp');
            await enviarCodigoWhatsApp(tel, codigo);
            
            est.aguardando = 'codigo';
            est.telefone = tel;
            estados.set(userId, est);
            
            await bot.sendMessage(chatId, 
                `📱 *Código enviado via WhatsApp!*\n\n` +
                `Enviamos um código para *${tel}*\n\n` +
                `Digite o código de 6 dígitos:`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {
            await bot.sendMessage(chatId, '❌ Erro ao enviar código. Verifique se o WhatsApp está conectado.');
        }
        return;
    }
    
    if (est.aguardando === 'codigo') {
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (texto.trim() !== cliente.codigo_whatsapp) {
            return bot.sendMessage(chatId, '❌ Código incorreto. Tente novamente.');
        }
        
        db.prepare('UPDATE clientes SET telefone_verificado=1, codigo_whatsapp=NULL WHERE telegram_id=?').run(userId);
        
        // Verifica se já tem cadastro completo
        if (cliente.nome) {
            estados.set(userId, { tela: 'menu' });
            return showMenu(chatId, cliente.nome);
        }
        
        // Inicia cadastro
        est.tela = 'cadastro';
        est.aguardando = 'nome';
        estados.set(userId, est);
        
        await bot.sendMessage(chatId, '✅ *Telefone verificado!*\n\nAgora, digite seu *nome completo*:', { parse_mode: 'Markdown' });
        return;
    }
    
    if (est.tela === 'cadastro') {
        if (est.aguardando === 'nome') {
            if (texto.trim().length < 3 || texto.split(' ').length < 2) return bot.sendMessage(chatId, '❌ Digite nome e sobrenome.');
            db.prepare('UPDATE clientes SET nome=? WHERE telegram_id=?').run(texto.trim(), userId);
            est.aguardando = 'email';
            estados.set(userId, est);
            return bot.sendMessage(chatId, '✅ Nome salvo!\n\nDigite seu *email* (ou pule com /pular):', { parse_mode: 'Markdown' });
        }
        if (est.aguardando === 'email') {
            db.prepare('UPDATE clientes SET email=? WHERE telegram_id=?').run(texto.trim(), userId);
            est.aguardando = 'cpf';
            estados.set(userId, est);
            return bot.sendMessage(chatId, '✅ Email salvo!\n\nDigite seu *CPF* (apenas números):', { parse_mode: 'Markdown' });
        }
        if (est.aguardando === 'cpf') {
            const cpf = texto.replace(/\D/g, '');
            if (!require('../../utils/helpers').validarCPF(cpf)) return bot.sendMessage(chatId, '❌ CPF inválido.');
            db.prepare('UPDATE clientes SET cpf=? WHERE telegram_id=?').run(cpf, userId);
            
            estados.set(userId, { tela: 'menu' });
            const cliente = db.prepare('SELECT nome FROM clientes WHERE telegram_id=?').get(userId);
            await bot.sendMessage(chatId, '🎉 *Cadastro concluído!*', { parse_mode: 'Markdown' });
            return showMenu(chatId, cliente.nome);
        }
    }
}

// ============ STUBS ============
async function showCategorias(chatId, msgId) {
    const db = getDatabase();
    const cats = db.prepare('SELECT * FROM categorias WHERE ativo=1 ORDER BY ordem').all();
    const kb = { inline_keyboard: [] };
    for (const c of cats) kb.inline_keyboard.push([{ text: `${c.emoji} ${c.nome}`, callback_data: `cat_${c.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]);
    await editOrSend(chatId, msgId, '🛒 *CATEGORIAS*', kb);
}

async function showProdutos(chatId, catId, msgId) {
    const db = getDatabase();
    const cat = db.prepare('SELECT * FROM categorias WHERE id=?').get(catId);
    const prods = db.prepare('SELECT * FROM produtos WHERE categoria_id=? AND disponivel=1 ORDER BY ordem').all(catId);
    const kb = { inline_keyboard: [] };
    for (const p of prods) kb.inline_keyboard.push([{ text: `${p.nome} - ${formatarMoeda(p.preco)}`, callback_data: `prod_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_categorias' }]);
    await editOrSend(chatId, msgId, `${cat.emoji} *${cat.nome}*`, kb);
}

async function showProduto(chatId, userId, prodId, msgId) {
    const db = getDatabase();
    const p = db.prepare('SELECT * FROM produtos WHERE id=?').get(prodId);
    const kb = { inline_keyboard: [
        [{ text: `🛒 Adicionar - ${formatarMoeda(p.preco)}`, callback_data: `addcarr_${p.id}` }],
        [{ text: '❤️ Favoritar', callback_data: `fav_${p.id}` }],
        [{ text: '⬅️ Voltar', callback_data: `cat_${p.categoria_id}` }]
    ]};
    let msg = `📦 *${p.nome}*\n${p.marca ? '🏷 Marca: ' + p.marca + '\n' : ''}${p.descricao ? '📝 ' + p.descricao + '\n' : ''}`;
    msg += `💰 Preço: *${formatarMoeda(p.preco)}*\n`;
    if (p.preco_promocional) msg += `🔥 Promoção: *${formatarMoeda(p.preco_promocional)}*\n`;
    msg += `📦 Estoque: ${p.estoque} ${p.unidade || 'un'}`;
    if (p.foto) await bot.sendPhoto(chatId, p.foto, { caption: msg, parse_mode: 'Markdown', reply_markup: kb });
    else await editOrSend(chatId, msgId, msg, kb);
}

async function addCarrinho(chatId, userId, prodId, msgId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id=?').get(userId);
    db.prepare('INSERT INTO carrinhos (cliente_id, produto_id) VALUES (?,?)').run(cli.id, prodId);
    await editOrSend(chatId, msgId, '✅ Produto adicionado ao carrinho!', { inline_keyboard: [[{ text: '🛒 Ver Carrinho', callback_data: 'menu_carrinho' }], [{ text: '⬅️ Continuar', callback_data: 'menu_categorias' }]] });
}

async function toggleFavorito(chatId, userId, prodId, msgId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id=?').get(userId);
    const f = db.prepare('SELECT * FROM favoritos WHERE cliente_id=? AND produto_id=?').get(cli.id, prodId);
    if (f) db.prepare('DELETE FROM favoritos WHERE cliente_id=? AND produto_id=?').run(cli.id, prodId);
    else db.prepare('INSERT INTO favoritos (cliente_id, produto_id) VALUES (?,?)').run(cli.id, prodId);
    await bot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: f ? '❌ Removido' : '❤️ Favoritado' });
}

async function showCarrinho(chatId, userId, msgId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id=?').get(userId);
    const itens = db.prepare('SELECT c.*, p.nome, p.preco FROM carrinhos c JOIN produtos p ON c.produto_id=p.id WHERE c.cliente_id=?').all(cli.id);
    if (itens.length === 0) return editOrSend(chatId, msgId, '🛒 Carrinho vazio!', { inline_keyboard: [[{ text: '🛒 Ver Produtos', callback_data: 'menu_categorias' }]] });
    
    let total = 0, msg = '🛒 *CARRINHO*\n\n';
    const kb = { inline_keyboard: [] };
    for (const i of itens) {
        total += i.preco * i.quantidade;
        msg += `${i.nome} x${i.quantidade} - ${formatarMoeda(i.preco * i.quantidade)}\n`;
        kb.inline_keyboard.push([{ text: '🗑 Remover', callback_data: `carr_del_${i.id}` }]);
    }
    msg += `\n💰 *Total: ${formatarMoeda(total)}*`;
    kb.inline_keyboard.push([{ text: '💳 Finalizar Pedido', callback_data: 'checkout' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]);
    await editOrSend(chatId, msgId, msg, kb);
}

async function handleCarrinho(chatId, userId, data, msgId) {
    if (data.startsWith('carr_del_')) {
        const db = getDatabase();
        db.prepare('DELETE FROM carrinhos WHERE id=?').run(data.split('_')[2]);
        await showCarrinho(chatId, userId, msgId);
    }
}

async function showPedidos(chatId, userId, msgId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id=?').get(userId);
    const peds = db.prepare('SELECT * FROM pedidos WHERE cliente_id=? ORDER BY data_pedido DESC LIMIT 10').all(cli.id);
    if (peds.length === 0) return editOrSend(chatId, msgId, '📦 Nenhum pedido!', { inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]] });
    const kb = { inline_keyboard: [] };
    for (const p of peds) kb.inline_keyboard.push([{ text: `${p.numero} - ${formatarMoeda(p.total)} - ${p.status}`, callback_data: `ped_ver_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]);
    await editOrSend(chatId, msgId, '📦 *PEDIDOS*', kb);
}

async function showPerfil(chatId, userId, msgId) {
    const db = getDatabase();
    const c = db.prepare('SELECT * FROM clientes WHERE telegram_id=?').get(userId);
    const peds = db.prepare('SELECT COUNT(*) as t FROM pedidos WHERE cliente_id=?').get(c.id).t;
    await editOrSend(chatId, msgId,
        `👤 *PERFIL*\n\n📝 ${c.nome}\n📧 ${c.email||'N/A'}\n📱 ${c.telefone||'N/A'}\n📦 Pedidos: ${peds}\n💰 Total: ${formatarMoeda(c.total_gasto)}`,
        { inline_keyboard: [[{ text: '✏️ Editar', callback_data: 'perfil_edit' }], [{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]] }
    );
}

async function showFavoritos(chatId, userId, msgId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id=?').get(userId);
    const favs = db.prepare('SELECT f.*, p.nome, p.preco FROM favoritos f JOIN produtos p ON f.produto_id=p.id WHERE f.cliente_id=?').all(cli.id);
    if (favs.length === 0) return editOrSend(chatId, msgId, '❤️ Nenhum favorito!', { inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]] });
    const kb = { inline_keyboard: [] };
    for (const f of favs) kb.inline_keyboard.push([{ text: `${f.nome} - ${formatarMoeda(f.preco)}`, callback_data: `prod_${f.produto_id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_voltar' }]);
    await editOrSend(chatId, msgId, '❤️ *FAVORITOS*', kb);
}

async function iniciarCheckout(chatId, userId, msgId) {
    await editOrSend(chatId, msgId, '💳 *FINALIZAR PEDIDO*\n\nGerando pagamento...', null);
    const db = getDatabase();
    const cli = db.prepare('SELECT * FROM clientes WHERE telegram_id=?').get(userId);
    const itens = db.prepare('SELECT c.*, p.nome, p.preco FROM carrinhos c JOIN produtos p ON c.produto_id=p.id WHERE c.cliente_id=?').all(cli.id);
    
    let total = 0;
    for (const i of itens) total += i.preco * i.quantidade;
    total += parseFloat(process.env.TAXA_ENTREGA_PADRAO || 5);
    
    const pagamento = require('../../services/pagamento');
    const numero = require('../../utils/helpers').gerarNumeroPedido();
    const result = await pagamento.gerarPix(total, 'Compra Supermercado', numero);
    
    if (!result.sucesso) return bot.sendMessage(chatId, '❌ Erro no pagamento.');
    
    const pedido = db.prepare('INSERT INTO pedidos (numero, cliente_id, total, subtotal, taxa_entrega, pagamento_metodo, pagamento_id, pagamento_qrcode) VALUES (?,?,?,?,?,?,?,?)').run(numero, cli.id, total, total - parseFloat(process.env.TAXA_ENTREGA_PADRAO || 5), parseFloat(process.env.TAXA_ENTREGA_PADRAO || 5), 'pix', result.payment_id, result.copia_cola);
    
    for (const i of itens) db.prepare('INSERT INTO itens_pedido (pedido_id, produto_nome, quantidade, preco_unitario) VALUES (?,?,?,?)').run(pedido.lastInsertRowid, i.nome, i.quantidade, i.preco);
    
    db.prepare('DELETE FROM carrinhos WHERE cliente_id=?').run(cli.id);
    
    await bot.sendPhoto(chatId, result.qrBuffer, {
        caption: `💳 *PAGAMENTO PIX*\n\n📦 ${numero}\n💰 ${formatarMoeda(total)}\n\n📋 \`${result.copia_cola}\`\n\n⏰ 30 min`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔄 Verificar', callback_data: `pag_check_${pedido.lastInsertRowid}_${result.payment_id}` }]] }
    });
}

async function processarPagamento(chatId, userId, data, msgId) {
    if (data.startsWith('pag_check_')) {
        const [, , pedidoId, paymentId] = data.split('_');
        const pag = require('../../services/pagamento');
        const r = await pag.verificarPagamento(paymentId);
        if (r.aprovado) {
            const db = getDatabase();
            db.prepare('UPDATE pedidos SET status=?, pagamento_status=? WHERE id=?').run('confirmado', 'approved', pedidoId);
            await bot.sendMessage(chatId, '✅ *Pagamento aprovado!*\nSeu pedido está sendo separado.');
        } else {
            await bot.sendMessage(chatId, '⏳ Ainda não confirmado. Aguarde...');
        }
    }
}

async function editOrSend(chatId, msgId, text, kb) {
    try {
        if (msgId) await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb });
        else await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
    } catch (e) { await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb }); }
}

function getBot() { return bot; }

module.exports = { startClientBot, getBot };
