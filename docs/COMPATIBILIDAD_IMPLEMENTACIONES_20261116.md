# Compatibilidad de implementaciones — 16 noviembre 2026

Comparación estática: rama de auditoría en `b258b0b`, main en `ba1332c` (consultado de nuevo). Se revisaron los cinco commits posteriores a `0daad47`. Esta revisión no fusiona ni despliega esos cambios. Las 530 unitarias y 16 archivos SQL corresponden a la rama anterior; **no acreditan esta combinación todavía**.

## Bloqueos para integrar

| Prioridad | Cruce y evidencia | Resolución necesaria |
|---|---|---|
| Alta | `app/api/supabase/sync/route.ts`: conflicto entre el retorno de `transaction.commit` y `notifyPushOnSyncChanges`. En auditoría `sb` prepara escrituras, no las confirma. | Esperar el commit antes de lanzar push, usar el cliente real, conservar versiones/ID de reintento y evitar efectos externos al fallar o repetir un lote. Prueba: fallo tardío → cero notificaciones; reintento → un solo evento. |
| Alta | `lib/whatsapp/assistant.ts`: el hook nuevo notifica desde `plan.changed`/`plan.result`; auditoría puede guardar solo una respuesta de conflicto o un plan alternativo reducido. Se combina sin conflicto textual en esta zona. | Conservar el delta realmente confirmado. Un rechazo por revisión antigua o fallback no debe anunciar acciones del plan inicial. Preservar PDF, agrupación de mensajes y aislamiento de obra/rol. |
| Alta | `lib/ai/rag.ts`: conflicto textual entre la reescritura con consulta por empresa y la reserva/liquidación de embeddings. WhatsApp añade consultas e indexación de hasta cinco documentos. | Conservar ambas capacidades, sin retirar cuotas. Asegurar prioridad de la respuesta frente a indexación auxiliar y comprobar concurrencia/costo por turno, errores y aislamiento de empresa. |
| Alta | `next.config.mjs`: main externaliza `web-push` con opción experimental de Next 14; auditoría usa Next 15.5.29 y `serverExternalPackages`. CSP estático permisivo cruza CSP con nonce. | Externalizar ambos paquetes con la opción de Next 15. Unificar CSP preservando nonce, worker y cabeceras de `/sw.js`; verificar push en build de producción. No restaurar Next vulnerable para resolver el conflicto. |
| Media | `package.json` y múltiples bloques de lockfile chocan por `web-push`, sus tipos y limpieza/actualización de dependencias. | Añadir dependencias necesarias sobre las versiones parcheadas y regenerar lockfile mediante npm. No resolver el lockfile eligiendo completo uno de los lados. Repetir auditoría de dependencias. |
| Media | `components/Logo.tsx`: la marca oficial nueva cruza ajustes de contraste. | Conservar SVG/marca oficial y adaptar solo tonos accesibles por tema; no recuperar el logo anterior. |
| Media | `/sw.js` nuevo entra en el matcher de middleware y no está en las rutas públicas de la rama de auditoría. El registro solicita `/sw.js` con scope `/`. | Dar acceso público exclusivamente al script estático, mantener APIs push autenticadas; comprobar instalación, renovación y sesión expirada. El script no debe depender de una redirección al login. |

## Elementos compatibles por intención

Las mejoras de cotización, aprobación/PDF, búsqueda en varias tiendas, marca, recordatorios y notificaciones pueden conservarse junto con las correcciones de auditoría. Los cambios de parámetros asíncronos de las rutas existentes deben mantenerse al migrar a Next 15. La coincidencia de intención no prueba que una fusión automática sea correcta.

Las migraciones de RAG y push nuevas se deben incluir en la reconstrucción de pruebas y comprobar en el historial real antes de aplicar. La migración de cola WhatsApp ya forma parte del rollout de auditoría; evitar reaplicarla sin comprobar versión/checksum.

## Orden de cierre

1. Resolver los cruces anteriores en la rama, conservando las funcionalidades recientes.
2. Probar fallo/reintento de Sync con spies de push y conflicto/fallback de WhatsApp; ningún envío real.
3. Verificar cuotas de embeddings, plan/rol/empresa y SQL con las migraciones nuevas.
4. Build/tipos, dependencias y navegador, incluyendo PWA/push con mocks y marca nueva.
5. Publicar solo después de comprobar la combinación. Aplicar restricciones de Storage/CAS WhatsApp posteriores al despliegue y coordinar la política de Auth.

Las migraciones preparatorias de la auditoría ya aplicadas son aditivas. La tanda de código permanece en la PR #2 en borrador; la configuración posterior de Storage/CAS WhatsApp y Auth no se adelantó a su despliegue.
