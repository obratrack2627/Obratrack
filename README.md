Markdown
# 🏗️ ObraTrack — Copiloto Digital de Faenas, Cotización con IA y Trazabilidad

**Plataforma web responsiva Cloud-Native de Software as a Service (SaaS), diseñada para la gestión operativa, cotización con IA y trazabilidad financiera de Mipymes y contratistas de la construcción en Chile.**

Reemplaza los registros informales en papel, las notas sueltas en chats de WhatsApp y las planillas desarticuladas por una plataforma centralizada que conecta la faena en terreno con la administración de costos y la transparencia hacia el cliente mandante.

---

## Flujo operativo de construcción

La plataforma incorpora cotizaciones manuales por partidas, aprobación y conversión a obra, gastos, jornadas, estados de pago, adicionales, bitácora fotográfica y cierre con rentabilidad. El avance físico se calcula separado del dinero cobrado; la IA queda disponible como apoyo.

**Antes de usar las nuevas pantallas, aplica la migración aditiva `supabase/migrations/20261020_flujo_constructor.sql` al proyecto Supabase de destino.** No ejecutes `supabase/schema.sql` sobre una base con datos, porque elimina tablas. El despliegue en Vercel no aplica esta migración automáticamente.

Consulta [la guía del flujo, instalación, cálculos y validación](docs/FLUJO_CONSTRUCTOR.md). Las verificaciones se ejecutan con `npm test`, `npx tsc --noEmit`, `npm run build` y `npm run test:e2e`.

## 🚀 Funcionalidades Principales

- **Copiloto Obrero & Cotizador Inteligente IA (Google Gemini API)**:
  - Generación de presupuestos y cubicación técnica automatizada a partir de descripciones en lenguaje natural mediante salidas estructuradas (*Structured Outputs JSON*).
  - **Radar Comparativo de Precios Ferreteros**: Comparación en tiempo real de insumos en pesos chilenos (CLP) entre tiendas de Chile (*Sodimac, Construmart, Imperial, MTS, Easy*).
  - Recomendación paramétrica de márgenes comerciales (Mínimo 15%, Sugerido 25-30%, Premium 35-40%).
- **Gestión de Obras & Georreferenciación GPS**:
  - Administración de proyectos con selección de 16 regiones y comunas de Chile.
  - Integración con Google Maps Platform para geolocalización automatizada y *Reverse Geocoding*.
- **Carta Gantt Interactiva Semanal**:
  - Planificación táctil de partidas con cálculo automático de avance físico ponderado.
- **Bitácora de Terreno Offline-First**:
  - Captura de fotos georreferenciadas y notas en faena con persistencia local (*IndexedDB*) y sincronización diferida hacia la nube al restablecer la red 4G/5G.
- **Control Financiero & Fuga de Utilidades**:
  - Flujo de caja, estados de pago y registro digital de adicionales e imprevistos para evitar absorción de sobrecostos no formalizados.
  - Gráficos financieros interactivos con Recharts.
- **Portal del Mandante & Mensajería WhatsApp**:
  - Portal web público transparente para clientes mandantes autenticado mediante validación de **RUT chileno (Módulo 11)**, sin requerir contraseñas.
  - Integración con **Meta WhatsApp Business Cloud API** para envío de alertas e hitos vía Webhooks Serverless (*Plantillas HSM*).
- **Exportación Oficial**:
  - Generación de presupuestos formales y cotizaciones en PDF vectorial.

---

## 🌐 Despliegue en Vivo
- **URL Oficial en Vercel**: https://obra-track-ruddy.vercel.app/

---

## 🛠️ Stack Técnico & Arquitectura Cloud-Native (3 Capas)

- **Capa 1: Presentación (Frontend Mobile-First)**
  - Next.js 14 (App Router) + React 18 (*React Server Components* & *Client Components*).
  - TypeScript (Tipado estricto end-to-end).
  - Tailwind CSS (Diseño responsivo de alto contraste para visibilidad solar en faena).
- **Capa 2: Servicios & API (Backend Serverless)**
  - Next.js Route Handlers ejecutados en la red Edge de Vercel.
  - Google Gemini API (Modelos 3.5 / 3.6 Flash para inferencias en JSON estructurado).
  - Meta WhatsApp Business Cloud API & Webhooks asíncronos.
  - Google Maps Platform (Geocoding API, Maps Embed SDK).
  - Validación de RUT chileno (Algoritmo Módulo 11).
- **Capa 3: Datos & Almacenamiento (Supabase Platform)**
  - PostgreSQL relacional en Tercera Forma Normal (3FN).
  - **Seguridad Multi-Tenant**: Políticas *Row Level Security* (RLS) por `empresa_id`.
  - **Autenticación**: Supabase Auth con tokens seguros JWT y control de acceso por roles (RBAC: Admin, Terreno, Mandante).
  - **Almacenamiento de Objetos**: Supabase Storage para fotografías y documentos PDF.
  - **Tiempo Real**: Supabase Realtime vía WebSockets.
- **Hosting**: Vercel Edge Network.

---

## 🔒 Cumplimiento Normativo Chileno (Compliance)

- **Ley N° 21.719**: Protección de Datos Personales (Cifrado TLS 1.3 / AES-256, derechos ARCO, privacidad por diseño).
- **Ley N° 21.663**: Ley Marco de Ciberseguridad e Infraestructura Crítica.
- **Ley N° 19.496**: Protección de los Derechos de los Consumidores.
- **Normas Chilenas (NCh)**: Especificaciones de construcción e Instituto Nacional de Normalización (INN).

---

## 📁 Estructura del Proyecto

obratrack/
├── app/
│   ├── api/
│   │   ├── cotizador/route.ts          # Endpoint Cotizador IA & JSON Schema Gemini
│   │   ├── chat/route.ts               # Asistente conversacional de obras & costos
│   │   ├── geocode/reverse/route.ts    # Reverse Geocoding con Google Maps API
│   │   └── webhook/whatsapp/route.ts   # Webhook Serverless Meta WhatsApp Cloud API
│   ├── cotizador/page.tsx              # Módulo Cotizador IA & Radar de Materiales Chile
│   ├── clientes/page.tsx               # Módulo Directorio de Clientes & Validación RUT
│   ├── dashboard/page.tsx              # Centro de Mando, KPIs & Gráficos
│   ├── equipo/page.tsx                 # Módulo Cuadrillas & Asignación de Terreno
│   ├── login/page.tsx                  # Autenticación con Supabase Auth (JWT)
│   ├── proyectos/
│   │   ├── page.tsx                    # Panel Central de Obras & Google Maps
│   │   └── [id]/
│   │       ├── finanzas/page.tsx       # Control Financiero, Flujo de Caja & Recharts
│   │       └── gantt/page.tsx          # Carta Gantt Semanal & Bitácora Offline
│   ├── reportes/page.tsx               # Bandeja de Mensajería & Reportes WhatsApp
│   ├── globals.css                     # Estilos globales y diseño responsivo
│   ├── layout.tsx                      # Layout raíz con Sidebar & Context Providers
│   └── page.tsx                        # Redirección raíz
├── components/
│   ├── GanttChart.tsx                  # Componente Carta Gantt táctil semanal
│   ├── GoogleMapsProjectViewer.tsx     # Visor interactivo de mapas GPS
│   ├── Navbar.tsx                      # Header con acciones contextuales
│   └── Sidebar.tsx                     # Navegación lateral blueprint
├── lib/
│   ├── supabase/                       # Clientes Supabase (SSR, Browser, Admin Key)
│   ├── gemini.ts                       # Cliente central Google Gemini API & Prompts
│   ├── data-service.ts                 # Servicio central de datos PostgreSQL & Supabase
│   ├── mock-data.ts                    # Dataset demo e índices ferreteros CLP
│   ├── utils.ts                        # Formateadores CLP, RUT Módulo 11 y fechas
│   └── chile-locations.ts              # Catálogo de 16 regiones y comunas de Chile
├── types/
│   └── database.ts                     # Tipos TypeScript exportados del esquema 3FN
├── supabase/
│   ├── migrations/                     # Migraciones SQL & Estructura 3FN
│   └── rules.sql                       # Políticas de seguridad Row Level Security (RLS)
├── .env.example                        # Variables de entorno de referencia
├── package.json
└── tsconfig.json


---

## ⚙️ Instalación y Puesta en Marcha en Local

### 1. Clonar e Instalar Dependencias
```bash
git clone [https://github.com/obratrack2627/Obratrack.git](https://github.com/obratrack2627/Obratrack.git)
cd Obratrack
npm install
2. Configurar Variables de Entorno
Copia el archivo .env.example a .env.local e ingresa tus credenciales:

Bash
cp .env.example .env.local
Ejemplo de .env.local:

Fragmento de código
NEXT_PUBLIC_SUPABASE_URL=tu_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_supabase_service_role_key
GEMINI_API_KEY=tu_google_gemini_api_key
NEXT_PUBLIC_MAPS_API_KEY=tu_google_maps_api_key
WHATSAPP_TOKEN=tu_whatsapp_cloud_api_token
3. Ejecutar Servidor de Desarrollo
Bash
npm run dev
Abre http://localhost:3000 en tu navegador.

👥 Equipo de Desarrollo (INACAP 2026)
Benjamín Arriagada Achavar — Ingeniero Full-Stack & Arquitecto Cloud.

Jorge Andre Castro Arteaga — Ingeniero de Requerimientos & Testing QA.

Académica Guía: Teresa Jesús Tapia Soto.
