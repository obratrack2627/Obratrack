-- ==============================================================================
-- OBRATRACK - CONTROLES ISO/IEC 27001 / 27002:2022 (A.8.11 Y A.8.15)
-- 1. Tabla inmutable de auditoría de seguridad (security_audit_logs)
-- 2. Funciones PostgreSQL de enmascaramiento de PII para copias/staging
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  actor_id TEXT NULL,
  event_type TEXT NOT NULL,
  resource_type TEXT NULL,
  resource_id TEXT NULL,
  outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'denied', 'error')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_empresa_created
  ON public.security_audit_logs (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_event_type
  ON public.security_audit_logs (empresa_id, event_type);

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE UPDATE, DELETE ON public.security_audit_logs FROM anon, authenticated;

DROP POLICY IF EXISTS "rls_security_audit_logs_select_admin" ON public.security_audit_logs;
CREATE POLICY "rls_security_audit_logs_select_admin"
  ON public.security_audit_logs
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (
      empresa_id = public.get_auth_empresa_id()
      AND EXISTS (
        SELECT 1
        FROM public.usuarios u
        WHERE (u.auth_user_id = auth.uid()::text OR u.id = auth.uid()::text)
          AND u.empresa_id = public.get_auth_empresa_id()
          AND (u.rol = 'admin' OR u.is_dev = true)
      )
    )
  );

DROP POLICY IF EXISTS "rls_security_audit_logs_insert_tenant" ON public.security_audit_logs;
CREATE POLICY "rls_security_audit_logs_insert_tenant"
  ON public.security_audit_logs
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR empresa_id = public.get_auth_empresa_id()
  );

-- Funciones auxiliares para enmascaramiento (A.8.11) en vistas o clones de pruebas
CREATE OR REPLACE FUNCTION public.mask_rut(raw_rut TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  clean TEXT;
  body TEXT;
  dv TEXT;
  leading_digits TEXT;
BEGIN
  IF raw_rut IS NULL OR btrim(raw_rut) = '' THEN
    RETURN NULL;
  END IF;
  clean := upper(regexp_replace(raw_rut, '[^0-9kK]', '', 'g'));
  IF length(clean) < 4 THEN
    RETURN '•••-•';
  END IF;
  body := left(clean, length(clean) - 1);
  dv := right(clean, 1);
  leading_digits := CASE WHEN length(body) > 7 THEN left(body, 2) ELSE left(body, 1) END;
  RETURN leading_digits || '.•••.••' || right(body, 1) || '-' || dv;
END;
$$;

CREATE OR REPLACE FUNCTION public.mask_phone(raw_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
BEGIN
  IF raw_phone IS NULL OR btrim(raw_phone) = '' THEN
    RETURN NULL;
  END IF;
  digits := regexp_replace(raw_phone, '\D', '', 'g');
  IF length(digits) < 6 THEN
    RETURN '••••';
  END IF;
  IF left(digits, 2) = '56' AND length(digits) >= 11 THEN
    RETURN '+56 ' || substr(digits, 3, 1) || ' •••• ' || right(digits, 4);
  END IF;
  RETURN '••• •••• ' || right(digits, 4);
END;
$$;

CREATE OR REPLACE FUNCTION public.mask_email(raw_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  at_pos INT;
  local_part TEXT;
  domain_part TEXT;
BEGIN
  IF raw_email IS NULL OR btrim(raw_email) = '' THEN
    RETURN NULL;
  END IF;
  at_pos := strpos(raw_email, '@');
  IF at_pos <= 1 THEN
    RETURN '•••';
  END IF;
  local_part := left(raw_email, at_pos - 1);
  domain_part := substr(raw_email, at_pos + 1);
  RETURN left(local_part, CASE WHEN length(local_part) <= 2 THEN 1 ELSE 2 END) || '•••@' || domain_part;
END;
$$;
