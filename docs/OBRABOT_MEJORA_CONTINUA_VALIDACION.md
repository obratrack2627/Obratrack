# ObraBot: mejora continua, pasos 2 a 6

Validación del 14 de noviembre de 2026. Se aplicó la skill
`obrabot-agent-architect` aportada por el usuario. El código conserva la creación
por borrador en WhatsApp, las comprobaciones de teléfono/rol/obra y la distinción
Pro / Pro IA. No se enviaron WhatsApp ni se ejecutaron acciones de las evaluaciones.

## Evaluación real

La ejecución de salida usa el adaptador OpenAI real y los 37 casos del Golden Set
v2: **37/37 aprobados, 100% en modo, payload y entidades; cero 422 sin recuperar**.
No necesitó reintentos en esa ejecución. Una ejecución anterior terminó 36/37 por
un timeout; el formato de estimación inicial se hizo más compacto sin ampliar el
plazo. Este resultado corresponde al conjunto evaluado, no garantiza precisión
fuera de él ni disponibilidad futura del proveedor.

Los ajustes corrigieron la cotización + creación en un turno: el modelo puede
proponer monto null junto a una cotización completa y el servidor lo sustituye por
el total determinista antes de validar. Sin cotización válida se rechaza. Las
fases propuestas usan días enteros positivos.

Se corrigió también el evaluador: compara entidades resueltas por el servidor y
reconoce partidas inline solo si contienen nombre/días de las solicitadas. No
acepta omitirlas. Las expectativas de acciones se conservaron; se hicieron
explícitas las asignaciones del actor y se añadió una imagen sintética al caso
que pedía registrar una foto. No se evalúa una imagen ausente como si existiera.

El informe detallado de salida está disponible en el artefacto
`/workspace/shared/obrabot-live-eval-release.json`.

## Supabase y recuperación

Se aplicaron las migraciones aditivas:

1. `supabase/obrabot_quality.sql`.
2. `supabase/obrabot_rag.sql`.
3. `supabase/obrabot_chat_history.sql`.

Sus tres pruebas nativas en `tests/sql` pasaron con ROLLBACK. Comprueban separación
entre empresas, separación entre usuarios de la misma empresa en el historial,
bloqueo de inserciones ajenas, indexación solo aprobada, exclusión de contactos,
retiro de presupuestos rechazados, mensajes idempotentes y versiones de reinicio.
La prueba de historial también recupera los 150 mensajes de un legado paginado.

Se validó un embedding real de 1536 dimensiones. Se generaron y guardaron los
embeddings de **7 presupuestos aprobados**, sin modificar los presupuestos
originales y verificando el hash de su contenido antes de guardar. No se cargaron
rendimientos APU sin fuente revisada. Vercel tiene configurados
`OBRABOT_RAG_ENABLED=true` y `OPENAI_EMBEDDING_MODEL=text-embedding-3-small` para
producción.

La telemetría guarda códigos/categorías y recuperación, sin conversaciones ni
contactos. Los casos exportados de telemetría son plantillas sintéticas que
requieren revisión, no reconstrucciones de mensajes de clientes.

## Entrenamiento y sincronización

El pipeline SFT exige revisión, anonimización y consentimiento, valida los
contratos y separa entrenamiento/validación por hash. Excluye retail, presupuestos,
cálculos derivados y contexto financiero histórico. Se exportaron 16 ejemplos
sintéticos de selección/extracción de acciones a
`/workspace/shared/obrabot-sft-release.jsonl`. **No se subieron datasets ni se
inició ningún trabajo de fine-tuning.**

El historial general usa RLS por propietario, referencias canónicas a presupuestos,
importación por lotes, paginación y caché local con mensajes/versión atómicos.
Un reinicio en otro dispositivo no restaura mensajes antiguos; respuestas en vuelo
y cambios de cuenta se comprueban antes de escribir. La prueba de navegador pasó
en escritorio y móvil de 390 px con transporte simulado. Las comprobaciones RLS
se realizaron por separado contra PostgreSQL real.

## Verificación de salida

- `npx tsc --noEmit`: correcto.
- Suite obligatoria indicada por el usuario: **94 aprobadas, 0 fallidas**.
- Nuevas pruebas de runner, telemetría, RAG, SFT e historial: **29 aprobadas, 0 fallidas**.
- Suite completa tras integrar perfil/logo de empresa de `main`: **512 aprobadas, 0 fallidas**.
- Compilación Next.js: correcta.
- Prueba de navegador de continuidad y reinicio: **1 aprobada**.
- SonarJS local: sin incidencias de tipo problem en los archivos de aplicación.

La nueva funcionalidad de perfil y logos del commit `18ac54a` se conservó durante
la integración. La evaluación del modelo no depende de esa presentación de PDF.
