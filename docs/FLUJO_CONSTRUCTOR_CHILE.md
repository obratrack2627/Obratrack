# Gestión de obra y correcciones de terreno

La Carta Gantt, las finanzas y ObraBot comparten las mismas reglas de servidor.

## Avance, término y recepción

- Una obra con al menos una partida y todas al 100% termina automáticamente. Una obra sin partidas no termina sola.
- Corregir un avance a menos del 100%, agregar una partida pendiente o eliminar todas las partidas reabre un cierre automático a **En curso**. No se restaura una pausa anterior. Las obras canceladas conservan su estado; un término manual no se revierte automáticamente.
- El avance global se pondera por los montos contratados cuando todas las partidas tienen un monto positivo. En caso contrario usa un promedio simple, indicado en el estado de pago. Nunca muestra 100% por redondeo si aún queda trabajo.
- Las correcciones de avance y los cambios de estado dejan una entrada de Bitácora.
- **Entrega y recepción**, dentro de Carta Gantt, permite registrar al mandante/representante, fecha, recepción conforme o con observaciones y fotografías. Requiere faenas completas y conserva un acta en Documentos.
- El registro de recepción lo realiza jefatura; no firma por el mandante. Reabrir faenas deja la recepción pendiente y conserva todas las actas anteriores.
- Terminar faenas o registrar recepción no confirma pagos ni elimina saldos.

## Calendario y adicionales

En la creación y edición de la obra configura días de trabajo y fechas no laborales (feriados aplicables, lluvia u otras suspensiones). No se presupone que todos los sábados o todos los feriados regionales sean iguales para todas las obras.

Los adicionales permanecen pendientes hasta su revisión. **Revisar resolución** permite autorizar por separado el cambio de contrato, la extensión del plazo en días laborables y el desplazamiento de partidas sin terminar. Al modificar contrato/plazo solicita la referencia de aprobación del mandante; se conserva en las notas de resolución. Resolver incidentes internos no aumenta el monto contratado. Los materiales y el costo residual se registran sin duplicarlos al reintentar.

La revisión de próximas faenas avisa de partidas atrasadas y propone desplazar las pendientes, respetando las fechas no laborales. Mantiene las terminadas y el inicio real de las que ya están en curso. Se exige revisar la propuesta y su motivo. La fecha de entrega solo se modifica si se autoriza expresamente. Una edición concurrente invalida la propuesta antigua. No supone dependencias de ingeniería que no estén registradas.

## Materiales y dinero

Cada material separa **compra registrada**, entregas parciales y **pago confirmado**. Las entregas se acumulan en Bitácora y no pueden superar lo pedido. No se permite reducir el pedido por debajo de lo recibido. Un material puede vincularse a una partida para advertir faltantes en las faenas próximas. Sin ese vínculo no se inventa su destino.

Los gastos distinguen mano de obra, gastos generales e imprevistos. El flujo registrado corresponde a cobros completados menos pagos explícitamente confirmados de materiales y gastos; no es un saldo bancario. Los registros históricos sin estado de pago se muestran como pendientes de confirmar, sin suponer que están pagados o adeudados.

## Asistencia, jornales y cierre del día

Solo administrador/supervisor confirma asistencia, también por WhatsApp. Terreno no puede marcar entrada/salida ni confirmar su propia presencia por mensajes o fotos.

**Jornales desde asistencia**, en Cuadrilla y Finanzas, permite escoger una asistencia presente/con atraso, revisar tarifa, día completo/medio día y horas extra con tarifa acordada. Las horas de asistencia orientan la propuesta; jefatura confirma el acuerdo. No calcula recargos legales ni descuenta atrasos automáticamente. Registra un costo por pagar, no un pago, y admite un solo jornal por asistencia. Si después cambia la asistencia, se señala la revisión del costo, conservando el registro original.

El **Cierre de jornada** compila datos guardados de asistencia, horas, avances, fotos, entregas, ingresos, costos, pendientes y próximas faenas. Jefatura confirma y puede descargar su PDF. Un cierre es una revisión histórica: corregir datos no reescribe cierres anteriores; puede emitirse otra revisión.

## ObraBot

Ejemplos para web o WhatsApp de jefatura:

- «Deja la partida de cubierta al 80%; faltan las hojalaterías». Informa el avance guardado y si reabrió la obra.
- «Recibimos 6 sacos de los 10 de cemento para el quincho, guía 123». Acumula solo la nueva entrega y no registra pago.
- «Registra el jornal de Pedro de hoy: 45 mil diario, medio día y una hora extra a 5 mil». Solicita identificar una asistencia confirmada si falta; recalcula el costo y lo deja por pagar.
- «Registra la recepción conforme del quincho: recibió Juan Pérez hoy». Exige faenas completas y registra el acta, sin dar cuentas por saldadas.
- «Revisa qué materiales faltan para las faenas próximas». Usa vínculos, cantidades y entregas reales.
- «Cierra la jornada de hoy en el quincho». Compila datos reales; se solicita separado de otras escrituras.

No se prometen guardados ni envíos sin confirmación. Los permisos por empresa y por obra asignada se mantienen.

## Instalación y verificación

Aplicar después de las migraciones de contactos, permisos de terreno, especialidades y asistencia:

1. `supabase/gestion_diaria_20261113.sql`
2. `supabase/logica_constructor_20261113.sql`

`tests/sql/logica_constructor.sql` verifica reglas y lotes del canal WhatsApp dentro de una transacción con `ROLLBACK`; no conserva personas, obras, mensajes ni pagos de prueba. No envía mensajes a Meta.

`GET /api/health` comprueba desde el despliegue la conexión a datos, autenticación y los dos buckets privados. Devuelve solo estados operativos, sin registros de clientes ni credenciales.

Las migraciones son aditivas y conservan datos existentes. Revertir únicamente la interfaz mediante Git no revierte las funciones ni los triggers ya aplicados en Supabase; cualquier reversión de reglas de datos debe prepararse expresamente, conservando actas, entregas y jornales registrados.
