const { getSetting } = require('./settings');

function getMainMenuButtons() {
    return [
        { id: 'add_balance', text: '💰 Adicionar Saldo' },
        { id: 'premium', text: '👑 Assinatura Premium' },
        { id: 'referral', text: '💼 Área do Associado' },
        { id: 'support', text: '📞 Contato do Suporte' }
    ];
}

async function getPaymentButtons() {
    return [
        { id: 'pix_5', text: '💠 PIX R$ 5,00' },
        { id: 'pix_8', text: '💠 PIX R$ 8,00' },
        { id: 'pix_20', text: '💠 PIX R$ 20,00' },
        { id: 'pix_custom', text: '✍️ Digite Outro Valor' }
    ];
}

function getProductButtons(products, currentPage, totalPages) {
    const buttons = [];
    for (const product of products) {
        buttons.push({ id: `buy_${product.id}`, text: `${product.name} - R$ ${parseFloat(product.value).toFixed(2)}` });
    }
    if (totalPages > 1) {
        if (currentPage < totalPages) buttons.push({ id: `premium_page_${currentPage + 1}`, text: '➡️ Exibir Mais' });
        if (currentPage > 1) buttons.push({ id: `premium_page_${currentPage - 1}`, text: '⬅️ Voltar' });
    }
    buttons.push({ id: 'main_menu', text: '🏠 Menu Inicial' });
    return buttons;
}

function getConfirmCancelButtons(productId) {
    return [
        { id: `confirm_buy_${productId}`, text: '✅ Confirmar' },
        { id: 'premium', text: '❌ Cancelar' }
    ];
}

function getReferralButtons() {
    return [
        { id: 'text_model', text: '📋 Texto Modelo' },
        { id: 'main_menu', text: '🏠 Menu Inicial' }
    ];
}

function getBackButton() {
    return [{ id: 'main_menu', text: '🏠 Menu Inicial' }];
}

function getAdminDashboardButtons() {
    return [['⚙️ CONFIGURAÇÕES', '⚡ AÇÕES'], ['💳 TRANSAÇÕES', '🔄 ATUALIZAÇÕES']];
}

function getAdminConfigButtons() {
    return [['📝 CONFIGURAÇÕES GERAIS', '👥 CONFIGURAR ADMINS'], ['🔗 CONFIGURAR AFILIADOS', '👤 CONFIGURAR USUÁRIOS'], ['💠 CONFIGURAR PIX', '🔐 CONFIGURAR LOGINS'], ['🔍 CONFIGURAR PESQUISA DE SERVIÇOS'], ['🔙 VOLTAR']];
}

function getAdminGeneralConfigButtons() {
    return [['📞 MUDAR SUPORTE', '🔣 MUDAR SEPARADOR'], ['📋 MUDAR DESTINO LOG'], ['🔄 RENOVAR PLANO', '🔁 REINICIAR BOT'], ['🛑 MANUTENÇÃO', '🔙 VOLTAR']];
}

function getAdminAdminsButtons() {
    return [['➕ ADICIONAR ADM', '➖ REMOVER ADM'], ['📋 LISTA DE ADM', '🔙 VOLTAR']];
}

function getAdminAffiliatesButtons() {
    return [['🔄 SISTEMA DE INDICAÇÃO'], ['⭐ PONTOS POR RECARGA'], ['📊 PONTOS MINIMO PARA CONVERTER'], ['✖️ MULTIPLICADOR PARA CONVERTER'], ['🔙 VOLTAR']];
}

function getAdminUsersButtons() {
    return [['📢 TRANSMITIR A TODOS'], ['🔍 PESQUISAR USUÁRIO'], ['🎁 BÔNUS DE REGISTRO'], ['🔙 VOLTAR']];
}

function getAdminPixButtons() {
    return [['🔄 PIX MANUAL', '🤖 PIX AUTOMÁTICO'], ['🔑 MUDAR CHAVE PIX MANUAL', '👤 MUDAR NOME TITULAR PIX'], ['🔑 MUDAR TOKEN'], ['⬇️ MUDAR DEPÓSITO MIN', '⬆️ MUDAR DEPÓSITO MAX'], ['⏰ MUDAR TEMPO DE EXPIRAÇÃO'], ['🎁 MUDAR BÔNUS', '📊 MUDAR MIN PARA BÔNUS'], ['🔙 VOLTAR']];
}

function getAdminLoginsButtons() {
    return [['➕ ADICIONAR LOGIN'], ['➖ REMOVER LOGIN'], ['🗑️ REMOVER POR PLATAFORMA'], ['📦 ESTOQUE DETALHADO'], ['💣 ZERAR ESTOQUE'], ['💰 MUDAR VALOR DO SERVIÇO'], ['💎 MUDAR VALOR DE TODOS'], ['🔙 VOLTAR']];
}

function getAdminSearchButtons() {
    return [['🖼️ ADICIONAR IMAGEM'], ['🗑️ REMOVER IMAGEM'], ['🔙 VOLTAR']];
}

function getAdminActionsButtons() { return [['🔙 VOLTAR']]; }
function getAdminTransactionsButtons() { return [['🔙 VOLTAR']]; }
function getAdminUpdatesButtons() { return [['🔙 VOLTAR']]; }

module.exports = {
    getMainMenuButtons, getPaymentButtons, getProductButtons,
    getConfirmCancelButtons, getReferralButtons, getBackButton,
    getAdminDashboardButtons, getAdminConfigButtons, getAdminGeneralConfigButtons,
    getAdminAdminsButtons, getAdminAffiliatesButtons, getAdminUsersButtons,
    getAdminPixButtons, getAdminLoginsButtons, getAdminSearchButtons,
    getAdminActionsButtons, getAdminTransactionsButtons, getAdminUpdatesButtons
};
