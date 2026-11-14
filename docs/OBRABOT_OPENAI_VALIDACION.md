# Migración de ObraBot a OpenAI

Validación local realizada el 14 de noviembre de 2026 con la skill
`obrabot-agent-architect` proporcionada por el usuario.

## Cambios

- Motor único OpenAI. Las variables de proveedores anteriores no pueden activar
  Gemini ni un fallback; los imports históricos se conservan como aliases.
- Texto e imágenes usan Responses; las notas de voz usan transcripción de OpenAI
  y su texto se interpreta mediante el mismo motor de chat.
- Las intenciones de crear, convertir y actualizar no quedan atrapadas en esquemas
  exclusivos de cotización o búsqueda. Se conservan solicitudes combinadas.
- Acciones con subesquemas `anyOf` por `tipo`, en salida estricta; el servidor
  conserva las validaciones y los cálculos financieros autoritativos.
- Instrucciones separadas de contexto/historial/mensaje. Contexto sin columnas
  innecesarias, sin duplicar secciones y sin cortar JSON serializado.
- Conversión de una cotización a obra con total recalculado, partidas, materiales
  y datos conocidos. Una obra independiente conserva su propio monto.
- Un reintento de generación por errores corregibles del contrato/prevalidación,
  dentro del plazo original, antes de guardar o encolar. Los rechazos de permisos,
  plan y alcance no se reintentan.
- WhatsApp conserva el borrador `obra_propuesta`, sus validaciones, la identidad
  por teléfono, las asignaciones y sus confirmaciones existentes.
- Golden Set de 37 escenarios sintéticos basados en casos de construcción chilena;
  exportador local JSONL con validación previa y sin sobreescritura de archivos.

## Resultados

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | Código de salida 0 |
| `node --test tests/ai*.test.cjs tests/obrabot-regression.test.cjs` | 143 aprobadas, 0 fallidas |
| `npm test` | 478 aprobadas, 0 fallidas |
| `npm run build` | Código de salida 0; 21 páginas estáticas generadas |
| `node scripts/export-obrabot-sft.cjs /workspace/shared/obrabot-sft.jsonl` | 37 ejemplos exportados |
| `git diff --check` | Sin errores |

Las 143 pruebas están incluidas en las 478; no se suman. Las pruebas utilizan
proveedores y transportes simulados. No se enviaron mensajes reales de WhatsApp,
no se ejecutaron escrituras sobre datos de producción y no se inició entrenamiento.
El Golden Set comprueba contratos y regresiones; no acredita calidad del modelo
con llamadas reales. Un entrenamiento posterior necesita un conjunto de evaluación
independiente y un modelo compatible con SFT.

## Activación en producción

Este trabajo no realiza un despliegue ni cambia secretos de Vercel. Verificar
`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT` y
`OPENAI_TRANSCRIPTION_MODEL` en el entorno de destino, desplegar el código y validar
texto, visión y voz con una cuenta autorizada. No se requieren migraciones SQL
para estos cambios. Los valores de ejemplo no acreditan acceso de una cuenta a
un modelo concreto.
