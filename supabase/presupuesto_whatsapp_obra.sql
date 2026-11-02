-- Asociar al mismo presupuesto cuando se confirma su creación por WhatsApp.
CREATE OR REPLACE FUNCTION public.aplicar_lote_copiloto(
 p_id text,p_empresa text,p_actor text,p_phone text,p_texto text,p_respuesta text,
 p_cotizacion jsonb,p_acciones jsonb,p_changed jsonb,p_deleted jsonb,
 p_adjunto jsonb DEFAULT NULL,p_borrador jsonb DEFAULT NULL,p_aviso jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE m jsonb; b public.presupuestos; origin_quote text; origin_project text;
BEGIN
 origin_quote:=p_acciones->>'presupuesto_cotizacion_id'; origin_project:=p_acciones->>'presupuesto_proyecto_id';
 IF origin_quote IS NOT NULL AND origin_project IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa,0));
  SELECT * INTO b FROM public.presupuestos WHERE empresa_id=p_empresa AND cotizacion->>'id'=origin_quote ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR b.estado IN ('rechazada','anulada') THEN RAISE EXCEPTION 'BUDGET_STATE'; END IF;
  IF b.proyecto_id IS NOT NULL AND b.proyecto_id<>origin_project THEN RAISE EXCEPTION 'BUDGET_ALREADY_CONVERTED'; END IF;
 END IF;
 IF p_aviso IS NOT NULL AND p_aviso<>'null'::jsonb THEN
  m:=public.registrar_mensaje_aviso(jsonb_build_object('p_id',p_id,'p_empresa',p_empresa,'p_actor',p_actor,'p_phone',p_phone,'p_texto',p_texto,'p_respuesta',p_respuesta,'p_cotizacion',p_cotizacion,'p_acciones',p_acciones,'p_changed',p_changed,'p_deleted',p_deleted,'p_adjunto',p_adjunto),p_aviso);
 ELSE
  m:=public.aplicar_lote_whatsapp(p_id,p_empresa,p_actor,p_phone,p_texto,p_respuesta,p_cotizacion,p_acciones,p_changed,p_deleted,p_adjunto);
 END IF;
 UPDATE public.whatsapp_mensajes SET borrador_obra=nullif(p_borrador,'null'::jsonb) WHERE message_id=p_id AND empresa_id=p_empresa AND actor_id=p_actor;
 IF origin_quote IS NOT NULL AND origin_project IS NOT NULL THEN
  UPDATE public.presupuestos SET proyecto_id=origin_project,estado='aprobada' WHERE id=b.id;
 END IF;
 RETURN m||jsonb_build_object('borrador_obra',nullif(p_borrador,'null'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.aplicar_lote_copiloto(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_copiloto(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
