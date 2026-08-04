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
const { formatarMoeda } = require('../../utils/helpers');

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
        const userFirstName = msg.from.first_name || 'Cliente';
        
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        
        // Cliente já cadastrado e verificado
        if (cliente && cliente.nome && cliente.telefone_verificado) {
            estados.set(userId, { tela: 'menu' });
            await limparMensagensAntigas(chatId, userId);
            return showMenuPrincipal(chatId, cliente.nome.split(' ')[0]);
        }
        
        // Cliente em processo de cadastro (continuar de onde parou)
        if (cliente && cliente.telefone) {
            estados.set(userId, { tela: 'cadastro', etapa: 'inicio' });
            await limparMensagensAntigas(chatId, userId);
            return showTelaInicialCadastro(chatId, cliente);
        }
        
        // Novo cliente - iniciar cadastro
        estados.set(userId, { tela: 'cadastro', etapa: 'boasvindas' });
        await showBoasVindas(chatId, userFirstName);
    });
    
    // ============ CALLBACK QUERIES ============
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;
        const msgId = query.message.message_id;
        
        bot.answerCallbackQuery(query.id);
        msgTracker.set(userId, msgId);
        
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
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const estado = estados.get(userId);
        
        if (estado && estado.aguardando === 'localizacao') {
            await processarLocalizacao(chatId, userId, msg.location);
        }
    });
    
    logger.info('🛒 Bot Cliente com fluxo de cadastro completo');
    return bot;
}

// ============ TELAS DE CADASTRO ============

// Boas-vindas
async function showBoasVindas(chatId, nome) {
    const mensagem = 
        `🛒 *Bem-vindo ao ${process.env.NOME_MERCADO || 'Supermercado'}!*\n\n` +
        `👋 Olá, *${nome}*!\n\n` +
        `Para fazer suas compras, precisamos de um rápido cadastro.\n\n` +
        `📱 *Como funciona:*\n` +
        `1️⃣ Você informa seu telefone\n` +
        `2️⃣ Recebe um código via *WhatsApp*\n` +
        `3️⃣ Confirma o código aqui\n` +
        `4️⃣ Completa seus dados\n\n` +
        `⏱️ Leva menos de *2 minutos*!\n\n` +
        `Vamos começar?`;
    
    const kb = {
        inline_keyboard: [
            [{ text: '📱 COMEÇAR CADASTRO', callback_data: 'cad_iniciar' }],
            [{ text: 'ℹ️ Já tenho cadastro', callback_data: 'cad_login' }]
        ]
    };
    
    await editOrSend(chatId, null, mensagem, kb);
}

// Tela inicial do cadastro
async function showTelaInicialCadastro(chatId, cliente) {
    if (cliente.telefone_verificado && !cliente.nome) {
        // Já tem telefone verificado, mas falta completar dados
        const estado = estados.get(chatId) || {};
        estado.tela = 'cadastro';
        estado.etapa = 'completar_dados';
        estado.aguardando = 'nome';
        estados.set(chatId, estado);
        
        return editOrSend(chatId, null,
            `✅ *Telefone já verificado!*\n\n` +
            `Agora vamos completar seu cadastro.\n\n` +
            `📝 Digite seu *nome completo*:`,
            null
        );
    }
    
    if (!cliente.telefone_verificado) {
        const estado = estados.get(chatId) || {};
        estado.tela = 'cadastro';
        estado.etapa = 'telefone';
        estado.aguardando = 'telefone';
        estados.set(chatId, estado);
        
        return editOrSend(chatId, null,
            `📱 *Cadastro - Etapa 1/4*\n\n` +
            `Digite seu *telefone* com DDD para receber o código de verificação via WhatsApp.\n\n` +
            `📝 Exemplo: *44999525600*\n\n` +
            `_Digite apenas números_`,
            null
        );
    }
}

// ============ ROUTER DE CALLBACKS ============
async function routerCallback(chatId, userId, data, msgId) {
    const estado = estados.get(userId) || { tela: 'menu' };
    
    // CADASTRO
    if (data === 'cad_iniciar') {
        estado.tela = 'cadastro';
        estado.etapa = 'telefone';
        estado.aguardando = 'telefone';
        estados.set(userId, estado);
        
        return editOrSend(chatId, msgId,
            `📱 *Cadastro - Etapa 1/4*\n\n` +
            `Digite seu *telefone* com DDD para receber o código de verificação via WhatsApp.\n\n` +
            `📝 Exemplo: *44999525600*\n\n` +
            `_Digite apenas números_`,
            null
        );
    }
    
    if (data === 'cad_login') {
        estado.tela = 'cadastro';
        estado.etapa = 'login';
        estado.aguardando = 'login_cpf';
        estados.set(userId, estado);
        
        return editOrSend(chatId, msgId,
            `🔑 *Login*\n\n` +
            `Digite seu *CPF* (apenas números) para recuperar seu cadastro:\n\n` +
            `📝 Exemplo: *12345678900*`,
            null
        );
    }
    
    if (data === 'cad_reenviar_codigo') {
        const resultado = await AuthService.reenviarCodigo(chatId, userId);
        if (resultado.sucesso) {
            await bot.sendMessage(chatId, `📱 *Novo código enviado!*\n\nVerifique seu WhatsApp: *${resultado.telefone}*`);
        } else {
            await bot.sendMessage(chatId, `❌ ${resultado.mensagem}`);
        }
        return;
    }
    
    if (data === 'cad_pular_endereco') {
        await finalizarCadastro(chatId, userId);
        return;
    }
    
    if (data === 'cad_add_endereco') {
        estado.etapa = 'endereco_cep';
        estado.aguardando = 'cep';
        estados.set(userId, estado);
        
        return editOrSend(chatId, msgId,
            `📍 *Cadastro - Endereço*\n\n` +
            `Digite seu *CEP* (apenas números) para preencher automaticamente:\n\n` +
            `📝 Exemplo: *87700000*`,
            null
        );
    }
    
    if (data === 'cad_tipo_pf') {
        estado.tipoCadastro = 'PF';
        estado.aguardando = 'cpf';
        estados.set(userId, estado);
        
        return editOrSend(chatId, msgId,
            `👤 *Cadastro Pessoa Física*\n\n` +
            `Digite seu *CPF* (apenas números):\n\n` +
            `📝 Exemplo: *12345678900*`,
            null
        );
    }
    
    if (data === 'cad_tipo_pj') {
        estado.tipoCadastro = 'PJ';
        estado.aguardando = 'cnpj';
        estados.set(userId, estado);
        
        return editOrSend(chatId, msgId,
            `🏢 *Cadastro Pessoa Jurídica*\n\n` +
            `Digite seu *CNPJ* (apenas números):\n\n` +
            `📝 Exemplo: *12345678000100*`,
            null
        );
    }
    
    // MENU PRINCIPAL
    if (data === 'menu_principal') {
        const db = getDatabase();
        const cliente = db.prepare('SELECT nome FROM clientes WHERE telegram_id = ?').get(userId);
        estados.set(userId, { tela: 'menu' });
        return showMenuPrincipal(chatId, cliente?.nome?.split(' ')[0] || 'Cliente');
    }
    
    if (data === 'menu_categorias') return showCategorias(chatId, msgId);
    if (data === 'menu_carrinho') return showCarrinho(chatId, userId, msgId);
    if (data === 'menu_pedidos') return showPedidos(chatId, userId, msgId);
    if (data === 'menu_perfil') return showPerfil(chatId, userId, msgId);
    if (data === 'menu_favoritos') return showFavoritos(chatId, userId, msgId);
    if (data === 'menu_pesquisar') {
        estado.tela = 'menu';
        estado.aguardando = 'pesquisa';
        estados.set(userId, estado);
        return editOrSend(chatId, msgId, '🔍 Digite o nome do produto:', backButton('menu_categorias'));
    }
    
    // LOJA
    if (data.startsWith('cat_')) return showProdutosPorCategoria(chatId, data.split('_')[1], msgId);
    if (data.startsWith('prod_')) return showDetalheProduto(chatId, userId, data.split('_')[1], msgId);
    if (data.startsWith('addcarr_')) return adicionarAoCarrinho(chatId, userId, data.split('_')[1], msgId);
    if (data.startsWith('fav_')) return toggleFavorito(chatId, userId, data.split('_')[1]);
    
    // CARRINHO
    if (data.startsWith('carr_')) return handleCarrinhoActions(chatId, userId, data, msgId);
    
    // PAGAMENTO
    if (data === 'checkout_iniciar') return iniciarCheckout(chatId, userId, msgId);
    if (data.startsWith('pag_')) return handlePagamentoActions(chatId, userId, data, msgId);
    
    // PEDIDOS
    if (data.startsWith('ped_')) return handlePedidosActions(chatId, userId, data, msgId);
}

// ============ PROCESSAR ENTRADA DE TEXTO ============
async function processarEntradaTexto(chatId, userId, texto, estado) {
    const db = getDatabase();
    
    // ETAPA: TELEFONE
    if (estado.aguardando === 'telefone') {
        const resultado = await AuthService.enviarCodigo(chatId, userId, texto);
        
        if (!resultado.sucesso) {
            return bot.sendMessage(chatId, `❌ ${resultado.mensagem}\n\nDigite novamente:`);
        }
        
        estado.etapa = 'verificacao';
        estado.aguardando = 'codigo';
        estado.telefone = resultado.telefone;
        estados.set(userId, estado);
        
        const kb = {
            inline_keyboard: [
                [{ text: '📩 Reenviar Código', callback_data: 'cad_reenviar_codigo' }]
            ]
        };
        
        return bot.sendMessage(chatId,
            `📱 *Código enviado!*\n\n` +
            `Enviamos um código de 6 dígitos via *WhatsApp* para:\n` +
            `📞 *${resultado.telefone}*\n\n` +
            `📋 *Verifique:*\n` +
            `• WhatsApp\n` +
            `• Notificações\n\n` +
            `_Digite o código recebido:_`,
            { parse_mode: 'Markdown', reply_markup: kb }
        );
    }
    
    // ETAPA: CÓDIGO DE VERIFICAÇÃO
    if (estado.aguardando === 'codigo') {
        const resultado = await AuthService.verificarCodigo(chatId, userId, texto);
        
        if (!resultado.sucesso) {
            return bot.sendMessage(chatId, `❌ ${resultado.mensagem}\n\nTente novamente:`);
        }
        
        if (resultado.cadastroCompleto) {
            // Já tem cadastro completo
            estados.set(userId, { tela: 'menu' });
            const cliente = resultado.cliente;
            await bot.sendMessage(chatId, `✅ *Login realizado com sucesso!*\n\nBem-vindo(a) de volta, *${cliente.nome?.split(' ')[0] || 'Cliente'}*!`, { parse_mode: 'Markdown' });
            return showMenuPrincipal(chatId, cliente.nome?.split(' ')[0] || 'Cliente');
        }
        
        // Precisa completar cadastro
        estado.etapa = 'completar_dados';
        estado.aguardando = 'nome';
        estados.set(userId, estado);
        
        return bot.sendMessage(chatId,
            `✅ *Telefone verificado!*\n\n` +
            `Agora vamos completar seu cadastro.\n\n` +
            `📝 Digite seu *nome completo*:\n` +
            `_Exemplo: João Silva_`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // ETAPA: NOME
    if (estado.aguardando === 'nome') {
        if (texto.length < 3 || texto.split(' ').filter(p => p.length > 0).length < 2) {
            return bot.sendMessage(chatId, '❌ Digite seu *nome e sobrenome*.\n\nExemplo: *João Silva*', { parse_mode: 'Markdown' });
        }
        
        const partes = texto.split(' ');
        const nome = partes[0];
        const sobrenome = partes.slice(1).join(' ');
        
        db.prepare('UPDATE clientes SET nome = ?, sobrenome = ? WHERE telegram_id = ?').run(nome, sobrenome, userId);
        
        estado.aguardando = 'email';
        estados.set(userId, estado);
        
        const kb = {
            inline_keyboard: [
                [{ text: '⏭️ Pular esta etapa', callback_data: 'cad_pular_email' }]
            ]
        };
        
        return bot.sendMessage(chatId,
            `✅ *Nome salvo: ${nome} ${sobrenome}*\n\n` +
            `📧 Agora, digite seu *email* para receber ofertas e novidades:\n\n` +
            `_Ou clique em Pular se não quiser informar_`,
            { parse_mode: 'Markdown', reply_markup: kb }
        );
    }
    
    // ETAPA: EMAIL
    if (estado.aguardando === 'email') {
        const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto);
        if (!emailValido) {
            return bot.sendMessage(chatId, '❌ Email inválido. Digite um email correto ou clique em Pular.');
        }
        
        db.prepare('UPDATE clientes SET email = ? WHERE telegram_id = ?').run(texto.toLowerCase(), userId);
        
        estado.aguardando = 'tipo_cadastro';
        estados.set(userId, estado);
        
        const kb = {
            inline_keyboard: [
                [{ text: '👤 Pessoa Física', callback_data: 'cad_tipo_pf' }],
                [{ text: '🏢 Pessoa Jurídica', callback_data: 'cad_tipo_pj' }],
                [{ text: '⏭️ Pular', callback_data: 'cad_add_endereco' }]
            ]
        };
        
        return bot.sendMessage(chatId,
            `✅ *Email salvo!*\n\n` +
            `Agora, qual o tipo de cadastro?\n\n` +
            `👤 *Pessoa Física* - CPF\n` +
            `🏢 *Pessoa Jurídica* - CNPJ`,
            { parse_mode: 'Markdown', reply_markup: kb }
        );
    }
    
    // ETAPA: CPF
    if (estado.aguardando === 'cpf') {
        const cpfLimpo = texto.replace(/\D/g, '');
        const { validarCPF } = require('../../utils/helpers');
        
        if (!validarCPF(cpfLimpo)) {
            return bot.sendMessage(chatId, '❌ CPF inválido. Digite novamente (apenas números):');
        }
        
        // Verifica se CPF já está em uso
        const cpfExiste = db.prepare('SELECT id FROM clientes WHERE cpf = ? AND telegram_id != ?').get(cpfLimpo, userId);
        if (cpfExiste) {
            return bot.sendMessage(chatId, '❌ Este CPF já está cadastrado em outra conta.');
        }
        
        db.prepare('UPDATE clientes SET tipo = ?, cpf = ? WHERE telegram_id = ?').run('PF', cpfLimpo, userId);
        
        estado.aguardando = 'data_nascimento';
        estados.set(userId, estado);
        
        return bot.sendMessage(chatId,
            `✅ *CPF salvo!*\n\n` +
            `📅 Digite sua *data de nascimento*:\n\n` +
            `📝 Formato: *DD/MM/AAAA*\n` +
            `_Exemplo: 01/01/1990_`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // ETAPA: CNPJ
    if (estado.aguardando === 'cnpj') {
        const cnpjLimpo = texto.replace(/\D/g, '');
        const { validarCNPJ } = require('../../utils/helpers');
        
        if (!validarCNPJ(cnpjLimpo)) {
            return bot.sendMessage(chatId, '❌ CNPJ inválido. Digite novamente (apenas números):');
        }
        
        db.prepare('UPDATE clientes SET tipo = ?, cnpj = ? WHERE telegram_id = ?').run('PJ', cnpjLimpo, userId);
        
        estado.aguardando = 'razao_social';
        estados.set(userId, estado);
        
        return bot.sendMessage(chatId, '✅ *CNPJ salvo!*\n\n🏢 Digite a *Razão Social*:', { parse_mode: 'Markdown' });
    }
    
    // ETAPA: RAZÃO SOCIAL (PJ)
    if (estado.aguardando === 'razao_social') {
        if (texto.length < 3) return bot.sendMessage(chatId, '❌ Razão social muito curta.');
        db.prepare('UPDATE clientes SET razao_social = ? WHERE telegram_id = ?').run(texto, userId);
        
        estado.aguardando = 'nome_fantasia';
        estados.set(userId, estado);
        return bot.sendMessage(chatId, '🏪 Digite o *Nome Fantasia*:', { parse_mode: 'Markdown' });
    }
    
    // ETAPA: NOME FANTASIA (PJ)
    if (estado.aguardando === 'nome_fantasia') {
        db.prepare('UPDATE clientes SET nome_fantasia = ? WHERE telegram_id = ?').run(texto, userId);
        
        estado.aguardando = 'responsavel';
        estados.set(userId, estado);
        return bot.sendMessage(chatId, '👤 Digite o nome do *Responsável*:', { parse_mode: 'Markdown' });
    }
    
    // ETAPA: RESPONSÁVEL (PJ)
    if (estado.aguardando === 'responsavel') {
        db.prepare('UPDATE clientes SET responsavel = ? WHERE telegram_id = ?').run(texto, userId);
        
        // Pula para endereço
        estado.etapa = 'endereco';
        estado.aguardando = 'cep';
        estados.set(userId, estado);
        
        return bot.sendMessage(chatId,
            `✅ *Dados da empresa salvos!*\n\n` +
            `📍 Agora, digite seu *CEP* para cadastrar o endereço de entrega:\n\n` +
            `📝 Exemplo: *87700000*`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // ETAPA: DATA DE NASCIMENTO
    if (estado.aguardando === 'data_nascimento') {
        const partes = texto.split('/');
        if (partes.length !== 3) return bot.sendMessage(chatId, '❌ Formato inválido. Use DD/MM/AAAA');
        
        const dia = parseInt(partes[0]), mes = parseInt(partes[1]), ano = parseInt(partes[2]);
        const idade = new Date().getFullYear() - ano;
        
        if (idade < 16) return bot.sendMessage(chatId, '❌ Idade mínima: 16 anos.');
        if (idade > 120) return bot.sendMessage(chatId, '❌ Data inválida.');
        
        db.prepare('UPDATE clientes SET data_nascimento = ? WHERE telegram_id = ?').run(texto, userId);
        
        estado.aguardando = 'sexo';
        estados.set(userId, estado);
        
        const kb = {
            inline_keyboard: [
                [{ text: '👨 Masculino', callback_data: 'cad_sexo_m' }],
                [{ text: '👩 Feminino', callback_data: 'cad_sexo_f' }],
                [{ text: '⚧ Outro', callback_data: 'cad_sexo_o' }]
            ]
        };
        
        return bot.sendMessage(chatId,
            `✅ *Data salva!*\n\n` +
            `⚧ Selecione seu *sexo*:`,
            { parse_mode: 'Markdown', reply_markup: kb }
        );
    }
    
    // ETAPA: CEP
    if (estado.aguardando === 'cep') {
        const cepLimpo = texto.replace(/\D/g, '');
        if (cepLimpo.length !== 8) return bot.sendMessage(chatId, '❌ CEP deve ter 8 dígitos.');
        
        const resultado = await EnderecoService.buscarCEP(cepLimpo);
        if (!resultado.sucesso) return bot.sendMessage(chatId, `❌ ${resultado.mensagem}\n\nDigite novamente ou use /pular`);
        
        estado.dadosCEP = resultado.dados;
        estado.aguardando = 'numero';
        estados.set(userId, estado);
        
        const { logradouro, bairro, cidade, estado: uf } = resultado.dados;
        
        return bot.sendMessage(chatId,
            `📍 *Endereço encontrado:*\n\n` +
            `🏠 ${logradouro}\n` +
            `🏘️ ${bairro}\n` +
            `🏙️ ${cidade}/${uf}\n\n` +
            `Agora, digite o *número* da residência:`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // ETAPA: NÚMERO
    if (estado.aguardando === 'numero') {
        const { cep, logradouro, bairro, cidade, estado: uf } = estado.dadosCEP;
        
        // Salva endereço
        await EnderecoService.salvarEndereco(userId, {
            apelido: 'Principal',
            cep, logradouro, numero: texto,
            bairro, cidade, estado: uf,
            principal: 1
        });
        
        await finalizarCadastro(chatId, userId);
        return;
    }
    
    // ETAPA: LOGIN CPF
    if (estado.aguardando === 'login_cpf') {
        const resultado = await AuthService.loginCPF(chatId, userId, texto);
        
        if (!resultado.sucesso) {
            return bot.sendMessage(chatId, `❌ ${resultado.mensagem}`);
        }
        
        estados.set(userId, { tela: 'menu' });
        const cliente = resultado.cliente;
        await bot.sendMessage(chatId, `✅ *Login realizado!*\n\nBem-vindo(a), *${cliente.nome?.split(' ')[0] || 'Cliente'}*!`, { parse_mode: 'Markdown' });
        return showMenuPrincipal(chatId, cliente.nome?.split(' ')[0] || 'Cliente');
    }
    
    // PESQUISA
    if (estado.aguardando === 'pesquisa') {
        estado.aguardando = null;
        estados.set(userId, estado);
        
        const resultado = await LojaService.pesquisarProdutos(texto);
        
        if (resultado.produtos.length === 0) {
            return bot.sendMessage(chatId, `🔍 Nenhum produto encontrado para "${texto}".`);
        }
        
        const kb = { inline_keyboard: [] };
        for (const p of resultado.produtos) {
            const preco = p.preco_promocional || p.preco;
            kb.inline_keyboard.push([{ text: `${p.nome} - ${formatarMoeda(preco)}`, callback_data: `prod_${p.id}` }]);
        }
        kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_categorias' }]);
        
        return bot.sendMessage(chatId, `🔍 *Resultados para "${texto}"*\n\n${resultado.total} produtos encontrados:`, { parse_mode: 'Markdown', reply_markup: kb });
    }
}

// ============ PROCESSAR LOCALIZAÇÃO ============
async function processarLocalizacao(chatId, userId, location) {
    const { latitude, longitude } = location;
    const db = getDatabase();
    
    db.prepare('UPDATE enderecos SET latitude = ?, longitude = ? WHERE cliente_id = (SELECT id FROM clientes WHERE telegram_id = ?) AND principal = 1').run(latitude, longitude, userId);
    
    await bot.sendMessage(chatId, '📍 *Localização salva!*', { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
    await finalizarCadastro(chatId, userId);
}

// ============ FINALIZAR CADASTRO ============
async function finalizarCadastro(chatId, userId) {
    const db = getDatabase();
    const cliente = db.prepare('SELECT nome, sobrenome FROM clientes WHERE telegram_id = ?').get(userId);
    
    db.prepare('UPDATE clientes SET etapa_cadastro = ? WHERE telegram_id = ?').run('completo', userId);
    
    estados.set(userId, { tela: 'menu' });
    
    const nomeCompleto = `${cliente.nome} ${cliente.sobrenome || ''}`.trim();
    
    await bot.sendMessage(chatId,
        `🎉 *CADASTRO CONCLUÍDO!*\n\n` +
        `Bem-vindo(a), *${nomeCompleto.split(' ')[0]}*!\n\n` +
        `🛒 Agora você pode:\n` +
        `• Ver produtos por categoria\n` +
        `• Pesquisar itens\n` +
        `• Adicionar ao carrinho\n` +
        `• Finalizar compras com PIX\n\n` +
        `_Aproveite suas compras!_ 🛍️`,
        { parse_mode: 'Markdown' }
    );
    
    await showMenuPrincipal(chatId, nomeCompleto.split(' ')[0]);
}

// ============ MENU PRINCIPAL ============
async function showMenuPrincipal(chatId, nome) {
    const db = getDatabase();
    const configs = db.prepare("SELECT valor FROM configs WHERE chave = 'banner_mercado'").get();
    
    const mensagem = 
        `🛒 *${process.env.NOME_MERCADO || 'Supermercado Telegram'}*\n\n` +
        `👋 Olá, *${nome}*!\n\n` +
        `📋 *Menu Principal*\n` +
        `Escolha uma opção:`;
    
    const kb = {
        inline_keyboard: [
            [{ text: '🛍️ Ver Produtos', callback_data: 'menu_categorias' }],
            [{ text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }, { text: '❤️ Favoritos', callback_data: 'menu_favoritos' }],
            [{ text: '🛒 Meu Carrinho', callback_data: 'menu_carrinho' }],
            [{ text: '📦 Meus Pedidos', callback_data: 'menu_pedidos' }],
            [{ text: '👤 Meu Perfil', callback_data: 'menu_perfil' }],
            [{ text: '📞 Atendimento', callback_data: 'menu_atendimento' }]
        ]
    };
    
    if (configs?.valor) {
        await bot.sendPhoto(chatId, configs.valor, { caption: mensagem, parse_mode: 'Markdown', reply_markup: kb });
    } else {
        await editOrSend(chatId, null, mensagem, kb);
    }
}

// ============ STUBS DAS TELAS PRINCIPAIS ============
async function showCategorias(chatId, msgId) {
    const categorias = await LojaService.getCategorias();
    const kb = { inline_keyboard: [] };
    
    for (const cat of categorias) {
        kb.inline_keyboard.push([{ text: `${cat.emoji} ${cat.nome}`, callback_data: `cat_${cat.id}` }]);
    }
    kb.inline_keyboard.push([{ text: '🔍 Pesquisar', callback_data: 'menu_pesquisar' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    
    await editOrSend(chatId, msgId, '🛍️ *CATEGORIAS*\n\nEscolha uma categoria:', kb);
}

async function showProdutosPorCategoria(chatId, catId, msgId) {
    const db = getDatabase();
    const cat = db.prepare('SELECT * FROM categorias WHERE id = ?').get(catId);
    const { produtos } = await LojaService.getProdutosPorCategoria(catId);
    
    const kb = { inline_keyboard: [] };
    for (const p of produtos) {
        const preco = p.preco_promocional || p.preco;
        kb.inline_keyboard.push([{ text: `${p.nome} - ${formatarMoeda(preco)}`, callback_data: `prod_${p.id}` }]);
    }
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_categorias' }]);
    
    await editOrSend(chatId, msgId, `${cat.emoji} *${cat.nome}*\n\n${produtos.length} produtos:`, kb);
}

async function showDetalheProduto(chatId, userId, prodId, msgId) {
    const produto = await LojaService.getProduto(prodId);
    if (!produto) return editOrSend(chatId, msgId, '❌ Produto não encontrado.', backButton('menu_categorias'));
    
    const preco = produto.preco_promocional || produto.preco;
    let msg = `📦 *${produto.nome}*\n\n`;
    if (produto.marca) msg += `🏷 Marca: ${produto.marca}\n`;
    if (produto.descricao) msg += `📝 ${produto.descricao}\n`;
    if (produto.peso) msg += `⚖️ ${produto.peso}\n`;
    msg += `\n💰 *Preço: ${formatarMoeda(preco)}*`;
    if (produto.preco_promocional) msg += `\n🔥 De: ~~${formatarMoeda(produto.preco)}~~`;
    msg += `\n📦 Estoque: ${produto.estoque} ${produto.unidade || 'un'}`;
    
    const kb = { inline_keyboard: [
        [{ text: `🛒 Adicionar ao Carrinho`, callback_data: `addcarr_${prodId}` }],
        [{ text: '❤️ Favoritar', callback_data: `fav_${prodId}` }],
        [{ text: '⬅️ Voltar', callback_data: `cat_${produto.categoria_id}` }]
    ]};
    
    if (produto.foto) {
        await bot.sendPhoto(chatId, produto.foto, { caption: msg, parse_mode: 'Markdown', reply_markup: kb });
    } else {
        await editOrSend(chatId, msgId, msg, kb);
    }
}

async function adicionarAoCarrinho(chatId, userId, prodId, msgId) {
    const result = await CarrinhoService.adicionar(userId, prodId);
    if (result.sucesso) {
        await bot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text: result.mensagem });
    } else {
        await bot.sendMessage(chatId, `❌ ${result.mensagem}`);
    }
}

async function toggleFavorito(chatId, userId, prodId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    const fav = db.prepare('SELECT * FROM favoritos WHERE cliente_id = ? AND produto_id = ?').get(cli.id, prodId);
    
    if (fav) db.prepare('DELETE FROM favoritos WHERE cliente_id = ? AND produto_id = ?').run(cli.id, prodId);
    else db.prepare('INSERT INTO favoritos (cliente_id, produto_id) VALUES (?, ?)').run(cli.id, prodId);
}

async function showCarrinho(chatId, userId, msgId) {
    const carrinho = await CarrinhoService.listar(userId);
    if (carrinho.itens.length === 0) {
        return editOrSend(chatId, msgId, '🛒 *Carrinho Vazio*\n\nQue tal adicionar produtos?', { inline_keyboard: [[{ text: '🛍️ Ver Produtos', callback_data: 'menu_categorias' }], [{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]] });
    }
    
    let msg = '🛒 *SEU CARRINHO*\n\n';
    const kb = { inline_keyboard: [] };
    
    for (const item of carrinho.itens) {
        const preco = item.preco_promocional || item.preco;
        msg += `📦 ${item.nome}\n`;
        msg += `   Qtd: ${item.quantidade} | 💰 ${formatarMoeda(preco * item.quantidade)}\n`;
        if (item.comentario) msg += `   📝 "${item.comentario}"\n`;
        msg += '\n';
        kb.inline_keyboard.push([{ text: `🗑 Remover ${item.nome}`, callback_data: `carr_del_${item.id}` }]);
    }
    
    msg += `💰 *Total: ${formatarMoeda(carrinho.total)}*`;
    kb.inline_keyboard.push([{ text: '💳 Finalizar Pedido', callback_data: 'checkout_iniciar' }]);
    kb.inline_keyboard.push([{ text: '🛍️ Continuar Comprando', callback_data: 'menu_categorias' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    
    await editOrSend(chatId, msgId, msg, kb);
}

async function handleCarrinhoActions(chatId, userId, data, msgId) {
    if (data.startsWith('carr_del_')) {
        await CarrinhoService.remover(userId, data.split('_')[2]);
        await showCarrinho(chatId, userId, msgId);
    }
    if (data === 'carr_limpar') {
        await CarrinhoService.limpar(userId);
        await showCarrinho(chatId, userId, msgId);
    }
}

async function iniciarCheckout(chatId, userId, msgId) {
    const result = await CheckoutService.iniciarCheckout(userId);
    if (!result.sucesso) return bot.sendMessage(chatId, `❌ ${result.mensagem}`);
    
    const kb = { inline_keyboard: [
        [{ text: '💳 PIX', callback_data: 'pag_pix' }],
        [{ text: '⬅️ Voltar', callback_data: 'menu_carrinho' }]
    ]};
    
    await editOrSend(chatId, msgId, `💳 *Finalizar Pedido*\n\n💰 Total: *${formatarMoeda(result.total)}*\n\nEscolha a forma de pagamento:`, kb);
}

async function handlePagamentoActions(chatId, userId, data, msgId) {
    if (data === 'pag_pix') {
        const result = await CheckoutService.finalizarPedido(userId, 'pix');
        if (!result.sucesso) return bot.sendMessage(chatId, `❌ ${result.mensagem}`);
        
        await bot.sendPhoto(chatId, result.pagamento.qrBuffer, {
            caption: `💳 *PAGAMENTO PIX*\n\n📦 Pedido: ${result.numero}\n💰 Valor: ${formatarMoeda(result.total)}\n\n📋 \`${result.pagamento.copia_cola}\`\n\n⏰ Expira em 30 min`,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '🔄 Verificar Pagamento', callback_data: `pag_check_${result.pedidoId}_${result.pagamento.payment_id}` }]] }
        });
    }
    
    if (data.startsWith('pag_check_')) {
        const [, , pedidoId, paymentId] = data.split('_');
        const result = await PagamentoClienteService.verificarPagamento(pedidoId);
        if (result.aprovado) {
            await bot.sendMessage(chatId, '✅ *Pagamento aprovado!*\nSeu pedido está sendo preparado.');
        } else {
            await bot.sendMessage(chatId, '⏳ Aguardando pagamento...');
        }
    }
}

async function showPedidos(chatId, userId, msgId) {
    const { pedidos } = await PedidosService.listar(userId);
    if (pedidos.length === 0) return editOrSend(chatId, msgId, '📦 Nenhum pedido!', backButton('menu_principal'));
    
    const kb = { inline_keyboard: [] };
    const statusEmoji = { recebido:'📥', confirmado:'✅', separando:'📦', embalando:'🎁', entrega:'🛵', entregue:'🏠', cancelado:'❌' };
    
    for (const p of pedidos) {
        kb.inline_keyboard.push([{ text: `${statusEmoji[p.status]||'📋'} ${p.numero} - ${formatarMoeda(p.total)}`, callback_data: `ped_ver_${p.id}` }]);
    }
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    
    await editOrSend(chatId, msgId, '📦 *MEUS PEDIDOS*\n\nSelecione:', kb);
}

async function handlePedidosActions(chatId, userId, data, msgId) {
    if (data.startsWith('ped_ver_')) {
        const detalhes = await PedidosService.detalhes(userId, data.split('_')[2]);
        if (!detalhes) return;
        
        let msg = `📦 *${detalhes.numero}*\n📊 ${detalhes.status}\n💳 ${detalhes.pagamento_status}\n📅 ${detalhes.data_pedido}\n\n`;
        for (const i of detalhes.itens) msg += `${i.quantidade}x ${i.produto_nome} - ${formatarMoeda(i.preco_unitario * i.quantidade)}\n`;
        msg += `\n💰 Total: ${formatarMoeda(detalhes.total)}`;
        
        await editOrSend(chatId, msgId, msg, backButton('menu_pedidos'));
    }
}

async function showPerfil(chatId, userId, msgId) {
    const perfil = await PerfilService.getPerfil(userId);
    if (!perfil) return editOrSend(chatId, msgId, '❌ Perfil não encontrado.', backButton('menu_principal'));
    
    let msg = `👤 *MEU PERFIL*\n\n📝 ${perfil.nome} ${perfil.sobrenome||''}\n📧 ${perfil.email||'N/A'}\n📱 ${perfil.telefone_formatado||'N/A'}\n`;
    if (perfil.cpf) msg += `🔢 CPF: ${perfil.cpf_formatado}\n`;
    msg += `\n📦 Pedidos: ${perfil.totalPedidos}\n💰 Gasto: ${perfil.total_gasto_formatado}\n⭐ Pontos: ${perfil.pontos_fidelidade}`;
    
    const kb = { inline_keyboard: [
        [{ text: '✏️ Editar Dados', callback_data: 'perfil_editar' }],
        [{ text: '📍 Endereços', callback_data: 'perfil_enderecos' }],
        [{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]
    ]};
    
    await editOrSend(chatId, msgId, msg, kb);
}

async function showFavoritos(chatId, userId, msgId) {
    const db = getDatabase();
    const cli = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
    const favs = db.prepare('SELECT f.*, p.nome, p.preco, p.preco_promocional FROM favoritos f JOIN produtos p ON f.produto_id = p.id WHERE f.cliente_id = ?').all(cli.id);
    
    if (favs.length === 0) return editOrSend(chatId, msgId, '❤️ Nenhum favorito!', { inline_keyboard: [[{ text: '🛍️ Ver Produtos', callback_data: 'menu_categorias' }], [{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]] });
    
    const kb = { inline_keyboard: [] };
    for (const f of favs) {
        const preco = f.preco_promocional || f.preco;
        kb.inline_keyboard.push([{ text: `${f.nome} - ${formatarMoeda(preco)}`, callback_data: `prod_${f.produto_id}` }]);
    }
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'menu_principal' }]);
    
    await editOrSend(chatId, msgId, '❤️ *FAVORITOS*', kb);
}

// ============ HELPERS ============
async function editOrSend(chatId, msgId, text, kb) {
    try {
        if (msgId) {
            await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb });
        } else {
            const sent = await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
            msgTracker.set(chatId, sent.message_id);
        }
    } catch (e) {
        const sent = await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
        msgTracker.set(chatId, sent.message_id);
    }
}

function backButton(data) {
    return { inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: data }]] };
}

async function limparMensagensAntigas(chatId, userId) {
    // Não faz nada por enquanto - pode ser implementado depois
}

function getBot() { return bot; }

module.exports = { startClientBot, getBot };
