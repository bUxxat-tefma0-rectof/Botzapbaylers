const { MercadoPagoConfig, Payment } = require('mercadopago');
const QRCode = require('qrcode');
const logger = require('../utils/logger');

class PagamentoService {
    
    constructor() {
        this.client = new MercadoPagoConfig({
            accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN
        });
    }
    
    // ============ PIX ============
    async gerarPix(valor, descricao, pedidoNumero) {
        try {
            const payment = new Payment(this.client);
            
            const body = {
                transaction_amount: Number(valor),
                description: descricao || `Pedido ${pedidoNumero}`,
                payment_method_id: 'pix',
                payer: {
                    email: `pedido${pedidoNumero}@supermercado.com`,
                    first_name: 'Cliente'
                },
                additional_info: {
                    items: [{
                        id: pedidoNumero,
                        title: descricao,
                        quantity: 1,
                        unit_price: Number(valor)
                    }]
                }
            };
            
            const response = await payment.create({ body });
            
            const pix = {
                qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
                copia_cola: response.point_of_interaction.transaction_data.qr_code,
                payment_id: response.id,
                status: response.status,
                data_expiracao: response.date_of_expiration
            };
            
            const qrBuffer = await QRCode.toBuffer(pix.copia_cola, { 
                width: 400, 
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' }
            });
            
            logger.info(`💳 PIX gerado: ${pix.payment_id} - R$ ${valor}`);
            return { sucesso: true, ...pix, qrBuffer };
            
        } catch (error) {
            logger.error('Erro ao gerar PIX: ' + error.message);
            return { sucesso: false, mensagem: 'Erro ao gerar pagamento PIX. Tente novamente.' };
        }
    }
    
    // ============ CARTÃO DE CRÉDITO ============
    async gerarPagamentoCartao(valor, token, parcelas, descricao, pedidoNumero, dadosPagador) {
        try {
            const payment = new Payment(this.client);
            
            const body = {
                transaction_amount: Number(valor),
                token: token,
                description: descricao || `Pedido ${pedidoNumero}`,
                installments: Number(parcelas) || 1,
                payment_method_id: 'mastercard',
                issuer_id: dadosPagador?.issuer_id || null,
                payer: {
                    email: dadosPagador?.email || `pedido${pedidoNumero}@supermercado.com`,
                    identification: {
                        type: dadosPagador?.tipo_documento || 'CPF',
                        number: dadosPagador?.numero_documento || '12345678909'
                    }
                },
                additional_info: {
                    items: [{
                        id: pedidoNumero,
                        title: descricao,
                        quantity: 1,
                        unit_price: Number(valor)
                    }]
                }
            };
            
            const response = await payment.create({ body });
            
            logger.info(`💳 Cartão: ${response.id} - R$ ${valor} - ${parcelas}x`);
            
            return {
                sucesso: true,
                payment_id: response.id,
                status: response.status,
                status_detail: response.status_detail,
                parcelas: parcelas,
                valor_parcela: Number(valor) / Number(parcelas)
            };
            
        } catch (error) {
            logger.error('Erro ao processar cartão: ' + error.message);
            
            // Tenta com outros métodos de cartão
            const metodos = ['visa', 'mastercard', 'amex', 'elo', 'hipercard'];
            for (const metodo of metodos) {
                try {
                    const payment = new Payment(this.client);
                    const body = {
                        transaction_amount: Number(valor),
                        token: token,
                        description: descricao,
                        installments: Number(parcelas) || 1,
                        payment_method_id: metodo,
                        payer: {
                            email: dadosPagador?.email || `pedido${pedidoNumero}@supermercado.com`,
                            identification: {
                                type: 'CPF',
                                number: dadosPagador?.numero_documento || '12345678909'
                            }
                        }
                    };
                    
                    const response = await payment.create({ body });
                    
                    if (response.status === 'approved' || response.status === 'in_process') {
                        return {
                            sucesso: true,
                            payment_id: response.id,
                            status: response.status,
                            metodo_usado: metodo,
                            parcelas: parcelas
                        };
                    }
                } catch (e) {
                    continue;
                }
            }
            
            return { sucesso: false, mensagem: 'Pagamento recusado. Verifique os dados do cartão.' };
        }
    }
    
    // ============ CARTÃO DE DÉBITO ============
    async gerarPagamentoDebito(valor, token, descricao, pedidoNumero, dadosPagador) {
        try {
            const payment = new Payment(this.client);
            
            const body = {
                transaction_amount: Number(valor),
                token: token,
                description: descricao || `Pedido ${pedidoNumero}`,
                installments: 1,
                payment_method_id: 'debmaster',
                payer: {
                    email: dadosPagador?.email || `pedido${pedidoNumero}@supermercado.com`,
                    identification: {
                        type: 'CPF',
                        number: dadosPagador?.numero_documento || '12345678909'
                    }
                }
            };
            
            const response = await payment.create({ body });
            
            logger.info(`💳 Débito: ${response.id} - R$ ${valor}`);
            
            return {
                sucesso: true,
                payment_id: response.id,
                status: response.status
            };
            
        } catch (error) {
            logger.error('Erro débito: ' + error.message);
            return { sucesso: false, mensagem: 'Pagamento recusado.' };
        }
    }
    
    // ============ BOLETO ============
    async gerarBoleto(valor, descricao, pedidoNumero, dadosPagador) {
        try {
            const payment = new Payment(this.client);
            
            const body = {
                transaction_amount: Number(valor),
                description: descricao || `Pedido ${pedidoNumero}`,
                payment_method_id: 'bolbradesco',
                payer: {
                    email: dadosPagador?.email || `pedido${pedidoNumero}@supermercado.com`,
                    first_name: dadosPagador?.nome || 'Cliente',
                    last_name: dadosPagador?.sobrenome || '',
                    identification: {
                        type: dadosPagador?.tipo_documento || 'CPF',
                        number: dadosPagador?.numero_documento || '12345678909'
                    },
                    address: {
                        zip_code: dadosPagador?.cep || '87700000',
                        street_name: dadosPagador?.rua || 'Rua Principal',
                        street_number: dadosPagador?.numero || '100',
                        neighborhood: dadosPagador?.bairro || 'Centro',
                        city: dadosPagador?.cidade || 'Paranavaí',
                        federal_unit: dadosPagador?.estado || 'PR'
                    }
                }
            };
            
            const response = await payment.create({ body });
            
            logger.info(`📄 Boleto gerado: ${response.id} - R$ ${valor}`);
            
            return {
                sucesso: true,
                payment_id: response.id,
                status: response.status,
                boleto_url: response.transaction_details?.external_resource_url,
                boleto_codigo: response.barcode?.content,
                data_vencimento: response.date_of_expiration
            };
            
        } catch (error) {
            logger.error('Erro ao gerar boleto: ' + error.message);
            return { sucesso: false, mensagem: 'Erro ao gerar boleto.' };
        }
    }
    
    // ============ VALE ALIMENTAÇÃO ============
    async gerarPagamentoValeAlimentacao(valor, token, descricao, pedidoNumero, bandeira = 'sodexo') {
        try {
            const payment = new Payment(this.client);
            
            const metodosVale = {
                'sodexo': 'sodexo',
                'ticket': 'ticket',
                'alelo': 'alelo',
                'vr': 'vr'
            };
            
            const body = {
                transaction_amount: Number(valor),
                token: token,
                description: descricao || `Pedido ${pedidoNumero}`,
                installments: 1,
                payment_method_id: metodosVale[bandeira] || 'sodexo',
                payer: {
                    email: `pedido${pedidoNumero}@supermercado.com`
                }
            };
            
            const response = await payment.create({ body });
            
            logger.info(`🍽️ Vale Alimentação: ${response.id} - R$ ${valor}`);
            
            return {
                sucesso: true,
                payment_id: response.id,
                status: response.status,
                bandeira: bandeira
            };
            
        } catch (error) {
            logger.error('Erro vale alimentação: ' + error.message);
            return { sucesso: false, mensagem: 'Pagamento recusado.' };
        }
    }
    
    // ============ VALE REFEIÇÃO ============
    async gerarPagamentoValeRefeicao(valor, token, descricao, pedidoNumero, bandeira = 'sodexo') {
        return await this.gerarPagamentoValeAlimentacao(valor, token, descricao, pedidoNumero, bandeira);
    }
    
    // ============ DINHEIRO (NA ENTREGA) ============
    async gerarPagamentoDinheiro(valor, pedidoNumero) {
        return {
            sucesso: true,
            payment_id: `dinheiro_${pedidoNumero}_${Date.now()}`,
            status: 'pending',
            metodo: 'dinheiro',
            mensagem: 'Pagamento em dinheiro na entrega. Tenha o valor em mãos!',
            troco_necessario: false
        };
    }
    
    // ============ PIX PARCELADO (CARTÃO DE CRÉDITO VIA PIX) ============
    async gerarPixParcelado(valor, parcelas, descricao, pedidoNumero) {
        try {
            const payment = new Payment(this.client);
            
            const valorParcela = Number(valor) / Number(parcelas);
            
            const body = {
                transaction_amount: Number(valor),
                description: `${descricao} - ${parcelas}x de R$ ${valorParcela.toFixed(2)}`,
                payment_method_id: 'pix',
                installments: Number(parcelas),
                payer: {
                    email: `pedido${pedidoNumero}@supermercado.com`
                }
            };
            
            const response = await payment.create({ body });
            
            if (response.point_of_interaction?.transaction_data) {
                const pix = {
                    qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
                    copia_cola: response.point_of_interaction.transaction_data.qr_code,
                    payment_id: response.id,
                    status: response.status,
                    parcelas: parcelas,
                    valor_parcela: valorParcela
                };
                
                const qrBuffer = await QRCode.toBuffer(pix.copia_cola, { width: 400 });
                
                return { sucesso: true, ...pix, qrBuffer };
            }
            
            return { sucesso: false, mensagem: 'PIX parcelado indisponível.' };
            
        } catch (error) {
            return { sucesso: false, mensagem: 'Erro ao gerar PIX parcelado.' };
        }
    }
    
    // ============ VERIFICAR PAGAMENTO ============
    async verificarPagamento(paymentId) {
        try {
            const payment = new Payment(this.client);
            const response = await payment.get({ id: paymentId });
            
            return {
                status: response.status,
                aprovado: response.status === 'approved',
                recusado: response.status === 'rejected',
                pendente: response.status === 'pending',
                detalhe: response.status_detail,
                data_aprovacao: response.date_approved,
                metodo: response.payment_method_id,
                valor: response.transaction_amount,
                parcelas: response.installments
            };
        } catch (error) {
            return { status: 'error', aprovado: false, mensagem: error.message };
        }
    }
    
    // ============ REEMBOLSO ============
    async reembolsar(paymentId, valor = null) {
        try {
            const payment = new Payment(this.client);
            
            if (valor) {
                const response = await payment.refund({
                    id: paymentId,
                    amount: Number(valor)
                });
                return { sucesso: true, mensagem: `Reembolso de R$ ${valor} realizado!` };
            } else {
                const response = await payment.refund({ id: paymentId });
                return { sucesso: true, mensagem: 'Reembolso total realizado!' };
            }
        } catch (error) {
            logger.error('Erro ao reembolsar: ' + error.message);
            return { sucesso: false, mensagem: 'Erro ao processar reembolso.' };
        }
    }
    
    // ============ CANCELAR PAGAMENTO ============
    async cancelarPagamento(paymentId) {
        try {
            const payment = new Payment(this.client);
            const response = await payment.cancel({ id: paymentId });
            
            return { 
                sucesso: true, 
                status: response.status,
                mensagem: 'Pagamento cancelado com sucesso!' 
            };
        } catch (error) {
            return { sucesso: false, mensagem: 'Erro ao cancelar pagamento.' };
        }
    }
    
    // ============ GERAR TOKEN DO CARTÃO (PARA TESTES) ============
    async gerarTokenCartao(dadosCartao) {
        try {
            // Simulação - em produção usaria SDK do Mercado Pago no frontend
            return {
                sucesso: true,
                token: `test_token_${Date.now()}`,
                mensagem: 'Token gerado com sucesso!'
            };
        } catch (error) {
            return { sucesso: false, mensagem: 'Erro ao gerar token.' };
        }
    }
    
    // ============ CALCULAR PARCELAS COM JUROS ============
    calcularParcelas(valor, maxParcelas = 12) {
        const parcelas = [];
        const jurosPorParcela = {
            1: 0, 2: 0, 3: 0, 4: 1.5, 5: 2.0, 6: 2.5,
            7: 3.0, 8: 3.5, 9: 4.0, 10: 4.5, 11: 5.0, 12: 5.5
        };
        
        for (let i = 1; i <= maxParcelas; i++) {
            const juros = jurosPorParcela[i] || (i * 0.5);
            const valorTotal = valor * (1 + juros / 100);
            const valorParcela = valorTotal / i;
            
            parcelas.push({
                numero: i,
                valor_total: valorTotal,
                valor_parcela: valorParcela,
                juros_percentual: juros,
                sem_juros: juros === 0
            });
        }
        
        return parcelas;
    }
    
    // ============ LISTAR MÉTODOS DE PAGAMENTO DISPONÍVEIS ============
    async getMetodosDisponiveis() {
        return [
            {
                id: 'pix',
                nome: 'PIX',
                icone: '💳',
                descricao: 'Pagamento instantâneo',
                parcelas: 1,
                processamento: 'Imediato'
            },
            {
                id: 'credito',
                nome: 'Cartão de Crédito',
                icone: '💳',
                descricao: 'Parcele em até 12x',
                parcelas: 12,
                processamento: 'Na hora'
            },
            {
                id: 'debito',
                nome: 'Cartão de Débito',
                icone: '🏧',
                descricao: 'Débito em conta',
                parcelas: 1,
                processamento: 'Na hora'
            },
            {
                id: 'boleto',
                nome: 'Boleto Bancário',
                icone: '📄',
                descricao: 'Vencimento em 3 dias',
                parcelas: 1,
                processamento: '2-3 dias úteis'
            },
            {
                id: 'vale_alimentacao',
                nome: 'Vale Alimentação',
                icone: '🍽️',
                descricao: 'Sodexo, Ticket, Alelo, VR',
                parcelas: 1,
                processamento: 'Na hora'
            },
            {
                id: 'vale_refeicao',
                nome: 'Vale Refeição',
                icone: '🍴',
                descricao: 'Sodexo, Ticket, Alelo, VR',
                parcelas: 1,
                processamento: 'Na hora'
            },
            {
                id: 'dinheiro',
                nome: 'Dinheiro',
                icone: '💵',
                descricao: 'Pague na entrega',
                parcelas: 1,
                processamento: 'Na entrega'
            },
            {
                id: 'pix_parcelado',
                nome: 'PIX Parcelado',
                icone: '📱',
                descricao: 'Parcele seu PIX em até 12x',
                parcelas: 12,
                processamento: 'Imediato'
            }
        ];
    }
}

module.exports = new PagamentoService();
