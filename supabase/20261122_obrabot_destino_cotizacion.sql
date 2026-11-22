BEGIN;

CREATE TABLE public.obrabot_destinos_cotizacion (
  cotizacion_id uuid PRIMARY KEY REFERENCES public.obrabot_cotizaciones(id) ON DELETE CASCADE,
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  actor_id text REFERENCES public.usuarios(id) ON DELETE SET NULL,
  proyecto_id text NOT NULL,
  modo text NOT NULL CHECK (modo IN ('crear', 'principal', 'adjuntar', 'reemplazar', 'adicional')),
  monto_anterior numeric NOT NULL,
  monto_nuevo numeric NOT NULL,
  principal_anterior numeric,
  grupo_reemplazado text,
  resultado jsonb NOT NULL,
  creado_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.obrabot_destinos_cotizacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.obrabot_destinos_cotizacion FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.obrabot_destinos_cotizacion TO service_role;

CREATE TABLE public.obrabot_destino_conversacion (
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  canal text NOT NULL CHECK (canal IN ('plataforma', 'whatsapp')),
  estado jsonb NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, actor_id, canal)
);
ALTER TABLE public.obrabot_destino_conversacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.obrabot_destino_conversacion FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.obrabot_destino_conversacion TO service_role;

ALTER TABLE public.proyectos ADD COLUMN programacion_pendiente boolean DEFAULT false;
CREATE FUNCTION public.obrabot_confirmar_programacion() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.programacion_pendiente := false;
  RETURN NEW;
END;
$$;
CREATE TRIGGER obrabot_confirmar_programacion BEFORE UPDATE OF fecha_inicio, fecha_termino_estimada, estado ON public.proyectos
  FOR EACH ROW WHEN (OLD.programacion_pendiente AND (
    NEW.fecha_inicio IS DISTINCT FROM OLD.fecha_inicio OR NEW.fecha_termino_estimada IS DISTINCT FROM OLD.fecha_termino_estimada
    OR (NEW.estado = 'activo' AND OLD.estado <> 'activo')
  )) EXECUTE FUNCTION public.obrabot_confirmar_programacion();

ALTER TABLE public.presupuesto_grupos ADD COLUMN obrabot_reemplazado boolean NOT NULL DEFAULT false;
CREATE POLICY obrabot_grupo_admin ON public.presupuesto_grupos AS RESTRICTIVE FOR SELECT TO authenticated
  USING (id NOT LIKE 'obrabot-v2:%' OR public.get_auth_rol() = 'admin');

CREATE FUNCTION public.obrabot_destino_referencia(p_texto text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT trim(regexp_replace(translate(lower(p_texto), 'áéíóúüñ', 'aeiouun'), '[[:space:]]+', ' ', 'g'));
$$;

-- Preserve the approved document and keep an archived principal from being applied a second time.
CREATE FUNCTION public.obrabot_proteger_destino_presupuesto() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.proyecto_id IS NULL AND OLD.proyecto_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.proyectos WHERE id = OLD.proyecto_id)) THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'presupuestos' THEN
    IF OLD.id NOT LIKE 'obrabot-v2:%' AND NOT EXISTS (
      SELECT 1 FROM public.presupuesto_grupos WHERE id = OLD.grupo_id AND obrabot_reemplazado
    ) THEN RETURN NEW; END IF;
    IF NEW.cotizacion IS DISTINCT FROM OLD.cotizacion OR NEW.estado IS DISTINCT FROM OLD.estado THEN
      RAISE EXCEPTION 'OBRABOT_DESTINATION_LOCKED';
    END IF;
    IF (NEW.proyecto_id IS DISTINCT FROM OLD.proyecto_id OR NEW.grupo_id IS DISTINCT FROM OLD.grupo_id)
      AND current_setting('obratrack.destino_cotizacion', true) IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'OBRABOT_DESTINATION_LOCKED';
    END IF;
  ELSIF OLD.obrabot_reemplazado AND
    (NEW.tipo, NEW.aplicado, NEW.monto_aplicado, NEW.obrabot_reemplazado, NEW.proyecto_id)
    IS DISTINCT FROM (OLD.tipo, OLD.aplicado, OLD.monto_aplicado, OLD.obrabot_reemplazado, OLD.proyecto_id) THEN
    RAISE EXCEPTION 'OBRABOT_DESTINATION_LOCKED';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER obrabot_destino_presupuesto_guard BEFORE UPDATE ON public.presupuestos FOR EACH ROW
  WHEN (OLD.id LIKE 'obrabot-v2:%' OR OLD.grupo_id IS NOT NULL) EXECUTE FUNCTION public.obrabot_proteger_destino_presupuesto();
CREATE TRIGGER obrabot_destino_grupo_guard BEFORE UPDATE ON public.presupuesto_grupos FOR EACH ROW
  WHEN (OLD.obrabot_reemplazado) EXECUTE FUNCTION public.obrabot_proteger_destino_presupuesto();

CREATE FUNCTION public.obrabot_equipo_cotizacion(p_empresa text, p_actor text, p_proyecto text, p_equipo jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  persona text;
  opciones text[];
  integrantes text[] := '{}';
  pendientes text[] := '{}';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa, 0));
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u JOIN public.empresas e ON e.id = u.empresa_id
     WHERE u.id = p_actor AND e.id = p_empresa AND u.rol = 'admin' AND e.plan_id = 'pro_ia'
     FOR SHARE OF u, e) THEN RAISE EXCEPTION 'OBRABOT_FORBIDDEN'; END IF;
  PERFORM 1 FROM public.proyectos WHERE id = p_proyecto AND empresa_id = p_empresa AND estado <> 'cancelada' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OBRABOT_PROJECT_MISSING'; END IF;
  IF jsonb_typeof(p_equipo) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OBRABOT_TEAM_INVALID'; END IF;
  IF jsonb_array_length(p_equipo) > 20 THEN RAISE EXCEPTION 'OBRABOT_TEAM_INVALID'; END IF;
  FOR persona IN SELECT DISTINCT trim(value) FROM jsonb_array_elements_text(p_equipo) LOOP
    IF coalesce(length(persona), 0) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'OBRABOT_TEAM_INVALID'; END IF;
    SELECT ARRAY(SELECT u.id FROM public.usuarios u WHERE u.empresa_id = p_empresa AND u.rol IN ('terreno', 'supervisor')
      AND (u.id = persona OR public.obrabot_destino_referencia(u.nombre) = public.obrabot_destino_referencia(persona))
      ORDER BY u.id LIMIT 2 FOR SHARE) INTO opciones;
    IF cardinality(opciones) = 1 THEN integrantes := array_append(integrantes, opciones[1]);
    ELSE pendientes := array_append(pendientes, persona); END IF;
  END LOOP;
  INSERT INTO public.proyecto_trabajadores (proyecto_id, usuario_id)
    SELECT p_proyecto, usuario FROM unnest(integrantes) AS usuario ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('equipo', ARRAY(SELECT u.nombre FROM public.usuarios u WHERE u.id = ANY(integrantes) ORDER BY u.nombre),
    'equipo_pendiente', pendientes);
END;
$$;
REVOKE ALL ON FUNCTION public.obrabot_equipo_cotizacion(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obrabot_equipo_cotizacion(text, text, text, jsonb) TO service_role;

CREATE FUNCTION public.obrabot_destinar_cotizacion(
  p_empresa text, p_actor text, p_canal text, p_id uuid, p_modo text, p_datos jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  cot public.obrabot_cotizaciones;
  documento public.presupuestos;
  previo public.obrabot_destinos_cotizacion;
  obra public.proyectos;
  cabecera public.presupuesto_grupos;
  cliente_id_elegido text;
  referencias text[];
  nombre text;
  direccion text;
  cliente text;
  telefono_cliente text;
  correo text;
  monto numeric;
  anterior numeric := 0;
  siguiente numeric;
  adicionales numeric := 0;
  principal numeric;
  tiene_presupuesto boolean := false;
  grupo text;
  resultado jsonb;
  hoy date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa, 0));
  PERFORM 1 FROM public.usuarios u JOIN public.empresas e ON e.id = u.empresa_id
    WHERE u.id = p_actor AND e.id = p_empresa AND u.rol = 'admin' AND e.plan_id = 'pro_ia'
      AND p_canal IN ('plataforma', 'whatsapp')
    FOR SHARE OF u, e;
  IF NOT FOUND THEN RAISE EXCEPTION 'OBRABOT_FORBIDDEN'; END IF;
  IF p_modo IS NULL OR p_modo NOT IN ('estado', 'vista', 'crear', 'principal', 'adjuntar', 'reemplazar', 'adicional')
    OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'OBRABOT_DESTINATION_INVALID'; END IF;

  SELECT * INTO cot FROM public.obrabot_cotizaciones WHERE id = p_id AND empresa_id = p_empresa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OBRABOT_NOT_FOUND'; END IF;
  IF cot.estado <> 'aprobada' THEN RAISE EXCEPTION 'OBRABOT_NOT_APPROVED'; END IF;
  SELECT * INTO previo FROM public.obrabot_destinos_cotizacion WHERE cotizacion_id = p_id AND empresa_id = p_empresa;
  IF FOUND THEN
    IF p_modo IN ('estado', 'vista') OR (p_modo = previo.modo AND
      (p_modo = 'crear' OR previo.proyecto_id = p_datos->>'proyecto')) THEN
      RETURN previo.resultado || jsonb_build_object('ya_vinculada', true);
    END IF;
    RAISE EXCEPTION 'OBRABOT_ALREADY_LINKED';
  END IF;

  monto := (cot.borrador #>> '{estructura_financiera,precio_total_con_iva}')::numeric;
  IF monto IS NULL OR monto <= 0 OR monto > 9999999999.99 OR round(monto, 2) <> monto THEN
    RAISE EXCEPTION 'OBRABOT_AMOUNT_INVALID';
  END IF;
  SELECT * INTO documento FROM public.presupuestos WHERE id = cot.presupuesto_id AND empresa_id = p_empresa FOR UPDATE;
  IF NOT FOUND OR documento.estado <> 'aprobada' OR documento.cotizacion IS DISTINCT FROM cot.borrador
    OR documento.grupo_id IS NOT NULL OR documento.proyecto_id IS NOT NULL THEN
    RAISE EXCEPTION 'OBRABOT_DESTINATION_LOCKED';
  END IF;
  IF p_modo = 'estado' THEN
    RETURN jsonb_build_object('cotizacion', cot.borrador->>'titulo_proyecto', 'monto_cotizacion', monto);
  END IF;

  IF p_modo = 'crear' THEN
    nombre := coalesce(nullif(trim(p_datos->>'nombre'), ''), cot.borrador->>'titulo_proyecto');
    direccion := trim(p_datos->>'direccion');
    cliente := trim(p_datos->>'cliente');
    IF nombre IS NULL OR length(nombre) NOT BETWEEN 1 AND 150 OR coalesce(length(direccion), 0) NOT BETWEEN 1 AND 300
      OR coalesce(length(cliente), 0) NOT BETWEEN 1 AND 150 THEN
      RAISE EXCEPTION 'OBRABOT_PROJECT_REQUIRED';
    END IF;
    SELECT ARRAY(SELECT c.id FROM public.clientes c WHERE c.empresa_id = p_empresa
      AND (c.id = cliente OR public.obrabot_destino_referencia(c.nombre) = public.obrabot_destino_referencia(cliente))
      ORDER BY c.id LIMIT 2 FOR SHARE) INTO referencias;
    IF cardinality(referencias) > 1 THEN RAISE EXCEPTION 'OBRABOT_CLIENT_AMBIGUOUS'; END IF;
    cliente_id_elegido := referencias[1];
    IF cliente_id_elegido IS NULL THEN
      telefono_cliente := public.telefono_whatsapp_canonico(p_datos->>'telefono');
      correo := lower(trim(p_datos->>'correo'));
      IF telefono_cliente IS NULL OR coalesce(length(correo), 0) NOT BETWEEN 3 AND 100
        OR correo !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
        RAISE EXCEPTION 'OBRABOT_CLIENT_REQUIRED';
      END IF;
      IF EXISTS (SELECT 1 FROM public.clientes c WHERE c.empresa_id = p_empresa
        AND (lower(trim(c.email)) = correo OR public.telefono_whatsapp_canonico(c.telefono) = telefono_cliente)) THEN
        RAISE EXCEPTION 'OBRABOT_CLIENT_CONTACT_EXISTS';
      END IF;
      INSERT INTO public.clientes (empresa_id, nombre, telefono, email)
      VALUES (p_empresa, cliente, '+' || telefono_cliente, correo) RETURNING id INTO cliente_id_elegido;
    END IF;

    INSERT INTO public.proyectos (empresa_id, cliente_id, nombre, direccion, fecha_inicio, fecha_termino_estimada, estado, monto_cotizado, programacion_pendiente)
    VALUES (p_empresa, cliente_id_elegido, nombre, direccion, hoy, hoy, 'pendiente', monto, true) RETURNING * INTO obra;
    resultado := public.obrabot_equipo_cotizacion(p_empresa, p_actor, obra.id, coalesce(p_datos->'equipo', '[]'::jsonb));
    siguiente := monto;
  ELSE
    SELECT * INTO obra FROM public.proyectos WHERE empresa_id = p_empresa AND id = p_datos->>'proyecto' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OBRABOT_PROJECT_MISSING'; END IF;
    IF obra.estado = 'cancelada' THEN RAISE EXCEPTION 'OBRABOT_PROJECT_CLOSED'; END IF;
    SELECT * INTO cabecera FROM public.presupuesto_grupos
      WHERE empresa_id = p_empresa AND proyecto_id = obra.id AND tipo = 'principal' FOR UPDATE;
    SELECT coalesce(sum(monto_aplicado), 0) INTO adicionales FROM public.presupuesto_grupos
      WHERE empresa_id = p_empresa AND proyecto_id = obra.id AND tipo = 'complementario' AND aplicado;
    anterior := obra.monto_cotizado;
    tiene_presupuesto := anterior <> 0 OR EXISTS (
      SELECT 1 FROM public.presupuesto_grupos WHERE empresa_id = p_empresa AND proyecto_id = obra.id AND aplicado);
    -- The ordinary project editor can adjust the total. Preserve money already applied as additional.
    principal := anterior - adicionales;
    IF p_modo = 'vista' THEN
      RETURN jsonb_build_object('proyecto_id', obra.id, 'obra', obra.nombre, 'version', obra.sync_version::text,
        'cabecera', cabecera.id, 'monto_cotizacion', monto, 'monto_anterior', anterior, 'tiene_presupuesto', tiene_presupuesto,
        'monto_reemplazo', CASE WHEN principal >= 0 THEN adicionales + monto END, 'monto_adicional', anterior + monto);
    END IF;
    IF p_datos->>'version' IS DISTINCT FROM obra.sync_version::text OR p_datos->>'cabecera' IS DISTINCT FROM cabecera.id THEN
      RAISE EXCEPTION 'OBRABOT_DESTINATION_STALE';
    END IF;
    IF (p_modo = 'principal') = tiene_presupuesto THEN RAISE EXCEPTION 'OBRABOT_DESTINATION_CHOICE'; END IF;
    CASE p_modo
      WHEN 'adjuntar' THEN siguiente := anterior;
      WHEN 'principal' THEN siguiente := monto;
      WHEN 'adicional' THEN siguiente := anterior + monto;
      WHEN 'reemplazar' THEN
        IF principal < 0 THEN RAISE EXCEPTION 'OBRABOT_AMOUNT_INVALID'; END IF;
        siguiente := adicionales + monto;
    END CASE;
    IF siguiente < 0 OR siguiente > 9999999999.99 THEN RAISE EXCEPTION 'OBRABOT_AMOUNT_INVALID'; END IF;
    IF p_modo IN ('reemplazar', 'principal') AND cabecera.id IS NOT NULL THEN
      UPDATE public.presupuesto_grupos SET tipo = 'complementario', aplicado = false, obrabot_reemplazado = true
      WHERE id = cabecera.id AND empresa_id = p_empresa;
    END IF;
    IF p_modo <> 'adjuntar' THEN
      UPDATE public.proyectos SET monto_cotizado = siguiente, updated_at = now() WHERE id = obra.id;
    END IF;
  END IF;

  IF p_modo <> 'adjuntar' THEN
    grupo := documento.id;
    INSERT INTO public.presupuesto_grupos (id, empresa_id, proyecto_id, nombre, tipo, seleccionado_id, aplicado, monto_aplicado)
    VALUES (grupo, p_empresa, obra.id, cot.borrador->>'titulo_proyecto',
      CASE WHEN p_modo = 'adicional' THEN 'complementario' ELSE 'principal' END, documento.id, true, monto);
  END IF;
  PERFORM set_config('obratrack.destino_cotizacion', documento.id, true);
  UPDATE public.presupuestos SET proyecto_id = obra.id, grupo_id = grupo, updated_at = now() WHERE id = documento.id;
  PERFORM set_config('obratrack.destino_cotizacion', '', true);
  resultado := jsonb_build_object('proyecto_id', obra.id, 'obra', obra.nombre, 'modo', p_modo,
    'monto_anterior', anterior, 'monto_nuevo', siguiente, 'monto_cotizacion', monto,
    'equipo', coalesce(resultado->'equipo', '[]'::jsonb), 'equipo_pendiente', coalesce(resultado->'equipo_pendiente', '[]'::jsonb));
  INSERT INTO public.obrabot_destinos_cotizacion
    (cotizacion_id, empresa_id, actor_id, proyecto_id, modo, monto_anterior, monto_nuevo, principal_anterior, grupo_reemplazado, resultado)
  VALUES (p_id, p_empresa, p_actor, obra.id, p_modo, anterior, siguiente,
    CASE WHEN p_modo = 'reemplazar' THEN principal END,
    CASE WHEN p_modo = 'reemplazar' THEN cabecera.id END, resultado);
  RETURN resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.obrabot_destinar_cotizacion(text, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obrabot_destinar_cotizacion(text, text, text, uuid, text, jsonb) TO service_role;

-- The old SECURITY DEFINER RPCs can bypass RLS. Keep original documents on their dedicated path.
ALTER FUNCTION public.seleccionar_presupuesto(text, text, jsonb, text) RENAME TO seleccionar_presupuesto_legacy;
ALTER FUNCTION public.actualizar_grupo_presupuesto(text, text, text, text, boolean) RENAME TO actualizar_grupo_presupuesto_legacy;
ALTER FUNCTION public.convertir_presupuesto_obra(text, text, jsonb) RENAME TO convertir_presupuesto_obra_legacy;
ALTER FUNCTION public.guardar_alternativas_presupuesto(text, text, jsonb, text, text, text) RENAME TO guardar_alternativas_presupuesto_legacy;
REVOKE ALL ON FUNCTION public.seleccionar_presupuesto_legacy(text, text, jsonb, text),
  public.actualizar_grupo_presupuesto_legacy(text, text, text, text, boolean),
  public.convertir_presupuesto_obra_legacy(text, text, jsonb),
  public.guardar_alternativas_presupuesto_legacy(text, text, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.seleccionar_presupuesto(p_id text, p_version text, p_payload jsonb, p_tipo text DEFAULT 'principal')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_id LIKE 'obrabot-v2:%' THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
  RETURN public.seleccionar_presupuesto_legacy(p_id, p_version, p_payload, p_tipo);
END;
$$;
CREATE FUNCTION public.actualizar_grupo_presupuesto(p_id text, p_version text, p_estado text, p_proyecto text, p_cambiar_proyecto boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_id LIKE 'obrabot-v2:%' THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
  RETURN public.actualizar_grupo_presupuesto_legacy(p_id, p_version, p_estado, p_proyecto, p_cambiar_proyecto);
END;
$$;
CREATE FUNCTION public.convertir_presupuesto_obra(p_id text, p_version text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_id LIKE 'obrabot-v2:%' THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
  RETURN public.convertir_presupuesto_obra_legacy(p_id, p_version, p_payload);
END;
$$;
CREATE FUNCTION public.guardar_alternativas_presupuesto(p_origen_id text, p_version text, p_cotizaciones jsonb,
  p_proyecto text DEFAULT NULL, p_nombre text DEFAULT NULL, p_tipo text DEFAULT 'principal')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_origen_id LIKE 'obrabot-v2:%' OR EXISTS (
    SELECT 1 FROM public.presupuestos WHERE empresa_id = public.get_auth_empresa_id()
      AND id LIKE 'obrabot-v2:%' AND cotizacion->>'id' = p_origen_id
  ) THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
  RETURN public.guardar_alternativas_presupuesto_legacy(p_origen_id, p_version, p_cotizaciones, p_proyecto, p_nombre, p_tipo);
END;
$$;
REVOKE ALL ON FUNCTION public.seleccionar_presupuesto(text, text, jsonb, text),
  public.actualizar_grupo_presupuesto(text, text, text, text, boolean),
  public.convertir_presupuesto_obra(text, text, jsonb),
  public.guardar_alternativas_presupuesto(text, text, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seleccionar_presupuesto(text, text, jsonb, text),
  public.actualizar_grupo_presupuesto(text, text, text, text, boolean),
  public.convertir_presupuesto_obra(text, text, jsonb),
  public.guardar_alternativas_presupuesto(text, text, jsonb, text, text, text) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
