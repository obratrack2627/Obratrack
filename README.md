# 🏗️ ObraTrack — SaaS de Gestión de Obras, Cotización con IA y Trazabilidad

![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_%2B_RLS-3ECF8E?logo=supabase&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google_Gemini-Structured_JSON-4285F4?logo=google&logoColor=white)
![WhatsApp Cloud API](https://img.shields.io/badge/Meta_WhatsApp-Graph_API_v23-25D366?logo=whatsapp&logoColor=white)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=obratrack2627_Obratrack&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=obratrack2627_Obratrack)

**ObraTrack** es una plataforma web **Software as a Service (SaaS) Cloud-Native y Multi-Tenant** diseñada para contratistas, maestros y Mipymes de la construcción en Chile. Centraliza presupuestos asistidos por IA, planificación táctica, control financiero y reportes desde terreno vía web móvil y WhatsApp, eliminando planillas sueltas, registros en papel y fugas de utilidad por adicionales no cobrados.

🌐 **Aplicación en Producción:** [https://obratrack-5zwn.vercel.app](https://obratrack-5zwn.vercel.app)

---

## ✨ Módulos Principales del SaaS

| Módulo | Ruta | Qué resuelve |
| :--- | :--- | :--- |
| **Centro de Mando** | `/dashboard` | KPIs consolidados en vivo: obras activas, avance físico ponderado, flujo de caja en CLP y alertas operativas. |
| **Cotizador IA & Presupuestos** | `/cotizador` · `/proyectos/[id]/presupuestos` | Cubicación de materiales, mano de obra y cronograma con **Google Gemini** (`JSON Schema`). El servidor recalcula determinísticamente costos directos, gastos generales, margen e IVA (19%) y exporta cotizaciones formales en **PDF**. |
| **Gestión Integral de Obras** | `/proyectos` · `/proyectos/[id]/*` | Ficha georreferenciada con **Google Maps** (16 regiones y comunas de Chile) y pestañas dedicadas por obra: **Carta Gantt táctil** (`/gantt`), **Finanzas y pagos** (`/finanzas`), **Cambios/Adicionales** (`/cambios`), **Asistencia** (`/asistencia`), **Documentos** (`/documentos`) y **Chat IA** (`/ia`). |
| **Copiloto Web & WhatsApp** | `/reportes` · Widget global | Mismo motor transaccional en la web y en **Meta WhatsApp Cloud API**: permite cotizar, crear obras, registrar abonos/avances, analizar fotos o audios de faena y despachar avisos individuales a la cuadrilla con trazabilidad de entrega. |
| **Clientes & Equipo Multi-Rol** | `/clientes` · `/equipo` | Directorio con validación de **RUT chileno (Módulo 11)** y gestión de accesos RBAC por empresa (`admin`, `supervisor` y `terreno`, donde terreno solo opera sobre sus obras asignadas). |

---

## 💼 Planes de Suscripción SaaS (CLP)

| Plan | Precio Mensual | Alcance Operativo |
| :--- | :--- | :--- |
| **Gratis** (`gratis`) | **$0** / mes | 1 obra activa, georreferenciación Google Maps, clientes, Carta Gantt táctil, pagos básicos e imprevistos. |
| **Pro** (`pro`) | **$12.990** / mes | Obras ilimitadas, **Cotizador IA + APU**, asesor de cobro en 3 tarifas, finanzas avanzadas con gráficos, carga de boletas/documentos y exportación PDF. |
| **Pro IA** (`pro_ia`) | **$24.990** / mes | Todo el Plan Pro + **Canal bidireccional WhatsApp IA** (texto, voz y fotos), agentes autónomos que actualizan obras/Gantt/pagos y despacho de avisos multi-cuadrilla. |

---

## 🛠️ Arquitectura y Stack Tecnológico

- **Frontend (Mobile-First):** Next.js `14.2` (App Router, RSC + Client Components), React `18.3`, TypeScript `5` estricto, Tailwind CSS `3.4` (modo claro/oscuro de alto contraste solar), Recharts, Lucide React y fuentes autoalojadas (`next/font/local`). Resiliencia local con cola de reintentos idempotentes para zonas con señal 4G inestable.
- **Backend Serverless & Edge:** 17 Route Handlers en `app/api/*`, guardia perimetral en `middleware.ts` (`HTTP 401` / anti-*Open Redirect*) y cliente HTTP `undici` con control de *timeouts* y TLS.
- **Inteligencia Artificial Multimodal:** Google Gemini API (`gemini-3.5-flash-lite` con *fallback* a `gemini-3.1-flash-lite`), validación estricta de contratos JSON y ejecución por lotes validados antes de persistir.
- **Datos, Auth y Storage (Supabase):** PostgreSQL en 3FN con aislamiento **Multi-Tenant** mediante *Row Level Security* (`RLS` por `empresa_id`), Supabase Auth (`JWT`), buckets privados/públicos en Supabase Storage y colas programadas (`pg_cron` + `pg_net` + Supabase Vault) para despachos de WhatsApp.
- **Seguridad y Calidad (DevSecOps):** Firmas `HMAC-SHA256` (`timingSafeEqual`) en webhooks de Meta, cabeceras estrictas (`HSTS`, `X-Frame-Options`, `nosniff`), 83 pruebas unitarias (`node:test`), pruebas E2E (`Playwright`), pruebas de carga (`Apache JMeter`), escaneo dinámico (`OWASP ZAP`) y auditoría continua SAST en **SonarQube Cloud**.

---

## 📁 Estructura del Repositorio

```text
Obratrack/
├── app/
│   ├── api/                    # Endpoints Serverless (IA, presupuestos, sync, geocode, WhatsApp)
│   ├── cotizador/              # Cotizador con IA y exportación PDF
│   ├── dashboard/              # Centro de mando y KPIs
│   ├── proyectos/[id]/         # Módulos por obra: gantt, finanzas, presupuestos, cambios, asistencia, documentos, ia
│   ├── clientes/ · equipo/     # CRM con RUT Módulo 11 y administración RBAC de cuadrillas
│   ├── asistencia/ · planes/   # Control global de asistencia y planes SaaS
│   └── reportes/               # Bandeja auditada y avisos enviados por WhatsApp
├── components/                 # UI modular (GanttChart, Copiloto, GoogleMaps, PDF Modal, paneles WhatsApp)
├── lib/
│   ├── ai/                     # Motor Gemini, esquemas JSON, permisos y ejecutor transaccional
│   ├── supabase/               # Clientes Auth, RLS, Storage y servicio multi-tenant
│   └── whatsapp/               # Conector Meta Graph API v23, verificación HMAC, evidencias y cola de salida
├── supabase/                   # Esquema SQL 3FN, migraciones aditivas, RLS y colas WhatsApp
├── tests/ · e2e/               # 83 tests unitarios/integración (node:test) y suite E2E (Playwright)
└── docs/                       # Guías técnicas de IA y configuración de Meta WhatsApp
```

---

## ⚙️ Puesta en Marcha Local

1. **Clonar e instalar dependencias**
   ```bash
   git clone https://github.com/obratrack2627/Obratrack.git
   cd Obratrack
   npm install
   ```

2. **Configurar variables de entorno**
   Copia `.env.example` a `.env.local` y completa las claves del servidor (las credenciales de IA y de Meta viven exclusivamente en el backend, nunca con prefijo `NEXT_PUBLIC_`):
   ```bash
   cp .env.example .env.local
   ```

3. **Ejecutar desarrollo y suites de verificación**
   ```bash
   npm run dev        # Servidor local en http://localhost:3000
   npm test           # 83 pruebas automatizadas (node:test)
   npm run test:e2e   # Suite End-to-End con Playwright
   npm run build      # Compilación optimizada de producción
   ```

📖 **Documentación técnica detallada:**
- [Arquitectura y flujo del Copiloto IA y Cotizaciones](docs/CHATBOT_IA.md)
- [Integración de WhatsApp personal del jefe y cola de avisos](docs/WHATSAPP_JEFE_OBRA.md)

---

## 🔒 Normativa y Equipo (INACAP 2026)

Diseñado bajo estándares de privacidad y ciberseguridad vigentes en Chile (**Ley N° 21.719** de Protección de Datos Personales y **Ley N° 21.663** Marco de Ciberseguridad), incluyendo portabilidad íntegra en JSON y supresión local de datos.

- **Benjamín Arriagada Achavar** — Arquitectura Cloud & Desarrollo Full-Stack
- **Jorge Andre Castro Arteaga** — Ingeniería de Requerimientos & Aseguramiento de Calidad (QA)
- **Académica Guía:** Teresa Jesús Tapia Soto
