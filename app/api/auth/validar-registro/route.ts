import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  formatRegistrationConflictMessage,
  normalizePhoneKeyDigits,
  normalizeRutKey,
  sanitizeEmail,
  type RegistrationConflictField,
  validateSignUpFields,
} from '@/lib/auth/registration-validation';

export const dynamic = 'force-dynamic';

interface ValidarRegistroBody {
  nombre?: string;
  rut?: string;
  email?: string;
  telefono?: string;
  empresaNombre?: string;
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    // Next puede construir nextUrl con el host interno (0.0.0.0) al servir detrás de un proxy.
    const host = request.headers.get('host');
    const publicOrigin = host ? `${request.nextUrl.protocol}//${host}` : request.nextUrl.origin;
    if (origin && origin !== publicOrigin) {
      return NextResponse.json(
        { ok: false, error: 'El origen de la solicitud no está permitido.' },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as ValidarRegistroBody | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Solicitud inválida. Revisa los datos ingresados.' },
        { status: 400 },
      );
    }

    const nombre = String(body.nombre || '').trim();
    const rut = String(body.rut || '').trim();
    const email = sanitizeEmail(String(body.email || '')).toLowerCase();
    const telefono = String(body.telefono || '').trim();
    const empresaNombre = String(body.empresaNombre || '').trim();

    const validationError = validateSignUpFields({
      nombre,
      rut,
      email,
      telefono,
      empresaNombre,
      requirePassword: false,
    });
    if (validationError) {
      return NextResponse.json(
        { ok: false, error: validationError },
        { status: 400 },
      );
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ ok: true, checked: false, conflicts: [] });
    }

    const [usuariosRes, empresasRes] = await Promise.all([
      admin.from('usuarios').select('email, email_acceso, rut, telefono_whatsapp').limit(5000),
      admin.from('empresas').select('rut').limit(5000),
    ]);

    if (usuariosRes.error || empresasRes.error) {
      return NextResponse.json({ ok: true, checked: false, conflicts: [] });
    }

    const targetRut = normalizeRutKey(rut);
    const targetPhone = normalizePhoneKeyDigits(telefono);

    const hasRutConflict =
      Boolean(targetRut) &&
      ((usuariosRes.data || []).some((row) => normalizeRutKey(row.rut) === targetRut) ||
        (empresasRes.data || []).some((row) => normalizeRutKey(row.rut) === targetRut));

    const hasPhoneConflict =
      Boolean(targetPhone) &&
      (usuariosRes.data || []).some(
        (row) => normalizePhoneKeyDigits(row.telefono_whatsapp) === targetPhone,
      );

    let hasEmailConflict =
      Boolean(email) &&
      (usuariosRes.data || []).some(
        (row) =>
          sanitizeEmail(row.email).toLowerCase() === email ||
          sanitizeEmail(row.email_acceso).toLowerCase() === email,
      );

    if (!hasEmailConflict && email && admin.auth?.admin?.listUsers) {
      try {
        const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        hasEmailConflict = Boolean(
          listed?.data?.users?.some(
            (u) => sanitizeEmail(u.email).toLowerCase() === email,
          ),
        );
      } catch {
        // Ignorar si listUsers no está disponible en este entorno
      }
    }

    const conflicts: RegistrationConflictField[] = [];
    if (hasRutConflict) conflicts.push('rut');
    if (hasPhoneConflict) conflicts.push('telefono');
    if (hasEmailConflict) conflicts.push('email');

    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          checked: true,
          conflicts,
          error: formatRegistrationConflictMessage(conflicts),
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, checked: true, conflicts: [] });
  } catch {
    return NextResponse.json({ ok: true, checked: false, conflicts: [] });
  }
}
