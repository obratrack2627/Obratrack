BEGIN;
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.sincronizar_lote_web(uuid,jsonb,jsonb)'::regprocedure);
 definition:=replace(definition,'IF FOUND THEN RETURN prior; END IF;', 'IF FOUND THEN RETURN prior || jsonb_build_object(''replayed'',true); END IF;');
 EXECUTE definition;
END $$;
COMMIT;
NOTIFY pgrst,'reload schema';
