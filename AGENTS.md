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
   - Inteligencia Artificial: **OpenAI Responses / Gemini**, seleccionables en servidor mediante `AI_PROVIDER`, con salida estructurada `JSON Schema` y recálculo determinístico. Identidad pública: **ObraBot**, sin marcas del proveedor. Canal móvil: **Meta WhatsApp Cloud API (Graph API v23)**.

3. **Convenciones de Interfaz & Negocio (Chile)**:
   - Moneda: Pesos Chilenos (CLP) sin decimales (`$12.990`, `$15.000.000`).
   - Los campos de entrada de montos deben aplicar formato automático con separador de miles en tiempo real usando `formatThousands` y `parseThousands` de `lib/utils.ts`.
   - Validación tributaria: RUT chileno bajo algoritmo oficial **Módulo 11** (`validarRutChileno`).
   - Identidad visual: Modo claro (*Papel Kraft* `#FAF8F5`) y modo oscuro de alto contraste (`#0B0F14` / `#141A23`), con acentos *Naranjo Obra* (`#FF6A00`) y *Verde Terreno* (`#6B8F72`).

4. **Documentación Técnica Relacionada**:
   - Consultar `docs/CHATBOT_IA.md` para la arquitectura del Copiloto IA, presupuestos verificados y comparador de materiales.
   - Consultar `docs/WHATSAPP_JEFE_OBRA.md` para la integración con Meta WhatsApp Cloud API y colas de avisos.

## Acceso y terreno
- Web y sus APIs: solo `admin` o `is_dev=true` verificado en Supabase. `supervisor` sin Dev y `terreno` usan WhatsApp, nunca una cookie UUID como credencial.
- Developer es un privilegio de sistema protegido, no un rol que el cliente pueda autoconcederse. El selector de planes de desarrollo usa un RPC con JWT y no cobra.
- WhatsApp identifica por teléfono único; terreno solo usa obras asignadas y conserva un contexto de obra validado. No enviarle presupuestos ni información financiera privada.
- Nuevas fichas de equipo: nombre completo, RUT, teléfono, correo, rol y obra para terreno. Se crean sin cuenta Auth ni contraseña. El registro y la asignación usan `crear_integrante_equipo`; no crear personas implícitas al asignar una cuadrilla.
- Evidencias de WhatsApp: originales privados, referencia estable `whatsapp-evidencias:` y firma de URL en lectura. PDF/Word/Excel son documentos; una boleta no genera un pago automáticamente.
- Migraciones finales en orden: `contactos_whatsapp.sql`, luego `flujo_terreno_rbac.sql`. Las pruebas nativas en `tests/sql` revierten sus fixtures.

- WhatsApp: conversación natural sin cabecera de marca, emojis automáticos ni contadores de acciones. Los documentos conservan su desglose. No modificar presupuesto al cambiar un estado; no confirmar envíos entregados cuando solo están en cola.
