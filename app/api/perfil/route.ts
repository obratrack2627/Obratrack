import { NextRequest, NextResponse } from 'next/server';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { formatRUT, validarRutChileno } from '@/lib/utils';
import { canonicalPhone } from '@/lib/phone';
import {
  formatRegistrationConflictMessage,
  isValidEmail,
  mapContactDatabaseError,
  normalizePhoneKeyDigits,
  normalizeRutKey,
  sanitizeEmail,
  type RegistrationConflictField,
} from '@/lib/auth/registration-validation';
import { normalizeSpecialties, parseSpecialties } from '@/lib/team-specialties';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { Empresa, EmpresaConfiguracion, Usuario } from '@/types/database';

export const dynamic = 'force-dynamic';

const MAX_LOGO_DATA_URL_LENGTH = 900_000;
const LOGO_DATA_URL_RE = /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i;

function cleanText(value: unknown, maxLen: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F<>]/g, '').trim().slice(0, maxLen)
    : '';
}

function sanitizeEmpresaConfig(raw: unknown, fallback: EmpresaConfiguracion = {}): EmpresaConfiguracion {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const input = raw as Record<string, unknown>;
  const emailComercial = Object.hasOwn(input, 'email_comercial')
    ? sanitizeEmail(typeof input.email_comercial === 'string' ? input.email_comercial : '').toLowerCase()
    : (fallback.email_comercial || '');
  if (emailComercial && !isValidEmail(emailComercial)) {
    throw new AIError('INVALID_EMAIL', 'El correo comercial de la empresa no es válido.', 422);
  }
  const telComercial = Object.hasOwn(input, 'telefono_comercial')
    ? cleanText(input.telefono_comercial, 40)
    : (fallback.telefono_comercial || '');

  return {
    giro: Object.hasOwn(input, 'giro') ? cleanText(input.giro, 160) : (fallback.giro || ''),
    direccion: Object.hasOwn(input, 'direccion') ? cleanText(input.direccion, 160) : (fallback.direccion || ''),
    comuna: Object.hasOwn(input, 'comuna') ? cleanText(input.comuna, 80) : (fallback.comuna || ''),
    telefono_comercial: telComercial,
    email_comercial: emailComercial,
    sitio_web: Object.hasOwn(input, 'sitio_web') ? cleanText(input.sitio_web, 160) : (fallback.sitio_web || ''),
    firma_texto: Object.hasOwn(input, 'firma_texto') ? cleanText(input.firma_texto, 120) : (fallback.firma_texto || ''),
    condiciones_pago_defecto: Object.hasOwn(input, 'condiciones_pago_defecto')
      ? cleanText(input.condiciones_pago_defecto, 1200)
      : (fallback.condiciones_pago_defecto || ''),
    datos_bancarios: Object.hasOwn(input, 'datos_bancarios')
      ? cleanText(input.datos_bancarios, 1200)
      : (fallback.datos_bancarios || ''),
    mostrar_datos_bancarios: Object.hasOwn(input, 'mostrar_datos_bancarios')
      ? Boolean(input.mostrar_datos_bancarios)
      : Boolean(fallback.mostrar_datos_bancarios),
  };
}

function hydrateUsuarioWithEmpresa(usuarioRow: any, empresaRow: any): Usuario {
  return {
    id: usuarioRow.id,
    auth_user_id: usuarioRow.auth_user_id,
    empresa_id: usuarioRow.empresa_id,
    rut: usuarioRow.rut || undefined,
    nombre: usuarioRow.nombre,
    email: usuarioRow.email || '',
    email_acceso: usuarioRow.email_acceso || undefined,
    rol: usuarioRow.rol,
    telefono_whatsapp: usuarioRow.telefono_whatsapp || '',
    especialidades: Array.isArray(usuarioRow.especialidades) ? usuarioRow.especialidades : [],
    is_dev: Boolean(usuarioRow.is_dev),
    created_at: usuarioRow.created_at,
    empresa_nombre: empresaRow?.nombre || '',
    empresa_rut: empresaRow?.rut || null,
    empresa_logo_url: empresaRow?.logo_url || null,
    empresa_configuracion: (empresaRow?.configuracion && typeof empresaRow.configuracion === 'object')
      ? (empresaRow.configuracion as EmpresaConfiguracion)
      : {},
  };
}

function formatEmpresa(empresaRow: any): Empresa {
  return {
    id: empresaRow.id,
    nombre: empresaRow.nombre || '',
    rut: empresaRow.rut || null,
    plan_id: empresaRow.plan_id || 'gratis',
    logo_url: empresaRow.logo_url || null,
    configuracion: (empresaRow.configuracion && typeof empresaRow.configuracion === 'object')
      ? (empresaRow.configuracion as EmpresaConfiguracion)
      : {},
    created_at: empresaRow.created_at,
    updated_at: empresaRow.updated_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    const [{ data: usuarioRow, error: userErr }, { data: empresaRow, error: companyErr }] = await Promise.all([
      client
        .from('usuarios')
        .select('*')
        .eq('id', user.id)
        .eq('empresa_id', user.empresa_id)
        .maybeSingle(),
      client
        .from('empresas')
        .select('id,nombre,rut,plan_id,logo_url,configuracion,created_at,updated_at')
        .eq('id', user.empresa_id)
        .maybeSingle(),
    ]);
    if (userErr || companyErr || !usuarioRow || !empresaRow) {
      throw new AIError('DATABASE_READ', 'No se pudo cargar tu perfil y empresa.', 503);
    }

    return NextResponse.json(
      {
        success: true,
        usuario: hydrateUsuarioWithEmpresa(usuarioRow, empresaRow),
        empresa: formatEmpresa(empresaRow),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorJSON(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new AIError('INVALID_REQUEST', 'Solicitud inválida.', 400);
    }

    const [{ data: currentUser, error: userErr }, { data: currentCompany, error: companyErr }] = await Promise.all([
      client
        .from('usuarios')
        .select('*')
        .eq('id', user.id)
        .eq('empresa_id', user.empresa_id)
        .maybeSingle(),
      client
        .from('empresas')
        .select('id,nombre,rut,plan_id,logo_url,configuracion,created_at,updated_at')
        .eq('id', user.empresa_id)
        .maybeSingle(),
    ]);

    if (userErr || companyErr || !currentUser || !currentCompany) {
      throw new AIError('DATABASE_READ', 'No se pudo cargar el perfil actual.', 503);
    }

    let nextUserRow = currentUser;
    let nextCompanyRow = currentCompany;

    if (body.usuario && typeof body.usuario === 'object') {
      const uIn = body.usuario as Record<string, unknown>;
      const userUpdates: Record<string, any> = {};

      if (Object.hasOwn(uIn, 'nombre')) {
        const cleanNombre = cleanText(uIn.nombre, 120);
        if (cleanNombre.length < 2) {
          throw new AIError('INVALID_NAME', 'Ingresa tu nombre completo (mínimo 2 caracteres).', 422);
        }
        userUpdates.nombre = cleanNombre;
      }

      if (Object.hasOwn(uIn, 'rut')) {
        const rawRut = typeof uIn.rut === 'string' ? uIn.rut.trim() : '';
        if (rawRut) {
          if (!user.is_dev && !validarRutChileno(rawRut)) {
            throw new AIError('INVALID_RUT', 'El RUT personal ingresado no es válido. Revisa el dígito verificador.', 422);
          }
          userUpdates.rut = validarRutChileno(rawRut) ? formatRUT(rawRut) : rawRut;
        } else {
          userUpdates.rut = null;
        }
      }

      if (Object.hasOwn(uIn, 'email')) {
        const cleanEmail = sanitizeEmail(typeof uIn.email === 'string' ? uIn.email : '').toLowerCase();
        if (cleanEmail && !isValidEmail(cleanEmail)) {
          throw new AIError('INVALID_EMAIL', 'Ingresa un correo de contacto válido (ej: nombre@empresa.cl).', 422);
        }
        userUpdates.email = cleanEmail || null;
      }

      if (Object.hasOwn(uIn, 'telefono_whatsapp')) {
        const rawPhone = typeof uIn.telefono_whatsapp === 'string' ? uIn.telefono_whatsapp.trim() : '';
        const emptyDefault = !rawPhone || rawPhone === '+56 9' || rawPhone === '+569' || rawPhone === '569';
        if (emptyDefault) {
          userUpdates.telefono_whatsapp = null;
        } else {
          const digits = canonicalPhone(rawPhone);
          if (!digits) {
            throw new AIError('INVALID_PHONE', 'Ingresa un número de WhatsApp válido (ej: +56 9 1234 5678).', 422);
          }
          userUpdates.telefono_whatsapp = `+${digits}`;
        }
      }

      if (Object.hasOwn(uIn, 'especialidades')) {
        userUpdates.especialidades = Array.isArray(uIn.especialidades)
          ? normalizeSpecialties(uIn.especialidades)
          : typeof uIn.especialidades === 'string'
            ? parseSpecialties(uIn.especialidades)
            : [];
      }

      if (Object.keys(userUpdates).length > 0) {
        const admin = getSupabaseAdmin();
        const checkClient = admin || client;
        const { data: existingUsers } = await checkClient
          .from('usuarios')
          .select('id,rut,email,telefono_whatsapp')
          .limit(5000);
        if (Array.isArray(existingUsers)) {
          const others = existingUsers.filter((row: any) => row.id !== user.id);
          const conflicts: RegistrationConflictField[] = [];
          const nextRutKey = Object.hasOwn(userUpdates, 'rut') ? normalizeRutKey(userUpdates.rut) : '';
          const nextPhoneKey = Object.hasOwn(userUpdates, 'telefono_whatsapp')
            ? normalizePhoneKeyDigits(userUpdates.telefono_whatsapp)
            : '';
          const nextEmailKey = Object.hasOwn(userUpdates, 'email') && userUpdates.email
            ? String(userUpdates.email).toLowerCase()
            : '';

          if (nextRutKey && others.some((row: any) => normalizeRutKey(row.rut) === nextRutKey)) {
            conflicts.push('rut');
          }
          if (nextPhoneKey && others.some((row: any) => normalizePhoneKeyDigits(row.telefono_whatsapp) === nextPhoneKey)) {
            conflicts.push('telefono');
          }
          if (nextEmailKey && others.some((row: any) => sanitizeEmail(row.email).toLowerCase() === nextEmailKey)) {
            conflicts.push('email');
          }
          if (conflicts.length > 0) {
            throw new AIError('CONTACT_CONFLICT', formatRegistrationConflictMessage(conflicts), 409);
          }
        }

        const { data: updatedUser, error: updUserErr } = await client
          .from('usuarios')
          .update(userUpdates)
          .eq('id', user.id)
          .eq('empresa_id', user.empresa_id)
          .select('*')
          .maybeSingle();

        if (updUserErr) {
          const mapped = mapContactDatabaseError(updUserErr);
          throw new AIError('PROFILE_UPDATE_FAILED', mapped || 'No se pudo actualizar tu perfil personal.', 422);
        }
        if (updatedUser) nextUserRow = updatedUser;
      }
    }

    if (body.empresa && typeof body.empresa === 'object') {
      if (user.rol !== 'admin' && currentUser.rol !== 'admin') {
        throw new AIError(
          'COMPANY_FORBIDDEN',
          'Solo el administrador de la cuenta puede editar los datos y el logo de la empresa.',
          403,
        );
      }

      const eIn = body.empresa as Record<string, unknown>;
      const companyUpdates: Record<string, any> = {};

      if (Object.hasOwn(eIn, 'nombre')) {
        const cleanCompanyName = cleanText(eIn.nombre, 150);
        if (cleanCompanyName.length < 2) {
          throw new AIError('INVALID_COMPANY_NAME', 'El nombre o razón social debe tener al menos 2 caracteres.', 422);
        }
        companyUpdates.nombre = cleanCompanyName;
      }

      if (Object.hasOwn(eIn, 'rut')) {
        const rawCompanyRut = typeof eIn.rut === 'string' ? eIn.rut.trim() : '';
        if (rawCompanyRut) {
          if (!user.is_dev && !validarRutChileno(rawCompanyRut)) {
            throw new AIError('INVALID_RUT', 'El RUT de la empresa no es válido. Revisa el dígito verificador.', 422);
          }
          companyUpdates.rut = validarRutChileno(rawCompanyRut) ? formatRUT(rawCompanyRut) : rawCompanyRut;
        } else {
          companyUpdates.rut = null;
        }
      }

      if (Object.hasOwn(eIn, 'logo_url')) {
        if (eIn.logo_url === null || eIn.logo_url === '') {
          companyUpdates.logo_url = null;
        } else if (
          typeof eIn.logo_url === 'string' &&
          eIn.logo_url.length <= MAX_LOGO_DATA_URL_LENGTH &&
          LOGO_DATA_URL_RE.test(eIn.logo_url.trim())
        ) {
          companyUpdates.logo_url = eIn.logo_url.trim();
        } else {
          throw new AIError(
            'INVALID_LOGO',
            'El logo debe ser una imagen PNG, JPG o WebP de hasta 650 KB.',
            422,
          );
        }
      }

      if (Object.hasOwn(eIn, 'configuracion')) {
        companyUpdates.configuracion = sanitizeEmpresaConfig(
          eIn.configuracion,
          (currentCompany.configuracion as EmpresaConfiguracion) || {},
        );
      }

      if (Object.keys(companyUpdates).length > 0) {
        companyUpdates.updated_at = new Date().toISOString();
        const { data: updatedCompany, error: updCompErr } = await client
          .from('empresas')
          .update(companyUpdates)
          .eq('id', user.empresa_id)
          .select('id,nombre,rut,plan_id,logo_url,configuracion,created_at,updated_at')
          .maybeSingle();

        if (updCompErr) {
          const msg = updCompErr.message || '';
          if (msg.includes('COMPANY_FORBIDDEN')) {
            throw new AIError(
              'COMPANY_FORBIDDEN',
              'Solo el administrador de la empresa puede modificar estos datos corporativos.',
              403,
            );
          }
          throw new AIError('COMPANY_UPDATE_FAILED', 'No se pudieron guardar los datos de la empresa.', 422);
        }
        if (updatedCompany) nextCompanyRow = updatedCompany;
      }
    }

    return NextResponse.json({
      success: true,
      usuario: hydrateUsuarioWithEmpresa(nextUserRow, nextCompanyRow),
      empresa: formatEmpresa(nextCompanyRow),
    });
  } catch (error) {
    return errorJSON(error);
  }
}
