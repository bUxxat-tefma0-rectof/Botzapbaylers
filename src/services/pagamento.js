const { MercadoPagoConfig, Payment } = require('mercadopago');
const QRCode = require('qrcode');
const logger = require('../utils/logger');

class PagamentoService {
    constructor() {
        this.client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
    }
    
    async gerarPix(valor, descricao, pedidoNumero) {
        try {
            const payment = new Payment(this.client);
            const response = await payment.create({
                body: {
                    transaction_amount: Number(valor),
                    description: descricao,
                    payment_method_id: 'pix',
                    payer: { email: `pedido${pedidoNumero}@mercadinho.com` }
                }
            });
            
            const pix = {
                qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
                copia_cola: response.point_of_interaction.transaction_data.qr_code,
                payment_id: response.id,
                status: response.status
            };
            
            const qrBuffer = await QRCode.toBuffer(pix.copia_cola, { width: 400 });
            logger.info(`💳 PIX: ${pix.payment_id}`);
            return { sucesso: true, ...pix, qrBuffer };
        } catch (e) {
            logger.error('Erro PIX: ' + e.message);
            return { sucesso: false, msg: 'Erro ao gerar pagamento' };
        }
    }
    
    async verificarPagamento(id) {
        try {
            const payment = new Payment(this.client);
            const r = await payment.get({ id });
            return { status: r.status, aprovado: r.status === 'approved' };
        } catch (e) { return { status: 'error', aprovado: false }; }
    }
}

module.exports = new PagamentoService();
