BEGIN;
INSERT INTO public.empresas(id,nombre,plan_id) VALUES('qa-usage','QA Usage','pro_ia');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol) VALUES('qa-usage-owner','qa-usage','QA Owner','qa-usage@example.test','admin');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE first_id uuid; second_id uuid; failed boolean:=false; BEGIN
 first_id:=(public.reservar_uso_obrabot('qa-usage-owner','qa-usage','web','generation',100)->>'id')::uuid;
 second_id:=(public.reservar_uso_obrabot('qa-usage-owner','qa-usage','web','generation',100)->>'id')::uuid;
 BEGIN PERFORM public.reservar_uso_obrabot('qa-usage-owner','qa-usage','web','generation',100);EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='AI_QUOTA_BUSY';END;
 IF NOT failed THEN RAISE EXCEPTION 'CONCURRENCY_UNBOUNDED'; END IF;
 PERFORM public.finalizar_uso_obrabot(first_id,10);
 IF NOT EXISTS(SELECT 1 FROM public.obrabot_usage WHERE id=first_id AND actual_units=10 AND finished_at IS NOT NULL) THEN RAISE EXCEPTION 'USAGE_NOT_SETTLED';END IF;
 UPDATE public.obrabot_usage_limits SET daily_units=110 WHERE plan_id='pro_ia';failed:=false;
 BEGIN PERFORM public.reservar_uso_obrabot('qa-usage-owner','qa-usage','web','generation',1);EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='AI_QUOTA_DAILY';END;
 IF NOT failed THEN RAISE EXCEPTION 'DAILY_BUDGET_UNBOUNDED';END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE failed boolean:=false; BEGIN
 BEGIN PERFORM public.finalizar_uso_obrabot(gen_random_uuid(),0);EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'CLIENT_CAN_RESET_USAGE';END IF;
END $$;
ROLLBACK;
