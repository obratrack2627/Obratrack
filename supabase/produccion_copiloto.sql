-- Aditiva. Ejecutar junto con whatsapp_jefe.sql en una misma transacción.
CREATE TABLE IF NOT EXISTS public.presupuestos (
 id text PRIMARY KEY,
 empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
 creado_por text NOT NULL REFERENCES public.usuarios(id),
 proyecto_id text REFERENCES public.proyectos(id) ON DELETE SET NULL,
 estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','enviada','aprobada','rechazada','anulada')),
 origen text NOT NULL CHECK (origen IN ('plataforma','whatsapp')),
 cotizacion jsonb NOT NULL CHECK (jsonb_typeof(cotizacion)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.presupuestos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS presupuestos_gestion ON public.presupuestos;
CREATE POLICY presupuestos_gestion ON public.presupuestos FOR ALL TO authenticated
 USING (empresa_id=public.get_auth_empresa_id() AND EXISTS(SELECT 1 FROM public.usuarios WHERE (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND empresa_id=presupuestos.empresa_id AND rol IN ('admin','supervisor')))
 WITH CHECK (empresa_id=public.get_auth_empresa_id() AND EXISTS(SELECT 1 FROM public.usuarios WHERE (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND empresa_id=presupuestos.empresa_id AND rol IN ('admin','supervisor')));
GRANT SELECT,INSERT,UPDATE ON public.presupuestos TO authenticated;
GRANT ALL ON public.presupuestos TO service_role;
CREATE INDEX IF NOT EXISTS presupuestos_empresa_fecha ON public.presupuestos(empresa_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.validar_presupuesto() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.empresa_id<>OLD.empresa_id OR NEW.creado_por<>OLD.creado_por OR NEW.origen<>OLD.origen OR NEW.id<>OLD.id) THEN RAISE EXCEPTION 'No se puede cambiar la propiedad del presupuesto'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=NEW.creado_por AND empresa_id=NEW.empresa_id) THEN RAISE EXCEPTION 'Autor no autorizado'; END IF;
 IF NEW.proyecto_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id=NEW.proyecto_id AND empresa_id=NEW.empresa_id) THEN RAISE EXCEPTION 'Obra no autorizada'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS presupuesto_validacion ON public.presupuestos;
CREATE TRIGGER presupuesto_validacion BEFORE INSERT OR UPDATE ON public.presupuestos FOR EACH ROW EXECUTE FUNCTION public.validar_presupuesto();

ALTER TABLE public.whatsapp_mensajes ADD COLUMN IF NOT EXISTS adjunto jsonb;
CREATE OR REPLACE FUNCTION public.presupuesto_desde_whatsapp() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.cotizacion IS NOT NULL AND jsonb_typeof(NEW.cotizacion)='object' THEN
  INSERT INTO public.presupuestos(id,empresa_id,creado_por,origen,cotizacion,created_at)
   VALUES('wa:'||NEW.message_id,NEW.empresa_id,NEW.actor_id,'whatsapp',NEW.cotizacion,NEW.created_at) ON CONFLICT(id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS whatsapp_presupuesto ON public.whatsapp_mensajes;
CREATE TRIGGER whatsapp_presupuesto AFTER INSERT ON public.whatsapp_mensajes FOR EACH ROW EXECUTE FUNCTION public.presupuesto_desde_whatsapp();
INSERT INTO public.presupuestos(id,empresa_id,creado_por,origen,cotizacion,created_at)
 SELECT 'wa:'||message_id,empresa_id,actor_id,'whatsapp',cotizacion,created_at FROM public.whatsapp_mensajes
 WHERE cotizacion IS NOT NULL AND jsonb_typeof(cotizacion)='object' ON CONFLICT(id) DO NOTHING;

-- Evidencias privadas: solo el backend descarga archivos y emite enlaces breves tras autenticar al usuario.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('whatsapp-evidencias','whatsapp-evidencias',false,10485760,ARRAY['image/jpeg','image/png','image/webp'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
NOTIFY pgrst, 'reload schema';
