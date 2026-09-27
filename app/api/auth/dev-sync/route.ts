import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isDeveloperEmail } from '@/lib/auth-utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://guouimnywtmnfzgocksr.supabase.co';
const DEFAULT_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1b3VpbW55d3RtbmZ6Z29ja3NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODkyNDkyNSwiZXhwIjoyMTA0NTAwOTI1fQ.XxLB5RRMrXHzvaMZB7noUWwrcwM0hgWLKjF_WP5VGMQ';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SERVICE_ROLE_KEY;

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

    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Falta serviceRoleKey en el servidor.' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

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
          display_name: 'Benjamín Achávar (Desarrollador)',
          rut: '19.123.456-7',
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
      nombre: 'Benjamín Achávar (Desarrollador)',
      email: cleanEmail,
      rut: '19.123.456-7',
      rol: 'admin',
      is_dev: true,
      empresa_id: 'e1111111-1111-4111-a111-111111111111',
      auth_user_id: authUserId,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, email: cleanEmail });
  } catch (err: any) {
    console.error('Error en /api/auth/dev-sync:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno en dev-sync.' },
      { status: 500 }
    );
  }
}
