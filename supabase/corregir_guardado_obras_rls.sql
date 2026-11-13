-- Aplicar en bases existentes después de permisos_obra.sql.
-- Conserva RLS y las restricciones de empresa, rol web y escritura existentes.
BEGIN;
DROP POLICY IF EXISTS obra_asignada_lectura ON public.proyectos;
-- INSERT ... ON CONFLICT también aplica SELECT a la fila candidata.
-- Puede_ver_obra busca una fila ya persistida: no sirve para autorizar un alta.
CREATE POLICY obra_asignada_lectura ON public.proyectos
AS RESTRICTIVE FOR SELECT TO authenticated USING (
 empresa_id=public.get_auth_empresa_id() AND
 (public.get_auth_rol() IN ('admin','supervisor') OR public.puede_ver_obra(id))
);
NOTIFY pgrst,'reload schema';
COMMIT;
