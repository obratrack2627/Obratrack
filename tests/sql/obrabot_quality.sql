BEGIN;
INSERT INTO public.empresas(id,rut,nombre,plan_id) VALUES ('qa-quality-a','76000701-4','Calidad A','pro_ia'),('qa-quality-b','76000702-2','Calidad B','pro_ia');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol,auth_user_id,is_dev) VALUES
 ('qa-quality-user','qa-quality-a','Admin calidad','qa-quality-user@example.test','admin','93000000-0000-0000-0000-000000000001',false),
 ('qa-quality-other','qa-quality-b','Otro admin','qa-quality-other@example.test','admin','93000000-0000-0000-0000-000000000002',false);
INSERT INTO public.obrabot_quality_events(empresa_id,usuario_id,kind,code) VALUES('qa-quality-b','qa-quality-other','provider_failure','AI_TIMEOUT');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='93000000-0000-0000-0000-000000000001';
INSERT INTO public.obrabot_quality_events(empresa_id,usuario_id,kind,code,recovered) VALUES('qa-quality-a','qa-quality-user','invalid_action','AI_INVALID_ACTION',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.obrabot_quality_events)<>1 THEN RAISE EXCEPTION 'QUALITY_TENANT_LEAK'; END IF;
 BEGIN
  INSERT INTO public.obrabot_quality_events(empresa_id,usuario_id,kind,code) VALUES('qa-quality-b','qa-quality-other','provider_failure','AI_TIMEOUT');
  RAISE EXCEPTION 'QUALITY_FOREIGN_INSERT';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
