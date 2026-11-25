export interface CrossChannelTurn {
  canal: 'whatsapp' | 'web';
  hace_minutos: number;
  usuario?: string;
  asistente?: string;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function clipTurn(value: unknown, max = 200): string {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * Recupera hasta 3 turnos recientes del mismo actor en el otro canal (últimas 2 horas)
 * como contexto informativo de solo lectura. Falla en silencio ante mocks o entornos parciales.
 */
export async function loadRecentCrossChannelTurns(
  db: any,
  actor: { id: string; empresa_id: string; rol: string },
  currentChannel: 'web' | 'whatsapp',
): Promise<CrossChannelTurn[]> {
  if (!db || typeof db.from !== 'function' || !actor?.id || !actor?.empresa_id) return [];
  const now = Date.now();
  const cutoffIso = new Date(now - TWO_HOURS_MS).toISOString();

  try {
    if (currentChannel === 'web') {
      let query = db
        .from('whatsapp_mensajes')
        .select('texto,respuesta,created_at,acciones')
        .eq('empresa_id', actor.empresa_id)
        .eq('actor_id', actor.id);
      if (typeof query?.gte === 'function') query = query.gte('created_at', cutoffIso);
      if (typeof query?.order === 'function') query = query.order('created_at', { ascending: false });
      if (typeof query?.limit === 'function') query = query.limit(5);
      const res = await query;
      if (!Array.isArray(res?.data)) return [];
      return res.data
        .filter((row: any) => row?.acciones?.tipo !== 'agrupado_en_lote' && (row.texto || row.respuesta))
        .slice(0, 3)
        .reverse()
        .map((row: any) => ({
          canal: 'whatsapp' as const,
          hace_minutos: Math.max(0, Math.round((now - Date.parse(row.created_at || '')) / 60000) || 0),
          usuario: clipTurn(row.texto),
          asistente: clipTurn(row.respuesta),
        }));
    }

    if (!['admin', 'supervisor'].includes(actor.rol)) return [];
    let sessionQuery = db
      .from('obrabot_chat_sessions')
      .select('id')
      .eq('empresa_id', actor.empresa_id)
      .eq('usuario_id', actor.id);
    if (typeof sessionQuery?.maybeSingle === 'function') {
      const sessionRes = await sessionQuery.maybeSingle();
      const sessionId = sessionRes?.data?.id;
      if (!sessionId) return [];
      let msgQuery = db
        .from('obrabot_chat_messages')
        .select('payload,created_at')
        .eq('session_id', sessionId);
      if (typeof msgQuery?.gte === 'function') msgQuery = msgQuery.gte('created_at', cutoffIso);
      if (typeof msgQuery?.order === 'function') msgQuery = msgQuery.order('created_at', { ascending: false });
      if (typeof msgQuery?.limit === 'function') msgQuery = msgQuery.limit(6);
      const msgRes = await msgQuery;
      if (!Array.isArray(msgRes?.data) || !msgRes.data.length) return [];

      const ordered = msgRes.data.slice().reverse();
      const turns: CrossChannelTurn[] = [];
      for (const row of ordered) {
        const role = row?.payload?.remitente;
        const text = clipTurn(row?.payload?.texto);
        if (!text) continue;
        const mins = Math.max(0, Math.round((now - Date.parse(row.created_at || '')) / 60000) || 0);
        if (role === 'usuario') {
          turns.push({ canal: 'web', hace_minutos: mins, usuario: text });
        } else if (role === 'agente') {
          const prev = turns[turns.length - 1];
          if (prev && !prev.asistente) prev.asistente = text;
          else turns.push({ canal: 'web', hace_minutos: mins, asistente: text });
        }
      }
      return turns.slice(-3);
    }
  } catch {
    // Nunca interrumpir el turno principal si la consulta auxiliar no está disponible.
  }
  return [];
}
