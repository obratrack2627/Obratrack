-- Migración aditiva: buffer de ráfaga (mensajes separados / sigue escribiendo) y lock por remitente.
-- Aplicar después de whatsapp_identidad_obra.sql. No modifica datos ni tablas existentes.
BEGIN;

CREATE TABLE IF NOT EXISTS public.whatsapp_cola_entrada (
  message_id text PRIMARY KEY,
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  sender_phone text NOT NULL,
  payload jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesando', 'completado')),
  batch_id text,
  recibido_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_cola_entrada ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_cola_entrada FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_cola_entrada TO service_role;

CREATE INDEX IF NOT EXISTS whatsapp_cola_actor_idx
  ON public.whatsapp_cola_entrada(empresa_id, actor_id, estado, recibido_at ASC);

CREATE OR REPLACE FUNCTION public.whatsapp_encolar_mensaje(
  p_id text,
  p_empresa text,
  p_actor text,
  p_phone text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_has_processing boolean;
  v_has_earlier_pending boolean;
  v_last_ms bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa || ':' || p_actor, 7));

  -- Liberar locks expirados ante caídas previas y depurar historial viejo de cola.
  UPDATE public.whatsapp_cola_entrada
     SET estado = 'completado', updated_at = v_now
   WHERE empresa_id = p_empresa
     AND actor_id = p_actor
     AND estado = 'procesando'
     AND updated_at < v_now - interval '75 seconds';

  DELETE FROM public.whatsapp_cola_entrada
   WHERE estado = 'completado'
     AND recibido_at < v_now - interval '1 day';

  IF EXISTS (SELECT 1 FROM public.whatsapp_mensajes WHERE message_id = p_id) THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  INSERT INTO public.whatsapp_cola_entrada(
    message_id, empresa_id, actor_id, sender_phone, payload, estado, recibido_at, updated_at
  )
  VALUES (p_id, p_empresa, p_actor, p_phone, p_payload, 'pendiente', v_now, v_now)
  ON CONFLICT (message_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_cola_entrada
     WHERE empresa_id = p_empresa
       AND actor_id = p_actor
       AND estado = 'procesando'
       AND updated_at >= v_now - interval '75 seconds'
  ) INTO v_has_processing;

  IF v_has_processing THEN
    RETURN jsonb_build_object(
      'status', 'queued_behind_processing',
      'received_ms', floor(extract(epoch FROM v_now) * 1000)::bigint
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_cola_entrada
     WHERE empresa_id = p_empresa
       AND actor_id = p_actor
       AND estado = 'pendiente'
       AND (recibido_at < v_now OR (recibido_at = v_now AND message_id < p_id))
  ) INTO v_has_earlier_pending;

  SELECT floor(extract(epoch FROM max(recibido_at)) * 1000)::bigint
    INTO v_last_ms
    FROM public.whatsapp_cola_entrada
   WHERE empresa_id = p_empresa AND actor_id = p_actor AND estado = 'pendiente';

  IF v_has_earlier_pending THEN
    RETURN jsonb_build_object('status', 'queued_for_leader', 'last_at_ms', v_last_ms);
  END IF;

  RETURN jsonb_build_object('status', 'leader', 'last_at_ms', v_last_ms);
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_estado_cola_actor(
  p_empresa text,
  p_actor text,
  p_batch_id text,
  p_window_ms int,
  p_claim boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_last timestamptz;
  v_busy boolean;
  v_items jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa || ':' || p_actor, 7));

  UPDATE public.whatsapp_cola_entrada
     SET estado = 'completado', updated_at = v_now
   WHERE empresa_id = p_empresa
     AND actor_id = p_actor
     AND estado = 'procesando'
     AND updated_at < v_now - interval '75 seconds';

  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_cola_entrada
     WHERE empresa_id = p_empresa
       AND actor_id = p_actor
       AND estado = 'procesando'
       AND batch_id IS DISTINCT FROM p_batch_id
  ) INTO v_busy;

  IF v_busy THEN
    RETURN jsonb_build_object('ready', false, 'busy', true);
  END IF;

  SELECT max(recibido_at)
    INTO v_last
    FROM public.whatsapp_cola_entrada
   WHERE empresa_id = p_empresa AND actor_id = p_actor AND estado = 'pendiente';

  IF v_last IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'empty', true);
  END IF;

  IF NOT p_claim AND (v_now - v_last) < make_interval(secs => GREATEST(0, p_window_ms)::double precision / 1000.0) THEN
    SELECT jsonb_agg(payload ORDER BY recibido_at ASC, message_id ASC)
      INTO v_items
      FROM public.whatsapp_cola_entrada
     WHERE empresa_id = p_empresa AND actor_id = p_actor AND estado = 'pendiente';
    RETURN jsonb_build_object(
      'ready', false,
      'busy', false,
      'last_at_ms', floor(extract(epoch FROM v_last) * 1000)::bigint,
      'preview', coalesce(v_items, '[]'::jsonb)
    );
  END IF;

  UPDATE public.whatsapp_cola_entrada
     SET estado = 'procesando', batch_id = p_batch_id, updated_at = v_now
   WHERE empresa_id = p_empresa
     AND actor_id = p_actor
     AND estado = 'pendiente';

  SELECT jsonb_agg(payload ORDER BY recibido_at ASC, message_id ASC)
    INTO v_items
    FROM public.whatsapp_cola_entrada
   WHERE empresa_id = p_empresa AND actor_id = p_actor AND batch_id = p_batch_id;

  RETURN jsonb_build_object('ready', true, 'items', coalesce(v_items, '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_finalizar_cola_lote(
  p_empresa text,
  p_actor text,
  p_batch_id text,
  p_lead_id text DEFAULT NULL,
  p_rol text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_completed boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_row public.whatsapp_cola_entrada%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa || ':' || p_actor, 7));

  IF NOT p_completed THEN
    -- Error transitorio de BD: eliminar las filas de este batch para permitir reintento limpio de Meta.
    DELETE FROM public.whatsapp_cola_entrada
     WHERE empresa_id = p_empresa AND actor_id = p_actor AND batch_id = p_batch_id;
    RETURN;
  END IF;

  IF p_lead_id IS NOT NULL AND p_phone IS NOT NULL THEN
    FOR v_row IN
      SELECT * FROM public.whatsapp_cola_entrada
       WHERE empresa_id = p_empresa
         AND actor_id = p_actor
         AND batch_id = p_batch_id
         AND message_id <> p_lead_id
    LOOP
      INSERT INTO public.whatsapp_mensajes(
        message_id, empresa_id, actor_id, sender_phone, texto, respuesta, acciones, sent_at
      )
      VALUES (
        v_row.message_id,
        p_empresa,
        p_actor,
        p_phone,
        coalesce(v_row.payload->'text'->>'body', v_row.payload->>'type', ''),
        '',
        jsonb_build_object('tipo', 'agrupado_en_lote', 'lote_lider_id', p_lead_id, 'rol_actor', p_rol),
        v_now
      )
      ON CONFLICT (message_id) DO NOTHING;
    END LOOP;
  END IF;

  UPDATE public.whatsapp_cola_entrada
     SET estado = 'completado', updated_at = v_now
   WHERE empresa_id = p_empresa
     AND actor_id = p_actor
     AND batch_id = p_batch_id;
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_encolar_mensaje(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_encolar_mensaje(text, text, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.whatsapp_estado_cola_actor(text, text, text, int, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_estado_cola_actor(text, text, text, int, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.whatsapp_finalizar_cola_lote(text, text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_finalizar_cola_lote(text, text, text, text, text, text, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
