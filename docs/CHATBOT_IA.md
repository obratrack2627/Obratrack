# Chatbot de cotizaciones y gestión de obras

El chat general (`/cotizador`), el copiloto flotante y el asistente de cada obra usan el mismo protocolo y motor de ejecución.

## Configuración del servidor

- `GEMINI_API_KEY`: clave de Google AI Studio con acceso a Gemini. También se admiten `GOOGLE_API_KEY` o `GOOGLE_GENAI_API_KEY` como alternativas existentes.
- `GEMINI_MODEL`: opcional, predeterminado `gemini-3.5-flash-lite`.
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: deben corresponder al proyecto donde los usuarios inician sesión. Se mantienen los valores públicos predeterminados del cliente existente si no se configuran.

Las claves de IA se leen únicamente en el servidor. No uses `NEXT_PUBLIC_GEMINI_API_KEY`. La configuración de Next.js ya no publica las claves de Gemini/Google en los bundles del navegador.

En Vercel, guarda la clave en las variables del proyecto para el entorno de despliegue correspondiente y vuelve a desplegar. Configurar secretos en Codex no los copia a Vercel, ni configurar Vercel los inyecta en una tarea ya iniciada de Codex.

En el entorno de Codex, guarda el secreto `GEMINI_API_KEY` con destino `generativelanguage.googleapis.com` y aplica/publica la configuración. Reinicia el servidor de desarrollo para recoger las variables nuevas. El transporte del servidor respeta HTTPS_PROXY/NO_PROXY y verifica TLS.

El token personal `SUPABASE_ACCESS_TOKEN` sirve para administración de Supabase; no reemplaza la sesión de usuario ni se envía desde el navegador para ejecutar las acciones del chat. El chatbot usa la sesión real de Supabase Auth y las políticas RLS, sin requerir la clave service_role para sus nuevas escrituras.

## Flujo

1. El usuario inicia sesión en la plataforma y escribe su solicitud.
2. La API verifica el token de Supabase, el perfil y, en el chat por obra, la pertenencia de la obra a la empresa y su asignación cuando el perfil es de terreno. Consulta datos actuales de SQL; descarta inventarios enviados desde el navegador.
3. Gemini devuelve JSON con texto, acciones, sugerencias y una cotización opcional. La solicitud incluye un esquema con los tipos de acción y sus campos admitidos; el servidor vuelve a validar la respuesta.
4. Se valida el lote completo antes de modificar registros locales. Una obra inexistente o ambigua no se sustituye por la primera de la lista.
5. Los cambios se guardan en Supabase con la sesión del usuario, respetando claves externas. La confirmación se muestra después de que Supabase confirme el guardado.
6. Si falla la escritura, se conserva un guardado pendiente en el dispositivo. **Reintentar guardado** reutiliza los mismos registros e IDs y no vuelve a ejecutar el pago o crear la obra.

Las escrituras de un lote a varias tablas no son una transacción SQL. Si un paso remoto falla, el lote queda pendiente y se reintenta con upserts de los mismos IDs. No se presenta como guardado completo.

## Cotizaciones

Ejemplo: «Cotiza una terraza de 35 m² en Maipú, con estructura de madera y cubierta, margen del 25 %».

La IA pregunta por información insuficiente y prepara materiales, mano de obra y planificación. El servidor recalcula subtotales, gastos generales, imprevistos, utilidad e IVA en CLP; no acepta los totales inventados por el modelo como fuente contable.

**Ver cotización / PDF** muestra esos mismos datos, sin sustituirlos por una plantilla de porcelanato. Guardar PDF utiliza el diálogo nativo de impresión del navegador. El documento incluye los costos indirectos para que el detalle sume el neto. No se inventan destinatarios, teléfonos o un esquema de anticipos: las condiciones no proporcionadas quedan por acordar.

Los precios de Gemini son estimaciones, no consultas verificadas en tiempo real a ferreterías. Las cotizaciones nuevas se guardan en la tabla `presupuestos` desde el servidor antes de responder. Las cotizaciones anteriores de WhatsApp se incorporan mediante una migración aditiva. El historial general conserva su caché local. Obras y proyectos incluye una pestaña de presupuestos con búsqueda, filtros, estado, asociación a obra y PDF. Aprobar un presupuesto no crea una obra ni registra pagos.

## Acciones disponibles

- Crear y actualizar obras; eliminar una obra indicada explícitamente.
- Crear y actualizar clientes.
- Registrar trabajadores y asignar/desasignar cuadrilla.
- Crear varias actividades y materiales en una solicitud; actualizar avances.
- Registrar pagos, imprevistos y bitácora.
- Registrar cambios, asistencia y documentos.
- Agendar visitas e hitos y generar reportes.
- Preparar mensajes o, ante una petición expresa de envío, encolar avisos reales a trabajadores por rol o nombre y opcionalmente por obra. El servidor registra los destinatarios y el procesador de WhatsApp envía con seguimiento por persona. Requiere las migraciones y configuración descritas en la guía de WhatsApp.

Se conservan las restricciones del plan y los estados de los módulos existentes. Para asistencia, cambios, documentos y los campos V2 de reportes, el proyecto debe tener aplicada la migración existente `supabase/migrations_v2.sql`. No ejecutes `supabase/schema.sql` sobre datos existentes: contiene eliminación de tablas. El arranque y las pruebas no aplican SQL automáticamente. En esta configuración se activaron los tres módulos SQL y sus políticas por empresa usando la migración existente; no se aplicaron sus políticas públicas de Storage. Se verificaron inserción, lectura y aislamiento con una transacción de diagnóstico que terminó en ROLLBACK, sin conservar registros de prueba.

## Errores y pruebas

La falta de configuración, cuota agotada, credenciales rechazadas, timeout o JSON truncado producen errores visibles. No activan un motor heurístico que simule haber cotizado o realizado acciones.

```sh
npm ci --cache /workspace/.npm-cache
npm test
npx tsc --noEmit
npm run build
npx playwright install chromium
npm run test:e2e
```

En un entorno con Chromium instalado:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Las pruebas de proveedor y rutas usan respuestas controladas. Las pruebas de ejecución comprueban los campos enviados contra el esquema del repositorio, y las del navegador interceptan API y Supabase. Ninguna modifica datos reales ni consume cuota de Gemini. Estas pruebas no sustituyen una validación con las credenciales reales ya aplicadas y una cuenta de usuario auténtica.

Validación automatizada: pruebas de lógica, rutas y navegador, TypeScript y compilación de producción. Además se comprobó Gemini con cotización real (cantidades, margen e IVA) y un plan de acciones sin ejecutarlo sobre registros de negocio. Supabase se verificó por separado con diagnóstico transaccional y ROLLBACK. El proveedor puede devolver indisponibilidad temporal; el chat muestra ese error para permitir reintentar. No se realizó una sesión de navegador con las credenciales de una cuenta real.

## Canal del jefe por WhatsApp

Consulta [la guía de WhatsApp personal → ObraTrack](WHATSAPP_JEFE_OBRA.md) para conectar el teléfono del jefe, revisar registros y activar avisos al equipo. Crear una obra por este canal requiere nombre del cliente, nombre de la obra, presupuesto, correo y teléfono; el borrador se conserva mientras falten datos. Los demás campos son opcionales.

## Preparación de producción (octubre de 2026)

Se corrigió la ruta general: Next pasa un objeto de contexto como segundo argumento y este no debe confundirse con el ID de una obra. Una prueba reproduce ese contrato real de invocación.

Se retiraron el simulador de WhatsApp, el endpoint de atención externa no conectado, las fotos de ejemplo y el selector de planes de demostración. También se retiró `auth/dev-sync`, que podía reemplazar credenciales sin verificar la contraseña anterior. La recuperación de acceso conserva Supabase Auth.

La sincronización ahora requiere JWT real, obtiene la empresa de la sesión, usa el cliente con RLS y verifica las referencias antes de escribir. Envía únicamente filas editadas, conserva pendientes al fallar y no fuerza el plan ni vuelve a subir obras eliminadas durante una lectura. Los endpoints de carga de archivos y cálculo de materiales también requieren sesión. La sincronización web de varias tablas mantiene el límite de escrituras secuenciales descrito arriba.

Aplicar `supabase/produccion_copiloto.sql` y después `supabase/whatsapp_jefe.sql` en una misma transacción. La función de WhatsApp conserva compatibilidad con llamadas anteriores mediante el parámetro opcional de adjunto. No ejecutar `schema.sql` en producción.
