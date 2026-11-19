-- ==============================================================================
-- OBRATRACK - ENDURECIMIENTO DE SEGURIDAD, AUDITORÍA Y AUTH (BLOQUE 3)
-- 1. Endurecer RLS INSERT en security_audit_logs (impide falsificar actor_id)
-- 2. Alinear funciones SQL mask_* con TypeScript (ISO A.8.11) + SET search_path
-- 3. RPCs controlados (service_role) para login por RUT y conflictos de perfil
-- ==============================================================================

BEGIN;

-- 1. Endurecer INSERT en security_audit_logs: exige que actor_id corresponda al usuario autenticado
DROP POLICY IF EXISTS "rls_security_audit_logs_insert_tenant" ON public.security_audit_logs;
CREATE POLICY "rls_security_audit_logs_insert_tenant"
  ON public.security_audit_logs
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      empresa_id = public.get_auth_empresa_id()
      AND actor_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.usuarios u
        WHERE u.id = actor_id
          AND u.empresa_id = public.get_auth_empresa_id()
          AND (u.auth_user_id = auth.uid()::text OR u.id = auth.uid()::text)
      )
    )
  );

-- 2. Alinear mask_rut, mask_phone y mask_email con lib/privacy/mask.ts y fijar search_path
CREATE OR REPLACE FUNCTION public.mask_rut(raw_rut TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  clean TEXT;
  body TEXT;
  visible_head TEXT;
  formatted_head TEXT;
BEGIN
  IF raw_rut IS NULL OR length(btrim(raw_rut)) = 0 THEN
    RETURN NULL;
  END IF;
  clean := upper(regexp_replace(raw_rut, '[^0-9kK]', '', 'g'));
  IF length(clean) < 4 THEN
    RETURN '•••-•';
  END IF;
  body := left(clean, length(clean) - 1);
  IF length(body) <= 3 THEN
    RETURN '•••-•';
  END IF;
  visible_head := left(body, length(body) - 3);
  formatted_head := CASE
    WHEN length(visible_head) > 3 THEN left(visible_head, length(visible_head) - 3) || '.' || right(visible_head, 3)
    ELSE visible_head
  END;
  RETURN formatted_head || '.•••-•';
END;
$$;

CREATE OR REPLACE FUNCTION public.mask_phone(raw_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  digits TEXT;
BEGIN
  IF raw_phone IS NULL OR length(btrim(raw_phone)) = 0 THEN
    RETURN NULL;
  END IF;
  digits := regexp_replace(raw_phone, '\D', '', 'g');
  IF length(digits) < 6 THEN
    RETURN '••••';
  END IF;
  IF left(digits, 2) = '56' AND length(digits) >= 11 THEN
    RETURN '+56 ' || substr(digits, 3, 1) || ' ' || substr(digits, 4, 4) || ' ••••';
  END IF;
  RETURN left(digits, greatest(2, length(digits) - 4)) || ' ••••';
END;
$$;

CREATE OR REPLACE FUNCTION public.mask_email(raw_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  at_pos INT;
  local_part TEXT;
  domain_part TEXT;
  visible_end TEXT;
BEGIN
  IF raw_email IS NULL OR length(btrim(raw_email)) = 0 THEN
    RETURN NULL;
  END IF;
  at_pos := strpos(raw_email, '@');
  IF at_pos <= 1 OR at_pos = length(raw_email) THEN
    RETURN '•••';
  END IF;
  local_part := left(raw_email, at_pos - 1);
  domain_part := substr(raw_email, at_pos + 1);
  visible_end := CASE WHEN length(local_part) <= 2 THEN '' ELSE right(local_part, 2) END;
  RETURN '•••' || visible_end || '@' || domain_part;
END;
$$;

-- 3. RPC controlado (service_role) para resolver email de acceso desde RUT sin abrir usuarios a anon
CREATE OR REPLACE FUNCTION public.resolver_email_login_rut(p_key TEXT, p_rut TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clean_rut TEXT;
  resolved TEXT;
  rate_key TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_key !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'LOGIN_RUT_FORBIDDEN';
  END IF;
  clean_rut := regexp_replace(upper(coalesce(p_rut, '')), '[^0-9K]', '', 'g');
  IF length(clean_rut) < 7 THEN
    RETURN NULL;
  END IF;
  rate_key := 'rut:' || p_key;
  PERFORM pg_advisory_xact_lock(hashtextextended('rut-login-guard', 0));
  IF (SELECT count(*) FROM public.registration_attempts WHERE client_key = rate_key AND created_at > now() - interval '1 hour') >= 20
     OR (SELECT count(*) FROM public.registration_attempts WHERE client_key LIKE 'rut:%' AND created_at > now() - interval '1 hour') >= 300 THEN
    RAISE EXCEPTION 'LOGIN_RUT_RATE_LIMIT';
  END IF;
  INSERT INTO public.registration_attempts(client_key) VALUES (rate_key);
  SELECT lower(coalesce(nullif(btrim(u.email_acceso), ''), nullif(btrim(u.email), '')))
    INTO resolved
    FROM public.usuarios u
    WHERE regexp_replace(upper(u.rut), '[^0-9K]', '', 'g') = clean_rut
      AND coalesce(nullif(btrim(u.email_acceso), ''), nullif(btrim(u.email), '')) IS NOT NULL
    ORDER BY (u.auth_user_id IS NOT NULL) DESC, u.created_at ASC
    LIMIT 1;
  RETURN resolved;
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_email_login_rut(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_email_login_rut(TEXT, TEXT) TO service_role;

-- 4. RPC indexado (service_role) para validar unicidad de perfil sin escanear 5.000 filas cross-tenant
CREATE OR REPLACE FUNCTION public.verificar_conflictos_perfil(
  p_usuario_id TEXT,
  p_rut TEXT,
  p_phone TEXT,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  conflicts JSONB := '[]'::jsonb;
  clean_rut TEXT := regexp_replace(upper(coalesce(p_rut, '')), '[^0-9K]', '', 'g');
  clean_phone TEXT := coalesce(public.telefono_whatsapp_canonico(coalesce(p_phone, '')), '');
  clean_email TEXT := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'PROFILE_CHECK_FORBIDDEN';
  END IF;
  IF clean_rut <> '' AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id <> p_usuario_id
      AND regexp_replace(upper(u.rut), '[^0-9K]', '', 'g') = clean_rut
  ) THEN
    conflicts := conflicts || '"rut"'::jsonb;
  END IF;
  IF clean_phone <> '' AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id <> p_usuario_id
      AND public.telefono_whatsapp_canonico(u.telefono_whatsapp) = clean_phone
  ) THEN
    conflicts := conflicts || '"telefono"'::jsonb;
  END IF;
  IF clean_email <> '' AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id <> p_usuario_id
      AND (lower(u.email) = clean_email OR lower(u.email_acceso) = clean_email)
  ) THEN
    conflicts := conflicts || '"email"'::jsonb;
  END IF;
  RETURN jsonb_build_object('conflicts', conflicts);
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_conflictos_perfil(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_conflictos_perfil(TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
