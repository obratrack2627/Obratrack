BEGIN;
INSERT INTO public.empresas(id,rut,nombre,plan_id) VALUES('qa-rag-a','76000711-1','RAG A','pro_ia'),('qa-rag-b','76000712-K','RAG B','pro_ia');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol,auth_user_id,is_dev) VALUES
 ('qa-rag-user','qa-rag-a','Admin RAG','qa-rag-user@example.test','admin','94000000-0000-0000-0000-000000000001',false),
 ('qa-rag-other','qa-rag-b','Otro RAG','qa-rag-other@example.test','admin','94000000-0000-0000-0000-000000000002',false);
INSERT INTO public.obrabot_apu(empresa_id,nombre,categoria,unidad,rendimiento,fuente,fecha_referencia,aprobado,revisado_por) VALUES
 ('qa-rag-a','Radier prueba','obra_gruesa','m2',5,'Fixture sintético, no uso profesional','2026-11-14',true,'qa-rag-user'),
 ('qa-rag-b','Radier otra empresa','obra_gruesa','m2',4,'Fixture sintético','2026-11-14',true,'qa-rag-other');
INSERT INTO public.presupuestos(id,empresa_id,creado_por,origen,estado,cotizacion) VALUES('qa-rag-budget','qa-rag-a','qa-rag-user','plataforma','borrador','{"titulo_proyecto":"Prueba","cliente_email":"NO_INDEXAR","cliente_rut":"NO_INDEXAR","actividades_gantt":[],"materiales":[]}');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.obrabot_knowledge WHERE source_id='qa-rag-budget') THEN RAISE EXCEPTION 'UNAPPROVED_INDEXED'; END IF;
END $$;
UPDATE public.presupuestos SET estado='aprobada' WHERE id='qa-rag-budget';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.obrabot_knowledge WHERE source_id='qa-rag-budget') THEN RAISE EXCEPTION 'APPROVED_NOT_INDEXED'; END IF;
 IF EXISTS(SELECT 1 FROM public.obrabot_knowledge WHERE source_id='qa-rag-budget' AND content LIKE '%NO_INDEXAR%') THEN RAISE EXCEPTION 'CONTACT_INDEXED'; END IF;
END $$;
UPDATE public.obrabot_knowledge SET embedding=array_fill(0.1::real,ARRAY[1536])::extensions.vector WHERE empresa_id IN ('qa-rag-a','qa-rag-b');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='94000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.match_obrabot_knowledge(array_fill(0.1::real,ARRAY[1536])::extensions.vector,5))<>2 THEN RAISE EXCEPTION 'RAG_TENANT_LEAK'; END IF;
 IF EXISTS(SELECT 1 FROM public.obrabot_knowledge WHERE empresa_id='qa-rag-b') THEN RAISE EXCEPTION 'RAG_FOREIGN_VISIBLE'; END IF;
END $$;
RESET ROLE;
UPDATE public.presupuestos SET estado='rechazada' WHERE id='qa-rag-budget';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.obrabot_knowledge WHERE source_id='qa-rag-budget') THEN RAISE EXCEPTION 'REJECTED_STILL_INDEXED'; END IF;
END $$;
ROLLBACK;
