const { getDatabase } = require('../../database/connection');
const { formatarMoeda, gerarNumeroPedido } = require('../../utils/helpers');
const CarrinhoService = require('./carrinho');
const EnderecoService = require('./endereco');
const pagamentoService = require('../../services/pagamento');
const logger = require('../../utils/logger');

class CheckoutService {
    
    // Iniciar checkout
    static async iniciarCheckout(userId) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        const carrinho = await CarrinhoService.listar(userId);
        if (carrinho.itens.length === 0) return { sucesso: false, mensagem: 'Carrinho vazio.' };
        
        const enderecos = await EnderecoService.listarEnderecos(userId);
        const calculo = await CarrinhoService.calcularTotal(userId);
        
        return {
            sucesso: true,
            cliente: { id: cliente.id, nome: cliente.nome, telefone: cliente.telefone },
            itens: carrinho.itens,
            subtotal: calculo.subtotal,
            taxaEntrega: calculo.taxaEntrega,
            total: calculo.total,
            enderecos,
            pedidoMinimo: calculo.pedidoMinimo
        };
    }
    
    // Selecionar tipo de entrega
    static async selecionarEntrega(userId, tipo, enderecoId = null, horario = null) {
        const tiposValidos = ['entrega', 'retirada', 'agendada'];
        if (!tiposValidos.includes(tipo)) return { sucesso: false, mensagem: 'Tipo de entrega inválido.' };
        
        const db = getDatabase();
        const cliente = db.prepare('SELECT id FROM clientes WHERE telegram_id = ?').get(userId);
        
        if (tipo === 'entrega' && !enderecoId) {
            const principal = db.prepare('SELECT id FROM enderecos WHERE cliente_id = ? AND principal = 1').get(cliente.id);
            if (!principal) return { sucesso: false, mensagem: 'Nenhum endereço cadastrado.' };
            enderecoId = principal.id;
        }
        
        if (tipo === 'agendada' && !horario) {
            return { sucesso: false, mensagem: 'Selecione um horário de entrega.' };
        }
        
        return {
            sucesso: true,
            tipo,
            enderecoId,
            horario
        };
    }
    
    // Aplicar cupom
    static async aplicarCupom(userId, codigoCupom) {
        const db = getDatabase();
        const cupom = db.prepare('SELECT * FROM cupons WHERE codigo = ? AND ativo = 1').get(codigoCupom.toUpperCase());
        
        if (!cupom) return { sucesso: false, mensagem: 'Cupom inválido ou expirado.' };
        if (cupom.uso_atual >= cupom.uso_maximo) return { sucesso: false, mensagem: 'Cupom esgotado.' };
        if (cupom.valido_ate && new Date(cupom.valido_ate) < new Date()) return { sucesso: false, mensagem: 'Cupom vencido.' };
        
        const carrinho = await CarrinhoService.listar(userId);
        let desconto = 0;
        
        if (cupom.tipo === 'percentual') {
            desconto = carrinho.total * (cupom.valor / 100);
        } else {
            desconto = cupom.valor;
        }
        
        return {
            sucesso: true,
            cupom: cupom.codigo,
            tipo: cupom.tipo,
            valor: cupom.valor,
            desconto: Math.min(desconto, carrinho.total),
            totalComDesconto: carrinho.total - Math.min(desconto, carrinho.total)
        };
    }
    
    // Finalizar pedido e gerar pagamento
    static async finalizarPedido(userId, metodoPagamento, dados = {}) {
        const db = getDatabase();
        const cliente = db.prepare('SELECT * FROM clientes WHERE telegram_id = ?').get(userId);
        if (!cliente) return { sucesso: false, mensagem: 'Cliente não encontrado.' };
        
        const carrinho = await CarrinhoService.listar(userId);
        if (carrinho.itens.length === 0) return { sucesso: false, mensagem: 'Carrinho vazio.' };
        
        // Verifica estoque
        for (const item of carrinho.itens) {
            const produto = db.prepare('SELECT estoque, nome FROM produtos WHERE id = ?').get(item.produto_id);
            if (!produto || produto.estoque < item.quantidade) {
                return { sucesso: false, mensagem: `Estoque insuficiente para: ${produto?.nome || 'Produto'}` };
            }
        }
        
        const calculo = await CarrinhoService.calcularTotal(userId, dados.enderecoId);
        const numeroPedido = gerarNumeroPedido();
        
        let desconto = 0;
        let cupomCodigo = null;
        
        // Aplica cupom se existir
        if (dados.cupom) {
            const resultadoCupom = await this.aplicarCupom(userId, dados.cupom);
            if (resultadoCupom.sucesso) {
                desconto = resultadoCupom.desconto;
                cupomCodigo = resultadoCupom.cupom;
            }
        }
        
        const totalFinal = calculo.total - desconto;
        
        // Gera pagamento PIX
        let pagamentoResult;
        if (metodoPagamento === 'pix') {
            const descricao = carrinho.itens.map(i => `${i.quantidade}x ${i.nome}`).join(', ').substring(0, 100);
            pagamentoResult = await pagamentoService.gerarPix(totalFinal, descricao, numeroPedido);
            
            if (!pagamentoResult.sucesso) {
                return { sucesso: false, mensagem: 'Erro ao gerar PIX. Tente novamente.' };
            }
        }
        
        // Salva pedido
        try {
            const pedido = db.prepare(`INSERT INTO pedidos 
                (numero, cliente_id, endereco_id, tipo_entrega, status, subtotal, taxa_entrega, desconto, total, cupom, comentario, pagamento_metodo, pagamento_id, pagamento_qrcode, pagamento_status)
                VALUES (?, ?, ?, ?, 'recebido', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`)
            .run(
                numeroPedido, cliente.id, dados.enderecoId || null, dados.tipoEntrega || 'entrega',
                calculo.subtotal, calculo.taxaEntrega, desconto, totalFinal,
                cupomCodigo, dados.comentario || null,
                metodoPagamento, pagamentoResult?.payment_id || null,
                pagamentoResult?.copia_cola || null
            );
            
            // Salva itens
            for (const item of carrinho.itens) {
                const preco = item.preco_promocional || item.preco;
                db.prepare('INSERT INTO itens_pedido (pedido_id, produto_nome, marca, quantidade, preco_unitario, comentario) VALUES (?, ?, ?, ?, ?, ?)')
                .run(pedido.lastInsertRowid, item.nome, item.marca, item.quantidade, preco, item.comentario);
                
                // Atualiza estoque
                db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(item.quantidade, item.produto_id);
            }
            
            // Atualiza uso do cupom
            if (cupomCodigo) {
                db.prepare('UPDATE cupons SET uso_atual = uso_atual + 1 WHERE codigo = ?').run(cupomCodigo);
            }
            
            // Limpa carrinho
            await CarrinhoService.limpar(userId);
            
            logger.info(`📦 Pedido ${numeroPedido} criado - R$ ${totalFinal}`);
            
            return {
                sucesso: true,
                pedidoId: pedido.lastInsertRowid,
                numero: numeroPedido,
                total: totalFinal,
                pagamento: pagamentoResult
            };
            
        } catch (error) {
            logger.error('Erro ao finalizar pedido: ' + error.message);
            return { sucesso: false, mensagem: 'Erro ao finalizar pedido.' };
        }
    }
    
    // Opções de falta de produto
    static getOpcoesFalta() {
        return [
            { id: 'substituir', nome: '✅ Escolher outro semelhante' },
            { id: 'nao_substituir', nome: '❌ Não substituir' },
            { id: 'contato', nome: '📞 Entrar em contato' }
        ];
    }
}

module.exports = CheckoutService;
