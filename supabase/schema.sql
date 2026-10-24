-- ==============================================================================
-- OBRATRACK - ESQUEMA RELACIONAL ESTRUCTURADO EN POSTGRESQL (SUPABASE)
-- Modelo de Datos en Tercera Forma Normal (3FN) con compatibilidad de identificadores
-- ==============================================================================

-- Drop tables in reverse dependency order to allow schema update
DROP VIEW IF EXISTS public.vista_resumen_proyectos;
DROP TABLE IF EXISTS public.reportes_whatsapp CASCADE;
DROP TABLE IF EXISTS public.imprevistos CASCADE;
DROP TABLE IF EXISTS public.bitacora_entradas CASCADE;
DROP TABLE IF EXISTS public.materiales_proyecto CASCADE;
DROP TABLE IF EXISTS public.pagos CASCADE;
DROP TABLE IF EXISTS public.actividades CASCADE;
DROP TABLE IF EXISTS public.proyecto_trabajadores CASCADE;
DROP TABLE IF EXISTS public.agenda_eventos CASCADE;
DROP TABLE IF EXISTS public.proyectos CASCADE;
DROP TABLE IF EXISTS public.clientes CASCADE;
DROP TABLE IF EXISTS public.usuarios CASCADE;
DROP TABLE IF EXISTS public.empresas CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLA: EMPRESAS
CREATE TABLE public.empresas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    rut VARCHAR(12) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    plan_id VARCHAR(30) NOT NULL DEFAULT 'gratis',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA: USUARIOS
CREATE TABLE public.usuarios (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    auth_user_id TEXT,
    empresa_id TEXT REFERENCES public.empresas(id) ON DELETE CASCADE,
    rut VARCHAR(12) UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(100) UNIQUE,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('admin', 'supervisor', 'terreno')) DEFAULT 'terreno',
    telefono_whatsapp VARCHAR(20),
    is_dev BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA: CLIENTES
CREATE TABLE public.clientes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    empresa_id TEXT REFERENCES public.empresas(id) ON DELETE CASCADE,
    rut VARCHAR(12),
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(20),
    email VARCHAR(100),
    direccion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA: PROYECTOS
CREATE TABLE public.proyectos (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cliente_id TEXT REFERENCES public.clientes(id) ON DELETE SET NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    direccion TEXT,
    comuna VARCHAR(100),
    region VARCHAR(100),
    latitud NUMERIC(10, 7),
    longitud NUMERIC(10, 7),
    lugar_referencia TEXT,
    fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_termino_estimada DATE NOT NULL,
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('activo', 'terminado', 'pausado')) DEFAULT 'activo',
    monto_cotizado NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLA INTERMEDIA: PROYECTO_TRABAJADORES (N:M)
CREATE TABLE public.proyecto_trabajadores (
    proyecto_id TEXT NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    usuario_id TEXT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    asignado_el TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (proyecto_id, usuario_id)
);

-- 6. TABLA: ACTIVIDADES (Carta Gantt)
CREATE TABLE public.actividades (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proyecto_id TEXT NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    responsable_id TEXT REFERENCES public.usuarios(id) ON DELETE SET NULL,
    nombre VARCHAR(150) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_termino DATE NOT NULL,
    porcentaje_avance NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (porcentaje_avance BETWEEN 0 AND 100),
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('pendiente', 'en_curso', 'terminada')) DEFAULT 'pendiente',
    orden INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TABLA: PAGOS
CREATE TABLE public.pagos (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proyecto_id TEXT NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    cliente_id TEXT REFERENCES public.clientes(id) ON DELETE SET NULL,
    monto NUMERIC(12, 2) NOT NULL,
    metodo VARCHAR(20) NOT NULL CHECK (metodo IN ('transferencia', 'efectivo', 'debito', 'credito')) DEFAULT 'transferencia',
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('pendiente', 'completado', 'anulado')) DEFAULT 'completado',
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    notas TEXT,
    comprobante_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TABLA: MATERIALES_PROYECTO
CREATE TABLE public.materiales_proyecto (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proyecto_id TEXT NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    nombre VARCHAR(150) NOT NULL,
    categoria VARCHAR(80),
    cantidad NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unidad VARCHAR(30) NOT NULL DEFAULT 'unidad',
    precio_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    proveedor VARCHAR(100),
    comprado BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. TABLA: BITACORA_ENTRADAS
CREATE TABLE public.bitacora_entradas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proyecto_id TEXT NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    usuario_id TEXT REFERENCES public.usuarios(id) ON DELETE SET NULL,
    autor_nombre VARCHAR(150) NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    nota TEXT NOT NULL,
    foto_url TEXT,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('avance', 'incidente', 'clima', 'entrega_material')) DEFAULT 'avance',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. TABLA: IMPREVISTOS
CREATE TABLE public.imprevistos (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proyecto_id TEXT NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    actividad_id TEXT REFERENCES public.actividades(id) ON DELETE SET NULL,
    titulo VARCHAR(150) NOT NULL,
    descripcion TEXT,
    monto_adicional NUMERIC(12, 2) NOT NULL DEFAULT 0,
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')) DEFAULT 'pendiente',
    origen VARCHAR(30) NOT NULL CHECK (origen IN ('manual', 'whatsapp_ia')) DEFAULT 'manual',
    fecha_reporte DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. TABLA: REPORTES_WHATSAPP
CREATE TABLE public.reportes_whatsapp (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proyecto_id TEXT NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    cliente_id TEXT REFERENCES public.clientes(id) ON DELETE SET NULL,
    telefono VARCHAR(20) NOT NULL,
    mensaje_recibido TEXT NOT NULL,
    respuesta_enviada TEXT NOT NULL,
    fecha_envio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    estado VARCHAR(20) NOT NULL DEFAULT 'enviado',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. TABLA: AGENDA_EVENTOS
CREATE TABLE public.agenda_eventos (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    proyecto_id TEXT REFERENCES public.proyectos(id) ON DELETE CASCADE,
    usuario_id TEXT REFERENCES public.usuarios(id) ON DELETE SET NULL,
    titulo VARCHAR(150) NOT NULL,
    fecha_inicio TIMESTAMPTZ NOT NULL,
    fecha_fin TIMESTAMPTZ NOT NULL,
    tipo VARCHAR(30) NOT NULL DEFAULT 'hito',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. TABLA: MENSAJES_CHAT_PROYECTO (Agente de IA por Obra)
CREATE TABLE public.mensajes_chat_proyecto (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proyecto_id TEXT NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    remitente VARCHAR(20) NOT NULL CHECK (remitente IN ('usuario', 'agente')),
    texto TEXT NOT NULL,
    sugerencias JSONB,
    accion_ejecutada JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- ÍNDICES DE RENDIMIENTO
-- ==============================================================================
CREATE INDEX idx_usuarios_empresa ON public.usuarios(empresa_id);
CREATE INDEX idx_usuarios_rut ON public.usuarios(rut);
CREATE INDEX idx_clientes_empresa ON public.clientes(empresa_id);
CREATE INDEX idx_clientes_rut ON public.clientes(rut);
CREATE INDEX idx_proyectos_empresa ON public.proyectos(empresa_id);
CREATE INDEX idx_proyectos_cliente ON public.proyectos(cliente_id);
CREATE INDEX idx_actividades_proyecto ON public.actividades(proyecto_id);
CREATE INDEX idx_pagos_proyecto ON public.pagos(proyecto_id);
CREATE INDEX idx_materiales_proyecto ON public.materiales_proyecto(proyecto_id);
CREATE INDEX idx_bitacora_proyecto ON public.bitacora_entradas(proyecto_id);
CREATE INDEX idx_imprevistos_proyecto ON public.imprevistos(proyecto_id);
CREATE INDEX idx_reportes_whatsapp_proyecto ON public.reportes_whatsapp(proyecto_id);

-- ==============================================================================
-- VISTA SQL RELACIONAL
-- ==============================================================================
CREATE OR REPLACE VIEW public.vista_resumen_proyectos 
WITH (security_invoker = true) AS
SELECT 
    p.id AS proyecto_id,
    p.nombre AS proyecto_nombre,
    p.estado,
    p.comuna,
    p.monto_cotizado,
    COALESCE(SUM(pg.monto), 0) AS total_pagado,
    (p.monto_cotizado - COALESCE(SUM(pg.monto), 0)) AS saldo_pendiente,
    COALESCE(AVG(a.porcentaje_avance), 0) AS porcentaje_avance_promedio,
    COUNT(DISTINCT b.id) AS total_entradas_bitacora
FROM public.proyectos p
LEFT JOIN public.pagos pg ON pg.proyecto_id = p.id AND pg.estado = 'completado'
LEFT JOIN public.actividades a ON a.proyecto_id = p.id
LEFT JOIN public.bitacora_entradas b ON b.proyecto_id = p.id
GROUP BY p.id, p.nombre, p.estado, p.comuna, p.monto_cotizado;

-- ==============================================================================
-- ROW LEVEL SECURITY (Aislamiento Multi-Inquilino Estricto por empresa_id)
-- ==============================================================================
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

-- Función de seguridad definer para obtener la empresa del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_auth_empresa_id()
RETURNS TEXT AS $$
  SELECT empresa_id 
  FROM public.usuarios 
  WHERE auth_user_id = auth.uid()::text OR id = auth.uid()::text 
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 1. EMPRESAS
CREATE POLICY "rls_empresas_select" ON public.empresas
    FOR SELECT USING (auth.role() = 'service_role' OR id = public.get_auth_empresa_id());
CREATE POLICY "rls_empresas_insert" ON public.empresas
    FOR INSERT WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');
CREATE POLICY "rls_empresas_update" ON public.empresas
    FOR UPDATE USING (auth.role() = 'service_role' OR id = public.get_auth_empresa_id());

-- 2. USUARIOS
CREATE POLICY "rls_usuarios_select" ON public.usuarios
    FOR SELECT USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());
CREATE POLICY "rls_usuarios_insert" ON public.usuarios
    FOR INSERT WITH CHECK (auth.role() = 'service_role' OR auth.uid()::text = auth_user_id OR auth.role() = 'authenticated');
CREATE POLICY "rls_usuarios_update" ON public.usuarios
    FOR UPDATE USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());
CREATE POLICY "rls_usuarios_delete" ON public.usuarios
    FOR DELETE USING (auth.role() = 'service_role' OR (empresa_id = public.get_auth_empresa_id() AND rol <> 'admin'));

-- 3. CLIENTES
CREATE POLICY "rls_clientes_tenant" ON public.clientes
    FOR ALL USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id())
    WITH CHECK (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());

-- 4. PROYECTOS
CREATE POLICY "rls_proyectos_tenant" ON public.proyectos
    FOR ALL USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id())
    WITH CHECK (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());

-- 5. PROYECTO_TRABAJADORES
CREATE POLICY "rls_pt_tenant" ON public.proyecto_trabajadores
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- 6. ACTIVIDADES
CREATE POLICY "rls_actividades_tenant" ON public.actividades
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- 7. PAGOS
CREATE POLICY "rls_pagos_tenant" ON public.pagos
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- 8. MATERIALES
CREATE POLICY "rls_materiales_tenant" ON public.materiales_proyecto
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- 9. BITACORA
CREATE POLICY "rls_bitacora_tenant" ON public.bitacora_entradas
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- 10. IMPREVISTOS
CREATE POLICY "rls_imprevistos_tenant" ON public.imprevistos
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- 11. REPORTES_WHATSAPP
CREATE POLICY "rls_whatsapp_tenant" ON public.reportes_whatsapp
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    )
    WITH CHECK (
        auth.role() = 'service_role' OR 
        proyecto_id IN (SELECT id FROM public.proyectos WHERE empresa_id = public.get_auth_empresa_id())
    );

-- 12. AGENDA_EVENTOS
CREATE POLICY "rls_agenda_tenant" ON public.agenda_eventos
    FOR ALL USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id())
    WITH CHECK (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());

-- 13. MENSAJES_CHAT_PROYECTO
CREATE POLICY "rls_chat_tenant" ON public.mensajes_chat_proyecto
    FOR ALL USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id())
    WITH CHECK (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());

-- ==============================================================================
-- 14. CONFIGURACIÓN DE STORAGE (BUCKET PARA FOTOS DE FAENA)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('bitacora-fotos', 'bitacora-fotos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access Bitacora Fotos" ON storage.objects;
CREATE POLICY "Public Access Bitacora Fotos" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'bitacora-fotos');

DROP POLICY IF EXISTS "Allow Upload Bitacora Fotos" ON storage.objects;
CREATE POLICY "Allow Upload Bitacora Fotos" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'bitacora-fotos');

DROP POLICY IF EXISTS "Allow Delete Bitacora Fotos" ON storage.objects;
CREATE POLICY "Allow Delete Bitacora Fotos" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'bitacora-fotos');

-- ==============================================================================
-- 15. SEED INICIAL: EMPRESA Y USUARIO DESARROLLADOR MASTER
-- ==============================================================================
INSERT INTO public.empresas (id, rut, nombre, plan_id)
VALUES ('empresa-dev-master', '76.000.000-0', 'ObraTrack Dev Studio', 'ilimitado')
ON CONFLICT (rut) DO UPDATE SET plan_id = 'ilimitado';

INSERT INTO public.usuarios (id, empresa_id, rut, nombre, email, rol, is_dev)
VALUES ('user-dev-master-01', 'empresa-dev-master', '11.111.111-1', 'Desarrollador ObraTrack', 'obratrack2627@gmail.com', 'admin', true)
ON CONFLICT (email) DO UPDATE SET is_dev = true, rol = 'admin';


-- ==============================================================================
-- 16. MÓDULOS V2: RECLAMOS/CAMBIOS, REPOSITORIO DOCUMENTAL Y CONTROL ASISTENCIA
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.reclamos_cambios_obra (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proyecto_id TEXT NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    reportado_por_usuario_id TEXT REFERENCES public.usuarios(id) ON DELETE SET NULL,
    cliente_id TEXT REFERENCES public.clientes(id) ON DELETE SET NULL,
    tipo VARCHAR(30) NOT NULL DEFAULT 'solicitud_cambio'
        CHECK (tipo IN ('solicitud_cambio', 'reclamo', 'incidente', 'accidente')),
    prioridad VARCHAR(20) NOT NULL DEFAULT 'media'
        CHECK (prioridad IN ('baja', 'media', 'alta', 'critica')),
    estado VARCHAR(25) NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'en_revision', 'aprobado', 'rechazado', 'resuelto')),
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,
    solicitado_por VARCHAR(200),
    impacto_monto NUMERIC(15, 2) NOT NULL DEFAULT 0,
    impacto_dias INTEGER NOT NULL DEFAULT 0,
    materiales_requeridos JSONB NOT NULL DEFAULT '[]'::jsonb,
    materiales_inyectados BOOLEAN NOT NULL DEFAULT false,
    foto_url TEXT,
    origen VARCHAR(30) NOT NULL DEFAULT 'web'
        CHECK (origen IN ('web', 'whatsapp_ia', 'cliente')),
    resolucion_notas TEXT,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.documentos_obra (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proyecto_id TEXT NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    subido_por_id TEXT REFERENCES public.usuarios(id) ON DELETE SET NULL,
    subido_por_nombre VARCHAR(200),
    categoria VARCHAR(40) NOT NULL DEFAULT 'otro'
        CHECK (categoria IN ('contrato', 'plano', 'factura_boleta', 'correo', 'permiso_normativa', 'otro')),
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    archivo_url TEXT,
    archivo_nombre VARCHAR(255),
    archivo_tamano BIGINT,
    mime_type VARCHAR(120),
    numero_documento VARCHAR(100),
    proveedor_entidad VARCHAR(200),
    monto_documento NUMERIC(15, 2),
    correo_remitente VARCHAR(200),
    correo_destinatario VARCHAR(200),
    correo_asunto VARCHAR(255),
    correo_cuerpo TEXT,
    fecha_documento DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.asistencia_obreros (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proyecto_id TEXT NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    empresa_id TEXT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_id TEXT REFERENCES public.usuarios(id) ON DELETE SET NULL,
    trabajador_nombre VARCHAR(200) NOT NULL,
    trabajador_rol VARCHAR(80),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    estado VARCHAR(25) NOT NULL DEFAULT 'presente'
        CHECK (estado IN ('presente', 'atraso', 'ausente', 'licencia', 'permiso')),
    hora_entrada VARCHAR(10),
    hora_salida VARCHAR(10),
    horas_trabajadas NUMERIC(5, 2) DEFAULT 0,
    observacion TEXT,
    origen VARCHAR(30) NOT NULL DEFAULT 'web'
        CHECK (origen IN ('web', 'whatsapp_ia')),
    registrado_por VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos-obra', 'documentos-obra', true)
ON CONFLICT (id) DO NOTHING;
