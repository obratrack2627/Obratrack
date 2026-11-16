BEGIN;
INSERT INTO public.empresas(id,nombre,plan_id) VALUES('qa-reg-guard','QA Registro','gratis');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,telefono_whatsapp,rol) VALUES('qa-reg-guard-owner','qa-reg-guard','QA Registro','qa-reg-guard@example.test','+56981999711','admin');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE result jsonb; i integer; failed boolean:=false; BEGIN
 result:=public.prevalidar_registro_constructor(repeat('a',64),'qa-reg-guard@example.test','56981999711',NULL);
 IF NOT(result->'conflicts' ? 'telefono') OR NOT(result->'conflicts' ? 'email') THEN RAISE EXCEPTION 'REGISTRATION_CONFLICT_NOT_DETECTED';END IF;
 FOR i IN 2..30 LOOP PERFORM public.prevalidar_registro_constructor(repeat('a',64),'unused@example.test','56981999712',NULL);END LOOP;
 BEGIN PERFORM public.prevalidar_registro_constructor(repeat('a',64),'unused@example.test','56981999712',NULL);EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='REGISTRATION_RATE_LIMIT';END;
 IF NOT failed THEN RAISE EXCEPTION 'REGISTRATION_UNBOUNDED';END IF;
END $$;
RESET ROLE;
ROLLBACK;
