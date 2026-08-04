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
const adminMsg = new Map();

async function startAdminBot() {
    adminBot = new TelegramBot(process.env.BOT_TOKEN_ADMIN, { polling: true });
    const adminIds = process.env.ADMIN_IDS.split(',').map(Number);
    
    // ============ START ============
    adminBot.onText(/\/start/, (msg) => {
        if (!adminIds.includes(msg.from.id)) return;
        showDashboard(msg.chat.id, msg.from.id);
    });
    
    // ============ CALLBACKS ============
    adminBot.on('callback_query', async (q) => {
        if (!adminIds.includes(q.from.id)) return;
        adminBot.answerCallbackQuery(q.id);
        await router(q.message.chat.id, q.from.id, q.data, q.message.message_id);
    });
    
    // ============ MENSAGENS ============
    adminBot.on('message', async (msg) => {
        if (!adminIds.includes(msg.from.id)) return;
        if (!msg.text || msg.text.startsWith('/')) return;
        const est = estadosAdmin.get(msg.from.id);
        if (est && est.aguardando) await handleTextInput(msg.chat.id, msg.from.id, msg.text);
    });
    
    logger.info('👑 Bot Admin 100% funcional');
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
        [{ text: '📦 Produtos', callback_data: 'adm_produtos' }],
        [{ text: '📂 Categorias', callback_data: 'adm_categorias' }],
        [{ text: '📋 Pedidos', callback_data: 'adm_pedidos' }],
        [{ text: '👥 Clientes', callback_data: 'adm_clientes' }],
        [{ text: '🎉 Promoções', callback_data: 'adm_promocoes' }],
        [{ text: '🎟 Cupons', callback_data: 'adm_cupons' }],
        [{ text: '📊 Relatórios', callback_data: 'adm_relatorios' }],
        [{ text: '⚙️ Configurações', callback_data: 'adm_config' }],
        [{ text: '📢 Broadcast', callback_data: 'adm_broadcast' }]
    ]};
    
    await editOrSend(chatId, null, msg, kb);
}

// ============ ROUTER ============
async function router(chatId, userId, data, msgId) {
    adminMsg.set(userId, { chatId, msgId });
    
    if (data === 'adm_voltar') return showDashboard(chatId, userId);
    if (data === 'adm_broadcast') { estadosAdmin.set(userId, { aguardando: 'broadcast' }); return editOrSend(chatId, msgId, '📢 Digite a mensagem para TODOS os clientes:', backButton('adm_voltar')); }
    
    // CATEGORIAS
    if (data === 'adm_categorias') return showCategoriasAdmin(chatId, msgId);
    if (data === 'adm_cat_nova') { estadosAdmin.set(userId, { aguardando: 'nova_categoria' }); return editOrSend(chatId, msgId, '📂 Digite: Nome, Emoji\nEx: Alimentos, 🍎', backButton('adm_categorias')); }
    if (data.startsWith('adm_cat_edit_')) return showEditarCategoria(chatId, userId, data.split('_')[3], msgId);
    if (data.startsWith('adm_cat_toggle_')) { const id = data.split('_')[3]; const db = getDatabase(); const c = db.prepare('SELECT * FROM categorias WHERE id=?').get(id); db.prepare('UPDATE categorias SET ativo=? WHERE id=?').run(c.ativo?0:1, id); await alert(chatId, msgId, c.ativo?'❌ Desativada':'✅ Ativada'); return showCategoriasAdmin(chatId, msgId); }
    if (data.startsWith('adm_cat_del_')) { const id = data.split('_')[3]; getDatabase().prepare('DELETE FROM categorias WHERE id=?').run(id); await alert(chatId, msgId, '🗑 Excluída!'); return showCategoriasAdmin(chatId, msgId); }
    if (data.startsWith('adm_cat_setnome_')) { estadosAdmin.set(userId, { aguardando: `cat_nome_${data.split('_')[3]}` }); return editOrSend(chatId, msgId, 'Digite o novo nome:', backButton(`adm_cat_edit_${data.split('_')[3]}`)); }
    if (data.startsWith('adm_cat_setemoji_')) { estadosAdmin.set(userId, { aguardando: `cat_emoji_${data.split('_')[3]}` }); return editOrSend(chatId, msgId, 'Envie o novo emoji:', backButton(`adm_cat_edit_${data.split('_')[3]}`)); }
    
    // PRODUTOS
    if (data === 'adm_produtos') return showProdutosAdmin(chatId, msgId);
    if (data === 'adm_prod_novo') { estadosAdmin.set(userId, { aguardando: 'novo_produto' }); return editOrSend(chatId, msgId, '📦 Digite:\nNome, Categoria ID, Preço, Estoque, Descrição\n\nEx: Arroz, 1, 25.90, 100, Arroz branco 5kg', backButton('adm_produtos')); }
    if (data.startsWith('adm_prod_edit_')) return showEditarProduto(chatId, userId, data.split('_')[3], msgId);
    if (data.startsWith('adm_prod_toggle_')) { const id = data.split('_')[3]; const db = getDatabase(); const p = db.prepare('SELECT * FROM produtos WHERE id=?').get(id); db.prepare('UPDATE produtos SET disponivel=? WHERE id=?').run(p.disponivel?0:1, id); await alert(chatId, msgId, p.disponivel?'❌ Indisponível':'✅ Disponível'); return showEditarProduto(chatId, userId, id, msgId); }
    if (data.startsWith('adm_prod_del_')) { const id = data.split('_')[3]; getDatabase().prepare('DELETE FROM favoritos WHERE produto_id=?').run(id); getDatabase().prepare('DELETE FROM carrinhos WHERE produto_id=?').run(id); getDatabase().prepare('DELETE FROM produtos WHERE id=?').run(id); await alert(chatId, msgId, '🗑 Excluído!'); return showProdutosAdmin(chatId, msgId); }
    if (data.startsWith('adm_prod_setnome_')) { estadosAdmin.set(userId, { aguardando: `prod_nome_${data.split('_')[3]}` }); return editOrSend(chatId, msgId, 'Digite o novo nome:', backButton(`adm_prod_edit_${data.split('_')[3]}`)); }
    if (data.startsWith('adm_prod_setpreco_')) { estadosAdmin.set(userId, { aguardando: `prod_preco_${data.split('_')[3]}` }); return editOrSend(chatId, msgId, 'Digite o novo preço:', backButton(`adm_prod_edit_${data.split('_')[3]}`)); }
    if (data.startsWith('adm_prod_setestoque_')) { estadosAdmin.set(userId, { aguardando: `prod_estoque_${data.split('_')[3]}` }); return editOrSend(chatId, msgId, 'Digite a quantidade para ADICIONAR ao estoque:', backButton(`adm_prod_edit_${data.split('_')[3]}`)); }
    if (data.startsWith('adm_prod_setdesc_')) { estadosAdmin.set(userId, { aguardando: `prod_desc_${data.split('_')[3]}` }); return editOrSend(chatId, msgId, 'Digite a nova descrição:', backButton(`adm_prod_edit_${data.split('_')[3]}`)); }
    if (data.startsWith('adm_prod_setfoto_')) { estadosAdmin.set(userId, { aguardando: `prod_foto_${data.split('_')[3]}` }); return editOrSend(chatId, msgId, 'Envie a URL da foto:', backButton(`adm_prod_edit_${data.split('_')[3]}`)); }
    
    // PEDIDOS
    if (data === 'adm_pedidos') return showPedidosAdmin(chatId, msgId);
    if (data === 'adm_ped_pendentes') return showPedidosFiltro(chatId, msgId, 'pendentes');
    if (data === 'adm_ped_hoje') return showPedidosFiltro(chatId, msgId, 'hoje');
    if (data === 'adm_ped_entregues') return showPedidosFiltro(chatId, msgId, 'entregues');
    if (data.startsWith('adm_ped_ver_')) return showDetalhePedido(chatId, data.split('_')[3], msgId);
    if (data.startsWith('adm_ped_status_')) { const partes = data.split('_'); const status = partes[3]; const id = partes[4]; await PedidosAdmin.alterarStatus(id, status); await alert(chatId, msgId, `✅ Status: ${status}`); return showDetalhePedido(chatId, id, msgId); }
    if (data.startsWith('adm_ped_cancelar_')) { const id = data.split('_')[3]; await PedidosAdmin.alterarStatus(id, 'cancelado'); await alert(chatId, msgId, '❌ Pedido cancelado'); return showDetalhePedido(chatId, id, msgId); }
    if (data.startsWith('adm_ped_imprimir_')) { const id = data.split('_')[3]; const texto = await PedidosAdmin.imprimir(id); if (texto) await adminBot.sendMessage(chatId, texto, { parse_mode: 'Markdown' }); return; }
    
    // CLIENTES
    if (data === 'adm_clientes') return showClientesAdmin(chatId, msgId);
    if (data.startsWith('adm_cli_ver_')) return showDetalheCliente(chatId, data.split('_')[3], msgId);
    if (data.startsWith('adm_cli_toggle_')) { const id = data.split('_')[3]; await ClientesAdmin.toggleBloqueio(id); await alert(chatId, msgId, '✅ Status alterado!'); return showDetalheCliente(chatId, id, msgId); }
    if (data.startsWith('adm_cli_msg_')) { estadosAdmin.set(userId, { aguardando: `msg_cliente_${data.split('_')[3]}` }); return editOrSend(chatId, msgId, '📝 Digite a mensagem para o cliente:', backButton(`adm_cli_ver_${data.split('_')[3]}`)); }
    
    // PROMOÇÕES
    if (data === 'adm_promocoes') return showPromocoesAdmin(chatId, msgId);
    if (data === 'adm_promo_nova') { estadosAdmin.set(userId, { aguardando: 'nova_promocao' }); return editOrSend(chatId, msgId, '🎉 Digite:\nNome, Tipo (percentual/fixo), Valor, Categoria ID (ou 0), Produto ID (ou 0)\n\nEx: Queima de Estoque, percentual, 20, 1, 0', backButton('adm_promocoes')); }
    if (data.startsWith('adm_promo_toggle_')) { const id = data.split('_')[3]; await PromocoesAdmin.toggle(id); await alert(chatId, msgId, '✅ Status alterado!'); return showPromocoesAdmin(chatId, msgId); }
    if (data.startsWith('adm_promo_del_')) { await PromocoesAdmin.excluir(data.split('_')[3]); await alert(chatId, msgId, '🗑 Excluída!'); return showPromocoesAdmin(chatId, msgId); }
    
    // CUPONS
    if (data === 'adm_cupons') return showCuponsAdmin(chatId, msgId);
    if (data === 'adm_cupom_novo') { estadosAdmin.set(userId, { aguardando: 'novo_cupom' }); return editOrSend(chatId, msgId, '🎟 Digite:\nCódigo, Tipo (percentual/fixo), Valor, Usos, Dias Validade\n\nEx: PIZZA10, percentual, 10, 100, 30', backButton('adm_cupons')); }
    if (data.startsWith('adm_cupom_toggle_')) { const id = data.split('_')[3]; await CuponsAdmin.toggle(id); await alert(chatId, msgId, '✅ Status alterado!'); return showCuponsAdmin(chatId, msgId); }
    if (data.startsWith('adm_cupom_del_')) { await CuponsAdmin.excluir(data.split('_')[3]); await alert(chatId, msgId, '🗑 Excluído!'); return showCuponsAdmin(chatId, msgId); }
    
    // RELATÓRIOS
    if (data === 'adm_relatorios') return showRelatoriosAdmin(chatId, msgId);
    if (data === 'adm_rel_vendas') { const r = await RelatoriosAdmin.vendas('mes'); let msg = '📊 *VENDAS DO MÊS*\n\n'; msg += `📦 Pedidos: ${r.resumo.totalPedidos}\n`; msg += `💰 Faturamento: ${r.resumo.faturamento}\n`; msg += `🎯 Ticket Médio: ${r.resumo.ticketMedio}\n`; await editOrSend(chatId, msgId, msg, backButton('adm_relatorios')); }
    if (data === 'adm_rel_produtos') { const r = await RelatoriosAdmin.produtos('mes'); let msg = '📦 *TOP PRODUTOS*\n\n'; r.maisVendidos.slice(0,10).forEach((p,i) => msg += `${i+1}. ${p.produto_nome}: ${p.total_unidades}x\n`); await editOrSend(chatId, msgId, msg, backButton('adm_relatorios')); }
    if (data === 'adm_rel_pdf') { const buffer = await RelatoriosAdmin.gerarPDF(); if (buffer) await adminBot.sendDocument(chatId, buffer, {}, { filename: `relatorio_${new Date().toISOString().slice(0,10)}.pdf`, caption: '📊 Relatório Mensal' }); }
    
    // CONFIG
    if (data === 'adm_config') return showConfigAdmin(chatId, msgId);
    if (data === 'adm_cfg_backup') { const r = await ConfigAdmin.backup(); await alert(chatId, msgId, r.mensagem); }
    if (data.startsWith('adm_cfg_set_')) { const partes = data.split('_'); const chave = partes[3]; estadosAdmin.set(userId, { aguardando: `cfg_${chave}` }); const nomes = { nome_mercado:'Nome do mercado', taxa_entrega:'Taxa de entrega', pedido_minimo:'Pedido mínimo', chave_pix:'Chave PIX', telefone:'Telefone' }; return editOrSend(chatId, msgId, `Digite o novo valor para *${nomes[chave]||chave}*:`, backButton('adm_config')); }
}

// ============ HANDLERS DE TEXTO ============
async function handleTextInput(chatId, userId, texto) {
    const db = getDatabase();
    const est = estadosAdmin.get(userId);
    if (!est || !est.aguardando) return;
    
    const ag = est.aguardando;
    const partes = texto.split(',').map(p => p.trim());
    
    // BROADCAST
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
    
    // NOVA CATEGORIA
    if (ag === 'nova_categoria') {
        const [nome, emoji] = partes;
        db.prepare('INSERT INTO categorias (nome, emoji, ordem) VALUES (?, ?, (SELECT COALESCE(MAX(ordem),0)+1 FROM categorias))').run(nome, emoji || '📦');
        est.aguardando = null; estadosAdmin.set(userId, est);
        return adminBot.sendMessage(chatId, `✅ Categoria *${nome}* criada!`, { parse_mode: 'Markdown' });
    }
    
    // EDITAR CATEGORIA
    if (ag.startsWith('cat_nome_')) { db.prepare('UPDATE categorias SET nome=? WHERE id=?').run(texto, ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Nome atualizado!'); }
    if (ag.startsWith('cat_emoji_')) { db.prepare('UPDATE categorias SET emoji=? WHERE id=?').run(texto, ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Emoji atualizado!'); }
    
    // NOVO PRODUTO
    if (ag === 'novo_produto') {
        const [nome, catId, preco, estoque, ...desc] = partes;
        await ProdutosAdmin.criar({ nome, categoria_id: parseInt(catId), preco: parseFloat(preco), estoque: parseInt(estoque), descricao: desc.join(', ') });
        est.aguardando = null; estadosAdmin.set(userId, est);
        return adminBot.sendMessage(chatId, `✅ Produto *${nome}* criado!`, { parse_mode: 'Markdown' });
    }
    
    // EDITAR PRODUTO
    if (ag.startsWith('prod_nome_')) { db.prepare('UPDATE produtos SET nome=? WHERE id=?').run(texto, ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Atualizado!'); }
    if (ag.startsWith('prod_preco_')) { db.prepare('UPDATE produtos SET preco=? WHERE id=?').run(parseFloat(texto), ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Preço atualizado!'); }
    if (ag.startsWith('prod_estoque_')) { db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id=?').run(parseInt(texto), ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Estoque atualizado!'); }
    if (ag.startsWith('prod_desc_')) { db.prepare('UPDATE produtos SET descricao=? WHERE id=?').run(texto, ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Descrição atualizada!'); }
    if (ag.startsWith('prod_foto_')) { db.prepare('UPDATE produtos SET foto=? WHERE id=?').run(texto, ag.split('_')[2]); est.aguardando = null; estadosAdmin.set(userId, est); return adminBot.sendMessage(chatId, '✅ Foto atualizada!'); }
    
    // NOVO CUPOM
    if (ag === 'novo_cupom') {
        const [codigo, tipo, valor, usos, dias] = partes;
        await CuponsAdmin.criar({ codigo, tipo, valor: parseFloat(valor), uso_maximo: parseInt(usos), dias_validade: parseInt(dias) });
        est.aguardando = null; estadosAdmin.set(userId, est);
        return adminBot.sendMessage(chatId, `✅ Cupom *${codigo.toUpperCase()}* criado!`, { parse_mode: 'Markdown' });
    }
    
    // NOVA PROMOÇÃO
    if (ag === 'nova_promocao') {
        const [nome, tipo, valor, catId, prodId] = partes;
        await PromocoesAdmin.criar({ nome, tipo, valor: parseFloat(valor), categoria_id: catId !== '0' ? parseInt(catId) : null, produto_id: prodId !== '0' ? parseInt(prodId) : null });
        est.aguardando = null; estadosAdmin.set(userId, est);
        return adminBot.sendMessage(chatId, `✅ Promoção *${nome}* criada!`, { parse_mode: 'Markdown' });
    }
    
    // MENSAGEM PARA CLIENTE
    if (ag.startsWith('msg_cliente_')) {
        const clienteId = ag.split('_')[2];
        await ClientesAdmin.enviarMensagem(clienteId, texto);
        est.aguardando = null; estadosAdmin.set(userId, est);
        return adminBot.sendMessage(chatId, '✅ Mensagem enviada!');
    }
    
    // CONFIG
    if (ag.startsWith('cfg_')) {
        const chave = ag.replace('cfg_', '');
        await ConfigAdmin.set(chave, texto);
        est.aguardando = null; estadosAdmin.set(userId, est);
        return adminBot.sendMessage(chatId, '✅ Configuração salva!');
    }
}

// ============ TELAS ============
async function showCategoriasAdmin(chatId, msgId) {
    const db = getDatabase();
    const cats = db.prepare('SELECT * FROM categorias ORDER BY ordem').all();
    const kb = { inline_keyboard: [] };
    for (const c of cats) kb.inline_keyboard.push([{ text: `${c.ativo?'✅':'❌'} ${c.emoji} ${c.nome}`, callback_data: `adm_cat_edit_${c.id}` }]);
    kb.inline_keyboard.push([{ text: '➕ Nova Categoria', callback_data: 'adm_cat_nova' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, '📂 *CATEGORIAS*', kb);
}

async function showEditarCategoria(chatId, userId, catId, msgId) {
    const db = getDatabase();
    const c = db.prepare('SELECT * FROM categorias WHERE id=?').get(catId);
    if (!c) return;
    const kb = { inline_keyboard: [
        [{ text: '✏️ Nome', callback_data: `adm_cat_setnome_${catId}` }, { text: '😀 Emoji', callback_data: `adm_cat_setemoji_${catId}` }],
        [{ text: c.ativo?'❌ Desativar':'✅ Ativar', callback_data: `adm_cat_toggle_${catId}` }],
        [{ text: '🗑 Excluir', callback_data: `adm_cat_del_${catId}` }],
        [{ text: '⬅️ Voltar', callback_data: 'adm_categorias' }]
    ]};
    await editOrSend(chatId, msgId, `${c.emoji} *${c.nome}*\nOrdem: ${c.ordem}`, kb);
}

async function showProdutosAdmin(chatId, msgId) {
    const { produtos, total } = await ProdutosAdmin.listar();
    const kb = { inline_keyboard: [] };
    for (const p of produtos) kb.inline_keyboard.push([{ text: `${p.disponivel?'✅':'❌'} ${p.nome} - ${formatarMoeda(p.preco)} (${p.estoque})`, callback_data: `adm_prod_edit_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '➕ Novo Produto', callback_data: 'adm_prod_novo' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, `📦 *PRODUTOS* (${total})`, kb);
}

async function showEditarProduto(chatId, userId, prodId, msgId) {
    const db = getDatabase();
    const p = db.prepare('SELECT p.*, c.nome as cn FROM produtos p LEFT JOIN categorias c ON p.categoria_id=c.id WHERE p.id=?').get(prodId);
    if (!p) return;
    const kb = { inline_keyboard: [
        [{ text: '✏️ Nome', callback_data: `adm_prod_setnome_${prodId}` }],
        [{ text: '💰 Preço', callback_data: `adm_prod_setpreco_${prodId}` }, { text: '📦 Estoque', callback_data: `adm_prod_setestoque_${prodId}` }],
        [{ text: '📝 Descrição', callback_data: `adm_prod_setdesc_${prodId}` }, { text: '🖼 Foto', callback_data: `adm_prod_setfoto_${prodId}` }],
        [{ text: p.disponivel?'❌ Indisponibilizar':'✅ Disponibilizar', callback_data: `adm_prod_toggle_${prodId}` }],
        [{ text: '🗑 Excluir', callback_data: `adm_prod_del_${prodId}` }],
        [{ text: '⬅️ Voltar', callback_data: 'adm_produtos' }]
    ]};
    let msg = `📦 *${p.nome}*\n📂 ${p.cn}\n💰 ${formatarMoeda(p.preco)}`;
    if (p.preco_promocional) msg += `\n🔥 Promo: ${formatarMoeda(p.preco_promocional)}`;
    msg += `\n📦 Estoque: ${p.estoque}\n📝 ${p.descricao||'N/A'}`;
    await editOrSend(chatId, msgId, msg, kb);
}

async function showPedidosAdmin(chatId, msgId) {
    const { pedidos, total } = await PedidosAdmin.listar('pendentes');
    const kb = { inline_keyboard: [] };
    const se = { recebido:'📥', confirmado:'✅', separando:'📦', embalando:'🎁', entrega:'🛵', entregue:'🏠', cancelado:'❌' };
    for (const p of pedidos) kb.inline_keyboard.push([{ text: `${se[p.status]} ${p.numero} - ${p.cliente_nome} - ${formatarMoeda(p.total)}`, callback_data: `adm_ped_ver_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '🕐 Hoje', callback_data: 'adm_ped_hoje' }, { text: '✅ Entregues', callback_data: 'adm_ped_entregues' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, `📋 *PEDIDOS PENDENTES* (${total})`, kb);
}

async function showPedidosFiltro(chatId, msgId, filtro) {
    const { pedidos, total } = await PedidosAdmin.listar(filtro);
    const kb = { inline_keyboard: [] };
    for (const p of pedidos) kb.inline_keyboard.push([{ text: `${p.numero} - ${formatarMoeda(p.total)}`, callback_data: `adm_ped_ver_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_pedidos' }]);
    await editOrSend(chatId, msgId, `📋 *${filtro.toUpperCase()}* (${total})`, kb);
}

async function showDetalhePedido(chatId, pedidoId, msgId) {
    const d = await PedidosAdmin.detalhes(pedidoId);
    if (!d) return;
    let msg = `📦 *${d.numero}*\n👤 ${d.nome}\n📱 ${d.telefone}\n📍 ${d.logradouro||''}, ${d.numero||''}\n📊 ${d.status}\n💳 ${d.pagamento_metodo}\n\n*Itens:*\n`;
    for (const i of d.itens) msg += `${i.quantidade}x ${i.produto_nome} - ${formatarMoeda(i.preco_unitario*i.quantidade)}\n`;
    msg += `\n💰 Total: ${formatarMoeda(d.total)}`;
    const kb = { inline_keyboard: [
        [{ text: '👨‍🍳 Preparo', callback_data: `adm_ped_status_separando_${pedidoId}` }, { text: '🎁 Embalando', callback_data: `adm_ped_status_embalando_${pedidoId}` }],
        [{ text: '🛵 Entrega', callback_data: `adm_ped_status_entrega_${pedidoId}` }, { text: '🏠 Entregue', callback_data: `adm_ped_status_entregue_${pedidoId}` }],
        [{ text: '🖨 Imprimir', callback_data: `adm_ped_imprimir_${pedidoId}` }, { text: '❌ Cancelar', callback_data: `adm_ped_cancelar_${pedidoId}` }],
        [{ text: '⬅️ Voltar', callback_data: 'adm_pedidos' }]
    ]};
    await editOrSend(chatId, msgId, msg, kb);
}

async function showClientesAdmin(chatId, msgId) {
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
    msg += `💰 Gasto: ${d.totalGasto}\n⭐ Pontos: ${d.pontos}\n📦 Pedidos: ${d.totalPedidos}\n⭐ Avaliação: ${d.mediaAvaliacao}`;
    const kb = { inline_keyboard: [
        [{ text: d.bloqueado?'✅ Desbloquear':'🚫 Bloquear', callback_data: `adm_cli_toggle_${clienteId}` }],
        [{ text: '💬 Enviar Mensagem', callback_data: `adm_cli_msg_${clienteId}` }],
        [{ text: '⬅️ Voltar', callback_data: 'adm_clientes' }]
    ]};
    await editOrSend(chatId, msgId, msg, kb);
}

async function showPromocoesAdmin(chatId, msgId) {
    const promos = await PromocoesAdmin.listar();
    const kb = { inline_keyboard: [] };
    for (const p of promos) kb.inline_keyboard.push([{ text: `${p.ativo?'✅':'❌'} ${p.nome} - ${p.alvo_nome}`, callback_data: `adm_promo_toggle_${p.id}` }]);
    kb.inline_keyboard.push([{ text: '➕ Nova', callback_data: 'adm_promo_nova' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, '🎉 *PROMOÇÕES*', kb);
}

async function showCuponsAdmin(chatId, msgId) {
    const cupons = await CuponsAdmin.listar();
    const kb = { inline_keyboard: [] };
    for (const c of cupons) kb.inline_keyboard.push([{ text: `${c.ativo?'✅':'❌'} ${c.codigo} - ${c.valor}${c.tipo==='percentual'?'%':'R$'}`, callback_data: `adm_cupom_toggle_${c.id}` }]);
    kb.inline_keyboard.push([{ text: '➕ Novo', callback_data: 'adm_cupom_novo' }]);
    kb.inline_keyboard.push([{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]);
    await editOrSend(chatId, msgId, '🎟 *CUPONS*', kb);
}

async function showRelatoriosAdmin(chatId, msgId) {
    const stats = await DashboardAdmin.getEstatisticas();
    const kb = { inline_keyboard: [
        [{ text: '📊 Vendas', callback_data: 'adm_rel_vendas' }, { text: '📦 Produtos', callback_data: 'adm_rel_produtos' }],
        [{ text: '📄 Exportar PDF', callback_data: 'adm_rel_pdf' }],
        [{ text: '⬅️ Voltar', callback_data: 'adm_voltar' }]
    ]};
    await editOrSend(chatId, msgId, `📊 *RELATÓRIOS*\n\n💰 Faturamento: ${stats.faturamento.total}\n📦 Pedidos: ${stats.pedidos.total}`, kb);
}

async function showConfigAdmin(chatId, msgId) {
    const configs = await ConfigAdmin.getTodas();
    const kb = { inline_keyboard: [
        [{ text: '🏪 Nome', callback_data: 'adm_cfg_set_nome_mercado' }, { text: '🚚 Taxa', callback_data: 'adm_cfg_set_taxa_entrega' }],
        [{ text: '💰 Mínimo', callback_data: 'adm_cfg_set_pedido_minimo' }],
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
