# Correcciones de la auditoría — 16 de noviembre de 2026

Base: auditoría sobre `357a2ff`. Esta entrega conserva las reglas de Chile, el acceso web admin/Dev y las asignaciones/roles de WhatsApp. No cambia el modelo de ObraBot ni realiza evaluaciones pagadas.

## Cambios y criterios de aceptación

| Hallazgo | Corrección | Verificación |
|---|---|---|
| F01 pagos | Confirmación de pago, vigencia, empresa y evento en una transacción; un fallo permite reintentar. El enrolamiento conserva el resultado remoto antes de activar. | SQL nativo: error tardío, rollback, recuperación y ausencia de doble extensión. |
| F02 guardado parcial | Sync prepara escrituras y las confirma mediante `sincronizar_lote_web`; ninguna escritura se confirma si falla otra. | Reasignación con fallo tras eliminar la lista anterior conserva toda la operación previa. |
| F03 concurrencia | Versiones en filas y asignaciones; claves de reintento estables; comparación de versiones en pantalla antes de reemplazar datos. | SQL rechaza copia antigua; navegador prueba conservar nube/local y respuesta perdida. |
| F04 más de 1.000 filas | Paginación ordenada, listas de IDs acotadas y rechazo de duplicados por cambios durante la carga. | 1.501 filas, error de una página y consulta de 200 proyectos. |
| F05 importes | Validación en API y BD, rechazo de negativos/no finitos e importes fuera de rango; subtotal recalculado. | Sondas de API y SQL directo con valores inválidos. |
| F06 dependencias | Next 15.5.29, bibliotecas de imágenes/CSS parcheadas; paquetes de proveedores inactivos eliminados. | Escaneo de producción sin avisos altos/críticos; quedan avisos moderados de ExcelJS/uuid para seguimiento. |
| F07 consumo | Reservas por empresa, plan y canal antes de generar/transcribir/indexar; límites de concurrencia, frecuencia y consumo compartidos. Registro público acotado sin descargar miles de perfiles. | SQL y mocks: exceso rechazado antes de la llamada, liquidación solo por servidor y aislamiento de peticiones. |
| F08 respaldos | Herramienta de exportación de negocio y archivos, cifrado AES-256/PBKDF2 e integridad HMAC; ensayo local de restauración del snapshot. | 30 tablas, 653 registros y 19 archivos; verificación de descifrado, integridad, conteos y hashes. Alcance limitado, ver pendientes. |
| F09 clave histórica | Eliminación de dependencias inactivas y documentación del incidente. | **No acredita revocación:** necesita comprobación del propietario en el proveedor antiguo. No se probó la clave. |
| F10 planes | Límite Gratis aplicado en persistencia y serializado por empresa. | Inserción directa de segunda obra activa rechazada; planes pagados conservan capacidad. |
| F11 archivos | Decodificación de imágenes, MIME/contenedor real, límites de píxeles/tamaño y carga por servidor. El navegador no puede omitir validación subiendo directamente. | Texto declarado imagen, PDF incompleto y Office falso rechazados; Storage conserva acceso privado. No incluye un antivirus documental. |
| F12 dispositivo compartido | Logout limpia cachés de todos los tenants y tokens locales; advierte antes de descartar pendientes; expira cookie en retorno a login. | Pruebas de sesión y almacenamiento; no se atribuye al borrado local la eliminación de datos en la nube. |
| F13 contraseñas | Nuevas contraseñas de al menos 12 caracteres en interfaz y validación; endurecimiento de Auth coordinado con el despliegue. | Validación de alta/cambio; MFA/CAPTCHA requieren configuración y pruebas específicas, no se habilitan sin prepararlas. |
| F14 scripts | CSP por nonce, sin inline/eval general en producción; excepción de eval solo para desarrollo. | Middleware, navegación y build; el auditor de accesibilidad inyecta su script con nonce válido. |
| F15 calidad | Lint no interactivo y CI para tipos/build/unitarias/navegador/SQL; prueba de Cuadrilla adaptada a su región accesible. | Checks reproducibles. Las reglas de protección de rama deben coincidir con los nombres de jobs y permisos del repositorio. |
| F16 accesibilidad | Tonos de texto/acciones con contraste, botón de contraseña nombrado y ampliado, gráficos complementados con datos accesibles. | Barridos claro/oscuro y móvil; no equivalen a certificación WCAG ni revisión completa con lector de pantalla. |
| F17 privacidad | Textos sin promesas de borrado automático o respaldo geográfico no acreditadas; canal y procedimiento de solicitudes. | Sigue pendiente revisión jurídica y operación del procedimiento por un responsable. |
| F18 documentación | README, motor de IA, URL, análisis y orden de migraciones alineados. | Instalación y base de pruebas reconstruidas desde archivos versionados. |

## Despliegue compatible

No ejecutar `schema.sql` en producción: reconstruye tablas. El script de pruebas SQL crea una base efímera en un contenedor y elimina únicamente esa base al terminar.

1. Crear y verificar un respaldo; conservar la clave fuera de Git y separada del archivo cifrado.
2. `SUPABASE_PROJECT_REF=<ref> python scripts/migrate-supabase.py` muestra el estado sin escribir.
3. Aplicar migraciones previas al despliegue con `--apply --phase before-deploy`. El script registra versión y checksum en `supabase_migrations.schema_migrations`. Cada migración es transaccional.
4. Publicar el código y comprobar los checks y los flujos esenciales.
5. Aplicar `--apply --phase after-deploy`: cierra las cargas directas de Storage y activa la comparación de versiones de WhatsApp cuando el servidor validado ya está publicado.
6. Verificar Auth y contraseñas con la misma política que la interfaz. No crear cobros, correos o mensajes reales como prueba sin un entorno/usuario de prueba autorizado.

Las restricciones financieras se añaden `NOT VALID` para no reescribir ni eliminar datos históricos; se comprobaron los datos existentes antes de aplicar. Nuevos registros y ediciones sí deben cumplirlas. Una validación histórica posterior se realiza solo después de resolver cualquier registro incompatible.

Rollback: volver al código previo requiere retirar primero las políticas restrictivas nuevas de carga si ese código todavía sube con el JWT del navegador. Conservar columnas, tablas y respaldos; no borrar datos para revertir la interfaz. Revisar versiones de Sync y pagos antes de revertir su servidor. El historial de migración impide reaplicar una versión con contenido distinto.

## Cuotas de ObraBot

`obrabot_usage_limits` se administra solo con permisos de servicio:

| Alcance | Llamadas diarias | Unidades diarias | Llamadas/minuto | Concurrencia |
|---|---:|---:|---:|---:|
| Pro | Sin tope | Sin tope | 8 | 2 |
| Pro IA | Sin tope | Sin tope | 12 | 2 |
| Cuenta completa | Sin tope | Sin tope | 40 | 10 |

Actualización solicitada por el usuario el 2026-11-17: `20261117_obrabot_unlimited_daily.sql` elimina los topes diarios por empresa y globales. Las columnas históricas `daily_requests` y `daily_units` se conservan por compatibilidad y no se usan para bloquear solicitudes. Se mantienen límites por minuto y concurrencia para ordenar las ráfagas.

Se registra una estimación antes de cada llamada y se concilia con tokens informados cuando están disponibles; las notas Opus usan duración medida. Las reservas no conciliadas conservan el consumo estimado y dejan de ocupar concurrencia al expirar. Las unidades son contabilidad operativa, **no un límite monetario exacto ni un tope diario**. Los créditos y restricciones del proveedor siguen siendo independientes.

Sin la migración o sin configuración de servicio, el asistente falla antes de consumir. No desactivar el control para ocultar un error. No se almacenan prompts, contactos, fotos ni audios en la tabla de uso. El mantenimiento periódico elimina registros de uso antiguos y claves de Sync vencidas, sin eliminar eventos financieros.

Enrolamiento Flow: si la creación remota pudo completarse pero no se logró guardar su identificador, el estado es ambiguo. Se solicita conciliación con soporte y **no se repite ciegamente una operación que pueda cobrar**. Cuando el identificador quedó guardado, la activación puede recuperarse sin crear otra suscripción. La conciliación remota debe probarse con sandbox y credenciales autorizadas; los mocks no acreditan cobros reales.

## Respaldo y recuperación

```bash
SUPABASE_PROJECT_REF=<ref> BACKUP_KEY_FILE=/ruta/privada/clave \
  python scripts/backup-supabase.py --output /ruta/privada/respaldo.enc
BACKUP_KEY_FILE=/ruta/privada/clave \
  python scripts/backup-supabase.py --verify --output /ruta/privada/respaldo.enc
```

La primera exportación genera una clave aleatoria imprimible si no existe. La clave, el cifrado y el manifiesto deben custodiarse por separado y fuera del repositorio. Verificar HMAC **antes** de descifrar. El manifiesto no contiene datos de clientes ni valores de credenciales.

El ensayo realizado restauró el esquema y los datos de negocio en una base local aislada y verificó los originales de Storage por hash. Se destruyó esa copia de prueba con datos originales; las pruebas funcionales usan fixtures sintéticos. La exportación **no incluye identidades Auth, sesiones ni secretos de configuración** y no sustituye el respaldo nativo completo del proveedor.

Pendientes operativos para recuperación integral:

- Respaldo nativo de Auth/base completa y copia externa independiente del proyecto; periodicidad y retención acordadas.
- Custodia durable de la clave, responsable de guardias y ensayo de recuperación en un entorno completo.
- Definir RPO/RTO como objetivos, medirlos y comprobar restauraciones periódicas. No prometer PITR ni réplica geográfica sin habilitación y evidencia.

No se contrató un plan de infraestructura ni se habilitó una función pagada para resolver este punto.

## Privacidad y credenciales

- El propietario debe confirmar la revocación de la clave histórica del proveedor anterior; borrar el código no revoca una clave ni elimina clones existentes. No imprimirla ni hacer llamadas para comprobar su vigencia.
- Soporte registra las solicitudes recibidas desde el correo de cuenta, verifica identidad/empresa, identifica obligaciones de retención y comunica el alcance/plazo aplicable antes de ejecutar una supresión. No borrar automáticamente datos tributarios o de otros usuarios.
- Cancelar un plan o cerrar sesión no supone suprimir la cuenta. Una supresión requiere revisar BD, Storage, índices de búsqueda, telemetría, copias y retenciones, con revisión jurídica.
- La configuración de CAPTCHA/MFA requiere claves, recuperación y pruebas de experiencia de usuario. No anunciar esas funciones como activas si no lo están.

## Validación

- Unitarias sobre la integración final: **530/530 aprobadas**, sin evaluaciones pagadas.
- SQL nativo: **16 archivos aprobados** en PostgreSQL 17/pgvector, reconstruyendo migraciones desde el repositorio; fixtures revertidos y base efímera eliminada.
- Navegador: **78/79 pruebas funcionales aprobadas en la ejecución completa**. El fallo de navegación móvil pasó al repetirse aisladamente; se conserva esa distinción, sin afirmar una ejecución completa limpia.
- Barridos adicionales: **57 visitas en claro y 19 en oscuro**, sin desbordamiento horizontal ni errores JavaScript capturados. El contraste pasó en las pantallas analizadas. Se ajustó después el foco de los gráficos circulares; esto no acredita una certificación de accesibilidad.
- Compilación de producción con Next 15.5.29 y `tsc --noEmit`: **aprobados**.
- Lint: **0 errores y 18 advertencias** heredadas de hooks/imágenes.
- Dependencias de producción: **0 avisos altos/críticos**, 2 moderados pendientes en la cadena ExcelJS/uuid.

No se enviaron mensajes WhatsApp, correos ni pagos reales durante las pruebas. La compilación, tipos y comprobación del despliegue se registran en los checks del commit.
