-- Aditiva. Confirmación transaccional tras verificar Flow en servidor.
BEGIN;
ALTER TABLE public.pagos_suscripcion ADD COLUMN IF NOT EXISTS registro_flow_resultado jsonb;
ALTER TABLE public.billing_webhook_events ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.billing_activar_suscripcion(p_datos jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE company public.empresas; sub public.suscripciones; pay public.pagos_suscripcion; start_at timestamptz; end_at timestamptz; paid_before boolean:=false;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BILLING_FORBIDDEN'; END IF;
 SELECT * INTO company FROM public.empresas WHERE id=p_datos->>'empresaId' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BILLING_COMPANY_NOT_FOUND'; END IF;
 IF p_datos->>'planId' NOT IN ('pro','pro_ia') OR p_datos->>'ciclo' NOT IN ('mensual','anual') OR p_datos->>'modalidad' NOT IN ('prepago','recurrente') OR (p_datos->>'duracionDias')::integer NOT IN (30,365) THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 SELECT * INTO sub FROM public.suscripciones WHERE empresa_id=company.id FOR UPDATE;
 IF nullif(p_datos->>'pagoId','') IS NOT NULL THEN
  SELECT * INTO pay FROM public.pagos_suscripcion WHERE id=p_datos->>'pagoId' AND empresa_id=company.id FOR UPDATE;
  IF NOT FOUND OR pay.plan_id IS DISTINCT FROM p_datos->>'planId' OR pay.ciclo IS DISTINCT FROM p_datos->>'ciclo' THEN RAISE EXCEPTION 'BILLING_PAYMENT_CONFLICT'; END IF;
  paid_before:=pay.estado='paid';
  IF paid_before AND pay.gateway_payment_id IS DISTINCT FROM p_datos->>'gatewayPaymentId' THEN RAISE EXCEPTION 'BILLING_PAYMENT_CONFLICT'; END IF;
 END IF;
 IF paid_before THEN
  -- Recuperar eventos antiguos sin extender de nuevo la vigencia ni reactivar un plan expirado.
  IF sub.estado='active' AND sub.current_period_end>now() AND company.plan_id<>'ilimitado' THEN UPDATE public.empresas SET plan_id=sub.plan_id,updated_at=now() WHERE id=company.id; END IF;
  RETURN jsonb_build_object('outcome','duplicate','idempotent',true);
 END IF;
 start_at:=coalesce(nullif(p_datos->>'periodStartIso','')::timestamptz,now());
 end_at:=coalesce(nullif(p_datos->>'periodEndIso','')::timestamptz,
  greatest(start_at,CASE WHEN sub.estado='active' AND sub.plan_id=p_datos->>'planId' AND p_datos->>'modalidad'='prepago' THEN sub.current_period_end ELSE start_at END)+(p_datos->>'duracionDias')::integer*interval '1 day');
 IF end_at<=start_at THEN RAISE EXCEPTION 'BILLING_PERIOD_INVALID'; END IF;
 INSERT INTO public.suscripciones(empresa_id,plan_id,ciclo,modalidad,estado,pasarela,gateway_customer_id,gateway_subscription_id,card_brand,card_last4,current_period_start,current_period_end,cancel_at_period_end)
 VALUES(company.id,p_datos->>'planId',p_datos->>'ciclo',p_datos->>'modalidad','active','flow',coalesce(p_datos->>'gatewayCustomerId',sub.gateway_customer_id),coalesce(p_datos->>'gatewaySubscriptionId',CASE WHEN p_datos->>'modalidad'='prepago' THEN NULL ELSE sub.gateway_subscription_id END),coalesce(p_datos->>'cardBrand',sub.card_brand),coalesce(p_datos->>'cardLast4',sub.card_last4),start_at,end_at,false)
 ON CONFLICT(empresa_id) DO UPDATE SET plan_id=excluded.plan_id,ciclo=excluded.ciclo,modalidad=excluded.modalidad,estado=excluded.estado,gateway_customer_id=excluded.gateway_customer_id,gateway_subscription_id=excluded.gateway_subscription_id,card_brand=excluded.card_brand,card_last4=excluded.card_last4,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,cancel_at_period_end=false,updated_at=now() RETURNING * INTO sub;
 IF pay.id IS NOT NULL THEN UPDATE public.pagos_suscripcion SET suscripcion_id=sub.id,gateway_payment_id=p_datos->>'gatewayPaymentId',estado='paid',metodo_pago=p_datos->>'metodoPago',paid_at=now(),updated_at=now() WHERE id=pay.id; END IF;
 IF company.plan_id<>'ilimitado' THEN UPDATE public.empresas SET plan_id=sub.plan_id,updated_at=now() WHERE id=company.id; END IF;
 RETURN jsonb_build_object('outcome','paid');
END $$;
REVOKE ALL ON FUNCTION public.billing_activar_suscripcion(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billing_activar_suscripcion(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.billing_aplicar_estado_flow(p_evento text,p_datos jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE event public.billing_webhook_events; pay public.pagos_suscripcion; status integer; result jsonb; paid_amount numeric; expected numeric; input jsonb:=p_datos;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BILLING_FORBIDDEN'; END IF;
 status:=(p_datos->>'status')::integer;
 IF p_evento IS DISTINCT FROM 'flow:payment:'||(p_datos->>'gatewayPaymentId')||':'||status OR status NOT IN (1,2,3,4) THEN RAISE EXCEPTION 'BILLING_EVENT_INVALID'; END IF;
 -- El bloqueo de empresa serializa pagos distintos, además del mismo evento.
 PERFORM 1 FROM public.empresas WHERE id=p_datos->>'empresaId' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BILLING_COMPANY_NOT_FOUND'; END IF;
 INSERT INTO public.billing_webhook_events(event_key,pasarela,event_type,payload_resumen) VALUES(p_evento,'flow','payment.status',jsonb_build_object('empresa_id',p_datos->>'empresaId','flow_order',p_datos->>'gatewayPaymentId','status',status)) ON CONFLICT DO NOTHING;
 SELECT * INTO event FROM public.billing_webhook_events WHERE event_key=p_evento FOR UPDATE;
 IF event.completed THEN RETURN jsonb_build_object('outcome','duplicate','idempotent',true); END IF;
 IF nullif(p_datos->>'pagoId','') IS NOT NULL THEN
  SELECT * INTO pay FROM public.pagos_suscripcion WHERE id=p_datos->>'pagoId' AND empresa_id=p_datos->>'empresaId' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BILLING_PAYMENT_CONFLICT'; END IF;
 ELSE
  SELECT * INTO pay FROM public.pagos_suscripcion WHERE gateway_payment_id=p_datos->>'gatewayPaymentId' FOR UPDATE;
  IF FOUND AND pay.empresa_id IS DISTINCT FROM p_datos->>'empresaId' THEN RAISE EXCEPTION 'BILLING_PAYMENT_CONFLICT'; END IF;
 END IF;
 IF status=2 THEN
  paid_amount:=(p_datos->>'amount')::numeric;expected:=coalesce(pay.monto_clp,(p_datos->>'expectedAmount')::numeric);
  IF paid_amount IS NULL OR paid_amount<=0 OR paid_amount<>trunc(paid_amount) OR paid_amount IS DISTINCT FROM expected THEN RAISE EXCEPTION 'BILLING_AMOUNT_MISMATCH'; END IF;
  IF pay.id IS NULL THEN
   INSERT INTO public.pagos_suscripcion(empresa_id,commerce_order,gateway_payment_id,gateway_token,pasarela,plan_id,ciclo,modalidad,monto_clp,estado)
    VALUES(p_datos->>'empresaId',p_datos->>'commerceOrder',p_datos->>'gatewayPaymentId',p_datos->>'gatewayToken','flow',p_datos->>'planId',p_datos->>'ciclo',p_datos->>'modalidad',paid_amount,'pending') RETURNING * INTO pay;
  END IF;
  input:=input||jsonb_build_object('pagoId',pay.id);
  result:=public.billing_activar_suscripcion(input);
 ELSE
  IF status IN (3,4) THEN
   UPDATE public.pagos_suscripcion SET estado=CASE WHEN status=3 THEN 'failed' ELSE 'canceled' END,gateway_payment_id=p_datos->>'gatewayPaymentId',updated_at=now() WHERE id=pay.id AND estado NOT IN ('paid','refunded');
   IF status=3 AND coalesce((p_datos->>'isRenewal')::boolean,false) THEN UPDATE public.suscripciones SET estado='past_due',updated_at=now() WHERE empresa_id=p_datos->>'empresaId' AND estado='active' AND current_period_end<=now(); END IF;
  END IF;
  result:=jsonb_build_object('outcome',CASE status WHEN 3 THEN 'failed' WHEN 4 THEN 'canceled' ELSE 'pending' END);
 END IF;
 UPDATE public.billing_webhook_events SET completed=true,processed_at=now() WHERE event_key=p_evento;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.billing_aplicar_estado_flow(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billing_aplicar_estado_flow(text,jsonb) TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
