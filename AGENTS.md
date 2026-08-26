# Reglas y Memoria del Agente (ObraTrack)

## Directivas del Proyecto
1. **Identidad del Desarrollador**:
   - Autor y Dueño: Benjamín Achávar (`benja105.achavar@gmail.com`)
   - Repositorio oficial: `https://github.com/xBenja105/ObraTrack`
   - Todos los commits de Git deben conservar la autoría de `Benjamín Achávar <benja105.achavar@gmail.com>`.

2. **Base de Datos & Backend**:
   - Backend oficial: Google Firebase (`obratrack-24ff6`).
   - Base de datos en la nube: Cloud Firestore (Native Mode) con reglas de seguridad en `firestore.rules`.
   - Autenticación: Firebase Auth con persistencia de sesiones.
   - Almacenamiento multimedia: Firebase Storage (`obratrack-24ff6.firebasestorage.app`).

3. **Convenciones de Interfaz & Negocio (Chile)**:
   - Moneda: Pesos Chilenos (CLP) sin decimales.
   - Los campos de entrada de montos deben aplicar formato automático con separador de miles (`8.000`, `15.000.000`) en tiempo real usando `formatThousands` y `parseThousands` de `lib/utils.ts`.
   - Colores oficiales: Azul Blueprint (`#1E1E1E`), Naranjo Obra (`#FF6A00`), Verde Terreno (`#6B8F72`) y Papel Kraft (`#FAF8F5`).

4. **Documentación Completa**:
   - Consultar `PROJECT_HISTORY.md` para ver el detalle de todos los módulos, planes de suscripción y decisiones previas.
