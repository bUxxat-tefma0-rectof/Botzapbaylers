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
const { formatarMoeda, formatarData, formatarTelefone } = require('../../utils/helpers');

let bot = null;
const estados = new Map();
const msgTracker = new Map();

async function startClientBot() {
    bot = new TelegramBot(process.env.BOT_TOKEN_CLIENTE, { 
        polling: { interval: 300, autoStart: true, params: { timeout: 10 } } 
    });
    
    // ============ COMANDO START ============
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (cliente && cliente.nome && cliente.telefone_verificado) {
            estados.set(userId, { tela: 'menu' });
            return showMenuPrincipal(chatId, cliente.nome.split(' ')[0]);
        }
        
        estados.set(userId, { tela: 'cadastro', etapa: 'boasvindas' });
        await showBoasVindas(chatId, msg.from.first_name || 'Cliente');
    });
    
    // ============ CALLBACK QUERIES ============
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
        
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const texto = msg.text.trim();
        const estado = estados.get(userId);
        
        if (!estado || !estado.aguardando) return;
        await processarEntradaTexto(chatId, userId, texto, estado);
    });
    
    // ============ LOCALIZAÇÃO ============
    bot.on('location', async (msg) => {
        const userId = msg.from.id;
        const estado = estados.get(userId);
        if (estado && estado.aguardando === 'localizacao') {
            await processarLocalizacao(msg.chat.id, userId, msg.location);
        }
    });
    
    logger.info('🛒 Bot Cliente 100% funcional com todas integrações');
    return bot;
}

// ============ TELAS DE CADASTRO ============
async function showBoasVindas(chatId, nome) {
    const mensagem = `🛒 *Bem-vindo ao ${process.env.NOME_MERCADO || 'Supermercado'}!*\n\n` +
        `👋 Olá, *${nome}*!\n\n` +
        `📱 Cadastro rápido via *WhatsApp*\n⏱️ Leva menos de 2 minutos!\n\n` +
        `Vamos começar?`;
    
    const kb = { inline_keyboard: [
        [{ text: '📱 COMEÇAR CADASTRO', callback_data: 'cad_iniciar' }],
        [{ text: 'ℹ️ Já tenho cadastro', callback_data: 'cad_login' }]
    ]};
    
    await editOrSend(chatId, null, mensagem, kb);
}

// ============ ROUTER DE CALLBACKS ============
async function routerCallback(chatId, userId, data, msgId) {
    const estado = estados.get(userId) || { tela: 'menu' };
    msgTracker.set(userId, msgId);
    
    // CADASTRO
    if (data === 'cad_iniciar') {
        estado.tela = 'cadastro'; estado.etapa = 'telefone'; estado.aguardando = 'telefone';
        estados.set(userId, estado);
        return editOrSend(chatId, msgId, '📱 Digite seu *telefone* com DDD:\n\n📝 Exemplo: *44999525600*', null);
    }
    if (data === 'cad_login') {
        estado.tela = 'cadastro'; estado.etapa = 'login'; estado.aguardando = 'login_cpf';
        estados.set(userId, estado);
        return editOrSend(chatId, msgId, '🔑 Digite seu *CPF* (apenas números):\n\n📝 Exemplo: *12345678900*', null);
    }
    if (data === 'cad_reenviar_codigo') {
        const r = await AuthService.reenviarCodigo(chatId, userId);
        await bot.sendMessage(chatId, r.sucesso ? `📱 Código reenviado para *${r.telefone}*` : `❌ ${r.mensagem}`, { parse_mode: 'Markdown' });
        return;
    }
    if (data === 'cad_tipo_pf') {
        estado.tipoCadastro = 'PF'; estado.aguardando = 'cpf';
        estados.set(userId, estado);
        return editOrSend(chatId, msgId, '👤 Digite seu *CPF* (apenas números):', null);
    }
    if (data === 'cad_tipo_pj') {
        estado.tipoCadastro = 'PJ'; estado.aguardando = 'cnpj';
        estados.set(userId, estado);
        return editOrSend(chatId, msgId, '🏢 Digite seu *CNPJ* (apenas números):', null);
    }
    if (data === 'cad_pular_email' || data === 'cad_pular_cpf') {
        estado.aguardando = 'cep';
        estados.set(userId, estado);
        return editOrSend(chatId, msgId, '📍 Digite seu *CEP* para entrega:\n\n📝 Exemplo: *87700000*', backButton('menu_principal'));
    }
    if (data === 'cad_add_endereco') {
        estado.etapa = 'endereco'; estado.aguardando = 'cep';
        estados.set(userId, estado);
        return editOrSend(chatId, msgId, '📍 Digite seu *CEP* (apenas números):\n\n📝 Exemplo: *87700000*', null);
    }
    
    // MENU
    if (data === 'menu_principal') {
        const db = getDatabase();
        const c = db.prepare('SELECT nome FROM clientes WHERE telegram_id = ?').get(userId);
        estados.set(userId, { tela: 'menu' });
        return showMenuPrincipal(chatId, c?.nome?.split(' ')[0] || 'Cliente');
    }
    if (data === 'menu_categorias') return showCategorias(chatId, msgId);
    if (data === 'menu_pesquisar') { estado.tela = 'menu'; estado.aguardando = 'pesquisa'; estados.set(userId, estado); return editOrSend(chatId, msgId, '🔍 Digite o nome do produto:', backButton('menu_categorias')); }
    if (data === 'menu_carrinho') return showCarrinho(chatId, userId, msgId);
    if (data === 'menu_pedidos') return showPedidos(chatId, userId, msgId);
    if (data === 'menu_perfil') return showPerfil(chatId, userId, msgId);
    if (data === 'menu_favoritos') return showFavoritos(chatId, userId, msgId);
    if (data === 'menu_atendimento') return showAtendimento(chatId, userId, msgId);
    if (data === 'menu_ofertas') return showOfertas(chatId, msgId);
    if (data === 'menu_mais_vendidos') return showMaisVendidos(chatId, msgId);
    
    // LOJA
    if (data.startsWith('cat_')) return showProdutosPorCategoria(chatId, data.split('_')[1], msgId);
    if (data.startsWith('prod_')) return showDetalheProduto(chatId, userId, data.split('_')[1], msgId);
    if (data.startsWith('addcarr_')) return adicionarAoCarrinho(chatId, userId, data.split('_')[1]);
    if (data.startsWith('fav_')) return toggleFavorito(chatId, userId, data.split('_')[1]);
    
    // CARRINHO
    if (data.startsWith('carr_')) return handleCarrinhoActions(chatId, userId, data, msgId);
    
    // CHECKOUT
    if (data === 'checkout_iniciar') return showCheckout(chatId, userId, msgId);
    if (data.startsWith('checkout_')) return handleCheckoutActions(chatId, userId, data, msgId);
    
    // PAGAMENTO
    if (data.startsWith('pag_')) return handlePagamentoActions(chatId, userId, data, msgId);
    
    // PEDIDOS
    if (data.startsWith('ped_')) return handlePedidosActions(chatId, userId, data, msgId);
    
    // PERFIL
    if (data.startsWith('perfil_')) return handlePerfilActions(chatId, userId, data, msgId);
}

// ============ PROCESSAR TEXTO ============
async function processarEntradaTexto(chatId, userId, texto, estado) {
    const db = getDatabase();
    
    // TELEFONE
    if (estado.aguardando === 'telefone') {
        const r = await AuthService.enviarCodigo(chatId, userId, texto);
        if (!r.sucesso) return bot.sendMessage(chatId, `❌ ${r.mensagem}`);
        estado.etapa = 'verificacao'; estado.aguardando = 'codigo'; estado.telefone = r.telefone;
        estados.set(userId, estado);
        return bot.sendMessage(chatId, `📱 Código enviado para *${r.telefone}*\n\nDigite o código recebido:`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '📩 Reenviar', callback_data: 'cad_reenviar_codigo' }]] } });
    }
    
    // CÓDIGO
    if (estado.aguardando === 'codigo') {
        const r = await AuthService.verificarCodigo(chatId, userId, texto);
        if (!r.sucesso) return bot.sendMessage(chatId, `❌ ${r.mensagem}`);
        if (r.cadastroCompleto) {
            estados.set(userId, { tela: 'menu' });
            await bot.sendMessage(chatId, `✅ Bem-vindo de volta, *${r.cliente.nome?.split(' ')[0]}*!`, { parse_mode: 'Markdown' });
            return showMenuPrincipal(chatId, r.cliente.nome?.split(' ')[0]);
        }
        estado.etapa = 'completar_dados'; estado.aguardando = 'nome';
        estados.set(userId, estado);
        return bot.sendMessage(chatId, '✅ Verificado!\n\n📝 Digite seu *nome completo*:', { parse_mode: 'Markdown' });
    }
    
    // NOME
    if (estado.aguardando === 'nome') {
        if (texto.length < 3 || texto.split(' ').filter(p => p).length < 2) return bot.sendMessage(chatId, '❌ Digite nome e sobrenome.');
        const [nome, ...sobrenome] = texto.split(' ');
        db.prepare('UPDATE clientes SET nome = ?, sobrenome = ? WHERE telegram_id = ?').run(nome, sobrenome.join(' '), userId);
        estado.aguardando = 'email'; estados.set(userId, estado);
        return bot.sendMessage(chatId, '✅ Nome salvo!\n\n📧 Digite seu *email* (ou /pular):', { parse_mode: 'Markdown' });
    }
    
    // EMAIL
    if (estado.aguardando === 'email') {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) {
            db.prepare('UPDATE clientes SET email = ? WHERE telegram_id = ?').run(texto.toLowerCase(), userId);
        }
        estado.aguardando = 'tipo_cadastro'; estados.set(userId, estado);
        return bot.sendMessage(chatId, '✅ Email salvo!\n\nEscolha o tipo:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '👤 Pessoa Física', callback_data: 'cad_tipo_pf' }], [{ text: '🏢 Pessoa Jurídica', callback_data: 'cad_tipo_pj' }], [{ text: '⏭️ Pular', callback_data: 'cad_add_endereco' }]] } });
    }
    
    // CPF
    if (estado.aguardando === 'cpf') {
        const cpf = texto.replace(/\D/g, '');
        const { validarCPF } = require('../../utils/helpers');
        if (!validarCPF(cpf)) return bot.sendMessage(chatId, '❌ CPF inválido.');
        db.prepare('UPDATE clientes SET tipo = ?, cpf = ? WHERE telegram_id = ?').run('PF', cpf, userId);
        estado.aguardando = 'data_nascimento'; estados.set(userId, estado);
        return bot.sendMessage(chatId, '✅ CPF salvo!\n\n📅 Data de nascimento (DD/MM/AAAA):', { parse_mode: 'Markdown' });
    }
    
    // CNPJ
    if (estado.aguardando === 'cnpj') {
        const cnpj = texto.replace(/\D/g, '');
        const { validarCNPJ } = require('../../utils/helpers');
        if (!validarCNPJ(cnpj)) return bot.sendMessage(chatId, '❌ CNPJ inválido.');
        db.prepare('UPDATE clientes SET tipo = ?, cnpj = ? WHERE telegram_id = ?').run('PJ', cnpj, userId);
        estado.aguardando = 'razao_social'; estados.set(userId, estado);
        return bot.sendMessage(chatId, '✅ CNPJ salvo!\n\n🏢 Razão Social:', { parse_mode: 'Markdown' });
    }
    
    // DATA NASCIMENTO
    if (estado.aguardando === 'data_nascimento') {
        const p = texto.split('/');
        if (p.length !== 3 || new Date().getFullYear() - parseInt(p[2]) < 16) return bot.sendMessage(chatId, '❌ Data inválida.');
        db.prepare('UPDATE clientes SET data_nascimento = ? WHERE telegram_id = ?').run(texto, userId);
        estado.etapa = 'endereco'; estado.aguardando = 'cep';
        estados.set(userId, estado);
        return bot.sendMessage(chatId, '✅ Data salva!\n\n📍 Digite seu *CEP*:', { parse_mode: 'Markdown' });
    }
    
    // RAZÃO SOCIAL (PJ)
    if (estado.aguardando === 'razao_social') {
        db.prepare('UPDATE clientes SET razao_social = ? WHERE telegram_id = ?').run(texto, userId);
        estado.aguardando = 'nome_fantasia'; estados.set(userId, estado);
        return bot.sendMessage(chatId, '🏪 Nome Fantasia:', { parse_mode: 'Markdown' });
    }
    
    // NOME FANTASIA (PJ)
    if (estado.aguardando === 'nome_fantasia') {
        db.prepare('UPDATE clientes SET nome_fantasia = ? WHERE telegram_id = ?').run(texto, userId);
        estado.aguardando = 'responsavel'; estados.set(userId, estado);
        return bot.sendMessage(chatId, '👤 Responsável:', { parse_mode: 'Markdown' });
    }
    
    // RESPONSÁVEL (PJ)
    if (estado.aguardando === 'responsavel') {
        db.prepare('UPDATE clientes SET responsavel = ? WHERE telegram_id = ?').run(texto, userId);
        estado.etapa = 'endereco'; estado.aguardando = 'cep';
        estados.set(userId, estado);
        return bot.sendMessage(chatId, '✅ Dados salvos!\n\n📍 Digite seu *CEP*:', { parse_mode: 'Markdown' });
    }
    
    // CEP
    if (estado.aguardando === 'cep') {
        const cepLimpo = texto.replace(/\D/g, '');
        if (cepLimpo.length !== 8) return bot.sendMessage(chatId, '❌ CEP inválido.');
        const r = await EnderecoService.buscarCEP(cepLimpo);
        if (!r.sucesso) return bot.sendMessage(chatId, `❌ ${r.mensagem}`);
        estado.dadosCEP = r.dados; estado.aguardando = 'numero';
        estados.set(userId, estado);
        const { logradouro, bairro, cidade, estado: uf } = r.dados;
        return bot.sendMessage(chatId, `📍 *${logradouro}*\n🏘️ ${bairro}\n🏙️ ${cidade}/${uf}\n\nDigite o *número*:`, { parse_mode: 'Markdown' });
    }
    
    // NÚMERO
    if (estado.aguardando === 'numero') {
        const d = estado.dadosCEP;
        await EnderecoService.salvarEndereco(userId, { cep: d.cep, logradouro: d.logradouro, numero: texto, bairro: d.bairro, cidade: d.cidade, estado: d.estado, principal: 1 });
        return finalizarCadastro(chatId, userId);
    }
    
    // LOGIN CPF
    if (estado.aguardando === 'login_cpf') {
        const r = await AuthService.loginCPF(chatId, userId, texto);
        if (!r.sucesso) return bot.sendMessage(chatId, `❌ ${r.mensagem}`);
        estados.set(userId, { tela: 'menu' });
        await bot.sendMessage(chatId, `✅ Bem-vindo(a), *${r.cliente.nome?.split(' ')[0]}*!`, { parse_mode: 'Markdown' });
        return showMenuPrincipal(chatId, r.cliente.nome?.split(' ')[0]);
    }
    
    // PESQUISA
    if (estado.aguardando === 'pesquisa') {
        estado.aguardando = null; estados.set(userId, estado);
        const r = await LojaService.pesquisarProdutos(texto);
        if (r.produtos.length === 0) return bot.sendMessage(chatId, `🔍 Nenhum resultado para "${texto}".`);
        const kb = { inline_keyboard: [] };
        for (const p of r.produtos) kb.inline_keyboard.push([{ text: `${p.nome} - ${formatarMoeda(p.preco_promocional || p.preco)}`, callback_data: `prod_${p.id}` }]);
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_categorias' }]);
        return bot.sendMessage(chatId, `🔍 *${r.total} resultados para "${texto}"*`, { parse_mode: 'Markdown', reply_markup: kb });
    }
    
    // COMENTÁRIO CARRINHO
    if (estado.aguardando === 'comentario_carrinho') {
        const itemId = estado.comentarioItemId;
        await CarrinhoService.adicionarComentario(userId, itemId, texto);
        estado.aguardando = null; estados.set(userId, estado);
        return showCarrinho(chatId, userId, null);
    }
    
    // CUPOM
    if (estado.aguardando === 'cupom') {
        const r = await CheckoutService.aplicarCupom(userId, texto);
        estado.aguardando = null; estados.set(userId, estado);
        if (r.sucesso) {
            await bot.sendMessage(chatId, `🎟 Cupom *${r.cupom}* aplicado! Desconto: ${formatarMoeda(r.desconto)}`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `❌ ${r.mensagem}`);
        }
        return showCarrinho(chatId, userId, null);
    }
}

// ============ MENU PRINCIPAL ============
async function showMenuPrincipal(chatId, nome) {
    const mensagem = `🛒 *${process.env.NOME_MERCADO || 'Supermercado Telegram'}*\n\n👋 Olá, *${nome}*!\n\nEscolha uma opção:`;
    
    const kb = { inline_keyboard: [
        [{ text: '🛍️ Ver Produtos', callback_data: 'menu_categorias' }],
        [{ text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }, { text: '❤️ Favoritos', callback_data: 'menu_favoritos' }],
        [{ text: '🔥 Ofertas do Dia', callback_data: 'menu_ofertas' }, { text: '📈 Mais Vendidos', callback_data: 'menu_mais_vendidos' }],
        [{ text: '🛒 Meu Carrinho', callback_data: 'menu_carrinho' }],
        [{ text: '📦 Meus Pedidos', callback_data: 'menu_pedidos' }],
        [{ text: '👤 Meu Perfil', callback_data: 'menu_perfil' }],
        [{ text: '📞 Atendimento', callback_data: 'menu_atendimento' }]
    ]};
    
    await editOrSend(chatId, null, mensagem, kb);
}

// ============ LOJA ============
async function showCategorias(chatId, msgId) {
    const cats = await LojaService.getCategorias();
    const kb = { inline_keyboard: [] };
    for (const c of cats) kb.inline_keyboard.push([{ text: `${c.emoji} ${c.nome}`, callback_data: `cat_${c.id}` }]);
    kb.inline_keyboard.push([{ text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    await editOrSend(chatId, msgId, '🛍️ *CATEGORIAS*', kb);
}

async function showProdutosPorCategoria(chatId, catId, msgId) {
    const cat = await LojaService.getCategoriaPorId(catId);
    const { produtos } = await LojaService.getProdutosPorCategoria(catId);
    const kb = { inline_keyboard: [] };
    for (const p of produtos) kb.inline_keyboard.push([{ text: `${p.em_promocao ? '🔥 ' : ''}${p.nome} - ${formatarMoeda(p.preco_promocional || p.preco)}`, callback_data: `prod_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_categorias' }]);
    await editOrSend(chatId, msgId, `${cat.emoji} *${cat.nome}*\n\n${produtos.length} produtos:`, kb);
}

async function showDetalheProduto(chatId, userId, prodId, msgId) {
    const p = await LojaService.getProduto(prodId);
    if (!p) return editOrSend(chatId, msgId, '❌ Produto não encontrado.', backButton('menu_categorias'));
    
    const preco = p.preco_promocional || p.preco;
    let msg = `📦 *${p.nome}*\n\n`;
    if (p.marca) msg += `🏷 ${p.marca}\n`;
    if (p.descricao) msg += `📝 ${p.descricao}\n`;
    if (p.peso) msg += `⚖️ ${p.peso}\n`;
    msg += `\n💰 *${formatarMoeda(preco)}*`;
    if (p.preco_promocional) msg += `\n🔥 De: ~~${formatarMoeda(p.preco)}~~`;
    msg += `\n📦 Estoque: ${p.estoque} ${p.unidade || 'un'}`;
    
    const kb = { inline_keyboard: [
        [{ text: '🛒 Adicionar ao Carrinho', callback_data: `addcarr_${prodId}` }],
        [{ text: '❤️ Favoritar', callback_data: `fav_${prodId}` }],
        [{ text: '⬅️ Voltar', callback_data: `cat_${p.categoria_id}` }]
    ]};
    
    if (p.foto) await bot.sendPhoto(chatId, p.foto, { caption: msg, parse_mode: 'Markdown', reply_markup: kb });
    else await editOrSend(chatId, msgId, msg, kb);
}

async function showOfertas(chatId, msgId) {
    const ofertas = await LojaService.getOfertasDoDia();
    const kb = { inline_keyboard: [] };
    for (const p of ofertas) {
        const desconto = Math.round((1 - p.preco_promocional / p.preco) * 100);
        kb.inline_keyboard.push([{ text: `🔥 -${desconto}% ${p.nome} - ${formatarMoeda(p.preco_promocional)}`, callback_data: `prod_${p.id}` }]);
    }
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    await editOrSend(chatId, msgId, '🔥 *OFERTAS DO DIA*', kb);
}

async function showMaisVendidos(chatId, msgId) {
    const produtos = await LojaService.getMaisVendidos();
    const kb = { inline_keyboard: [] };
    for (const p of produtos) kb.inline_keyboard.push([{ text: `📈 ${p.nome} - ${formatarMoeda(p.preco_promocional || p.preco)} (${p.total_vendas}x)`, callback_data: `prod_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    await editOrSend(chatId, msgId, '📈 *MAIS VENDIDOS*', kb);
}

// ============ CARRINHO ============
async function showCarrinho(chatId, userId, msgId) {
    const carrinho = await CarrinhoService.listar(userId);
    if (carrinho.itens.length === 0) return editOrSend(chatId, msgId, '🛒 Carrinho vazio!', { inline_keyboard: [[{ text: '🛍️ Ver Produtos', callback_data: 'menu_categorias' }], [{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]] });
    
    let msg = '🛒 *SEU CARRINHO*\n\n';
    const kb = { inline_keyboard: [] };
    for (const i of carrinho.itens) {
        const preco = i.preco_promocional || i.preco;
        msg += `📦 ${i.nome} x${i.quantidade} - ${formatarMoeda(preco * i.quantidade)}\n`;
        if (i.comentario) msg += `   📝 "${i.comentario}"\n`;
        msg += '\n';
        kb.inline_keyboard.push([
            { text: '➖', callback_data: `carr_dec_${i.id}` },
            { text: `${i.quantidade}`, callback_data: 'nop' },
            { text: '➕', callback_data: `carr_inc_${i.id}` },
            { text: '📝', callback_data: `carr_com_${i.id}` },
            { text: '🗑', callback_data: `carr_del_${i.id}` }
        ]);
    }
    msg += `\n💰 *Total: ${formatarMoeda(carrinho.total)}*`;
    kb.inline_keyboard.push([{ text: '🎟 Cupom', callback_data: 'carr_cupom' }]);
    kb.inline_keyboard.push([{ text: '💳 Finalizar Pedido', callback_data: 'checkout_iniciar' }]);
    kb.inline_keyboard.push([{ text: '🛍️ Continuar', callback_data: 'menu_categorias' }, { text: '🗑 Limpar', callback_data: 'carr_limpar' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    await editOrSend(chatId, msgId, msg, kb);
}

async function handleCarrinhoActions(chatId, userId, data, msgId) {
    const est = estados.get(userId) || {};
    if (data.startsWith('carr_del_')) { await CarrinhoService.remover(userId, data.split('_')[2]); return showCarrinho(chatId, userId, msgId); }
    if (data.startsWith('carr_inc_')) { await CarrinhoService.atualizarQuantidade(userId, data.split('_')[2], 1); return showCarrinho(chatId, userId, msgId); }
    if (data.startsWith('carr_dec_')) {
        const db = getDatabase(); const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        const item = db.prepare('SELECT quantidade FROM carrinhos WHERE id = ? AND cliente_id = ?').get(data.split('_')[2], cli.id);
        if (item && item.quantidade > 1) await CarrinhoService.atualizarQuantidade(userId, data.split('_')[2], -1);
        else await CarrinhoService.remover(userId, data.split('_')[2]);
        return showCarrinho(chatId, userId, msgId);
    }
    if (data.startsWith('carr_com_')) {
        est.aguardando = 'comentario_carrinho'; est.comentarioItemId = data.split('_')[2];
        estados.set(userId, est);
        return bot.sendMessage(chatId, '📝 Digite o comentário para este item:');
    }
    if (data === 'carr_cupom') {
        est.aguardando = 'cupom'; estados.set(userId, est);
        return bot.sendMessage(chatId, '🎟 Digite o código do cupom:');
    }
    if (data === 'carr_limpar') { await CarrinhoService.limpar(userId); return showCarrinho(chatId, userId, msgId); }
}

// ============ CHECKOUT ============
async function showCheckout(chatId, userId, msgId) {
    const r = await CheckoutService.iniciarCheckout(userId);
    if (!r.sucesso) return bot.sendMessage(chatId, `❌ ${r.mensagem}`);
    
    let msg = `💳 *FINALIZAR PEDIDO*\n\n`;
    msg += `🛒 Itens: ${r.itens.length}\n`;
    msg += `📦 Subtotal: ${formatarMoeda(r.subtotal)}\n`;
    msg += `🚚 Entrega: ${formatarMoeda(r.taxaEntrega)}\n`;
    msg += `💰 *Total: ${formatarMoeda(r.total)}*\n\n`;
    msg += `Escolha o pagamento:`;
    
    const kb = { inline_keyboard: [
        [{ text: '💳 PIX', callback_data: 'checkout_pix' }],
        [{ text: '💳 Cartão de Crédito', callback_data: 'checkout_credito' }],
        [{ text: '🏧 Cartão de Débito', callback_data: 'checkout_debito' }],
        [{ text: '💵 Dinheiro', callback_data: 'checkout_dinheiro' }],
        [{ text: '🍽️ Vale Alimentação', callback_data: 'checkout_vale' }],
        [{ text: '⬅️ Voltar', callback_data: 'menu_carrinho' }]
    ]};
    
    await editOrSend(chatId, msgId, msg, kb);
}

async function handleCheckoutActions(chatId, userId, data, msgId) {
    const metodo = data.replace('checkout_', '');
    const metodosValidos = ['pix', 'credito', 'debito', 'dinheiro', 'boleto', 'vale'];
    
    if (metodosValidos.includes(metodo)) {
        await bot.sendMessage(chatId, '⏳ Processando pagamento...');
        const r = await CheckoutService.finalizarPedido(userId, metodo, { tipoEntrega: 'entrega' });
        
        if (!r.sucesso) return bot.sendMessage(chatId, `❌ ${r.mensagem}`);
        
        if (metodo === 'pix' && r.pagamento.qrBuffer) {
            await bot.sendPhoto(chatId, r.pagamento.qrBuffer, {
                caption: `💳 *PIX*\n\n📦 ${r.numero}\n💰 ${formatarMoeda(r.total)}\n\n📋 \`${r.pagamento.copia_cola}\`\n\n⏰ 30 min`,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🔄 Verificar', callback_data: `pag_check_${r.pedidoId}_${r.pagamento.payment_id}` }]] }
            });
        } else if (metodo === 'dinheiro') {
            await bot.sendMessage(chatId, `✅ *Pedido ${r.numero} confirmado!*\n\n💵 Pagamento em dinheiro na entrega.\n💰 Total: ${formatarMoeda(r.total)}`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `✅ *Pedido ${r.numero} realizado!*\n💰 Total: ${formatarMoeda(r.total)}\n📊 Status: ${r.pagamento.status}`, { parse_mode: 'Markdown' });
        }
    }
}

async function handlePagamentoActions(chatId, userId, data, msgId) {
    if (data.startsWith('pag_check_')) {
        const [, , pedidoId] = data.split('_');
        const r = await CheckoutService.verificarPagamento(pedidoId);
        if (r.aprovado) await bot.sendMessage(chatId, '✅ *Pagamento aprovado!* Preparando seu pedido...', { parse_mode: 'Markdown' });
        else await bot.sendMessage(chatId, '⏳ Aguardando pagamento...');
    }
}

// ============ PEDIDOS ============
async function showPedidos(chatId, userId, msgId) {
    const { pedidos } = await PedidosService.listar(userId);
    if (pedidos.length === 0) return editOrSend(chatId, msgId, '📦 Nenhum pedido!', backButton('menu_principal'));
    const kb = { inline_keyboard: [] };
    const se = { recebido:'📥', confirmado:'✅', separando:'📦', embalando:'🎁', entrega:'🛵', entregue:'🏠', cancelado:'❌' };
    for (const p of pedidos) kb.inline_keyboard.push([{ text: `${se[p.status]||'📋'} ${p.numero} - ${formatarMoeda(p.total)}`, callback_data: `ped_ver_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    await editOrSend(chatId, msgId, '📦 *MEUS PEDIDOS*', kb);
}

async function handlePedidosActions(chatId, userId, data, msgId) {
    if (data.startsWith('ped_ver_')) {
        const d = await PedidosService.detalhes(userId, data.split('_')[2]);
        if (!d) return;
        let msg = `📦 *${d.numero}*\n📊 ${d.status}\n💳 ${d.pagamento_status}\n📅 ${formatarData(d.data_pedido)}\n\n`;
        for (const i of d.itens) msg += `${i.quantidade}x ${i.produto_nome} - ${formatarMoeda(i.preco_unitario * i.quantidade)}\n`;
        msg += `\n💰 Total: ${formatarMoeda(d.total)}`;
        await editOrSend(chatId, msgId, msg, backButton('menu_pedidos'));
    }
}

// ============ PERFIL ============
async function showPerfil(chatId, userId, msgId) {
    const p = await PerfilService.getPerfil(userId);
    if (!p) return editOrSend(chatId, msgId, '❌ Perfil não encontrado.', backButton('menu_principal'));
    let msg = `👤 *MEU PERFIL*\n\n📝 ${p.nome} ${p.sobrenome||''}\n📧 ${p.email||'N/A'}\n📱 ${p.telefone_formatado||'N/A'}\n`;
    if (p.cpf) msg += `🔢 CPF: ${p.cpf_formatado}\n`;
    msg += `\n📦 Pedidos: ${p.totalPedidos}\n💰 Gasto: ${p.total_gasto_formatado}\n⭐ Pontos: ${p.pontos_fidelidade}`;
    const kb = { inline_keyboard: [
        [{ text: '✏️ Editar', callback_data: 'perfil_editar' }],
        [{ text: '📍 Endereços', callback_data: 'perfil_enderecos' }],
        [{ text: '⭐ Cashback', callback_data: 'perfil_cashback' }],
        [{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]
    ]};
    await editOrSend(chatId, msgId, msg, kb);
}

async function handlePerfilActions(chatId, userId, data, msgId) {
    if (data === 'perfil_cashback') {
        const r = await PerfilService.resgatarCashback(userId);
        await bot.sendMessage(chatId, r.sucesso ? `✅ ${r.mensagem}` : `❌ ${r.mensagem}`);
    }
}

// ============ FAVORITOS / ATENDIMENTO ============
async function showFavoritos(chatId, userId, msgId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    const favs = db.prepare('SELECT f.*, p.nome, p.preco, p.preco_promocional FROM favoritos f JOIN produtos p ON f.produto_id = p.id WHERE f.cliente_id = ?').all(cli.id);
    if (favs.length === 0) return editOrSend(chatId, msgId, '❤️ Nenhum favorito!', { inline_keyboard: [[{ text: '🛍️ Ver Produtos', callback_data: 'menu_categorias' }], [{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]] });
    const kb = { inline_keyboard: [] };
    for (const f of favs) kb.inline_keyboard.push([{ text: `${f.nome} - ${formatarMoeda(f.preco_promocional || f.preco)}`, callback_data: `prod_${f.produto_id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    await editOrSend(chatId, msgId, '❤️ *FAVORITOS*', kb);
}

async function showAtendimento(chatId, userId, msgId) {
    const wpp = process.env.WHATSAPP_NUMERO || '554499525600';
    await editOrSend(chatId, msgId, '📞 *ATENDIMENTO*\n\n💬 WhatsApp: clique abaixo', { inline_keyboard: [
        [{ text: '💬 Falar no WhatsApp', url: `https://wa.me/${wpp.replace(/\D/g, '')}` }],
        [{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]
    ]});
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
    await bot.answerCallbackQuery({ callback_query_id: `${chatId}_${Date.now()}`, text: f ? '❌ Removido' : '❤️ Favoritado' });
}

async function processarLocalizacao(chatId, userId, location) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    db.prepare('UPDATE enderecos SET latitude = ?, longitude = ? WHERE cliente_id = ? AND principal = 1').run(location.latitude, location.longitude, cli.id);
    await bot.sendMessage(chatId, '📍 Localização salva!', { reply_markup: { remove_keyboard: true } });
    await finalizarCadastro(chatId, userId);
}

async function finalizarCadastro(chatId, userId) {
    const db = getDatabase();
    const c = db.prepare('SELECT nome FROM clientes WHERE telegram_id = ?').get(userId);
    db.prepare('UPDATE clientes SET etapa_cadastro = ? WHERE telegram_id = ?').run('completo', userId);
    estados.set(userId, { tela: 'menu' });
    await bot.sendMessage(chatId, `🎉 *Cadastro concluído!*\n\nBem-vindo(a), *${c.nome?.split(' ')[0]}*!`, { parse_mode: 'Markdown' });
    await showMenuPrincipal(chatId, c.nome?.split(' ')[0]);
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
