BEGIN;
INSERT INTO public.empresas(id,nombre,plan_id) VALUES('qa-sec-emp','QA Seguridad','pro_ia');
INSERT INTO public.usuarios(id,auth_user_id,empresa_id,nombre,rut,email,email_acceso,telefono_whatsapp,rol)
VALUES
  ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000101','qa-sec-emp','Admin QA','12.345.678-5','admin@qa.test','admin-acceso@qa.test','+56912345678','admin'),
  ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000102','qa-sec-emp','Terreno QA','11.111.111-1','terreno@qa.test','terreno@qa.test','+56987654321','terreno');

-- 1. Funciones mask_* coinciden exactamente con lib/privacy/mask.ts
DO $$
BEGIN
  IF public.mask_rut('12.345.678-5') <> '12.345.•••-•' THEN
    RAISE EXCEPTION 'MASK_RUT_MISMATCH: %', public.mask_rut('12.345.678-5');
  END IF;
  IF public.mask_phone('+56987654321') <> '+56 9 8765 ••••' THEN
    RAISE EXCEPTION 'MASK_PHONE_MISMATCH: %', public.mask_phone('+56987654321');
  END IF;
  IF public.mask_email('constructor@obratrack.cl') <> '•••or@obratrack.cl' THEN
    RAISE EXCEPTION 'MASK_EMAIL_MISMATCH: %', public.mask_email('constructor@obratrack.cl');
  END IF;
END $$;

-- 2. RLS security_audit_logs impide falsificar actor_id
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE blocked boolean := false;
BEGIN
  -- Intento de falsificar actor_id del admin debe ser bloqueado por RLS
  BEGIN
    INSERT INTO public.security_audit_logs(empresa_id,actor_id,event_type)
    VALUES('qa-sec-emp','00000000-0000-0000-0000-000000000101','privacy.pii_revealed');
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'AUDIT_ACTOR_FORGERY_ALLOWED';
  END IF;

  -- Insert con actor_id propio dentro de su empresa sí se permite
  INSERT INTO public.security_audit_logs(empresa_id,actor_id,event_type)
  VALUES('qa-sec-emp','00000000-0000-0000-0000-000000000102','privacy.pii_revealed');
END $$;
RESET ROLE;

-- 3. RPCs service_role: resolver_email_login_rut y verificar_conflictos_perfil
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  resolved text;
  res jsonb;
BEGIN
  resolved := public.resolver_email_login_rut(repeat('b',64),'123456785');
  IF resolved <> 'admin-acceso@qa.test' THEN
    RAISE EXCEPTION 'LOGIN_RUT_RESOLVE_FAILED: %', coalesce(resolved,'NULL');
  END IF;
  res := public.verificar_conflictos_perfil('00000000-0000-0000-0000-000000000102','12.345.678-5','+56912345678','admin@qa.test');
  IF NOT (res->'conflicts' ? 'rut') OR NOT (res->'conflicts' ? 'telefono') OR NOT (res->'conflicts' ? 'email') THEN
    RAISE EXCEPTION 'PROFILE_CONFLICTS_MISSED: %', res;
  END IF;
  res := public.verificar_conflictos_perfil('00000000-0000-0000-0000-000000000101','12.345.678-5','+56912345678','admin@qa.test');
  IF jsonb_array_length(res->'conflicts') <> 0 THEN
    RAISE EXCEPTION 'PROFILE_SELF_CONFLICT: %', res;
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
