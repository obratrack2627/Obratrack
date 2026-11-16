-- Synthetic fixtures only. Run in disposable/staging DB after 20261116 migrations.
BEGIN;
INSERT INTO public.empresas(id,nombre,plan_id) VALUES('qa-hard-a','QA A','pro_ia'),('qa-hard-b','QA B','pro_ia'),('qa-hard-bill','QA Billing','gratis');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,telefono_whatsapp,rol,auth_user_id) VALUES
 ('qa-hard-admin','qa-hard-a','QA Admin','qa-hard-admin@example.test','+56981999801','admin','80000000-0000-4000-a000-000000000001'),
 ('qa-hard-worker','qa-hard-a','QA Trabajador','qa-hard-worker@example.test','+56981999802','terreno',NULL),
 ('qa-hard-worker2','qa-hard-a','QA Segundo','qa-hard-worker2@example.test','+56981999804','terreno',NULL),
 ('qa-hard-foreign','qa-hard-b','QA Ajeno','qa-hard-foreign@example.test','+56981999803','terreno',NULL);
INSERT INTO public.clientes(id,empresa_id,nombre) VALUES('qa-hard-foreign-client','qa-hard-b','Cliente ajeno');
SELECT set_config('request.jwt.claims','{"sub":"80000000-0000-4000-a000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE ops jsonb; versions jsonb; result jsonb; revision bigint; failed boolean:=false; replay jsonb;
BEGIN
 ops:='[{"table":"proyectos","kind":"upsert","filters":[],"row":{"id":"qa-hard-p","empresa_id":"qa-hard-a","nombre":"Obra QA","fecha_inicio":"2026-11-16","fecha_termino_estimada":"2026-12-16","estado":"activo","monto_cotizado":100000}},{"table":"proyecto_trabajadores","kind":"upsert","filters":[],"row":{"proyecto_id":"qa-hard-p","usuario_id":"qa-hard-worker"}}]';
 result:=public.sincronizar_lote_web('80000000-0000-4000-a000-000000000010',ops,'{}');
 IF NOT (result->>'success')::boolean OR NOT EXISTS(SELECT 1 FROM public.proyecto_trabajadores WHERE proyecto_id='qa-hard-p' AND usuario_id='qa-hard-worker') THEN RAISE EXCEPTION 'SYNC_CREATE_FAILED'; END IF;
 replay:=public.sincronizar_lote_web('80000000-0000-4000-a000-000000000010',ops,'{}');
 IF replay<>result THEN RAISE EXCEPTION 'REPLAY_CHANGED_RESULT'; END IF;
 SELECT sync_version INTO revision FROM public.proyectos WHERE id='qa-hard-p';
 versions:=jsonb_build_object('proyectos',jsonb_build_object('qa-hard-p',revision));
 ops:='[{"table":"proyectos","kind":"update","filters":[{"column":"id","values":["qa-hard-p"]}],"row":{"nombre":"No debe quedar"}},{"table":"proyecto_trabajadores","kind":"delete","filters":[{"column":"proyecto_id","values":["qa-hard-p"]}]},{"table":"proyecto_trabajadores","kind":"upsert","filters":[],"row":{"proyecto_id":"qa-hard-p","usuario_id":"qa-hard-foreign"}}]';
 BEGIN PERFORM public.sincronizar_lote_web('80000000-0000-4000-a000-000000000011',ops,versions);EXCEPTION WHEN raise_exception THEN IF SQLERRM='SYNC_FORBIDDEN' THEN failed:=true;ELSE RAISE;END IF;END;
 IF NOT failed OR NOT EXISTS(SELECT 1 FROM public.proyecto_trabajadores WHERE proyecto_id='qa-hard-p' AND usuario_id='qa-hard-worker') OR (SELECT nombre FROM public.proyectos WHERE id='qa-hard-p')<>'Obra QA' THEN RAISE EXCEPTION 'PARTIAL_ASSIGNMENT_WRITE'; END IF;
 failed:=false;
 ops:='[{"table":"proyectos","kind":"update","filters":[{"column":"id","values":["qa-hard-p"]}],"row":{"nombre":"Cambio A"}}]';
 PERFORM public.sincronizar_lote_web('80000000-0000-4000-a000-000000000012',ops,versions);
 BEGIN PERFORM public.sincronizar_lote_web('80000000-0000-4000-a000-000000000013',ops,versions);EXCEPTION WHEN raise_exception THEN IF SQLERRM='SYNC_CONFLICT' THEN failed:=true;ELSE RAISE;END IF;END;
 IF NOT failed OR (SELECT nombre FROM public.proyectos WHERE id='qa-hard-p')<>'Cambio A' THEN RAISE EXCEPTION 'STALE_WRITE_ACCEPTED'; END IF;
 SELECT sync_version INTO revision FROM public.proyectos WHERE id='qa-hard-p';
 INSERT INTO public.proyecto_trabajadores(proyecto_id,usuario_id) VALUES('qa-hard-p','qa-hard-worker2');failed:=false;
 BEGIN PERFORM public.sincronizar_lote_web('80000000-0000-4000-a000-000000000016',ops,jsonb_build_object('proyectos',jsonb_build_object('qa-hard-p',revision)));EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='SYNC_CONFLICT';END;
 IF NOT failed THEN RAISE EXCEPTION 'ASSIGNMENT_DID_NOT_INVALIDATE_SNAPSHOT';END IF;
 failed:=false;
 BEGIN INSERT INTO public.pagos(id,proyecto_id,monto) VALUES('qa-hard-negative','qa-hard-p',-1000);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'NEGATIVE_PAYMENT_ACCEPTED'; END IF;
 failed:=false;
 SELECT sync_version INTO revision FROM public.proyectos WHERE id='qa-hard-p';
 ops:='[{"table":"proyectos","kind":"update","filters":[{"column":"id","values":["qa-hard-p"]}],"row":{"cliente_id":"qa-hard-foreign-client"}}]';
 BEGIN PERFORM public.sincronizar_lote_web('80000000-0000-4000-a000-000000000014',ops,jsonb_build_object('proyectos',jsonb_build_object('qa-hard-p',revision)));EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='SYNC_FORBIDDEN';END;
 IF NOT failed THEN RAISE EXCEPTION 'FOREIGN_RELATION_ACCEPTED'; END IF;
 failed:=false;
 BEGIN PERFORM public.sincronizar_lote_web('80000000-0000-4000-a000-000000000015','[{"table":"empresas","kind":"upsert","filters":[],"row":{"id":"qa-hard-a","plan_id":"pro"}}]','{}');EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='SYNC_FORBIDDEN';END;
 IF NOT failed THEN RAISE EXCEPTION 'PLAN_WRITE_ACCEPTED'; END IF;
END $$;
RESET ROLE;
-- A channel plan prepared before a concurrent web edit must fail without recording success.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE revision bigint; payload jsonb; failed boolean:=false; BEGIN
 SELECT sync_version INTO revision FROM public.proyectos WHERE id='qa-hard-p';
 payload:=jsonb_build_object('proyectos',jsonb_build_array(jsonb_build_object('id','qa-hard-p','empresa_id','qa-hard-a','nombre','No sobrescribir','sync_version',revision)));
 UPDATE public.proyectos SET nombre='Edición web reciente' WHERE id='qa-hard-p';
 BEGIN PERFORM public.aplicar_lote_copiloto('qa-hard-wa-stale','qa-hard-a','qa-hard-admin','56981999801','Cambiar nombre','Cambiado',null,null,payload,'{}');EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='SYNC_CONFLICT';END;
 IF NOT failed OR (SELECT nombre FROM public.proyectos WHERE id='qa-hard-p')<>'Edición web reciente' OR EXISTS(SELECT 1 FROM public.whatsapp_mensajes WHERE message_id='qa-hard-wa-stale') THEN RAISE EXCEPTION 'WHATSAPP_STALE_WRITE_ACCEPTED';END IF;
 SELECT sync_version INTO revision FROM public.proyectos WHERE id='qa-hard-p';
 payload:=jsonb_build_object('proyectos',jsonb_build_array(jsonb_build_object('id','qa-hard-p','empresa_id','qa-hard-a','nombre','Cambio WhatsApp','fecha_inicio','2026-11-16','fecha_termino_estimada','2026-12-16','estado','activo','monto_cotizado',100000,'sync_version',revision)));
 PERFORM public.aplicar_lote_copiloto('qa-hard-wa-ok','qa-hard-a','qa-hard-admin','56981999801','Cambiar nombre','Cambiado',null,null,payload,'{}');
 -- Redelivery must preserve exactly-once semantics even though its own write advanced the revision.
 PERFORM public.aplicar_lote_copiloto('qa-hard-wa-ok','qa-hard-a','qa-hard-admin','56981999801','Cambiar nombre','Cambiado',null,null,payload,'{}');
 IF (SELECT nombre FROM public.proyectos WHERE id='qa-hard-p')<>'Cambio WhatsApp' OR (SELECT count(*) FROM public.whatsapp_mensajes WHERE message_id='qa-hard-wa-ok')<>1 THEN RAISE EXCEPTION 'WHATSAPP_REPLAY_CHANGED';END IF;
END $$;
RESET ROLE;
UPDATE public.empresas SET plan_id='gratis' WHERE id='qa-hard-a';
SELECT set_config('request.jwt.claims','{"sub":"80000000-0000-4000-a000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE failed boolean:=false; BEGIN
 BEGIN INSERT INTO public.proyectos(id,empresa_id,nombre,fecha_termino_estimada,estado) VALUES('qa-hard-second','qa-hard-a','No permitida','2026-12-16','activo');EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='PLAN_LIMIT';END;
 IF NOT failed THEN RAISE EXCEPTION 'FREE_PLAN_BYPASS'; END IF;
END $$;
RESET ROLE;
INSERT INTO public.pagos_suscripcion(id,empresa_id,commerce_order,gateway_token,plan_id,ciclo,modalidad,monto_clp,estado)
 VALUES('qa-hard-pay','qa-hard-bill','QA-HARD-ORDER','fixture-only','pro','mensual','prepago',12990,'pending');
CREATE FUNCTION public.qa_hard_fail_plan() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='qa-hard-bill' AND current_setting('qa.fail_plan',true)='true' THEN RAISE EXCEPTION 'SIMULATED_PLAN_FAILURE';END IF;RETURN NEW;END $$;
CREATE TRIGGER qa_hard_fail_plan BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.qa_hard_fail_plan();
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE data jsonb; outcome jsonb; period_end timestamptz; failed boolean:=false; BEGIN
 data:='{"empresaId":"qa-hard-bill","planId":"pro","ciclo":"mensual","modalidad":"prepago","pagoId":"qa-hard-pay","expectedAmount":12990,"amount":12990,"status":2,"gatewayPaymentId":"990001","duracionDias":30,"metodoPago":"Fixture"}';
 PERFORM set_config('qa.fail_plan','true',true);
 BEGIN PERFORM public.billing_aplicar_estado_flow('flow:payment:990001:2',data);EXCEPTION WHEN OTHERS THEN failed:=true;END;
 IF NOT failed OR EXISTS(SELECT 1 FROM public.suscripciones WHERE empresa_id='qa-hard-bill') OR EXISTS(SELECT 1 FROM public.billing_webhook_events WHERE event_key='flow:payment:990001:2') OR (SELECT estado FROM public.pagos_suscripcion WHERE id='qa-hard-pay')<>'pending' THEN RAISE EXCEPTION 'BILLING_PARTIAL_COMMIT';END IF;
 PERFORM set_config('qa.fail_plan','false',true);
 outcome:=public.billing_aplicar_estado_flow('flow:payment:990001:2',data);
 IF outcome->>'outcome'<>'paid' OR (SELECT plan_id FROM public.empresas WHERE id='qa-hard-bill')<>'pro' OR (SELECT estado FROM public.pagos_suscripcion WHERE id='qa-hard-pay')<>'paid' THEN RAISE EXCEPTION 'BILLING_RETRY_NOT_RECOVERED';END IF;
 SELECT current_period_end INTO period_end FROM public.suscripciones WHERE empresa_id='qa-hard-bill';
 outcome:=public.billing_aplicar_estado_flow('flow:payment:990001:2',data);
 IF outcome->>'outcome'<>'duplicate' OR (SELECT current_period_end FROM public.suscripciones WHERE empresa_id='qa-hard-bill')<>period_end THEN RAISE EXCEPTION 'BILLING_DOUBLE_EXTENSION';END IF;
END $$;
ROLLBACK;
