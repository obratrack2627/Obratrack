-- Requiere pg_cron, pg_net y la misma clave privada en Vault y Vercel.
-- La cola HTTP recibe una firma de cinco minutos; nunca la clave privada.
CREATE OR REPLACE FUNCTION public.solicitar_proceso_avisos() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE credential text; issued text; signature text; request_id bigint;
BEGIN
 SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name='obratrack_whatsapp_dispatch' LIMIT 1;
 IF credential IS NULL THEN RETURN NULL; END IF;
 issued:=floor(extract(epoch FROM clock_timestamp()))::bigint::text;
 signature:=encode(extensions.hmac('obratrack-dispatch:'||issued,credential,'sha256'),'hex');
 SELECT net.http_post(url:='https://obratrack-5zwn.vercel.app/api/whatsapp/procesar-envios',headers:=jsonb_build_object('Content-Type','application/json','x-obratrack-dispatch-at',issued,'x-obratrack-dispatch-signature',signature),body:='{}'::jsonb,timeout_milliseconds:=60000) INTO request_id;
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.solicitar_proceso_avisos() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_proceso_avisos() TO service_role;
CREATE OR REPLACE FUNCTION public.despertar_envios_whatsapp() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.solicitar_proceso_avisos(); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.despertar_envios_whatsapp() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS avisos_despertar_worker ON public.whatsapp_avisos;
CREATE TRIGGER avisos_despertar_worker AFTER INSERT ON public.whatsapp_avisos FOR EACH ROW EXECUTE FUNCTION public.despertar_envios_whatsapp();
SELECT cron.schedule('obratrack-whatsapp-dispatch','* * * * *','SELECT public.solicitar_proceso_avisos();');
