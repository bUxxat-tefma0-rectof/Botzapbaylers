const PDFDocument = require('pdfkit');
const { formatarMoeda, formatarData } = require('../utils/helpers');

class PDFService {
    static async gerarRelatorio(pedidos, itens) {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];
        doc.on('data', b => buffers.push(b));
        
        return new Promise(resolve => {
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            
            doc.fontSize(20).text('🛒 Relatório Supermercado', { align: 'center' });
            doc.moveDown();
            doc.fontSize(10).fillColor('#666').text(`Gerado em: ${formatarData(new Date())}`, { align: 'center' });
            doc.moveDown(2);
            
            let total = 0;
            for (const p of pedidos) {
                doc.fontSize(12).fillColor('#333').text(`Pedido ${p.numero}`);
                doc.fontSize(9).fillColor('#666').text(`Cliente: ${p.nome || 'N/A'}`);
                doc.text(`Status: ${p.status} | Pagamento: ${p.pagamento_status}`);
                doc.text(`Data: ${formatarData(p.data_pedido)}`);
                
                const its = itens.filter(i => i.pedido_id === p.id);
                for (const i of its) doc.text(`  ${i.quantidade}x ${i.produto_nome} - ${formatarMoeda(i.preco_unitario * i.quantidade)}`);
                
                doc.text(`Total: ${formatarMoeda(p.total)}`, { align: 'right' });
                total += p.total;
                doc.moveDown();
            }
            
            doc.moveDown();
            doc.fontSize(14).fillColor('#333').text(`Total Geral: ${formatarMoeda(total)}`, { align: 'right', bold: true });
            doc.end();
        });
    }
}

module.exports = PDFService;
