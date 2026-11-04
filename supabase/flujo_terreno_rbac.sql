-- Aplicar después de contactos_whatsapp.sql. Aditiva, sin eliminar cuentas ni archivos.
BEGIN;
ALTER TABLE public.whatsapp_mensajes ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'consulta';
ALTER TABLE public.whatsapp_mensajes ADD COLUMN IF NOT EXISTS proyectos_ids text[] NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION public.clasificar_registro_whatsapp() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v jsonb; project text;
BEGIN
 NEW.categoria:=CASE WHEN NEW.aviso_id IS NOT NULL THEN 'aviso' WHEN NEW.acciones->>'tipo'='solicitar_datos_obra' THEN 'datos_obra' WHEN NEW.adjunto IS NOT NULL AND NEW.adjunto<>'null'::jsonb THEN 'fotografia' WHEN NEW.cotizacion IS NOT NULL AND NEW.cotizacion<>'null'::jsonb THEN 'cotizacion' WHEN NEW.acciones->>'tipo' IS NOT NULL AND NEW.acciones->>'tipo'<>'solicitar_datos_persona' THEN 'registro' ELSE 'consulta' END;
 NEW.proyectos_ids:='{}';
 project:=coalesce(NEW.adjunto->>'proyecto_id',NEW.acciones->>'proyecto_contexto_id');
 IF project IS NOT NULL THEN NEW.proyectos_ids:=array_append(NEW.proyectos_ids,project); END IF;
 FOR v IN SELECT jsonb_path_query(NEW.acciones,'$.**.proyecto_id') LOOP
  project:=v#>>'{}';IF project IS NOT NULL AND NOT(project=ANY(NEW.proyectos_ids)) THEN NEW.proyectos_ids:=array_append(NEW.proyectos_ids,project);END IF;
 END LOOP;
 FOR v IN SELECT jsonb_path_query(NEW.acciones,'$.**.link_destino') LOOP
  project:=substring(v#>>'{}' FROM '^/proyectos/([^/]+)/');IF project IS NOT NULL AND NOT(project=ANY(NEW.proyectos_ids)) THEN NEW.proyectos_ids:=array_append(NEW.proyectos_ids,project);END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS clasificar_registro_whatsapp ON public.whatsapp_mensajes;
CREATE TRIGGER clasificar_registro_whatsapp BEFORE INSERT OR UPDATE ON public.whatsapp_mensajes FOR EACH ROW EXECUTE FUNCTION public.clasificar_registro_whatsapp();
CREATE OR REPLACE FUNCTION public.puede_usar_web() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios WHERE (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND (rol='admin' OR is_dev));
$$;
REVOKE ALL ON FUNCTION public.puede_usar_web() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.puede_usar_web() TO authenticated,service_role;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['empresas','usuarios','clientes','proyectos','proyecto_trabajadores','actividades','pagos','materiales_proyecto','bitacora_entradas','imprevistos','agenda_eventos','mensajes_chat_proyecto','reclamos_cambios_obra','documentos_obra','asistencia_obreros','reportes_whatsapp','presupuestos','presupuesto_grupos','whatsapp_mensajes','whatsapp_avisos','whatsapp_envios'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN
   EXECUTE format('DROP POLICY IF EXISTS acceso_web_roles ON public.%I',t);
   EXECUTE format('CREATE POLICY acceso_web_roles ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.puede_usar_web()) WITH CHECK(public.puede_usar_web())',t);
  END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.proteger_privilegios_dev() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user IN ('postgres','supabase_admin','service_role') OR auth.role()='service_role' THEN RETURN NEW; END IF;
 IF (TG_OP='INSERT' AND NEW.is_dev) OR (TG_OP='UPDATE' AND NEW.is_dev IS DISTINCT FROM OLD.is_dev) THEN RAISE EXCEPTION 'DEV_PRIVILEGES_FORBIDDEN'; END IF;
 IF lower(trim(NEW.email)) IN ('obratrack2627@gmail.com','benja105.achavar@gmail.com') AND (TG_OP='INSERT' OR lower(trim(NEW.email)) IS DISTINCT FROM lower(trim(OLD.email))) THEN RAISE EXCEPTION 'CONTACT_RESERVED_EMAIL'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS proteger_privilegios_dev ON public.usuarios;
REVOKE ALL ON FUNCTION public.proteger_privilegios_dev() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER proteger_privilegios_dev BEFORE INSERT OR UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.proteger_privilegios_dev();
CREATE OR REPLACE FUNCTION public.cambiar_plan_desarrollo(p_plan text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; company public.empresas;
BEGIN
 SELECT * INTO actor FROM public.usuarios WHERE (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND is_dev LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'DEV_REQUIRED'; END IF;
 IF p_plan NOT IN ('gratis','pro','pro_ia') OR p_plan IS NULL THEN RAISE EXCEPTION 'PLAN_INVALID'; END IF;
 UPDATE public.empresas SET plan_id=p_plan,updated_at=now() WHERE id=actor.empresa_id RETURNING * INTO company;
 RETURN jsonb_build_object('plan_id',company.plan_id);
END $$;
REVOKE ALL ON FUNCTION public.cambiar_plan_desarrollo(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cambiar_plan_desarrollo(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rut_registro_valido(p_rut text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE r text; cuerpo text; suma int:=0; mult int:=2; i int; dv text;
BEGIN
 r:=upper(replace(replace(p_rut,'.',''),'-',''));
 IF r IS NULL OR r !~ '^[0-9]{7,8}[0-9K]$' THEN RETURN false; END IF;
 cuerpo:=left(r,-1);
 FOR i IN REVERSE char_length(cuerpo)..1 LOOP
  suma:=suma+substring(cuerpo,i,1)::int*mult;
  mult:=CASE WHEN mult=7 THEN 2 ELSE mult+1 END;
 END LOOP;
 dv:=CASE 11-(suma%11) WHEN 11 THEN '0' WHEN 10 THEN 'K' ELSE (11-(suma%11))::text END;
 RETURN right(r,1)=dv;
END $$;
CREATE OR REPLACE FUNCTION public.validar_registro_persona(p_tipo text,p_datos jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF nullif(trim(p_datos->>'nombre'),'') IS NULL OR char_length(p_datos->>'nombre')>150
  OR NOT public.rut_registro_valido(p_datos->>'rut')
  OR public.telefono_whatsapp_canonico(coalesce(p_datos->>'telefono_whatsapp',p_datos->>'telefono')) IS NULL
  OR coalesce(p_datos->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  OR char_length(p_datos->>'email')>100 THEN RAISE EXCEPTION 'REGISTRATION_REQUIRED'; END IF;
 IF p_tipo='trabajador' AND (coalesce(p_datos->>'rol','') NOT IN ('terreno','supervisor') OR trim(p_datos->>'nombre') !~ '[^[:space:]]+[[:space:]]+[^[:space:]]+') THEN RAISE EXCEPTION 'REGISTRATION_REQUIRED'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.rut_registro_valido(text),public.validar_registro_persona(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rut_registro_valido(text),public.validar_registro_persona(text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.crear_integrante_equipo(p_datos jsonb,p_proyecto text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; u public.usuarios; requested_id text;
BEGIN
 SELECT * INTO actor FROM public.usuarios WHERE (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND (rol='admin' OR is_dev) LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'WEB_ROLE_FORBIDDEN'; END IF;
 PERFORM public.validar_registro_persona('trabajador',p_datos);
 IF lower(trim(p_datos->>'email')) IN ('obratrack2627@gmail.com','benja105.achavar@gmail.com') THEN RAISE EXCEPTION 'CONTACT_RESERVED_EMAIL'; END IF;
 IF (p_datos->>'rol'='terreno' AND p_proyecto IS NULL) OR (p_proyecto IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id=p_proyecto AND empresa_id=actor.empresa_id)) THEN RAISE EXCEPTION 'REGISTRATION_PROJECT_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor.empresa_id,0));
 requested_id:=coalesce(nullif(p_datos->>'id',''),'u-'||gen_random_uuid());
 IF requested_id !~* '^u-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'REGISTRATION_INVALID_ID'; END IF;
 SELECT * INTO u FROM public.usuarios WHERE id=requested_id FOR UPDATE;
 IF FOUND THEN
  IF u.empresa_id IS DISTINCT FROM actor.empresa_id OR u.auth_user_id IS NOT NULL OR u.rol IS DISTINCT FROM p_datos->>'rol'
   OR u.nombre IS DISTINCT FROM trim(p_datos->>'nombre') OR u.email IS DISTINCT FROM lower(trim(p_datos->>'email'))
   OR public.telefono_whatsapp_canonico(u.telefono_whatsapp) IS DISTINCT FROM public.telefono_whatsapp_canonico(p_datos->>'telefono_whatsapp')
   OR upper(replace(replace(u.rut,'.',''),'-','')) IS DISTINCT FROM upper(replace(replace(p_datos->>'rut','.',''),'-',''))
   OR (p_proyecto IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyecto_trabajadores WHERE usuario_id=u.id AND proyecto_id=p_proyecto)) THEN RAISE EXCEPTION 'CONTACT_CONFLICT'; END IF;
  RETURN to_jsonb(u);
 END IF;
 INSERT INTO public.usuarios(id,empresa_id,nombre,rut,email,telefono_whatsapp,rol,auth_user_id,is_dev)
 VALUES(requested_id,actor.empresa_id,trim(p_datos->>'nombre'),upper(replace(p_datos->>'rut','.','')),lower(trim(p_datos->>'email')),'+'||public.telefono_whatsapp_canonico(p_datos->>'telefono_whatsapp'),p_datos->>'rol',NULL,false) RETURNING * INTO u;
 IF p_proyecto IS NOT NULL THEN INSERT INTO public.proyecto_trabajadores(proyecto_id,usuario_id) VALUES(p_proyecto,u.id); END IF;
 RETURN to_jsonb(u);
END $$;
REVOKE ALL ON FUNCTION public.crear_integrante_equipo(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crear_integrante_equipo(jsonb,text) TO authenticated;

-- Los RPC con SECURITY DEFINER también deben respetar el bloqueo web de supervisores/terreno.
-- Conservar sus firmas, versiones y validaciones existentes al añadir la guardia común.
DO $$ DECLARE f record; definition text; marker int; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND p.proname IN ('actualizar_contacto_equipo','guardar_alternativas_presupuesto','seleccionar_presupuesto','actualizar_grupo_presupuesto','convertir_presupuesto_obra') LOOP
  definition:=pg_get_functiondef(f.oid);
  IF strpos(definition,'IF NOT public.puede_usar_web()')=0 THEN
   marker:=strpos(definition,E'\nBEGIN');
   IF marker=0 THEN RAISE EXCEPTION 'RPC_WEB_GUARD_MISSING'; END IF;
   definition:=overlay(definition placing E'\n IF NOT public.puede_usar_web() THEN RAISE EXCEPTION ''WEB_ROLE_FORBIDDEN''; END IF;' from marker+6 for 0);
   EXECUTE definition;
  END IF;
 END LOOP;
END $$;

-- Validación nativa del canal: conserva el lote transaccional y los reintentos existentes.
DO $$ BEGIN
 IF to_regprocedure('public.aplicar_lote_whatsapp_contactos_base(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)') IS NULL THEN
  ALTER FUNCTION public.aplicar_lote_whatsapp(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) RENAME TO aplicar_lote_whatsapp_contactos_base;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.aplicar_lote_whatsapp_contactos_base(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_whatsapp_contactos_base(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.aplicar_lote_whatsapp(
 p_id text,p_empresa text,p_actor text,p_phone text,p_texto text,p_respuesta text,p_cotizacion jsonb,p_acciones jsonb,p_changed jsonb,p_deleted jsonb,p_adjunto jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; r jsonb; t text; cached public.whatsapp_mensajes;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa,0));
 SELECT * INTO actor FROM public.usuarios WHERE id=p_actor AND empresa_id=p_empresa;
 IF NOT FOUND OR actor.rol NOT IN ('admin','supervisor','terreno') THEN RAISE EXCEPTION 'CHANNEL_FORBIDDEN'; END IF;
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
   IF t NOT IN ('actividades','bitacora_entradas','asistencia_obreros','reclamos_cambios_obra','documentos_obra','reportes_whatsapp') THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
   FOR r IN SELECT value FROM jsonb_array_elements(p_changed->t) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.proyecto_trabajadores pt JOIN public.proyectos p ON p.id=pt.proyecto_id WHERE p.id=r->>'proyecto_id' AND p.empresa_id=p_empresa AND pt.usuario_id=p_actor) THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
    IF t='asistencia_obreros' AND r->>'usuario_id' IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'WORKER_SCOPE_FORBIDDEN'; END IF;
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

-- Los objetos siguen privados. Solo la web autorizada puede firmar archivos de su empresa.
-- Reparar solo asociaciones explícitas, con archivo existente; no inferir la obra de fotos antiguas.
INSERT INTO public.bitacora_entradas(id,proyecto_id,usuario_id,autor_nombre,titulo,nota,foto_url,tipo,fecha)
 SELECT 'b-wa-'||md5(m.message_id),p.id,u.id,u.nombre,'Evidencia recibida por WhatsApp',left(m.texto||E'\n'||coalesce(m.adjunto->>'descripcion',''),6000),'whatsapp-evidencias:'||(m.adjunto->>'path'),'avance',(m.created_at AT TIME ZONE 'America/Santiago')::date
 FROM public.whatsapp_mensajes m JOIN public.proyectos p ON p.id=m.adjunto->>'proyecto_id' AND p.empresa_id=m.empresa_id
 JOIN public.usuarios u ON u.id=m.actor_id AND u.empresa_id=m.empresa_id
 WHERE m.adjunto->>'path' ~ '^[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+/[a-f0-9]{64}[.](jpg|png|webp)$'
 AND split_part(m.adjunto->>'path','/',1)=m.empresa_id
 AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='whatsapp-evidencias' AND o.name=m.adjunto->>'path')
 AND NOT EXISTS(SELECT 1 FROM public.bitacora_entradas b WHERE b.proyecto_id=p.id AND strpos(coalesce(b.foto_url,''),m.adjunto->>'path')>0)
 ON CONFLICT(id) DO NOTHING;
UPDATE storage.buckets SET public=false,file_size_limit=10485760,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] WHERE id='whatsapp-evidencias';
DROP POLICY IF EXISTS evidencias_obra_lectura ON storage.objects;
CREATE POLICY evidencias_obra_lectura ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='whatsapp-evidencias' AND public.puede_usar_web() AND split_part(name,'/',1)=public.get_auth_empresa_id()
 AND (EXISTS(SELECT 1 FROM public.bitacora_entradas b JOIN public.proyectos p ON p.id=b.proyecto_id WHERE p.empresa_id=public.get_auth_empresa_id() AND b.foto_url='whatsapp-evidencias:'||name)
 OR EXISTS(SELECT 1 FROM public.documentos_obra d WHERE d.empresa_id=public.get_auth_empresa_id() AND d.archivo_url='whatsapp-evidencias:'||name))
);
DROP POLICY IF EXISTS archivos_acceso_web ON storage.objects;
CREATE POLICY archivos_acceso_web ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING(bucket_id NOT IN ('bitacora-fotos','documentos-obra','whatsapp-evidencias') OR public.puede_usar_web())
 WITH CHECK(bucket_id NOT IN ('bitacora-fotos','documentos-obra','whatsapp-evidencias') OR public.puede_usar_web());
NOTIFY pgrst,'reload schema';
COMMIT;
