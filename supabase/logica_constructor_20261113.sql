-- Después de gestion_diaria_20261113.sql. Operaciones transaccionales para ambos canales.
BEGIN;
ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS recepcion_estado text NOT NULL DEFAULT 'pendiente' CHECK(recepcion_estado IN ('pendiente','observaciones','conforme'));
ALTER TABLE public.documentos_obra ADD COLUMN IF NOT EXISTS recepcion_resumen jsonb;
ALTER TABLE public.documentos_obra DROP CONSTRAINT IF EXISTS documentos_obra_categoria_check;
ALTER TABLE public.documentos_obra ADD CONSTRAINT documentos_obra_categoria_check CHECK(categoria IN ('contrato','plano','factura_boleta','correo','permiso_normativa','otro','cierre_diario','acta_recepcion'));
ALTER TABLE public.materiales_proyecto ADD COLUMN IF NOT EXISTS actividad_id text REFERENCES public.actividades(id) ON DELETE SET NULL;
DROP TRIGGER IF EXISTS validar_cantidad_material_recibido ON public.materiales_proyecto;
ALTER TABLE public.materiales_proyecto ALTER COLUMN cantidad TYPE numeric(18,6);
CREATE TRIGGER validar_cantidad_material_recibido BEFORE UPDATE OF cantidad ON public.materiales_proyecto FOR EACH ROW EXECUTE FUNCTION public.validar_cantidad_material_recibido();
ALTER TABLE public.imprevistos ADD COLUMN IF NOT EXISTS asistencia_id text REFERENCES public.asistencia_obreros(id) ON DELETE SET NULL;
ALTER TABLE public.imprevistos ADD COLUMN IF NOT EXISTS jornal_resumen jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS jornal_por_asistencia ON public.imprevistos(asistencia_id) WHERE asistencia_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.revisar_fin_obra(p_proyecto text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE project public.proyectos; complete boolean; total integer;
BEGIN
 SELECT * INTO project FROM public.proyectos WHERE id=p_proyecto FOR UPDATE;
 IF NOT FOUND OR project.estado='cancelada' THEN RETURN; END IF;
 SELECT count(*),coalesce(bool_and(porcentaje_avance>=100),false) INTO total,complete FROM public.actividades WHERE proyecto_id=p_proyecto;
 IF total>0 AND complete AND project.estado<>'terminado' THEN
  UPDATE public.proyectos SET estado_anterior_cierre=estado,estado='terminado',finalizada_automaticamente=true WHERE id=p_proyecto;
 ELSIF NOT(total>0 AND complete) THEN
  IF project.finalizada_automaticamente THEN UPDATE public.proyectos SET estado='activo',finalizada_automaticamente=false,estado_anterior_cierre=NULL,recepcion_estado='pendiente' WHERE id=p_proyecto;
  ELSIF project.recepcion_estado<>'pendiente' THEN UPDATE public.proyectos SET recepcion_estado='pendiente' WHERE id=p_proyecto; END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.revisar_fin_obra(text) FROM PUBLIC,anon,authenticated;
-- Trazabilidad de correcciones y cierres, sin alterar contratos ni pagos.
CREATE OR REPLACE FUNCTION public.auditar_faenas_obra() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; project_id text; title text; note text;
BEGIN
 SELECT * INTO actor FROM public.usuarios WHERE id=coalesce(nullif(current_setting('obratrack.actor',true),''),auth.uid()::text) OR auth_user_id=auth.uid()::text LIMIT 1;
 IF TG_TABLE_NAME='actividades' THEN
  IF OLD.porcentaje_avance IS NOT DISTINCT FROM NEW.porcentaje_avance THEN RETURN NEW; END IF;
  project_id:=NEW.proyecto_id;title:='Avance corregido: '||NEW.nombre;note:=OLD.porcentaje_avance||'% → '||NEW.porcentaje_avance||'%';
 ELSE
  IF OLD.estado IS NOT DISTINCT FROM NEW.estado THEN RETURN NEW; END IF;
  project_id:=NEW.id;title:='Cambio de estado de obra';note:=OLD.estado||' → '||NEW.estado||CASE WHEN NEW.finalizada_automaticamente THEN ' · Todas las partidas completas' WHEN OLD.finalizada_automaticamente AND NEW.estado='activo' THEN ' · Hay trabajo pendiente' ELSE '' END;
 END IF;
 INSERT INTO public.bitacora_entradas(id,proyecto_id,usuario_id,autor_nombre,titulo,nota,fecha,tipo) VALUES('audit-'||gen_random_uuid(),project_id,actor.id,coalesce(actor.nombre,'ObraTrack'),title,note,(now() AT TIME ZONE 'America/Santiago')::date,'avance');
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS auditar_avance_obra ON public.actividades;
CREATE TRIGGER auditar_avance_obra AFTER UPDATE OF porcentaje_avance ON public.actividades FOR EACH ROW EXECUTE FUNCTION public.auditar_faenas_obra();
DROP TRIGGER IF EXISTS auditar_estado_obra ON public.proyectos;
CREATE TRIGGER auditar_estado_obra AFTER UPDATE OF estado ON public.proyectos FOR EACH ROW EXECUTE FUNCTION public.auditar_faenas_obra();
CREATE OR REPLACE FUNCTION public.validar_material_partida() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.actividad_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.actividades WHERE id=NEW.actividad_id AND proyecto_id=NEW.proyecto_id) THEN RAISE EXCEPTION 'MATERIAL_ACTIVITY_FORBIDDEN'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validar_material_partida ON public.materiales_proyecto;
CREATE TRIGGER validar_material_partida BEFORE INSERT OR UPDATE ON public.materiales_proyecto FOR EACH ROW EXECUTE FUNCTION public.validar_material_partida();
CREATE OR REPLACE FUNCTION public.registrar_recepcion_obra(p_id text,p_proyecto text,p_datos jsonb,p_actor text DEFAULT NULL) RETURNS public.documentos_obra LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; project public.proyectos; document public.documentos_obra; summary jsonb; photo text; photo_number integer:=0;
BEGIN
 actor:=public.actor_gestion_diaria(p_actor);
 SELECT * INTO project FROM public.proyectos WHERE id=p_proyecto AND empresa_id=actor.empresa_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEPTION_FORBIDDEN'; END IF;
 PERFORM set_config('obratrack.recepcion_autorizada',p_id,true);
 SELECT * INTO document FROM public.documentos_obra WHERE id=p_id;
 IF FOUND THEN IF document.proyecto_id<>project.id OR document.categoria<>'acta_recepcion' THEN RAISE EXCEPTION 'RECEPTION_CONFLICT'; END IF; RETURN document; END IF;
 IF project.estado<>'terminado' OR NOT EXISTS(SELECT 1 FROM public.actividades WHERE proyecto_id=project.id) OR EXISTS(SELECT 1 FROM public.actividades WHERE proyecto_id=project.id AND porcentaje_avance<100) THEN RAISE EXCEPTION 'RECEPTION_UNFINISHED'; END IF;
 IF p_id IS NULL OR length(p_id) NOT BETWEEN 1 AND 150 OR coalesce(p_datos->>'estado','') NOT IN ('observaciones','conforme') OR coalesce(length(trim(p_datos->>'recibido_por')),0) NOT BETWEEN 1 AND 160 OR coalesce(length(p_datos->>'observaciones'),0)>4000 OR p_datos->>'fecha' IS NULL OR (p_datos->>'fecha')::date>(now() AT TIME ZONE 'America/Santiago')::date OR jsonb_typeof(p_datos->'fotos')<>'array' OR jsonb_array_length(p_datos->'fotos')>10 THEN RAISE EXCEPTION 'RECEPTION_INVALID'; END IF;
 IF p_datos->>'estado'='observaciones' AND coalesce(length(trim(p_datos->>'observaciones')),0)=0 THEN RAISE EXCEPTION 'RECEPTION_NOTES_REQUIRED'; END IF;
 summary:=jsonb_build_object('estado',p_datos->>'estado','fecha',p_datos->>'fecha','recibido_por',trim(p_datos->>'recibido_por'),'observaciones',coalesce(p_datos->>'observaciones',''),'fotos',coalesce(p_datos->'fotos','[]'),'registrado_por',actor.nombre,'registrado_en',now());
 PERFORM set_config('obratrack.recepcion_autorizada',p_id,true);
 INSERT INTO public.documentos_obra(id,proyecto_id,empresa_id,subido_por_id,subido_por_nombre,categoria,nombre,descripcion,fecha_documento,recepcion_resumen) VALUES(p_id,project.id,actor.empresa_id,actor.id,actor.nombre,'acta_recepcion','Recepción · '||project.nombre,coalesce(p_datos->>'observaciones',''),(p_datos->>'fecha')::date,summary) RETURNING * INTO document;
 FOR photo IN SELECT jsonb_array_elements_text(coalesce(p_datos->'fotos','[]')) LOOP
  photo_number:=photo_number+1;
  INSERT INTO public.bitacora_entradas(id,proyecto_id,usuario_id,autor_nombre,titulo,nota,foto_url,fecha,tipo) VALUES('recepcion-foto-'||gen_random_uuid(),project.id,actor.id,actor.nombre,'Recepción del mandante · foto '||photo_number,'Respaldo del acta '||p_id,photo,(p_datos->>'fecha')::date,'avance');
 END LOOP;
 UPDATE public.proyectos SET recepcion_estado=p_datos->>'estado' WHERE id=project.id;
 RETURN document;
END $$;
REVOKE ALL ON FUNCTION public.registrar_recepcion_obra(text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrar_recepcion_obra(text,text,jsonb,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.proteger_acta_recepcion() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.categoria='acta_recepcion' AND EXISTS(SELECT 1 FROM public.proyectos WHERE id=OLD.proyecto_id) THEN RAISE EXCEPTION 'RECEPTION_HISTORY_IMMUTABLE'; END IF;RETURN OLD;
 END IF;
 IF (NEW.categoria='acta_recepcion' OR (TG_OP='UPDATE' AND OLD.categoria='acta_recepcion')) AND coalesce(current_setting('obratrack.recepcion_autorizada',true),'')<>NEW.id THEN RAISE EXCEPTION 'RECEPTION_USE_RPC'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS proteger_acta_recepcion ON public.documentos_obra;
CREATE TRIGGER proteger_acta_recepcion BEFORE INSERT OR UPDATE OR DELETE ON public.documentos_obra FOR EACH ROW EXECUTE FUNCTION public.proteger_acta_recepcion();
CREATE OR REPLACE FUNCTION public.registrar_jornal_asistencia(p_id text,p_asistencia text,p_diario numeric,p_jornada numeric,p_extra numeric DEFAULT 0,p_valor_extra numeric DEFAULT 0,p_actor text DEFAULT NULL) RETURNS public.imprevistos LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; attendance public.asistencia_obreros; expense public.imprevistos; amount numeric;
BEGIN
 actor:=public.actor_gestion_diaria(p_actor);
 SELECT a.* INTO attendance FROM public.asistencia_obreros a JOIN public.proyectos p ON p.id=a.proyecto_id WHERE a.id=p_asistencia AND p.empresa_id=actor.empresa_id FOR UPDATE OF a;
 IF NOT FOUND OR attendance.estado NOT IN ('presente','atraso') OR attendance.fecha>(now() AT TIME ZONE 'America/Santiago')::date THEN RAISE EXCEPTION 'LABOUR_ATTENDANCE_INVALID'; END IF;
 IF coalesce(length(p_id),0) NOT BETWEEN 1 AND 150 OR p_diario IS NULL OR p_diario<=0 OR p_diario<>round(p_diario) OR p_jornada IS NULL OR p_jornada NOT IN (0.5,1) OR p_extra IS NULL OR p_extra<0 OR p_extra>12 OR p_valor_extra IS NULL OR p_valor_extra<0 OR p_valor_extra<>round(p_valor_extra) OR (p_extra>0 AND p_valor_extra=0) THEN RAISE EXCEPTION 'LABOUR_VALUES_INVALID'; END IF;
 SELECT * INTO expense FROM public.imprevistos WHERE asistencia_id=attendance.id;
 IF FOUND THEN IF expense.id<>p_id THEN RAISE EXCEPTION 'LABOUR_ALREADY_RECORDED'; END IF;RETURN expense; END IF;
 amount:=round(p_diario*p_jornada+p_extra*p_valor_extra);
 INSERT INTO public.imprevistos(id,proyecto_id,titulo,descripcion,monto_adicional,fecha_reporte,origen,estado,categoria_gasto,usuario_id,pagado,asistencia_id,jornal_resumen)
 VALUES(p_id,attendance.proyecto_id,'Jornal · '||attendance.trabajador_nombre,'Jornal · '||attendance.trabajador_nombre,amount,attendance.fecha,'manual','aprobado','mano_obra',attendance.usuario_id,false,attendance.id,jsonb_build_object('valor_diario',p_diario,'jornada',p_jornada,'horas_extra',p_extra,'valor_hora_extra',p_valor_extra,'asistencia_estado',attendance.estado,'asistencia_horas',coalesce(attendance.horas_trabajadas,0))) RETURNING * INTO expense;
 RETURN expense;
END $$;
REVOKE ALL ON FUNCTION public.registrar_jornal_asistencia(text,text,numeric,numeric,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrar_jornal_asistencia(text,text,numeric,numeric,numeric,numeric,text) TO authenticated,service_role;
-- Reprogramación explícita: detectar ediciones concurrentes y mantener terminadas intactas.
CREATE OR REPLACE FUNCTION public.reprogramar_faenas(p_id text,p_proyecto text,p_tareas jsonb,p_entrega boolean DEFAULT false,p_motivo text DEFAULT '',p_actor text DEFAULT NULL) RETURNS public.proyectos LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; project public.proyectos; item jsonb; activity public.actividades;
BEGIN
 actor:=public.actor_gestion_diaria(p_actor);
 SELECT * INTO project FROM public.proyectos WHERE id=p_proyecto AND empresa_id=actor.empresa_id FOR UPDATE;
 IF NOT FOUND OR project.estado IN ('cancelada','terminado') THEN RAISE EXCEPTION 'SCHEDULE_FORBIDDEN'; END IF;
 IF EXISTS(SELECT 1 FROM public.bitacora_entradas WHERE id=p_id AND proyecto_id=project.id) THEN RETURN project; END IF;
 IF coalesce(length(p_id),0) NOT BETWEEN 1 AND 150 OR jsonb_typeof(p_tareas)<>'array' OR jsonb_array_length(p_tareas) NOT BETWEEN 1 AND 500 OR coalesce(length(trim(p_motivo)),0) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'SCHEDULE_INVALID'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_tareas) LOOP
  SELECT * INTO activity FROM public.actividades WHERE id=item->>'id' AND proyecto_id=project.id FOR UPDATE;
  IF NOT FOUND OR activity.porcentaje_avance>=100 OR activity.fecha_inicio::text IS DISTINCT FROM item->>'anterior_inicio' OR activity.fecha_termino::text IS DISTINCT FROM item->>'anterior_termino' THEN RAISE EXCEPTION 'SCHEDULE_STALE'; END IF;
  IF (item->>'fecha_inicio')::date IS NULL OR (item->>'fecha_termino')::date IS NULL OR (item->>'fecha_termino')::date<(item->>'fecha_inicio')::date OR (activity.porcentaje_avance>0 AND (item->>'fecha_inicio')::date<>activity.fecha_inicio) THEN RAISE EXCEPTION 'SCHEDULE_DATES_INVALID'; END IF;
  UPDATE public.actividades SET fecha_inicio=(item->>'fecha_inicio')::date,fecha_termino=(item->>'fecha_termino')::date WHERE id=activity.id;
 END LOOP;
 IF p_entrega THEN UPDATE public.proyectos SET fecha_termino_estimada=(SELECT max(fecha_termino) FROM public.actividades WHERE proyecto_id=project.id) WHERE id=project.id RETURNING * INTO project; END IF;
 INSERT INTO public.bitacora_entradas(id,proyecto_id,usuario_id,autor_nombre,titulo,nota,fecha,tipo) VALUES(p_id,project.id,actor.id,actor.nombre,'Reprogramación de faenas',p_motivo||' · '||jsonb_array_length(p_tareas)||' partidas. Ajuste de entrega: '||p_entrega,(now() AT TIME ZONE 'America/Santiago')::date,'avance');
 RETURN project;
END $$;
REVOKE ALL ON FUNCTION public.reprogramar_faenas(text,text,jsonb,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reprogramar_faenas(text,text,jsonb,boolean,text,text) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.aplicar_lote_whatsapp_constructor_base(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)') IS NULL THEN ALTER FUNCTION public.aplicar_lote_whatsapp(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) RENAME TO aplicar_lote_whatsapp_constructor_base; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.aplicar_lote_whatsapp(p_id text,p_empresa text,p_actor text,p_phone text,p_texto text,p_respuesta text,p_cotizacion jsonb,p_acciones jsonb,p_changed jsonb,p_deleted jsonb,p_adjunto jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE item jsonb; result jsonb; document public.documentos_obra; expense public.imprevistos;
BEGIN
 IF EXISTS(SELECT 1 FROM public.whatsapp_mensajes WHERE message_id=p_id) THEN RETURN public.aplicar_lote_whatsapp_constructor_base(p_id,p_empresa,p_actor,p_phone,p_texto,p_respuesta,p_cotizacion,p_acciones,p_changed,p_deleted,p_adjunto); END IF;
 PERFORM set_config('obratrack.actor',p_actor,true);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_changed->'documentos_obra','[]')) row WHERE row->>'categoria'='acta_recepcion') THEN
  IF jsonb_array_length(p_changed->'documentos_obra')<>1 OR EXISTS(SELECT 1 FROM jsonb_each(p_changed) pair WHERE pair.key<>'documentos_obra' AND jsonb_array_length(pair.value)>0) THEN RAISE EXCEPTION 'RECEPTION_SEPARATE'; END IF;
  item:=p_changed->'documentos_obra'->0;
  document:=public.registrar_recepcion_obra(item->>'id',item->>'proyecto_id',item->'recepcion_resumen',p_actor);
  p_changed:=jsonb_set(p_changed,'{documentos_obra}',jsonb_build_array(to_jsonb(document)));
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_changed->'imprevistos','[]')) row WHERE row->>'asistencia_id' IS NOT NULL) THEN
  result:='[]';
  FOR item IN SELECT value FROM jsonb_array_elements(p_changed->'imprevistos') LOOP
   IF item->>'asistencia_id' IS NOT NULL THEN
    expense:=public.registrar_jornal_asistencia(item->>'id',item->>'asistencia_id',(item->'jornal_resumen'->>'valor_diario')::numeric,(item->'jornal_resumen'->>'jornada')::numeric,coalesce((item->'jornal_resumen'->>'horas_extra')::numeric,0),coalesce((item->'jornal_resumen'->>'valor_hora_extra')::numeric,0),p_actor);
    IF expense.proyecto_id<>item->>'proyecto_id' THEN RAISE EXCEPTION 'LABOUR_PROJECT_FORBIDDEN'; END IF;
    result:=result||jsonb_build_array(to_jsonb(expense));
   ELSE result:=result||jsonb_build_array(item); END IF;
  END LOOP;
  p_changed:=jsonb_set(p_changed,'{imprevistos}',result);
 END IF;
 RETURN public.aplicar_lote_whatsapp_constructor_base(p_id,p_empresa,p_actor,p_phone,p_texto,p_respuesta,p_cotizacion,p_acciones,p_changed,p_deleted,p_adjunto);
END $$;
REVOKE ALL ON FUNCTION public.aplicar_lote_whatsapp(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_whatsapp(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
CREATE OR REPLACE FUNCTION public.aprobar_cambio_obra_constructor(p_id text,p_presupuesto boolean DEFAULT false,p_plazo boolean DEFAULT false,p_reprogramar boolean DEFAULT false,p_respaldo text DEFAULT '',p_actor text DEFAULT NULL) RETURNS public.proyectos LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; item public.reclamos_cambios_obra; project public.proyectos;
BEGIN
 actor:=public.actor_gestion_diaria(p_actor);
 SELECT * INTO item FROM public.reclamos_cambios_obra WHERE id=p_id AND empresa_id=actor.empresa_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CHANGE_FORBIDDEN'; END IF;
 IF item.tipo='solicitud_cambio' AND (p_presupuesto OR p_plazo) AND length(trim(coalesce(p_respaldo,''))) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 project:=public.aprobar_cambio_obra(p_id,p_presupuesto,p_plazo,p_reprogramar,p_actor);
 IF NOT item.materiales_inyectados AND item.tipo='solicitud_cambio' AND (p_presupuesto OR p_plazo) THEN
  UPDATE public.reclamos_cambios_obra SET resolucion_notas=concat_ws(E'\n',nullif(resolucion_notas,''),'Respaldo del mandante: '||trim(p_respaldo)||' · Registrado por '||actor.nombre) WHERE id=item.id;
 END IF;
 RETURN project;
END $$;
REVOKE ALL ON FUNCTION public.aprobar_cambio_obra_constructor(text,boolean,boolean,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aprobar_cambio_obra_constructor(text,boolean,boolean,boolean,text,text) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
ALTER TABLE public.reclamos_cambios_obra ADD COLUMN IF NOT EXISTS ajuste_presupuesto_aplicado boolean;
ALTER TABLE public.reclamos_cambios_obra ADD COLUMN IF NOT EXISTS ajuste_plazo_aplicado boolean;
-- Mantener el título requerido al registrar costos de incidencia no cubiertos por materiales.
CREATE OR REPLACE FUNCTION public.aprobar_cambio_obra(p_id text,p_presupuesto boolean DEFAULT false,p_plazo boolean DEFAULT false,p_reprogramar boolean DEFAULT false,p_actor text DEFAULT NULL) RETURNS public.proyectos LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; item public.reclamos_cambios_obra; project public.proyectos; m jsonb; material_total numeric:=0;
BEGIN
 actor:=public.actor_gestion_diaria(p_actor);
 SELECT * INTO item FROM public.reclamos_cambios_obra WHERE id=p_id AND empresa_id=actor.empresa_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CHANGE_FORBIDDEN'; END IF;
 SELECT * INTO project FROM public.proyectos WHERE id=item.proyecto_id AND empresa_id=actor.empresa_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_FORBIDDEN'; END IF;
 IF item.materiales_inyectados THEN RETURN project; END IF;
 IF item.estado='rechazado' THEN RAISE EXCEPTION 'CHANGE_REJECTED'; END IF;
 IF item.tipo<>'solicitud_cambio' AND (p_presupuesto OR p_plazo OR p_reprogramar) THEN RAISE EXCEPTION 'INTERNAL_COST_NOT_CONTRACT'; END IF;
 FOR m IN SELECT value FROM jsonb_array_elements(coalesce(item.materiales_requeridos,'[]')) LOOP
  IF coalesce((m->>'cantidad')::numeric,0)<=0 OR coalesce((m->>'precio_unitario')::numeric,-1)<0 THEN RAISE EXCEPTION 'MATERIAL_INVALID'; END IF;
  INSERT INTO public.materiales_proyecto(id,proyecto_id,nombre,categoria,cantidad,unidad,precio_unitario,subtotal,comprado) VALUES('mat-'||gen_random_uuid(),project.id,m->>'nombre',CASE WHEN item.tipo='solicitud_cambio' THEN 'Adicional' ELSE 'Incidencia' END,(m->>'cantidad')::numeric,coalesce(m->>'unidad','unidad'),(m->>'precio_unitario')::numeric,round((m->>'cantidad')::numeric*(m->>'precio_unitario')::numeric),false);
  material_total:=material_total+round((m->>'cantidad')::numeric*(m->>'precio_unitario')::numeric);
 END LOOP;
 IF item.tipo<>'solicitud_cambio' AND item.impacto_monto>material_total THEN
  INSERT INTO public.imprevistos(id,proyecto_id,titulo,descripcion,monto_adicional,fecha_reporte,origen,categoria_gasto,cambio_id) VALUES('imp-'||gen_random_uuid(),project.id,'Costo interno: '||item.titulo,'Costo interno: '||item.titulo,item.impacto_monto-material_total,(now() AT TIME ZONE 'America/Santiago')::date,'manual','imprevisto',item.id);
 END IF;
 IF p_presupuesto THEN project.monto_cotizado:=project.monto_cotizado+greatest(0,item.impacto_monto); END IF;
 IF p_plazo AND item.impacto_dias>0 THEN
  project.fecha_termino_estimada:=public.sumar_dias_laborales(project.fecha_termino_estimada,item.impacto_dias,project.dias_laborales,project.fechas_no_laborales);
  IF p_reprogramar THEN
   UPDATE public.actividades SET fecha_inicio=CASE WHEN estado='pendiente' THEN public.sumar_dias_laborales(fecha_inicio,item.impacto_dias,project.dias_laborales,project.fechas_no_laborales) ELSE fecha_inicio END,fecha_termino=public.sumar_dias_laborales(fecha_termino,item.impacto_dias,project.dias_laborales,project.fechas_no_laborales) WHERE proyecto_id=project.id AND estado<>'terminada';
  END IF;
 END IF;
 UPDATE public.proyectos SET monto_cotizado=project.monto_cotizado,fecha_termino_estimada=project.fecha_termino_estimada WHERE id=project.id;
 UPDATE public.reclamos_cambios_obra SET ajuste_presupuesto_aplicado=p_presupuesto,ajuste_plazo_aplicado=p_plazo AND item.impacto_dias>0,estado=CASE WHEN tipo='solicitud_cambio' THEN 'aprobado' ELSE 'resuelto' END,materiales_inyectados=true,resolucion_notas=CASE WHEN item.tipo='solicitud_cambio' THEN 'Aprobado por ' ELSE 'Costo interno resuelto por ' END||actor.nombre||CASE WHEN p_presupuesto THEN '. Se ajustó el contrato.' ELSE '. Contrato sin cambios.' END WHERE id=item.id;
 INSERT INTO public.bitacora_entradas(id,proyecto_id,usuario_id,autor_nombre,titulo,nota,fecha,tipo) VALUES('bit-'||gen_random_uuid(),project.id,actor.id,actor.nombre,'Resolución: '||item.titulo,CASE WHEN p_presupuesto THEN 'Contrato actualizado por adicional aprobado.' ELSE 'Se registraron materiales y costos sin aumentar el contrato.' END,(now() AT TIME ZONE 'America/Santiago')::date,'avance');
 RETURN project;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
