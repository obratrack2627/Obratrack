-- Ejecutar después de gestion_diaria_20261113.sql. No conserva datos de prueba.
BEGIN;
INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES('11111111-1111-4111-a111-111111113013','qa-gestion-20261113@example.invalid','{"provider":"email","providers":["email"]}','{"display_name":"Constructor de prueba sin RUT"}',now(),now());
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios u JOIN public.empresas e ON e.id=u.empresa_id WHERE u.id='11111111-1111-4111-a111-111111113013' AND u.rut IS NULL AND e.rut IS NULL AND e.nombre='Constructor de prueba sin RUT' AND u.rol='admin' AND NOT u.is_dev) THEN RAISE EXCEPTION 'Registro personal incorrecto'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"11111111-1111-4111-a111-111111113013","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE company text; project public.proyectos; row public.documentos_obra; failed boolean:=false;
BEGIN
 SELECT empresa_id INTO company FROM public.usuarios WHERE id=auth.uid()::text;
 INSERT INTO public.proyectos(id,empresa_id,nombre,fecha_inicio,fecha_termino_estimada,estado,monto_cotizado) VALUES('qa-gestion-proyecto',company,'Prueba de cierre automático','2026-11-02','2026-11-13','activo',12000000);
 INSERT INTO public.actividades(id,proyecto_id,nombre,fecha_inicio,fecha_termino,porcentaje_avance,estado,orden) VALUES('qa-act-1','qa-gestion-proyecto','Radier','2026-11-02','2026-11-13',0,'pendiente',1),('qa-act-2','qa-gestion-proyecto','Techo','2026-11-02','2026-11-13',100,'terminada',2);
 IF (SELECT estado FROM public.proyectos WHERE id='qa-gestion-proyecto')<>'activo' THEN RAISE EXCEPTION 'Cierre prematuro'; END IF;
 UPDATE public.actividades SET porcentaje_avance=100,estado='terminada' WHERE id='qa-act-1';
 IF NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id='qa-gestion-proyecto' AND estado='terminado' AND finalizada_automaticamente) THEN RAISE EXCEPTION 'No finaliza al 100'; END IF;
 UPDATE public.actividades SET porcentaje_avance=50,estado='en_curso' WHERE id='qa-act-2';
 IF (SELECT estado FROM public.proyectos WHERE id='qa-gestion-proyecto')<>'activo' THEN RAISE EXCEPTION 'No reabre al corregir avance'; END IF;
 UPDATE public.proyectos SET estado='cancelada' WHERE id='qa-gestion-proyecto';
 UPDATE public.actividades SET porcentaje_avance=100,estado='terminada' WHERE id='qa-act-2';
 IF (SELECT estado FROM public.proyectos WHERE id='qa-gestion-proyecto')<>'cancelada' THEN RAISE EXCEPTION 'Cambio indebido de cancelada'; END IF;
 INSERT INTO public.materiales_proyecto(id,proyecto_id,nombre,cantidad,unidad,precio_unitario,subtotal,comprado) VALUES('qa-material','qa-gestion-proyecto','Cemento',10,'sacos',5000,50000,false);
 INSERT INTO public.bitacora_entradas(id,proyecto_id,usuario_id,autor_nombre,titulo,nota,fecha,tipo,material_id,cantidad_recibida) VALUES('qa-recepcion','qa-gestion-proyecto',auth.uid()::text,'Constructor','Recepción','Llegaron seis sacos',(now() AT TIME ZONE 'America/Santiago')::date,'entrega_material','qa-material',6);
 BEGIN
  INSERT INTO public.bitacora_entradas(id,proyecto_id,autor_nombre,titulo,nota,fecha,tipo,material_id,cantidad_recibida) VALUES('qa-exceso','qa-gestion-proyecto','Constructor','Recepción','Exceso',(now() AT TIME ZONE 'America/Santiago')::date,'entrega_material','qa-material',5);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='RECEIPT_EXCEEDS_ORDER' THEN failed:=true; ELSE RAISE; END IF; END;
 IF NOT failed THEN RAISE EXCEPTION 'Permite recepción superior al pedido'; END IF;
 INSERT INTO public.reclamos_cambios_obra(id,proyecto_id,empresa_id,tipo,prioridad,estado,titulo,descripcion,impacto_monto,impacto_dias,materiales_requeridos,materiales_inyectados,origen,fecha) VALUES('qa-incidente','qa-gestion-proyecto',company,'incidente','alta','pendiente','Costo interno','No cobrado al cliente',85000,0,'[{"nombre":"Kit reparación","cantidad":1,"unidad":"unidad","precio_unitario":85000}]',false,'web',(now() AT TIME ZONE 'America/Santiago')::date);
 project:=public.aprobar_cambio_obra('qa-incidente',false,false,false);
 IF project.monto_cotizado<>12000000 THEN RAISE EXCEPTION 'Incidente incrementó contrato'; END IF;
 project:=public.aprobar_cambio_obra('qa-incidente',false,false,false);
 IF (SELECT count(*) FROM public.materiales_proyecto WHERE proyecto_id=project.id AND nombre='Kit reparación')<>1 THEN RAISE EXCEPTION 'Duplica materiales al reintentar'; END IF;
 INSERT INTO public.reclamos_cambios_obra(id,proyecto_id,empresa_id,tipo,prioridad,estado,titulo,descripcion,impacto_monto,impacto_dias,materiales_requeridos,materiales_inyectados,origen,fecha) VALUES('qa-adicional','qa-gestion-proyecto',company,'solicitud_cambio','alta','pendiente','Adicional','Aprobado',150000,2,'[]',false,'web',(now() AT TIME ZONE 'America/Santiago')::date);
 project:=public.aprobar_cambio_obra('qa-adicional',true,true,false);
 IF project.fecha_termino_estimada<>'2026-11-17' OR project.monto_cotizado<>12150000 THEN RAISE EXCEPTION 'Calendario o adicional incorrecto'; END IF;
 row:=public.confirmar_cierre_diario('qa-cierre','qa-gestion-proyecto',(now() AT TIME ZONE 'America/Santiago')::date,'Jornada de prueba');
 IF row.cierre_resumen->>'confirmado_por'<>'Constructor de prueba sin RUT' OR (row.cierre_resumen->>'version')::integer<>1 THEN RAISE EXCEPTION 'Cierre inválido'; END IF;
 row:=public.confirmar_cierre_diario('qa-cierre','qa-gestion-proyecto',(now() AT TIME ZONE 'America/Santiago')::date,'Reintento');
 IF (SELECT count(*) FROM public.documentos_obra WHERE id='qa-cierre')<>1 THEN RAISE EXCEPTION 'Duplica el cierre'; END IF;
END $$;
ROLLBACK;
