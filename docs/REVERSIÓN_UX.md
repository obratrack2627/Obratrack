# Cambios de interfaz del 9 de noviembre de 2026

La versión anterior está respaldada en GitHub con la etiqueta
`backup/antes-mejoras-ux-2026-11-09` (commit `ece26b8`).

Los cambios se separan en dos commits:

- `3e47a9d`: correcciones de actualización de datos, fechas, indicadores y confirmación del guardado de obras.
- Etiqueta `ux/interfaz-simplificada-2026-11-09`: presentación más simple, menús de acciones, navegación móvil, resúmenes plegables, finanzas por secciones y asistencia de cuadrilla con horario editable.

No se modificaron tablas ni registros de producción al aplicar esta actualización.
Los presupuestos, archivos, clientes, trabajadores y obras siguen utilizando los mismos servicios.

## Volver a la interfaz anterior

Desde una copia actualizada de `main`, crear un commit de reversión:

```bash
git revert ux/interfaz-simplificada-2026-11-09
git push origin main
```

Vercel desplegará esa reversión. Las correcciones del commit `3e47a9d`
se conservan. Los datos creados por los usuarios no se borran.

Para regresar también al comportamiento funcional anterior, revertir después
`3e47a9d`. No es necesario restablecer la base de datos ni forzar el historial de Git.

Si hay cambios posteriores en los mismos archivos, revisar y resolver sus posibles
conflictos antes de publicar la reversión.

## Reportes, presupuestos y uso móvil

La actualización de reportes y presupuestos conserva el respaldo
`backup/antes-ajustes-movil-2026-11-09`. El cambio publicado se identifica con
`ux/reportes-presupuestos-movil-2026-11-09`.

Para revertir esta actualización manteniendo los datos y las correcciones anteriores:

```bash
git revert ux/reportes-presupuestos-movil-2026-11-09
git push origin main
```

Incluye la estructura de reportes y presupuestos, indicadores visibles en celular,
ajuste de importes, filtro inicial En curso y configuración de las barras del teléfono.
No cambia el esquema de la base de datos ni modifica registros existentes.

## Carta Gantt y tarjetas de faena

Este rediseño se limita a la planificación de la obra. El respaldo anterior es
`backup/antes-redisenio-gantt-2026-11-10` (commit `e3e188c`) y la nueva presentación
se identifica con `ux/carta-gantt-2026-11-10`.

- Escritorio: calendario común con meses, escalas de días/semanas/meses,
  navegación por periodos, línea de hoy y barras según las fechas reales.
- Celular y tablet: tarjetas de faena como vista inicial, con responsables,
  avance, edición y actualización rápida. La Gantt sigue disponible mediante
  desplazamiento dentro del calendario, manteniendo los nombres de las partidas visibles.
- Los filtros mantienen el mismo periodo para comparar partidas. Las fechas son
  inclusivas y el avance de las barras conserva su posición cuando cruza un periodo.
- Los formularios mantienen los servicios existentes y validan el orden de las
  fechas. No se incorporan dependencias ficticias entre partidas.

Para revertir únicamente esta actualización:

```bash
git revert ux/carta-gantt-2026-11-10
git push origin main
```

No requiere migraciones ni modifica registros al desplegarse. La reversión conserva
las partidas, avances y evidencias registrados durante el uso de la plataforma.
El estilo de los demás módulos permanece disponible para una revisión posterior.
