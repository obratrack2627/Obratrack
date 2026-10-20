# 🏗️ ObraTrack

**Plataforma web responsiva de gestión de proyectos, planificación Gantt, control de costos y cotizaciones inteligentes para PYMEs constructoras en Chile.**

Reemplaza las planillas Excel, los chats desordenados de WhatsApp y las notas en papel por una plataforma centralizada con:
- **Cotizador Inteligente & Radar de Precios IA (Google Gemini)**: Estimación de presupuestos, cubicación de materiales, cálculo de cobro al cliente con margen neto y comparador de precios en ferreterías chilenas (Sodimac, Construmart, Imperial, MTS, Easy).
- **Backend Oficial en Google Firebase**: Cloud Firestore, Firebase Auth y Firebase Storage (`obratrack-24ff6`).
- **Carta Gantt interactiva** generada en 1 clic desde las cotizaciones.
- **Control financiero de pagos e imprevistos** con gráficos interactivos Recharts.
- **Reportes automáticos de terreno vía WhatsApp Cloud API**.

## 🌐 Despliegue en Vivo
- **URL Oficial en Vercel**: https://obratrack-5zwn.vercel.app/

---

## 🚀 Stack Técnico Implementado

- **Frontend & Backend**: Next.js 14 (App Router), TypeScript, React Server Components.
- **Estilos & UI**: Tailwind CSS, Lucide Icons, paleta de diseño técnico chileno.
- **Carta Gantt**: Gantt interactivo semanal con seguimiento de partidas en terreno y soporte táctil móvil.
- **Gráficos Financieros**: Recharts (desglose de cotizaciones, cobros e imprevistos).
- **Inteligencia Artificial (Google Gemini 3.6 / 3.7 / 2.5 Flash)**:
  - **Copiloto Obrero IA (`/cotizador`)**: Asistente conversacional de terreno con control autónomo de la web (creación de obras, registro de personal, asignación de cuadrillas y visitas técnicas).
  - **Asistente de WhatsApp para Mandantes (`/reportes`)**: Chatbot conversacional con autenticación segura por RUT chileno, generación de fichas ejecutivas de obras y envío de fotografías de faena.
- **Geolocalización**: Google Maps Platform (Embed Viewer, Reverse Geocoding en Chile).
- **Canal WhatsApp**:
  - **WhatsApp Cloud API (Meta)** & **Twilio WhatsApp Sandbox**: Webhook bidireccional en vivo (`/api/webhook/whatsapp`).
- **Hosting**: Vercel.

---

## 📁 Estructura del Proyecto

```
obratrack/
├── app/
│   ├── api/
│   │   ├── cotizador/route.ts          # API Cotizador & APU con Gemini
│   │   │   └── chat/route.ts           # Asistente conversacional de obras & costos
│   │   ├── geocode/reverse/route.ts    # Reverse Geocoding con Google Maps
│   │   └── webhook/whatsapp/route.ts   # Webhook WhatsApp Cloud API
│   ├── cotizador/page.tsx              # Módulo Cotizador IA & Radar de Materiales Chile
│   ├── clientes/page.tsx               # Módulo Directorio de Clientes & Facturación
│   ├── dashboard/page.tsx              # Centro de Mando & KPIs en vivo
│   ├── equipo/page.tsx                 # Módulo Cuadrilla & Vinculación WhatsApp
│   ├── login/page.tsx                  # Módulo Login con Firebase Auth
│   ├── proyectos/
│   │   ├── page.tsx                    # Módulo Panel Central de Proyectos & Google Maps
│   │   └── [id]/
│   │       ├── finanzas/page.tsx       # Módulo Financiero, Pagos e Insumos
│   │       └── gantt/page.tsx          # Módulo Carta Gantt & Bitácora Diaria
│   ├── reportes/page.tsx               # Módulo Bandeja de Reportes WhatsApp
│   ├── globals.css                     # Estilos globales y texturas blueprint
│   ├── layout.tsx                      # Layout raíz con Sidebar
│   └── page.tsx                        # Redirección raíz
├── components/
│   ├── FirebaseStatusModal.tsx         # Modal de estado y sincronización Firestore
│   ├── GanttChart.tsx                  # Componente Carta Gantt semanal
│   ├── GoogleMapsProjectViewer.tsx     # Visor de mapas y rutas GPS
│   ├── Navbar.tsx                      # Header con acciones contextuales
│   └── Sidebar.tsx                     # Menú lateral blueprint
├── lib/
│   ├── firebase/                       # Clientes de Firebase (Config, Auth, Firestore, Storage)
│   ├── gemini.ts                       # Cliente central Google Gemini AI
│   ├── data-service.ts                 # Servicio central de datos y sincronización Firestore
│   ├── mock-data.ts                    # Dataset demo inicial y catálogo de materiales Chile
│   ├── utils.ts                        # Formateadores CLP, RUT chileno y fechas
│   └── chile-locations.ts              # Catálogo de 16 regiones y comunas de Chile
├── types/
│   └── database.ts                     # Definición de tipos TypeScript
├── firestore.rules                     # Reglas de seguridad de Cloud Firestore
├── firebase.json                       # Configuración de Firebase
├── .env.example                        # Ejemplo de variables de entorno
└── package.json
```

---

## ⚙️ Instalación y Puesta en Marcha en Local

### 1. Clonar e Instalar Dependencias
```bash
npm install
```

### 2. Configurar Variables de Entorno
Copia el archivo `.env.example` a `.env.local`:
```bash
cp .env.example .env.local
```

### 3. Ejecutar Servidor de Desarrollo
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000) en tu navegador.
