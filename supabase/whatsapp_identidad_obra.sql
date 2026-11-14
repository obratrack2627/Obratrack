-- Aplicar después de logica_constructor_20261113.sql y presupuesto_whatsapp_obra.sql.
-- Revalida la identidad real y la asignación dentro de la transacción de escritura.
BEGIN;
CREATE OR REPLACE FUNCTION public.validar_actor_whatsapp(
 p_empresa text,p_actor text,p_phone text,p_changed jsonb,p_deleted jsonb,p_adjunto jsonb,p_contexto text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; phone text; r jsonb; t text; pid text; old_company text;
 new_ids text[]:='{}'; projects jsonb:='[]'; original jsonb; known boolean;
BEGIN
 SELECT * INTO actor FROM public.usuarios WHERE id=p_actor AND empresa_id=p_empresa FOR SHARE;
 phone:=public.telefono_whatsapp_canonico(p_phone);
 IF NOT FOUND OR actor.rol NOT IN ('admin','supervisor','terreno') OR phone IS NULL
  OR public.telefono_whatsapp_canonico(actor.telefono_whatsapp) IS DISTINCT FROM phone
  OR (SELECT count(*) FROM public.usuarios WHERE public.telefono_whatsapp_canonico(telefono_whatsapp)=phone)<>1
 THEN RAISE EXCEPTION 'WHATSAPP_IDENTITY_FORBIDDEN'; END IF;
 IF actor.rol<>'admin' THEN
  PERFORM 1 FROM public.proyecto_trabajadores WHERE usuario_id=p_actor FOR SHARE;
 END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_changed->'proyectos','[]')) LOOP
  IF actor.rol NOT IN ('admin','supervisor') OR r->>'empresa_id' IS DISTINCT FROM p_empresa THEN RAISE EXCEPTION 'PROJECT_MANAGEMENT_FORBIDDEN'; END IF;
  SELECT empresa_id INTO old_company FROM public.proyectos WHERE id=r->>'id';
  IF FOUND THEN
   IF old_company<>p_empresa OR actor.rol='supervisor' AND NOT EXISTS(SELECT 1 FROM public.proyecto_trabajadores WHERE proyecto_id=r->>'id' AND usuario_id=p_actor) THEN RAISE EXCEPTION 'WHATSAPP_PROJECT_FORBIDDEN'; END IF;
  ELSE
   new_ids:=array_append(new_ids,r->>'id');
   IF actor.rol='supervisor' AND NOT (coalesce(r->'trabajadores_ids','[]'::jsonb) ? p_actor) THEN
    r:=jsonb_set(r,'{trabajadores_ids}',coalesce(r->'trabajadores_ids','[]'::jsonb)||jsonb_build_array(p_actor));
   END IF;
  END IF;
  projects:=projects||jsonb_build_array(r);
 END LOOP;
 IF p_changed ? 'proyectos' THEN p_changed:=jsonb_set(p_changed,'{proyectos}',projects); END IF;
 IF actor.rol='terreno' AND EXISTS(SELECT 1 FROM jsonb_each(p_deleted) e WHERE jsonb_array_length(e.value)>0) THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
 FOR t IN SELECT key FROM jsonb_each(p_changed) LOOP
  FOR r IN SELECT value FROM jsonb_array_elements(p_changed->t) LOOP
   IF actor.rol='terreno' AND t NOT IN ('actividades','bitacora_entradas','reclamos_cambios_obra','documentos_obra','reportes_whatsapp') THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
   pid:=r->>'proyecto_id';
   IF actor.rol<>'admin' AND pid IS NOT NULL AND NOT(pid=ANY(new_ids)) AND NOT EXISTS(
    SELECT 1 FROM public.proyecto_trabajadores pt JOIN public.proyectos p ON p.id=pt.proyecto_id WHERE p.id=pid AND p.empresa_id=p_empresa AND pt.usuario_id=p_actor
   ) THEN RAISE EXCEPTION 'WHATSAPP_PROJECT_FORBIDDEN'; END IF;
   IF actor.rol='terreno' THEN
    IF pid IS NULL THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
    IF t='actividades' THEN
     SELECT to_jsonb(a) INTO original FROM public.actividades a WHERE id=r->>'id' AND proyecto_id=pid;
     IF NOT FOUND OR EXISTS(SELECT 1 FROM jsonb_each(r-ARRAY['porcentaje_avance','estado','updated_at']) e WHERE original->e.key IS DISTINCT FROM e.value) THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
     IF (r->>'porcentaje_avance')::numeric NOT BETWEEN 0 AND 100 OR r->>'estado' IS DISTINCT FROM (CASE WHEN (r->>'porcentaje_avance')::numeric>=100 THEN 'terminada' WHEN (r->>'porcentaje_avance')::numeric>0 THEN 'en_curso' ELSE 'pendiente' END) THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
    ELSE
     -- Terreno sube reportes nuevos: no edita ni reemplaza registros de otras personas.
     EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id=$1)',t) INTO known USING r->>'id';
     IF known OR t='bitacora_entradas' AND r->>'usuario_id' IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
    END IF;
   END IF;
  END LOOP;
 END LOOP;
 -- Los borrados de jefatura también deben corresponder a sus propias obras.
 IF actor.rol='supervisor' THEN
  FOR t IN SELECT key FROM jsonb_each(p_deleted) LOOP
   IF t IN ('proyectos','actividades','materiales_proyecto','pagos','bitacora_entradas','imprevistos','reclamos_cambios_obra','documentos_obra','asistencia_obreros','reportes_whatsapp') THEN
    FOR pid IN SELECT jsonb_array_elements_text(p_deleted->t) LOOP
     IF t<>'proyectos' THEN EXECUTE format('SELECT proyecto_id FROM public.%I WHERE id=$1',t) INTO pid USING pid; END IF;
     IF pid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyecto_trabajadores pt JOIN public.proyectos p ON p.id=pt.proyecto_id WHERE p.id=pid AND p.empresa_id=p_empresa AND pt.usuario_id=p_actor) THEN RAISE EXCEPTION 'WHATSAPP_PROJECT_FORBIDDEN'; END IF;
    END LOOP;
   END IF;
  END LOOP;
 END IF;
 FOREACH pid IN ARRAY ARRAY[p_adjunto->>'proyecto_id',p_contexto] LOOP
  IF pid IS NOT NULL AND NOT(pid=ANY(new_ids)) AND NOT EXISTS(SELECT 1 FROM public.proyectos p WHERE p.id=pid AND p.empresa_id=p_empresa AND (actor.rol='admin' OR EXISTS(SELECT 1 FROM public.proyecto_trabajadores pt WHERE pt.proyecto_id=p.id AND pt.usuario_id=p_actor))) THEN RAISE EXCEPTION 'WHATSAPP_PROJECT_FORBIDDEN'; END IF;
 END LOOP;
 RETURN p_changed;
END $$;
REVOKE ALL ON FUNCTION public.validar_actor_whatsapp(text,text,text,jsonb,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validar_actor_whatsapp(text,text,text,jsonb,jsonb,jsonb,text) TO service_role;
DO $$ BEGIN
 IF to_regprocedure('public.aplicar_lote_copiloto_identidad_base(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)') IS NULL THEN
  ALTER FUNCTION public.aplicar_lote_copiloto(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) RENAME TO aplicar_lote_copiloto_identidad_base;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.aplicar_lote_copiloto(
 p_id text,p_empresa text,p_actor text,p_phone text,p_texto text,p_respuesta text,p_cotizacion jsonb,p_acciones jsonb,p_changed jsonb,p_deleted jsonb,
 p_adjunto jsonb DEFAULT NULL,p_borrador jsonb DEFAULT NULL,p_aviso jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE cached public.whatsapp_mensajes; actor_role text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id,0));
 PERFORM public.validar_actor_whatsapp(p_empresa,p_actor,p_phone,'{}','{}',NULL);
 SELECT * INTO cached FROM public.whatsapp_mensajes WHERE message_id=p_id;
 IF FOUND THEN
  SELECT rol INTO actor_role FROM public.usuarios WHERE id=p_actor AND empresa_id=p_empresa;
  IF cached.actor_id<>p_actor OR cached.empresa_id<>p_empresa OR cached.acciones->>'rol_actor' IS DISTINCT FROM actor_role THEN RAISE EXCEPTION 'WHATSAPP_IDENTITY_FORBIDDEN'; END IF;
  PERFORM public.validar_actor_whatsapp(p_empresa,p_actor,p_phone,'{}','{}',cached.adjunto,cached.acciones->>'proyecto_contexto_id');
  RETURN to_jsonb(cached);
 END IF;
 p_changed:=public.validar_actor_whatsapp(p_empresa,p_actor,p_phone,coalesce(p_changed,'{}'),coalesce(p_deleted,'{}'),p_adjunto,p_acciones->>'proyecto_contexto_id');
 RETURN public.aplicar_lote_copiloto_identidad_base(p_id,p_empresa,p_actor,p_phone,p_texto,p_respuesta,p_cotizacion,p_acciones,p_changed,p_deleted,p_adjunto,p_borrador,p_aviso);
END $$;
REVOKE ALL ON FUNCTION public.aplicar_lote_copiloto_identidad_base(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.aplicar_lote_copiloto(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_copiloto(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
