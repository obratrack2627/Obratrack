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
2. La API verifica el token de Supabase, el perfil y, en el chat por obra, la pertenencia de la obra a la empresa.
3. Gemini devuelve JSON con texto, acciones, sugerencias y una cotización opcional.
4. Se valida el lote completo antes de modificar registros locales. Una obra inexistente o ambigua no se sustituye por la primera de la lista.
5. Los cambios se guardan en Supabase con la sesión del usuario, respetando claves externas. La confirmación se muestra después de que Supabase confirme el guardado.
6. Si falla la escritura, se conserva un guardado pendiente en el dispositivo. **Reintentar guardado** reutiliza los mismos registros e IDs y no vuelve a ejecutar el pago o crear la obra.

Las escrituras de un lote a varias tablas no son una transacción SQL. Si un paso remoto falla, el lote queda pendiente y se reintenta con upserts de los mismos IDs. No se presenta como guardado completo.

## Cotizaciones

Ejemplo: «Cotiza una terraza de 35 m² en Maipú, con estructura de madera y cubierta, margen del 25 %».

La IA pregunta por información insuficiente y prepara materiales, mano de obra y planificación. El servidor recalcula subtotales, gastos generales, imprevistos, utilidad e IVA en CLP; no acepta los totales inventados por el modelo como fuente contable.

**Ver cotización / PDF** muestra esos mismos datos, sin sustituirlos por una plantilla de porcelanato. Guardar PDF utiliza el diálogo nativo de impresión del navegador. El documento incluye los costos indirectos para que el detalle sume el neto. No se inventan destinatarios, teléfonos o un esquema de anticipos: las condiciones no proporcionadas quedan por acordar.

Los precios de Gemini son estimaciones, no consultas verificadas en tiempo real a ferreterías. Las cotizaciones y el historial general conservan la persistencia local existente; no se creó una tabla nueva de cotizaciones en esta corrección.

## Acciones disponibles

- Crear y actualizar obras; eliminar una obra indicada explícitamente.
- Crear y actualizar clientes.
- Registrar trabajadores y asignar/desasignar cuadrilla.
- Crear varias actividades y materiales en una solicitud; actualizar avances.
- Registrar pagos, imprevistos y bitácora.
- Registrar cambios, asistencia y documentos.
- Agendar visitas e hitos y generar reportes.
- Preparar mensajes de WhatsApp para que el usuario decida enviarlos. El chat no envía mensajes automáticamente.

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

Validación de esta corrección: 26 pruebas de lógica y rutas, 6 pruebas de navegador, TypeScript y compilación de producción. Además se comprobó Gemini con cotización real (cantidades, margen e IVA) y un plan de acciones sin ejecutarlo sobre registros de negocio. Supabase se verificó por separado con diagnóstico transaccional y ROLLBACK. El proveedor puede devolver indisponibilidad temporal; el chat muestra ese error para permitir reintentar. No se realizó una sesión de navegador con las credenciales de una cuenta real.
