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
const EntregadoresService = require('../../services/entregadores');
const NotificacoesService = require('../../services/notificacoes');
const AgendamentoService = require('../../services/agendamento');

let adminBot = null;
const estadosAdmin = new Map();
const adminMsg = new Map();

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
    
    logger.info('👑 Painel Admin 100% configurado');
}

// ============ DASHBOARD ============
async function showDashboard(chatId, userId) {
    const stats = await DashboardAdmin.getEstatisticas();
    
    const msg = `📊 *PAINEL ADMINISTRATIVO*\n\n` +
        `👥 Clientes: *${stats.clientes.total}*\n` +
        `📦 Pedidos: *${stats.pedidos.total}* (${stats.pedidos.pendentes} pendentes)\n` +
        `💰 Faturamento: *${stats.faturamento.total}*\n` +
        `📅 Mês: *${stats.faturamento.mes}*\n` +
        `⚠️ Estoque Baixo: *${stats.produtos.estoqueBaixo}*\n\n` +
        `Selecione:`;
    
    const kb = { inline_keyboard: [
        [{ text: '📦 Produtos', callback_data: 'adm_produtos' }, { text: '📂 Categorias', callback_data: 'adm_categorias' }],
        [{ text: '📋 Pedidos', callback_data: 'adm_pedidos' }, { text: '👥 Clientes', callback_data: 'adm_clientes' }],
        [{ text: '🎉 Promoções', callback_data: 'adm_promocoes' }, { text: '🎟 Cupons', callback_data: 'adm_cupons' }],
        [{ text: '🛵 Entregadores', callback_data: 'adm_entregadores' }, { text: '🕐 Horários', callback_data: 'adm_horarios' }],
        [{ text: '📊 Relatórios', callback_data: 'adm_relatorios' }, { text: '⚙️ Config', callback_data: 'adm_config' }],
        [{ text: '📢 Broadcast', callback_data: 'adm_broadcast' }, { text: '🔔 Notificar', callback_data: 'adm_notificar' }]
    ]};
    
    await editOrSend(chatId, null, msg, kb);
}

// ============ ROUTER ============
async function router(chatId, userId, data, msgId) {
    adminMsg.set(userId, { chatId, msgId });
    
    if (data === 'adm_voltar') return showDashboard(chatId, userId);
    if (data === 'adm_broadcast') { estadosAdmin.set(userId, { aguardando: 'broadcast' }); return editOrSend(chatId, msgId, '📢 Digite a mensagem para TODOS os clientes:', backButton('adm_voltar')); }
    if (data === 'adm_notificar') { estadosAdmin.set(userId, { aguardando: 'notificar_promocao' }); return editOrSend(chatId, msgId, '🔔 Digite a mensagem da promoção:', backButton('adm_voltar')); }
    
    // CATEGORIAS
    if (data === 'adm_categorias') return showCategorias(chatId, msgId);
    if (data === 'adm_cat_nova') { estadosAdmin.set(userId, { aguardando: 'nova_categoria' }); return editOrSend(chatId, msgId, '📂 Digite: Nome, Emoji\nEx: Alimentos, 🍎', backButton('adm_categorias')); }
    if (data.startsWith('adm_cat_edit_')) return showEditarCategoria(chatId, data.split('_')[3], msgId);
    if (data.startsWith('adm_cat_toggle_')) { toggleCategoria(data.split('_')[3]); await alert(chatId, msgId, '✅ Status alterado!'); return showCategorias(chatId, msgId); }
    if (data.startsWith('adm_cat_del_')) { getDatabase().prepare('DELETE FROM categorias WHERE id=?').run(data.split('_')[3]); await alert(chatId, msgId, '🗑 Excluída!'); return showCategorias(chatId, msgId); }
    if (data.startsWith('adm_cat_setnome_')) { estadosAdmin.set(userId, { aguardando: `cat_nome_${data.split('_')[3]}` }); return editOrSend(chatId, msgId, 'Digite o novo nome:', backButton(`adm_cat_edit_${data.split('_')[3]}`)); }
    if (data.startsWith('adm_cat_setemoji_')) { estadosAdmin.set(userId, { aguardando: `cat_emoji_${data.split('_')[3]}` }); return editOrSend(chatId, msgId, 'Envie o novo emoji:', backButton(`adm_cat_edit_${data.split('_')[3]}`)); }
    
    // PRODUTOS
    if (data === 'adm_produtos') return showProdutos(chatId, msgId);
    if (data === 'adm_prod_novo') { estadosAdmin.set(userId, { aguardando: 'novo_produto' }); return editOrSend(chatId, msgId, '📦 Digite:\nNome, Categoria ID, Preço, Estoque, Descrição\n\nEx: Arroz, 1, 25.90, 100, Arroz branco 5kg', backButton('adm_produtos')); }
    if (data.startsWith('adm_prod_edit_')) return showEditarProduto(chatId, data.split('_')[3], msgId);
    if (data.startsWith('adm_prod_toggle_')) { toggleProduto(data.split('_')[3]); await alert(chatId, msgId, '✅ Status alterado!'); return showEditarProduto(chatId, data.split('_')[3], msgId); }
    if (data.startsWith('adm_prod_del_')) { const id = data.split('_')[3]; getDatabase().prepare('DELETE FROM favoritos WHERE produto_id=?').run(id); getDatabase().prepare('DELETE FROM carrinhos WHERE produto_id=?').run(id); getDatabase().prepare('DELETE FROM produtos WHERE id=?').run(id); await alert(chatId, msgId, '🗑 Excluído!'); return showProdutos(chatId, msgId); }
    if (data.startsWith('adm_prod_set')) { handleProdutoSet(userId, data, chatId, msgId); return; }
    
    // PEDIDOS
    if (data === 'adm_pedidos') return showPedidos(chatId, msgId, 'pendentes');
    if (data === 'adm_ped_todos') return showPedidos(chatId, msgId, 'todos');
    if (data === 'adm_ped_hoje') return showPedidos(chatId, msgId, 'hoje');
    if (data === 'adm_ped_entregues') return showPedidos(chatId, msgId, 'entregues');
    if (data.startsWith('adm_ped_ver_')) return showDetalhePedido(chatId, data.split('_')[3], msgId);
    if (data.startsWith('adm_ped_status_')) { const [_, __, ___, status, id] = data.split('_'); await PedidosAdmin.alterarStatus(id, status); await NotificacoesService.notificarStatusPedido(id, status); await alert(chatId, msgId, `✅ Status: ${status}`); return showDetalhePedido(chatId, id, msgId); }
    if (data.startsWith('adm_ped_cancelar_')) { await PedidosAdmin.alterarStatus(data.split('_')[3], 'cancelado'); await NotificacoesService.notificarStatusPedido(data.split('_')[3], 'cancelado'); await alert(chatId, msgId, '❌ Cancelado'); return showDetalhePedido(chatId, data.split('_')[3], msgId); }
    if (data.startsWith('adm_ped_imprimir_')) { const texto = await PedidosAdmin.imprimir(data.split('_')[3]); if (texto) await adminBot.sendMessage(chatId, texto, { parse_mode: 'Markdown' }); return; }
    if (data.startsWith('adm_ped_entregador_')) { estadosAdmin.set(userId, { aguardando: `entregador_pedido_${data.split('_')[3]}` }); const entregadores = await EntregadoresService.listar(); let msg = '🛵 *ENTREGADORES*\n\n'; const kb = { inline_keyboard: [] }; for (const e of entregadores) { msg += `${e.ativo ? '✅' : '❌'} ${e.nome} - ${e.veiculo}\n`; kb.inline_keyboard.push([{ text: `${e.nome}`, callback_data: `adm_ped_atribuir_${data.split('_')[3]}_${e.id}` }]); } kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: `adm_ped_ver_${data.split('_')[3]}` }]); return editOrSend(chatId, msgId, msg, kb); }
    if (data.startsWith('adm_ped_atribuir_')) { const [_, __, ___, pedId, entId] = data.split('_'); await EntregadoresService.atribuirEntrega(pedId, entId); await alert(chatId, msgId, '✅ Entregador atribuído!'); return showDetalhePedido(chatId, pedId, msgId); }
    
    // CLIENTES
    if (data === 'adm_clientes') return showClientes(chatId, msgId);
    if (data.startsWith('adm_cli_ver_')) return showDetalheCliente(chatId, data.split('_')[3], msgId);
    if (data.startsWith('adm_cli_toggle_')) { await ClientesAdmin.toggleBloqueio(data.split('_')[3]); await alert(chatId, msgId, '✅ Status alterado!'); return showDetalheCliente(chatId, data.split('_')[3], msgId); }
    if (data.startsWith('adm_cli_msg_')) { estadosAdmin.set(userId, { aguardando: `msg_cliente_${data.split('_')[3]}` }); return editOrSend(chatId, msgId, '📝 Digite a mensagem:', backButton(`adm_cli_ver_${data.split('_')[3]}`)); }
    
    // PROMOÇÕES
    if (data === 'adm_promocoes') return showPromocoes(chatId, msgId);
    if (data === 'adm_promo_nova') { estadosAdmin.set(userId, { aguardando: 'nova_promocao' }); return editOrSend(chatId, msgId, '🎉 Digite:\nNome, Tipo (percentual/fixo), Valor, Categoria ID (ou 0), Produto ID (ou 0)\n\nEx: Queima, percentual, 20, 1, 0', backButton('adm_promocoes')); }
    if (data.startsWith('adm_promo_toggle_')) { await PromocoesAdmin.toggle(data.split('_')[3]); await alert(chatId, msgId, '✅ Status alterado!'); return showPromocoes(chatId, msgId); }
    if (data.startsWith('adm_promo_del_')) { await PromocoesAdmin.excluir(data.split('_')[3]); await alert(chatId, msgId, '🗑 Excluída!'); return showPromocoes(chatId, msgId); }
    
    // CUPONS
    if (data === 'adm_cupons') return showCupons(chatId, msgId);
    if (data === 'adm_cupom_novo') { estadosAdmin.set(userId, { aguardando: 'novo_cupom' }); return editOrSend(chatId, msgId, '🎟 Digite:\nCódigo, Tipo, Valor, Usos, Dias\n\nEx: PIZZA10, percentual, 10, 100, 30', backButton('adm_cupons')); }
    if (data.startsWith('adm_cupom_toggle_')) { await CuponsAdmin.toggle(data.split('_')[3]); await alert(chatId, msgId, '✅ Status alterado!'); return showCupons(chatId, msgId); }
    if (data.startsWith('adm_cupom_del_')) { await CuponsAdmin.excluir(data.split('_')[3]); await alert(chatId, msgId, '🗑 Excluído!'); return showCupons(chatId, msgId); }
    if (data === 'adm_cupom_lote') { estadosAdmin.set(userId, { aguardando: 'lote_cupons' }); return editOrSend(chatId, msgId, '🎟 Digite:\nPrefixo, Quantidade, Tipo, Valor, Usos, Dias\n\nEx: PROMO, 50, percentual, 15, 1, 30', backButton('adm_cupons')); }
    
    // ENTREGADORES
    if (data === 'adm_entregadores') return showEntregadores(chatId, msgId);
    if (data === 'adm_entregador_novo') { estadosAdmin.set(userId, { aguardando: 'novo_entregador' }); return editOrSend(chatId, msgId, '🛵 Digite:\nNome, Telefone, Veículo, Placa\n\nEx: João, 44999525600, Moto, ABC1234', backButton('adm_entregadores')); }
    if (data.startsWith('adm_entregador_toggle_')) { await EntregadoresService.toggleEntregador(data.split('_')[3]); await alert(chatId, msgId, '✅ Status alterado!'); return showEntregadores(chatId, msgId); }
    
    // HORÁRIOS
    if (data === 'adm_horarios') return showHorarios(chatId, msgId);
    if (data === 'adm_horario_add') { estadosAdmin.set(userId, { aguardando: 'add_horario' }); return editOrSend(chatId, msgId, '🕐 Digite:\nDia (1-7), Horário\n\nEx: 1, 08:00-09:00\n\n1=Dom 2=Seg 3=Ter 4=Qua 5=Qui 6=Sex 7=Sáb', backButton('adm_horarios')); }
    if (data.startsWith('adm_horario_del_')) { const [_, __, ___, dia, hora] = data.split('_'); await AgendamentoService.removerHorario(parseInt(dia), hora); await alert(chatId, msgId, '🗑 Removido!'); return showHorarios(chatId, msgId); }
    
    // RELATÓRIOS
    if (data === 'adm_relatorios') return showRelatorios(chatId, msgId);
    if (data === 'adm_rel_vendas') { const r = await RelatoriosAdmin.vendas('mes'); let msg = '📊 *VENDAS DO MÊS*\n\n'; msg += `📦 Pedidos: ${r.resumo.totalPedidos}\n`; msg += `💰 Faturamento: ${r.resumo.faturamento}\n`; msg += `🎯 Ticket Médio: ${r.resumo.ticketMedio}\n`; await editOrSend(chatId, msgId, msg, backButton('adm_relatorios')); }
    if (data === 'adm_rel_produtos') { const r = await RelatoriosAdmin.produtos('mes'); let msg = '📦 *TOP 10 PRODUTOS*\n\n'; r.maisVendidos.slice(0,10).forEach((p,i) => msg += `${i+1}. ${p.produto_nome}: ${p.total_unidades}x - ${formatarMoeda(p.receita)}\n`); await editOrSend(chatId, msgId, msg, backButton('adm_relatorios')); }
    if (data === 'adm_rel_clientes') { const r = await RelatoriosAdmin.clientes(); let msg = '👥 *TOP CLIENTES*\n\n'; r.fidelidade.slice(0,10).forEach((c,i) => msg += `${i+1}. ${c.nome}: ${formatarMoeda(c.total_gasto)} (${c.pontos_fidelidade} pts)\n`); await editOrSend(chatId, msgId, msg, backButton('adm_relatorios')); }
    if (data === 'adm_rel_financeiro') { const r = await RelatoriosAdmin.financeiro('mes'); let msg = '💰 *FINANCEIRO*\n\n'; msg += `💳 PIX: ${r.metodos.pix}\n`; msg += `💳 Cartão: ${r.metodos.cartao}\n`; msg += `💵 Dinheiro: ${r.metodos.dinheiro}\n`; msg += `🚚 Taxas: ${r.taxasEntrega}\n`; msg += `🎟 Cupons: ${r.cupons.valor}\n`; msg += `\n💰 Total: ${r.total}`; await editOrSend(chatId, msgId, msg, backButton('adm_relatorios')); }
    if (data === 'adm_rel_pdf') { const buffer = await RelatoriosAdmin.gerarPDF(); if (buffer) await adminBot.sendDocument(chatId, buffer, {}, { filename: `relatorio_${new Date().toISOString().slice(0,10)}.pdf`, caption: '📊 Relatório Mensal' }); }
    
    // CONFIG
    if (data === 'adm_config') return showConfig(chatId, msgId);
    if (data === 'adm_cfg_backup') { const r = await ConfigAdmin.backup(); await alert(chatId, msgId, r.mensagem); }
    if (data.startsWith('adm_cfg_set_')) { const chave = data.split('_')[3]; estadosAdmin.set(userId, { aguardando: `cfg_${chave}` }); const nomes = { nome_mercado:'Nome', taxa_entrega:'Taxa', pedido_minimo:'Mínimo', chave_pix:'PIX', telefone:'Tel', tempo_expiracao_pix:'Expiração PIX (min)' }; return editOrSend(chatId, msgId, `Digite o valor para *${nomes[chave]||chave}*:`, backButton('adm_config')); }
}

// ============ HANDLERS DE TEXTO ============
async function handleTextInput(chatId, userId, texto) {
    const db = getDatabase();
    const est = estadosAdmin.get(userId);
    if (!est || !est.aguardando) return;
    
    const ag = est.aguardando;
    const partes = texto.split(',').map(p => p.trim());
    
    if (ag === 'broadcast') {
        const clientes = db.prepare('SELECT telegram_id FROM clientes WHERE bloqueado = 0').all();
        const clientBot = require('../cliente/index').getBot();
        let enviados = 0;
        for (const c of clientes) {
            try { if (clientBot) await clientBot.sendMessage(c.telegram_id, `📢 *${process.env.NOME_MERCADO || 'Supermercado'}*\n\n${texto}`, { parse_mode: 'Markdown' }); enviados++; } catch (e) {}
        }
        est.aguardando = null; estadosAdmin.set(userId, est);
        return adminBot.sendMessage(chatId, `✅ Enviado para ${enviados} clientes!`);
    }
    
    if (ag === 'notificar_promocao') {
        const r = await NotificacoesService.notificarPromocao(texto);
        est.aguardando = null; estadosAdmin.set(userId, est);
        return adminBot.sendMessage(chatId, `✅ Notificação enviada para ${r.enviados} clientes!`);
    }
    
    if (ag === 'nova_categoria') { const [nome, emoji] = partes; db.prepare('INSERT INTO categorias (nome, emoji, ordem) VALUES (?, ?, (SELECT COALESCE(MAX(ordem),0)+1 FROM categorias))').run(nome, emoji || '📦'); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, `✅ Categoria *${nome}* criada!`, { parse_mode: 'Markdown' }); }
    if (ag.startsWith('cat_nome_')) { db.prepare('UPDATE categorias SET nome=? WHERE id=?').run(texto, ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Atualizado!'); }
    if (ag.startsWith('cat_emoji_')) { db.prepare('UPDATE categorias SET emoji=? WHERE id=?').run(texto, ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Atualizado!'); }
    
    if (ag === 'novo_produto') { const [nome, catId, preco, estoque, ...desc] = partes; await ProdutosAdmin.criar({ nome, categoria_id: parseInt(catId), preco: parseFloat(preco), estoque: parseInt(estoque), descricao: desc.join(', ') }); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, `✅ Produto *${nome}* criado!`, { parse_mode: 'Markdown' }); }
    if (ag.startsWith('prod_nome_')) { db.prepare('UPDATE produtos SET nome=? WHERE id=?').run(texto, ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Atualizado!'); }
    if (ag.startsWith('prod_preco_')) { db.prepare('UPDATE produtos SET preco=? WHERE id=?').run(parseFloat(texto), ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Preço atualizado!'); }
    if (ag.startsWith('prod_estoque_')) { db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id=?').run(parseInt(texto), ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Estoque atualizado!'); }
    if (ag.startsWith('prod_desc_')) { db.prepare('UPDATE produtos SET descricao=? WHERE id=?').run(texto, ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Descrição atualizada!'); }
    if (ag.startsWith('prod_foto_')) { db.prepare('UPDATE produtos SET foto=? WHERE id=?').run(texto, ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Foto atualizada!'); }
    
    if (ag === 'novo_cupom') { const [codigo, tipo, valor, usos, dias] = partes; await CuponsAdmin.criar({ codigo, tipo, valor: parseFloat(valor), uso_maximo: parseInt(usos), dias_validade: parseInt(dias) }); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, `✅ Cupom *${codigo.toUpperCase()}* criado!`, { parse_mode: 'Markdown' }); }
    if (ag === 'lote_cupons') { const [prefixo, qtd, tipo, valor, usos, dias] = partes; const r = await CuponsAdmin.gerarLote(prefixo, parseInt(qtd), tipo, parseFloat(valor), parseInt(usos), parseInt(dias)); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, `✅ ${r.cupons.length} cupons gerados!\n\n${r.cupons.join('\n')}`); }
    
    if (ag === 'nova_promocao') { const [nome, tipo, valor, catId, prodId] = partes; await PromocoesAdmin.criar({ nome, tipo, valor: parseFloat(valor), categoria_id: catId !== '0' ? parseInt(catId) : null, produto_id: prodId !== '0' ? parseInt(prodId) : null }); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, `✅ Promoção *${nome}* criada!`, { parse_mode: 'Markdown' }); }
    
    if (ag.startsWith('msg_cliente_')) { await ClientesAdmin.enviarMensagem(ag.split('_')[2], texto); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Mensagem enviada!'); }
    
    if (ag === 'novo_entregador') { const [nome, telefone, veiculo, placa] = partes; await EntregadoresService.cadastrar({ nome, telefone, veiculo, placa }); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, `✅ Entregador *${nome}* cadastrado!`, { parse_mode: 'Markdown' }); }
    
    if (ag === 'add_horario') { const [dia, horario] = partes; await AgendamentoService.adicionarHorario(parseInt(dia), horario); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Horário adicionado!'); }
    
    if (ag.startsWith('cfg_')) { const chave = ag.replace('cfg_', ''); await ConfigAdmin.set(chave, texto); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Configuração salva!'); }
}

// ============ TELAS ============
async function showCategorias(chatId, msgId) {
    const cats = getDatabase().prepare('SELECT * FROM categorias ORDER BY ordem').all();
    const kb = { inline_keyboard: [] };
    for (const c of cats) kb.inline_keyboard.push([{ text: `${c.ativo?'✅':'❌'} ${c.emoji} ${c.nome}`, callback_data: `adm_cat_edit_${c.id}` }]);
    kb.inline_keyboard.push([{ text: '➕ Nova', callback_data: 'adm_cat_nova' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, '📂 *CATEGORIAS*', kb);
}

async function showEditarCategoria(chatId, catId, msgId) {
    const c = getDatabase().prepare('SELECT * FROM categorias WHERE id=?').get(catId);
    if (!c) return;
    const kb = { inline_keyboard: [
        [{ text: '✏️ Nome', callback_data: `adm_cat_setnome_${catId}` }, { text: '😀 Emoji', callback_data: `adm_cat_setemoji_${catId}` }],
        [{ text: c.ativo?'❌ Desativar':'✅ Ativar', callback_data: `adm_cat_toggle_${catId}` }],
        [{ text: '🗑 Excluir', callback_data: `adm_cat_del_${catId}` }],
        [{ text: '⬅️ Voltar', callback_data: 'adm_categorias' }]
    ]};
    await editOrSend(chatId, msgId, `${c.emoji} *${c.nome}*\nOrdem: ${c.ordem}`, kb);
}

function toggleCategoria(id) {
    const db = getDatabase();
    const c = db.prepare('SELECT * FROM categorias WHERE id=?').get(id);
    db.prepare('UPDATE categorias SET ativo=? WHERE id=?').run(c.ativo ? 0 : 1, id);
}

async function showProdutos(chatId, msgId) {
    const { produtos, total } = await ProdutosAdmin.listar();
    const kb = { inline_keyboard: [] };
    for (const p of produtos) kb.inline_keyboard.push([{ text: `${p.disponivel?'✅':'❌'} ${p.nome} - ${formatarMoeda(p.preco)} (${p.estoque})`, callback_data: `adm_prod_edit_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '➕ Novo', callback_data: 'adm_prod_novo' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, `📦 *PRODUTOS* (${total})`, kb);
}

async function showEditarProduto(chatId, prodId, msgId) {
    const p = getDatabase().prepare('SELECT p.*, c.nome as cn FROM produtos p LEFT JOIN categorias c ON p.categoria_id=c.id WHERE p.id=?').get(prodId);
    if (!p) return;
    let msg = `📦 *${p.nome}*\n📂 ${p.cn}\n💰 ${formatarMoeda(p.preco)}`;
    if (p.preco_promocional) msg += `\n🔥 Promo: ${formatarMoeda(p.preco_promocional)}`;
    msg += `\n📦 Estoque: ${p.estoque}\n📝 ${p.descricao||'N/A'}`;
    const kb = { inline_keyboard: [
        [{ text: '✏️ Nome', callback_data: `adm_prod_setnome_${prodId}` }],
        [{ text: '💰 Preço', callback_data: `adm_prod_setpreco_${prodId}` }, { text: '📦 Estoque', callback_data: `adm_prod_setestoque_${prodId}` }],
        [{ text: '📝 Descrição', callback_data: `adm_prod_setdesc_${prodId}` }, { text: '🖼 Foto', callback_data: `adm_prod_setfoto_${prodId}` }],
        [{ text: p.disponivel?'❌ Indisponibilizar':'✅ Disponibilizar', callback_data: `adm_prod_toggle_${prodId}` }],
        [{ text: '🗑 Excluir', callback_data: `adm_prod_del_${prodId}` }],
        [{ text: '⬅️ Voltar', callback_data: 'adm_produtos' }]
    ]};
    await editOrSend(chatId, msgId, msg, kb);
}

function toggleProduto(id) {
    const db = getDatabase();
    const p = db.prepare('SELECT * FROM produtos WHERE id=?').get(id);
    db.prepare('UPDATE produtos SET disponivel=? WHERE id=?').run(p.disponivel ? 0 : 1, id);
}

function handleProdutoSet(userId, data, chatId, msgId) {
    const partes = data.split('_');
    const campo = partes[2];
    const id = partes[3];
    const msgs = { nome: 'Digite o nome:', preco: 'Digite o preço:', estoque: 'Quantidade para ADICIONAR:', desc: 'Digite a descrição:', foto: 'URL da foto:' };
    estadosAdmin.set(userId, { aguardando: `prod_${campo}_${id}` });
    editOrSend(chatId, msgId, msgs[campo] || 'Digite:', backButton(`adm_prod_edit_${id}`));
}

async function showPedidos(chatId, msgId, filtro) {
    const { pedidos, total } = await PedidosAdmin.listar(filtro);
    const se = { recebido:'📥', confirmado:'✅', separando:'📦', embalando:'🎁', entrega:'🛵', entregue:'🏠', cancelado:'❌' };
    const kb = { inline_keyboard: [] };
    for (const p of pedidos) kb.inline_keyboard.push([{ text: `${se[p.status]} ${p.numero} - ${p.cliente_nome} - ${formatarMoeda(p.total)}`, callback_data: `adm_ped_ver_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '🕐 Hoje', callback_data: 'adm_ped_hoje' }, { text: '✅ Entregues', callback_data: 'adm_ped_entregues' }, { text: '📋 Todos', callback_data: 'adm_ped_todos' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, `📋 *PEDIDOS* (${total})`, kb);
}

async function showDetalhePedido(chatId, pedidoId, msgId) {
    const d = await PedidosAdmin.detalhes(pedidoId);
    if (!d) return;
    let msg = `📦 *${d.numero}*\n👤 ${d.nome}\n📱 ${d.telefone}\n📍 ${d.logradouro||''}, ${d.numero||''}\n📊 ${d.status}\n💳 ${d.pagamento_metodo}\n\n*Itens:*\n`;
    for (const i of d.itens) msg += `${i.quantidade}x ${i.produto_nome} - ${formatarMoeda(i.preco_unitario*i.quantidade)}\n`;
    msg += `\n💰 Total: ${formatarMoeda(d.total)}`;
    const kb = { inline_keyboard: [
        [{ text: '👨‍🍳 Separando', callback_data: `adm_ped_status_separando_${pedidoId}` }, { text: '🎁 Embalando', callback_data: `adm_ped_status_embalando_${pedidoId}` }],
        [{ text: '🛵 Entrega', callback_data: `adm_ped_status_entrega_${pedidoId}` }, { text: '🏠 Entregue', callback_data: `adm_ped_status_entregue_${pedidoId}` }],
        [{ text: '🛵 Atribuir Entregador', callback_data: `adm_ped_entregador_${pedidoId}` }],
        [{ text: '🖨 Imprimir', callback_data: `adm_ped_imprimir_${pedidoId}` }, { text: '❌ Cancelar', callback_data: `adm_ped_cancelar_${pedidoId}` }],
        [{ text: '⬅️ Voltar', callback_data: 'adm_pedidos' }]
    ]};
    await editOrSend(chatId, msgId, msg, kb);
}

async function showClientes(chatId, msgId) {
    const { clientes, total } = await ClientesAdmin.listar();
    const kb = { inline_keyboard: [] };
    for (const c of clientes) kb.inline_keyboard.push([{ text: `${c.nome||'Sem nome'} - ${formatarMoeda(c.total_gasto)}`, callback_data: `adm_cli_ver_${c.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, `👥 *CLIENTES* (${total})`, kb);
}

async function showDetalheCliente(chatId, clienteId, msgId) {
    const d = await ClientesAdmin.detalhes(clienteId);
    if (!d) return;
    let msg = `👤 *${d.nome}*\n📧 ${d.email||'N/A'}\n📱 ${d.telefone_formatado||'N/A'}\n`;
    if (d.cpf) msg += `🔢 CPF: ${d.cpf_formatado}\n`;
    msg += `💰 Gasto: ${d.totalGasto}\n⭐ Pontos: ${d.pontos}\n📦 Pedidos: ${d.totalPedidos}`;
    const kb = { inline_keyboard: [
        [{ text: d.bloqueado?'✅ Desbloquear':'🚫 Bloquear', callback_data: `adm_cli_toggle_${clienteId}` }],
        [{ text: '💬 Mensagem', callback_data: `adm_cli_msg_${clienteId}` }],
        [{ text: '⬅️ Voltar', callback_data: 'adm_clientes' }]
    ]};
    await editOrSend(chatId, msgId, msg, kb);
}

async function showPromocoes(chatId, msgId) {
    const promos = await PromocoesAdmin.listar();
    const kb = { inline_keyboard: [] };
    for (const p of promos) kb.inline_keyboard.push([{ text: `${p.ativo?'✅':'❌'} ${p.nome}`, callback_data: `adm_promo_toggle_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '➕ Nova', callback_data: 'adm_promo_nova' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, '🎉 *PROMOÇÕES*', kb);
}

async function showCupons(chatId, msgId) {
    const cupons = await CuponsAdmin.listar();
    const kb = { inline_keyboard: [] };
    for (const c of cupons) kb.inline_keyboard.push([{ text: `${c.ativo?'✅':'❌'} ${c.codigo}`, callback_data: `adm_cupom_toggle_${c.id}` }]);
    kb.inline_keyboard.push([{ text: '➕ Novo', callback_data: 'adm_cupom_novo' }, { text: '📦 Lote', callback_data: 'adm_cupom_lote' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, '🎟 *CUPONS*', kb);
}

async function showEntregadores(chatId, msgId) {
    const entregadores = await EntregadoresService.listar();
    const kb = { inline_keyboard: [] };
    for (const e of entregadores) kb.inline_keyboard.push([{ text: `${e.ativo?'✅':'❌'} ${e.nome} - ${e.veiculo}`, callback_data: `adm_entregador_toggle_${e.id}` }]);
    kb.inline_keyboard.push([{ text: '➕ Novo', callback_data: 'adm_entregador_novo' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, '🛵 *ENTREGADORES*', kb);
}

async function showHorarios(chatId, msgId) {
    const horarios = await AgendamentoService.getHorariosSemana();
    let msg = '🕐 *HORÁRIOS DE ENTREGA*\n\n';
    const kb = { inline_keyboard: [] };
    for (const [dia, horas] of Object.entries(horarios)) {
        msg += `*${dia}*\n`;
        for (const h of horas) {
            msg += `   ${h}\n`;
            kb.inline_keyboard.push([{ text: `🗑 ${dia} - ${h}`, callback_data: `adm_horario_del_${['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'].indexOf(dia)}_${h}` }]);
        }
    }
    kb.inline_keyboard.push([{ text: '➕ Adicionar', callback_data: 'adm_horario_add' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, msg, kb);
}

async function showRelatorios(chatId, msgId) {
    const stats = await DashboardAdmin.getEstatisticas();
    const kb = { inline_keyboard: [
        [{ text: '📊 Vendas', callback_data: 'adm_rel_vendas' }, { text: '📦 Produtos', callback_data: 'adm_rel_produtos' }],
        [{ text: '👥 Clientes', callback_data: 'adm_rel_clientes' }, { text: '💰 Financeiro', callback_data: 'adm_rel_financeiro' }],
        [{ text: '📄 Exportar PDF', callback_data: 'adm_rel_pdf' }],
        [{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]
    ]};
    await editOrSend(chatId, msgId, `📊 *RELATÓRIOS*\n\n💰 Faturamento: ${stats.faturamento.total}\n📦 Pedidos: ${stats.pedidos.total}`, kb);
}

async function showConfig(chatId, msgId) {
    const configs = await ConfigAdmin.getTodas();
    const kb = { inline_keyboard: [
        [{ text: '🏪 Nome', callback_data: 'adm_cfg_set_nome_mercado' }, { text: '🚚 Taxa', callback_data: 'adm_cfg_set_taxa_entrega' }],
        [{ text: '💰 Mínimo', callback_data: 'adm_cfg_set_pedido_minimo' }, { text: '⏰ PIX Exp', callback_data: 'adm_cfg_set_tempo_expiracao_pix' }],
        [{ text: '💳 PIX', callback_data: 'adm_cfg_set_chave_pix' }, { text: '📞 Tel', callback_data: 'adm_cfg_set_telefone' }],
        [{ text: '💾 Backup', callback_data: 'adm_cfg_backup' }],
        [{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]
    ]};
    await editOrSend(chatId, msgId, `⚙️ *CONFIGURAÇÕES*\n\n🏪 ${configs.nome_mercado||'N/A'}\n🚚 ${formatarMoeda(parseFloat(configs.taxa_entrega||5))}\n💰 ${formatarMoeda(parseFloat(configs.pedido_minimo||30))}`, kb);
}

// ============ HELPERS ============
async function editOrSend(chatId, msgId, text, kb) {
    try {
        if (msgId) await adminBot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb });
        else await adminBot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb });
    } catch (e) { await adminBot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: kb }); }
}

function backButton(data) { return { inline_keyboard: [[{ text: '⬅️ Cancelar', callback_data: data }]] }; }

async function alert(chatId, msgId, text) {
    try { await adminBot.answerCallbackQuery({ callback_query_id: `${chatId}_${msgId}`, text, show_alert: true }); } catch (e) {}
}

module.exports = { startAdminBot };
