-- Roles efectivos en SQL, sin modificar los datos de las empresas existentes.
BEGIN;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS creado_por_auth text;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_auth_unico ON public.usuarios(auth_user_id) WHERE nullif(auth_user_id,'') IS NOT NULL;
CREATE OR REPLACE FUNCTION public.get_auth_rol() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT rol::text FROM public.usuarios WHERE id=auth.uid()::text OR auth_user_id=auth.uid()::text LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.get_auth_usuario_id() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT id FROM public.usuarios WHERE id=auth.uid()::text OR auth_user_id=auth.uid()::text LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.puede_ver_obra(p_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.proyectos p WHERE p.id=p_id AND p.empresa_id=public.get_auth_empresa_id() AND (public.get_auth_rol() IN ('admin','supervisor') OR EXISTS(SELECT 1 FROM public.proyecto_trabajadores pt WHERE pt.proyecto_id=p.id AND pt.usuario_id=public.get_auth_usuario_id())));
$$;
REVOKE ALL ON FUNCTION public.get_auth_rol(),public.get_auth_usuario_id(),public.puede_ver_obra(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_auth_rol(),public.get_auth_usuario_id(),public.puede_ver_obra(text) TO authenticated,service_role;
DROP POLICY IF EXISTS obra_asignada_lectura ON public.proyectos;
CREATE POLICY obra_asignada_lectura ON public.proyectos AS RESTRICTIVE FOR SELECT TO authenticated USING(public.puede_ver_obra(id));
DROP POLICY IF EXISTS equipo_datos_lectura ON public.usuarios;
CREATE POLICY equipo_datos_lectura ON public.usuarios AS RESTRICTIVE FOR SELECT TO authenticated USING(public.get_auth_rol() IN ('admin','supervisor') OR id=public.get_auth_usuario_id());
DROP POLICY IF EXISTS clientes_datos_lectura ON public.clientes;
CREATE POLICY clientes_datos_lectura ON public.clientes AS RESTRICTIVE FOR SELECT TO authenticated USING(public.get_auth_rol() IN ('admin','supervisor'));
DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['proyectos','clientes','proyecto_trabajadores','actividades','pagos','materiales_proyecto','imprevistos','reclamos_cambios_obra','documentos_obra','agenda_eventos'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS gestion_insertar ON public.%I',t);
  EXECUTE format('DROP POLICY IF EXISTS gestion_actualizar ON public.%I',t);
  EXECUTE format('DROP POLICY IF EXISTS gestion_eliminar ON public.%I',t);
  EXECUTE format('CREATE POLICY gestion_insertar ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.get_auth_rol() IN (''admin'',''supervisor''))',t);
  EXECUTE format('CREATE POLICY gestion_actualizar ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.get_auth_rol() IN (''admin'',''supervisor'')) WITH CHECK(public.get_auth_rol() IN (''admin'',''supervisor''))',t);
  EXECUTE format('CREATE POLICY gestion_eliminar ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(public.get_auth_rol() IN (''admin'',''supervisor''))',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['bitacora_entradas','asistencia_obreros'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS registro_propio_insertar ON public.%I',t);
  EXECUTE format('DROP POLICY IF EXISTS registro_propio_actualizar ON public.%I',t);
  EXECUTE format('DROP POLICY IF EXISTS registro_propio_eliminar ON public.%I',t);
  EXECUTE format('CREATE POLICY registro_propio_insertar ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.get_auth_rol() IN (''admin'',''supervisor'') OR usuario_id=public.get_auth_usuario_id())',t);
  EXECUTE format('CREATE POLICY registro_propio_actualizar ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.get_auth_rol() IN (''admin'',''supervisor'') OR usuario_id=public.get_auth_usuario_id()) WITH CHECK(public.get_auth_rol() IN (''admin'',''supervisor'') OR usuario_id=public.get_auth_usuario_id())',t);
  EXECUTE format('CREATE POLICY registro_propio_eliminar ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(public.get_auth_rol() IN (''admin'',''supervisor'') OR usuario_id=public.get_auth_usuario_id())',t);
 END LOOP;
END $policies$;
CREATE OR REPLACE FUNCTION public.proteger_perfil_obra() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor_role text; actor_id text;
BEGIN
 IF current_user IN ('postgres','supabase_admin','service_role') OR auth.role()='service_role' THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 actor_role:=public.get_auth_rol(); actor_id:=public.get_auth_usuario_id();
 IF TG_OP='INSERT' THEN
  IF actor_role IS NULL AND NEW.id=auth.uid()::text AND NEW.auth_user_id=auth.uid()::text AND NEW.rol='admin' AND EXISTS(SELECT 1 FROM public.empresas WHERE id=NEW.empresa_id AND creado_por_auth=auth.uid()::text) THEN RETURN NEW; END IF;
  IF actor_role NOT IN ('admin','supervisor') OR actor_role IS NULL OR NEW.empresa_id IS DISTINCT FROM public.get_auth_empresa_id() OR NEW.auth_user_id IS NOT NULL OR NEW.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR NEW.rol NOT IN ('terreno','supervisor') THEN RAISE EXCEPTION 'PROFILE_FORBIDDEN'; END IF;
 ELSIF TG_OP='UPDATE' THEN
  IF actor_role NOT IN ('admin','supervisor') OR actor_role IS NULL OR NEW.id IS DISTINCT FROM OLD.id OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id OR (OLD.rol='admin' AND actor_id<>OLD.id) THEN RAISE EXCEPTION 'PROFILE_FORBIDDEN'; END IF;
  IF NEW.rol<>OLD.rol AND (actor_role<>'admin' OR OLD.rol='admin' OR NEW.rol NOT IN ('terreno','supervisor')) THEN RAISE EXCEPTION 'PROFILE_ROLE_FORBIDDEN'; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF actor_role NOT IN ('admin','supervisor') OR actor_role IS NULL OR OLD.rol='admin' THEN RAISE EXCEPTION 'PROFILE_FORBIDDEN'; END IF;
  RETURN OLD;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS proteger_perfil_obra ON public.usuarios;
CREATE TRIGGER proteger_perfil_obra BEFORE INSERT OR UPDATE OR DELETE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.proteger_perfil_obra();
CREATE OR REPLACE FUNCTION public.proteger_empresa_obra() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user IN ('postgres','supabase_admin','service_role') OR auth.role()='service_role' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF public.get_auth_usuario_id() IS NOT NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'COMPANY_FORBIDDEN'; END IF;
  NEW.creado_por_auth:=auth.uid()::text; NEW.plan_id:='gratis';
 ELSE
  IF public.get_auth_rol() IS DISTINCT FROM 'admin' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.plan_id IS DISTINCT FROM OLD.plan_id OR (NEW.creado_por_auth IS NOT NULL AND NEW.creado_por_auth IS DISTINCT FROM OLD.creado_por_auth) THEN RAISE EXCEPTION 'COMPANY_FORBIDDEN'; END IF;
  NEW.creado_por_auth:=OLD.creado_por_auth;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS proteger_empresa_obra ON public.empresas;
CREATE TRIGGER proteger_empresa_obra BEFORE INSERT OR UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.proteger_empresa_obra();
ALTER TABLE public.reportes_whatsapp ADD COLUMN IF NOT EXISTS registrado_por_id text REFERENCES public.usuarios(id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION public.autor_reporte_obra() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.registrado_por_id IS NULL AND OLD.registrado_por_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=OLD.registrado_por_id) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN NEW.registrado_por_id:=OLD.registrado_por_id;
 ELSIF auth.role()='authenticated' THEN NEW.registrado_por_id:=public.get_auth_usuario_id(); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS autor_reporte_obra ON public.reportes_whatsapp;
CREATE TRIGGER autor_reporte_obra BEFORE INSERT OR UPDATE ON public.reportes_whatsapp FOR EACH ROW EXECUTE FUNCTION public.autor_reporte_obra();
DROP POLICY IF EXISTS reporte_propio_insertar ON public.reportes_whatsapp;
CREATE POLICY reporte_propio_insertar ON public.reportes_whatsapp AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.get_auth_rol() IN ('admin','supervisor') OR registrado_por_id=public.get_auth_usuario_id());
DROP POLICY IF EXISTS reporte_propio_actualizar ON public.reportes_whatsapp;
CREATE POLICY reporte_propio_actualizar ON public.reportes_whatsapp AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.get_auth_rol() IN ('admin','supervisor') OR registrado_por_id=public.get_auth_usuario_id()) WITH CHECK(public.get_auth_rol() IN ('admin','supervisor') OR registrado_por_id=public.get_auth_usuario_id());
DROP POLICY IF EXISTS reporte_propio_eliminar ON public.reportes_whatsapp;
CREATE POLICY reporte_propio_eliminar ON public.reportes_whatsapp AS RESTRICTIVE FOR DELETE TO authenticated USING(public.get_auth_rol() IN ('admin','supervisor') OR registrado_por_id=public.get_auth_usuario_id());
NOTIFY pgrst,'reload schema';
COMMIT;
