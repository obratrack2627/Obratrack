-- Migración aditiva. Ejecutar en Supabase SQL Editor después del esquema existente.
-- No ejecutar schema.sql: ese archivo elimina tablas.
BEGIN;
CREATE OR REPLACE FUNCTION public.operacion_empresa()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT empresa_id FROM public.usuarios
  WHERE auth_user_id = auth.uid()::text OR id = auth.uid()::text LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.operacion_empresa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operacion_empresa() TO authenticated;

CREATE TABLE IF NOT EXISTS public.cotizaciones_obra (
  id text PRIMARY KEY,
  empresa_id text NOT NULL REFERENCES public.empresas(id),
  cliente_id text NOT NULL REFERENCES public.clientes(id),
  proyecto_id text UNIQUE REFERENCES public.proyectos(id),
  datos jsonb NOT NULL CHECK (jsonb_typeof(datos) = 'object'),
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.gestion_obras (
  proyecto_id text PRIMARY KEY REFERENCES public.proyectos(id) ON DELETE CASCADE,
  empresa_id text NOT NULL REFERENCES public.empresas(id),
  datos jsonb NOT NULL CHECK (jsonb_typeof(datos) = 'object'),
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cotizaciones_obra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestion_obras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cotizaciones_empresa ON public.cotizaciones_obra;
CREATE POLICY cotizaciones_empresa ON public.cotizaciones_obra FOR ALL TO authenticated
  USING (empresa_id = public.operacion_empresa())
  WITH CHECK (empresa_id = public.operacion_empresa() AND EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND c.empresa_id = public.operacion_empresa()
  ));
DROP POLICY IF EXISTS gestion_empresa ON public.gestion_obras;
CREATE POLICY gestion_empresa ON public.gestion_obras FOR ALL TO authenticated
  USING (empresa_id = public.operacion_empresa())
  WITH CHECK (empresa_id = public.operacion_empresa() AND EXISTS (
    SELECT 1 FROM public.proyectos p WHERE p.id = proyecto_id AND p.empresa_id = public.operacion_empresa()
  ));
GRANT SELECT ON public.cotizaciones_obra, public.gestion_obras TO authenticated;
-- Todas las escrituras pasan por RPC: revisión optimista y transacciones.
REVOKE INSERT, UPDATE, DELETE ON public.cotizaciones_obra, public.gestion_obras FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.guardar_cotizacion(d jsonb, version integer)
RETURNS public.cotizaciones_obra LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.cotizaciones_obra; actual public.cotizaciones_obra; tenant text := public.operacion_empresa();
BEGIN
  IF tenant IS NULL OR d->>'empresa_id' IS DISTINCT FROM tenant THEN RAISE EXCEPTION 'Sin acceso a esta empresa'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = d->>'cliente_id' AND empresa_id = tenant) THEN RAISE EXCEPTION 'Cliente inválido'; END IF;
  IF coalesce(d->>'estado','') NOT IN ('Borrador','Enviada','Modificada','Aprobada','Rechazada') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  IF coalesce(trim(d->>'titulo'),'') = '' OR coalesce(trim(d->>'direccion'),'') = '' OR coalesce(jsonb_array_length(d->'lineas'),0) = 0
    OR coalesce((d->>'margen')::numeric,-1) NOT BETWEEN 0 AND 100 OR (d->>'margen')::numeric <> round((d->>'margen')::numeric,2)
    OR nullif(d->>'fecha_inicio','') IS NULL OR nullif(d->>'fecha_termino','') IS NULL OR (d->>'fecha_inicio')::date > (d->>'fecha_termino')::date
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(d->'lineas') l WHERE coalesce(trim(l->>'partida'),'') = '' OR coalesce(trim(l->>'descripcion'),'') = '' OR coalesce((l->>'cantidad')::numeric,0) <= 0 OR coalesce((l->>'precio')::numeric,-1) < 0 OR (l->>'precio')::numeric <> round((l->>'precio')::numeric) OR (l->>'cantidad')::numeric <> round((l->>'cantidad')::numeric,2))
    THEN RAISE EXCEPTION 'Revisa los datos de la cotización'; END IF;
  SELECT * INTO actual FROM public.cotizaciones_obra WHERE id = d->>'id' FOR UPDATE;
  IF FOUND THEN
    IF actual.empresa_id <> tenant OR actual.revision <> version THEN RAISE EXCEPTION 'El registro cambió. Recarga antes de guardar.'; END IF;
    IF actual.proyecto_id IS NOT NULL THEN RAISE EXCEPTION 'La cotización ya es una obra. Registra un adicional.'; END IF;
    UPDATE public.cotizaciones_obra SET datos = d - 'proyecto_id', cliente_id = d->>'cliente_id', revision = revision + 1, updated_at = now()
      WHERE id = actual.id RETURNING * INTO r;
  ELSE
    IF version <> 0 THEN RAISE EXCEPTION 'Cotización inexistente'; END IF;
    INSERT INTO public.cotizaciones_obra(id,empresa_id,cliente_id,datos) VALUES(d->>'id',tenant,d->>'cliente_id',d - 'proyecto_id') RETURNING * INTO r;
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.convertir_cotizacion(cotizacion_id text, version integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.cotizaciones_obra; d jsonb; pid text; total numeric; costo numeric; acts jsonb;
BEGIN
  SELECT * INTO q FROM public.cotizaciones_obra WHERE id = cotizacion_id AND empresa_id = public.operacion_empresa() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no disponible'; END IF;
  IF q.proyecto_id IS NOT NULL THEN RETURN q.proyecto_id; END IF;
  IF q.revision <> version THEN RAISE EXCEPTION 'La cotización cambió. Recarga antes de convertir.'; END IF;
  d := q.datos;
  IF d->>'estado' <> 'Aprobada' THEN RAISE EXCEPTION 'Primero aprueba la cotización'; END IF;
  IF jsonb_array_length(d->'lineas') = 0 OR (d->>'fecha_inicio')::date > (d->>'fecha_termino')::date THEN RAISE EXCEPTION 'Revisa partidas y fechas'; END IF;
  PERFORM 1 FROM public.empresas WHERE id = q.empresa_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.empresas WHERE id = q.empresa_id AND coalesce(plan_id,'gratis') = 'gratis')
    AND EXISTS (SELECT 1 FROM public.proyectos WHERE empresa_id = q.empresa_id AND estado = 'activo')
    AND NOT EXISTS (SELECT 1 FROM public.usuarios WHERE empresa_id = q.empresa_id AND (id = auth.uid()::text OR auth_user_id = auth.uid()::text) AND is_dev)
    THEN RAISE EXCEPTION 'Tu plan permite una obra activa. Revisa tu plan antes de convertir.'; END IF;
  SELECT sum(round((l->>'cantidad')::numeric * (l->>'precio')::numeric)) INTO costo FROM jsonb_array_elements(d->'lineas') l;
  SELECT sum(round(round((l->>'cantidad')::numeric * (l->>'precio')::numeric) * (1 + (d->>'margen')::numeric / 100))) INTO total FROM jsonb_array_elements(d->'lineas') l;
  IF (d->>'iva')::boolean THEN total := total + round(total * .19); END IF;
  pid := gen_random_uuid()::text;
  INSERT INTO public.proyectos(id, empresa_id, cliente_id, nombre, descripcion, direccion, fecha_inicio, fecha_termino_estimada, estado, monto_cotizado)
  VALUES(pid,q.empresa_id,q.cliente_id,d->>'titulo',d->>'observaciones',d->>'direccion',(d->>'fecha_inicio')::date,(d->>'fecha_termino')::date,'activo',total);
  SELECT jsonb_agg(jsonb_build_object('id',gen_random_uuid()::text,'partida',partida,'nombre',partida,'responsable_id','','inicio',d->>'fecha_inicio','termino',d->>'fecha_termino','avance',0,'costo',presupuesto,'observaciones','','estado','Pendiente')) INTO acts
  FROM (SELECT l->>'partida' partida, sum(round((l->>'cantidad')::numeric*(l->>'precio')::numeric)) presupuesto FROM jsonb_array_elements(d->'lineas') l GROUP BY l->>'partida') partidas;
  INSERT INTO public.gestion_obras(proyecto_id,empresa_id,datos) VALUES(pid,q.empresa_id,jsonb_build_object(
    'proyecto_id',pid,'empresa_id',q.empresa_id,'etapa','Esperando anticipo','gastos','[]'::jsonb,'jornadas','[]'::jsonb,'adicionales','[]'::jsonb,
    'estados_pago','[]'::jsonb,'actividades',coalesce(acts,'[]'::jsonb),'bitacora','[]'::jsonb));
  INSERT INTO public.actividades(id,proyecto_id,nombre,fecha_inicio,fecha_termino,porcentaje_avance,estado)
    SELECT a->>'id',pid,a->>'nombre',(a->>'inicio')::date,(a->>'termino')::date,0,'pendiente' FROM jsonb_array_elements(acts) a;
  UPDATE public.cotizaciones_obra SET proyecto_id = pid, revision = revision + 1, updated_at = now() WHERE id = q.id;
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.guardar_gestion(d jsonb, version integer)
RETURNS public.gestion_obras LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.gestion_obras; actual public.gestion_obras; p public.proyectos; tenant text := public.operacion_empresa(); a jsonb;
  valor numeric; recibido numeric; avance numeric; costos numeric; jornales numeric;
BEGIN
  IF tenant IS NULL OR d->>'empresa_id' IS DISTINCT FROM tenant THEN RAISE EXCEPTION 'Sin acceso a esta empresa'; END IF;
  SELECT * INTO p FROM public.proyectos WHERE id = d->>'proyecto_id' AND empresa_id = tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Obra no disponible'; END IF;
  SELECT * INTO actual FROM public.gestion_obras WHERE proyecto_id = p.id FOR UPDATE;
  IF FOUND THEN
    IF actual.revision <> version THEN RAISE EXCEPTION 'El registro cambió. Recarga antes de guardar.'; END IF;
    IF actual.datos->>'etapa' = 'Finalizada' THEN RAISE EXCEPTION 'La obra está cerrada'; END IF;
  ELSIF version <> 0 THEN RAISE EXCEPTION 'Registro inexistente'; END IF;
  IF p.estado = 'terminado' THEN RAISE EXCEPTION 'La obra está cerrada'; END IF;
  IF coalesce(d->>'etapa','') NOT IN ('Esperando anticipo','Planificación','En ejecución','Terminaciones','Pendiente de pago','Finalizada') THEN RAISE EXCEPTION 'Etapa inválida'; END IF;
  IF jsonb_typeof(d->'gastos') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'jornadas') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'estados_pago') IS DISTINCT FROM 'array'
    OR jsonb_typeof(d->'adicionales') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'actividades') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'bitacora') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'Registro incompleto'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'gastos') x WHERE coalesce((x->>'monto')::numeric,0) <= 0 OR coalesce(trim(x->>'descripcion'),'') = '' OR coalesce(trim(x->>'proveedor'),'') = ''
    OR coalesce(x->>'categoria','') NOT IN ('Materiales','Mano de obra','Transporte','Herramientas','Maquinaria','Servicios externos','Otros') OR nullif(x->>'fecha','') IS NULL)
    THEN RAISE EXCEPTION 'Gasto inválido'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'jornadas') x WHERE coalesce((x->>'jornadas')::numeric,0) NOT BETWEEN .125 AND 1 OR coalesce((x->>'valor_diario')::numeric,0) <= 0
    OR nullif(x->>'fecha','') IS NULL OR coalesce(trim(x->>'actividad'),'') = ''
    OR NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = x->>'trabajador_id' AND u.empresa_id = tenant))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(d->'jornadas') x GROUP BY x->>'trabajador_id',x->>'fecha' HAVING count(*) > 1)
    THEN RAISE EXCEPTION 'Revisa las jornadas y trabajadores'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'estados_pago') x WHERE coalesce((x->>'monto')::numeric,0) <= 0 OR coalesce((x->>'avance')::numeric,-1) NOT BETWEEN 0 AND 100
    OR coalesce((x->>'numero')::integer,0) < 1 OR coalesce(x->>'estado','') NOT IN ('Pendiente','Solicitado','Pagado') OR coalesce(trim(x->>'motivo'),'') = ''
    OR nullif(x->>'fecha','') IS NULL OR nullif(x->>'vencimiento','') IS NULL OR (x->>'vencimiento')::date < (x->>'fecha')::date OR (x->>'estado' = 'Pagado' AND nullif(x->>'fecha_pago','') IS NULL))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(d->'estados_pago') x GROUP BY x->>'numero' HAVING count(*) > 1)
    THEN RAISE EXCEPTION 'Estado de pago inválido'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'adicionales') x WHERE coalesce((x->>'materiales')::numeric,-1) < 0 OR coalesce((x->>'mano_obra')::numeric,-1) < 0
    OR coalesce(trim(x->>'descripcion'),'') = '' OR nullif(x->>'fecha','') IS NULL
    OR (x->>'materiales')::numeric + (x->>'mano_obra')::numeric <= 0 OR coalesce(x->>'estado','') NOT IN ('Borrador','Enviado','Aprobado','Ejecutado','Cobrado')) THEN RAISE EXCEPTION 'Adicional inválido'; END IF;
  -- Los adicionales aprobados no pueden desaparecer ni cambiar su presupuesto.
  IF actual.proyecto_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(actual.datos->'adicionales') anterior
    WHERE anterior->>'estado' IN ('Aprobado','Ejecutado','Cobrado') AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(d->'adicionales') nuevo WHERE nuevo->>'id' = anterior->>'id'
      AND nuevo->>'descripcion' = anterior->>'descripcion' AND nuevo->>'materiales' = anterior->>'materiales' AND nuevo->>'mano_obra' = anterior->>'mano_obra'
      AND nuevo->>'estado' IN ('Aprobado','Ejecutado','Cobrado')
    )) THEN RAISE EXCEPTION 'Un adicional aprobado conserva su monto y alcance'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'adicionales') x WHERE x->>'estado' IN ('Aprobado','Ejecutado','Cobrado') AND coalesce(trim(x->>'aprobacion'),'') = '') THEN RAISE EXCEPTION 'Registra la aprobación del cliente'; END IF;
  IF d->>'etapa' = 'Finalizada' THEN
    SELECT avg((x->>'avance')::numeric) INTO avance FROM jsonb_array_elements(d->'actividades') x;
    valor := p.monto_cotizado + coalesce((SELECT sum((x->>'materiales')::numeric + (x->>'mano_obra')::numeric) FROM jsonb_array_elements(d->'adicionales') x WHERE x->>'estado' IN ('Aprobado','Ejecutado','Cobrado')),0);
    recibido := coalesce((SELECT sum(monto) FROM public.pagos WHERE proyecto_id = p.id AND coalesce(estado,'completado') = 'completado'),0)
      + coalesce((SELECT sum((x->>'monto')::numeric) FROM jsonb_array_elements(d->'estados_pago') x WHERE x->>'estado' = 'Pagado'),0);
    IF avance IS DISTINCT FROM 100 OR recibido < valor OR EXISTS (SELECT 1 FROM jsonb_array_elements(d->'estados_pago') x WHERE x->>'estado' <> 'Pagado') OR EXISTS (SELECT 1 FROM jsonb_array_elements(d->'adicionales') x WHERE x->>'estado' <> 'Cobrado') THEN RAISE EXCEPTION 'Revisa avance, cobros y adicionales antes de cerrar'; END IF;
    IF nullif(d->'cierre'->>'fecha','') IS NULL THEN RAISE EXCEPTION 'Falta la fecha de cierre'; END IF;
    SELECT coalesce(sum(round((x->>'jornadas')::numeric * (x->>'valor_diario')::numeric)),0) INTO jornales FROM jsonb_array_elements(d->'jornadas') x;
    costos := jornales + coalesce((SELECT sum((x->>'monto')::numeric) FROM jsonb_array_elements(d->'gastos') x),0)
      + coalesce((SELECT sum(subtotal) FROM public.materiales_proyecto WHERE proyecto_id = p.id AND comprado),0)
      + coalesce((SELECT sum(monto_adicional) FROM public.imprevistos WHERE proyecto_id = p.id AND estado = 'aprobado'),0);
    d := jsonb_set(d,'{cierre,resumen}',jsonb_build_object('contrato',p.monto_cotizado,'adicionales',valor-p.monto_cotizado,'valor',valor,
      'recibido',recibido,'saldo',0,'gastos',costos,'manoObra',jornales,'utilidad',valor-costos,'utilidadProyectada',valor-costos,
      'caja',recibido-costos,'credito',greatest(0,recibido-valor),'avance',100,'avanceFinanciero',CASE WHEN valor>0 THEN round(recibido/valor*100) ELSE 0 END,'desfase',false));
    UPDATE public.proyectos SET estado = 'terminado' WHERE id = p.id;
  END IF;
  INSERT INTO public.gestion_obras(proyecto_id,empresa_id,datos,revision) VALUES(p.id,tenant,d,1)
    ON CONFLICT(proyecto_id) DO UPDATE SET datos = excluded.datos, revision = gestion_obras.revision + 1, updated_at = now() RETURNING * INTO r;
  FOR a IN SELECT * FROM jsonb_array_elements(d->'actividades') LOOP
    IF coalesce((a->>'avance')::numeric,-1) NOT BETWEEN 0 AND 100 OR (a->>'inicio')::date > (a->>'termino')::date
      OR coalesce(trim(a->>'nombre'),'') = '' OR coalesce(trim(a->>'partida'),'') = '' OR coalesce((a->>'costo')::numeric,-1) < 0
      OR coalesce(a->>'estado','') NOT IN ('Pendiente','En ejecución','Terminada','Bloqueada')
      OR (a->>'estado' = 'Terminada' AND (a->>'avance')::numeric <> 100)
      OR (a->>'estado' = 'Pendiente' AND (a->>'avance')::numeric <> 0)
      THEN RAISE EXCEPTION 'Actividad inválida'; END IF;
    IF EXISTS (SELECT 1 FROM public.actividades WHERE id = a->>'id' AND proyecto_id <> p.id) THEN RAISE EXCEPTION 'Actividad de otra obra'; END IF;
    IF nullif(a->>'responsable_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = a->>'responsable_id' AND empresa_id = tenant) THEN RAISE EXCEPTION 'Responsable inválido'; END IF;
    INSERT INTO public.actividades(id,proyecto_id,nombre,responsable_id,fecha_inicio,fecha_termino,porcentaje_avance,estado)
      VALUES(a->>'id',p.id,a->>'nombre',nullif(a->>'responsable_id',''),(a->>'inicio')::date,(a->>'termino')::date,(a->>'avance')::numeric,
        CASE a->>'estado' WHEN 'Terminada' THEN 'terminada' WHEN 'En ejecución' THEN 'en_curso' ELSE 'pendiente' END)
      ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre,responsable_id=excluded.responsable_id,fecha_inicio=excluded.fecha_inicio,fecha_termino=excluded.fecha_termino,porcentaje_avance=excluded.porcentaje_avance,estado=excluded.estado;
  END LOOP;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.guardar_cotizacion(jsonb,integer), public.convertir_cotizacion(text,integer), public.guardar_gestion(jsonb,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardar_cotizacion(jsonb,integer), public.convertir_cotizacion(text,integer), public.guardar_gestion(jsonb,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.proteger_contrato_original()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.monto_cotizado IS DISTINCT FROM OLD.monto_cotizado
    AND EXISTS (SELECT 1 FROM public.cotizaciones_obra WHERE proyecto_id = OLD.id)
    THEN RAISE EXCEPTION 'El contrato original se conserva. Registra un adicional.'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS contrato_original ON public.proyectos;
CREATE TRIGGER contrato_original BEFORE UPDATE ON public.proyectos FOR EACH ROW EXECUTE FUNCTION public.proteger_contrato_original();
REVOKE ALL ON FUNCTION public.proteger_contrato_original() FROM PUBLIC;

-- Fotografías y comprobantes privados, aislados por empresa. Las URLs firmadas
-- se generan al leer; nunca se guardan como enlaces públicos permanentes.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('documentos-obras','documentos-obras',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT(id) DO UPDATE SET public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
DROP POLICY IF EXISTS documentos_obras_lectura ON storage.objects;
CREATE POLICY documentos_obras_lectura ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-obras' AND (storage.foldername(name))[1] = public.operacion_empresa());
DROP POLICY IF EXISTS documentos_obras_subida ON storage.objects;
CREATE POLICY documentos_obras_subida ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-obras' AND (storage.foldername(name))[1] = public.operacion_empresa());
DROP POLICY IF EXISTS documentos_obras_borrar ON storage.objects;
CREATE POLICY documentos_obras_borrar ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documentos-obras' AND (storage.foldername(name))[1] = public.operacion_empresa());
COMMIT;
