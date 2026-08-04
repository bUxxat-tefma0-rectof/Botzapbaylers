// ROTA QR CODE (ATUALIZADA - MAIS TEMPO)
app.get('/qr', (req, res) => {
    const qr = getQR();
    const status = getStatus();
    
    if (status === 'conectado') {
        return res.send(`
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f2f5;margin:0}.box{background:white;padding:40px;border-radius:20px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.1)}h2{color:#25D366}</style></head>
            <body><div class="box"><h2>✅ WhatsApp Conectado!</h2><p>Pronto para enviar códigos.</p></div></body></html>
        `);
    }
    
    if (!qr) {
        return res.send(`
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f2f5;margin:0}.box{background:white;padding:40px;border-radius:20px;text-align:center}.loader{width:50px;height:50px;border:5px solid #f3f3f3;border-top:5px solid #25D366;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style></head>
            <body><div class="box"><h2>⏳ Gerando QR Code...</h2><div class="loader"></div><p>Aguarde um momento</p></div></body></html>
        `);
    }
    
    // Usa API do Google pra gerar QR Code pequeno
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    
    res.send(`
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f0f2f5;padding:20px;margin:0}.box{background:white;padding:30px;border-radius:20px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.1);max-width:400px;width:100%}h2{color:#25D366;margin-bottom:5px;font-size:22px}.sub{color:#666;margin-bottom:20px;font-size:14px}.qrcode{border:3px solid #25D366;border-radius:15px;padding:15px;width:280px;height:280px;max-width:90vw;max-height:90vw}.inst{background:#fff9e6;padding:15px;border-radius:10px;margin-top:20px;text-align:left;font-size:13px}.inst strong{color:#856404}.inst ol{margin:8px 0 0 20px;color:#856404}.inst li{margin:5px 0}.timer{color:#999;font-size:12px;margin-top:15px}.btn{display:inline-block;margin-top:15px;padding:12px 25px;background:#25D366;color:white;border:none;border-radius:25px;font-size:16px;cursor:pointer;text-decoration:none;font-weight:bold}</style></head>
        <body><div class="box"><h2>📱 WhatsApp</h2><p class="sub">Escaneie o QR Code</p>
        <img src="${qrUrl}" class="qrcode" alt="QR Code" id="qrImage">
        <div class="inst"><strong>📋 Como escanear:</strong><ol><li>Abra o WhatsApp</li><li>Aparelhos Conectados</li><li>Escanear QR Code</li></ol></div>
        <button class="btn" onclick="location.reload()">🔄 Atualizar QR Code</button>
        <p class="timer">Clique no botão para atualizar manualmente</p></div></body></html>
    `);
});
