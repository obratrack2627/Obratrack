-- Ejecutar después de estados_proyecto.sql. Todos los datos de prueba se revierten.
BEGIN;
INSERT INTO public.empresas(id,rut,nombre,plan_id) VALUES ('qa-estados','78000211-0','Prueba estados','gratis'),('qa-estados-ajena','78000212-9','Ajena','pro');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol,auth_user_id) VALUES
 ('qa-estados-admin','qa-estados','Admin Prueba','estados-admin@example.test','admin','30000000-0000-0000-0000-000000000001'),
 ('qa-estados-worker','qa-estados','Trabajador Prueba','estados-worker@example.test','terreno','30000000-0000-0000-0000-000000000002');
INSERT INTO public.proyectos(id,empresa_id,nombre,fecha_termino_estimada,estado,monto_cotizado) VALUES
 ('qa-estado-a','qa-estados','Obra A',current_date+10,'pendiente',1000000),
 ('qa-estado-b','qa-estados','Obra B',current_date+10,'pendiente',2000000),
 ('qa-estado-ajena','qa-estados-ajena','Obra ajena',current_date+10,'activo',3000000);
CREATE FUNCTION pg_temp.espera_error(q text,expected text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN IF strpos(SQLERRM,expected)>0 THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'Falta rechazo %',expected;
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='30000000-0000-0000-0000-000000000001';
SELECT public.cambiar_estado_proyecto('qa-estado-a','activo');
SELECT pg_temp.espera_error($q$SELECT public.cambiar_estado_proyecto('qa-estado-b','activo')$q$,'PLAN_LIMIT');
SELECT public.cambiar_estado_proyecto('qa-estado-a','pausado');
DO $$ DECLARE s text; r jsonb; BEGIN
 FOREACH s IN ARRAY ARRAY['activo','terminado','cancelada','pendiente','pausado'] LOOP
  r:=public.cambiar_estado_proyecto('qa-estado-b',s);
  IF r->>'estado'<>s OR (r->>'monto_cotizado')::numeric<>2000000 THEN RAISE EXCEPTION 'Estado o presupuesto incorrecto'; END IF;
 END LOOP;
END $$;
SELECT pg_temp.espera_error($q$SELECT public.cambiar_estado_proyecto('qa-estado-ajena','cancelada')$q$,'PROJECT_FORBIDDEN');
SELECT pg_temp.espera_error($q$SELECT public.cambiar_estado_proyecto('qa-estado-a','inventado')$q$,'PROJECT_STATE_INVALID');
SET LOCAL request.jwt.claim.sub='30000000-0000-0000-0000-000000000002';
SELECT pg_temp.espera_error($q$SELECT public.cambiar_estado_proyecto('qa-estado-a','cancelada')$q$,'WEB_ROLE_FORBIDDEN');
SELECT 'PASS: estados, persistencia, presupuesto intacto, plan y aislamiento por rol/empresa' AS resultado;
ROLLBACK;
