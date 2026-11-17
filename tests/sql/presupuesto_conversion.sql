-- Verifica conversión atómica de cotización a obra y eliminación segura de reportes WhatsApp.
BEGIN;
INSERT INTO public.empresas(id, rut, nombre, plan_id) VALUES
  ('qa-conv-a', '76000911-3', 'Constructora Conversión A', 'pro_ia'),
  ('qa-conv-b', '76000912-1', 'Constructora Conversión B', 'pro_ia');

INSERT INTO public.usuarios(id, empresa_id, nombre, email, rol, auth_user_id, telefono_whatsapp, is_dev) VALUES
  ('qa-conv-admin', 'qa-conv-a', 'Admin Conv', 'qa-conv-admin@example.test', 'admin', '91000000-0000-0000-0000-000000000001', '+56981999111', false),
  ('qa-conv-admin-b', 'qa-conv-b', 'Admin B', 'qa-conv-b@example.test', 'admin', '91000000-0000-0000-0000-000000000002', '+56981999222', false);

INSERT INTO public.presupuestos(id, empresa_id, creado_por, origen, cotizacion) VALUES
  (
    'cot-qa-1',
    'qa-conv-a',
    'qa-conv-admin',
    'plataforma',
    '{"id":"cot-qa-1","titulo_proyecto":"Radier terraza","estructura_financiera":{"precio_total_con_iva":1190000}}'::jsonb
  );

INSERT INTO public.whatsapp_mensajes(message_id, empresa_id, actor_id, sender_phone, texto, respuesta) VALUES
  ('wa-rep-a', 'qa-conv-a', 'qa-conv-admin', '+56981999111', 'Avance radier', 'Registrado'),
  ('wa-rep-b', 'qa-conv-b', 'qa-conv-admin-b', '+56981999222', 'Avance ajeno', 'Registrado');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_version text;
  res jsonb;
BEGIN
  SELECT updated_at::text INTO v_version FROM public.presupuestos WHERE id = 'cot-qa-1';
  res := public.convertir_presupuesto_obra(
    'cot-qa-1',
    v_version,
    jsonb_build_object(
      'proyectos', jsonb_build_array(jsonb_build_object(
        'id', 'p-qa-conv-1',
        'empresa_id', 'qa-conv-a',
        'nombre', 'Radier terraza',
        'fecha_inicio', '2026-11-17',
        'fecha_termino_estimada', '2026-11-24',
        'estado', 'activo',
        'monto_cotizado', 1190000
      )),
      'actividades', jsonb_build_array(jsonb_build_object(
        'id', 'act-qa-conv-1',
        'proyecto_id', 'p-qa-conv-1',
        'nombre', 'Excavación y compactación',
        'fecha_inicio', '2026-11-17',
        'fecha_termino', '2026-11-20',
        'porcentaje_avance', 0,
        'estado', 'pendiente',
        'orden', 1
      )),
      'materiales_proyecto', jsonb_build_array(jsonb_build_object(
        'id', 'mat-qa-conv-1',
        'proyecto_id', 'p-qa-conv-1',
        'nombre', 'Hormigón H25',
        'categoria', 'Obra gruesa',
        'cantidad', 3,
        'unidad', 'm3',
        'precio_unitario', 95000,
        'subtotal', 285000,
        'proveedor', 'Sodimac',
        'comprado', false
      )),
      'bitacora_entradas', jsonb_build_array(jsonb_build_object(
        'id', 'bit-qa-conv-1',
        'proyecto_id', 'p-qa-conv-1',
        'usuario_id', 'qa-conv-admin',
        'autor_nombre', 'Admin Conv',
        'titulo', 'Inicio desde presupuesto',
        'nota', 'Conversión verificada',
        'fecha', '2026-11-17',
        'tipo', 'avance'
      ))
    )
  );
  IF res#>>'{proyecto,id}' IS DISTINCT FROM 'p-qa-conv-1' THEN
    RAISE EXCEPTION 'CONVERSION_FAILED';
  END IF;

  DELETE FROM public.whatsapp_mensajes WHERE message_id = 'wa-rep-a';
  IF EXISTS (SELECT 1 FROM public.whatsapp_mensajes WHERE message_id = 'wa-rep-a') THEN
    RAISE EXCEPTION 'REPORT_DELETE_FAILED';
  END IF;

  DELETE FROM public.whatsapp_mensajes WHERE message_id = 'wa-rep-b';
END $$;

RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_mensajes WHERE message_id = 'wa-rep-b') THEN
    RAISE EXCEPTION 'FOREIGN_REPORT_DELETED';
  END IF;
END $$;

ROLLBACK;
