BEGIN;
UPDATE storage.buckets SET file_size_limit=4194304,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'] WHERE id='bitacora-fotos';
UPDATE storage.buckets SET file_size_limit=4194304,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] WHERE id='documentos-obra';
-- Reads and signed links keep their tenant policies. Only the validated server writes bytes.
CREATE POLICY archivos_carga_servidor ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id NOT IN ('bitacora-fotos','documentos-obra'));
CREATE POLICY archivos_edicion_servidor ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id NOT IN ('bitacora-fotos','documentos-obra')) WITH CHECK(bucket_id NOT IN ('bitacora-fotos','documentos-obra'));
COMMIT;
