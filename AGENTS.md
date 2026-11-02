# Reglas y Memoria del Agente (ObraTrack)

## Directivas del Proyecto
1. **Identidad del Proyecto y Repositorio**:
   - Repositorio oficial en producción: `https://github.com/obratrack2627/Obratrack`
   - Aplicación web SaaS desplegada en Vercel: `https://obratrack-5zwn.vercel.app`
   - Equipo de Ingeniería (INACAP 2026): Benjamín Arriagada Achavar & Jorge Andre Castro Arteaga.

2. **Base de Datos, Autenticación y Backend Cloud-Native**:
   - Base de datos relacional: **Supabase (PostgreSQL en 3FN)** con aislamiento **Multi-Tenant** estricto mediante *Row Level Security* (`RLS` filtrado por `empresa_id`).
   - Autenticación: **Supabase Auth** (`JWT` + validación de sesión por servidor en Route Handlers de `app/api/*` y guardia perimetral en `middleware.ts`).
   - Almacenamiento multimedia y documental: **Supabase Storage** (`bitacora-fotos`, `documentos-obra`).
   - Inteligencia Artificial: **Google Gemini API** (`@google/genai` con salida estructurada `JSON Schema` y recálculo determinístico en servidor) + **Meta WhatsApp Cloud API (Graph API v23)**.

3. **Convenciones de Interfaz & Negocio (Chile)**:
   - Moneda: Pesos Chilenos (CLP) sin decimales (`$12.990`, `$15.000.000`).
   - Los campos de entrada de montos deben aplicar formato automático con separador de miles en tiempo real usando `formatThousands` y `parseThousands` de `lib/utils.ts`.
   - Validación tributaria: RUT chileno bajo algoritmo oficial **Módulo 11** (`validarRutChileno`).
   - Identidad visual: Modo claro (*Papel Kraft* `#FAF8F5`) y modo oscuro de alto contraste (`#0B0F14` / `#141A23`), con acentos *Naranjo Obra* (`#FF6A00`) y *Verde Terreno* (`#6B8F72`).

4. **Documentación Técnica Relacionada**:
   - Consultar `docs/CHATBOT_IA.md` para la arquitectura del Copiloto IA, presupuestos verificados y comparador de materiales.
   - Consultar `docs/WHATSAPP_JEFE_OBRA.md` para la integración con Meta WhatsApp Cloud API y colas de avisos.
