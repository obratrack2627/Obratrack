-- Después de whatsapp_identidad_obra.sql. Todos los fixtures terminan en ROLLBACK.
BEGIN;
INSERT INTO public.empresas(id,rut,nombre,plan_id) VALUES('qa-phone-company','76000801-0','Empresa prueba identidad','pro_ia');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol,telefono_whatsapp,is_dev) VALUES
 ('qa-phone-admin','qa-phone-company','Admin Prueba','qa-phone-admin@example.test','admin','+56981999901',false),
 ('qa-phone-boss','qa-phone-company','Jefe Prueba','qa-phone-boss@example.test','supervisor','+56981999902',false),
 ('qa-phone-worker','qa-phone-company','Trabajador Prueba','qa-phone-worker@example.test','terreno','+56981999903',false);
INSERT INTO public.proyectos(id,empresa_id,nombre,fecha_inicio,fecha_termino_estimada,estado) VALUES
 ('qa-phone-own','qa-phone-company','Obra asignada','2026-11-13','2026-12-13','activo'),
 ('qa-phone-other','qa-phone-company','Obra no asignada','2026-11-13','2026-12-13','activo');
INSERT INTO public.proyecto_trabajadores(proyecto_id,usuario_id) VALUES('qa-phone-own','qa-phone-boss'),('qa-phone-own','qa-phone-worker');
INSERT INTO public.actividades(id,proyecto_id,nombre,fecha_inicio,fecha_termino,porcentaje_avance,estado,orden) VALUES('qa-phone-task','qa-phone-own','Radier','2026-11-13','2026-12-13',0,'pendiente',1);
CREATE FUNCTION pg_temp.rejects(actor text,phone text,changes jsonb,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  PERFORM public.validar_actor_whatsapp('qa-phone-company',actor,phone,changes,'{}',NULL);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>expected THEN RAISE; END IF; RETURN;
 END;
 RAISE EXCEPTION 'MISSING_REJECTION: %',expected;
END $$;
SELECT pg_temp.rejects('qa-phone-admin','56981999903','{}','WHATSAPP_IDENTITY_FORBIDDEN');
SELECT pg_temp.rejects('qa-phone-admin','+56900000000','{}','WHATSAPP_IDENTITY_FORBIDDEN');
SELECT pg_temp.rejects('qa-phone-worker','56981999903','{"proyectos":[{"id":"new","empresa_id":"qa-phone-company"}]}','PROJECT_MANAGEMENT_FORBIDDEN');
SELECT pg_temp.rejects('qa-phone-boss','56981999902','{"proyectos":[{"id":"qa-phone-other","empresa_id":"qa-phone-company"}]}','WHATSAPP_PROJECT_FORBIDDEN');
SELECT pg_temp.rejects('qa-phone-worker','56981999903','{"bitacora_entradas":[{"id":"qa-report","proyecto_id":"qa-phone-other","usuario_id":"qa-phone-worker"}]}','WHATSAPP_PROJECT_FORBIDDEN');
SELECT pg_temp.rejects('qa-phone-worker','56981999903','{"actividades":[{"id":"qa-phone-task","proyecto_id":"qa-phone-own","nombre":"Nombre cambiado","porcentaje_avance":50,"estado":"en_curso"}]}','WORKER_SCOPE_FORBIDDEN');
SELECT pg_temp.rejects('qa-phone-worker','56981999903','{"actividades":[{"id":"new-task","proyecto_id":"qa-phone-own","porcentaje_avance":50,"estado":"en_curso"}]}','WORKER_SCOPE_FORBIDDEN');
SELECT public.validar_actor_whatsapp('qa-phone-company','qa-phone-worker','56981999903','{"actividades":[{"id":"qa-phone-task","proyecto_id":"qa-phone-own","porcentaje_avance":50,"estado":"en_curso"}]}','{}',NULL);
SELECT public.validar_actor_whatsapp('qa-phone-company','qa-phone-worker','56981999903','{"bitacora_entradas":[{"id":"qa-report","proyecto_id":"qa-phone-own","usuario_id":"qa-phone-worker"}]}','{}',NULL);
SELECT public.validar_actor_whatsapp('qa-phone-company','qa-phone-admin','56981999901','{"proyectos":[{"id":"qa-phone-other","empresa_id":"qa-phone-company"}]}','{}',NULL);
INSERT INTO public.whatsapp_mensajes(message_id,empresa_id,actor_id,sender_phone,texto,respuesta,acciones) VALUES
 ('qa-phone-retry','qa-phone-company','qa-phone-worker','56981999903','Reporte','Reporte guardado','{"rol_actor":"terreno","proyecto_contexto_id":"qa-phone-own"}');
DO $$ DECLARE receipt jsonb; BEGIN
 receipt:=public.aplicar_lote_copiloto('qa-phone-retry','qa-phone-company','qa-phone-worker','56981999903','Reporte','No reenviar',NULL,'{}','{"proyectos":[{"id":"never-written","empresa_id":"qa-phone-company"}]}','{}');
 IF receipt->>'message_id'<>'qa-phone-retry' OR EXISTS(SELECT 1 FROM public.proyectos WHERE id='never-written') THEN RAISE EXCEPTION 'RETRY_NOT_IDEMPOTENT'; END IF;
END $$;
DO $$ DECLARE changes jsonb; BEGIN
 changes:=public.validar_actor_whatsapp('qa-phone-company','qa-phone-boss','56981999902','{"proyectos":[{"id":"new","empresa_id":"qa-phone-company"}]}','{}',NULL);
 IF NOT ((changes->'proyectos'->0->'trabajadores_ids') ? 'qa-phone-boss') THEN RAISE EXCEPTION 'NEW_PROJECT_BOSS_NOT_ASSIGNED'; END IF;
END $$;
-- Un cambio real de rol o una baja en la obra se aplica en la siguiente operación.
UPDATE public.usuarios SET rol='terreno' WHERE id='qa-phone-boss';
SELECT pg_temp.rejects('qa-phone-boss','56981999902','{"proyectos":[{"id":"qa-phone-own","empresa_id":"qa-phone-company"}]}','PROJECT_MANAGEMENT_FORBIDDEN');
DELETE FROM public.proyecto_trabajadores WHERE usuario_id='qa-phone-worker';
SELECT pg_temp.rejects('qa-phone-worker','56981999903','{"bitacora_entradas":[{"id":"qa-report","proyecto_id":"qa-phone-own","usuario_id":"qa-phone-worker"}]}','WHATSAPP_PROJECT_FORBIDDEN');
ROLLBACK;
