-- Prueba nativa después de contactos_whatsapp.sql. Todos los fixtures se revierten.
BEGIN;
INSERT INTO public.empresas(id,rut,nombre,plan_id) VALUES
 ('qa-contactos-a','76000101-1','Prueba contactos A','pro_ia'),
 ('qa-contactos-b','76000102-2','Prueba contactos B','pro_ia');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol,auth_user_id,telefono_whatsapp,is_dev) VALUES
 ('qa-contactos-admin','qa-contactos-a','Dueña prueba','qa-contactos-admin@example.test','admin','10000000-0000-0000-0000-000000000001','+56980000001',false),
 ('qa-contactos-supervisor','qa-contactos-a','Supervisor prueba','qa-contactos-supervisor@example.test','supervisor','10000000-0000-0000-0000-000000000002','+56980000002',false),
 ('qa-contactos-terreno','qa-contactos-a','Trabajador prueba','qa-contactos-terreno@example.test','terreno','10000000-0000-0000-0000-000000000003','+56980000003',false),
 ('qa-contactos-externo','qa-contactos-b','Otra empresa','qa-contactos-externo@example.test','admin','10000000-0000-0000-0000-000000000004','+56980000004',false);
INSERT INTO auth.users(id,email) VALUES
 ('10000000-0000-0000-0000-000000000001','qa-contactos-login-admin@example.test'),
 ('10000000-0000-0000-0000-000000000002','qa-contactos-login-supervisor@example.test'),
 ('10000000-0000-0000-0000-000000000003','qa-contactos-login-terreno@example.test');
INSERT INTO public.clientes(id,empresa_id,nombre,telefono,email,comuna) VALUES('qa-contactos-cli','qa-contactos-a','Cliente prueba','+56980000005','qa-contactos-cli@example.test','Maipú');

CREATE FUNCTION pg_temp.contacto(p_id text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('nombre',nullif(nombre,''),'email',nullif(email,''),'telefono_whatsapp',nullif(telefono_whatsapp,''),'rut',nullif(rut,'')) FROM public.usuarios WHERE id=p_id;
$$;
CREATE FUNCTION pg_temp.fila(p_id text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('id',id,'empresa_id',empresa_id,'nombre',nombre,'email',email,'telefono_whatsapp',telefono_whatsapp,'rut',rut,'rol',rol,'auth_user_id',auth_user_id,'_contacto_anterior',pg_temp.contacto(id)) FROM public.usuarios WHERE id=p_id;
$$;
CREATE FUNCTION pg_temp.falla(p_sql text,p_error text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE p_sql;
 EXCEPTION WHEN OTHERS THEN
  IF position(p_error IN SQLERRM)=0 THEN RAISE; END IF;
  RETURN;
 END;
 RAISE EXCEPTION 'Se esperaba el error %',p_error;
END $$;

-- Un supervisor modifica el contacto del administrador usando su JWT, conserva Auth y permisos.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claim.role='authenticated';
SELECT public.actualizar_contacto_equipo('qa-contactos-admin',pg_temp.contacto('qa-contactos-admin')||'{"email":"qa-contactos-nuevo@example.test"}',pg_temp.contacto('qa-contactos-admin'));
-- Respuesta perdida: se acepta el mismo resultado aunque la versión previa sea antigua.
SELECT public.actualizar_contacto_equipo('qa-contactos-admin',pg_temp.contacto('qa-contactos-admin'),'{"nombre":"Dueña prueba","email":"qa-contactos-admin@example.test","telefono_whatsapp":"+56980000001","rut":null}');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id='qa-contactos-admin' AND email='qa-contactos-nuevo@example.test' AND email_acceso='qa-contactos-login-admin@example.test' AND rol='admin' AND auth_user_id='10000000-0000-0000-0000-000000000001' AND NOT is_dev) THEN RAISE EXCEPTION 'Se alteró el acceso'; END IF;
END $$;
SELECT pg_temp.falla($q$SELECT public.actualizar_contacto_equipo('qa-contactos-admin',pg_temp.contacto('qa-contactos-admin')||'{"rol":"supervisor"}',pg_temp.contacto('qa-contactos-admin'))$q$,'CONTACT_INVALID');
SELECT pg_temp.falla($q$SELECT public.actualizar_contacto_equipo('qa-contactos-externo','{}','{}')$q$,'CONTACT_INVALID');
-- La empresa se deriva de la sesión; no acepta un usuario externo aun con datos completos.
SELECT pg_temp.falla($q$SELECT public.actualizar_contacto_equipo('qa-contactos-externo','{"nombre":"Ajeno","email":null,"telefono_whatsapp":null,"rut":null}','{}')$q$,'CONTACT_FORBIDDEN');
SELECT pg_temp.falla($q$SELECT public.actualizar_contacto_equipo_interno('qa-contactos-b','qa-contactos-externo','qa-contactos-externo','{}','{}')$q$,'permission denied');
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
SELECT pg_temp.falla($q$SELECT public.actualizar_contacto_equipo('qa-contactos-terreno','{}','{}')$q$,'CONTACT_FORBIDDEN');
RESET ROLE;
UPDATE auth.users SET email='qa-contactos-login-verificado@example.test' WHERE id='10000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id='qa-contactos-admin' AND email='qa-contactos-nuevo@example.test' AND email_acceso='qa-contactos-login-verificado@example.test') THEN RAISE EXCEPTION 'No se reflejó el correo verificado por Auth'; END IF;
END $$;
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL ROLE service_role;

-- WhatsApp persiste la ficha con mensaje en una sola transacción.
SELECT public.aplicar_lote_copiloto('qa-contactos-msg','qa-contactos-a','qa-contactos-admin','56980000001','Cambia mi teléfono','Contacto actualizado',null,null,
 jsonb_build_object('usuarios',jsonb_build_array(pg_temp.fila('qa-contactos-admin')||'{"telefono_whatsapp":"+56980000006","rut":"12345678-5"}')),'{}');
-- Repetir el evento con un lote distinto no vuelve a aplicar cambios.
SELECT public.aplicar_lote_copiloto('qa-contactos-msg','qa-contactos-a','qa-contactos-admin','56980000001','Cambia mi teléfono','Contacto actualizado',null,null,
 jsonb_build_object('usuarios',jsonb_build_array(pg_temp.fila('qa-contactos-admin')||'{"telefono_whatsapp":"+56980000007"}')),'{}');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id='qa-contactos-admin' AND telefono_whatsapp='+56980000006' AND rut='12345678-5') THEN RAISE EXCEPTION 'Reintento no idempotente'; END IF;
 IF (SELECT count(*) FROM public.whatsapp_mensajes WHERE message_id='qa-contactos-msg')<>1 THEN RAISE EXCEPTION 'Mensaje duplicado'; END IF;
END $$;
-- Un número de otra empresa tampoco puede apropiarse de la identidad del equipo.
SELECT pg_temp.falla($q$SELECT public.actualizar_contacto_equipo_interno('qa-contactos-a','qa-contactos-admin','qa-contactos-terreno',pg_temp.contacto('qa-contactos-terreno')||'{"telefono_whatsapp":"+56980000004"}',pg_temp.contacto('qa-contactos-terreno'))$q$,'CONTACT_DUPLICATE');
SELECT pg_temp.falla($q$SELECT public.actualizar_contacto_equipo_interno('qa-contactos-a','qa-contactos-admin','qa-contactos-terreno',pg_temp.contacto('qa-contactos-terreno')||'{"email":"QA-CONTACTOS-EXTERNO@EXAMPLE.TEST"}',pg_temp.contacto('qa-contactos-terreno'))$q$,'CONTACT_DUPLICATE');
SELECT pg_temp.falla($q$SELECT public.actualizar_contacto_equipo_interno('qa-contactos-a','qa-contactos-admin','qa-contactos-terreno',pg_temp.contacto('qa-contactos-terreno')||'{"email":"obratrack2627@gmail.com"}',pg_temp.contacto('qa-contactos-terreno'))$q$,'CONTACT_RESERVED_EMAIL');
SELECT pg_temp.falla($q$SELECT public.actualizar_contacto_equipo_interno('qa-contactos-a','qa-contactos-admin','qa-contactos-terreno',pg_temp.contacto('qa-contactos-terreno')||'{"telefono_whatsapp":"123"}',pg_temp.contacto('qa-contactos-terreno'))$q$,'CONTACT_INVALID_PHONE');
SELECT pg_temp.falla($q$SELECT public.actualizar_contacto_equipo_interno('qa-contactos-a','qa-contactos-admin','qa-contactos-terreno',pg_temp.contacto('qa-contactos-terreno')||'{"rut":"12345678-9"}',pg_temp.contacto('qa-contactos-terreno'))$q$,'CONTACT_INVALID_RUT');
SELECT pg_temp.falla($q$SELECT public.actualizar_contacto_equipo_interno('qa-contactos-a','qa-contactos-admin','qa-contactos-terreno',pg_temp.contacto('qa-contactos-terreno')||'{"nombre":"Cambio atrasado"}','{}')$q$,'CONTACT_CONFLICT');
-- Una falla tardía revierte también los cambios anteriores del cliente y no genera confirmación.
SELECT pg_temp.falla($q$SELECT public.aplicar_lote_copiloto('qa-contactos-fallo','qa-contactos-a','qa-contactos-admin','56980000006','Cambiar datos','No debe guardarse',null,null,
 jsonb_build_object('clientes',jsonb_build_array(jsonb_build_object('id','qa-contactos-cli','empresa_id','qa-contactos-a','nombre','No debe quedar','comuna','Temuco')),
 'usuarios',jsonb_build_array(pg_temp.fila('qa-contactos-terreno')||'{"telefono_whatsapp":"+56980000004"}')),'{}')$q$,'CONTACT_DUPLICATE');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.whatsapp_mensajes WHERE message_id='qa-contactos-fallo') OR EXISTS(SELECT 1 FROM public.clientes WHERE id='qa-contactos-cli' AND comuna='Temuco') THEN RAISE EXCEPTION 'Lote parcialmente guardado'; END IF;
END $$;
-- También preserva el mecanismo de alta de integrantes nuevos, sin cuenta de acceso.
SELECT public.aplicar_lote_copiloto('qa-contactos-nuevo','qa-contactos-a','qa-contactos-admin','56980000006','Agrega trabajador','Registrado',null,null,
 '{"usuarios":[{"id":"qa-contactos-nuevo","empresa_id":"qa-contactos-a","nombre":"Nueva persona","rol":"terreno","telefono_whatsapp":"+56980000008","email":null,"rut":null}]}','{}');
SELECT pg_temp.falla($q$SELECT public.aplicar_lote_copiloto('qa-contactos-rol','qa-contactos-a','qa-contactos-supervisor','56980000002','Cambia rol','No permitido',null,null,jsonb_build_object('usuarios',jsonb_build_array(pg_temp.fila('qa-contactos-admin')||'{"rol":"supervisor"}')),'{}')$q$,'CONTACT_FORBIDDEN');
RESET ROLE;
ROLLBACK;
SELECT 'PASS: contactos, JWT, empresa, Auth, duplicados, RUT, concurrencia, rollback y reintentos' AS resultado;
