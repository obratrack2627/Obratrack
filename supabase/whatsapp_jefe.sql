-- Migración aditiva: mensajes del canal de gestión y lotes atómicos. No elimina datos.
CREATE TABLE IF NOT EXISTS public.whatsapp_mensajes (
  message_id text PRIMARY KEY,
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  sender_phone text NOT NULL,
  texto text NOT NULL,
  respuesta text NOT NULL,
  cotizacion jsonb,
  acciones jsonb,
  adjunto jsonb,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_mensajes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_lectura_empresa ON public.whatsapp_mensajes;
CREATE POLICY whatsapp_lectura_empresa ON public.whatsapp_mensajes FOR SELECT TO authenticated
 USING (empresa_id = public.get_auth_empresa_id() AND actor_id IN (SELECT id FROM public.usuarios WHERE id=auth.uid()::text OR auth_user_id=auth.uid()::text));
CREATE INDEX IF NOT EXISTS whatsapp_historial_idx ON public.whatsapp_mensajes(actor_id, created_at DESC);

ALTER TABLE public.whatsapp_mensajes ADD COLUMN IF NOT EXISTS adjunto jsonb;
DROP FUNCTION IF EXISTS public.aplicar_lote_whatsapp(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb);
CREATE OR REPLACE FUNCTION public.aplicar_lote_whatsapp(
 p_id text, p_empresa text, p_actor text, p_phone text, p_texto text,
 p_respuesta text, p_cotizacion jsonb, p_acciones jsonb, p_changed jsonb, p_deleted jsonb, p_adjunto jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
 t text; r jsonb; item jsonb; old_empresa text; cols text; updates text; workers jsonb;
 cached public.whatsapp_mensajes%ROWTYPE;
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
   IF t='usuarios' AND (r->>'rol' NOT IN ('terreno','supervisor') OR r->>'auth_user_id' IS NOT NULL) THEN RAISE EXCEPTION 'No se permite modificar cuentas de acceso'; END IF;
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
