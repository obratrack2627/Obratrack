# WhatsApp personal del jefe → ObraTrack

El jefe conserva su aplicación y su número personal. Envía instrucciones al **número del asistente ObraTrack**, registrado en Meta WhatsApp Cloud API. Son dos números distintos. No se necesita vincular su WhatsApp personal por QR ni dejar su computador encendido.

## Estado y alcance

El código prepara cotizaciones y ejecuta las mismas acciones del asistente web: obras, clientes, cuadrillas, actividades, materiales, avances, pagos, imprevistos, agenda, bitácora, asistencia, cambios y documentos. Las cotizaciones se responden por WhatsApp y quedan en **Reportes WhatsApp → Registros**, con acceso a la vista PDF. También aparecen en **Obras y proyectos → Presupuestos**, con estados borrador, enviada, aprobada, rechazada o anulada y asociación opcional a una obra.

Administradores y supervisores gestionan su empresa. Los perfiles de terreno ven solamente sus obras asignadas y pueden registrar avances, bitácora, su propia asistencia, solicitudes de cambio, reportes y documentos. Los números no registrados o duplicados no obtienen acceso. Este canal de gestión requiere una ficha de usuario. Las rutas y herramientas de simulación fueron retiradas de producción.

Se admiten texto, notas de voz y fotos JPG, PNG y WebP de hasta 10 MB. El archivo original se guarda en el bucket privado `whatsapp-evidencias`. Gemini recibe la imagen original junto con la pregunta en una sola llamada; no trabaja sobre una descripción intermedia. No infiere porcentajes ni montos solo desde la foto. La respuesta visual se conserva en la contestación aunque se guarde una bitácora. Si falla el análisis, se guarda la evidencia y se informa que el análisis quedó pendiente, sin inventar observaciones. Si la obra es inequívoca, se registra la foto en la bitácora; si hay varias, queda pendiente y el usuario puede indicar el nombre en su siguiente mensaje. El servidor verifica sesión, empresa y permisos antes de emitir un enlace de lectura de cinco minutos. No se admiten archivos PDF entrantes ni se envía un PDF automáticamente: la cotización se envía como texto y el PDF se obtiene desde la plataforma.

El indicador de configuración distingue las variables presentes de la conexión real con Meta. Ninguno acredita la entrega de un aviso: esa confirmación se consulta por destinatario en Avisos enviados.

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
| `GEMINI_API_KEY` | Clave de Gemini del servidor |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública del mismo proyecto, para la plataforma |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privada de servidor de Supabase; no es el token personal `sbp_…` |

Los secretos de Codex y Vercel son independientes. Guarda las variables y haz un Redeploy. No se requiere volver a pegar la clave de Gemini para cada mensaje.

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
