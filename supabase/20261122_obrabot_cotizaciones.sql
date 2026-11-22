BEGIN;

CREATE TABLE public.obrabot_cotizaciones (
  id uuid PRIMARY KEY,
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  solicitado_por text REFERENCES public.usuarios(id) ON DELETE SET NULL,
  aprobado_por text REFERENCES public.usuarios(id) ON DELETE SET NULL,
  origen text NOT NULL CHECK (origen IN ('plataforma', 'whatsapp')),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'devuelta')),
  revision integer NOT NULL DEFAULT 1,
  observacion text,
  borrador jsonb NOT NULL CHECK (jsonb_typeof(borrador) = 'object'),
  presupuesto_id text REFERENCES public.presupuestos(id) ON DELETE SET NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.obrabot_cotizaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.obrabot_cotizaciones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.obrabot_cotizaciones TO service_role;
CREATE INDEX obrabot_cotizaciones_pendientes ON public.obrabot_cotizaciones(empresa_id, actualizado_at DESC) WHERE estado = 'pendiente';

CREATE POLICY obrabot_presupuesto_admin ON public.presupuestos AS RESTRICTIVE FOR ALL TO authenticated
  USING (id NOT LIKE 'obrabot-v2:%' OR public.get_auth_rol() = 'admin')
  WITH CHECK (id NOT LIKE 'obrabot-v2:%' OR public.get_auth_rol() = 'admin');
CREATE POLICY obrabot_revision_admin ON public.presupuesto_revisiones AS RESTRICTIVE FOR SELECT TO authenticated
  USING (presupuesto_id NOT LIKE 'obrabot-v2:%' OR public.get_auth_rol() = 'admin');
CREATE POLICY obrabot_mensaje_admin ON public.whatsapp_mensajes AS RESTRICTIVE FOR ALL TO authenticated
  USING (acciones->>'tipo' IS DISTINCT FROM 'obrabot_cotizacion' OR public.get_auth_rol() = 'admin');

CREATE FUNCTION public.obrabot_registrar_cotizacion(
  p_empresa text, p_actor text, p_id uuid, p_origen text, p_borrador jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  administradores text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u JOIN public.empresas e ON e.id = u.empresa_id
    WHERE u.id = p_actor AND e.id = p_empresa AND (u.rol::text = 'admin' OR (p_origen = 'whatsapp' AND u.rol::text = 'supervisor'))
      AND ((p_origen = 'whatsapp' AND e.plan_id = 'pro_ia') OR (p_origen = 'plataforma' AND e.plan_id IN ('pro', 'pro_ia')))
  ) THEN RAISE EXCEPTION 'OBRABOT_FORBIDDEN'; END IF;
  INSERT INTO public.obrabot_cotizaciones (id, empresa_id, solicitado_por, origen, borrador)
  VALUES (p_id, p_empresa, p_actor, p_origen, p_borrador)
  ON CONFLICT (id) DO NOTHING;
  IF FOUND AND p_origen = 'whatsapp' AND EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_actor AND rol::text = 'supervisor') THEN
    administradores := ARRAY(
      SELECT id FROM public.usuarios WHERE empresa_id = p_empresa AND rol::text = 'admin'
      ORDER BY id LIMIT 200
    );
    IF cardinality(administradores) > 0 THEN
      PERFORM public.encolar_aviso_equipo(p_empresa, p_actor, 'obrabot-cotizacion:' || p_id,
        'Hay una cotización de ObraBot pendiente de revisión. Escribe «revisa cotización ' || p_id || '» o abre la bandeja de ObraBot en la web.',
        administradores, NULL, 'whatsapp');
    END IF;
  END IF;
END;
$$;

CREATE FUNCTION public.obrabot_revisar_cotizacion(
  p_empresa text, p_actor text, p_id uuid, p_revision integer, p_decision text, p_cambios jsonb DEFAULT NULL, p_observacion text DEFAULT NULL
) RETURNS public.obrabot_cotizaciones LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  solicitud public.obrabot_cotizaciones;
  documento jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u JOIN public.empresas e ON e.id = u.empresa_id
    WHERE u.id = p_actor AND e.id = p_empresa AND u.rol::text = 'admin' AND e.plan_id IN ('pro', 'pro_ia')
  ) THEN RAISE EXCEPTION 'OBRABOT_FORBIDDEN'; END IF;
  SELECT * INTO solicitud FROM public.obrabot_cotizaciones WHERE id = p_id AND empresa_id = p_empresa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OBRABOT_NOT_FOUND'; END IF;
  IF solicitud.estado = 'aprobada' AND p_decision = 'aprobar' AND solicitud.revision = p_revision THEN RETURN solicitud; END IF;
  IF solicitud.revision <> p_revision OR solicitud.estado <> 'pendiente' THEN RAISE EXCEPTION 'OBRABOT_STALE'; END IF;
  IF p_decision = 'aprobar' THEN
    documento := solicitud.borrador || jsonb_build_object('fecha_creacion', now());
    INSERT INTO public.presupuestos (id, empresa_id, creado_por, origen, estado, cotizacion)
    VALUES ('obrabot-v2:' || p_id, p_empresa, p_actor, solicitud.origen, 'aprobada', documento);
    UPDATE public.obrabot_cotizaciones SET estado = 'aprobada', aprobado_por = p_actor, borrador = documento,
      presupuesto_id = 'obrabot-v2:' || p_id, actualizado_at = now() WHERE id = p_id RETURNING * INTO solicitud;
  ELSIF p_decision = 'corregir' AND p_cambios IS NOT NULL THEN
    UPDATE public.obrabot_cotizaciones SET borrador = p_cambios, revision = revision + 1, actualizado_at = now()
    WHERE id = p_id RETURNING * INTO solicitud;
  ELSIF p_decision = 'devolver' AND length(trim(p_observacion)) BETWEEN 1 AND 1000 THEN
    UPDATE public.obrabot_cotizaciones SET estado = 'devuelta', observacion = trim(p_observacion), actualizado_at = now()
    WHERE id = p_id RETURNING * INTO solicitud;
  ELSE RAISE EXCEPTION 'OBRABOT_REVIEW_INVALID'; END IF;
  RETURN solicitud;
END;
$$;

REVOKE ALL ON FUNCTION public.obrabot_registrar_cotizacion(text, text, uuid, text, jsonb), public.obrabot_revisar_cotizacion(text, text, uuid, integer, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obrabot_registrar_cotizacion(text, text, uuid, text, jsonb), public.obrabot_revisar_cotizacion(text, text, uuid, integer, text, jsonb, text) TO service_role;
COMMIT;
