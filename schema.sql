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

-- Empresa Demo
INSERT INTO empresas (id, nombre, rut) VALUES
('e1111111-1111-1111-1111-111111111111', 'Construcciones & Reformas Andinas SpA', '77.890.123-K')
ON CONFLICT (id) DO NOTHING;

-- Usuarios Demo
INSERT INTO usuarios (id, empresa_id, nombre, email, rol, telefono_whatsapp) VALUES
('u1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'Gonzalo Morales (Dueño)', 'admin@andinas.cl', 'admin', '+56987654321'),
('u2222222-2222-2222-2222-222222222222', 'e1111111-1111-1111-1111-111111111111', 'Rodrigo Valenzuela (Supervisor)', 'supervisor@andinas.cl', 'supervisor', '+56976543210'),
('u3333333-3333-3333-3333-333333333333', 'e1111111-1111-1111-1111-111111111111', 'Carlos Pinto (Capataz)', 'carlos.terreno@andinas.cl', 'terreno', '+56965432109'),
('u4444444-4444-4444-4444-444444444444', 'e1111111-1111-1111-1111-111111111111', 'Manuel Soto (Maestro Mayor)', 'manuel.terreno@andinas.cl', 'terreno', '+56954321098')
ON CONFLICT (id) DO NOTHING;

-- Clientes Demo
INSERT INTO clientes (id, empresa_id, nombre, telefono, email, rut, direccion) VALUES
('c1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'Inmobiliaria Los Encinos Ltda.', '+56991122334', 'contacto@losencinos.cl', '76.452.980-3', 'Av. El Golf 40, Las Condes, Santiago'),
('c2222222-2222-2222-2222-222222222222', 'e1111111-1111-1111-1111-111111111111', 'Dra. Marcela Ugarte', '+56988776655', 'marcela.ugarte@gmail.com', '14.890.345-2', 'Camino El Alba 1420, Lo Barnechea, Santiago'),
('c3333333-3333-3333-3333-333333333333', 'e1111111-1111-1111-1111-111111111111', 'Café & Panadería Pan Nuestro', '+56977665544', 'admin@pannuestro.cl', '77.102.394-1', 'Manuel Montt 890, Providencia, Santiago')
ON CONFLICT (id) DO NOTHING;

-- Proyectos Demo
INSERT INTO proyectos (id, empresa_id, cliente_id, nombre, descripcion, fecha_inicio, fecha_termino_estimada, estado, monto_cotizado) VALUES
('p1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'c2222222-2222-2222-2222-222222222222', 'Ampliación Quincho & Terraza Ugarte', 'Construcción de quincho de 45m2 con vigas a la vista de pino oregón, piso de porcelanato y parrilla de acero inoxidable.', '2026-08-01', '2026-10-15', 'activo', 18500000),
('p2222222-2222-2222-2222-222222222222', 'e1111111-1111-1111-1111-111111111111', 'c3333333-3333-3333-3333-333333333333', 'Remodelación Local Comercial Pan Nuestro', 'Renovación de fachada, instalación eléctrica trifásica comercial y pavimentos vinílicos de alto tráfico.', '2026-08-10', '2026-09-25', 'activo', 9800000),
('p3333333-3333-3333-3333-333333333333', 'e1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'Casa Piloto Condominio Los Encinos', 'Obra gruesa y terminaciones de vivienda unifamiliar de 160m2 en dos plantas.', '2026-07-01', '2026-11-30', 'activo', 45000000)
ON CONFLICT (id) DO NOTHING;

-- Actividades Demo (Carta Gantt)
INSERT INTO actividades (id, proyecto_id, nombre, responsable_id, fecha_inicio, fecha_termino, porcentaje_avance, estado, orden) VALUES
('a101', 'p1111111-1111-1111-1111-111111111111', 'Excavación y Radier de Hormigón', 'u3333333-3333-3333-3333-333333333333', '2026-08-01', '2026-08-12', 100, 'terminada', 1),
('a102', 'p1111111-1111-1111-1111-111111111111', 'Montaje Estructura de Madera y Techumbre', 'u4444444-4444-4444-4444-444444444444', '2026-08-13', '2026-08-28', 75, 'en_curso', 2),
('a103', 'p1111111-1111-1111-1111-111111111111', 'Instalación Eléctrica, Agua y Gas', 'u3333333-3333-3333-3333-333333333333', '2026-08-29', '2026-09-15', 0, 'pendiente', 3),
('a104', 'p1111111-1111-1111-1111-111111111111', 'Revestimiento Cerámico y Parrilla', 'u4444444-4444-4444-4444-444444444444', '2026-09-16', '2026-10-05', 0, 'pendiente', 4),
('a105', 'p1111111-1111-1111-1111-111111111111', 'Pintura, Barniz y Entrega Final', 'u2222222-2222-2222-2222-222222222222', '2026-10-06', '2026-10-15', 0, 'pendiente', 5),
('a201', 'p2222222-2222-2222-2222-222222222222', 'Demolición tabiquería y retiro escombros', 'u3333333-3333-3333-3333-333333333333', '2026-08-10', '2026-08-16', 100, 'terminada', 1),
('a202', 'p2222222-2222-2222-2222-222222222222', 'Instalación circuito trifásico y tableros', 'u3333333-3333-3333-3333-333333333333', '2026-08-17', '2026-08-30', 60, 'en_curso', 2),
('a203', 'p2222222-2222-2222-2222-222222222222', 'Instalación de piso vinílico y pintura', 'u4444444-4444-4444-4444-444444444444', '2026-08-31', '2026-09-25', 0, 'pendiente', 3)
ON CONFLICT (id) DO NOTHING;

-- Pagos Demo
INSERT INTO pagos (id, proyecto_id, monto, metodo, fecha, nota) VALUES
('pay1', 'p1111111-1111-1111-1111-111111111111', 7500000, 'transferencia', '2026-08-01', 'Anticipo 40% firma de contrato'),
('pay2', 'p1111111-1111-1111-1111-111111111111', 4000000, 'transferencia', '2026-08-18', 'Segundo estado de pago contra avance de techumbre'),
('pay3', 'p2222222-2222-2222-2222-222222222222', 5000000, 'transferencia', '2026-08-10', 'Anticipo 50% inicio remodelación'),
('pay4', 'p3333333-3333-3333-3333-333333333333', 15000000, 'transferencia', '2026-07-05', 'Anticipo obra gruesa')
ON CONFLICT (id) DO NOTHING;

-- Imprevistos Demo
INSERT INTO imprevistos (id, proyecto_id, actividad_id, descripcion, monto, foto_url, fecha, origen) VALUES
('imp1', 'p1111111-1111-1111-1111-111111111111', 'a102', 'Refuerzo imprevisto de viga maestra por desnivel del muro antiguo', 320000, 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?w=600', '2026-08-16', 'whatsapp_ia'),
('imp2', 'p2222222-2222-2222-2222-222222222222', 'a202', 'Reemplazo de alimentador principal por cableado quemado', 210000, NULL, '2026-08-20', 'manual')
ON CONFLICT (id) DO NOTHING;

-- Reportes WhatsApp Demo (Procesados por OpenAI Whisper + GPT-4o-mini)
INSERT INTO reportes_whatsapp (id, proyecto_id, usuario_id, mensaje_original, transcripcion, extraccion_ia, estado, fecha) VALUES
(
    'rep1',
    'p1111111-1111-1111-1111-111111111111',
    'u3333333-3333-3333-3333-333333333333',
    'Don Gonzalo, terminamos la estructura de madera del quincho, ya tenemos como un 80% de esa parte. Pero tuvimos que comprar 4 pernos de anclaje extra que costaron 45 mil pesos.',
    NULL,
    '{"actividad_detectada": "Montaje Estructura de Madera y Techumbre", "avance_porcentaje": 80, "tiene_imprevisto": true, "imprevisto_descripcion": "Compra de 4 pernos de anclaje extra", "imprevisto_monto_estimado": 45000}'::jsonb,
    'pendiente',
    '2026-08-25 08:45:00-04'
),
(
    'rep2',
    'p2222222-2222-2222-2222-222222222222',
    'u4444444-4444-4444-4444-444444444444',
    '[Audio de 24 segundos vía WhatsApp]',
    'Hola don Gonzalo, le hablo de Pan Nuestro. El tablero trifásico ya quedó conectado y probado, la instalación eléctrica está en 90%. Mañana arrancamos con los pisos.',
    '{"actividad_detectada": "Instalación circuito trifásico y tableros", "avance_porcentaje": 90, "tiene_imprevisto": false, "imprevisto_descripcion": null, "imprevisto_monto_estimado": 0}'::jsonb,
    'pendiente',
    '2026-08-25 09:10:00-04'
),
(
    'rep3',
    'p1111111-1111-1111-1111-111111111111',
    'u3333333-3333-3333-3333-333333333333',
    'Listo el radier de hormigón en la terraza, fraguando sin novedades.',
    NULL,
    '{"actividad_detectada": "Excavación y Radier de Hormigón", "avance_porcentaje": 100, "tiene_imprevisto": false, "imprevisto_descripcion": null, "imprevisto_monto_estimado": 0}'::jsonb,
    'aprobado',
    '2026-08-12 17:30:00-04'
)
ON CONFLICT (id) DO NOTHING;

-- Catálogo de Insumos Base de Construcción en Chile
INSERT INTO catalogo_materiales_chile (nombre, categoria, unidad, precio_referencial_clp, mejor_tienda, precio_mas_barato_clp, descripcion_tecnica) VALUES
('Cemento Melón Especial 25kg', 'obra_gruesa', 'saco', 4690, 'Construmart', 4290, 'Cemento para radieres, fundaciones y pilares de hormigón'),
('Pino Oregón Seco 6x6 x 3.2m', 'maderas_tableros', 'tira', 34990, 'Imperial Barracas', 27990, 'Pilar estructural de pino oregón cepillado para terrazas y quinchos'),
('Plancha OSB Estructural 9.5mm', 'maderas_tableros', 'plancha', 9990, 'Imperial Barracas', 8990, 'Tablero estructural para diafragma de techumbre y tabiquería'),
('Malla Acma C-92 (2.60x5.0m)', 'obra_gruesa', 'malla', 22490, 'Construmart', 19990, 'Malla de acero electrosoldada para radieres y losas de hormigón'),
('Porcelanato Antideslizante 60x60', 'terminaciones', 'm2', 16990, 'Easy / Sodimac', 13990, 'Revestimiento cerámico de exterior para terrazas y accesos')
ON CONFLICT DO NOTHING;
