BEGIN;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
CREATE TABLE IF NOT EXISTS public.obrabot_apu (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
 nombre text NOT NULL CHECK(length(nombre) BETWEEN 1 AND 300),
 categoria text NOT NULL CHECK(categoria IN ('obra_gruesa','terminaciones','instalaciones','otro')),
 unidad text NOT NULL CHECK(unidad IN ('m2','m3','ml','unidad')),
 rendimiento numeric NOT NULL CHECK(rendimiento>0),
 unidad_rendimiento text NOT NULL DEFAULT 'unidad/persona/dia' CHECK(length(unidad_rendimiento)<=80),
 fuente text NOT NULL CHECK(length(fuente) BETWEEN 1 AND 500),
 fecha_referencia date NOT NULL,
 aprobado boolean NOT NULL DEFAULT false,
 revisado_por text NOT NULL REFERENCES public.usuarios(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.obrabot_knowledge (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
 source_type text NOT NULL CHECK(source_type IN ('apu','budget')),
 source_id text NOT NULL,
 content text NOT NULL CHECK(length(content)<=20000),
 payload jsonb NOT NULL,
 content_hash text GENERATED ALWAYS AS (md5(content)) STORED,
 embedding extensions.vector(1536),
 embedding_model text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(empresa_id,source_type,source_id)
);
CREATE INDEX IF NOT EXISTS obrabot_knowledge_tenant ON public.obrabot_knowledge(empresa_id,source_type);
CREATE INDEX IF NOT EXISTS obrabot_knowledge_cosine ON public.obrabot_knowledge USING hnsw(embedding extensions.vector_cosine_ops);
ALTER TABLE public.obrabot_apu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obrabot_knowledge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.obrabot_apu,public.obrabot_knowledge FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.obrabot_apu TO authenticated;
GRANT SELECT ON public.obrabot_knowledge TO authenticated;
GRANT ALL ON public.obrabot_apu,public.obrabot_knowledge TO service_role;
DROP POLICY IF EXISTS obrabot_apu_admin ON public.obrabot_apu;
CREATE POLICY obrabot_apu_admin ON public.obrabot_apu FOR ALL TO authenticated
 USING(empresa_id=public.get_auth_empresa_id() AND public.puede_usar_web())
 WITH CHECK(empresa_id=public.get_auth_empresa_id() AND public.puede_usar_web() AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=revisado_por AND u.empresa_id=obrabot_apu.empresa_id AND (u.id=auth.uid()::text OR u.auth_user_id=auth.uid()::text)));
DROP POLICY IF EXISTS obrabot_knowledge_tenant_read ON public.obrabot_knowledge;
CREATE POLICY obrabot_knowledge_tenant_read ON public.obrabot_knowledge FOR SELECT TO authenticated
 USING(empresa_id=public.get_auth_empresa_id() AND public.puede_usar_web() AND EXISTS(SELECT 1 FROM public.empresas e WHERE e.id=empresa_id AND e.plan_id IN ('pro','pro_ia')));

CREATE OR REPLACE FUNCTION public.obrabot_budget_reference(q jsonb) RETURNS jsonb
 LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT jsonb_build_object('titulo',q->'titulo_proyecto','tipo_obra',q->'tipo_obra','comuna',q->'comuna_region','superficie_m2',q->'metros_cuadrados','duracion_dias',q->'duracion_dias_estimada',
 'partidas',coalesce((SELECT jsonb_agg(jsonb_build_object('nombre',a->'nombre','dias',a->'dias')) FROM (SELECT value a FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q->'actividades_gantt')='array' THEN q->'actividades_gantt' ELSE '[]'::jsonb END) LIMIT 30) s),'[]'::jsonb),
 'materiales',coalesce((SELECT jsonb_agg(jsonb_build_object('nombre',m->'nombre','unidad',m->'unidad','cantidad',m->'cantidad')) FROM (SELECT value m FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q->'materiales')='array' THEN q->'materiales' ELSE '[]'::jsonb END) LIMIT 30) s),'[]'::jsonb));
 $$;
CREATE OR REPLACE FUNCTION public.obrabot_sync_knowledge() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
 DECLARE p jsonb; kind text; company text; source text; approved boolean;
 BEGIN
 kind:=CASE WHEN TG_TABLE_NAME='presupuestos' THEN 'budget' ELSE 'apu' END;
 IF TG_OP='DELETE' THEN DELETE FROM public.obrabot_knowledge WHERE empresa_id=OLD.empresa_id AND source_type=kind AND source_id=OLD.id::text; RETURN OLD; END IF;
 company:=NEW.empresa_id;source:=NEW.id::text;
 IF TG_OP='UPDATE' AND OLD.empresa_id IS DISTINCT FROM NEW.empresa_id THEN DELETE FROM public.obrabot_knowledge WHERE empresa_id=OLD.empresa_id AND source_type=kind AND source_id=source; END IF;
 IF kind='budget' THEN
  approved:=NEW.estado='aprobada';p:=public.obrabot_budget_reference(NEW.cotizacion);
 ELSE
  approved:=NEW.aprobado;p:=jsonb_build_object('nombre',NEW.nombre,'categoria',NEW.categoria,'unidad',NEW.unidad,'rendimiento',NEW.rendimiento,'unidad_rendimiento',NEW.unidad_rendimiento,'fuente',NEW.fuente,'fecha_referencia',NEW.fecha_referencia);
 END IF;
 IF NOT approved THEN DELETE FROM public.obrabot_knowledge WHERE empresa_id=company AND source_type=kind AND source_id=source; RETURN NEW; END IF;
 INSERT INTO public.obrabot_knowledge(empresa_id,source_type,source_id,content,payload) VALUES(company,kind,source,left(p::text,20000),p)
 ON CONFLICT(empresa_id,source_type,source_id) DO UPDATE SET content=excluded.content,payload=excluded.payload,embedding=NULL,embedding_model=NULL,updated_at=now()
 WHERE obrabot_knowledge.content IS DISTINCT FROM excluded.content;
 RETURN NEW;
 END $$;
REVOKE ALL ON FUNCTION public.obrabot_sync_knowledge() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS obrabot_budget_knowledge ON public.presupuestos;
CREATE TRIGGER obrabot_budget_knowledge AFTER INSERT OR UPDATE OR DELETE ON public.presupuestos FOR EACH ROW EXECUTE FUNCTION public.obrabot_sync_knowledge();
DROP TRIGGER IF EXISTS obrabot_apu_knowledge ON public.obrabot_apu;
CREATE TRIGGER obrabot_apu_knowledge AFTER INSERT OR UPDATE OR DELETE ON public.obrabot_apu FOR EACH ROW EXECUTE FUNCTION public.obrabot_sync_knowledge();
INSERT INTO public.obrabot_knowledge(empresa_id,source_type,source_id,content,payload)
 SELECT empresa_id,'budget',id,left(public.obrabot_budget_reference(cotizacion)::text,20000),public.obrabot_budget_reference(cotizacion) FROM public.presupuestos WHERE estado='aprobada'
 ON CONFLICT(empresa_id,source_type,source_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.match_obrabot_knowledge(query_embedding extensions.vector(1536),match_count integer DEFAULT 4)
 RETURNS TABLE(id uuid,source_type text,source_id text,payload jsonb,similarity double precision)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,extensions AS $$
 SELECT k.id,k.source_type,k.source_id,k.payload,1-(k.embedding <=> query_embedding) FROM public.obrabot_knowledge k
 WHERE k.embedding IS NOT NULL AND k.empresa_id=public.get_auth_empresa_id()
 ORDER BY k.embedding <=> query_embedding LIMIT greatest(1,least(match_count,5));
 $$;
REVOKE ALL ON FUNCTION public.match_obrabot_knowledge(extensions.vector,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.match_obrabot_knowledge(extensions.vector,integer) TO authenticated;
COMMIT;
