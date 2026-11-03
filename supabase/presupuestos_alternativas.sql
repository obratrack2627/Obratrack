-- Aditiva: alternativas por alcance, selección y aplicación transaccional a una sola obra.
CREATE TABLE IF NOT EXISTS public.presupuesto_grupos (
 id text PRIMARY KEY,
 empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
 proyecto_id text REFERENCES public.proyectos(id) ON DELETE SET NULL,
 nombre text NOT NULL,
 tipo text NOT NULL DEFAULT 'principal' CHECK(tipo IN ('principal','complementario')),
 seleccionado_id text REFERENCES public.presupuestos(id) DEFERRABLE INITIALLY DEFERRED,
 aplicado boolean NOT NULL DEFAULT false,
 monto_aplicado numeric NOT NULL DEFAULT 0,
 ejecucion jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS grupo_id text REFERENCES public.presupuesto_grupos(id);
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS nombre_alternativa text;
ALTER TABLE public.presupuestos DROP CONSTRAINT IF EXISTS presupuestos_estado_check;
ALTER TABLE public.presupuestos ADD CONSTRAINT presupuestos_estado_check CHECK(estado IN ('borrador','enviada','aprobada','rechazada','anulada','no_elegida'));
CREATE UNIQUE INDEX IF NOT EXISTS presupuesto_una_elegida ON public.presupuestos(grupo_id) WHERE grupo_id IS NOT NULL AND estado='aprobada';
CREATE UNIQUE INDEX IF NOT EXISTS presupuesto_un_principal ON public.presupuesto_grupos(proyecto_id) WHERE proyecto_id IS NOT NULL AND tipo='principal';
CREATE INDEX IF NOT EXISTS presupuestos_por_grupo ON public.presupuestos(empresa_id,grupo_id);
ALTER TABLE public.presupuesto_grupos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS presupuesto_grupo_lectura ON public.presupuesto_grupos;
CREATE POLICY presupuesto_grupo_lectura ON public.presupuesto_grupos FOR SELECT TO authenticated
 USING(empresa_id=public.get_auth_empresa_id() AND public.get_auth_rol() IN ('admin','supervisor'));
GRANT SELECT ON public.presupuesto_grupos TO authenticated;
GRANT ALL ON public.presupuesto_grupos TO service_role;

CREATE TABLE IF NOT EXISTS public.presupuesto_revisiones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 presupuesto_id text NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
 empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
 cotizacion jsonb NOT NULL,
 version timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.presupuesto_revisiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS presupuesto_revision_lectura ON public.presupuesto_revisiones;
CREATE POLICY presupuesto_revision_lectura ON public.presupuesto_revisiones FOR SELECT TO authenticated
 USING(empresa_id=public.get_auth_empresa_id() AND public.get_auth_rol() IN ('admin','supervisor'));
GRANT SELECT ON public.presupuesto_revisiones TO authenticated;
GRANT ALL ON public.presupuesto_revisiones TO service_role;

CREATE OR REPLACE FUNCTION public.proteger_presupuesto_agrupado() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE g public.presupuesto_grupos;
BEGIN
 IF current_user NOT IN ('postgres','service_role','supabase_admin') THEN
  IF TG_OP='INSERT' AND NEW.grupo_id IS NOT NULL THEN RAISE EXCEPTION 'BUDGET_USE_GROUP'; END IF;
  IF TG_OP='UPDATE' THEN
   IF NEW.grupo_id IS DISTINCT FROM OLD.grupo_id OR NEW.nombre_alternativa IS DISTINCT FROM OLD.nombre_alternativa THEN RAISE EXCEPTION 'BUDGET_USE_GROUP'; END IF;
   IF OLD.grupo_id IS NOT NULL THEN
    SELECT * INTO g FROM public.presupuesto_grupos WHERE id=OLD.grupo_id;
    IF g.aplicado AND g.seleccionado_id=OLD.id AND NEW.cotizacion IS DISTINCT FROM OLD.cotizacion THEN RAISE EXCEPTION 'BUDGET_LOCKED'; END IF;
    IF NEW.estado IS DISTINCT FROM OLD.estado OR NEW.proyecto_id IS DISTINCT FROM OLD.proyecto_id THEN
     IF NOT(NEW.proyecto_id IS NULL AND OLD.proyecto_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id=OLD.proyecto_id)) THEN RAISE EXCEPTION 'BUDGET_USE_SELECTION'; END IF;
    END IF;
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_presupuesto_agrupado_guard ON public.presupuestos;
CREATE TRIGGER a_presupuesto_agrupado_guard BEFORE INSERT OR UPDATE ON public.presupuestos FOR EACH ROW EXECUTE FUNCTION public.proteger_presupuesto_agrupado();
CREATE OR REPLACE FUNCTION public.archivar_revision_presupuesto() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.cotizacion IS DISTINCT FROM NEW.cotizacion THEN
  INSERT INTO public.presupuesto_revisiones(presupuesto_id,empresa_id,cotizacion,version) VALUES(OLD.id,OLD.empresa_id,OLD.cotizacion,OLD.updated_at);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS presupuesto_revision ON public.presupuestos;
CREATE TRIGGER presupuesto_revision AFTER UPDATE ON public.presupuestos FOR EACH ROW EXECUTE FUNCTION public.archivar_revision_presupuesto();
CREATE OR REPLACE FUNCTION public.desvincular_grupo_eliminado() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.proyecto_id IS NULL AND OLD.proyecto_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id=OLD.proyecto_id) THEN
  NEW.aplicado=false; NEW.monto_aplicado=0; NEW.ejecucion='{}'::jsonb;
 END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS presupuesto_grupo_actualizado ON public.presupuesto_grupos;
CREATE TRIGGER presupuesto_grupo_actualizado BEFORE UPDATE ON public.presupuesto_grupos FOR EACH ROW EXECUTE FUNCTION public.desvincular_grupo_eliminado();

-- Uso privado por wrappers autenticados y el trigger del canal WhatsApp.
CREATE OR REPLACE FUNCTION public.registrar_alternativas_interno(
 p_empresa text,p_actor text,p_origen_id text,p_version text,p_cotizaciones jsonb,
 p_proyecto text,p_nombre text,p_tipo text,p_origen text
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE source public.presupuestos; g public.presupuesto_grupos; q jsonb; existing public.presupuestos; ids text[]:=ARRAY[]::text[]; idx int:=0; target text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_actor AND empresa_id=p_empresa AND rol IN ('admin','supervisor')) THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
 IF jsonb_typeof(p_cotizaciones)<>'array' OR jsonb_array_length(p_cotizaciones) NOT BETWEEN 0 AND 4 OR (jsonb_array_length(p_cotizaciones)=0 AND p_origen_id IS NULL) OR p_tipo NOT IN ('principal','complementario') THEN RAISE EXCEPTION 'BUDGET_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa,0));
 IF p_origen_id IS NOT NULL THEN
  SELECT * INTO source FROM public.presupuestos WHERE empresa_id=p_empresa AND (id=p_origen_id OR cotizacion->>'id'=p_origen_id) ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
  target:=source.proyecto_id;
  IF p_proyecto IS NOT NULL AND target IS DISTINCT FROM p_proyecto THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
  IF source.grupo_id IS NOT NULL THEN SELECT * INTO g FROM public.presupuesto_grupos WHERE id=source.grupo_id AND empresa_id=p_empresa FOR UPDATE; END IF;
  IF source.updated_at IS DISTINCT FROM p_version::timestamptz THEN
   IF NOT EXISTS(SELECT 1 FROM public.presupuestos WHERE empresa_id=p_empresa AND id=p_cotizaciones->0->>'id' AND grupo_id=source.grupo_id AND cotizacion=(p_cotizaciones->0)-'alternativas') THEN RAISE EXCEPTION 'BUDGET_CONFLICT'; END IF;
  END IF;
 ELSE target:=p_proyecto;
 END IF;
 IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id=target AND empresa_id=p_empresa) THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
 IF g.id IS NULL THEN
  IF p_tipo='principal' AND target IS NOT NULL AND EXISTS(SELECT 1 FROM public.presupuesto_grupos WHERE proyecto_id=target AND tipo='principal') THEN RAISE EXCEPTION 'BUDGET_PRIMARY_EXISTS'; END IF;
  INSERT INTO public.presupuesto_grupos(id,empresa_id,proyecto_id,nombre,tipo)
   VALUES('bg-'||gen_random_uuid(),p_empresa,target,left(coalesce(nullif(p_nombre,''),source.cotizacion->>'titulo_proyecto',p_cotizaciones->0->>'titulo_proyecto'),150),p_tipo) RETURNING * INTO g;
  IF source.id IS NOT NULL THEN UPDATE public.presupuestos SET grupo_id=g.id,nombre_alternativa=coalesce(nullif(source.cotizacion->>'nombre_alternativa',''),'Original') WHERE id=source.id; END IF;
 END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(p_cotizaciones) LOOP
  idx:=idx+1;
  IF jsonb_typeof(q)<>'object' OR coalesce(q->>'id','')='' OR length(q->>'id')>200 OR coalesce(q->>'titulo_proyecto','')='' OR coalesce((q#>>'{estructura_financiera,precio_total_con_iva}')::numeric,0)<=0 THEN RAISE EXCEPTION 'BUDGET_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM public.presupuestos WHERE grupo_id=g.id AND id<>q->>'id' AND lower(nombre_alternativa)=lower(left(coalesce(nullif(q->>'nombre_alternativa',''),'Opción '||idx),150))) THEN RAISE EXCEPTION 'BUDGET_OPTION_NAME'; END IF;
  SELECT * INTO existing FROM public.presupuestos WHERE id=q->>'id';
  IF FOUND THEN
   IF existing.empresa_id<>p_empresa OR existing.grupo_id IS DISTINCT FROM g.id OR existing.cotizacion IS DISTINCT FROM q-'alternativas' THEN RAISE EXCEPTION 'BUDGET_CONFLICT'; END IF;
  ELSE
   INSERT INTO public.presupuestos(id,empresa_id,creado_por,proyecto_id,grupo_id,nombre_alternativa,origen,cotizacion)
    VALUES(q->>'id',p_empresa,p_actor,g.proyecto_id,g.id,left(coalesce(nullif(q->>'nombre_alternativa',''),'Opción '||idx),150),p_origen,q-'alternativas');
  END IF;
  ids:=array_append(ids,q->>'id');
 END LOOP;
 RETURN jsonb_build_object('grupo',to_jsonb(g),'presupuestos',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at,b.id) FROM public.presupuestos b WHERE b.empresa_id=p_empresa AND b.grupo_id=g.id));
END $$;
REVOKE ALL ON FUNCTION public.registrar_alternativas_interno(text,text,text,text,jsonb,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_alternativas_interno(text,text,text,text,jsonb,text,text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.guardar_alternativas_presupuesto(p_origen_id text,p_version text,p_cotizaciones jsonb,p_proyecto text DEFAULT NULL,p_nombre text DEFAULT NULL,p_tipo text DEFAULT 'principal')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE company text; actor text;
BEGIN
 company:=public.get_auth_empresa_id();
 SELECT id INTO actor FROM public.usuarios WHERE empresa_id=company AND (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND rol IN ('admin','supervisor') LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
 RETURN public.registrar_alternativas_interno(company,actor,p_origen_id,p_version,p_cotizaciones,p_proyecto,p_nombre,p_tipo,'plataforma');
END $$;
REVOKE ALL ON FUNCTION public.guardar_alternativas_presupuesto(text,text,jsonb,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.guardar_alternativas_presupuesto(text,text,jsonb,text,text,text) TO authenticated;

-- Aplicación privada: el importe se toma del presupuesto guardado, nunca del navegador.
CREATE OR REPLACE FUNCTION public.aplicar_presupuesto_interno(p_empresa text,p_actor text,p_id text,p_version text,p_payload jsonb,p_ya_creado boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE b public.presupuestos; g public.presupuesto_grupos; p public.proyectos; r jsonb; previous jsonb; amount numeric; base numeric; i int; q jsonb; old_ids text[]; update_materials boolean; update_gantt boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_actor AND empresa_id=p_empresa AND rol IN ('admin','supervisor')) THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa,0));
 SELECT * INTO b FROM public.presupuestos WHERE id=p_id AND empresa_id=p_empresa FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
 IF b.grupo_id IS NULL OR b.proyecto_id IS NULL THEN RAISE EXCEPTION 'BUDGET_NEEDS_PROJECT'; END IF;
 SELECT * INTO g FROM public.presupuesto_grupos WHERE id=b.grupo_id AND empresa_id=p_empresa FOR UPDATE;
 SELECT * INTO p FROM public.proyectos WHERE id=b.proyecto_id AND empresa_id=p_empresa FOR UPDATE;
 IF NOT FOUND OR g.proyecto_id IS DISTINCT FROM p.id THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
 IF g.aplicado AND g.seleccionado_id=b.id THEN RETURN jsonb_build_object('presupuesto',to_jsonb(b),'grupo',to_jsonb(g),'proyecto',to_jsonb(p),'ya_aplicado',true); END IF;
 IF b.updated_at IS DISTINCT FROM p_version::timestamptz THEN RAISE EXCEPTION 'BUDGET_CONFLICT'; END IF;
 IF b.estado IN ('rechazada','anulada') THEN RAISE EXCEPTION 'BUDGET_STATE'; END IF;
 amount:=(b.cotizacion#>>'{estructura_financiera,precio_total_con_iva}')::numeric;
 update_materials:=coalesce((p_payload->>'incluir_materiales')::boolean,true);
 update_gantt:=coalesce((p_payload->>'incluir_gantt')::boolean,true);
 IF amount IS NULL OR amount<=0 THEN RAISE EXCEPTION 'BUDGET_INVALID'; END IF;
 IF NOT p_ya_creado THEN
  -- Solo se sustituyen filas inalteradas que este grupo incorporó anteriormente.
  IF g.aplicado THEN
   FOR r IN SELECT value FROM jsonb_array_elements(CASE WHEN update_materials THEN coalesce(g.ejecucion->'materiales_proyecto','[]') ELSE '[]'::jsonb END) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.materiales_proyecto m WHERE m.id=r->>'id' AND m.proyecto_id=p.id AND to_jsonb(m) @> r AND NOT coalesce(m.comprado,false)) THEN RAISE EXCEPTION 'BUDGET_EXECUTION_CHANGED'; END IF;
   END LOOP;
   FOR r IN SELECT value FROM jsonb_array_elements(CASE WHEN update_gantt THEN coalesce(g.ejecucion->'actividades','[]') ELSE '[]'::jsonb END) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.actividades a WHERE a.id=r->>'id' AND a.proyecto_id=p.id AND to_jsonb(a) @> r AND coalesce(a.porcentaje_avance,0)=0) OR EXISTS(SELECT 1 FROM public.imprevistos WHERE actividad_id=r->>'id') THEN RAISE EXCEPTION 'BUDGET_EXECUTION_CHANGED'; END IF;
   END LOOP;
   IF update_materials THEN DELETE FROM public.materiales_proyecto WHERE proyecto_id=p.id AND id IN(SELECT value->>'id' FROM jsonb_array_elements(coalesce(g.ejecucion->'materiales_proyecto','[]'))); END IF;
   IF update_gantt THEN DELETE FROM public.actividades WHERE proyecto_id=p.id AND id IN(SELECT value->>'id' FROM jsonb_array_elements(coalesce(g.ejecucion->'actividades','[]'))); END IF;
  END IF;
  IF jsonb_array_length(coalesce(p_payload->'materiales_proyecto','[]'))>300 OR jsonb_array_length(coalesce(p_payload->'actividades','[]'))>300 THEN RAISE EXCEPTION 'BUDGET_INVALID'; END IF;
  IF (NOT update_materials AND jsonb_array_length(coalesce(p_payload->'materiales_proyecto','[]'))>0) OR (NOT update_gantt AND jsonb_array_length(coalesce(p_payload->'actividades','[]'))>0) THEN RAISE EXCEPTION 'BUDGET_INVALID'; END IF;
  i:=0;
  FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'materiales_proyecto','[]')) LOOP
   q:=b.cotizacion->'materiales'->i; i:=i+1;
   IF q IS NULL OR r->>'proyecto_id' IS DISTINCT FROM p.id OR r->>'nombre' IS DISTINCT FROM q->>'nombre' OR r->>'unidad' IS DISTINCT FROM q->>'unidad' OR (r->>'cantidad')::numeric IS DISTINCT FROM (q->>'cantidad')::numeric OR (r->>'precio_unitario')::numeric IS DISTINCT FROM (q->>'precio_unitario_estimado')::numeric OR (r->>'subtotal')::numeric IS DISTINCT FROM round((q->>'cantidad')::numeric*(q->>'precio_unitario_estimado')::numeric) OR coalesce((r->>'comprado')::boolean,false) THEN RAISE EXCEPTION 'BUDGET_INVALID'; END IF;
   INSERT INTO public.materiales_proyecto SELECT (jsonb_populate_record(NULL::public.materiales_proyecto,r||jsonb_build_object('created_at',now()))).*;
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'actividades','[]')) LOOP
   IF r->>'proyecto_id' IS DISTINCT FROM p.id OR coalesce((r->>'porcentaje_avance')::numeric,0)<>0 OR r->>'estado' IS DISTINCT FROM 'pendiente' THEN RAISE EXCEPTION 'BUDGET_INVALID'; END IF;
   IF r->>'responsable_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=r->>'responsable_id' AND empresa_id=p_empresa) THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
   INSERT INTO public.actividades SELECT (jsonb_populate_record(NULL::public.actividades,r||jsonb_build_object('created_at',now()))).*;
  END LOOP;
 END IF;
 base:=CASE WHEN p_ya_creado THEN 0 WHEN g.aplicado THEN p.monto_cotizado-g.monto_aplicado WHEN g.tipo='principal' THEN (SELECT coalesce(sum(monto_aplicado),0) FROM public.presupuesto_grupos WHERE proyecto_id=p.id AND id<>g.id AND aplicado) ELSE p.monto_cotizado END;
 UPDATE public.proyectos SET monto_cotizado=base+amount WHERE id=p.id RETURNING * INTO p;
 UPDATE public.presupuestos SET estado='no_elegida' WHERE grupo_id=g.id AND id<>b.id AND estado NOT IN ('rechazada','anulada');
 UPDATE public.presupuestos SET estado='aprobada' WHERE id=b.id RETURNING * INTO b;
 UPDATE public.presupuesto_grupos SET seleccionado_id=b.id,aplicado=true,monto_aplicado=amount,ejecucion=jsonb_build_object('actividades',CASE WHEN update_gantt THEN coalesce(p_payload->'actividades','[]'::jsonb) ELSE coalesce(g.ejecucion->'actividades','[]'::jsonb) END,'materiales_proyecto',CASE WHEN update_materials THEN coalesce(p_payload->'materiales_proyecto','[]'::jsonb) ELSE coalesce(g.ejecucion->'materiales_proyecto','[]'::jsonb) END) WHERE id=g.id RETURNING * INTO g;
 INSERT INTO public.bitacora_entradas(id,proyecto_id,usuario_id,autor_nombre,titulo,nota,fecha,tipo)
  VALUES('b-'||gen_random_uuid(),p.id,p_actor,(SELECT nombre FROM public.usuarios WHERE id=p_actor),'Presupuesto seleccionado',coalesce(b.nombre_alternativa,b.cotizacion->>'titulo_proyecto')||'. Importe: $'||amount::text||'. Monto consolidado: $'||p.monto_cotizado::text,(now() AT TIME ZONE 'America/Santiago')::date,'avance');
 RETURN jsonb_build_object('presupuesto',to_jsonb(b),'grupo',to_jsonb(g),'proyecto',to_jsonb(p),'actividadesCreadas',jsonb_array_length(coalesce(p_payload->'actividades','[]')),'materialesCargados',jsonb_array_length(coalesce(p_payload->'materiales_proyecto','[]')));
END $$;
REVOKE ALL ON FUNCTION public.aplicar_presupuesto_interno(text,text,text,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_presupuesto_interno(text,text,text,text,jsonb,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.seleccionar_presupuesto(p_id text,p_version text,p_payload jsonb,p_tipo text DEFAULT 'principal')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE company text; actor text; b public.presupuestos;
BEGIN
 company:=public.get_auth_empresa_id();
 SELECT id INTO actor FROM public.usuarios WHERE empresa_id=company AND (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND rol IN ('admin','supervisor') LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(company,0));
 SELECT * INTO b FROM public.presupuestos WHERE id=p_id AND empresa_id=company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
 IF b.grupo_id IS NULL THEN
  PERFORM public.registrar_alternativas_interno(company,actor,b.id,p_version,'[]'::jsonb,b.proyecto_id,b.cotizacion->>'titulo_proyecto',p_tipo,b.origen);
  SELECT * INTO b FROM public.presupuestos WHERE id=p_id;
  p_version:=b.updated_at::text;
 END IF;
 RETURN public.aplicar_presupuesto_interno(company,actor,p_id,p_version,p_payload,false);
END $$;
REVOKE ALL ON FUNCTION public.seleccionar_presupuesto(text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.seleccionar_presupuesto(text,text,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.actualizar_grupo_presupuesto(p_id text,p_version text,p_estado text,p_proyecto text,p_cambiar_proyecto boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE company text; actor text; b public.presupuestos; g public.presupuesto_grupos;
BEGIN
 company:=public.get_auth_empresa_id();
 SELECT id INTO actor FROM public.usuarios WHERE empresa_id=company AND (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND rol IN ('admin','supervisor') LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(company,0));
 SELECT * INTO b FROM public.presupuestos WHERE id=p_id AND empresa_id=company FOR UPDATE;
 IF NOT FOUND OR b.grupo_id IS NULL THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
 IF b.updated_at IS DISTINCT FROM p_version::timestamptz THEN RAISE EXCEPTION 'BUDGET_CONFLICT'; END IF;
 SELECT * INTO g FROM public.presupuesto_grupos WHERE id=b.grupo_id AND empresa_id=company FOR UPDATE;
 IF (g.aplicado AND g.seleccionado_id=b.id AND p_estado IS DISTINCT FROM b.estado) OR (g.aplicado AND p_cambiar_proyecto AND p_proyecto IS DISTINCT FROM g.proyecto_id) OR (p_estado='aprobada' AND b.estado<>'aprobada') THEN RAISE EXCEPTION 'BUDGET_USE_SELECTION'; END IF;
 IF p_cambiar_proyecto THEN
  IF p_proyecto IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id=p_proyecto AND empresa_id=company) THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
  IF g.tipo='principal' AND p_proyecto IS NOT NULL AND EXISTS(SELECT 1 FROM public.presupuesto_grupos WHERE proyecto_id=p_proyecto AND tipo='principal' AND id<>g.id) THEN RAISE EXCEPTION 'BUDGET_PRIMARY_EXISTS'; END IF;
  UPDATE public.presupuesto_grupos SET proyecto_id=p_proyecto WHERE id=g.id;
  UPDATE public.presupuestos SET proyecto_id=p_proyecto WHERE grupo_id=g.id;
 END IF;
 IF p_estado IS NOT NULL THEN UPDATE public.presupuestos SET estado=p_estado WHERE id=b.id; END IF;
 SELECT * INTO b FROM public.presupuestos WHERE id=p_id;
 RETURN to_jsonb(b);
END $$;
REVOKE ALL ON FUNCTION public.actualizar_grupo_presupuesto(text,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.actualizar_grupo_presupuesto(text,text,text,text,boolean) TO authenticated;

-- Conservar el convertidor anterior como implementación privada, sin una segunda entrada pública.
DO $$ BEGIN
 IF to_regprocedure('public.convertir_presupuesto_obra_base(text,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.convertir_presupuesto_obra(text,text,jsonb) RENAME TO convertir_presupuesto_obra_base;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.convertir_presupuesto_obra_base(text,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.convertir_presupuesto_obra(p_id text,p_version text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE company text; actor text; b public.presupuestos; g public.presupuesto_grupos; result jsonb; activity jsonb;
BEGIN
 company:=public.get_auth_empresa_id();
 SELECT id INTO actor FROM public.usuarios WHERE empresa_id=company AND (id=auth.uid()::text OR auth_user_id=auth.uid()::text) AND rol IN ('admin','supervisor') LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(company,0));
 SELECT * INTO b FROM public.presupuestos WHERE id=p_id AND empresa_id=company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
 FOR activity IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'actividades','[]')) LOOP
  IF activity->>'responsable_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=activity->>'responsable_id' AND empresa_id=company) THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
 END LOOP;
 IF b.grupo_id IS NULL THEN RETURN public.convertir_presupuesto_obra_base(p_id,p_version,p_payload); END IF;
 SELECT * INTO g FROM public.presupuesto_grupos WHERE id=b.grupo_id AND empresa_id=company FOR UPDATE;
 IF g.proyecto_id IS NOT NULL THEN RETURN public.aplicar_presupuesto_interno(company,actor,p_id,p_version,p_payload,false); END IF;
 IF b.updated_at IS DISTINCT FROM p_version::timestamptz THEN RAISE EXCEPTION 'BUDGET_CONFLICT'; END IF;
 UPDATE public.presupuestos SET estado='no_elegida' WHERE grupo_id=g.id AND id<>b.id AND estado NOT IN ('rechazada','anulada');
 result:=public.convertir_presupuesto_obra_base(p_id,p_version,p_payload);
 UPDATE public.presupuesto_grupos SET proyecto_id=result#>>'{proyecto,id}' WHERE id=g.id;
 UPDATE public.presupuestos SET proyecto_id=result#>>'{proyecto,id}' WHERE grupo_id=g.id;
 SELECT * INTO b FROM public.presupuestos WHERE id=p_id;
 RETURN public.aplicar_presupuesto_interno(company,actor,p_id,b.updated_at::text,p_payload,true);
END $$;
REVOKE ALL ON FUNCTION public.convertir_presupuesto_obra(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.convertir_presupuesto_obra(text,text,jsonb) TO authenticated;

-- El mensaje y todas sus alternativas se guardan en la misma transacción.
CREATE OR REPLACE FUNCTION public.presupuesto_desde_whatsapp() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE options jsonb; item jsonb; source_id text; source_version text; project_id text;
BEGIN
 IF NEW.cotizacion IS NOT NULL AND jsonb_typeof(NEW.cotizacion)='object' THEN
  IF (jsonb_typeof(NEW.cotizacion->'alternativas')='array' AND jsonb_array_length(NEW.cotizacion->'alternativas')>0) OR NEW.cotizacion->>'presupuesto_origen_id' IS NOT NULL THEN
   source_id:=NEW.cotizacion->>'presupuesto_origen_id'; source_version:=NEW.cotizacion->>'presupuesto_origen_version'; project_id:=NEW.cotizacion->>'presupuesto_proyecto_id';
   options:=jsonb_build_array(NEW.cotizacion-'alternativas'-'presupuesto_origen_id'-'presupuesto_origen_version'-'presupuesto_proyecto_id');
   FOR item IN SELECT value FROM jsonb_array_elements(coalesce(NEW.cotizacion->'alternativas','[]')) LOOP options:=options||jsonb_build_array(item); END LOOP;
   PERFORM public.registrar_alternativas_interno(NEW.empresa_id,NEW.actor_id,source_id,source_version,options,project_id,NEW.cotizacion->>'titulo_proyecto','principal','whatsapp');
  ELSE
   INSERT INTO public.presupuestos(id,empresa_id,creado_por,origen,cotizacion,created_at)
    VALUES('wa:'||NEW.message_id,NEW.empresa_id,NEW.actor_id,'whatsapp',NEW.cotizacion,NEW.created_at) ON CONFLICT(id) DO NOTHING;
  END IF;
 END IF;
 RETURN NEW;
END $$;

DO $$ BEGIN
 IF to_regprocedure('public.aplicar_lote_copiloto_base(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)') IS NULL THEN
  ALTER FUNCTION public.aplicar_lote_copiloto(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) RENAME TO aplicar_lote_copiloto_base;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.aplicar_lote_copiloto_base(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_copiloto_base(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.aplicar_lote_copiloto(
 p_id text,p_empresa text,p_actor text,p_phone text,p_texto text,p_respuesta text,
 p_cotizacion jsonb,p_acciones jsonb,p_changed jsonb,p_deleted jsonb,
 p_adjunto jsonb DEFAULT NULL,p_borrador jsonb DEFAULT NULL,p_aviso jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE cached public.whatsapp_mensajes; b public.presupuestos; g public.presupuesto_grupos; result jsonb; origin_quote text; origin_project text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa,0));
 SELECT * INTO cached FROM public.whatsapp_mensajes WHERE message_id=p_id;
 IF FOUND THEN
  IF cached.empresa_id<>p_empresa OR cached.actor_id<>p_actor THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
  RETURN to_jsonb(cached);
 END IF;
 IF p_acciones->>'presupuesto_seleccion_id' IS NOT NULL THEN
  PERFORM public.aplicar_presupuesto_interno(p_empresa,p_actor,p_acciones->>'presupuesto_seleccion_id',p_acciones->>'presupuesto_seleccion_version',p_acciones->'presupuesto_ejecucion',false);
 END IF;
 origin_quote:=p_acciones->>'presupuesto_cotizacion_id'; origin_project:=p_acciones->>'presupuesto_proyecto_id';
 IF origin_quote IS NOT NULL AND origin_project IS NOT NULL THEN
  SELECT * INTO b FROM public.presupuestos WHERE empresa_id=p_empresa AND cotizacion->>'id'=origin_quote ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_FORBIDDEN'; END IF;
  IF b.grupo_id IS NOT NULL THEN
   SELECT * INTO g FROM public.presupuesto_grupos WHERE id=b.grupo_id AND empresa_id=p_empresa FOR UPDATE;
   IF g.proyecto_id IS NOT NULL THEN RAISE EXCEPTION 'BUDGET_ALREADY_CONVERTED'; END IF;
   UPDATE public.presupuestos SET estado='no_elegida' WHERE grupo_id=g.id AND id<>b.id AND estado NOT IN ('rechazada','anulada');
  END IF;
 END IF;
 result:=public.aplicar_lote_copiloto_base(p_id,p_empresa,p_actor,p_phone,p_texto,p_respuesta,p_cotizacion,p_acciones,p_changed,p_deleted,p_adjunto,p_borrador,p_aviso);
 IF origin_quote IS NOT NULL AND origin_project IS NOT NULL AND b.grupo_id IS NOT NULL THEN
  UPDATE public.presupuesto_grupos SET proyecto_id=origin_project WHERE id=b.grupo_id;
  UPDATE public.presupuestos SET proyecto_id=origin_project WHERE grupo_id=b.grupo_id;
  SELECT * INTO b FROM public.presupuestos WHERE id=b.id;
  PERFORM public.aplicar_presupuesto_interno(p_empresa,p_actor,b.id,b.updated_at::text,p_changed,true);
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.aplicar_lote_copiloto(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_copiloto(text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
