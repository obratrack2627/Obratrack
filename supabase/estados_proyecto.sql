-- Aditiva: conserva los estados y registros existentes.
BEGIN;
ALTER TABLE public.proyectos DROP CONSTRAINT IF EXISTS proyectos_estado_check;
ALTER TABLE public.proyectos ADD CONSTRAINT proyectos_estado_check CHECK (estado IN ('activo','terminado','pausado','pendiente','cancelada'));
CREATE OR REPLACE FUNCTION public.cambiar_estado_proyecto(p_id text,p_estado text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE company text; project public.proyectos; plan text;
BEGIN
 IF NOT public.puede_usar_web() THEN RAISE EXCEPTION 'WEB_ROLE_FORBIDDEN'; END IF;
 company:=public.get_auth_empresa_id();
 IF p_estado IS NULL OR p_estado NOT IN ('activo','terminado','pausado','pendiente','cancelada') THEN RAISE EXCEPTION 'PROJECT_STATE_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(company,0));
 SELECT * INTO project FROM public.proyectos WHERE id=p_id AND empresa_id=company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_FORBIDDEN'; END IF;
 IF p_estado='activo' AND project.estado<>'activo' THEN
  SELECT plan_id INTO plan FROM public.empresas WHERE id=company;
  IF coalesce(plan,'gratis')='gratis' AND EXISTS(SELECT 1 FROM public.proyectos WHERE empresa_id=company AND id<>p_id AND estado='activo') THEN RAISE EXCEPTION 'PLAN_LIMIT'; END IF;
 END IF;
 UPDATE public.proyectos SET estado=p_estado,updated_at=now() WHERE id=p_id AND empresa_id=company RETURNING * INTO project;
 RETURN to_jsonb(project);
END $$;
REVOKE ALL ON FUNCTION public.cambiar_estado_proyecto(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_proyecto(text,text) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
