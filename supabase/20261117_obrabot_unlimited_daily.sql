-- User policy: unlimited daily usage. Keep identity, plan, rate and concurrency checks.
-- Legacy daily_* columns remain for migration compatibility; they are no longer enforced.
BEGIN;
CREATE INDEX IF NOT EXISTS obrabot_usage_active_expiry
 ON public.obrabot_usage(expires_at,empresa_id) WHERE finished_at IS NULL;

CREATE OR REPLACE FUNCTION public.reservar_uso_obrabot(p_actor text,p_empresa text,p_canal text,p_tipo text,p_unidades bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
 actor public.usuarios;
 plan text;
 limits public.obrabot_usage_limits;
 total_limits public.obrabot_usage_limits;
 minute_count bigint;
 active_count bigint;
 reservation uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'AI_USAGE_FORBIDDEN'; END IF;
 IF p_unidades IS NULL OR p_unidades NOT BETWEEN 1 AND 250000 OR p_canal NOT IN ('web','whatsapp') OR p_tipo NOT IN ('generation','audio','embedding') THEN RAISE EXCEPTION 'AI_USAGE_INVALID'; END IF;
 SELECT * INTO actor FROM public.usuarios WHERE id=p_actor AND empresa_id=p_empresa;
 SELECT plan_id INTO plan FROM public.empresas WHERE id=p_empresa;
 IF actor.id IS NULL OR plan NOT IN ('pro','pro_ia') OR (p_canal='whatsapp' AND plan<>'pro_ia') OR (p_canal='web' AND NOT(actor.rol='admin' OR actor.is_dev)) THEN RAISE EXCEPTION 'AI_USAGE_FORBIDDEN'; END IF;
 SELECT * INTO limits FROM public.obrabot_usage_limits WHERE plan_id=plan;
 SELECT * INTO total_limits FROM public.obrabot_usage_limits WHERE plan_id='global';
 IF limits.plan_id IS NULL OR total_limits.plan_id IS NULL THEN RAISE EXCEPTION 'AI_USAGE_CONFIG'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('obrabot-usage',0));
 SELECT count(*) FILTER(WHERE created_at>now()-interval '1 minute'),
        count(*) FILTER(WHERE finished_at IS NULL AND expires_at>now())
 INTO minute_count,active_count FROM public.obrabot_usage
 WHERE empresa_id=p_empresa AND (created_at>now()-interval '1 minute' OR (finished_at IS NULL AND expires_at>now()));
 IF minute_count>=limits.minute_requests OR active_count>=limits.concurrent_requests THEN RAISE EXCEPTION 'AI_QUOTA_BUSY'; END IF;
 SELECT count(*) FILTER(WHERE created_at>now()-interval '1 minute'),
        count(*) FILTER(WHERE finished_at IS NULL AND expires_at>now())
 INTO minute_count,active_count FROM public.obrabot_usage
 WHERE created_at>now()-interval '1 minute' OR (finished_at IS NULL AND expires_at>now());
 IF minute_count>=total_limits.minute_requests OR active_count>=total_limits.concurrent_requests THEN RAISE EXCEPTION 'AI_QUOTA_BUSY'; END IF;
 INSERT INTO public.obrabot_usage(empresa_id,actor_id,channel,kind,reserved_units)
 VALUES(p_empresa,p_actor,p_canal,p_tipo,p_unidades) RETURNING id INTO reservation;
 RETURN jsonb_build_object('id',reservation);
END $$;
REVOKE ALL ON FUNCTION public.reservar_uso_obrabot(text,text,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_uso_obrabot(text,text,text,text,bigint) TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
