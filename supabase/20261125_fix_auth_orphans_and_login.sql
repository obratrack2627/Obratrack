-- ==============================================================================
-- OBRATRACK - REPARACIÓN DE USUARIOS Y EMPRESAS HUÉRFANAS EN AUTH / PUBLIC
-- 1. Limpia empresas vacías sin usuarios (borradas parcialmente desde Table Editor).
-- 2. Limpia identidades huérfanas en auth.users sin perfil en public.usuarios.
-- 3. Sincroniza borrados desde Supabase Auth (AFTER DELETE ON auth.users) hacia public.
-- 4. Mejora eliminar_cuenta_usuario, prevalidar_registro_constructor y completar_registro_actual.
-- ==============================================================================

BEGIN;

-- 1a. Limpiar empresas huérfanas que quedaron sin ningún usuario en public.usuarios
DO $$
DECLARE
  orphan_emp RECORD;
BEGIN
  FOR orphan_emp IN
    SELECT e.id
    FROM public.empresas e
    WHERE e.id <> 'e1111111-1111-4111-a111-111111111111'
      AND NOT EXISTS (
        SELECT 1 FROM public.usuarios u WHERE u.empresa_id = e.id
      )
  LOOP
    PERFORM set_config('obratrack.deleting_account', orphan_emp.id, true);

    DELETE FROM public.notificaciones_push_enviadas
      WHERE empresa_id = orphan_emp.id;

    UPDATE public.presupuesto_grupos
      SET seleccionado_id = NULL
      WHERE empresa_id = orphan_emp.id;
    DELETE FROM public.presupuestos
      WHERE empresa_id = orphan_emp.id;
    DELETE FROM public.presupuesto_grupos
      WHERE empresa_id = orphan_emp.id;

    DELETE FROM public.proyectos
      WHERE empresa_id = orphan_emp.id;
    DELETE FROM public.empresas
      WHERE id = orphan_emp.id;
  END LOOP;
END $$;

-- 1b. Desvincular posibles objetos huérfanos en Storage y eliminar identidades huérfanas en auth.users
UPDATE storage.objects o
SET owner = NULL
WHERE o.owner IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = o.owner::text OR u.auth_user_id = o.owner::text
  );

DELETE FROM auth.users a
WHERE NOT EXISTS (
  SELECT 1 FROM public.usuarios u
  WHERE u.id = a.id::text OR u.auth_user_id = a.id::text
);

-- 2. Trigger inverso: si se elimina un usuario desde Supabase Dashboard -> Authentication -> Users,
--    limpiar también su perfil en public.usuarios (y su empresa si era el único admin y no es demo/dev).
CREATE OR REPLACE FUNCTION public.limpiar_perfil_tras_borrado_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_user public.usuarios%ROWTYPE;
  other_admins INTEGER := 0;
BEGIN
  FOR target_user IN
    SELECT *
    FROM public.usuarios u
    WHERE u.id = OLD.id::text OR u.auth_user_id = OLD.id::text
    FOR UPDATE
  LOOP
    IF target_user.empresa_id = 'e1111111-1111-4111-a111-111111111111' OR target_user.is_dev THEN
      CONTINUE;
    END IF;

    SELECT count(*) INTO other_admins
    FROM public.usuarios u
    WHERE u.empresa_id = target_user.empresa_id
      AND u.id <> target_user.id
      AND u.rol = 'admin';

    IF target_user.rol = 'admin' AND other_admins = 0 THEN
      PERFORM set_config('obratrack.deleting_account', target_user.empresa_id, true);

      DELETE FROM public.notificaciones_push_enviadas
        WHERE empresa_id = target_user.empresa_id;

      UPDATE public.presupuesto_grupos
        SET seleccionado_id = NULL
        WHERE empresa_id = target_user.empresa_id;
      DELETE FROM public.presupuestos
        WHERE empresa_id = target_user.empresa_id;
      DELETE FROM public.presupuesto_grupos
        WHERE empresa_id = target_user.empresa_id;

      DELETE FROM public.proyectos
        WHERE empresa_id = target_user.empresa_id;
      DELETE FROM public.empresas
        WHERE id = target_user.empresa_id;
    ELSE
      DELETE FROM public.notificaciones_push_enviadas
        WHERE usuario_id = target_user.id;
      DELETE FROM public.obrabot_usage
        WHERE empresa_id = target_user.empresa_id AND actor_id = target_user.id;
      DELETE FROM public.sync_web_batches
        WHERE empresa_id = target_user.empresa_id AND actor_id = target_user.id;
      UPDATE public.security_audit_logs
        SET actor_id = NULL
        WHERE empresa_id = target_user.empresa_id AND actor_id = target_user.id;

      DELETE FROM public.usuarios WHERE id = target_user.id;
    END IF;
  END LOOP;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.limpiar_perfil_tras_borrado_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS limpiar_perfil_tras_borrado_auth ON auth.users;
CREATE TRIGGER limpiar_perfil_tras_borrado_auth
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.limpiar_perfil_tras_borrado_auth();

-- 3. Reforzar eliminar_cuenta_usuario para incluir coincidencia por correo en auth.users
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
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
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
      UNION
      SELECT nullif(btrim(e.creado_por_auth), '') AS candidate
      FROM public.empresas e
      WHERE e.id = actor.empresa_id
      UNION
      SELECT a.id::text AS candidate
      FROM auth.users a
      JOIN public.usuarios u
        ON lower(a.email) IN (
          lower(nullif(btrim(u.email_acceso), '')),
          lower(nullif(btrim(u.email), ''))
        )
      WHERE u.empresa_id = actor.empresa_id
    ) s
    WHERE candidate IS NOT NULL AND candidate ~* uuid_re;

    PERFORM set_config('obratrack.deleting_account', actor.empresa_id, true);

    DELETE FROM public.notificaciones_push_enviadas
      WHERE empresa_id = actor.empresa_id;

    UPDATE public.presupuesto_grupos
      SET seleccionado_id = NULL
      WHERE empresa_id = actor.empresa_id;
    DELETE FROM public.presupuestos
      WHERE empresa_id = actor.empresa_id;
    DELETE FROM public.presupuesto_grupos
      WHERE empresa_id = actor.empresa_id;

    DELETE FROM public.proyectos
      WHERE empresa_id = actor.empresa_id;
    DELETE FROM public.empresas
      WHERE id = actor.empresa_id;

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
    UNION
    SELECT a.id::text AS candidate
    FROM auth.users a
    WHERE lower(a.email) IN (
      lower(nullif(btrim(actor.email_acceso), '')),
      lower(nullif(btrim(actor.email), ''))
    )
  ) s
  WHERE candidate IS NOT NULL AND candidate ~* uuid_re;

  DELETE FROM public.notificaciones_push_enviadas
    WHERE usuario_id = actor.id;
  DELETE FROM public.obrabot_usage
    WHERE empresa_id = actor.empresa_id AND actor_id = actor.id;
  DELETE FROM public.sync_web_batches
    WHERE empresa_id = actor.empresa_id AND actor_id = actor.id;
  UPDATE public.security_audit_logs
    SET actor_id = NULL
    WHERE empresa_id = actor.empresa_id AND actor_id = actor.id;

  DELETE FROM public.usuarios WHERE id = actor.id;

  RETURN jsonb_build_object(
    'scope', 'user',
    'empresa_id', actor.empresa_id,
    'auth_user_ids', to_jsonb(auth_ids)
  );
END $$;

REVOKE ALL ON FUNCTION public.eliminar_cuenta_usuario(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_cuenta_usuario(TEXT) TO service_role;

-- 4. Actualizar prevalidar_registro_constructor para distinguir perfiles activos vs huérfanos en auth.users
--    (incluyendo limpieza automática de empresas vacías sin usuarios asociadas al auth_id huérfano)
CREATE OR REPLACE FUNCTION public.prevalidar_registro_constructor(
  p_key text,
  p_email text,
  p_phone text,
  p_rut text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  conflicts jsonb := '[]'::jsonb;
  orphan_ids text[] := '{}';
  orphan_emp RECORD;
  has_public_email boolean := false;
  has_active_auth_email boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_key !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'REGISTRATION_FORBIDDEN';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('registration-guard', 0));

  IF (SELECT count(*) FROM public.registration_attempts WHERE client_key = p_key AND created_at > now() - interval '1 hour') >= 30
     OR (SELECT count(*) FROM public.registration_attempts WHERE created_at > now() - interval '1 hour') >= 300 THEN
    RAISE EXCEPTION 'REGISTRATION_RATE_LIMIT';
  END IF;

  INSERT INTO public.registration_attempts(client_key) VALUES (p_key);

  -- Si existe una empresa vacía sin usuarios creada por ese correo huérfano, limpiarla primero
  FOR orphan_emp IN
    SELECT e.id
    FROM public.empresas e
    JOIN auth.users a ON e.creado_por_auth = a.id::text
    WHERE lower(a.email) = p_email
      AND e.id <> 'e1111111-1111-4111-a111-111111111111'
      AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.empresa_id = e.id)
  LOOP
    PERFORM set_config('obratrack.deleting_account', orphan_emp.id, true);
    DELETE FROM public.notificaciones_push_enviadas WHERE empresa_id = orphan_emp.id;
    UPDATE public.presupuesto_grupos SET seleccionado_id = NULL WHERE empresa_id = orphan_emp.id;
    DELETE FROM public.presupuestos WHERE empresa_id = orphan_emp.id;
    DELETE FROM public.presupuesto_grupos WHERE empresa_id = orphan_emp.id;
    DELETE FROM public.proyectos WHERE empresa_id = orphan_emp.id;
    DELETE FROM public.empresas WHERE id = orphan_emp.id;
  END LOOP;

  IF nullif(p_rut, '') IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.usuarios WHERE regexp_replace(upper(rut), '[^0-9K]', '', 'g') = p_rut)
    OR EXISTS (SELECT 1 FROM public.empresas WHERE regexp_replace(upper(rut), '[^0-9K]', '', 'g') = p_rut)
  ) THEN
    conflicts := conflicts || '"rut"'::jsonb;
  END IF;

  IF EXISTS (SELECT 1 FROM public.usuarios WHERE public.telefono_whatsapp_canonico(telefono_whatsapp) = p_phone) THEN
    conflicts := conflicts || '"telefono"'::jsonb;
  END IF;

  has_public_email := EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE lower(email) = p_email OR lower(email_acceso) = p_email
  );

  IF has_public_email THEN
    conflicts := conflicts || '"email"'::jsonb;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM auth.users a
      WHERE lower(a.email) = p_email
        AND (to_jsonb(a)->>'deleted_at') IS NULL
        AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = a.id::text OR u.auth_user_id = a.id::text)
    ) INTO has_active_auth_email;

    IF has_active_auth_email THEN
      conflicts := conflicts || '"email"'::jsonb;
    ELSE
      SELECT coalesce(array_agg(a.id::text), '{}')
        INTO orphan_ids
      FROM auth.users a
      WHERE lower(a.email) = p_email
        AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = a.id::text OR u.auth_user_id = a.id::text);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'conflicts', conflicts,
    'orphan_auth_ids', to_jsonb(orphan_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prevalidar_registro_constructor(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevalidar_registro_constructor(text, text, text, text) TO service_role;

-- 5. Permitir completar_registro_actual también cuando la cuenta se creó manualmente desde Supabase Dashboard
CREATE OR REPLACE FUNCTION public.completar_registro_actual()
RETURNS public.usuarios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  a auth.users%ROWTYPE;
  fallback_name text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = uid::text OR auth_user_id = uid::text) THEN
    SELECT * INTO a FROM auth.users WHERE id = uid;
    IF FOUND
       AND coalesce(a.raw_user_meta_data->>'empresa_id', '') = ''
       AND coalesce(btrim(a.raw_user_meta_data->>'display_name'), '') = ''
       AND coalesce(btrim(a.email), '') <> '' THEN
      fallback_name := initcap(replace(replace(split_part(a.email, '@', 1), '.', ' '), '_', ' '));
      IF length(btrim(fallback_name)) < 2 THEN
        fallback_name := 'Administrador';
      END IF;
      UPDATE auth.users
        SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('display_name', btrim(fallback_name))
        WHERE id = uid;
    END IF;
  END IF;

  RETURN public.crear_cuenta_constructora(uid);
END;
$$;

REVOKE ALL ON FUNCTION public.completar_registro_actual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completar_registro_actual() TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
