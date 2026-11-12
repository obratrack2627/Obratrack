# WhatsApp personal del jefe → ObraTrack

El jefe conserva su aplicación y su número personal. Envía instrucciones al **número del asistente ObraTrack**, registrado en Meta WhatsApp Cloud API. Son dos números distintos. No se necesita vincular su WhatsApp personal por QR ni dejar su computador encendido.

## Estado y alcance

El código prepara cotizaciones y ejecuta las mismas acciones del asistente web: obras, clientes, cuadrillas, actividades, materiales, avances, pagos, imprevistos, agenda, bitácora, asistencia, cambios y documentos. Las cotizaciones se responden por WhatsApp y quedan en **Reportes WhatsApp → Registros**, con acceso a la vista PDF. También aparecen en **Obras y proyectos → Presupuestos**, con estados borrador, enviada, aprobada, rechazada o anulada y asociación opcional a una obra.

Administradores y supervisores gestionan su empresa por WhatsApp. La web y sus APIs admiten únicamente administradores y cuentas con privilegio Developer verificado; los supervisores sin Dev y terreno no pueden iniciar sesión en la plataforma web. Los perfiles de terreno ven solamente sus obras asignadas y pueden registrar avances, bitácora, solicitudes de cambio, reportes y documentos. La asistencia es exclusiva de administradores y supervisores: terreno no puede marcar ni corregir entrada, salida, presencia, ausencia o atraso, ni siquiera para sí mismo. Una declaración por texto, audio, foto o ubicación no acredita presencia física. Los números no registrados o duplicados no obtienen acceso. Este canal de gestión requiere una ficha de usuario. Las rutas y herramientas de simulación fueron retiradas de producción.

### Editar contactos

Administradores y supervisores pueden corregir nombre, correo de contacto, teléfono y RUT de cualquier integrante de su empresa, incluida su propia ficha y las cuentas con acceso a la web. También pueden editar nombre, teléfono, correo, RUT, dirección y comuna de los clientes. Ejemplos: «Cambia el teléfono de Jorge Pérez a +56912345678», «Actualiza mi correo de contacto a contacto@constructora.cl», «Corrige el nombre del cliente X a Y». Ante homónimos se solicita identificar la ficha; no se crea otra persona. Solo se modifican los campos indicados. El correo de contacto **no cambia el correo de Supabase Auth para iniciar sesión** ni requiere reactivar al usuario. La referencia de acceso para ingresar por RUT se obtiene de Auth, es de solo lectura y se mantiene al corregir el contacto.

Cambiar el teléfono de un integrante cambia también el número que lo identifica ante ObraBot. Si se modifica el propio teléfono, el mensaje actual recibe la confirmación y los mensajes siguientes deben enviarse desde el nuevo número. Los reintentos firmados de Meta recuperan esa misma confirmación sin repetir la escritura. El nuevo teléfono debe cumplir además las restricciones de destinatarios de Meta cuando se usa un número de prueba.

Aplicar `supabase/contactos_whatsapp.sql` después de las migraciones de permisos, WhatsApp y presupuestos. La edición se guarda junto con el mensaje en una sola transacción, verifica empresa y rol, preserva `auth_user_id`, `rol` e `is_dev`, rechaza contactos duplicados y detecta cambios concurrentes. La web usa el mismo validador de base de datos mediante un RPC autenticado. `tests/sql/contactos.sql` prueba las funciones nativas con fixtures que terminan en `ROLLBACK`; ejecutar con `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/contactos.sql` en un entorno de pruebas con las migraciones aplicadas. El canal conserva su catálogo de acciones; esta edición no habilita cambios de credenciales, administración global ni integraciones inexistentes.

Se admiten texto, notas de voz, fotos JPG/PNG/WebP y documentos PDF/Word (.docx)/Excel (.xlsx), hasta 10 MB por archivo. El archivo original se guarda en el bucket privado `whatsapp-evidencias`. El proveedor configurado recibe la imagen original junto con la pregunta en una sola llamada; no trabaja sobre una descripción intermedia. No infiere porcentajes ni montos solo desde la foto. La respuesta visual se conserva en la contestación aunque se guarde una bitácora. Si falla el análisis, se guarda la evidencia y se informa que el análisis quedó pendiente, sin inventar observaciones. Si la obra es inequívoca, se registra la foto en la bitácora; si hay varias, queda pendiente y el usuario puede indicar el nombre en su siguiente mensaje. El servidor verifica sesión, empresa y permisos antes de emitir un enlace de lectura de cinco minutos. Los PDF entrantes se guardan como documentos; el contenido de PDF/Word/Excel no se envía al modelo para interpretación. Las imágenes sí se analizan. No se envía un PDF de cotización automáticamente: la cotización se envía como texto y el PDF se obtiene desde la plataforma.

El indicador de configuración distingue las variables presentes de la conexión real con Meta. Ninguno acredita la entrega de un aviso: esa confirmación se consulta por destinatario en Avisos enviados.

## Presentación de las respuestas

Las consultas y confirmaciones son mensajes naturales, sin encabezado de marca, emojis decorativos ni categorías automáticas. Los títulos y el desglose se reservan para cotizaciones y comparaciones; los listados pueden usar viñetas y negritas nativas de WhatsApp. Las órdenes de estado se resuelven con la obra seleccionada o el antecedente inmediato inequívoco; si hay varias obras, se pide aclaración. Un cambio de estado no modifica el presupuesto. La confirmación se entrega solo tras el guardado transaccional. Las cotizaciones muestran desglose neto, IVA y total calculados por el servidor, todas las partidas, condiciones conocidas y Gantt sugerido. El menú ofrece **1** crear, **2** indicar modificaciones y **3** consultar qué material comparar. Los números solo se interpretan como opciones inmediatamente después de una cotización que muestre ese menú; crear requiere los datos obligatorios y los permisos habituales. Terreno no recibe la opción de crear. Los enlaces de las tiendas se conservan completos y las respuestas extensas continúan en mensajes numerados, bajo el límite de Meta. Los avisos al equipo mantienen sus estados reales de cola/entrega.

## 1. Crear la prueba en Meta

1. Entra en [Meta for Developers](https://developers.facebook.com/) con tu cuenta y crea una aplicación con el caso de uso de WhatsApp Business Platform (los nombres de las pantallas pueden variar).
2. En la sección WhatsApp / configuración de la API, utiliza el número de prueba que Meta asigne. No ingreses el teléfono personal del jefe como número del asistente.
3. Agrega el teléfono personal del jefe como destinatario de prueba y verifica el código que Meta envíe. Anota el **Phone number ID** del número de prueba y su número visible.
4. Envía primero el mensaje de prueba desde Meta al teléfono del jefe. El jefe podrá responder en ese chat desde su WhatsApp habitual.
5. Obtén el token de acceso y el **App Secret** desde la configuración de la aplicación. Guarda los secretos en las variables privadas del servidor; no los pegues en el chat ni en el repositorio.

Las restricciones, destinatarios disponibles y condiciones del número de prueba las determina Meta. Para operar con todos los usuarios, incorpora posteriormente un número de producción de ObraTrack siguiendo el alta comercial de Meta. El token temporal de pruebas caduca: para producción utiliza el mecanismo de token de usuario del sistema que corresponda a tu cuenta, con permisos `whatsapp_business_messaging` y los permisos de administración necesarios para el alta. Un token puede revocarse o perder permisos aunque no tenga vencimiento programado.

## 2. Configurar Vercel

En Settings → Environment Variables, para Production:

| Variable | Contenido |
| --- | --- |
| `WHATSAPP_CLOUD_API_ACCESS_TOKEN` | Token privado de Meta |
| `WHATSAPP_CLOUD_API_PHONE_NUMBER_ID` | ID del número del asistente; no es un teléfono |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ID de la cuenta empresarial de WhatsApp, para las plantillas |
| `WHATSAPP_DISPATCH_SECRET` | Clave aleatoria del procesador de avisos, compartida únicamente con Supabase Vault |
| `WHATSAPP_APP_SECRET` | Secreto privado de la aplicación de Meta |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Un valor aleatorio privado que eliges para verificar el webhook |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Número visible del asistente, con código de país, para el botón de abrir chat |
| `WHATSAPP_GRAPH_API_VERSION` | Opcional; versión soportada por tu aplicación, predeterminada `v23.0` |
| `AI_PROVIDER` | Motor privado seleccionado para ObraBot |
| `OPENAI_API_KEY` | Clave privada cuando se selecciona OpenAI |
| `GEMINI_API_KEY` | Clave privada para el motor anterior y su respaldo |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública del mismo proyecto, para la plataforma |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privada de servidor de Supabase; no es el token personal `sbp_…` |

Los secretos de Codex y Vercel son independientes. Guarda las variables y haz un Redeploy. No se requiere volver a configurar una clave para cada mensaje. La selección, el respaldo y la reversión se explican en `CHATBOT_IA.md`.

Si Meta reemplaza el número de prueba, actualiza juntos el Phone Number ID, la cuenta de WhatsApp Business y el teléfono visible; renovar solo el token no cambia esos datos. Confirma también la suscripción de la nueva cuenta a la misma aplicación. El diagnóstico privado identifica números desactualizados y cuentas sin suscripción; la interfaz muestra el problema y evita abrir el teléfono anterior como si estuviera conectado.

Si falta la suscripción, administración puede pulsar **Activar recepción de mensajes** en Reportes WhatsApp. La ruta autenticada `POST /api/whatsapp/estado` valida que el token sea de la aplicación configurada, que el número pertenezca a la cuenta y que existan ambos permisos de WhatsApp antes de suscribirla. No acepta identificadores ni secretos desde el navegador, no envía mensajes y comprueba la suscripción después de activarla. Repetirla no vuelve a modificar una suscripción ya activa.

## 3. Verificar el webhook

En WhatsApp → Configuration de Meta:

- Callback URL: `https://obratrack-5zwn.vercel.app/api/webhook/whatsapp` (o tu dominio definitivo).
- Verify token: exactamente el valor privado de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
- Suscríbete al campo `messages` de la cuenta de WhatsApp correspondiente.

El servidor valida la firma `X-Hub-Signature-256` con el App Secret y acepta solo eventos cuyo `phone_number_id` coincida con el configurado. Configurar el verify token no sustituye esta validación.

## 4. Vincular al jefe y habilitar la base de datos

En **Equipo de Obra**, registra el teléfono personal del jefe, con código de país, en su ficha de administrador o supervisor. Ejemplo chileno de formato: `+569XXXXXXXX`. Un mismo teléfono no puede identificar de forma ambigua a dos usuarios. La empresa necesita el plan Pro IA.

Las migraciones aditivas `supabase/produccion_copiloto.sql` y `supabase/whatsapp_jefe.sql`, en ese orden y en una transacción, habilitan presupuestos, evidencias privadas, bandeja y función de guardado. En este proyecto ya fue aplicada y se verificó con fixtures revertidos. Para otro proyecto, aplicar también los módulos previos de `supabase/migrations_v2.sql` necesarios. Para los avisos, aplicar después `supabase/whatsapp_avisos.sql`. Habilitar pg_net y pg_cron, guardar la misma clave privada de `WHATSAPP_DISPATCH_SECRET` en Vault con el nombre `obratrack_whatsapp_dispatch` y aplicar `supabase/whatsapp_dispatch.sql`, ajustando su dominio para otras instalaciones. El disparador despierta la cola al registrar avisos y pg_cron la revisa cada minuto. Los callbacks llevan una firma HMAC de cinco minutos; la clave nunca se pone en la cola HTTP. No ejecutar `schema.sql` sobre datos existentes.

## 5. Prueba desde el teléfono

Desde el WhatsApp personal del jefe, escribe al número de prueba de ObraTrack:

- «Cotiza un radier de 20 m² en Maipú, espesor 10 cm, materiales y mano de obra, margen del 20 %».
- «Crea una obra llamada Patio Maipú para el cliente Ana Pérez por $1.800.000, correo ana@ejemplo.cl, teléfono +569XXXXXXXX».
- «Envía a los trabajadores de terreno de Patio Maipú: mañana comenzamos a las 08:00, lleven sus EPP».
- «Registra un abono de $300.000 por transferencia en Patio Maipú».
- «Actualiza Hormigonado al 50 % en Patio Maipú».

Comprueba la respuesta y los registros en la web. Reenviar una solicitud como un mensaje nuevo es una nueva instrucción; los reintentos automáticos del mismo ID de Meta reutilizan su resultado. Para crear una obra son obligatorios el cliente, el nombre de la obra, el presupuesto positivo en CLP, el correo y el teléfono del cliente. Si falta alguno, el bot conserva un borrador en la conversación y pide solo lo pendiente. No crea la obra hasta completar los cinco campos. Ubicación, fechas, descripción y partidas son opcionales.

Los avisos requieren una instrucción expresa de envío por un administrador o supervisor. Se seleccionan usuarios registrados de la empresa por rol o nombre, con filtro opcional de cuadrilla. Se envían mensajes individuales, no a un grupo de WhatsApp. «Redacta» prepara texto y no envía. Los avisos se solicitan por separado de otras acciones para evitar envíos si falla un cambio de obra.

## Persistencia y límites

El motor prepara el lote entero en memoria aislada por solicitud. Una función SQL aplica cambios y guarda el mensaje en una sola transacción. Un fallo revierte el lote. El ID de Meta impide repetir pagos o creaciones si Meta reenvía el mismo evento. El RPC solo puede ejecutarlo `service_role`; la bandeja usa RLS: administración y supervisión leen los registros de su empresa; terreno solo su propia conversación. Reportes permite filtrar por autor, obra, tipo y texto, con detalles de las acciones, fotos privadas y cotizaciones. El nombre de una obra abre su Carta Gantt.

El envío de WhatsApp ocurre después del commit. Si falla, el webhook devuelve 503 y Meta puede reintentar usando la respuesta guardada. Si Meta recibió una respuesta pero se perdió su confirmación de envío, podría recibirse un texto repetido; las acciones no se vuelven a ejecutar. El procesamiento de instrucciones entrantes sigue siendo síncrono y limitado por tiempo. Los avisos al equipo tienen una cola durable separada; no dependen de que permanezca abierta la plataforma.

## Avisos y entrega

`Reportes WhatsApp → Avisos enviados` muestra destinatarios y estados pendiente, sin teléfono, esperando plantilla, aceptado, enviado, entregado, leído, fallido o por verificar. Aceptado indica que Meta devolvió un ID; no confirma entrega. El webhook firmado actualiza los estados posteriores. Los fallos conocidos pueden reintentarse desde la plataforma; los envíos inciertos no se repiten automáticamente. Se vuelve a comprobar el teléfono nativo antes de enviar.

Dentro de la ventana de atención se envía texto. Fuera de ella se utiliza la plantilla operativa `obratrack_aviso_equipo` en español, que debe aprobar Meta. El administrador puede registrar o consultar esta plantilla mediante `/api/whatsapp/plantilla` con sesión auténtica. Mientras esté pendiente, los destinatarios sin ventana abierta quedan esperando. Un número de prueba solo envía a los teléfonos verificados en Meta. La aprobación de la plantilla no elimina esa restricción.

Pruebas automatizadas: firma, número receptor, teléfonos ambiguos, aislamiento de solicitudes, permisos de terreno, lotes y reintentos. Prueba SQL real: proyecto y pago, idempotencia, rollback del lote, separación de empresas y RLS de conversaciones. Los registros de diagnóstico se revierten. La activación anterior consiguió generar una cotización real y Meta aceptó su envío. La entrega en el celular debe confirmarse por separado; el número de producción y un token estable de Meta siguen siendo requisitos comerciales pendientes.

Administración y supervisión pueden consultar `GET /api/whatsapp/estado` con su JWT para verificar el acceso real a Meta. El diagnóstico distingue credencial inválida o vencida, permisos pendientes y fallo de conexión, sin exponer tokens ni cuerpos del proveedor.


El diagnóstico privado también consulta `whatsapp_business_messaging`: poder leer el ID del número o gestionar plantillas no acredita permiso para enviar. Si Meta rechaza un envío con `131005`, el registro queda fallido y señala revisar el permiso de mensajería y la asignación del token a la cuenta y número correctos. El administrador debe corregir esa configuración antes de reintentar. En Reportes se distingue un permiso pendiente de un canal simplemente configurado.


El copiloto también puede consultar los catálogos públicos integrados de Easy y Dimaco. Envía precios publicados con enlaces y fecha; no garantiza el menor precio de todo el mercado, despacho ni stock local. El borrador de una obra se conserva cuando se consulta otra cosa o se envía un aviso, y se puede completar o cancelar después. Requiere `supabase/copiloto_materiales.sql`.

## Confirmar un presupuesto

La cotización presenta materiales, mano de obra, Gantt sugerido y total y pregunta si se desea crear la obra. Responder «sí» toma ese presupuesto guardado, sin volver a cotizar. Se conservan las partidas y materiales mientras se solicitan cliente, nombre de obra, presupuesto, correo y teléfono que falten. La confirmación final vincula el mismo presupuesto con la obra en la transacción de WhatsApp. Si ya estaba asociado, se informa sin crear otro proyecto. La lógica se prueba sin enviar mensajes reales; la operación del canal requiere una conexión y permisos vigentes en Meta.

## Altas completas y contexto de terreno

El registro de un cliente exige nombre o razón social, RUT válido, correo y teléfono. Un trabajador exige nombre completo, RUT, correo, teléfono y rol; terreno también requiere una obra asignada. El borrador se conserva por actor y empresa entre mensajes y consultas. Se pueden enviar los datos juntos o por partes, y cancelar el registro. No se crea ninguna ficha de un lote mientras falten datos de sus integrantes. La creación de una obra que necesita dar de alta a un cliente nuevo también pide su RUT; una ficha de cliente existente se conserva.

Un trabajador no obtiene credenciales web. Su teléfono lo vincula al canal, y sus asignaciones determinan los datos que puede consultar y dónde registra evidencias. Con una sola obra se usa esa obra; con varias, se solicita cuál y se conserva el contexto. El historial de otras asignaciones y de roles anteriores no se entrega al modelo. Una foto no se pierde si el modelo propone una acción que su perfil no puede ejecutar: se guarda únicamente la evidencia autorizada y se informa que la otra acción quedó pendiente. Una boleta se incorpora como respaldo documental sin inventar un gasto o pago.

Si una evidencia quedó pendiente y pasó la conversación, el administrador puede responder al mensaje original o escribir «Asocia la foto pendiente a [nombre de obra]». Se valida la obra y se reutiliza el archivo conservado. La migración repara solo fotos que ya tenían una asociación explícita y archivo existente; no deduce la obra de fotos antiguas.

`supabase/flujo_terreno_rbac.sql` refuerza web/RLS/RPC, protege Developer, incorpora el alta validada del equipo y habilita documentos en el bucket privado. Aplicar después de `contactos_whatsapp.sql`. Las cuentas, proyectos y archivos se conservan. `tests/sql/terreno_rbac.sql` prueba esos controles en PostgreSQL con rollback.

## ObraBot flotante y planes de desarrollo

El botón ObraBot abre un panel de conversación sin cambiar de módulo. Usa la obra de la pantalla actual o una selección explícita, mantiene conversaciones separadas por obra y permite abrir el chat completo. Las acciones, cotizaciones y guardados pasan por los mismos servicios y permisos del copiloto.

Solo `is_dev=true` confirmado en servidor muestra «Plan de desarrollo», accesible desde el menú lateral o el indicador de plan móvil. El cambio se confirma por RPC antes de actualizar la interfaz; un administrador normal no puede concederse ese permiso ni modificar el plan con el navegador. No interviene la pasarela de pago.

### Retomar cotizaciones y completar datos

«Usa esa cotización para crear una obra» recupera el presupuesto guardado de la
misma empresa aunque el último mensaje sea una cancelación o una pregunta por
contactos. Responder a un mensaje de cotización identifica esa fuente. Las
alternativas ambiguas se siguen eligiendo explícitamente. «Sí» después de
cancelar no autoriza por sí solo a revivir una creación.

Una creación pendiente admite datos en líneas separadas, en el orden pedido:
RUT, cliente, obra, presupuesto CLP, correo y teléfono. Reconoce montos con puntos
de miles y teléfonos locales de ocho o nueve dígitos. Los datos se validan y se
acumulan sin depender de la extracción del modelo. Un número ambiguo no se usa
simultáneamente como RUT, presupuesto y teléfono. Se conservan materiales, Gantt
sugerido y referencia al presupuesto de origen.

Los borradores anteriores recuperan campos omitidos desde los mensajes del mismo
trámite, tomando el literal más reciente y conservando correcciones ya guardadas.
Cancelar u otra creación cortan la búsqueda; no se recorren otras personas ni
empresas. «Continúa» retoma el trámite y solo pide lo que siga faltando. Las
confirmaciones de creación siguen dependiendo del guardado atómico nativo y del
identificador de mensaje, para impedir duplicados en reintentos de Meta.
