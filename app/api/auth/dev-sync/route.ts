import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isDeveloperEmail } from '@/lib/auth-utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    const cleanEmail = (email || '').trim().toLowerCase();

    // Solo permitido para correos autorizados de desarrollador
    if (!isDeveloperEmail(cleanEmail)) {
      return NextResponse.json(
        { error: 'No autorizado para sincronización de desarrollador.' },
        { status: 403 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Contraseña no válida o demasiado corta.' },
        { status: 400 }
      );
    }

    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.json(
        { error: 'Falta configuración de Supabase en el servidor.' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const isObratrackTeam = cleanEmail.includes('obratrack');
    const devName = isObratrackTeam ? 'Desarrollador ObraTrack' : 'Benjamín Achávar';
    const devRut = isObratrackTeam ? '11.111.111-1' : '19.123.456-3';
    const devEmpresaId = isObratrackTeam ? 'empresa-dev-master' : 'e1111111-1111-4111-a111-111111111111';

    // 1. Buscar si el usuario ya existe en auth.users
    const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
    const existing = userList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);

    let authUserId: string;

    if (!existing) {
      // 2. Si no existe, crearlo directamente en Supabase Auth
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: devName,
          rut: devRut,
          rol: 'admin',
          is_dev: true,
        },
      });

      if (createErr || !newUser.user) {
        return NextResponse.json(
          { error: createErr?.message || 'Error creando desarrollador en Supabase Auth.' },
          { status: 400 }
        );
      }
      authUserId = newUser.user.id;
    } else {
      // 3. Si ya existe, sincronizar su contraseña con la ingresada
      const { data: updatedUser, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
        existing.id,
        {
          password,
          email_confirm: true,
          user_metadata: {
            display_name: devName,
            rut: devRut,
            rol: 'admin',
            is_dev: true,
          },
        }
      );

      if (updateErr || !updatedUser.user) {
        return NextResponse.json(
          { error: updateErr?.message || 'Error actualizando contraseña de desarrollador.' },
          { status: 400 }
        );
      }
      authUserId = updatedUser.user.id;
    }

    // 4. Asegurar que en la tabla relacional usuarios esté registrado con auth_user_id
    await supabaseAdmin.from('usuarios').upsert({
      id: authUserId,
      nombre: devName,
      email: cleanEmail,
      rut: devRut,
      rol: 'admin',
      is_dev: true,
      empresa_id: devEmpresaId,
      auth_user_id: authUserId,
    }, { onConflict: 'email' });

    return NextResponse.json({ success: true, email: cleanEmail });
  } catch (err: any) {
    console.error('Error en /api/auth/dev-sync:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno en dev-sync.' },
      { status: 500 }
    );
  }
}
