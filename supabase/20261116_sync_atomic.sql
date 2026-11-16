BEGIN;
CREATE TABLE IF NOT EXISTS public.sync_web_batches(
 empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
 actor_id text NOT NULL, id uuid NOT NULL, payload_hash text NOT NULL,
 resultado jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(empresa_id,actor_id,id)
);
ALTER TABLE public.sync_web_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sync_web_batches FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.sync_web_batches TO authenticated;
GRANT ALL ON public.sync_web_batches TO service_role;
CREATE POLICY sync_batch_own ON public.sync_web_batches TO authenticated
 USING(empresa_id=public.get_auth_empresa_id() AND actor_id=public.get_auth_usuario_id() AND public.puede_usar_web())
 WITH CHECK(empresa_id=public.get_auth_empresa_id() AND actor_id=public.get_auth_usuario_id() AND public.puede_usar_web());
CREATE INDEX IF NOT EXISTS sync_batch_cleanup ON public.sync_web_batches(created_at);

CREATE OR REPLACE FUNCTION public.incrementar_sync_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN NEW.sync_version:=CASE WHEN TG_OP='INSERT' THEN 1 ELSE OLD.sync_version+1 END; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.incrementar_sync_version() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['proyectos','clientes','usuarios','actividades','pagos','materiales_proyecto','bitacora_entradas','imprevistos','reclamos_cambios_obra','documentos_obra','asistencia_obreros','reportes_whatsapp','agenda_eventos'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS sync_version bigint NOT NULL DEFAULT 1',t);
  EXECUTE format('DROP TRIGGER IF EXISTS incrementar_sync_version ON public.%I',t);
  EXECUTE format('CREATE TRIGGER incrementar_sync_version BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.incrementar_sync_version()',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.validar_integridad_financiera() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='pagos' THEN
  IF NEW.monto<=0 OR NEW.monto>9999999999 OR NEW.monto<>trunc(NEW.monto) THEN RAISE EXCEPTION 'AMOUNT_INVALID'; END IF;
 END IF;
 IF TG_TABLE_NAME='materiales_proyecto' THEN
  IF NEW.cantidad<=0 OR NEW.cantidad>9999999999 OR NEW.precio_unitario<0 OR NEW.precio_unitario>9999999999 THEN RAISE EXCEPTION 'AMOUNT_INVALID'; END IF;
  NEW.subtotal:=round(NEW.cantidad*NEW.precio_unitario);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validar_integridad_financiera() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS validar_importe ON public.pagos;
CREATE TRIGGER validar_importe BEFORE INSERT OR UPDATE ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.validar_integridad_financiera();
DROP TRIGGER IF EXISTS validar_importe ON public.materiales_proyecto;
CREATE TRIGGER validar_importe BEFORE INSERT OR UPDATE ON public.materiales_proyecto FOR EACH ROW EXECUTE FUNCTION public.validar_integridad_financiera();
-- NOT VALID preserves historical rows for review; new and edited rows are still checked.
ALTER TABLE public.pagos ADD CONSTRAINT pago_importe_positivo CHECK(monto>0 AND monto<=9999999999 AND monto=trunc(monto)) NOT VALID;
ALTER TABLE public.proyectos ADD CONSTRAINT presupuesto_no_negativo CHECK(monto_cotizado>=0 AND monto_cotizado<=9999999999) NOT VALID;
ALTER TABLE public.materiales_proyecto ADD CONSTRAINT material_importes_validos CHECK(cantidad>0 AND cantidad<=9999999999 AND precio_unitario>=0 AND precio_unitario<=9999999999 AND subtotal>=0 AND subtotal<=9999999999) NOT VALID;
ALTER TABLE public.imprevistos ADD CONSTRAINT gasto_no_negativo CHECK(monto_adicional>=0 AND monto_adicional<=9999999999) NOT VALID;

CREATE OR REPLACE FUNCTION public.validar_limite_plan_obra() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.estado='activo' AND (TG_OP='INSERT' OR OLD.estado IS DISTINCT FROM NEW.estado) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.empresa_id,0));
  IF EXISTS(SELECT 1 FROM public.empresas WHERE id=NEW.empresa_id AND plan_id='gratis')
   AND EXISTS(SELECT 1 FROM public.proyectos WHERE empresa_id=NEW.empresa_id AND estado='activo' AND id<>NEW.id) THEN RAISE EXCEPTION 'PLAN_LIMIT'; END IF;
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validar_limite_plan_obra() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS validar_limite_plan ON public.proyectos;
CREATE TRIGGER validar_limite_plan BEFORE INSERT OR UPDATE ON public.proyectos FOR EACH ROW EXECUTE FUNCTION public.validar_limite_plan_obra();

CREATE OR REPLACE FUNCTION public.versionar_asignaciones_obra() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.proyecto_id=OLD.proyecto_id AND NEW.usuario_id=OLD.usuario_id THEN RETURN NEW; END IF;
 IF TG_OP IN ('DELETE','UPDATE') THEN UPDATE public.proyectos SET sync_version=sync_version+1 WHERE id=OLD.proyecto_id; END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN UPDATE public.proyectos SET sync_version=sync_version+1 WHERE id=NEW.proyecto_id; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.versionar_asignaciones_obra() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER versionar_asignaciones AFTER INSERT OR UPDATE OR DELETE ON public.proyecto_trabajadores FOR EACH ROW EXECUTE FUNCTION public.versionar_asignaciones_obra();

CREATE OR REPLACE FUNCTION public.sincronizar_lote_web(p_id uuid,p_operaciones jsonb,p_versiones jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE company text; actor text; op jsonb; row_data jsonb; table_name text; kind text; allowed text[]; cols text; clause text; filter jsonb; ids text[]; id_value text; version bigint; expected bigint; prior jsonb; versions jsonb:='{}'; result jsonb; fingerprint text; ref_name text; ref_table text; ref_company text; ref_project text; scope_project text;
BEGIN
 IF NOT public.puede_usar_web() THEN RAISE EXCEPTION 'WEB_ROLE_FORBIDDEN'; END IF;
 company:=public.get_auth_empresa_id();actor:=public.get_auth_usuario_id();
 IF company IS NULL OR p_id IS NULL OR jsonb_typeof(p_operaciones)<>'array' OR jsonb_array_length(p_operaciones)>5000 OR jsonb_typeof(p_versiones)<>'object' THEN RAISE EXCEPTION 'SYNC_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(company,0));
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('operations',p_operaciones,'versions',p_versiones)::text,'UTF8')),'hex');
 SELECT resultado INTO prior FROM public.sync_web_batches WHERE empresa_id=company AND actor_id=actor AND id=p_id AND payload_hash=fingerprint;
 IF FOUND THEN RETURN prior; END IF;
 IF EXISTS(SELECT 1 FROM public.sync_web_batches WHERE empresa_id=company AND actor_id=actor AND id=p_id) THEN RAISE EXCEPTION 'SYNC_REQUEST_CONFLICT'; END IF;
 -- Validate every version before changing anything (triggers may also change a parent).
 FOR op IN SELECT value FROM jsonb_array_elements(p_operaciones) LOOP
  table_name:=op->>'table';kind:=op->>'kind';
  IF table_name<>ALL(ARRAY['proyectos','clientes','usuarios','actividades','pagos','materiales_proyecto','bitacora_entradas','imprevistos','reclamos_cambios_obra','documentos_obra','asistencia_obreros','reportes_whatsapp','proyecto_trabajadores']) OR kind<>ALL(ARRAY['upsert','update','delete']) THEN RAISE EXCEPTION 'SYNC_FORBIDDEN'; END IF;
  IF table_name='proyecto_trabajadores' THEN
   scope_project:=coalesce(op#>>'{row,proyecto_id}',(SELECT f#>>'{values,0}' FROM jsonb_array_elements(op->'filters') f WHERE f->>'column'='proyecto_id'));
   SELECT sync_version INTO version FROM public.proyectos WHERE id=scope_project;
   expected:=(p_versiones->'proyectos'->>scope_project)::bigint;
   IF version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'SYNC_CONFLICT'; END IF;
   CONTINUE;
  END IF;
  ids:=CASE WHEN kind='upsert' THEN ARRAY[op#>>'{row,id}'] ELSE ARRAY(SELECT jsonb_array_elements_text(f->'values') FROM jsonb_array_elements(op->'filters') f WHERE f->>'column'='id') END;
  IF coalesce(cardinality(ids),0)=0 THEN RAISE EXCEPTION 'SYNC_INVALID'; END IF;
  FOREACH id_value IN ARRAY ids LOOP
   EXECUTE format('SELECT sync_version FROM public.%I WHERE id=$1',table_name) INTO version USING id_value;
   expected:=(p_versiones->table_name->>id_value)::bigint;
   IF version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'SYNC_CONFLICT'; END IF;
  END LOOP;
 END LOOP;
 FOR op IN SELECT value FROM jsonb_array_elements(p_operaciones) LOOP
  table_name:=op->>'table';kind:=op->>'kind';row_data:=op->'row';
  allowed:=CASE table_name
   WHEN 'proyectos' THEN ARRAY['id','empresa_id','cliente_id','nombre','descripcion','direccion','comuna','region','latitud','longitud','lugar_referencia','fecha_inicio','fecha_termino_estimada','estado','monto_cotizado','dias_laborales','fechas_no_laborales']
   WHEN 'clientes' THEN ARRAY['id','empresa_id','rut','nombre','telefono','email','direccion','comuna']
   WHEN 'usuarios' THEN ARRAY['id','empresa_id','nombre','email','telefono_whatsapp','rut','rol','especialidades']
   WHEN 'actividades' THEN ARRAY['id','proyecto_id','responsable_id','nombre','fecha_inicio','fecha_termino','porcentaje_avance','monto_contratado','estado','orden']
   WHEN 'pagos' THEN ARRAY['id','proyecto_id','cliente_id','monto','metodo','estado','fecha','notas','comprobante_url']
   WHEN 'materiales_proyecto' THEN ARRAY['id','proyecto_id','nombre','categoria','cantidad','unidad','precio_unitario','subtotal','proveedor','actividad_id','comprado','pagado']
   WHEN 'bitacora_entradas' THEN ARRAY['id','proyecto_id','usuario_id','autor_nombre','titulo','nota','foto_url','material_id','cantidad_recibida','tipo','fecha']
   WHEN 'imprevistos' THEN ARRAY['id','proyecto_id','descripcion','monto_adicional','fecha_reporte','estado','origen','foto_url','categoria_gasto','usuario_id','cambio_id','asistencia_id']
   WHEN 'reclamos_cambios_obra' THEN ARRAY['id','empresa_id','proyecto_id','reportado_por_id','reportado_por_nombre','tipo','titulo','descripcion','impacto_monto','impacto_dias','estado','foto_url','origen','materiales_requeridos','materiales_inyectados']
   WHEN 'documentos_obra' THEN ARRAY['id','empresa_id','proyecto_id','subido_por_id','subido_por_nombre','categoria','nombre','descripcion','archivo_url','archivo_nombre','archivo_tipo','archivo_tamano','fecha_documento','monto_documento','origen']
   WHEN 'asistencia_obreros' THEN ARRAY['id','empresa_id','proyecto_id','usuario_id','trabajador_nombre','trabajador_rol','fecha','estado','hora_entrada','hora_salida','horas_trabajadas','observacion','origen','registrado_por']
   WHEN 'reportes_whatsapp' THEN ARRAY['id','empresa_id','proyecto_id','telefono','mensaje_recibido','respuesta_enviada','fecha_envio','estado','respuesta_ia','modulo_afectado']
   WHEN 'proyecto_trabajadores' THEN ARRAY['proyecto_id','usuario_id'] END;
  IF kind<>'delete' THEN
   IF jsonb_typeof(row_data)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(row_data) k WHERE k<>ALL(allowed)) THEN RAISE EXCEPTION 'SYNC_FORBIDDEN'; END IF;
   IF row_data ? 'empresa_id' AND row_data->>'empresa_id' IS DISTINCT FROM company THEN RAISE EXCEPTION 'SYNC_FORBIDDEN'; END IF;
   scope_project:=row_data->>'proyecto_id';
   IF scope_project IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.proyectos WHERE id=scope_project AND empresa_id=company) THEN RAISE EXCEPTION 'PROJECT_FORBIDDEN'; END IF;
   FOREACH ref_name IN ARRAY ARRAY['cliente_id','usuario_id','responsable_id','reportado_por_id','subido_por_id','material_id','actividad_id','cambio_id','asistencia_id'] LOOP
    IF nullif(row_data->>ref_name,'') IS NULL THEN CONTINUE; END IF;
    ref_table:=CASE ref_name WHEN 'cliente_id' THEN 'clientes' WHEN 'material_id' THEN 'materiales_proyecto' WHEN 'actividad_id' THEN 'actividades' WHEN 'cambio_id' THEN 'reclamos_cambios_obra' WHEN 'asistencia_id' THEN 'asistencia_obreros' ELSE 'usuarios' END;
    IF ref_table IN ('clientes','usuarios') THEN
     EXECUTE format('SELECT empresa_id FROM public.%I WHERE id=$1',ref_table) INTO ref_company USING row_data->>ref_name;
     IF ref_company IS DISTINCT FROM company THEN RAISE EXCEPTION 'SYNC_FORBIDDEN'; END IF;
    ELSE
     EXECUTE format('SELECT proyecto_id FROM public.%I WHERE id=$1',ref_table) INTO ref_project USING row_data->>ref_name;
     IF ref_project IS DISTINCT FROM scope_project THEN RAISE EXCEPTION 'PROJECT_FORBIDDEN'; END IF;
    END IF;
   END LOOP;
   IF table_name='documentos_obra' AND row_data->>'categoria' IN ('cierre_diario','acta_recepcion') THEN RAISE EXCEPTION 'DOCUMENT_RPC'; END IF;
   SELECT string_agg(format('%I',k),',') INTO cols FROM jsonb_object_keys(row_data) k;
  END IF;
  clause:='true';
  FOR filter IN SELECT value FROM jsonb_array_elements(op->'filters') LOOP
   IF filter->>'column'<>ALL(ARRAY['id','empresa_id','proyecto_id','usuario_id']) OR jsonb_typeof(filter->'values')<>'array' THEN RAISE EXCEPTION 'SYNC_FORBIDDEN'; END IF;
   clause:=clause||format(' AND %I::text = ANY(%L::text[])',filter->>'column',ARRAY(SELECT jsonb_array_elements_text(filter->'values')));
  END LOOP;
  BEGIN
  IF kind='upsert' THEN
   EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) ON CONFLICT (%s) DO UPDATE SET (%s)=(SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1))',table_name,cols,cols,table_name,CASE WHEN table_name='proyecto_trabajadores' THEN 'proyecto_id,usuario_id' ELSE 'id' END,cols,cols,table_name) USING row_data;
  ELSIF kind='update' THEN
   IF clause='true' THEN RAISE EXCEPTION 'SYNC_FORBIDDEN'; END IF;
   EXECUTE format('UPDATE public.%I SET (%s)=(SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1)) WHERE %s',table_name,cols,cols,table_name,clause) USING row_data;
  ELSE
   IF clause='true' THEN RAISE EXCEPTION 'SYNC_FORBIDDEN'; END IF;
   EXECUTE format('DELETE FROM public.%I WHERE %s',table_name,clause);
  END IF;
  EXCEPTION WHEN OTHERS THEN RAISE USING ERRCODE=SQLSTATE,MESSAGE=SQLERRM,DETAIL=jsonb_build_object('table',table_name,'id',row_data->>'id','record',op->>'record')::text; END;
 END LOOP;
 -- Return final revisions, including changes made by triggers on the same rows.
 FOR op IN SELECT value FROM jsonb_array_elements(p_operaciones) LOOP
  table_name:=op->>'table';IF table_name='proyecto_trabajadores' THEN CONTINUE; END IF;
  ids:=CASE WHEN op->>'kind'='upsert' THEN ARRAY[op#>>'{row,id}'] ELSE ARRAY(SELECT jsonb_array_elements_text(f->'values') FROM jsonb_array_elements(op->'filters') f WHERE f->>'column'='id') END;
  FOREACH id_value IN ARRAY ids LOOP
   EXECUTE format('SELECT sync_version FROM public.%I WHERE id=$1',table_name) INTO version USING id_value;
   versions:=versions||jsonb_build_object(table_name,coalesce(versions->table_name,'{}'::jsonb)||jsonb_build_object(id_value,version));
  END LOOP;
 END LOOP;
 result:=jsonb_build_object('success',true,'versiones',versions,'updated_at',now());
 INSERT INTO public.sync_web_batches(empresa_id,actor_id,id,payload_hash,resultado) VALUES(company,actor,p_id,fingerprint,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.sincronizar_lote_web(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sincronizar_lote_web(uuid,jsonb,jsonb) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
