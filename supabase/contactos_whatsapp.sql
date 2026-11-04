-- Edición de contactos por ObraBot. Aditiva: conserva usuarios, Auth, permisos y mensajes.
-- Aplicar después de permisos_obra.sql, whatsapp_avisos.sql y presupuestos_alternativas.sql.
BEGIN;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS comuna VARCHAR(100);
-- El correo visible es de contacto; el ingreso por RUT conserva el correo real de Auth.
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS email_acceso VARCHAR(100);
CREATE OR REPLACE FUNCTION public.correo_acceso_desde_auth() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 SELECT a.email INTO NEW.email_acceso FROM auth.users a WHERE a.id::text=NEW.auth_user_id OR a.id::text=NEW.id LIMIT 1;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.correo_acceso_desde_auth() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS correo_acceso_autorizado ON public.usuarios;
CREATE TRIGGER correo_acceso_autorizado BEFORE INSERT OR UPDATE OF email_acceso,auth_user_id ON public.usuarios
 FOR EACH ROW EXECUTE FUNCTION public.correo_acceso_desde_auth();
UPDATE public.usuarios u SET email_acceso=a.email FROM auth.users a WHERE (a.id::text=u.auth_user_id OR a.id::text=u.id) AND u.email_acceso IS DISTINCT FROM a.email;
CREATE OR REPLACE FUNCTION public.sincronizar_correo_acceso() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.usuarios SET email_acceso=NEW.email WHERE auth_user_id=NEW.id::text OR id=NEW.id::text;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sincronizar_correo_acceso() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sincronizar_correo_acceso_obratrack ON auth.users;
CREATE TRIGGER sincronizar_correo_acceso_obratrack AFTER INSERT OR UPDATE OF email ON auth.users
 FOR EACH ROW EXECUTE FUNCTION public.sincronizar_correo_acceso();

CREATE OR REPLACE FUNCTION public.validar_contacto_equipo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE phone text;
BEGIN
 -- Serializar la unicidad incluso entre ediciones de empresas distintas y desde la web.
 PERFORM pg_advisory_xact_lock(hashtextextended('obratrack_contactos',2));
 phone:=public.telefono_whatsapp_canonico(NEW.telefono_whatsapp);
 IF TG_OP='UPDATE' AND NEW.telefono_whatsapp IS NOT DISTINCT FROM OLD.telefono_whatsapp AND NEW.email IS NOT DISTINCT FROM OLD.email AND NEW.rut IS NOT DISTINCT FROM OLD.rut THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' OR NEW.telefono_whatsapp IS DISTINCT FROM OLD.telefono_whatsapp THEN
  IF nullif(NEW.telefono_whatsapp,'') IS NOT NULL AND phone IS NULL THEN RAISE EXCEPTION 'CONTACT_INVALID_PHONE'; END IF;
  IF phone IS NOT NULL AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id<>NEW.id AND public.telefono_whatsapp_canonico(u.telefono_whatsapp)=phone) THEN RAISE EXCEPTION 'CONTACT_DUPLICATE'; END IF;
 END IF;
 IF (TG_OP='INSERT' OR NEW.email IS DISTINCT FROM OLD.email) AND nullif(NEW.email,'') IS NOT NULL AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id<>NEW.id AND lower(trim(u.email))=lower(trim(NEW.email))) THEN RAISE EXCEPTION 'CONTACT_DUPLICATE'; END IF;
 IF (TG_OP='INSERT' OR NEW.rut IS DISTINCT FROM OLD.rut) AND nullif(NEW.rut,'') IS NOT NULL AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id<>NEW.id AND upper(replace(replace(u.rut,'.',''),'-',''))=upper(replace(replace(NEW.rut,'.',''),'-',''))) THEN RAISE EXCEPTION 'CONTACT_DUPLICATE'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validar_contacto_equipo() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS contacto_equipo_unico ON public.usuarios;
CREATE TRIGGER contacto_equipo_unico BEFORE INSERT OR UPDATE OF telefono_whatsapp,email,rut ON public.usuarios
 FOR EACH ROW EXECUTE FUNCTION public.validar_contacto_equipo();

CREATE OR REPLACE FUNCTION public.actualizar_contacto_equipo_interno(p_empresa text,p_actor text,p_usuario text,p_datos jsonb,p_anterior jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE u public.usuarios; actual jsonb; datos jsonb; email text; phone text; rut text; cuerpo text; suma int:=0; mult int:=2; i int; dv text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_actor AND empresa_id=p_empresa AND rol IN ('admin','supervisor')) THEN RAISE EXCEPTION 'CONTACT_FORBIDDEN'; END IF;
 IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR NOT(p_datos ?& ARRAY['nombre','email','telefono_whatsapp','rut'])
  OR EXISTS(SELECT 1 FROM jsonb_each(p_datos) e WHERE e.key NOT IN ('nombre','email','telefono_whatsapp','rut') OR jsonb_typeof(e.value) NOT IN ('string','null')) THEN RAISE EXCEPTION 'CONTACT_INVALID'; END IF;
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
 IF email IN ('obratrack2627@gmail.com','benja105.achavar@gmail.com') AND email IS DISTINCT FROM lower(trim(u.email)) THEN RAISE EXCEPTION 'CONTACT_RESERVED_EMAIL'; END IF;
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
 -- Reintentar un guardado cuya respuesta se perdió no altera los datos otra vez.
 IF actual=datos THEN RETURN to_jsonb(u); END IF;
 IF p_anterior IS DISTINCT FROM actual THEN RAISE EXCEPTION 'CONTACT_CONFLICT'; END IF;
 -- Solo estas cuatro columnas: ni rol, ni empresa, ni auth_user_id, ni is_dev cambian.
 UPDATE public.usuarios SET nombre=datos->>'nombre',email=datos->>'email',telefono_whatsapp=datos->>'telefono_whatsapp',rut=datos->>'rut' WHERE id=p_usuario RETURNING * INTO u;
 RETURN to_jsonb(u);
END $$;
REVOKE ALL ON FUNCTION public.actualizar_contacto_equipo_interno(text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_contacto_equipo_interno(text,text,text,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.actualizar_contacto_equipo(p_usuario text,p_datos jsonb,p_anterior jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios;
BEGIN
 SELECT * INTO actor FROM public.usuarios WHERE id=auth.uid()::text OR auth_user_id=auth.uid()::text LIMIT 1;
 IF NOT FOUND OR actor.rol NOT IN ('admin','supervisor') THEN RAISE EXCEPTION 'CONTACT_FORBIDDEN'; END IF;
 RETURN public.actualizar_contacto_equipo_interno(actor.empresa_id,actor.id,p_usuario,p_datos,p_anterior);
END $$;
REVOKE ALL ON FUNCTION public.actualizar_contacto_equipo(text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.actualizar_contacto_equipo(text,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.aplicar_lote_whatsapp(
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
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(r) k WHERE k NOT IN ('id','empresa_id','rol','auth_user_id','nombre','email','telefono_whatsapp','rut','_contacto_anterior')) THEN
      RAISE EXCEPTION 'CONTACT_FORBIDDEN';
     END IF;
     PERFORM public.actualizar_contacto_equipo_interno(p_empresa,p_actor,r->>'id',jsonb_build_object('nombre',r->'nombre','email',r->'email','telefono_whatsapp',r->'telefono_whatsapp','rut',r->'rut'),r->'_contacto_anterior');
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
REVOKE ALL ON FUNCTION public.aplicar_lote_whatsapp(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_whatsapp(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
