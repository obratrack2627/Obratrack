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
   - Inteligencia Artificial: **OpenAI Responses**, único motor activo (`AI_PROVIDER=openai`, sin fallback), con salida estructurada `JSON Schema` y recálculo determinístico. Identidad pública: **ObraBot**, sin marcas del proveedor. Canal móvil: **Meta WhatsApp Cloud API (Graph API v23)**.

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
- Jefe de obra corresponde al rol `supervisor`: por WhatsApp solo gestiona obras donde está asignado; al crear una queda asignado automáticamente. Admin gestiona las obras de su empresa. Validar teléfono único, rol y asignación también al guardar con `whatsapp_identidad_obra.sql`. No recuperar respuestas antiguas tras perder rol o asignación.
- Crear obras por WhatsApp reutiliza el cliente existente sin exigir ni modificar correo, teléfono o RUT de su ficha. No confundir «Juan Campos que ya está en Clientes» con un cliente nuevo; pedir solo los datos faltantes de la obra y aclarar coincidencias ambiguas.
- Las consultas por obras asignadas usan la lista completa autorizada, sin limitarse a la obra activa de la conversación. Las fotos se confirman una vez con obra, tipo y título; conservar íntegro el detalle en bitácora y responder aparte las preguntas sobre la imagen.
- Cierres de jornada: vista previa y PDF comparten el resumen guardado. WhatsApp entrega el PDF privado por ID de medio solo a admin/jefe autorizado; no publicar enlaces financieros sin autenticación ni enviar mensajes reales en pruebas.
- Nuevas fichas de equipo: nombre completo, RUT, teléfono, correo, rol y obra para terreno. Se crean sin cuenta Auth ni contraseña. El registro y la asignación usan `crear_integrante_equipo`; no crear personas implícitas al asignar una cuadrilla.
- Evidencias de WhatsApp: originales privados, referencia estable `whatsapp-evidencias:` y firma de URL en lectura. PDF/Word/Excel son documentos; una boleta no genera un pago automáticamente.
- Migraciones finales en orden: `contactos_whatsapp.sql`, luego `flujo_terreno_rbac.sql`. Las pruebas nativas en `tests/sql` revierten sus fixtures.

- WhatsApp: conversación natural sin cabecera de marca, emojis automáticos ni contadores de acciones. Los documentos conservan su desglose. No modificar presupuesto al cambiar un estado; no confirmar envíos entregados cuando solo están en cola.

- Asistencia: solo administradores y supervisores pueden crear, corregir o eliminar registros. Terreno no marca ni siquiera su propia entrada/salida por texto, audio, imagen o ubicación. Aplicar `asistencia_solo_jefatura.sql` después de `flujo_terreno_rbac.sql`.

## Lógica de obra (2026-11-13)
- Aplicar `gestion_diaria_20261113.sql` y luego `logica_constructor_20261113.sql`. Las pruebas SQL son transacciones con ROLLBACK; nunca enviar WhatsApp real para probar.
- Cierre automático: exige partidas y todas completas; corregir/agregar trabajo pendiente reabre a `activo` aunque antes estuviera pausada. Canceladas y cierres manuales se preservan. La recepción del mandante es independiente; al reabrir queda pendiente, conservando actas.
- El snapshot de IA usa el estado persistido de la obra, no el derivado del avance, para no transformar un cierre automático en manual. No enviar columnas de recepción ni banderas automáticas mediante sincronización genérica.
- Compra, recepción parcial y pago de materiales son independientes. Pago desconocido no equivale a pagado ni a deuda confirmada. Incidentes internos nunca incrementan contrato. Adicionales modifican contrato/plazo solo por revisión explícita con respaldo del mandante.
- Jornales desde asistencia y actas de recepción usan RPCs con actor verificado, recálculo nativo e idempotencia. No crear pagos al recibir materiales, adjuntar boletas, cerrar jornada o calcular jornales. Terreno no puede realizar operaciones de jefatura.
- Registro de cuenta: RUT personal y nombre comercial opcionales; nunca exigir RUT de empresa. Si se informa RUT debe ser válido. Correo y sesión siguen verificados por Auth.
- Entrega y recepción del mandante retirada de la interfaz y de ObraBot. No reintroducir el panel ni el registro de actas; los datos históricos se conservan sin mostrarse en Documentos. La recepción de materiales y los plazos de obra siguen vigentes.
