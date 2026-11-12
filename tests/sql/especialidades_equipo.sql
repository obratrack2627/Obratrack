-- Después de especialidades_equipo.sql. Pruebas con fixtures que se revierten.
BEGIN;
CREATE FUNCTION pg_temp.assertion(ok boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'SPECIALTIES_TEST_FAILED'; END IF; END $$;
CREATE FUNCTION pg_temp.fails(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN IF position(expected IN SQLERRM)>0 THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'EXPECTED_FAILURE: %',expected;
END $$;
CREATE FUNCTION pg_temp.contacto(person text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('nombre',nombre,'email',email,'rut',rut,'telefono_whatsapp',telefono_whatsapp,'especialidades',especialidades) FROM public.usuarios WHERE id=person;
$$;
INSERT INTO public.empresas(id,rut,nombre,plan_id) VALUES('qa-skills-a','76111999-1','Prueba especialidades','pro_ia'),('qa-skills-b','76111998-1','Otra empresa','pro_ia');
INSERT INTO public.usuarios(id,empresa_id,nombre,email,rol,auth_user_id,is_dev) VALUES
 ('qa-skills-admin','qa-skills-a','Dueña Prueba','skills-admin@example.test','admin','40000000-0000-0000-0000-000000000001',false),
 ('qa-skills-outsider','qa-skills-b','Otra Persona','skills-other@example.test','terreno',null,false);
SELECT set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assertion(public.normalizar_especialidades('[" Carpintería ","CARPINTERIA","Pintura"]')=ARRAY['Carpintería','Pintura']);
SELECT pg_temp.fails($q$SELECT public.normalizar_especialidades('"Pintura"')$q$,'SPECIALTIES_INVALID');
SELECT pg_temp.fails($q$SELECT public.normalizar_especialidades('[null]')$q$,'SPECIALTIES_INVALID');
SELECT pg_temp.fails($q$SELECT public.normalizar_especialidades('[""]')$q$,'SPECIALTIES_INVALID');
SELECT public.crear_integrante_equipo('{"id":"u-40000000-0000-0000-0000-000000000002","nombre":"Pedro Morales","rut":"12345678-5","telefono_whatsapp":"+56981000101","email":"skills-worker@example.test","rol":"supervisor","especialidades":["Carpintería","Gasfitería"]}',null);
SELECT pg_temp.assertion((SELECT especialidades=ARRAY['Carpintería','Gasfitería'] AND auth_user_id IS NULL AND NOT is_dev FROM public.usuarios WHERE id='u-40000000-0000-0000-0000-000000000002'));
SELECT public.crear_integrante_equipo('{"id":"u-40000000-0000-0000-0000-000000000003","nombre":"Juan Morales","rut":"11111111-1","telefono_whatsapp":"+56981000102","email":"skills-no-optional@example.test","rol":"supervisor"}',null);
SELECT pg_temp.assertion((SELECT especialidades='{}'::text[] FROM public.usuarios WHERE id='u-40000000-0000-0000-0000-000000000003'));
SELECT public.actualizar_contacto_equipo_interno('qa-skills-a','qa-skills-admin','u-40000000-0000-0000-0000-000000000002',pg_temp.contacto('u-40000000-0000-0000-0000-000000000002')||'{"especialidades":["Pintura"]}',pg_temp.contacto('u-40000000-0000-0000-0000-000000000002'));
-- Un cliente anterior sin ese campo conserva las especialidades al editar el correo.
SELECT public.actualizar_contacto_equipo_interno('qa-skills-a','qa-skills-admin','u-40000000-0000-0000-0000-000000000002',(pg_temp.contacto('u-40000000-0000-0000-0000-000000000002')-'especialidades')||'{"email":"skills-new@example.test"}',pg_temp.contacto('u-40000000-0000-0000-0000-000000000002')-'especialidades');
SELECT pg_temp.assertion((SELECT especialidades=ARRAY['Pintura'] AND rol='supervisor' AND telefono_whatsapp='+56981000101' AND auth_user_id IS NULL FROM public.usuarios WHERE id='u-40000000-0000-0000-0000-000000000002'));
SELECT pg_temp.fails($q$SELECT public.actualizar_contacto_equipo_interno('qa-skills-a','qa-skills-admin','qa-skills-outsider',pg_temp.contacto('qa-skills-outsider'),pg_temp.contacto('qa-skills-outsider'))$q$,'CONTACT_FORBIDDEN');
SELECT pg_temp.fails($q$SELECT public.actualizar_contacto_equipo_interno('qa-skills-a','qa-skills-admin','u-40000000-0000-0000-0000-000000000002',pg_temp.contacto('u-40000000-0000-0000-0000-000000000002')||'{"especialidades":["Albañilería"]}',pg_temp.contacto('u-40000000-0000-0000-0000-000000000002')||'{"especialidades":["Carpintería"]}')$q$,'CONTACT_CONFLICT');
SELECT public.aplicar_lote_whatsapp_contactos_base('qa-skills-message','qa-skills-a','qa-skills-admin','56981000100','Quita las especialidades','Listo',null,null,jsonb_build_object('usuarios',jsonb_build_array(jsonb_build_object('id','u-40000000-0000-0000-0000-000000000002','empresa_id','qa-skills-a','rol','supervisor','auth_user_id',null)||pg_temp.contacto('u-40000000-0000-0000-0000-000000000002')||jsonb_build_object('especialidades','[]'::jsonb,'_contacto_anterior',pg_temp.contacto('u-40000000-0000-0000-0000-000000000002')))),'{}',null);
SELECT pg_temp.assertion((SELECT especialidades='{}'::text[] AND rol='supervisor' FROM public.usuarios WHERE id='u-40000000-0000-0000-0000-000000000002'));
ROLLBACK;
