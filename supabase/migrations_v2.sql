-- =================================================================================
-- OBRATRACK V2 — MIGRACIÓN DE MÓDULOS AVANZADOS POR OBRA Y WHATSAPP BIDIRECCIONAL
-- Compatible con claves primarias/foráneas TEXT del esquema maestro de ObraTrack
-- 1. Reclamos, Incidencias y Solicitudes de Cambio (reclamos_cambios_obra)
-- 2. Repositorio Documental por Obra (documentos_obra + bucket documentos-obra)
-- 3. Control de Asistencia de Obreros (asistencia_obreros)
-- 4. Bitácora extendida de Mensajes y Reportes WhatsApp IA (reportes_whatsapp)
-- =================================================================================

-- 1. RECLAMOS, INCIDENCIAS Y SOLICITUDES DE CAMBIO POR OBRA
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

-- 2. REPOSITORIO DOCUMENTAL POR OBRA (Contratos, Planos, Facturas/Boletas, Correos, Permisos)
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

-- 3. CONTROL DE ASISTENCIA DE OBREROS
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

-- 4. AMPLIACIÓN DE TABLA REPORTES_WHATSAPP PARA FLUJO BIDIRECCIONAL (OBRERO & CLIENTE)
ALTER TABLE public.reportes_whatsapp ALTER COLUMN proyecto_id DROP NOT NULL;
ALTER TABLE public.reportes_whatsapp ADD COLUMN IF NOT EXISTS empresa_id TEXT REFERENCES public.empresas(id) ON DELETE CASCADE;
ALTER TABLE public.reportes_whatsapp ADD COLUMN IF NOT EXISTS remitente_tipo VARCHAR(20) DEFAULT 'obrero';
ALTER TABLE public.reportes_whatsapp ADD COLUMN IF NOT EXISTS telefono_remitente VARCHAR(40);
ALTER TABLE public.reportes_whatsapp ADD COLUMN IF NOT EXISTS nombre_remitente VARCHAR(200);
ALTER TABLE public.reportes_whatsapp ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE public.reportes_whatsapp ADD COLUMN IF NOT EXISTS respuesta_ia TEXT;
ALTER TABLE public.reportes_whatsapp ADD COLUMN IF NOT EXISTS modulo_afectado VARCHAR(80);

-- ÍNDICES DE RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_reclamos_cambios_proyecto ON public.reclamos_cambios_obra(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_reclamos_cambios_empresa ON public.reclamos_cambios_obra(empresa_id);
CREATE INDEX IF NOT EXISTS idx_documentos_obra_proyecto ON public.documentos_obra(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_documentos_obra_categoria ON public.documentos_obra(categoria);
CREATE INDEX IF NOT EXISTS idx_asistencia_proyecto_fecha ON public.asistencia_obreros(proyecto_id, fecha);
CREATE INDEX IF NOT EXISTS idx_asistencia_empresa_fecha ON public.asistencia_obreros(empresa_id, fecha);
CREATE INDEX IF NOT EXISTS idx_reportes_wa_empresa ON public.reportes_whatsapp(empresa_id);

-- HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.reclamos_cambios_obra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_obra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistencia_obreros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_reclamos_cambios_tenant" ON public.reclamos_cambios_obra;
CREATE POLICY "rls_reclamos_cambios_tenant" ON public.reclamos_cambios_obra
    FOR ALL USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id())
    WITH CHECK (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());

DROP POLICY IF EXISTS "rls_documentos_obra_tenant" ON public.documentos_obra;
CREATE POLICY "rls_documentos_obra_tenant" ON public.documentos_obra
    FOR ALL USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id())
    WITH CHECK (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());

DROP POLICY IF EXISTS "rls_asistencia_obreros_tenant" ON public.asistencia_obreros;
CREATE POLICY "rls_asistencia_obreros_tenant" ON public.asistencia_obreros
    FOR ALL USING (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id())
    WITH CHECK (auth.role() = 'service_role' OR empresa_id = public.get_auth_empresa_id());

-- BUCKET DE DOCUMENTOS POR OBRA EN SUPABASE STORAGE
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos-obra', 'documentos-obra', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access Documentos Obra" ON storage.objects;
CREATE POLICY "Public Access Documentos Obra"
ON storage.objects FOR SELECT
USING (bucket_id = 'documentos-obra');

DROP POLICY IF EXISTS "Allow Upload Documentos Obra" ON storage.objects;
CREATE POLICY "Allow Upload Documentos Obra"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documentos-obra');

DROP POLICY IF EXISTS "Allow Delete Documentos Obra" ON storage.objects;
CREATE POLICY "Allow Delete Documentos Obra"
ON storage.objects FOR DELETE
USING (bucket_id = 'documentos-obra');
