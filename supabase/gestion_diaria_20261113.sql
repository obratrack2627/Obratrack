-- Correcciones aditivas: registro personal, calendario, costos, recepción y cierre diario.
BEGIN;
ALTER TABLE public.empresas ALTER COLUMN rut DROP NOT NULL;
CREATE OR REPLACE FUNCTION public.validar_rut_chileno(p_rut text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE value text:=upper(replace(replace(trim(p_rut),'.',''),'-','')); digits text; total integer:=0; factor integer:=2; position integer; dv text;
BEGIN
 IF value IS NULL OR value!~'^[0-9]{7,9}[0-9K]$' THEN RETURN false; END IF;
 digits:=left(value,length(value)-1);
 FOR position IN REVERSE length(digits)..1 LOOP total:=total+substring(digits,position,1)::integer*factor;factor:=CASE WHEN factor=7 THEN 2 ELSE factor+1 END; END LOOP;
 dv:=CASE 11-total%11 WHEN 11 THEN '0' WHEN 10 THEN 'K' ELSE (11-total%11)::text END;
 RETURN dv=right(value,1);
END $$;
CREATE OR REPLACE FUNCTION public.crear_cuenta_constructora(p_uid uuid) RETURNS public.usuarios LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u public.usuarios; a auth.users; company text; meta jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_uid::text,7));
 SELECT * INTO u FROM public.usuarios WHERE id=p_uid::text OR auth_user_id=p_uid::text LIMIT 1;
 IF FOUND THEN RETURN u; END IF;
 SELECT * INTO a FROM auth.users WHERE id=p_uid; meta:=a.raw_user_meta_data;
 IF NOT FOUND OR coalesce(meta->>'empresa_id','')<>'' OR coalesce(trim(meta->>'display_name'),'')='' THEN RAISE EXCEPTION 'REGISTRATION_DETAILS_REQUIRED'; END IF;
 IF nullif(trim(meta->>'rut'),'') IS NOT NULL AND NOT public.validar_rut_chileno(meta->>'rut') THEN RAISE EXCEPTION 'CONTACT_RUT_INVALID'; END IF;
 company:='emp-'||gen_random_uuid()::text;
 INSERT INTO public.empresas(id,nombre,rut,plan_id,creado_por_auth) VALUES(company,coalesce(nullif(trim(meta->>'empresa_nombre'),''),trim(meta->>'display_name')),NULL,'gratis',p_uid::text);
 INSERT INTO public.usuarios(id,auth_user_id,empresa_id,nombre,email,rol,telefono_whatsapp,rut,is_dev) VALUES(p_uid::text,p_uid::text,company,trim(meta->>'display_name'),a.email,'admin',coalesce(meta->>'telefono',''),nullif(trim(meta->>'rut'),''),false) RETURNING * INTO u;
 RETURN u;
END $$;
REVOKE ALL ON FUNCTION public.crear_cuenta_constructora(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.registrar_constructor_auth() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF coalesce(NEW.raw_user_meta_data->>'empresa_id','')='' AND coalesce(trim(NEW.raw_user_meta_data->>'display_name'),'')<>'' THEN PERFORM public.crear_cuenta_constructora(NEW.id); END IF;
 RETURN NEW;
END $$;

ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS dias_laborales integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5];
ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS fechas_no_laborales date[] NOT NULL DEFAULT '{}';
ALTER TABLE public.actividades ADD COLUMN IF NOT EXISTS monto_contratado numeric;
ALTER TABLE public.materiales_proyecto ADD COLUMN IF NOT EXISTS pagado boolean;
ALTER TABLE public.bitacora_entradas ADD COLUMN IF NOT EXISTS material_id text REFERENCES public.materiales_proyecto(id) ON DELETE SET NULL;
ALTER TABLE public.bitacora_entradas ADD COLUMN IF NOT EXISTS cantidad_recibida numeric;
ALTER TABLE public.imprevistos ADD COLUMN IF NOT EXISTS categoria_gasto text NOT NULL DEFAULT 'imprevisto';
ALTER TABLE public.imprevistos ADD COLUMN IF NOT EXISTS usuario_id text REFERENCES public.usuarios(id) ON DELETE SET NULL;
ALTER TABLE public.imprevistos ADD COLUMN IF NOT EXISTS pagado boolean;
ALTER TABLE public.imprevistos ADD COLUMN IF NOT EXISTS cambio_id text REFERENCES public.reclamos_cambios_obra(id) ON DELETE SET NULL;
ALTER TABLE public.documentos_obra ADD COLUMN IF NOT EXISTS cierre_resumen jsonb;
-- Conservar las categorías anteriores y añadir el cierre como documento propio de la obra.
ALTER TABLE public.documentos_obra DROP CONSTRAINT IF EXISTS documentos_obra_categoria_check;
ALTER TABLE public.documentos_obra ADD CONSTRAINT documentos_obra_categoria_check CHECK(categoria IN ('contrato','plano','factura_boleta','correo','permiso_normativa','otro','cierre_diario'));
ALTER TABLE public.proyectos DROP CONSTRAINT IF EXISTS calendario_obra_valido;
ALTER TABLE public.proyectos ADD CONSTRAINT calendario_obra_valido CHECK(cardinality(dias_laborales)>0 AND dias_laborales <@ ARRAY[0,1,2,3,4,5,6]);
ALTER TABLE public.actividades DROP CONSTRAINT IF EXISTS monto_partida_valido;
ALTER TABLE public.actividades ADD CONSTRAINT monto_partida_valido CHECK(monto_contratado IS NULL OR monto_contratado>0);
ALTER TABLE public.imprevistos DROP CONSTRAINT IF EXISTS categoria_gasto_valida;
ALTER TABLE public.imprevistos ADD CONSTRAINT categoria_gasto_valida CHECK(categoria_gasto IN ('imprevisto','mano_obra','gasto_general'));

CREATE OR REPLACE FUNCTION public.sumar_dias_laborales(p_fecha date,p_dias integer,p_semana integer[],p_excluidas date[]) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE result date:=p_fecha; remaining integer:=abs(p_dias); attempts integer:=0;
BEGIN
 IF abs(p_dias)>3650 OR cardinality(p_semana)=0 OR NOT p_semana<@ARRAY[0,1,2,3,4,5,6] THEN RAISE EXCEPTION 'CALENDAR_INVALID'; END IF;
 WHILE remaining>0 LOOP
  result:=result+sign(p_dias)::integer; attempts:=attempts+1;
  IF extract(dow FROM result)::integer=ANY(p_semana) AND NOT(result=ANY(coalesce(p_excluidas,'{}'))) THEN remaining:=remaining-1; END IF;
  IF attempts>30000 THEN RAISE EXCEPTION 'CALENDAR_INVALID'; END IF;
 END LOOP; RETURN result;
END $$;

-- Recepción como evento de bitácora: control transaccional de entregas parciales.
CREATE OR REPLACE FUNCTION public.validar_recepcion_material() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE requested numeric; already numeric; project text;
BEGIN
 IF NEW.material_id IS NULL THEN IF coalesce(NEW.cantidad_recibida,0)<>0 THEN RAISE EXCEPTION 'RECEIPT_MATERIAL_REQUIRED'; END IF; RETURN NEW; END IF;
 SELECT cantidad,proyecto_id INTO requested,project FROM public.materiales_proyecto WHERE id=NEW.material_id FOR UPDATE;
 IF NOT FOUND OR project<>NEW.proyecto_id OR NEW.tipo<>'entrega_material' OR coalesce(NEW.cantidad_recibida,0)<=0 THEN RAISE EXCEPTION 'RECEIPT_INVALID'; END IF;
 SELECT coalesce(sum(cantidad_recibida),0) INTO already FROM public.bitacora_entradas WHERE material_id=NEW.material_id AND id<>NEW.id;
 IF already+NEW.cantidad_recibida>requested+0.000001 THEN RAISE EXCEPTION 'RECEIPT_EXCEEDS_ORDER'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validar_recepcion_material ON public.bitacora_entradas;
CREATE TRIGGER validar_recepcion_material BEFORE INSERT OR UPDATE ON public.bitacora_entradas FOR EACH ROW EXECUTE FUNCTION public.validar_recepcion_material();
CREATE OR REPLACE FUNCTION public.validar_cantidad_material_recibido() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.cantidad<coalesce((SELECT sum(cantidad_recibida) FROM public.bitacora_entradas WHERE material_id=NEW.id),0) THEN RAISE EXCEPTION 'MATERIAL_BELOW_RECEIVED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validar_cantidad_material_recibido ON public.materiales_proyecto;
CREATE TRIGGER validar_cantidad_material_recibido BEFORE UPDATE OF cantidad ON public.materiales_proyecto FOR EACH ROW EXECUTE FUNCTION public.validar_cantidad_material_recibido();

CREATE OR REPLACE FUNCTION public.actor_gestion_diaria(p_actor text DEFAULT NULL) RETURNS public.usuarios LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios;
BEGIN
 IF auth.role()='service_role' THEN SELECT * INTO actor FROM public.usuarios WHERE id=p_actor;
 ELSE SELECT * INTO actor FROM public.usuarios WHERE (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND (rol='admin' OR is_dev); END IF;
 IF actor.id IS NULL OR NOT(actor.rol IN ('admin','supervisor') OR actor.is_dev) THEN RAISE EXCEPTION 'MANAGEMENT_FORBIDDEN'; END IF;
 RETURN actor;
END $$;
REVOKE ALL ON FUNCTION public.actor_gestion_diaria(text) FROM PUBLIC,anon,authenticated;

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
  INSERT INTO public.imprevistos(id,proyecto_id,descripcion,monto_adicional,fecha_reporte,origen,categoria_gasto,cambio_id) VALUES('imp-'||gen_random_uuid(),project.id,'Costo interno: '||item.titulo,item.impacto_monto-material_total,(now() AT TIME ZONE 'America/Santiago')::date,'manual','imprevisto',item.id);
 END IF;
 IF p_presupuesto THEN project.monto_cotizado:=project.monto_cotizado+greatest(0,item.impacto_monto); END IF;
 IF p_plazo AND item.impacto_dias>0 THEN
  project.fecha_termino_estimada:=public.sumar_dias_laborales(project.fecha_termino_estimada,item.impacto_dias,project.dias_laborales,project.fechas_no_laborales);
  IF p_reprogramar THEN
   UPDATE public.actividades SET fecha_inicio=CASE WHEN estado='pendiente' THEN public.sumar_dias_laborales(fecha_inicio,item.impacto_dias,project.dias_laborales,project.fechas_no_laborales) ELSE fecha_inicio END,fecha_termino=public.sumar_dias_laborales(fecha_termino,item.impacto_dias,project.dias_laborales,project.fechas_no_laborales) WHERE proyecto_id=project.id AND estado<>'terminada';
  END IF;
 END IF;
 UPDATE public.proyectos SET monto_cotizado=project.monto_cotizado,fecha_termino_estimada=project.fecha_termino_estimada WHERE id=project.id;
 UPDATE public.reclamos_cambios_obra SET estado=CASE WHEN tipo='solicitud_cambio' THEN 'aprobado' ELSE 'resuelto' END,materiales_inyectados=true,resolucion_notas=CASE WHEN item.tipo='solicitud_cambio' THEN 'Aprobado por ' ELSE 'Costo interno resuelto por ' END||actor.nombre||CASE WHEN p_presupuesto THEN '. Se ajustó el contrato.' ELSE '. Contrato sin cambios.' END WHERE id=item.id;
 INSERT INTO public.bitacora_entradas(id,proyecto_id,usuario_id,autor_nombre,titulo,nota,fecha,tipo) VALUES('bit-'||gen_random_uuid(),project.id,actor.id,actor.nombre,'Resolución: '||item.titulo,CASE WHEN p_presupuesto THEN 'Contrato actualizado por adicional aprobado.' ELSE 'Se registraron materiales y costos sin aumentar el contrato.' END,(now() AT TIME ZONE 'America/Santiago')::date,'avance');
 RETURN project;
END $$;
REVOKE ALL ON FUNCTION public.aprobar_cambio_obra(text,boolean,boolean,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aprobar_cambio_obra(text,boolean,boolean,boolean,text) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS finalizada_automaticamente boolean NOT NULL DEFAULT false;
ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS estado_anterior_cierre text;
CREATE OR REPLACE FUNCTION public.respetar_estado_manual_obra() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.finalizada_automaticamente IS NOT DISTINCT FROM OLD.finalizada_automaticamente THEN NEW.finalizada_automaticamente:=false;NEW.estado_anterior_cierre:=NULL;END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS respetar_estado_manual_obra ON public.proyectos;
CREATE TRIGGER respetar_estado_manual_obra BEFORE UPDATE OF estado ON public.proyectos FOR EACH ROW EXECUTE FUNCTION public.respetar_estado_manual_obra();
CREATE OR REPLACE FUNCTION public.revisar_fin_obra(p_proyecto text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE project public.proyectos; complete boolean; total integer;
BEGIN
 SELECT * INTO project FROM public.proyectos WHERE id=p_proyecto FOR UPDATE;
 IF NOT FOUND OR project.estado='cancelada' THEN RETURN; END IF;
 SELECT count(*),coalesce(bool_and(porcentaje_avance>=100),false) INTO total,complete FROM public.actividades WHERE proyecto_id=p_proyecto;
 IF total>0 AND complete AND project.estado<>'terminado' THEN
  UPDATE public.proyectos SET estado_anterior_cierre=estado,estado='terminado',finalizada_automaticamente=true WHERE id=p_proyecto;
 ELSIF NOT(total>0 AND complete) AND project.finalizada_automaticamente THEN
  UPDATE public.proyectos SET estado=coalesce(estado_anterior_cierre,'activo'),finalizada_automaticamente=false,estado_anterior_cierre=NULL WHERE id=p_proyecto;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.revisar_fin_obra(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.finalizar_obra_por_partidas() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN PERFORM public.revisar_fin_obra(OLD.proyecto_id); RETURN OLD; END IF;
 PERFORM public.revisar_fin_obra(NEW.proyecto_id);
 IF TG_OP='UPDATE' AND OLD.proyecto_id<>NEW.proyecto_id THEN PERFORM public.revisar_fin_obra(OLD.proyecto_id); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS finalizar_obra_por_partidas ON public.actividades;
CREATE TRIGGER finalizar_obra_por_partidas AFTER INSERT OR UPDATE OR DELETE ON public.actividades FOR EACH ROW EXECUTE FUNCTION public.finalizar_obra_por_partidas();
-- Aplicar la misma regla a obras existentes, conservando el estado anterior para poder reabrirlas.
UPDATE public.proyectos p SET estado_anterior_cierre=p.estado,estado='terminado',finalizada_automaticamente=true
WHERE p.estado IN ('activo','pendiente','pausado') AND EXISTS(SELECT 1 FROM public.actividades a WHERE a.proyecto_id=p.id) AND NOT EXISTS(SELECT 1 FROM public.actividades a WHERE a.proyecto_id=p.id AND a.porcentaje_avance<100);
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
CREATE OR REPLACE FUNCTION public.confirmar_cierre_diario(p_id text,p_proyecto text,p_fecha date,p_nota text DEFAULT '',p_actor text DEFAULT NULL) RETURNS public.documentos_obra LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; project public.proyectos; document public.documentos_obra; summary jsonb; revision integer; next_day date;
BEGIN
 actor:=public.actor_gestion_diaria(p_actor);
 SELECT * INTO project FROM public.proyectos WHERE id=p_proyecto AND empresa_id=actor.empresa_id;
 IF NOT FOUND OR p_fecha>(now() AT TIME ZONE 'America/Santiago')::date OR length(p_id)>150 OR length(coalesce(p_nota,''))>4000 THEN RAISE EXCEPTION 'DAILY_CLOSE_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_proyecto||p_fecha::text,13));
 SELECT * INTO document FROM public.documentos_obra WHERE id=p_id;
 IF FOUND THEN IF document.proyecto_id<>project.id OR document.empresa_id<>actor.empresa_id THEN RAISE EXCEPTION 'DAILY_CLOSE_FORBIDDEN'; END IF; RETURN document; END IF;
 SELECT coalesce(max((cierre_resumen->>'version')::integer),0)+1 INTO revision FROM public.documentos_obra WHERE proyecto_id=project.id AND categoria='cierre_diario' AND fecha_documento=p_fecha;
 next_day:=public.sumar_dias_laborales(p_fecha,1,project.dias_laborales,project.fechas_no_laborales);
 summary:=jsonb_build_object('version',revision,'fecha',p_fecha,'proyecto_nombre',project.nombre,'confirmado_por',actor.nombre,'confirmado_en',now(),'nota',coalesce(p_nota,''),'proxima_jornada',next_day,
  'presentes',(SELECT count(*) FROM public.asistencia_obreros WHERE proyecto_id=project.id AND fecha=p_fecha AND estado IN ('presente','atraso')),
  'horas',(SELECT coalesce(sum(horas_trabajadas),0) FROM public.asistencia_obreros WHERE proyecto_id=project.id AND fecha=p_fecha),
  'personas',(SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',trabajador_nombre,'estado',estado,'horas',coalesce(horas_trabajadas,0))),'[]') FROM public.asistencia_obreros WHERE proyecto_id=project.id AND fecha=p_fecha),
  'avances',(SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',titulo,'nota',nota,'foto_url',foto_url)),'[]') FROM public.bitacora_entradas WHERE proyecto_id=project.id AND fecha=p_fecha),
  'recepciones',(SELECT coalesce(jsonb_agg(jsonb_build_object('material',m.nombre,'cantidad',b.cantidad_recibida,'unidad',m.unidad)),'[]') FROM public.bitacora_entradas b JOIN public.materiales_proyecto m ON m.id=b.material_id WHERE b.proyecto_id=project.id AND b.fecha=p_fecha),
  'ingresos',(SELECT coalesce(sum(monto),0) FROM public.pagos WHERE proyecto_id=project.id AND fecha=p_fecha AND coalesce(estado,'completado')='completado'),
  'gastos',(SELECT coalesce(sum(monto_adicional),0) FROM public.imprevistos WHERE proyecto_id=project.id AND fecha_reporte=p_fecha),
  'mano_obra',(SELECT coalesce(sum(monto_adicional),0) FROM public.imprevistos WHERE proyecto_id=project.id AND fecha_reporte=p_fecha AND categoria_gasto='mano_obra'),
  'pendientes',(SELECT coalesce(jsonb_agg(titulo),'[]') FROM public.reclamos_cambios_obra WHERE proyecto_id=project.id AND estado IN ('pendiente','en_revision')),
  'tareas_manana',(SELECT coalesce(jsonb_agg(nombre ORDER BY orden),'[]') FROM public.actividades WHERE proyecto_id=project.id AND estado<>'terminada' AND fecha_inicio<=next_day AND fecha_termino>=next_day));
 INSERT INTO public.documentos_obra(id,proyecto_id,empresa_id,subido_por_id,subido_por_nombre,categoria,nombre,descripcion,fecha_documento,cierre_resumen) VALUES(p_id,project.id,actor.empresa_id,actor.id,actor.nombre,'cierre_diario','Cierre diario '||to_char(p_fecha,'DD/MM/YYYY')||' · revisión '||revision,'Jornada confirmada por '||actor.nombre,p_fecha,summary) RETURNING * INTO document;
 RETURN document;
END $$;
REVOKE ALL ON FUNCTION public.confirmar_cierre_diario(text,text,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirmar_cierre_diario(text,text,date,text,text) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.aplicar_lote_whatsapp_gestion_base(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)') IS NULL THEN ALTER FUNCTION public.aplicar_lote_whatsapp(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) RENAME TO aplicar_lote_whatsapp_gestion_base; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.aplicar_lote_whatsapp(p_id text,p_empresa text,p_actor text,p_phone text,p_texto text,p_respuesta text,p_cotizacion jsonb,p_acciones jsonb,p_changed jsonb,p_deleted jsonb,p_adjunto jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; item jsonb; result jsonb:='[]'; document public.documentos_obra;
BEGIN
 IF EXISTS(SELECT 1 FROM public.whatsapp_mensajes WHERE message_id=p_id) THEN RETURN public.aplicar_lote_whatsapp_gestion_base(p_id,p_empresa,p_actor,p_phone,p_texto,p_respuesta,p_cotizacion,p_acciones,p_changed,p_deleted,p_adjunto); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_changed->'documentos_obra','[]')) row WHERE row->>'categoria'='cierre_diario') THEN
  SELECT * INTO actor FROM public.usuarios WHERE id=p_actor AND empresa_id=p_empresa AND rol IN ('admin','supervisor');
  IF NOT FOUND THEN RAISE EXCEPTION 'MANAGEMENT_FORBIDDEN'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(p_changed) pair WHERE pair.key<>'documentos_obra' AND jsonb_array_length(pair.value)>0) THEN RAISE EXCEPTION 'CLOSE_SEPARATE'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_changed->'documentos_obra') LOOP
   IF item->>'categoria'='cierre_diario' THEN
    document:=public.confirmar_cierre_diario(item->>'id',item->>'proyecto_id',(item->>'fecha_documento')::date,coalesce(item->'cierre_resumen'->>'nota',''),p_actor);
    result:=result||jsonb_build_array(to_jsonb(document));
   ELSE result:=result||jsonb_build_array(item); END IF;
  END LOOP;
  p_changed:=jsonb_set(p_changed,'{documentos_obra}',result);
 END IF;
 RETURN public.aplicar_lote_whatsapp_gestion_base(p_id,p_empresa,p_actor,p_phone,p_texto,p_respuesta,p_cotizacion,p_acciones,p_changed,p_deleted,p_adjunto);
END $$;
REVOKE ALL ON FUNCTION public.aplicar_lote_whatsapp(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_whatsapp(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
