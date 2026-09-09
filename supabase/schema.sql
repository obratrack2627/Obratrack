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
CREATE OR REPLACE VIEW public.vista_resumen_proyectos AS
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
-- ROW LEVEL SECURITY
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

CREATE POLICY "p_all_empresas" ON public.empresas FOR ALL USING (true);
CREATE POLICY "p_all_usuarios" ON public.usuarios FOR ALL USING (true);
CREATE POLICY "p_all_clientes" ON public.clientes FOR ALL USING (true);
CREATE POLICY "p_all_proyectos" ON public.proyectos FOR ALL USING (true);
CREATE POLICY "p_all_pt" ON public.proyecto_trabajadores FOR ALL USING (true);
CREATE POLICY "p_all_actividades" ON public.actividades FOR ALL USING (true);
CREATE POLICY "p_all_pagos" ON public.pagos FOR ALL USING (true);
CREATE POLICY "p_all_materiales" ON public.materiales_proyecto FOR ALL USING (true);
CREATE POLICY "p_all_bitacora" ON public.bitacora_entradas FOR ALL USING (true);
CREATE POLICY "p_all_imprevistos" ON public.imprevistos FOR ALL USING (true);
CREATE POLICY "p_all_whatsapp" ON public.reportes_whatsapp FOR ALL USING (true);
CREATE POLICY "p_all_agenda" ON public.agenda_eventos FOR ALL USING (true);