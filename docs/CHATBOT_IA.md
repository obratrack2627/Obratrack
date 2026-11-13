# Chatbot de cotizaciones y gestión de obras

El chat general (`/cotizador`) y el asistente de cada obra usan el mismo protocolo y motor de ejecución. El chat general permite elegir la obra; cada contexto conserva su conversación y presupuesto por separado. El chat flotante permite usar este mismo motor sin abandonar el módulo actual. Pro permite consultas, cotizaciones y búsqueda de materiales; Pro IA agrega cambios en las obras y avisos al equipo.

## Configuración del servidor

La identidad pública es **ObraBot**. La interfaz, los mensajes de error y los planes no muestran el fabricante ni el modelo. Los nombres técnicos se mantienen únicamente en configuración y documentación de operación.

- `AI_PROVIDER`: `gemini` (predeterminado para conservar despliegues existentes) u `openai`. No se cambia automáticamente al encontrar una clave.
- `OPENAI_API_KEY`: clave privada del nuevo proveedor, solo en el servidor.
- `OPENAI_MODEL`: predeterminado `gpt-6.1-sol`, equilibrio entre capacidad y costo. Configurable sin cambiar el código.
- `OPENAI_REASONING_EFFORT`: predeterminado `low`, para acotar latencia y consumo. Debe ser compatible con el modelo configurado.
- `OPENAI_TRANSCRIPTION_MODEL`: predeterminado `gpt-transcribe`.
- `AI_FALLBACK_PROVIDER`: `none` (predeterminado), `gemini` u `openai`. Solo se usa ante cuota/límites, red, timeout o indisponibilidad, dentro del tiempo total permitido. Errores de credencial, esquema, truncamiento o rechazo no se ocultan con un respaldo.
- `GEMINI_API_KEY`: conservar para la reversión; también admite `GOOGLE_API_KEY` o `GOOGLE_GENAI_API_KEY`.
- `GEMINI_MODEL`: conserva el predeterminado `gemini-3.5-flash-lite`.
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: proyecto donde los usuarios inician sesión.

Todas las claves de IA son privadas: no usar variables `NEXT_PUBLIC_`. Codex y Vercel tienen configuraciones independientes. En Codex, guardar `OPENAI_API_KEY` como secreto con destino `api.openai.com`. El transporte respeta HTTPS_PROXY/NO_PROXY y verifica TLS. En Vercel, guardar las variables para el entorno correspondiente y desplegar de nuevo.

### Activación y vuelta al proveedor anterior

1. Guardar `OPENAI_API_KEY` y comprobar llamadas reales de texto estructurado, imagen y transcripción con datos temporales.
2. Cambiar `AI_PROVIDER=openai`. Si se desea continuidad ante agotamiento de cuota, configurar `AI_FALLBACK_PROVIDER=gemini` y conservar la clave anterior.
3. Para volver al motor anterior: `AI_PROVIDER=gemini`, `AI_FALLBACK_PROVIDER=none` y volver a desplegar. No requiere SQL, cambiar cotizaciones ni modificar usuarios.
4. El commit anterior a esta migración es `6ea718b`, guardado también como etiqueta `backup/pre-openai-2026-11-03`. Sirve como referencia para una reversión completa del código si fuera necesaria; el cambio por variable es la primera opción.

El respaldo solo repite la generación de una respuesta, nunca una escritura ya ejecutada. Los registros de negocio conservan sus identificadores, permisos y mecanismos de reintento. Ninguna prueba de proveedor envía mensajes reales al equipo.

El nuevo adaptador usa Responses con `store:false`, salida JSON estricta y el esquema de acciones de la plataforma. Convierte los campos opcionales a nullable para el proveedor y los restaura como ausentes antes de validar el protocolo; esto evita interpretar un `null` como una instrucción para borrar datos. La imagen original y la pregunta viajan juntas. Las notas Ogg/Opus de Meta se decodifican localmente a WAV mono de 16 kHz, con tamaño y plazo limitados, para la API de transcripción. Las pruebas usan una señal de audio de 100 ms, no una conversación real.

Modelos y capacidades consultados el 3 de noviembre de 2026: https://developers.openai.com/api/docs/models/gpt-6.1-sol y https://developers.openai.com/api/docs/models/gpt-transcribe . Los costos dependen del contexto y la respuesta; un saldo pequeño sirve para validación limitada, no garantiza operación continua. Verificar el consumo en el panel del proveedor.

El token personal `SUPABASE_ACCESS_TOKEN` sirve para administración de Supabase; no reemplaza la sesión de usuario ni se envía desde el navegador para ejecutar las acciones del chat. El chatbot usa la sesión real de Supabase Auth y las políticas RLS, sin requerir la clave service_role para sus nuevas escrituras.

## Flujo

1. El usuario inicia sesión en la plataforma y escribe su solicitud.
2. La API verifica el token de Supabase, el perfil y, en el chat por obra, la pertenencia de la obra a la empresa y su asignación cuando el perfil es de terreno. Consulta datos actuales de SQL; descarta inventarios enviados desde el navegador.
3. El proveedor configurado devuelve JSON con texto, acciones, sugerencias y una cotización opcional. La solicitud incluye un esquema con los tipos de acción y sus campos admitidos; el servidor vuelve a validar la respuesta.
4. Se valida el lote completo antes de modificar registros locales. Una obra inexistente o ambigua no se sustituye por la primera de la lista.
5. Los cambios se guardan en Supabase con la sesión del usuario, respetando claves externas. La confirmación se muestra después de que Supabase confirme el guardado.
6. Si falla la escritura, se conserva un guardado pendiente en el dispositivo. **Reintentar guardado** reutiliza los mismos registros e IDs y no vuelve a ejecutar el pago o crear la obra.

Las escrituras de un lote a varias tablas no son una transacción SQL. Si un paso remoto falla, el lote queda pendiente y se reintenta con upserts de los mismos IDs. No se presenta como guardado completo.

## Continuidad y contexto de obra

ObraBot recupera antecedentes literales de la conversación: medidas, cliente, ubicación, materiales, cantidades, IVA, condiciones y correcciones. Selecciona turnos recientes y antecedentes relevantes dentro de un presupuesto de texto, conservando el orden cronológico y una referencia a las primeras especificaciones. No genera un resumen adicional con otra llamada de IA. Las tres rutas de interpretación (consulta/gestión, cotización y búsqueda de materiales) usan esta misma selección. Las cotizaciones admiten hasta 45 segundos de generación con respaldo dentro de ese plazo; las consultas mantienen 30 segundos. Fotos y audios de WhatsApp conservan límites más cortos para reservar tiempo al almacenamiento y al envío.

La plataforma selecciona los antecedentes antes de enviarlos, en vez de limitarse a los últimos diez mensajes. Cada obra conserva su conversación separada. Los mensajes de error también mantienen ese contexto. El chat general se conserva en el navegador actual; el chat de proyecto conserva su sincronización existente con Supabase. Este cambio no agrega sincronización del chat general entre dispositivos ni memoria ilimitada.

WhatsApp recupera hasta 80 intercambios recientes del mismo actor y empresa para la conversación. Las confirmaciones, menús y borradores siguen su flujo transaccional existente; ampliar el contexto no repite una creación o un pago antiguo.

El servidor incluye un extracto de los registros actuales autorizados: actividades y responsables, materiales pendientes/comprados, bitácora, asistencia, cambios y, para los perfiles autorizados, pagos e imprevistos. Cada sección declara su total y si fue recortada; las coincidencias con la consulta tienen prioridad. En el chat de obra solo se incluyen sus registros y el cliente registrado, sin usar el inventario enviado por el navegador.

Las reglas indican pedir únicamente lo que falta, respetar correcciones recientes y diferenciar declaraciones del usuario, estimaciones y estados guardados. Una respuesta histórica no acredita un pago; un material comprado no acredita recepción ni instalación. Las peticiones explícitas de «solo consulta» se validan en el servidor para impedir escrituras aunque el modelo proponga acciones. Ante ambigüedad o información ausente debe pedir aclaración, en vez de fingir que recuerda. Estos controles reducen errores; no garantizan que toda respuesta del modelo sea correcta.

## Instrucciones y referencias conversacionales

Los cambios simples de estado se resuelven en el servidor antes de llamar al modelo.
«Quiero que la dejes como cancelada», «déjala en pausa», «márcala como terminada»
y «reanúdala» utilizan una obra autorizada e inequívoca del contexto inmediato.
La web y WhatsApp comparten el intérprete. No se cambia el presupuesto al modificar
un estado, ni se escribe de nuevo cuando ya tiene el estado solicitado.

La referencia distingue nombres completos y homónimos: mencionar «Radier Norte»
no selecciona también «Radier». Una lista con varias obras, un nombre desconocido
o antecedentes contradictorios requiere aclaración. El chat de una obra rechaza
cambios dirigidos a otra. El chat general aporta al modelo la obra de referencia
identificada a partir de los registros autorizados, sin aceptar el inventario del navegador.

Cuando pregunta «¿Qué obra quieres marcar como cancelada?», responder con su
nombre completa esa instrucción. Solo vale para la aclaración inmediata; cambiar
de tema o mencionar un nombre en otro momento no repite una acción anterior.
Las negativas y las peticiones de solo consulta se validan también cuando el modelo
propone acciones. La confirmación continúa dependiendo del guardado real, con los
reintentos idempotentes existentes; no se añade otra escritura de estado en el intérprete.

## Cotizaciones

Ejemplo: «Cotiza una terraza de 35 m² en Maipú, con estructura de madera y cubierta, margen del 25 %».

La IA pregunta por información insuficiente y prepara materiales, mano de obra y planificación. El servidor recalcula subtotales, gastos generales, imprevistos, utilidad e IVA en CLP; no acepta los totales inventados por el modelo como fuente contable.

**Ver cotización / PDF** muestra esos mismos datos, sin sustituirlos por una plantilla de porcelanato. Descargar PDF genera un archivo A4 con texto seleccionable, logo compacto y paginación automática del detalle. La descarga se realiza en el dispositivo, sin enviar el documento a servicios externos. Imprimir conserva un botón independiente para el diálogo de impresión. El documento incluye los costos indirectos para que el detalle sume el neto. No se inventan destinatarios, teléfonos o un esquema de anticipos: las condiciones no proporcionadas quedan por acordar.

Los precios usados al estimar un presupuesto con ObraBot son referencias, sujetos a confirmación. La búsqueda de materiales es una herramienta separada: el modelo extrae producto, marca, modelo y presentación, y el servidor lee los catálogos de Easy y Dimaco y los precios públicos de Sodimac. También consulta los endpoints públicos de Construmart e Imperial; si bloquean el acceso o no publican un precio disponible, quedan marcados como no disponibles, sin reemplazarlo con una estimación. El precio, fuente y fecha provienen de esa consulta, no de una cifra generada por el modelo. No cubre todo el mercado. Solo recomienda el menor precio entre productos con el mismo código comercial válido y la misma unidad de venta; los demás se presentan como opciones que deben revisarse. El despacho, IVA, condiciones comerciales y disponibilidad local se confirman en la tienda. Si una tienda no responde o no está integrada, se informa y no se reemplaza por una estimación. Los totales de compra solo se calculan cuando se conocen unidades de venta, sin convertir kg, litros o m2 en sacos o cajas por suposición.

**Editar** abre el presupuesto guardado para cambiar cliente, alcance, materiales, mano de obra, porcentajes, validez, observaciones y condiciones sin llamar a la IA. Guardar cambios recalcula los montos en el servidor y actualiza el mismo ID y fecha de emisión; conserva estado, origen y obra asociada. La versión `updated_at` evita sobrescribir una edición concurrente. Cancelar conserva el presupuesto guardado. El editor está disponible para administración y supervisión desde Presupuestos o desde la vista PDF del chat. El PDF vuelve a consultar el presupuesto vigente al abrirse.

Los importes y el texto del presupuesto se recalculan en el servidor. La utilidad por defecto es un recargo sobre costos e indirectos; el margen sobre venta usa la fórmula neto = base / (1 - margen), con margen menor a 100%. Un precio de material informado explícitamente con IVA se normaliza una sola vez; los costos del presupuesto son netos y el IVA de venta se muestra separado. El cálculo de adicionales pregunta por medidas insuficientes y devuelve errores reales, sin listas ni montos de reemplazo. El PDF y la comparación se conservan en el historial nativo del chat de cada obra. Las cotizaciones nuevas se guardan en la tabla `presupuestos` desde el servidor antes de responder. Las cotizaciones anteriores de WhatsApp se incorporan mediante una migración aditiva. El historial general conserva su caché local. Obras y proyectos incluye una pestaña de presupuestos con búsqueda, filtros, estado, asociación a obra y PDF. Aprobar un presupuesto no crea una obra ni registra pagos.

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

Las pruebas de proveedor y rutas usan respuestas controladas. Las pruebas de ejecución comprueban los campos enviados contra el esquema del repositorio, y las del navegador interceptan API y Supabase. Ninguna modifica datos reales ni consume cuota de los proveedores. Estas pruebas no sustituyen una validación con las credenciales reales ya aplicadas y una cuenta de usuario auténtica.

Validación automatizada: pruebas de lógica, rutas y navegador, TypeScript y compilación de producción. Además se comprobó Gemini con cotización real (cantidades, margen e IVA) y un plan de acciones sin ejecutarlo sobre registros de negocio. Supabase se verificó por separado con diagnóstico transaccional y ROLLBACK. El proveedor puede devolver indisponibilidad temporal; el chat muestra ese error para permitir reintentar. No se realizó una sesión de navegador con las credenciales de una cuenta real.

## Canal del jefe por WhatsApp

Consulta [la guía de WhatsApp personal → ObraTrack](WHATSAPP_JEFE_OBRA.md) para conectar el teléfono del jefe, revisar registros y activar avisos al equipo. Crear una obra por este canal requiere nombre del cliente, nombre de la obra, presupuesto, correo y teléfono; el borrador se conserva mientras falten datos. Los demás campos son opcionales.

## Preparación de producción (octubre de 2026)

Se corrigió la ruta general: Next pasa un objeto de contexto como segundo argumento y este no debe confundirse con el ID de una obra. Una prueba reproduce ese contrato real de invocación.

Se retiraron el simulador de WhatsApp, el endpoint de atención externa no conectado, las fotos de ejemplo y el selector de planes de demostración. También se retiró `auth/dev-sync`, que podía reemplazar credenciales sin verificar la contraseña anterior. La recuperación de acceso conserva Supabase Auth.

La sincronización ahora requiere JWT real, obtiene la empresa de la sesión, usa el cliente con RLS y verifica las referencias antes de escribir. Envía únicamente filas editadas, conserva pendientes al fallar y no fuerza el plan ni vuelve a subir obras eliminadas durante una lectura. Los endpoints de carga de archivos y cálculo de materiales también requieren sesión. La sincronización web de varias tablas mantiene el límite de escrituras secuenciales descrito arriba.

PC y celular consultan la nube al entrar, cambiar de pantalla, recuperar conexión o volver a la aplicación. Mientras la pestaña esté visible se actualizan cada 30 segundos. Las peticiones simultáneas de la misma sesión comparten la lectura o subida; una respuesta de una cuenta anterior se descarta. Se conservan las ediciones pendientes y se reintenta su subida al reconectar. Si falla la actualización, se muestra un aviso con reintento; no se presenta la caché antigua como una sincronización correcta.

Aplicar `supabase/produccion_copiloto.sql` y después `supabase/whatsapp_jefe.sql` en una misma transacción. La función de WhatsApp conserva compatibilidad con llamadas anteriores mediante el parámetro opcional de adjunto. No ejecutar `schema.sql` en producción.


## Consultas habituales

- «Cotiza un radier de 20 m2 en Maipú, 10 cm de espesor, materiales y mano de obra».
- «Cambia solo la utilidad al 25% sobre el precio de venta».
- «Busca precio de 3 unidades del taladro percutor Makita HP1630K de 13mm en Easy y Dimaco».
- «Resume los pendientes y el saldo de esta obra».
- «Registra un abono de 300000 por transferencia en esta obra» (Pro IA).

Aplicar `supabase/copiloto_materiales.sql` después de las migraciones existentes. Añade metadatos de presupuesto y consultas de catálogo al historial del proyecto y conserva el borrador de obra de WhatsApp cuando el usuario cambia de tarea. La función interna de guardado es exclusiva del servidor. La recepción de un aviso o consulta intermedia no obliga a cancelar ni completar el borrador.

## Presupuesto → obra

Después de cotizar se pregunta si se desea crear la obra. El constructor puede revisar el Gantt sugerido, elegir si precarga sus partidas y materiales, o conservar solo el presupuesto. La creación se confirma con un botón; cotizar no crea registros de obra. El presupuesto vinculado a una obra muestra acceso a su Gantt, sin proponer una duplicación.

`POST /api/presupuestos/convertir` consulta el presupuesto vigente y llama a `convertir_presupuesto_obra`. La función guarda cliente, proyecto, partidas, materiales, bitácora y asociación del presupuesto en una transacción con RLS. Reintentar devuelve la obra ya vinculada. Los presupuestos de WhatsApp conservan su ID de registro `wa:...` y el ID del documento `cot-...`; ambos se resuelven al abrir y editar. La conversión conserva cantidades fraccionarias, contacto y duración; una ubicación desconocida no obtiene coordenadas inventadas.

Migraciones aditivas de este flujo: `supabase/flujo_obra.sql` y `supabase/presupuesto_whatsapp_obra.sql`. `supabase/archivos_privados.sql` se aplica con la versión que renueva los enlaces ya desplegada. Esta última retira permisos anónimos de lectura, carga y borrado y protege los buckets de documentos/fotos por empresa, obra y perfil. La sincronización renueva enlaces temporales; no se debe guardar un token permanente ni marcar los buckets como públicos.

Los estados de pago por avance proponen cero si no existe avance pendiente de cobrar; los anticipos acordados se introducen en modo manual. Los pagos pendientes y anulados se conservan en el registro pero no se suman como cobrados. El saldo después de materiales e imprevistos no representa una utilidad contable final. Los PDF de presupuestos y estados de pago se descargan directamente y la impresión tiene su control separado.

## Permisos y registro de constructoras

Aplicar `supabase/permisos_obra.sql` y después `supabase/registro_constructor.sql` antes de desplegar el cliente de autenticación actualizado. Los permisos de escritura financiera y de planificación se comprueban también en SQL, y el personal de terreno solo consulta sus obras asignadas y modifica sus propios registros de terreno. No puede cambiar perfiles, empresa ni plan desde el cliente.

El registro crea empresa y perfil en una transacción de Supabase Auth, con plan Gratis. Si el correo requiere confirmación y todavía no hay sesión, el navegador no intenta crear registros relacionales ni inventa una empresa local. Al iniciar sesión consulta `completar_registro_actual`, que reutiliza el perfil propio y recupera un alta anterior incompleta cuando sus datos lo permiten. Las invitaciones de empleados continúan por el servidor. Las migraciones no reasignan los usuarios ni planes existentes.

`flujo_obra.sql` también añade `foto_url` a los imprevistos: el formulario y la sincronización escriben esa evidencia, incluso cuando su valor es nulo.

## Registro conversacional compartido

La web (chat general, chat por obra y ventana flotante) y WhatsApp usan el mismo
intérprete de altas de clientes y trabajadores. Conserva el borrador en el historial
existente, también durante consultas intermedias, y solicita solo los datos
obligatorios faltantes o inválidos. No agrega columnas ni nuevas tablas.

Los móviles chilenos de ocho dígitos reciben `+569`; los de nueve que comienzan
por `9`, `+56`. Un RUT etiquetado o un presupuesto no se interpreta como teléfono.
Los campos ajenos a una operación se descartan antes de validarla: registrar una
persona no exige días, partidas ni presupuesto. Los permisos y la validación del
RUT siguen vigentes. Una ficha existente con el mismo RUT se reutiliza al asignarla;
las diferencias de contacto requieren aclaración antes de modificarla.

Las gestiones de seguimiento usan la obra identificada inequívocamente en el
contexto autorizado. Una referencia ambigua requiere aclaración. Las altas y
asignaciones siguen confirmándose después del guardado; una repetición automática
del mismo mensaje de Meta conserva la idempotencia existente.

El respaldo anterior a esta corrección es
`backup/antes-contexto-obrabot-2026-11-10`. Para revertir únicamente este cambio
sin modificar los registros: `git revert ai/obrabot-contexto-2026-11-10` y publicar
la reversión en `main`. No cambia la configuración del proveedor de IA ni requiere
migraciones SQL.

## Nombres y correcciones de fichas

El registro no acepta frases de conversación como «Ya te di todos los datos» como
nombre. También sanea ese valor en un borrador antiguo y conserva sus demás datos.
Las correcciones de nombre conservan su intención mientras se identifica la ficha:
si el siguiente mensaje indica un RUT, este se usa para buscar al integrante y se
cambia únicamente el nombre solicitado. La ficha recién registrada puede
identificarse por su resultado guardado; homónimos o referencias desconocidas
requieren aclaración. La web y WhatsApp conservan esta edición pendiente en sus
historiales existentes, sin migraciones ni cambios de rol, teléfono o asignaciones.

## Lenguaje chileno y preferencias explícitas

La web y WhatsApp usan reglas compartidas para lenguaje de terreno chileno,
CLP, IVA 19 %, fechas de Chile, vocabulario técnico y distinción entre evidencia
y autorización. `chilean-context.ts` interpreta expresiones monetarias acotadas
como «treinta lucas» o «un palo y medio». Antes de aceptar un pago o gasto se
rechaza una conversión que contradiga un único monto coloquial inequívoco. Las
expresiones ambiguas requieren aclaración; no se interpreta madera como dinero.

`preferences.ts` conserva solo preferencias explícitas de detalle, tiendas y
comuna habitual. No extrae recuerdos de respuestas del modelo ni aprende roles,
identidades, precios, permisos o autorizaciones. Una comuna habitual no confirma
la ubicación de una obra. Las tiendas preferidas no aseguran cobertura ni precio.

Ejemplos: «Recuerda que prefiero respuestas cortas», «Para materiales recuerda
que prefiero comparar Sodimac y Construmart», «Recuerda que mi comuna habitual
es La Florida», «¿Qué recuerdas de mis preferencias?» y «Olvida todas mis
preferencias». Las correcciones reemplazan lo anterior y olvidar deja una lista
vacía explícita para no recuperar recuerdos viejos.

Se reutilizan los historiales existentes, sin migraciones: en WhatsApp la copia
se guarda junto al mensaje confirmado y se transmite al siguiente, aunque los
mensajes originales salgan de la ventana de 80. En la web viaja en los metadatos
del historial y se conserva donde se guarda esa conversación (local en consulta
general; historial de obra cuando corresponde). Borrar ese historial también
elimina su memoria. Las preferencias se separan por usuario, empresa y contexto
de obra; no se sincronizan como un perfil global entre dispositivos o canales.
Esto es memoria de conversación, no entrenamiento ni ajuste automático del modelo.

Validación: `tests/chilean-context.test.cjs`, rutas web y WhatsApp, y prueba móvil
de persistencia al recargar/olvidar en `e2e/chatbot.spec.ts`.


## Asistencia bajo control de jefatura

Solo `admin` y `supervisor` pueden crear, corregir y eliminar asistencia.
Terreno no puede marcarse, marcar cuadrillas ni alterar una ausencia previa.
Los pedidos directos de automarcación se responden sin llamar al modelo; las
acciones de asistencia propuestas por el modelo también pasan por el permiso
compartido. Las mutaciones de DataService y la sincronización verifican el mismo
permiso. El responsable del registro/corrección se toma del actor autenticado,
no de un nombre enviado por el navegador o generado por el modelo.

`supabase/asistencia_solo_jefatura.sql`, después de `flujo_terreno_rbac.sql`,
refuerza las escrituras directas con políticas RLS restrictivas y valida el actor
real del lote nativo de WhatsApp, incluido un intento de borrar asistencia.
No cambia registros históricos. La migración no se aplica automáticamente al
publicar en Vercel. Prueba nativa: `tests/sql/asistencia_solo_jefatura.sql`;
usa fixtures reversibles. El bloqueo web de supervisores sin Developer sigue
vigente: gestionan asistencia por WhatsApp; administradores también desde la web.

El `SUPABASE_ACCESS_TOKEN` es un token personal de Management API para tareas
administrativas como migraciones, no una clave pública ni la clave de servidor
de la plataforma. Se genera en https://supabase.com/dashboard/account/tokens.
Elegir sin vencimiento evita su caducidad por fecha, pero no su revocación ni un
valor distinto en el entorno. Se valida con una petición de lectura a Management
API antes de aplicar migraciones. Un 401 no demuestra por sí solo expiración.

## Especialidades del equipo

Cada integrante puede tener una lista opcional de especialidades, independiente
de su rol y sus permisos. Equipo permite agregarlas al registrar, editarlas o
quitarlas y buscar personas por especialidad. ObraBot recibe la lista en su
contexto y utiliza `especialidades` en `registro_propuesto` o en
`actualizar_trabajador`; una edición envía la lista final y conserva las demás
especialidades salvo petición expresa. El alta nunca exige este campo.

Aplicar `supabase/especialidades_equipo.sql` después de `flujo_terreno_rbac.sql`
antes de publicar esta versión. La migración conserva los contactos y admite
clientes anteriores que todavía no envíen especialidades. Se valida con
`tests/sql/especialidades_equipo.sql`; sus fixtures se revierten.

### Corrección de guardado de obras por RLS

En bases existentes, ejecutar `supabase/corregir_guardado_obras_rls.sql` en el
SQL Editor de Supabase. La política anterior `obra_asignada_lectura` buscaba la
obra persistida incluso al comprobar la fila candidata de un `upsert`, lo que
rechazaba las altas con `42501`. La corrección autoriza la lectura de la fila
por empresa y rol de jefatura sin exigir su existencia previa; conserva las
demás políticas de acceso web, escritura y aislamiento. No requiere borrar
datos ni desactivar RLS. Después, pulsar «Reintentar sincronización» en el
dispositivo con cambios pendientes. Un despliegue en Vercel no aplica este SQL.
La regresión nativa `tests/sql/guardar_obras_rls.sql` comprueba alta y edición
propias y rechazo de lectura, alta y apropiación de obras ajenas; termina en
ROLLBACK.
