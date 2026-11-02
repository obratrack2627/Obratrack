-- Aplicar cuando la versión que renueva enlaces privados ya esté desplegada.
BEGIN;
CREATE OR REPLACE FUNCTION public.puede_acceder_archivo_obra(file_path text, bucket text, writing boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT bucket IN ('documentos-obra','bitacora-fotos')
 AND split_part(file_path,'/',1)=public.get_auth_empresa_id()
 AND EXISTS(
  SELECT 1 FROM public.proyectos p JOIN public.usuarios u ON u.empresa_id=p.empresa_id
  WHERE p.id=split_part(file_path,'/',2) AND p.empresa_id=public.get_auth_empresa_id()
  AND (u.id=auth.uid()::text OR u.auth_user_id=auth.uid()::text)
  AND (u.rol IN ('admin','supervisor') OR ((NOT writing OR bucket='bitacora-fotos') AND EXISTS(SELECT 1 FROM public.proyecto_trabajadores pt WHERE pt.proyecto_id=p.id AND pt.usuario_id=u.id)))
 );
$$;
REVOKE ALL ON FUNCTION public.puede_acceder_archivo_obra(text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.puede_acceder_archivo_obra(text,text,boolean) TO authenticated;
DROP POLICY IF EXISTS "Allow Delete Bitacora Fotos" ON storage.objects;
DROP POLICY IF EXISTS "Allow Upload Bitacora Fotos" ON storage.objects;
DROP POLICY IF EXISTS "Public Access Bitacora Fotos" ON storage.objects;
DROP POLICY IF EXISTS archivos_obra_lectura ON storage.objects;
CREATE POLICY archivos_obra_lectura ON storage.objects FOR SELECT TO authenticated USING (public.puede_acceder_archivo_obra(name,bucket_id,false));
DROP POLICY IF EXISTS archivos_obra_carga ON storage.objects;
CREATE POLICY archivos_obra_carga ON storage.objects FOR INSERT TO authenticated WITH CHECK (public.puede_acceder_archivo_obra(name,bucket_id,true));
DROP POLICY IF EXISTS archivos_obra_actualizar ON storage.objects;
CREATE POLICY archivos_obra_actualizar ON storage.objects FOR UPDATE TO authenticated USING (public.puede_acceder_archivo_obra(name,bucket_id,true) AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.empresa_id=public.get_auth_empresa_id() AND (u.id=auth.uid()::text OR u.auth_user_id=auth.uid()::text) AND u.rol IN ('admin','supervisor'))) WITH CHECK (public.puede_acceder_archivo_obra(name,bucket_id,true));
DROP POLICY IF EXISTS archivos_obra_eliminar ON storage.objects;
CREATE POLICY archivos_obra_eliminar ON storage.objects FOR DELETE TO authenticated USING (public.puede_acceder_archivo_obra(name,bucket_id,true) AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.empresa_id=public.get_auth_empresa_id() AND (u.id=auth.uid()::text OR u.auth_user_id=auth.uid()::text) AND u.rol IN ('admin','supervisor')));
UPDATE storage.buckets SET public=false WHERE id IN ('documentos-obra','bitacora-fotos');
COMMIT;
