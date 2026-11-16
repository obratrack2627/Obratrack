-- After deploying the server that attaches revisions to channel mutations.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.aplicar_lote_copiloto_version_base(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)') IS NULL THEN
  ALTER FUNCTION public.aplicar_lote_copiloto(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) RENAME TO aplicar_lote_copiloto_version_base;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.aplicar_lote_copiloto_version_base(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_copiloto_version_base(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.aplicar_lote_copiloto(p_id text,p_empresa text,p_actor text,p_phone text,p_texto text,p_respuesta text,p_cotizacion jsonb,p_acciones jsonb,p_changed jsonb,p_deleted jsonb,p_adjunto jsonb DEFAULT NULL,p_borrador jsonb DEFAULT NULL,p_aviso jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE t text; r jsonb; actual bigint; expected bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa,0));
 -- The existing wrapper still verifies identity, assignments and role for every replay.
 IF NOT EXISTS(SELECT 1 FROM public.whatsapp_mensajes WHERE message_id=p_id) THEN
  FOR t IN SELECT key FROM jsonb_each(coalesce(p_changed,'{}')||coalesce(p_deleted,'{}')) LOOP
   IF t<>ALL(ARRAY['proyectos','clientes','usuarios','actividades','pagos','materiales_proyecto','bitacora_entradas','imprevistos','reclamos_cambios_obra','documentos_obra','asistencia_obreros','reportes_whatsapp','agenda_eventos']) THEN CONTINUE; END IF;
   FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_changed->t,'[]')||coalesce(p_deleted->t,'[]')) LOOP
    -- Compatibility for legacy service integrations; the serving channel always attaches a revision.
    IF NOT(r ? 'sync_version') THEN CONTINUE; END IF;
    EXECUTE format('SELECT sync_version FROM public.%I WHERE id=$1',t) INTO actual USING r->>'id';
    expected:=(r->>'sync_version')::bigint;
    IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'SYNC_CONFLICT'; END IF;
   END LOOP;
  END LOOP;
 END IF;
 RETURN public.aplicar_lote_copiloto_version_base(p_id,p_empresa,p_actor,p_phone,p_texto,p_respuesta,p_cotizacion,p_acciones,p_changed,p_deleted,p_adjunto,p_borrador,p_aviso);
END $$;
REVOKE ALL ON FUNCTION public.aplicar_lote_copiloto(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_copiloto(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
