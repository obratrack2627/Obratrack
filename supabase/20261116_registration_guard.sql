BEGIN;
CREATE TABLE IF NOT EXISTS public.registration_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS registration_attempts_key_time ON public.registration_attempts(client_key,created_at);
CREATE INDEX IF NOT EXISTS registration_attempts_time ON public.registration_attempts(created_at);
ALTER TABLE public.registration_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.registration_attempts TO service_role;
CREATE INDEX IF NOT EXISTS registration_user_phone ON public.usuarios(public.telefono_whatsapp_canonico(telefono_whatsapp));
CREATE INDEX IF NOT EXISTS registration_user_email ON public.usuarios(lower(email));
CREATE INDEX IF NOT EXISTS registration_access_email ON public.usuarios(lower(email_acceso));
CREATE INDEX IF NOT EXISTS registration_user_rut ON public.usuarios(regexp_replace(upper(rut),'[^0-9K]','','g'));
CREATE INDEX IF NOT EXISTS registration_company_rut ON public.empresas(regexp_replace(upper(rut),'[^0-9K]','','g'));
CREATE OR REPLACE FUNCTION public.prevalidar_registro_constructor(p_key text,p_email text,p_phone text,p_rut text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE conflicts jsonb:='[]';
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_key !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'REGISTRATION_FORBIDDEN'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('registration-guard',0));
 IF (SELECT count(*) FROM public.registration_attempts WHERE client_key=p_key AND created_at>now()-interval '1 hour')>=30 OR (SELECT count(*) FROM public.registration_attempts WHERE created_at>now()-interval '1 hour')>=300 THEN RAISE EXCEPTION 'REGISTRATION_RATE_LIMIT'; END IF;
 INSERT INTO public.registration_attempts(client_key) VALUES(p_key);
 IF nullif(p_rut,'') IS NOT NULL AND (EXISTS(SELECT 1 FROM public.usuarios WHERE regexp_replace(upper(rut),'[^0-9K]','','g')=p_rut) OR EXISTS(SELECT 1 FROM public.empresas WHERE regexp_replace(upper(rut),'[^0-9K]','','g')=p_rut)) THEN conflicts:=conflicts||'"rut"'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE public.telefono_whatsapp_canonico(telefono_whatsapp)=p_phone) THEN conflicts:=conflicts||'"telefono"'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE lower(email)=p_email OR lower(email_acceso)=p_email) OR EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=p_email) THEN conflicts:=conflicts||'"email"'::jsonb; END IF;
 RETURN jsonb_build_object('conflicts',conflicts);
END $$;
REVOKE ALL ON FUNCTION public.prevalidar_registro_constructor(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prevalidar_registro_constructor(text,text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.limpiar_datos_operativos() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'MAINTENANCE_FORBIDDEN'; END IF;
 DELETE FROM public.registration_attempts WHERE id IN(SELECT id FROM public.registration_attempts WHERE created_at<now()-interval '2 days' LIMIT 1000);
 DELETE FROM public.obrabot_usage WHERE id IN(SELECT id FROM public.obrabot_usage WHERE created_at<now()-interval '14 days' LIMIT 1000);
 DELETE FROM public.sync_web_batches WHERE (empresa_id,actor_id,id) IN(SELECT empresa_id,actor_id,id FROM public.sync_web_batches WHERE created_at<now()-interval '30 days' LIMIT 1000);
END $$;
REVOKE ALL ON FUNCTION public.limpiar_datos_operativos() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.limpiar_datos_operativos() TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
