-- Ejecutar después de asistencia_solo_jefatura.sql; todos los fixtures se revierten.
BEGIN;
CREATE FUNCTION pg_temp.verifica(ok boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ATTENDANCE_TEST_FAILED'; END IF; END $$;
CREATE FUNCTION pg_temp.falla(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN IF position(expected IN SQLERRM)>0 THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'EXPECTED_FAILURE: %',expected;
END $$;
INSERT INTO public.empresas(id,rut,nombre,plan_id) VALUES('qa-att-company','76000901-1','Prueba asistencia','pro_ia');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol,auth_user_id,is_dev) VALUES
 ('qa-att-admin','qa-att-company','Jefa Real','qa-att-admin@example.test','admin','50000000-0000-0000-0000-000000000001',false),
 ('qa-att-supervisor','qa-att-company','Supervisor Real','qa-att-supervisor@example.test','supervisor','50000000-0000-0000-0000-000000000002',false),
 ('qa-att-worker','qa-att-company','Trabajador Prueba','qa-att-worker@example.test','terreno','50000000-0000-0000-0000-000000000003',false);
INSERT INTO public.proyectos(id,empresa_id,nombre,fecha_inicio,fecha_termino_estimada,estado) VALUES('qa-att-project','qa-att-company','Quincho prueba','2026-11-01','2026-12-01','activo');
INSERT INTO public.proyecto_trabajadores(proyecto_id,usuario_id) VALUES('qa-att-project','qa-att-worker');
INSERT INTO public.asistencia_obreros(id,proyecto_id,empresa_id,usuario_id,trabajador_nombre,fecha,estado,registrado_por) VALUES('qa-att-existing','qa-att-project','qa-att-company','qa-att-worker','Trabajador Prueba','2026-11-12','ausente','Jefa Real');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='50000000-0000-0000-0000-000000000003';
SELECT pg_temp.verifica(NOT public.puede_gestionar_asistencia());
SELECT pg_temp.falla($q$INSERT INTO public.asistencia_obreros(id,proyecto_id,empresa_id,usuario_id,trabajador_nombre,fecha,estado) VALUES('qa-att-blocked','qa-att-project','qa-att-company','qa-att-worker','Trabajador Prueba','2026-11-13','presente')$q$,'row-level security');
UPDATE public.asistencia_obreros SET estado='presente' WHERE id='qa-att-existing';
DELETE FROM public.asistencia_obreros WHERE id='qa-att-existing';
RESET ROLE;
SELECT pg_temp.verifica((SELECT estado='ausente' FROM public.asistencia_obreros WHERE id='qa-att-existing'));
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='50000000-0000-0000-0000-000000000001';
SELECT pg_temp.verifica(public.puede_gestionar_asistencia());
SET LOCAL request.jwt.claim.sub='50000000-0000-0000-0000-000000000002';
SELECT pg_temp.verifica(public.puede_gestionar_asistencia());
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.falla($q$SELECT public.aplicar_lote_whatsapp('qa-att-denied','qa-att-company','qa-att-worker','56981000001','Llegué','No',null,null,'{"asistencia_obreros":[{"id":"qa-att-no-new","proyecto_id":"qa-att-project","empresa_id":"qa-att-company","usuario_id":"qa-att-worker","trabajador_nombre":"Trabajador Prueba","fecha":"2026-11-12","estado":"presente"}]}','{}')$q$,'ATTENDANCE_FORBIDDEN');
SELECT pg_temp.falla($q$SELECT public.aplicar_lote_whatsapp('qa-att-denied-delete','qa-att-company','qa-att-worker','56981000001','Borra mi ausencia','No',null,null,'{}','{"asistencia_obreros":[{"id":"qa-att-existing"}]}')$q$,'ATTENDANCE_FORBIDDEN');
SELECT public.aplicar_lote_whatsapp('qa-att-allowed-admin','qa-att-company','qa-att-admin','56981000002','Pedro llegó','Asistencia verificada',null,null,'{"asistencia_obreros":[{"id":"qa-att-existing","proyecto_id":"qa-att-project","empresa_id":"qa-att-company","usuario_id":"qa-att-worker","trabajador_nombre":"Trabajador Prueba","fecha":"2026-11-12","estado":"presente","registrado_por":"Persona inventada"}]}','{}');
SELECT pg_temp.verifica((SELECT estado='presente' AND registrado_por='Jefa Real' FROM public.asistencia_obreros WHERE id='qa-att-existing'));
SELECT public.aplicar_lote_whatsapp('qa-att-allowed-supervisor','qa-att-company','qa-att-supervisor','56981000003','Pedro llegó tarde','Asistencia corregida',null,null,'{"asistencia_obreros":[{"id":"qa-att-existing","proyecto_id":"qa-att-project","empresa_id":"qa-att-company","usuario_id":"qa-att-worker","trabajador_nombre":"Trabajador Prueba","fecha":"2026-11-12","estado":"atraso","registrado_por":"Persona inventada"}]}','{}');
SELECT pg_temp.verifica((SELECT estado='atraso' AND registrado_por='Supervisor Real' FROM public.asistencia_obreros WHERE id='qa-att-existing'));
SELECT pg_temp.verifica(NOT EXISTS(SELECT 1 FROM public.asistencia_obreros WHERE id='qa-att-no-new'));
RESET ROLE;
ROLLBACK;
