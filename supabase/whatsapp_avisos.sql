-- Cola durable de avisos operativos y reportes por empresa. Migración aditiva.
CREATE TABLE IF NOT EXISTS public.whatsapp_avisos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
 actor_id text NOT NULL REFERENCES public.usuarios(id),
 proyecto_id text REFERENCES public.proyectos(id) ON DELETE SET NULL,
 request_key text NOT NULL,
 mensaje text NOT NULL CHECK(char_length(mensaje) BETWEEN 1 AND 800),
 origen text NOT NULL CHECK(origen IN ('whatsapp','plataforma')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(empresa_id,request_key)
);
CREATE TABLE IF NOT EXISTS public.whatsapp_envios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 aviso_id uuid NOT NULL REFERENCES public.whatsapp_avisos(id) ON DELETE CASCADE,
 empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
 destinatario_id text REFERENCES public.usuarios(id) ON DELETE SET NULL,
 nombre text NOT NULL,
 rol text NOT NULL,
 telefono text,
 estado text NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','procesando','aceptado','enviado','entregado','leido','fallido','esperando_plantilla','por_verificar','sin_telefono')),
 intentos integer NOT NULL DEFAULT 0,
 reintentos integer NOT NULL DEFAULT 0,
 forzar_plantilla boolean NOT NULL DEFAULT false,
 meta_message_id text UNIQUE,
 error_codigo text,
 error_detalle text,
 proximo_intento timestamptz NOT NULL DEFAULT now(),
 procesando_desde timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(aviso_id,telefono)
);
ALTER TABLE public.whatsapp_avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_envios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS avisos_lectura ON public.whatsapp_avisos;
CREATE POLICY avisos_lectura ON public.whatsapp_avisos FOR SELECT TO authenticated USING(empresa_id=public.get_auth_empresa_id() AND EXISTS(SELECT 1 FROM public.usuarios WHERE (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND empresa_id=whatsapp_avisos.empresa_id AND rol IN ('admin','supervisor')));
DROP POLICY IF EXISTS envios_lectura ON public.whatsapp_envios;
CREATE POLICY envios_lectura ON public.whatsapp_envios FOR SELECT TO authenticated USING(empresa_id=public.get_auth_empresa_id() AND EXISTS(SELECT 1 FROM public.usuarios WHERE (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND empresa_id=whatsapp_envios.empresa_id AND rol IN ('admin','supervisor')));
GRANT SELECT ON public.whatsapp_avisos,public.whatsapp_envios TO authenticated;
GRANT ALL ON public.whatsapp_avisos,public.whatsapp_envios TO service_role;
CREATE INDEX IF NOT EXISTS envios_pendientes_idx ON public.whatsapp_envios(estado,proximo_intento);
CREATE INDEX IF NOT EXISTS avisos_empresa_fecha_idx ON public.whatsapp_avisos(empresa_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.telefono_whatsapp_canonico(value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN digits~'^[0-9]{8}$' THEN '569'||digits WHEN digits~'^9[0-9]{8}$' THEN '56'||digits WHEN digits~'^[0-9]{10,15}$' THEN digits ELSE NULL END FROM (SELECT regexp_replace(coalesce(value,''),'[^0-9]','','g') AS digits) s;
$$;
CREATE OR REPLACE FUNCTION public.encolar_aviso_equipo(p_empresa text,p_actor text,p_key text,p_mensaje text,p_destinatarios text[],p_proyecto text DEFAULT NULL,p_origen text DEFAULT 'whatsapp') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE campaign public.whatsapp_avisos%ROWTYPE; u public.usuarios%ROWTYPE; phone text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_actor AND empresa_id=p_empresa AND rol IN ('admin','supervisor') AND (auth.role()='service_role' OR id=auth.uid()::text OR auth_user_id=auth.uid()::text)) THEN RAISE EXCEPTION 'Actor no autorizado'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=p_empresa AND plan_id='pro_ia') THEN RAISE EXCEPTION 'El canal requiere Pro IA'; END IF;
 IF p_key IS NULL OR char_length(p_key)>500 OR char_length(trim(p_mensaje)) NOT BETWEEN 1 AND 800 OR coalesce(cardinality(p_destinatarios),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Aviso no válido'; END IF;
 IF p_proyecto IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id=p_proyecto AND empresa_id=p_empresa) THEN RAISE EXCEPTION 'Obra no autorizada'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa||p_key,2));
 SELECT * INTO campaign FROM public.whatsapp_avisos WHERE empresa_id=p_empresa AND request_key=p_key;
 IF FOUND THEN
  IF campaign.actor_id<>p_actor OR campaign.mensaje<>trim(p_mensaje) THEN RAISE EXCEPTION 'Clave de aviso en uso'; END IF;
  RETURN to_jsonb(campaign);
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_destinatarios) d WHERE NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=d AND empresa_id=p_empresa)) THEN RAISE EXCEPTION 'Destinatario de otra empresa'; END IF;
 IF p_proyecto IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(p_destinatarios) d WHERE NOT EXISTS(SELECT 1 FROM public.proyecto_trabajadores WHERE proyecto_id=p_proyecto AND usuario_id=d)) THEN RAISE EXCEPTION 'Destinatario no asignado a la obra'; END IF;
 INSERT INTO public.whatsapp_avisos(empresa_id,actor_id,proyecto_id,request_key,mensaje,origen) VALUES(p_empresa,p_actor,p_proyecto,p_key,trim(p_mensaje),p_origen) RETURNING * INTO campaign;
 FOR u IN SELECT * FROM public.usuarios WHERE id=ANY(p_destinatarios) AND empresa_id=p_empresa ORDER BY id LOOP
  phone:=public.telefono_whatsapp_canonico(u.telefono_whatsapp);
  INSERT INTO public.whatsapp_envios(aviso_id,empresa_id,destinatario_id,nombre,rol,telefono,estado,error_detalle) VALUES(campaign.id,p_empresa,u.id,u.nombre,u.rol,phone,CASE WHEN phone IS NULL THEN 'sin_telefono' ELSE 'pendiente' END,CASE WHEN phone IS NULL THEN 'Falta un teléfono válido en la ficha del trabajador.' ELSE NULL END) ON CONFLICT(aviso_id,telefono) DO NOTHING;
 END LOOP;
 RETURN to_jsonb(campaign);
END $$;
REVOKE ALL ON FUNCTION public.encolar_aviso_equipo(text,text,text,text,text[],text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.encolar_aviso_equipo(text,text,text,text,text[],text,text) TO authenticated,service_role;

ALTER TABLE public.whatsapp_mensajes ADD COLUMN IF NOT EXISTS aviso_id uuid REFERENCES public.whatsapp_avisos(id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION public.registrar_mensaje_aviso(p_mensaje jsonb,p_aviso jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE m jsonb; a jsonb;
BEGIN
 m:=public.aplicar_lote_whatsapp(p_mensaje->>'p_id',p_mensaje->>'p_empresa',p_mensaje->>'p_actor',p_mensaje->>'p_phone',p_mensaje->>'p_texto',p_mensaje->>'p_respuesta',nullif(p_mensaje->'p_cotizacion','null'::jsonb),nullif(p_mensaje->'p_acciones','null'::jsonb),p_mensaje->'p_changed',p_mensaje->'p_deleted',nullif(p_mensaje->'p_adjunto','null'::jsonb));
 a:=public.encolar_aviso_equipo(p_mensaje->>'p_empresa',p_mensaje->>'p_actor','wa:'||(p_mensaje->>'p_id'),p_aviso->>'mensaje',ARRAY(SELECT jsonb_array_elements_text(p_aviso->'destinatarios')),p_aviso->>'proyecto_id','whatsapp');
 UPDATE public.whatsapp_mensajes SET aviso_id=(a->>'id')::uuid WHERE message_id=p_mensaje->>'p_id';
 RETURN m||jsonb_build_object('aviso_id',a->>'id');
END $$;
REVOKE ALL ON FUNCTION public.registrar_mensaje_aviso(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_mensaje_aviso(jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.reservar_envios_whatsapp(p_limite integer DEFAULT 6) RETURNS SETOF public.whatsapp_envios LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 -- Un worker que perdió la conexión pudo haber enviado: no repetir a ciegas.
 UPDATE public.whatsapp_envios SET estado='por_verificar',error_detalle='El proceso no confirmó el resultado. Revisar antes de reenviar.',updated_at=now() WHERE estado='procesando' AND procesando_desde<now()-interval '5 minutes';
 RETURN QUERY WITH chosen AS(SELECT id FROM public.whatsapp_envios WHERE estado IN ('pendiente','esperando_plantilla') AND proximo_intento<=now() ORDER BY proximo_intento,id FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limite,10))) UPDATE public.whatsapp_envios e SET estado='procesando',procesando_desde=now(),intentos=e.intentos+1,meta_message_id=NULL,updated_at=now() FROM chosen c WHERE e.id=c.id RETURNING e.*;
END $$;
REVOKE ALL ON FUNCTION public.reservar_envios_whatsapp(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_envios_whatsapp(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.estado_envio_whatsapp(p_id uuid,p_intento integer,p_meta text,p_estado text,p_codigo text DEFAULT NULL,p_telefono text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE e public.whatsapp_envios%ROWTYPE; target text; current_rank integer; target_rank integer;
BEGIN
 SELECT * INTO e FROM public.whatsapp_envios WHERE (p_id IS NOT NULL AND id=p_id OR p_id IS NULL AND meta_message_id=p_meta) FOR UPDATE;
 IF NOT FOUND OR p_intento IS NOT NULL AND p_intento<>e.intentos OR e.meta_message_id IS NOT NULL AND e.meta_message_id<>p_meta OR p_telefono IS NOT NULL AND public.telefono_whatsapp_canonico(p_telefono) IS DISTINCT FROM e.telefono THEN RETURN false; END IF;
 target:=CASE p_estado WHEN 'accepted' THEN 'aceptado' WHEN 'sent' THEN 'enviado' WHEN 'delivered' THEN 'entregado' WHEN 'read' THEN 'leido' WHEN 'failed' THEN CASE WHEN p_codigo='131047' THEN 'esperando_plantilla' ELSE 'fallido' END ELSE NULL END;
 IF target IS NULL THEN RETURN false; END IF;
 current_rank:=array_position(ARRAY['aceptado','enviado','entregado','leido'],e.estado);target_rank:=array_position(ARRAY['aceptado','enviado','entregado','leido'],target);
 IF current_rank>=3 AND (target_rank IS NULL OR target_rank<current_rank) OR target_rank IS NOT NULL AND target_rank<coalesce(current_rank,0) THEN RETURN true; END IF;
 IF p_estado='accepted' AND e.estado IN ('fallido','esperando_plantilla') THEN RETURN true; END IF;
 UPDATE public.whatsapp_envios SET estado=target,meta_message_id=coalesce(p_meta,meta_message_id),error_codigo=p_codigo,error_detalle=CASE WHEN p_codigo='131047' THEN 'Meta requiere una plantilla para iniciar esta conversación.' WHEN p_codigo='131030' THEN 'Este teléfono no está habilitado como destinatario del número de prueba de Meta.' WHEN p_codigo IN ('131005','10','200') THEN 'Meta denegó el permiso para enviar mensajes. Revisa whatsapp_business_messaging y el acceso de la credencial al número de ObraTrack.' WHEN p_estado='failed' THEN 'Meta informó que el mensaje no pudo entregarse.' ELSE NULL END,forzar_plantilla=forzar_plantilla OR coalesce(p_codigo='131047',false),proximo_intento=CASE WHEN p_codigo='131047' THEN now() ELSE proximo_intento END,updated_at=now() WHERE id=e.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.estado_envio_whatsapp(uuid,integer,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.estado_envio_whatsapp(uuid,integer,text,text,text,text) TO service_role;

CREATE OR REPLACE VIEW public.whatsapp_avisos_resumen WITH(security_invoker=true) AS
 SELECT a.*,coalesce((SELECT jsonb_object_agg(s.estado,s.cantidad) FROM(SELECT estado,count(*) AS cantidad FROM public.whatsapp_envios WHERE aviso_id=a.id GROUP BY estado) s),'{}'::jsonb) AS estados,(SELECT count(*) FROM public.whatsapp_envios WHERE aviso_id=a.id) AS destinatarios FROM public.whatsapp_avisos a;
GRANT SELECT ON public.whatsapp_avisos_resumen TO authenticated,service_role;

-- Listado de reportes de toda la empresa para administración; terreno conserva solo su conversación.
DROP POLICY IF EXISTS whatsapp_lectura_empresa ON public.whatsapp_mensajes;
CREATE POLICY whatsapp_lectura_empresa ON public.whatsapp_mensajes FOR SELECT TO authenticated USING(empresa_id=public.get_auth_empresa_id() AND EXISTS(SELECT 1 FROM public.usuarios u WHERE (u.id=auth.uid()::text OR u.auth_user_id=auth.uid()::text) AND u.empresa_id=whatsapp_mensajes.empresa_id AND (u.id=whatsapp_mensajes.actor_id OR u.rol IN ('admin','supervisor'))));
ALTER TABLE public.whatsapp_mensajes ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'consulta';
ALTER TABLE public.whatsapp_mensajes ADD COLUMN IF NOT EXISTS proyectos_ids text[] NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION public.clasificar_registro_whatsapp() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v jsonb; project text;
BEGIN
 NEW.categoria:=CASE WHEN NEW.aviso_id IS NOT NULL THEN 'aviso' WHEN NEW.acciones->>'tipo'='solicitar_datos_obra' THEN 'datos_obra' WHEN NEW.adjunto IS NOT NULL AND NEW.adjunto<>'null'::jsonb THEN 'fotografia' WHEN NEW.cotizacion IS NOT NULL AND NEW.cotizacion<>'null'::jsonb THEN 'cotizacion' WHEN NEW.acciones IS NOT NULL AND NEW.acciones<>'null'::jsonb THEN 'registro' ELSE 'consulta' END;
 NEW.proyectos_ids:='{}';
 IF NEW.adjunto->>'proyecto_id' IS NOT NULL THEN NEW.proyectos_ids:=array_append(NEW.proyectos_ids,NEW.adjunto->>'proyecto_id'); END IF;
 FOR v IN SELECT jsonb_path_query(NEW.acciones,'$.**.proyecto_id') LOOP
  project:=v#>>'{}';IF project IS NOT NULL AND NOT(project=ANY(NEW.proyectos_ids)) THEN NEW.proyectos_ids:=array_append(NEW.proyectos_ids,project);END IF;
 END LOOP;
 FOR v IN SELECT jsonb_path_query(NEW.acciones,'$.**.link_destino') LOOP
  project:=substring(v#>>'{}' FROM '^/proyectos/([^/]+)/');IF project IS NOT NULL AND NOT(project=ANY(NEW.proyectos_ids)) THEN NEW.proyectos_ids:=array_append(NEW.proyectos_ids,project);END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS registro_whatsapp_clasificar ON public.whatsapp_mensajes;
CREATE TRIGGER registro_whatsapp_clasificar BEFORE INSERT OR UPDATE OF acciones,adjunto,cotizacion,aviso_id ON public.whatsapp_mensajes FOR EACH ROW EXECUTE FUNCTION public.clasificar_registro_whatsapp();
UPDATE public.whatsapp_mensajes SET acciones=acciones;
CREATE INDEX IF NOT EXISTS whatsapp_empresa_categoria_fecha ON public.whatsapp_mensajes(empresa_id,categoria,created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_registro_obras ON public.whatsapp_mensajes USING gin(proyectos_ids);
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.reintentar_aviso_equipo(p_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE total integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.whatsapp_avisos a JOIN public.usuarios u ON u.empresa_id=a.empresa_id WHERE a.id=p_id AND u.rol IN ('admin','supervisor') AND (u.id=auth.uid()::text OR u.auth_user_id=auth.uid()::text)) THEN RAISE EXCEPTION 'Aviso no autorizado'; END IF;
 UPDATE public.whatsapp_envios e SET telefono=public.telefono_whatsapp_canonico(u.telefono_whatsapp),estado='pendiente',reintentos=0,meta_message_id=NULL,error_codigo=NULL,error_detalle=NULL,proximo_intento=now(),updated_at=now() FROM public.usuarios u WHERE e.aviso_id=p_id AND e.estado IN ('fallido','sin_telefono') AND e.destinatario_id=u.id AND e.empresa_id=u.empresa_id AND public.telefono_whatsapp_canonico(u.telefono_whatsapp) IS NOT NULL;
 GET DIAGNOSTICS total=ROW_COUNT; RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.reintentar_aviso_equipo(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reintentar_aviso_equipo(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
