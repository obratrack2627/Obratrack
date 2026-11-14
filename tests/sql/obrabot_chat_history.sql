BEGIN;
INSERT INTO public.empresas(id,rut,nombre,plan_id) VALUES('qa-chat-a','76000721-9','Chat A','pro_ia'),('qa-chat-b','76000722-7','Chat B','pro_ia');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol,auth_user_id,is_dev) VALUES
 ('qa-chat-user','qa-chat-a','Admin Chat','qa-chat-user@example.test','admin','95000000-0000-0000-0000-000000000001',false),
 ('qa-chat-other','qa-chat-b','Otro Chat','qa-chat-other@example.test','admin','95000000-0000-0000-0000-000000000002',false),
 ('qa-chat-colleague','qa-chat-a','Colega Chat','qa-chat-colleague@example.test','admin','95000000-0000-0000-0000-000000000003',false);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='95000000-0000-0000-0000-000000000001';
SELECT public.sync_obrabot_chat();
SELECT public.sync_obrabot_chat(0,'[{"id":"m1","remitente":"usuario","texto":"Consulta de prueba"}]',false);
SELECT public.sync_obrabot_chat(0,'[{"id":"m1","remitente":"usuario","texto":"No reemplazar"}]',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.obrabot_chat_messages)<>1 THEN RAISE EXCEPTION 'CHAT_DUPLICATE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.obrabot_chat_messages WHERE payload->>'texto'='Consulta de prueba') THEN RAISE EXCEPTION 'CHAT_OVERWRITE'; END IF;
END $$;
SET LOCAL request.jwt.claim.sub='95000000-0000-0000-0000-000000000002';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.obrabot_chat_messages) OR EXISTS(SELECT 1 FROM public.obrabot_chat_sessions) THEN RAISE EXCEPTION 'CHAT_TENANT_LEAK'; END IF;
END $$;
SELECT public.sync_obrabot_chat();
SET LOCAL request.jwt.claim.sub='95000000-0000-0000-0000-000000000003';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.obrabot_chat_messages) OR EXISTS(SELECT 1 FROM public.obrabot_chat_sessions) THEN RAISE EXCEPTION 'CHAT_COLLEAGUE_LEAK'; END IF;
END $$;
SET LOCAL request.jwt.claim.sub='95000000-0000-0000-0000-000000000001';
SELECT public.sync_obrabot_chat(0,'[]',true);
DO $$ DECLARE result jsonb; BEGIN
 result:=public.sync_obrabot_chat(0,'[{"id":"stale","remitente":"usuario","texto":"No restaurar"}]',false);
 IF result->>'conflict'<>'true' OR jsonb_array_length(result->'messages')<>0 THEN RAISE EXCEPTION 'CHAT_STALE_RESURRECTION'; END IF;
END $$;
DO $$ DECLARE batch jsonb;recent jsonb;older jsonb; BEGIN
 SELECT jsonb_agg(jsonb_build_object('id','legacy-'||i,'remitente','usuario','texto','Mensaje '||i,'created_at','2026-11-01'::timestamptz+i*interval '1 second')) INTO batch FROM generate_series(1,100) i;
 PERFORM public.sync_obrabot_chat(1,batch,false);
 SELECT jsonb_agg(jsonb_build_object('id','legacy-'||i,'remitente','usuario','texto','Mensaje '||i,'created_at','2026-11-01'::timestamptz+i*interval '1 second')) INTO batch FROM generate_series(101,150) i;
 recent:=public.sync_obrabot_chat(1,batch,false);
 IF jsonb_array_length(recent->'messages')<>100 THEN RAISE EXCEPTION 'CHAT_RECENT_PAGE_SIZE'; END IF;
 older:=public.read_obrabot_chat_page((recent->'messages'->0->>'created_at')::timestamptz,recent->'messages'->0->>'id');
 IF jsonb_array_length(older->'messages')<>50 THEN RAISE EXCEPTION 'CHAT_LEGACY_LOST'; END IF;
END $$;
ROLLBACK;
