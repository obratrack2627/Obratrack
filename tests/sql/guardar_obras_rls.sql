-- Ejecutar después de corregir_guardado_obras_rls.sql; revierte todos los fixtures.
BEGIN;
INSERT INTO public.empresas(id,rut,nombre,plan_id) VALUES
 ('qa-sync-a','76000901-6','Prueba sincronización A','pro_ia'),
 ('qa-sync-b','76000902-4','Prueba sincronización B','pro_ia');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol,auth_user_id,telefono_whatsapp,is_dev) VALUES
 ('qa-sync-admin','qa-sync-a','Admin Prueba','qa-sync-admin@example.test','admin','90000000-0000-0000-0000-000000000001','+56981999001',false);
INSERT INTO public.proyectos(id,empresa_id,nombre,fecha_inicio,fecha_termino_estimada,estado) VALUES
 ('qa-sync-ajena','qa-sync-b','Obra ajena','2026-11-13','2026-12-13','activo');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='90000000-0000-0000-0000-000000000001';
-- Reproduce el upsert de /api/supabase/sync con una obra todavía no persistida.
INSERT INTO public.proyectos(id,empresa_id,nombre,fecha_inicio,fecha_termino_estimada,estado)
 VALUES('qa-sync-nueva','qa-sync-a','Terraza de prueba','2026-11-13','2026-12-13','activo')
 ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre;
INSERT INTO public.proyectos(id,empresa_id,nombre,fecha_inicio,fecha_termino_estimada,estado)
 VALUES('qa-sync-nueva','qa-sync-a','Terraza corregida','2026-11-13','2026-12-13','activo')
 ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id='qa-sync-nueva' AND nombre='Terraza corregida') THEN RAISE EXCEPTION 'OWN_PROJECT_NOT_SAVED'; END IF;
 IF EXISTS(SELECT 1 FROM public.proyectos WHERE id='qa-sync-ajena') THEN RAISE EXCEPTION 'TENANT_LEAK'; END IF;
 BEGIN
  INSERT INTO public.proyectos(id,empresa_id,nombre,fecha_inicio,fecha_termino_estimada,estado)
   VALUES('qa-sync-intrusa','qa-sync-b','No permitida','2026-11-13','2026-12-13','activo')
   ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre;
  RAISE EXCEPTION 'FOREIGN_INSERT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.proyectos(id,empresa_id,nombre,fecha_inicio,fecha_termino_estimada,estado)
   VALUES('qa-sync-ajena','qa-sync-a','Intento de apropiación','2026-11-13','2026-12-13','activo')
   ON CONFLICT(id) DO UPDATE SET empresa_id=excluded.empresa_id,nombre=excluded.nombre;
  RAISE EXCEPTION 'FOREIGN_UPDATE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
