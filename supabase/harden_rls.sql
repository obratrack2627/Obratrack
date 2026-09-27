-- ==============================================================================
-- OBRATRACK - SCRIPT DE PARCHE DE SEGURIDAD ROW LEVEL SECURITY (RLS)
-- Aplica el aislamiento estricto multi-inquilino en la base de datos Supabase
-- ==============================================================================

-- 1. Eliminar políticas abiertas previas (USING true)
DROP POLICY IF EXISTS "p_all_empresas" ON public.empresas;
DROP POLICY IF EXISTS "p_all_usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "p_all_clientes" ON public.clientes;
DROP POLICY IF EXISTS "p_all_proyectos" ON public.proyectos;
DROP POLICY IF EXISTS "p_all_pt" ON public.proyecto_trabajadores;
DROP POLICY IF EXISTS "p_all_actividades" ON public.actividades;
DROP POLICY IF EXISTS "p_all_pagos" ON public.pagos;
DROP POLICY IF EXISTS "p_all_materiales" ON public.materiales_proyecto;
DROP POLICY IF EXISTS "p_all_bitacora" ON public.bitacora_entradas;
DROP POLICY IF EXISTS "p_all_imprevistos" ON public.imprevistos;
DROP POLICY IF EXISTS "p_all_whatsapp" ON public.reportes_whatsapp;
DROP POLICY IF EXISTS "p_all_agenda" ON public.agenda_eventos;

-- 2. Asegurar RLS habilitado en todas las tablas
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proyecto_trabajadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiales_proyecto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitacora_entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imprevistos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes_chat_proyecto ENABLE ROW LEVEL SECURITY;

-- 3. Función de resolución de tenant (Security Definer)
CREATE OR REPLACE FUNCTION public.get_auth_empresa_id()
RETURNS TEXT AS $$
  SELECT empresa_id 
  FROM public.usuarios 
  WHERE auth_user_id = auth.uid()::text OR id = auth.uid()::text 
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 4. Crear políticas RLS multi-tenant
-- EMPRESAS
CREATE POLICY "rls_empresas_select" ON public.empresas
    FOR SELECT USING (auth.role() = 'service_role' OR id = public.get_auth_empresa_id());
CREATE POLICY "rls_empresas_insert" ON public.empresas
    FOR INSERT WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');
CREATE POLICY "rls_empresas_update" ON public.empresas
    FOR UPDATE USING (auth.role() = 'service_role' OR id = public.get_auth_empresa_id());

-- USUARIOS
CREATE POLICY "rls_usuarios_select" ON public.usuarios
    FOR SELECT USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());
CREATE POLICY "rls_usuarios_insert" ON public.usuarios
    FOR INSERT WITH CHECK (auth.role() = 'service_role' OR auth.uid()::text = auth_user_id OR auth.role() = 'authenticated');
CREATE POLICY "rls_usuarios_update" ON public.usuarios
    FOR UPDATE USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());
CREATE POLICY "rls_usuarios_delete" ON public.usuarios
    FOR DELETE USING (auth.role() = 'service_role' OR (empresa_id = public.get_auth_empresa_id() AND rol <> 'admin'));

-- CLIENTES
CREATE POLICY "rls_clientes_tenant" ON public.clientes
    FOR ALL USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id())
    WITH CHECK (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());

-- PROYECTOS
CREATE POLICY "rls_proyectos_tenant" ON public.proyectos
    FOR ALL USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id())
    WITH CHECK (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());

-- PROYECTO_TRABAJADORES
CREATE POLICY "rls_pt_tenant" ON public.proyecto_trabajadores
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- ACTIVIDADES
CREATE POLICY "rls_actividades_tenant" ON public.actividades
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- PAGOS
CREATE POLICY "rls_pagos_tenant" ON public.pagos
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- MATERIALES
CREATE POLICY "rls_materiales_tenant" ON public.materiales_proyecto
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- BITACORA
CREATE POLICY "rls_bitacora_tenant" ON public.bitacora_entradas
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- IMPREVISTOS
CREATE POLICY "rls_imprevistos_tenant" ON public.imprevistos
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- REPORTES_WHATSAPP
CREATE POLICY "rls_whatsapp_tenant" ON public.reportes_whatsapp
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- AGENDA_EVENTOS
CREATE POLICY "rls_agenda_tenant" ON public.agenda_eventos
    FOR ALL USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id())
    WITH CHECK (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());

-- MENSAJES_CHAT_PROYECTO
CREATE POLICY "rls_chat_tenant" ON public.mensajes_chat_proyecto
    FOR ALL USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id())
    WITH CHECK (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());
