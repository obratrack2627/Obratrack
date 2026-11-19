-- Migración aditiva: habilita eliminación segura de avisos enviados en public.whatsapp_avisos
-- para administración y supervisión de la misma empresa (con cascada a whatsapp_envios).
BEGIN;

DROP POLICY IF EXISTS avisos_eliminar_empresa ON public.whatsapp_avisos;
CREATE POLICY avisos_eliminar_empresa ON public.whatsapp_avisos
  FOR DELETE TO authenticated
  USING (
    empresa_id = public.get_auth_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE (u.id = auth.uid()::text OR u.auth_user_id = auth.uid()::text)
        AND u.empresa_id = whatsapp_avisos.empresa_id
        AND (u.rol IN ('admin', 'supervisor') OR u.is_dev = true)
    )
  );

GRANT DELETE ON public.whatsapp_avisos TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
