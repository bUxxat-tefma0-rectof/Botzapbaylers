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
        const metodosPagamento = await pagamentoService.getMetodosDisponiveis();
        const opcoesFalta = [
            { id: 'substituir', nome: '✅ Escolher outro semelhante' },
            { id: 'nao_substituir', nome: '❌ Não substituir' },
            { id: 'contato', nome: '📞 Entrar em contato' }
        ];
        
        return {
            sucesso: true,
            cliente: { id: cliente.id, nome: cliente.nome, telefone: cliente.telefone },
            itens: carrinho.itens,
            subtotal: calculo.subtotal,
            taxaEntrega: calculo.taxaEntrega,
            total: calculo.total,
            enderecos,
            metodosPagamento,
            opcoesFalta,
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
        
        if (tipo === 'retirada') {
            const configs = db.prepare("SELECT valor FROM configs WHERE chave = 'endereco_mercado'").get();
            return {
                sucesso: true,
                tipo,
                enderecoRetirada: configs?.valor || 'Endereço não configurado',
                mensagem: 'Retire seu pedido na loja!'
            };
        }
        
        return { sucesso: true, tipo, enderecoId, horario };
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
            desconto = Math.min(cupom.valor, carrinho.total);
        }
        
        return {
            sucesso: true,
            cupom: cupom.codigo,
            tipo: cupom.tipo,
            valor: cupom.valor,
            desconto: desconto,
            totalComDesconto: carrinho.total - desconto
        };
    }
    
    // Finalizar pedido
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
                return { sucesso: false, mensagem: `Estoque insuficiente: ${produto?.nome || 'Produto'}` };
            }
        }
        
        const calculo = await CarrinhoService.calcularTotal(userId, dados.enderecoId);
        const numeroPedido = gerarNumeroPedido();
        
        let desconto = 0;
        let cupomCodigo = null;
        
        if (dados.cupom) {
            const resultadoCupom = await this.aplicarCupom(userId, dados.cupom);
            if (resultadoCupom.sucesso) {
                desconto = resultadoCupom.desconto;
                cupomCodigo = resultadoCupom.cupom;
            }
        }
        
        const totalFinal = calculo.total - desconto;
        const descricao = carrinho.itens.map(i => `${i.quantidade}x ${i.nome}`).join(', ').substring(0, 100);
        
        let pagamentoResult;
        
        // Processa pagamento conforme método escolhido
        switch (metodoPagamento) {
            case 'pix':
                pagamentoResult = await pagamentoService.gerarPix(totalFinal, descricao, numeroPedido);
                break;
                
            case 'credito':
                if (!dados.tokenCartao) return { sucesso: false, mensagem: 'Token do cartão necessário.' };
                const parcelas = dados.parcelas || 1;
                pagamentoResult = await pagamentoService.gerarPagamentoCartao(
                    totalFinal, dados.tokenCartao, parcelas, descricao, numeroPedido, dados
                );
                break;
                
            case 'debito':
                if (!dados.tokenCartao) return { sucesso: false, mensagem: 'Token do cartão necessário.' };
                pagamentoResult = await pagamentoService.gerarPagamentoDebito(
                    totalFinal, dados.tokenCartao, descricao, numeroPedido, dados
                );
                break;
                
            case 'boleto':
                pagamentoResult = await pagamentoService.gerarBoleto(totalFinal, descricao, numeroPedido, dados);
                break;
                
            case 'vale_alimentacao':
            case 'vale_refeicao':
                if (!dados.tokenCartao) return { sucesso: false, mensagem: 'Token do cartão necessário.' };
                pagamentoResult = await pagamentoService.gerarPagamentoValeAlimentacao(
                    totalFinal, dados.tokenCartao, descricao, numeroPedido, dados.bandeira || 'sodexo'
                );
                break;
                
            case 'dinheiro':
                pagamentoResult = await pagamentoService.gerarPagamentoDinheiro(totalFinal, numeroPedido);
                break;
                
            case 'pix_parcelado':
                const parc = dados.parcelas || 3;
                pagamentoResult = await pagamentoService.gerarPixParcelado(totalFinal, parc, descricao, numeroPedido);
                break;
                
            default:
                return { sucesso: false, mensagem: 'Método de pagamento inválido.' };
        }
        
        if (!pagamentoResult || !pagamentoResult.sucesso) {
            return { sucesso: false, mensagem: pagamentoResult?.mensagem || 'Erro ao processar pagamento.' };
        }
        
        // Salva pedido
        try {
            const pedido = db.prepare(`INSERT INTO pedidos 
                (numero, cliente_id, endereco_id, tipo_entrega, status, subtotal, taxa_entrega, desconto, total, cupom, comentario, opcao_falta, pagamento_metodo, pagamento_id, pagamento_qrcode, pagamento_status)
                VALUES (?, ?, ?, ?, 'recebido', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(
                numeroPedido, cliente.id, dados.enderecoId || null, dados.tipoEntrega || 'entrega',
                calculo.subtotal, calculo.taxaEntrega, desconto, totalFinal,
                cupomCodigo, dados.comentario || null, dados.opcaoFalta || 'substituir',
                metodoPagamento, pagamentoResult.payment_id || null,
                pagamentoResult.copia_cola || pagamentoResult.boleto_codigo || null,
                pagamentoResult.status === 'approved' ? 'approved' : 'pendente'
            );
            
            // Salva itens
            for (const item of carrinho.itens) {
                const preco = item.preco_promocional || item.preco;
                db.prepare('INSERT INTO itens_pedido (pedido_id, produto_nome, marca, quantidade, preco_unitario, comentario) VALUES (?, ?, ?, ?, ?, ?)')
                .run(pedido.lastInsertRowid, item.nome, item.marca, item.quantidade, preco, item.comentario);
                
                db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(item.quantidade, item.produto_id);
            }
            
            if (cupomCodigo) {
                db.prepare('UPDATE cupons SET uso_atual = uso_atual + 1 WHERE codigo = ?').run(cupomCodigo);
            }
            
            await CarrinhoService.limpar(userId);
            
            // Se pagamento já foi aprovado (débito/dinheiro)
            if (pagamentoResult.status === 'approved') {
                db.prepare('UPDATE pedidos SET status = ? WHERE id = ?').run('confirmado', pedido.lastInsertRowid);
                db.prepare('UPDATE clientes SET total_gasto = total_gasto + ? WHERE id = ?').run(totalFinal, cliente.id);
            }
            
            logger.info(`📦 Pedido ${numeroPedido} - ${metodoPagamento} - R$ ${totalFinal}`);
            
            return {
                sucesso: true,
                pedidoId: pedido.lastInsertRowid,
                numero: numeroPedido,
                total: totalFinal,
                metodo: metodoPagamento,
                pagamento: pagamentoResult
            };
            
        } catch (error) {
            logger.error('Erro ao finalizar pedido: ' + error.message);
            return { sucesso: false, mensagem: 'Erro ao salvar pedido.' };
        }
    }
    
    // Calcular parcelas
    static calcularParcelas(valor) {
        return pagamentoService.calcularParcelas(valor);
    }
    
    // Verificar pagamento
    static async verificarPagamento(pedidoId) {
        const db = getDatabase();
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
        if (!pedido || !pedido.pagamento_id) return { aprovado: false, status: 'sem_pagamento' };
        
        const resultado = await pagamentoService.verificarPagamento(pedido.pagamento_id);
        
        if (resultado.aprovado && pedido.pagamento_status !== 'approved') {
            db.prepare('UPDATE pedidos SET status = ?, pagamento_status = ? WHERE id = ?').run('confirmado', 'approved', pedidoId);
            db.prepare('UPDATE clientes SET total_gasto = total_gasto + ? WHERE id = ?').run(pedido.total, pedido.cliente_id);
            const pontos = Math.floor(pedido.total);
            db.prepare('UPDATE clientes SET pontos_fidelidade = pontos_fidelidade + ? WHERE id = ?').run(pontos, pedido.cliente_id);
        }
        
        return resultado;
    }
}

module.exports = CheckoutService;
