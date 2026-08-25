# 🏗️ ObraTrack - Contexto, Arquitectura e Historial del Proyecto

Este documento guarda la memoria permanente, decisiones de arquitectura, credenciales públicas, configuración de bases de datos y el historial de desarrollo para que cualquier instancia del editor, dispositivo o agente de IA mantenga la continuidad total del proyecto.

---

## 👤 Información del Propietario y Entorno
- **Fundador & Administrador**: Benjamín Achávar
- **Correo Oficial**: `benja105.achavar@gmail.com`
- **GitHub**: [`https://github.com/xBenja105/ObraTrack`](https://github.com/xBenja105/ObraTrack)
- **Despliegue en Producción**: Vercel (sincronizado con la rama `main`)
- **Base de Datos**: Supabase PostgreSQL (con soporte pgvector y Storage)
  - **Project URL**: `https://tpszbretbtxcmnrqvlxm.supabase.co`
  - **Project Ref**: `tpszbretbtxcmnrqvlxm`

---

## 🛠️ Stack Tecnológico
- **Frontend / Framework**: Next.js 14 (App Router), React 18, TypeScript, Vanilla Tailwind CSS
- **Iconografía & Gráficos**: Lucide React, Recharts
- **Planificación**: Frappe Gantt (Carta Gantt interactiva)
- **Base de Datos & Auth**: Supabase PostgreSQL (`@supabase/supabase-js`, `@supabase/ssr`), Row Level Security (RLS)
- **Inteligencia Artificial**:
  - OpenAI GPT-4o / GPT-4o-mini (Cotizador inteligente & análisis de audios)
  - OpenAI Whisper (Transcripción de notas de voz de WhatsApp)
  - OpenAI Embeddings (`text-embedding-3-small` 1536 dim con pgvector para radar de precios de materiales)
- **Canal de Terreno**: WhatsApp Cloud API (Meta Oficial) + Webhook

---

## 💎 Modelo de Suscripciones (Planes Comerciales)
1. **Plan Gratis ($0)**:
   - 1 obra activa simultánea.
   - Directorio de clientes y mandantes.
   - Registro de estados de pago e imprevistos básicos.
2. **Plan Pro ($9.990 – $14.990 / mes)**:
   - Obras ilimitadas.
   - Cotizador inteligente con IA ("¿Cuánto cobrar?").
   - Radar de precios y comparador de ferreterías chilenas (Imperial, Construmart, Sodimac, MTS, Barracas).
   - Control de rentabilidad y desglose financiero de materiales.
3. **Plan Pro IA ($19.990 – $29.990 / mes)**:
   - Todo lo anterior.
   - Agente de WhatsApp con procesamiento de audios en terreno (Whisper + GPT-4o).
   - Detección automática de avances de obra e imprevistos.
   - Automatizaciones y bitácora fotográfica de obra.

---

## 📂 Estructura de Módulos Implementados

### 1. Gestión de Obras (`/proyectos`)
- Creación, edición y eliminación de obras con confirmación modal.
- Asignación de cuadrillas / trabajadores responsables a cada proyecto.
- Formateo automático de moneda en Pesos Chilenos (CLP) con separadores de miles en tiempo real (`8000` -> `8.000`).
- Cálculo ponderado de avance general y saldo pendiente de cobro.

### 2. Control Financiero & Insumos (`/proyectos/[id]/finanzas`)
- Gráficos de distribución de ingresos, cobros pendientes e imprevistos.
- Módulo de **Materiales & Costos Directos**: agregar insumos (cantidad, unidad, precio unitario CLP, proveedor sugerido) y marcar estado entre `⏳ Pendiente` y `✓ Comprado`.
- Registro de pagos con comprobantes y métodos (transferencia, efectivo, débito).
- Registro de imprevistos con soporte para fotografías de evidencia.

### 3. Planificación & Bitácora de Terreno (`/proyectos/[id]/gantt`)
- Carta Gantt interactiva con partidas, duración estimada y asignación de trabajadores.
- **Bitácora Diaria de Obra**: registro cronológico de eventos (avances, clima, incidentes, recepción de materiales) con fotografías y autor.

### 4. Cotizador con IA & Radar de Materiales (`/cotizador`)
- Estimación paramétrica de obras con estructura de costos directos (materiales + mano de obra), gastos generales (12%), imprevistos (5%), utilidad (18%) e IVA (19%).
- Comparativa de tiendas de construcción en Chile.
- Conversión directa de cotización aprobada en obra activa con Carta Gantt autogenerada.

### 5. Directorio de Clientes & Equipo (`/clientes` y `/equipo`)
- CRUD de mandantes y clientes asociados a obras.
- Gestión de trabajadores y asignación de roles (`admin`, `supervisor`, `terreno`).

### 6. Conexión en Vivo con Supabase (`/schema.sql` y `lib/supabase/client.ts`)
- Script SQL con extensiones `uuid-ossp`, `vector`, tablas con RLS, funciones RPC y triggers.
- Modal interactivo de diagnóstico y estado de conexión en tiempo real (`SupabaseConnectModal`).

---

## 📜 Historial de Versiones & Commits Clave
- `eac72ab`: Conexión de la app con el proyecto en vivo de Supabase (`https://tpszbretbtxcmnrqvlxm.supabase.co`).
- `2dcbfec`: Implementación de modal de conexión dinámica y sincronización PostgreSQL.
- `46e3f68`: Corrección de sintaxis de UUID hexadecimal estándar para PostgreSQL.
- `b046f49`: Formateo automático de CLP con puntos, asignación de trabajadores a obras, gestión de materiales y bitácora de obra.
- `490c26c`: Edición de proyectos, limpieza de datos falsos de prueba y empty states.
- `0c35809`: Eliminación de proyectos y reautoría completa de commits para Benjamín Achávar.
