BEGIN;
SET LOCAL search_path=public,extensions;

CREATE TABLE IF NOT EXISTS public.push_vapid_config (
  id text PRIMARY KEY,
  subject text NOT NULL DEFAULT 'mailto:soporte@obratrack.cl',
  public_key text NOT NULL,
  private_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_vapid_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_vapid_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_vapid_config TO service_role;

CREATE TABLE IF NOT EXISTS public.push_suscripciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id text NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  rol text NOT NULL CHECK (rol IN ('admin', 'supervisor', 'terreno')),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  preferencias jsonb NOT NULL DEFAULT '{"inicio_plazos":true,"incidentes_bitacora":true,"asignaciones_tareas":true,"materiales":true,"seguridad_clima":true,"cierre_diario":true}'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_suscripciones_empresa_activo_idx
  ON public.push_suscripciones(empresa_id, activo, rol);
CREATE INDEX IF NOT EXISTS push_suscripciones_usuario_idx
  ON public.push_suscripciones(usuario_id, activo);

ALTER TABLE public.push_suscripciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_suscripciones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_suscripciones TO authenticated;
GRANT ALL ON public.push_suscripciones TO service_role;

DROP POLICY IF EXISTS push_suscripciones_own ON public.push_suscripciones;
CREATE POLICY push_suscripciones_own ON public.push_suscripciones
  FOR ALL TO authenticated
  USING (
    empresa_id = public.get_auth_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = push_suscripciones.usuario_id
        AND u.empresa_id = push_suscripciones.empresa_id
        AND (u.id = auth.uid()::text OR u.auth_user_id = auth.uid()::text)
    )
  )
  WITH CHECK (
    empresa_id = public.get_auth_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = push_suscripciones.usuario_id
        AND u.empresa_id = push_suscripciones.empresa_id
        AND (u.id = auth.uid()::text OR u.auth_user_id = auth.uid()::text)
    )
  );

CREATE TABLE IF NOT EXISTS public.notificaciones_push_enviadas (
  dedup_key text PRIMARY KEY,
  empresa_id text,
  usuario_id text,
  categoria text NOT NULL,
  titulo text NOT NULL,
  cuerpo text NOT NULL,
  url text NOT NULL DEFAULT '/dashboard',
  enviadas integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notificaciones_push_enviadas_created_idx
  ON public.notificaciones_push_enviadas(created_at DESC);

ALTER TABLE public.notificaciones_push_enviadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notificaciones_push_enviadas FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notificaciones_push_enviadas TO service_role;

COMMIT;
