BEGIN;
CREATE TABLE IF NOT EXISTS public.obrabot_chat_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
 usuario_id text NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,version integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(empresa_id,usuario_id)
);
CREATE TABLE IF NOT EXISTS public.obrabot_chat_messages (
 session_id uuid NOT NULL REFERENCES public.obrabot_chat_sessions(id) ON DELETE CASCADE,
 message_id text NOT NULL CHECK(length(message_id) BETWEEN 1 AND 200),payload jsonb NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,message_id),
 CHECK(jsonb_typeof(payload)='object' AND payload->>'remitente' IN ('usuario','agente') AND length(payload->>'texto') BETWEEN 1 AND 12000 AND octet_length(payload::text)<=64000)
);
CREATE INDEX IF NOT EXISTS obrabot_chat_order ON public.obrabot_chat_messages(session_id,sent_at,message_id);
ALTER TABLE public.obrabot_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obrabot_chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.obrabot_chat_sessions,public.obrabot_chat_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.obrabot_chat_sessions,public.obrabot_chat_messages TO authenticated;
GRANT ALL ON public.obrabot_chat_sessions,public.obrabot_chat_messages TO service_role;
DROP POLICY IF EXISTS obrabot_chat_owner ON public.obrabot_chat_sessions;
CREATE POLICY obrabot_chat_owner ON public.obrabot_chat_sessions FOR SELECT TO authenticated
 USING(empresa_id=public.get_auth_empresa_id() AND public.puede_usar_web() AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=usuario_id AND u.empresa_id=obrabot_chat_sessions.empresa_id AND (u.id=auth.uid()::text OR u.auth_user_id=auth.uid()::text)));
DROP POLICY IF EXISTS obrabot_message_owner ON public.obrabot_chat_messages;
CREATE POLICY obrabot_message_owner ON public.obrabot_chat_messages FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.obrabot_chat_sessions s WHERE s.id=session_id));
CREATE OR REPLACE FUNCTION public.sync_obrabot_chat(p_version integer DEFAULT NULL,p_messages jsonb DEFAULT '[]',p_reset boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 DECLARE actor public.usuarios%ROWTYPE;s public.obrabot_chat_sessions%ROWTYPE;m jsonb;pos bigint:=0;stamp timestamptz;conflict boolean:=false;result jsonb;
 BEGIN
 IF NOT public.puede_usar_web() THEN RAISE EXCEPTION 'CHAT_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.usuarios WHERE (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND empresa_id=public.get_auth_empresa_id() LIMIT 1;
 IF actor.id IS NULL THEN RAISE EXCEPTION 'CHAT_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_messages)<>'array' OR jsonb_array_length(p_messages)>100 OR octet_length(p_messages::text)>1000000 THEN RAISE EXCEPTION 'CHAT_INVALID'; END IF;
 INSERT INTO public.obrabot_chat_sessions(empresa_id,usuario_id) VALUES(actor.empresa_id,actor.id) ON CONFLICT(empresa_id,usuario_id) DO NOTHING;
 SELECT * INTO s FROM public.obrabot_chat_sessions WHERE empresa_id=actor.empresa_id AND usuario_id=actor.id FOR UPDATE;
 IF p_version IS NOT NULL AND p_version<>s.version THEN conflict:=true;
 ELSIF p_reset AND p_version IS NOT NULL THEN
  DELETE FROM public.obrabot_chat_messages WHERE session_id=s.id;
  UPDATE public.obrabot_chat_sessions SET version=version+1,updated_at=clock_timestamp() WHERE id=s.id RETURNING * INTO s;
 ELSIF p_version IS NOT NULL THEN
  FOR m IN SELECT value FROM jsonb_array_elements(p_messages) LOOP
   pos:=pos+1;
   IF jsonb_typeof(m)<>'object' OR m->>'id' IS NULL OR coalesce(m->>'remitente','') NOT IN ('usuario','agente') OR m->>'texto' IS NULL OR length(m->>'texto') NOT BETWEEN 1 AND 12000 OR coalesce(m->>'obra_contexto_id','')<>'' THEN RAISE EXCEPTION 'CHAT_INVALID'; END IF;
   BEGIN stamp:=(m->>'created_at')::timestamptz; EXCEPTION WHEN OTHERS THEN stamp:=NULL; END;
   IF stamp IS NULL OR stamp>now()+interval '5 minutes' OR stamp<'2000-01-01'::timestamptz THEN stamp:=clock_timestamp()+pos*interval '1 microsecond'; END IF;
   INSERT INTO public.obrabot_chat_messages(session_id,message_id,payload,sent_at) VALUES(s.id,m->>'id',m,stamp) ON CONFLICT(session_id,message_id) DO NOTHING;
  END LOOP;
  UPDATE public.obrabot_chat_sessions SET updated_at=clock_timestamp() WHERE id=s.id;
 END IF;
 SELECT coalesce(jsonb_agg(payload||jsonb_build_object('created_at',sent_at) ORDER BY sent_at,message_id),'[]') INTO result FROM (SELECT payload,sent_at,message_id FROM public.obrabot_chat_messages WHERE session_id=s.id ORDER BY sent_at DESC,message_id DESC LIMIT 100) recent;
 RETURN jsonb_build_object('session_id',s.id,'version',s.version,'conflict',conflict,'messages',result);
 END $$;
REVOKE ALL ON FUNCTION public.sync_obrabot_chat(integer,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sync_obrabot_chat(integer,jsonb,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.read_obrabot_chat_page(p_before timestamptz,p_before_id text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 WITH recent AS (
  SELECT m.* FROM public.obrabot_chat_messages m JOIN public.obrabot_chat_sessions s ON s.id=m.session_id
  WHERE (m.sent_at,m.message_id)<(p_before,p_before_id)
  ORDER BY m.sent_at DESC,m.message_id DESC LIMIT 101
 ), page AS (SELECT * FROM recent ORDER BY sent_at DESC,message_id DESC LIMIT 100)
 SELECT jsonb_build_object('version',coalesce((SELECT version FROM public.obrabot_chat_sessions LIMIT 1),0),'has_more',(SELECT count(*)>100 FROM recent),'messages',coalesce(jsonb_agg(payload||jsonb_build_object('created_at',sent_at) ORDER BY sent_at,message_id),'[]')) FROM page;
 $$;
REVOKE ALL ON FUNCTION public.read_obrabot_chat_page(timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_obrabot_chat_page(timestamptz,text) TO authenticated;
COMMIT;
