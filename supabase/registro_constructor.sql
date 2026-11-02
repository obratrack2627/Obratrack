-- Alta transaccional: ninguna cuenta puede elegir una empresa ajena ni otorgarse un plan pagado.
BEGIN;
CREATE OR REPLACE FUNCTION public.crear_cuenta_constructora(p_uid uuid) RETURNS public.usuarios LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u public.usuarios; a auth.users; company text; meta jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_uid::text,7));
 SELECT * INTO u FROM public.usuarios WHERE id=p_uid::text OR auth_user_id=p_uid::text LIMIT 1;
 IF FOUND THEN RETURN u; END IF;
 SELECT * INTO a FROM auth.users WHERE id=p_uid;
 meta:=a.raw_user_meta_data;
 IF NOT FOUND OR coalesce(meta->>'empresa_id','')<>'' OR coalesce(trim(meta->>'empresa_nombre'),'')='' OR coalesce(trim(meta->>'display_name'),'')='' OR coalesce(trim(meta->>'rut'),'')='' THEN RAISE EXCEPTION 'REGISTRATION_DETAILS_REQUIRED'; END IF;
 company:='emp-'||gen_random_uuid()::text;
 INSERT INTO public.empresas(id,nombre,rut,plan_id,creado_por_auth) VALUES(company,trim(meta->>'empresa_nombre'),trim(meta->>'rut'),'gratis',p_uid::text);
 INSERT INTO public.usuarios(id,auth_user_id,empresa_id,nombre,email,rol,telefono_whatsapp,rut,is_dev) VALUES(p_uid::text,p_uid::text,company,trim(meta->>'display_name'),a.email,'admin',coalesce(meta->>'telefono',''),trim(meta->>'rut'),false) RETURNING * INTO u;
 RETURN u;
END $$;
REVOKE ALL ON FUNCTION public.crear_cuenta_constructora(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.completar_registro_actual() RETURNS public.usuarios LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 RETURN public.crear_cuenta_constructora(auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.completar_registro_actual() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.completar_registro_actual() TO authenticated;
CREATE OR REPLACE FUNCTION public.registrar_constructor_auth() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF coalesce(NEW.raw_user_meta_data->>'empresa_id','')='' AND coalesce(trim(NEW.raw_user_meta_data->>'empresa_nombre'),'')<>'' AND coalesce(trim(NEW.raw_user_meta_data->>'display_name'),'')<>'' AND coalesce(trim(NEW.raw_user_meta_data->>'rut'),'')<>'' THEN PERFORM public.crear_cuenta_constructora(NEW.id); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS registrar_constructor_auth ON auth.users;
CREATE TRIGGER registrar_constructor_auth AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.registrar_constructor_auth();
NOTIFY pgrst,'reload schema';
COMMIT;
