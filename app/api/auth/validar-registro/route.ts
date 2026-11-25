import { createHmac } from 'node:crypto';
import { resolveMx } from 'node:dns/promises';
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

async function verifyEmailDomainHasMx(email: string): Promise<'valid' | 'invalid' | 'unknown'> {
  const domain = email.split('@')[1]?.trim().toLowerCase();
  if (!domain) return 'invalid';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Object.assign(new Error('DNS_TIMEOUT'), { code: 'ETIMEOUT' })),
          3000,
        );
      }),
    ]);
    return Array.isArray(records) && records.some((r) => Boolean(r?.exchange)) ? 'valid' : 'invalid';
  } catch (err: unknown) {
    const code = String((err as { code?: string })?.code || '').toUpperCase();
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'NXDOMAIN') {
      return 'invalid';
    }
    return 'unknown';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

    const mxStatus = await verifyEmailDomainHasMx(email);
    if (mxStatus === 'invalid') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'El dominio del correo electrónico no existe o no puede recibir correos. Ingresa un correo real.',
        },
        { status: 400 },
      );
    }

    const address = request.headers.get('x-vercel-forwarded-for')?.split(',').at(-1)?.trim() || 'shared';
    const clientKey = createHmac('sha256', process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-only').update(address).digest('hex');
    const {data,error}=await admin.rpc('prevalidar_registro_constructor',{
      p_key:clientKey,p_email:email,p_phone:normalizePhoneKeyDigits(telefono),p_rut:normalizeRutKey(rut),
    });
    if(error?.message?.includes('REGISTRATION_RATE_LIMIT'))return NextResponse.json({ok:false,error:'Demasiados intentos de registro. Espera un momento antes de volver a intentar.'},{status:429,headers:{'Retry-After':'3600'}});
    if(error || !Array.isArray(data?.conflicts))return NextResponse.json({ok:true,checked:false,conflicts:[]});
    const conflicts=data.conflicts.filter((field:unknown)=>['rut','telefono','email'].includes(String(field))) as RegistrationConflictField[];

    const orphanAuthIds = Array.isArray(data?.orphan_auth_ids)
      ? data.orphan_auth_ids.filter(
          (id: unknown): id is string => typeof id === 'string' && id.trim().length > 0,
        )
      : [];

    if (orphanAuthIds.length > 0) {
      if (typeof admin.auth?.admin?.deleteUser === 'function') {
        for (const orphanId of orphanAuthIds) {
          const { error: delErr } = await admin.auth.admin.deleteUser(orphanId, false);
          if (delErr && !/not found/i.test(delErr.message || '') && !conflicts.includes('email')) {
            conflicts.push('email');
          }
        }
      } else if (!conflicts.includes('email')) {
        conflicts.push('email');
      }
    }

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
