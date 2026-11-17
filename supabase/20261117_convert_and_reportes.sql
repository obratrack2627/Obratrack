-- Migración aditiva:
-- 1. Asegura valores por defecto NOT NULL de public.proyectos al convertir cotizaciones en obra.
-- 2. Habilita eliminación segura de reportes en public.whatsapp_mensajes para jefatura de la misma empresa.
BEGIN;

CREATE OR REPLACE FUNCTION public.convertir_presupuesto_obra_base(p_id text, p_version text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  b public.presupuestos;
  p public.proyectos;
  r jsonb;
  company text;
  actor text;
  role_name text;
  plan text;
  expected_amount numeric;
  project_defaults jsonb := jsonb_build_object(
    'dias_laborales', ARRAY[1, 2, 3, 4, 5],
    'fechas_no_laborales', ARRAY[]::date[],
    'finalizada_automaticamente', false,
    'recepcion_estado', 'pendiente'
  );
BEGIN
  company := public.get_auth_empresa_id();
  SELECT id, rol INTO actor, role_name
  FROM public.usuarios
  WHERE empresa_id = company AND (id = auth.uid()::text OR auth_user_id = auth.uid()::text)
  LIMIT 1;
  IF actor IS NULL OR role_name NOT IN ('admin', 'supervisor') THEN
    RAISE EXCEPTION 'BUDGET_FORBIDDEN';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(company, 0));
  SELECT * INTO b FROM public.presupuestos WHERE id = p_id AND empresa_id = company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BUDGET_FORBIDDEN';
  END IF;

  IF b.proyecto_id IS NULL THEN
    IF b.updated_at <> (p_version::timestamptz) THEN
      RAISE EXCEPTION 'BUDGET_CONFLICT';
    END IF;
    IF b.estado IN ('rechazada', 'anulada') THEN
      RAISE EXCEPTION 'BUDGET_STATE';
    END IF;

    SELECT plan_id INTO plan FROM public.empresas WHERE id = company;
    IF coalesce(plan, 'gratis') = 'gratis'
      AND EXISTS (SELECT 1 FROM public.proyectos WHERE empresa_id = company AND estado = 'activo')
    THEN
      RAISE EXCEPTION 'PLAN_LIMIT';
    END IF;

    IF jsonb_array_length(coalesce(p_payload->'proyectos', '[]')) <> 1 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD';
    END IF;
    IF jsonb_array_length(coalesce(p_payload->'materiales_proyecto', '[]')) > 300
      OR jsonb_array_length(coalesce(p_payload->'actividades', '[]')) > 300
      OR jsonb_array_length(coalesce(p_payload->'clientes', '[]')) > 1
      OR jsonb_array_length(coalesce(p_payload->'bitacora_entradas', '[]')) <> 1
    THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD';
    END IF;

    SELECT * INTO p
    FROM jsonb_populate_record(
      NULL::public.proyectos,
      project_defaults || (p_payload->'proyectos'->0) || jsonb_build_object('created_at', now(), 'updated_at', now())
    );
    expected_amount := coalesce(nullif(b.cotizacion#>>'{estructura_financiera,precio_total_con_iva}', ''), '0')::numeric;

    IF p.empresa_id IS DISTINCT FROM company
      OR p.estado IS DISTINCT FROM 'activo'
      OR abs(coalesce(p.monto_cotizado, -1) - expected_amount) >= 1
    THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD';
    END IF;

    FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'clientes', '[]')) LOOP
      IF r->>'empresa_id' <> company THEN
        RAISE EXCEPTION 'BUDGET_FORBIDDEN';
      END IF;
      INSERT INTO public.clientes
      SELECT (jsonb_populate_record(NULL::public.clientes, r || jsonb_build_object('created_at', now()))).*;
    END LOOP;

    IF p.cliente_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p.cliente_id AND empresa_id = company)
    THEN
      RAISE EXCEPTION 'BUDGET_FORBIDDEN';
    END IF;

    INSERT INTO public.proyectos SELECT (p).*;

    FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'actividades', '[]')) LOOP
      IF r->>'proyecto_id' <> p.id THEN
        RAISE EXCEPTION 'BUDGET_FORBIDDEN';
      END IF;
      INSERT INTO public.actividades
      SELECT (jsonb_populate_record(NULL::public.actividades, r || jsonb_build_object('created_at', now()))).*;
    END LOOP;

    FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'materiales_proyecto', '[]')) LOOP
      IF r->>'proyecto_id' <> p.id OR (r->>'cantidad')::numeric <= 0 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD';
      END IF;
      INSERT INTO public.materiales_proyecto
      SELECT (jsonb_populate_record(NULL::public.materiales_proyecto, r || jsonb_build_object('created_at', now()))).*;
    END LOOP;

    FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'bitacora_entradas', '[]')) LOOP
      IF r->>'proyecto_id' <> p.id OR r->>'usuario_id' <> actor THEN
        RAISE EXCEPTION 'BUDGET_FORBIDDEN';
      END IF;
      INSERT INTO public.bitacora_entradas
      SELECT (jsonb_populate_record(NULL::public.bitacora_entradas, r || jsonb_build_object('created_at', now()))).*;
    END LOOP;

    UPDATE public.presupuestos SET proyecto_id = p.id, estado = 'aprobada'
    WHERE id = b.id
    RETURNING * INTO b;
  ELSE
    SELECT * INTO p FROM public.proyectos WHERE id = b.proyecto_id AND empresa_id = company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BUDGET_FORBIDDEN';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'presupuesto', to_jsonb(b),
    'proyecto', to_jsonb(p),
    'actividadesCreadas', (SELECT count(*) FROM public.actividades WHERE proyecto_id = p.id),
    'materialesCargados', (SELECT count(*) FROM public.materiales_proyecto WHERE proyecto_id = p.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.convertir_presupuesto_obra_base(text, text, jsonb) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS whatsapp_eliminar_empresa ON public.whatsapp_mensajes;
CREATE POLICY whatsapp_eliminar_empresa ON public.whatsapp_mensajes
  FOR DELETE TO authenticated
  USING (
    empresa_id = public.get_auth_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE (u.id = auth.uid()::text OR u.auth_user_id = auth.uid()::text)
        AND u.empresa_id = whatsapp_mensajes.empresa_id
        AND (u.rol IN ('admin', 'supervisor') OR u.is_dev = true)
    )
  );

GRANT DELETE ON public.whatsapp_mensajes TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
