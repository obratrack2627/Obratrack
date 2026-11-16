# Guía de Situaciones y Conversaciones con ObraBot (Trabajador y Jefatura)

Esta guía reúne ejemplos reales de uso para aprovechar **ObraBot** tanto por **WhatsApp** (texto, notas de voz y fotos en terreno) como en el **Chat Web** (`/cotizador` y chat por obra).

---

## 1. Trabajador en Terreno (`rol: terreno`)

El trabajador en terreno puede reportar avances, subir fotos de incidentes/entregas, recibir y confirmar llegadas de material, y consultar sus obras asignadas. Por seguridad, no puede ver presupuestos/precios, marcar su propia asistencia ni modificar montos.

### Situación A: Reporte de avance enviado en varios mensajes seguidos (ráfaga)
*El trabajador escribe por partes desde la obra mientras camina:*

> **Trabajador (10:14):** `Hola`<br>
> **Trabajador (10:14):** `Obra Cobertizo La Cisterna`<br>
> **Trabajador (10:14):** `Dejamos el radier al 80% y se niveló todo el patio` *(o nota de voz de 10 s)*<br>
>
> **ObraBot:**<br>
> *Obra:* Cobertizo La Cisterna<br>
> *Avance actualizado:* Radier → 80%<br>
> *Bitácora guardada:* Avance en patio y radier registrado.

### Situación B: Incidente / falla detectada con foto (sin mencionar primero la obra)
> **Trabajador:** *[Envía foto de una filtración en muro sin texto]*<br>
>
> **ObraBot:**<br>
> Recibí tu foto. ¿A qué obra pertenece y qué ocurrió para registrarlo en la bitácora? Tus obras asignadas son:<br>
> 1. Baño Ñuñoa<br>
> 2. Cobertizo La Cisterna<br>
>
> **Trabajador:** `Es en Baño Ñuñoa, hay una filtración detrás de la llave de paso después de probar presión.`<br>
>
> **ObraBot:**<br>
> *Foto guardada*<br>
> *Obra:* Baño Ñuñoa<br>
> *Tipo:* Incidente<br>
> *Detalle:* Filtración detrás de llave de paso<br>
> La foto y el reporte quedaron en la bitácora.

### Situación C: Recepción parcial de materiales en faena
> **Trabajador:** `En Cobertizo La Cisterna llegaron hoy 15 sacos de cemento de los 25 comprados, falta el saldo.`<br>
>
> **ObraBot:**<br>
> Registré la entrega parcial en *Cobertizo La Cisterna*:<br>
> • Cemento: 15 sacos recibidos hoy (quedan 10 pendientes de entrega).

### Situación D: Intento de marcar asistencia propia (bloqueado por control)
> **Trabajador:** `Ya llegué a la obra Baño Ñuñoa`<br>
>
> **ObraBot:**<br>
> Recibido. La asistencia diaria solo puede registrarla o confirmarla tu supervisor o jefe de obra desde ObraTrack o por WhatsApp.

---

## 2. Jefe de Obra / Supervisor / Administrador (`admin` o `supervisor`)

La jefatura tiene acceso completo (según sus obras asignadas en `supervisor`, o toda la empresa en `admin`): puede cotizar, consultar precios reales en tiendas chilenas, aprobar presupuestos (recibiendo el PDF automático), enseñar rendimientos (APU), registrar gastos/pagos, pasar asistencia y emitir el cierre diario.

### Situación A: Cotizar por voz/texto, buscar precios reales en tiendas y aprobar con PDF por WhatsApp
> **Jefe (audio):** `Cotízame pintar los muros de una pieza de 5 por 2 metros en La Florida, el pintor cobra $4.000 el metro lineal, incluye materiales y mano de obra como presupuesto estimado.`<br>
>
> **ObraBot:**<br>
> *Cotización · Pintura de habitación — La Florida*<br>
> 📍 La Florida · 📐 30,8 m² · ⏱️ Plazo sugerido: 2 días<br>
> *RESUMEN FINANCIERO* (Materiales, Mano de obra, Gastos generales, Imprevistos, Utilidad, Neto, IVA 19% y *TOTAL*) + Carta Gantt sugerida + Menú `*1* Crear la obra · *2* Modificar · *3* Comparar materiales`.<br>
>
> **Jefe:** `Busca los precios reales de esos materiales en tiendas` *(o simplemente `Búscalos`)*<br>
>
> **ObraBot:**<br>
> Consulté en tiendas reales 3 materiales de la cotización:<br>
> *1. Pintura látex blanco* — links y precios publicados en Sodimac / Easy / Dimaco.<br>
> *2. Esmalte al agua* — links y precios publicados.<br>
> *3. Lija / cinta* — links y precios publicados.<br>
>
> **Jefe:** `1` *(o `Aprueba la cotización y crea la obra para Juan Pérez, 12.345.678-5, juan@correo.cl, +56988887777`)*<br>
>
> **ObraBot:**<br>
> Creé la obra *Pintura de habitación — La Florida* con su Carta Gantt y materiales cotizados.<br>
> *[Adjunta automáticamente el archivo **ObraTrack_Cotizacion_...pdf** oficial con logo, RUT y condiciones en WhatsApp]*

### Situación B: Enseñar rendimientos propios (APU / Sistema de aprendizaje RAG)
*Una sola instrucción guarda el rendimiento oficial en `obrabot_apu`, lo vectoriza en `obrabot_knowledge` y ObraBot lo reutiliza automáticamente al cotizar obras similares tanto en la Web como en WhatsApp:*

> **Jefe:** `Aprende este rendimiento: Pintura muros látex y esmalte, 25 m2 por persona al día`<br>
>
> **ObraBot:**<br>
> Rendimiento aprendido y guardado para futuras cotizaciones:<br>
> • Partida: Pintura muros látex y esmalte<br>
> • Rendimiento: 25 m2/persona al día<br>
> • Categoría: terminaciones<br>
>
> *(En una próxima cotización de 50 m² de pintura, ObraBot usará esa referencia de empresa para estimar ~2 días-persona en lugar de inventar rendimientos genéricos.)*

### Situación C: Comparar dos alternativas constructivas y elegir una
> **Jefe (Web o WhatsApp):** `Cotiza dos alternativas para revestimiento de fachada de 18 m2 en Providencia: Opción 1 Wall Panel y Opción 2 Deck WPC.`<br>
>
> **ObraBot:**<br>
> *Alternativas · Revestimiento fachada — Providencia*<br>
> *1 · Wall Panel* — desglose, Neto, IVA, *TOTAL*<br>
> *2 · Deck WPC* — desglose, Neto, IVA, *TOTAL* *(+$X vs opción 1)*<br>
> *Las opciones no se suman entre sí.*<br>
>
> **Jefe:** `2`<br>
>
> **ObraBot:**<br>
> Seleccionada alternativa *Deck WPC*. Si falta un dato del cliente te lo pediré para crear o actualizar la obra y enviarte el PDF.

### Situación D: Control diario de faena (asistencia, pagos, avisos y cierre de jornada)
> **Supervisor:** `En Baño Ñuñoa llegaron hoy todos presentes excepto Luis Rojas que tuvo permiso. Registra abono del cliente por $650.000 vía transferencia.`<br>
>
> **ObraBot:**<br>
> • Asistencia guardada en *Baño Ñuñoa* (presentes y Luis Rojas con permiso).<br>
> • Abono de $650.000 registrado por transferencia.<br>
>
> **Supervisor:** `Avisa al equipo de Baño Ñuñoa que mañana entramos a las 08:00 con EPP completo.`<br>
>
> **ObraBot:**<br>
> Aviso encolado para los trabajadores asignados a *Baño Ñuñoa*.<br>
>
> **Supervisor (al finalizar la tarde):** `Cierra la jornada de hoy en Baño Ñuñoa`<br>
>
> **ObraBot:**<br>
> *Cierre de jornada guardado* · *Obra:* Baño Ñuñoa<br>
> *[Adjunta el PDF oficial del Cierre de Jornada en WhatsApp]*
