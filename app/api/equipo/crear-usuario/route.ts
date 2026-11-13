import { NextRequest, NextResponse } from 'next/server';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { registrationFields } from '@/lib/registrations';
import { mapContactDatabaseError } from '@/lib/auth/registration-validation';
export async function POST(request: NextRequest) {
  try {
    const { client } = await authorizeAI(request);
    const input = await request.json();
    if (input.rol && !['terreno','supervisor'].includes(input.rol)) throw new AIError('ROLE_INVALID','Elige terreno o supervisor.',422);
    const checked = registrationFields({ ...input, tipo: 'trabajador' });
    if (checked.missing.length) throw new AIError('REGISTRATION_REQUIRED','Completa: ' + checked.missing.join(', '),422);
    const { nombre,rut,email,telefono,rol,proyecto_id,especialidades } = checked.draft;
    const { data,error } = await client.rpc('crear_integrante_equipo', { p_datos: { nombre,rut,email,telefono_whatsapp: telefono,rol,...(especialidades !== undefined ? {especialidades} : {}) }, p_proyecto: proyecto_id || null });
    if (error || !data?.id) {
      const detail = mapContactDatabaseError(error);
      throw new AIError('REGISTRATION_SAVE', detail || 'No se pudo confirmar el registro del trabajador.', 409);
    }
    return NextResponse.json({ success: true, user: data });
  } catch (error) { return errorJSON(error); }
}
