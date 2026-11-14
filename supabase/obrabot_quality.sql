BEGIN;
CREATE TABLE IF NOT EXISTS public.obrabot_quality_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
 usuario_id text NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('invalid_action','provider_failure','user_correction','action_cancelled','execution_failure')),
 code text NOT NULL CHECK (code IN ('AI_INVALID_ACTION','ACTION_PLAN_INVALID','AI_TIMEOUT','AI_EMPTY','AI_NETWORK','AI_RATE_LIMIT','AI_UNAVAILABLE','AI_CREDENTIALS','AI_NOT_CONFIGURED','AI_INVALID_RESPONSE','AI_INCOMPLETE','AI_REFUSED','EXECUTION_FAILED','USER_CORRECTION','ACTION_CANCELLED')),
 recovered boolean NOT NULL DEFAULT false,
 attempt smallint NOT NULL DEFAULT 1 CHECK (attempt IN (1,2)),
 action_type text CHECK(action_type IS NULL OR action_type IN ('crear_proyecto','crear_proyecto_completo','actualizar_proyecto','eliminar_proyecto','crear_cliente','actualizar_cliente','actualizar_trabajador','agregar_trabajador','agregar_trabajadores','asignar_trabajador','asignar_trabajadores','desasignar_trabajador','crear_actividad','actualizar_avance','agregar_material','agregar_materiales','actualizar_material','registrar_imprevisto','registrar_pago','crear_bitacora','generar_reporte','agendar_visita','agendar_evento','generar_mensaje_whatsapp','enviar_mensaje_equipo','crear_solicitud_cambio','registrar_asistencia','registrar_documento')),
 channel text NOT NULL DEFAULT 'web' CHECK(channel IN ('web','whatsapp')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obrabot_quality_actor_time ON public.obrabot_quality_events(empresa_id,usuario_id,created_at DESC);
ALTER TABLE public.obrabot_quality_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.obrabot_quality_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.obrabot_quality_events TO authenticated;
GRANT ALL ON public.obrabot_quality_events TO service_role;
DROP POLICY IF EXISTS obrabot_quality_own ON public.obrabot_quality_events;
CREATE POLICY obrabot_quality_own ON public.obrabot_quality_events FOR ALL TO authenticated
 USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=obrabot_quality_events.usuario_id AND u.empresa_id=obrabot_quality_events.empresa_id AND (u.id=auth.uid()::text OR u.auth_user_id=auth.uid()::text)) AND public.puede_usar_web())
 WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=obrabot_quality_events.usuario_id AND u.empresa_id=obrabot_quality_events.empresa_id AND (u.id=auth.uid()::text OR u.auth_user_id=auth.uid()::text)) AND public.puede_usar_web());
COMMIT;
