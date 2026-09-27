import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://guouimnywtmnfzgocksr.supabase.co';
const DEFAULT_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1b3VpbW55d3RtbmZ6Z29ja3NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODkyNDkyNSwiZXhwIjoyMTA0NTAwOTI1fQ.XxLB5RRMrXHzvaMZB7noUWwrcwM0hgWLKjF_WP5VGMQ';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SERVICE_ROLE_KEY;

export async function POST(request: NextRequest) {
  try {
    const authToken = request.cookies.get('obratrack_auth_token')?.value;
    if (!authToken) {
      return NextResponse.json(
        { error: 'No autorizado. Se requiere sesión activa de administrador.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { email, password, nombre, rut, telefono, rol, empresa_id } = body;

    if (!email || !password || !nombre) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos (email, password, nombre).' },
        { status: 400 }
      );
    }

    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.json(
        { error: 'Configuración del servidor de Supabase incompleta (Service Role).' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const cleanEmail = email.trim().toLowerCase();

    // 1. Crear el usuario en Supabase Auth directamente con confirmación previa (creado por el admin)
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: password,
      email_confirm: true, // Auto-confirmado para acceso inmediato de trabajadores
      user_metadata: {
        display_name: nombre.trim(),
        rut: rut?.trim() || '',
        rol: rol || 'terreno',
        empresa_id: empresa_id || '',
        telefono: telefono?.trim() || '',
      },
    });

    if (authError) {
      console.error('Error creando usuario en Supabase Auth Admin:', authError);
      return NextResponse.json(
        { error: authError.message || 'Error al registrar credenciales en Supabase Auth.' },
        { status: 400 }
      );
    }

    const authUserId = authUser.user.id;

    // 2. Guardar el usuario en la tabla relacional public.usuarios de Supabase
    const { error: dbError } = await supabaseAdmin.from('usuarios').upsert({
      id: authUserId,
      nombre: nombre.trim(),
      email: cleanEmail,
      rut: rut?.trim() || '',
      telefono_whatsapp: telefono?.trim() || '+56 9 ',
      rol: rol || 'terreno',
      empresa_id: empresa_id,
      auth_user_id: authUserId,
      created_at: new Date().toISOString(),
    });

    if (dbError) {
      console.warn('Error guardando usuario en tabla public.usuarios:', dbError);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authUserId,
        nombre: nombre.trim(),
        email: cleanEmail,
        rut: rut?.trim() || '',
        telefono_whatsapp: telefono?.trim() || '+56 9 ',
        rol: rol || 'terreno',
        empresa_id: empresa_id,
      },
    });
  } catch (err: any) {
    console.error('Excepción creando usuario de equipo:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
