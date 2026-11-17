BEGIN;
INSERT INTO public.empresas(id,nombre,plan_id) VALUES('qa-usage','QA Usage','pro_ia');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol) VALUES('qa-usage-owner','qa-usage','QA Owner','qa-usage@example.test','admin');
INSERT INTO public.empresas(id,nombre,plan_id) VALUES('qa-usage-pro','QA Pro','pro');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol) VALUES
 ('qa-usage-pro-owner','qa-usage-pro','QA Pro Owner','qa-pro@example.test','admin'),
 ('qa-usage-worker','qa-usage','QA Worker','qa-worker@example.test','terreno');
-- Exceed both old daily caps, without adding any current minute or active requests.
INSERT INTO public.obrabot_usage(empresa_id,actor_id,channel,kind,reserved_units,actual_units,created_at,finished_at)
 SELECT 'qa-usage','qa-usage-owner','whatsapp','generation',250000,250000,now()-interval '2 minutes',now()-interval '2 minutes'
 FROM generate_series(1,600);
UPDATE public.obrabot_usage_limits SET daily_requests=1,daily_units=1;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE first_id uuid; second_id uuid; next_id uuid; kind text; failed boolean:=false; BEGIN
 first_id:=(public.reservar_uso_obrabot('qa-usage-owner','qa-usage','web','generation',100)->>'id')::uuid;
 second_id:=(public.reservar_uso_obrabot('qa-usage-owner','qa-usage','web','generation',100)->>'id')::uuid;
 BEGIN PERFORM public.reservar_uso_obrabot('qa-usage-owner','qa-usage','web','generation',100);EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='AI_QUOTA_BUSY';END;
 IF NOT failed THEN RAISE EXCEPTION 'CONCURRENCY_UNBOUNDED'; END IF;
 PERFORM public.finalizar_uso_obrabot(first_id,10);
 IF NOT EXISTS(SELECT 1 FROM public.obrabot_usage WHERE id=first_id AND actual_units=10 AND finished_at IS NOT NULL) THEN RAISE EXCEPTION 'USAGE_NOT_SETTLED';END IF;
 PERFORM public.finalizar_uso_obrabot(second_id,10);
 FOREACH kind IN ARRAY ARRAY['generation','audio','embedding'] LOOP
  next_id:=(public.reservar_uso_obrabot('qa-usage-owner','qa-usage','whatsapp',kind,250000)->>'id')::uuid;
  IF next_id IS NULL THEN RAISE EXCEPTION 'DAILY_LIMIT_STILL_ENFORCED'; END IF;
  PERFORM public.finalizar_uso_obrabot(next_id,250000);
 END LOOP;
 UPDATE public.obrabot_usage_limits SET minute_requests=1 WHERE plan_id='pro_ia';failed:=false;
 BEGIN PERFORM public.reservar_uso_obrabot('qa-usage-owner','qa-usage','web','generation',1);EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='AI_QUOTA_BUSY';END;
 IF NOT failed THEN RAISE EXCEPTION 'COMPANY_RATE_UNBOUNDED';END IF;
 UPDATE public.obrabot_usage_limits SET minute_requests=12 WHERE plan_id='pro_ia';
 UPDATE public.obrabot_usage_limits SET minute_requests=1 WHERE plan_id='global';failed:=false;
 BEGIN PERFORM public.reservar_uso_obrabot('qa-usage-owner','qa-usage','web','generation',1);EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='AI_QUOTA_BUSY';END;
 IF NOT failed THEN RAISE EXCEPTION 'GLOBAL_RATE_UNBOUNDED';END IF;
 UPDATE public.obrabot_usage_limits SET minute_requests=40 WHERE plan_id='global';
 next_id:=(public.reservar_uso_obrabot('qa-usage-pro-owner','qa-usage-pro','web','generation',250000)->>'id')::uuid;
 IF next_id IS NULL THEN RAISE EXCEPTION 'PRO_DAILY_LIMIT_STILL_ENFORCED';END IF;
 PERFORM public.finalizar_uso_obrabot(next_id,250000);
 failed:=false;
 BEGIN PERFORM public.reservar_uso_obrabot('qa-usage-pro-owner','qa-usage-pro','whatsapp','generation',1);EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='AI_USAGE_FORBIDDEN';END;
 IF NOT failed THEN RAISE EXCEPTION 'PRO_CAN_USE_WHATSAPP';END IF;
 failed:=false;
 BEGIN PERFORM public.reservar_uso_obrabot('qa-usage-worker','qa-usage','web','generation',1);EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='AI_USAGE_FORBIDDEN';END;
 IF NOT failed THEN RAISE EXCEPTION 'WORKER_CAN_USE_WEB';END IF;
 failed:=false;
 BEGIN PERFORM public.reservar_uso_obrabot('qa-usage-owner','qa-usage-pro','web','generation',1);EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='AI_USAGE_FORBIDDEN';END;
 IF NOT failed THEN RAISE EXCEPTION 'TENANT_BOUNDARY_BYPASSED';END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE failed boolean:=false; BEGIN
 BEGIN PERFORM public.finalizar_uso_obrabot(gen_random_uuid(),0);EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'CLIENT_CAN_RESET_USAGE';END IF;
 failed:=false;
 BEGIN PERFORM public.reservar_uso_obrabot('qa-usage-owner','qa-usage','web','generation',1);EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'CLIENT_CAN_RESERVE_USAGE';END IF;
END $$;
ROLLBACK;
