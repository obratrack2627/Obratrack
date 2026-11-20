-- ==============================================================================
-- OBRATRACK - ELIMINACIÓN SEGURA Y COMPLETA DE CUENTA Y DATOS ASOCIADOS
-- 1. Ajusta FKs sobre usuarios(id) a ON DELETE SET NULL para poder borrar usuarios individuales.
-- 2. Actualiza validar_presupuesto() para permitir cascada SET NULL sin error.
-- 3. Crea RPC transaccional eliminar_cuenta_usuario(p_usuario_id) (solo service_role).
-- ==============================================================================

BEGIN;

-- 1. Ajustar FKs que apuntaban a usuarios(id) sin cláusula ON DELETE
ALTER TABLE public.presupuestos ALTER COLUMN creado_por DROP NOT NULL;
ALTER TABLE public.presupuestos DROP CONSTRAINT IF EXISTS presupuestos_creado_por_fkey;
ALTER TABLE public.presupuestos
  ADD CONSTRAINT presupuestos_creado_por_fkey
  FOREIGN KEY (creado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_avisos ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.whatsapp_avisos DROP CONSTRAINT IF EXISTS whatsapp_avisos_actor_id_fkey;
ALTER TABLE public.whatsapp_avisos
  ADD CONSTRAINT whatsapp_avisos_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.obrabot_apu ALTER COLUMN revisado_por DROP NOT NULL;
ALTER TABLE public.obrabot_apu DROP CONSTRAINT IF EXISTS obrabot_apu_revisado_por_fkey;
ALTER TABLE public.obrabot_apu
  ADD CONSTRAINT obrabot_apu_revisado_por_fkey
  FOREIGN KEY (revisado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

-- 2. Permitir el SET NULL automático de Postgres cuando se elimina al autor de un presupuesto
CREATE OR REPLACE FUNCTION public.validar_presupuesto() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.empresa_id <> OLD.empresa_id
    OR NEW.origen <> OLD.origen
    OR NEW.id <> OLD.id
    OR (
      NEW.creado_por IS DISTINCT FROM OLD.creado_por
      AND NOT (
        OLD.creado_por IS NOT NULL
        AND NEW.creado_por IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = OLD.creado_por)
      )
    )
  ) THEN
    RAISE EXCEPTION 'No se puede cambiar la propiedad del presupuesto';
  END IF;

  IF NEW.creado_por IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.usuarios WHERE id = NEW.creado_por AND empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'Autor no autorizado';
  END IF;

  IF NEW.creado_por IS NULL AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Autor no autorizado';
  END IF;

  IF NEW.proyecto_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.proyectos WHERE id = NEW.proyecto_id AND empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'Obra no autorizada';
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- 3. RPC atómico para eliminar completamente la empresa (si es único admin) o solo al usuario
CREATE OR REPLACE FUNCTION public.eliminar_cuenta_usuario(p_usuario_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor public.usuarios%ROWTYPE;
  other_admins INTEGER := 0;
  auth_ids TEXT[] := '{}';
  uuid_re CONSTANT TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_FORBIDDEN';
  END IF;

  SELECT * INTO actor
  FROM public.usuarios
  WHERE id = p_usuario_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND';
  END IF;

  IF actor.empresa_id = 'e1111111-1111-4111-a111-111111111111' OR actor.is_dev THEN
    RAISE EXCEPTION 'ACCOUNT_DELETE_PROTECTED';
  END IF;

  SELECT count(*) INTO other_admins
  FROM public.usuarios
  WHERE empresa_id = actor.empresa_id
    AND id <> actor.id
    AND rol = 'admin';

  IF actor.rol = 'admin' AND other_admins = 0 THEN
    SELECT coalesce(array_agg(DISTINCT candidate), '{}')
      INTO auth_ids
    FROM (
      SELECT nullif(btrim(u.auth_user_id), '') AS candidate
      FROM public.usuarios u
      WHERE u.empresa_id = actor.empresa_id
      UNION
      SELECT CASE WHEN u.id ~* uuid_re THEN u.id ELSE NULL END AS candidate
      FROM public.usuarios u
      WHERE u.empresa_id = actor.empresa_id
    ) s
    WHERE candidate IS NOT NULL AND candidate ~* uuid_re;

    UPDATE public.presupuesto_grupos
      SET seleccionado_id = NULL
      WHERE empresa_id = actor.empresa_id;
    DELETE FROM public.presupuesto_grupos
      WHERE empresa_id = actor.empresa_id;
    DELETE FROM public.empresas WHERE id = actor.empresa_id;

    RETURN jsonb_build_object(
      'scope', 'company',
      'empresa_id', actor.empresa_id,
      'auth_user_ids', to_jsonb(auth_ids)
    );
  END IF;

  SELECT coalesce(array_agg(DISTINCT candidate), '{}')
    INTO auth_ids
  FROM (
    SELECT nullif(btrim(actor.auth_user_id), '') AS candidate
    UNION
    SELECT CASE WHEN actor.id ~* uuid_re THEN actor.id ELSE NULL END AS candidate
  ) s
  WHERE candidate IS NOT NULL AND candidate ~* uuid_re;

  DELETE FROM public.usuarios WHERE id = actor.id;

  RETURN jsonb_build_object(
    'scope', 'user',
    'empresa_id', actor.empresa_id,
    'auth_user_ids', to_jsonb(auth_ids)
  );
END $$;

REVOKE ALL ON FUNCTION public.eliminar_cuenta_usuario(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_cuenta_usuario(TEXT) TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
