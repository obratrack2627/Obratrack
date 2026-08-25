-- ==============================================================================
-- OBRATRACK - SCHEMA DE BASE DE DATOS SUPABASE (POSTGRESQL)
-- Stack: Next.js + TypeScript + Tailwind CSS + Supabase (pgvector & Storage) + OpenAI + WhatsApp Cloud API
-- ==============================================================================

-- 1. HABILITAR EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ==============================================================================
-- 2. TIPOS ENUMERADOS
-- ==============================================================================
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'terreno');
CREATE TYPE project_status AS ENUM ('activo', 'terminado', 'pausado');
CREATE TYPE activity_status AS ENUM ('pendiente', 'en_curso', 'terminada');
CREATE TYPE payment_method AS ENUM ('transferencia', 'efectivo', 'debito');
CREATE TYPE imprevisto_origin AS ENUM ('manual', 'whatsapp_ia');
CREATE TYPE report_status AS ENUM ('pendiente', 'aprobado', 'rechazado');

-- ==============================================================================
-- 3. TABLAS PRINCIPALES
-- ==============================================================================

-- Tabla: empresas
CREATE TABLE IF NOT EXISTS empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    rut VARCHAR(20) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabla: usuarios (perfiles vinculados a Supabase Auth y asignados a una empresa)
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID UNIQUE, -- Referencia a auth.users de Supabase
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    rol user_role NOT NULL DEFAULT 'terreno',
    telefono_whatsapp VARCHAR(30) NOT NULL, -- Formato E.164 (Ej: +56912345678)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabla: clientes
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(30),
    email VARCHAR(255),
    rut VARCHAR(20),
    direccion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabla: proyectos (obras)
CREATE TABLE IF NOT EXISTS proyectos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    fecha_inicio DATE NOT NULL,
    fecha_termino_estimada DATE NOT NULL,
    estado project_status NOT NULL DEFAULT 'activo',
    monto_cotizado BIGINT NOT NULL DEFAULT 0, -- Monto en pesos chilenos (CLP)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabla: actividades (partidas de la Carta Gantt)
CREATE TABLE IF NOT EXISTS actividades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    responsable_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha_inicio DATE NOT NULL,
    fecha_termino DATE NOT NULL,
    porcentaje_avance INT NOT NULL DEFAULT 0 CHECK (porcentaje_avance >= 0 AND porcentaje_avance <= 100),
    estado activity_status NOT NULL DEFAULT 'pendiente',
    orden INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabla: pagos (ingresos recibidos del cliente)
CREATE TABLE IF NOT EXISTS pagos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    monto BIGINT NOT NULL CHECK (monto > 0),
    metodo payment_method NOT NULL DEFAULT 'transferencia',
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    nota TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabla: imprevistos (costos extra detectados en obra o vía WhatsApp)
CREATE TABLE IF NOT EXISTS imprevistos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    actividad_id UUID REFERENCES actividades(id) ON DELETE SET NULL,
    descripcion TEXT NOT NULL,
    monto BIGINT NOT NULL DEFAULT 0,
    foto_url TEXT,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    origen imprevisto_origin NOT NULL DEFAULT 'manual',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabla: reportes_whatsapp (mensajes procesados por OpenAI Whisper y GPT-4o-mini pendientes de aprobación)
CREATE TABLE IF NOT EXISTS reportes_whatsapp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proyecto_id UUID REFERENCES proyectos(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    mensaje_original TEXT,
    transcripcion TEXT,
    extraccion_ia JSONB NOT NULL DEFAULT '{}'::jsonb, -- { actividad_detectada, avance_porcentaje, tiene_imprevisto, imprevisto_descripcion, imprevisto_monto_estimado }
    estado report_status NOT NULL DEFAULT 'pendiente',
    fecha TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 4. RAG Y CATÁLOGO DE MATERIALES CON PGVECTOR (OpenAI Embeddings 1536 dim)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS catalogo_materiales_chile (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    unidad VARCHAR(50) NOT NULL,
    precio_referencial_clp INT NOT NULL,
    mejor_tienda VARCHAR(100) NOT NULL,
    precio_mas_barato_clp INT NOT NULL,
    descripcion_tecnica TEXT,
    embedding vector(1536), -- Vector generado con OpenAI text-embedding-3-small
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Índice IVFFlat o HNSW para búsqueda rápida por similitud coseno
CREATE INDEX IF NOT EXISTS idx_catalogo_embedding 
ON catalogo_materiales_chile 
USING hnsw (embedding vector_cosine_ops);

-- Función para búsqueda semántica por similitud con OpenAI Embeddings
CREATE OR REPLACE FUNCTION buscar_materiales_similares(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.70,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    nombre VARCHAR(255),
    categoria VARCHAR(100),
    unidad VARCHAR(50),
    precio_referencial_clp INT,
    mejor_tienda VARCHAR(100),
    precio_mas_barato_clp INT,
    similitud float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        c.id,
        c.nombre,
        c.categoria,
        c.unidad,
        c.precio_referencial_clp,
        c.mejor_tienda,
        c.precio_mas_barato_clp,
        1 - (c.embedding <=> query_embedding) AS similitud
    FROM catalogo_materiales_chile c
    WHERE 1 - (c.embedding <=> query_embedding) > match_threshold
    ORDER BY similitud DESC
    LIMIT match_count;
$$;

-- Tabla de Materiales de Obra (Gestión de insumos por proyecto)
CREATE TABLE IF NOT EXISTS materiales_proyecto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    categoria VARCHAR(100),
    cantidad NUMERIC(10,2) NOT NULL DEFAULT 1,
    unidad VARCHAR(50) NOT NULL DEFAULT 'unidades',
    precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    proveedor VARCHAR(100),
    comprado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabla de Bitácora Diaria de Obra & Evidencias
CREATE TABLE IF NOT EXISTS bitacora_obra (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    autor_nombre VARCHAR(150) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    nota TEXT NOT NULL,
    foto_url TEXT,
    fecha DATE DEFAULT CURRENT_DATE NOT NULL,
    tipo VARCHAR(50) DEFAULT 'avance' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 5. CONFIGURACIÓN DE STORAGE (SUPABASE STORAGE BUCKETS)
-- ==============================================================================
-- Buckets requeridos:
-- 1. 'imprevistos-fotos': Fotos de roturas, boletas y compras de terreno.
-- 2. 'reportes-audio': Notas de voz enviadas por WhatsApp para transcripción.
-- 3. 'proyectos-adjuntos': Planos, contratos y cotizaciones en PDF.

-- ==============================================================================
-- 6. ÍNDICES DE RENDIMIENTO
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_telefono ON usuarios(telefono_whatsapp);
CREATE INDEX IF NOT EXISTS idx_proyectos_empresa ON proyectos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_cliente ON proyectos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_actividades_proyecto ON actividades(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_pagos_proyecto ON pagos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_imprevistos_proyecto ON imprevistos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_reportes_estado ON reportes_whatsapp(estado);

-- ==============================================================================
-- 7. POLÍTICAS DE SEGURIDAD (ROW LEVEL SECURITY - RLS)
-- ==============================================================================

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE actividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE imprevistos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiales_proyecto ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitacora_obra ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogo_materiales_chile ENABLE ROW LEVEL SECURITY;

-- Función helper para obtener el empresa_id del usuario autenticado
CREATE OR REPLACE FUNCTION get_auth_empresa_id() 
RETURNS UUID AS $$
  SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Políticas de aislamiento por empresa
CREATE POLICY "Acceso a empresas por miembros" ON empresas
  FOR ALL USING (id = get_auth_empresa_id());

CREATE POLICY "Acceso a usuarios por miembros de la empresa" ON usuarios
  FOR ALL USING (empresa_id = get_auth_empresa_id());

CREATE POLICY "Acceso a clientes por miembros de la empresa" ON clientes
  FOR ALL USING (empresa_id = get_auth_empresa_id());

CREATE POLICY "Acceso a proyectos por miembros de la empresa" ON proyectos
  FOR ALL USING (empresa_id = get_auth_empresa_id());

CREATE POLICY "Acceso a actividades de proyectos de la empresa" ON actividades
  FOR ALL USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_auth_empresa_id())
  );

CREATE POLICY "Acceso a pagos de proyectos de la empresa" ON pagos
  FOR ALL USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_auth_empresa_id())
  );

CREATE POLICY "Acceso a imprevistos de proyectos de la empresa" ON imprevistos
  FOR ALL USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_auth_empresa_id())
  );

CREATE POLICY "Acceso a materiales de proyectos de la empresa" ON materiales_proyecto
  FOR ALL USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_auth_empresa_id())
  );

CREATE POLICY "Acceso a bitacora de proyectos de la empresa" ON bitacora_obra
  FOR ALL USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_auth_empresa_id())
  );

CREATE POLICY "Acceso a reportes WhatsApp de proyectos de la empresa" ON reportes_whatsapp
  FOR ALL USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_auth_empresa_id())
    OR proyecto_id IS NULL
  );

CREATE POLICY "Lectura pública del catálogo de materiales" ON catalogo_materiales_chile
  FOR SELECT USING (true);

-- ==============================================================================
-- 8. DATOS SEMILLA (SEED DATA DE PRUEBA PARA CHILE)
-- ==============================================================================

-- Empresa Inicial
INSERT INTO empresas (id, nombre, rut) VALUES
('11111111-1111-1111-1111-111111111111', 'ObraTrack SpA', '76.123.456-7')
ON CONFLICT (id) DO NOTHING;

-- Usuario Administrador Inicial
INSERT INTO usuarios (id, empresa_id, nombre, email, rol, telefono_whatsapp) VALUES
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Benjamín Achávar', 'benja105.achavar@gmail.com', 'admin', '+56987654321')
ON CONFLICT (id) DO NOTHING;

-- Catálogo de Insumos Base de Construcción en Chile
INSERT INTO catalogo_materiales_chile (nombre, categoria, unidad, precio_referencial_clp, mejor_tienda, precio_mas_barato_clp, descripcion_tecnica) VALUES
('Cemento Melón Especial 25kg', 'obra_gruesa', 'saco', 4690, 'Construmart', 4290, 'Cemento para radieres, fundaciones y pilares de hormigón'),
('Pino Oregón Seco 6x6 x 3.2m', 'maderas_tableros', 'tira', 34990, 'Imperial Barracas', 27990, 'Pilar estructural de pino oregón cepillado para terrazas y quinchos'),
('Plancha OSB Estructural 9.5mm', 'maderas_tableros', 'plancha', 9990, 'Imperial Barracas', 8990, 'Tablero estructural para diafragma de techumbre y tabiquería'),
('Malla Acma C-92 (2.60x5.0m)', 'obra_gruesa', 'malla', 22490, 'Construmart', 19990, 'Malla de acero electrosoldada para radieres y losas de hormigón'),
('Porcelanato Antideslizante 60x60', 'terminaciones', 'm2', 16990, 'Easy / Sodimac', 13990, 'Revestimiento cerámico de exterior para terrazas y accesos')
ON CONFLICT DO NOTHING;
