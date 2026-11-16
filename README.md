# 🏗️ ObraTrack — SaaS de Gestión de Obras, Cotización con IA y Trazabilidad

![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_%2B_RLS-3ECF8E?logo=supabase&logoColor=white)
![ObraBot](https://img.shields.io/badge/ObraBot-OpenAI_Responses-FF6A00)
![WhatsApp Cloud API](https://img.shields.io/badge/Meta_WhatsApp-Graph_API_v23-25D366?logo=whatsapp&logoColor=white)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=obratrack2627_Obratrack&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=obratrack2627_Obratrack)

**ObraTrack** es una plataforma web **Software as a Service (SaaS) Cloud-Native, Multi-Tenant e instalable como PWA** diseñada para contratistas, maestros y Mipymes de la construcción en Chile. Centraliza presupuestos verificados con IA, comparación de precios reales de materiales, conversión directa de presupuesto a obra, planificación táctica y estados de pago formales.

🌐 **Aplicación en Producción:** [https://obratrack-cl.vercel.app](https://obratrack-cl.vercel.app)

---

## ✨ Módulos Principales del SaaS

| Módulo | Ruta | Qué resuelve |
| :--- | :--- | :--- |
| **Centro de Mando** | `/dashboard` | KPIs sincronizados entre dispositivos (`CloudSync`): obras activas, avance físico ponderado, flujo de caja en CLP y alertas de plazos. |
| **Cotizador IA & Conversión a Obra** | `/cotizador` · `/proyectos/[id]/presupuestos` | Cubicación con **ObraBot (OpenAI Responses)**, precios reales publicados en ferreterías chilenas (`Easy`, `Dimaco` + catálogo referencial), recálculo determinístico de IVA (19%), exportación **PDF** y **conversión en 1 clic a Obra activa** con Carta Gantt y materiales precargados. |
| **Gestión Integral & Estados de Pago** | `/proyectos` · `/proyectos/[id]/*` | Ficha georreferenciada con **Google Maps** y pestañas por obra: **Carta Gantt táctil** (`/gantt`), **Finanzas, Estados de Pago PDF (EDP) y Cartola Excel `.xlsx`** (`/finanzas`), **Cambios/Adicionales** (`/cambios`), **Asistencia** (`/asistencia`), **Documentos** (`/documentos`) y **Copiloto IA de Obra** (`/ia`). |
| **Canal WhatsApp & Reportes** | `/reportes` | Integración con **Meta WhatsApp Cloud API**: analiza texto, audios y fotografías de faena, registra avances o compras y despacha avisos auditados a la cuadrilla. |
| **Clientes, Equipo & Suscripción** | `/clientes` · `/equipo` · `/planes` | CRM con validación de **RUT chileno (Módulo 11)**, control RBAC (`admin`, `supervisor`, `terreno`), medidores reales de uso del tenant y portabilidad íntegra de datos JSON. |

---

## 💼 Planes de Suscripción SaaS (CLP)

| Plan | Precio Mensual | Alcance Operativo |
| :--- | :--- | :--- |
| **Gratis** (`gratis`) | **$0** / mes | 1 obra activa, georreferenciación Google Maps, clientes, Carta Gantt táctil, pagos básicos e imprevistos. |
| **Pro** (`pro`) | **$12.990** / mes | Obras ilimitadas, **Cotizador IA + APU**, comparador de precios de materiales, conversión presupuesto a obra, Estados de Pago PDF y exportación Excel (`.xlsx`). |
| **Pro IA** (`pro_ia`) | **$24.990** / mes | Todo el Plan Pro + **Canal bidireccional WhatsApp IA** (texto, voz y fotos), agentes autónomos y despacho de avisos multi-cuadrilla. |

---

## 🛠️ Arquitectura y Stack Tecnológico

- **Frontend (Mobile-First & PWA):** Next.js `14.2` (App Router), React `18.3`, TypeScript `5`, Tailwind CSS `3.4` (modo claro/oscuro con selector global fijo), Web App Manifest (`app/manifest.ts`), Recharts, ExcelJS y fuentes autoalojadas (`next/font/local`). Sincronización automática multi-dispositivo al recuperar foco o conexión (`CloudSync`).
- **Backend Serverless & Edge:** Route Handlers en `app/api/*`, guardia perimetral en `middleware.ts` (validación estructural UUID/JWT y anti-*Open Redirect*), cabeceras de seguridad (`CSP`, `HSTS`, `X-Frame-Options`, `Permissions-Policy`) y cliente HTTP `undici`.
- **Inteligencia Artificial & Catálogos:** ObraBot (OpenAI Responses) API (`lib/ai/openai-provider.ts` con contratos `JSON Schema`), consulta de precios reales publicados en tiendas de construcción en Chile y ejecución transaccional validada.
- **Datos, Auth y Storage (Supabase):** PostgreSQL en 3FN con aislamiento **Multi-Tenant** mediante *Row Level Security* (`RLS` por `empresa_id`), Supabase Auth (`JWT`), Supabase Storage y colas programadas (`pg_cron` + `pg_net`) para WhatsApp.
- **Calidad y Seguridad (DevSecOps):** Firmas `HMAC-SHA256` (`timingSafeEqual`), suite automatizada unitaria/integración (`node:test`), pruebas E2E (`Playwright`), pruebas de carga (`Apache JMeter`), escaneo `OWASP ZAP` y análisis continuo en **SonarQube Cloud**.

---

## ⚙️ Puesta en Marcha Local

```bash
git clone https://github.com/obratrack2627/Obratrack.git
cd Obratrack
npm install
cp .env.example .env.local   # Configurar claves de Supabase, OpenAI y Meta en servidor
npm run dev                  # Servidor local en http://localhost:3000
npm test                     # Suite unitaria e integración (node:test)
npm run test:e2e             # Suite End-to-End (Playwright)
npm run build                # Compilación optimizada de producción
```

📖 **Documentación técnica:** [Copiloto IA y Cotizaciones](docs/CHATBOT_IA.md) · [Integración WhatsApp Jefe de Obra](docs/WHATSAPP_JEFE_OBRA.md)

---

## 🔒 Normativa y Equipo (INACAP 2026)

Referencias normativas para revisión jurídica y operativa en Chile (**Ley N° 21.719** de Protección de Datos Personales y **Ley N° 21.663** Marco de Ciberseguridad), con exportación de datos en JSON y procedimientos de privacidad que deben acreditarse operativamente. La documentación no constituye una certificación de cumplimiento legal.

- **Benjamín Arriagada Achavar** — Arquitectura Cloud & Desarrollo Full-Stack
- **Jorge Andre Castro Arteaga** — Ingeniería de Requerimientos & Aseguramiento de Calidad (QA)
- **Académica Guía:** Teresa Jesús Tapia Soto

## Validación y operación

- `npm run lint`, `npm test`, `npm run build`, `npm run typecheck` y `npm run test:e2e`.
- Pruebas SQL en un contenedor desechable: `QA_CONTAINER=<contenedor-pgvector> scripts/test-native-sql.sh`. No ejecutarlas contra producción.
- Correcciones de auditoría, respaldo y despliegue: [plan y evidencia](docs/AUDITORIA_CORRECCIONES_20261116.md).
- No aplicar `supabase/schema.sql` a una base existente: reconstruye tablas. Las actualizaciones usan migraciones aditivas con historial.
