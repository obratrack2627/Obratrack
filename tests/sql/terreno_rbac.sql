-- Entorno de pruebas migrado. Cada fixture, permiso y archivo de esta prueba termina en ROLLBACK.
BEGIN;
INSERT INTO public.empresas(id,rut,nombre,plan_id) VALUES('qa-rbac-a','76000201-1','Empresa prueba A','pro_ia'),('qa-rbac-b','76000202-2','Empresa prueba B','pro_ia');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol,auth_user_id,telefono_whatsapp,is_dev) VALUES
 ('qa-rbac-admin','qa-rbac-a','Admin Prueba','qa-rbac-admin@example.test','admin','20000000-0000-0000-0000-000000000001','+56981000001',false),
 ('qa-rbac-sup','qa-rbac-a','Supervisor Prueba','qa-rbac-sup@example.test','supervisor','20000000-0000-0000-0000-000000000002','+56981000002',false),
 ('qa-rbac-worker','qa-rbac-a','Maestro Prueba','qa-rbac-worker@example.test','terreno','20000000-0000-0000-0000-000000000003','+56981000003',false),
 ('qa-rbac-dev','qa-rbac-a','Dev Prueba','qa-rbac-dev@example.test','supervisor','20000000-0000-0000-0000-000000000004','+56981000004',true),
 ('qa-rbac-externo','qa-rbac-b','Persona Externa','qa-rbac-externo@example.test','admin',null,'+56981000005',false);
INSERT INTO public.proyectos(id,empresa_id,nombre,fecha_inicio,fecha_termino_estimada,estado) VALUES
 ('qa-rbac-proj-a','qa-rbac-a','Radier Prueba','2026-11-04','2026-12-01','activo'),('qa-rbac-proj-b','qa-rbac-b','Obra Ajena','2026-11-04','2026-12-01','activo'),('qa-rbac-no-asignada','qa-rbac-a','Otra Obra','2026-11-04','2026-12-01','activo');
INSERT INTO public.proyecto_trabajadores(proyecto_id,usuario_id) VALUES('qa-rbac-proj-a','qa-rbac-worker');
CREATE FUNCTION pg_temp.falla(p_sql text,p_error text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN IF position(p_error IN SQLERRM)=0 THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Falta rechazo %',p_error;
END $$;
CREATE FUNCTION pg_temp.verifica(p_cond boolean,p_mensaje text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF p_cond IS DISTINCT FROM true THEN RAISE EXCEPTION '%',p_mensaje; END IF; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000003';
SELECT pg_temp.verifica(NOT public.puede_usar_web(),'Terreno accede a web');
SELECT pg_temp.verifica((SELECT count(*)=0 FROM public.proyectos),'Terreno puede leer obras por REST');
SELECT pg_temp.verifica((SELECT count(*)=0 FROM public.usuarios),'Terreno puede leer el directorio por REST');
SELECT pg_temp.falla($q$SELECT public.actualizar_contacto_equipo('qa-rbac-worker','{}','{}')$q$,'WEB_ROLE_FORBIDDEN');
SELECT pg_temp.falla($q$SELECT public.seleccionar_presupuesto('ajeno','2026-11-04','{}')$q$,'WEB_ROLE_FORBIDDEN');
SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000002';
SELECT pg_temp.verifica(NOT public.puede_usar_web(),'Supervisor sin Dev accede a web');
SELECT pg_temp.verifica((SELECT count(*)=0 FROM public.proyectos),'Supervisor puede leer datos por REST');
SELECT pg_temp.falla($q$SELECT public.guardar_alternativas_presupuesto(null,null,'[]')$q$,'WEB_ROLE_FORBIDDEN');
SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';
SELECT pg_temp.verifica(public.puede_usar_web(),'Administrador sin acceso');
SELECT pg_temp.verifica(NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id='qa-rbac-proj-b'),'Administrador lee otra empresa');
SELECT pg_temp.falla($q$SELECT public.cambiar_plan_desarrollo('gratis')$q$,'DEV_REQUIRED');
SELECT pg_temp.falla($q$UPDATE public.usuarios SET is_dev=true WHERE id='qa-rbac-admin'$q$,'DEV_PRIVILEGES_FORBIDDEN');
SELECT pg_temp.falla($q$SELECT public.crear_integrante_equipo('{"nombre":"Pedro","rol":"terreno"}',null)$q$,'REGISTRATION_REQUIRED');
SELECT pg_temp.falla($q$SELECT public.crear_integrante_equipo('{"nombre":"Pedro Prueba","rol":"terreno","rut":"20000001-3","email":"qa-rbac-new@example.test","telefono_whatsapp":"+56981000006"}','qa-rbac-proj-b')$q$,'REGISTRATION_PROJECT_REQUIRED');
SELECT public.crear_integrante_equipo('{"id":"u-30000000-0000-0000-0000-000000000001","nombre":"Pedro Prueba","rol":"terreno","rut":"20000001-3","email":"qa-rbac-new@example.test","telefono_whatsapp":"+56981000006"}','qa-rbac-proj-a');
SELECT public.crear_integrante_equipo('{"id":"u-30000000-0000-0000-0000-000000000001","nombre":"Pedro Prueba","rol":"terreno","rut":"20000001-3","email":"qa-rbac-new@example.test","telefono_whatsapp":"+56981000006"}','qa-rbac-proj-a');
SELECT pg_temp.verifica((SELECT count(*)=1 FROM public.usuarios WHERE email='qa-rbac-new@example.test'),'Alta duplicada al reintentar');
SELECT pg_temp.verifica(EXISTS(SELECT 1 FROM public.usuarios u JOIN public.proyecto_trabajadores p ON p.usuario_id=u.id WHERE u.email='qa-rbac-new@example.test' AND u.auth_user_id IS NULL AND NOT u.is_dev AND p.proyecto_id='qa-rbac-proj-a'),'No se creó y asignó la ficha sin credenciales');
SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000004';
SELECT pg_temp.verifica(public.puede_usar_web(),'Dev con rol legacy no accede');
SELECT public.cambiar_plan_desarrollo('gratis');
SELECT pg_temp.verifica(EXISTS(SELECT 1 FROM public.empresas WHERE id='qa-rbac-a' AND plan_id='gratis'),'Dev no puede alternar plan');
SELECT public.cambiar_plan_desarrollo('pro_ia');
RESET ROLE;
-- Por WhatsApp el supervisor conserva la gestión, validada por el servicio y la empresa.
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL ROLE service_role;
SELECT public.aplicar_lote_copiloto('qa-rbac-supervisor-msg','qa-rbac-a','qa-rbac-sup','56981000002','Registra cliente','Cliente registrado',null,null,
 '{"clientes":[{"id":"qa-rbac-client","empresa_id":"qa-rbac-a","nombre":"Cliente Prueba","rut":"20000002-1","email":"qa-rbac-client@example.test","telefono":"+56981000007"}]}','{}');
SELECT pg_temp.falla($q$SELECT public.aplicar_lote_copiloto('qa-rbac-incompleto','qa-rbac-a','qa-rbac-admin','56981000001','Agrega cliente','No debe guardarse',null,null,'{"clientes":[{"id":"qa-rbac-incompleto","empresa_id":"qa-rbac-a","nombre":"Incompleto"}]}','{}')$q$,'REGISTRATION_REQUIRED');
-- El maestro sube la evidencia a su obra. Mensaje, bitácora y URL se guardan juntos.
SELECT public.aplicar_lote_copiloto('qa-rbac-photo','qa-rbac-a','qa-rbac-worker','56981000003','Avance','Evidencia guardada',null,'{"proyecto_contexto_id":"qa-rbac-proj-a"}',
 '{"bitacora_entradas":[{"id":"qa-rbac-bit","proyecto_id":"qa-rbac-proj-a","usuario_id":"qa-rbac-worker","autor_nombre":"Maestro Prueba","titulo":"Avance","nota":"Foto original","foto_url":"whatsapp-evidencias:qa-rbac-a/qa-rbac-worker/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg","tipo":"avance","fecha":"2026-11-04"}]}','{}','{"path":"qa-rbac-a/qa-rbac-worker/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg","proyecto_id":"qa-rbac-proj-a"}');
SELECT public.aplicar_lote_copiloto('qa-rbac-photo','qa-rbac-a','qa-rbac-worker','56981000003','Avance','Evidencia guardada',null,null,'{}','{}');
SELECT pg_temp.verifica((SELECT count(*)=1 FROM public.bitacora_entradas WHERE id='qa-rbac-bit'),'Foto duplicada o no vinculada');
SELECT pg_temp.verifica(EXISTS(SELECT 1 FROM public.whatsapp_mensajes WHERE message_id='qa-rbac-photo' AND acciones->>'rol_actor'='terreno' AND proyectos_ids=ARRAY['qa-rbac-proj-a']),'Contexto no persistido');
SELECT pg_temp.falla($q$SELECT public.aplicar_lote_copiloto('qa-rbac-leak','qa-rbac-a','qa-rbac-worker','56981000003','Otra obra','No',null,null,'{"bitacora_entradas":[{"id":"qa-rbac-ajena","proyecto_id":"qa-rbac-no-asignada"}]}','{}')$q$,'WORKER_SCOPE_FORBIDDEN');
SELECT pg_temp.falla($q$SELECT public.aplicar_lote_copiloto('qa-rbac-finanza','qa-rbac-a','qa-rbac-worker','56981000003','Pago','No',null,null,'{"pagos":[{"id":"qa-rbac-no-pago","proyecto_id":"qa-rbac-proj-a","monto":1000}]}','{}')$q$,'WORKER_SCOPE_FORBIDDEN');
SELECT public.aplicar_lote_copiloto('qa-rbac-receipt','qa-rbac-a','qa-rbac-worker','56981000003','Boleta','Documento guardado',null,'{"proyecto_contexto_id":"qa-rbac-proj-a"}',
 '{"documentos_obra":[{"id":"qa-rbac-documento","empresa_id":"qa-rbac-a","proyecto_id":"qa-rbac-proj-a","categoria":"factura_boleta","nombre":"Boleta","archivo_url":"whatsapp-evidencias:qa-rbac-a/qa-rbac-worker/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf","archivo_nombre":"boleta.pdf","mime_type":"application/pdf"}]}','{}','{"path":"qa-rbac-a/qa-rbac-worker/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf","proyecto_id":"qa-rbac-proj-a"}');
SELECT pg_temp.verifica(EXISTS(SELECT 1 FROM public.documentos_obra WHERE id='qa-rbac-documento' AND archivo_url LIKE 'whatsapp-evidencias:%'),'Documento sin archivo');
SELECT pg_temp.verifica(NOT EXISTS(SELECT 1 FROM public.pagos WHERE id='qa-rbac-no-pago'),'La boleta inventó un pago');
SELECT public.aplicar_lote_copiloto('qa-rbac-query','qa-rbac-a','qa-rbac-worker','56981000003','Consulta','Respuesta',null,'{"proyecto_contexto_id":"qa-rbac-proj-a"}','{}','{}');
SELECT pg_temp.verifica(EXISTS(SELECT 1 FROM public.whatsapp_mensajes WHERE message_id='qa-rbac-query' AND categoria='consulta'),'El contexto se confundió con una escritura');
RESET ROLE;
ROLLBACK;
SELECT 'PASS: RBAC web, Dev, registro completo, scope por asignación, foto, boleta y reintentos' AS resultado;
