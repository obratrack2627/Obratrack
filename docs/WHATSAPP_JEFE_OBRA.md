# WhatsApp personal del jefe → ObraTrack

El jefe conserva su aplicación y su número personal. Envía instrucciones al **número del asistente ObraTrack**, registrado en Meta WhatsApp Cloud API. Son dos números distintos. No se necesita vincular su WhatsApp personal por QR ni dejar su computador encendido.

## Estado y alcance

El código prepara cotizaciones y ejecuta las mismas acciones del asistente web: obras, clientes, cuadrillas, actividades, materiales, avances, pagos, imprevistos, agenda, bitácora, asistencia, cambios y documentos. Las cotizaciones se responden por WhatsApp y quedan en **Reportes WhatsApp → Mis mensajes de WhatsApp**, con acceso a la vista PDF. También aparecen en **Obras y proyectos → Presupuestos**, con estados borrador, enviada, aprobada, rechazada o anulada y asociación opcional a una obra.

Administradores y supervisores gestionan su empresa. Los perfiles de terreno ven solamente sus obras asignadas y pueden registrar avances, bitácora, su propia asistencia, solicitudes de cambio, reportes y documentos. Los números no registrados o duplicados no obtienen acceso. Este canal de gestión requiere una ficha de usuario. Las rutas y herramientas de simulación fueron retiradas de producción.

Se admiten texto, notas de voz y fotos JPG, PNG y WebP de hasta 10 MB. El archivo original se guarda en el bucket privado `whatsapp-evidencias`. Gemini describe la imagen sin inferir porcentajes ni montos. Si la obra es inequívoca, se registra la foto en la bitácora; si hay varias, queda pendiente y el usuario puede indicar el nombre en su siguiente mensaje. El servidor verifica sesión, empresa y permisos antes de emitir un enlace de lectura de cinco minutos. No se admiten archivos PDF entrantes ni se envía un PDF automáticamente: la cotización se envía como texto y el PDF se obtiene desde la plataforma.

El estado «Canal configurado» comprueba variables presentes; no acredita un envío real ni la vigencia del token. La activación requiere terminar Meta y hacer la prueba desde el teléfono. La conexión no está activa mientras falten las credenciales.

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

Las migraciones aditivas `supabase/produccion_copiloto.sql` y `supabase/whatsapp_jefe.sql`, en ese orden y en una transacción, habilitan presupuestos, evidencias privadas, bandeja y función de guardado. En este proyecto ya fue aplicada y se verificó con fixtures revertidos. Para otro proyecto, aplicar también los módulos previos de `supabase/migrations_v2.sql` necesarios. No ejecutar `schema.sql` sobre datos existentes.

## 5. Prueba desde el teléfono

Desde el WhatsApp personal del jefe, escribe al número de prueba de ObraTrack:

- «Cotiza un radier de 20 m² en Maipú, espesor 10 cm, materiales y mano de obra, margen del 20 %».
- «Crea una obra llamada Patio Maipú por $1.800.000, inicio 2 de noviembre de 2026, plazo 10 días, con partidas Base 3 días y Hormigonado 7 días».
- «Registra un abono de $300.000 por transferencia en Patio Maipú».
- «Actualiza Hormigonado al 50 % en Patio Maipú».

Comprueba la respuesta y los registros en la web. Reenviar una solicitud como un mensaje nuevo es una nueva instrucción; los reintentos automáticos del mismo ID de Meta reutilizan su resultado. Las respuestas están dentro de la ventana de atención iniciada por el usuario; no se implementaron campañas, recordatorios ni mensajes proactivos que requieran plantillas.

## Persistencia y límites

El motor prepara el lote entero en memoria aislada por solicitud. Una función SQL aplica cambios y guarda el mensaje en una sola transacción. Un fallo revierte el lote. El ID de Meta impide repetir pagos o creaciones si Meta reenvía el mismo evento. El RPC solo puede ejecutarlo `service_role`; la bandeja usa RLS y cada usuario lee su propia conversación.

El envío de WhatsApp ocurre después del commit. Si falla, el webhook devuelve 503 y Meta puede reintentar usando la respuesta guardada. Si Meta recibió una respuesta pero se perdió su confirmación de envío, podría recibirse un texto repetido; las acciones no se vuelven a ejecutar. El procesamiento es síncrono con duración limitada; para tráfico alto se necesita una cola durable y un worker. No se afirma que esa infraestructura ya exista.

Pruebas automatizadas: firma, número receptor, teléfonos ambiguos, aislamiento de solicitudes, permisos de terreno, lotes y reintentos. Prueba SQL real: proyecto y pago, idempotencia, rollback del lote, separación de empresas y RLS de conversaciones. Los registros de diagnóstico se revierten. La activación anterior consiguió generar una cotización real y Meta aceptó su envío. La entrega en el celular debe confirmarse por separado; el número de producción y un token estable de Meta siguen siendo requisitos comerciales pendientes.
