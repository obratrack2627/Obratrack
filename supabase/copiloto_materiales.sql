-- Historial del copiloto con presupuestos y consultas de catálogo reales.
ALTER TABLE public.mensajes_chat_proyecto ADD COLUMN IF NOT EXISTS cotizacion_generada jsonb;
ALTER TABLE public.mensajes_chat_proyecto ADD COLUMN IF NOT EXISTS comparacion_materiales jsonb;
-- El borrador no depende de que el último mensaje sea una pregunta de creación.
ALTER TABLE public.whatsapp_mensajes ADD COLUMN IF NOT EXISTS borrador_obra jsonb;
CREATE OR REPLACE FUNCTION public.aplicar_lote_copiloto(
 p_id text,p_empresa text,p_actor text,p_phone text,p_texto text,p_respuesta text,
 p_cotizacion jsonb,p_acciones jsonb,p_changed jsonb,p_deleted jsonb,
 p_adjunto jsonb DEFAULT NULL,p_borrador jsonb DEFAULT NULL,p_aviso jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE m jsonb;
BEGIN
 IF p_aviso IS NOT NULL AND p_aviso<>'null'::jsonb THEN
  m:=public.registrar_mensaje_aviso(jsonb_build_object('p_id',p_id,'p_empresa',p_empresa,'p_actor',p_actor,'p_phone',p_phone,'p_texto',p_texto,'p_respuesta',p_respuesta,'p_cotizacion',p_cotizacion,'p_acciones',p_acciones,'p_changed',p_changed,'p_deleted',p_deleted,'p_adjunto',p_adjunto),p_aviso);
 ELSE
  m:=public.aplicar_lote_whatsapp(p_id,p_empresa,p_actor,p_phone,p_texto,p_respuesta,p_cotizacion,p_acciones,p_changed,p_deleted,p_adjunto);
 END IF;
 UPDATE public.whatsapp_mensajes SET borrador_obra=nullif(p_borrador,'null'::jsonb) WHERE message_id=p_id AND empresa_id=p_empresa AND actor_id=p_actor;
 RETURN m||jsonb_build_object('borrador_obra',nullif(p_borrador,'null'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.aplicar_lote_copiloto(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_copiloto(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
