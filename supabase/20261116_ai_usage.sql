BEGIN;
CREATE TABLE IF NOT EXISTS public.obrabot_usage_limits(
 plan_id text PRIMARY KEY CHECK(plan_id IN ('pro','pro_ia','global')),
 daily_requests integer NOT NULL CHECK(daily_requests>0),daily_units bigint NOT NULL CHECK(daily_units>0),
 minute_requests integer NOT NULL CHECK(minute_requests>0),concurrent_requests integer NOT NULL CHECK(concurrent_requests>0)
);
INSERT INTO public.obrabot_usage_limits VALUES('pro',50,250000,8,2),('pro_ia',100,500000,12,2),('global',500,2000000,40,10) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.obrabot_usage(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
 actor_id text NOT NULL,channel text NOT NULL CHECK(channel IN ('web','whatsapp')),kind text NOT NULL CHECK(kind IN ('generation','audio','embedding')),
 reserved_units bigint NOT NULL CHECK(reserved_units>0),actual_units bigint CHECK(actual_units>=0),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '90 seconds',finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS obrabot_usage_company_time ON public.obrabot_usage(empresa_id,created_at);
CREATE INDEX IF NOT EXISTS obrabot_usage_time ON public.obrabot_usage(created_at);
ALTER TABLE public.obrabot_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obrabot_usage_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.obrabot_usage,public.obrabot_usage_limits FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.obrabot_usage,public.obrabot_usage_limits TO service_role;

CREATE OR REPLACE FUNCTION public.reservar_uso_obrabot(p_actor text,p_empresa text,p_canal text,p_tipo text,p_unidades bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE actor public.usuarios; plan text; limits public.obrabot_usage_limits; total_limits public.obrabot_usage_limits; today timestamptz; daily_count bigint; daily_units bigint; minute_count bigint; active_count bigint; reservation uuid;
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
 today:=date_trunc('day',now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago';
 SELECT count(*),coalesce(sum(coalesce(actual_units,reserved_units)),0),count(*) FILTER(WHERE created_at>now()-interval '1 minute'),count(*) FILTER(WHERE finished_at IS NULL AND expires_at>now())
 INTO daily_count,daily_units,minute_count,active_count FROM public.obrabot_usage WHERE empresa_id=p_empresa AND created_at>=today;
 IF daily_count>=limits.daily_requests OR daily_units+p_unidades>limits.daily_units THEN RAISE EXCEPTION 'AI_QUOTA_DAILY'; END IF;
 IF minute_count>=limits.minute_requests OR active_count>=limits.concurrent_requests THEN RAISE EXCEPTION 'AI_QUOTA_BUSY'; END IF;
 SELECT count(*),coalesce(sum(coalesce(actual_units,reserved_units)),0),count(*) FILTER(WHERE created_at>now()-interval '1 minute'),count(*) FILTER(WHERE finished_at IS NULL AND expires_at>now())
 INTO daily_count,daily_units,minute_count,active_count FROM public.obrabot_usage WHERE created_at>=today;
 IF daily_count>=total_limits.daily_requests OR daily_units+p_unidades>total_limits.daily_units THEN RAISE EXCEPTION 'AI_QUOTA_DAILY'; END IF;
 IF minute_count>=total_limits.minute_requests OR active_count>=total_limits.concurrent_requests THEN RAISE EXCEPTION 'AI_QUOTA_BUSY'; END IF;
 INSERT INTO public.obrabot_usage(empresa_id,actor_id,channel,kind,reserved_units) VALUES(p_empresa,p_actor,p_canal,p_tipo,p_unidades) RETURNING id INTO reservation;
 RETURN jsonb_build_object('id',reservation);
END $$;
CREATE OR REPLACE FUNCTION public.finalizar_uso_obrabot(p_id uuid,p_unidades bigint DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'AI_USAGE_FORBIDDEN'; END IF;
 IF p_unidades IS NOT NULL AND p_unidades<0 THEN RAISE EXCEPTION 'AI_USAGE_INVALID'; END IF;
 UPDATE public.obrabot_usage SET actual_units=p_unidades,finished_at=now() WHERE id=p_id AND finished_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.reservar_uso_obrabot(text,text,text,text,bigint),public.finalizar_uso_obrabot(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_uso_obrabot(text,text,text,text,bigint),public.finalizar_uso_obrabot(uuid,bigint) TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
