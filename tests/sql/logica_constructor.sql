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
 INSERT INTO public.reclamos_cambios_obra(id,proyecto_id,empresa_id,tipo,prioridad,estado,titulo,descripcion,impacto_monto,impacto_dias,materiales_requeridos,materiales_inyectados,origen,fecha) VALUES('qa-incidente','qa-gestion-proyecto',company,'incidente','alta','pendiente','Costo interno','No cobrado al cliente',100000,0,'[{"nombre":"Kit reparación","cantidad":1,"unidad":"unidad","precio_unitario":85000}]',false,'web',(now() AT TIME ZONE 'America/Santiago')::date);
 project:=public.aprobar_cambio_obra('qa-incidente',false,false,false);
 IF NOT EXISTS(SELECT 1 FROM public.imprevistos WHERE cambio_id='qa-incidente' AND monto_adicional=15000) THEN RAISE EXCEPTION 'Costo residual incorrecto'; END IF;
 IF project.monto_cotizado<>12000000 THEN RAISE EXCEPTION 'Incidente incrementó contrato'; END IF;
 project:=public.aprobar_cambio_obra('qa-incidente',false,false,false);
 IF (SELECT count(*) FROM public.materiales_proyecto WHERE proyecto_id=project.id AND nombre='Kit reparación')<>1 THEN RAISE EXCEPTION 'Duplica materiales al reintentar'; END IF;
 INSERT INTO public.reclamos_cambios_obra(id,proyecto_id,empresa_id,tipo,prioridad,estado,titulo,descripcion,impacto_monto,impacto_dias,materiales_requeridos,materiales_inyectados,origen,fecha) VALUES('qa-adicional','qa-gestion-proyecto',company,'solicitud_cambio','alta','pendiente','Adicional','Aprobado',150000,2,'[]',false,'web',(now() AT TIME ZONE 'America/Santiago')::date);
 project:=public.aprobar_cambio_obra('qa-adicional',true,true,false);
 IF NOT EXISTS(SELECT 1 FROM public.reclamos_cambios_obra WHERE id='qa-adicional' AND ajuste_presupuesto_aplicado AND ajuste_plazo_aplicado) THEN RAISE EXCEPTION 'No registra los ajustes realmente aplicados'; END IF;
 IF project.fecha_termino_estimada<>'2026-11-17' OR project.monto_cotizado<>12150000 THEN RAISE EXCEPTION 'Calendario o adicional incorrecto'; END IF;
 row:=public.confirmar_cierre_diario('qa-cierre','qa-gestion-proyecto',(now() AT TIME ZONE 'America/Santiago')::date,'Jornada de prueba');
 IF row.cierre_resumen->>'confirmado_por'<>'Constructor de prueba sin RUT' OR (row.cierre_resumen->>'version')::integer<>1 THEN RAISE EXCEPTION 'Cierre inválido'; END IF;
 row:=public.confirmar_cierre_diario('qa-cierre','qa-gestion-proyecto',(now() AT TIME ZONE 'America/Santiago')::date,'Reintento');
 IF (SELECT count(*) FROM public.documentos_obra WHERE id='qa-cierre')<>1 THEN RAISE EXCEPTION 'Duplica el cierre'; END IF;
END $$;

DO $$
DECLARE doc public.documentos_obra; expense public.imprevistos; company text; failed boolean:=false;
BEGIN
 SELECT empresa_id INTO company FROM public.usuarios WHERE id=auth.uid()::text;
 UPDATE public.proyectos SET estado='pausado' WHERE id='qa-gestion-proyecto';
 UPDATE public.actividades SET porcentaje_avance=100,estado='terminada' WHERE id='qa-act-1';
 doc:=public.registrar_recepcion_obra('qa-acta','qa-gestion-proyecto',jsonb_build_object('estado','conforme','fecha',(now() AT TIME ZONE 'America/Santiago')::date,'recibido_por','Mandante de prueba','observaciones','','fotos','[]'::jsonb));
 IF (SELECT recepcion_estado FROM public.proyectos WHERE id='qa-gestion-proyecto')<>'conforme' THEN RAISE EXCEPTION 'Recepción no vinculada'; END IF;
 doc:=public.registrar_recepcion_obra('qa-acta','qa-gestion-proyecto',doc.recepcion_resumen);
 UPDATE public.actividades SET porcentaje_avance=80,estado='en_curso' WHERE id='qa-act-2';
 IF NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id='qa-gestion-proyecto' AND estado='activo' AND recepcion_estado='pendiente') THEN RAISE EXCEPTION 'No reabre en curso ni invalida recepción'; END IF;
 IF (SELECT count(*) FROM public.documentos_obra WHERE id='qa-acta')<>1 THEN RAISE EXCEPTION 'Pierde recepción histórica'; END IF;
 BEGIN
  doc:=public.registrar_recepcion_obra('qa-acta-invalida','qa-gestion-proyecto',jsonb_build_object('estado','conforme','fecha',current_date,'recibido_por','Mandante','fotos','[]'::jsonb));
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='RECEPTION_UNFINISHED' THEN failed:=true; ELSE RAISE; END IF; END;
 IF NOT failed THEN RAISE EXCEPTION 'Recibe obra incompleta'; END IF;
 -- La asistencia la confirma jefatura; el jornal no debe crear un pago.
 INSERT INTO public.asistencia_obreros(id,proyecto_id,empresa_id,trabajador_nombre,fecha,estado,horas_trabajadas,origen,registrado_por) VALUES('qa-asistencia-jornal','qa-gestion-proyecto',company,'Maestro de prueba',(now() AT TIME ZONE 'America/Santiago')::date,'presente',4,'web',auth.uid()::text);
 expense:=public.registrar_jornal_asistencia('qa-jornal','qa-asistencia-jornal',45000,0.5,1,5000);
 IF expense.monto_adicional<>27500 OR expense.pagado OR expense.categoria_gasto<>'mano_obra' THEN RAISE EXCEPTION 'Cálculo de jornal o pago incorrecto'; END IF;
 expense:=public.registrar_jornal_asistencia('qa-jornal','qa-asistencia-jornal',45000,0.5,1,5000);
 IF (SELECT count(*) FROM public.imprevistos WHERE asistencia_id='qa-asistencia-jornal')<>1 THEN RAISE EXCEPTION 'Duplica jornal'; END IF;
 -- Reprogramar conserva la partida terminada y rechaza una propuesta desactualizada.
 PERFORM public.reprogramar_faenas('qa-plan','qa-gestion-proyecto','[{"id":"qa-act-2","anterior_inicio":"2026-11-02","anterior_termino":"2026-11-13","fecha_inicio":"2026-11-02","fecha_termino":"2026-11-20"}]',true,'Atraso por lluvia');
 IF (SELECT fecha_termino FROM public.actividades WHERE id='qa-act-1')<>'2026-11-13' THEN RAISE EXCEPTION 'Reprogramó terminada'; END IF;
 IF (SELECT fecha_termino_estimada FROM public.proyectos WHERE id='qa-gestion-proyecto')<>'2026-11-20' THEN RAISE EXCEPTION 'Entrega no ajustada'; END IF;
 failed:=false;
 BEGIN
  PERFORM public.reprogramar_faenas('qa-plan-desactualizado','qa-gestion-proyecto','[{"id":"qa-act-2","anterior_inicio":"2026-11-02","anterior_termino":"2026-11-13","fecha_inicio":"2026-11-02","fecha_termino":"2026-11-22"}]',false,'Reintento antiguo');
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='SCHEDULE_STALE' THEN failed:=true; ELSE RAISE; END IF; END;
 IF NOT failed THEN RAISE EXCEPTION 'Acepta propuesta desactualizada'; END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$
DECLARE company text; owner_id text:='11111111-1111-4111-a111-111111113013'; result jsonb; failed boolean:=false;
BEGIN
 SELECT empresa_id INTO company FROM public.usuarios WHERE id=owner_id;
 UPDATE public.actividades SET porcentaje_avance=100,estado='terminada' WHERE id='qa-act-2';
 result:=public.aplicar_lote_whatsapp('qa-wa-recepcion',company,owner_id,'56981000011','El mandante recibió conforme','Recepción registrada',NULL,'{}',jsonb_build_object('documentos_obra',jsonb_build_array(jsonb_build_object('id','qa-wa-acta','proyecto_id','qa-gestion-proyecto','empresa_id',company,'categoria','acta_recepcion','recepcion_resumen',jsonb_build_object('estado','conforme','fecha',(now() AT TIME ZONE 'America/Santiago')::date,'recibido_por','Mandante desde WhatsApp','observaciones','','fotos','["https://example.invalid/recepcion-qa.jpg"]'::jsonb)))),'{}');
 IF NOT EXISTS(SELECT 1 FROM public.bitacora_entradas WHERE proyecto_id='qa-gestion-proyecto' AND foto_url='https://example.invalid/recepcion-qa.jpg') THEN RAISE EXCEPTION 'Foto de recepción no aparece en bitácora'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.documentos_obra WHERE id='qa-wa-acta' AND recepcion_resumen->>'registrado_por'='Constructor de prueba sin RUT') THEN RAISE EXCEPTION 'WhatsApp no guarda recepción autoritativa'; END IF;
 INSERT INTO public.asistencia_obreros(id,proyecto_id,empresa_id,trabajador_nombre,fecha,estado,horas_trabajadas,origen,registrado_por) VALUES('qa-asistencia-wa','qa-gestion-proyecto',company,'Segundo maestro',(now() AT TIME ZONE 'America/Santiago')::date,'presente',8,'whatsapp_ia',owner_id);
 result:=public.aplicar_lote_whatsapp('qa-wa-jornal',company,owner_id,'56981000011','Registra jornal 45000 por día completo','Jornal registrado',NULL,'{}',jsonb_build_object('imprevistos',jsonb_build_array(jsonb_build_object('id','qa-wa-jornal-gasto','proyecto_id','qa-gestion-proyecto','asistencia_id','qa-asistencia-wa','jornal_resumen',jsonb_build_object('valor_diario',45000,'jornada',1,'horas_extra',0,'valor_hora_extra',0),'monto_adicional',1,'pagado',true))),'{}');
 IF NOT EXISTS(SELECT 1 FROM public.imprevistos WHERE id='qa-wa-jornal-gasto' AND monto_adicional=45000 AND NOT pagado) THEN RAISE EXCEPTION 'WhatsApp no recalcula jornal o inventa pago'; END IF;
 INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol,telefono_whatsapp) VALUES('qa-constructor-terreno',company,'Terreno de prueba','qa-terreno@example.invalid','terreno','+56981000022');
 BEGIN
  PERFORM public.registrar_jornal_asistencia('qa-wa-jornal-prohibido','qa-asistencia-wa',45000,1,0,0,'qa-constructor-terreno');
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='MANAGEMENT_FORBIDDEN' THEN failed:=true; ELSE RAISE; END IF; END;
 IF NOT failed THEN RAISE EXCEPTION 'Terreno registra su jornal'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
