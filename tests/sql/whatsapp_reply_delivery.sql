BEGIN;
INSERT INTO public.empresas(id,nombre,plan_id) VALUES('qa-delivery','QA Delivery','pro_ia');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol) VALUES('qa-delivery-admin','qa-delivery','QA Admin','delivery@example.test','admin');
INSERT INTO public.whatsapp_mensajes(message_id,empresa_id,actor_id,sender_phone,texto,respuesta,acciones,created_at) VALUES
 ('qa-inbound','qa-delivery','qa-delivery-admin','56981000111','Prueba','Respuesta','{}',now()),
 ('qa-old','qa-delivery','qa-delivery-admin','56981000111','Antiguo','No reenviar','{}',now()-interval '1 hour');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE result jsonb; BEGIN
 result:=public.whatsapp_reservar_respuesta(repeat('a',64),'qa-delivery','qa-delivery-admin','qa-inbound');
 IF result->>'claimed'<>'true' THEN RAISE EXCEPTION 'CLAIM_FAILED';END IF;
 result:=public.whatsapp_reservar_respuesta(repeat('a',64),'qa-delivery','qa-delivery-admin','qa-inbound');
 IF result->>'claimed'<>'false' THEN RAISE EXCEPTION 'CONCURRENT_RESEND';END IF;
 PERFORM public.whatsapp_finalizar_respuesta(repeat('a',64),'accepted');
 result:=public.whatsapp_reservar_respuesta(repeat('a',64),'qa-delivery','qa-delivery-admin','qa-inbound');
 IF result->>'claimed'<>'false' OR result->>'accepted'<>'true' THEN RAISE EXCEPTION 'ACCEPTED_RESEND';END IF;
 result:=public.whatsapp_reservar_respuesta(repeat('b',64),'qa-delivery','qa-delivery-admin','qa-old');
 IF result->>'claimed'<>'false' THEN RAISE EXCEPTION 'STALE_RESEND';END IF;
 result:=public.whatsapp_reservar_respuesta(repeat('c',64),'qa-delivery','qa-delivery-admin','qa-inbound');
 PERFORM public.whatsapp_finalizar_respuesta(repeat('c',64),'failed');
 result:=public.whatsapp_reservar_respuesta(repeat('c',64),'qa-delivery','qa-delivery-admin','qa-inbound');
 IF result->>'claimed'<>'true' THEN RAISE EXCEPTION 'DEFINITE_REJECTION_CANNOT_RETRY';END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.whatsapp_finalizar_respuesta(repeat('a',64),'failed');EXCEPTION WHEN insufficient_privilege THEN RETURN;END;
 RAISE EXCEPTION 'CLIENT_CAN_RELEASE_DELIVERY';
END $$;
ROLLBACK;
