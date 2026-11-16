-- Keep revisions stable between comparison and writes, including concurrent dedicated RPCs.
BEGIN;
DO $$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.sincronizar_lote_web(uuid,jsonb,jsonb)'::regprocedure);
 definition:=replace(definition,'SELECT sync_version INTO version FROM public.proyectos WHERE id=scope_project;', 'SELECT sync_version INTO version FROM public.proyectos WHERE id=scope_project FOR UPDATE;');
 definition:=replace(definition,'SELECT sync_version FROM public.%I WHERE id=$1'',table_name) INTO version USING id_value;', 'SELECT sync_version FROM public.%I WHERE id=$1 FOR UPDATE'',table_name) INTO version USING id_value;');
 EXECUTE definition;
END $$;
COMMIT;
NOTIFY pgrst,'reload schema';
