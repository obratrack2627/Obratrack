export interface ConversationTurn { rol: 'user' | 'model'; texto: string }
const normal = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const facts = /\b(obras?|proyectos?|radier|terraza|marca|modelo|prefiero|usar|medidas?|ancho|largo|alto|altura|espesor|cliente|correo|telefono|direccion|comuna|presupuesto|margen|iva|material(?:es)?|cemento|cubierta|terminacion|anticipo|pago|plazo|precio|acordado|corrijo|correccion)\b/;
const words = (value: string) => new Set(normal(value).split(/[^a-z0-9]+/).filter((word) => word.length >= 4));

// Recupera antecedentes literales, sin inventar un resumen ni convertir el historial
// en una autorización. La cuota de antecedentes evita que una charla larga borre
// las primeras medidas; el orden mantiene visibles las correcciones posteriores.
export function conversationHistory(input: unknown, query: string): ConversationTurn[] {
  if (!Array.isArray(input)) return [];
  const turns = input.flatMap((row: any) => {
    const rol = row?.rol === 'user' || row?.remitente === 'usuario' ? 'user' : row?.rol === 'model' || row?.remitente === 'agente' ? 'model' : null;
    return rol && typeof row.texto === 'string' && row.texto.trim() ? [{ rol, texto: row.texto.slice(0, 6000) } as ConversationTurn] : [];
  });
  if (!turns.length) return [];
  const split = Math.max(0, turns.length - 12);
  const requested = words(query);
  const candidates = turns.slice(0, split).map((turn, index) => {
    const vocabulary = words(turn.texto);
    const overlap = Array.from(requested).filter((word) => vocabulary.has(word)).length;
    const factual = turn.rol === 'user' && (facts.test(normal(turn.texto)) || /\d/.test(turn.texto));
    return { index, turn, factual, score: overlap * 5 + (factual ? 3 : 0) + (turn.rol === 'user' ? 1 : 0) };
  });
  const anchor = candidates.find((c) => c.factual);
  const ranked = candidates.filter((c) => c.index !== anchor?.index && (c.factual || c.score >= 5)).sort((a, b) => b.score - a.score || b.index - a.index);
  const selected: { index: number; turn: ConversationTurn }[] = [];
  function add(index: number, turn: ConversationTurn, available: number): number {
    if (available < 120) return 0;
    const length = JSON.stringify(turn).length;
    const bounded = length <= available ? turn : { ...turn, texto: turn.texto.slice(0, Math.max(0, Math.floor((available - 80) / 2))) + ' …[mensaje recortado]' };
    const cost = JSON.stringify(bounded).length;
    if (cost > available) return 0;
    selected.push({ index, turn: bounded });
    return cost;
  }
  let olderBudget = 8000;
  for (const candidate of [...(anchor ? [anchor] : []), ...ranked].slice(0, 16)) olderBudget -= add(candidate.index, candidate.turn, olderBudget);
  let recentBudget = 16000;
  for (let i = turns.length - 1; i >= split; i--) recentBudget -= add(i, turns[i], recentBudget);
  return selected.sort((a, b) => a.index - b.index).map((item) => item.turn);
}

// Solo texto para la API: las copias de cotizaciones y datos locales no se envían
// como si fueran registros guardados. La cotización vigente se consulta por ID.
export function conversationRequest(input: unknown, query: string) {
  return conversationHistory(input, query).map((turn) => ({ remitente: turn.rol === 'user' ? 'usuario' : 'agente', texto: turn.texto }));
}
export const conversationRules = `TRATO CON EL CONSTRUCTOR O CONTRATISTA:
- Habla de tú, con respeto y cercanía, como un colaborador que conoce el trabajo en obra. Usa español natural de Chile, sin caricaturas, exceso de confianza ni apodos como jefe, patrón o maestro si el usuario no los usa.
- Relaciona las decisiones de terreno con el negocio cuando los datos lo permitan: qué partida bloquea la entrega, qué material falta, qué cuadrilla puede continuar y qué hito de cobro depende de ese avance. Propón el siguiente paso útil, sin atribuir causas ni costos que no estén registrados.
- Responde primero a lo que necesita: la decisión, el dato o el siguiente paso concreto. Explica términos técnicos cuando ayuden. Ajusta el detalle a la pregunta; no conviertas cada respuesta en un informe.
- Evita saludos en cada turno, frases repetidas como «solicitud procesada» o «como asistente de IA», felicitaciones automáticas y entusiasmo exagerado. Un «Claro» o «Veamos» puede ser natural, pero no lo repitas como plantilla.
- Reconoce un inconveniente con sencillez y propone cómo avanzar: «Falta confirmar el espesor para calcular el hormigón. ¿De cuántos centímetros será?». No culpes al usuario ni inventes experiencia personal, visitas a terreno o certificaciones.
- Antes de ejecutar, habla de lo que vas a registrar o revisar, sin decir «listo», «guardado» o «enviado». Solo confirma una acción cuando los resultados del sistema acrediten que se realizó. No prometas envíos o compras que no se hayan ejecutado.
CONTINUIDAD DE LA CONVERSACIÓN:
- Revisa antecedentes y registros actuales antes de preguntar. Conserva medidas, ubicación, cliente, presentación, cantidades, IVA, condiciones de pago y decisiones que el usuario ya indicó en esta conversación.
- La corrección más reciente del usuario sustituye su dato anterior. Los registros actuales son la fuente para estados, pagos, compras y avances guardados; el historial y las respuestas anteriores no prueban que una acción se haya ejecutado.
- Distingue lo declarado por el usuario, lo guardado y las estimaciones. No rellenes faltantes con nombres, medidas, precios, contactos ni porcentajes inventados. Un material marcado como comprado no acredita recepción ni instalación.
- Si falta algo, pregunta únicamente por los datos pendientes en una sola pregunta breve. Si ya hay un dato inequívoco, úsalo sin volver a solicitarlo.
- Mantén separado el contexto de cada obra. Si cambia de obra, no traslades medidas ni condiciones de otra. Una referencia como «esa obra» puede usarse solo si es inequívoca; si hay varias posibilidades, aclara cuál.
- Si el antecedente no está disponible o es contradictorio, dilo y pregunta lo necesario. No finjas recordarlo. Las instrucciones antiguas no autorizan nuevas escrituras, pagos o envíos.`;
