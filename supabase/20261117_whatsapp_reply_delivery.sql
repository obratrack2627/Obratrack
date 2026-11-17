BEGIN;
CREATE TABLE IF NOT EXISTS public.whatsapp_respuestas_envios(
 delivery_key text PRIMARY KEY,
 empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
 actor_id text NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
 estado text NOT NULL CHECK(estado IN ('sending','accepted','failed','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_respuestas_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_respuestas_envios FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.whatsapp_respuestas_envios TO service_role;
CREATE OR REPLACE FUNCTION public.whatsapp_reservar_respuesta(p_key text,p_empresa text,p_actor text,p_inbound text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE claimed boolean:=false; expired boolean:=false;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_key !~ '^[a-f0-9]{64}$' OR NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_actor AND empresa_id=p_empresa) THEN RAISE EXCEPTION 'DELIVERY_FORBIDDEN';END IF;
 IF p_inbound IS NOT NULL THEN
  SELECT created_at<now()-interval '15 minutes' INTO expired FROM public.whatsapp_mensajes WHERE message_id=p_inbound AND empresa_id=p_empresa AND actor_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_SOURCE_FORBIDDEN';END IF;
 END IF;
 INSERT INTO public.whatsapp_respuestas_envios(delivery_key,empresa_id,actor_id,estado) VALUES(p_key,p_empresa,p_actor,CASE WHEN expired THEN 'expired' ELSE 'sending' END)
 ON CONFLICT(delivery_key) DO UPDATE SET estado='sending',updated_at=now()
 WHERE whatsapp_respuestas_envios.estado='failed' AND whatsapp_respuestas_envios.empresa_id=p_empresa AND whatsapp_respuestas_envios.actor_id=p_actor AND NOT expired
 RETURNING estado='sending' INTO claimed;
 RETURN jsonb_build_object('claimed',coalesce(claimed,false),'accepted',coalesce((SELECT estado='accepted' FROM public.whatsapp_respuestas_envios WHERE delivery_key=p_key AND empresa_id=p_empresa AND actor_id=p_actor),false));
END $$;
CREATE OR REPLACE FUNCTION public.whatsapp_finalizar_respuesta(p_key text,p_estado text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_estado NOT IN ('accepted','failed') THEN RAISE EXCEPTION 'DELIVERY_FORBIDDEN';END IF;
 UPDATE public.whatsapp_respuestas_envios SET estado=p_estado,updated_at=now() WHERE delivery_key=p_key AND estado='sending';
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_reservar_respuesta(text,text,text,text),public.whatsapp_finalizar_respuesta(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_reservar_respuesta(text,text,text,text),public.whatsapp_finalizar_respuesta(text,text) TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
