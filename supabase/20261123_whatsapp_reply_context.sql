BEGIN;
ALTER TABLE public.whatsapp_respuestas_envios
  ADD COLUMN IF NOT EXISTS meta_message_id text,
  ADD COLUMN IF NOT EXISTS source_message_id text,
  ADD COLUMN IF NOT EXISTS presupuesto_ref text;
ALTER TABLE public.whatsapp_mensajes ADD COLUMN IF NOT EXISTS revision_resuelta_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_respuestas_meta_idx
  ON public.whatsapp_respuestas_envios(empresa_id,actor_id,meta_message_id)
  WHERE meta_message_id IS NOT NULL;
COMMIT;
NOTIFY pgrst,'reload schema';
