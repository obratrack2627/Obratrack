# Flujo de trabajo para constructoras pequeñas

## Activación de la base de datos

La aplicación actual usa Supabase. El README y parte del historial aún describen Firebase.

1. Respalda la base y revisa `supabase/migrations/20261020_flujo_constructor.sql`.
2. Ejecuta **solo esa migración** en el SQL Editor del proyecto Supabase de destino, con una cuenta administradora. Es aditiva y repetible. **No ejecutes `supabase/schema.sql`: contiene DROP TABLE.**
3. Inicia sesión con un usuario vinculado a su empresa mediante `usuarios.auth_user_id` o `usuarios.id` y Firebase no interviene en este flujo.
4. Verifica lectura y escritura desde dos cuentas de empresas diferentes antes de habilitarlo para usuarios reales.

La migración crea `cotizaciones_obra`, `gestion_obras`, funciones de guardado y conversión, y el bucket privado `documentos-obras`. No se ejecuta automáticamente durante el arranque, el build ni las pruebas. No se ha aplicado a la base alojada desde esta tarea.

Las nuevas pantallas leen del servidor y esperan la confirmación de cada guardado. No simulan persistencia mediante localStorage. Cada documento tiene una revisión: un segundo editor recibe un aviso para recargar si alguien guardó antes. Las fotografías y comprobantes se suben con la sesión del usuario, por carpeta de empresa, y se leen mediante enlaces firmados temporales.

## Uso

- **Clientes:** contacto, dirección, historial de obras, cotizaciones, pagos recibidos y saldo.
- **Cotizaciones:** crea el borrador durante el levantamiento, registra la fecha de visita, organiza los costos por partida y categoría, define fechas y condiciones de pago. Los montos son CLP sin decimales. El recargo es sobre el costo, no margen sobre la venta; el IVA es opcional.
- **Revisión:** Borrador, Enviada, Modificada, Aprobada o Rechazada. Tras aprobar, usa **Convertir en obra**. La transacción copia cliente, dirección, fechas, valor y partidas; varios clics no crean obras duplicadas. La cotización convertida y el contrato original quedan protegidos.
- **PDF:** abre Ver → Imprimir / Guardar PDF. Utiliza la impresión del navegador, sin servicio externo. El mensaje de WhatsApp abre un borrador; el usuario decide enviarlo y adjuntar el PDF.
- **Obra:** la etapa se elige según la realidad: Esperando anticipo, Planificación, En ejecución, Terminaciones o Pendiente de pago. No existen porcentajes de anticipo fijos.
- **Actividades:** cada actividad pertenece a una partida, tiene responsable, fechas, costo previsto, estado, observaciones y avance. El cronograma está disponible bajo demanda. El promedio simple de todas las actividades calcula el avance físico; se muestra también el avance de cada partida.
- **Gastos:** registra compras efectivamente pagadas, proveedor, categoría, partida, forma de pago y comprobante opcional. Un material presupuestado no es gasto hasta que se compra. Los materiales anteriores marcados comprados y los imprevistos anteriores aprobados se incorporan como costos históricos.
- **Equipo:** registra nombre y teléfono; RUT y correo son opcionales. Registrar personal no crea cuentas de acceso ni exige contraseñas. Las cuentas ya existentes conservan su acceso.
- **Jornadas:** selecciona trabajador, día, fracción de jornada, valor diario y actividad. El costo se calcula y se suma automáticamente. No vuelvas a registrar esas jornadas como gastos de mano de obra.
- **Estados de pago:** crea anticipos y cobros por cualquier monto y porcentaje de avance acordado. Pendiente → Solicitado → Pagado; Vencido se calcula por la fecha. Solo Pagado incrementa el dinero recibido. Un pago parcial puede registrarse dividiendo el cobro en estados separados.
- **Adicionales:** el monto se suma al contrato únicamente al aprobarse. Registra quién aprobó y cuándo. Su alcance y monto no pueden cambiar después de aprobarse; usa otro adicional para nuevos trabajos. Marcar Cobrado no crea un segundo ingreso: el dinero se registra en Estados de pago y sus costos en Gastos/Jornadas. Un borrador que no se realizará puede eliminarse antes de aprobar.
- **Bitácora:** fecha, sector, actividad, descripción, observaciones y varias fotos. Los registros se ordenan por fecha. Las fotos finales pueden añadirse aquí antes del cierre; el cierre permite adjuntar documentos finales.
- **Cierre:** requiere avance 100 %, saldo cero, estados pagados y adicionales resueltos/cobrados. Guarda fecha, observaciones, documentos y un resumen financiero calculado en el servidor. La obra permanece en el historial y deja de admitir cambios desde la ficha.

## Cálculos

- Valor actualizado = contrato original + adicionales aprobados/ejecutados/cobrados.
- Recibido = pagos históricos completados + estados de pago Pagados.
- Costo real = gastos + jornadas + materiales históricos comprados + imprevistos históricos aprobados.
- Caja = recibido − costo real.
- Utilidad final = valor actualizado − costo real (se cierra después de cobrar el saldo).
- Utilidad proyectada = valor actualizado − el mayor entre costos reales y el presupuesto de actividades. Actualiza ese presupuesto al aprobar nuevos alcances para mantener útil la proyección.
- Saldo pendiente nunca es negativo; los sobrepagos se muestran como saldo a favor del cliente.

Las cifras incluyen el IVA cuando forma parte del contrato; no sustituyen una contabilidad tributaria. La proyección usa el presupuesto total de actividades, no una extrapolación del porcentaje físico. El resumen del cierre queda conservado aunque posteriormente cambien datos históricos.

El dashboard alerta por obras y actividades atrasadas, estados de pago vencidos, cotizaciones enviadas sin respuesta por más de 7 días, materiales que superan el presupuesto original y desfase de al menos 20 puntos entre avance físico y porcentaje cobrado.

## Compatibilidad

Los enlaces anteriores de Finanzas y Gantt redirigen a las secciones de la ficha. Se conservan registros históricos de pagos, materiales, imprevistos, actividades y bitácora. La nueva ficha centraliza la captura para evitar registros paralelos. El asistente IA y los reportes WhatsApp anteriores siguen disponibles como apoyo y necesitan sus credenciales habituales; OCR y envío automático de mensajes no se agregaron.

## Validación local

```sh
npm ci --cache /workspace/.npm-cache
npm test
npx tsc --noEmit
npm run build
```

Las pruebas de negocio y SQL usan PostgreSQL embebido (PGlite), con cuentas ficticias. Comprueban conversión transaccional, idempotencia, revisiones, cierre, RLS y almacenamiento por empresa, sin conectarse a producción.

```sh
npx playwright install chromium
npm run test:e2e
# Si ya existe un Chromium del sistema:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Las pruebas del navegador interceptan las llamadas a Supabase y ejecutan las RPC contra la base de prueba; no usan credenciales ni modifican la base alojada. Se requiere validar la integración real después de aplicar la migración y disponer de una sesión auténtica. Next.js descarga fuentes de Google al compilar: permite `fonts.googleapis.com` y `fonts.gstatic.com`.
