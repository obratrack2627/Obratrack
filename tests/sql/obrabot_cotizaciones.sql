BEGIN;
INSERT INTO public.empresas(id,nombre,plan_id) VALUES
  ('quote-a','Constructora A','pro_ia'), ('quote-b','Constructora B','pro_ia');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol,telefono_whatsapp) VALUES
  ('quote-admin','quote-a','Administración','quote-admin@example.test','admin','+56981999801'),
  ('quote-supervisor','quote-a','Supervisor','quote-supervisor@example.test','supervisor','+56981999802'),
  ('quote-other','quote-b','Administración externa','quote-other@example.test','admin','+56981999803');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
 draft_id uuid := 'f07578c0-8907-11ef-ae2c-2d8c2fb6ae81';
 draft jsonb := '{"id":"cot-obrabot-test-01","titulo_proyecto":"Terraza","tratamiento_iva":"incluido","estructura_financiera":{"precio_total_con_iva":119000}}';
 result public.obrabot_cotizaciones;
BEGIN
 PERFORM public.obrabot_registrar_cotizacion('quote-a','quote-supervisor',draft_id,'whatsapp',draft);
 PERFORM public.obrabot_registrar_cotizacion('quote-a','quote-supervisor',draft_id,'whatsapp',draft);
 IF EXISTS(SELECT 1 FROM public.presupuestos WHERE id='obrabot-v2:' || draft_id) THEN RAISE EXCEPTION 'DRAFT_BECAME_FINANCIAL_RECORD'; END IF;
 IF (SELECT count(*) FROM public.whatsapp_envios WHERE destinatario_id='quote-admin') <> 1 OR EXISTS(SELECT 1 FROM public.whatsapp_envios WHERE destinatario_id='quote-other') THEN RAISE EXCEPTION 'ALERT_SCOPE_OR_DUPLICATE'; END IF;
 BEGIN
  PERFORM public.obrabot_revisar_cotizacion('quote-a','quote-supervisor',draft_id,1,'aprobar');
  RAISE EXCEPTION 'SUPERVISOR_APPROVED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OBRABOT_FORBIDDEN' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.obrabot_revisar_cotizacion('quote-b','quote-other',draft_id,1,'aprobar');
  RAISE EXCEPTION 'CROSS_TENANT_APPROVAL';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OBRABOT_NOT_FOUND' THEN RAISE; END IF; END;
 result := public.obrabot_revisar_cotizacion('quote-a','quote-admin',draft_id,1,'corregir',jsonb_set(draft,'{estructura_financiera,precio_total_con_iva}','238000'));
 IF result.revision <> 2 THEN RAISE EXCEPTION 'REVISION_NOT_UPDATED'; END IF;
 BEGIN
  PERFORM public.obrabot_revisar_cotizacion('quote-a','quote-admin',draft_id,1,'aprobar');
  RAISE EXCEPTION 'STALE_APPROVAL';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OBRABOT_STALE' THEN RAISE; END IF; END;
 result := public.obrabot_revisar_cotizacion('quote-a','quote-admin',draft_id,2,'aprobar');
 PERFORM public.obrabot_revisar_cotizacion('quote-a','quote-admin',draft_id,2,'aprobar');
 IF result.estado <> 'aprobada' OR result.aprobado_por <> 'quote-admin' OR NOT EXISTS(
  SELECT 1 FROM public.presupuestos WHERE id=result.presupuesto_id AND estado='aprobada' AND cotizacion=result.borrador AND cotizacion #>> '{estructura_financiera,precio_total_con_iva}' = '238000'
 ) THEN RAISE EXCEPTION 'APPROVAL_NOT_ATOMIC'; END IF;
END;
$$;
RESET ROLE;
UPDATE public.usuarios SET auth_user_id = '8397ab90-875a-403b-9128-1e5268afd7e0' WHERE id = 'quote-supervisor';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"8397ab90-875a-403b-9128-1e5268afd7e0"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.presupuestos WHERE id LIKE 'obrabot-v2:%') THEN RAISE EXCEPTION 'SUPERVISOR_CAN_READ_APPROVED_BUDGET'; END IF;
 BEGIN
  PERFORM 1 FROM public.obrabot_cotizaciones;
  RAISE EXCEPTION 'DRAFTS_EXPOSED_TO_CLIENT';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
