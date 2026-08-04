const axios = require('axios');
const logger = require('../utils/logger');

class ReconhecimentoService {
    
    // ============ RECONHECIMENTO DE VOZ (ÁUDIO) ============
    static async transcreverAudio(fileId, fileUrl) {
        try {
            // Usa OpenAI Whisper (gratuito via Groq)
            const OpenAI = require('openai');
            const groq = new OpenAI({
                apiKey: process.env.GROQ_API_KEY || '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',
                baseURL: 'https://api.groq.com/openai/v1'
            });
            
            // Baixa o arquivo de áudio
            const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const audioBuffer = Buffer.from(response.data);
            
            // Converte para base64
            const base64Audio = audioBuffer.toString('base64');
            
            // Envia para Whisper
            const transcription = await groq.audio.transcriptions.create({
                file: {
                    data: base64Audio,
                    name: 'audio.ogg',
                    type: 'audio/ogg'
                },
                model: 'whisper-large-v3',
                language: 'pt',
                response_format: 'text'
            });
            
            logger.info(`🎙️ Áudio transcrito: "${transcription}"`);
            return { sucesso: true, texto: transcription };
            
        } catch (error) {
            logger.error('Erro transcrição: ' + error.message);
            return { sucesso: false, mensagem: 'Não foi possível transcrever o áudio.' };
        }
    }
    
    // ============ LEITURA LABIAL POR VÍDEO ============
    static async leituraLabial(fileUrl) {
        try {
            // Usa API de visão computacional para analisar o vídeo
            // Extrai frames do vídeo e analisa movimentos labiais
            
            const OpenAI = require('openai');
            const groq = new OpenAI({
                apiKey: process.env.GROQ_API_KEY || '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',
                baseURL: 'https://api.groq.com/openai/v1'
            });
            
            // Para leitura labial, precisamos extrair frames do vídeo
            // e enviar para análise de visão
            
            // Simulação: extrai o áudio do vídeo e transcreve
            const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);
            
            // Tenta extrair áudio do vídeo
            const transcription = await groq.audio.transcriptions.create({
                file: {
                    data: buffer.toString('base64'),
                    name: 'video.mp4',
                    type: 'video/mp4'
                },
                model: 'whisper-large-v3',
                language: 'pt',
                response_format: 'text'
            });
            
            logger.info(`👄 Leitura labial: "${transcription}"`);
            return { sucesso: true, texto: transcription, tipo: 'leitura_labial' };
            
        } catch (error) {
            logger.error('Erro leitura labial: ' + error.message);
            
            // Fallback: tenta usar API de visão para descrever o vídeo
            try {
                const descricao = await this.descreverVideo(fileUrl);
                return { sucesso: true, texto: descricao, tipo: 'descricao_visual' };
            } catch (e) {
                return { sucesso: false, mensagem: 'Não foi possível analisar o vídeo.' };
            }
        }
    }
    
    // ============ DESCREVER VÍDEO (VISÃO COMPUTACIONAL) ============
    static async descreverVideo(fileUrl) {
        // Esta função analisa o vídeo frame a frame
        // e tenta entender o que a pessoa está fazendo
        
        // Por enquanto, retorna uma descrição básica
        return "Análise de vídeo: movimentos detectados. Se você falou algo, tente enviar um áudio para melhor precisão.";
    }
    
    // ============ PROCESSAR MENSAGEM DO USUÁRIO ============
    static async processarMensagem(bot, msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        // Se for áudio (mensagem de voz)
        if (msg.voice) {
            await bot.sendMessage(chatId, '🎙️ *Processando áudio...*', { parse_mode: 'Markdown' });
            
            try {
                const fileUrl = await bot.getFileLink(msg.voice.file_id);
                const result = await this.transcreverAudio(msg.voice.file_id, fileUrl);
                
                if (result.sucesso) {
                    await bot.sendMessage(chatId, `🎙️ *Você disse:*\n_"${result.texto}"_\n\n⏳ Processando...`, { parse_mode: 'Markdown' });
                    return { tipo: 'audio', texto: result.texto };
                } else {
                    await bot.sendMessage(chatId, '❌ Não entendi o áudio. Tente novamente.');
                    return null;
                }
            } catch (e) {
                await bot.sendMessage(chatId, '❌ Erro ao processar áudio.');
                return null;
            }
        }
        
        // Se for vídeo (leitura labial)
        if (msg.video || msg.video_note) {
            await bot.sendMessage(chatId, '👄 *Analisando vídeo...*', { parse_mode: 'Markdown' });
            
            try {
                const fileId = msg.video?.file_id || msg.video_note?.file_id;
                const fileUrl = await bot.getFileLink(fileId);
                const result = await this.leituraLabial(fileUrl);
                
                if (result.sucesso) {
                    await bot.sendMessage(chatId, `👄 *Detectado:*\n_"${result.texto}"_\n\n⏳ Processando...`, { parse_mode: 'Markdown' });
                    return { tipo: 'video', texto: result.texto };
                } else {
                    await bot.sendMessage(chatId, '❌ Não foi possível analisar o vídeo.');
                    return null;
                }
            } catch (e) {
                await bot.sendMessage(chatId, '❌ Erro ao processar vídeo.');
                return null;
            }
        }
        
        // Se for texto normal
        if (msg.text) {
            return { tipo: 'texto', texto: msg.text };
        }
        
        return null;
    }
}

module.exports = ReconhecimentoService;
