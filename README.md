# 🏗️ ObraTrack

**Plataforma web responsiva de gestión de proyectos y control de costos para PYMEs constructoras en Chile (3-10 personas).**

Reemplaza las planillas Excel, los chats desordenados de WhatsApp y las notas en papel por una plataforma centralizada con:
- **Cotizador Inteligente & Radar de Precios IA (OpenAI GPT-4o)**: Estimación de presupuestos, cubicación de materiales, cálculo de cobro al cliente con margen neto y comparador de precios en ferreterías chilenas (Sodimac, Construmart, Imperial, MTS, Easy).
- **RAG Semántico de Materiales con pgvector**: Búsqueda por similitud vectorial en el catálogo de insumos de construcción con `text-embedding-3-small`.
- **Carta Gantt interactiva** generada en 1 clic desde las cotizaciones.
- **Control financiero de pagos e imprevistos** con gráficos de rentabilidad.
- **Reportes automáticos de terreno vía WhatsApp con OpenAI Whisper & GPT-4o-mini**.

## 🌐 Despliegue en Vivo
- **URL Oficial en Vercel**: [`https://obra-track-42is4k242-benjamin-arriagada-achavar-s-projects.vercel.app`](https://obra-track-42is4k242-benjamin-arriagada-achavar-s-projects.vercel.app)

---

## 🚀 Stack Técnico Implementado

- **Frontend & Backend**: Next.js 14 (App Router), TypeScript, React Server Components.
- **Estilos & UI**: Tailwind CSS, Lucide Icons, paleta de diseño técnico chileno.
- **Base de Datos & Auth**: Supabase (PostgreSQL 15+ con Row Level Security + Auth).
- **Carta Gantt**: Gantt interactivo semanal con seguimiento de partidas en terreno.
- **Gráficos Financieros**: Recharts (desglose de cotizaciones, cobros e imprevistos).
- **Inteligencia Artificial (Google Gemini 3.6 Flash)**:
  - **Copiloto Obrero IA (`/cotizador`)**: Asistente conversacional de terreno con control autónomo de la web (creación de obras, registro de personal, asignación de cuadrillas y visitas técnicas).
  - **Asistente de WhatsApp para Mandantes (`/reportes`)**: Chatbot conversacional con autenticación segura por RUT chileno, generación de fichas ejecutivas de obras y envío de fotografías de faena.
- **Canal WhatsApp**:
  - **WhatsApp Cloud API (Meta)** & **Twilio WhatsApp Sandbox**: Webhook bidireccional en vivo (`/api/webhook/whatsapp`).
- **Hosting**: Vercel.

---

## 📁 Estructura del Proyecto

```
obratrack/
├── app/
│   ├── api/
│   │   ├── cotizador/route.ts          # API Cotizador & APU con OpenAI GPT-4o-mini
│   │   │   └── chat/route.ts           # Asistente conversacional de obras & costos
│   │   └── webhook/whatsapp/route.ts   # Webhook WhatsApp Cloud API + OpenAI Whisper
│   ├── cotizador/page.tsx              # Módulo Cotizador IA & Radar de Materiales Chile
│   ├── clientes/page.tsx               # Módulo Directorio de Clientes & Facturación
│   ├── equipo/page.tsx                 # Módulo Cuadrilla & Vinculación WhatsApp
│   ├── login/page.tsx                  # Módulo Login & Conmutador de Roles
│   ├── proyectos/
│   │   ├── page.tsx                    # Módulo Panel Central de Proyectos & KPIs
│   │   └── [id]/
│   │       ├── finanzas/page.tsx       # Módulo Financiero, Gráfico Donut, Pagos e Imprevistos
│   │       └── gantt/page.tsx          # Módulo Carta Gantt Interactiva
│   ├── reportes/page.tsx               # Módulo Bandeja de Reportes WhatsApp (Whisper + GPT-4o-mini)
│   ├── globals.css                     # Estilos globales y texturas blueprint
│   ├── layout.tsx                      # Layout raíz con fuentes y Sidebar
│   └── page.tsx                        # Redirección raíz
├── components/
│   ├── GanttChart.tsx                  # Componente Carta Gantt semanal
│   ├── Navbar.tsx                      # Header con acciones contextuales
│   └── Sidebar.tsx                     # Menú lateral blueprint con selector de rol
├── lib/
│   ├── openai.ts                       # Cliente central OpenAI (GPT-4o, Whisper, Embeddings)
│   ├── data-service.ts                 # Servicio central de datos y persistencia
│   ├── mock-data.ts                    # Dataset demo inicial y catálogo de materiales Chile
│   ├── utils.ts                        # Formateadores CLP, RUT chileno y fechas
│   └── supabase/                       # Clientes browser y server de Supabase
├── types/
│   └── database.ts                     # Definición de tipos TypeScript
├── schema.sql                          # Script SQL completo de PostgreSQL con pgvector y RLS
├── .env.example                        # Ejemplo de variables de entorno
└── package.json
```

---

## ⚙️ Instalación y Puesta en Marcha en Local

### 1. Requisitos Previos
- Node.js versión 18 o superior.
- Gestor de paquetes `npm` o `pnpm`.

### 2. Clonar e Instalar Dependencias
```bash
cd obratrack
npm install
```

### 3. Configurar Variables de Entorno
Copia el archivo `.env.example` a `.env.local`:
```bash
cp .env.example .env.local
```

Rellena las claves según tus servicios:
```env
# 1. Supabase (Postgres, Auth, Storage y pgvector)
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key

# 2. OpenAI API
OPENAI_API_KEY=sk-proj-...

# 3. WhatsApp Cloud API (Meta Oficial)
WHATSAPP_CLOUD_API_ACCESS_TOKEN=EAAG...
WHATSAPP_CLOUD_API_PHONE_NUMBER_ID=1234567890
WHATSAPP_WEBHOOK_VERIFY_TOKEN=obratrack_webhook_token_secret
```

### 4. Configurar Base de Datos en Supabase
1. Ingresa a tu panel de [Supabase](https://supabase.com).
2. Abre el **SQL Editor**.
3. Copia y pega el contenido del archivo `schema.sql`.
4. Ejecuta el script: habilitará la extensión `vector`, creará las tablas, índices HNSW, políticas RLS y los datos semilla chilenos.

### 5. Iniciar Servidor de Desarrollo
```bash
npm run dev
```
Abre tu navegador en `http://localhost:3000`.

---

## 👥 Roles de Usuario

| Rol | Permisos |
| :--- | :--- |
| **`admin`** | Dueño/Gerente de la constructora. Visualiza todas las obras, finanzas, cotizador IA, métricas y aprueba reportes. |
| **`supervisor`** | Jefe de obras. Cotizador IA, gestiona la carta Gantt, actividades y aprueba reportes de terreno. |
| **`terreno`** | Maestro mayor / capataz. Reporta avances e imprevistos directamente por WhatsApp (audio/texto). |
