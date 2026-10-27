import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/client';
import { AIError, aiErrorResponse } from './errors';
import { serverFetch } from '@/lib/server-fetch';
import { chatAsesorObrasGemini, chatAgenteProyectoGemini } from '@/lib/gemini';

export async function authorizeAI(request: NextRequest) {
  const bearer = request.headers
    .get('authorization')
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer)
    throw new AIError(
      'AUTH_REQUIRED',
      'Inicia sesión nuevamente para usar el asistente.',
      401,
    );
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: serverFetch,
      headers: { Authorization: `Bearer ${bearer}` },
    },
  });
  const { data, error } = await client.auth.getUser(bearer);
  if (error || !data.user)
    throw new AIError(
      'AUTH_REQUIRED',
      'Tu sesión no es válida o expiró. Inicia sesión nuevamente.',
      401,
    );
  const { data: user, error: profileError } = await client
    .from('usuarios')
    .select('id,empresa_id,rol')
    .or(`id.eq.${data.user.id},auth_user_id.eq.${data.user.id}`)
    .maybeSingle();
  if (profileError || !user?.empresa_id)
    throw new AIError(
      'TENANT_REQUIRED',
      'Tu cuenta no tiene una empresa disponible para gestionar obras.',
      403,
    );
  return { client, user };
}

export function errorJSON(error: unknown) {
  const result = aiErrorResponse(error);
  return NextResponse.json(
    { error: result.error, code: result.code },
    { status: result.status },
  );
}

export async function readAIRequest(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 180000)
    throw new AIError(
      'REQUEST_TOO_LARGE',
      'La conversación es demasiado extensa. Inicia una conversación nueva.',
      413,
    );
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AIError(
      'INVALID_REQUEST',
      'El mensaje no tiene un formato válido.',
      400,
    );
  }
  if (!body || typeof body.mensaje !== 'string' || !body.mensaje.trim())
    throw new AIError(
      'INVALID_REQUEST',
      'Escribe un mensaje para el asistente.',
      400,
    );
  if (body.mensaje.length > 6000)
    throw new AIError(
      'MESSAGE_TOO_LONG',
      'Divide el mensaje en instrucciones más breves (hasta 6000 caracteres).',
      400,
    );
  const historial = (Array.isArray(body.historial) ? body.historial : [])
    .slice(-12)
    .filter((h: any) => typeof h?.texto === 'string')
    .map((h: any) => ({
      rol: h.remitente === 'usuario' ? ('user' as const) : ('model' as const),
      texto: h.texto.slice(0, 4000),
    }));
  return { ...body, mensaje: body.mensaje.trim(), historial };
}

// Dependencias explícitas permiten probar la ruta sin una clave ni una base de producción.
export function createChatHandler(
  deps = {
    authorize: authorizeAI,
    global: chatAsesorObrasGemini,
    project: chatAgenteProyectoGemini,
  },
) {
  return async (request: NextRequest, projectId?: string) => {
    try {
      const { client, user } = await deps.authorize(request);
      const body = await readAIRequest(request);
      if (projectId) {
        if (!/^[a-zA-Z0-9_-]+$/.test(projectId))
          throw new AIError('PROJECT_INVALID', 'La obra no es válida.', 400);
        const { data, error } = await client
          .from('proyectos')
          .select('*')
          .eq('id', projectId)
          .eq('empresa_id', user.empresa_id)
          .maybeSingle();
        if (error || !data)
          throw new AIError(
            'PROJECT_FORBIDDEN',
            'La obra no está disponible para tu cuenta.',
            403,
          );
        return NextResponse.json(
          await deps.project({
            historial: body.historial,
            mensajeUsuario: body.mensaje,
            contextoProyecto: {
              ...(body.contexto_proyecto || {}),
              ...data,
              cotizacion_actual: body.contexto_cotizacion || null,
            },
          }),
        );
      }
      return NextResponse.json(
        await deps.global(body.historial, body.mensaje, {
          ...(body.contexto_db || {}),
          cotizacion_actual: body.contexto_cotizacion || null,
        }),
      );
    } catch (error) {
      return errorJSON(error);
    }
  };
}
