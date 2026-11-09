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
