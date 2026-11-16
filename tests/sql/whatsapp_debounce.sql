-- Después de whatsapp_debounce_concurrencia.sql. Todos los fixtures terminan en ROLLBACK.
BEGIN;
INSERT INTO public.empresas(id, rut, nombre, plan_id) VALUES('qa-burst-co', '76000888-1', 'Empresa Ráfaga', 'pro_ia');
INSERT INTO public.usuarios(id, empresa_id, nombre, email, rol, telefono_whatsapp, is_dev)
VALUES ('qa-burst-worker', 'qa-burst-co', 'Maestro Ráfaga', 'qa-burst@example.test', 'terreno', '+56981112233', false);

DO $$
DECLARE
  r1 jsonb;
  r2 jsonb;
  r3 jsonb;
  claimed jsonb;
BEGIN
  r1 := public.whatsapp_encolar_mensaje('b-msg-1', 'qa-burst-co', 'qa-burst-worker', '56981112233', '{"id":"b-msg-1","type":"text","text":{"body":"Hola en obra Terraza"}}'::jsonb);
  IF r1->>'status' <> 'leader' THEN RAISE EXCEPTION 'EXPECTED_LEADER: %', r1; END IF;

  r2 := public.whatsapp_encolar_mensaje('b-msg-2', 'qa-burst-co', 'qa-burst-worker', '56981112233', '{"id":"b-msg-2","type":"text","text":{"body":"avanzamos el radier al 80%"}}'::jsonb);
  IF r2->>'status' <> 'queued_for_leader' THEN RAISE EXCEPTION 'EXPECTED_QUEUED: %', r2; END IF;

  r3 := public.whatsapp_encolar_mensaje('b-msg-1', 'qa-burst-co', 'qa-burst-worker', '56981112233', '{"id":"b-msg-1"}'::jsonb);
  IF r3->>'status' <> 'duplicate' THEN RAISE EXCEPTION 'EXPECTED_DUPLICATE: %', r3; END IF;

  claimed := public.whatsapp_estado_cola_actor('qa-burst-co', 'qa-burst-worker', 'batch-1', 0, true);
  IF (claimed->>'ready')::boolean IS NOT TRUE OR jsonb_array_length(claimed->'items') <> 2 THEN
    RAISE EXCEPTION 'EXPECTED_TWO_ITEMS: %', claimed;
  END IF;

  PERFORM public.whatsapp_finalizar_cola_lote('qa-burst-co', 'qa-burst-worker', 'batch-1', 'b-msg-2', 'terreno', '56981112233', true);
  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_mensajes WHERE message_id = 'b-msg-1' AND acciones->>'tipo' = 'agrupado_en_lote') THEN
    RAISE EXCEPTION 'MISSING_SECONDARY_IDEMPOTENCY';
  END IF;
END $$;

ROLLBACK;
