const { getDatabase } = require('../database/connection');
const logger = require('../utils/logger');

class AgendamentoService {
    
    // Listar horários disponíveis
    static async getHorariosDisponiveis(diaSemana = null) {
        const db = getDatabase();
        const dia = diaSemana || new Date().getDay();
        
        const horarios = db.prepare(`
            SELECT * FROM horarios_entrega 
            WHERE dia_semana = ? AND disponivel = 1
            ORDER BY horario
        `).all(dia);
        
        // Verifica se o horário já passou hoje
        const agora = new Date();
        const horaAtual = agora.getHours();
        const minutoAtual = agora.getMinutes();
        
        return horarios.filter(h => {
            const [hora, minuto] = h.horario.split(':').map(Number);
            if (dia === agora.getDay()) {
                return (hora > horaAtual) || (hora === horaAtual && minuto > minutoAtual);
            }
            return true;
        });
    }
    
    // Listar horários para a semana
    static async getHorariosSemana() {
        const db = getDatabase();
        const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const horarios = db.prepare('SELECT * FROM horarios_entrega WHERE disponivel = 1 ORDER BY dia_semana, horario').all();
        
        const resultado = {};
        for (const h of horarios) {
            const dia = diasSemana[h.dia_semana];
            if (!resultado[dia]) resultado[dia] = [];
            resultado[dia].push(h.horario);
        }
        
        return resultado;
    }
    
    // Verificar se horário está disponível
    static async verificarDisponibilidade(diaSemana, horario) {
        const db = getDatabase();
        const disponivel = db.prepare('SELECT * FROM horarios_entrega WHERE dia_semana = ? AND horario = ? AND disponivel = 1').get(diaSemana, horario);
        return !!disponivel;
    }
    
    // Agendar entrega
    static async agendar(userId, pedidoId, diaSemana, horario) {
        const db = getDatabase();
        
        const disponivel = await this.verificarDisponibilidade(diaSemana, horario);
        if (!disponivel) return { sucesso: false, mensagem: 'Horário indisponível.' };
        
        db.prepare('UPDATE pedidos SET tipo_entrega = ?, data_agendada = ?, horario_agendado = ? WHERE id = ?').run('agendada', diaSemana, horario, pedidoId);
        
        logger.info(`📅 Entrega agendada: Pedido ${pedidoId} - ${diaSemana} ${horario}`);
        return { sucesso: true, mensagem: 'Entrega agendada com sucesso!' };
    }
    
    // Adicionar horário de entrega (admin)
    static async adicionarHorario(diaSemana, horario) {
        const db = getDatabase();
        const existe = db.prepare('SELECT * FROM horarios_entrega WHERE dia_semana = ? AND horario = ?').get(diaSemana, horario);
        if (existe) {
            db.prepare('UPDATE horarios_entrega SET disponivel = 1 WHERE id = ?').run(existe.id);
        } else {
            db.prepare('INSERT INTO horarios_entrega (dia_semana, horario) VALUES (?, ?)').run(diaSemana, horario);
        }
        return { sucesso: true, mensagem: 'Horário adicionado!' };
    }
    
    // Remover horário (admin)
    static async removerHorario(diaSemana, horario) {
        const db = getDatabase();
        db.prepare('UPDATE horarios_entrega SET disponivel = 0 WHERE dia_semana = ? AND horario = ?').run(diaSemana, horario);
        return { sucesso: true, mensagem: 'Horário removido!' };
    }
}

module.exports = AgendamentoService;
