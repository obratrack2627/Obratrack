BEGIN;
INSERT INTO public.empresas(id,nombre,plan_id) VALUES('qa-sec-emp','QA Seguridad','pro_ia');
INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
VALUES
  ('00000000-0000-0000-0000-000000000101','admin-acceso@qa.test','{"provider":"email","providers":["email"]}','{}',now()),
  ('00000000-0000-0000-0000-000000000102','terreno@qa.test','{"provider":"email","providers":["email"]}','{}',now());
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

-- 4. RLS DELETE en whatsapp_avisos bloquea a terreno y permite admin dentro de su empresa
INSERT INTO public.whatsapp_avisos(id,empresa_id,actor_id,request_key,mensaje,origen)
VALUES('11111111-1111-4111-a111-111111111999','qa-sec-emp','00000000-0000-0000-0000-000000000101','qa-del-aviso','Aviso QA','plataforma');

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DELETE FROM public.whatsapp_avisos WHERE id='11111111-1111-4111-a111-111111111999';
RESET ROLE;

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_avisos WHERE id='11111111-1111-4111-a111-111111111999') THEN
    RAISE EXCEPTION 'TERRENO_DELETED_AVISO';
  END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DELETE FROM public.whatsapp_avisos WHERE id='11111111-1111-4111-a111-111111111999';
RESET ROLE;

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.whatsapp_avisos WHERE id='11111111-1111-4111-a111-111111111999') THEN
    RAISE EXCEPTION 'ADMIN_AVISO_NOT_DELETED';
  END IF;
END $$;
RESET ROLE;

-- 5. Eliminación completa de cuenta y cascada de empresa/presupuestos/actas/avisos
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  res jsonb;
BEGIN
  INSERT INTO public.proyectos(id,empresa_id,nombre,fecha_termino_estimada)
  VALUES('qa-del-proj','qa-sec-emp','Obra QA',current_date + 30);

  PERFORM set_config('obratrack.recepcion_autorizada','qa-del-acta',true);
  INSERT INTO public.documentos_obra(id,proyecto_id,empresa_id,categoria,nombre)
  VALUES('qa-del-acta','qa-del-proj','qa-sec-emp','acta_recepcion','Acta QA');
  PERFORM set_config('obratrack.recepcion_autorizada','',true);

  INSERT INTO public.presupuesto_grupos(id,empresa_id,proyecto_id,nombre,tipo)
  VALUES('qa-del-grp','qa-sec-emp','qa-del-proj','Grupo QA','principal');

  INSERT INTO public.presupuestos(id,empresa_id,creado_por,proyecto_id,grupo_id,origen,cotizacion)
  VALUES('qa-del-pres','qa-sec-emp','00000000-0000-0000-0000-000000000102','qa-del-proj','qa-del-grp','plataforma','{"titulo_proyecto":"Obra QA"}');

  UPDATE public.presupuesto_grupos
  SET seleccionado_id = 'qa-del-pres'
  WHERE id = 'qa-del-grp';

  INSERT INTO public.whatsapp_avisos(id,empresa_id,actor_id,proyecto_id,request_key,mensaje,origen)
  VALUES('11111111-1111-4111-a111-111111111998','qa-sec-emp','00000000-0000-0000-0000-000000000102','qa-del-proj','qa-del-aviso-2','Aviso Terreno QA','plataforma');

  INSERT INTO public.obrabot_apu(empresa_id,nombre,categoria,unidad,rendimiento,fuente,fecha_referencia,revisado_por)
  VALUES('qa-sec-emp','Radier QA','obra_gruesa','m2',1.5,'QA',current_date,'00000000-0000-0000-0000-000000000102');

  INSERT INTO public.notificaciones_push_enviadas(dedup_key,empresa_id,usuario_id,categoria,titulo,cuerpo,url,enviadas)
  VALUES
    ('qa-dedup-terreno','qa-sec-emp','00000000-0000-0000-0000-000000000102','avance','T','C','/dashboard',1),
    ('qa-dedup-admin','qa-sec-emp','00000000-0000-0000-0000-000000000101','avance','A','C','/dashboard',1);

  INSERT INTO public.obrabot_usage(empresa_id,actor_id,channel,kind,reserved_units)
  VALUES
    ('qa-sec-emp','00000000-0000-0000-0000-000000000102','web','generation',1),
    ('qa-sec-emp','00000000-0000-0000-0000-000000000101','web','generation',1);

  INSERT INTO public.sync_web_batches(empresa_id,actor_id,id,payload_hash,resultado)
  VALUES
    ('qa-sec-emp','00000000-0000-0000-0000-000000000102',gen_random_uuid(),'qa-hash-terreno','{}'::jsonb),
    ('qa-sec-emp','00000000-0000-0000-0000-000000000101',gen_random_uuid(),'qa-hash-admin','{}'::jsonb);

  -- Al borrar usuario no-admin, presupuesto/aviso/apu/audit quedan con actor NULL sin error FK, empresa sigue existiendo y rastros sin FK se limpian
  res := public.eliminar_cuenta_usuario('00000000-0000-0000-0000-000000000102');
  IF res->>'scope' <> 'user' OR NOT EXISTS (SELECT 1 FROM public.empresas WHERE id='qa-sec-emp') THEN
    RAISE EXCEPTION 'SINGLE_USER_DELETE_FAILED: %', res;
  END IF;
  IF (SELECT creado_por FROM public.presupuestos WHERE id='qa-del-pres') IS NOT NULL THEN
    RAISE EXCEPTION 'PRESUPUESTO_SET_NULL_FAILED';
  END IF;
  IF (SELECT actor_id FROM public.whatsapp_avisos WHERE id='11111111-1111-4111-a111-111111111998') IS NOT NULL THEN
    RAISE EXCEPTION 'WA_AVISO_SET_NULL_FAILED';
  END IF;
  IF (SELECT revisado_por FROM public.obrabot_apu WHERE empresa_id='qa-sec-emp' AND nombre='Radier QA') IS NOT NULL THEN
    RAISE EXCEPTION 'OBRABOT_APU_SET_NULL_FAILED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.security_audit_logs WHERE empresa_id='qa-sec-emp' AND actor_id='00000000-0000-0000-0000-000000000102') THEN
    RAISE EXCEPTION 'AUDIT_ACTOR_SET_NULL_FAILED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notificaciones_push_enviadas WHERE usuario_id='00000000-0000-0000-0000-000000000102')
     OR EXISTS (SELECT 1 FROM public.obrabot_usage WHERE empresa_id='qa-sec-emp' AND actor_id='00000000-0000-0000-0000-000000000102')
     OR EXISTS (SELECT 1 FROM public.sync_web_batches WHERE empresa_id='qa-sec-emp' AND actor_id='00000000-0000-0000-0000-000000000102') THEN
    RAISE EXCEPTION 'USER_ORPHAN_CLEANUP_FAILED';
  END IF;

  -- Al borrar único admin, se elimina la empresa y todos sus rastros (incluidas actas de recepción, grupos circulares y push)
  res := public.eliminar_cuenta_usuario('00000000-0000-0000-0000-000000000101');
  IF res->>'scope' <> 'company'
     OR EXISTS (SELECT 1 FROM public.empresas WHERE id='qa-sec-emp')
     OR EXISTS (SELECT 1 FROM public.usuarios WHERE empresa_id='qa-sec-emp')
     OR EXISTS (SELECT 1 FROM public.proyectos WHERE empresa_id='qa-sec-emp')
     OR EXISTS (SELECT 1 FROM public.documentos_obra WHERE empresa_id='qa-sec-emp')
     OR EXISTS (SELECT 1 FROM public.presupuestos WHERE empresa_id='qa-sec-emp')
     OR EXISTS (SELECT 1 FROM public.presupuesto_grupos WHERE empresa_id='qa-sec-emp')
     OR EXISTS (SELECT 1 FROM public.notificaciones_push_enviadas WHERE empresa_id='qa-sec-emp')
     OR EXISTS (SELECT 1 FROM public.obrabot_usage WHERE empresa_id='qa-sec-emp')
     OR EXISTS (SELECT 1 FROM public.sync_web_batches WHERE empresa_id='qa-sec-emp')
     OR EXISTS (SELECT 1 FROM public.whatsapp_avisos WHERE empresa_id='qa-sec-emp')
     OR EXISTS (SELECT 1 FROM public.obrabot_apu WHERE empresa_id='qa-sec-emp')
     OR EXISTS (SELECT 1 FROM public.security_audit_logs WHERE empresa_id='qa-sec-emp') THEN
    RAISE EXCEPTION 'COMPANY_CASCADE_DELETE_FAILED: %', res;
  END IF;

  -- Un registro huérfano en auth.users sin perfil en public.usuarios se reporta en orphan_auth_ids sin bloquear como email activo
  res := public.prevalidar_registro_constructor(repeat('c',64),'admin-acceso@qa.test','56999999999',NULL);
  IF (res->'conflicts' ? 'email') OR NOT (res->'orphan_auth_ids' ? '00000000-0000-0000-0000-000000000101') THEN
    RAISE EXCEPTION 'ORPHAN_AUTH_DETECTION_FAILED: %', res;
  END IF;
END $$;
RESET ROLE;

-- 6. Borrar directamente desde auth.users (rol propietario de Auth) limpia también el perfil y empresa huérfanos en public
INSERT INTO public.empresas(id,nombre,plan_id,creado_por_auth)
VALUES('qa-auth-del-emp','Empresa Borrado Auth','gratis','00000000-0000-0000-0000-000000000199');
INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
VALUES('00000000-0000-0000-0000-000000000199','borrado-directo@qa.test','{"provider":"email"}','{}',now());
INSERT INTO public.usuarios(id,auth_user_id,empresa_id,nombre,email,email_acceso,telefono_whatsapp,rol)
VALUES('00000000-0000-0000-0000-000000000199','00000000-0000-0000-0000-000000000199','qa-auth-del-emp','Admin Borrado Auth','borrado-directo@qa.test','borrado-directo@qa.test','+56944445555','admin');
DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000000199';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuarios WHERE id='00000000-0000-0000-0000-000000000199')
     OR EXISTS (SELECT 1 FROM public.empresas WHERE id='qa-auth-del-emp') THEN
    RAISE EXCEPTION 'AUTH_DELETE_TRIGGER_DID_NOT_CLEAN_PUBLIC';
  END IF;
END $$;

ROLLBACK;
