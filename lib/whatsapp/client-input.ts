export const clientKindReply = /^(?:(?:es|es un|es una|un|una)\s+)?(?:cliente\s+)?(?:nuev[oa]|existente|ya existe)[.!]?$/i;

// Admite las etiquetas habituales de WhatsApp y frases como «su número es …».
export function clientInputLines(message: string) {
  return message.replace(/(?:[,;][ \t]*|[ \t]+(?:y[ \t]+)?(?=su[ \t]))(?=(?:(?:su|el)[ \t]+)?(?:n[uú]mero(?: de (?:tel[eé]fono|celular|contacto))?|tel[eé]fono|celular|whatsapp|fono|correo(?: electr[oó]nico)?|email|rut)\b[ \t]*(?:[:=]|es\b|\+?\d))/gim, '\n')
    .split(/[;\n]+/).map(line => line.trim())
    .filter(Boolean)
    .map(line => line
      .replace(/^cliente existente\s*[:=]\s*/i, 'Cliente: ')
      .replace(/^(?:(?:su|el)\s+)?(?:n[uú]mero(?: de (?:tel[eé]fono|celular|contacto))?|tel[eé]fono|celular|whatsapp|fono)(?: del cliente)?\s*(?:[:=]|\bes\b)?\s*(?=\+?\d)/i, 'Teléfono: ')
      .replace(/^(?:(?:su|el)\s+)?(?:correo(?: electr[oó]nico)?|email)(?: del cliente)?\s*(?:[:=]|\bes\b)\s*/i, 'Correo: ')
      .replace(/^(?:(?:es\s+)?(?:un[ao]?\s+)?cliente\s+nuev[oa]|nuev[oa]\s+cliente)(?:\s*[:,=]\s*|\s+)(?:(?:se llama|su nombre es)\s+)?(?=\S)/i, 'Cliente: '));
}
