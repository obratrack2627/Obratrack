-- ==============================================================================
-- OBRATRACK - FACTURACIÓN Y SUSCRIPCIONES (FLOW.CL / MULTIPASARELA)
-- Tablas multi-tenant para gestionar suscripciones, historial de pagos e idempotencia.
-- Todas las escrituras son exclusivas de service_role tras verificación criptográfica.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.suscripciones (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    empresa_id TEXT NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
    plan_id VARCHAR(30) NOT NULL DEFAULT 'gratis'
        CHECK (plan_id IN ('gratis', 'pro', 'pro_ia')),
    ciclo VARCHAR(10) NOT NULL DEFAULT 'mensual'
        CHECK (ciclo IN ('mensual', 'anual')),
    modalidad VARCHAR(15) NOT NULL DEFAULT 'recurrente'
        CHECK (modalidad IN ('recurrente', 'prepago')),
    estado VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (estado IN ('pending', 'active', 'past_due', 'canceled', 'expired')),
    pasarela VARCHAR(20) NOT NULL DEFAULT 'flow'
        CHECK (pasarela IN ('flow', 'mercadopago')),
    gateway_customer_id TEXT,
    gateway_subscription_id TEXT,
    card_brand VARCHAR(40),
    card_last4 VARCHAR(4),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pagos_suscripcion (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    suscripcion_id TEXT REFERENCES public.suscripciones(id) ON DELETE SET NULL,
    commerce_order TEXT NOT NULL UNIQUE,
    gateway_payment_id TEXT UNIQUE,
    gateway_token TEXT,
    pasarela VARCHAR(20) NOT NULL DEFAULT 'flow'
        CHECK (pasarela IN ('flow', 'mercadopago')),
    plan_id VARCHAR(30) NOT NULL
        CHECK (plan_id IN ('pro', 'pro_ia')),
    ciclo VARCHAR(10) NOT NULL
        CHECK (ciclo IN ('mensual', 'anual')),
    modalidad VARCHAR(15) NOT NULL DEFAULT 'prepago'
        CHECK (modalidad IN ('recurrente', 'prepago')),
    monto_clp INTEGER NOT NULL CHECK (monto_clp > 0),
    estado VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (estado IN ('pending', 'paid', 'failed', 'refunded', 'canceled')),
    metodo_pago VARCHAR(60),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
    event_key TEXT PRIMARY KEY,
    pasarela VARCHAR(20) NOT NULL CHECK (pasarela IN ('flow', 'mercadopago')),
    event_type VARCHAR(60) NOT NULL,
    payload_resumen JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suscripciones_estado_period_end
    ON public.suscripciones (estado, current_period_end);

CREATE INDEX IF NOT EXISTS idx_suscripciones_gateway_sub_id
    ON public.suscripciones (gateway_subscription_id)
    WHERE gateway_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suscripciones_gateway_cust_id
    ON public.suscripciones (gateway_customer_id)
    WHERE gateway_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_suscripcion_empresa_created
    ON public.pagos_suscripcion (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pagos_suscripcion_suscripcion_id
    ON public.pagos_suscripcion (suscripcion_id);

CREATE INDEX IF NOT EXISTS idx_pagos_suscripcion_gateway_token
    ON public.pagos_suscripcion (gateway_token)
    WHERE gateway_token IS NOT NULL;

ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_suscripcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.suscripciones FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pagos_suscripcion FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_webhook_events FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.suscripciones, public.pagos_suscripcion TO authenticated;
GRANT ALL ON public.suscripciones, public.pagos_suscripcion, public.billing_webhook_events TO service_role;

DROP POLICY IF EXISTS billing_suscripciones_select ON public.suscripciones;
CREATE POLICY billing_suscripciones_select
    ON public.suscripciones
    FOR SELECT
    TO authenticated
    USING (
        empresa_id = (SELECT public.get_auth_empresa_id())
        AND (SELECT public.puede_usar_web())
    );

DROP POLICY IF EXISTS billing_pagos_select ON public.pagos_suscripcion;
CREATE POLICY billing_pagos_select
    ON public.pagos_suscripcion
    FOR SELECT
    TO authenticated
    USING (
        empresa_id = (SELECT public.get_auth_empresa_id())
        AND (SELECT public.puede_usar_web())
    );

DROP POLICY IF EXISTS billing_webhook_events_service ON public.billing_webhook_events;
CREATE POLICY billing_webhook_events_service
    ON public.billing_webhook_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
