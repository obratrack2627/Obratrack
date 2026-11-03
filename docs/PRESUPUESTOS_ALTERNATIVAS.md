# Presupuestos y alternativas por obra

Una obra admite un presupuesto principal y alcances complementarios. Cada alcance puede tener varias propuestas completas: solo una se elige para ejecución. Las alternativas no se suman entre sí. Los alcances complementarios elegidos sí se suman al principal.

## Uso

En **Obras y Proyectos → Presupuestos**, «Crear alternativa» copia una propuesta guardada y abre su edición. La copia conserva el alcance para modificar material, precio, condiciones o plazo sin perder el original. Se muestran el importe de cada opción, su diferencia respecto de la elegida y sus estados.

«Precio acordado» permite registrar directamente partidas de venta sin estimar costos ficticios. Requiere confirmar si los precios son netos o incluyen IVA. El servidor calcula los importes; no vuelve a agregar utilidad a los precios de venta. Materiales y mano de obra pueden detallarse para la ejecución, pero no alteran esos precios acordados.

«Elegir y aplicar» muestra la obra y las opciones de importación. Si aún no existe una obra, se crea una y todas las alternativas quedan vinculadas a ella. Si existe, cambia el importe del alcance, conservando los demás alcances y los pagos registrados.

Los materiales y actividades importados por el mismo alcance se pueden sustituir si siguen intactos. Compras realizadas, avances, incidentes relacionados o ajustes manuales impiden su sustitución. Desmarcar una importación conserva sus registros existentes. Las filas manuales ajenas al alcance se conservan siempre.

El presupuesto aplicado queda protegido frente a ediciones: para cambiarlo se crea y revisa una alternativa. Las otras propuestas se pueden editar y sus versiones anteriores se consultan en «Historial». Las revisiones se abren como PDF de solo lectura.

En ObraBot se pueden pedir de dos a cuatro alternativas en una misma solicitud. WhatsApp muestra cada opción con su número e importe. Un «sí» ambiguo pide precisar la opción; los números eligen solo tras mostrar el menú de alternativas. Si hace falta crear una obra, el canal sigue pidiendo los cinco datos obligatorios del cliente y obra.

## Documentos y cobros

Cada alternativa tiene su propio PDF y admite un nombre de archivo opcional y ocultar la fecha de emisión. Los hitos porcentuales deben sumar 100%; sus importes se recalculan al editar para sumar exactamente el total en CLP. Son condiciones de cobro, no pagos recibidos ni facturas tributarias.

## Persistencia y despliegue

Aplicar `supabase/presupuestos_alternativas.sql` después de las migraciones de presupuestos, conversión y lotes de WhatsApp existentes. Es aditiva y se puede volver a aplicar. Agrega grupos, metadatos de alternativas, revisiones y funciones transaccionales; los presupuestos anteriores continúan disponibles sin agruparlos automáticamente.

- RLS limita grupos y revisiones a administración y supervisión de su empresa.
- Los wrappers autenticados obtienen empresa y actor de la sesión; no aceptan un tenant del navegador.
- El importe aplicado proviene del presupuesto guardado. Las versiones impiden sobrescribir cambios de otro dispositivo.
- La selección y las importaciones se guardan en una transacción. WhatsApp incluye el mensaje en esa transacción y reutiliza su resultado por `message_id`, sin reproducir una selección antigua durante un reintento.
- Los conversores previos quedan como funciones privadas; sus permisos públicos se revocan.

Validación: `npm test`, `npx tsc --noEmit`, `npm run test:e2e`, `npm run build`. Las pruebas incluyen precios acordados, IVA, hitos, PDF, elección inequívoca en WhatsApp y comparación/aplicación móvil. La validación de PostgreSQL debe comprobar además selección repetida, sustitución de imports intactos, protección de compras, suma de complementos y aislamiento de perfiles/empresas, usando registros temporales y rollback.

El Gantt mantiene el calendario actual de la plataforma. El plan de cobro no registra ingresos automáticamente.
