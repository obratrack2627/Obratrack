# 🏗️ ObraTrack - Contexto, Arquitectura e Historial del Proyecto

Este documento guarda la memoria permanente, decisiones de arquitectura, credenciales públicas, configuración de bases de datos y el historial de desarrollo para que cualquier instancia del editor, dispositivo o agente de IA mantenga la continuidad total del proyecto.

---

## 👤 Información del Propietario y Entorno
- **Fundador & Administrador**: Benjamín Achávar
- **Correo Oficial**: `benja105.achavar@gmail.com`
- **GitHub**: [`https://github.com/xBenja105/ObraTrack`](https://github.com/xBenja105/ObraTrack)
- **Rama Oficial Única en GitHub**: `main` *(Todas las ramas secundarias eliminadas para evitar confusión de despliegue)*
- **Despliegue en Producción**: Vercel ([`https://obra-track-ruddy.vercel.app/`](https://obra-track-ruddy.vercel.app/))
- **Base de Datos**: Supabase PostgreSQL (con soporte pgvector y Storage)
  - **Project URL**: `https://tpszbretbtxcmnrqvlxm.supabase.co`
  - **Project Ref**: `tpszbretbtxcmnrqvlxm`
- **Espacio Local de Desarrollo**: `C:\Users\Benja\.gemini\antigravity-ide\scratch\ObraTrack`
- **Espacio de Trabajo en Escritorio**: `C:\Users\Benja\Desktop\ObraTrack-main` *(Sincronizado vía robocopy)*

---

## 🛠️ Stack Tecnológico
- **Frontend / Framework**: Next.js 14.2.5 (App Router), React 18, TypeScript, Tailwind CSS
- **Iconografía & Gráficos**: Lucide React, Recharts
- **Planificación**: Gantt Chart interactivo personalizado con soporte táctil horizontal en móviles
- **Base de Datos & Auth**: Supabase PostgreSQL (`@supabase/supabase-js`, `@supabase/ssr`), Row Level Security (RLS) + LocalStorage Fallback con soporte para límites de correo SMTP
- **Georreferenciación & Mapas**:
  - Google Maps Platform (Embed Viewer, Satélite HD / Callejero)
  - Reverse Geocoding API (`/api/geocode/reverse`)
  - Catálogo nativo de Regiones y Comunas de Chile (`lib/chile-locations.ts`)
  - Detección de GPS con geolocalización del navegador y cálculo Haversine
- **Inteligencia Artificial**:
  - OpenAI GPT-4o / GPT-4o-mini (Cotizador inteligente & análisis de audios)
  - OpenAI Whisper (Transcripción de notas de voz de WhatsApp)
  - OpenAI Embeddings (`text-embedding-3-small` con pgvector para radar de ferreterías)
- **Canal de Terreno**: WhatsApp Cloud API + Webhook de recepción de reportes

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

### 1. Control de Acceso & Autenticación Limpia (`/` y `/login`)
- Carga directa del formulario de inicio de sesión en `/` y `/login` sin micro-destellos ni montaje prematuro del Sidebar.
- Manejo inteligente del límite de envíos de correo (*email rate limit exceeded* del plan gratuito de Supabase) para permitir el registro y prueba sin bloqueos.

### 2. Gestión de Obras & Google Maps Chile (`/proyectos`)
- **Georreferenciación en Chile**:
  - Selector de las 16 regiones de Chile y todas sus comunas con coordenadas GPS precalculadas.
  - Botón **"Detectar y Rellenar con GPS"**: captura latitud/longitud del celular/PC y autocompleta automáticamente calle, número, comuna y región mediante Reverse Geocoding.
  - Visor interactivo de Google Maps (`GoogleMapsProjectViewer`) con botones directos:
    - 🚗 **"Cómo llegar en Google Maps / Waze"** (Ruta GPS directa a faena).
    - 📲 **"Compartir por WhatsApp a Cuadrilla"** (Texto formateado con enlace de mapas).
    - 📋 **"Copiar Coordenadas"**.
- Formateo dinámico de CLP con separadores de miles (`formatThousands`).
- Cálculo ponderado de avance general y saldo pendiente de cobro.

### 3. Planificación & Bitácora de Terreno (`/proyectos/[id]/gantt`)
- Carta Gantt interactiva con partidas, duración estimada y asignación de cuadrillas.
- Vista optimizada para teléfonos móviles con scroll táctil horizontal (`min-w-[680px]`).
- **Bitácora Diaria de Obra**: registro cronológico de eventos (avances, clima, incidentes, recepción de materiales) con evidencia fotográfica.
- Acceso directo a Google Maps desde la cabecera.

### 4. Control Financiero & Insumos (`/proyectos/[id]/finanzas`)
- Gráficos de distribución de ingresos, cobros pendientes e imprevistos.
- Módulo de **Materiales & Costos Directos**: agregar insumos con precio unitario CLP y proveedor asignado (Imperial, Construmart, Sodimac, Barracas).
- Registro de pagos recibidos con comprobantes y métodos (transferencia, efectivo, débito).
- Registro de imprevistos con fotografías de evidencia fotográfica.
- Acceso directo a Google Maps desde la cabecera.

### 5. Cotizador con IA & Radar de Materiales (`/cotizador`)
- Estimación paramétrica en lenguaje natural con GPT-4o.
- Estructura transparente de costos directos, gastos generales (12%), imprevistos (5%), utilidad (18%) e IVA (19%).
- Comparador de precios de ferreterías chilenas para optimizar compras.
- Conversión directa de cotización aprobada a obra activa con Carta Gantt preconfigurada.

### 6. Directorio de Clientes & Equipo (`/clientes` y `/equipo`)
- CRUD de mandantes y clientes asociados a obras.
- Gestión de trabajadores y asignación de roles (`admin`, `supervisor`, `terreno`).
- Contacto directo por WhatsApp con cada maestro de faena.

### 7. Responsividad Móvil & Centrado de Modales
- **Centrado Absoluto en Teléfonos**: Todos los diálogos modales aplican `my-auto` en el contenedor `fixed inset-0 flex items-center justify-center p-3 sm:p-4 overflow-y-auto` y `max-h-[calc(100dvh-2rem)]` para evitar desplazamientos verticales indeseados en iOS y Android.
- Menú lateral (Sidebar) con drawer deslizable, overlay con backdrop blur y cierre automático al navegar.

---

## 📜 Historial de Commits Clave
- `eac72ab`: Conexión de la app con el proyecto en vivo de Supabase (`https://tpszbretbtxcmnrqvlxm.supabase.co`).
- `2dcbfec`: Implementación de modal de conexión dinámica y sincronización PostgreSQL.
- `46e3f68`: Corrección de sintaxis de UUID hexadecimal estándar para PostgreSQL.
- `b046f49`: Formateo automático de CLP con puntos, asignación de trabajadores a obras, gestión de materiales y bitácora de obra.
- `490c26c`: Edición de proyectos, limpieza de datos falsos de prueba y empty states.
- `0c35809`: Eliminación de proyectos y reautoría completa de commits para Benjamín Achávar.
- `95e0c52`: Carga limpia directa del Login en `/` y eliminación del micro-destello del dashboard.
- `b4578de`: Fallback resiliente para registro ante límite SMTP de Supabase (*email rate limit*).
- `d048d08`: Consolidación de repositorio en una sola rama remota `main` en GitHub.
- `3203e6f`: Optimización responsiva integral para smartphones y tablets.
- `c687dde`: Centrado geométrico de todas las ventanas emergentes (modales) con `my-auto` y `max-h-[calc(100dvh-2rem)]`.
- `cabf76f`: Integración completa de Google Maps para proyectos en Chile (comunas, coordenadas y visor interactivo).
- `c187f00`: Rama `experimental` - Migración a motor de IA nativo de Google Gemini 2.5 Flash / Pro, módulo asesor de cobro al mandante (3 niveles) y botón de envío formal por WhatsApp.
- `5860e9f`: Cascada inteligente de modelos Gemini (`gemini-3.6-flash` / `gemini-3.7-flash` / `gemini-2.5-flash`) y configuración de clave API de Google AI Pro en producción Vercel.
- `d9013b4`: Canal de razonamiento y conversación natural chilena en tiempo real para faenas con Google Gemini.
- `9e65f56`: Transformación integral de `/cotizador` en Centro de Mando 100% Conversacional con Copiloto Obrero IA capaz de controlar autónomamente la web (creación de obras en `/proyectos`, alta de trabajadores en `/equipo`, asignación de cuadrillas y agenda de visitas a terreno).
- `f832dcd`: Persistencia de historial de chat por sesión activa (mantiene mensajes al navegar entre menús y reinicia limpiamente al cerrar sesión o iniciar un nuevo login).
