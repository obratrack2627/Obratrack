BEGIN;
SET LOCAL search_path=public,extensions;

CREATE OR REPLACE FUNCTION public.obrabot_budget_reference(q jsonb) RETURNS jsonb
 LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT jsonb_build_object(
  'titulo', q->'titulo_proyecto',
  'tipo_obra', q->'tipo_obra',
  'comuna', q->'comuna_region',
  'superficie_m2', q->'metros_cuadrados',
  'duracion_dias', q->'duracion_dias_estimada',
  'resumen', q->'resumen_ejecutivo',
  'partidas', coalesce((
    SELECT jsonb_agg(jsonb_build_object('nombre', a->'nombre', 'dias', a->'dias'))
    FROM (SELECT value a FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q->'actividades_gantt')='array' THEN q->'actividades_gantt' ELSE '[]'::jsonb END) LIMIT 30) s
  ), '[]'::jsonb),
  'materiales', coalesce((
    SELECT jsonb_agg(jsonb_build_object('nombre', m->'nombre', 'unidad', m->'unidad', 'cantidad', m->'cantidad'))
    FROM (SELECT value m FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q->'materiales')='array' THEN q->'materiales' ELSE '[]'::jsonb END) LIMIT 30) s
  ), '[]'::jsonb),
  'mano_de_obra', coalesce((
    SELECT jsonb_agg(jsonb_build_object('rol', l->'rol', 'personas', l->'cantidad_personas', 'dias', l->'dias_estimados'))
    FROM (SELECT value l FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q->'mano_de_obra')='array' THEN q->'mano_de_obra' ELSE '[]'::jsonb END) LIMIT 15) s
  ), '[]'::jsonb)
 );
$$;

CREATE OR REPLACE FUNCTION public.match_obrabot_knowledge_tenant(
 p_empresa_id text,
 query_embedding extensions.vector(1536),
 match_count integer DEFAULT 4
)
 RETURNS TABLE(id uuid, source_type text, source_id text, payload jsonb, similarity double precision)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
 SELECT k.id, k.source_type, k.source_id, k.payload, 1 - (k.embedding <=> query_embedding) AS similarity
 FROM public.obrabot_knowledge k
 WHERE k.embedding IS NOT NULL
   AND p_empresa_id IS NOT NULL
   AND k.empresa_id = p_empresa_id
 ORDER BY k.embedding <=> query_embedding
 LIMIT greatest(1, least(match_count, 5));
$$;

REVOKE ALL ON FUNCTION public.match_obrabot_knowledge_tenant(text, extensions.vector, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_obrabot_knowledge_tenant(text, extensions.vector, integer) TO service_role;
COMMIT;
