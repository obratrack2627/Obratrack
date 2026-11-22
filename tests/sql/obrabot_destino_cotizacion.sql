BEGIN;
INSERT INTO public.empresas (id, nombre, plan_id) VALUES
  ('dest-empresa', 'Constructora', 'pro_ia'), ('dest-externa', 'Otra empresa', 'pro_ia'), ('dest-pro', 'Plan Pro', 'pro');
INSERT INTO public.usuarios (id, empresa_id, nombre, rol, auth_user_id) VALUES
  ('dest-admin', 'dest-empresa', 'Administración', 'admin', 'a2394c91-826f-4740-bf4d-a97c6b0a291e'),
  ('dest-supervisor', 'dest-empresa', 'Ana Pérez', 'supervisor', 'd4a6d922-6b9f-4fa0-b770-198887fb8590'),
  ('dest-terreno', 'dest-empresa', 'Juan Soto', 'terreno', NULL),
  ('dest-otro', 'dest-externa', 'Marta Vera', 'admin', NULL),
  ('dest-pro-admin', 'dest-pro', 'Administración Pro', 'admin', NULL);
INSERT INTO public.clientes (id, empresa_id, nombre) VALUES
  ('dest-cliente', 'dest-empresa', 'Consuelo Díaz'), ('dest-cliente-externo', 'dest-externa', 'Cliente ajeno');
INSERT INTO public.proyectos (id, empresa_id, nombre, fecha_termino_estimada, monto_cotizado) VALUES
  ('dest-sin-presupuesto', 'dest-empresa', 'Bodega', CURRENT_DATE, 0),
  ('dest-externo', 'dest-externa', 'Externa', CURRENT_DATE, 0),
  ('dest-zero', 'dest-empresa', 'Garantía', CURRENT_DATE, 0),
  ('dest-manual', 'dest-empresa', 'Presupuesto manual', CURRENT_DATE, 95000);
INSERT INTO public.presupuesto_grupos (id, empresa_id, proyecto_id, nombre, aplicado, monto_aplicado)
VALUES ('dest-zero-presupuesto','dest-empresa','dest-zero','Sin cobro',true,0);

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  ids uuid[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,8));
  cot_id uuid;
  created jsonb;
  output jsonb;
  vista jsonb;
  p jsonb;
  obra text;
  monto int := 0;
BEGIN
  FOREACH cot_id IN ARRAY ids LOOP
    monto := monto + 119000;
    PERFORM public.obrabot_registrar_cotizacion('dest-empresa','dest-admin',cot_id,'plataforma',
      jsonb_build_object('titulo_proyecto','Terraza Las Palmas','estructura_financiera',jsonb_build_object('precio_total_con_iva',monto)));
    PERFORM public.obrabot_revisar_cotizacion('dest-empresa','dest-admin',cot_id,1,'aprobar');
  END LOOP;
  BEGIN
    PERFORM public.obrabot_destinar_cotizacion('dest-empresa','dest-supervisor','whatsapp',ids[1],'estado');
    RAISE EXCEPTION 'SUPERVISOR_CAN_READ';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OBRABOT_FORBIDDEN' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.obrabot_destinar_cotizacion('dest-pro','dest-pro-admin','plataforma',ids[1],'estado');
    RAISE EXCEPTION 'PLAN_PRO_ALLOWED_ACTION';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OBRABOT_FORBIDDEN' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.obrabot_destinar_cotizacion('dest-externa','dest-otro','whatsapp',ids[1],'estado');
    RAISE EXCEPTION 'CROSS_TENANT_QUOTE';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OBRABOT_NOT_FOUND' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[1],'vista','{"proyecto":"dest-externo"}');
    RAISE EXCEPTION 'CROSS_TENANT_PROJECT';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OBRABOT_PROJECT_MISSING' THEN RAISE; END IF; END;

  p := '{"direccion":"Av. Las Palmas 123","cliente":"Consuelo Diaz","equipo":["Ana Perez","Juan Soto","Sin ficha"]}';
  created := public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[1],'crear',p);
  obra := created->>'proyecto_id';
  IF (created->>'monto_nuevo')::numeric <> 119000 OR created->'equipo' <> '["Ana Pérez","Juan Soto"]'
    OR created->'equipo_pendiente' <> '["Sin ficha"]' OR NOT EXISTS (
      SELECT 1 FROM public.proyectos WHERE id=obra AND nombre='Terraza Las Palmas' AND estado='pendiente'
        AND programacion_pendiente AND cliente_id='dest-cliente' AND direccion='Av. Las Palmas 123') THEN
    RAISE EXCEPTION 'PROJECT_CREATION_BAD %',created;
  END IF;
  output := public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','plataforma',ids[1],'crear',p);
  IF output->>'proyecto_id' <> obra OR output->>'ya_vinculada' <> 'true' THEN RAISE EXCEPTION 'CREATE_NOT_IDEMPOTENT'; END IF;
  UPDATE public.proyectos SET fecha_termino_estimada=fecha_inicio + 3 WHERE id=obra;
  IF (SELECT programacion_pendiente FROM public.proyectos WHERE id=obra) THEN RAISE EXCEPTION 'SCHEDULE_STAYED_PENDING'; END IF;
  PERFORM public.obrabot_equipo_cotizacion('dest-empresa','dest-admin',obra,'["Juan Soto"]');
  IF (SELECT count(*) FROM public.proyecto_trabajadores WHERE proyecto_id=obra) <> 2 THEN RAISE EXCEPTION 'DUPLICATE_TEAM'; END IF;

  vista := public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','plataforma',ids[2],'vista',jsonb_build_object('proyecto',obra));
  p := jsonb_build_object('proyecto',obra,'version',vista->>'version','cabecera',vista->>'cabecera');
  UPDATE public.proyectos SET direccion='Av. Las Palmas 125' WHERE id=obra;
  BEGIN
    PERFORM public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','plataforma',ids[2],'adicional',p);
    RAISE EXCEPTION 'STALE_APPLIED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OBRABOT_DESTINATION_STALE' THEN RAISE; END IF; END;
  vista := public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','plataforma',ids[2],'vista',jsonb_build_object('proyecto',obra));
  p := jsonb_build_object('proyecto',obra,'version',vista->>'version','cabecera',vista->>'cabecera');
  output := public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','plataforma',ids[2],'adicional',p);
  IF (output->>'monto_nuevo')::numeric <> 357000 THEN RAISE EXCEPTION 'ADDITIONAL_AMOUNT_WRONG %',output; END IF;
  PERFORM public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[2],'adicional',p);
  IF (SELECT monto_cotizado FROM public.proyectos WHERE id=obra) <> 357000 THEN RAISE EXCEPTION 'ADDITIONAL_REPLAY_DUPLICATED'; END IF;

  vista := public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[3],'vista',jsonb_build_object('proyecto',obra));
  p := jsonb_build_object('proyecto',obra,'version',vista->>'version','cabecera',vista->>'cabecera');
  IF (vista->>'monto_reemplazo')::numeric <> 595000 THEN RAISE EXCEPTION 'REPLACEMENT_PREVIEW_WRONG %',vista; END IF;
  output := public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[3],'reemplazar',p);
  IF (output->>'monto_nuevo')::numeric <> 595000 OR NOT EXISTS (
    SELECT 1 FROM public.obrabot_destinos_cotizacion WHERE cotizacion_id=ids[3] AND principal_anterior=119000
      AND grupo_reemplazado='obrabot-v2:'||ids[1]) OR NOT EXISTS (
    SELECT 1 FROM public.presupuesto_grupos WHERE id='obrabot-v2:'||ids[1] AND obrabot_reemplazado AND NOT aplicado) THEN
    RAISE EXCEPTION 'REPLACEMENT_WRONG %',output;
  END IF;
  BEGIN
    UPDATE public.presupuesto_grupos SET aplicado=true WHERE id='obrabot-v2:'||ids[1];
    RAISE EXCEPTION 'ARCHIVE_REACTIVATED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OBRABOT_DESTINATION_LOCKED' THEN RAISE; END IF; END;

  vista := public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[4],'vista',jsonb_build_object('proyecto',obra));
  p := jsonb_build_object('proyecto',obra,'version',vista->>'version','cabecera',vista->>'cabecera');
  output := public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[4],'adjuntar',p);
  IF (output->>'monto_nuevo')::numeric <> 595000 OR NOT EXISTS (
    SELECT 1 FROM public.presupuestos WHERE id='obrabot-v2:'||ids[4] AND proyecto_id=obra AND grupo_id IS NULL) THEN
    RAISE EXCEPTION 'ATTACH_WRONG %',output;
  END IF;
  BEGIN
    PERFORM public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[4],'adicional',p);
    RAISE EXCEPTION 'DOCUMENT_REUSED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OBRABOT_ALREADY_LINKED' THEN RAISE; END IF; END;

  vista := public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[5],'vista','{"proyecto":"dest-sin-presupuesto"}');
  IF vista->>'tiene_presupuesto' <> 'false' THEN RAISE EXCEPTION 'EMPTY_BUDGET_WRONG'; END IF;
  p := jsonb_build_object('proyecto','dest-sin-presupuesto','version',vista->>'version','cabecera',vista->>'cabecera');
  output := public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[5],'principal',p);
  IF (output->>'monto_nuevo')::numeric <> 595000 THEN RAISE EXCEPTION 'PRINCIPAL_WRONG %',output; END IF;
  vista := public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[6],'vista','{"proyecto":"dest-zero"}');
  IF vista->>'tiene_presupuesto' <> 'true' THEN RAISE EXCEPTION 'EXPLICIT_ZERO_AS_EMPTY'; END IF;
  vista := public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[6],'vista','{"proyecto":"dest-manual"}');
  IF vista->>'tiene_presupuesto' <> 'true' OR (vista->>'monto_reemplazo')::numeric <> 714000 THEN RAISE EXCEPTION 'MANUAL_BUDGET_WRONG'; END IF;

  BEGIN
    PERFORM public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[7],'crear',
      '{"direccion":"Av. Los Pinos 321","cliente":"Cliente Nuevo"}');
    RAISE EXCEPTION 'INCOMPLETE_CLIENT_ACCEPTED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OBRABOT_CLIENT_REQUIRED' THEN RAISE; END IF; END;
  PERFORM public.obrabot_destinar_cotizacion('dest-empresa','dest-admin','whatsapp',ids[7],'crear',
    '{"nombre":"Quincho","direccion":"Av. Los Pinos 321","cliente":"Cliente Nuevo","telefono":"912345678","correo":"persona@example.test"}');
  IF NOT EXISTS (SELECT 1 FROM public.clientes c JOIN public.proyectos p ON p.cliente_id=c.id
    WHERE c.empresa_id='dest-empresa' AND c.rut IS NULL AND c.email='persona@example.test' AND p.nombre='Quincho') THEN
    RAISE EXCEPTION 'NEW_CLIENT_WRONG';
  END IF;
END;
$$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
UPDATE public.usuarios SET is_dev = true WHERE id = 'dest-supervisor';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"d4a6d922-6b9f-4fa0-b770-198887fb8590"}',true);
DO $$
DECLARE protected_id text := 'obrabot-v2:00000000-0000-0000-0000-000000000000';
BEGIN
  IF EXISTS (SELECT 1 FROM public.presupuesto_grupos WHERE id LIKE 'obrabot-v2:%') THEN RAISE EXCEPTION 'GROUP_FINANCE_VISIBLE'; END IF;
  BEGIN
    PERFORM 1 FROM public.obrabot_destinos_cotizacion;
    RAISE EXCEPTION 'DESTINATION_AUDIT_VISIBLE';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.seleccionar_presupuesto(protected_id, NULL, '{}'::jsonb);
    RAISE EXCEPTION 'LEGACY_ACTION_UNGUARDED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'BUDGET_FORBIDDEN' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.seleccionar_presupuesto_legacy(protected_id, NULL, '{}'::jsonb);
    RAISE EXCEPTION 'LEGACY_RPC_EXPOSED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
