-- Aplicar después de flujo_terreno_rbac.sql. No modifica asistencias existentes.
BEGIN;
CREATE OR REPLACE FUNCTION public.puede_gestionar_asistencia() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios WHERE (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND rol IN ('admin','supervisor'));
$$;
REVOKE ALL ON FUNCTION public.puede_gestionar_asistencia() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_asistencia() TO authenticated,service_role;
-- Restrictivas: se suman a las políticas de empresa y al bloqueo de acceso web.
DROP POLICY IF EXISTS asistencia_solo_jefatura_insert ON public.asistencia_obreros;
CREATE POLICY asistencia_solo_jefatura_insert ON public.asistencia_obreros AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.puede_gestionar_asistencia());
DROP POLICY IF EXISTS asistencia_solo_jefatura_update ON public.asistencia_obreros;
CREATE POLICY asistencia_solo_jefatura_update ON public.asistencia_obreros AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.puede_gestionar_asistencia()) WITH CHECK(public.puede_gestionar_asistencia());
DROP POLICY IF EXISTS asistencia_solo_jefatura_delete ON public.asistencia_obreros;
CREATE POLICY asistencia_solo_jefatura_delete ON public.asistencia_obreros AS RESTRICTIVE FOR DELETE TO authenticated USING(public.puede_gestionar_asistencia());

CREATE OR REPLACE FUNCTION public.aplicar_lote_whatsapp(
 p_id text,p_empresa text,p_actor text,p_phone text,p_texto text,p_respuesta text,p_cotizacion jsonb,p_acciones jsonb,p_changed jsonb,p_deleted jsonb,p_adjunto jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; r jsonb; t text; cached public.whatsapp_mensajes;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa,0));
 SELECT * INTO actor FROM public.usuarios WHERE id=p_actor AND empresa_id=p_empresa;
 IF NOT FOUND OR actor.rol NOT IN ('admin','supervisor','terreno') THEN RAISE EXCEPTION 'CHANNEL_FORBIDDEN'; END IF;
 IF actor.rol NOT IN ('admin','supervisor') AND (
  jsonb_array_length(coalesce(p_changed->'asistencia_obreros','[]'::jsonb))>0
  OR jsonb_array_length(coalesce(p_deleted->'asistencia_obreros','[]'::jsonb))>0
 ) THEN RAISE EXCEPTION 'ATTENDANCE_FORBIDDEN'; END IF;
 IF jsonb_array_length(coalesce(p_changed->'asistencia_obreros','[]'::jsonb))>0 THEN
  SELECT jsonb_set(p_changed,'{asistencia_obreros}',jsonb_agg(item||jsonb_build_object('registrado_por',actor.nombre))) INTO p_changed
   FROM jsonb_array_elements(p_changed->'asistencia_obreros') item;
 END IF;
 SELECT * INTO cached FROM public.whatsapp_mensajes WHERE message_id=p_id;
 IF FOUND THEN
  IF cached.actor_id<>p_actor OR cached.empresa_id<>p_empresa THEN RAISE EXCEPTION 'CHANNEL_FORBIDDEN'; END IF;
  RETURN to_jsonb(cached);
 END IF;
 IF p_acciones->>'proyecto_contexto_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyectos p WHERE p.id=p_acciones->>'proyecto_contexto_id' AND p.empresa_id=p_empresa AND (actor.rol<>'terreno' OR EXISTS(SELECT 1 FROM public.proyecto_trabajadores pt WHERE pt.proyecto_id=p.id AND pt.usuario_id=p_actor)))
  AND NOT (actor.rol IN ('admin','supervisor') AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_changed->'proyectos','[]')) p WHERE p->>'id'=p_acciones->>'proyecto_contexto_id' AND p->>'empresa_id'=p_empresa)) THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
 IF actor.rol='terreno' THEN
  IF p_cotizacion IS NOT NULL AND p_cotizacion<>'null'::jsonb THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(p_deleted) e WHERE jsonb_array_length(e.value)>0) THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
  FOR t IN SELECT key FROM jsonb_each(p_changed) LOOP
   IF jsonb_array_length(p_changed->t)=0 THEN CONTINUE; END IF;
   IF t NOT IN ('actividades','bitacora_entradas','reclamos_cambios_obra','documentos_obra','reportes_whatsapp') THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
   FOR r IN SELECT value FROM jsonb_array_elements(p_changed->t) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.proyecto_trabajadores pt JOIN public.proyectos p ON p.id=pt.proyecto_id WHERE p.id=r->>'proyecto_id' AND p.empresa_id=p_empresa AND pt.usuario_id=p_actor) THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
   END LOOP;
  END LOOP;
  IF p_adjunto->>'proyecto_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyecto_trabajadores WHERE proyecto_id=p_adjunto->>'proyecto_id' AND usuario_id=p_actor) THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
 END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_changed->'usuarios','[]')) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=r->>'id') THEN
   IF actor.rol NOT IN ('admin','supervisor') THEN RAISE EXCEPTION 'CHANNEL_FORBIDDEN'; END IF;
   PERFORM public.validar_registro_persona('trabajador',r);
   IF r->>'rol'='terreno' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_changed->'proyectos','[]')) p WHERE p->>'empresa_id'=p_empresa AND p->'trabajadores_ids' ? (r->>'id')) THEN RAISE EXCEPTION 'REGISTRATION_PROJECT_REQUIRED'; END IF;
  END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_changed->'clientes','[]')) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=r->>'id') THEN
   PERFORM public.validar_registro_persona('cliente',r);
   IF EXISTS(SELECT 1 FROM public.clientes c WHERE c.empresa_id=p_empresa AND upper(replace(replace(c.rut,'.',''),'-',''))=upper(replace(replace(r->>'rut','.',''),'-',''))) THEN RAISE EXCEPTION 'CONTACT_DUPLICATE'; END IF;
  END IF;
 END LOOP;
 RETURN public.aplicar_lote_whatsapp_contactos_base(p_id,p_empresa,p_actor,p_phone,p_texto,p_respuesta,p_cotizacion,coalesce(p_acciones,'{}')||jsonb_build_object('rol_actor',actor.rol),p_changed,p_deleted,p_adjunto);
END $$;
REVOKE ALL ON FUNCTION public.aplicar_lote_whatsapp(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_whatsapp(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
