-- Especialidades opcionales y múltiples. Aplicar después de flujo_terreno_rbac.sql.
-- No cambia los roles, credenciales, asignaciones ni contactos existentes.
BEGIN;
CREATE OR REPLACE FUNCTION public.normalizar_especialidades(p_valor jsonb) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE item jsonb; nombre text; clave text; claves text[]:='{}'; resultado text[]:='{}';
BEGIN
 IF jsonb_typeof(p_valor) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'SPECIALTIES_INVALID'; END IF;
 IF jsonb_array_length(p_valor)>12 THEN RAISE EXCEPTION 'SPECIALTIES_INVALID'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_valor) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'SPECIALTIES_INVALID'; END IF;
  nombre:=regexp_replace(trim(item#>>'{}'),'[[:space:]]+',' ','g');
  IF char_length(nombre) NOT BETWEEN 1 AND 60 OR nombre ~ '[[:cntrl:]<>]' THEN RAISE EXCEPTION 'SPECIALTIES_INVALID'; END IF;
  clave:=translate(lower(nombre),'áéíóúü','aeiouu');
  IF NOT clave=ANY(claves) THEN claves:=array_append(claves,clave); resultado:=array_append(resultado,nombre); END IF;
 END LOOP;
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.normalizar_especialidades(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.normalizar_especialidades(jsonb) TO authenticated,service_role;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS especialidades text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_especialidades_validas;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_especialidades_validas CHECK(especialidades=public.normalizar_especialidades(to_jsonb(especialidades)));

CREATE OR REPLACE FUNCTION public.crear_integrante_equipo(p_datos jsonb,p_proyecto text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; u public.usuarios; requested_id text;
BEGIN
 SELECT * INTO actor FROM public.usuarios WHERE (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND (rol='admin' OR is_dev) LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'WEB_ROLE_FORBIDDEN'; END IF;
 PERFORM public.validar_registro_persona('trabajador',p_datos);
 IF lower(trim(p_datos->>'email')) = 'obratrack2627@gmail.com' THEN RAISE EXCEPTION 'CONTACT_RESERVED_EMAIL'; END IF;
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
   OR (p_datos ? 'especialidades' AND u.especialidades IS DISTINCT FROM public.normalizar_especialidades(p_datos->'especialidades'))
   OR (p_proyecto IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyecto_trabajadores WHERE usuario_id=u.id AND proyecto_id=p_proyecto)) THEN RAISE EXCEPTION 'CONTACT_CONFLICT'; END IF;
  RETURN to_jsonb(u);
 END IF;
 INSERT INTO public.usuarios(id,empresa_id,nombre,rut,email,telefono_whatsapp,rol,auth_user_id,is_dev,especialidades)
 VALUES(requested_id,actor.empresa_id,trim(p_datos->>'nombre'),upper(replace(p_datos->>'rut','.','')),lower(trim(p_datos->>'email')),'+'||public.telefono_whatsapp_canonico(p_datos->>'telefono_whatsapp'),p_datos->>'rol',NULL,false,public.normalizar_especialidades(coalesce(p_datos->'especialidades','[]'::jsonb))) RETURNING * INTO u;
 IF p_proyecto IS NOT NULL THEN INSERT INTO public.proyecto_trabajadores(proyecto_id,usuario_id) VALUES(p_proyecto,u.id); END IF;
 RETURN to_jsonb(u);
END $$;

CREATE OR REPLACE FUNCTION public.actualizar_contacto_equipo_interno(p_empresa text,p_actor text,p_usuario text,p_datos jsonb,p_anterior jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE u public.usuarios; actual jsonb; datos jsonb; email text; phone text; rut text; cuerpo text; suma int:=0; mult int:=2; i int; dv text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_actor AND empresa_id=p_empresa AND rol IN ('admin','supervisor')) THEN RAISE EXCEPTION 'CONTACT_FORBIDDEN'; END IF;
 IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR NOT(p_datos ?& ARRAY['nombre','email','telefono_whatsapp','rut'])
  OR EXISTS(SELECT 1 FROM jsonb_each(p_datos) e WHERE e.key NOT IN ('nombre','email','telefono_whatsapp','rut','especialidades') OR (e.key<>'especialidades' AND jsonb_typeof(e.value) NOT IN ('string','null'))) THEN RAISE EXCEPTION 'CONTACT_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('obratrack_contactos',2));
 SELECT * INTO u FROM public.usuarios WHERE id=p_usuario AND empresa_id=p_empresa FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CONTACT_FORBIDDEN'; END IF;
 email:=nullif(p_datos->>'email','');
 phone:=nullif(p_datos->>'telefono_whatsapp','');
 rut:=nullif(p_datos->>'rut','');
 IF nullif(trim(p_datos->>'nombre'),'') IS NULL OR char_length(p_datos->>'nombre')>150 THEN RAISE EXCEPTION 'CONTACT_INVALID_NAME'; END IF;
 IF p_datos->'email' IS DISTINCT FROM p_anterior->'email' THEN
  email:=nullif(lower(trim(email)),'');
  IF email IS NOT NULL AND (char_length(email)>100 OR email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN RAISE EXCEPTION 'CONTACT_INVALID_EMAIL'; END IF;
 END IF;
 IF email = 'obratrack2627@gmail.com' AND email IS DISTINCT FROM lower(trim(u.email)) THEN RAISE EXCEPTION 'CONTACT_RESERVED_EMAIL'; END IF;
 IF phone IS NOT NULL AND p_datos->'telefono_whatsapp' IS DISTINCT FROM p_anterior->'telefono_whatsapp' THEN
  IF public.telefono_whatsapp_canonico(phone) IS NULL THEN RAISE EXCEPTION 'CONTACT_INVALID_PHONE'; END IF;
  phone:='+'||public.telefono_whatsapp_canonico(phone);
 END IF;
 IF rut IS NOT NULL AND p_datos->'rut' IS DISTINCT FROM p_anterior->'rut' THEN
  rut:=upper(replace(replace(rut,'.',''),'-',''));
  IF rut !~ '^[0-9]{7,8}[0-9K]$' THEN RAISE EXCEPTION 'CONTACT_INVALID_RUT'; END IF;
  cuerpo:=left(rut,-1);
  FOR i IN REVERSE char_length(cuerpo)..1 LOOP
   suma:=suma+substring(cuerpo,i,1)::int*mult;
   mult:=CASE WHEN mult=7 THEN 2 ELSE mult+1 END;
  END LOOP;
  dv:=CASE 11-(suma%11) WHEN 11 THEN '0' WHEN 10 THEN 'K' ELSE (11-(suma%11))::text END;
  IF right(rut,1)<>dv THEN RAISE EXCEPTION 'CONTACT_INVALID_RUT'; END IF;
  rut:=cuerpo||'-'||dv;
 END IF;
 datos:=jsonb_build_object('nombre',trim(p_datos->>'nombre'),'email',email,'telefono_whatsapp',phone,'rut',rut);
 actual:=jsonb_build_object('nombre',nullif(u.nombre,''),'email',nullif(u.email,''),'telefono_whatsapp',nullif(u.telefono_whatsapp,''),'rut',nullif(u.rut,''));
 datos:=datos||jsonb_build_object('especialidades',CASE WHEN p_datos ? 'especialidades' THEN public.normalizar_especialidades(p_datos->'especialidades') ELSE u.especialidades END);
 actual:=actual||jsonb_build_object('especialidades',u.especialidades);
 -- Reintentar un guardado cuya respuesta se perdió no altera los datos otra vez.
 IF actual=datos THEN RETURN to_jsonb(u); END IF;
 IF (p_anterior-'especialidades') IS DISTINCT FROM (actual-'especialidades') OR (p_anterior ? 'especialidades' AND p_anterior->'especialidades' IS DISTINCT FROM actual->'especialidades') THEN RAISE EXCEPTION 'CONTACT_CONFLICT'; END IF;
 -- Solo datos de la ficha: ni rol, ni empresa, ni auth_user_id, ni is_dev cambian.
 UPDATE public.usuarios SET nombre=datos->>'nombre',email=datos->>'email',telefono_whatsapp=datos->>'telefono_whatsapp',rut=datos->>'rut',especialidades=public.normalizar_especialidades(datos->'especialidades') WHERE id=p_usuario RETURNING * INTO u;
 RETURN to_jsonb(u);
END $$;

CREATE OR REPLACE FUNCTION public.aplicar_lote_whatsapp_contactos_base(
 p_id text, p_empresa text, p_actor text, p_phone text, p_texto text,
 p_respuesta text, p_cotizacion jsonb, p_acciones jsonb, p_changed jsonb, p_deleted jsonb, p_adjunto jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
 t text; r jsonb; item jsonb; old_empresa text; cols text; updates text; workers jsonb;
 cached public.whatsapp_mensajes%ROWTYPE; existing_user public.usuarios%ROWTYPE;
 allowed text[] := ARRAY['clientes','usuarios','proyectos','actividades','materiales_proyecto','pagos','bitacora_entradas','imprevistos','agenda_eventos','reclamos_cambios_obra','documentos_obra','asistencia_obreros','reportes_whatsapp'];
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa, 1));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id, 0));
 IF EXISTS(SELECT 1 FROM jsonb_each(p_changed) e WHERE NOT(e.key=ANY(allowed))) THEN RAISE EXCEPTION 'Tabla no admitida'; END IF;
 SELECT * INTO cached FROM public.whatsapp_mensajes WHERE message_id = p_id;
 IF FOUND THEN
  IF cached.empresa_id <> p_empresa OR cached.actor_id <> p_actor THEN RAISE EXCEPTION 'Mensaje de otra cuenta'; END IF;
  RETURN to_jsonb(cached);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id=p_actor AND empresa_id=p_empresa) THEN RAISE EXCEPTION 'Cuenta no autorizada'; END IF;
 -- Orden de dependencias fijo: no depende del orden de claves de JSONB.
 FOREACH t IN ARRAY allowed LOOP
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_changed->t, '[]'::jsonb)) LOOP
   r := item - 'trabajadores_ids'; workers := item->'trabajadores_ids';
   IF t = ANY(ARRAY['clientes','usuarios','proyectos','agenda_eventos','reclamos_cambios_obra','documentos_obra','asistencia_obreros','reportes_whatsapp']) THEN
    IF r->>'empresa_id' IS DISTINCT FROM p_empresa THEN RAISE EXCEPTION 'Empresa no autorizada'; END IF;
   END IF;
   IF t = ANY(ARRAY['clientes','usuarios','proyectos','agenda_eventos','reclamos_cambios_obra','documentos_obra','asistencia_obreros','reportes_whatsapp']) THEN
    EXECUTE format('SELECT empresa_id FROM public.%I WHERE id=$1', t) INTO old_empresa USING r->>'id';
   ELSE
    EXECUTE format('SELECT p.empresa_id FROM public.%I x JOIN public.proyectos p ON p.id=x.proyecto_id WHERE x.id=$1',t) INTO old_empresa USING r->>'id';
   END IF;
   IF old_empresa IS NOT NULL AND old_empresa <> p_empresa THEN RAISE EXCEPTION 'Registro de otra empresa'; END IF;
   IF r->>'proyecto_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id=r->>'proyecto_id' AND empresa_id=p_empresa) THEN RAISE EXCEPTION 'Obra no autorizada'; END IF;
   IF r->>'cliente_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=r->>'cliente_id' AND empresa_id=p_empresa) THEN RAISE EXCEPTION 'Cliente no autorizado'; END IF;
   IF COALESCE(r->>'usuario_id',r->>'responsable_id') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=COALESCE(r->>'usuario_id',r->>'responsable_id') AND empresa_id=p_empresa) THEN RAISE EXCEPTION 'Trabajador no autorizado'; END IF;
   IF r->>'actividad_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.actividades a JOIN public.proyectos p ON p.id=a.proyecto_id WHERE a.id=r->>'actividad_id' AND p.empresa_id=p_empresa) THEN RAISE EXCEPTION 'Actividad no autorizada'; END IF;
   IF t='usuarios' THEN
    SELECT * INTO existing_user FROM public.usuarios WHERE id=r->>'id';
    IF FOUND THEN
     IF r->>'empresa_id' IS DISTINCT FROM existing_user.empresa_id OR r->>'rol' IS DISTINCT FROM existing_user.rol OR nullif(r->>'auth_user_id','') IS DISTINCT FROM nullif(existing_user.auth_user_id,'')
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(r) k WHERE k NOT IN ('id','empresa_id','rol','auth_user_id','nombre','email','telefono_whatsapp','rut','especialidades','_contacto_anterior')) THEN
      RAISE EXCEPTION 'CONTACT_FORBIDDEN';
     END IF;
     PERFORM public.actualizar_contacto_equipo_interno(p_empresa,p_actor,r->>'id',jsonb_build_object('nombre',r->'nombre','email',r->'email','telefono_whatsapp',r->'telefono_whatsapp','rut',r->'rut')||CASE WHEN r ? 'especialidades' THEN jsonb_build_object('especialidades',r->'especialidades') ELSE '{}'::jsonb END,r->'_contacto_anterior');
     CONTINUE;
    END IF;
    IF r->>'rol' NOT IN ('terreno','supervisor') OR r->>'auth_user_id' IS NOT NULL OR r ? '_contacto_anterior' THEN RAISE EXCEPTION 'CONTACT_FORBIDDEN'; END IF;
   END IF;
   SELECT string_agg(format('%I',key),','), string_agg(format('%I=EXCLUDED.%I',key,key),',') FILTER(WHERE key<>'id') INTO cols,updates FROM jsonb_object_keys(r) AS key;
   EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) ON CONFLICT(id) DO UPDATE SET %s',t,cols,cols,t,updates) USING r;
   IF t='proyectos' THEN
    DELETE FROM public.proyecto_trabajadores WHERE proyecto_id=r->>'id';
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(workers,'[]'::jsonb)) LOOP
     IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=item#>>'{}' AND empresa_id=p_empresa) THEN RAISE EXCEPTION 'Cuadrilla no autorizada'; END IF;
     INSERT INTO public.proyecto_trabajadores(proyecto_id,usuario_id) VALUES(r->>'id',item#>>'{}') ON CONFLICT DO NOTHING;
    END LOOP;
   END IF;
  END LOOP;
 END LOOP;
 -- El canal solamente elimina obras explícitamente solicitadas; sus dependencias usan FK CASCADE.
 IF EXISTS(SELECT 1 FROM jsonb_each(p_deleted) e WHERE e.key<>'proyectos' AND jsonb_array_length(e.value)>0) THEN RAISE EXCEPTION 'Eliminación no admitida'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(COALESCE(p_deleted->'proyectos','[]'::jsonb)) LOOP
  DELETE FROM public.proyectos WHERE id=r->>'id' AND empresa_id=p_empresa;
 END LOOP;
 IF p_adjunto->>'proyecto_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id=p_adjunto->>'proyecto_id' AND empresa_id=p_empresa) THEN RAISE EXCEPTION 'Obra de evidencia no autorizada'; END IF;
 IF p_adjunto->>'origen_message_id' IS NOT NULL AND p_adjunto->>'proyecto_id' IS NOT NULL THEN
  UPDATE public.whatsapp_mensajes SET adjunto=p_adjunto WHERE message_id=p_adjunto->>'origen_message_id' AND empresa_id=p_empresa AND actor_id=p_actor AND adjunto->>'path'=p_adjunto->>'path';
 END IF;
 INSERT INTO public.whatsapp_mensajes(message_id,empresa_id,actor_id,sender_phone,texto,respuesta,cotizacion,acciones,adjunto)
 VALUES(p_id,p_empresa,p_actor,p_phone,p_texto,p_respuesta,p_cotizacion,p_acciones,p_adjunto) RETURNING * INTO cached;
 RETURN to_jsonb(cached);
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
